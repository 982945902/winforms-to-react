using Microsoft.AspNetCore.Authentication.JwtBearer;
using OpenDental.EhrPatientExport;
using OpenDental.EhrPatientExport.Api;

var builder = WebApplication.CreateBuilder(args);
var configuredOrigins = builder.Configuration.GetSection("PatientExport:AllowedOrigins").Get<string[]>();
if (!builder.Environment.IsDevelopment() && (configuredOrigins is null || configuredOrigins.Length == 0)) {
  throw new InvalidOperationException("PatientExport:AllowedOrigins must declare explicit frontend origins outside Development.");
}
var allowedOrigins = configuredOrigins ?? ["http://127.0.0.1:4184", "http://localhost:4184"];
var artifactLifetimeMinutes = builder.Configuration.GetValue<int?>("PatientExport:ArtifactLifetimeMinutes") ?? 15;
if (artifactLifetimeMinutes is <= 0 or > 1440) {
  throw new InvalidOperationException("PatientExport:ArtifactLifetimeMinutes must be between 1 and 1440.");
}
builder.Services.AddCors(options => options.AddDefaultPolicy(policy => policy.WithOrigins(allowedOrigins).AllowAnyHeader().AllowAnyMethod()));
builder.Services.AddOpenApi();
builder.Services.AddSingleton<IPatientExportAccessPolicy, EnvironmentPatientExportAccessPolicy>();
builder.Services.AddSingleton<IPhiAuditSink, LoggerPhiAuditSink>();
builder.Services.AddSingleton<IExportArtifactStore>(_ => new FileSystemExportArtifactStore(
  builder.Configuration["PatientExport:ArtifactRoot"] ?? Path.Combine(Path.GetTempPath(), "wf2-ehr-patient-export"),
  TimeSpan.FromMinutes(artifactLifetimeMinutes)));

if (!builder.Environment.IsDevelopment()) {
  var authority = builder.Configuration["Authentication:Authority"];
  var audience = builder.Configuration["Authentication:Audience"];
  if (!Uri.TryCreate(authority, UriKind.Absolute, out var authorityUri) || authorityUri.Scheme != Uri.UriSchemeHttps
    || string.IsNullOrWhiteSpace(audience)) {
    throw new InvalidOperationException("Authentication:Authority (HTTPS) and Authentication:Audience are required outside Development.");
  }
  builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme).AddJwtBearer(options => {
    options.Authority = authority;
    options.Audience = audience;
    options.MapInboundClaims = false;
  });
  builder.Services.AddAuthorization();
}

var connectionString = builder.Configuration.GetConnectionString("OpenDental");
if (!string.IsNullOrWhiteSpace(connectionString)) {
  builder.Services.AddSingleton<IPatientExportDataSource>(new SqlServerPatientExportDataSource(connectionString));
} else if (builder.Environment.IsDevelopment()) {
  builder.Services.AddSingleton<IPatientExportDataSource, FixturePatientExportDataSource>();
} else {
  throw new InvalidOperationException("ConnectionStrings:OpenDental is required outside Development.");
}

var legacyCcdBaseUrl = builder.Configuration["LegacyCcd:BaseUrl"];
if (!string.IsNullOrWhiteSpace(legacyCcdBaseUrl)) {
  if (!Uri.TryCreate(legacyCcdBaseUrl, UriKind.Absolute, out var legacyCcdUri)
    || !builder.Environment.IsDevelopment() && legacyCcdUri.Scheme != Uri.UriSchemeHttps) {
    throw new InvalidOperationException("LegacyCcd:BaseUrl must be an absolute HTTPS URL outside Development.");
  }
  var legacyTimeoutSeconds = builder.Configuration.GetValue<int?>("LegacyCcd:TimeoutSeconds") ?? 15;
  if (legacyTimeoutSeconds is <= 0 or > 60) throw new InvalidOperationException("LegacyCcd:TimeoutSeconds must be between 1 and 60.");
  builder.Services.AddHttpClient<HttpLegacyCcdGateway>(client => {
    client.BaseAddress = legacyCcdUri;
    client.Timeout = TimeSpan.FromSeconds(legacyTimeoutSeconds);
  });
  builder.Services.AddScoped<IPatientCcdGateway>(provider => provider.GetRequiredService<HttpLegacyCcdGateway>());
} else if (builder.Environment.IsDevelopment()) {
  builder.Services.AddSingleton<IPatientCcdGateway, FixturePatientCcdGateway>();
} else {
  throw new InvalidOperationException("LegacyCcd:BaseUrl is required outside Development until the CCD domain has been ported.");
}
builder.Services.AddScoped<PatientExportService>();

