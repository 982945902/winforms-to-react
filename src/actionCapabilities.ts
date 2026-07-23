import type { ActionCapability, ContractPoint, MigrationHint } from "./ir/types.js";

const CAPABILITIES: ActionCapability[] = [
  "data", "filesystem", "external-service", "security", "navigation", "validation", "ui",
];

export type CapabilityEvidenceKind = "call" | "transitive-call" | "property-read" | "assignment" | "construction" | "await";

export type CapabilityEvidence = {
  capability: ActionCapability;
  kind: CapabilityEvidenceKind;
  symbol: string;
};

export type ActionEvidenceClassification = {
  capabilities: ActionCapability[];
  evidence: CapabilityEvidence[];
  hasCodeEvidence: boolean;
};

export function classifyActionEvidence(
  source: Pick<MigrationHint, "calledSymbols" | "transitiveCalledSymbols" | "propertyReads" | "assignedSymbols" | "constructedTypes" | "awaitedCalls">,
  controlNames: ReadonlySet<string> = new Set(),
): ActionEvidenceClassification {
  const evidence: CapabilityEvidence[] = [];
  const seen = new Set<string>();
  const classify = (symbols: string[] | undefined, kind: CapabilityEvidenceKind) => {
    for (const symbol of symbols ?? []) {
      for (const capability of capabilitiesForEvidence(symbol, kind, controlNames)) {
        const key = `${capability}|${kind}|${symbol}`;
        if (seen.has(key)) continue;
        seen.add(key);
        evidence.push({ capability, kind, symbol });
      }
    }
  };
  classify(source.calledSymbols, "call");
  classify(source.transitiveCalledSymbols, "transitive-call");
  classify(source.propertyReads, "property-read");
  classify(source.assignedSymbols, "assignment");
  classify(source.constructedTypes, "construction");
  classify(source.awaitedCalls, "await");
  const present = new Set(evidence.map((item) => item.capability));
  return {
    capabilities: CAPABILITIES.filter((capability) => present.has(capability)),
    evidence,
    hasCodeEvidence: [
      source.calledSymbols,
      source.transitiveCalledSymbols,
      source.propertyReads,
      source.assignedSymbols,
      source.constructedTypes,
      source.awaitedCalls,
    ].some((items) => (items?.length ?? 0) > 0),
  };
}

export function classifyCalledSymbol(symbol: string): ActionCapability[] {
  return capabilitiesForEvidence(symbol, "call", new Set());
}

export function isLocalLifecycleState(
  contract: Pick<ContractPoint, "event" | "calledSymbols" | "transitiveCalledSymbols" | "assignedSymbols" | "constructedTypes" | "awaitedCalls">,
  capabilities: ActionCapability[],
): boolean {
  if (!/^(?:FormClosed|FormClosing|Closed|Closing)$/i.test(contract.event) || capabilities.length > 0) return false;
  if ((contract.calledSymbols?.length ?? 0) > 0 || (contract.transitiveCalledSymbols?.length ?? 0) > 0) return false;
  if ((contract.constructedTypes?.length ?? 0) > 0 || (contract.awaitedCalls?.length ?? 0) > 0) return false;
  const assignments = contract.assignedSymbols ?? [];
  if (assignments.length === 0) return false;
  // A bare field reset such as `_instance = null` is local window lifecycle
  // state. Member writes (`session.User = ...`) and any unknown cleanup call
  // remain review/server candidates because they may persist business state.
  return assignments.every((symbol) => /^(?:this\.)?[_A-Za-z]\w*$/.test(symbol));
}

