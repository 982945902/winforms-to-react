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
`MenuStripEx` are each mapped once by the FormBrowse visual profile to a generic runtime adapter. Every occurrence in
every migrated page references that adapter; the exporter does not emit per-file copies. The same adapters and semantic
layout are emitted to both Refine and NocoBase.

Project preview records, control-name text/glyph mappings, menu/toolbar fixtures, and fidelity splitter overrides live
in the FormBrowse visual profile fixture. The shared `MigrationSurface.tsx` consumes only generic capabilities and is
byte-identical across FormBrowse, FormPatientEdit, and UploadersConfigForm; source asset URLs are emitted in a separate
`visualAssets.ts` registry. A boundary test prevents project tokens from leaking back into the shared runtime.

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
renders source-backed options when their code-behind domain can be resolved; genuinely dynamic business collections
remain empty rather than receiving invented preview records. These changes live in the shared runtime and therefore
apply to every generated project and both frontend targets.

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

Custom controls that normalize to a standard kind now retain their declared C# `sourceType` in ProjectIR. For example,
`OpenDental.UI.Button` still shares the generic Button layout, state, and event path, but selects the OpenDental button
theme through a type adapter. The current profile takes its reusable constants from the checked source: `#1c5180` /
`#006ebe` button borders and source gradients, Silver rounded group borders, SlateGray list borders with `#bac7db`
selection, and `#adadad` / `#0078d7` combo states. `FormPatientEdit` exercises 19 custom buttons, 19 custom combos,
five custom group boxes, and four custom lists. FormBrowse exercises none of those type matches, which is the regression
gate against leaking this project profile into ordinary WinForms controls.

Single-file conversion now includes the matching code-behind family when collecting inheritance and public control
metadata. Selecting `FormPatientEdit.Designer.cs` directly therefore retains `FormPatientEdit : FormODBase` instead of
requiring a whole-repository scan. This uses the same files already inspected for events, and makes representative-form
spikes reliable without generating every form in a large legacy project.

The same source-type profile now covers the remaining self-painted controls visible in this form. OpenDental's 20-pixel
tab strip uses its Silver outline, `#f5f5f5` inactive tabs, `#aabee6` selected tab, and exact `(2,21)` TabPage inset;
its 12 custom check boxes use the source 12-pixel square, dark check mark, and `#d2efff` hover fill while retaining
checked, indeterminate, three-state, disabled, right-aligned, and tab-stop state. The warning-integrity adapter now draws
the source 18×18 orange triangle instead of an unrelated circular badge.

Composite external controls preserve their internal geometry without inventing business data. `ODDatePicker` keeps the
source text field at x=63/width=102 and the flat 16-pixel calendar button at x=148 rather than stretching a date input
across its 227-pixel host. `ComboBoxClinicPicker` preserves its 37-pixel `Clinic`/`Clinics` label area and draws the
actual combo only in the remaining width. Its runtime clinic list is deliberately left for the backend contract; only
explicit Designer options such as `IncludeUnassigned` and `HqDescription` appear in the preview.

Absolute rendering now translates WinForms collection order into explicit CSS stacking order. WinForms child index zero
is the front of the Z-order, whereas later DOM siblings normally paint on top; applying `controls.length - index` as the
absolute sibling z-index preserves Designer intent without reversing keyboard/tab order or semantic layouts. This is
observable in `FormPatientEdit`: `textZip` remains above its intentionally tucked-under suggestion combo instead of the
empty combo covering the editable field.

Code-behind `if/else` branches that hide opposing sets of controls are retained as neutral runtime visibility groups.
The parser also recognizes conditional `TabPages.Remove(tabPage)` calls, including one-sided conditions: the opposite
state is the page already declared by the Designer. The OpenDental gate now yields four groups. Three remove the EHR,
Public Health, and Hospitals tabs in the source-proven minimal default state; `_isUsingNewRaceFeature` defaults to the
modern read-only race/ethnicity fields and hides the overlapping legacy combos. Fixed-coordinate tabs, semantic tab
layouts, and tree-backed tab navigation all consume the same visibility state. The intentionally layered Zip controls
are not classified as a state because they have no opposing visibility assignments. FormBrowse yields no visibility
groups, providing a cross-project false-positive gate.

