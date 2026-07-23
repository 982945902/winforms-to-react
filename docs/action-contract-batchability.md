# ActionContract Batchability v0.8

This milestone tests whether frontend-first migration can scale beyond one
carefully hand-wired form. It deliberately keeps the neutral Project IR and
ActionContract plans independent of Refine and NocoBase.

## Batch pipeline

1. Scan every selected WinForms control/event/handler contract.
2. Classify the code-behind boundary from direct calls, one-hop local-helper
   calls, property reads, assignments, constructed types, and awaited calls,
   then emit every item as an automatic ActionContract candidate.
3. Load all sidecars declared by the batch manifest and validate every page,
   trigger, control, request binding, response binding, and grid column.
4. Overlay exact mappings on the candidate queue. Unmapped items remain in the
   generated report instead of disappearing from the migration scope.
5. Emit the same plans, candidate report, and shared runtime to both targets.

Several controls may bind to one operation through `triggers`. This is intended
for WinForms patterns such as four radio buttons sharing one
`CheckedChanged` handler. `trigger-control` tells the backend which member of
the group fired without copying the rest of the operation definition.

## Current OpenDental proof

The 12-page patient batch currently scans 187 candidate triggers. Six
page-level sidecars map 24 triggers using 18 operation definitions:

| Page | Mapped triggers | Candidates | Operation definitions | Reused mappings |
| --- | ---: | ---: | ---: | ---: |
| FormEhrPatientExport | 4 | 4 | 4 | 0 |
| FormAdvertisingPatientList | 5 | 10 | 5 | 0 |
| FormEhrPatientSmoking | 10 | 17 | 4 | 6 |
| FormPatientEdit | 2 | 107 | 2 | 0 |
| FormEServicesPatientPortal | 1 | 8 | 1 | 0 |
| FormPatientStatusTool | 2 | 6 | 2 | 0 |

The remaining 163 candidates are intentionally unresolved. The number is not a
completion claim; it is the explicit backlog for deciding which behaviors need
server contracts, client effects, navigation, or no migration at all.

`action-skeletons` reduces those 163 triggers to 120 operation drafts. The main
`FormPatientEdit` result is the important reuse proof: 105 unresolved triggers
become 62 operation skeletons. Five shared-handler groups save 43 repeated
mappings, including `textBox_Leave` (27 triggers),
`ComboBox_SelectionChangeCommited` (13), and
`textAnyPhoneNumber_TextChanged` (4).

Run the candidate and audit reports with:

```bash
npm run build
node dist/cli.js action-candidates /path/to/opendental \
  --context /path/to/opendental \
  --batch migration-batches/opendental-patient.json \
  --out /tmp/wf2-action-candidates
node dist/cli.js batch-audit /path/to/opendental \
  --context /path/to/opendental \
  --batch migration-batches/opendental-patient.json \
  --out /tmp/wf2-batch-audit
node dist/cli.js action-skeletons /path/to/opendental \
  --context /path/to/opendental \
  --batch migration-batches/opendental-patient.json \
  --out /tmp/wf2-action-skeletons
node dist/cli.js action-promotions /path/to/opendental \
  --context /path/to/opendental \
  --batch migration-batches/opendental-patient.json \
  --out /tmp/wf2-action-promotions
```

## Boundary classifier v0.5

The classifier keeps evidence provenance (`call`, `transitive-call`,
`property-read`, `assignment`, `construction`, or `await`) instead of returning
only a label. Control ownership is resolved against the exact controls in the
page IR, so `gridMain.SelectedRows` remains UI evidence while repositories,
files, external clients, settings, and constructed dialogs retain their own
boundaries.

Local call expansion is deliberately bounded to one helper hop and stops at
high-fan-out coordinator methods. An earlier experimental full closure made a
single GitExtensions repository-switch handler inherit most of `FormBrowse`;
that produced a smaller review queue but untrustworthy evidence. The bounded
form captures common shapes such as `Click -> DoPull -> UICommands` without
turning lifecycle methods into whole-form call graphs.

Empty and missing handlers are different dispositions. A resolved handler with
no executable evidence becomes an explicit `no-op` / `omit` draft that still
requires confirmation. A missing handler stays `unclassified` / `review`.
Null-conditional calls such as `_dashboard?.RefreshContent()` are parsed as
real calls; they cannot be silently mistaken for empty handlers.

On the same OpenDental batch, the 125 skeletons changed from 82 server, 22
client, and 21 review to:

| Suggested disposition | v0.4 | v0.5 |
| --- | ---: | ---: |
| Server | 82 | 88 |
| Client | 22 | 33 |
| Review | 21 | 3 |
| Omit after source confirmation | 0 | 1 |

The one omit candidate is the verified empty `FormPatientMerge_Load`. The
three remaining reviews are preserved because their source does not establish
a safe boundary.

## Cross-project check

The same generator was run against GitExtensions `FormBrowse` at pinned commit
`0625c0744c41854a29200df24a5e5f2e351ee657`. Its 83 triggers become 80
operation skeletons, with three shared-handler groups reused. This confirms the
grouping mechanism is not OpenDental-specific.

