# winforms-to-react

Generic WinForms `.Designer.cs` → React converter with two output modes:

1. **Compat preview** (`--form compat`): a standalone React/Vite project with a
   WinForms-compatible renderer. For teams to see the original UI in a browser.
2. **TanStack Form** (`--form tanstack`): a runnable TanStack Form + Zod project
   where each input control becomes a typed `form.Field` with auto-inferred Zod
   validation, label association, event handler stubs, and layout containers.

Both modes share the same parser and IR, so coverage and accuracy improvements
benefit both outputs.

## Why this shape

The target use case is old WinForms codebases where the first hard problem is
getting screens to appear recognizably in a browser. Once the visual surface is
stable, the TanStack Form output gives a running starting point for migration.

## Commands

```bash
npm install
npm run build
```

Scan for Designer files:

```bash
node dist/cli.js scan /path/to/winforms-source
node dist/cli.js scan /path/to/winforms-source --json
```

Generate a **compat preview** (static visual):

```bash
node dist/cli.js convert /path/to/winforms-source --out /tmp/preview
```

Generate platform comparison targets from the same neutral Project IR:

```bash
node dist/cli.js convert /path/to/winforms-source --target refine --out /tmp/refine
node dist/cli.js convert /path/to/winforms-source --target nocobase --out /tmp/nocobase-plugin
```

When converting one representative Designer file, pass the wider source tree as
context so inheritance, shared `UserControl` definitions, referenced assets, and
code-behind enum/list contracts can resolve without generating every form in the
repository:

```bash
node dist/cli.js convert /path/to/FormPatientEdit.Designer.cs \
  --context /path/to/project-root --target refine --out /tmp/refine
```

For a repeatable 8–15 screen gate, put the selected Designer paths in a batch
manifest and use the same file set for both targets. Paths stay relative to the
source root, and `.Designer.cs` matching is case-insensitive:

```bash
node dist/cli.js convert /path/to/project --batch migration-batches/example.json \
  --context /path/to/project --target refine --out /tmp/refine
node dist/cli.js convert /path/to/project --batch migration-batches/example.json \
  --context /path/to/project --target nocobase --out /tmp/nocobase
```

Generate an auditable batch report from the same neutral IR:

```bash
node dist/cli.js batch-audit /path/to/project --batch migration-batches/example.json \
  --context /path/to/project --out /tmp/batch-audit
```

Generate the complete ActionContract candidate queue before writing backend
code. The report overlays mapped operations on every scanned
control/event/handler tuple and keeps the rest explicitly unresolved:

```bash
node dist/cli.js action-candidates /path/to/project --batch migration-batches/example.json \
  --context /path/to/project --out /tmp/action-candidates
```

Turn the unresolved queue into one editable draft per page. Shared handlers are
collapsed into a single operation skeleton with multiple triggers:

```bash
node dist/cli.js action-skeletons /path/to/project --batch migration-batches/example.json \
  --context /path/to/project --out /tmp/action-skeletons
```

Use `--page FormName` to restrict the output and `--base-url` to seed the draft
header. Drafts are deliberately wrapped as `ActionContractPageDraft` with
`status: "draft"`; they cannot be loaded as executable plans or counted as
mapped coverage. Each draft carries source lines, direct and one-hop helper
calls, property/assignment/construction/await evidence, boundary review,
referenced-control hints, and request/response/effect TODOs. Resolved empty
handlers are explicit `omit` candidates; missing or unclassified handlers stay
in `review`. C# null-conditional calls (`?.`) count as executable evidence.

Turn the drafts into a conservative promotion queue:

```bash
node dist/cli.js action-promotions /path/to/project --batch migration-batches/example.json \
  --context /path/to/project --out /tmp/action-promotions
```

Promotion output remains a non-loadable `status: "proposal"` wrapper. It
separates exact generic client effects from client stubs, server endpoint
stubs, source review, and confirmed-empty omit candidates. Only exact effects
(`select-all`, `clear-all`, literal value, value transform, clipboard copy, or
focus) receive a schema-valid client operation template.

The OpenDental v0.7 proof activates all five exact client proposals in three
page-level sidecars. That moves mapped coverage from 19/187 to 24/187 and
reduces the unresolved operation queue from 125 to 120, with zero remaining
`ready-client` proposals. Generated Refine and NocoBase targets embed identical
Project IR, candidate, draft, and promotion artifacts.