function capabilitiesForEvidence(symbol: string, kind: CapabilityEvidenceKind, controlNames: ReadonlySet<string>): ActionCapability[] {
  const result = new Set<ActionCapability>();
  const normalized = symbol.replace(/^this\./, "");
  const root = normalized.split(".")[0];
  const tail = normalized.split(".").pop() ?? normalized;
  const controlOwned = controlNames.has(root);
  const ui = controlOwned
    || /^(?:grid|combo|text|label|but|button|list|check|radio|tab|tree|menu|layout|lan\.|lans\.|messagebox\.|msgbox\.|textrenderer\.|control\.)/i.test(normalized)
    || /(?:\.Items\.|\.Focus$|\.BeginUpdate$|\.EndUpdate$|\.SetSelected|\.Invalidate$|\.ShowDropDown$|\.SwitchFocus$)/i.test(normalized)
    || /(?:Notifier\.Notify|Application\.DoEvents|Cursor\.Current|Clipboard\.|PrintDataGridView|PrintPreview|PrintDialog|DGVPrinter)/i.test(normalized);
  if (ui) result.add("ui");

  if (/(?:^|\.)(?:File|Directory|Path|FileInfo|DirectoryInfo|FileStream|StreamReader|StreamWriter|FolderBrowserDialog|OpenFileDialog|SaveFileDialog)(?:\.|$)|FileUtils|OsShellUtil|FileExplorer|GetWorkTreeFiles|UnlockIndex|WorkingDir/i.test(normalized)) {
    result.add("filesystem");
  }
  if (/WebService|Http|Rest|Api|Proxy|Socket|Smtp|Ftp|CloudClient|SignupOut|DiagnosticsClient|Telemetry|Analytics|ProcessRunner|CommandRunner|ShellExecute|GitCommand/i.test(normalized)) {
    result.add("external-service");
  }
  if (/^(?:UICommands|Module|GitModule)\./i.test(normalized)
    && !/^Start.*(?:Dialog|Form|Window)$/i.test(tail)
    && /(?:Pull|Push|Fetch|Clone|Checkout|Merge|Rebase|Reset|Stash|Commit|CherryPick|Patch|Submodule|Remote|Branch|Tag|Unlock|WorkTree|GitIgnore|Attributes|MailMap|Sparse|VerifyDatabase|Cleanup)/i.test(tail)) {
    result.add("external-service");
  }
  if (/Security|Authoriz|Authenticat|Password|Hash|Crypt|Encrypt|Decrypt|Permission/i.test(normalized)) {
    result.add("security");
  }
  const windowLifecycleCall = /^(?:Show|Hide|Close|ShowDialog|ShowForm|GoToModule|Navigate|OpenForm)$/i.test(normalized)
    || /^this\.(?:Show|Hide|Close)$/i.test(symbol)
    || controlOwned && /^(?:Show|Hide|Close)$/i.test(tail)
    || /^(?:form|frm|window|dialog|wizard|view|viewer|editor|manager|manage)[A-Za-z0-9_]*\.(?:Show|Hide|Close)$/i.test(normalized);
  if (windowLifecycleCall || /^Application\.Exit$|\.SwitchFocus$|\.ShowDropDown$/i.test(normalized)
    || /(?:Start|Show|Open|Manage|View|Create)[A-Za-z0-9_]*(?:Dialog|Form|Window)/i.test(tail)
    || /OpenWithFileExplorer/i.test(normalized)
    || kind === "construction" && /(?:Form|Dialog|Window)$/.test(tail)) {
    result.add("navigation");
  }
  if (/Valid|SetError|ErrorProvider|IsNullOrEmpty|IsNullOrWhiteSpace|Required/i.test(normalized)) {
    result.add("validation");
  }
  if (!ui && (
    /(?:Db|Database|Repository|Table|Query|Connection)\./i.test(normalized)
    || /^[A-Z][A-Za-z0-9_]*(?:s|C|Crud|Repository|Service)\.(?:Get|Insert|Update|Delete|Upsert|Save|Create|Select|Query|Fetch|Load|MakeLogEntry)/.test(normalized)
    || /\.(?:ExecuteNonQuery|ExecuteReader|ExecuteScalar)$/.test(normalized)
  )) {
    result.add("data");
  }
  if ((kind === "property-read" || kind === "assignment") && /(?:Settings|Preferences|Configuration|Config)(?:\.|$)/i.test(normalized)) {
    result.add("data");
  }
  if (kind === "construction") {
    if (/(?:Repository|DbContext|Database|DataContext|SqlConnection|SqlCommand|SqlDataAdapter|DbConnection|DbCommand|DbDataAdapter|OleDbConnection|OleDbCommand|OdbcConnection|OdbcCommand)$/.test(tail)) result.add("data");
    if (/(?:Client|Proxy|Service)$/.test(tail)) result.add("external-service");
    if (/(?:Printer|PrintDocument|PrintDialog|PrintPreviewDialog)$/.test(tail)) result.add("ui");
  }
  return CAPABILITIES.filter((capability) => result.has(capability));
}