The generated preview exposes these groups only when `?wfInspect=1` is present. Its source-state inspector stays
outside the emulated WinForms window, lists the original condition and `sourceFile:line`, and switches the selected
variant in memory. The ordinary URL remains clean for parity capture; on macOS the opt-in URL makes runtime UI states
directly reviewable without launching the C# application.

The inspector also runs a fixed-coordinate geometry audit in the page itself. Non-layout probe wrappers use
`display: contents`, so they do not change positioning; after layout, the runtime compares each visible control's
actual DOM bounds with its source bounds and lists differences above ±4px. It checks size and position in the local
offset-parent coordinate space, flags controls that leave an originally valid parent coordinate space, walks
overflow-clipping ancestors, and detects newly introduced sibling overlap. Source-authored overlap and source-authored
out-of-bounds placement are retained rather than reported as migration defects.

Runtime-populated item collections are now explicit neutral IR contracts. The code-behind pass recognizes generic
`Items.AddEnums<T>()`, `GetEnumDescriptions<T>()`, `GetLocalizedEnumDescriptions<T>()`, `Enum.GetNames(typeof(T))`,
and typed `Items.AddList(list, ...)` calls, while preserving arbitrary dynamic AddList expressions even when their
values cannot be evaluated. A `--context <project-root>` conversion option lets a selected single form resolve
referenced C# enum declarations from the wider repository, including `[Description("...")]` labels, without converting
every Designer file. Localized enum helpers additionally resolve neutral `.resx` keys in the conventional
`Type_Member` form; `Enum.GetNames` deliberately retains raw member names instead of applying descriptions. One control
can retain multiple item sources, and static Designer items are merged rather than overwritten.

On the real OpenDental gate this materializes Status (7), Gender (4), Position (5), Contact/Confirm/Recall (9 each),
and Preferred Pronouns (4) from the source enum domain. `listRelationships`, whose source is the runtime call
`Patients.GetRelationships(Family,_listGuardians)`, keeps that dependency in ProjectIR but remains empty. FormBrowse
produces no item-source contracts, demonstrating that the new pass does not leak OpenDental data into another project.
Refine and NocoBase serialize byte-for-byte equivalent page/control IR for both gates.

## Generated profile boundary

Cross-project fidelity rules now have an explicit generated boundary. Each target emits the same
`runtime/visualProfiles.tsx` registry, which owns page-profile selection, source-control type selection, and
component-type adapter selection. The shared runtime asks that registry through stable functions rather than checking
OpenDental namespaces or GitExtensions component IDs throughout ordinary control rendering. OpenDental composite
controls and its dedicated CSS are emitted only when the converted page actually uses the profile. GitExtensions
adapter selection is centralized in the same registry; its richer preview implementations are still shared runtime
code and remain a later extraction task.

This boundary is deliberately testable. The OpenDental gate receives only its matching source types, the FormBrowse
gate receives its GitExtensions component mappings, and a generic test project receives neither profile nor
OpenDental CSS. Refine and NocoBase emit identical profile files from the same ProjectIR. This makes source-specific
fidelity work additive: a new adapter can improve one control family without silently changing the ordinary WinForms
fallback used by every other project.

## Third-project reuse gate: ShareX

The third visual gate uses ShareX commit `94a740c035164c3c2c1337c4f340aa549df0c4af`, specifically
`ShareX.UploadersLib/Forms/UploadersConfigForm`. It is a large settings surface: 5,066 Designer lines, 2,929
code-behind lines, 511 converted controls, 49 `TabPage`s across five `TabControl`s, 14 group boxes, 26 combo boxes,
113 text inputs, 41 buttons, and 285 event contracts. Thirteen instances of four business `UserControl` types are
resolved from their Designer sources and registered once per type; `TabToTreeView` is a fifth resolved shared type.
Both generated targets contain byte-for-byte equivalent page/control IR, while the generated visual-profile registry
is empty. The page therefore exercises the generic path rather than a ShareX profile.

