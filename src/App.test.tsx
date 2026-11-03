import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import type {
  EstimateSuccess,
  EstimationResult,
  WeightEstimationEngine,
} from './engine/types';
import { simulationEngine } from './engine/simulationEngine';
import { createUnavailableEngine } from './engine/unavailableEngine';

function makeFile(
  name = 'boi.jpg',
  type = 'image/jpeg',
  bytes: number[] = [1, 2, 3],
): File {
  return new File([new Uint8Array(bytes)], name, { type });
}

const success: EstimateSuccess = {
  status: 'ok',
  liveWeightKg: 520,
  model: { name: 'bovine-weightnet', version: '1.2.0', validated: true },
  analyzedAt: '2026-11-03T12:00:00.000Z',
  simulated: false,
};

function validatedEngine(): WeightEstimationEngine {
  return {
    id: 'test-validated',
    name: 'Modelo de teste',
    version: '1.2.0',
    availability: 'validated',
    estimate: vi.fn(async () => success),
  };
}

async function selectPhoto(
  user: ReturnType<typeof userEvent.setup>,
  file = makeFile(),
  label = 'Fotografar boi',
): Promise<void> {
  const input = screen.getByLabelText(label);
  await user.upload(input as HTMLInputElement, file);
  await screen.findByRole('heading', { name: 'Conferir foto' });
  await screen.findByRole('heading', { name: 'Qualidade da foto' });
}

beforeEach(() => {
  vi.mocked(createImageBitmap).mockClear();
  vi.mocked(URL.revokeObjectURL).mockClear();
  vi.mocked(URL.createObjectURL).mockClear();
});