Before v0.5, 61 of the 80 FormBrowse skeletons contained only unclassified
boundary evidence. With the bounded evidence classifier, the same source now
produces 48 server, 30 client/navigation, and 2 review skeletons. Neither of
the remaining two is omitted: both use the runtime-only `_dashboard` field,
which is not proven to be a page control by the selected Designer/context.
This is the intended conservative result.

## Cross-type receiver boundary v0.8

A second cold-start project exposed the common layered WinForms shape
`handler -> field.method() -> SQL`. Recording `dal.select()` alone is not enough
to decide its browser/server ownership, while classifying variables named
`dal` or methods named `select` would be an unsafe project-specific heuristic.

The context index now records project type declarations independently of file
names. Code-behind parsing records class-level field types, excluding local
variables. For a called field receiver, the scanner resolves the declared type
and imports direct evidence from one matching method body. Expansion stops at
that method: it does not recursively follow the external type's helper graph.
Handlers with more than eight distinct external calls, or calls with more than
four matching overloads, remain conservative rather than absorbing a broad
call graph.

ADO.NET connection, command, and adapter constructions are data-boundary
evidence. On the pinned 12-page POS retail gate this changes 20 candidates from
client to server, moving the totals from 31 server / 43 client to 51 server /
23 client. Refine and NocoBase still emit byte-identical neutral IR, candidate,
draft, promotion, profile, and shared-runtime artifacts, and both generated
targets compile.

Skeleton generation now fails when the selected type's base chain cannot reach
`System.Windows.Forms.Form`. For sparse source checkouts this produces a clear
request for a complete `--context`, instead of silently emitting a zero-page
success report.

Drafts are intentionally not ActionContract manifests. A reviewer must resolve
the execution boundary, transport/effect, bindings, and verification TODOs,
then copy the `planHeaderTemplate` and reviewed `contractTemplate` entries into
a sidecar accepted by the strict manifest loader.

## Draft promotion and activation v0.7

`action-promotions` turns the draft queue into a target-neutral work package
without claiming that every classified boundary is executable. Every operation
receives one disposition:

- `ready-client`: the source proves one portable generic effect.
- `client-stub`: browser ownership is known, but the complete behavior or a
  selected target route is not representable yet.
- `server-stub`: the backend boundary and deterministic endpoint placeholder
  are known, while transport ownership and bindings still need review.
- `review`: no safe boundary was proven.
- `omit`: a resolved empty handler, still requiring source confirmation.

Promotion bundles use `kind: "ActionContractPromotionBundle"` and
`status: "proposal"`; the strict manifest loader rejects them. Individual
`ready-client` operation templates are valid schema fragments and can be merged
into the page's reviewed sidecar.

The portable runtime effect set is deliberately narrow: `select-all`,
`clear-all`, `set-value`, `transform-value`, `copy-value`, and `focus`. Input,
combo, and checkbox events invoke mapped operations only when `wfActions=1`.
This keeps the visual preview backend-independent by default.

Before activation, the OpenDental patient batch produced:

| Promotion disposition | Operations |
| --- | ---: |
| Exact ready-client | 5 |
| Client stub | 28 |
| Server stub | 88 |
| Review | 3 |
| Omit after confirmation | 1 |

The five exact client effects are: clear deceased date, clear the selected ZIP,
copy the patient portal URL, select all status-tool rows, and deselect all
status-tool rows. Conditional capitalization handlers and
`butClearSelected_Click` remain client stubs. The former uppercases only a
prefix under source conditions; the latter clears a marker cell rather than
row selection. Treating either as a generic effect would be a semantic bug.

v0.7 promotes those five source-proven effects into three reviewed page-level
sidecars. The regenerated queue now contains 120 unresolved operations with
zero `ready-client` items: 28 client stubs, 88 server stubs, 3 reviews, and 1
confirmed-empty omit proposal. This exact five-operation reduction is the
activation invariant; proposals disappear only after the matching scanned
triggers are accepted by the strict manifest loader.

The clear-date, clear-ZIP-selection, and clipboard operations are immediately
observable in a frontend-only preview. Status-tool select/deselect operates on
currently loaded grid rows, matching the source `SetAll` calls; the page's
patient search remains a server stub, so its real rows intentionally wait for a
reviewed backend contract rather than invented browser data.

GitExtensions `FormBrowse` produces 48 server stubs, 30 client/navigation
stubs, and 2 reviews, with zero automatic client promotions. Its dialogs are
not selected migration pages, so route generation would be an unsupported
guess. This is an intentional cross-project safety check, not a coverage
failure.

## Local connected-action fixture

The Smoking and Advertising pilots use a standalone deterministic Node fixture
API on `127.0.0.1:5199`. It exists to validate frontend contracts and runtime
batchability; it is not presented as migrated business logic or production
data access.

```bash
npm run dev:action-fixtures
```

Generate and run the Refine target, then append `?wfActions=1` to either pilot
route. Without that query flag, visual preview and acceptance remain fully
backend-independent.

Production migration still requires replacing fixture endpoints with
authorized C# adapters, SQL Server repositories, filesystem services, and
external-service clients as appropriate. The neutral sidecars and frontend
candidate queue do not need to change when that replacement happens.
