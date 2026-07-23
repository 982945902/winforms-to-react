using System.IO.Compression;
using System.Net;
using System.Text;
using OpenDental.EhrPatientExport;
using OpenDental.EhrPatientExport.Api;

var root = Path.Combine(Path.GetTempPath(), "wf2-ehr-export-contract-" + Guid.NewGuid().ToString("N"));
try {
  await RunsSuccessfulBatchAndCreatesSafeZip(root);
  await RequiresWarningConfirmation(root);
  await RejectsEmptySelection(root);
  await RejectsExpiredArtifact(root);
  await AcceptsLegacyCapabilityHandshake();
  await RejectsIncompleteLegacyCapabilityHandshake();
  Console.WriteLine("PASS: 6 ActionContract and real-adapter gate scenarios");
} finally {
  Directory.Delete(root, recursive: true);
}

static async Task RunsSuccessfulBatchAndCreatesSafeZip(string root) {
  var audit = new RecordingAuditSink();
  var service = new PatientExportService(new FixtureGateway(), new FileSystemExportArtifactStore(root), audit);
  var outcome = await service.ExportAsync(new PatientExportRequest([101, 102, 101], AcceptWarnings: true), "contract-test", CancellationToken.None);
  Assert(outcome.ExportedCount == 1, "one valid patient should be exported");
  Assert(outcome.Skipped.Count == 1 && outcome.Skipped[0].PatientNumber == 102, "invalid patient should be reported as skipped");
  Assert(outcome.Warnings.Count == 1, "accepted CCD warning should be preserved");
  Assert(audit.Events.Count == 1 && audit.Events[0].Succeeded, "successful export should write one audit event");
  Assert(audit.Events[0].RequestedPatientCount == 2, "audit count must deduplicate patient numbers without logging identifiers");

  await using var download = await new FileSystemExportArtifactStore(root).OpenAsync(outcome.Artifact.ArtifactId, CancellationToken.None)
    ?? throw new InvalidOperationException("artifact should be downloadable");
  using var archive = new ZipArchive(download.Content, ZipArchiveMode.Read, leaveOpen: true);
  var names = archive.Entries.Select(entry => entry.FullName).OrderBy(value => value).ToArray();
  Assert(names.SequenceEqual(["CCD.xsl", "ONeil_Åsa_101.xml"]), "zip should contain one source-compatible patient file and CCD.xsl");
  using var reader = new StreamReader(archive.GetEntry("ONeil_Åsa_101.xml")!.Open());
  Assert((await reader.ReadToEndAsync()).Contains("patientNumber=\"101\"", StringComparison.Ordinal), "zip should preserve generated CCD XML");
}

static async Task RequiresWarningConfirmation(string root) {
  var audit = new RecordingAuditSink();
  var service = new PatientExportService(new FixtureGateway(), new FileSystemExportArtifactStore(root), audit);
  try {
    await service.ExportAsync(new PatientExportRequest([101]), "contract-test", CancellationToken.None);
    throw new InvalidOperationException("warning confirmation should have been required");
  } catch (ExportWarningsRequireConfirmationException error) {
    Assert(error.Warnings.Count == 1, "warning response should preserve the generator warning");
    Assert(audit.Events.Single().OutcomeCode == "warnings-require-confirmation", "warning refusal should be audited without an artifact");
  }
}

static async Task RejectsEmptySelection(string root) {
  var service = new PatientExportService(new FixtureGateway(), new FileSystemExportArtifactStore(root), new RecordingAuditSink());
  try {
    await service.ExportAsync(new PatientExportRequest([]), "contract-test", CancellationToken.None);
    throw new InvalidOperationException("empty selection should have been rejected");
  } catch (ExportValidationException error) {
    Assert(error.Code == "no-patients-selected", "empty selection should have a stable validation code");
  }
}

