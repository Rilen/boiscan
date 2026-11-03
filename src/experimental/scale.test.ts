import { describe, expect, it } from 'vitest';
import { calibrateScale } from './scale';
import type { ScaleReference } from './types';

function reference(overrides: Partial<ScaleReference> = {}): ScaleReference {
  return {
    type: 'known-length-marker',
    knownLengthCm: 20,
    start: { x: 0.2, y: 0.8 },
    end: { x: 0.6, y: 0.8 },
    uncertaintyCm: 0.2,
    samePlaneAsAnimal: true,
    ...overrides,
  };
}

describe('calibração de escala física', () => {
  it('converte pontos normalizados em cm/pixel', () => {
    const result = calibrateScale(reference(), 1000, 800);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.calibration.pixelLength).toBeCloseTo(400, 6);
      expect(result.calibration.cmPerPixel).toBeCloseTo(0.05, 8);
      expect(result.calibration.reliable).toBe(true);
      expect(result.calibration.relativeUncertainty).toBeLessThan(0.1);
    }
  });

  it('mantém a escala independente da resolução ao normalizar os pontos', () => {
    const small = calibrateScale(reference(), 500, 400);
    const large = calibrateScale(reference(), 2000, 1600);
    expect(small.ok && large.ok).toBe(true);
    if (small.ok && large.ok) {
      expect(small.calibration.cmPerPixel).toBeCloseTo(
        large.calibration.cmPerPixel * 4,
        6,
      );
    }
  });

  it('rejeita comprimento, pontos e plano inválidos', () => {
    expect(calibrateScale(reference({ knownLengthCm: 0 }), 1000, 800)).toMatchObject({
      ok: false,
      code: 'invalid-length',
    });
    expect(
      calibrateScale(reference({ start: { x: -0.1, y: 0.5 } }), 1000, 800),
    ).toMatchObject({ ok: false, code: 'outside-image' });
    expect(
      calibrateScale(reference({ samePlaneAsAnimal: false }), 1000, 800),
    ).toMatchObject({ ok: false, code: 'different-plane' });
    expect(
      calibrateScale(reference({ start: { x: 0.5, y: 0.5 }, end: { x: 0.5, y: 0.5 } }), 1000, 800),
    ).toMatchObject({ ok: false, code: 'short-reference' });
  });

  it('marca referência com incerteza relativa alta como não confiável', () => {
    const result = calibrateScale(
      reference({ knownLengthCm: 1, uncertaintyCm: 0.5 }),
      1000,
      800,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.calibration.relativeUncertainty).toBeGreaterThan(0.1);
      expect(result.calibration.reliable).toBe(false);
      expect(result.calibration.warnings.length).toBeGreaterThan(0);
    }
  });

  it('avisa sobre medida corporal e calibração por câmera', () => {
    const body = calibrateScale(reference({ type: 'body-measurement' }), 1000, 800);
    const camera = calibrateScale(reference({ type: 'camera-calibration' }), 1000, 800);
    expect(body.ok && camera.ok).toBe(true);
    if (body.ok && camera.ok) {
      expect(body.calibration.warnings.join(' ')).toMatch(/fita métrica/);
      expect(camera.calibration.warnings.join(' ')).toMatch(/marcador físico/);
    }
  });

  it('rejeita dimensões de imagem inválidas', () => {
    expect(calibrateScale(reference(), 0, 800)).toMatchObject({
      ok: false,
      code: 'invalid-pixels',
    });
  });
});