This gate exposed two reusable parser/runtime defects. First, localized `.resx` values commonly place
`<comment>@Invariant</comment>` after `<value>`; the previous parser discarded those entries and lost captions such as
`Imgur`. The resource parser now accepts trailing metadata inside a data entry. Second, ShareX's `TabToTreeView`
control binds `MainTabControl = tcUploaders` in code-behind. Rendering the five source tab strips directly would produce
49 visible tabs and look nothing like the desktop settings window. The code-behind pass now records a neutral
`RuntimeTabNavigator` relationship. The target runtime hides the consumed source `TabControl`, derives a nested left
tree from its existing pages, honors `TreeViewSize` and `AutoSelectChild`, and renders the selected leaf page without
copying or remapping each page.

The same audit found a real profile leak: ordinary `TreeView` controls were reaching the FormBrowse changed-file
fixture. Generic trees now render only parsed source nodes and remain blank when their contents are populated at
runtime; the Git file-status preview is selected only through the GitExtensions page profile. This is the strongest
current evidence that the work helps another project: ShareX forced changes to neutral parsing and runtime contracts,
not ShareX-specific screenshots or page-name branches.

The gate also exposed that `--context` previously resolved only enum/list domains. A single-file conversion could
therefore compile while silently leaving sibling UserControls external and its referenced image manifest empty; stale
files in an existing output directory could hide that regression. Context now supplies the inheritance graph, shared
Designer-backed controls, localized component resources, and visual asset search while the selected Designer file
remains the only emitted page. This restores FormBrowse's 87 source assets, keeps OpenDental's embedded form icon, and
resolves ShareX's account, export/import, OAuth, and tree-navigation controls without generating unrelated forms.
Both exporters clear their generated asset directory before writing the current manifest, so obsolete files from a
previous conversion can no longer disguise an empty or incomplete asset resolution.

Resolved UserControls retain their own Designer coordinate system instead of sending their internal fields through the
page semantic-layout normalizer. This prevents compact labels from being classified as state overlays and keeps OAuth
buttons, verification fields, and status rows in their original group-box geometry. Localized
`resources.GetString("control.ItemsN")` entries are materialized as actual values (`Anonymous`, `User`) rather than
displaying resource keys. Nonvisual context menus remain hidden as layout elements. When a source button references one
through its `Menu` property, however, the runtime resolves that `ContextMenuStrip` by name inside the current page or
shared-component scope and renders its nested items, separators, checked/disabled state, shortcuts, icons, and original
event contracts. The real ShareX `ExportImportControl` therefore exposes its three Import commands and three Export
commands from the single shared component definition in both targets. There is no renderer branch for `btnImport`,
`btnExport`, ShareX, or FTP; another project using the same WinForms reference pattern follows the same path.

Shared definitions now also preserve thin public-property facades from the UserControl code-behind. The context pass
accepts only unconditional setter flows that can be proven to originate from `value`, including harmless casts,
boolean negation, and a single field alias; method calls and conditional mutations remain contracts. The relationship
is stored once as `ComponentDefinition.propertyBindings`, while instance values remain on each host control. At render
time the shared tree is overlaid without being copied into page IR. On ShareX this maps
`AccountTypeControl.SelectedAccountType` to its internal combo selection, so both real instances display `Anonymous`
instead of an empty list. It also maps `OAuthControl.IsRefreshable` to the internal Refresh button visibility, so the
Dropbox instance honors its source `false` value without creating a Dropbox-specific component or profile rule.

Component construction state now follows a separate, deliberately bounded evaluator. It starts only at a resolved
UserControl's parameterless constructor, follows same-class property setters and no-argument method calls, and selects
an `if` or `switch` branch only when its condition is constant from C# field/auto-property defaults or an earlier
constructor assignment. Right-hand sides are limited to literals, unique neutral `Resources.resx` strings, enum
members, simple comparisons, and `Color.FromArgb`; conflicting resource keys, unknown method results, and unresolved
branches are ignored. Each result is retained as `ComponentDefinition.initializationDefaults` with its source file,
line, method, and proven condition.

