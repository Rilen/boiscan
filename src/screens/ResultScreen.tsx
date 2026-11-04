import {
  computeHotCarcassArrobas,
  formatAnalyzedAt,
  formatArrobas,
  formatKg,
  formatPercent,
} from '../domain/arroba';
import { qualityLabel, type ImageQuality } from '../domain/imageQuality';
import type { EstimateSuccess, EstimationResult } from '../engine/types';
import { DressingSelector } from '../components/DressingSelector';
import { AlertIcon, InfoIcon, ScaleIcon, ShieldIcon } from '../components/icons';

interface ResultScreenProps {
  estimate: EstimationResult;
  quality: ImageQuality | null;
  dressingPercent: number;
  onDressingChange: (value: number) => boolean;
  onReset: () => void;
}

function SuccessResult({
  estimate,
  quality,
  dressingPercent,
  onDressingChange,
  onReset,
}: {
  estimate: EstimateSuccess;
  quality: ImageQuality | null;
  dressingPercent: number;
  onDressingChange: (value: number) => boolean;
  onReset: () => void;
}) {
  const simulated = estimate.simulated;
  const validated = estimate.model.validated && estimate.status === 'ok' && !simulated;
  const photoExperimental = estimate.status === 'experimental' && estimate.model.name.includes('fotográfico experimental');

  if (photoExperimental) {
    return (
      <section className="screen screen--result screen--photo-experimental">
        <h1 className="sr-only">Resultado experimental</h1>
        <div className="result-hero">
          <p className="result-label" data-testid="photo-weight-result">
            Peso estimado experimental: aproximadamente {formatKg(estimate.liveWeightKg)}.
          </p>
          <p className="result-interval">Modelo em teste, ainda sem validação de campo.</p>
        </div>
        <section className="card" aria-labelledby="photo-meta-title">
          <h2 id="photo-meta-title" className="card__title">Detalhes do experimento</h2>
          <dl className="meta-list">
            <div className="meta-list__row"><dt>Modelo</dt><dd>{estimate.model.name}</dd></div>
            <div className="meta-list__row"><dt>Versão</dt><dd>{estimate.model.version}</dd></div>
            <div className="meta-list__row"><dt>Data da análise</dt><dd>{formatAnalyzedAt(estimate.analyzedAt)}</dd></div>
            <div className="meta-list__row"><dt>Situação</dt><dd>Experimental, não validado em campo</dd></div>
          </dl>
        </section>
        <p className="fine-print">A imagem foi processada localmente no navegador. Nenhuma foto foi enviada para um serviço de peso.</p>
        <div className="actions-stack">
          <button type="button" className="button button--primary button--large" onClick={onReset}>
            <ScaleIcon />
            <span>Analisar outra foto</span>
          </button>
        </div>
      </section>
    );
  }

  const arrobas = computeHotCarcassArrobas(estimate.liveWeightKg, dressingPercent);

  return (
    <section className="screen screen--result">
      <h1 className="sr-only">Resultado da análise</h1>

      {simulated && (
        <div className="alert alert--simulation" role="alert">
          <AlertIcon className="alert__icon" />
          <p className="alert__text">
            <strong>SIMULAÇÃO — NÃO É UMA ESTIMATIVA REAL.</strong> Este valor foi gerado
            a partir do arquivo apenas para testar a interface.
          </p>
        </div>
      )}

      {!simulated && !validated && (
        <div className="alert alert--warning" role="alert">
          <AlertIcon className="alert__icon" />
          <p className="alert__text">
            <strong>Resultado experimental.</strong>{' '}
            {estimate.disclaimer ??
              'Este modelo ainda não foi validado com pesagens reais. Não use para decisões comerciais.'}
          </p>
        </div>
      )}

      <div className="result-hero">
        <p className="result-label">
          {simulated ? 'Valor fictício de demonstração' : 'Peso vivo estimado'}
        </p>
        <p className="result-weight" aria-live="polite">
          {formatKg(estimate.liveWeightKg)}
        </p>
        {estimate.interval && (
          <p className="result-interval">
            Intervalo estimado: {formatKg(estimate.interval.lowerKg)} a{' '}
            {formatKg(estimate.interval.upperKg)}
            {estimate.interval.coveragePercent
              ? ` (cobertura declarada de ${formatPercent(estimate.interval.coveragePercent)})`
              : ''}
          </p>
        )}
        {validated && (
          <p className="result-validated">
            <ShieldIcon className="inline-icon" />
            Produzido por modelo marcado como validado.
          </p>
        )}
      </div>

      <section className="arrobas-card" aria-labelledby="arrobas-title">
        <div className="arrobas-card__head">
          <div>
            <h2 id="arrobas-title" className="arrobas-card__title">
              {simulated ? 'Arrobas fictícias (simulação)' : 'Arrobas comerciais estimadas'}
            </h2>
            <p className="arrobas-card__formula">
              peso vivo × {formatPercent(dressingPercent)} ÷ 15
            </p>
          </div>
          <p className="arrobas-card__value">{formatArrobas(arrobas)}</p>
        </div>
        <p className="arrobas-card__note">
          O rendimento de carcaça é um pressuposto configurável, não uma medição do
          animal. Arrobas de carcaça não são iguais a arrobas de peso vivo.
        </p>
      </section>

      <section className="card">
        <DressingSelector value={dressingPercent} onChange={onDressingChange} compact />
      </section>

      <section className="card" aria-labelledby="meta-title">
        <h2 id="meta-title" className="card__title">
          Detalhes da análise
        </h2>
        <dl className="meta-list">
          <div className="meta-list__row">
            <dt>Qualidade da foto</dt>
            <dd>
              {quality ? `${qualityLabel(quality)}${quality.analyzed ? ` · ${quality.score}/100` : ''}` : '—'}
            </dd>
          </div>
          <div className="meta-list__row">
            <dt>Modelo</dt>
            <dd>{estimate.model.name}</dd>
          </div>
          <div className="meta-list__row">
            <dt>Versão</dt>
            <dd>{estimate.model.version}</dd>
          </div>
          <div className="meta-list__row">
            <dt>Data da análise</dt>
            <dd>{formatAnalyzedAt(estimate.analyzedAt)}</dd>
          </div>
          <div className="meta-list__row">
            <dt>Situação do modelo</dt>
            <dd>
              {simulated
                ? 'Simulação local'
                : validated
                  ? 'Validado'
                  : 'Experimental, não validado'}
            </dd>
          </div>
        </dl>
      </section>

      <details className="disclosure">
        <summary>Qual a confiabilidade deste resultado?</summary>
        <p>
          {simulated
            ? 'Nenhuma. Em modo de simulação o número é fictício e não representa o peso do animal.'
            : validated
              ? 'O resultado é uma estimativa estatística. A precisão depende da raça, idade, condição corporal, ângulo da foto, distância e iluminação. Não há promessa de precisão fixa; consulte o intervalo e a validação do modelo.'
              : 'Este resultado vem de um modelo ainda não validado com pesagens reais. Trate-o como demonstração técnica e não como informação zootécnica.'}
        </p>
      </details>

      <div className="actions-stack">
        <button type="button" className="button button--primary button--large" onClick={onReset}>
          <ScaleIcon />
          <span>Analisar outra foto</span>
        </button>
      </div>
    </section>
  );
}

