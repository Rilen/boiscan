import {
  MODEL_FEATURE_NAMES,
  MODEL_FEATURE_SET_VERSION,
  MODEL_SCHEMA_VERSION,
  toModelFeatureVector,
  type ModelArtifact,
  type ModelFeatureName,
  type ModelPredictionResult,
  type MorphometricFeatures,
  type RegressionMetrics,
} from './types';

const MIN_WEIGHT_KG = 50;
const MAX_WEIGHT_KG = 2000;
const MIN_INTERVAL_KG = 1;
const MAX_INTERVAL_KG = 2500;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function validateMetrics(value: unknown): string[] {
  if (!isRecord(value)) return ['métricas ausentes'];
  const errors: string[] = [];
  for (const split of ['validation', 'test'] as const) {
    const metrics = value[split];
    if (!isRecord(metrics)) {
      errors.push(`métricas de ${split} ausentes`);
      continue;
    }
    for (const key of [
      'n',
      'maeKg',
      'rmseKg',
      'biasKg',
      'mapePercent',
      'medianAbsolutePercentageError',
      'r2',
    ]) {
      const raw = metrics[key];
      if (key === 'n') {
        if (!Number.isInteger(raw) || (raw as number) < 0) {
          errors.push(`métricas.${split}.n inválido`);
        }
      } else if (
        raw !== null &&
        (!finite(raw) || (key !== 'biasKg' && (raw as number) < 0))
      ) {
        errors.push(`métricas.${split}.${key} inválido`);
      }
    }
  }
  if (!Array.isArray(value.testByWeightBand)) {
    errors.push('métricas por faixa ausentes');
  }
  return errors;
}

export type ModelValidation =
  | { ok: true; model: ModelArtifact }
  | { ok: false; errors: string[] };

/**
 * Valida um artefato JSON antes de qualquer inferência.
 *
 * O motor experimental recusa artefatos marcados como validados: promoção a
 * "validado" exige um processo humano/independente, não um booleano no arquivo.
 */
export function validateModelArtifact(value: unknown): ModelValidation {
  const errors: string[] = [];
  if (!isRecord(value)) return { ok: false, errors: ['artefato não é um objeto'] };

  if (value.schemaVersion !== MODEL_SCHEMA_VERSION) {
    errors.push(`schemaVersion deve ser ${MODEL_SCHEMA_VERSION}`);
  }
  if (typeof value.modelId !== 'string' || value.modelId.trim() === '') {
    errors.push('modelId ausente');
  }
  if (typeof value.modelVersion !== 'string' || value.modelVersion.trim() === '') {
    errors.push('modelVersion ausente');
  }
  if (value.algorithm !== 'ridge-regression') {
    errors.push('algorithm não suportado');
  }
  if (value.featureSetVersion !== MODEL_FEATURE_SET_VERSION) {
    errors.push(`featureSetVersion deve ser ${MODEL_FEATURE_SET_VERSION}`);
  }
  if (typeof value.synthetic !== 'boolean') {
    errors.push('synthetic deve ser booleano');
  }
  if (value.validated !== false) {
    errors.push(
      'este motor aceita apenas artefatos experimentais; validated deve ser false',
    );
  }
  if (
    typeof value.trainedAt !== 'string' ||
    Number.isNaN(Date.parse(value.trainedAt))
  ) {
    errors.push('trainedAt inválido');
  }

  const features = value.features;
  if (!Array.isArray(features) || features.length === 0) {
    errors.push('features ausentes');
  } else {
    const unique = new Set(features);
    if (unique.size !== features.length) errors.push('features duplicadas');
    for (const feature of features) {
      if (!MODEL_FEATURE_NAMES.includes(feature as ModelFeatureName)) {
        errors.push(`feature desconhecida: ${String(feature)}`);
      }
    }
    for (const key of ['means', 'scales', 'coefficients'] as const) {
      const values = value[key];
      if (!Array.isArray(values) || values.length !== features.length) {
        errors.push(`${key} com tamanho incompatível`);
        continue;
      }
      values.forEach((item: unknown, index: number) => {
        if (!finite(item)) errors.push(`${key}[${index}] não é finito`);
        if (key === 'scales' && finite(item) && item <= 0) {
          errors.push(`scales[${index}] deve ser positivo`);
        }
      });
    }
  }

  if (!finite(value.intercept)) errors.push('intercept inválido');

  const ranges = value.trainingRanges;
  if (!isRecord(ranges)) {
    errors.push('trainingRanges ausentes');
  } else if (Array.isArray(features)) {
    for (const feature of features) {
      const range = ranges[String(feature)];
      if (!isRecord(range) || !finite(range.min) || !finite(range.max)) {
        errors.push(`trainingRanges.${String(feature)} inválido`);
      } else if (range.min > range.max) {
        errors.push(`trainingRanges.${String(feature)} com min > max`);
      }
    }
  }

  if (value.residualQuantiles !== undefined) {
    const quantiles = value.residualQuantiles;
    if (!isRecord(quantiles)) {
      errors.push('residualQuantiles inválido');
    } else {
      if (
        !finite(quantiles.lowerResidualKg) ||
        !finite(quantiles.upperResidualKg) ||
        quantiles.lowerResidualKg >= quantiles.upperResidualKg
      ) {
        errors.push('quantis residuais inválidos');
      }
      if (
        !finite(quantiles.coveragePercent) ||
        quantiles.coveragePercent <= 50 ||
        quantiles.coveragePercent >= 100
      ) {
        errors.push('cobertura do intervalo inválida');
      }
      if (
        !Number.isInteger(quantiles.validationSamples) ||
        (quantiles.validationSamples as number) < 20
      ) {
        errors.push('amostras insuficientes para intervalo');
      }
    }
  }

  errors.push(...validateMetrics(value.metrics));

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, model: value as unknown as ModelArtifact };
}

