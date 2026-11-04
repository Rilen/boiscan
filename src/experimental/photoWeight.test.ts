import { describe, expect, it } from 'vitest';
import { predictRidge, validatePhotoWeightArtifact } from './photoWeight';

function artifact() {
  return {
    schemaVersion: 'boiscan.photo-weight/1',
    modelId: 'test',
    modelVersion: 'v-test',
    createdAt: '2026-11-04T00:00:00Z',
    backbone: {
      name: 'test', version: 'v', file: '/models/features.onnx', sha256: 'x',
      input: [1, 3, 224, 224], embeddingSize: 2, preprocessing: 'test',
    },
    detector: {
      name: 'test', version: 'v', file: '/models/detector.onnx', sha256: 'x',
      input: [1, 3, 640, 640], preprocessing: 'test', classId: 19,
      confidenceThreshold: 0.25, use: 'gate',
    },
    regression: {
      algorithm: 'ridge-regression' as const, alpha: 1,
      means: [0, 0], scales: [1, 1], coefficients: [2, -1], intercept: 10,
    },
    training: { nAnimalsTrain: 1, nAnimalsTest: 1, sources: {}, imagesPerAnimal: 1,
      animalSplit: 'test', testAnimals: [], datasetSha256: 'x', notes: 'test' },
    metrics: {}, limitations: [],
  };
}

describe('photo weight artifact', () => {
  it('accepts a coherent artifact and predicts with the trained coefficients', () => {
    const value = artifact();
    expect(validatePhotoWeightArtifact(value)).toEqual([]);
    expect(predictRidge([3, 4], value.regression)).toBeCloseTo(12);
  });

  it('rejects a detector that is not the cow class', () => {
    const value = artifact();
    value.detector.classId = 0;
    expect(validatePhotoWeightArtifact(value)).toContain('classId deve ser 19 (cow)');
  });

  it('rejects coefficient length mismatch', () => {
    const value = artifact();
    value.regression.coefficients = [1];
    expect(validatePhotoWeightArtifact(value).length).toBeGreaterThan(0);
  });
});
