#!/bin/sh
set -eu

slice_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
repo_root=$(CDPATH= cd -- "$slice_dir/../.." && pwd)

docker run --rm \
  -v "$repo_root:/work" \
  -w /work/vertical-slices/opendental-ehr-patient-export \
  mcr.microsoft.com/dotnet/sdk:10.0 \
  sh -lc 'dotnet build src/OpenDental.EhrPatientExport.Api/OpenDental.EhrPatientExport.Api.csproj && dotnet run --project test/OpenDental.EhrPatientExport.ContractTests/OpenDental.EhrPatientExport.ContractTests.csproj'
