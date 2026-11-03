import { describe, expect, it } from 'vitest';
import {
  analyzePixels,
  blockingIssues,
  canAnalyzeQuality,
  qualityLabel,
  unknownQuality,
  warningIssues,
  type PixelFrame,
} from './imageQuality';

function solidFrame(width: number, height: number, value: number): PixelFrame {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    data[i * 4] = value;
    data[i * 4 + 1] = value;
    data[i * 4 + 2] = value;
    data[i * 4 + 3] = 255;
  }
  return { data, width, height };
}

function checkerFrame(
  width: number,
  height: number,
  light = 210,
  dark = 45,
): PixelFrame {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const value = (x + y) % 2 === 0 ? light : dark;
      const offset = (y * width + x) * 4;
      data[offset] = value;
      data[offset + 1] = value;
      data[offset + 2] = value;
      data[offset + 3] = 255;
    }
  }
  return { data, width, height };
}

describe('análise técnica da qualidade da foto', () => {
  it('aprova imagem nítida, clara e com contraste', () => {
    const quality = analyzePixels(checkerFrame(120, 80), 1200, 800);
    expect(quality.analyzed).toBe(true);
    expect(quality.level).toBe('good');
    expect(quality.score).toBeGreaterThanOrEqual(75);
    expect(blockingIssues(quality)).toHaveLength(0);
    expect(quality.metrics?.sourceWidth).toBe(1200);
  });

  it('bloqueia imagem uniforme por falta de contraste e nitidez', () => {
    const quality = analyzePixels(solidFrame(80, 60, 128), 1200, 800);
    expect(quality.level).toBe('poor');
    const codes = blockingIssues(quality).map((issue) => issue.code);
    expect(codes).toContain('low-contrast');
    expect(codes).toContain('blurry');
    expect(canAnalyzeQuality(quality)).toBe(false);
  });

  it('bloqueia imagem muito escura', () => {
    const quality = analyzePixels(checkerFrame(100, 100, 25, 5), 1200, 800);
    expect(blockingIssues(quality).map((issue) => issue.code)).toContain('too-dark');
  });

  it('bloqueia imagem estourada', () => {
    const quality = analyzePixels(checkerFrame(100, 100, 250, 240), 1200, 800);
    expect(blockingIssues(quality).map((issue) => issue.code)).toContain('too-bright');
  });

  it('bloqueia resolução insuficiente', () => {
    const quality = analyzePixels(checkerFrame(60, 40), 300, 200);
    expect(blockingIssues(quality).map((issue) => issue.code)).toContain(
      'resolution-blocking',
    );
    expect(quality.metrics?.sourceWidth).toBe(300);
  });

  it('avisa sobre resolução abaixo do recomendado', () => {
    const quality = analyzePixels(checkerFrame(100, 100), 600, 600);
    expect(warningIssues(quality).map((issue) => issue.code)).toContain(
      'resolution-warning',
    );
    expect(canAnalyzeQuality(quality)).toBe(true);
  });

  it('lida com frames menores que 3 px sem quebrar', () => {
    const quality = analyzePixels(solidFrame(2, 2, 128), 300, 300);
    expect(quality.analyzed).toBe(true);
    expect(quality.metrics?.sharpness).toBe(0);
  });

  it('trata qualidade não avaliada como utilizável, sem bloquear', () => {
    const quality = unknownQuality();
    expect(quality.analyzed).toBe(false);
    expect(quality.level).toBe('unknown');
    expect(canAnalyzeQuality(quality)).toBe(true);
  });

  it('rotula níveis em português', () => {
    expect(qualityLabel({ ...unknownQuality(), level: 'good' })).toBe('Boa');
    expect(qualityLabel({ ...unknownQuality(), level: 'fair' })).toBe('Razoável');
    expect(qualityLabel({ ...unknownQuality(), level: 'poor' })).toBe('Insuficiente');
    expect(qualityLabel(unknownQuality())).toBe('Não avaliada');
  });
});
