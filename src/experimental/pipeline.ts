import type { PixelFrame } from '../domain/imageQuality';
import { calibrateScale } from './scale';
import { extractMorphometrics, applyScaleToFeatures } from './morphometrics';
import { predictWithModel, validateModelArtifact } from './model';
import {
  segmentForeground,
  type SegmentationDiagnostics,
  type SegmentationOptions,
  type SegmentationResult,
  type SegmentationRoi,
} from './segmentation';
import type {
  ModelArtifact,
  ModelPrediction,
  MorphometricFeatures,
  ScaleCalibration,
  ScaleReference,
} from './types';

export interface ExperimentalPipelineOptions {
  scaleReference?: ScaleReference;
  model?: ModelArtifact;
  segment?: (frame: PixelFrame, options?: SegmentationOptions) => SegmentationResult;
  segmentationRoi?: SegmentationRoi;
  minimumMaskAreaPx?: number;
  maximumBorderTouchRatio?: number;
  minimumForegroundRatio?: number;
  maximumForegroundRatio?: number;
  maximumOrientationDeviationDeg?: number;
}

export type ExperimentalRejectionReason =
  | 'invalid-frame'
  | 'segmentation-error'
  | 'segmentation-empty'
  | 'mask-too-small'
  | 'mask-quality'
  | 'orientation';

export type ExperimentalFeaturesReason =
  | 'scale-required'
  | 'scale-unreliable'
  | 'model-required';

export type ExperimentalPredictionFailure =
  | 'invalid-model'
  | 'missing-feature'
  | 'out-of-domain'
  | 'implausible-weight';

interface PipelineBase {
  segmentation: SegmentationDiagnostics;
  features: MorphometricFeatures;
  warnings: string[];
}

export type ExperimentalPipelineResult =
  | {
      status: 'rejected';
      reason: ExperimentalRejectionReason;
      message: string;
      segmentation?: SegmentationDiagnostics;
    }
  | ({
      status: 'features-only';
      reasons: ExperimentalFeaturesReason[];
      message: string;
      scale?: ScaleCalibration;
    } & PipelineBase)
  | ({
      status: 'prediction-unavailable';
      reason: ExperimentalPredictionFailure;
      message: string;
      scale: ScaleCalibration;
    } & PipelineBase)
  | ({
      status: 'predicted';
      prediction: ModelPrediction;
      scale: ScaleCalibration;
      synthetic: boolean;
    } & PipelineBase);

function rejected(
  reason: ExperimentalRejectionReason,
  message: string,
  segmentation?: SegmentationDiagnostics,
): ExperimentalPipelineResult {
  return {
    status: 'rejected',
    reason,
    message,
    ...(segmentation ? { segmentation } : {}),
  };
}

/**
 * Pipeline local: frame RGBA → máscara → morfometria → escala → modelo.
 *
 * Sem escala física confiável ou sem artefato de modelo, o pipeline para antes
 * de qualquer peso e devolve apenas características. Não há fallback numérico.
 */