function UnavailableResult({
  message,
  details,
  quality,
  onReset,
}: {
  message: string;
  details: string[];
  quality: ImageQuality | null;
  onReset: () => void;
}) {
  return (
    <section className="screen screen--result screen--unavailable">
      <div className="status-orb" aria-hidden="true">
        <InfoIcon />
      </div>
      <p className="eyebrow">Resultado da verificação</p>
      <h1 className="screen-title">Estimativa indisponível</h1>
      <p className="lede">{message}</p>

      {details.length > 0 && (
        <ul className="detail-list">
          {details.map((detail) => (
            <li key={detail}>{detail}</li>
          ))}
        </ul>
      )}

      <section className="card">
        <h2 className="card__title">O que funcionou</h2>
        <ul className="check-list">
          <li>Foto recebida e exibida no seu aparelho.</li>
          <li>
            Qualidade avaliada
            {quality?.analyzed ? `: ${qualityLabel(quality)} (${quality.score}/100).` : ' automaticamente.'}
          </li>
          <li>Conversão de peso vivo em arrobas disponível e testada.</li>
        </ul>
        <p className="fine-print">
          Nenhum peso ou valor em arrobas foi exibido, porque não há resultado de modelo
          que sustente esses números.
        </p>
      </section>

      <p className="fine-print">
        Para habilitar a estimativa, é necessário conectar um modelo de visão
        computacional calibrado com pesagens reais e validado em dados que não participaram
        do treinamento. Consulte a documentação técnica do projeto.
      </p>

      <div className="actions-stack">
        <button type="button" className="button button--primary button--large" onClick={onReset}>
          Escolher outra foto
        </button>
      </div>
    </section>
  );
}

export function ResultScreen(props: ResultScreenProps) {
  const { estimate, quality, dressingPercent, onDressingChange, onReset } = props;

  if (estimate.status === 'unavailable') {
    return (
      <UnavailableResult
        message={estimate.message}
        details={estimate.details}
        quality={quality}
        onReset={onReset}
      />
    );
  }

  if (estimate.status === 'error') {
    return (
      <section className="screen screen--result">
        <div className="alert alert--error" role="alert">
          <AlertIcon className="alert__icon" />
          <p className="alert__text">{estimate.message}</p>
        </div>
        <button type="button" className="button button--primary button--large" onClick={onReset}>
          Voltar ao início
        </button>
      </section>
    );
  }

  return (
    <SuccessResult
      estimate={estimate}
      quality={quality}
      dressingPercent={dressingPercent}
      onDressingChange={onDressingChange}
      onReset={onReset}
    />
  );
}
