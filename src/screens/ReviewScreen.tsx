import { useEffect, useState } from 'react';
import { DressingSelector } from '../components/DressingSelector';
import { ErrorBanner } from '../components/ErrorBanner';
import { PhotoInput } from '../components/PhotoInput';
import { QualityPanel } from '../components/QualityPanel';
import { ArrowLeftIcon, RotateIcon, ScaleIcon } from '../components/icons';
import type { WeightEstimationEngine } from '../engine/types';
import type { Rotation } from '../hooks/useBoiScanFlow';
import type { ImageQuality } from '../domain/imageQuality';
import type { LoadedImage } from '../lib/image';

interface ReviewScreenProps {
  image: LoadedImage;
  rotation: Rotation;
  quality: ImageQuality | null;
  qualityChecking: boolean;
  canAnalyze: boolean;
  imageLoading: boolean;
  engine: WeightEstimationEngine;
  dressingPercent: number;
  error: string | null;
  onSelect: (file: File) => void;
  onRotate: () => void;
  onAnalyze: () => void;
  onRemove: () => void;
  onDressingChange: (value: number) => boolean;
  onDismissError: () => void;
}

export function ReviewScreen({
  image,
  rotation,
  quality,
  qualityChecking,
  canAnalyze,
  imageLoading,
  engine,
  dressingPercent,
  error,
  onSelect,
  onRotate,
  onAnalyze,
  onRemove,
  onDressingChange,
  onDismissError,
}: ReviewScreenProps) {
  const remote = engine.id === 'remote';
  const [uploadConsent, setUploadConsent] = useState(false);
  const blocked = quality?.analyzed === true && !canAnalyze;

  useEffect(() => {
    setUploadConsent(false);
  }, [image.url]);

  return (
    <section className="screen screen--review">
      <div className="screen-head">
        <button type="button" className="icon-button" onClick={onRemove} aria-label="Voltar ao início">
          <ArrowLeftIcon />
        </button>
        <div>
          <p className="eyebrow">Etapa 1 de 2</p>
          <h1 className="screen-title">Conferir foto</h1>
        </div>
      </div>

      {error && <ErrorBanner message={error} onDismiss={onDismissError} />}

      <figure className="photo-frame">
        <img
          className="photo-frame__image"
          src={image.url}
          alt="Prévia da foto selecionada do bovino"
          style={{ transform: `rotate(${rotation}deg)` }}
        />
        <figcaption className="photo-frame__caption">
          {image.width}×{image.height} px
        </figcaption>
      </figure>

      <div className="photo-actions">
        <button type="button" className="button button--ghost" onClick={onRotate}>
          <RotateIcon />
          <span>Rotacionar</span>
        </button>
        <PhotoInput label="Trocar foto" onSelect={onSelect} variant="ghost" />
      </div>

      {imageLoading && (
        <p className="loading-line" role="status">
          <span className="spinner" aria-hidden="true" />
          Carregando nova foto…
        </p>
      )}

      <QualityPanel checking={qualityChecking} quality={quality} />

      <section className="card">
        <DressingSelector value={dressingPercent} onChange={onDressingChange} />
      </section>

      {remote && (
        <label className="consent">
          <input
            type="checkbox"
            checked={uploadConsent}
            onChange={(event) => setUploadConsent(event.target.checked)}
          />
          <span>
            Autorizo o envio desta foto ao serviço de análise configurado para gerar a
            estimativa.
          </span>
        </label>
      )}

      {blocked && (
        <p className="blocked-note" role="status">
          Troque a foto ou ajuste a iluminação para atender aos requisitos mínimos antes
          de analisar.
        </p>
      )}

      <button
        type="button"
        className="button button--primary button--large"
        onClick={onAnalyze}
        disabled={!canAnalyze || (remote && !uploadConsent)}
      >
        <ScaleIcon />
        <span>Analisar foto</span>
      </button>

      <p className="fine-print">
        {engine.availability === 'unavailable'
          ? 'Nenhum modelo de peso está conectado. A análise confirmará a indisponibilidade da estimativa, sem exibir valores inventados.'
          : engine.id === 'simulation'
            ? 'Ambiente de simulação: o resultado será fictício e identificado como tal.'
            : 'A estimativa só é exibida quando o modelo retorna um resultado dentro do contrato.'}
      </p>
    </section>
  );
}
