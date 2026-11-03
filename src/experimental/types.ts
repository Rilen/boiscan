export interface Point {
  x: number;
  y: number;
}

/** Máscara binária 0/1, alinhada aos pixels da imagem analisada. */
export interface BinaryMask {
  width: number;
  height: number;
  data: Uint8Array;
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type ScaleReferenceType =
  | 'known-length-marker'
  | 'body-measurement'
  | 'camera-calibration';

export interface ScaleReference {
  type: ScaleReferenceType;
  knownLengthCm: number;
  /** Extremidades normalizadas (0–1) da referência, independentes da resolução. */
  start: Point;
  end: Point;
  /** Incerteza declarada da medida física, em cm. Padrão conservador: 0,5 cm. */
  uncertaintyCm?: number;
  /**
   * A referência precisa estar no mesmo plano do perfil do animal.
   * Sem isso, a escala não é considerada fisicamente utilizável.
   */
  samePlaneAsAnimal: boolean;
  referenceId?: string;
}

export interface ScaleCalibration {
  cmPerPixel: number;
  pixelLength: number;
  relativeUncertainty: number;
  uncertaintyCmPerPixel: number;
  reliable: boolean;
  warnings: string[];
}

export interface MorphometricFeatures {
  schemaVersion: 'boiscan.morphometrics/1';
  imageWidth: number;
  imageHeight: number;
  maskWidth: number;
  maskHeight: number;
  bbox: BoundingBox;
  bodyLengthPx: number;
  bodyHeightPx: number;
  bboxAreaPx: number;
  maskAreaPx: number;
  fillRatio: number;
  perimeterPx: number;
  compactness: number;
  majorAxisPx: number;
  minorAxisPx: number;
  axisRatio: number;
  orientationDeg: number;
  maxWidthPx: number;
  widthAt25PctPx: number;
  widthAt50PctPx: number;
  widthAt75PctPx: number;
  borderTouchRatio: number;
  componentCount: number;
  symmetry: number;
  bodyLengthCm?: number;
  bodyHeightCm?: number;
  maxWidthCm?: number;
  maskAreaCm2?: number;
  majorAxisCm?: number;
  minorAxisCm?: number;
  widthAt50PctCm?: number;
  widthAt75PctCm?: number;
  cmPerPixel?: number;
}

export const MODEL_FEATURE_NAMES = [
  'body_length_cm',
  'body_height_cm',
  'max_width_cm',
  'mask_area_cm2',
  'major_axis_cm',
  'minor_axis_cm',
  'axis_ratio',
  'fill_ratio',
  'compactness',
  'symmetry',
] as const;

export type ModelFeatureName = (typeof MODEL_FEATURE_NAMES)[number];

export const MODEL_FEATURE_SET_VERSION = 'morphometrics-v1';
export const MODEL_SCHEMA_VERSION = 'boiscan.weight-model/1';

const FEATURE_FIELDS: Record<ModelFeatureName, keyof MorphometricFeatures> = {
  body_length_cm: 'bodyLengthCm',
  body_height_cm: 'bodyHeightCm',
  max_width_cm: 'maxWidthCm',
  mask_area_cm2: 'maskAreaCm2',
  major_axis_cm: 'majorAxisCm',
  minor_axis_cm: 'minorAxisCm',
  axis_ratio: 'axisRatio',
  fill_ratio: 'fillRatio',
  compactness: 'compactness',
  symmetry: 'symmetry',
};

/**
 * Converte características para o vetor do modelo.
 * Retorna null se a escala física não foi aplicada ou se algum valor é inválido.
 */
export function toModelFeatureVector(
  features: MorphometricFeatures,
  featureNames: readonly ModelFeatureName[] = MODEL_FEATURE_NAMES,
): Record<string, number> | null {
  const vector: Record<string, number> = {};
  for (const name of featureNames) {
    const field = FEATURE_FIELDS[name];
    const value = features[field];
    if (typeof value !== 'number' || !Number.isFinite(value)) return null;
    vector[name] = value;
  }
  return vector;
}

export interface RegressionMetrics {
  n: number;
  maeKg: number;
  rmseKg: number;
  biasKg: number;
  mapePercent: number | null;
  medianAbsolutePercentageError: number | null;
  r2: number | null;
}

export interface WeightBandMetrics extends RegressionMetrics {
  label: string;
  minKg: number;
  maxKg: number | null;
}

export interface ModelMetrics {
  validation: RegressionMetrics;
  test: RegressionMetrics;
  testByWeightBand: WeightBandMetrics[];
  intervalCoveragePercent?: number;
  intervalMeanWidthKg?: number;
}

export interface ModelInterval {
  lowerKg: number;
  upperKg: number;
  coveragePercent: number;
}

export interface ModelArtifact {
  schemaVersion: 'boiscan.weight-model/1';
  modelId: string;
  modelVersion: string;
  algorithm: 'ridge-regression';
  featureSetVersion: string;
  features: ModelFeatureName[];
  means: number[];
  scales: number[];
  coefficients: number[];
  intercept: number;
  trainingRanges: Record<string, { min: number; max: number }>;
  residualQuantiles?: {
    lowerResidualKg: number;
    upperResidualKg: number;
    coveragePercent: number;
    validationSamples: number;
  };
  metrics: ModelMetrics;
  synthetic: boolean;
  validated: false;
  trainedAt: string;
  datasetHash?: string;
  notes?: string;
}

export interface ModelPrediction {
  liveWeightKg: number;
  interval?: ModelInterval;
}

export type ModelPredictionResult =
  | { ok: true; prediction: ModelPrediction }
  | {
      ok: false;
      reason: 'missing-feature' | 'out-of-domain' | 'implausible-weight' | 'invalid-model';
      message: string;
      feature?: string;
    };

export interface ExperimentalDatasetRecord {
  recordId: string;
  animalId: string;
  farmId: string;
  split: 'train' | 'validation' | 'test';
  liveWeightKg: number;
  weightUnit: 'kg';
  weighedAt: string;
  weightSource: string;
  consentReference: string;
  license: string;
  features: Record<ModelFeatureName, number>;
}
