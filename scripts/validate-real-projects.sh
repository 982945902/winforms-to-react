#!/usr/bin/env bash
# Reproducible real-world validation against the north-star goal:
#   "any WinForms project → product compiles + MIGRATION.md 100% contract coverage"
#
# Fetches real .Designer.cs + .cs from open-source WinForms repos, converts,
# compiles the product with tsc, and cross-checks that every `+= EventHandler`
# in the source appears in MIGRATION.md (zero omissions).
#
# Usage: bash scripts/validate-real-projects.sh
# Requires: network access, node build, python3.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
npm run build >/dev/null

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
mkdir -p "$WORK/src"

# Real forms (raw.githubusercontent.com paths) exercising diverse patterns:
# greenshot (links/pictureboxes), ShareX (ContextMenu UserControl),
# gitextensions (deep TabControl + TableLayoutPanel nesting).
declare -a URLS=(
  "greenshot/greenshot/master/Greenshot/Forms/AboutForm"
  "greenshot/greenshot/master/Greenshot/Forms/SettingsForm"
  "greenshot/greenshot/master/Greenshot/Forms/ImageEditorForm"
  "greenshot/greenshot/master/Greenshot/Forms/CaptureForm"
  "greenshot/greenshot/master/Greenshot/Forms/ColorDialog"
  "greenshot/greenshot/master/Greenshot/Forms/TornEdgeSettingsForm"
  "greenshot/greenshot/master/Greenshot/Forms/DropShadowSettingsForm"
  "ShareX/ShareX/master/ShareX.HelpersLib/Controls/ExportImportControl"
  "ShareX/ShareX/master/ShareX.HelpersLib/Controls/MyPictureBox"
  "gitextensions/gitextensions/master/src/app/BugReporter/BugReportForm"
  "gitextensions/gitextensions/master/src/app/BugReporter/ExceptionDetailView"
  "gitextensions/gitextensions/master/src/app/GitUI/CommandsDialogs/FormBrowse"
  "gitextensions/gitextensions/master/src/app/GitUI/CommandsDialogs/FormCommit"
  "gitextensions/gitextensions/master/src/app/GitUI/CommandsDialogs/FormBlame"
  "gitextensions/gitextensions/master/src/app/GitUI/CommandsDialogs/FormArchive"
  "gitextensions/gitextensions/master/src/app/GitUI/CommandsDialogs/FormCherryPick"
  "gitextensions/gitextensions/master/src/app/GitUI/CommandsDialogs/FormDiff"
  "gitextensions/gitextensions/master/src/app/GitUI/CommandsDialogs/FormCheckoutBranch"
  "gitextensions/gitextensions/master/src/app/GitUI/CommandsDialogs/FormResolveConflicts"
  "gitextensions/gitextensions/master/src/app/GitUI/CommandsDialogs/FormClone"
  "ShareX/ShareX/master/ShareX/Forms/MainForm"
  "ShareX/ShareX/master/ShareX/Forms/ApplicationSettingsForm"
  "dotnet/winforms/main/pkg/Microsoft.Dotnet.WinForms.ProjectTemplates/content/WinFormsApplication-CSharp/net6.0/Form1"
  "dotnet/winforms/main/src/System.Windows.Forms.Design/src/System/Windows/Forms/Design/FormatControl"
  "Klocman/Bulk-Crap-Uninstaller/master/source/BulkCrapUninstaller/Controls/AdvancedClipboardCopy"
  "Klocman/Bulk-Crap-Uninstaller/master/source/BulkCrapUninstaller/Controls/FileTargeter"
  "Klocman/Bulk-Crap-Uninstaller/master/source/BulkCrapUninstaller/Controls/RelatedUninstallerAdder"
)
for u in "${URLS[@]}"; do
  n="$(basename "$u")"
  curl -fsSL "https://raw.githubusercontent.com/$u.Designer.cs" -o "$WORK/src/$n.Designer.cs" || { echo "MISS $n.Designer.cs"; continue; }
  curl -fsSL "https://raw.githubusercontent.com/$u.cs" -o "$WORK/src/$n.cs" 2>/dev/null || true
done

node dist/cli.js convert "$WORK" --out "$WORK/out"

