# NocoBase vs Refine/React platform spike

This repository keeps a neutral `ProjectIR` and exports the same parsed WinForms slice to two targets.
The spike is intentionally a migration constraint test, not an attempt to translate C# business logic.

## Pinned sample

- Project: `gitextensions/gitextensions`
- Commit: `0625c0744c41854a29200df24a5e5f2e351ee657`
- Main page: `FormCommit`
- Second complex page: `FormBrowse`
- Shared controls included: `FileStatusList`, `FileViewer`, `FileViewerInternal`, `EditNetSpell`

Run the reproducible bake-off with:

```bash
WF2_SPIKE_KEEP=1 WF2_SPIKE_WORK=/tmp/wf2-platform-spike \
  bash scripts/spike-gitextensions-targets.sh
```

Set `WF2_SKIP_NOCOBASE_INSTALL=1` only when dependency installation is intentionally skipped.

## Observed result

The selected slice produces one real page (`FormCommit`) with 69 direct controls and 46 event contracts.
The target manifest identifies 3 native fields and 25 actions. Shared component definitions remain separate:

| Component | Source status | Declared references |
|---|---:|---:|
| `FileStatusList` | resolved | 2 |
| `FileViewer` | resolved | 1 |
| `FileViewerInternal` | resolved | 1 (nested) |
| `EditNetSpell` | resolved | 1 |
| `LoadingControl` | external | 1 |
| `PictureBoxEx` | external | 1 |
| `TextEditorControl` | external | 1 |
| `ToolStripEx` | external | 5 |

`Staged` and `Unstaged` therefore reference one `FileStatusList` definition. They do not receive copied control trees.
The shared definitions contain another 3 fields, 116 actions, and 147 event contracts, recorded once by component
type rather than multiplied into each host page.

The IR also contains a shared semantic layout plan. In this sample it recovers three split regions, one table grid,
toolbar/action/status stacks, and state layers for controls that occupy the same WinForms bounds. Loading, empty,
conflict, image-preview, and normal-content variants remain traceable in `alternatives`, while only the primary state
is rendered in the static preview. Refine and NocoBase consume the exact same plan.

The shared runtime now renders this plan as a compact desktop-tool surface rather than a dashboard card: native-style
title bar, thin splitter gutters, working/staged file lists, selected rows, staging toolbar, line-numbered colored diff,
commit command column, message editor, and status strip. Preview filenames are derived from IR source paths; the list
and diff contents are representative visual fixtures, not migrated runtime records.

The preview interaction layer includes pointer/keyboard-resizable splitters (double-click restores the WinForms ratio),
file-row selection and a desktop context menu, and a hover/focus state selector for cycling preserved layer alternatives.
These interactions are target-runtime behavior and therefore remain identical in Refine and NocoBase.

## Second-page batch proof: FormBrowse

`FormBrowse` was added as a deliberately different desktop surface rather than another commit-dialog variant. Its
Designer file produces 131 controls with four nested split containers, a four-page `TabControl`, 72 menu items,
21 menu separators, and 12 custom-control instances. The normalized plan keeps the menu and three toolbars above the
main content, then reconstructs the repository tree, revision grid, commit/diff/file-tree/GPG tabs, and preserved
notification states.

The important implementation boundary is type-level adaptation. `RepoObjectsTree`, `RevisionGridControl`,
`CommitInfo`, `RevisionDiffControl`, `RevisionGpgInfoControl`, `InteractiveGitActionControl`, `FilterToolBar`, and
`MenuStripEx` are each mapped once in the shared target runtime. Every occurrence in every migrated page references
that adapter; the exporter does not emit per-file copies. The same adapters and semantic layout are emitted to both
Refine and NocoBase.

The second fidelity pass also recovers WinForms-specific details that a generic flex conversion missed: a missing main
splitter distance is inferred from the first panel's child width (190/923 rather than a 50/50 fallback), explicitly
collapsed or empty split panels do not leave blank web panes, and the three `TopToolStripPanel` controls stay in one
horizontal toolbar row. The runtime renders dropdown toolbars, graph refs, slim operation notifications, and a distinct
file-tree/content viewer for the `fileTree` instance while retaining one `RevisionDiffControl` type adapter.

