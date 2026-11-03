import {
  MODEL_FEATURE_NAMES,
  MODEL_FEATURE_SET_VERSION,
  MODEL_SCHEMA_VERSION,
  type ModelArtifact,
  type MorphometricFeatures,
  type RegressionMetrics,
} from '../experimental/types';

const metrics: RegressionMetrics = {
  n: 24,
  maeKg: 12,
  rmseKg: 15,
  biasKg: -1,
  mapePercent: 3.1,
  medianAbsolutePercentageError: 2.8,
  r2: 0.82,
};

export function makeFeatures(
  overrides: Partial<MorphometricFeatures> = {},
): MorphometricFeatures {
  return {
    schemaVersion: 'boiscan.morphometrics/1',
    imageWidth: 512,
    imageHeight: 384,
    maskWidth: 512,
    maskHeight: 384,
    bbox: { x: 100, y: 100, width: 200, height: 100 },
    bodyLengthPx: 200,
    bodyHeightPx: 100,
    bboxAreaPx: 20000,
    maskAreaPx: 12000,
    fillRatio: 0.6,
    perimeterPx: 600,
    compactness: 0.4,
    majorAxisPx: 200,
    minorAxisPx: 100,
    axisRatio: 2,
    orientationDeg: 0,
    maxWidthPx: 100,
    widthAt25PctPx: 70,
    widthAt50PctPx: 100,
    widthAt75PctPx: 80,
    borderTouchRatio: 0,
    componentCount: 1,
    symmetry: 0.8,
    bodyLengthCm: 160,
    bodyHeightCm: 80,
    maxWidthCm: 50,
    maskAreaCm2: 8000,
    majorAxisCm: 160,
    minorAxisCm: 80,
    widthAt50PctCm: 50,
    widthAt75PctCm: 40,
    cmPerPixel: 0.8,
    ...overrides,
  };
}

export function makeModelArtifact(
  overrides: Partial<ModelArtifact> = {},
): ModelArtifact {
  const features = [...MODEL_FEATURE_NAMES];
  return {
    schemaVersion: MODEL_SCHEMA_VERSION,
    modelId: 'test-ridge',
    modelVersion: 'test-1',
    algorithm: 'ridge-regression',
    featureSetVersion: MODEL_FEATURE_SET_VERSION,
    features,
    means: features.map(() => 0),
    scales: features.map(() => 1),
    coefficients: features.map(() => 0),
    intercept: 500,
    trainingRanges: Object.fromEntries(
      features.map((feature) => [feature, { min: 0, max: 100000 }]),
    ),
    residualQuantiles: {
      lowerResidualKg: -30,
      upperResidualKg: 30,
      coveragePercent: 90,
      validationSamples: 30,
    },
    metrics: {
      validation: metrics,
      test: metrics,
      testByWeightBand: [],
      intervalCoveragePercent: 90,
      intervalMeanWidthKg: 60,
    },
    synthetic: false,
    validated: false,
    trainedAt: '2026-11-03T12:00:00.000Z',
    ...overrides,
  };
}
