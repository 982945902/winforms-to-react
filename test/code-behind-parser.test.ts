import { describe, expect, it } from "vitest";
import { parseCodeBehind } from "../src/parser/codeBehindParser.js";

const CODE_BEHIND = `using System;
using System.Windows.Forms;

namespace App {
  public partial class OrderForm : Form {
    public OrderForm() { InitializeComponent(); }

    private void btnSave_Click(object sender, EventArgs e) {
      if (ValidateInput()) {
        SaveOrder();
        MessageBox.Show("Saved");
      }
    }

    private void btnDetail_Click(object sender, EventArgs e) {
      var f = new DetailForm();
      f.ShowDialog();
    }

    private void grid_CellClick(object sender, DataGridViewCellEventArgs e) {
      RefreshGrid();
    }
  }
}
`;

describe("parseCodeBehind", () => {
  it("extracts handlers with C# 8+ nullable sender/args signatures", () => {
    const src = `using System; using System.Windows.Forms;
public partial class N : Form {
    private void btn_Click(object? sender, EventArgs e) { SaveOrder(); }
    private void grid_Cell(object sender, DataGridViewCellEventArgs? e) { Refresh(); }
}`;
    const info = parseCodeBehind(src, "/proj/N.cs");
    const names = info.handlers.map((h) => h.handler).sort();
    // Both nullable-annotated signatures must be extracted (not "handler not found").
    expect(names).toEqual(["btn_Click", "grid_Cell"]);
    const btn = info.handlers.find((h) => h.handler === "btn_Click");
    expect(btn?.calledSymbols).toContain("SaveOrder");
  });

  it("captures generic method calls in calledSymbols", () => {
    const src = `using System; using System.Windows.Forms;
public partial class C : Form {
    private void btn_Click(object sender, EventArgs e) {
        var svc = GetService<IOrderService>();
        Repository.Query<Customer>().Run();
        Plain();
    }
}`;
    const info = parseCodeBehind(src, "/proj/C.cs");
    const btn = info.handlers.find((h) => h.handler === "btn_Click");
    // Generic calls (Foo<T>()) must be captured, not dropped at the `<`.
    expect(btn?.calledSymbols).toContain("GetService");
    expect(btn?.calledSymbols).toContain("Repository.Query");
    expect(btn?.calledSymbols).toContain("Plain");
  });

  it("extracts event handlers with line ranges and called symbols", () => {
    const info = parseCodeBehind(CODE_BEHIND, "/proj/OrderForm.cs");
    const byName = Object.fromEntries(info.handlers.map((h) => [h.handler, h]));

    expect(Object.keys(byName).sort()).toEqual(["btnDetail_Click", "btnSave_Click", "grid_CellClick"]);

    const save = byName["btnSave_Click"];
    expect(save.sourceFile).toBe("OrderForm.cs");
    expect(save.lineStart).toBeLessThan(save.lineEnd);
    expect(save.calledSymbols).toContain("SaveOrder");
    expect(save.calledSymbols).toContain("MessageBox.Show");
    expect(save.calledSymbols).toContain("ValidateInput");

    const grid = byName["grid_CellClick"];
    expect(grid.calledSymbols).toEqual(["RefreshGrid"]);
  });

  it("resolves navigation targets through local variables and marks modality", () => {
    const info = parseCodeBehind(CODE_BEHIND, "/proj/OrderForm.cs");
    expect(info.navigations).toEqual([
      { target: "DetailForm", modal: true, fromHandler: "btnDetail_Click" }
    ]);
  });

  it("does not treat MessageBox.Show as navigation", () => {
    const info = parseCodeBehind(CODE_BEHIND, "/proj/OrderForm.cs");
    expect(info.navigations.some((n) => n.target === "MessageBox")).toBe(false);
  });

  it("does not treat MessageBox-like helper classes as navigation", () => {
    const src = `public partial class F : Form {
      private void btn_Click(object sender, EventArgs e) {
        MessageBoxes.Show("hi");
        CustomMessageBox.ShowDialog("warn");
        var dlg = new RealForm();
        dlg.ShowDialog();
      }
    }`;
    const info = parseCodeBehind(src, "/proj/F.cs");
    // MessageBoxes / CustomMessageBox are dialog helpers, not navigable forms.
    expect(info.navigations.map((n) => n.target)).toEqual(["RealForm"]);
  });

  it("extracts data bindings from DataSource, BindingSource and DataBindings.Add", () => {
    const src = `public partial class F : Form {
      private void Init() {
        this.grid.DataSource = this.orderBindingSource;
        this.orderBindingSource = new BindingSource();
        this.txtName.DataBindings.Add("Text", this.model);
      }
    }`;
    const info = parseCodeBehind(src, "/proj/F.cs");
    expect(info.bindings).toContainEqual({ controlName: "grid", dataSource: "orderBindingSource", kind: "DataSource" });
    expect(info.bindings).toContainEqual({ controlName: "orderBindingSource", dataSource: "orderBindingSource", kind: "BindingSource" });
    expect(info.bindings).toContainEqual({ controlName: "txtName", dataSource: "model", boundProperty: "Text", kind: "DataBinding" });
  });

  it("extracts bindings from the new Binding(...) overload and typeof data sources", () => {
    const src = `public partial class F : Form {
      private void Init() {
        this.chk.DataBindings.Add(new Binding("Checked", src, "IsActive"));
        this.bs.DataSource = typeof(Customer);
      }
    }`;
    const info = parseCodeBehind(src, "/proj/F.cs");
    expect(info.bindings).toContainEqual({ controlName: "chk", dataSource: "src.IsActive", boundProperty: "Checked", kind: "DataBinding" });
    // typeof(Customer) records the type, not the literal "typeof".
    expect(info.bindings).toContainEqual({ controlName: "bs", dataSource: "Customer", kind: "DataSource" });
  });

  it("ignores braces inside comments and strings when matching method bodies", () => {
    const src = `public partial class F : Form {
      private void onClick(object sender, EventArgs e) {
        // a stray } brace in a comment
        var s = "another } in a string";
        DoWork();
      }
    }`;
    const info = parseCodeBehind(src, "/proj/F.cs");
    expect(info.handlers).toHaveLength(1);
    expect(info.handlers[0].calledSymbols).toContain("DoWork");
  });

  it("records controls reparented into SplitContainer panels at runtime", () => {
    const src = `partial class BrowseForm {
      private void LayoutRevisionInfo() {
        RevisionInfo.Parent = RevisionsSplitContainer.Panel2;
        this.RevisionGridContainer.Parent = this.RevisionsSplitContainer.Panel1;
      }
    }`;
    const info = parseCodeBehind(src, "/proj/BrowseForm.cs");
    expect(info.layoutHints).toEqual([
      expect.objectContaining({ kind: "reparent", controlName: "RevisionInfo", parentControlName: "RevisionsSplitContainer", panel: 2 }),
      expect.objectContaining({ kind: "reparent", controlName: "RevisionGridContainer", parentControlName: "RevisionsSplitContainer", panel: 1 }),
    ]);
  });

  it("records runtime Image and ImageKey assignments", () => {
    const info = parseCodeBehind(`partial class F {
      void Init() {
        DiffTabPage.ImageKey = nameof(Images.Diff);
        this.RefreshButton.Image = Properties.Images.ReloadRevisions;
      }
    }`, "/proj/F.Init.cs");
    expect(info.appearanceHints).toEqual([
      { controlName: "DiffTabPage", property: "imageKey", value: "Diff" },
      { controlName: "RefreshButton", property: "image", value: "ReloadRevisions" },
    ]);
  });

  it("records the first Resources-backed ImageList item as a navigation fallback", () => {
    const info = parseCodeBehind(`partial class F {
      void Init() {
        navigationImages.Images.Add(Resources.NavigationRoot);
        navigationImages.Images.Add(Resources.Cloud);
        treeNavigator.ImageList = navigationImages;
      }
    }`, "/proj/F.cs");
    expect(info.appearanceHints).toEqual([
      { controlName: "treeNavigator", property: "imageKey", value: "NavigationRoot" },
    ]);
  });

  it("does not mistake runtime image variables for concrete asset keys", () => {
    const info = parseCodeBehind(`partial class F {
      void UpdateIcons() {
        commitButton.Image = image;
        pullButton.Image = selectedMenuItem.Image;
        shellButton.Image = shell.Icon;
        concreteButton.Image = Properties.Images.RepoStateClean;
      }
    }`, "/proj/F.Icons.cs");
    expect(info.appearanceHints).toEqual([
      { controlName: "concreteButton", property: "image", value: "RepoStateClean" },
    ]);
  });

  it("records tab pages created and added at runtime", () => {
    const info = parseCodeBehind(`partial class F {
      void FillTerminalTab() {
        _consoleTabPage = new TabPage { Text = _consoleCaption.Text };
        CommitInfoTabControl.Controls.Add(_consoleTabPage);
        _consoleTabPage.ImageKey = nameof(Images.Console);
      }
    }`, "/proj/F.Terminal.cs");
    expect(info.layoutHints).toEqual([
      expect.objectContaining({
        kind: "add-tab",
        controlName: "_consoleTabPage",
        parentControlName: "CommitInfoTabControl",
        label: "Console",
        imageKey: "Console",
        viewKind: "terminal",
      }),
    ]);
  });

  it("records custom navigators bound to an existing TabControl", () => {
    const info = parseCodeBehind(`partial class SettingsForm {
      void InitializeNavigation() {
        this.settingsTree.MainTabControl = this.settingsTabs;
      }
    }`, "/proj/SettingsForm.cs");
    expect(info.tabNavigators).toEqual([{
      navigatorControlName: "settingsTree",
      property: "MainTabControl",
      tabControlName: "settingsTabs",
      sourceFile: "SettingsForm.cs",
      line: 3,
    }]);
  });

  it("records mutually exclusive visibility branches without treating overlays as states", () => {
    const info = parseCodeBehind(`partial class F {
      void LoadFields() {
        if (_useModernFields) {
          legacyRace.Visible = false;
          legacyEthnicity.Visible = false;
          modernEditor.Visible = true;
        }
        else {
          modernRace.Visible = false;
          modernEthnicity.Visible = false;
          modernEditor.Visible = false;
        }
        zipSuggestions.SelectedIndex = -1;
      }
    }`, "/proj/F.cs");
    expect(info.visibilityGroups).toEqual([{
      condition: "_useModernFields",
      defaultVariant: 0,
      variants: [
        {
          label: "_useModernFields",
          hiddenControls: ["legacyRace", "legacyEthnicity"],
          shownControls: ["modernEditor", "modernRace", "modernEthnicity"],
        },
        {
          label: "not (_useModernFields)",
          hiddenControls: ["modernRace", "modernEthnicity", "modernEditor"],
          shownControls: ["legacyRace", "legacyEthnicity"],
        },
      ],
      sourceFile: "F.cs",
      line: 3,
    }]);
  });

  it("records only direct source-proven control state dependencies", () => {
    const info = parseCodeBehind(`partial class SettingsForm {
      void includeDetails_CheckedChanged(object sender, EventArgs e) {
        details.Enabled = includeDetails.Checked;
        notes.ReadOnly = !includeDetails.Checked;
        secret.Visible = account.Enabled;
        computed.Enabled = CanEnableDetails();
      }
    }`, "/proj/SettingsForm.cs");

    expect(info.controlBindings).toEqual([
      expect.objectContaining({
        handler: "includeDetails_CheckedChanged",
        sourceControlName: "includeDetails",
        sourceProperty: "checked",
        targetControlName: "details",
        targetProperty: "enabled",
      }),
      expect.objectContaining({
        handler: "includeDetails_CheckedChanged",
        sourceControlName: "includeDetails",
        targetControlName: "notes",
        targetProperty: "readOnly",
        negated: true,
      }),
      expect.objectContaining({
        sourceControlName: "account",
        sourceProperty: "enabled",
        targetControlName: "secret",
        targetProperty: "visible",
      }),
    ]);
    expect(info.controlBindings.some((binding) => binding.targetControlName === "computed")).toBe(false);
  });

  it("records enum and typed-list item sources populated in code-behind", () => {
    const info = parseCodeBehind(`using System.Collections.Generic;
partial class PatientForm {
  private List<PatientStatus> _patientStatuses = new();
  private IReadOnlyList<App.Domain.PatientPosition>? _positions;
  void FillLists() {
    listGender.Items.AddEnums<App.Domain.PatientGender>();
    this.listStatus.Items.AddList(this._patientStatuses, value => value.GetDescription());
    listPosition.Items.AddList(_positions, value => value.ToString());
    listRelationships.Items.AddList(Patients.GetRelationships(Family, _guardians), value => value);
  }
}`, "/proj/PatientForm.cs");

    expect(info.itemHints).toEqual([
      {
        controlName: "listGender",
        source: {
          kind: "enum",
          typeName: "PatientGender",
          expression: "Items.AddEnums<App.Domain.PatientGender>()",
          sourceFile: "PatientForm.cs",
          line: 6,
        },
      },
      {
        controlName: "listStatus",
        source: {
          kind: "list",
          typeName: "PatientStatus",
          expression: "Items.AddList(this._patientStatuses)",
          sourceFile: "PatientForm.cs",
          line: 7,
        },
      },
      {
        controlName: "listPosition",
        source: {
          kind: "list",
          typeName: "PatientPosition",
          expression: "Items.AddList(_positions)",
          sourceFile: "PatientForm.cs",
          line: 8,
        },
      },
      {
        controlName: "listRelationships",
        source: {
          kind: "list",
          expression: "Items.AddList(Patients.GetRelationships(Family, _guardians))",
          sourceFile: "PatientForm.cs",
          line: 9,
        },
      },
    ]);
  });

  it("records enum AddRange helper and Enum.GetNames item sources", () => {
    const info = parseCodeBehind(`partial class UploadSettings {
  void FillLists() {
    cbProtocol.Items.AddRange(Helpers.GetEnumDescriptions<BrowserProtocol>());
    this.cbThumbnail.Items.AddRange(App.Helpers.GetLocalizedEnumDescriptions<App.Domain.ThumbnailType>().ToArray());
    cbEncryption.Items.AddRange(Enum.GetNames(typeof(App.Domain.EncryptionMode)));
    cbSystemEnum.Items.AddRange(System.Enum.GetNames(typeof(StorageClass)).ToArray());
    cbUploadUrl.Items.AddRange(Lambda.UploadURLs);
    cbAccounts.Items.AddRange(Config.Accounts.ToArray());
  }
}`, "/proj/UploadSettings.cs");

    expect(info.itemHints).toEqual([
      {
        controlName: "cbProtocol",
        source: {
          kind: "enum",
          typeName: "BrowserProtocol",
          expression: "Items.AddRange(GetEnumDescriptions<BrowserProtocol>())",
          sourceFile: "UploadSettings.cs",
          line: 3,
        },
      },
      {
        controlName: "cbThumbnail",
        source: {
          kind: "enum",
          typeName: "ThumbnailType",
          expression: "Items.AddRange(GetLocalizedEnumDescriptions<App.Domain.ThumbnailType>())",
          sourceFile: "UploadSettings.cs",
          line: 4,
        },
      },
      {
        controlName: "cbEncryption",
        source: {
          kind: "enum",
          typeName: "EncryptionMode",
          expression: "Items.AddRange(Enum.GetNames(typeof(App.Domain.EncryptionMode)))",
          sourceFile: "UploadSettings.cs",
          line: 5,
        },
      },
      {
        controlName: "cbSystemEnum",
        source: {
          kind: "enum",
          typeName: "StorageClass",
          expression: "Items.AddRange(Enum.GetNames(typeof(StorageClass)))",
          sourceFile: "UploadSettings.cs",
          line: 6,
        },
      },
      {
        controlName: "cbUploadUrl",
        source: {
          kind: "list",
          expression: "Items.AddRange(Lambda.UploadURLs)",
          sourceFile: "UploadSettings.cs",
          line: 7,
        },
      },
      {
        controlName: "cbAccounts",
        source: {
          kind: "list",
          expression: "Items.AddRange(Config.Accounts.ToArray())",
          sourceFile: "UploadSettings.cs",
          line: 8,
        },
      },
    ]);
  });

  it("records initialization value sources with their method and model flow", () => {
    const info = parseCodeBehind(`partial class SettingsForm {
  public PreviewConfig Config { get; private set; }
  SettingsForm(PreviewConfig config) {
    Config = config;
    InitializeView();
  }
  private void InitializeView() {
    txtEndpoint.Text = Config.Endpoint;
    cbEnabled.Checked = !Config.Disabled;
    cbMode.SelectedIndex = (int)Config.Mode;
    cbLiteral.SelectedIndex = 1;
  }
  private void cbEnabled_Click(object sender, EventArgs e) {
    cbEnabled.Checked = false;
  }
}`, "/proj/SettingsForm.cs");

    expect(info.methods.map((method) => method.name)).toEqual([
      "SettingsForm", "InitializeView", "cbEnabled_Click",
    ]);
    expect(info.valueHints).toEqual([
      {
        controlName: "txtEndpoint",
        source: expect.objectContaining({
          property: "text",
          expression: "Config.Endpoint",
          methodName: "InitializeView",
          modelType: "PreviewConfig",
          memberPath: ["Endpoint"],
          line: 8,
        }),
      },
      {
        controlName: "cbEnabled",
        source: expect.objectContaining({
          property: "checked",
          expression: "!Config.Disabled",
          methodName: "InitializeView",
          modelType: "PreviewConfig",
          memberPath: ["Disabled"],
          negated: true,
          line: 9,
        }),
      },
      {
        controlName: "cbMode",
        source: expect.objectContaining({
          property: "selectedIndex",
          expression: "(int)Config.Mode",
          methodName: "InitializeView",
          modelType: "PreviewConfig",
          memberPath: ["Mode"],
          line: 10,
        }),
      },
      {
        controlName: "cbLiteral",
        source: expect.objectContaining({
          property: "selectedIndex",
          expression: "1",
          methodName: "InitializeView",
          literalValue: 1,
          line: 11,
        }),
      },
      {
        controlName: "cbEnabled",
        source: expect.objectContaining({
          property: "checked",
          expression: "false",
          methodName: "cbEnabled_Click",
          literalValue: false,
          line: 14,
        }),
      },
    ]);
  });

  it("records direct and HandleCreated watermark calls as reusable placeholder values", () => {
    const info = parseCodeBehind(`partial class LoginPanel {
  LoginPanel() {
    txtCode.HandleCreated += (sender, e) => txtCode.SetWatermark(Resources.CodeHint, true);
    txtSearch.SetCueBanner("Search customers");
    if (UseAdvancedHint) txtAdvanced.SetPlaceholderText(Resources.AdvancedHint);
  }
}`, "/proj/LoginPanel.cs");

    expect(info.valueHints).toEqual([
      {
        controlName: "txtCode",
        source: expect.objectContaining({
          property: "placeholderText",
          expression: "Resources.CodeHint",
          methodName: "LoginPanel",
          line: 3,
        }),
      },
      {
        controlName: "txtSearch",
        source: expect.objectContaining({
          property: "placeholderText",
          expression: '"Search customers"',
          literalValue: "Search customers",
          methodName: "LoginPanel",
          line: 4,
        }),
      },
      {
        controlName: "txtAdvanced",
        source: expect.objectContaining({
          property: "placeholderText",
          expression: "Resources.AdvancedHint",
          conditional: true,
          methodName: "LoginPanel",
          line: 5,
        }),
      },
    ]);
    expect(info.valueHints[0].source.conditional).toBeUndefined();
  });

  it("infers PropertyGrid SelectedObject types through list item flow", () => {
    const info = parseCodeBehind(`partial class SettingsForm {
      void RefreshAccounts() {
        foreach (CustomerSettings account in Config.Accounts) {
          accountList.Items.Add(account);
        }
      }
      void accountList_SelectedIndexChanged() {
        CustomerSettings copy = (CustomerSettings)accountList.Items[accountList.SelectedIndex];
        propertyGrid.SelectedObject = accountList.Items[accountList.SelectedIndex];
      }
    }`, "/proj/SettingsForm.cs");

    expect(info.propertyGridHints).toEqual([{
      controlName: "propertyGrid",
      source: {
        typeName: "CustomerSettings",
        expression: "accountList.Items[accountList.SelectedIndex]",
        sourceFile: "SettingsForm.cs",
        line: 9,
      },
    }]);
  });
});
