using System.Net.Http.Json;
using OpenDental.EhrPatientExport;

namespace OpenDental.EhrPatientExport.Api;

public sealed class HttpLegacyCcdGateway(HttpClient client) : IPatientCcdGateway {
  private static readonly string[] RequiredOperations = [
    "settings-validation", "patient-validation", "patient-export", "ccd-stylesheet",
  ];

  public async Task<DependencyReadiness> ProbeAsync(CancellationToken cancellationToken) {
    try {
      using var response = await client.GetAsync("api/ccd/capabilities", cancellationToken);
      if (!response.IsSuccessStatusCode) {
        return new DependencyReadiness("ccd", "legacy-http", false, "legacy-handshake-failed", []);
      }
      var capabilities = await response.Content.ReadFromJsonAsync<CapabilityEnvelope>(cancellationToken);
      if (capabilities is null || capabilities.SchemaVersion != 1) {
        return new DependencyReadiness("ccd", "legacy-http", false, "legacy-contract-version-mismatch", ["schemaVersion=1"]);
      }
      var operations = new HashSet<string>(capabilities.Operations ?? [], StringComparer.OrdinalIgnoreCase);
      var missing = RequiredOperations.Where(operation => !operations.Contains(operation)).ToArray();
      return missing.Length == 0
        ? new DependencyReadiness("ccd", "legacy-http", true, "legacy-contract-ready", [])
        : new DependencyReadiness("ccd", "legacy-http", false, "legacy-capabilities-missing", missing);
    } catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested) {
      return new DependencyReadiness("ccd", "legacy-http", false, "legacy-timeout", []);
    } catch (HttpRequestException) {
      return new DependencyReadiness("ccd", "legacy-http", false, "legacy-unavailable", []);
    }
  }

  public async Task<IReadOnlyList<string>> ValidateSettingsAsync(CancellationToken cancellationToken) =>
    (await client.GetFromJsonAsync<ValidationEnvelope>("api/ccd/settings-validation", cancellationToken)
      ?? throw new InvalidOperationException("Legacy CCD bridge returned an empty settings-validation response.")).Errors;

  public async Task<PatientValidationResult> ValidatePatientAsync(long patientNumber, CancellationToken cancellationToken) =>
    await client.GetFromJsonAsync<PatientValidationResult>($"api/ccd/patients/{patientNumber}/validation", cancellationToken)
      ?? throw new InvalidOperationException("Legacy CCD bridge returned an empty patient-validation response.");

  public async Task<CcdDocument> GeneratePatientExportAsync(long patientNumber, CancellationToken cancellationToken) {
    using var response = await client.PostAsJsonAsync($"api/ccd/patients/{patientNumber}/exports", new { }, cancellationToken);
    response.EnsureSuccessStatusCode();
    return await response.Content.ReadFromJsonAsync<CcdDocument>(cancellationToken)
      ?? throw new InvalidOperationException("Legacy CCD bridge returned an empty export response.");
  }

  public Task<string> GetStylesheetAsync(CancellationToken cancellationToken) =>
    client.GetStringAsync("api/ccd/resources/CCD", cancellationToken);

  private sealed record ValidationEnvelope(IReadOnlyList<string> Errors);
  private sealed record CapabilityEnvelope(int SchemaVersion, string? Service, IReadOnlyList<string>? Operations);
}
