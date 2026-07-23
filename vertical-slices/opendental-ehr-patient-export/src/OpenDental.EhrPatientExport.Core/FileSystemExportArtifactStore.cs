using System.IO.Compression;
using System.Text;

namespace OpenDental.EhrPatientExport;

public sealed class FileSystemExportArtifactStore(string rootDirectory, TimeSpan? lifetime = null) : IExportArtifactStore {
  private static readonly Encoding Utf8NoBom = new UTF8Encoding(false);
  private readonly string _rootDirectory = Path.GetFullPath(rootDirectory);
  private readonly TimeSpan _lifetime = ValidateLifetime(lifetime ?? TimeSpan.FromMinutes(15));

  public async Task<ExportArtifactDescriptor> StoreAsync(IReadOnlyList<ExportFile> files, CancellationToken cancellationToken) {
    if (files.Count == 0) throw new ArgumentException("An export artifact requires at least one file.", nameof(files));
    Directory.CreateDirectory(_rootDirectory);
    DeleteExpiredArtifacts();
    var artifactId = Guid.NewGuid();
    var fileName = $"ehr-patient-export-{artifactId:N}.zip";
    var finalPath = ArtifactPath(artifactId);
    var temporaryPath = finalPath + ".tmp";
    try {
      await using (var output = new FileStream(temporaryPath, FileMode.CreateNew, FileAccess.Write, FileShare.None, 64 * 1024, true))
      using (var archive = new ZipArchive(output, ZipArchiveMode.Create, leaveOpen: false)) {
        foreach (var file in files) {
          cancellationToken.ThrowIfCancellationRequested();
          ValidateEntryName(file.Name);
          var entry = archive.CreateEntry(file.Name, CompressionLevel.Optimal);
          await using var stream = entry.Open();
          await using var writer = new StreamWriter(stream, Utf8NoBom, leaveOpen: false);
          await writer.WriteAsync(file.Content.AsMemory(), cancellationToken);
        }
      }
      File.Move(temporaryPath, finalPath);
    } catch {
      File.Delete(temporaryPath);
      throw;
    }
    var length = new FileInfo(finalPath).Length;
    return new ExportArtifactDescriptor(artifactId, fileName, "application/zip", length);
  }

  public Task<ExportArtifactDownload?> OpenAsync(Guid artifactId, CancellationToken cancellationToken) {
    cancellationToken.ThrowIfCancellationRequested();
    var path = ArtifactPath(artifactId);
    if (!File.Exists(path)) return Task.FromResult<ExportArtifactDownload?>(null);
    var fileInfo = new FileInfo(path);
    if (DateTime.UtcNow - fileInfo.LastWriteTimeUtc >= _lifetime) {
      TryDelete(path);
      return Task.FromResult<ExportArtifactDownload?>(null);
    }
    var descriptor = new ExportArtifactDescriptor(
      artifactId,
      $"ehr-patient-export-{artifactId:N}.zip",
      "application/zip",
      fileInfo.Length);
    Stream stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.Read, 64 * 1024, true);
    return Task.FromResult<ExportArtifactDownload?>(new ExportArtifactDownload(descriptor, stream));
  }

  private string ArtifactPath(Guid artifactId) => Path.Combine(_rootDirectory, $"{artifactId:N}.zip");

  private void DeleteExpiredArtifacts() {
    var cutoff = DateTime.UtcNow - _lifetime;
    foreach (var path in Directory.EnumerateFiles(_rootDirectory, "*.zip")) {
      if (File.GetLastWriteTimeUtc(path) <= cutoff) TryDelete(path);
    }
    foreach (var path in Directory.EnumerateFiles(_rootDirectory, "*.tmp")) {
      if (File.GetLastWriteTimeUtc(path) <= cutoff) TryDelete(path);
    }
  }

  private static TimeSpan ValidateLifetime(TimeSpan lifetime) {
    if (lifetime <= TimeSpan.Zero || lifetime > TimeSpan.FromDays(1)) {
      throw new ArgumentOutOfRangeException(nameof(lifetime), "Artifact lifetime must be greater than zero and no more than 24 hours.");
    }
    return lifetime;
  }

  private static void TryDelete(string path) {
    try { File.Delete(path); } catch (IOException) { } catch (UnauthorizedAccessException) { }
  }

  private static void ValidateEntryName(string name) {
    if (string.IsNullOrWhiteSpace(name) || Path.IsPathRooted(name) || name.Contains('/') || name.Contains('\\') || name is "." or "..") {
      throw new InvalidOperationException($"Unsafe export entry name: {name}");
    }
  }
}
