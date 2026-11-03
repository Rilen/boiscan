import type { WeightEstimationEngine } from '../engine/types';
import type { Rotation } from '../hooks/useBoiScanFlow';
import type { LoadedImage } from '../lib/image';

interface AnalyzingScreenProps {
  image: LoadedImage;
  rotation: Rotation;
  engine: WeightEstimationEngine;
  onCancel: () => void;
}

export function AnalyzingScreen({ image, rotation, engine, onCancel }: AnalyzingScreenProps) {
  const remote = engine.id === 'remote';

  return (
    <section className="screen screen--analyzing" aria-busy="true">
      <figure className="photo-frame photo-frame--compact">
        <img
          className="photo-frame__image photo-frame__image--dim"
          src={image.url}
          alt="Foto do bovino em análise"
          style={{ transform: `rotate(${rotation}deg)` }}
        />
      </figure>

      <div className="analysis-status" role="status" aria-live="polite">
        <span className="spinner spinner--large" aria-hidden="true" />
        <h1 className="screen-title">Analisando imagem…</h1>
        <p className="muted">
          {remote
            ? 'A foto está sendo enviada ao serviço de análise configurado.'
            : 'A análise está sendo executada no seu aparelho.'}
        </p>
        <p className="fine-print">
          Nenhum resultado parcial é exibido. Se o modelo não estiver disponível, você
          verá uma mensagem clara — nunca um número inventado.
        </p>
      </div>

      <button type="button" className="button button--ghost" onClick={onCancel}>
        Cancelar
      </button>
    </section>
  );
}
