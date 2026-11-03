import { describe, expect, it } from 'vitest';
import { applyScaleToFeatures, extractMorphometrics } from './morphometrics';
import { createMask, MaskError } from './mask';
import { makeFeatures } from '../test/experimentalFixtures';
import type { BinaryMask, ScaleCalibration } from './types';

function rectangle(
  width: number,
  height: number,
  x: number,
  y: number,
  w: number,
  h: number,
): BinaryMask {
  const mask = createMask(width, height);
  for (let row = y; row < y + h; row += 1) {
    for (let col = x; col < x + w; col += 1) {
      mask.data[row * width + col] = 1;
    }
  }
  return mask;
}

describe('morfometria da silhueta', () => {
  it('calcula geometria de um retângulo horizontal', () => {
    const features = extractMorphometrics(rectangle(100, 60, 10, 10, 40, 20), 200, 100);

    expect(features.maskAreaPx).toBe(800);
    expect(features.bbox).toEqual({ x: 10, y: 10, width: 40, height: 20 });
    expect(features.bodyLengthPx).toBe(40);
    expect(features.bodyHeightPx).toBe(20);
    expect(features.perimeterPx).toBe(120);
    expect(features.fillRatio).toBe(1);
    expect(features.compactness).toBeCloseTo((4 * Math.PI * 800) / (120 * 120), 6);
    expect(features.majorAxisPx).toBeCloseTo(40, 6);
    expect(features.minorAxisPx).toBeCloseTo(20, 6);
    expect(features.axisRatio).toBeCloseTo(2, 6);
    expect(features.orientationDeg).toBeCloseTo(0, 6);
    expect(features.maxWidthPx).toBe(20);
    expect(features.widthAt50PctPx).toBe(20);
    expect(features.symmetry).toBe(1);
    expect(features.componentCount).toBe(1);
    expect(features.imageWidth).toBe(200);
  });

  it('detecta silhueta vertical e componentes múltiplos', () => {
    const mask = rectangle(100, 100, 40, 10, 20, 60);
    for (let y = 75; y < 85; y += 1) {
      for (let x = 5; x < 10; x += 1) {
        mask.data[y * 100 + x] = 1;
      }
    }
    const features = extractMorphometrics(mask);
    expect(Math.abs(features.orientationDeg)).toBeGreaterThan(55);
    expect(features.componentCount).toBe(2);
  });

  it('aplica escala física de forma determinística', () => {
    const features = extractMorphometrics(rectangle(100, 60, 10, 10, 40, 20));
    const calibration: ScaleCalibration = {
      cmPerPixel: 2,
      pixelLength: 100,
      relativeUncertainty: 0.01,
      uncertaintyCmPerPixel: 0.02,
      reliable: true,
      warnings: [],
    };
    const scaled = applyScaleToFeatures(features, calibration);
    expect(scaled.bodyLengthCm).toBe(80);
    expect(scaled.bodyHeightCm).toBe(40);
    expect(scaled.maskAreaCm2).toBe(3200);
    expect(scaled.majorAxisCm).toBe(80);
    expect(scaled.widthAt50PctCm).toBe(40);
    expect(scaled.cmPerPixel).toBe(2);
  });

  it('rejeita máscara vazia ou buffer inválido', () => {
    expect(() => extractMorphometrics(createMask(10, 10))).toThrow(MaskError);
    expect(() =>
      extractMorphometrics({ width: 2, height: 2, data: new Uint8Array(3) }),
    ).toThrow(MaskError);
  });

  it('expõe campos físicos opcionais no fixture', () => {
    const features = makeFeatures();
    expect(features.bodyLengthCm).toBe(160);
    expect(features.axisRatio).toBe(2);
  });
});