The code-behind pass now records runtime `Control.Parent = SplitContainer.PanelN` assignments. This recovers a layout
that is impossible to infer from `FormBrowse.Designer.cs` alone: `RevisionInfo` is moved into the initially empty second
panel of `RevisionsSplitContainer`, while the Commit tab is removed from the lower tab strip. The resulting default
preview matches the native 4.2 arrangement—repository tree at left, revision list and commit information side by side
above, then Diff/File tree/GPG below. The lower `RevisionDiffControl` also renders its file filter and changed-file list
beside the line-numbered diff rather than pretending the component is only a text editor.

The repository tree now follows the 4.2 Browse density with a filter box and nested Submodules, Branches, Remotes, and
Tags rows. The main `ToolStripEx` respects Designer visibility, omitting the hidden Worktrees item, and observes its
complete toolbar row: at native reference width it exposes File Explorer, Git Bash, and Settings directly; below 1300
pixels it moves the trailing commands into a WinForms-style `»` overflow menu. The working-directory item uses the
original `DashboardFolderGit` resource rather than a text glyph. The adjacent filter strip renders branch scope, branch
selector, and text filter controls in the same row. Menus that GitExtensions inserts at runtime (Navigate and View) are
supplied by the single `MenuStripEx` adapter, not copied into each generated page.

Image references such as `Properties.Images.ReloadRevisions` were already present in the Designer IR but were not used
by the target runtime. The project builder now resolves those keys against image files under the source tree, records a
neutral asset manifest, and copies only referenced files into each target's source assets. FormBrowse resolves 50 real
GitExtensions PNGs, replacing text glyphs for reload, layout, worktree, branch, pull/push, commit, stash, explorer,
shell, and settings commands. Missing assets still fall back to semantic glyphs, so partial source slices remain usable.

Shared component adapters can also declare their own asset dependencies once per component type. This closes the gap
where an adapter needed an original icon that the host form's Designer never referenced directly. `RepoObjectsTree`,
`RevisionGridControl`, `RevisionDiffControl`, and `CommitInfo` now request their semantic icon sets through that shared
registry, raising the current FormBrowse target to 68 resolved GitExtensions assets. The repository tree uses the
original folder, submodule, branch, remote, and tag images, includes its native-density view toolbar, and its filter box
now filters the displayed objects in both targets.

Large forms commonly split non-Designer initialization across files such as `FormBrowse.InitCommitDetails.cs`. The
scanner now merges the complete `<FormName>*.cs` partial family, then applies runtime `Image`/`ImageKey` assignments to
the matching IR controls. This recovers the original CommitSummary, Diff, FileTree, and Key tab images and raises the
resolved FormBrowse asset set from 50 to 53 files without introducing page-specific parsing rules.

The FormBrowse adapters now share one preview runtime state instead of rendering isolated visual fixtures. Selecting a
revision updates the commit-information panel and the lower diff summary in both generated targets. Right-clicking a
revision opens a native-style context menu for checkout, branch creation, cherry-pick, comparison, and hash copy. These
commands deliberately remain visual contracts at this UI-first stage; they do not execute Git or migrated C# logic yet.

The main three-pane interaction now carries desktop-level detail rather than only synchronized captions. The revision
grid renders working-directory/index state icons, colored graph lanes and nodes, multiple branch labels, author badges,
full timestamps, and commit hashes based on the original FormBrowse density. CommitInfo exposes author email,
committer, date, hash, and parent metadata. Selecting a changed file updates the diff filename, compared revisions, and
file-specific code hunk; both repository and changed-file filters have real empty and clear states.

Code-behind layout recovery now includes tabs created after `InitializeComponent`, not only split-panel reparenting.
The parser identifies a runtime `new TabPage`, its later `Controls.Add`/`TabPages.Add` target, image key, inferred label,
and view kind. On the pinned FormBrowse source this recovers `_consoleTabPage → CommitInfoTabControl` from
`FillTerminalTab()` and carries it through the neutral layout plan. Both targets therefore render the original Console
tab with the source `Console` icon and a lazy-mounted repository-terminal preview. The terminal accepts local preview
commands, while intentionally leaving real shell execution behind the future backend boundary.

