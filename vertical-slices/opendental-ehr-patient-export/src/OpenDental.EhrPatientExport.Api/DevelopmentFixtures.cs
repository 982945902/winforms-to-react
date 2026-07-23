using OpenDental.EhrPatientExport;

namespace OpenDental.EhrPatientExport.Api;

public sealed class FixturePatientExportDataSource : IPatientExportDataSource {
  private static readonly PatientSearchItem[] Patients = [
    new(1001, "Ada", "Lovelace", "DR", "Main Clinic", ""),
    new(1002, "Grace", "Hopper", "DR", "Main Clinic", "Public Health"),
    new(1003, "Katherine", "Johnson", "HY", "North Clinic", ""),
  ];

  public Task<DependencyReadiness> ProbeAsync(CancellationToken cancellationToken) {
    cancellationToken.ThrowIfCancellationRequested();
    return Task.FromResult(new DependencyReadiness("patient-data", "fixture", true, "fixture-ready", []));
  }

  public Task<PatientExportOptions> GetOptionsAsync(CancellationToken cancellationToken) => Task.FromResult(new PatientExportOptions(
    [new(0, "All"), new(1, "DR - Doctor")],
    true,
    [new(0, "All"), new(1, "Main"), new(2, "North")],
    true,
    [new(0, "All"), new(1, "Public Health")]));

  public Task<IReadOnlyList<PatientSearchItem>> SearchAsync(PatientSearchRequest request, CancellationToken cancellationToken) {
    cancellationToken.ThrowIfCancellationRequested();
    var result = Patients.Where(patient =>
      (request.PatientNumber is null or <= 0 || patient.PatientNumber.ToString().Contains(request.PatientNumber.Value.ToString(), StringComparison.Ordinal))
      && (string.IsNullOrWhiteSpace(request.FirstName) || patient.FirstName.Contains(request.FirstName, StringComparison.OrdinalIgnoreCase))
      && (string.IsNullOrWhiteSpace(request.LastName) || patient.LastName.Contains(request.LastName, StringComparison.OrdinalIgnoreCase))).ToArray();
    return Task.FromResult<IReadOnlyList<PatientSearchItem>>(result);
  }
}

public sealed class FixturePatientCcdGateway : IPatientCcdGateway {
  public Task<DependencyReadiness> ProbeAsync(CancellationToken cancellationToken) {
    cancellationToken.ThrowIfCancellationRequested();
    return Task.FromResult(new DependencyReadiness("ccd", "fixture", true, "fixture-ready", []));
  }

  public Task<IReadOnlyList<string>> ValidateSettingsAsync(CancellationToken cancellationToken) => Task.FromResult<IReadOnlyList<string>>([]);

  public Task<PatientValidationResult> ValidatePatientAsync(long patientNumber, CancellationToken cancellationToken) => Task.FromResult(
    patientNumber == 1003
      ? new PatientValidationResult(patientNumber, "Johnson, Katherine", ["Missing patient phone. Must have home, wireless, or work phone."])
      : new PatientValidationResult(patientNumber, patientNumber == 1001 ? "Lovelace, Ada" : "Hopper, Grace", []));

  public Task<CcdDocument> GeneratePatientExportAsync(long patientNumber, CancellationToken cancellationToken) {
    var firstName = patientNumber == 1001 ? "Ada" : "Grace";
    var lastName = patientNumber == 1001 ? "Lovelace" : "Hopper";
    var warning = patientNumber == 1002 ? new[] { "Fixture warning: review imported allergy code." } : [];
    return Task.FromResult(new CcdDocument(
      patientNumber,
      firstName,
      lastName,
      $"<?xml version=\"1.0\" encoding=\"UTF-8\"?><ClinicalDocument><id extension=\"{patientNumber}\" /></ClinicalDocument>",
      warning));
  }

  public Task<string> GetStylesheetAsync(CancellationToken cancellationToken) =>
    Task.FromResult("<?xml version=\"1.0\"?><xsl:stylesheet version=\"1.0\" xmlns:xsl=\"http://www.w3.org/1999/XSL/Transform\" />");
}
