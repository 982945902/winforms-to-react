import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { PNG } from "pngjs";

export type VisualGateStatus = "passed" | "failed" | "blocked";

export type VisualBaselineManifest = {
  schemaVersion: 1;
  nativeDirectory: string;
  capture: {
    dpi: number;
    displayScalePercent: number;
    browserZoomPercent: number;
    theme: string;
  };
  criteria: {
    minimumGeometryCoverage: number;
    geometryEdgeTolerancePx: number;
    pixelChannelThreshold: number;
  };
  targets: Array<{
    id: string;
    label: string;
    webDirectory: string;
    reviewDirectory: string;
  }>;
  views: Array<{
    id: string;
    project: string;
    page: string;
    state: string;
    captureInstructions: string;
    clientSize: { width: number; height: number };
  }>;
};

export type VisualManualReview = {
  schemaVersion: 1;
  reviewer: string;
  reviewedAt: string;
  textAndIconsExact: boolean;
  geometryCoverage: number;
  clientAreaExact: boolean;
  noLayoutDefects: boolean;
  stateMatches: boolean;
  notes?: string[];
};

export type VisualGateIssue = {
  code:
    | "missing-native"
    | "missing-web"
    | "missing-review"
    | "invalid-native"
    | "invalid-web"
    | "invalid-review"
    | "native-size-mismatch"
    | "web-size-mismatch"
    | "text-or-icon-mismatch"
    | "geometry-below-threshold"
    | "client-area-mismatch"
    | "layout-defect"
    | "state-mismatch";
  message: string;
};

export type VisualImageInfo = {
  path: string;
  width: number;
  height: number;
};

export type VisualPixelDiagnostic = {
  channelThreshold: number;
  differentPixels: number;
  differentPixelRatio: number;
  meanAbsoluteError: number;
  rootMeanSquareError: number;
};

export type VisualTargetResult = {
  target: string;
  status: VisualGateStatus;
  webImage: VisualImageInfo | null;
  reviewPath: string;
  review: VisualManualReview | null;
  pixelDiagnostic: VisualPixelDiagnostic | null;
  issues: VisualGateIssue[];
};

export type VisualViewResult = {
  id: string;
  project: string;
  page: string;
  state: string;
  captureInstructions: string;
  expectedClientSize: { width: number; height: number };
  nativeImage: VisualImageInfo | null;
  targets: VisualTargetResult[];
};

export type VisualGateReport = {
  schemaVersion: 1;
  manifestPath: string;
  evaluatedAt: string;
  status: VisualGateStatus;
  summary: {
    requiredChecks: number;
    passed: number;
    failed: number;
    blocked: number;
  };
  capture: VisualBaselineManifest["capture"];
  criteria: VisualBaselineManifest["criteria"];
  views: VisualViewResult[];
};

type LoadedPng = {
  info: VisualImageInfo;
  data: Buffer;
};

type FileLoad<T> =
  | { kind: "loaded"; value: T }
  | { kind: "missing" }
  | { kind: "invalid"; reason: string };

export async function loadVisualBaselineManifest(manifestPath: string): Promise<VisualBaselineManifest> {
  const absolutePath = resolve(manifestPath);
  const raw = await readFile(absolutePath, "utf8");
  const parsed: unknown = JSON.parse(raw);
  validateManifest(parsed, absolutePath);
  return parsed;
}

