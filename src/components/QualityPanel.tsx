import {
  qualityLabel,
  warningIssues,
  blockingIssues,
  type ImageQuality,
} from '../domain/imageQuality';
import { CheckIcon, InfoIcon } from './icons';

interface QualityPanelProps {
  checking: boolean;
  quality: ImageQuality | null;
}

const LEVEL_HINT: Record<string, string> = {
  good: 'Boa imagem para análise.',
  fair: 'Imagem utilizável, com ressalvas.',
  poor: 'A imagem não atende aos requisitos mínimos.',
  unknown: 'Qualidade não avaliada automaticamente.',
};

export function QualityPanel({ checking, quality }: QualityPanelProps) {
  return (
    <section className="card quality" aria-live="polite" aria-busy={checking}>
      {checking && (
        <div className="quality__checking">
          <span className="spinner" aria-hidden="true" />
          <div>
            <h2 className="card__title">Verificando qualidade</h2>
            <p className="muted">
              Analisando resolução, iluminação, contraste e nitidez no seu aparelho.
            </p>
          </div>
        </div>
      )}

      {!checking && quality && (
        <>
          <div className="quality__head">
            <div>
              <h2 className="card__title">Qualidade da foto</h2>
              <p className="muted">{LEVEL_HINT[quality.level]}</p>
            </div>
            <span className={`quality-pill quality-pill--${quality.level}`}>
              {qualityLabel(quality)}
            </span>
          </div>

          {quality.analyzed && (
            <div className="meter" aria-hidden="true">
              <span className="meter__fill" style={{ width: `${quality.score}%` }} />
            </div>
          )}
          {quality.analyzed && (
            <p className="quality__score">
              Índice técnico da imagem: <strong>{quality.score}/100</strong>
              {quality.metrics
                ? ` · ${quality.metrics.sourceWidth}×${quality.metrics.sourceHeight} px`
                : ''}
            </p>
          )}

          {!quality.analyzed && (
            <p className="quality__unknown">
              <InfoIcon className="inline-icon" />
              Este navegador não permitiu a leitura dos pixels. A conferência automática
              foi ignorada; prossiga apenas se a foto estiver nítida e bem iluminada.
            </p>
          )}

          {blockingIssues(quality).length > 0 && (
            <ul className="issue-list issue-list--blocking">
              {blockingIssues(quality).map((issue) => (
                <li key={issue.code}>{issue.message}</li>
              ))}
            </ul>
          )}

          {warningIssues(quality).length > 0 && (
            <ul className="issue-list issue-list--warning">
              {warningIssues(quality).map((issue) => (
                <li key={issue.code}>{issue.message}</li>
              ))}
            </ul>
          )}

          {blockingIssues(quality).length === 0 && quality.level !== 'unknown' && (
            <p className="quality__ok">
              <CheckIcon className="inline-icon" />
              Requisitos técnicos mínimos atendidos.
            </p>
          )}

          <p className="quality__footnote">
            Esta conferência avalia a imagem, não confirma que o animal inteiro está
            enquadrado. O modelo de peso é a única etapa que pode recusar a foto.
          </p>
        </>
      )}
    </section>
  );
}