On the real ShareX gate, `OAuthControl` assigns `Status = LoginRequired` in its constructor, so the selected switch
case now supplies `Not logged in.` and `rgb(200, 0, 0)` to the status label while both authorization buttons remain
disabled. `OAuthLoopbackControl.Connected` is a default-false auto-property, so its constructor's `UpdateStatus()`
selects the else branch, restoring `Connect...`, `Not logged in.`, and the source red color. The labels begin empty and
have design-time width zero; the fixed renderer now honors WinForms `AutoSize` for that zero-sized axis so the proven
runtime captions are actually visible. No account identity or successful-login branch is fabricated.

Text-entry hints follow the same source-proven path. Direct Designer and localized `.resx` properties named
`PlaceholderText`, `WatermarkText`, or `CueBannerText`, plus reachable code-behind calls to `SetWatermark`,
`SetCueBanner`, and `SetPlaceholderText`, normalize to `VisualAppearance.placeholderText`. A `HandleCreated` watermark
subscription inside a constructor is treated as deterministic UI initialization, while calls inside ordinary deferred
handlers and unresolved control-flow branches remain contracts. The unique-neutral-resource catalog is shared by form
and UserControl initialization rather than copied into either target. On ShareX this restores the Backblaze B2 bucket
hint on the page and `Paste verification code here` once inside the shared `OAuthControl` definition; Refine and
NocoBase render the same IR field with no ShareX control-name rule.

ToolTip extender properties now follow an equivalent source-proven path. The Designer parser recognizes
`SetToolTip(control, text)` as a relationship even though WinForms emits it on a nonvisual provider rather than on the
control itself; direct `ToolTipText`, literals, localized `.resx` values, and reachable code-behind resource strings
normalize to `VisualAppearance.toolTipText`. Computed permission, query, or entity messages stay as unresolved value
contracts. The shared runtime uses a portal so clipped panels cannot cut off the native yellow multiline popup, waits
the WinForms default 500 ms, and keeps the behavior identical in both targets. On ShareX this restores the full
three-line Amazon S3 custom-domain explanation and the PrivateBin credential hint. OpenDental's three selected-page
ToolTips remain contracts because their text depends on authorization and referral-query results; no plausible-looking
message is fabricated.

Localized `ListView` column `Text` and `Width` values are also recovered. ShareX's initial Imgur page therefore shows
the source `ID`, `Title`, and `Description` header geometry over a genuinely empty white list surface; it no longer
injects a migration-status sentence into a data control whose runtime records are not available yet.

Shared definitions now retain the UserControl's own `$this.Size` as their local coordinate space. The runtime applies
WinForms `Anchor` and `Dock` edge margins within that space instead of freezing every child at the definition's design
width. This matters on the real gate: `OAuthLoopbackControl` is designed at 299 pixels but instantiated at 448 pixels;
its `Top, Left, Right` status row and Connect button now stretch to the host exactly as WinForms does. The same edge
logic is used for fixed forms and selected tab pages. Form-level `BackColor`, `ForeColor`, and `Font` are also neutral
IR properties, so ShareX's `SystemColors.Window` client and tab surfaces render white rather than inheriting the generic
control-gray canvas.

Localized appearance now follows the same neutral path as direct Designer assignments. `.resx` values for colors,
border style, content alignment, padding/margin, right-to-left direction, read-only/multiline/password state, text
limits, scrolling/drop-down modes, and minimum/maximum sizes are merged only when the Designer did not already set the
property directly. The target runtime consumes the portable visual subset rather than selecting a ShareX theme. On the
real gate this makes all four `OAuthControl` command buttons inherit their source `MiddleLeft` alignment and three-pixel
left padding, while `txtPlikComment` and `txtEmailDefaultBody` enter the ordinary multiline text-area renderer. The same
pass also finds localized appearance values in FormBrowse and OpenDental, providing a cross-project guard against
sample-specific mapping.

The standard-control runtime now consumes several appearance fields that were previously only reported. A WinForms
`ComboBox` keeps its editable default unless the source declares `DropDownList`; this separates OpenDental's 19 default
combos from ShareX's 24 list-only combos without a project branch. `TabControl.Multiline` enables wrapped header rows,
so ShareX's nested file-uploader tabs no longer have to compress into one clipped row. Numeric input alignment reaches
the actual input element, multiline text honors its scrollbar mode, and button images can follow `ImageAlign`. These
rules live in the shared runtime and are emitted identically for both targets.

