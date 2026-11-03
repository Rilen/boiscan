/**
 * Análise de qualidade da fotografia executada inteiramente no navegador.
 *
 * Isto avalia apenas a imagem (resolução, exposição, contraste e nitidez).
 * NÃO estima peso e NÃO comprova que o animal está enquadrado corretamente.
 */

export type QualityIssueSeverity = 'blocking' | 'warning';

export interface QualityIssue {
  code: string;
  message: string;
  severity: QualityIssueSeverity;
}

export interface QualityMetrics {
  sourceWidth: number;
  sourceHeight: number;
  brightness: number;
  contrast: number;
  sharpness: number;
}

export type QualityLevel = 'good' | 'fair' | 'poor' | 'unknown';

export interface ImageQuality {
  analyzed: boolean;
  score: number;
  level: QualityLevel;
  issues: QualityIssue[];
  metrics: QualityMetrics | null;
}

export interface PixelFrame {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export const MIN_BLOCKING_SIDE = 480;
export const MIN_RECOMMENDED_SIDE = 800;
export const MIN_BLOCKING_BRIGHTNESS = 40;
export const MAX_BLOCKING_BRIGHTNESS = 230;
export const MIN_BLOCKING_CONTRAST = 12;
export const MIN_BLOCKING_SHARPNESS = 1.5;

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

export function analyzePixels(
  frame: PixelFrame,
  sourceWidth: number,
  sourceHeight: number,
): ImageQuality {
  const { data, width, height } = frame;
  const pixelCount = Math.max(1, width * height);
  const gray = new Float32Array(pixelCount);

  let sum = 0;
  for (let i = 0; i < pixelCount; i += 1) {
    const offset = i * 4;
    const r = data[offset] ?? 0;
    const g = data[offset + 1] ?? 0;
    const b = data[offset + 2] ?? 0;
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    gray[i] = luma;
    sum += luma;
  }

  const brightness = sum / pixelCount;

  let varianceSum = 0;
  for (let i = 0; i < pixelCount; i += 1) {
    const diff = (gray[i] ?? 0) - brightness;
    varianceSum += diff * diff;
  }
  const contrast = Math.sqrt(varianceSum / pixelCount);

  let laplacianSum = 0;
  let laplacianCount = 0;
  if (width >= 3 && height >= 3) {
    for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        const index = y * width + x;
        const center = gray[index] ?? 0;
        const up = gray[index - width] ?? 0;
        const down = gray[index + width] ?? 0;
        const left = gray[index - 1] ?? 0;
        const right = gray[index + 1] ?? 0;
        const laplacian = Math.abs(4 * center - up - down - left - right);
        laplacianSum += laplacian;
        laplacianCount += 1;
      }
    }
  }
  const sharpness = laplacianCount > 0 ? laplacianSum / laplacianCount : 0;

  const shortestSide = Math.min(sourceWidth, sourceHeight);
  const issues: QualityIssue[] = [];

  if (shortestSide < MIN_BLOCKING_SIDE) {
    issues.push({
      code: 'resolution-blocking',
      severity: 'blocking',
      message: `Resolução muito baixa (${sourceWidth}×${sourceHeight} px). Use uma foto com pelo menos ${MIN_BLOCKING_SIDE} px no lado menor.`,
    });
  } else if (shortestSide < MIN_RECOMMENDED_SIDE) {
    issues.push({
      code: 'resolution-warning',
      severity: 'warning',
      message: `Resolução modesta (${sourceWidth}×${sourceHeight} px). Para melhores resultados, use pelo menos ${MIN_RECOMMENDED_SIDE} px.`,
    });
  }

  if (brightness < MIN_BLOCKING_BRIGHTNESS) {
    issues.push({
      code: 'too-dark',
      severity: 'blocking',
      message: 'A foto está muito escura. Fotografe com boa iluminação natural.',
    });
  } else if (brightness > MAX_BLOCKING_BRIGHTNESS) {
    issues.push({
      code: 'too-bright',
      severity: 'blocking',
      message: 'A foto está muito clara ou estourada. Evite sol direto forte.',
    });
  } else if (brightness < 75 || brightness > 195) {
    issues.push({
      code: 'exposure-warning',
      severity: 'warning',
      message: 'A iluminação não está ideal. Prefira luz difusa, sem sombras duras.',
    });
  }

  if (contrast < MIN_BLOCKING_CONTRAST) {
    issues.push({
      code: 'low-contrast',
      severity: 'blocking',
      message: 'A imagem tem pouco contraste. Aproxime-se do animal e evite fundo uniforme.',
    });
  } else if (contrast < 25) {
    issues.push({
      code: 'contrast-warning',
      severity: 'warning',
      message: 'Contraste baixo. O animal pode se confundir com o fundo.',
    });
  }

  if (sharpness < MIN_BLOCKING_SHARPNESS) {
    issues.push({
      code: 'blurry',
      severity: 'blocking',
      message: 'A imagem parece sem nitidez. Segure o celular firme e aguarde o foco.',
    });
  } else if (sharpness < 7) {
    issues.push({
      code: 'sharpness-warning',
      severity: 'warning',
      message: 'Nitidez apenas razoável. Segure o celular firme e toque na tela para focar no animal.',
    });
  }

  const resolutionScore = clamp01((shortestSide - 360) / 840);
  const exposureScore = 1 - clamp01(Math.abs(brightness - 128) / 110);
  const contrastScore = clamp01(contrast / 55);
  const sharpnessScore = clamp01(sharpness / 16);
  const score = Math.round(
    100 *
      (0.25 * resolutionScore +
        0.25 * exposureScore +
        0.25 * contrastScore +
        0.25 * sharpnessScore),
  );

  const hasBlocking = issues.some((issue) => issue.severity === 'blocking');
  const level: QualityLevel = hasBlocking
    ? 'poor'
    : score >= 75
      ? 'good'
      : score >= 50
        ? 'fair'
        : 'poor';

  return {
    analyzed: true,
    score,
    level,
    issues,
    metrics: {
      sourceWidth,
      sourceHeight,
      brightness: Math.round(brightness * 10) / 10,
      contrast: Math.round(contrast * 10) / 10,
      sharpness: Math.round(sharpness * 10) / 10,
    },
  };
}

export function unknownQuality(): ImageQuality {
  return {
    analyzed: false,
    score: 0,
    level: 'unknown',
    issues: [],
    metrics: null,
  };
}

export function blockingIssues(quality: ImageQuality): QualityIssue[] {
  return quality.issues.filter((issue) => issue.severity === 'blocking');
}

export function warningIssues(quality: ImageQuality): QualityIssue[] {
  return quality.issues.filter((issue) => issue.severity === 'warning');
}

export function canAnalyzeQuality(quality: ImageQuality): boolean {
  return blockingIssues(quality).length === 0;
}

export function qualityLabel(quality: ImageQuality): string {
  switch (quality.level) {
    case 'good':
      return 'Boa';
    case 'fair':
      return 'Razoável';
    case 'poor':
      return 'Insuficiente';
    case 'unknown':
      return 'Não avaliada';
  }
}
