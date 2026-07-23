using System.Data;
using Microsoft.Data.SqlClient;
using OpenDental.EhrPatientExport;

namespace OpenDental.EhrPatientExport.Api;

public sealed class SqlServerPatientExportDataSource(string connectionString) : IPatientExportDataSource {
  private static readonly IReadOnlyDictionary<string, string[]> RequiredColumns = new Dictionary<string, string[]>(StringComparer.OrdinalIgnoreCase) {
    ["preference"] = ["PrefName", "ValueString"],
    ["provider"] = ["ProvNum", "Abbr", "LName", "FName", "IsHidden", "ItemOrder"],
    ["clinic"] = ["ClinicNum", "Abbr", "Description", "IsHidden", "ItemOrder"],
    ["site"] = ["SiteNum", "Description"],
    ["patient"] = ["PatNum", "FName", "LName", "PriProv", "ClinicNum", "SiteNum", "PatStatus"],
  };

  public async Task<DependencyReadiness> ProbeAsync(CancellationToken cancellationToken) {
    try {
      await using var connection = new SqlConnection(connectionString);
      await connection.OpenAsync(cancellationToken);
      var actual = new Dictionary<string, HashSet<string>>(StringComparer.OrdinalIgnoreCase);
      var tableNames = string.Join(",", RequiredColumns.Keys.Select((_, index) => $"@Table{index}"));
      await using var command = new SqlCommand(
        $"SELECT TABLE_NAME,COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME IN ({tableNames})",
        connection);
      var parameterIndex = 0;
      foreach (var table in RequiredColumns.Keys) {
        command.Parameters.Add($"@Table{parameterIndex++}", SqlDbType.NVarChar, 128).Value = table;
      }
      await using var reader = await command.ExecuteReaderAsync(cancellationToken);
      while (await reader.ReadAsync(cancellationToken)) {
        var table = reader.GetString(0);
        if (!actual.TryGetValue(table, out var columns)) actual[table] = columns = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        columns.Add(reader.GetString(1));
      }
      var missing = RequiredColumns
        .SelectMany(pair => pair.Value.Where(column => !actual.TryGetValue(pair.Key, out var columns) || !columns.Contains(column))
          .Select(column => pair.Key + "." + column))
        .OrderBy(value => value, StringComparer.OrdinalIgnoreCase)
        .ToArray();
      return missing.Length == 0
        ? new DependencyReadiness("patient-data", "sql-server", true, "sql-schema-ready", [])
        : new DependencyReadiness("patient-data", "sql-server", false, "sql-schema-mismatch", missing);
    } catch (SqlException) {
      return new DependencyReadiness("patient-data", "sql-server", false, "sql-unavailable", []);
    } catch (InvalidOperationException) {
      return new DependencyReadiness("patient-data", "sql-server", false, "sql-configuration-invalid", []);
    }
  }

  public async Task<PatientExportOptions> GetOptionsAsync(CancellationToken cancellationToken) {
    await using var connection = new SqlConnection(connectionString);
    await connection.OpenAsync(cancellationToken);
    var easyNoClinics = await ReadPreferenceBoolAsync(connection, "EasyNoClinics", cancellationToken);
    var easyHidePublicHealth = await ReadPreferenceBoolAsync(connection, "EasyHidePublicHealth", cancellationToken);
    var providers = await ReadOptionsAsync(connection,
      "SELECT ProvNum, COALESCE(NULLIF(Abbr,''), CONCAT(LName, ', ', FName)) FROM provider WHERE IsHidden=0 ORDER BY ItemOrder, Abbr",
      cancellationToken);
    var clinics = await ReadOptionsAsync(connection,
      "SELECT ClinicNum, COALESCE(NULLIF(Abbr,''), Description) FROM clinic WHERE IsHidden=0 ORDER BY ItemOrder, Abbr",
      cancellationToken);
    var sites = await ReadOptionsAsync(connection,
      "SELECT SiteNum, Description FROM site ORDER BY Description",
      cancellationToken);
    return new PatientExportOptions(
      WithAll(providers),
      !easyNoClinics && clinics.Count > 0,
      WithAll(clinics),
      !easyHidePublicHealth,
      WithAll(sites));
  }

