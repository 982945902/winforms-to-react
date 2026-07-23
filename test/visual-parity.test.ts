import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { PNG } from "pngjs";
import { afterEach, describe, expect, it } from "vitest";
import {
  evaluateVisualGate,
  formatVisualGateMarkdown,
  type VisualBaselineManifest,
  type VisualManualReview,
  writeVisualGateReport,
} from "../src/visual/visualParity.js";

const cleanup: string[] = [];

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("native visual parity gate", () => {
  it("blocks explicitly when required native, web and review evidence is missing", async () => {
    const fixture = await createFixture();
    const report = await evaluateVisualGate(fixture.manifestPath);

    expect(report.status).toBe("blocked");
    expect(report.summary).toEqual({ requiredChecks: 2, passed: 0, failed: 0, blocked: 2 });
    expect(report.views[0].targets[0].issues.map((issue) => issue.code)).toEqual([
      "missing-native",
      "missing-web",
      "missing-review",
    ]);
    expect(formatVisualGateMarkdown(report)).toContain("Gate status: **BLOCKED**");
  });

  it("passes only when both targets have exact-size PNGs and passing manual reviews", async () => {
    const fixture = await createFixture();
    await writeEvidence(fixture.root, "refine", [20, 40, 60], passingReview());
    await writeEvidence(fixture.root, "nocobase", [20, 40, 60], passingReview());

    const report = await evaluateVisualGate(fixture.manifestPath);

    expect(report.status).toBe("passed");
    expect(report.summary).toEqual({ requiredChecks: 2, passed: 2, failed: 0, blocked: 0 });
    expect(report.views[0].targets[0].pixelDiagnostic).toMatchObject({
      differentPixels: 0,
      differentPixelRatio: 0,
      meanAbsoluteError: 0,
      rootMeanSquareError: 0,
    });

    const output = await writeVisualGateReport(report, resolve(fixture.root, "report"));
    expect(JSON.parse(await readFile(output.jsonPath, "utf8")).status).toBe("passed");
    expect(await readFile(output.markdownPath, "utf8")).toContain("| sample | refine | passed |");
  });

  it("fails measured review criteria while retaining pixel difference as diagnostics", async () => {
    const fixture = await createFixture();
    await writeEvidence(fixture.root, "refine", [200, 10, 20], {
      ...passingReview(),
      geometryCoverage: 0.94,
      stateMatches: false,
    });
    await writeEvidence(fixture.root, "nocobase", [20, 40, 60], passingReview());

    const report = await evaluateVisualGate(fixture.manifestPath);
    const refine = report.views[0].targets[0];

    expect(report.status).toBe("failed");
    expect(refine.status).toBe("failed");
    expect(refine.issues.map((issue) => issue.code)).toEqual([
      "geometry-below-threshold",
      "state-mismatch",
    ]);
    expect(refine.pixelDiagnostic?.differentPixelRatio).toBe(1);
  });

  it("rejects duplicate view identifiers before evaluating files", async () => {
    const fixture = await createFixture();
    const manifest = JSON.parse(await readFile(fixture.manifestPath, "utf8")) as VisualBaselineManifest;
    manifest.views.push({ ...manifest.views[0] });
    await writeFile(fixture.manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

    await expect(evaluateVisualGate(fixture.manifestPath)).rejects.toThrow("duplicate view sample");
  });

});

async function createFixture() {
  const root = await mkdtemp(resolve(tmpdir(), "wf2-visual-gate-"));
  cleanup.push(root);
  const manifest: VisualBaselineManifest = {
    schemaVersion: 1,
    nativeDirectory: "native",
    capture: {
      dpi: 96,
      displayScalePercent: 100,
      browserZoomPercent: 100,
      theme: "Windows light",
    },
    criteria: {
      minimumGeometryCoverage: 0.95,
      geometryEdgeTolerancePx: 4,
      pixelChannelThreshold: 16,
    },
    targets: [
      { id: "refine", label: "Refine", webDirectory: "web/refine", reviewDirectory: "reviews/refine" },
      { id: "nocobase", label: "NocoBase", webDirectory: "web/nocobase", reviewDirectory: "reviews/nocobase" },
    ],
    views: [{
      id: "sample",
      project: "Fixture",
      page: "SampleForm",
      state: "default",
      captureInstructions: "Open the default state.",
      clientSize: { width: 3, height: 2 },
    }],
  };
  const manifestPath = resolve(root, "manifest.json");
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return { root, manifestPath };
}

async function writeEvidence(
  root: string,
  target: string,
  webColor: [number, number, number],
  review: VisualManualReview,
) {
  const nativeDirectory = resolve(root, "native");
  const webDirectory = resolve(root, "web", target);
  const reviewDirectory = resolve(root, "reviews", target);
  await Promise.all([
    mkdir(nativeDirectory, { recursive: true }),
    mkdir(webDirectory, { recursive: true }),
    mkdir(reviewDirectory, { recursive: true }),
  ]);
  await Promise.all([
    writeFile(resolve(nativeDirectory, "sample@96dpi.png"), png(3, 2, [20, 40, 60])),
    writeFile(resolve(webDirectory, "sample@96dpi.png"), png(3, 2, webColor)),
    writeFile(resolve(reviewDirectory, "sample.json"), `${JSON.stringify(review, null, 2)}\n`, "utf8"),
  ]);
}

function passingReview(): VisualManualReview {
  return {
    schemaVersion: 1,
    reviewer: "test",
    reviewedAt: "2026-07-16T00:00:00.000Z",
    textAndIconsExact: true,
    geometryCoverage: 0.95,
    clientAreaExact: true,
    noLayoutDefects: true,
    stateMatches: true,
    notes: [],
  };
}

function png(width: number, height: number, color: [number, number, number]): Buffer {
  const image = new PNG({ width, height });
  for (let offset = 0; offset < image.data.length; offset += 4) {
    image.data[offset] = color[0];
    image.data[offset + 1] = color[1];
    image.data[offset + 2] = color[2];
    image.data[offset + 3] = 255;
  }
  return PNG.sync.write(image);
}