/** Inferência determinística e com checagem de domínio de treino. */
export function predictWithModel(
  model: ModelArtifact,
  features: MorphometricFeatures,
): ModelPredictionResult {
  const vector = toModelFeatureVector(features, model.features);
  if (!vector) {
    return {
      ok: false,
      reason: 'missing-feature',
      message:
        'A imagem não forneceu todas as medidas físicas exigidas pelo modelo. A escala pode estar ausente.',
    };
  }

  for (const feature of model.features) {
    const value = vector[feature];
    const range = model.trainingRanges[feature];
    if (value === undefined || !range) {
      return {
        ok: false,
        reason: 'missing-feature',
        message: `Característica ausente: ${feature}.`,
        feature,
      };
    }
    if (value < range.min || value > range.max) {
      return {
        ok: false,
        reason: 'out-of-domain',
        message: `A medida ${feature}=${value.toFixed(2)} está fora da faixa observada no treinamento (${range.min.toFixed(2)} a ${range.max.toFixed(2)}). Nenhum peso foi extrapolado.`,
        feature,
      };
    }
  }

  let estimate = model.intercept;
  for (let i = 0; i < model.features.length; i += 1) {
    const feature = model.features[i];
    if (!feature) continue;
    const value = vector[feature];
    const mean = model.means[i];
    const scale = model.scales[i];
    const coefficient = model.coefficients[i];
    if (
      value === undefined ||
      mean === undefined ||
      scale === undefined ||
      coefficient === undefined
    ) {
      return {
        ok: false,
        reason: 'invalid-model',
        message: 'Artefato inconsistente.',
      };
    }
    estimate += coefficient * ((value - mean) / scale);
  }

  if (!Number.isFinite(estimate) || estimate < MIN_WEIGHT_KG || estimate > MAX_WEIGHT_KG) {
    return {
      ok: false,
      reason: 'implausible-weight',
      message:
        'A combinação de medidas produziu um valor fora da faixa plausível. Nenhum peso foi exibido.',
    };
  }

  if (!model.residualQuantiles) {
    return { ok: true, prediction: { liveWeightKg: estimate } };
  }

  const lowerKg = estimate + model.residualQuantiles.lowerResidualKg;
  const upperKg = estimate + model.residualQuantiles.upperResidualKg;
  const intervalUsable =
    Number.isFinite(lowerKg) &&
    Number.isFinite(upperKg) &&
    lowerKg > MIN_INTERVAL_KG &&
    upperKg < MAX_INTERVAL_KG &&
    lowerKg < estimate &&
    upperKg > estimate;

  return {
    ok: true,
    prediction: {
      liveWeightKg: estimate,
      ...(intervalUsable
        ? {
            interval: {
              lowerKg,
              upperKg,
              coveragePercent: model.residualQuantiles.coveragePercent,
            },
          }
        : {}),
    },
  };
}

export function regressionMetricsAreFinite(metrics: RegressionMetrics): boolean {
  return (
    Number.isInteger(metrics.n) &&
    metrics.n > 0 &&
    Number.isFinite(metrics.maeKg) &&
    Number.isFinite(metrics.rmseKg) &&
    Number.isFinite(metrics.biasKg)
  );
}
