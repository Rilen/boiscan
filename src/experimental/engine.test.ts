import { describe, expect, it, vi } from 'vitest';
import { unknownQuality } from '../domain/imageQuality';
import type { EstimationRequest } from '../engine/types';
import { createExperimentalEngine } from './engine';
import type { ExperimentalPipelineResult } from './pipeline';
import { makeFeatures, makeModelArtifact } from '../test/experimentalFixtures';
import type { ScaleReference, ScaleCalibration } from './types';

const scaleReference: ScaleReference = {
  type: 'known-length-marker',
  knownLengthCm: 100,
  start: { x: 0.2, y: 0.8 },
  end: { x: 0.6, y: 0.8 },
  samePlaneAsAnimal: true,
};

const scaleCalibration: ScaleCalibration = {
  cmPerPixel: 0.5,
  pixelLength: 200,
  relativeUncertainty: 0.01,
  uncertaintyCmPerPixel: 0.005,
  reliable: true,
  warnings: [],
};

const baseRequest: EstimationRequest = {
  image: new File([new Uint8Array([1, 2, 3])], 'boi.jpg', { type: 'image/jpeg' }),
  fileName: 'boi.jpg',
  width: 1200,
  height: 800,
  rotation: 0,
  quality: unknownQuality(),
  dressingPercent: 52,
  scaleReference,
};

const diagnostics = {
  threshold: 28,
  backgroundRgb: [30, 60, 30] as [number, number, number],
  foregroundRatio: 0.3,
  roi: { x: 0, y: 0, width: 1, height: 1 },
  borderTouchRatio: 0,
  componentCount: 1,
  removedPixels: 0,
  warnings: [],
};

function predictedResult(
  synthetic: boolean,
): Extract<ExperimentalPipelineResult, { status: 'predicted' }> {
  return {
    status: 'predicted',
    prediction: {
      liveWeightKg: 512.34,
      interval: { lowerKg: 480, upperKg: 544, coveragePercent: 90 },
    },
    scale: scaleCalibration,
    synthetic,
    segmentation: diagnostics,
    features: makeFeatures(),
    warnings: synthetic ? ['artefato sintético'] : [],
  };
}

describe('adaptador do motor experimental', () => {
  it('nunca retorna status validado e preserva estado experimental', async () => {
    const engine = createExperimentalEngine({
      model: makeModelArtifact(),
      analyze: async () => predictedResult(false),
    });
    const result = await engine.estimate(baseRequest);

    expect(engine.availability).toBe('experimental');
    expect(result.status).toBe('experimental');
    if (result.status === 'experimental') {
      expect(result.model.validated).toBe(false);
      expect(result.simulated).toBe(false);
      expect(result.liveWeightKg).toBe(512.3);
      expect(result.interval?.lowerKg).toBe(480);
      expect(result.interval?.coveragePercent).toBe(90);
      expect(result.disclaimer).toMatch(/experimental/i);
    }
  });

  it('marca artefato sintético como simulação', async () => {
    const engine = createExperimentalEngine({
      model: makeModelArtifact({ synthetic: true }),
      analyze: async () => predictedResult(true),
    });
    const result = await engine.estimate(baseRequest);
    expect(result.status).toBe('experimental');
    if (result.status === 'experimental') {
      expect(result.simulated).toBe(true);
      expect(result.model.name).toMatch(/DEMONSTRAÇÃO SINTÉTICA/);
      expect(result.disclaimer).toMatch(/SIMULAÇÃO SINTÉTICA/);
    }
  });

  it('exige escala antes de chamar o analisador', async () => {
    const analyze = vi.fn(async () => predictedResult(false));
    const engine = createExperimentalEngine({
      model: makeModelArtifact(),
      analyze,
    });
    const result = await engine.estimate({
      ...baseRequest,
      scaleReference: undefined,
    });
    expect(result.status).toBe('unavailable');
    if (result.status === 'unavailable') {
      expect(result.reason).toBe('scale-reference-required');
    }
    expect(analyze).not.toHaveBeenCalled();
  });

  it('mapeia falhas do pipeline para indisponibilidade explicável', async () => {
    const scenarios: Array<{
      result: ExperimentalPipelineResult;
      reason: string;
    }> = [
      {
        result: {
          status: 'features-only',
          reasons: ['scale-unreliable'],
          message: 'Escala não confiável.',
          segmentation: diagnostics,
          features: makeFeatures(),
          warnings: [],
        },
        reason: 'scale-unreliable',
      },
      {
        result: {
          status: 'rejected',
          reason: 'segmentation-empty',
          message: 'Sem silhueta.',
        },
        reason: 'experimental-image-rejected',
      },
      {
        result: {
          status: 'prediction-unavailable',
          reason: 'out-of-domain',
          message: 'Fora do domínio.',
          segmentation: diagnostics,
          features: makeFeatures(),
          scale: scaleCalibration,
          warnings: [],
        },
        reason: 'experimental-out-of-domain',
      },
    ];

    for (const scenario of scenarios) {
      const engine = createExperimentalEngine({
        model: makeModelArtifact(),
        analyze: async () => scenario.result,
      });
      const result = await engine.estimate(baseRequest);
      expect(result.status).toBe('unavailable');
      if (result.status === 'unavailable') {
        expect(result.reason).toBe(scenario.reason);
        expect('liveWeightKg' in result).toBe(false);
      }
    }
  });

  it('recusa artefato inválido antes de analisar', async () => {
    const analyze = vi.fn(async () => predictedResult(false));
    const engine = createExperimentalEngine({
      model: makeModelArtifact({ validated: false, coefficients: [] }),
      analyze,
    });
    const result = await engine.estimate(baseRequest);
    expect(result.status).toBe('unavailable');
    if (result.status === 'unavailable') {
      expect(result.reason).toBe('experimental-model-unavailable');
    }
    expect(analyze).not.toHaveBeenCalled();
  });

  it('trata exceção do analisador como erro recuperável', async () => {
    const engine = createExperimentalEngine({
      model: makeModelArtifact(),
      analyze: async () => {
        throw new Error('falha');
      },
    });
    const result = await engine.estimate(baseRequest);
    expect(result.status).toBe('error');
    if (result.status === 'error') expect(result.recoverable).toBe(true);
    expect('liveWeightKg' in result).toBe(false);
  });
});
