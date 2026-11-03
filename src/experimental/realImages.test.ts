import { describe, expect, it } from 'vitest';
import {
  decodeFixture,
  loadAndCheckFixtures,
  type RealImageFixture,
} from '../test/realImageFixtures';
import { segmentForeground } from './segmentation';
import { extractMorphometrics } from './morphometrics';
import { analyzeExperimentalFrame } from './pipeline';

const fixtures = loadAndCheckFixtures();
const cache = new Map<
  string,
  {
    frame: ReturnType<typeof decodeFixture>;
    segmentation: ReturnType<typeof segmentForeground>;
  }
>();

function byId(id: string): RealImageFixture {
  const fixture = fixtures.find((item) => item.id === id);
  if (!fixture) throw new Error(`Fixture ausente: ${id}`);
  return fixture;
}

function analyze(fixture: RealImageFixture) {
  const cached = cache.get(fixture.id);
  if (cached) return cached;
  const frame = decodeFixture(fixture);
  const segmentation = segmentForeground(frame, { roi: fixture.roi });
  const value = { frame, segmentation };
  cache.set(fixture.id, value);
  return value;
}

describe('fotografias reais licenciadas', () => {
  it('registra cinco imagens com categoria, licença e ROI', () => {
    expect(fixtures).toHaveLength(5);
    expect(fixtures.map((item) => item.category)).toEqual(
      expect.arrayContaining(['usable', 'difficult', 'inadequate']),
    );
    for (const fixture of fixtures) {
      expect(fixture.license.length).toBeGreaterThan(0);
      expect(fixture.sourcePage).toMatch(/^https:\/\/commons\.wikimedia\.org\//);
      expect(fixture.roi.width).toBeGreaterThan(0);
      expect(fixture.roi.height).toBeGreaterThan(0);
    }
  });

  it(
    'decodifica e segmenta imagens reais sem enviar pixels a terceiros',
    () => {
      for (const fixture of fixtures) {
        const { frame, segmentation } = analyze(fixture);
        expect(frame.width).toBeGreaterThan(300);
        expect(frame.height).toBeGreaterThan(200);
        expect(segmentation.mask.width).toBe(frame.width);
        expect(segmentation.mask.height).toBe(frame.height);
        expect(segmentation.diagnostics.foregroundRatio).toBeGreaterThanOrEqual(0);
        expect(segmentation.diagnostics.foregroundRatio).toBeLessThanOrEqual(1);
      }
    },
    30_000,
  );

  it('extrai morfometria parcial das imagens usáveis e difíceis', () => {
    for (const id of [
      'holstein-1920s',
      'bos-indicus-brazil',
      'brahman-pasture',
      'beef-cattle-ayr-1989',
    ]) {
      const fixture = byId(id);
      const { frame, segmentation } = analyze(fixture);
      const features = extractMorphometrics(
        segmentation.mask,
        frame.width,
        frame.height,
      );
      expect(features.maskAreaPx).toBeGreaterThan(0);
      expect(features.bbox.width).toBeGreaterThan(0);
      expect(features.bbox.height).toBeGreaterThan(0);
      expect(features.orientationDeg).toBeGreaterThanOrEqual(-90);
      expect(features.orientationDeg).toBeLessThanOrEqual(90);
    }
  });

  it('não transforma imagem real em peso sem escala e modelo', () => {
    for (const fixture of fixtures) {
      const { frame, segmentation } = analyze(fixture);
      const result = analyzeExperimentalFrame(frame, {
        segment: () => segmentation,
        segmentationRoi: fixture.roi,
      });
      expect(['features-only', 'rejected']).toContain(result.status);
      expect('liveWeightKg' in result).toBe(false);
      expect(result.status).not.toBe('predicted');
    }
  });

  it('rejeita o caso frontal inadequado no pipeline padrão', () => {
    const fixture = byId('instituto-frontal');
    const { frame, segmentation } = analyze(fixture);
    const result = analyzeExperimentalFrame(frame, {
      segment: () => segmentation,
      segmentationRoi: fixture.roi,
    });
    expect(result.status).toBe('rejected');
  });

  it('mantém a máscara dentro da ROI fornecida', () => {
    const fixture = byId('bos-indicus-brazil');
    const { frame, segmentation } = analyze(fixture);
    const x0 = Math.floor(fixture.roi.x * frame.width);
    const y0 = Math.floor(fixture.roi.y * frame.height);
    const x1 = Math.min(
      frame.width - 1,
      Math.ceil((fixture.roi.x + fixture.roi.width) * frame.width) - 1,
    );
    const y1 = Math.min(
      frame.height - 1,
      Math.ceil((fixture.roi.y + fixture.roi.height) * frame.height) - 1,
    );
    for (let y = 0; y < frame.height; y += 20) {
      for (let x = 0; x < frame.width; x += 20) {
        if (x < x0 || x > x1 || y < y0 || y > y1) {
          expect(segmentation.mask.data[y * frame.width + x]).toBe(0);
        }
      }
    }
  });
});