The POS retail v0.8 cold-start gate adds a bounded cross-type boundary check.
For calls such as `gateway.Read()`, the scanner resolves the field's declared
project type and imports direct evidence from exactly one target method body.
It does not classify receiver or method names such as `dal.select` by naming
convention. On the pinned 12-page SQL Server sample, 20 database-backed load,
search, filter, and mutation handlers move from client to server; Refine and
NocoBase remain generated from identical neutral artifacts.

The first cross-project executable slice now maps the POS `Catagories` Load and
TextChanged search handlers through a target-neutral sidecar into a .NET 10
API. Its real adapter uses parameterized SQL Server access; deterministic
fixtures keep the same API runnable on macOS without claiming a real database
pass. The shared runtime also infers columns when a WinForms `DataGridView`
relied on `AutoGenerateColumns`, and cancels stale repeated TextChanged
requests. See the
[POS category vertical slice](vertical-slices/pos-categories-read/README.md).

The BCU shared-control cold-start gate validates nested component reuse on
eight production forms: 14 Designer-backed component types cover 21 of 22
effective instances with exactly one IR definition per type. The remaining
`TreeMap` is intentionally uncovered because its empty Designer surface is
painted entirely by `OnPaint`. See
[the BCU shared-control report](docs/bcu-shared-controls-cold-start.md).

The report separates standard-control preview coverage from shared-component
definitions, explicit target adapters, and uncovered fallbacks; it reports both
type and instance coverage, classifies ActionContract boundaries, and
recommends a bounded first C# vertical slice.
Only component types reachable from the selected pages are emitted; adding a
wider context does not add unrelated `instanceCount=0` definitions.

The generated Refine target also exposes `/acceptance` as a frontend acceptance
gate. Each page and every retained source-visibility combination has an expected
evidence key. Open a page through the dashboard, inspect it with `wfInspect=1`,
then record **pass**, **accepted difference**, or **blocked**. Geometry evidence
and viewport size are stored with the decision in browser local storage and can
be exported and re-imported as JSON. A page is ready only after all of its expected states have
evidence and none is blocked. Refine is the current visual acceptance target;
NocoBase remains a compile-compatible consumer of the same Project IR and
shared runtime while the platform decision stays reversible.

Batch manifests may reference one or more target-neutral `actionContracts`
sidecars. Every operation must match a control/event/handler contract actually
scanned from the selected page; invented handlers and unknown input, output, or
grid-column mappings fail conversion. Both frontend targets receive the same
plan. Append `?wfActions=1` to opt into connected actions; ordinary preview and
acceptance URLs remain backend-independent.

One operation may declare a `triggers` array when several controls share the
same code-behind handler. The loader validates every trigger, while the runtime
passes the actual `trigger-control` into the request. This keeps shared-handler
mappings type-level instead of copying one operation per control. Generated
targets include `action-contract.candidates.json` and the non-executable
`action-contract.drafts.json`; the batch audit records
mapped triggers, operation definitions, reuse savings, unresolved candidates,
and manual request/response bindings. See
[`docs/action-contract-batchability.md`](docs/action-contract-batchability.md).

The first executable slice maps OpenDental `FormEhrPatientExport` Load, Search,
Select All, and Export through a .NET 10 API with SQL Server access, a legacy
CCD service boundary, validation, server-owned ZIP artifacts, and count-only
PHI audit events. See
[`vertical-slices/opendental-ehr-patient-export`](vertical-slices/opendental-ehr-patient-export/README.md)
and verify it on macOS with:

```bash
npm run check:vertical-slice
```

Validate exported evidence outside the browser and emit an auditable readiness
report. The command exits with code `2` for missing, blocked, contradictory,
duplicate, or otherwise invalid evidence:

```bash
node dist/cli.js acceptance-gate frontend-acceptance-evidence.json \
  --manifest /tmp/refine/src/generated/target-manifest.json \
  --batch-audit /tmp/batch-audit/batch-audit.json \
  --out /tmp/acceptance-gate
```

The Refine target is standalone. The NocoBase target is a `client-v2` plugin source package intended for a
NocoBase 2.1 workspace. See [the pinned GitExtensions platform spike](docs/platform-spike.md) for the current
validation scope and results.

Generate a **TanStack Form** project (runnable forms):

