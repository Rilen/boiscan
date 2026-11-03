import {
  MODEL_FEATURE_NAMES,
  MODEL_FEATURE_SET_VERSION,
  MODEL_SCHEMA_VERSION,
  type ExperimentalDatasetRecord,
  type ModelArtifact,
  type ModelFeatureName,
  type RegressionMetrics,
  type WeightBandMetrics,
} from './types';

export const MIN_REAL_RECORDS = 60;
export const MIN_REAL_ANIMALS = 30;
export const MIN_REAL_FARMS = 3;
export const MIN_INTERVAL_VALIDATION_SAMPLES = 20;
export const DEFAULT_LAMBDA_GRID = [0.01, 0.1, 1, 10, 100] as const;

export type TrainingErrorCode =
  | 'invalid-records'
  | 'invalid-features'
  | 'invalid-split'
  | 'farm-leakage'
  | 'animal-leakage'
  | 'insufficient-data'
  | 'synthetic-mismatch'
  | 'singular-system'
  | 'invalid-options';

export class TrainingError extends Error {
  constructor(
    public readonly code: TrainingErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'TrainingError';
  }
}

export interface TrainingOptions {
  synthetic?: boolean;
  featureNames?: readonly ModelFeatureName[];
  lambdaGrid?: readonly number[];
  modelId?: string;
  modelVersion?: string;
  trainedAt?: string;
  datasetHash?: string;
}

export interface TrainingResult {
  model: ModelArtifact;
  selectedLambda: number;
  warnings: string[];
}

const WEIGHT_BANDS: Array<{ label: string; minKg: number; maxKg: number | null }> = [
  { label: 'até 300 kg', minKg: 0, maxKg: 300 },
  { label: '300–450 kg', minKg: 300, maxKg: 450 },
  { label: '450–600 kg', minKg: 450, maxKg: 600 },
  { label: 'acima de 600 kg', minKg: 600, maxKg: null },
];

