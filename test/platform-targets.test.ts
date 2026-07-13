import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { generateNocoBasePlugin } from "../src/generator/nocobasePluginGenerator.js";
import { generateRefineProject } from "../src/generator/refineProjectGenerator.js";
import { buildProjectIR } from "../src/ir/projectIr.js";

const ADDRESS_EDITOR = `
partial class AddressEditor {
  private System.Windows.Forms.TextBox txtStreet;
  private void InitializeComponent() {
    this.txtStreet = new System.Windows.Forms.TextBox();
    this.txtStreet.Location = new System.Drawing.Point(4, 4);
    this.txtStreet.Size = new System.Drawing.Size(120, 24);
    this.txtStreet.TextChanged += new System.EventHandler(this.txtStreet_TextChanged);
    this.Controls.Add(this.txtStreet);
  }
}`;

const ORDER_FORM = `
partial class OrderForm {
  private AddressEditor shippingAddress;
  private AddressEditor billingAddress;
  private GitUI.LeftPanel.RepoObjectsTree repoObjectsTree;
  private System.Windows.Forms.Button btnSave;
  private void InitializeComponent() {
    this.shippingAddress = new AddressEditor();
    this.billingAddress = new AddressEditor();
    this.repoObjectsTree = new GitUI.LeftPanel.RepoObjectsTree();
    this.btnSave = new System.Windows.Forms.Button();
    this.shippingAddress.Location = new System.Drawing.Point(8, 8);
    this.shippingAddress.Size = new System.Drawing.Size(160, 80);
    this.billingAddress.Location = new System.Drawing.Point(180, 8);
    this.billingAddress.Size = new System.Drawing.Size(160, 80);
    this.repoObjectsTree.Location = new System.Drawing.Point(8, 92);
    this.repoObjectsTree.Size = new System.Drawing.Size(160, 36);
    this.btnSave.Text = "Save";
    this.btnSave.Image = Properties.Images.Save;
    this.btnSave.Click += new System.EventHandler(this.btnSave_Click);
    this.Icon = ((System.Drawing.Icon)(resources.GetObject("$this.Icon")));
    this.ClientSize = new System.Drawing.Size(360, 140);
    this.Controls.Add(this.shippingAddress);
    this.Controls.Add(this.billingAddress);
    this.Controls.Add(this.repoObjectsTree);
    this.Controls.Add(this.btnSave);
  }
}`;

