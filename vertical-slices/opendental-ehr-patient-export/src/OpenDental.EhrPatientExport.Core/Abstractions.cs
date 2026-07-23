namespace OpenDental.EhrPatientExport;

public interface IPatientExportDataSource {
  Task<DependencyReadiness> ProbeAsync(CancellationToken cancellationToken);
  Task<PatientExportOptions> GetOptionsAsync(CancellationToken cancellationToken);
  Task<IReadOnlyList<PatientSearchItem>> SearchAsync(PatientSearchRequest request, CancellationToken cancellationToken);
}

public interface IPatientCcdGateway {
  Task<DependencyReadiness> ProbeAsync(CancellationToken cancellationToken);
  Task<IReadOnlyList<string>> ValidateSettingsAsync(CancellationToken cancellationToken);
  Task<PatientValidationResult> ValidatePatientAsync(long patientNumber, CancellationToken cancellationToken);
  Task<CcdDocument> GeneratePatientExportAsync(long patientNumber, CancellationToken cancellationToken);
  Task<string> GetStylesheetAsync(CancellationToken cancellationToken);
}

public interface IExportArtifactStore {
  Task<ExportArtifactDescriptor> StoreAsync(IReadOnlyList<ExportFile> files, CancellationToken cancellationToken);
  Task<ExportArtifactDownload?> OpenAsync(Guid artifactId, CancellationToken cancellationToken);
}

public interface IPhiAuditSink {
  Task WriteAsync(PhiAuditEvent auditEvent, CancellationToken cancellationToken);
}