export async function evaluateVisualGate(manifestPath: string): Promise<VisualGateReport> {
  const absoluteManifestPath = resolve(manifestPath);
  const manifest = await loadVisualBaselineManifest(absoluteManifestPath);
  const baselineRoot = dirname(absoluteManifestPath);
  const views: VisualViewResult[] = [];

  for (const view of manifest.views) {
    const nativePath = resolve(
      baselineRoot,
      manifest.nativeDirectory,
      `${view.id}@${manifest.capture.dpi}dpi.png`,
    );
    const nativeLoad = await loadPng(nativePath, baselineRoot);
    const nativeImage = nativeLoad.kind === "loaded" ? nativeLoad.value.info : null;
    const targetResults: VisualTargetResult[] = [];

    for (const target of manifest.targets) {
      const webPath = resolve(
        baselineRoot,
        target.webDirectory,
        `${view.id}@${manifest.capture.dpi}dpi.png`,
      );
      const reviewPath = resolve(baselineRoot, target.reviewDirectory, `${view.id}.json`);
      const webLoad = await loadPng(webPath, baselineRoot);
      const reviewLoad = await loadReview(reviewPath);
      const issues: VisualGateIssue[] = [];

      addImageLoadIssue(issues, nativeLoad, "native", displayPath(nativePath, baselineRoot));
      addImageLoadIssue(issues, webLoad, "web", displayPath(webPath, baselineRoot));
      addReviewLoadIssue(issues, reviewLoad, displayPath(reviewPath, baselineRoot));

      if (nativeLoad.kind === "loaded") {
        addSizeIssue(issues, nativeLoad.value.info, view.clientSize, "native");
      }
      if (webLoad.kind === "loaded") {
        addSizeIssue(issues, webLoad.value.info, view.clientSize, "web");
      }
      if (reviewLoad.kind === "loaded") {
        addReviewIssues(issues, reviewLoad.value, manifest.criteria);
      }

      const pixelDiagnostic = nativeLoad.kind === "loaded" && webLoad.kind === "loaded"
        && nativeLoad.value.info.width === webLoad.value.info.width
        && nativeLoad.value.info.height === webLoad.value.info.height
        ? comparePixels(nativeLoad.value, webLoad.value, manifest.criteria.pixelChannelThreshold)
        : null;

      targetResults.push({
        target: target.id,
        status: resultStatus(issues),
        webImage: webLoad.kind === "loaded" ? webLoad.value.info : null,
        reviewPath: displayPath(reviewPath, baselineRoot),
        review: reviewLoad.kind === "loaded" ? reviewLoad.value : null,
        pixelDiagnostic,
        issues,
      });
    }

    views.push({
      id: view.id,
      project: view.project,
      page: view.page,
      state: view.state,
      captureInstructions: view.captureInstructions,
      expectedClientSize: view.clientSize,
      nativeImage,
      targets: targetResults,
    });
  }

  const results = views.flatMap((view) => view.targets);
  const summary = {
    requiredChecks: results.length,
    passed: results.filter((result) => result.status === "passed").length,
    failed: results.filter((result) => result.status === "failed").length,
    blocked: results.filter((result) => result.status === "blocked").length,
  };

  return {
    schemaVersion: 1,
    manifestPath: absoluteManifestPath,
    evaluatedAt: new Date().toISOString(),
    status: summary.failed > 0 ? "failed" : summary.blocked > 0 ? "blocked" : "passed",
    summary,
    capture: manifest.capture,
    criteria: manifest.criteria,
    views,
  };
}

export function formatVisualGateMarkdown(report: VisualGateReport): string {
  const lines = [
    "# Native visual parity report",
    "",
    `Gate status: **${report.status.toUpperCase()}**`,
    "",
    `Checks: ${report.summary.requiredChecks}; passed: ${report.summary.passed}; failed: ${report.summary.failed}; blocked: ${report.summary.blocked}.`,
    "",
    "Pixel diagnostics are informational. A target passes only after the manual text/icon, geometry, layout and state review is recorded.",
    "",
    "| View | Target | Status | Native | Web | Review | Pixel delta | Geometry |",
    "|---|---|---|---|---|---|---:|---:|",
  ];

  for (const view of report.views) {
    for (const target of view.targets) {
      const native = view.nativeImage
        ? `${view.nativeImage.width}×${view.nativeImage.height}`
        : "missing";
      const web = target.webImage
        ? `${target.webImage.width}×${target.webImage.height}`
        : "missing";
      const review = target.review ? "recorded" : "missing";
      const pixelDelta = target.pixelDiagnostic
        ? `${formatPercent(target.pixelDiagnostic.differentPixelRatio)}`
        : "—";
      const geometry = target.review
        ? formatPercent(target.review.geometryCoverage)
        : "—";
      lines.push(
        `| ${escapeCell(view.id)} | ${escapeCell(target.target)} | ${target.status} | ${native} | ${web} | ${review} | ${pixelDelta} | ${geometry} |`,
      );
    }
  }

  const issueRows = report.views.flatMap((view) => view.targets.flatMap((target) =>
    target.issues.map((issue) => ({ view: view.id, target: target.target, issue })),
  ));
  if (issueRows.length > 0) {
    lines.push("", "## Required actions", "");
    for (const row of issueRows) {
      lines.push(`- ${row.view}/${row.target} [${row.issue.code}]: ${row.issue.message}`);
    }
  }

  return `${lines.join("\n")}\n`;
}

