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

Generate a **TanStack Form** project (runnable forms):

```bash
node dist/cli.js convert /path/to/winforms-source --out /tmp/form --form tanstack
```

Write a migration report:

```bash
node dist/cli.js report /path/to/winforms-source --out /tmp/report
```

Run the generated project:

```bash
cd /tmp/preview   # or /tmp/form
npm install
npm run dev
```

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
- control state: `Checked`/`ThreeState`, `ReadOnly`, `Multiline`,
  `PasswordChar`/`UseSystemPasswordChar`, `MaxLength`, `DropDownStyle`,
  `SelectedIndex`, `Value`/`Minimum`/`Maximum`, `Format`, `WordWrap`,
  `ScrollBars`, `CheckAlign`/`ImageAlign`, `Appearance`, `View`, `Mask`,
  `ImageLocation`/`SizeMode`
- layout metadata: `TableLayoutPanel` row/column styles and cell coordinates,
  `FlowLayoutPanel` `FlowDirection`/`WrapContents`, `SplitContainer`
  `Panel1`/`Panel2` grouping, `Orientation`, `SplitterDistance`
- control hierarchy from `Controls.Add`
- menu/tool/status strip hierarchy from `Items.AddRange` and `DropDownItems.AddRange`
- `DataGridView` column definitions from `Columns.AddRange` and nested style
  properties (`BackgroundColor`, `GridColor`, `DefaultCellStyle.SelectionBackColor`,
  `ColumnHeadersDefaultCellStyle`, `AlternatingRowsDefaultCellStyle`)
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
- full visual appearance mapping (font, colors, borders, alignment, padding)
- control state rendering (checked, readonly, multiline, password, dropdown,
  value/min/max, mask placeholder, image location)
- `DataGridView` with background/grid/selection/alternating row colors
- `ListView` Details view with column headers
- degraded placeholders for `PropertyGrid`/`WebBrowser`/`Chart` and nonvisual
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

Some controls are intentionally degraded into visual placeholders, including
`Chart`, `ErrorProvider`, `PrintPreviewControl`, `PropertyGrid`, `ToolTip`, and
`WebBrowser`.

Nonvisual components such as `BindingSource`, dialogs, image lists, resources,
fonts, `ListViewItem`, and `TreeNode` are excluded from the visual tree.

## Explicit non-goals

- No C# business logic conversion.
- No data binding/runtime behavior conversion.
- No custom-control source analysis yet.
- No pixel-perfect WinForms rendering guarantee.
- No attempt to infer workflows from service/server code.
- No `.resx` binary resource parsing (images/icons). Text/layout properties
  from `.resx` are now parsed and merged.

The output is meant to be a compatibility preview, an inventory report, and a
TanStack Form starting point. It is the first pass before choosing which forms
deserve deeper hand migration or custom-control adapters.

## Verified on real projects

| Project | Forms | Controls | Support | Render errors |
|---------|-------|----------|---------|---------------|
| dotnet/winforms | 13 | 351 | 100% | 0 |
| SHFB | 19 | 311 | 100% | 0 |
| ShareX | 96 | 2245 | 100% | 0 |
| mRemoteNG | 48 | 592 | 100% | 0 |
| gitextensions | 173 | 2472 | 100% | 0 |
| PowerToys | 30 | 223 | 100% | 0 |

Both output modes (compat preview + TanStack Form) pass `tsc --noEmit` with 0
errors across all projects.