`FilterToolBar` now owns shared revision-filter state rather than decorative inputs. Revision scope, branch text, and
free-text filters update the revision grid immediately, expose clear/empty states, and use the original funnel assets.
Menu, toolbar, and revision-context commands also produce a transient native-style command acknowledgement so the UI
contract is visible before the corresponding Git/C# service implementation exists.

The native window chrome separates repository state from revision selection, matching the desktop application: its
title and toolbar keep the checked-out repository/branch while selecting an older commit updates only the revision
details. The GitExtensions application icon is resolved from the source assets, and no synthetic status strip is added
when the source form has none. Desktop keyboard behavior includes F5 refresh acknowledgement, Ctrl/Cmd+L filter focus,
revision-grid
Up/Down/Home/End and Ctrl/Cmd+C, tab Left/Right/Home/End and Ctrl+Tab, plus menu access keys and arrow navigation.

`RepoObjectsTree` now retains an explicit parent/child model instead of a flat set of indented rows. Branch, remote,
submodule, and tag views select real subtrees; expand/collapse hides descendants; search retains the ancestor path to
each match. The adapter exposes WinForms-like tree keyboard behavior with Up/Down/Home/End, Left/Right, Enter, and
Space, together with `tree`/`treeitem` accessibility semantics. The original toolbar actions for toggling the left
panel and switching the main split between below/right layouts now mutate shared layout state, with the active layout
reflected by the View-menu check state. Diff rows use content-width sizing so long source lines produce native horizontal
scrolling
instead of being clipped by the CSS grid.

Generated pages now default to a native presentation mode: the migration-report heading, diagnostic badges, outer
padding, card border, rounded corners, and shadow remain available to tooling but are removed from the visual canvas.
The WinForms window therefore fills the target content area in both exporters instead of looking like a screenshot
inside a web demo card. `ToolStripEx` also owns the recovered runtime toolbar surface once per component type. FormBrowse
uses that adapter to show the working directory, checked-out branch, `Commit (1)`, and the code-behind-created
`Open in VS Code` script action with its original `Develop` asset.

Runtime image recovery now distinguishes concrete resource expressions from indeterminate assignments. Expressions such
as `Properties.Images.Pull` and `nameof(Images.Console)` may override Designer state; assignments such as
`button.Image = image`, `selectedItem.Image`, or `shell.Icon` no longer replace a valid Designer asset with the bogus
keys `Image` or `Icon`. On FormBrowse this restores the original `LayoutFooterTab`, `Pull`, `RepoStateClean`, and
`GitForWindows` toolbar images through the shared asset pipeline.

The native surface also fixes its presentation baseline independently of the host platform: Segoe UI inheritance,
Windows-blue selection, dotted keyboard focus, 16-pixel desktop scrollbars, split-button arrow regions, and source
tooltip text are applied consistently in both targets. Revision references retain distinct local/remote/tag/state colors,
and the shared author presentation now uses compact and 80-pixel portrait variants instead of web-style initials badges.
CommitInfo matches the source density more closely with relative date text, full commit hash, and non-duplicated message
content.

Author portraits now have a shared best-effort source adapter rather than FormBrowse-specific data. A strict numeric
GitHub noreply address maps to GitHub's avatar CDN for both revision-grid and CommitInfo sizes; unrecognized addresses,
offline clients, and failed image requests retain the deterministic CSS portrait. The visual constraint can therefore
approach the source screenshot without making remote identity lookup a requirement for migrated applications.

Selection styling now follows desktop focus ownership instead of painting every current item blue. The repository tree
keeps its branch selection visually inactive until a tree row owns keyboard focus; the changed-file list uses the same
inactive grey/active Windows-blue transition. RevisionGrid remains the initially active selection, matching the pinned
reference state. Native content uses a 12-pixel Segoe UI baseline corresponding to the WinForms default 9-point font,
while the simulated Windows 10 title bar is flat white with a transparent original application icon and the menu strip
no longer carries a web-card grey fill.

