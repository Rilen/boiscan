import {
  MAX_DRESSING_PERCENT,
  MIN_DRESSING_PERCENT,
  formatPercent,
} from '../domain/arroba';

interface DressingSelectorProps {
  value: number;
  onChange: (value: number) => boolean;
  compact?: boolean;
}

export function DressingSelector({ value, onChange, compact = false }: DressingSelectorProps) {
  const helpId = compact ? 'dressing-help-compact' : 'dressing-help';

  return (
    <div className={`dressing ${compact ? 'dressing--compact' : ''}`.trim()}>
      <div className="dressing__head">
        <label htmlFor="dressing-range" className="dressing__label">
          Rendimento de carcaça
        </label>
        <output htmlFor="dressing-range" className="dressing__value">
          {formatPercent(value)}
        </output>
      </div>
      <input
        id="dressing-range"
        className="dressing__range"
        type="range"
        min={MIN_DRESSING_PERCENT}
        max={MAX_DRESSING_PERCENT}
        step={1}
        value={value}
        aria-describedby={helpId}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <p id={helpId} className="dressing__help">
        Pressuposto ilustrativo, não medido no animal. Usado para converter peso vivo
        em arrobas de carcaça. Padrão: 52%.
      </p>
    </div>
  );
}
