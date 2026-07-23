namespace OpenDental.EhrPatientExport;

public sealed class PatientExportService(
  IPatientCcdGateway ccdGateway,
  IExportArtifactStore artifactStore,
  IPhiAuditSink auditSink) {

  public async Task<PatientExportOutcome> ExportAsync(
    PatientExportRequest request,
    string actor,
    CancellationToken cancellationToken) {
    var patientNumbers = (request.PatientNumbers ?? [])
      .Where(number => number > 0)
      .Distinct()
      .ToArray();
    if (patientNumbers.Length == 0) {
      throw new ExportValidationException("no-patients-selected", ["Select at least one patient before exporting."]);
    }

    var settingsErrors = await ccdGateway.ValidateSettingsAsync(cancellationToken);
    if (settingsErrors.Count > 0) {
      await AuditAsync(actor, patientNumbers.Length, 0, 0, null, false, "settings-invalid", cancellationToken);
      throw new ExportValidationException("settings-invalid", settingsErrors);
    }

    var files = new List<ExportFile>();
    var skipped = new List<ExportSkippedPatient>();
    var warnings = new List<string>();
    foreach (var patientNumber in patientNumbers) {
      cancellationToken.ThrowIfCancellationRequested();
      var validation = await ccdGateway.ValidatePatientAsync(patientNumber, cancellationToken);
      if (validation.Errors.Count > 0) {
        skipped.Add(new ExportSkippedPatient(patientNumber, validation.DisplayName, validation.Errors));
        continue;
      }
      var document = await ccdGateway.GeneratePatientExportAsync(patientNumber, cancellationToken);
      warnings.AddRange(document.Warnings.Select(warning => $"{validation.DisplayName}: {warning}"));
      files.Add(new ExportFile(BuildPatientFileName(document), document.Xml));
    }

    if (files.Count == 0) {
      await AuditAsync(actor, patientNumbers.Length, 0, skipped.Count, null, false, "no-exportable-patients", cancellationToken);
      throw new ExportValidationException(
        "no-exportable-patients",
        skipped.SelectMany(item => item.Errors.Select(error => $"{item.DisplayName}: {error}")).ToArray());
    }
    if (warnings.Count > 0 && !request.AcceptWarnings) {
      await AuditAsync(actor, patientNumbers.Length, 0, skipped.Count, null, false, "warnings-require-confirmation", cancellationToken);
      throw new ExportWarningsRequireConfirmationException(warnings);
    }

    files.Add(new ExportFile("CCD.xsl", await ccdGateway.GetStylesheetAsync(cancellationToken)));
    var artifact = await artifactStore.StoreAsync(files, cancellationToken);
    await AuditAsync(actor, patientNumbers.Length, files.Count - 1, skipped.Count, artifact.ArtifactId, true, "exported", cancellationToken);
    var message = skipped.Count == 0
      ? $"Exported {files.Count - 1} patient(s)."
      : $"Exported {files.Count - 1} patient(s); skipped {skipped.Count} patient(s) with validation errors.";
    return new PatientExportOutcome(artifact, files.Count - 1, skipped, warnings, message);
  }

  public static string BuildPatientFileName(CcdDocument document) {
    static string LettersOnly(string value) => string.Concat(value.Where(char.IsLetter));
    var lastName = LettersOnly(document.LastName);
    var firstName = LettersOnly(document.FirstName);
    return $"{lastName}_{firstName}_{document.PatientNumber}.xml";
  }

  private Task AuditAsync(
    string actor,
    int requested,
    int exported,
    int skipped,
    Guid? artifactId,
    bool succeeded,
    string outcome,
    CancellationToken cancellationToken) => auditSink.WriteAsync(
      new PhiAuditEvent(actor, "ehr-patient-export", requested, exported, skipped, artifactId, succeeded, outcome),
      cancellationToken);
}