The three-gate fallback audit also found one remaining standard control in a real page: ShareX's Shared Folder tab uses
a 600×480 `PropertyGrid`. It now renders the native toolbar/body/help geometry and respects `ToolbarVisible` and
`HelpVisible` instead of showing a striped migration placeholder. A generic code-behind pass traces
`SelectedObject = list.Items[...]` through typed variables, casts, `foreach`, and `Items.Add` calls. The wider context
then resolves the selected class without executing it and extracts only provable `Category`, `DisplayName`,
`Description`, `Browsable`, `PasswordPropertyText`, `ReadOnly`, `Editor`, `DefaultValue`, property-initializer, and
parameterless-constructor metadata.

On ShareX this resolves `LocalhostAccount` into 12 visible source fields: `Browsable(false)` excludes `LocalUri`, the
password field is masked, directory selection retains an editor button, booleans use checkboxes, computed previews are
read-only, and constructor defaults such as `Name = "New account"`, `Port = 80`, and `RemoteProtocol = file` populate
the value column. Selecting a row shows its actual source description in the native help pane. No saved account record
or computed path is fabricated; live instance values remain a later backend/data-binding contract. Four ShareX
`LinkLabel` instances use link color, underline, focus, disabled, and pointer treatment rather than ordinary label
styling. `PropertyGrid` remains marked degraded for missing live values, but no longer resembles converter output.

The same source-only rule now restores ten runtime-populated ShareX combo boxes without adding a ShareX profile. FTP
protocol and encryption, Imgur thumbnail type, Pastebin privacy/expiration, PrivateBin expiration/format, Box access,
Amazon S3 storage class, and YouTube privacy contribute 45 proven enum options. Default resource strings replace raw
localized member names where available—for example `Small square`, `Private (members only)`, `5 Minutes`, and
`Plain Text`—while description-backed options retain values such as `https://` and `Amazon S3 Intelligent-Tiering`.
Account lists and other database/network-derived collections remain empty contracts rather than fabricated preview
records.

Untyped `Items.AddRange(...)` calls are also retained as contracts. For static `Class.Member` sources, the context pass
can materialize literal string arrays directly. Object collections are accepted only when static analysis can connect
the element's `ToString()` return property to a constructor parameter and each initializer supplies a literal at that
position. This restores all 26 `AmazonS3.Endpoints` display names and both `Lambda.UploadURLs` values in ShareX, raising
the page to 12 resolved runtime-list controls and 73 proven options. `Config.PhotobucketAccountInfo.AlbumList` remains
empty because it is account data, and `Pastebin.GetSyntaxList()` remains an explicit method contract because reproducing
its algorithm would require a broader code evaluator. The distinction is source-semantic, not a control-name allowlist.

Code-behind initialization state now follows the same boundary. A local method graph starts at the form constructor and
wired `Load`/`Shown` handlers, then retains assignments to `Text`, `Checked`, `Enabled`, `ReadOnly`, `PlaceholderText`,
`Value`, `SelectedIndex`, and `SelectedItem`, as well as recognized watermark helper calls. Literal assignments are
immediately provable. Configuration-like model types can
also resolve property-initializer and parameterless-constructor defaults from project context, including nested objects
that are explicitly instantiated. Ordinary entities such as `Patient` or `Order` remain contracts, and a property with
competing or unresolved initialization assignments is not given a guessed value.

The ShareX gate now records 196 initialization contracts on 179 controls; 141 source assignments have proven defaults
after excluding 12 conditional/deferred assignments from preview materialization.
This selects `Medium thumbnail` on Imgur, checks its direct-link and GIFV options, restores paths such as
`ShareX/%y/%mo`, fills default mail text such as `smtp.gmail.com` and `Sending email from ShareX`, and selects the
source YouTube privacy default. Each resolved value remains attached to its original expression and source line for the
later C# backend migration. No saved credentials, accounts, albums, or user records are synthesized.

