import { APP_NAME } from '../config';
import { PhotoInput } from '../components/PhotoInput';
import { ErrorBanner } from '../components/ErrorBanner';
import { CameraIcon, CowIcon, InfoIcon, PhotoIcon, ShieldIcon } from '../components/icons';
import type { WeightEstimationEngine } from '../engine/types';

interface HomeScreenProps {
  engine: WeightEstimationEngine;
  error: string | null;
  loading: boolean;
  onSelect: (file: File) => void;
  onDismissError: () => void;
}

export function HomeScreen({
  engine,
  error,
  loading,
  onSelect,
  onDismissError,
}: HomeScreenProps) {
  const isSimulation = engine.id === 'simulation';
  const unavailable = engine.availability === 'unavailable';
  const photoExperimental = engine.id === 'photo-weight-experimental';

  return (
    <section className="screen screen--home">
      <div className="hero">
        <p className="eyebrow">Peso bovino por fotografia</p>
        <h1 className="display">{APP_NAME}</h1>
        <p className="tagline">Peso bovino estimado por imagem.</p>
        <p className="lede">
          Fotografe o animal de lado e receba uma estimativa experimental de peso vivo.
          Modelo em teste, ainda sem validação de campo.
        </p>
      </div>

      {error && <ErrorBanner message={error} onDismiss={onDismissError} />}

      <div className="capture-card" aria-busy={loading}>
        <div className="capture-visual" aria-hidden="true">
          <CowIcon className="capture-visual__icon" />
          <span className="capture-visual__caption">animal inteiro · perfil lateral</span>
          <span className="capture-visual__corner capture-visual__corner--tl" />
          <span className="capture-visual__corner capture-visual__corner--tr" />
          <span className="capture-visual__corner capture-visual__corner--bl" />
          <span className="capture-visual__corner capture-visual__corner--br" />
        </div>

        <div className="capture-actions">
          <PhotoInput
            label="Fotografar boi"
            onSelect={onSelect}
            capture
            variant="primary"
            icon={<CameraIcon className="button__icon" />}
          />
          <PhotoInput
            label="Escolher foto"
            onSelect={onSelect}
            variant="secondary"
            icon={<PhotoIcon className="button__icon" />}
          />
        </div>

        {loading && (
          <p className="loading-line" role="status">
            <span className="spinner" aria-hidden="true" />
            Carregando foto…
          </p>
        )}

        <p className="guidance">
          Fotografe o animal inteiro, de lado, com boa iluminação e sem obstáculos.
        </p>
      </div>

      <ul className="tips" aria-label="Dicas para uma boa foto">
        <li>Corpo inteiro no quadro</li>
        <li>Perfil lateral</li>
        <li>Luz natural difusa</li>
        <li>Sem pessoas ou cercas na frente</li>
      </ul>

      {unavailable && (
        <div className="notice">
          <InfoIcon className="notice__icon" />
          <div>
            <p className="notice__title">A estimativa de peso ainda não está disponível.</p>
            <p className="notice__text">
              Esta instalação não possui um modelo validado conectado. Você pode
              fotografar, conferir a qualidade da imagem e conhecer as limitações — sem
              números inventados.
            </p>
          </div>
        </div>
      )}

      {photoExperimental && (
        <div className="notice notice--warning">
          <InfoIcon className="notice__icon" />
          <div>
            <p className="notice__title">Peso experimental — modelo em teste.</p>
            <p className="notice__text">
              A estimativa é gerada por um modelo ainda sem validação de campo. Pode
              errar, inclusive em animais grandes. Não use para decisão comercial.
            </p>
          </div>
        </div>
      )}

      {isSimulation && (
        <div className="notice notice--warning">
          <InfoIcon className="notice__icon" />
          <div>
            <p className="notice__title">Simulação ativa — ambiente de desenvolvimento.</p>
            <p className="notice__text">
              Os valores gerados são fictícios, servem apenas para testar a interface e
              nunca devem ser usados como estimativa de peso.
            </p>
          </div>
        </div>
      )}

      {engine.availability === 'validated' && (
        <div className="notice notice--ok">
          <ShieldIcon className="notice__icon" />
          <div>
            <p className="notice__title">Modelo validado conectado.</p>
            <p className="notice__text">
              A estimativa ainda é aproximada e depende da qualidade da foto e do
              enquadramento do animal.
            </p>
          </div>
        </div>
      )}

      <p className="privacy-note">
        <ShieldIcon className="inline-icon" />
        Sem cadastro. Sem rastreamento.
        {engine.id === 'remote'
          ? ' A foto é enviada somente ao serviço de análise configurado.'
          : ' As fotos ficam no seu aparelho.'}
      </p>
    </section>
  );
}