```bash
node dist/cli.js convert /path/to/winforms-source --out /tmp/form --form tanstack
```

Write a migration report:

```bash
node dist/cli.js report /path/to/winforms-source --out /tmp/report
```

Evaluate the native visual-parity evidence registered in
`visual-baselines/manifest.json`:

```bash
npm run visual:gate
node dist/cli.js visual-gate visual-baselines/manifest.json --out /tmp/visual-report
```

The command exits with code `2` while required native/Web PNGs or manual review
records are missing, and when recorded geometry, content, layout, or state does
not pass. Pixel differences are reported for diagnosis but never produce a pass
on their own.

Run the generated project:

```bash
cd /tmp/preview   # or /tmp/form
npm install
npm run dev
```

When the IR contains code-behind visibility variants, append `?wfInspect=1`
to the preview URL. A source-state inspector appears outside the emulated
WinForms window and can switch every retained branch without executing C#.
Use `?wfInspect=1&wfVariant=0-1-...` to open a specific source-state
combination. The inspector can save the current acceptance evidence and advance
directly to the next combination.
For fixed-coordinate pages the same inspector measures every visible rendered
control against its IR bounds and reports size, position, unexpected overlap,
ancestor clipping, and parent-coordinate overflow above ±4px; this catches
framework CSS that silently overrides source geometry.

## Current coverage

The parser currently extracts:

- form name, title, client size, and form-level properties (`FormBorderStyle`,
  `StartPosition`, `WindowState`, `Opacity`, `AcceptButton`, `CancelButton`,
  `BackgroundImage`)
- control declarations and instantiations (including target-typed `new()`)
- absolute bounds from `Location` and `Size`
- text, tab index, auto size, dock, anchor, and arbitrary fallback properties
- visual appearance: `Font` (family/size/bold/italic/underline/strikeout),
  `ForeColor`/`BackColor` (`Color`, `FromArgb`, `FromKnownColor`), `Enabled`,
  `Visible`, `BorderStyle`, `TextAlign`, `ImageKey`/`Image`, `Padding`/`Margin`,
  `RightToLeft`, `FlatStyle`, `MaximumSize`/`MinimumSize`
- the same localized appearance properties when a Designer uses
  `resources.ApplyResources(...)` and stores them in `.resx`; explicit
  Designer assignments remain authoritative when both sources are present
- control state: `Checked`/`ThreeState`, `ReadOnly`, `Multiline`,
  `PasswordChar`/`UseSystemPasswordChar`, `MaxLength`, `DropDownStyle`,
  `SelectedIndex`, `Value`/`Minimum`/`Maximum`, `Format`, `WordWrap`,
  `ScrollBars`, `CheckAlign`/`ImageAlign`, `Appearance`, `View`, `Mask`,
  `ImageLocation`/`SizeMode`, and source placeholder/watermark text
- code-behind item sources from `Items.AddEnums<T>()`, `Items.AddList(...)`,
  `GetEnumDescriptions<T>()`, `GetLocalizedEnumDescriptions<T>()`, and
  `Enum.GetNames(typeof(T))`; C# enum members, `[Description]` labels, and
  neutral `.resx` localization keys such as `Type_Member` resolve from
  `--context`, while `Enum.GetNames` preserves raw member names
- `Items.AddRange(Class.Member)` static string arrays and object collections;
  object labels materialize only when the element type proves its `ToString()`
  property and constructor-parameter flow, while instance/runtime collections
  remain unresolved contracts
- constructor and form `Load`/`Shown` initialization assignments for text,
  checked/enabled/read-only state, numeric values, and list selection; literal
  values and configuration-class defaults resolve through the local call graph,
  while ordinary entity records and ambiguous runtime branches stay unresolved
- direct UI dependencies inside wired change handlers, limited to proven
  `target.Enabled`/`ReadOnly`/`Visible = [!]source.Checked`-style assignments;
  method calls, model expressions, and unrelated control reads remain contracts
- text-input hints from Designer/`.resx` `PlaceholderText`, `WatermarkText`, or
  `CueBannerText` properties and code-behind `SetWatermark`, `SetCueBanner`, or
  `SetPlaceholderText` calls; neutral `Resources.resx` strings resolve once into
  `appearance.placeholderText` for both generated targets
