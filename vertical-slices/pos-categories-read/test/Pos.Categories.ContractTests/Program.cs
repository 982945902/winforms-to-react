using Pos.Categories;
using Pos.Categories.Api;

var service = new CategoryService(new FixtureCategoryRepository());
var all = await service.SearchAsync(null, CancellationToken.None);
Assert(all.Rows.Count == 4, "load returns every fixture row");
Assert(all.Rows[0].Id == 1 && all.Rows[0].Catagory == "Beverages", "row fields preserve the legacy data contract");

var filtered = await service.SearchAsync("  Acme  ", CancellationToken.None);
Assert(filtered.Rows.Select(row => row.Id).SequenceEqual([1, 4]), "search trims input and matches supplier text");
var byId = await service.SearchAsync("2", CancellationToken.None);
Assert(byId.Rows.Any(row => row.Id == 2), "search preserves legacy id matching");

await AssertThrows<CategoryQueryException>(
  () => service.SearchAsync(new string('x', CategoryService.MaximumKeywordLength + 1), CancellationToken.None),
  "oversized search text is rejected before repository access");

Assert(CategorySql.SearchText.Contains("@pattern", StringComparison.Ordinal), "SQL search is parameterized");
Assert(!CategorySql.SearchText.Contains("company", StringComparison.OrdinalIgnoreCase), "SQL search does not reference the legacy query's nonexistent company column");
Assert(CategorySql.ToLiteralContainsPattern("50%_[x]") == "%50~%~_~[x]%", "LIKE wildcard characters are treated literally");

var probe = await new FixtureCategoryRepository().ProbeAsync(CancellationToken.None);
Assert(probe.Ready && !probe.RealAdapter && probe.Adapter == "fixture", "fixture readiness never claims a real SQL Server adapter");

Console.WriteLine("POS categories contract tests passed.");

static void Assert(bool condition, string message)
{
  if (!condition) throw new InvalidOperationException($"Assertion failed: {message}");
}

static async Task AssertThrows<TException>(Func<Task> action, string message) where TException : Exception
{
  try {
    await action();
  } catch (TException) {
    return;
  }
  throw new InvalidOperationException($"Assertion failed: {message}");
}
