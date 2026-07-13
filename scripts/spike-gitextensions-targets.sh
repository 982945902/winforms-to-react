#!/usr/bin/env bash
# Reproducible platform bake-off on a pinned, complex GitExtensions slice.
# The slice includes FormCommit plus shared FileStatusList/FileViewer/EditNetSpell controls.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
COMMIT="0625c0744c41854a29200df24a5e5f2e351ee657"
WORK="${WF2_SPIKE_WORK:-$(mktemp -d)}"
KEEP="${WF2_SPIKE_KEEP:-0}"
if [ "$KEEP" != "1" ]; then trap 'rm -rf "$WORK"' EXIT; fi

REPO="$WORK/gitextensions"
SOURCE="$WORK/source"
mkdir -p "$SOURCE"

git clone --filter=blob:none --no-checkout https://github.com/gitextensions/gitextensions.git "$REPO" >/dev/null
git -C "$REPO" sparse-checkout init --cone
git -C "$REPO" sparse-checkout set \
  src/app/GitUI/CommandsDialogs \
  src/app/GitUI/UserControls \
  src/app/GitUI/Editor \
  src/app/GitUI/SpellChecker \
  src/app/GitUI/Resources/Icons \
  src/app/ResourceManager
git -C "$REPO" checkout "$COMMIT" >/dev/null

copy_family() {
  local path="$1"
  local base="$2"
  find "$path" -maxdepth 1 -type f \( -name "$base.cs" -o -name "$base.*.cs" -o -name "$base.resx" \) -exec cp {} "$SOURCE/" \;
}

copy_family "$REPO/src/app/GitUI/CommandsDialogs" FormCommit
copy_family "$REPO/src/app/GitUI/UserControls" FileStatusList
copy_family "$REPO/src/app/GitUI/Editor" FileViewer
copy_family "$REPO/src/app/GitUI/Editor" FileViewerInternal
copy_family "$REPO/src/app/GitUI/SpellChecker" EditNetSpell
cp "$REPO/src/app/GitUI/GitModuleControl.cs" "$SOURCE/"
cp "$REPO/src/app/GitUI/GitModuleForm.cs" "$SOURCE/"
cp "$REPO/src/app/GitUI/GitExtensionsForm.cs" "$SOURCE/"
cp "$REPO/src/app/ResourceManager/GitExtensionsControl.cs" "$SOURCE/"
cp "$REPO/src/app/ResourceManager/TranslatedControl.cs" "$SOURCE/"
cp "$REPO/src/app/ResourceManager/GitExtensionsFormBase.cs" "$SOURCE/"
mkdir -p "$SOURCE/Resources"
cp -R "$REPO/src/app/GitUI/Resources/Icons" "$SOURCE/Resources/"

cd "$ROOT"
npm run build >/dev/null
node dist/cli.js convert "$SOURCE" --target refine --out "$WORK/refine"
node dist/cli.js convert "$SOURCE" --target nocobase --out "$WORK/nocobase"

( cd "$WORK/refine" && npm install --silent --no-audit --no-fund && npm run build )
if [ "${WF2_SKIP_NOCOBASE_INSTALL:-0}" != "1" ]; then
  ( cd "$WORK/nocobase" && npm install --silent --no-audit --no-fund && npm run typecheck )
fi

node - "$WORK" <<'NODE'
const fs = require('fs');
const work = process.argv[2];
const ir = JSON.parse(fs.readFileSync(`${work}/refine/src/generated/project.ir.json`, 'utf8'));
const manifest = JSON.parse(fs.readFileSync(`${work}/refine/src/generated/target-manifest.json`, 'utf8'));
console.log(JSON.stringify({
  commit: '0625c0744c41854a29200df24a5e5f2e351ee657',
  pages: manifest.totals.pages,
  controls: ir.report.controlsConverted,
  contracts: manifest.totals.contracts,
  sharedComponentTypes: manifest.totals.sharedComponentTypes,
  sharedComponentInstances: manifest.totals.sharedComponentInstances,
  sharedComponentFields: manifest.totals.sharedComponentFields,
  sharedComponentActions: manifest.totals.sharedComponentActions,
  sharedComponentContracts: manifest.totals.sharedComponentContracts,
  components: manifest.sharedComponents
    .filter((item) => item.instanceCount > 0)
    .map((item) => ({
      id: item.id,
      status: item.status,
      instanceCount: item.instanceCount,
      fields: item.fields.length,
      actions: item.actions.length,
      contracts: item.contractCount,
      componentRefs: item.componentRefs,
    })),
  outputs: { refine: `${work}/refine`, nocobase: `${work}/nocobase` },
}, null, 2));
NODE

if [ "$KEEP" = "1" ]; then echo "Spike outputs kept at $WORK"; fi
