import { describe, expect, it, vi } from 'vitest';
import { unknownQuality } from '../domain/imageQuality';
import { createRemoteEngine } from './remoteEngine';
import { resolveEngine } from './registry';
import { simulatedWeightFromHash, simulationEngine } from './simulationEngine';
import type { EstimationRequest, WeightEstimationEngine } from './types';
import { EXPERIMENTAL_DISCLAIMER } from './types';
import { createUnavailableEngine, unavailableEngine } from './unavailableEngine';

const request: EstimationRequest = {
  image: new File([new Uint8Array([0xff, 0xd8, 0xff, 0x01, 0x02, 0x03])], 'boi.jpg', {
    type: 'image/jpeg',
  }),
  fileName: 'boi.jpg',
  width: 1200,
  height: 800,
  rotation: 0,
  quality: unknownQuality(),
  dressingPercent: 52,
};

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

const validBody = {
  liveWeightKg: 520,
  model: { name: 'bovine-weightnet', version: '1.2.0', validated: true },
  analyzedAt: '2026-11-03T12:00:00.000Z',
  interval: { lowerKg: 488, upperKg: 552, coveragePercent: 90 },
};

describe('motor indisponível', () => {
  it('informa indisponibilidade sem qualquer número de peso', async () => {
    const result = await unavailableEngine.estimate(request);
    expect(result.status).toBe('unavailable');
    if (result.status === 'unavailable') {
      expect(result.reason).toBe('no-validated-model');
      expect(result.details.length).toBeGreaterThan(0);
      expect(result.message).toMatch(/não está disponível/i);
    }
    expect('liveWeightKg' in result).toBe(false);
  });

  it('expõe disponibilidade e identidade do motor', () => {
    expect(unavailableEngine.availability).toBe('unavailable');
    expect(unavailableEngine.id).toBe('unavailable');
    expect(createUnavailableEngine('not-configured').id).toBe('unavailable');
  });
});

describe('motor de simulação (somente desenvolvimento)', () => {
  it('é determinístico e claramente marcado como fictício', async () => {
    const first = await simulationEngine.estimate(request);
    const second = await simulationEngine.estimate(request);

    expect(first.status).toBe('experimental');
    if (first.status === 'experimental' && second.status === 'experimental') {
      expect(first.liveWeightKg).toBe(second.liveWeightKg);
      expect(first.simulated).toBe(true);
      expect(first.model.validated).toBe(false);
      expect(first.model.name).toMatch(/SIMULAÇÃO/);
      expect(first.disclaimer).toMatch(/não representa o peso/i);
    }
  });

  it('mantém o peso simulado em faixa plausível', () => {
    expect(simulatedWeightFromHash(0)).toBe(320);
    expect(simulatedWeightFromHash(320)).toBe(640);
    expect(simulatedWeightFromHash(123456)).toBeGreaterThanOrEqual(320);
    expect(simulatedWeightFromHash(123456)).toBeLessThanOrEqual(640);
  });
});

