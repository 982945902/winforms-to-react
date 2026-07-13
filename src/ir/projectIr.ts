import { readdir, stat } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";
import type {
  ControlCoverageByKind,
  ComponentDefinition,
  MigrationReport,
  ProjectIR,
  VisualControl,
} from "./types.js";
import {
  collectUserControlDefinitions,
  collectBaseKindMap,
  convertDesignerSources,
  findDesignerFiles,
  inheritsFrom,
} from "../parser/scanner.js";
import { normalizeLayout } from "./layoutNormalizer.js";
import { parseResxBinaryResources } from "../parser/resxParser.js";

export async function buildProjectIR(inputPath: string): Promise<ProjectIR> {
  const sourceRoot = resolve(inputPath);
  const hierarchy = await collectBaseKindMap(sourceRoot);
  const definitions = await collectUserControlDefinitions(sourceRoot, hierarchy.baseKindMap);
  const [converted, designerFiles] = await Promise.all([
    convertDesignerSources(sourceRoot, {
      inlineUserControls: false,
      baseKindMap: hierarchy.baseKindMap,
      controlProps: hierarchy.controlProps,
      userControlDefs: definitions,
    }),
    findDesignerFiles(sourceRoot),
  ]);

  const sourceByType = new Map<string, string>();
  for (const file of designerFiles) {
    sourceByType.set(basename(file).replace(/\.Designer\.cs$/i, ""), file);
  }

  const pages = converted.forms.filter((form) =>
    inheritsFrom(form.name, "Form", hierarchy.baseKindMap) || !definitions.has(form.name),
  );
  for (const page of pages) {
    const baseTypes = collectBaseTypes(page.name, hierarchy.baseKindMap);
    page.baseType = baseTypes[0];
    page.baseTypes = baseTypes;
  }
  const usage = new Map<string, number>();
  for (const page of pages) {
    attachComponentRefs(page.controls, usage);
  }

  const definitionControls = new Map<string, VisualControl[]>();
  const parsedDefinitionByType = new Map(
    converted.forms
      .filter((form) => definitions.has(form.name))
      .map((form) => [form.name, form] as const),
  );
  for (const [typeName, controls] of definitions) {
    const parsedDefinition = parsedDefinitionByType.get(typeName);
    const cloned = cloneControls(parsedDefinition?.controls ?? controls);
    // Count references declared inside shared component definitions too. This
    // keeps nested component graphs closed without multiplying definitions per
    // host instance.
    attachComponentRefs(cloned, usage);
    definitionControls.set(typeName, cloned);
  }

  const componentIds = new Set<string>([...definitions.keys(), ...usage.keys()]);
  const components: ComponentDefinition[] = [...componentIds]
    .sort((a, b) => a.localeCompare(b))
    .map((typeName) => {
      const controls = definitionControls.get(typeName) ?? [];
      return {
        id: typeName,
        typeName,
        sourcePath: parsedDefinitionByType.get(typeName)?.sourcePath ?? sourceByType.get(typeName),
        status: definitions.has(typeName) ? "resolved" : "external",
        controls,
        instanceCount: usage.get(typeName) ?? 0,
        support: parsedDefinitionByType.get(typeName)?.support,
        bindings: parsedDefinitionByType.get(typeName)?.bindings,
      };
    });

  const resolvedComponents = new Set(components.filter((component) => component.status === "resolved").map((component) => component.id));
  for (const page of pages) {
    page.layout = normalizeLayout(page.controls, page.clientSize, resolvedComponents, page.runtimeLayoutHints);
  }
  for (const component of components) {
    component.layout = normalizeLayout(component.controls, inferSize(component.controls), resolvedComponents);
  }
  const [visualAssets, formAssets] = await Promise.all([
    collectVisualAssets(sourceRoot, [
      ...pages.flatMap((page) => page.controls),
      ...components.flatMap((component) => component.controls),
    ], adapterAssetKeys(components)),
    collectEmbeddedFormAssets(pages),
  ]);
  const assets = [...visualAssets, ...formAssets];

  return {
    schemaVersion: 1,
    sourceRoot,
    pages,
    components,
    assets,
    report: reportForPages(pages, converted.report),
  };
}

