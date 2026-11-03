import { APP_VERSION } from '../config';
import {
  EXPERIMENTAL_DISCLAIMER,
  MAX_PLAUSIBLE_WEIGHT_KG,
  MIN_PLAUSIBLE_WEIGHT_KG,
  type EstimationRequest,
  type EstimationResult,
  type EstimateSuccess,
  type WeightEstimationEngine,
} from './types';

/**
 * Adaptador para um backend de inferência opcional (por exemplo, FastAPI).
 *
 * Contrato: POST {baseUrl}/v1/estimate (multipart/form-data)
 *   image: arquivo da foto
 *   metadata: JSON com qualidade, rotação, rendimento e versão do app
 *
 * Resposta esperada (200):
 * {
 *   "liveWeightKg": 520.4,
 *   "model": { "name": "...", "version": "...", "validated": true },
 *   "analyzedAt": "2026-01-01T12:00:00.000Z",
 *   "interval": { "lowerKg": 490, "upperKg": 551, "coveragePercent": 90 },
 *   "disclaimer": "..."
 * }
 *
 * Resposta 503 indica motor indisponível. Qualquer resposta fora do contrato
 * é tratada como erro; o app nunca inventa um peso substituto.
 */

export interface RemoteEngineOptions {
  endpoint: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 20_000;

interface RemoteSuccessBody {
  liveWeightKg: number;
  model: { name: string; version: string; validated: boolean };
  analyzedAt: string;
  interval?: { lowerKg: number; upperKg: number; coveragePercent?: number };
  simulated?: boolean;
  disclaimer?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPlausibleWeight(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= MIN_PLAUSIBLE_WEIGHT_KG &&
    value <= MAX_PLAUSIBLE_WEIGHT_KG
  );
}

function parseSuccessBody(body: unknown): EstimateSuccess | null {
  if (!isRecord(body)) return null;

  const model = body.model;
  if (!isRecord(model)) return null;
  if (typeof model.name !== 'string' || model.name.trim() === '') return null;
  if (typeof model.version !== 'string' || model.version.trim() === '') return null;
  if (typeof model.validated !== 'boolean') return null;
  if (!isPlausibleWeight(body.liveWeightKg)) return null;

  const liveWeightKg = body.liveWeightKg;
  let interval: RemoteSuccessBody['interval'];
  if (body.interval !== undefined && body.interval !== null) {
    if (!isRecord(body.interval)) return null;
    const { lowerKg, upperKg, coveragePercent } = body.interval;
    if (!isPlausibleWeight(lowerKg) || !isPlausibleWeight(upperKg)) return null;
    if (lowerKg > liveWeightKg || upperKg < liveWeightKg || lowerKg >= upperKg) {
      return null;
    }
    if (
      coveragePercent !== undefined &&
      (typeof coveragePercent !== 'number' ||
        !Number.isFinite(coveragePercent) ||
        coveragePercent <= 0 ||
        coveragePercent >= 100)
    ) {
      return null;
    }
    interval = {
      lowerKg,
      upperKg,
      ...(coveragePercent !== undefined ? { coveragePercent } : {}),
    };
  }

  const simulated = body.simulated === true;
  const validated = model.validated && !simulated;
  const analyzedAt =
    typeof body.analyzedAt === 'string' && !Number.isNaN(Date.parse(body.analyzedAt))
      ? body.analyzedAt
      : new Date().toISOString();

  return {
    status: validated ? 'ok' : 'experimental',
    liveWeightKg,
    model: {
      name: model.name,
      version: model.version,
      validated,
    },
    analyzedAt,
    ...(interval ? { interval } : {}),
    simulated,
    ...(validated
      ? {}
      : {
          disclaimer:
            typeof body.disclaimer === 'string' && body.disclaimer.trim() !== ''
              ? body.disclaimer
              : EXPERIMENTAL_DISCLAIMER,
        }),
  };
}

function unavailableFromBody(body: unknown, fallbackMessage: string): EstimationResult {
  const message =
    isRecord(body) && typeof body.message === 'string' && body.message.trim() !== ''
      ? body.message
      : fallbackMessage;
  const details =
    isRecord(body) && Array.isArray(body.details)
      ? body.details.filter((item): item is string => typeof item === 'string')
      : [];
  return {
    status: 'unavailable',
    reason: 'remote-unavailable',
    message,
    details,
  };
}

export function createRemoteEngine(options: RemoteEngineOptions): WeightEstimationEngine {
  const baseUrl = options.endpoint.trim().replace(/\/+$/, '');
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return {
    id: 'remote',
    name: 'Modelo remoto',
    version: '—',
    availability: 'experimental',
    async estimate(request: EstimationRequest): Promise<EstimationResult> {
      const fetchFn = options.fetchImpl ?? globalThis.fetch;
      if (typeof fetchFn !== 'function') {
        return {
          status: 'error',
          recoverable: false,
          code: 'no-fetch',
          message: 'Este navegador não suporta o envio da imagem para análise.',
        };
      }

      const form = new FormData();
      form.append('image', request.image, request.fileName);
      form.append(
        'metadata',
        JSON.stringify({
          rotation: request.rotation,
          dressingPercent: request.dressingPercent,
          quality: {
            analyzed: request.quality.analyzed,
            score: request.quality.score,
            level: request.quality.level,
            issues: request.quality.issues.map((issue) => issue.code),
          },
          animal: request.animal,
          app: 'boiscan',
          appVersion: APP_VERSION,
        }),
      );

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      let response: Response;
      try {
        response = await fetchFn(`${baseUrl}/v1/estimate`, {
          method: 'POST',
          body: form,
          headers: { Accept: 'application/json' },
          signal: controller.signal,
        });
      } catch (error) {
        clearTimeout(timer);
        const aborted =
          error instanceof DOMException && error.name === 'AbortError';
        return {
          status: 'error',
          recoverable: true,
          code: aborted ? 'timeout' : 'network',
          message: aborted
            ? 'O modelo demorou demais para responder. Tente novamente.'
            : 'Não foi possível contatar o serviço de análise. Verifique a conexão.',
        };
      } finally {
        clearTimeout(timer);
      }

      let body: unknown = null;
      try {
        body = await response.json();
      } catch {
        body = null;
      }

      if (response.status === 503) {
        return unavailableFromBody(
          body,
          'O serviço de estimativa está temporariamente indisponível.',
        );
      }

      if (!response.ok) {
        const detailMessage =
          isRecord(body) && typeof body.message === 'string'
            ? body.message
            : `O serviço de análise respondeu com erro (HTTP ${response.status}).`;
        return {
          status: 'error',
          recoverable: response.status >= 500 || response.status === 429,
          code: `http-${response.status}`,
          message: detailMessage,
        };
      }

      const parsed = parseSuccessBody(body);
      if (!parsed) {
        return {
          status: 'error',
          recoverable: false,
          code: 'invalid-response',
          message:
            'A resposta do modelo não segue o contrato esperado e foi descartada. Nenhum valor foi exibido.',
        };
      }

      return parsed;
    },
  };
}
