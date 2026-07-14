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
  private OpenDental.UI.Button btnSave;
  private OpenDental.UI.CheckBox checkActive;
  private OpenDental.UI.TabControl tabDetails;
  private OpenDental.UI.ODDatePicker dateDue;
  private OpenDental.UI.ComboBoxClinicPicker clinicPicker;
  private void InitializeComponent() {
    this.shippingAddress = new AddressEditor();
    this.billingAddress = new AddressEditor();
    this.repoObjectsTree = new GitUI.LeftPanel.RepoObjectsTree();
    this.btnSave = new OpenDental.UI.Button();
    this.checkActive = new OpenDental.UI.CheckBox();
    this.tabDetails = new OpenDental.UI.TabControl();
    this.dateDue = new OpenDental.UI.ODDatePicker();
    this.clinicPicker = new OpenDental.UI.ComboBoxClinicPicker();
    this.shippingAddress.Location = new System.Drawing.Point(8, 8);
    this.shippingAddress.Size = new System.Drawing.Size(160, 80);
    this.shippingAddress.Street = "Shipping lane";
    this.shippingAddress.Locked = true;
    this.billingAddress.Location = new System.Drawing.Point(180, 8);
    this.billingAddress.Size = new System.Drawing.Size(160, 80);
    this.billingAddress.Street = "Billing lane";
    this.repoObjectsTree.Location = new System.Drawing.Point(8, 92);
    this.repoObjectsTree.Size = new System.Drawing.Size(160, 36);
    this.btnSave.Text = "Save";
    this.btnSave.Image = Properties.Images.Save;
    this.btnSave.Click += new System.EventHandler(this.btnSave_Click);
    this.checkActive.Text = "Active";
    this.checkActive.Location = new System.Drawing.Point(240, 112);
    this.checkActive.Size = new System.Drawing.Size(80, 18);
    this.tabDetails.Location = new System.Drawing.Point(8, 132);
    this.tabDetails.Size = new System.Drawing.Size(344, 8);
    this.dateDue.Location = new System.Drawing.Point(8, 104);
    this.dateDue.Size = new System.Drawing.Size(227, 23);
    this.clinicPicker.Location = new System.Drawing.Point(8, 80);
    this.clinicPicker.Size = new System.Drawing.Size(200, 21);
    this.clinicPicker.IncludeUnassigned = true;
    this.Icon = ((System.Drawing.Icon)(resources.GetObject("$this.Icon")));
    this.ClientSize = new System.Drawing.Size(360, 140);
    this.Controls.Add(this.shippingAddress);
    this.Controls.Add(this.billingAddress);
    this.Controls.Add(this.repoObjectsTree);
    this.Controls.Add(this.btnSave);
    this.Controls.Add(this.checkActive);
    this.Controls.Add(this.tabDetails);
    this.Controls.Add(this.dateDue);
    this.Controls.Add(this.clinicPicker);
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
      await writeFile(join(root, "source", "AddressEditor.cs"), `partial class AddressEditor : System.Windows.Forms.UserControl {
        private bool locked;
        public string Street { set { txtStreet.Text = value; } }
        public bool Locked { set { locked = value; txtStreet.ReadOnly = locked; } }
        public bool ConditionalVisibility { set { if (value) { txtStreet.Visible = false; } } }
        void txtStreet_TextChanged(object s, System.EventArgs e) { NormalizeAddress(); }
      }`, "utf8");
      await writeFile(join(root, "source", "FormODBase.cs"), "class FormODBase : System.Windows.Forms.Form { }", "utf8");
      await writeFile(join(root, "source", "AddressEditor.Designer.cs"), ADDRESS_EDITOR, "utf8");
      await writeFile(join(root, "source", "AddressEditor.resx"), `<?xml version="1.0" encoding="utf-8"?>
<root><data name="txtStreet.Text" xml:space="preserve"><value>Street from context</value><comment>@Invariant</comment></data>
<data name="$this.Size" type="System.Drawing.Size, System.Drawing"><value>160, 80</value></data></root>`, "utf8");
      await writeFile(join(root, "source", "OrderForm.Designer.cs"), ORDER_FORM, "utf8");
      await writeFile(join(root, "source", "OrderForm.resx"), `<?xml version="1.0" encoding="utf-8"?>
<root><data name="$this.Icon" type="System.Drawing.Icon, System.Drawing" mimetype="application/x-microsoft.net.object.bytearray.base64"><value>AAABAA==</value></data></root>`, "utf8");
      await writeFile(join(root, "source", "OrderForm.cs"), `partial class OrderForm : FormODBase {
        void btnSave_Click(object s, System.EventArgs e) { SaveOrder(); }
        void ConfigureFields() {
          if (useCompact) { checkActive.Visible = false; }
          else { dateDue.Visible = false; }
        }
      }`, "utf8");

      const project = await buildProjectIR(join(root, "source"));
      const singleProject = await buildProjectIR(join(root, "source", "OrderForm.Designer.cs"), { contextRoot: join(root, "source") });
      expect(project.pages.map((page) => page.name)).toEqual(["OrderForm"]);
      expect(singleProject.pages.map((page) => page.name)).toEqual(["OrderForm"]);
      expect(singleProject.components).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: "AddressEditor", status: "resolved", instanceCount: 2 }),
      ]));
      expect(singleProject.components.find((component) => component.id === "AddressEditor")?.controls[0].text).toBe("Street from context");
      expect(singleProject.components.find((component) => component.id === "AddressEditor")?.clientSize).toEqual({ width: 160, height: 80 });
      expect(singleProject.components.find((component) => component.id === "AddressEditor")?.sourcePath)
        .toBe(join(root, "source", "AddressEditor.Designer.cs"));
      expect(singleProject.assets.map((asset) => asset.key)).toEqual(expect.arrayContaining(["Save", "FolderOpen", "OrderFormIcon"]));
      expect(project.pages[0].baseTypes).toEqual(["FormODBase", "Form"]);
      expect(project.components).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: "AddressEditor", status: "resolved", instanceCount: 2 }),
      ]));
      expect(project.components.find((component) => component.id === "AddressEditor")?.propertyBindings).toEqual([
        expect.objectContaining({ sourceProperty: "Locked", targetControlName: "txtStreet", targetProperty: "readOnly" }),
        expect.objectContaining({ sourceProperty: "Street", targetControlName: "txtStreet", targetProperty: "text" }),
      ]);
      expect(project.pages[0].controls.filter((control) => control.componentRef === "AddressEditor")).toHaveLength(2);
      expect(project.pages[0].controls.find((control) => control.name === "shippingAddress")?.properties)
        .toEqual(expect.objectContaining({ Street: "Shipping lane", Locked: true }));
      expect(project.pages[0].controls.find((control) => control.name === "billingAddress")?.properties)
        .toEqual(expect.objectContaining({ Street: "Billing lane" }));
      expect(project.pages[0].controls.find((control) => control.name === "btnSave")?.sourceType).toBe("OpenDental.UI.Button");
      expect(project.pages[0].controls.find((control) => control.name === "checkActive")?.sourceType).toBe("OpenDental.UI.CheckBox");
      expect(project.pages[0].controls.find((control) => control.name === "tabDetails")?.sourceType).toBe("OpenDental.UI.TabControl");
      expect(project.pages[0].controls.find((control) => control.name === "dateDue")?.sourceType).toBe("OpenDental.UI.ODDatePicker");
      expect(project.pages[0].controls.find((control) => control.name === "clinicPicker")?.sourceType).toBe("OpenDental.UI.ComboBoxClinicPicker");
      expect(project.components).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: "ODDatePicker", status: "external", instanceCount: 1 }),
        expect.objectContaining({ id: "ComboBoxClinicPicker", status: "external", instanceCount: 1 }),
      ]));
      expect(project.pages[0].controls.some((control) => control.name.includes("txtStreet"))).toBe(false);
      expect(project.pages[0].layout).toEqual(expect.objectContaining({ version: 1, strategy: "semantic-web" }));
      expect(project.pages[0].runtimeVisibilityGroups).toEqual([
        expect.objectContaining({
          condition: "useCompact",
          defaultVariant: 0,
          variants: [
            expect.objectContaining({ hiddenControls: ["checkActive"], shownControls: ["dateDue"] }),
            expect.objectContaining({ hiddenControls: ["dateDue"], shownControls: ["checkActive"] }),
          ],
        }),
      ]);
      expect(project.assets).toEqual(expect.arrayContaining([
        expect.objectContaining({ key: "Save", targetFileName: "Save.png" }),
        expect.objectContaining({ key: "FolderOpen", targetFileName: "FolderOpen.png" }),
        expect.objectContaining({ key: "OrderFormIcon", targetFileName: "OrderFormIcon.ico", contentBase64: "AAABAA==" }),
      ]));
      expect(project.assets.some((asset) => asset.key === "CommitId")).toBe(false);
      expect(project.components.find((component) => component.id === "AddressEditor")?.layout?.strategy).toBe("semantic-web");

      const staleRefineAsset = join(refineOut, "src", "assets", "stale.png");
      const staleNocobaseAsset = join(nocobaseOut, "src", "client-v2", "assets", "stale.png");
      await Promise.all([
        mkdir(join(refineOut, "src", "assets"), { recursive: true }),
        mkdir(join(nocobaseOut, "src", "client-v2", "assets"), { recursive: true }),
      ]);
      await Promise.all([writeFile(staleRefineAsset, "stale"), writeFile(staleNocobaseAsset, "stale")]);
      await Promise.all([
        generateRefineProject({ outDir: refineOut, project }),
        generateNocoBasePlugin({ outDir: nocobaseOut, project }),
      ]);
      await expect(readFile(staleRefineAsset)).rejects.toMatchObject({ code: "ENOENT" });
      await expect(readFile(staleNocobaseAsset)).rejects.toMatchObject({ code: "ENOENT" });

      const refineRegistry = await readFile(join(refineOut, "src", "runtime", "componentRegistry.tsx"), "utf8");
      const refineRuntime = await readFile(join(refineOut, "src", "runtime", "MigrationSurface.tsx"), "utf8");
      const refineProfiles = await readFile(join(refineOut, "src", "runtime", "visualProfiles.tsx"), "utf8");
      const refineStyles = await readFile(join(refineOut, "src", "styles.css"), "utf8");
      const nocobaseProfiles = await readFile(join(nocobaseOut, "src", "client-v2", "runtime", "visualProfiles.tsx"), "utf8");
      const nocobasePlugin = await readFile(join(nocobaseOut, "src", "client-v2", "plugin.tsx"), "utf8");
      const refineIr = JSON.parse(await readFile(join(refineOut, "src", "generated", "project.ir.json"), "utf8"));
      const nocobaseIr = JSON.parse(await readFile(join(nocobaseOut, "src", "client-v2", "generated", "project.ir.json"), "utf8"));
      const targetManifest = JSON.parse(await readFile(join(refineOut, "src", "generated", "target-manifest.json"), "utf8"));
      expect(refineRegistry.match(/"AddressEditor":/g)).toHaveLength(1);
      expect(refineRuntime).toContain("function applyComponentPropertyBindings");
      expect(refineRuntime).toContain("componentHostValue(host, binding.sourceProperty)");
      expect(refineRuntime).toContain('binding.targetProperty === "selectedIndex"');
      expect(refineRuntime).toContain("function applyWinFormsAutoSize");
      expect(refineRuntime).toContain('style.width = "max-content"');
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
      expect(refineRuntime).toContain("function LinkedControlMenu");
      expect(refineRuntime).toContain("RuntimeControlIndexContext.Provider");
      expect(refineRuntime).toContain("function RuntimeControlStateProvider");
      expect(refineRuntime).toContain("page.runtimeControlBindings || []");
      expect(refineRuntime).toContain("function applyRuntimeControlBindings");
      expect(refineRuntime).toContain('RuntimeControlScopeContext.Provider');
      expect(refineRuntime).toContain('runtimeControlState.setValue(control.name, "checked"');
      expect(refineRuntime).toContain('role="menu"');
      expect(refineRuntime).toContain("control.properties?.Menu");
      expect(refineRuntime).toContain("function RevisionGridPreview");
      expect(refineRuntime).toContain("function RepositoryTreePreview");
      expect(refineRuntime).toContain("function NativeToolStrip");
      expect(refineRuntime).toContain("item.appearance?.visible !== false");
      expect(refineRuntime).toContain("new ResizeObserver(update)");
      expect(refineRuntime).toContain("toolbarRowWidth < 1300");
      expect(refineRuntime).toContain('imageKey: "DashboardFolderGit"');
      expect(refineRuntime).toContain('const presentationClass = gitPreview ? "native-workspace-form"');
      expect(refineRuntime).toContain('pageUsesVisualProfile(page, "opendental")');
      expect(refineProfiles).toMatch(/"OrderForm",\s+"opendental"/);
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
      expect(refineRuntime).toContain('pageUsesVisualProfile(page, "gitextensions-workspace")');
      expect(refineProfiles).toMatch(/"RepoObjectsTree",\s+"git-repository-tree"/);
      expect(refineRuntime).toContain("page.minimizeBox !== false");
      expect(refineRuntime).toContain('className="native-app-icon native-generic-app-icon"');
      expect(refineRuntime).toContain("page.properties?.migrationIconAssetKey");
      expect(refineRuntime).toContain('<span className="native-app-icon"><img src={pageIcon}');
      expect(refineRuntime).toContain("width: sourceWidth + 2");
      expect(refineRuntime).toContain("height: sourceHeight + 33");
      expect(refineRuntime).toContain('gitPreview && page.layout?.root');
      expect(refineRuntime).toContain('className="native-fixed-client"');
      expect(refineRuntime).toContain("function pageClientStyle");
      expect(refineRuntime).toContain('style["--wf-control-surface"] = backColor');
      expect(refineRuntime).toContain("RuntimeCoordinateSpaceContext.Provider");
      expect(refineRuntime).toContain("function applyWinFormsEdges");
      expect(refineRuntime).toContain('anchors.has("Left") && anchors.has("Right")');
      expect(refineRuntime).toContain("function AbsoluteTabControl");
      expect(refineRuntime).toContain('className="native-tab-page native-absolute-tab-page"');
      expect(refineRuntime).toContain("function SemanticDateInput");
      expect(refineRuntime).toContain("<ControlTree controls={boundControls}");
      expect(refineRuntime).not.toContain("<LayoutNodeView node={definition.layout.root}");
      expect(refineRuntime).toContain("profileVisualComponent(control)");
      expect(refineProfiles).toContain("function OpenDentalDateInput");
      expect(refineProfiles).toContain('["OpenDental.UI.ODDatePicker", OpenDentalDateInput]');
      expect(refineRuntime).toContain("function SemanticTextInput");
      expect(refineRuntime).toContain("function SemanticComboInput");
      expect(refineRuntime).toContain("function SemanticWarningIndicator");
      expect(refineRuntime).toContain("control.properties?.IncludeUnassigned === true");
      expect(refineProfiles).toContain("function OpenDentalClinicPicker");
      expect(refineProfiles).toContain('const clinicLabel = control.properties?.IsMultiSelect === true ? "Clinics" : "Clinic"');
      expect(refineRuntime).toContain("function controlButtonGlyph");
      expect(refineRuntime).toContain('includes(control.kind)) return ""');
      expect(refineRuntime).not.toContain('placeholder="MM/DD/YYYY"');
      expect(refineRuntime).toContain("InputNumber, Radio, Select");
      expect(refineRuntime).toContain("function NativeListBox");
      expect(refineRuntime).toContain("function NativePropertyGrid");
      expect(refineRuntime).toContain('className="migration-link-label"');
      expect(refineRuntime).toContain('control.properties?.ToolbarVisible !== false');
      expect(refineRuntime).toContain("control.propertyGridSource?.fields");
      expect(refineRuntime).toContain('className={"native-property-grid-row"');
      expect(refineRuntime).toContain("field.defaultValue !== undefined");
      expect(refineRuntime).toContain('className="native-property-grid-body"');
      expect(refineRuntime).toContain("RuntimeTabNavigatorContext.Provider");
      expect(refineRuntime).toContain("page.runtimeTabNavigators || []");
      expect(refineRuntime).toContain("function TabTreeNavigator");
      expect(refineRuntime).toContain("function NativeTreeView");
      expect(refineRuntime).toContain('pageUsesVisualProfile(runtimePage, "gitextensions-workspace")');
      expect(refineRuntime).toContain("zIndex={normalized ? undefined : controls.length - index}");
      expect(refineRuntime).toContain('style.position === "absolute") style.zIndex = zIndex');
      expect(refineRuntime).toContain("RuntimeVisibilityContext.Provider");
      expect(refineRuntime).toContain("page.runtimeVisibilityGroups || []");
      expect(refineRuntime).toContain("runtimeHiddenControls.has(sourceControl)");
      expect(refineRuntime).toContain("sourceControl.properties?.nonVisual === true");
      expect(refineProfiles).toContain("function OpenDentalCheckBox");
      expect(refineRuntime).toContain('controlUsesVisualProfile(control, "opendental", "CheckBox")');
      expect(refineRuntime).toContain('controlUsesVisualProfile(control, "opendental", "TabControl")');
      expect(refineRuntime).toContain('controlUsesVisualProfile(control, "opendental", "Button")');
      expect(refineRuntime).toContain('controlUsesVisualProfile(control, "opendental", "ComboBox")');
      expect(refineRuntime).toContain('controlUsesVisualProfile(control, "opendental", "GroupBox")');
      expect(refineRuntime).toContain('controlUsesVisualProfile(control, "opendental", "ListBox")');
      expect(refineRuntime).not.toContain("function isOpenDentalControl");
      expect(refineRuntime).not.toContain("function OpenDentalCheckBox");
      expect(refineProfiles).toBe(nocobaseProfiles);
      expect(refineRuntime).toContain("function applyAppearanceStyle");
      expect(refineRuntime).toContain('String(alignment.horizontal || "")');
      expect(refineRuntime).toContain('appearance.borderStyle === "FixedSingle"');
      expect(refineRuntime).toContain("style.padding = Number(padding.top || 0)");
      expect(refineRuntime).toContain("style.minWidth = Number(appearance.minimumSize.width)");
      expect(refineRuntime).toContain('readOnly={control.appearance?.readOnly === true}');
      expect(refineRuntime).toContain('placeholder={control.appearance?.placeholderText}');
      expect(refineRuntime).toContain('className="native-text-area"');
      expect(refineRuntime).toContain("textAreaStyle(style, control.appearance?.scrollBars)");
      expect(refineRuntime).toContain('className="native-number-input"');
      expect(refineRuntime).toContain('showSearch={editable} optionFilterProp="label"');
      expect(refineRuntime).toContain('control.appearance?.dropDownStyle !== "DropDownList"');
      expect(refineRuntime).toContain('" native-multiline-tabs"');
      expect(refineRuntime).toContain("function buttonImageAlignmentClass");
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
      expect(refineStyles).toContain(".native-linked-menu");
      expect(refineStyles).toContain(".native-filter-menu.revision-type-menu");
      expect(refineStyles).toContain(".filter-combo input");
      expect(refineStyles).toContain(".native-presentation .migration-page-header { display: none; }");
      expect(refineStyles).toContain(".native-fixed-form .migration-canvas");
      expect(refineStyles).toContain(".native-fixed-client");
      expect(refineStyles).toContain(".native-absolute-tabs");
      expect(refineStyles).toContain(".semantic-date-input");
      expect(refineStyles).toContain(".semantic-text-input.multiline");
      expect(refineStyles).toContain(".semantic-warning-indicator::before");
      expect(refineStyles).toContain("clip-path: polygon(50% 0,100% 100%,0 100%)");
      expect(refineStyles).toContain("background: #ffc080");
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
      expect(refineStyles).toContain(".native-od-form .native-od-button.ant-btn");
      expect(refineStyles).toContain("border: 1px solid #1c5180");
      expect(refineStyles).toContain("border-color: #006ebe");
      expect(refineStyles).toContain("linear-gradient(#fff,#afb9be)");
      expect(refineStyles).toContain(".native-od-form .native-od-groupbox");
      expect(refineStyles).toContain("#c0c0c0");
      expect(refineStyles).toContain(".native-od-form .native-od-list-box");
      expect(refineStyles).toContain("#708090");
      expect(refineStyles).toContain("#bac7db");
      expect(refineStyles).toContain("#e5effb");
      expect(refineStyles).toContain(".native-od-form .native-od-combo.ant-select");
      expect(refineStyles).toContain("#adadad");
      expect(refineStyles).toContain(".native-od-form .native-od-tabs");
      expect(refineStyles).toContain("background: #aabee6");
      expect(refineStyles).toContain(".native-od-checkbox .native-od-check-box");
      expect(refineStyles).toContain("background: #d2efff");
      expect(refineStyles).toContain(".native-od-form .semantic-od-date-input input");
      expect(refineStyles).toContain("left: 63px; width: 102px; height: 20px");
      expect(refineStyles).toContain("left: 148px; width: 16px; height: 18px");
      expect(refineStyles).toContain(".native-od-form .semantic-od-clinic-label");
      expect(refineStyles).toContain("flex: 0 0 37px; width: 37px");
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