function collectBaseTypes(typeName: string, baseKindMap: Map<string, string>): string[] {
  const result: string[] = [];
  const seen = new Set<string>([typeName]);
  let current = typeName;
  while (true) {
    const baseType = baseKindMap.get(current);
    if (!baseType || seen.has(baseType)) break;
    result.push(baseType);
    seen.add(baseType);
    current = baseType;
  }
  return result;
}

async function collectEmbeddedFormAssets(pages: ProjectIR["pages"]): Promise<ProjectIR["assets"]> {
  const assets: ProjectIR["assets"] = [];
  await Promise.all(pages.map(async (page) => {
    const resourceName = String(page.icon || "").match(/GetObject\(\s*"([^"]+)"\s*\)/)?.[1];
    if (!resourceName) return;
    const resxPath = page.sourcePath.replace(/\.Designer\.cs$/i, ".resx");
    try {
      const resource = (await parseResxBinaryResources(resxPath)).get(resourceName);
      if (!resource) return;
      const key = `${page.name}Icon`;
      page.properties.migrationIconAssetKey = key;
      assets.push({ key, contentBase64: resource.contentBase64, targetFileName: `${key}.ico` });
    } catch {
      // Missing or malformed companion resx: keep the neutral window icon.
    }
  }));
  return assets.sort((a, b) => a.key.localeCompare(b.key));
}

const componentAdapterAssets: Record<string, string[]> = {
  RepoObjectsTree: [
    "FolderSubmodule", "FolderOpen", "FolderClosed", "BranchLocal", "BranchRemote", "Remote", "Remotes", "Tag",
    "LayoutSidebarLeft", "LayoutSidebarTopLeft", "LayoutSidebarTopRight", "RepoStateClean",
  ],
  RevisionGridControl: ["RepoStateDirty", "RepoStateStaged", "Checkout", "BranchCreate", "CherryPick", "Diff", "CommitId"],
  RevisionDiffControl: [
    "FileStatusModified", "FileStatusAdded", "File", "FolderOpen", "FolderClosed", "Blame", "FileHistory",
    "ShowEntireFile", "ShowWhitespace", "NumberOfLinesIncrease", "NumberOfLinesDecrease", "Settings",
  ],
  CommitInfo: ["Author", "Date", "CommitId", "Console", "GitCommandLog"],
  FilterToolBar: ["BranchLocal", "BranchFilter", "FunnelPencil", "FunnelExclamation", "Book", "EditFilter", "ShowOnlyFirstParent"],
  MenuStripEx: ["GitLogo16", "BranchLocal", "RepoStateDirty"],
  ToolStripEx: ["Develop", "DashboardFolderGit"],
  RevisionGpgInfoControl: ["Key", "CommitSignatureOk", "CommitSignatureWarning", "CopyToClipboard"],
};

function adapterAssetKeys(components: ComponentDefinition[]): Set<string> {
  return new Set(components.flatMap((component) => componentAdapterAssets[component.id] ?? []));
}

