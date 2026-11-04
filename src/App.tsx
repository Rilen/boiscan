import { useMemo } from 'react';
import { APP_NAME, APP_VERSION } from './config';
import { EngineBadge } from './components/EngineBadge';
import { ShieldIcon } from './components/icons';
import { createPhotoWeightEngine } from './engine/photoWeightEngine';
import { resolveEngine } from './engine/registry';
import type { WeightEstimationEngine } from './engine/types';
import { useBoiScanFlow } from './hooks/useBoiScanFlow';
import { AnalyzingScreen } from './screens/AnalyzingScreen';
import { HomeScreen } from './screens/HomeScreen';
import { ResultScreen } from './screens/ResultScreen';
import { ReviewScreen } from './screens/ReviewScreen';

export interface AppProps {
  engine?: WeightEstimationEngine;
}

export default function App({ engine: engineProp }: AppProps) {
  const engine = useMemo(() => {
    if (engineProp) return engineProp;
    const params = typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search)
      : null;
    if (params?.get('experimental') === 'weight') return createPhotoWeightEngine();
    if (import.meta.env.VITE_EXPERIMENTAL_WEIGHT === 'true') return createPhotoWeightEngine();
    return resolveEngine(import.meta.env);
  }, [engineProp]);
  const flow = useBoiScanFlow(engine);

  const showHome = () => {
    if (flow.phase === 'home') return;
    flow.reset();
  };

  return (
    <div className="app">
      <a className="skip-link" href="#conteudo">
        Pular para o conteúdo
      </a>

      <header className="topbar">
        <button
          type="button"
          className="brand"
          onClick={showHome}
          aria-label={`${APP_NAME} — início`}
        >
          <span className="brand__mark" aria-hidden="true">
            B
          </span>
          <span className="brand__name">{APP_NAME}</span>
        </button>
        <EngineBadge availability={engine.availability} engineId={engine.id} />
      </header>

      <main id="conteudo" className="main">
        {flow.phase === 'home' && (
          <HomeScreen
            engine={engine}
            error={flow.error}
            loading={flow.imageLoading}
            onSelect={flow.chooseFile}
            onDismissError={flow.dismissError}
          />
        )}

        {flow.phase === 'review' && flow.image && (
          <ReviewScreen
            image={flow.image}
            rotation={flow.rotation}
            quality={flow.quality}
            qualityChecking={flow.qualityChecking}
            canAnalyze={flow.canAnalyze}
            imageLoading={flow.imageLoading}
            engine={engine}
            dressingPercent={flow.dressingPercent}
            error={flow.error}
            onSelect={flow.chooseFile}
            onRotate={flow.rotate}
            onAnalyze={flow.analyze}
            onRemove={flow.removeImage}
            onDressingChange={flow.setDressingPercent}
            onDismissError={flow.dismissError}
          />
        )}

        {flow.phase === 'analyzing' && flow.image && (
          <AnalyzingScreen
            image={flow.image}
            rotation={flow.rotation}
            engine={engine}
            onCancel={flow.cancelAnalysis}
          />
        )}

        {flow.phase === 'result' && flow.estimate && (
          <ResultScreen
            estimate={flow.estimate}
            quality={flow.quality}
            dressingPercent={flow.dressingPercent}
            onDressingChange={flow.setDressingPercent}
            onReset={flow.reset}
          />
        )}

        {flow.phase !== 'home' && flow.phase !== 'analyzing' && !flow.image && (
          <HomeScreen
            engine={engine}
            error={flow.error}
            loading={flow.imageLoading}
            onSelect={flow.chooseFile}
            onDismissError={flow.dismissError}
          />
        )}
      </main>

      <footer className="footer">
        <p className="footer__privacy">
          <ShieldIcon className="inline-icon" />
          {engine.id === 'remote'
            ? 'A foto é enviada apenas ao serviço de análise configurado.'
            : 'As fotos ficam no seu aparelho.'}{' '}
          Sem cadastro e sem rastreamento.
        </p>
        <p className="footer__meta">
          <a className="footer__link" href="/privacidade.html">
            Política de privacidade
          </a>
          <span aria-hidden="true"> · </span>
          {APP_NAME} {APP_VERSION} · {engine.name}
          {engine.version !== '—' ? ` v${engine.version}` : ''}
        </p>
      </footer>
    </div>
  );
}
