/**
 * Regras de negócio de peso vivo e arrobas comerciais de carcaça.
 *
 * Relação comercial usada pelo produto:
 *   arrobas = peso_vivo_kg × rendimento_carcaça / 15
 *
 * O rendimento de carcaça NÃO é medido pela aplicação. Ele é um pressuposto
 * explícito, configurável e exibido ao usuário.
 */

export const DEFAULT_DRESSING_PERCENT = 52;
export const MIN_DRESSING_PERCENT = 30;
export const MAX_DRESSING_PERCENT = 75;
export const KG_PER_ARROBA = 15;

export class InvalidDressingPercentError extends RangeError {
  constructor(value: number) {
    super(
      `Rendimento de carcaça inválido: ${value}. Informe um valor entre ${MIN_DRESSING_PERCENT}% e ${MAX_DRESSING_PERCENT}%.`,
    );
    this.name = 'InvalidDressingPercentError';
  }
}

export class InvalidWeightError extends RangeError {
  constructor(value: number) {
    super(`Peso vivo inválido: ${value}. Informe um número positivo em quilogramas.`);
    this.name = 'InvalidWeightError';
  }
}

export function isValidDressingPercent(value: number): boolean {
  return (
    Number.isFinite(value) &&
    value >= MIN_DRESSING_PERCENT &&
    value <= MAX_DRESSING_PERCENT
  );
}

/**
 * Converte peso vivo (kg) em arrobas comerciais de carcaça.
 * O resultado não é arredondado; arredonde apenas na apresentação.
 */
export function computeHotCarcassArrobas(
  liveWeightKg: number,
  dressingPercent: number = DEFAULT_DRESSING_PERCENT,
): number {
  if (!Number.isFinite(liveWeightKg) || liveWeightKg <= 0) {
    throw new InvalidWeightError(liveWeightKg);
  }
  if (!isValidDressingPercent(dressingPercent)) {
    throw new InvalidDressingPercentError(dressingPercent);
  }
  return (liveWeightKg * (dressingPercent / 100)) / KG_PER_ARROBA;
}

/**
 * Aceita entrada com vírgula ou ponto decimal (ex.: "52,5").
 * Retorna null quando o texto não representa um número.
 */
export function parseDecimalInput(raw: string): number | null {
  const normalized = raw.trim().replace(',', '.');
  if (normalized === '') return null;
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

const kgFormatter = new Intl.NumberFormat('pt-BR', {
  maximumFractionDigits: 0,
});

const arrobaFormatter = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

export function formatKg(liveWeightKg: number): string {
  if (!Number.isFinite(liveWeightKg)) return '—';
  return `${kgFormatter.format(liveWeightKg)} kg`;
}

export function formatArrobas(arrobas: number): string {
  if (!Number.isFinite(arrobas)) return '—';
  return `${arrobaFormatter.format(arrobas)} @`;
}

export function formatPercent(percent: number): string {
  const formatter = new Intl.NumberFormat('pt-BR', {
    maximumFractionDigits: 1,
  });
  return `${formatter.format(percent)}%`;
}

export function formatAnalyzedAt(isoDate: string): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return 'Data desconhecida';
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
}