static async Task RejectsExpiredArtifact(string root) {
  var expiryRoot = Path.Combine(root, "expiry");
  var store = new FileSystemExportArtifactStore(expiryRoot, TimeSpan.FromMinutes(1));
  var artifact = await store.StoreAsync([new ExportFile("CCD.xsl", "<xsl />")], CancellationToken.None);
  var artifactPath = Path.Combine(expiryRoot, artifact.ArtifactId.ToString("N") + ".zip");
  File.SetLastWriteTimeUtc(artifactPath, DateTime.UtcNow.AddMinutes(-2));
  var download = await store.OpenAsync(artifact.ArtifactId, CancellationToken.None);
  Assert(download is null && !File.Exists(artifactPath), "expired PHI artifact should be inaccessible and removed");
}

static async Task AcceptsLegacyCapabilityHandshake() {
  using var client = new HttpClient(new StubHttpHandler(_ => JsonResponse(HttpStatusCode.OK,
    """{"schemaVersion":1,"service":"legacy-ccd","operations":["settings-validation","patient-validation","patient-export","ccd-stylesheet"]}"""))) {
    BaseAddress = new Uri("https://legacy.example/"),
  };
  var result = await new HttpLegacyCcdGateway(client).ProbeAsync(CancellationToken.None);
  Assert(result.Ready && result.Adapter == "legacy-http" && result.Code == "legacy-contract-ready", "complete legacy capability handshake should pass");
}

static async Task RejectsIncompleteLegacyCapabilityHandshake() {
  using var client = new HttpClient(new StubHttpHandler(_ => JsonResponse(HttpStatusCode.OK,
    """{"schemaVersion":1,"service":"legacy-ccd","operations":["settings-validation"]}"""))) {
    BaseAddress = new Uri("https://legacy.example/"),
  };
  var result = await new HttpLegacyCcdGateway(client).ProbeAsync(CancellationToken.None);
  Assert(!result.Ready && result.Code == "legacy-capabilities-missing" && result.MissingRequirements.Contains("patient-export"),
    "incomplete legacy capability handshake should fail with stable missing operations");
}

static HttpResponseMessage JsonResponse(HttpStatusCode statusCode, string json) => new(statusCode) {
  Content = new StringContent(json, Encoding.UTF8, "application/json"),
};

static void Assert(bool condition, string message) {
  if (!condition) throw new InvalidOperationException("FAIL: " + message);
}

sealed class FixtureGateway : IPatientCcdGateway {
  public Task<DependencyReadiness> ProbeAsync(CancellationToken cancellationToken) =>
    Task.FromResult(new DependencyReadiness("ccd", "fixture", true, "fixture-ready", []));

  public Task<IReadOnlyList<string>> ValidateSettingsAsync(CancellationToken cancellationToken) =>
    Task.FromResult<IReadOnlyList<string>>([]);

  public Task<PatientValidationResult> ValidatePatientAsync(long patientNumber, CancellationToken cancellationToken) =>
    Task.FromResult(patientNumber == 102
      ? new PatientValidationResult(patientNumber, "Invalid, Patient", ["Missing patient phone."])
      : new PatientValidationResult(patientNumber, "O'Neil, Åsa", []));

  public Task<CcdDocument> GeneratePatientExportAsync(long patientNumber, CancellationToken cancellationToken) =>
    Task.FromResult(new CcdDocument(patientNumber, "Åsa", "O'Neil", $"<ClinicalDocument patientNumber=\"{patientNumber}\" />", ["Review imported allergy code."]));

  public Task<string> GetStylesheetAsync(CancellationToken cancellationToken) => Task.FromResult("<xsl:stylesheet version=\"1.0\" />");
}

sealed class RecordingAuditSink : IPhiAuditSink {
  public List<PhiAuditEvent> Events { get; } = [];
  public Task WriteAsync(PhiAuditEvent auditEvent, CancellationToken cancellationToken) {
    Events.Add(auditEvent);
    return Task.CompletedTask;
  }
}

sealed class StubHttpHandler(Func<HttpRequestMessage, HttpResponseMessage> responseFactory) : HttpMessageHandler {
  protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken) {
    cancellationToken.ThrowIfCancellationRequested();
    return Task.FromResult(responseFactory(request));
  }
}
