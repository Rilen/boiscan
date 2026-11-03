import type { PixelFrame } from '../domain/imageQuality';
import {
  createMask,
  fillEnclosedHoles,
  keepLargestComponent,
  maskBorderTouchRatio,
} from './mask';
import type { BinaryMask } from './types';

export class SegmentationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SegmentationError';
  }
}

export interface SegmentationOptions {
  borderFraction?: number;
  minimumThreshold?: number;
  maximumThreshold?: number;
}

export interface SegmentationDiagnostics {
  threshold: number;
  backgroundRgb: [number, number, number];
  foregroundRatio: number;
  borderTouchRatio: number;
  componentCount: number;
  removedPixels: number;
  warnings: string[];
}

export interface SegmentationResult {
  mask: BinaryMask;
  diagnostics: SegmentationDiagnostics;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle] ?? 0;
  return ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

/**
 * Segmentação clássica de silhueta por contraste com a borda da imagem.
 *
 * É um baseline experimental para fundos relativamente uniformes e controlados.
 * NÃO é um segmentador de gado validado: sombras, cercas, pasto alto, outros
 * animais e movimento podem quebrar a máscara. O pipeline rejeita casos de baixa
 * qualidade; um modelo de segmentação real poderá substituir esta função.
 */
export function segmentForeground(
  frame: PixelFrame,
  options: SegmentationOptions = {},
): SegmentationResult {
  const { data, width, height } = frame;
  if (width < 3 || height < 3) {
    throw new SegmentationError('A imagem é pequena demais para segmentação.');
  }
  if (data.length !== width * height * 4) {
    throw new SegmentationError('Buffer RGBA incompatível com as dimensões da imagem.');
  }

  const borderFraction = Math.min(0.2, Math.max(0.01, options.borderFraction ?? 0.06));
  const borderX = Math.max(1, Math.floor(width * borderFraction));
  const borderY = Math.max(1, Math.floor(height * borderFraction));
  const samples: Array<[number, number, number]> = [];

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (x >= borderX && x < width - borderX && y >= borderY && y < height - borderY) {
        continue;
      }
      const offset = (y * width + x) * 4;
      samples.push([
        data[offset] ?? 0,
        data[offset + 1] ?? 0,
        data[offset + 2] ?? 0,
      ]);
    }
  }

  if (samples.length === 0) {
    throw new SegmentationError('Não foi possível amostrar o fundo da imagem.');
  }

  const backgroundRgb: [number, number, number] = [
    Math.round(median(samples.map((sample) => sample[0]))),
    Math.round(median(samples.map((sample) => sample[1]))),
    Math.round(median(samples.map((sample) => sample[2]))),
  ];

  const distances = samples.map(([r, g, b]) =>
    Math.hypot(r - backgroundRgb[0], g - backgroundRgb[1], b - backgroundRgb[2]),
  );
  const medianDistance = median(distances);
  const medianAbsoluteDeviation = median(
    distances.map((value) => Math.abs(value - medianDistance)),
  );
  const threshold = Math.min(
    options.maximumThreshold ?? 120,
    Math.max(
      options.minimumThreshold ?? 28,
      medianDistance + 3 * medianAbsoluteDeviation,
    ),
  );

  const raw = createMask(width, height);
  for (let i = 0; i < width * height; i += 1) {
    const offset = i * 4;
    const distance = Math.hypot(
      (data[offset] ?? 0) - backgroundRgb[0],
      (data[offset + 1] ?? 0) - backgroundRgb[1],
      (data[offset + 2] ?? 0) - backgroundRgb[2],
    );
    if (distance > threshold) raw.data[i] = 1;
  }

  const largest = keepLargestComponent(raw);
  const finalMask =
    largest.largestArea > 0 ? fillEnclosedHoles(largest.mask) : largest.mask;
  const foregroundCount = finalMask.data.reduce(
    (sum, value) => sum + (value ? 1 : 0),
    0,
  );
  const foregroundRatio = foregroundCount / (width * height);
  const borderTouchRatio = maskBorderTouchRatio(finalMask);
  const warnings: string[] = [];

  if (foregroundCount === 0) {
    warnings.push('Nenhum animal foi separado do fundo.');
  }
  if (foregroundRatio > 0 && foregroundRatio < 0.01) {
    warnings.push('A silhueta ocupa menos de 1% da imagem.');
  }
  if (foregroundRatio > 0.9) {
    warnings.push('A segmentação ocupou quase toda a imagem; o fundo pode ter sido classificado como animal.');
  }
  if (largest.componentCount > 1) {
    warnings.push(
      `Foram encontrados ${largest.componentCount} componentes; apenas o maior foi mantido.`,
    );
  }
  if (borderTouchRatio > 0.25) {
    warnings.push('A silhueta toca a borda da imagem; o animal pode estar cortado.');
  }

  return {
    mask: finalMask,
    diagnostics: {
      threshold,
      backgroundRgb,
      foregroundRatio,
      borderTouchRatio,
      componentCount: largest.componentCount,
      removedPixels: largest.removedPixels,
      warnings,
    },
  };
}
