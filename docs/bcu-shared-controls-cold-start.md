# BCU shared-control cold-start portability gate

This gate tests the migration concern that motivated the neutral component IR:
a Designer-backed `UserControl` must be defined once even when several forms,
or other shared controls, instantiate it repeatedly.

## Pinned source

- Repository: `BCUninstaller/Bulk-Crap-Uninstaller`
- Revision: `f39663316ad5d593c4d160b0445841ce7eb6a35f`
- License: Apache-2.0
- Stack: C# WinForms desktop application
- Batch: eight production forms from the main application, KlocTools, and NBug
  projects

The selected hosts include the main application window, settings, uninstall
wizard, target selection, process waiting, and two exception-reporting forms.
No BCU-specific visual profile or renderer branch was added.

## Cold-start result

| Measure | Result |
| --- | ---: |
| Pages | 8 |
| Controls | 396 |
| Structurally previewable controls | 396 (100%) |
| Shared component types | 15 |
| Designer-backed definitions | 14 |
| Effective shared instances | 22 |
| Instances covered by one reusable definition | 21 (95.5%) |
| Uncovered owner-drawn instances | 1 |
| Action triggers inventoried | 159 |
| Classified action boundaries | 119 |
| Source-review action boundaries | 40 |
| Duplicate-handler groups | 33 |

The repeated definitions include:

| Component | Effective instances | Definition copies in IR |
| --- | ---: | ---: |
| `ExceptionDetails` | 2 | 1 |
| `FilterEditor` | 2 | 1 |
| `ProcessWaiterControl` | 2 | 1 |
| `PropertiesSidebar` | 2 | 1 |
| `SearchBox` | 2 | 1 |
| `UninstallationSettings` | 2 | 1 |
| `WindowTargeter` | 2 | 1 |

`SearchBox` is the important nested proof. It lives inside the shared
`FilterEditor` definition, which is reached once directly and once through the
`AdvancedFilters -> UninstallListEditor -> FilterEditor` component chain. The
IR contains one `SearchBox` definition but reports two effective runtime
instances.

## Honest owner-draw boundary

`TreeMap` is the only uncovered instance. It derives from `UserControl` and has
a companion Designer file, but that file contains no visual child controls;
its content is painted by `OnPaint`. Marking the empty Designer surface as a
resolved definition would overstate frontend coverage. It remains one explicit
type-level adapter task rather than being copied or silently treated as ready.

## Generic defects found and fixed

Two portability defects were exposed without adding BCU tokens:

1. Visual asset discovery traversed sorted directories in parallel. Duplicate
   basenames such as `centerline.png` could therefore select different source
   files in two conversions. Traversal is now deterministic, and independent
   Refine/NocoBase builds emit byte-identical Project IR.
2. Nested component references were counted once per definition rather than
   once per effective parent instance. Counts now propagate through the
   reachable component graph while definitions remain deduplicated. Recursive
   definition edges are guarded instead of multiplying forever.

After both fixes, Project IR, ActionContract candidates, drafts, promotions,
visual profiles, and shared runtime are byte-identical across the Refine and
NocoBase targets. Refine passes TypeScript and a Vite production build;
NocoBase client-v2 passes TypeScript.

## Reproduce

```bash
git clone https://github.com/BCUninstaller/Bulk-Crap-Uninstaller.git /tmp/wf2-bcu
git -C /tmp/wf2-bcu checkout f39663316ad5d593c4d160b0445841ce7eb6a35f
npm run build
node dist/cli.js batch-audit /tmp/wf2-bcu \
  --batch migration-batches/bcu-shared-controls-cold-start.json \
  --context /tmp/wf2-bcu --out /tmp/wf2-bcu-audit
node dist/cli.js convert /tmp/wf2-bcu \
  --batch migration-batches/bcu-shared-controls-cold-start.json \
  --context /tmp/wf2-bcu --target refine --out /tmp/wf2-bcu-refine
node dist/cli.js convert /tmp/wf2-bcu \
  --batch migration-batches/bcu-shared-controls-cold-start.json \
  --context /tmp/wf2-bcu --target nocobase --out /tmp/wf2-bcu-nocobase
```
