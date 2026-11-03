import { describe, expect, it } from 'vitest';
import {
  computeRegressionMetrics,
  computeWeightBandMetrics,
  TrainingError,
  trainBaseline,
} from './training';
import { generateSyntheticDataset } from './synthetic';
import { validateModelArtifact } from './model';
import { makeFeatures } from '../test/experimentalFixtures';
import type { ExperimentalDatasetRecord } from './types';

const records = generateSyntheticDataset(42, 24);

describe('treinador experimental', () => {
  it('treina um baseline sintético reproduzível e marcado', () => {
    const first = trainBaseline(records, {
      synthetic: true,
      trainedAt: '2026-11-03T00:00:00.000Z',
    });
    const second = trainBaseline(records, {
      synthetic: true,
      trainedAt: '2026-11-03T00:00:00.000Z',
    });

    expect(first.model.synthetic).toBe(true);
    expect(first.model.validated).toBe(false);
    expect(first.model.features).toHaveLength(10);
    expect(first.model.coefficients).toHaveLength(10);
    expect(first.model.metrics.validation.n).toBe(24);
    expect(first.model.metrics.test.n).toBe(24);
    expect(first.model.metrics.validation.maeKg).toBeGreaterThan(0);
    expect(first.model.residualQuantiles?.validationSamples).toBe(24);
    expect(first.selectedLambda).toBe(second.selectedLambda);
    expect(first.model.coefficients).toEqual(second.model.coefficients);

    const validation = validateModelArtifact(first.model);
    expect(validation.ok).toBe(true);
  });

  it('produz métricas por faixa de peso', () => {
    const result = trainBaseline(records, { synthetic: true });
    expect(result.model.metrics.testByWeightBand.length).toBeGreaterThan(0);
    expect(
      result.model.metrics.testByWeightBand.every((band) => band.n > 0),
    ).toBe(true);
  });

  it('prevê dentro da faixa sintética', () => {
    const result = trainBaseline(records, { synthetic: true });
    const record = records[0];
    if (!record) throw new Error('fixture vazia');
    const features = makeFeatures({
      bodyLengthCm: record.features.body_length_cm,
      bodyHeightCm: record.features.body_height_cm,
      maxWidthCm: record.features.max_width_cm,
      maskAreaCm2: record.features.mask_area_cm2,
      majorAxisCm: record.features.major_axis_cm,
      minorAxisCm: record.features.minor_axis_cm,
      axisRatio: record.features.axis_ratio,
      fillRatio: record.features.fill_ratio,
      compactness: record.features.compactness,
      symmetry: record.features.symmetry,
    });
    expect(
      result.model.trainingRanges.body_length_cm?.min,
    ).toBeLessThanOrEqual(features.bodyLengthCm ?? 0);
  });

  it('rejeita vazamento de animal/propriedade', () => {
    const leaked: ExperimentalDatasetRecord[] = [
      ...records,
      {
        ...(records.find((record) => record.split === 'validation') as ExperimentalDatasetRecord),
        recordId: 'leaked-record',
        split: 'train',
      },
    ];
    expect(() => trainBaseline(leaked, { synthetic: true })).toThrow(
      TrainingError,
    );
    try {
      trainBaseline(leaked, { synthetic: true });
    } catch (error) {
      expect(error).toMatchObject({ code: 'animal-leakage' });
    }
  });

  it('exige volume mínimo para dados reais', () => {
    const small = generateSyntheticDataset(9, 3).map((record) => ({
      ...record,
      weightSource: 'balanca-calibrada-01',
    }));
    expect(() => trainBaseline(small)).toThrow(/60 registros/);
  });

  it('recusa dado sintético em dataset declarado real', () => {
    const small = generateSyntheticDataset(9, 3);
    try {
      trainBaseline(small, { synthetic: false });
      throw new Error('deveria falhar');
    } catch (error) {
      expect(error).toMatchObject({ code: 'synthetic-mismatch' });
    }
  });

  it('rejeita opções e características inválidas', () => {
    expect(() =>
      trainBaseline(records, {
        synthetic: true,
        featureNames: ['invented' as never],
      }),
    ).toThrow(TrainingError);
    expect(() =>
      trainBaseline(records, {
        synthetic: true,
        lambdaGrid: [-1],
      }),
    ).toThrow(/lambda/);
  });

  it('calcula MAE, RMSE, viés, percentuais e faixas', () => {
    const metrics = computeRegressionMetrics(
      [100, 200, 300],
      [110, 180, 330],
    );
    expect(metrics.maeKg).toBeCloseTo(20, 6);
    expect(metrics.rmseKg).toBeCloseTo(Math.sqrt(1400 / 3), 6);
    expect(metrics.biasKg).toBeCloseTo(20 / 3, 6);
    expect(metrics.mapePercent).toBeCloseTo(10, 6);
    expect(metrics.r2).not.toBeNull();

    const bands = computeWeightBandMetrics([100, 400, 700], [110, 390, 710]);
    expect(bands.map((band) => band.label)).toEqual([
      'até 300 kg',
      '300–450 kg',
      'acima de 600 kg',
    ]);
  });
});
