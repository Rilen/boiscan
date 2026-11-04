import type { ImageQuality } from '../domain/imageQuality';
import type { ScaleReference } from '../experimental/types';

export type EngineAvailability = 'validated' | 'experimental' | 'unavailable';

/**
 * Metadados opcionais para calibração futura por raça, idade e condição corporal.
 * A interface atual não os coleta: o reconhecimento de raça não é presumido.
 */
export interface AnimalMetadata {
  breed?: string;
  ageMonths?: number;
  sex?: 'female' | 'male' | 'unknown';
  bodyConditionScore?: number;
}

export interface EstimationRequest {
  image: Blob;
  fileName: string;
  width: number;
  height: number;
  rotation: number;
  quality: ImageQuality;
  dressingPercent: number;
  animal?: AnimalMetadata;
  /**
   * Contexto experimental opcional. O fluxo público não fornece este campo;
   * a UI de escala só será ligada após revisão do motor e dos dados.
   */
  scaleReference?: ScaleReference;
}

export interface ModelInfo {
  name: string;
  version: string;
  validated: boolean;
}

export interface EstimateInterval {
  lowerKg: number;
  upperKg: number;
  coveragePercent?: number;
}

export interface EstimateSuccess {
  status: 'ok' | 'experimental';
  liveWeightKg: number;
  model: ModelInfo;
  analyzedAt: string;
  interval?: EstimateInterval;
  simulated: boolean;
  disclaimer?: string;
}

export interface EstimateUnavailable {
  status: 'unavailable';
  reason:
    | 'no-validated-model'
    | 'remote-unavailable'
    | 'not-configured'
    | 'experimental-image-rejected'
    | 'scale-reference-required'
    | 'scale-unreliable'
    | 'experimental-model-unavailable'
    | 'experimental-out-of-domain'
    | 'no-bovine-detected';
  message: string;
  details: string[];
}

export interface EstimateError {
  status: 'error';
  message: string;
  recoverable: boolean;
  code?: string;
}

export type EstimationResult = EstimateSuccess | EstimateUnavailable | EstimateError;

export interface WeightEstimationEngine {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly availability: EngineAvailability;
  estimate(request: EstimationRequest): Promise<EstimationResult>;
}

export function isEstimateSuccess(
  result: EstimationResult,
): result is EstimateSuccess {
  return result.status === 'ok' || result.status === 'experimental';
}

export const MIN_PLAUSIBLE_WEIGHT_KG = 50;
export const MAX_PLAUSIBLE_WEIGHT_KG = 2000;

export const EXPERIMENTAL_DISCLAIMER =
  'Resultado experimental: não passou por validação com pesagens reais e não deve ser usado para decisões comerciais.';