echo "=== product tsc ==="
( cd "$WORK/out" && npm install --silent --no-audit --no-fund >/dev/null 2>&1 && npx tsc --noEmit -p tsconfig.json )
echo "product compiles: OK"

echo "=== event coverage cross-check ==="
python3 - "$WORK" <<'PY'
import re, glob, os, sys
work = sys.argv[1]
src = set()
for f in glob.glob(os.path.join(work, "src", "*.Designer.cs")):
    form = os.path.basename(f).replace(".Designer.cs", "")
    txt = open(f).read()
    # control.Event += ...  (this.X where X is the form → form-level event)
    for m in re.finditer(r'(?:this\.)?([A-Za-z_]\w*)\.([A-Za-z]+)\s*\+=', txt):
        c, e = m.group(1), m.group(2)
        src.add(f"{form}.{e}" if c in (form, "this") else f"{c}.{e}")
    # this.Event += ...  (single-segment form-level event)
    for m in re.finditer(r'this\.([A-Za-z]+)\s*\+=', txt):
        src.add(f"{form}.{m.group(1)}")
mig = set()
for line in open(os.path.join(work, "out", "MIGRATION.md")):
    m = re.match(r'- \[ \] ([A-Za-z_0-9]+)\.([A-Za-z]+)', line)
    if m:
        mig.add(f"{m.group(1)}.{m.group(2)}")
missing = sorted(e for e in src if e not in mig)
if missing:
    print("COVERAGE GAP — events in source but missing from MIGRATION.md:")
    print("\n".join(missing))
    sys.exit(1)
print(f"event coverage: 100% ({len(src)} events, 0 omissions)")

# --- binding coverage: every control that is data-bound in source (LHS of
# `.DataSource=` or `.DataBindings.Add`) must appear in the checklist. Keying on
# the bound CONTROL name (not the dataSource expression) is robust against the
# wide variety of RHS expressions (typeof, Enum.GetValues, method calls…). ---
src_bindings = set()
for f in glob.glob(os.path.join(work, "src", "*.cs")):
    txt = open(f).read()
    for m in re.finditer(r'([A-Za-z_]\w*)\s*\.\s*DataSource\s*=', txt):
        src_bindings.add(m.group(1))
    for m in re.finditer(r'([A-Za-z_]\w*)\s*\.\s*DataBindings\s*\.\s*Add\s*\(', txt):
        src_bindings.add(m.group(1))
# `this.X` and bare `X` refer to the same control; the checklist uses the bare name.
mig_body = open(os.path.join(work, "out", "MIGRATION.md")).read()
missing_b = [b for b in src_bindings if b not in mig_body]
if missing_b:
    print("BINDING COVERAGE GAP (bound controls missing from checklist):", missing_b)
    sys.exit(1)
print(f"binding coverage: {len(src_bindings)} bound control(s) all present")

# --- navigation coverage: every real form-navigation (new XForm(...).Show/ShowDialog
# or var.Show/ShowDialog resolving to a Form) must appear. MessageBox is excluded by
# the tool intentionally; verify the tool did NOT list MessageBox and DID list dialogs. ---
nav_targets = set()
for f in glob.glob(os.path.join(work, "src", "*.cs")):
    txt = open(f).read()
    for m in re.finditer(r'new\s+([A-Z]\w*)\s*\([^;]*?\)\s*\.\s*(?:Show|ShowDialog)\s*\(', txt):
        if m.group(1) not in ("MessageBox", "MsgBox"):
            nav_targets.add(m.group(1))
# nav targets via local var are harder to attribute in this coarse check; we assert
# the tool never emitted a MessageBox nav (false-positive guard) and that any direct
# new-Form navigations are represented.
if "→ MessageBox" in mig_body:
    print("NAV FALSE POSITIVE: MessageBox listed as navigation"); sys.exit(1)
missing_nav = [t for t in nav_targets if t not in mig_body]
if missing_nav:
    print("NAV COVERAGE GAP:", missing_nav); sys.exit(1)
print(f"navigation coverage: {len(nav_targets)} direct new-Form nav(s) present, no MessageBox false positives")
PY
echo "ALL REAL-PROJECT CHECKS PASSED"
