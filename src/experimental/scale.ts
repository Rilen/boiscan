import type { Point, ScaleCalibration, ScaleReference } from './types';

export type ScaleErrorCode =
  | 'invalid-length'
  | 'invalid-pixels'
  | 'outside-image'
  | 'different-plane'
  | 'short-reference';

export type ScaleCalibrationResult =
  | { ok: true; calibration: ScaleCalibration }
  | { ok: false; code: ScaleErrorCode; message: string };

const DEFAULT_UNCERTAINTY_CM = 0.5;
const ENDPOINT_SIGMA_PX = Math.SQRT1_2;
const MAX_RELATIVE_UNCERTAINTY = 0.1;

function finitePoint(point: Point): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.y);
}

function inside(point: Point): boolean {
  return point.x >= 0 && point.y >= 0 && point.x <= 1 && point.y <= 1;
}

/**
 * Converte uma referência física de comprimento conhecido em cm/pixel.
 *
 * A referência precisa ser marcada com dois pontos no MESMO plano do animal.
 * A incerteza é uma propagação simples da medida informada e do clique,
 * não uma promessa de precisão estatística.
 */
export function calibrateScale(
  reference: ScaleReference,
  imageWidth: number,
  imageHeight: number,
): ScaleCalibrationResult {
  if (
    !Number.isFinite(reference.knownLengthCm) ||
    reference.knownLengthCm < 1 ||
    reference.knownLengthCm > 1000
  ) {
    return {
      ok: false,
      code: 'invalid-length',
      message: 'Informe um comprimento de referência entre 1 cm e 1.000 cm.',
    };
  }

  if (!finitePoint(reference.start) || !finitePoint(reference.end)) {
    return {
      ok: false,
      code: 'invalid-pixels',
      message: 'As extremidades da referência precisam ser pontos válidos.',
    };
  }

  if (!inside(reference.start) || !inside(reference.end)) {
    return {
      ok: false,
      code: 'outside-image',
      message: 'As extremidades da referência estão fora da fotografia.',
    };
  }

  if (!reference.samePlaneAsAnimal) {
    return {
      ok: false,
      code: 'different-plane',
      message:
        'A referência de escala precisa estar no mesmo plano do perfil do animal. Uma referência no chão ou mais próxima da câmera não é aceita.',
    };
  }

  if (
    !Number.isFinite(imageWidth) ||
    !Number.isFinite(imageHeight) ||
    imageWidth <= 1 ||
    imageHeight <= 1
  ) {
    return {
      ok: false,
      code: 'invalid-pixels',
      message: 'Dimensões da imagem inválidas para calibrar a escala.',
    };
  }

  const pixelLength = Math.hypot(
    (reference.end.x - reference.start.x) * imageWidth,
    (reference.end.y - reference.start.y) * imageHeight,
  );

  if (!Number.isFinite(pixelLength) || pixelLength < 10) {
    return {
      ok: false,
      code: 'short-reference',
      message:
        'A referência ocupa poucos pixels. Aproxime-se ou marque uma referência maior.',
    };
  }

  const uncertaintyCm =
    reference.uncertaintyCm === undefined
      ? DEFAULT_UNCERTAINTY_CM
      : reference.uncertaintyCm;

  if (!Number.isFinite(uncertaintyCm) || uncertaintyCm < 0 || uncertaintyCm > 20) {
    return {
      ok: false,
      code: 'invalid-length',
      message: 'A incerteza da referência deve estar entre 0 cm e 20 cm.',
    };
  }

  const cmPerPixel = reference.knownLengthCm / pixelLength;
  const relativeUncertainty = Math.hypot(
    uncertaintyCm / reference.knownLengthCm,
    ENDPOINT_SIGMA_PX / pixelLength,
  );
  const warnings: string[] = [];

  if (pixelLength < 40) {
    warnings.push(
      'A referência tem menos de 40 px; a incerteza de clique tende a dominar.',
    );
  }
  if (relativeUncertainty > MAX_RELATIVE_UNCERTAINTY) {
    warnings.push(
      'A incerteza relativa da escala passou de 10%; a estimativa experimental não será liberada com esta referência.',
    );
  }
  if (reference.type === 'body-measurement') {
    warnings.push(
      'Medida corporal informada: depende de fita métrica e posicionamento consistentes.',
    );
  }
  if (reference.type === 'camera-calibration') {
    warnings.push(
      'Calibração por câmera ainda é apenas um contrato; use um marcador físico nesta versão.',
    );
  }

  return {
    ok: true,
    calibration: {
      cmPerPixel,
      pixelLength,
      relativeUncertainty,
      uncertaintyCmPerPixel: relativeUncertainty * cmPerPixel,
      reliable: relativeUncertainty <= MAX_RELATIVE_UNCERTAINTY,
      warnings,
    },
  };
}
