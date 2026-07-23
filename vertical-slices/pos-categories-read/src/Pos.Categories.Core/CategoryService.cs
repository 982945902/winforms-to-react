namespace Pos.Categories;

public sealed class CategoryService(ICategoryRepository repository)
{
  public const int MaximumKeywordLength = 100;

  public async Task<CategoryListResponse> SearchAsync(string? keyword, CancellationToken cancellationToken)
  {
    var normalized = (keyword ?? string.Empty).Trim();
    if (normalized.Length > MaximumKeywordLength) {
      throw new CategoryQueryException($"Search text must not exceed {MaximumKeywordLength} characters.");
    }

    var rows = await repository.SearchAsync(normalized, cancellationToken);
    return new CategoryListResponse(rows, $"{rows.Count} category record(s) found.");
  }
}

public sealed class FixtureCategoryRepository : ICategoryRepository
{
  private static readonly CategoryRow[] Rows = [
    new(1, "Beverages", "Acme Wholesale", "1", "2019-07-06"),
    new(2, "Paint", "ColorCo", "1", "2019-07-06"),
    new(3, "Hardware", "Northwind", "2", "2019-07-07"),
    new(4, "Office", "Acme Wholesale", "2", "2019-07-08"),
  ];

  public Task<IReadOnlyList<CategoryRow>> SearchAsync(string keyword, CancellationToken cancellationToken)
  {
    cancellationToken.ThrowIfCancellationRequested();
    IReadOnlyList<CategoryRow> result = string.IsNullOrEmpty(keyword)
      ? Rows
      : Rows.Where(row => Matches(row, keyword)).ToArray();
    return Task.FromResult(result);
  }

  public Task<RepositoryProbe> ProbeAsync(CancellationToken cancellationToken)
  {
    cancellationToken.ThrowIfCancellationRequested();
    return Task.FromResult(new RepositoryProbe(true, false, "fixture", "Deterministic macOS development data; SQL Server was not contacted."));
  }

  private static bool Matches(CategoryRow row, string keyword) =>
    row.Id.ToString().Contains(keyword, StringComparison.OrdinalIgnoreCase)
    || Contains(row.Catagory, keyword)
    || Contains(row.Supplier, keyword)
    || Contains(row.AddedBy, keyword)
    || Contains(row.AddedDate, keyword);

  private static bool Contains(string? value, string keyword) =>
    value?.Contains(keyword, StringComparison.OrdinalIgnoreCase) == true;
}
