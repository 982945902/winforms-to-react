# POS retail cold-start portability gate

This gate tests a previously unseen business application without adding a
project visual profile or per-form renderer branch.

## Pinned source

- Repository: `bilalmehrban/Point-of-Sale-Desktop-Csharp-`
- Revision: `ddf9e7b812abfc0d2b30ab860a8c8854139203b9`
- License: MIT
- Stack: .NET Framework WinForms, SQL Server, ADO.NET, and Dapper
- Batch: 12 inventory, sales, supplier, user, reporting, login, and navigation
  forms selected from 13 UI forms

The sample contains 10 `DataGridView` instances, 55 text boxes, 39 buttons,
SQL-backed UI/BLL/DAL flows, printing, validation, and form navigation. It has
no reusable `UserControl` definitions, so this gate measures standard business
form portability rather than shared custom-control reuse.

## Cold-start result and boundary improvement

The existing parser and generator produced:

| Measure | Result |
| --- | ---: |
| Pages | 12 |
| Controls | 234 |
| Structurally previewable controls | 234 (100%) |
| Event triggers inventoried | 107 |
| Suggested server operations before cross-type resolution | 31 |
| Suggested server operations after cross-type resolution | 51 |
| Suggested client operations before cross-type resolution | 43 |
| Suggested client operations after bounded lifecycle classification | 38 |
| Source review before bounded lifecycle classification | 15 |
| Source review after bounded lifecycle classification | 0 |
| Empty-handler omit proposals | 18 |
| Exact generic client promotions | 0 |

Both Refine and NocoBase were generated without a POS-specific profile. Their
Project IR, ActionContract candidates, drafts, promotions, visual profile, and
shared runtime were byte-identical. After the generic defect below was fixed,
the Refine target passed TypeScript and a Vite production build, and the
NocoBase client-v2 plugin passed TypeScript.

## Generic defect found and fixed

A new project with no ActionContract sidecars omits `actionContracts` from the
inferred JSON import type. The shared runtime accessed the optional property
directly, so TypeScript rejected an otherwise valid frontend. The runtime now
reads that optional IR extension through a guarded structural cast and treats a
missing property as an empty plan list. No POS token or special case was added.

## Cross-type boundary-classification gap found and fixed

The source uses field instances such as `dal.select()`, `dal.Search()`, and
`dal.delete()` whose declared types own SQL Server operations in separate DAL
files. The initial bounded analysis recorded those call symbols but did not
resolve the receiver field type and follow the method owner across files.

The generic fix now indexes type declarations from project context, records
field receiver types from the selected partial class, and expands exactly one
cross-type method hop. It has guards for more than eight external calls and
more than four matching overloads, and it does not recursively absorb the
target type's call graph. ADO.NET connection, command, and adapter construction
are explicit data-boundary evidence.

On this unchanged source batch, 20 handlers moved from client to server. The
corrected set covers category, invoice, product, stock, supplier, and user
loads/searches; date-filtered invoice queries; return mutations; and sale
register search. No variable called `dal` or method called `select` is treated
as data by name alone: the target method body must provide database evidence.

The original 15 review items were then resolved with narrow source shapes:
`Show`, `Hide`, `Close`, and `Application.Exit` are window navigation;
`DGVPrinter.PrintDataGridView` is client print UI; and a FormClosed/FormClosing
handler is local UI state only when it makes no calls and assigns bare fields
such as `_instance = null`. Unknown cleanup calls remain review items, while
repository or service calls retain their server boundary. On this batch the
final disposition is 51 server, 38 client, 18 confirmed-empty omit proposals,
and zero review items.

The navigation rule is receiver-sensitive. A bare form `Close()` or an
explicit window/control receiver remains navigation, while `conn.Close()` and
`MessageBox.Show()` no longer create false navigation evidence. The 12-page
disposition remains 51 server, 38 client, 18 omit, and zero review items after
that correction.

## Executable category read/search slice

The follow-up slice selects `Catagories` as a deliberately small second-project
C# proof. Its target-neutral ActionContract maps two of the page's nine events:

- `Catagories_Load` -> `GET /api/pos/categories`
- `txtsearch_TextChanged` -> `POST /api/pos/categories/search`

All nine events are now classified and the page has no static audit defects;
the other seven remain explicit migration work rather than being silently
stubbed. The .NET 10 API has deterministic fixtures for macOS and a separately
compiled `Microsoft.Data.SqlClient` repository plus `/ready` schema probe for
real SQL Server.

This slice found two source defects that a visual-only migration would miss.
The legacy search concatenates user text into SQL, and it references a
`company` column that does not exist in `dbo.tbl_catagories`. The migrated
adapter uses parameters, escapes LIKE wildcard characters, and queries only
the five schema-backed fields. Fixture readiness returns `realAdapter: false`;
the current verification does not claim a live SQL Server connection.

The source grid has no Designer columns because it relies on
`AutoGenerateColumns`. The generic runtime now infers a stable header/field set
from the first response row. Repeated TextChanged requests also cancel the
previous request for the same operation so an older response cannot overwrite
newer search results.

See [`vertical-slices/pos-categories-read`](../vertical-slices/pos-categories-read/README.md)
for build, API, and generated-contract verification commands.

## Reproduce

```bash
git clone https://github.com/bilalmehrban/Point-of-Sale-Desktop-Csharp-.git /tmp/wf2-pos
git -C /tmp/wf2-pos checkout ddf9e7b812abfc0d2b30ab860a8c8854139203b9
npm run build
node dist/cli.js batch-audit /tmp/wf2-pos \
  --batch migration-batches/pos-retail-cold-start.json \
  --context /tmp/wf2-pos --out /tmp/wf2-pos-audit
node dist/cli.js convert /tmp/wf2-pos \
  --batch migration-batches/pos-retail-cold-start.json \
  --context /tmp/wf2-pos --target refine --out /tmp/wf2-pos-refine
node dist/cli.js convert /tmp/wf2-pos \
  --batch migration-batches/pos-retail-cold-start.json \
  --context /tmp/wf2-pos --target nocobase --out /tmp/wf2-pos-nocobase
```
