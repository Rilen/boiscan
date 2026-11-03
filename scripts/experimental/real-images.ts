import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import jpeg from 'jpeg-js';
import {
  decodeFixture,
  loadAndCheckFixtures,
  type RealImageFixture,
} from '../../src/test/realImageFixtures';
import { analyzeExperimentalFrame } from '../../src/experimental/pipeline';
import { segmentForeground } from '../../src/experimental/segmentation';
import { extractMorphometrics } from '../../src/experimental/morphometrics';

function overlayMask(
  frame: { data: Uint8ClampedArray; width: number; height: number },
  mask: Uint8Array,
  roi: { x: number; y: number; width: number; height: number },
): Uint8Array {
  const output = new Uint8Array(frame.data.length);
  const roiX0 = Math.floor(roi.x * frame.width);
  const roiY0 = Math.floor(roi.y * frame.height);
  const roiX1 = Math.min(frame.width - 1, Math.ceil((roi.x + roi.width) * frame.width) - 1);
  const roiY1 = Math.min(frame.height - 1, Math.ceil((roi.y + roi.height) * frame.height) - 1);

  for (let i = 0; i < frame.width * frame.height; i += 1) {
    const offset = i * 4;
    const foreground = mask[i] === 1;
    output[offset] = foreground
      ? Math.round((frame.data[offset] ?? 0) * 0.45 + 220 * 0.55)
      : (frame.data[offset] ?? 0);
    output[offset + 1] = foreground
      ? Math.round((frame.data[offset + 1] ?? 0) * 0.45 + 40 * 0.55)
      : (frame.data[offset + 1] ?? 0);
    output[offset + 2] = foreground
      ? Math.round((frame.data[offset + 2] ?? 0) * 0.45 + 40 * 0.55)
      : (frame.data[offset + 2] ?? 0);
    output[offset + 3] = 255;
  }

  const paint = (x: number, y: number): void => {
    if (x < 0 || y < 0 || x >= frame.width || y >= frame.height) return;
    const offset = (y * frame.width + x) * 4;
    output[offset] = 40;
    output[offset + 1] = 230;
    output[offset + 2] = 120;
    output[offset + 3] = 255;
  };
  for (let x = roiX0; x <= roiX1; x += 1) {
    paint(x, roiY0);
    paint(x, roiY1);
  }
  for (let y = roiY0; y <= roiY1; y += 1) {
    paint(roiX0, y);
    paint(roiX1, y);
  }
  return output;
}

function summarize(fixture: RealImageFixture): Record<string, unknown> {
  const frame = decodeFixture(fixture);
  const segmentation = segmentForeground(frame, { roi: fixture.roi });
  let features: ReturnType<typeof extractMorphometrics> | null = null;
  let featureError: string | null = null;
  try {
    features = extractMorphometrics(segmentation.mask, frame.width, frame.height);
  } catch (error) {
    featureError = error instanceof Error ? error.message : 'erro de morfometria';
  }
  const pipeline = analyzeExperimentalFrame(frame, {
    segment: () => segmentation,
    segmentationRoi: fixture.roi,
  });
  return {
    id: fixture.id,
    category: fixture.category,
    target: fixture.target,
    image: { width: frame.width, height: frame.height },
    roi: fixture.roi,
    segmentation: segmentation.diagnostics,
    features: features
      ? {
          maskAreaPx: features.maskAreaPx,
          bodyLengthPx: features.bodyLengthPx,
          bodyHeightPx: features.bodyHeightPx,
          majorAxisPx: features.majorAxisPx,
          minorAxisPx: features.minorAxisPx,
          orientationDeg: features.orientationDeg,
          fillRatio: features.fillRatio,
        }
      : null,
    featureError,
    pipeline: {
      status: pipeline.status,
      reason: pipeline.status === 'rejected' ? pipeline.reason : undefined,
      message: pipeline.message,
    },
    overlay: `experimental-output/real-images/${fixture.id}-mask.jpg`,
  };
}

function main(): void {
  const fixtures = loadAndCheckFixtures();
  const outputDir = resolve('experimental-output/real-images');
  mkdirSync(outputDir, { recursive: true });
  const results: Array<Record<string, unknown>> = [];

  for (const fixture of fixtures) {
    const frame = decodeFixture(fixture);
    const segmentation = segmentForeground(frame, { roi: fixture.roi });
    const overlay = overlayMask(frame, segmentation.mask.data, fixture.roi);
    const encoded = jpeg.encode(
      { data: Buffer.from(overlay), width: frame.width, height: frame.height },
      80,
    );
    writeFileSync(resolve(outputDir, `${fixture.id}-mask.jpg`), encoded.data);
    const summary = summarize(fixture);
    results.push(summary);
    const seg = summary.segmentation as {
      foregroundRatio: number;
      borderTouchRatio: number;
      componentCount: number;
      warnings: string[];
    };
    const features = summary.features as { orientationDeg: number; maskAreaPx: number } | null;
    console.log(
      [
        fixture.id.padEnd(24),
        fixture.category.padEnd(10),
        `area=${features?.maskAreaPx ?? 0}`.padEnd(14),
        `fg=${seg.foregroundRatio.toFixed(3)}`.padEnd(12),
        `border=${seg.borderTouchRatio.toFixed(3)}`.padEnd(15),
        `orient=${features?.orientationDeg.toFixed(1) ?? '—'}`.padEnd(15),
        `status=${String((summary.pipeline as { status: string }).status)}`,
      ].join(' '),
    );
    if (seg.warnings.length > 0) {
      console.log(`  avisos: ${seg.warnings.join(' | ')}`);
    }
    if (summary.featureError) {
      console.log(`  morfometria: ${String(summary.featureError)}`);
    }
  }

  writeFileSync(
    resolve(outputDir, 'report.json'),
    `${JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2)}\n`,
    'utf8',
  );
  console.log(`\nRelatório: ${outputDir}`);
  console.log('Nenhuma imagem foi enviada a serviços externos.');
}

main();
