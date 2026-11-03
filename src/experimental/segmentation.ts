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

export interface SegmentationRoi {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SegmentationOptions {
  borderFraction?: number;
  minimumThreshold?: number;
  maximumThreshold?: number;
  /** Região normalizada (0–1) que contém o animal; reduz fundo e outros animais. */
  roi?: SegmentationRoi;
}

export interface NormalizedRoi {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SegmentationDiagnostics {
  threshold: number;
  backgroundRgb: [number, number, number];
  foregroundRatio: number;
  roi: NormalizedRoi;
  borderTouchRatio: number;
  componentCount: number;
  removedPixels: number;
  warnings: string[];
}

export interface SegmentationResult {
  mask: BinaryMask;
  diagnostics: SegmentationDiagnostics;
}

type Color = [number, number, number];

interface BackgroundModel {
  centers: Color[];
  dominant: Color;
  spread: number;
}

function distance(a: Color, b: Color): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/**
 * Modelo de fundo por k-means determinístico. A borda da ROI pode conter
 * grama, terra, céu e sombras; um único RGB mediano não representa isso.
 */
function fitBackgroundModel(samples: Color[]): BackgroundModel {
  if (samples.length === 0) {
    return { centers: [[0, 0, 0]], dominant: [0, 0, 0], spread: 0 };
  }
  const clusterCount = Math.min(6, samples.length);
  const centers: Color[] = [];

  const mean: Color = [0, 0, 0];
  for (const sample of samples) {
    mean[0] += sample[0];
    mean[1] += sample[1];
    mean[2] += sample[2];
  }
  mean[0] /= samples.length;
  mean[1] /= samples.length;
  mean[2] /= samples.length;
  centers.push(mean);

  while (centers.length < clusterCount) {
    let best = samples[0] ?? mean;
    let bestDistance = -1;
    for (const sample of samples) {
      let nearest = Number.POSITIVE_INFINITY;
      for (const center of centers) {
        const d = distance(sample, center);
        if (d < nearest) nearest = d;
      }
      if (nearest > bestDistance) {
        bestDistance = nearest;
        best = sample;
      }
    }
    centers.push([...best] as Color);
  }

  const counts = new Array<number>(centers.length).fill(0);
  for (let iteration = 0; iteration < 10; iteration += 1) {
    const sums = centers.map(() => [0, 0, 0] as Color);
    counts.fill(0);
    for (const sample of samples) {
      let index = 0;
      let nearest = Number.POSITIVE_INFINITY;
      for (let c = 0; c < centers.length; c += 1) {
        const d = distance(sample, centers[c] ?? [0, 0, 0]);
        if (d < nearest) {
          nearest = d;
          index = c;
        }
      }
      const sum = sums[index];
      if (sum) {
        sum[0] += sample[0];
        sum[1] += sample[1];
        sum[2] += sample[2];
        counts[index] = (counts[index] ?? 0) + 1;
      }
    }
    centers.forEach((center, index) => {
      const count = counts[index] ?? 0;
      const sum = sums[index];
      if (count > 0 && sum) {
        center[0] = sum[0] / count;
        center[1] = sum[1] / count;
        center[2] = sum[2] / count;
      }
    });
  }

  const nearestDistances = samples.map((sample) => {
    let nearest = Number.POSITIVE_INFINITY;
    for (const center of centers) {
      const d = distance(sample, center);
      if (d < nearest) nearest = d;
    }
    return nearest;
  });
  nearestDistances.sort((a, b) => a - b);
  const percentile = nearestDistances[Math.floor((nearestDistances.length - 1) * 0.9)] ?? 0;
  let dominantIndex = 0;
  for (let i = 1; i < counts.length; i += 1) {
    if ((counts[i] ?? 0) > (counts[dominantIndex] ?? 0)) dominantIndex = i;
  }
  return {
    centers,
    dominant: centers[dominantIndex] ?? mean,
    spread: percentile,
  };
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

  const requestedRoi = options.roi;
  const roi: NormalizedRoi = requestedRoi
    ? {
        x: Math.min(1, Math.max(0, requestedRoi.x)),
        y: Math.min(1, Math.max(0, requestedRoi.y)),
        width: Math.min(1, Math.max(0.001, requestedRoi.width)),
        height: Math.min(1, Math.max(0.001, requestedRoi.height)),
      }
    : { x: 0, y: 0, width: 1, height: 1 };
  if (
    !Number.isFinite(roi.x) ||
    !Number.isFinite(roi.y) ||
    !Number.isFinite(roi.width) ||
    !Number.isFinite(roi.height)
  ) {
    throw new SegmentationError('ROI inválida.');
  }

  const roiX0 = Math.max(0, Math.floor(roi.x * width));
  const roiY0 = Math.max(0, Math.floor(roi.y * height));
  const roiX1 = Math.min(width - 1, Math.ceil((roi.x + roi.width) * width) - 1);
  const roiY1 = Math.min(height - 1, Math.ceil((roi.y + roi.height) * height) - 1);
  if (roiX1 <= roiX0 || roiY1 <= roiY0) {
    throw new SegmentationError('ROI não contém uma área utilizável.');
  }
  const roiArea = (roiX1 - roiX0 + 1) * (roiY1 - roiY0 + 1);
  const samples: Array<[number, number, number]> = [];
  const roiIsFullImage =
    roiX0 <= borderX &&
    roiY0 <= borderY &&
    roiX1 >= width - 1 - borderX &&
    roiY1 >= height - 1 - borderY;

  if (roiIsFullImage) {
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
  } else {
    // A borda local da ROI tende a ser fundo; é mais representativa que a
    // moldura inteira da foto em cenas com vinheta, árvores ou outros animais.
    const marginX = Math.max(3, Math.round((roiX1 - roiX0 + 1) * 0.12));
    const marginY = Math.max(3, Math.round((roiY1 - roiY0 + 1) * 0.12));
    const outerX0 = Math.max(0, roiX0 - marginX);
    const outerY0 = Math.max(0, roiY0 - marginY);
    const outerX1 = Math.min(width - 1, roiX1 + marginX);
    const outerY1 = Math.min(height - 1, roiY1 + marginY);

    for (let y = outerY0; y <= outerY1; y += 1) {
      for (let x = outerX0; x <= outerX1; x += 1) {
        const insideRoi =
          x >= roiX0 && x <= roiX1 && y >= roiY0 && y <= roiY1;
        if (insideRoi) continue;
        const offset = (y * width + x) * 4;
        samples.push([
          data[offset] ?? 0,
          data[offset + 1] ?? 0,
          data[offset + 2] ?? 0,
        ]);
      }
    }
  }

  if (samples.length === 0) {
    throw new SegmentationError('Não foi possível amostrar o fundo da imagem.');
  }

  const backgroundModel = fitBackgroundModel(samples);
  const backgroundRgb: [number, number, number] = [
    Math.round(backgroundModel.dominant[0]),
    Math.round(backgroundModel.dominant[1]),
    Math.round(backgroundModel.dominant[2]),
  ];
  const threshold = Math.min(
    options.maximumThreshold ?? 120,
    Math.max(
      options.minimumThreshold ?? 28,
      backgroundModel.spread + 20,
    ),
  );

  const raw = createMask(width, height);
  for (let y = roiY0; y <= roiY1; y += 1) {
    for (let x = roiX0; x <= roiX1; x += 1) {
      const i = y * width + x;
      const offset = i * 4;
      const color: Color = [
        data[offset] ?? 0,
        data[offset + 1] ?? 0,
        data[offset + 2] ?? 0,
      ];
      let nearest = Number.POSITIVE_INFINITY;
      for (const center of backgroundModel.centers) {
        const d = distance(color, center);
        if (d < nearest) nearest = d;
      }
      if (nearest > threshold) raw.data[i] = 1;
    }
  }

  const largest = keepLargestComponent(raw);
  const finalMask =
    largest.largestArea > 0 ? fillEnclosedHoles(largest.mask) : largest.mask;
  const foregroundCount = finalMask.data.reduce(
    (sum, value) => sum + (value ? 1 : 0),
    0,
  );
  const foregroundRatio = foregroundCount / roiArea;
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
      roi,
      borderTouchRatio,
      componentCount: largest.componentCount,
      removedPixels: largest.removedPixels,
      warnings,
    },
  };
}