The dense data regions now follow the pinned native reference rather than using decorative placeholders. The repository
tree includes the complete visible external-module list, a fifth Tags view, and a collapsed initial Tags node. Revision
history uses an SVG lane model whose main/side paths connect through branch and merge curves across rows. The diff surface
emits Git headers (`---`/`+++`), multiple `@@` hunk ranges, separate header/hunk/add/remove backgrounds, and lightweight
C# keyword/literal/comment coloring while preserving whitespace-mode and context-line controls.

The repository adapter now also reproduces the TreeView hierarchy itself: dotted ancestor rails, elbow connectors,
native disclosure triangles, muted inactive remotes, and expandable origin/upstream branch children. These details are
defined once by the shared tree adapter and remain identical in Refine and NocoBase rather than being painted into the
FormBrowse page.

`FilterToolBar` now follows the pinned component source rather than a simplified web filter row. Its advanced-filter,
reflog, branch-range, branch-history, branch-type, revision-history, revision-type, and first-parent items retain the
original order, split-button regions, source assets, and checked menus. First-parent mode also changes the shared
revision model and moves an incompatible active selection, so the recovered toolbar is an interaction constraint rather
than a static imitation.

The native window frame is no longer a GitExtensions-only shell. Workspace forms may opt into the full-width FormBrowse
profile, while ordinary dialogs use their own title, `ClientSize`, `MinimizeBox`, `MaximizeBox`, and `ControlBox` state.
Fixed-size forms preserve the source `ClientSize` inside a one-pixel window frame and a native title bar, which prevents
an unrelated business form from inheriting the Git repository title or the 1180-pixel workspace minimum. The outer
preview dimensions include that frame instead of shrinking the client area by two pixels under CSS `border-box` sizing.

Layout selection now distinguishes container-driven workspaces from coordinate-driven legacy dialogs. The FormBrowse
workspace continues to use normalized split/stack/tab semantics; a fixed business dialog retains Designer-relative
coordinates instead of flattening dozens of fields into an invented vertical flow. Its absolute `TabControl` adapter
still provides real selection and keyboard navigation while positioning each active page's children in the original
client coordinate system.

External controls also receive conservative semantic fallbacks before becoming placeholders. Type-name families such as
`*DatePicker`, `*TextBox`/`*Phone`, `ComboBox*`/`*Picker`, and `Warning*`/`*Validation` map to native-looking date,
text, combo, and validation primitives. This lets internal or vendor controls preserve their basic input role across
projects while leaving genuinely domain-specific controls explicit in the adapter manifest.

The `RevisionDiffControl` adapter now covers both of its FormBrowse roles without duplicating implementations. Its file-
tree mode renders a real folder/file hierarchy using source icons, preserves ancestor paths while filtering, supports
expand/collapse, and switches between file view and blame gutters with revision metadata. Its diff mode exposes the
original context-line, entire-file, whitespace, and settings controls; file selection still drives the displayed hunk.
The changed-file pane and code pane are separated by a pointer/keyboard-resizable splitter with double-click reset, and
the additional adapter assets remain declared once per component type.

Revision selection now models WinForms multi-selection rather than only one active row. Ctrl/Cmd toggles rows, Shift
extends a range, Ctrl/Cmd+A selects visible revisions, and Shift+arrow extends keyboard selection. One primary revision
continues to drive CommitInfo while its selection banner and the diff comparison summary expose the selected range. The
View menu reflects and mutates the same left-panel and split-layout state with check marks.
`RevisionGpgInfoControl` now renders signature status, signer, key ID, algorithm, verification time, and source-icon
actions for fingerprint/raw-signature contracts; artificial revisions correctly show an unsigned state. Together with
the source-accurate filter toolbar assets, these additions raise the current FormBrowse asset set to 87 resolved images.

Both generated FormBrowse targets pass their production checks: the Refine target passes TypeScript and Vite build,
and the NocoBase client-v2 plugin passes TypeScript against the pinned NocoBase packages. This is evidence that the
neutral IR can drive more than one complex page, but it is not yet evidence that arbitrary third-party custom controls
can be rendered without adding a type adapter.

## Cross-project business-form gate

The second visual gate uses OpenDental branch `24_3` (`d804c19546233593d8a66af0591ed118a9e2c794`), specifically
`FormPatientEdit`. It is a fixed-size line-of-business dialog rather than another developer tool: 2,375 Designer lines,
187 converted controls, five business tabs, 39 text inputs, 19 combo boxes, 19 buttons, and 11 instances of five
external control types. The same parser and ProjectIR generated both targets without a FormPatientEdit mapping.

