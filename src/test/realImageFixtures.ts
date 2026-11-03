import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import jpeg from 'jpeg-js';
import type { PixelFrame } from '../domain/imageQuality';
import type { SegmentationRoi } from '../experimental/segmentation';

export type FixtureCategory = 'usable' | 'difficult' | 'inadequate';

export interface RealImageFixture {
  id: string;
  file: string;
  sha256: string;
  sourcePage: string;
  author: string;
  license: string;
  licenseUrl: string | null;
  category: FixtureCategory;
  lateral: boolean;
  fullBody: boolean;
  target: string;
  notes: string;
  roi: SegmentationRoi;
}

export interface RealImageManifest {
  schemaVersion: string;
  retrievedAt: string;
  note: string;
  images: RealImageFixture[];
}

const ROOT = process.cwd();
const FIXTURE_DIR = resolve(ROOT, 'experimental/fixtures/images');

export function loadManifest(): RealImageManifest {
  const text = readFileSync(resolve(FIXTURE_DIR, 'manifest.json'), 'utf8');
  return JSON.parse(text) as RealImageManifest;
}

export function fixturePath(file: string): string {
  return resolve(FIXTURE_DIR, file);
}

export function loadAndCheckFixtures(): RealImageFixture[] {
  const manifest = loadManifest();
  for (const fixture of manifest.images) {
    const path = fixturePath(fixture.file);
    if (!existsSync(path)) {
      throw new Error(`Fixture ausente: ${fixture.file}`);
    }
    const bytes = readFileSync(path);
    const hash = createHash('sha256').update(bytes).digest('hex');
    if (hash !== fixture.sha256) {
      throw new Error(`SHA-256 divergente para ${fixture.file}`);
    }
    if (!fixture.roi || fixture.roi.width <= 0 || fixture.roi.height <= 0) {
      throw new Error(`ROI inválida em ${fixture.file}`);
    }
  }
  return manifest.images;
}

export function decodeFixture(fixture: RealImageFixture): PixelFrame {
  const decoded = jpeg.decode(readFileSync(fixturePath(fixture.file)), {
    useTArray: true,
    formatAsRGBA: true,
  });
  if (!decoded.width || !decoded.height) {
    throw new Error(`JPEG inválido: ${fixture.file}`);
  }
  return {
    width: decoded.width,
    height: decoded.height,
    data: new Uint8ClampedArray(decoded.data),
  };
}
