import type { EngineAvailability } from '../engine/types';

const LABELS: Record<EngineAvailability, string> = {
  validated: 'Modelo validado',
  experimental: 'Modo experimental',
  unavailable: 'Estimativa indisponível',
};

interface EngineBadgeProps {
  availability: EngineAvailability;
  engineId?: string;
}

export function EngineBadge({ availability, engineId }: EngineBadgeProps) {
  const label =
    engineId === 'simulation' && availability === 'experimental'
      ? 'Simulação ativa'
      : engineId === 'remote' && availability !== 'unavailable'
        ? 'Modelo remoto'
        : LABELS[availability];

  return (
    <span className={`engine-badge engine-badge--${availability}`} title={label}>
      <span className="engine-badge__dot" aria-hidden="true" />
      {label}
    </span>
  );
}