describe('adaptador remoto', () => {
  it('aceita resposta validada e preserva intervalo', async () => {
    const fetchImpl = vi.fn(
      async (_url: string, _init?: RequestInit) => jsonResponse(validBody),
    );
    const engine = createRemoteEngine({
      endpoint: 'https://api.exemplo.test/',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const result = await engine.estimate(request);
    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.liveWeightKg).toBe(520);
      expect(result.model.validated).toBe(true);
      expect(result.interval?.lowerKg).toBe(488);
      expect(result.simulated).toBe(false);
    }
    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe('https://api.exemplo.test/v1/estimate');
    expect(init?.method).toBe('POST');
    expect(init?.body).toBeInstanceOf(FormData);
  });

  it('marca modelo não validado como experimental', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        ...validBody,
        model: { ...validBody.model, validated: false },
      }),
    );
    const engine = createRemoteEngine({
      endpoint: 'https://api.exemplo.test',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const result = await engine.estimate(request);
    expect(result.status).toBe('experimental');
    if (result.status === 'experimental') {
      expect(result.model.validated).toBe(false);
      expect(result.disclaimer).toBe(EXPERIMENTAL_DISCLAIMER);
    }
  });

  it('nunca aceita flag simulada como resultado validado', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ ...validBody, simulated: true }),
    );
    const engine = createRemoteEngine({
      endpoint: 'https://api.exemplo.test',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const result = await engine.estimate(request);
    expect(result.status).toBe('experimental');
    if (result.status === 'experimental') {
      expect(result.simulated).toBe(true);
      expect(result.model.validated).toBe(false);
    }
  });

  it('descarta resposta fora do contrato sem inventar peso', async () => {
    const invalidPayloads: unknown[] = [
      {},
      { ...validBody, liveWeightKg: 99999 },
      { ...validBody, liveWeightKg: '520' },
      { ...validBody, model: { name: 'x', version: '1' } },
      { ...validBody, interval: { lowerKg: 600, upperKg: 700 } },
      { ...validBody, interval: { lowerKg: 530, upperKg: 700 } },
      null,
    ];

    for (const payload of invalidPayloads) {
      const engine = createRemoteEngine({
        endpoint: 'https://api.exemplo.test',
        fetchImpl: (async () => jsonResponse(payload)) as unknown as typeof fetch,
      });
      const result = await engine.estimate(request);
      expect(result.status).toBe('error');
      if (result.status === 'error') {
        expect(result.code).toBe('invalid-response');
        expect(result.recoverable).toBe(false);
      }
      expect('liveWeightKg' in result).toBe(false);
    }
  });

  it('trata HTTP 503 como motor indisponível', async () => {
    const engine = createRemoteEngine({
      endpoint: 'https://api.exemplo.test',
      fetchImpl: (async () =>
        jsonResponse(
          { message: 'Modelo em manutenção.', details: ['Tente mais tarde.'] },
          503,
        )) as unknown as typeof fetch,
    });
    const result = await engine.estimate(request);
    expect(result.status).toBe('unavailable');
    if (result.status === 'unavailable') {
      expect(result.reason).toBe('remote-unavailable');
      expect(result.message).toBe('Modelo em manutenção.');
      expect(result.details).toEqual(['Tente mais tarde.']);
    }
  });

  it('trata falha de rede como erro recuperável', async () => {
    const engine = createRemoteEngine({
      endpoint: 'https://api.exemplo.test',
      fetchImpl: (async () => {
        throw new TypeError('network down');
      }) as unknown as typeof fetch,
    });
    const result = await engine.estimate(request);
    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.recoverable).toBe(true);
      expect(result.code).toBe('network');
    }
  });

  it('trata timeout como erro recuperável', async () => {
    const engine = createRemoteEngine({
      endpoint: 'https://api.exemplo.test',
      fetchImpl: (async () => {
        throw new DOMException('aborted', 'AbortError');
      }) as unknown as typeof fetch,
    });
    const result = await engine.estimate(request);
    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.code).toBe('timeout');
      expect(result.recoverable).toBe(true);
    }
  });

  it('classifica erros HTTP 5xx como recuperáveis e 4xx como definitivos', async () => {
    const fetch500 = createRemoteEngine({
      endpoint: 'https://api.exemplo.test',
      fetchImpl: (async () =>
        jsonResponse({ message: 'falha interna' }, 500)) as unknown as typeof fetch,
    });
    const result500 = await fetch500.estimate(request);
    expect(result500.status).toBe('error');
    if (result500.status === 'error') expect(result500.recoverable).toBe(true);

    const fetch400 = createRemoteEngine({
      endpoint: 'https://api.exemplo.test',
      fetchImpl: (async () =>
        jsonResponse({ message: 'requisição inválida' }, 400)) as unknown as typeof fetch,
    });
    const result400 = await fetch400.estimate(request);
    expect(result400.status).toBe('error');
    if (result400.status === 'error') expect(result400.recoverable).toBe(false);
  });
});

describe('seleção de motor', () => {
  it('usa motor indisponível por padrão', () => {
    expect(resolveEngine({}).id).toBe('unavailable');
    expect(resolveEngine({ DEV: true }).id).toBe('unavailable');
  });

  it('ativa simulação apenas em desenvolvimento com flag explícita', () => {
    expect(
      resolveEngine({ DEV: true, VITE_ENABLE_SIMULATION: 'true' }).id,
    ).toBe('simulation');
    expect(
      resolveEngine({ DEV: false, VITE_ENABLE_SIMULATION: 'true' }).id,
    ).toBe('unavailable');
    expect(
      resolveEngine({ DEV: true, VITE_ENABLE_SIMULATION: 'false' }).id,
    ).toBe('unavailable');
  });

  it('prioriza endpoint remoto quando configurado', () => {
    const remote: WeightEstimationEngine = {
      id: 'remote',
      name: 'Remoto',
      version: '1',
      availability: 'experimental',
      estimate: async () => ({
        status: 'unavailable',
        reason: 'remote-unavailable',
        message: 'x',
        details: [],
      }),
    };
    const createRemote = vi.fn(() => remote);
    const engine = resolveEngine(
      {
        DEV: true,
        VITE_ENABLE_SIMULATION: 'true',
        VITE_ENGINE_ENDPOINT: ' https://api.exemplo.test ',
      },
      { createRemote },
    );
    expect(engine).toBe(remote);
    expect(createRemote).toHaveBeenCalledWith({
      endpoint: 'https://api.exemplo.test',
    });
  });
});