describe("platform target spikes", () => {
  it("preserves a shared UserControl definition once and emits two target shapes", async () => {
    const root = await mkdtemp(join(tmpdir(), "wf2-targets-"));
    const refineOut = join(root, "refine");
    const nocobaseOut = join(root, "nocobase");
    try {
      await mkdir(join(root, "source"));
      await mkdir(join(root, "source", "Resources"));
      await writeFile(join(root, "source", "Resources", "Save.png"), Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64"));
      await writeFile(join(root, "source", "Resources", "FolderOpen.png"), Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64"));
      await writeFile(join(root, "source", "Resources", "CommitId.png"), Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64"));
      await writeFile(join(root, "source", "AddressEditor.cs"), "partial class AddressEditor : System.Windows.Forms.UserControl { void txtStreet_TextChanged(object s, System.EventArgs e) { NormalizeAddress(); } }", "utf8");
      await writeFile(join(root, "source", "FormODBase.cs"), "class FormODBase : System.Windows.Forms.Form { }", "utf8");
      await writeFile(join(root, "source", "AddressEditor.Designer.cs"), ADDRESS_EDITOR, "utf8");
      await writeFile(join(root, "source", "OrderForm.Designer.cs"), ORDER_FORM, "utf8");
      await writeFile(join(root, "source", "OrderForm.resx"), `<?xml version="1.0" encoding="utf-8"?>
<root><data name="$this.Icon" type="System.Drawing.Icon, System.Drawing" mimetype="application/x-microsoft.net.object.bytearray.base64"><value>AAABAA==</value></data></root>`, "utf8");
      await writeFile(join(root, "source", "OrderForm.cs"), "partial class OrderForm : FormODBase { void btnSave_Click(object s, System.EventArgs e) { SaveOrder(); } }", "utf8");

      const project = await buildProjectIR(join(root, "source"));
      expect(project.pages.map((page) => page.name)).toEqual(["OrderForm"]);
      expect(project.pages[0].baseTypes).toEqual(["FormODBase", "Form"]);
      expect(project.components).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: "AddressEditor", status: "resolved", instanceCount: 2 }),
      ]));
      expect(project.pages[0].controls.filter((control) => control.componentRef === "AddressEditor")).toHaveLength(2);
      expect(project.pages[0].controls.some((control) => control.name.includes("txtStreet"))).toBe(false);
      expect(project.pages[0].layout).toEqual(expect.objectContaining({ version: 1, strategy: "semantic-web" }));
      expect(project.assets).toEqual(expect.arrayContaining([
        expect.objectContaining({ key: "Save", targetFileName: "Save.png" }),
        expect.objectContaining({ key: "FolderOpen", targetFileName: "FolderOpen.png" }),
        expect.objectContaining({ key: "OrderFormIcon", targetFileName: "OrderFormIcon.ico", contentBase64: "AAABAA==" }),
      ]));
      expect(project.assets.some((asset) => asset.key === "CommitId")).toBe(false);
      expect(project.components.find((component) => component.id === "AddressEditor")?.layout?.strategy).toBe("semantic-web");

      await Promise.all([
        generateRefineProject({ outDir: refineOut, project }),
        generateNocoBasePlugin({ outDir: nocobaseOut, project }),
      ]);

      const refineRegistry = await readFile(join(refineOut, "src", "runtime", "componentRegistry.tsx"), "utf8");
      const refineRuntime = await readFile(join(refineOut, "src", "runtime", "MigrationSurface.tsx"), "utf8");
      const refineStyles = await readFile(join(refineOut, "src", "styles.css"), "utf8");
      const nocobasePlugin = await readFile(join(nocobaseOut, "src", "client-v2", "plugin.tsx"), "utf8");
      const refineIr = JSON.parse(await readFile(join(refineOut, "src", "generated", "project.ir.json"), "utf8"));
      const nocobaseIr = JSON.parse(await readFile(join(nocobaseOut, "src", "client-v2", "generated", "project.ir.json"), "utf8"));
      const targetManifest = JSON.parse(await readFile(join(refineOut, "src", "generated", "target-manifest.json"), "utf8"));
      expect(refineRegistry.match(/"AddressEditor":/g)).toHaveLength(1);
      expect(refineRuntime).toContain('{"native-window-titlebar" + (openDentalPreview ? " native-od-titlebar" : "")}');
      expect(refineRuntime).toContain('className="native-diff"');
      expect(refineRuntime).toContain("previewFilePaths");
      expect(refineRuntime).toContain("native-file-list");
      expect(refineRuntime).toContain('className="native-splitter"');
      expect(refineRuntime).toContain('window.addEventListener("pointermove", moveDrag)');
      expect(refineRuntime).toContain('window.removeEventListener("pointermove", moveDrag)');
      expect(refineRuntime).toContain('className="native-context-menu"');
      expect(refineRuntime).toContain("data-state-index");
      expect(refineRuntime).toContain('className={"native-tabs"');
      expect(refineRuntime).toContain("function NativeMenuBar");
      expect(refineRuntime).toContain("function RevisionGridPreview");
      expect(refineRuntime).toContain("function RepositoryTreePreview");
      expect(refineRuntime).toContain("function NativeToolStrip");
      expect(refineRuntime).toContain("item.appearance?.visible !== false");
      expect(refineRuntime).toContain("new ResizeObserver(update)");
      expect(refineRuntime).toContain("toolbarRowWidth < 1300");
      expect(refineRuntime).toContain('imageKey: "DashboardFolderGit"');
      expect(refineRuntime).toContain('const presentationClass = gitPreview ? "native-workspace-form"');
      expect(refineRuntime).toContain('formInherits(page, "FormODBase")');
      expect(refineRuntime).toContain('"native-fixed-form native-od-form"');
      expect(refineRuntime).toContain("width: sourceWidth + 10");
      expect(refineRuntime).toContain("height: sourceHeight + 31");
      expect(refineRuntime).toContain('className="native-tool-strip runtime-script-strip"');
      expect(refineRuntime).toContain('imageKey: "Develop"');
      expect(refineRuntime).toContain("Open in VS Code");
      expect(refineRuntime).toContain("function FileTreePreview");
      expect(refineRuntime).toContain("function RevisionDiffPreview");
      expect(refineRuntime).toContain('open === "__overflow"');
      expect(refineRuntime).toContain('className="repo-tree-search"');
      expect(refineRuntime).toContain('className="repo-tree-view-toolbar"');
      expect(refineRuntime).toContain('imageKey: "FolderOpen"');
      expect(refineRuntime).toContain("visibleNodes.length === 0");
      expect(refineRuntime).toContain("PreviewRuntimeContext");
      expect(refineRuntime).toContain('className="native-context-menu revision-context-menu"');
      expect(refineRuntime).toContain("setRevision(row)");
      expect(refineRuntime).toContain("function RevisionGraph");
      expect(refineRuntime).toContain('statusIcon: "RepoStateDirty"');
      expect(refineRuntime).toContain('label: "ICSharpCode.TextEditor"');
      expect(refineRuntime).toContain('label: "[Inactive]"');
      expect(refineRuntime).toContain('id: "origin-master"');
      expect(refineRuntime).toContain('new Set(["origin", "upstream", "tags"])');
      expect(refineRuntime).toContain('{ title: "Tags", imageKey: "Tag", rootId: "tags" }');
      expect(refineRuntime).toContain('d="M14 0 C14 8 26 6 26 13"');
      expect(refineRuntime).toContain("function renderDiffText");
      expect(refineRuntime).toContain("@@ -112,20 +112,20 @@");
      expect(refineRuntime).toContain("<AuthorPortrait author={row.author} email={row.email} compact />");
      expect(refineRuntime).toContain("<dt>Committer</dt>");
      expect(refineRuntime).toContain("<DiffPreview filePath={selected} revision={revision} />");
      expect(refineRuntime).toContain('aria-label="Filter changed files"');
      expect(refineRuntime).toContain("revisionFilter");
      expect(refineRuntime).toContain('title="Show reflog"');
      expect(refineRuntime).toContain('imageKey: "EditFilter"');
      expect(refineRuntime).toContain('imageKey: "ShowOnlyFirstParent"');
      expect(refineRuntime).toContain('"Commit message", "Committer", "Author", "Diff contains (SLOW)"');
      expect(refineRuntime).toContain('row.graph !== "side"');
      expect(refineRuntime).toContain('className="native-command-toast"');
      expect(refineRuntime).toContain("function ConsolePreview");
      expect(refineRuntime).toContain("node.runtimeTabs || []");
      expect(refineRuntime).toContain('aria-label="Repository console command"');
      expect(refineRuntime).toContain("function NativeWindowFrame");
      expect(refineRuntime).toContain('const gitPreview = /^FormBrowse$/i.test');
      expect(refineRuntime).toContain("page.minimizeBox !== false");
      expect(refineRuntime).toContain('className="native-app-icon native-generic-app-icon"');
      expect(refineRuntime).toContain("page.properties?.migrationIconAssetKey");
      expect(refineRuntime).toContain('<span className="native-app-icon"><img src={pageIcon}');
      expect(refineRuntime).toContain("width: sourceWidth + 2");
      expect(refineRuntime).toContain("height: sourceHeight + 33");
      expect(refineRuntime).toContain('gitPreview && page.layout?.root');
      expect(refineRuntime).toContain('className="native-fixed-client"');
      expect(refineRuntime).toContain("function AbsoluteTabControl");
      expect(refineRuntime).toContain('className="native-tab-page native-absolute-tab-page"');
      expect(refineRuntime).toContain("function SemanticDateInput");
      expect(refineRuntime).toContain("function SemanticTextInput");
      expect(refineRuntime).toContain("function SemanticComboInput");
      expect(refineRuntime).toContain("function SemanticWarningIndicator");
      expect(refineRuntime).toContain("control.properties?.IncludeUnassigned === true");
      expect(refineRuntime).toContain("function controlButtonGlyph");
      expect(refineRuntime).toContain('includes(control.kind)) return ""');
      expect(refineRuntime).not.toContain('placeholder="MM/DD/YYYY"');
      expect(refineRuntime).toContain("InputNumber, Radio, Select");
      expect(refineRuntime).toContain("function NativeListBox");
      expect(refineRuntime).toContain("function applyAppearanceStyle");
      expect(refineRuntime).toContain('String(alignment.horizontal || "")');
      expect(refineRuntime).toContain('readOnly={control.appearance?.readOnly === true}');
      expect(refineRuntime).toContain('className="native-text-area"');
      expect(refineRuntime).toContain('"migration-check migration-radio" +');
      expect(refineRuntime).toContain('imageKey: "GitLogo16"');
      expect(refineRuntime).toContain("const previewRepository");
      expect(refineRuntime).toContain('branch: "tmp/reword1"');
      expect(refineRuntime).toContain('React.useState(previewRevisions[3])');
      expect(refineRuntime).toContain('React.useState(.365)');
      expect(refineRuntime).toContain('/RightSplitContainer/i.test(node.controlName || "") ? .27');
      expect(refineRuntime).toContain('/^git\\s+status/i');
      expect(refineRuntime).toContain("function AuthorPortrait");
      expect(refineRuntime).toContain("function githubAvatarSource");
      expect(refineRuntime).toContain("avatars.githubusercontent.com/u/");
      expect(refineRuntime).toContain("onError={() => setAvatarFailed(true)}");
      expect(refineRuntime).toContain("email={revision.email}");
      expect(refineRuntime).toContain("function revisionRefClass");
      expect(refineRuntime).toContain("revision.fullHash || revision.hash");
      expect(refineRuntime).toContain("item.properties?.ToolTipText");
      expect(refineRuntime).toContain('event.key === "F5"');
      expect(refineRuntime).toContain("function RevisionGridPreview");
      expect(refineRuntime).toContain('data-revision-id={row.id}');
      expect(refineRuntime).toContain("function TabLayoutNode");
      expect(refineRuntime).toContain("keyboardTab(event, pageIndex)");
      expect(refineRuntime).toContain('aria-keyshortcuts={key ? "Alt+"');
      expect(refineRuntime).toContain('role="tree"');
      expect(refineRuntime).toContain('role="treeitem"');
      expect(refineRuntime).toContain("ancestorIds(item)");
      expect(refineRuntime).toContain("setLeftPanelVisible((value) => !value)");
      expect(refineRuntime).toContain("setSplitViewVertical((value) => !value)");
      expect(refineRuntime).toContain('className={"layout-single-pane"');
      expect(refineRuntime).toContain('className="native-diff-toolbar"');
      expect(refineRuntime).toContain('imageKey: "ShowWhitespace"');
      expect(refineRuntime).toContain('className="revision-diff-splitter"');
      expect(refineRuntime).toContain('aria-label="Commit file tree"');
      expect(refineRuntime).toContain('setMode("Blame")');
      expect(refineRuntime).toContain('className="blame-hash"');
      expect(refineRuntime).toContain("selectedRevisionIds");
      expect(refineRuntime).toContain("Select all visible revisions");
      expect(refineRuntime).toContain('") Compare " + selectedRevisions.length');
      expect(refineRuntime).toContain("function GpgInfoPreview");
      expect(refineRuntime).toContain('className="native-gpg-info"');
      expect(refineRuntime).toContain("childChecked(child)");
      expect(refineRuntime).toContain("runtimeReparents.length");
      expect(refineRuntime).toContain('"Save": new URL("../assets/Save.png"');
      expect(refineRuntime).toContain("page.layout?.sourceSize?.width");
      expect(refineStyles).toContain(".native-diff-line.added");
      expect(refineStyles).toContain(".native-revision-grid");
      expect(refineStyles).toContain(".native-tab-list button.active");
      expect(refineStyles).toContain(".native-file-tree-preview");
      expect(refineStyles).toContain(".native-tool-strip");
      expect(refineStyles).toContain(".native-filter-menu.revision-type-menu");
      expect(refineStyles).toContain(".filter-combo input");
      expect(refineStyles).toContain(".native-presentation .migration-page-header { display: none; }");
      expect(refineStyles).toContain(".native-fixed-form .migration-canvas");
      expect(refineStyles).toContain(".native-fixed-client");
      expect(refineStyles).toContain(".native-absolute-tabs");
      expect(refineStyles).toContain(".semantic-date-input");
      expect(refineStyles).toContain(".semantic-text-input.multiline");
      expect(refineStyles).toContain(".native-fixed-form .native-button-glyph");
      expect(refineStyles).toContain(".native-fixed-form :is(.ant-input,.ant-input-number,.ant-select-selector)");
      expect(refineStyles).toContain(".native-list-box-item.selected");
      expect(refineStyles).toContain(":is(.migration-label,.migration-check) { min-height: 0");
      expect(refineStyles).toContain(".native-fixed-form .native-absolute-tabs .native-tab-list { flex: 0 0 20px");
      expect(refineStyles).toContain(".native-fixed-form .kind-groupbox");
      expect(refineStyles).toContain('.native-od-form { font: 11px "Microsoft Sans Serif"');
      expect(refineStyles).toContain(".native-od-form .native-od-titlebar");
      expect(refineStyles).toContain("background: #415e9a");
      expect(refineStyles).toContain("background: #fcfdfe");
      expect(refineStyles).toContain(".runtime-script-strip");
      expect(refineStyles).toContain(".native-diff-caption { display: none; }");
      expect(refineStyles).toContain(".native-diff:hover .native-diff-toolbar");
      expect(refineStyles).toContain(".author-portrait.compact");
      expect(refineStyles).toContain(".author-portrait img");
      expect(refineStyles).toContain(".revision-subject em.ref-remote");
      expect(refineStyles).toContain(".graph-path-branch");
      expect(refineStyles).toContain(".native-diff-line.hunk code");
      expect(refineStyles).toContain(".syntax-keyword");
      expect(refineStyles).toContain("background: #0078d7");
      expect(refineStyles).toContain('.native-presentation { color: #202020; font: 11px "Segoe UI"');
      expect(refineStyles).toContain(".native-presentation ::-webkit-scrollbar { width: 16px; height: 16px; }");
      expect(refineStyles).toContain('.revision-diff-files:has(> button:focus) > button.selected');
      expect(refineStyles).toContain('.repo-tree-scroll:has([role="treeitem"]:focus)');
      expect(refineStyles).toContain("--tree-rail-width");
      expect(refineStyles).toContain('.group.expanded .repo-tree-expander::before');
      expect(refineStyles).toContain("background: #fff; border-bottom: 1px solid #d0d0d0");
      expect(refineStyles).toContain(".native-presentation :is(.native-menu-bar,.native-tool-strip");
      expect(refineStyles).toContain(".native-revision-diff");
      expect(refineStyles).toContain(".native-overflow-button");
      expect(refineStyles).toContain("width: max-content; min-width: 100%");
      expect(refineStyles).toContain(".revision-diff-splitter");
      expect(refineStyles).toContain(".file-view-mode");
      expect(refineStyles).toContain(".native-gpg-info");
      expect(refineStyles).toContain(".commit-selection-banner");
      expect((await readFile(join(refineOut, "src", "assets", "Save.png"))).byteLength).toBeGreaterThan(0);
      expect((await readFile(join(nocobaseOut, "src", "client-v2", "assets", "Save.png"))).byteLength).toBeGreaterThan(0);
      expect(await readFile(join(refineOut, "src", "assets", "OrderFormIcon.ico"))).toEqual(Buffer.from("AAABAA==", "base64"));
      expect(await readFile(join(nocobaseOut, "src", "client-v2", "assets", "OrderFormIcon.ico"))).toEqual(Buffer.from("AAABAA==", "base64"));
      expect(nocobasePlugin).toContain('this.router.add("wf2-migration"');
      expect(refineIr.components.find((item: { id: string }) => item.id === "AddressEditor").instanceCount).toBe(2);
      expect(refineIr.pages[0].layout).toEqual(nocobaseIr.pages[0].layout);
      expect(targetManifest.sharedComponents.find((item: { id: string }) => item.id === "AddressEditor").contractCount).toBe(1);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
