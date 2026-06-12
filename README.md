# winforms-to-react

Generic WinForms `.Designer.cs` to React compatibility-renderer converter.

This is a visual migration tool, not a business-logic translator. The first
milestone turns WinForms Designer files into a low-level Visual IR and emits a
standalone React/Vite preview project with a WinForms-compatible renderer and
an instance-level support coverage report.

## Why this shape

The target use case is old WinForms codebases where the first hard problem is
getting screens to appear recognizably in a browser. Once the visual surface is
stable, business logic, services, and workflow migration can be handled in later
passes with more context.

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

Generate a React/Vite preview project:

```bash
node dist/cli.js convert /path/to/winforms-source --out /tmp/wf2react-preview
```

Write a migration report:

```bash
node dist/cli.js report /path/to/winforms-source --out /tmp/wf2react-report
```

Run the generated preview:

```bash
cd /tmp/wf2react-preview
npm install
npm run dev
```

## Current coverage

The parser currently extracts:

- form name, title, client size, and selected form properties
- control declarations and instantiations
- absolute bounds from `Location` and `Size`
- text, tab index, auto size, dock, anchor, and arbitrary fallback properties
- control hierarchy from `Controls.Add`
- menu/tool/status strip hierarchy from `Items.AddRange` and `DropDownItems.AddRange`
- `DataGridView` column definitions from `Columns.AddRange`
- event handler stubs from common `+=` Designer patterns

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

The output is meant to be a compatibility preview and an inventory report. It is
the first pass before choosing which forms deserve deeper hand migration or
custom-control adapters.
