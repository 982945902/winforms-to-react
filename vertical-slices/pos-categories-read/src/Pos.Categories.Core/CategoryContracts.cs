namespace Pos.Categories;

public sealed record CategoryRow(
  int Id,
  string? Catagory,
  string? Supplier,
  string? AddedBy,
  string? AddedDate);

public sealed record CategorySearchRequest(string? Keyword);

public sealed record CategoryListResponse(IReadOnlyList<CategoryRow> Rows, string Message);

public sealed record RepositoryProbe(bool Ready, bool RealAdapter, string Adapter, string Detail);

public interface ICategoryRepository
{
  Task<IReadOnlyList<CategoryRow>> SearchAsync(string keyword, CancellationToken cancellationToken);
  Task<RepositoryProbe> ProbeAsync(CancellationToken cancellationToken);
}

public sealed class CategoryQueryException(string message) : Exception(message);