function assertFiniteWeight(value: number): void {
  if (!Number.isFinite(value) || value < 50 || value > 2000) {
    throw new TrainingError(
      'invalid-records',
      'Peso real deve ser finito e estar entre 50 kg e 2.000 kg.',
    );
  }
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function validateRecords(
  records: ExperimentalDatasetRecord[],
  featureNames: readonly ModelFeatureName[],
  synthetic: boolean,
): void {
  if (records.length === 0) {
    throw new TrainingError('insufficient-data', 'Nenhum registro fornecido.');
  }

  const recordIds = new Set<string>();
  const splitNames = new Set(['train', 'validation', 'test']);

  for (const record of records) {
    if (!record.recordId || recordIds.has(record.recordId)) {
      throw new TrainingError('invalid-records', 'record_id vazio ou duplicado.');
    }
    recordIds.add(record.recordId);
    if (!record.animalId || !record.farmId) {
      throw new TrainingError('invalid-records', 'animal_id e farm_id são obrigatórios.');
    }
    if (!splitNames.has(record.split)) {
      throw new TrainingError('invalid-split', 'split deve ser train, validation ou test.');
    }
    if (record.weightUnit !== 'kg') {
      throw new TrainingError('invalid-records', 'Unidade de peso deve ser kg.');
    }
    assertFiniteWeight(record.liveWeightKg);
    if (!record.weightSource || !record.consentReference || !record.license) {
      throw new TrainingError(
        'invalid-records',
        'Origem do peso, consentimento e licença são obrigatórios.',
      );
    }
    if (!synthetic && /synthetic/i.test(record.weightSource)) {
      throw new TrainingError(
        'synthetic-mismatch',
        'Registro sintético encontrado em dataset marcado como real.',
      );
    }
    for (const feature of featureNames) {
      const value = record.features[feature];
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new TrainingError(
          'invalid-features',
          `Característica ${feature} ausente ou inválida em ${record.recordId}.`,
        );
      }
    }
  }

  const bySplit = {
    train: records.filter((record) => record.split === 'train'),
    validation: records.filter((record) => record.split === 'validation'),
    test: records.filter((record) => record.split === 'test'),
  };

  if (
    bySplit.train.length === 0 ||
    bySplit.validation.length === 0 ||
    bySplit.test.length === 0
  ) {
    throw new TrainingError(
      'invalid-split',
      'Os três splits (train, validation, test) precisam ter registros.',
    );
  }

  const animals = {
    train: new Set(bySplit.train.map((record) => record.animalId)),
    validation: new Set(bySplit.validation.map((record) => record.animalId)),
    test: new Set(bySplit.test.map((record) => record.animalId)),
  };
  const farms = {
    train: new Set(bySplit.train.map((record) => record.farmId)),
    validation: new Set(bySplit.validation.map((record) => record.farmId)),
    test: new Set(bySplit.test.map((record) => record.farmId)),
  };

  const pairs: Array<[keyof typeof animals, keyof typeof animals]> = [
    ['train', 'validation'],
    ['train', 'test'],
    ['validation', 'test'],
  ];
  for (const [left, right] of pairs) {
    for (const animal of animals[left]) {
      if (animals[right].has(animal)) {
        throw new TrainingError(
          'animal-leakage',
          `O animal ${animal} aparece em ${left} e ${right}.`,
        );
      }
    }
    for (const farm of farms[left]) {
      if (farms[right].has(farm)) {
        throw new TrainingError(
          'farm-leakage',
          `A propriedade ${farm} aparece em ${left} e ${right}.`,
        );
      }
    }
  }

  if (!synthetic) {
    if (records.length < MIN_REAL_RECORDS) {
      throw new TrainingError(
        'insufficient-data',
        `O piloto real exige pelo menos ${MIN_REAL_RECORDS} registros para este baseline.`,
      );
    }
    const animalCount = unique(records.map((record) => record.animalId)).length;
    if (animalCount < MIN_REAL_ANIMALS) {
      throw new TrainingError(
        'insufficient-data',
        `O piloto real exige pelo menos ${MIN_REAL_ANIMALS} animais distintos.`,
      );
    }
    const farmCount = unique(records.map((record) => record.farmId)).length;
    if (farmCount < MIN_REAL_FARMS) {
      throw new TrainingError(
        'insufficient-data',
        `Validação fora da propriedade exige pelo menos ${MIN_REAL_FARMS} propriedades.`,
      );
    }
  }
}

export function computeRegressionMetrics(
  actual: readonly number[],
  predicted: readonly number[],
): RegressionMetrics {
  if (actual.length === 0 || actual.length !== predicted.length) {
    throw new TrainingError('invalid-records', 'Vetores de avaliação incompatíveis.');
  }

  let absoluteSum = 0;
  let squaredSum = 0;
  let biasSum = 0;
  const percentageErrors: number[] = [];
  const actualMean = actual.reduce((sum, value) => sum + value, 0) / actual.length;
  let totalSumSquares = 0;

  for (let i = 0; i < actual.length; i += 1) {
    const truth = actual[i];
    const estimate = predicted[i];
    if (truth === undefined || estimate === undefined) {
      throw new TrainingError('invalid-records', 'Valor ausente na avaliação.');
    }
    const error = estimate - truth;
    const absolute = Math.abs(error);
    absoluteSum += absolute;
    squaredSum += error * error;
    biasSum += error;
    totalSumSquares += (truth - actualMean) ** 2;
    if (trimZero(truth) !== 0) {
      percentageErrors.push((absolute / Math.abs(truth)) * 100);
    }
  }

  const sortedPercentages = [...percentageErrors].sort((a, b) => a - b);
  const medianPercentage =
    sortedPercentages.length === 0
      ? null
      : sortedPercentages.length % 2 === 1
        ? (sortedPercentages[Math.floor(sortedPercentages.length / 2)] ?? 0)
        : ((sortedPercentages[sortedPercentages.length / 2 - 1] ?? 0) +
            (sortedPercentages[sortedPercentages.length / 2] ?? 0)) /
          2;

  return {
    n: actual.length,
    maeKg: absoluteSum / actual.length,
    rmseKg: Math.sqrt(squaredSum / actual.length),
    biasKg: biasSum / actual.length,
    mapePercent:
      percentageErrors.length === 0
        ? null
        : percentageErrors.reduce((sum, value) => sum + value, 0) /
          percentageErrors.length,
    medianAbsolutePercentageError: medianPercentage,
    r2: totalSumSquares === 0 ? null : 1 - squaredSum / totalSumSquares,
  };
}

