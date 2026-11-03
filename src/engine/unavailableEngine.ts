import type {
  EstimationRequest,
  EstimationResult,
  WeightEstimationEngine,
} from './types';

export const UNAVAILABLE_DETAILS = [
  'Nenhum modelo de visão computacional validado está conectado a esta instalação.',
  'A captura, a conferência da foto e a conversão de peso em arrobas estão funcionais.',
  'Nenhum número de peso é exibido sem um modelo calibrado e validado com pesagens reais.',
];

export function createUnavailableEngine(
  reason: 'no-validated-model' | 'not-configured' = 'no-validated-model',
  message = 'A estimativa de peso ainda não está disponível.',
): WeightEstimationEngine {
  return {
    id: 'unavailable',
    name: 'Nenhum modelo conectado',
    version: '—',
    availability: 'unavailable',
    async estimate(_request: EstimationRequest): Promise<EstimationResult> {
      return {
        status: 'unavailable',
        reason,
        message,
        details: UNAVAILABLE_DETAILS,
      };
    },
  };
}

export const unavailableEngine = createUnavailableEngine();