  public async Task<IReadOnlyList<PatientSearchItem>> SearchAsync(PatientSearchRequest request, CancellationToken cancellationToken) {
    const string sql = """
      SELECT p.PatNum, p.FName, p.LName, pr.Abbr AS Provider,
             COALESCE(c.Description,'') AS Clinic, COALESCE(s.Description,'') AS Site
      FROM patient p
      INNER JOIN provider pr ON p.PriProv=pr.ProvNum
      LEFT JOIN clinic c ON p.ClinicNum=c.ClinicNum
      LEFT JOIN site s ON p.SiteNum=s.SiteNum
      WHERE p.PatStatus=0
        AND (@PatNum IS NULL OR CONVERT(varchar(20),p.PatNum) LIKE '%' + CONVERT(varchar(20),@PatNum) + '%')
        AND (@FirstName='' OR p.FName LIKE '%' + @FirstName + '%')
        AND (@LastName='' OR p.LName LIKE '%' + @LastName + '%')
        AND (@ProvNum IS NULL OR pr.ProvNum=@ProvNum)
        AND (@ClinicNum IS NULL OR c.ClinicNum=@ClinicNum)
        AND (@SiteNum IS NULL OR s.SiteNum=@SiteNum)
      ORDER BY p.LName,p.FName
      """;
    await using var connection = new SqlConnection(connectionString);
    await connection.OpenAsync(cancellationToken);
    await using var command = new SqlCommand(sql, connection);
    AddNullableInt64(command, "@PatNum", PositiveOrNull(request.PatientNumber));
    command.Parameters.Add("@FirstName", SqlDbType.NVarChar, 100).Value = request.FirstName?.Trim() ?? "";
    command.Parameters.Add("@LastName", SqlDbType.NVarChar, 100).Value = request.LastName?.Trim() ?? "";
    AddNullableInt64(command, "@ProvNum", PositiveOrNull(request.ProviderId));
    AddNullableInt64(command, "@ClinicNum", PositiveOrNull(request.ClinicId));
    AddNullableInt64(command, "@SiteNum", PositiveOrNull(request.SiteId));
    var result = new List<PatientSearchItem>();
    await using var reader = await command.ExecuteReaderAsync(cancellationToken);
    while (await reader.ReadAsync(cancellationToken)) {
      result.Add(new PatientSearchItem(
        reader.GetInt64(0), reader.GetString(1), reader.GetString(2), reader.GetString(3), reader.GetString(4), reader.GetString(5)));
    }
    return result;
  }

  private static long? PositiveOrNull(long? value) => value > 0 ? value : null;

  private static void AddNullableInt64(SqlCommand command, string name, long? value) =>
    command.Parameters.Add(name, SqlDbType.BigInt).Value = value.HasValue ? value.Value : DBNull.Value;

  private static async Task<bool> ReadPreferenceBoolAsync(SqlConnection connection, string prefName, CancellationToken cancellationToken) {
    await using var command = new SqlCommand("SELECT TOP (1) ValueString FROM preference WHERE PrefName=@PrefName", connection);
    command.Parameters.Add("@PrefName", SqlDbType.NVarChar, 255).Value = prefName;
    var value = Convert.ToString(await command.ExecuteScalarAsync(cancellationToken));
    return value is "1" or "true" or "True";
  }

  private static async Task<IReadOnlyList<OptionItem>> ReadOptionsAsync(SqlConnection connection, string sql, CancellationToken cancellationToken) {
    await using var command = new SqlCommand(sql, connection);
    var result = new List<OptionItem>();
    await using var reader = await command.ExecuteReaderAsync(cancellationToken);
    while (await reader.ReadAsync(cancellationToken)) result.Add(new OptionItem(reader.GetInt64(0), reader.GetString(1)));
    return result;
  }

  private static IReadOnlyList<OptionItem> WithAll(IReadOnlyList<OptionItem> values) => [new OptionItem(0, "All"), .. values];
}
