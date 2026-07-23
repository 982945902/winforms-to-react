namespace OpenDental.EhrPatientExport;

public sealed record OptionItem(long Id, string Label);

public sealed record PatientExportOptions(
  IReadOnlyList<OptionItem> Providers,
  bool ClinicsEnabled,
  IReadOnlyList<OptionItem> Clinics,
  bool SitesEnabled,
  IReadOnlyList<OptionItem> Sites);

public sealed record PatientSearchRequest(
  long? PatientNumber = null,
  string FirstName = "",
  string LastName = "",
  long? ProviderId = null,
  long? ClinicId = null,
  long? SiteId = null);

public sealed record PatientSearchItem(
  long PatientNumber,
  string FirstName,
  string LastName,
  string Provider,
  string Clinic,
  string Site) {
  public string PatientName => string.IsNullOrWhiteSpace(LastName) ? FirstName : $"{LastName}, {FirstName}";
}

public sealed record PatientSearchResponse(IReadOnlyList<PatientSearchItem> Items, string Status);

public sealed record DependencyReadiness(
  string Dependency,
  string Adapter,
  bool Ready,
  string Code,
  IReadOnlyList<string> MissingRequirements);

public sealed record AdapterReadinessReport(
  DateTimeOffset CheckedAt,
  bool Ready,
  bool RealAdapters,
  DependencyReadiness DataSource,
  DependencyReadiness CcdGateway);

public sealed record PatientExportRequest(IReadOnlyList<long>? PatientNumbers, bool AcceptWarnings = false);

public sealed record PatientValidationResult(long PatientNumber, string DisplayName, IReadOnlyList<string> Errors);

public sealed record CcdDocument(
  long PatientNumber,
  string FirstName,
  string LastName,
  string Xml,
  IReadOnlyList<string> Warnings);

public sealed record ExportSkippedPatient(long PatientNumber, string DisplayName, IReadOnlyList<string> Errors);

public sealed record ExportFile(string Name, string Content);

public sealed record ExportArtifactDescriptor(Guid ArtifactId, string FileName, string MediaType, long Length);

public sealed record ExportArtifactDownload(ExportArtifactDescriptor Descriptor, Stream Content) : IAsyncDisposable {
  public ValueTask DisposeAsync() => Content.DisposeAsync();
}

public sealed record PatientExportOutcome(
  ExportArtifactDescriptor Artifact,
  int ExportedCount,
  IReadOnlyList<ExportSkippedPatient> Skipped,
  IReadOnlyList<string> Warnings,
  string Message);

public sealed record PhiAuditEvent(
  string Actor,
  string Action,
  int RequestedPatientCount,
  int ExportedPatientCount,
  int SkippedPatientCount,
  Guid? ArtifactId,
  bool Succeeded,
  string OutcomeCode);

public sealed class ExportValidationException(string code, IReadOnlyList<string> errors)
  : Exception(string.Join(Environment.NewLine, errors)) {
  public string Code { get; } = code;
  public IReadOnlyList<string> Errors { get; } = errors;
}

public sealed class ExportWarningsRequireConfirmationException(IReadOnlyList<string> warnings)
  : Exception("CCD generation produced warnings that require explicit confirmation.") {
  public IReadOnlyList<string> Warnings { get; } = warnings;
}
