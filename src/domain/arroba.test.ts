import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DRESSING_PERCENT,
  InvalidDressingPercentError,
  InvalidWeightError,
  computeHotCarcassArrobas,
  formatArrobas,
  formatAnalyzedAt,
  formatKg,
  formatPercent,
  isValidDressingPercent,
  parseDecimalInput,
} from './arroba';

describe('conversão de peso vivo para arrobas de carcaça', () => {
  it('aplica a fórmula peso × rendimento / 15', () => {
    expect(computeHotCarcassArrobas(520, 52)).toBeCloseTo(18.0267, 3);
    expect(computeHotCarcassArrobas(450, 50)).toBeCloseTo(15, 6);
    expect(computeHotCarcassArrobas(600, 54)).toBeCloseTo(21.6, 6);
  });

  it('usa 52% como pressuposto padrão', () => {
    expect(DEFAULT_DRESSING_PERCENT).toBe(52);
    expect(computeHotCarcassArrobas(520)).toBeCloseTo(18.0267, 3);
  });

  it('respeita rendimento configurado', () => {
    const at52 = computeHotCarcassArrobas(500, 52);
    const at58 = computeHotCarcassArrobas(500, 58);
    expect(at58).toBeGreaterThan(at52);
    expect(at58).toBeCloseTo(19.3333, 3);
  });

  it('rejeita rendimento fora dos limites', () => {
    expect(() => computeHotCarcassArrobas(500, 20)).toThrow(InvalidDressingPercentError);
    expect(() => computeHotCarcassArrobas(500, 80)).toThrow(InvalidDressingPercentError);
    expect(() => computeHotCarcassArrobas(500, Number.NaN)).toThrow(
      InvalidDressingPercentError,
    );
  });

  it('rejeita pesos inválidos', () => {
    expect(() => computeHotCarcassArrobas(0, 52)).toThrow(InvalidWeightError);
    expect(() => computeHotCarcassArrobas(-10, 52)).toThrow(InvalidWeightError);
    expect(() => computeHotCarcassArrobas(Number.POSITIVE_INFINITY, 52)).toThrow(
      InvalidWeightError,
    );
  });

  it('valida os limites de rendimento', () => {
    expect(isValidDressingPercent(30)).toBe(true);
    expect(isValidDressingPercent(75)).toBe(true);
    expect(isValidDressingPercent(29.9)).toBe(false);
    expect(isValidDressingPercent(75.1)).toBe(false);
    expect(isValidDressingPercent(Number.NaN)).toBe(false);
  });
});

describe('formatação pt-BR', () => {
  it('formata peso em kg sem casas decimais', () => {
    expect(formatKg(520)).toBe('520 kg');
    expect(formatKg(1234.6)).toBe('1.235 kg');
  });

  it('formata arrobas com uma casa decimal e vírgula', () => {
    expect(formatArrobas(18.0267)).toBe('18,0 @');
    expect(formatArrobas(17.3333)).toBe('17,3 @');
    expect(formatArrobas(21.6)).toBe('21,6 @');
  });

  it('formata percentual com vírgula', () => {
    expect(formatPercent(52)).toBe('52%');
    expect(formatPercent(52.5)).toBe('52,5%');
  });

  it('formata data da análise e trata data inválida', () => {
    expect(formatAnalyzedAt('2026-11-03T12:30:00.000Z')).toMatch(/03\/11\/2026/);
    expect(formatAnalyzedAt('não é data')).toBe('Data desconhecida');
  });

  it('lê entrada decimal com vírgula ou ponto', () => {
    expect(parseDecimalInput('52')).toBe(52);
    expect(parseDecimalInput('52,5')).toBe(52.5);
    expect(parseDecimalInput(' 52.5 ')).toBe(52.5);
    expect(parseDecimalInput('abc')).toBeNull();
    expect(parseDecimalInput('')).toBeNull();
    expect(parseDecimalInput('52,5,1')).toBeNull();
  });
});
