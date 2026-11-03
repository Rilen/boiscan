import { describe, expect, it } from 'vitest';
import type { PixelFrame } from '../domain/imageQuality';
import { analyzeExperimentalFrame } from './pipeline';
import { makeModelArtifact } from '../test/experimentalFixtures';
import type { ScaleReference } from './types';

function blankFrame(width = 120, height = 80): PixelFrame {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    data[i * 4] = 30;
    data[i * 4 + 1] = 60;
    data[i * 4 + 2] = 30;
    data[i * 4 + 3] = 255;
  }
  return { data, width, height };
}

function rectangleFrame(
  x: number,
  y: number,
  w: number,
  h: number,
  width = 120,
  height = 80,
): PixelFrame {
  const frame = blankFrame(width, height);
  for (let row = y; row < y + h; row += 1) {
    for (let col = x; col < x + w; col += 1) {
      const offset = (row * width + col) * 4;
      frame.data[offset] = 150;
      frame.data[offset + 1] = 90;
      frame.data[offset + 2] = 40;
    }
  }
  return frame;
}

const scale: ScaleReference = {
  type: 'known-length-marker',
  knownLengthCm: 120,
  start: { x: 0.2, y: 0.5 },
  end: { x: 0.7, y: 0.5 },
  uncertaintyCm: 0.5,
  samePlaneAsAnimal: true,
};

describe('pipeline experimental local', () => {
  it('extrai características, calibra escala e prevê com artefato válido', () => {
    const result = analyzeExperimentalFrame(rectangleFrame(20, 20, 80, 36), {
      scaleReference: scale,
      model: makeModelArtifact(),
    });

    expect(result.status).toBe('predicted');
    if (result.status === 'predicted') {
      expect(result.features.bodyLengthCm).toBeGreaterThan(150);
      expect(result.features.bodyHeightCm).toBeGreaterThan(60);
      expect(result.scale.reliable).toBe(true);
      expect(result.prediction.liveWeightKg).toBeCloseTo(500, 6);
      expect(result.prediction.interval?.coveragePercent).toBe(90);
      expect(result.synthetic).toBe(false);
    }
  });

  it('para antes do peso quando falta escala', () => {
    const result = analyzeExperimentalFrame(rectangleFrame(20, 20, 80, 36), {
      model: makeModelArtifact(),
    });
    expect(result.status).toBe('features-only');
    if (result.status === 'features-only') {
      expect(result.reasons).toContain('scale-required');
      expect(result.features.bodyLengthCm).toBeUndefined();
      expect(result.message).toMatch(/Nenhum peso/);
    }
  });

  it('para antes do peso quando falta modelo', () => {
    const result = analyzeExperimentalFrame(rectangleFrame(20, 20, 80, 36), {
      scaleReference: scale,
    });
    expect(result.status).toBe('features-only');
    if (result.status === 'features-only') {
      expect(result.reasons).toContain('model-required');
      expect(result.features.bodyLengthCm).toBeDefined();
    }
  });

  it('recusa escala não confiável e não calcula peso', () => {
    const result = analyzeExperimentalFrame(rectangleFrame(20, 20, 80, 36), {
      scaleReference: { ...scale, knownLengthCm: 1, uncertaintyCm: 0.5 },
      model: makeModelArtifact(),
    });
    expect(result.status).toBe('features-only');
    if (result.status === 'features-only') {
      expect(result.reasons).toContain('scale-unreliable');
    }
  });

  it('rejeita fundo mal separado', () => {
    const result = analyzeExperimentalFrame(blankFrame(), {
      scaleReference: scale,
      model: makeModelArtifact(),
    });
    expect(result.status).toBe('rejected');
    if (result.status === 'rejected') {
      expect(result.reason).toBe('segmentation-empty');
    }
  });

  it('rejeita silhueta pequena e orientação vertical', () => {
    const small = analyzeExperimentalFrame(rectangleFrame(20, 20, 20, 10), {
      scaleReference: scale,
      model: makeModelArtifact(),
      minimumMaskAreaPx: 1000,
    });
    expect(small.status).toBe('rejected');

    const vertical = analyzeExperimentalFrame(rectangleFrame(42, 5, 36, 70), {
      scaleReference: scale,
      model: makeModelArtifact(),
      minimumMaskAreaPx: 1000,
    });
    expect(vertical.status).toBe('rejected');
    if (vertical.status === 'rejected') {
      expect(vertical.reason).toBe('orientation');
    }
  });

  it('não extrapola quando as medidas saem do domínio do modelo', () => {
    const artifact = makeModelArtifact({
      trainingRanges: {
        ...makeModelArtifact().trainingRanges,
        body_length_cm: { min: 0, max: 10 },
      },
    });
    const result = analyzeExperimentalFrame(rectangleFrame(20, 20, 80, 36), {
      scaleReference: scale,
      model: artifact,
    });
    expect(result.status).toBe('prediction-unavailable');
    if (result.status === 'prediction-unavailable') {
      expect(result.reason).toBe('out-of-domain');
      expect(result.message).toMatch(/Nenhum peso/);
    }
  });

  it('rejeita frame inválido', () => {
    const result = analyzeExperimentalFrame({
      width: 10,
      height: 10,
      data: new Uint8ClampedArray(10),
    });
    expect(result.status).toBe('rejected');
    if (result.status === 'rejected') expect(result.reason).toBe('invalid-frame');
  });

  it('propaga aviso de artefato sintético', () => {
    const result = analyzeExperimentalFrame(rectangleFrame(20, 20, 80, 36), {
      scaleReference: scale,
      model: makeModelArtifact({ synthetic: true }),
    });
    expect(result.status).toBe('predicted');
    if (result.status === 'predicted') {
      expect(result.synthetic).toBe(true);
      expect(result.warnings.join(' ')).toMatch(/sintético/);
    }
  });
});