describe('tela inicial', () => {
  it('apresenta marca, ações e orientação sem exigir login', () => {
    render(<App />);

    expect(
      screen.getByRole('heading', { level: 1, name: 'BoiScan' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Peso bovino estimado por imagem.')).toBeInTheDocument();
    expect(screen.getByLabelText('Fotografar boi')).toBeInTheDocument();
    expect(screen.getByLabelText('Fotografar boi')).toHaveAttribute(
      'capture',
      'environment',
    );
    expect(screen.getByLabelText('Escolher foto')).toBeInTheDocument();
    expect(screen.getByLabelText('Escolher foto')).not.toHaveAttribute('capture');
    expect(
      screen.getByText(
        'Fotografe o animal inteiro, de lado, com boa iluminação e sem obstáculos.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Sem cadastro\. Sem rastreamento\./),
    ).toBeInTheDocument();
    expect(screen.getByText('Estimativa indisponível')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Política de privacidade' }),
    ).toHaveAttribute('href', '/privacidade.html');
  });

  it('mantém link de salto para o conteúdo', () => {
    render(<App />);
    expect(screen.getByText('Pular para o conteúdo')).toHaveAttribute(
      'href',
      '#conteudo',
    );
  });
});

describe('seleção, prévia e substituição de imagem', () => {
  it('exibe a foto selecionada e permite analisar', async () => {
    const user = userEvent.setup();
    render(<App />);

    await selectPhoto(user);

    const preview = screen.getByAltText('Prévia da foto selecionada do bovino');
    expect(preview).toBeInTheDocument();
    expect(preview.getAttribute('src')).toMatch(/^blob:/);
    expect(screen.getByText('1200×800 px')).toBeInTheDocument();
    expect(
      screen.getByText(/Qualidade não avaliada automaticamente/i),
    ).toBeInTheDocument();
  });

  it('mostra estado de carregamento enquanto lê o arquivo', async () => {
    let releaseBitmap: ((value: ImageBitmap) => void) | undefined;
    vi.mocked(createImageBitmap).mockImplementationOnce(
      () =>
        new Promise<ImageBitmap>((resolve) => {
          releaseBitmap = resolve;
        }),
    );

    const user = userEvent.setup();
    render(<App />);

    await user.upload(
      screen.getByLabelText('Fotografar boi') as HTMLInputElement,
      makeFile(),
    );

    expect(await screen.findByText('Carregando foto…')).toBeInTheDocument();

    await act(async () => {
      releaseBitmap?.({ width: 1200, height: 800 } as ImageBitmap);
    });

    expect(
      await screen.findByRole('heading', { name: 'Conferir foto' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Carregando foto…')).not.toBeInTheDocument();
  });

  it('substitui a imagem e libera a URL anterior', async () => {
    const user = userEvent.setup();
    render(<App />);

    await selectPhoto(user, makeFile('primeira.jpg', 'image/jpeg', [1]));
    const firstSrc = screen
      .getByAltText('Prévia da foto selecionada do bovino')
      .getAttribute('src');
    expect(firstSrc).toBeTruthy();

    await user.upload(
      screen.getByLabelText('Trocar foto') as HTMLInputElement,
      makeFile('segunda.jpg', 'image/jpeg', [9, 9, 9]),
    );

    await waitFor(() => {
      const current = screen
        .getByAltText('Prévia da foto selecionada do bovino')
        .getAttribute('src');
      expect(current).not.toBe(firstSrc);
    });
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(firstSrc);
    expect(createImageBitmap).toHaveBeenCalledTimes(2);
  });

  it('rotaciona a prévia em 90 graus', async () => {
    const user = userEvent.setup();
    render(<App />);
    await selectPhoto(user);

    await user.click(screen.getByRole('button', { name: 'Rotacionar' }));
    expect(
      screen.getByAltText('Prévia da foto selecionada do bovino').style.transform,
    ).toContain('rotate(90deg)');
  });

  it('trata arquivo de tipo inválido de forma recuperável', async () => {
    const user = userEvent.setup({ applyAccept: false });
    render(<App />);

    await user.upload(
      screen.getByLabelText('Fotografar boi') as HTMLInputElement,
      makeFile('nota.txt', 'text/plain'),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /Formato não suportado/,
    );
    expect(screen.getByRole('heading', { level: 1, name: 'BoiScan' })).toBeInTheDocument();
    expect(createImageBitmap).not.toHaveBeenCalled();
  });

  it('trata imagem corrompida sem travar o fluxo', async () => {
    vi.mocked(createImageBitmap).mockRejectedValueOnce(new Error('decode failed'));
    const user = userEvent.setup();
    render(<App />);

    await user.upload(
      screen.getByLabelText('Fotografar boi') as HTMLInputElement,
      makeFile(),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /Não foi possível ler esta imagem/,
    );
    expect(screen.getByLabelText('Fotografar boi')).toBeInTheDocument();
    expect(URL.revokeObjectURL).toHaveBeenCalled();
  });
});

describe('análise e resultado', () => {
  it('exige consentimento antes de enviar a foto a um motor remoto', async () => {
    const user = userEvent.setup();
    const estimate = vi.fn(async (): Promise<EstimationResult> => ({
      status: 'unavailable',
      reason: 'remote-unavailable',
      message: 'Serviço indisponível.',
      details: [],
    }));
    const engine: WeightEstimationEngine = {
      id: 'remote',
      name: 'Modelo remoto',
      version: '—',
      availability: 'experimental',
      estimate,
    };
    render(<App engine={engine} />);

    await selectPhoto(user);

    const analyze = screen.getByRole('button', { name: 'Analisar foto' });
    expect(analyze).toBeDisabled();

    const consent = screen.getByRole('checkbox', { name: /Autorizo o envio/ });
    expect(consent).not.toBeChecked();
    await user.click(consent);

    expect(analyze).toBeEnabled();
    await user.click(analyze);

    expect(await screen.findByText('Serviço indisponível.')).toBeInTheDocument();
    expect(estimate).toHaveBeenCalledOnce();
  });

  it('exibe peso e arrobas calculados pelo resultado do motor', async () => {
    const user = userEvent.setup();
    const engine = validatedEngine();
    render(<App engine={engine} />);

    await selectPhoto(user);
    await user.click(screen.getByRole('button', { name: 'Analisar foto' }));

    expect(await screen.findByText('Peso vivo estimado')).toBeInTheDocument();
    expect(screen.getByText('520 kg')).toBeInTheDocument();
    expect(screen.getByText('18,0 @')).toBeInTheDocument();
    expect(screen.getByText('bovine-weightnet')).toBeInTheDocument();
    expect(screen.getByText('1.2.0')).toBeInTheDocument();
    expect(screen.getByText('Validado')).toBeInTheDocument();
    expect(engine.estimate).toHaveBeenCalledOnce();
  });

  it('recalcula arrobas quando o rendimento é alterado', async () => {
    const user = userEvent.setup();
    render(<App engine={validatedEngine()} />);

    await selectPhoto(user);
    await user.click(screen.getByRole('button', { name: 'Analisar foto' }));
    await screen.findByText('520 kg');

    const slider = screen.getByLabelText('Rendimento de carcaça');
    fireEvent.change(slider, { target: { value: '50' } });

    expect(await screen.findByText('17,3 @')).toBeInTheDocument();
    expect(screen.getByText('50%')).toBeInTheDocument();
    expect(localStorage.getItem('boiscan.dressingPercent')).toBe('50');
  });

  it('migra a preferência antiga de rendimento para a chave BoiScan', async () => {
    localStorage.setItem('arroba.dressingPercent', '60');
    const user = userEvent.setup();
    render(<App engine={validatedEngine()} />);

    await selectPhoto(user);

    expect(screen.getByLabelText('Rendimento de carcaça')).toHaveValue('60');
    expect(localStorage.getItem('boiscan.dressingPercent')).toBe('60');
    expect(localStorage.getItem('arroba.dressingPercent')).toBeNull();
  });

  it('mostra indisponibilidade sem qualquer número inventado', async () => {
    const user = userEvent.setup();
    render(<App engine={createUnavailableEngine()} />);

    await selectPhoto(user);
    await user.click(screen.getByRole('button', { name: 'Analisar foto' }));

    expect(
      await screen.findByRole('heading', { name: 'Estimativa indisponível' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Nenhum peso ou valor em arrobas foi exibido/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/\d+ kg/)).not.toBeInTheDocument();
    expect(screen.queryByText(/\d+,\d @/)).not.toBeInTheDocument();
  });

  it('identifica resultado experimental', async () => {
    const user = userEvent.setup();
    const engine: WeightEstimationEngine = {
      id: 'test-experimental',
      name: 'Experimental',
      version: '0.1',
      availability: 'experimental',
      estimate: async () => ({
        status: 'experimental',
        liveWeightKg: 430,
        model: { name: 'peso-v0', version: '0.1', validated: false },
        analyzedAt: '2026-11-03T12:00:00.000Z',
        simulated: false,
        disclaimer: 'Modelo não validado com pesagens reais.',
      }),
    };
    render(<App engine={engine} />);

    await selectPhoto(user);
    await user.click(screen.getByRole('button', { name: 'Analisar foto' }));

    expect(await screen.findByText('Resultado experimental.')).toBeInTheDocument();
    expect(
      screen.getByText('Modelo não validado com pesagens reais.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Experimental, não validado')).toBeInTheDocument();
  });

  it('marca simulação de forma ostensiva', async () => {
    const user = userEvent.setup();
    render(<App engine={simulationEngine} />);

    await selectPhoto(user);
    await user.click(screen.getByRole('button', { name: 'Analisar foto' }));

    expect(
      await screen.findByText(/SIMULAÇÃO — NÃO É UMA ESTIMATIVA REAL/),
    ).toBeInTheDocument();
    expect(screen.getByText('Valor fictício de demonstração')).toBeInTheDocument();
    expect(screen.getByText('Arrobas fictícias (simulação)')).toBeInTheDocument();
    expect(screen.getByText('Simulação local')).toBeInTheDocument();
  });

  it('retorna à conferência quando o motor falha e permite tentar novamente', async () => {
    const user = userEvent.setup();
    const estimate = vi
      .fn<() => Promise<EstimationResult>>()
      .mockResolvedValueOnce({
        status: 'error',
        message: 'Serviço temporariamente fora do ar.',
        recoverable: true,
      })
      .mockResolvedValueOnce(success);
    const engine: WeightEstimationEngine = {
      id: 'test-flaky',
      name: 'Instável',
      version: '1',
      availability: 'experimental',
      estimate,
    };
    render(<App engine={engine} />);

    await selectPhoto(user);
    await user.click(screen.getByRole('button', { name: 'Analisar foto' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Serviço temporariamente fora do ar.',
    );
    expect(
      screen.getByRole('heading', { name: 'Conferir foto' }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Analisar foto' }));
    expect(await screen.findByText('520 kg')).toBeInTheDocument();
    expect(estimate).toHaveBeenCalledTimes(2);
  });

  it('permite cancelar a análise em andamento', async () => {
    const user = userEvent.setup();
    let resolveEstimate: ((result: EstimationResult) => void) | undefined;
    const engine: WeightEstimationEngine = {
      id: 'test-slow',
      name: 'Lento',
      version: '1',
      availability: 'experimental',
      estimate: () =>
        new Promise<EstimationResult>((resolve) => {
          resolveEstimate = resolve;
        }),
    };
    render(<App engine={engine} />);

    await selectPhoto(user);
    await user.click(screen.getByRole('button', { name: 'Analisar foto' }));

    expect(
      await screen.findByRole('heading', { name: 'Analisando imagem…' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('520 kg')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(
      await screen.findByRole('heading', { name: 'Conferir foto' }),
    ).toBeInTheDocument();

    await act(async () => {
      resolveEstimate?.(success);
    });

    expect(screen.queryByText('520 kg')).not.toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Conferir foto' }),
    ).toBeInTheDocument();
  });
});
