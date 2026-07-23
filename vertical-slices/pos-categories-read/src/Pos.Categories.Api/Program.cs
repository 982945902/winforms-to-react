using Pos.Categories;
using Pos.Categories.Api;

var builder = WebApplication.CreateBuilder(args);
var configuredOrigins = builder.Configuration.GetSection("PosCategories:AllowedOrigins").Get<string[]>();
var allowedOrigins = configuredOrigins is { Length: > 0 }
  ? configuredOrigins
  : builder.Environment.IsDevelopment()
    ? ["http://127.0.0.1:4189", "http://localhost:4189"]
    : throw new InvalidOperationException("PosCategories:AllowedOrigins is required outside Development.");
builder.Services.AddCors(options => options.AddDefaultPolicy(policy =>
  policy.WithOrigins(allowedOrigins).AllowAnyHeader().AllowAnyMethod()));
builder.Services.AddOpenApi("v1");

var useFixtures = builder.Configuration.GetValue<bool>("PosCategories:UseFixtures");
if (useFixtures) {
  if (!builder.Environment.IsDevelopment()) {
    throw new InvalidOperationException("Fixture mode is restricted to Development.");
  }
  builder.Services.AddSingleton<ICategoryRepository, FixtureCategoryRepository>();
} else {
  var connectionString = builder.Configuration.GetConnectionString("Pos")
    ?? throw new InvalidOperationException("ConnectionStrings:Pos is required when fixture mode is disabled.");
  builder.Services.AddSingleton<ICategoryRepository>(new SqlServerCategoryRepository(connectionString));
}
builder.Services.AddScoped<CategoryService>();

var app = builder.Build();
app.UseCors();
app.MapOpenApi("/openapi/{documentName}.json");

app.MapGet("/health", () => Results.Ok(new { status = "ok", slice = "Catagories" }));
app.MapGet("/ready", async (ICategoryRepository repository, CancellationToken cancellationToken) => {
  var probe = await repository.ProbeAsync(cancellationToken);
  return Results.Json(probe, statusCode: probe.Ready ? StatusCodes.Status200OK : StatusCodes.Status503ServiceUnavailable);
});

app.MapGet("/api/pos/categories", async (CategoryService service, CancellationToken cancellationToken) =>
  Results.Ok(await service.SearchAsync(null, cancellationToken)));

app.MapPost("/api/pos/categories/search", async (
  CategorySearchRequest request,
  CategoryService service,
  CancellationToken cancellationToken) => {
  try {
    return Results.Ok(await service.SearchAsync(request.Keyword, cancellationToken));
  } catch (CategoryQueryException error) {
    return Results.BadRequest(new { code = "invalid-search", message = error.Message });
  }
});

app.Run();

public partial class Program;
