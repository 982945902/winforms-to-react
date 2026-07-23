# FormEhrPatientExport vertical slice

This is the first executable ActionContract slice. It keeps the page mapping in the target-neutral ProjectIR and puts database, filesystem, external-service, validation, authorization, and audit work behind an ASP.NET Core API.

## What is real

- The six patient-search filters follow the inspected `Patients.GetExportList` query semantics and use parameterized SQL Server commands.
- Export validation, warning confirmation, invalid-patient skipping, server-owned ZIP creation, artifact download, and count-only PHI audit events are implemented.
- `Development` uses deterministic fixtures so the complete browser-to-ZIP flow can be reviewed on macOS without a Windows or SQL Server dependency.
- Non-development startup requires both `ConnectionStrings:OpenDental` and `LegacyCcd:BaseUrl`; it does not silently fall back to fixtures.
- `/ready` probes the required SQL Server schema and performs a versioned capability handshake with the CCD bridge. Fixture adapters are reported as ready for review but always return `realAdapters: false`.
- Export ZIP files expire after a bounded lifetime (15 minutes by default), and every artifact open/not-found decision is written to the count-only audit sink.

## Deliberate boundary

OpenDental CCD generation is a large domain, not a file-copy exercise. `IPatientCcdGateway` keeps that boundary explicit. The production adapter currently calls a legacy HTTP bridge for settings validation, patient validation, CCD generation, and `CCD.xsl`. Porting that domain can happen behind the same contract later.

The Windows-side bridge must implement [`legacy-ccd-bridge.openapi.yaml`](legacy-ccd-bridge.openapi.yaml). Its capability response must declare contract version `1` and all four required operations before readiness can pass.

The SQL adapter assumes a SQL Server schema compatible with the inspected table and column names. It proves the target access pattern, not that the original OpenDental deployment itself used SQL Server.

## Verify on macOS

Start Docker Desktop or Colima, then run from the repository root:

```sh
npm run check:vertical-slice
```

To run the Development API:

```sh
docker run --rm -p 5198:8080 \
  -e ASPNETCORE_ENVIRONMENT=Development \
  -v "$PWD:/work" \
  -w /work/vertical-slices/opendental-ehr-patient-export \
  mcr.microsoft.com/dotnet/sdk:10.0 \
  dotnet run --project src/OpenDental.EhrPatientExport.Api/OpenDental.EhrPatientExport.Api.csproj --urls http://0.0.0.0:8080
```

OpenAPI is available at `http://127.0.0.1:5198/openapi/v1.json`. The Refine page activates the contract only with `/migration/formehrpatientexport?wfActions=1`; ordinary preview and acceptance URLs remain backend-independent.

## Production adapter gate

Outside Development, startup requires:

- `ConnectionStrings__OpenDental`
- `LegacyCcd__BaseUrl` as HTTPS
- `Authentication__Authority` as HTTPS and `Authentication__Audience` for JWT bearer authentication
- at least one explicit `PatientExport__AllowedOrigins__N` frontend origin

Optional controls are `PatientExport__ArtifactRoot`, `PatientExport__ArtifactLifetimeMinutes` (1–1440), and `LegacyCcd__TimeoutSeconds` (1–60).

After deploying the configured API, run:

```sh
PATIENT_EXPORT_API_URL=https://patient-export.example npm run gate:real-adapters
```

The command exits with code `2` unless both dependency probes are healthy, their adapters are exactly `sql-server` and `legacy-http`, and the public API still exposes all required OpenAPI operations. A Development fixture instance cannot pass this gate.