var app = builder.Build();
app.UseCors();
if (!app.Environment.IsDevelopment()) {
  app.UseAuthentication();
  app.UseAuthorization();
}
app.MapOpenApi();

app.MapGet("/health", () => Results.Ok(new { status = "ok", slice = "FormEhrPatientExport" }));

app.MapGet("/ready", async (
  IPatientExportDataSource dataSource,
  IPatientCcdGateway ccdGateway,
  CancellationToken cancellationToken) => {
  var dataSourceTask = dataSource.ProbeAsync(cancellationToken);
  var ccdGatewayTask = ccdGateway.ProbeAsync(cancellationToken);
  await Task.WhenAll(dataSourceTask, ccdGatewayTask);
  var dataSourceResult = await dataSourceTask;
  var ccdGatewayResult = await ccdGatewayTask;
  var ready = dataSourceResult.Ready && ccdGatewayResult.Ready;
  var realAdapters = ready && dataSourceResult.Adapter == "sql-server" && ccdGatewayResult.Adapter == "legacy-http";
  var report = new AdapterReadinessReport(DateTimeOffset.UtcNow, ready, realAdapters, dataSourceResult, ccdGatewayResult);
  return Results.Json(report, statusCode: ready ? StatusCodes.Status200OK : StatusCodes.Status503ServiceUnavailable);
});

app.MapGet("/api/ehr-patient-export/options", async (
  HttpContext context,
  IPatientExportAccessPolicy access,
  IPatientExportDataSource dataSource,
  CancellationToken cancellationToken) => {
  var actor = await access.GetActorAsync(context, cancellationToken);
  return actor is null ? Results.Unauthorized() : Results.Ok(await dataSource.GetOptionsAsync(cancellationToken));
});

app.MapPost("/api/ehr-patient-export/search", async (
  PatientSearchRequest request,
  HttpContext context,
  IPatientExportAccessPolicy access,
  IPatientExportDataSource dataSource,
  CancellationToken cancellationToken) => {
  var actor = await access.GetActorAsync(context, cancellationToken);
  if (actor is null) return Results.Unauthorized();
  if (request.PatientNumber < 0) return Results.BadRequest(new { code = "invalid-patient-number", message = "Patient number must be positive." });
  var items = await dataSource.SearchAsync(request, cancellationToken);
  return Results.Ok(new PatientSearchResponse(items, $"{items.Count} patient(s) found."));
});

app.MapPost("/api/ehr-patient-export/exports", async (
  PatientExportRequest request,
  HttpContext context,
  IPatientExportAccessPolicy access,
  PatientExportService service,
  CancellationToken cancellationToken) => {
  var actor = await access.GetActorAsync(context, cancellationToken);
  if (actor is null) return Results.Unauthorized();
  try {
    var outcome = await service.ExportAsync(request, actor, cancellationToken);
    return Results.Ok(new {
      artifactId = outcome.Artifact.ArtifactId,
      downloadUrl = $"/api/ehr-patient-export/artifacts/{outcome.Artifact.ArtifactId:D}",
      outcome.ExportedCount,
      outcome.Skipped,
      outcome.Warnings,
      outcome.Message,
    });
  } catch (ExportWarningsRequireConfirmationException error) {
    return Results.Conflict(new { code = "warnings-require-confirmation", warnings = error.Warnings, retry = new { acceptWarnings = true } });
  } catch (ExportValidationException error) {
    return Results.UnprocessableEntity(new { code = error.Code, errors = error.Errors });
  }
});

app.MapGet("/api/ehr-patient-export/artifacts/{artifactId:guid}", async (
  Guid artifactId,
  HttpContext context,
  IPatientExportAccessPolicy access,
  IExportArtifactStore artifacts,
  IPhiAuditSink audit,
  CancellationToken cancellationToken) => {
  var actor = await access.GetActorAsync(context, cancellationToken);
  if (actor is null) return Results.Unauthorized();
  var download = await artifacts.OpenAsync(artifactId, cancellationToken);
  if (download is null) {
    await audit.WriteAsync(new PhiAuditEvent(actor, "ehr-patient-export-download", 0, 0, 0, artifactId, false, "artifact-not-found-or-expired"), cancellationToken);
    return Results.NotFound();
  }
  await audit.WriteAsync(new PhiAuditEvent(actor, "ehr-patient-export-download", 0, 0, 0, artifactId, true, "artifact-opened"), cancellationToken);
  return Results.Stream(download.Content, download.Descriptor.MediaType, download.Descriptor.FileName, enableRangeProcessing: true);
});

app.Run();
