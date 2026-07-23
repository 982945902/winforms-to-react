#!/bin/sh
set -eu

slice_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)

if [ -n "${WF2_DOTNET:-}" ]; then
  "$WF2_DOTNET" build "$slice_dir/src/Pos.Categories.Api/Pos.Categories.Api.csproj"
  "$WF2_DOTNET" run --project "$slice_dir/test/Pos.Categories.ContractTests/Pos.Categories.ContractTests.csproj"
elif command -v dotnet >/dev/null 2>&1; then
  dotnet build "$slice_dir/src/Pos.Categories.Api/Pos.Categories.Api.csproj"
  dotnet run --project "$slice_dir/test/Pos.Categories.ContractTests/Pos.Categories.ContractTests.csproj"
elif command -v docker >/dev/null 2>&1; then
  repo_root=$(CDPATH= cd -- "$slice_dir/../.." && pwd)
  docker run --rm -v "$repo_root:/work" -w /work/vertical-slices/pos-categories-read \
    mcr.microsoft.com/dotnet/sdk:10.0 sh -lc \
    'dotnet build src/Pos.Categories.Api/Pos.Categories.Api.csproj && dotnet run --project test/Pos.Categories.ContractTests/Pos.Categories.ContractTests.csproj'
else
  echo "Install .NET 10, set WF2_DOTNET, or start Docker." >&2
  exit 1
fi
