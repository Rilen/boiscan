import { describe, expect, it } from 'vitest';
import { predictWithModel, validateModelArtifact } from './model';
import { trainBaseline } from './training';
import { generateSyntheticDataset } from './synthetic';
import { makeFeatures, makeModelArtifact } from '../test/experimentalFixtures';
import type {
  ExperimentalDatasetRecord,
  ModelArtifact,
  MorphometricFeatures,
} from './types';

const records = generateSyntheticDataset(42, 24);
const trained = trainBaseline(records, { synthetic: true }).model;
const sample = records[0] as ExperimentalDatasetRecord;

function featuresFrom(record: ExperimentalDatasetRecord): MorphometricFeatures {
  return makeFeatures({
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
}

describe('validação e inferência do artefato', () => {
  it('aceita um artefato experimental gerado pelo treinador', () => {
    const result = validateModelArtifact(trained);
    expect(result.ok).toBe(true);
  });

  it('recusa artefato que tenta se declarar validado', () => {
    const invalid = { ...trained, validated: true } as unknown as ModelArtifact;
    const result = validateModelArtifact(invalid);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(' ')).toMatch(/validated/);
  });

  it('recusa arrays incompatíveis e faixas inválidas', () => {
    const badArrays = {
      ...makeModelArtifact(),
      coefficients: [1, 2],
    };
    const result = validateModelArtifact(badArrays);
    expect(result.ok).toBe(false);

    const badRange = makeModelArtifact({
      trainingRanges: {
        ...makeModelArtifact().trainingRanges,
        body_length_cm: { min: 10, max: 1 },
      },
    });
    expect(validateModelArtifact(badRange).ok).toBe(false);
  });

  it('recusa intervalo com amostras insuficientes', () => {
    const invalid = makeModelArtifact({
      residualQuantiles: {
        lowerResidualKg: -20,
        upperResidualKg: 20,
        coveragePercent: 90,
        validationSamples: 5,
      },
    });
    expect(validateModelArtifact(invalid).ok).toBe(false);
  });

  it('prevê e fornece intervalo somente quando o artefato o sustenta', () => {
    const features = featuresFrom(sample);
    const prediction = predictWithModel(trained, features);
    expect(prediction.ok).toBe(true);
    if (prediction.ok) {
      expect(prediction.prediction.liveWeightKg).toBeGreaterThan(50);
      expect(prediction.prediction.liveWeightKg).toBeLessThan(2000);
      expect(prediction.prediction.interval).toBeDefined();
      const interval = prediction.prediction.interval;
      if (interval) {
        expect(interval.lowerKg).toBeLessThan(prediction.prediction.liveWeightKg);
        expect(interval.upperKg).toBeGreaterThan(prediction.prediction.liveWeightKg);
        expect(interval.coveragePercent).toBe(90);
      }
    }
  });

  it('não extrapola fora da faixa de treinamento', () => {
    const features = { ...featuresFrom(sample), bodyLengthCm: 10000 };
    const prediction = predictWithModel(trained, features);
    expect(prediction.ok).toBe(false);
    if (!prediction.ok) {
      expect(prediction.reason).toBe('out-of-domain');
      expect(prediction.feature).toBe('body_length_cm');
    }
  });

  it('recusa medidas físicas ausentes', () => {
    const features = { ...featuresFrom(sample), bodyLengthCm: undefined };
    const prediction = predictWithModel(trained, features);
    expect(prediction.ok).toBe(false);
    if (!prediction.ok) expect(prediction.reason).toBe('missing-feature');
  });

  it('omite intervalo quando o artefato não o possui', () => {
    const model = makeModelArtifact({
      residualQuantiles: undefined,
    });
    const prediction = predictWithModel(model, makeFeatures());
    expect(prediction.ok).toBe(true);
    if (prediction.ok) expect(prediction.prediction.interval).toBeUndefined();
  });
});