function trimZero(value: number): number {
  return Math.abs(value) < 1e-9 ? 0 : value;
}

export function computeWeightBandMetrics(
  actual: readonly number[],
  predicted: readonly number[],
): WeightBandMetrics[] {
  if (actual.length !== predicted.length) {
    throw new TrainingError('invalid-records', 'Vetores de faixa incompatíveis.');
  }
  return WEIGHT_BANDS.flatMap((band) => {
    const indices: number[] = [];
    actual.forEach((weight, index) => {
      const inBand =
        weight >= band.minKg &&
        (band.maxKg === null || weight < band.maxKg);
      if (inBand) indices.push(index);
    });
    if (indices.length === 0) return [];
    return [
      {
        ...band,
        ...computeRegressionMetrics(
          indices.map((index) => actual[index] ?? 0),
          indices.map((index) => predicted[index] ?? 0),
        ),
      },
    ];
  });
}

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function standardDeviation(values: number[], center: number): number {
  const variance =
    values.reduce((sum, value) => sum + (value - center) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function solveLinearSystem(matrix: number[][], vector: number[]): number[] | null {
  const size = vector.length;
  const augmented = matrix.map((row, index) => [...row, vector[index] ?? 0]);

  for (let column = 0; column < size; column += 1) {
    let pivotRow = column;
    for (let row = column + 1; row < size; row += 1) {
      if (
        Math.abs(augmented[row]?.[column] ?? 0) >
        Math.abs(augmented[pivotRow]?.[column] ?? 0)
      ) {
        pivotRow = row;
      }
    }
    const pivot = augmented[pivotRow]?.[column] ?? 0;
    if (Math.abs(pivot) < 1e-12) return null;
    [augmented[column], augmented[pivotRow]] = [
      augmented[pivotRow] ?? [],
      augmented[column] ?? [],
    ];

    const pivotLine = augmented[column] ?? [];
    for (let col = column; col <= size; col += 1) {
      pivotLine[col] = (pivotLine[col] ?? 0) / pivot;
    }

    for (let row = 0; row < size; row += 1) {
      if (row === column) continue;
      const line = augmented[row] ?? [];
      const factor = line[column] ?? 0;
      if (factor === 0) continue;
      for (let col = column; col <= size; col += 1) {
        line[col] = (line[col] ?? 0) - factor * (pivotLine[col] ?? 0);
      }
    }
  }

  return augmented.map((row) => row[size] ?? 0);
}

interface Standardizer {
  means: number[];
  scales: number[];
}

function standardizerFor(
  records: ExperimentalDatasetRecord[],
  featureNames: readonly ModelFeatureName[],
): Standardizer {
  const means: number[] = [];
  const scales: number[] = [];
  for (const feature of featureNames) {
    const values = records.map((record) => record.features[feature]);
    const center = mean(values);
    const scale = standardDeviation(values, center);
    means.push(center);
    scales.push(scale > 1e-12 ? scale : 1);
  }
  return { means, scales };
}

function designRow(
  record: ExperimentalDatasetRecord,
  featureNames: readonly ModelFeatureName[],
  standardizer: Standardizer,
): number[] {
  return featureNames.map((feature, index) => {
    const value = record.features[feature];
    const center = standardizer.means[index] ?? 0;
    const scale = standardizer.scales[index] ?? 1;
    return (value - center) / scale;
  });
}

interface RawModel {
  means: number[];
  scales: number[];
  coefficients: number[];
  intercept: number;
}

function fitRidge(
  records: ExperimentalDatasetRecord[],
  featureNames: readonly ModelFeatureName[],
  lambda: number,
): RawModel {
  const standardizer = standardizerFor(records, featureNames);
  const rows = records.map((record) => designRow(record, featureNames, standardizer));
  const target = records.map((record) => record.liveWeightKg);
  const targetMean = mean(target);
  const dimension = featureNames.length;
  const matrix = Array.from({ length: dimension }, () =>
    new Array<number>(dimension).fill(0),
  );
  const vector = new Array<number>(dimension).fill(0);

  rows.forEach((row, rowIndex) => {
    const centered = (target[rowIndex] ?? 0) - targetMean;
    for (let i = 0; i < dimension; i += 1) {
      const value = row[i] ?? 0;
      vector[i] = (vector[i] ?? 0) + value * centered;
      const matrixRow = matrix[i];
      if (!matrixRow) continue;
      for (let j = 0; j < dimension; j += 1) {
        matrixRow[j] = (matrixRow[j] ?? 0) + value * (row[j] ?? 0);
      }
    }
  });

  for (let i = 0; i < dimension; i += 1) {
    const row = matrix[i];
    if (row) row[i] = (row[i] ?? 0) + lambda;
  }

  const coefficients = solveLinearSystem(matrix, vector);
  if (!coefficients) {
    throw new TrainingError('singular-system', 'Sistema ridge singular.');
  }

  return {
    means: standardizer.means,
    scales: standardizer.scales,
    coefficients,
    intercept: targetMean,
  };
}

function predictForFeatures(
  model: RawModel,
  featureNames: readonly ModelFeatureName[],
  record: ExperimentalDatasetRecord,
): number {
  let estimate = model.intercept;
  for (let i = 0; i < featureNames.length; i += 1) {
    const feature = featureNames[i];
    if (!feature) continue;
    const value = record.features[feature];
    const center = model.means[i] ?? 0;
    const scale = model.scales[i] ?? 1;
    estimate += (model.coefficients[i] ?? 0) * ((value - center) / scale);
  }
  return estimate;
}

function quantile(sorted: number[], fraction: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0] ?? 0;
  const position = (sorted.length - 1) * fraction;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  const weight = position - lower;
  return (sorted[lower] ?? 0) * (1 - weight) + (sorted[upper] ?? 0) * weight;
}

export function trainBaseline(
  records: ExperimentalDatasetRecord[],
  options: TrainingOptions = {},
): TrainingResult {
  const synthetic = options.synthetic ?? false;
  const featureNames = options.featureNames ?? MODEL_FEATURE_NAMES;
  const lambdaGrid = options.lambdaGrid ?? DEFAULT_LAMBDA_GRID;

  if (featureNames.length === 0) {
    throw new TrainingError('invalid-features', 'Nenhuma característica selecionada.');
  }
  for (const feature of featureNames) {
    if (!MODEL_FEATURE_NAMES.includes(feature)) {
      throw new TrainingError('invalid-features', `Característica desconhecida: ${feature}.`);
    }
  }
  if (lambdaGrid.some((value) => !Number.isFinite(value) || value < 0)) {
    throw new TrainingError('invalid-options', 'A grade de lambda deve ser não negativa.');
  }

  validateRecords(records, featureNames, synthetic);

  const train = records.filter((record) => record.split === 'train');
  const validation = records.filter((record) => record.split === 'validation');
  const test = records.filter((record) => record.split === 'test');

  const validationTruth = validation.map((record) => record.liveWeightKg);
  let bestLambda = lambdaGrid[0] ?? 0;
  let bestRmse = Number.POSITIVE_INFINITY;
  for (const lambda of lambdaGrid) {
    const candidate = fitRidge(train, featureNames, lambda);
    const predicted = validation.map((record) =>
      predictForFeatures(candidate, featureNames, record),
    );
    const rmse = computeRegressionMetrics(validationTruth, predicted).rmseKg;
    if (rmse < bestRmse) {
      bestRmse = rmse;
      bestLambda = lambda;
    }
  }

  const final = fitRidge(train, featureNames, bestLambda);
  const validationPredicted = validation.map((record) =>
    predictForFeatures(final, featureNames, record),
  );
  const testPredicted = test.map((record) =>
    predictForFeatures(final, featureNames, record),
  );

  const residuals = validation.map(
    (record, index) => record.liveWeightKg - (validationPredicted[index] ?? 0),
  );
  const sortedResiduals = [...residuals].sort((a, b) => a - b);
  const lowerResidual = quantile(sortedResiduals, 0.05);
  const upperResidual = quantile(sortedResiduals, 0.95);
  const useInterval = validation.length >= MIN_INTERVAL_VALIDATION_SAMPLES;
  const intervalCoverage = useInterval
    ? coveragePercent(
        test.map((record) => record.liveWeightKg),
        testPredicted.map((value) => ({
          lowerKg: value + lowerResidual,
          upperKg: value + upperResidual,
        })),
      )
    : undefined;
  const intervalMeanWidth = useInterval
    ? upperResidual - lowerResidual
    : undefined;

  const ranges: Record<string, { min: number; max: number }> = {};
  for (const feature of featureNames) {
    const values = train.map((record) => record.features[feature]);
    ranges[feature] = {
      min: Math.min(...values),
      max: Math.max(...values),
    };
  }

  const warnings: string[] = [];
  if (synthetic) {
    warnings.push('Artefato sintético: não é uma estimativa de peso real.');
  }
  if (validation.length < MIN_INTERVAL_VALIDATION_SAMPLES) {
    warnings.push(
      'Validação com menos de 20 registros: nenhum intervalo preditivo foi gerado.',
    );
  }
  if (test.length < 30) {
    warnings.push('Teste com menos de 30 registros: métricas ainda instáveis.');
  }

  const metricsValidation = computeRegressionMetrics(
    validationTruth,
    validationPredicted,
  );
  const metricsTest = computeRegressionMetrics(
    test.map((record) => record.liveWeightKg),
    testPredicted,
  );

  const artifact: ModelArtifact = {
    schemaVersion: MODEL_SCHEMA_VERSION,
    modelId: options.modelId ?? 'boiscan-ridge-baseline',
    modelVersion: options.modelVersion ?? '0.1.0-experimental',
    algorithm: 'ridge-regression',
    featureSetVersion: MODEL_FEATURE_SET_VERSION,
    features: [...featureNames],
    means: final.means,
    scales: final.scales,
    coefficients: final.coefficients,
    intercept: final.intercept,
    trainingRanges: ranges,
    ...(useInterval
      ? {
          residualQuantiles: {
            lowerResidualKg: lowerResidual,
            upperResidualKg: upperResidual,
            coveragePercent: 90,
            validationSamples: validation.length,
          },
        }
      : {}),
    metrics: {
      validation: metricsValidation,
      test: metricsTest,
      testByWeightBand: computeWeightBandMetrics(
        test.map((record) => record.liveWeightKg),
        testPredicted,
      ),
      ...(intervalCoverage !== undefined
        ? {
            intervalCoveragePercent: intervalCoverage,
            intervalMeanWidthKg: intervalMeanWidth,
          }
        : {}),
    },
    synthetic,
    validated: false,
    trainedAt: options.trainedAt ?? new Date().toISOString(),
    ...(options.datasetHash ? { datasetHash: options.datasetHash } : {}),
    notes: synthetic
      ? 'Synthetic demonstration artifact. Never use as a real weight estimate.'
      : 'Experimental baseline. Not independently validated for field use.',
  };

  return {
    model: artifact,
    selectedLambda: bestLambda,
    warnings,
  };
}

function coveragePercent(
  actual: number[],
  intervals: Array<{ lowerKg: number; upperKg: number }>,
): number {
  if (actual.length === 0) return 0;
  let covered = 0;
  actual.forEach((value, index) => {
    const interval = intervals[index];
    if (interval && value >= interval.lowerKg && value <= interval.upperKg) {
      covered += 1;
    }
  });
  return (covered / actual.length) * 100;
}
