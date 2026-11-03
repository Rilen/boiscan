import {
  EXPERIMENTAL_DISCLAIMER,
  type EstimationRequest,
  type EstimationResult,
  type WeightEstimationEngine,
} from '../engine/types';
import {
  analyzeImageBlobExperimental,
  type BrowserExperimentalOptions,
} from './browser';
import {
  analyzeExperimentalFrame,
  type ExperimentalPipelineResult,
} from './pipeline';
import { validateModelArtifact } from './model';
import type { ModelArtifact, ScaleReference } from './types';

export type ExperimentalAnalyzer = (
  blob: Blob,
  options: BrowserExperimentalOptions & {
    scaleReference: ScaleReference;
    model: ModelArtifact;
  },
) => Promise<ExperimentalPipelineResult>;

export interface ExperimentalEngineOptions {
  model: ModelArtifact;
  analyze?: ExperimentalAnalyzer;
}

function unavailable(
  reason: Extract<EstimationResult, { status: 'unavailable' }>['reason'],
  message: string,
  details: string[],
): EstimationResult {
  return { status: 'unavailable', reason, message, details };
}

function mapFailure(
  result: Exclude<ExperimentalPipelineResult, { status: 'predicted' }>,
): EstimationResult {
  if (result.status === 'features-only') {
    const reason = result.reasons.includes('scale-required')
      ? 'scale-reference-required'
      : result.reasons.includes('scale-unreliable')
        ? 'scale-unreliable'
        : 'experimental-model-unavailable';
    return unavailable(reason, result.message, result.warnings);
  }

  if (result.status === 'prediction-unavailable') {
    return unavailable(
      result.reason === 'invalid-model'
        ? 'experimental-model-unavailable'
        : 'experimental-out-of-domain',
      result.message,
      result.warnings,
    );
  }

  return unavailable('experimental-image-rejected', result.message, []);
}

/**
 * Motor experimental de morfometria + regressão.
 *
 * Nunca devolve status "ok" nem `validated: true`. Um artefato sintético
 * permanece marcado como simulação. Sem escala confiável ou sem artefato válido,
 * devolve indisponibilidade — nunca um peso substituto.
 */
export function createExperimentalEngine(
  options: ExperimentalEngineOptions,
): WeightEstimationEngine {
  const validation = validateModelArtifact(options.model);
  const analyze: ExperimentalAnalyzer =
    options.analyze ??
    ((blob, analyzeOptions) =>
      analyzeImageBlobExperimental(blob, analyzeOptions));

  return {
    id: 'experimental-morphometric',
    name: 'Morfometria experimental',
    version: validation.ok ? validation.model.modelVersion : '—',
    availability: 'experimental',
    async estimate(request: EstimationRequest): Promise<EstimationResult> {
      if (!validation.ok) {
        return unavailable(
          'experimental-model-unavailable',
          'O artefato do motor experimental não passou na validação. Nenhum peso foi exibido.',
          validation.errors,
        );
      }

      if (!request.scaleReference) {
        return unavailable(
          'scale-reference-required',
          'A estimativa experimental exige uma referência física de escala no mesmo plano do animal.',
          [
            'A imagem pode ser fotografada e medida, mas o peso absoluto não é calculado sem escala.',
            'Use um marcador de comprimento conhecido ou uma medida corporal informada.',
          ],
        );
      }

      let result: ExperimentalPipelineResult;
      try {
        result = await analyze(request.image, {
          rotation: request.rotation,
          scaleReference: request.scaleReference,
          model: validation.model,
        });
      } catch {
        return {
          status: 'error',
          recoverable: true,
          code: 'experimental-analysis',
          message:
            'A análise experimental falhou. Nenhum peso foi exibido; tente novamente.',
        };
      }

      if (result.status !== 'predicted') {
        return mapFailure(result);
      }

      const model = validation.model;
      const liveWeightKg = Math.round(result.prediction.liveWeightKg * 10) / 10;
      const interval = result.prediction.interval
        ? {
            lowerKg: Math.round(result.prediction.interval.lowerKg * 10) / 10,
            upperKg: Math.round(result.prediction.interval.upperKg * 10) / 10,
            coveragePercent: result.prediction.interval.coveragePercent,
          }
        : undefined;

      return {
        status: 'experimental',
        liveWeightKg,
        model: {
          name: model.synthetic
            ? `DEMONSTRAÇÃO SINTÉTICA (${model.modelId})`
            : `BoiScan experimental (${model.modelId})`,
          version: model.modelVersion,
          validated: false,
        },
        analyzedAt: new Date().toISOString(),
        ...(interval ? { interval } : {}),
        simulated: model.synthetic,
        disclaimer: model.synthetic
          ? 'SIMULAÇÃO SINTÉTICA: o valor serve apenas para testar o pipeline e não representa o peso de um animal.'
          : EXPERIMENTAL_DISCLAIMER,
      };
    },
  };
}

export { analyzeExperimentalFrame };