- ToolStrip `ToolTipText` and ToolTip-extender `SetToolTip(control, text)` calls;
  literal and localized `.resx` text becomes `appearance.toolTipText`, while
  computed runtime messages remain traceable initialization contracts
- reusable UserControl property facades whose setters provably forward `value`
  to a child control (`Text`, `Checked`, `Enabled`, `ReadOnly`, placeholder text, `Visible`,
  `SelectedIndex`/`SelectedItem`, or `Value`); the binding is stored once on the
  shared component definition and each host instance keeps its own input value
- parameterless UserControl constructor defaults through same-class property
  setters and no-argument methods when every selected `if`/`switch` branch is
  constant; literals, unique neutral `Resources.resx` strings, and
  `Color.FromArgb` values materialize with source provenance, while unknown
  conditions, conflicting resources, and method-computed values are skipped
- cross-file service navigation assets when one class proves both a
  Resources-backed `ServiceIcon`/`ServiceImage` and its configuration
  `TabPage`; ImageList's first Resources item is retained as the default tree
  icon, with hyphen/underscore filename normalization during asset lookup
- `PropertyGrid.SelectedObject` type flow through typed variables and list
  items, with browsable property metadata, categories, descriptions, editor/
  password/read-only flags, and proven defaults resolved from `--context`
- code-behind control-adapter relationships such as a tree navigator consuming
  an existing `TabControl`; the relationship stays explicit in neutral IR
- conditional `TabPages.Remove(tabPage)` calls as neutral runtime-visibility
  variants; the generated preview keeps both source-proven states and defaults
  to the branch that requires the fewest unresolved feature prerequisites
- layout metadata: `TableLayoutPanel` row/column styles and cell coordinates,
  `FlowLayoutPanel` `FlowDirection`/`WrapContents`, `SplitContainer`
  `Panel1`/`Panel2` grouping, `Orientation`, `SplitterDistance`
- a target-neutral semantic layout plan (`split`, `grid`, `stack`, `layers`)
  that turns container metadata into responsive web regions and records
  overlapping WinForms state controls as alternatives instead of rendering
  them simultaneously
- control hierarchy from `Controls.Add`
- menu/tool/status strip hierarchy from `Items.AddRange` and `DropDownItems.AddRange`;
  control `Menu` references remain target-neutral and resolve within the page or
  shared UserControl scope instead of being expanded into each host instance
- `DataGridView` column definitions from `Columns.AddRange` and nested style
  properties (`BackgroundColor`, `GridColor`, `DefaultCellStyle.SelectionBackColor`,
  `ColumnHeadersDefaultCellStyle`, `AlternatingRowsDefaultCellStyle`)
- code-behind custom-grid columns from statically proven `GridColumn`
  construction/`Columns.Add`, plus top-level `MenuItemOD` additions; the
  metadata stays on each neutral control while one target adapter is reused by
  every instance
- `ListView` `ColumnHeader` columns from `Columns.AddRange`
- static list items from `Items.AddRange`, `Items.Add`, and simple `TreeNode`
  constructors
- event handler stubs from common `+=` Designer patterns
- C# comments (single-line and block) are stripped before scanning so
  commented-out Designer lines are ignored

The generated renderer applies:

- Dock layout passes (Top/Bottom/Left/Right/Fill) with z-order edge reservation
- Anchor layout (Left+Right stretches width, Top+Bottom stretches height)
- `TableLayoutPanel` as CSS grid with percent/absolute/auto sizing
- `FlowLayoutPanel` with `FlowDirection` and `WrapContents`
- `SplitContainer` as two-panel splitter with `Orientation`/`SplitterDistance`
- code-behind-bound tree navigation as a left navigation tree plus a tabless
  selected page, without duplicating the original `TabPage` definitions;
  source service icons and the ImageList default icon render beside tree nodes
- runtime visibility applies to fixed-coordinate tabs, semantic tab layouts,
  and tree-backed tab navigation, so code-behind-removed pages do not leave
  phantom tab headers in either generated target
- full visual appearance mapping (font, colors, borders, alignment, padding)
- control state rendering (checked, readonly, multiline, password, dropdown,
  value/min/max, source watermark or mask placeholder, image location)
- live checkbox-driven enabled/read-only/visible dependencies recovered from
  wired WinForms handlers, with state isolated per reused UserControl instance
- WinForms-specific standard-control behavior such as editable default
  `ComboBox` versus `DropDownList`, multiline `TabControl` headers, numeric
  text alignment, button image alignment, and text-area scrollbar modes
