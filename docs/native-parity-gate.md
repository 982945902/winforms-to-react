# Native parity gate v1

This gate separates “the generated target compiles” from “the browser preview is
visually close to the source WinForms application”. Build, HTTP, and control
coverage results are prerequisites only; none of them count as visual evidence.

## macOS development mode

The converter, parser tests, target builds, HTTP preview, and IR comparison all
run on macOS. Native WinForms capture is not part of the normal macOS loop and
must not block parser/runtime work. During development, use source-derived
geometry and state plus official upstream screenshots as candidate references.
For example, OpenDental publishes an [Edit Patient Information reference](https://www.opendental.com/manual/patientedit.html)
whose default surface shows only the Other and Emergency Contact tabs.

An upstream image is not automatically a strict baseline: its release, feature
preferences, DPI, and client-area crop must first be recorded. The fixed Windows
environment below is only the final acceptance environment for native-vs-Web
evidence; it does not require a Windows workstation for day-to-day development.

## Fixed capture environment

- Windows display scale: 100% (96 DPI)
- Theme: Windows light theme, default high-contrast mode off
- Font smoothing: ClearType on
- WinForms process: no compatibility DPI override
- Browser zoom: 100%
- Reference format: lossless PNG, one physical screenshot pixel per display pixel
- Client sizes:
  - FormBrowse: 923 × 573
  - FormPatientEdit: 974 × 696
  - UploadersConfigForm: 1044 × 601

Capture the WinForms client area separately from the OS non-client frame. The
generated preview owns its title bar, so a second full-window screenshot may be
kept for title/chrome comparison but must not be used for client geometry.

## Eight reference views

| ID | Source view/state | Why it is in the gate | Native reference |
|---|---|---|---|
| sharex-imgur | UploadersConfigForm → Image uploaders → Imgur | standard labels, text inputs, checkboxes and service icon | missing |
| sharex-privatebin | Text uploaders → PrivateBin, credentials tooltip visible | nested settings, credentials and multiline ToolTip | missing |
| sharex-ftp | File uploaders → FTP / FTPS / SFTP | dense fields, lists and action controls | missing |
| sharex-amazon-s3 | File uploaders → Amazon S3, custom-domain tooltip visible | large form and multiline ToolTip portal | missing |
| sharex-google-cloud | File uploaders → Google Cloud Storage | service-specific grouping and assets | missing |
| sharex-bitly | URL shorteners → bit.ly | compact form and navigation selection | missing |
| gitextensions-formbrowse | FormBrowse default workspace | menu/toolbars, repository tree, splitters, revision grid and tabs | missing |
| opendental-patient | FormPatientEdit default state | fixed-coordinate form, custom controls and native OpenDental chrome | missing |

Native files should be stored as
visual-baselines/native/<id>@96dpi.png. Matching browser captures should use
visual-baselines/web/<target>/<id>@96dpi.png, where target is refine or
nocobase.

## Executable gate

The checked-in [manifest](../visual-baselines/manifest.json) is the source of
truth for all 8 views and both targets. Run:

```bash
npm run visual:gate
node dist/cli.js visual-gate visual-baselines/manifest.json --out /tmp/visual-report
```

The output contains JSON and Markdown reports. Exit code `2` means the gate is
blocked by missing evidence or failed by measured/reviewed evidence. With the
initial empty baseline set, the expected result is 16 blocked target checks;
that is an honest state, not a test failure in the renderer.

Each Web capture needs a review record at
`visual-baselines/reviews/<target>/<id>.json`. Copy
[review.example.json](../visual-baselines/review.example.json) and record the
reviewer, time, exact text/icon result, geometry coverage, exact client-area
result, layout-defect result, and state result. The machine-readable definition
is [review.schema.json](../visual-baselines/review.schema.json).

PNG dimensions and review thresholds determine the automated result. Pixel
channel differences, mean absolute error, and RMSE remain diagnostic values and
cannot make an entry pass without the manual evidence.

## Pass criteria

The gate passes only when all eight native references exist and both generated
targets satisfy:

1. Source-proven visible text and icons: 100% exact.
2. Standard-control geometry: at least 95% of measured controls have all four
   edges within ±4 px of the WinForms client-area reference.
3. Client-area size: exact at the fixed source size; no unexpected page-level
   scrollbars.
4. No clipped labels, hidden focusable controls, overlapping standard controls,
   or content rendered outside its source container.
5. The selected tab/tree state, enabled/disabled/read-only state, and visible
   ToolTip state match the named reference state.
6. Refine and NocoBase consume identical IR, visual profile, asset registry and
   shared runtime for the same source project.

Pixel color difference is diagnostic, not the sole pass/fail score. Font
rasterization differs between WinForms/GDI and browsers, so geometry, content,
state and control chrome are measured separately.

## Measurement order

Fix differences in this order to avoid compensating errors:

1. DPI, font family/size and client coordinate space
2. standard control heights, borders and padding
3. container bounds, tabs and splitter distances
4. disabled/focus/selected states and scrollbars
5. project profile chrome and custom controls
6. ToolTips and other overlays

The next reuse gate begins only after this parity gate passes: migrate a fourth
previously unseen complex project without changing MigrationSurface.tsx.
Only a new isolated visual profile/fixture is allowed.
