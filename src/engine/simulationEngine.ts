import type {
  EstimationRequest,
  EstimationResult,
  WeightEstimationEngine,
} from './types';

/**
 * Motor de demonstração. NÃO é um modelo de visão computacional.
 * Produz um valor determinístico a partir do conteúdo do arquivo, apenas para
 * exercitar a interface em desenvolvimento. Nunca é ativado por padrão e
 * nunca é apresentado como estimativa real.
 */

const MODEL_NAME = 'SIMULAÇÃO — valor fictício, não é estimativa real';

function hashBytes(bytes: Uint8Array): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i += 1) {
    hash ^= bytes[i] ?? 0;
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function simulatedWeightFromHash(hash: number): number {
  return 320 + (hash % 321);
}

export const simulationEngine: WeightEstimationEngine = {
  id: 'simulation',
  name: 'Simulação local',
  version: 'sim-1',
  availability: 'experimental',
  async estimate(request: EstimationRequest): Promise<EstimationResult> {
    const head = await request.image.slice(0, 64 * 1024).arrayBuffer();
    const hash = hashBytes(new Uint8Array(head));
    const liveWeightKg = simulatedWeightFromHash(hash);

    return {
      status: 'experimental',
      liveWeightKg,
      model: {
        name: MODEL_NAME,
        version: 'sim-1',
        validated: false,
      },
      analyzedAt: new Date().toISOString(),
      simulated: true,
      disclaimer:
        'MODO SIMULAÇÃO ATIVO: este número é gerado a partir do arquivo e não representa o peso do animal. Não use como estimativa.',
    };
  },
};