async function collectVisualAssets(
  sourceRoot: string,
  controls: VisualControl[],
  additionalKeys: Iterable<string> = [],
): Promise<ProjectIR["assets"]> {
  const keys = new Set<string>(additionalKeys);
  const visitControls = (items: VisualControl[]) => items.forEach((control) => {
    for (const value of [control.appearance.image, control.appearance.imageKey]) {
      const key = String(value ?? "").split(".").pop()?.replace(/[^A-Za-z0-9_-]/g, "");
      if (key) keys.add(key);
    }
    visitControls(control.children);
  });
  visitControls(controls);
  if (keys.size === 0) return [];

  const candidates = new Map<string, string>();
  const skip = new Set([".git", "node_modules", "bin", "obj", "dist", ".next"]);
  const walk = async (path: string): Promise<void> => {
    const info = await stat(path);
    if (info.isFile()) {
      const extension = extname(path).toLowerCase();
      if (![".png", ".svg", ".ico", ".jpg", ".jpeg", ".gif"].includes(extension)) return;
      const key = basename(path, extension).toLowerCase();
      if (!candidates.has(key)) candidates.set(key, path);
      return;
    }
    const entries = await readdir(path, { withFileTypes: true });
    await Promise.all(entries
      .filter((entry) => !entry.isDirectory() || !skip.has(entry.name))
      .map((entry) => walk(join(path, entry.name))));
  };
  await walk(sourceRoot);

  return [...keys].sort().flatMap((key) => {
    const sourcePath = candidates.get(key.toLowerCase());
    if (!sourcePath) return [];
    return [{ key, sourcePath, targetFileName: `${key}${extname(sourcePath).toLowerCase()}` }];
  });
}

function inferSize(controls: VisualControl[]): { width: number; height: number } | undefined {
  const bounded = controls.filter((control) => control.bounds);
  if (bounded.length === 0) return undefined;
  return {
    width: Math.max(...bounded.map((control) => (control.bounds?.x ?? 0) + (control.bounds?.width ?? 0))),
    height: Math.max(...bounded.map((control) => (control.bounds?.y ?? 0) + (control.bounds?.height ?? 0))),
  };
}

function reportForPages(pages: ProjectIR["pages"], original: MigrationReport): MigrationReport {
  const byKind = new Map<string, ControlCoverageByKind>();
  for (const page of pages) {
    for (const item of page.support.controlCoverage.byKind) {
      const current = byKind.get(item.kind);
      if (current) current.count += item.count;
      else byKind.set(item.kind, { ...item });
    }
  }
  const kinds = [...byKind.values()].sort((a, b) => a.kind.localeCompare(b.kind));
  const total = kinds.reduce((sum, item) => sum + item.count, 0);
  const supported = kinds.filter((item) => item.status === "supported").reduce((sum, item) => sum + item.count, 0);
  const degraded = kinds.filter((item) => item.status === "degraded").reduce((sum, item) => sum + item.count, 0);
  const unknown = total - supported - degraded;
  const percent = (value: number) => total === 0 ? 100 : Number(((value / total) * 100).toFixed(1));
  const namesFor = (status: ControlCoverageByKind["status"]) => kinds.filter((item) => item.status === status).map((item) => item.kind);
  return {
    ...original,
    sourceFiles: pages.map((page) => page.sourcePath),
    forms: pages.map((page) => ({
      name: page.name,
      title: page.text,
      sourcePath: page.sourcePath,
      support: page.support,
    })),
    formsConverted: pages.length,
    controlsConverted: total,
    supportedControls: namesFor("supported"),
    degradedControls: namesFor("degraded"),
    unknownControls: namesFor("unknown"),
    controlCoverage: {
      total, supported, degraded, unknown,
      supportedPercent: percent(supported),
      previewablePercent: percent(supported + degraded),
      unknownPercent: percent(unknown),
      byKind: kinds,
    },
    eventStubs: pages.flatMap((page) => page.support.eventStubs),
  };
}

function attachComponentRefs(
  controls: VisualControl[],
  usage: Map<string, number>,
): void {
  for (const control of controls) {
    if (control.kind === "UserControl" && control.properties.nonVisual !== true) {
      const originalKind = control.properties.originalKind;
      const ref = typeof originalKind === "string" && originalKind.length > 0
        ? originalKind
        : control.name;
      control.componentRef = ref;
      usage.set(ref, (usage.get(ref) ?? 0) + 1);
    }
    attachComponentRefs(control.children, usage);
  }
}

function cloneControls(controls: VisualControl[]): VisualControl[] {
  return controls.map((control) => ({
    ...control,
    appearance: { ...control.appearance },
    properties: { ...control.properties },
    events: control.events.map((event) => ({ ...event })),
    children: cloneControls(control.children),
  }));
}
