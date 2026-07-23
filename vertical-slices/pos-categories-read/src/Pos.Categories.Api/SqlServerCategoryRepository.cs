using System.Data;
using Microsoft.Data.SqlClient;
using Pos.Categories;

namespace Pos.Categories.Api;

public static class CategorySql
{
  public const string SearchText = """
    SELECT [id], [catagory], [supplier], [added_by], [added_date]
    FROM [dbo].[tbl_catagories]
    WHERE @keyword = N''
       OR CONVERT(nvarchar(20), [id]) LIKE @pattern ESCAPE N'~'
       OR [catagory] LIKE @pattern ESCAPE N'~'
       OR [supplier] LIKE @pattern ESCAPE N'~'
       OR [added_by] LIKE @pattern ESCAPE N'~'
       OR [added_date] LIKE @pattern ESCAPE N'~'
    ORDER BY [id];
    """;

  public static string ToLiteralContainsPattern(string keyword) =>
    $"%{keyword.Replace("~", "~~", StringComparison.Ordinal)
      .Replace("%", "~%", StringComparison.Ordinal)
      .Replace("_", "~_", StringComparison.Ordinal)
      .Replace("[", "~[", StringComparison.Ordinal)}%";
}

public sealed class SqlServerCategoryRepository(string connectionString) : ICategoryRepository
{
  public async Task<IReadOnlyList<CategoryRow>> SearchAsync(string keyword, CancellationToken cancellationToken)
  {
    var rows = new List<CategoryRow>();
    await using var connection = new SqlConnection(connectionString);
    await connection.OpenAsync(cancellationToken);
    await using var command = new SqlCommand(CategorySql.SearchText, connection);
    command.Parameters.Add("@keyword", SqlDbType.NVarChar, CategoryService.MaximumKeywordLength).Value = keyword;
    command.Parameters.Add("@pattern", SqlDbType.NVarChar, 204).Value = CategorySql.ToLiteralContainsPattern(keyword);
    await using var reader = await command.ExecuteReaderAsync(cancellationToken);
    while (await reader.ReadAsync(cancellationToken)) {
      rows.Add(new CategoryRow(
        reader.GetInt32(0),
        ReadNullableString(reader, 1),
        ReadNullableString(reader, 2),
        ReadNullableString(reader, 3),
        ReadNullableString(reader, 4)));
    }
    return rows;
  }

  public async Task<RepositoryProbe> ProbeAsync(CancellationToken cancellationToken)
  {
    try {
      await using var connection = new SqlConnection(connectionString);
      await connection.OpenAsync(cancellationToken);
      await using var command = new SqlCommand(
        "SELECT CASE WHEN OBJECT_ID(N'dbo.tbl_catagories', N'U') IS NULL THEN 0 ELSE 1 END;", connection);
      var exists = Convert.ToInt32(await command.ExecuteScalarAsync(cancellationToken)) == 1;
      return exists
        ? new RepositoryProbe(true, true, "sql-server", "Connected and dbo.tbl_catagories is present.")
        : new RepositoryProbe(false, true, "sql-server", "Connected, but dbo.tbl_catagories is missing.");
    } catch (Exception error) when (error is not OperationCanceledException) {
      return new RepositoryProbe(false, true, "sql-server", $"SQL Server probe failed ({error.GetType().Name}).");
    }
  }

  private static string? ReadNullableString(SqlDataReader reader, int ordinal) =>
    reader.IsDBNull(ordinal) ? null : reader.GetString(ordinal);
}