export function analyzeExperimentalFrame(
  frame: PixelFrame,
  options: ExperimentalPipelineOptions = {},
): ExperimentalPipelineResult {
  const minimumMaskAreaPx = options.minimumMaskAreaPx ?? 1500;
  const maximumBorderTouchRatio = options.maximumBorderTouchRatio ?? 0.4;
  const minimumForegroundRatio = options.minimumForegroundRatio ?? 0.005;
  const maximumForegroundRatio = options.maximumForegroundRatio ?? 0.9;
  const maximumOrientation = options.maximumOrientationDeviationDeg ?? 55;

  if (
    !Number.isInteger(frame.width) ||
    !Number.isInteger(frame.height) ||
    frame.width < 3 ||
    frame.height < 3 ||
    frame.data.length !== frame.width * frame.height * 4
  ) {
    return rejected(
      'invalid-frame',
      'A imagem não possui um buffer RGBA válido para análise experimental.',
    );
  }

  let segmentation: SegmentationResult;
  try {
    segmentation = (options.segment ?? segmentForeground)(frame, {
      roi: options.segmentationRoi,
    } satisfies SegmentationOptions);
  } catch (error) {
    return rejected(
      'segmentation-error',
      error instanceof Error ? error.message : 'Falha ao segmentar a imagem.',
    );
  }

  const diagnostics = segmentation.diagnostics;
  const foregroundCount = segmentation.mask.data.reduce(
    (sum, value) => sum + (value ? 1 : 0),
    0,
  );

  if (foregroundCount === 0) {
    return rejected(
      'segmentation-empty',
      'Nenhuma silhueta de animal foi separada do fundo. Use fundo mais uniforme e animal inteiro visível.',
      diagnostics,
    );
  }

  if (foregroundCount < minimumMaskAreaPx) {
    return rejected(
      'mask-too-small',
      `A silhueta tem apenas ${foregroundCount} px. Aproxime-se do animal ou use uma foto maior.`,
      diagnostics,
    );
  }

  if (
    diagnostics.foregroundRatio < minimumForegroundRatio ||
    diagnostics.foregroundRatio > maximumForegroundRatio ||
    diagnostics.borderTouchRatio > maximumBorderTouchRatio
  ) {
    return rejected(
      'mask-quality',
      'A silhueta não tem qualidade suficiente: animal cortado, muito pequeno ou fundo mal separado.',
      diagnostics,
    );
  }

  let features: MorphometricFeatures;
  try {
    features = extractMorphometrics(segmentation.mask, frame.width, frame.height);
  } catch (error) {
    return rejected(
      'mask-quality',
      error instanceof Error ? error.message : 'Máscara inválida.',
      diagnostics,
    );
  }

  if (Math.abs(features.orientationDeg) > maximumOrientation) {
    return rejected(
      'orientation',
      'A silhueta está mais vertical que lateral. Fotografe o animal de perfil, na horizontal.',
      diagnostics,
    );
  }

  const warnings = [...diagnostics.warnings];

  if (!options.scaleReference) {
    return {
      status: 'features-only',
      reasons: options.model
        ? ['scale-required']
        : ['scale-required', 'model-required'],
      message:
        'As características foram extraídas, mas falta uma referência de escala no mesmo plano do animal. Nenhum peso foi calculado.',
      segmentation: diagnostics,
      features,
      warnings,
    };
  }

  const scaleResult = calibrateScale(
    options.scaleReference,
    frame.width,
    frame.height,
  );
  if (!scaleResult.ok) {
    return {
      status: 'features-only',
      reasons: options.model
        ? ['scale-unreliable']
        : ['scale-unreliable', 'model-required'],
      message: `${scaleResult.message} Nenhum peso foi calculado.`,
      segmentation: diagnostics,
      features,
      warnings,
    };
  }

  const scale = scaleResult.calibration;
  warnings.push(...scale.warnings);
  const scaledFeatures = applyScaleToFeatures(features, scale);

  if (!scale.reliable) {
    return {
      status: 'features-only',
      reasons: options.model
        ? ['scale-unreliable']
        : ['scale-unreliable', 'model-required'],
      message:
        'A referência de escala tem incerteza relativa acima do limite. Nenhum peso foi calculado.',
      segmentation: diagnostics,
      features: scaledFeatures,
      scale,
      warnings,
    };
  }

  if (!options.model) {
    return {
      status: 'features-only',
      reasons: ['model-required'],
      message:
        'Não há artefato de modelo experimental carregado. As medidas estão prontas, mas nenhum peso foi calculado.',
      segmentation: diagnostics,
      features: scaledFeatures,
      scale,
      warnings,
    };
  }

  const validation = validateModelArtifact(options.model);
  if (!validation.ok) {
    return {
      status: 'prediction-unavailable',
      reason: 'invalid-model',
      message: `Artefato experimental inválido: ${validation.errors.join('; ')}. Nenhum peso foi exibido.`,
      segmentation: diagnostics,
      features: scaledFeatures,
      scale,
      warnings,
    };
  }

  if (validation.model.synthetic) {
    warnings.push(
      'O artefato é sintético e serve apenas para testar o pipeline; o valor não representa um animal.',
    );
  }

  const prediction = predictWithModel(validation.model, scaledFeatures);
  if (!prediction.ok) {
    return {
      status: 'prediction-unavailable',
      reason: prediction.reason,
      message: prediction.message,
      segmentation: diagnostics,
      features: scaledFeatures,
      scale,
      warnings,
    };
  }

  return {
    status: 'predicted',
    prediction: prediction.prediction,
    scale,
    synthetic: validation.model.synthetic,
    segmentation: diagnostics,
    features: scaledFeatures,
    warnings,
  };
}
