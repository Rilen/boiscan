import { createRemoteEngine } from './remoteEngine';
import { simulationEngine } from './simulationEngine';
import type { WeightEstimationEngine } from './types';
import { unavailableEngine } from './unavailableEngine';

export interface EngineEnv {
  DEV?: boolean;
  VITE_ENGINE_ENDPOINT?: string;
  VITE_ENABLE_SIMULATION?: string;
}

/**
 * Seleção do motor, em ordem de prioridade:
 * 1. Backend de inferência configurado (VITE_ENGINE_ENDPOINT).
 * 2. Simulação explícita, somente em desenvolvimento
 *    (DEV=true e VITE_ENABLE_SIMULATION=true).
 * 3. Motor indisponível: captura e análise de imagem, sem peso.
 */
export function resolveEngine(
  env: EngineEnv,
  dependencies: { createRemote?: typeof createRemoteEngine } = {},
): WeightEstimationEngine {
  const endpoint = env.VITE_ENGINE_ENDPOINT?.trim();
  if (endpoint) {
    return (dependencies.createRemote ?? createRemoteEngine)({ endpoint });
  }

  const simulationAllowed =
    env.DEV === true && env.VITE_ENABLE_SIMULATION?.toLowerCase() === 'true';
  if (simulationAllowed) {
    return simulationEngine;
  }

  return unavailableEngine;
}