export async function writeVisualGateReport(
  report: VisualGateReport,
  outDir: string,
): Promise<{ jsonPath: string; markdownPath: string }> {
  const absoluteOutDir = resolve(outDir);
  await mkdir(absoluteOutDir, { recursive: true });
  const jsonPath = resolve(absoluteOutDir, "visual-gate-report.json");
  const markdownPath = resolve(absoluteOutDir, "visual-gate-report.md");
  await Promise.all([
    writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8"),
    writeFile(markdownPath, formatVisualGateMarkdown(report), "utf8"),
  ]);
  return { jsonPath, markdownPath };
}

function validateManifest(value: unknown, source: string): asserts value is VisualBaselineManifest {
  if (!isRecord(value) || value.schemaVersion !== 1) {
    throw new Error(`Invalid visual baseline manifest at ${source}: schemaVersion must be 1`);
  }
  if (!isNonEmptyString(value.nativeDirectory)) {
    throw new Error(`Invalid visual baseline manifest at ${source}: nativeDirectory is required`);
  }
  const capture = value.capture;
  if (!isRecord(capture) || !isPositiveNumber(capture.dpi)
    || !isPositiveNumber(capture.displayScalePercent)
    || !isPositiveNumber(capture.browserZoomPercent)
    || !isNonEmptyString(capture.theme)) {
    throw new Error(`Invalid visual baseline manifest at ${source}: capture settings are incomplete`);
  }
  const criteria = value.criteria;
  if (!isRecord(criteria)
    || !isRatio(criteria.minimumGeometryCoverage)
    || !isNonNegativeNumber(criteria.geometryEdgeTolerancePx)
    || !isChannel(criteria.pixelChannelThreshold)) {
    throw new Error(`Invalid visual baseline manifest at ${source}: criteria are incomplete`);
  }
  if (!Array.isArray(value.targets) || value.targets.length === 0) {
    throw new Error(`Invalid visual baseline manifest at ${source}: at least one target is required`);
  }
  const targetIds = new Set<string>();
  for (const target of value.targets) {
    if (!isRecord(target) || !isNonEmptyString(target.id) || !isNonEmptyString(target.label)
      || !isNonEmptyString(target.webDirectory) || !isNonEmptyString(target.reviewDirectory)) {
      throw new Error(`Invalid visual baseline manifest at ${source}: target entry is incomplete`);
    }
    if (targetIds.has(target.id)) {
      throw new Error(`Invalid visual baseline manifest at ${source}: duplicate target ${target.id}`);
    }
    targetIds.add(target.id);
  }
  if (!Array.isArray(value.views) || value.views.length === 0) {
    throw new Error(`Invalid visual baseline manifest at ${source}: at least one view is required`);
  }
  const viewIds = new Set<string>();
  for (const view of value.views) {
    const size = isRecord(view) ? view.clientSize : null;
    if (!isRecord(view) || !isNonEmptyString(view.id) || !isNonEmptyString(view.project)
      || !isNonEmptyString(view.page) || !isNonEmptyString(view.state)
      || !isNonEmptyString(view.captureInstructions) || !isRecord(size)
      || !isPositiveInteger(size.width) || !isPositiveInteger(size.height)) {
      throw new Error(`Invalid visual baseline manifest at ${source}: view entry is incomplete`);
    }
    if (viewIds.has(view.id)) {
      throw new Error(`Invalid visual baseline manifest at ${source}: duplicate view ${view.id}`);
    }
    viewIds.add(view.id);
  }
}

async function loadPng(path: string, baselineRoot: string): Promise<FileLoad<LoadedPng>> {
  try {
    const raw = await readFile(path);
    const png = PNG.sync.read(raw);
    return {
      kind: "loaded",
      value: {
        info: { path: displayPath(path, baselineRoot), width: png.width, height: png.height },
        data: png.data,
      },
    };
  } catch (error) {
    if (isMissingFileError(error)) return { kind: "missing" };
    return { kind: "invalid", reason: errorMessage(error) };
  }
}

async function loadReview(path: string): Promise<FileLoad<VisualManualReview>> {
  try {
    const raw = await readFile(path, "utf8");
    const parsed: unknown = JSON.parse(raw);
    validateReview(parsed);
    return { kind: "loaded", value: parsed };
  } catch (error) {
    if (isMissingFileError(error)) return { kind: "missing" };
    return { kind: "invalid", reason: errorMessage(error) };
  }
}

