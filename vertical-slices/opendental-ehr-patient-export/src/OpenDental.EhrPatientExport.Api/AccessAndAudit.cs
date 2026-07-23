using OpenDental.EhrPatientExport;

namespace OpenDental.EhrPatientExport.Api;

public interface IPatientExportAccessPolicy {
  Task<string?> GetActorAsync(HttpContext context, CancellationToken cancellationToken);
}

public sealed class EnvironmentPatientExportAccessPolicy(IHostEnvironment environment) : IPatientExportAccessPolicy {
  public Task<string?> GetActorAsync(HttpContext context, CancellationToken cancellationToken) {
    cancellationToken.ThrowIfCancellationRequested();
    if (context.User.Identity?.IsAuthenticated == true && !string.IsNullOrWhiteSpace(context.User.Identity.Name)) {
      return Task.FromResult<string?>(context.User.Identity.Name);
    }
    return Task.FromResult<string?>(environment.IsDevelopment() ? "development-migration-reviewer" : null);
  }
}

public sealed class LoggerPhiAuditSink(ILogger<LoggerPhiAuditSink> logger) : IPhiAuditSink {
  public Task WriteAsync(PhiAuditEvent auditEvent, CancellationToken cancellationToken) {
    cancellationToken.ThrowIfCancellationRequested();
    logger.LogInformation(
      "PHI audit Actor={Actor} Action={Action} RequestedCount={RequestedCount} ExportedCount={ExportedCount} SkippedCount={SkippedCount} ArtifactId={ArtifactId} Succeeded={Succeeded} Outcome={Outcome}",
      auditEvent.Actor,
      auditEvent.Action,
      auditEvent.RequestedPatientCount,
      auditEvent.ExportedPatientCount,
      auditEvent.SkippedPatientCount,
      auditEvent.ArtifactId,
      auditEvent.Succeeded,
      auditEvent.OutcomeCode);
    return Task.CompletedTask;
  }
}