Simple event-driven presentation state is now live rather than merely listed as a C# contract. The code-behind pass
accepts a binding only when a wired change handler directly assigns `Enabled`, `ReadOnly`, or `Visible` from the same
trigger control's boolean state, with optional negation. Calls, `Config`/entity reads, computed expressions, and reads
from unrelated controls are rejected. ShareX proves seven such bindings: OneDrive and Seafile reveal dependent share
options, Backblaze B2 toggles its custom-URL editor, and Plik toggles credential/comment editability. The target runtime
derives both initial and clicked state from those neutral bindings, and scopes interaction state by component instance
so repeated UserControls cannot affect one another. Refine and NocoBase consume the same relationship list; no service,
checkbox, or page name appears in the parser or renderer.

ShareX also populates the left navigation ImageList at runtime, so Designer-only conversion previously produced 49
correct labels but no service icons. The context pass now pairs a service class only when that same class proves both a
Resources-backed `ServiceIcon`/`ServiceImage` and a method returning a specific configuration `TabPage`. It resolves 45
leaf pages this way. The first Resources item added to an assigned ImageList is preserved as the default node icon,
covering the four top-level uploader categories exactly as the source TreeView does. Asset lookup treats hyphens and
underscores as equivalent only after exact matching, allowing keys such as `folder_network` to resolve the source file
`folder-network.png`. The gate now emits 46 real image assets and every one of the 49 navigation nodes has an effective,
resolved icon; no TabPage-name table or ShareX profile was introduced.

The ShareX Refine output passes TypeScript plus a Vite production build, and its NocoBase client-v2 output passes
TypeScript. Both preview servers return HTTP 200. Manual screenshot comparison is still required before claiming
pixel-level parity for this third gate.

The OpenDental Patient batch now distinguishes three independent shared-component states: a Designer-backed
definition, an explicit type-level target adapter, and an uncovered fallback. `GridOD` is adapted once for eight host
instances and consumes per-instance neutral columns recovered from code-behind `GridColumn` construction; `MenuOD` is
adapted once for two instances and consumes statically proven top-level menu items. No form or control instance name is
embedded in the shared runtime. This raises covered shared-component instances from 11/23 definition-only to 21/23
definition-or-adapter, while keeping `MonthCalendarOD` and `WarningIntegrity` visible as the two remaining review items.

### Frontend Acceptance Gate v0.4

Refine is now the canonical visual-review surface for the 12-page OpenDental Patient batch. This is a deliberately
reversible platform decision: NocoBase still receives byte-equivalent `project.ir.json`, target manifest, visual assets,
profiles, and shared migration runtime, and must continue to compile, but it is not a second manual-review queue.

The target manifest expands every code-behind visibility group into a stable Cartesian state matrix. The current batch
therefore requires 27 review records: one default state for 11 pages and 16 source-state combinations for
`FormPatientEdit`. The Refine `/acceptance` dashboard shows missing and blocked evidence, opens the next missing state,
and declares the C# vertical slice ready only after all pages have complete evidence and none is blocked. Inside
`wfInspect=1`, the reviewer records pass, accepted non-blocking difference, or blocked; a clean pass is impossible while
the geometry audit reports an issue, and non-pass decisions require notes. Multi-state pages can save and advance without
returning to the dashboard after every combination.

Evidence is intentionally independent of a backend at this stage. Records persist in browser local storage and include
page/state identity, viewport, timestamp, geometry issues grouped by type, decision, and notes. The dashboard exports a
single JSON artifact for later audit or repository storage and can import that artifact to resume in another browser or
after regeneration. The `acceptance-gate` CLI validates the artifact against the generated target manifest, merges the
result with the batch audit's static checks and recommended vertical-slice page, and emits JSON/Markdown readiness
reports. It rejects duplicate states, incomplete geometry evidence, undocumented non-pass
decisions, and contradictory clean-pass claims. Missing, blocked, or invalid evidence exits with code 2. Because browser
automation is outside this gate, the tool reports unreviewed states explicitly rather than manufacturing a visual-pass
result.

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