This gate exposed a real cross-project fault that FormBrowse could not: coordinate-driven business dialogs must not be
flattened into semantic vertical stacks. Fixed forms now preserve their Designer coordinate system, source title,
974×696 client area, and disabled minimize/maximize buttons, while tabs remain interactive. The external OpenDental
date, phone/text, clinic picker, and integrity indicator controls are handled by shared type-name semantic fallbacks.
Both the Refine production build and NocoBase client-v2 type check pass for this form.

The same gate also removed host-framework leakage from basic WinForms controls. Empty text and combo fields no longer
display generated variable names as placeholders; read-only, disabled, password, length, selection, font, alignment,
checkbox, and radio state come from Designer metadata. `ListBox` now has a reusable native interaction adapter and
renders an empty white list when its source collection is populated only at runtime, rather than inventing preview text.
These changes live in the shared runtime and therefore apply to every generated project and both frontend targets.

Fixed-form geometry now treats `ClientSize` as the interior area instead of shrinking it by the CSS window border.
Fourteen-pixel labels retain their Designer height, multiline text boxes preserve wrapping state, and absolute tabs use
the source page inset and 21-pixel page origin. `System.Drawing.SystemColors` are normalized to valid CSS values, and
embedded `$this.Icon` byte arrays are emitted as real ICO assets; `FormPatientEdit` therefore uses its source multi-size
window icon instead of a generic placeholder in both generated targets.

The cross-project gate also rejects synthetic field content. External date controls no longer inject a fixed
`MM/DD/YYYY` placeholder, combo adapters expose only parsed items plus explicitly requested `IncludeUnassigned`, and
external text controls preserve read-only, disabled, password, length, multiline, and wrapping state. Standard controls
without Designer text remain blank instead of displaying humanized variable names. Custom button `Icon` enums are
normalized into the IR, so OpenDental's textless `DeleteX` button renders as an icon-only command rather than the label
“Clear Respons Party”. All five external types used by `FormPatientEdit` resolve to semantic adapters; none reaches the
generic shared-component placeholder.

Window chrome is now selected from the neutral form inheritance chain rather than the page name. `FormPatientEdit`
records `FormODBase` in `baseTypes`, while FormBrowse retains its separate GitExtensions base chain. The OpenDental
profile follows its checked source constants at 96 DPI: a 26-pixel title region, five-pixel left/right/bottom frame,
`#415e9a` border, `#fcfdfe` client background, 20-pixel source icon, and Microsoft Sans Serif 8.25pt content. The CSS
border and padding are sized so the 984×727 outer preview still contains the exact 974×696 Designer client area.
Close-button geometry and the `#e81123` hover state also follow `FormODBase`; unrelated fixed forms keep the generic
window profile.

## Target validation

### Refine / React

- Generates a standalone Vite + Refine v5 app.
- Registers each migrated page as a Refine resource route.
- Keeps the future ASP.NET Core API boundary in one `DataProvider`.
- Passed `tsc --noEmit`, Vite production build, and browser runtime verification.
- Current production bundle warns at roughly 1 MB before route-level code splitting; this is optimization work, not a migration blocker.

### NocoBase

- Generates a NocoBase 2.1 `client-v2` plugin source package.
- Uses the officially documented plain React route path first; it does not prematurely generate FlowModels.
- Pins the isolated verification environment to React 18 and Ant Design 5, matching NocoBase 2.1.
- Passed type checking against `@nocobase/client-v2@2.1.23` and `@nocobase/flow-engine@2.1.23`.
- A complete NocoBase 2.1.23 Docker host has been started successfully. The generated plugin has not yet been installed
  and enabled in that host; this remains the next validation gate before selecting NocoBase for production.

## What the spike says

Both targets can consume the same structural frontend constraint. The hard problem is not rendering basic controls;
it is recovering data collections, action semantics, permissions, workflows, and the remaining external custom controls.
Refine exposes those gaps directly in code. NocoBase can absorb more of them into platform configuration, but its
`client-v2` API is still moving and must stay isolated behind the exporter.
