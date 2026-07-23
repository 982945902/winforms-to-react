# POS category read/search vertical slice

This slice migrates two real `Catagories` handlers from the pinned POS source:

- `Catagories_Load` -> `GET /api/pos/categories`
- `txtsearch_TextChanged` -> `POST /api/pos/categories/search`

It deliberately keeps the source spelling (`Catagories`, `catagory`) at the compatibility boundary. The original DAL concatenated the keyword into SQL and searched a `company` column that is absent from `dbo.tbl_catagories`; the new SQL Server repository uses parameters, literal wildcard escaping, and only schema-backed fields.

## Verify on macOS

With .NET 10 installed:

```sh
sh vertical-slices/pos-categories-read/verify.sh
```

Or point the script at an SDK binary:

```sh
WF2_DOTNET=/path/to/dotnet sh vertical-slices/pos-categories-read/verify.sh
```

Development uses deterministic fixtures, so it runs without SQL Server while `/ready` reports `realAdapter: false`. A real-adapter run must disable fixtures and provide `ConnectionStrings__Pos`; `/ready` then opens SQL Server and verifies `dbo.tbl_catagories` before reporting ready.

```sh
ASPNETCORE_ENVIRONMENT=Development ASPNETCORE_URLS=http://127.0.0.1:5197 \
  dotnet run --project vertical-slices/pos-categories-read/src/Pos.Categories.Api
```

Generate the frontend against the pinned source checkout and open the page with `?wfActions=1`:

```sh
npm run build
node dist/cli.js convert /path/to/POS --target refine \
  --batch migration-batches/pos-categories-vertical-slice.json \
  --out /tmp/wf2-pos-categories-refine
```

The WinForms grid relies on `AutoGenerateColumns`, so this slice also verifies the generic action runtime's response-field column inference. No POS-specific column map is embedded in the renderer.

With the fixture API running, verify the generated target's OpenAPI paths, request fields, response bindings, row IDs, and runtime-inferred row fields without browser automation:

```sh
node vertical-slices/pos-categories-read/verify-generated-contract.mjs \
  /tmp/wf2-pos-categories-refine/src/generated/project.ir.json
```