- source-linked menu buttons resolve their `ContextMenuStrip` in the current
  page/shared-component scope and render nested items, separators, checked and
  disabled states, shortcuts, icons, and original event contracts; the menu
  definition remains single-copy when its UserControl is reused
- source ToolTips appear after the WinForms-style delay in a native yellow,
  multiline popup rendered outside clipped layout containers
- `DataGridView` with background/grid/selection/alternating row colors
- `ListView` Details view with column headers
- a native `PropertyGrid` whose source-derived schema rows and constructor/
  attribute defaults are previewable before live object data is connected;
  degraded placeholders remain for `WebBrowser`/`Chart`, and nonvisual
  components (`ErrorProvider`/`ToolTip`/`Timer`) are suppressed

The migration report includes `controlCoverage`, which records:

- total parsed visual controls
- supported, degraded, and unknown instance counts
- supported, previewable, and unknown percentages
- per-control-kind counts and support status

The generated renderer has compatibility components for common WinForms
controls such as buttons, labels, text boxes, combo boxes, checkboxes,
radio buttons, panels, group boxes, tab controls, data grids, menu/tool/status
strips, binding navigators, list/tree controls, scrollbars, trackbars, progress
bars, picture boxes, and basic tool strip item variants.
Zero-sized `AutoSize` labels that receive proven constructor text use their web
preferred width instead of retaining an invisible one-pixel design-time box.

Some controls are intentionally degraded into visual placeholders, including
`Chart`, `ErrorProvider`, `PrintPreviewControl`, `ToolTip`, and `WebBrowser`.
`PropertyGrid` preserves its native toolbar/body/help geometry and statically
resolved schema, but remains reported as degraded until live object-instance
values are connected.

Nonvisual components such as `BindingSource`, dialogs, image lists, resources,
fonts, `ListViewItem`, and `TreeNode` are excluded from the visual tree.

## Explicit non-goals

- No C# business logic conversion.
- No data binding/runtime behavior conversion.
- No general execution or owner-draw analysis for arbitrary custom controls.
  Designer-backed `UserControl` definitions are shared automatically; unmatched
  or self-painted types still require a reusable adapter.
- No pixel-perfect WinForms rendering guarantee.
- No unbounded workflow inference from service/server code. Cross-type analysis
  is limited to one receiver method hop for boundary classification only.
- No general `.resx` binary-object deserialization. Text/layout properties and
  directly embedded form ICO byte arrays are supported; serialized framework
  image objects still require a source asset or adapter.

The output is meant to be a compatibility preview, an inventory report, and a
TanStack Form starting point. It is the first pass before choosing which forms
deserve deeper hand migration or custom-control adapters.

Project-specific visual fidelity is isolated behind generated
`runtime/visualProfiles.tsx` mappings. The shared runtime asks only whether a
page/control/component uses a profile; unrelated projects do not receive that
profile's CSS, fixtures, control-name mappings, or composite controls. Asset
URLs are emitted separately in `runtime/visualAssets.ts`, so the generated
`MigrationSurface.tsx` is byte-identical across the current FormBrowse,
FormPatientEdit, and UploadersConfigForm gates. A third complex gate, ShareX
`UploadersConfigForm`, currently generates an empty profile while still
recovering its 49-page tree-driven settings UI from neutral IR. See
[the platform spike](docs/platform-spike.md#third-project-reuse-gate-sharex) for
the boundary and validation details, and [Native parity gate v1](docs/native-parity-gate.md)
for the visual acceptance threshold.

## Verified on real projects

| Project | Forms | Controls | Support | Render errors |
|---------|-------|----------|---------|---------------|
| dotnet/winforms | 13 | 351 | 100% | 0 |
| SHFB | 19 | 311 | 100% | 0 |
| ShareX | 96 | 2245 | 100% | 0 |
| mRemoteNG | 48 | 592 | 100% | 0 |
| gitextensions | 173 | 2472 | 100% | 0 |
| PowerToys | 30 | 223 | 100% | 0 |
| POS retail cold-start | 12 | 234 | 100% | 0 |
| Bulk Crap Uninstaller shared-control gate | 8 | 396 | 100% | 0 |

Both output modes (compat preview + TanStack Form) pass `tsc --noEmit` with 0
errors across all projects.