function validateReview(value: unknown): asserts value is VisualManualReview {
  if (!isRecord(value) || value.schemaVersion !== 1 || !isNonEmptyString(value.reviewer)
    || !isNonEmptyString(value.reviewedAt) || typeof value.textAndIconsExact !== "boolean"
    || !isRatio(value.geometryCoverage) || typeof value.clientAreaExact !== "boolean"
    || typeof value.noLayoutDefects !== "boolean" || typeof value.stateMatches !== "boolean"
    || (value.notes !== undefined && (!Array.isArray(value.notes)
      || value.notes.some((note) => typeof note !== "string")))) {
    throw new Error("review must follow visual review schema version 1");
  }
}

function addImageLoadIssue(
  issues: VisualGateIssue[],
  load: FileLoad<LoadedPng>,
  kind: "native" | "web",
  path: string,
) {
  if (load.kind === "missing") {
    issues.push({
      code: kind === "native" ? "missing-native" : "missing-web",
      message: `${kind} PNG is missing: ${path}`,
    });
  } else if (load.kind === "invalid") {
    issues.push({
      code: kind === "native" ? "invalid-native" : "invalid-web",
      message: `${kind} PNG is invalid (${path}): ${load.reason}`,
    });
  }
}

function addReviewLoadIssue(
  issues: VisualGateIssue[],
  load: FileLoad<VisualManualReview>,
  path: string,
) {
  if (load.kind === "missing") {
    issues.push({ code: "missing-review", message: `manual review is missing: ${path}` });
  } else if (load.kind === "invalid") {
    issues.push({ code: "invalid-review", message: `manual review is invalid (${path}): ${load.reason}` });
  }
}

function addSizeIssue(
  issues: VisualGateIssue[],
  image: VisualImageInfo,
  expected: { width: number; height: number },
  kind: "native" | "web",
) {
  if (image.width === expected.width && image.height === expected.height) return;
  issues.push({
    code: kind === "native" ? "native-size-mismatch" : "web-size-mismatch",
    message: `${kind} PNG is ${image.width}×${image.height}; expected ${expected.width}×${expected.height}`,
  });
}

function addReviewIssues(
  issues: VisualGateIssue[],
  review: VisualManualReview,
  criteria: VisualBaselineManifest["criteria"],
) {
  if (!review.textAndIconsExact) {
    issues.push({ code: "text-or-icon-mismatch", message: "source-proven visible text or icons are not exact" });
  }
  if (review.geometryCoverage < criteria.minimumGeometryCoverage) {
    issues.push({
      code: "geometry-below-threshold",
      message: `geometry coverage ${formatPercent(review.geometryCoverage)} is below ${formatPercent(criteria.minimumGeometryCoverage)} at ±${criteria.geometryEdgeTolerancePx}px`,
    });
  }
  if (!review.clientAreaExact) {
    issues.push({ code: "client-area-mismatch", message: "client area or page-level scrollbar does not match" });
  }
  if (!review.noLayoutDefects) {
    issues.push({ code: "layout-defect", message: "clipping, overlap or out-of-container content remains" });
  }
  if (!review.stateMatches) {
    issues.push({ code: "state-mismatch", message: "selected, enabled, read-only or ToolTip state does not match" });
  }
}

function resultStatus(issues: VisualGateIssue[]): VisualGateStatus {
  if (issues.some((issue) => !issue.code.startsWith("missing-"))) return "failed";
  return issues.length > 0 ? "blocked" : "passed";
}

function comparePixels(
  native: LoadedPng,
  web: LoadedPng,
  channelThreshold: number,
): VisualPixelDiagnostic {
  const pixels = native.info.width * native.info.height;
  let differentPixels = 0;
  let absoluteError = 0;
  let squaredError = 0;
  for (let offset = 0; offset < native.data.length; offset += 4) {
    let different = false;
    for (let channel = 0; channel < 3; channel += 1) {
      const delta = Math.abs(native.data[offset + channel] - web.data[offset + channel]);
      absoluteError += delta;
      squaredError += delta * delta;
      if (delta > channelThreshold) different = true;
    }
    if (different) differentPixels += 1;
  }
  return {
    channelThreshold,
    differentPixels,
    differentPixelRatio: round(differentPixels / pixels),
    meanAbsoluteError: round(absoluteError / (pixels * 3 * 255)),
    rootMeanSquareError: round(Math.sqrt(squaredError / (pixels * 3)) / 255),
  };
}

function displayPath(path: string, baselineRoot: string): string {
  return relative(baselineRoot, path) || ".";
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

function round(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function escapeCell(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\n", " ");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isPositiveNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) > 0;
}

function isRatio(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

function isChannel(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 255;
}

function isMissingFileError(error: unknown): boolean {
  return isRecord(error) && error.code === "ENOENT";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
