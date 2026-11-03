import { countForeground, MaskError } from './mask';
import { applyScaleToFeatures } from './morphometrics';
import { calibrateScale, type ScaleCalibrationResult } from './scale';
import type {
  BinaryMask,
  MorphometricFeatures,
  Point,
  ScaleReference,
} from './types';

export const COLLECTION_SCHEMA_VERSION = 'boiscan.collection-sample/1';
export const COLLECTION_EXTRACTOR_VERSION = 'boiscan.extractor/2';
export const MASK_RLE_ENCODING = 'rle-0-1-v1';

export type LengthUnit = 'mm' | 'cm' | 'm';
export const LENGTH_UNITS: readonly LengthUnit[] = ['mm', 'cm', 'm'];

export function isLengthUnit(value: string): value is LengthUnit {
  return (LENGTH_UNITS as readonly string[]).includes(value);
}

/**
 * Converte a unidade declarada para centímetros (unidade canônica interna).
 * Retorna null para valores não positivos ou unidades inválidas.
 */
export function lengthToCentimeters(
  value: number,
  unit: LengthUnit,
): number | null {
  if (!Number.isFinite(value) || value <= 0) return null;
  switch (unit) {
    case 'mm':
      return value / 10;
    case 'cm':
      return value;
    case 'm':
      return value * 100;
    default:
      return null;
  }
}

export interface MaskRle {
  encoding: typeof MASK_RLE_ENCODING;
  width: number;
  height: number;
  runs: number[];
  foregroundPixels: number;
}

/**
 * Codifica a máscara final em RLE (contagens alternadas, começando por 0).
 * É uma referência reproduzível da máscara sem incluir a fotografia.
 */
export function encodeMaskRle(mask: BinaryMask): MaskRle {
  if (
    !Number.isInteger(mask.width) ||
    !Number.isInteger(mask.height) ||
    mask.width <= 0 ||
    mask.height <= 0
  ) {
    throw new MaskError('invalid-dimensions', 'A máscara precisa ter dimensões positivas.');
  }
  if (mask.data.length !== mask.width * mask.height) {
    throw new MaskError(
      'invalid-data',
      'O buffer da máscara não corresponde a width × height.',
    );
  }

  const runs: number[] = [];
  let current = 0;
  let run = 0;
  let foreground = 0;

  for (let i = 0; i < mask.data.length; i += 1) {
    const value = mask.data[i] ? 1 : 0;
    if (value === current) {
      run += 1;
    } else {
      runs.push(run);
      run = 1;
      current = value;
    }
    if (value === 1) foreground += 1;
  }
  runs.push(run);

  return {
    encoding: MASK_RLE_ENCODING,
    width: mask.width,
    height: mask.height,
    runs,
    foregroundPixels: foreground,
  };
}

export function decodeMaskRle(encoded: MaskRle): BinaryMask {
  if (encoded.encoding !== MASK_RLE_ENCODING) {
    throw new MaskError('invalid-data', 'Codificação de máscara desconhecida.');
  }
  if (
    !Number.isInteger(encoded.width) ||
    !Number.isInteger(encoded.height) ||
    encoded.width <= 0 ||
    encoded.height <= 0
  ) {
    throw new MaskError('invalid-dimensions', 'Dimensões da máscara inválidas.');
  }
  const total = encoded.width * encoded.height;
  const data = new Uint8Array(total);
  let index = 0;

  for (let runIndex = 0; runIndex < encoded.runs.length; runIndex += 1) {
    const count = encoded.runs[runIndex];
    if (typeof count !== 'number' || !Number.isInteger(count) || count < 0) {
      throw new MaskError('invalid-data', 'Sequência RLE inválida.');
    }
    if (index + count > total) {
      throw new MaskError('invalid-data', 'A sequência RLE excede a máscara.');
    }
    if (runIndex % 2 === 1) data.fill(1, index, index + count);
    index += count;
  }

  if (index !== total) {
    throw new MaskError('invalid-data', 'A sequência RLE não cobre a máscara.');
  }

  return { width: encoded.width, height: encoded.height, data };
}

export type MaskOrigin = 'automatic' | 'manual' | 'hybrid';

export interface MaskCorrections {
  brushStrokes: number;
  editedPixels: number;
  cleared: boolean;
  roi: { x: number; y: number; width: number; height: number };
}

export interface ReferenceInput {
  knownLength: number;
  unit: LengthUnit;
  start: Point;
  end: Point;
  samePlaneAsAnimal: boolean;
  uncertaintyCm?: number;
}

export interface CollectionImageInfo {
  name: string;
  sha256: string | null;
  originalWidth: number;
  originalHeight: number;
  analysisWidth: number;
  analysisHeight: number;
}

export interface SampleInput {
  sampleId: string;
  animalId: string;
  image: CollectionImageInfo;
  mask: BinaryMask;
  features: MorphometricFeatures | null;
  maskOrigin: MaskOrigin;
  corrections: MaskCorrections;
  segmentationWarnings?: string[];
  reference: ReferenceInput | null;
  weightKg: number | null;
  weighedAt: string | null;
  weightSource: string | null;
  qualityWarnings?: string[];
  createdAt?: string;
  now?: string;
}

export type EligibilityIssueCode =
  | 'sample-id-invalid'
  | 'animal-id-invalid'
  | 'image-invalid'
  | 'mask-dimensions'
  | 'mask-empty'
  | 'scale-missing'
  | 'scale-unit-invalid'
  | 'scale-length-invalid'
  | 'scale-invalid'
  | 'scale-unreliable'
  | 'weight-missing'
  | 'weight-invalid'
  | 'weight-source-invalid'
  | 'weighed-at-missing'
  | 'weighed-at-invalid';

export interface EligibilityIssue {
  code: EligibilityIssueCode;
  field: string;
  message: string;
}

export interface Eligibility {
  eligible: boolean;
  issues: EligibilityIssue[];
}

export interface CollectionReference extends ReferenceInput {
  type: 'known-length-marker';
  knownLengthCm: number;
  pixelLength: number | null;
  cmPerPixel: number | null;
  relativeUncertainty: number | null;
  reliable: boolean;
  warnings: string[];
}

export interface CollectionSample {
  schemaVersion: typeof COLLECTION_SCHEMA_VERSION;
  status: 'draft' | 'eligible';
  sampleId: string;
  animalId: string;
  createdAt: string;
  extractorVersion: string;
  image: CollectionImageInfo;
  mask: (MaskRle & {
    origin: MaskOrigin;
    corrections: MaskCorrections;
    segmentationWarnings: string[];
  }) | null;
  reference: CollectionReference | null;
  features: {
    schemaVersion: MorphometricFeatures['schemaVersion'];
    units: {
      pixelLength: 'px';
      pixelArea: 'px^2';
      angle: 'deg';
      ratio: 'unitless';
      physicalLength: 'cm' | null;
      physicalArea: 'cm^2' | null;
    };
    pixels: Record<string, number> | null;
    physical: Record<string, number> | null;
  };
  weight: {
    liveWeightKg: number | null;
    weighedAt: string | null;
    source: string | null;
  };
  qualityWarnings: string[];
  eligibility: Eligibility;
  limitations: string[];
}

const SAMPLE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_WEIGHT_SOURCE_LENGTH = 80;

const LIMITATIONS = [
  'A referência no mesmo plano reduz, mas não elimina, erros de perspectiva.',
  'As medidas físicas dependem da precisão da referência, da máscara e do enquadramento.',
  'Este arquivo não contém a fotografia, não contém peso estimado e não é uma validação.',
  'Não use o mesmo animal em desenvolvimento e em avaliação independente.',
];

function isValidIsoDate(value: string): boolean {
  if (!ISO_DATE_PATTERN.test(value)) return false;
  const parts = value.split('-');
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return false;
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function todayIso(now: string): string {
  const parsed = new Date(now);
  if (Number.isNaN(parsed.getTime())) return new Date().toISOString().slice(0, 10);
  return parsed.toISOString().slice(0, 10);
}

function maskStats(mask: BinaryMask): { valid: boolean; foreground: number } {
  if (
    !Number.isInteger(mask.width) ||
    !Number.isInteger(mask.height) ||
    mask.width <= 0 ||
    mask.height <= 0 ||
    mask.data.length !== mask.width * mask.height
  ) {
    return { valid: false, foreground: 0 };
  }
  try {
    return { valid: true, foreground: countForeground(mask) };
  } catch {
    return { valid: false, foreground: 0 };
  }
}

function evaluateReference(
  input: ReferenceInput | null,
  imageWidth: number,
  imageHeight: number,
): {
  reference: CollectionReference | null;
  calibration: ScaleCalibrationResult | null;
  issues: EligibilityIssue[];
} {
  if (!input) {
    return {
      reference: null,
      calibration: null,
      issues: [
        {
          code: 'scale-missing',
          field: 'reference',
          message:
            'Marque uma referência física de comprimento conhecido antes de tornar a amostra elegível.',
        },
      ],
    };
  }

  const issues: EligibilityIssue[] = [];
  if (!isLengthUnit(input.unit)) {
    issues.push({
      code: 'scale-unit-invalid',
      field: 'reference.unit',
      message: 'Unidade da referência inválida. Use mm, cm ou m.',
    });
  }

  const knownLengthCm = isLengthUnit(input.unit)
    ? lengthToCentimeters(input.knownLength, input.unit)
    : null;
  if (knownLengthCm === null) {
    issues.push({
      code: 'scale-length-invalid',
      field: 'reference.knownLength',
      message: 'O comprimento da referência precisa ser um número positivo.',
    });
  }

  const base: Omit<CollectionReference, 'pixelLength' | 'cmPerPixel' | 'relativeUncertainty' | 'reliable' | 'warnings'> = {
    ...input,
    type: 'known-length-marker',
    knownLengthCm: knownLengthCm ?? 0,
  };

  if (knownLengthCm === null) {
    return {
      reference: {
        ...base,
        pixelLength: null,
        cmPerPixel: null,
        relativeUncertainty: null,
        reliable: false,
        warnings: ['Sem comprimento físico válido, nenhuma dimensão física foi calculada.'],
      },
      calibration: null,
      issues,
    };
  }

  const scaleReference: ScaleReference = {
    type: 'known-length-marker',
    knownLengthCm,
    start: input.start,
    end: input.end,
    samePlaneAsAnimal: input.samePlaneAsAnimal,
    ...(input.uncertaintyCm === undefined
      ? {}
      : { uncertaintyCm: input.uncertaintyCm }),
  };
  const calibration = calibrateScale(scaleReference, imageWidth, imageHeight);

  if (!calibration.ok) {
    issues.push({
      code: 'scale-invalid',
      field: 'reference',
      message: `${calibration.message} (${calibration.code})`,
    });
    return {
      reference: {
        ...base,
        pixelLength: null,
        cmPerPixel: null,
        relativeUncertainty: null,
        reliable: false,
        warnings: [calibration.message],
      },
      calibration,
      issues,
    };
  }

  if (!calibration.calibration.reliable) {
    issues.push({
      code: 'scale-unreliable',
      field: 'reference',
      message:
        'A incerteza relativa da escala passou de 10%. Aproxime a referência ou aumente a marcação.',
    });
  }

  return {
    reference: {
      ...base,
      pixelLength: calibration.calibration.pixelLength,
      cmPerPixel: calibration.calibration.cmPerPixel,
      relativeUncertainty: calibration.calibration.relativeUncertainty,
      reliable: calibration.calibration.reliable,
      warnings: calibration.calibration.warnings,
    },
    calibration,
    issues,
  };
}

export function evaluateSample(input: SampleInput): Eligibility {
  const issues: EligibilityIssue[] = [];
  const sampleId = input.sampleId.trim();
  const animalId = input.animalId.trim();

  if (!SAMPLE_ID_PATTERN.test(sampleId)) {
    issues.push({
      code: 'sample-id-invalid',
      field: 'sampleId',
      message:
        'Identificador da amostra inválido. Use 1–64 caracteres: letras, números, ponto, hífen ou sublinhado.',
    });
  }
  if (!SAMPLE_ID_PATTERN.test(animalId)) {
    issues.push({
      code: 'animal-id-invalid',
      field: 'animalId',
      message:
        'Identificador pseudônimo do animal inválido. Não use nome, e-mail ou CPF.',
    });
  }

  const image = input.image;
  const analysisValid =
    Number.isInteger(image.analysisWidth) &&
    Number.isInteger(image.analysisHeight) &&
    image.analysisWidth > 0 &&
    image.analysisHeight > 0;
  const originalValid =
    Number.isInteger(image.originalWidth) &&
    Number.isInteger(image.originalHeight) &&
    image.originalWidth > 0 &&
    image.originalHeight > 0;
  if (!analysisValid || !originalValid || image.name.trim() === '') {
    issues.push({
      code: 'image-invalid',
      field: 'image',
      message: 'Identificação ou dimensões da imagem inválidas.',
    });
  }

  const stats = maskStats(input.mask);
  if (!stats.valid) {
    issues.push({
      code: 'mask-dimensions',
      field: 'mask',
      message: 'A máscara não corresponde às dimensões da imagem analisada.',
    });
  } else if (stats.foreground === 0) {
    issues.push({
      code: 'mask-empty',
      field: 'mask',
      message: 'A máscara está vazia. Pinte a silhueta do animal antes de exportar.',
    });
  }

  if (analysisValid) {
    const reference = evaluateReference(
      input.reference,
      image.analysisWidth,
      image.analysisHeight,
    );
    issues.push(...reference.issues);
  } else {
    issues.push({
      code: 'scale-invalid',
      field: 'reference',
      message: 'Sem dimensões válidas da imagem, a escala não pode ser avaliada.',
    });
  }

  if (input.weightKg === null) {
    issues.push({
      code: 'weight-missing',
      field: 'weightKg',
      message: 'Informe o peso real de balança em kg.',
    });
  } else if (!Number.isFinite(input.weightKg) || input.weightKg <= 0) {
    issues.push({
      code: 'weight-invalid',
      field: 'weightKg',
      message: 'O peso real precisa ser um número positivo em kg.',
    });
  }

  if (input.weightSource !== null) {
    const source = input.weightSource.trim();
    if (source.length > MAX_WEIGHT_SOURCE_LENGTH) {
      issues.push({
        code: 'weight-source-invalid',
        field: 'weightSource',
        message: `A fonte do peso deve ter no máximo ${MAX_WEIGHT_SOURCE_LENGTH} caracteres.`,
      });
    }
  }

  if (input.weighedAt === null) {
    issues.push({
      code: 'weighed-at-missing',
      field: 'weighedAt',
      message: 'Informe a data da pesagem.',
    });
  } else if (
    !isValidIsoDate(input.weighedAt) ||
    input.weighedAt > todayIso(input.now ?? new Date().toISOString())
  ) {
    issues.push({
      code: 'weighed-at-invalid',
      field: 'weighedAt',
      message: 'A data da pesagem precisa ser uma data real no formato AAAA-MM-DD e não pode estar no futuro.',
    });
  }

  return { eligible: issues.length === 0, issues };
}

function pixelFeatures(features: MorphometricFeatures): Record<string, number> {
  return {
    bodyLengthPx: features.bodyLengthPx,
    bodyHeightPx: features.bodyHeightPx,
    bboxWidthPx: features.bbox.width,
    bboxHeightPx: features.bbox.height,
    bboxAreaPx: features.bboxAreaPx,
    maskAreaPx: features.maskAreaPx,
    perimeterPx: features.perimeterPx,
    maxWidthPx: features.maxWidthPx,
    widthAt25PctPx: features.widthAt25PctPx,
    widthAt50PctPx: features.widthAt50PctPx,
    widthAt75PctPx: features.widthAt75PctPx,
    majorAxisPx: features.majorAxisPx,
    minorAxisPx: features.minorAxisPx,
    fillRatio: features.fillRatio,
    compactness: features.compactness,
    axisRatio: features.axisRatio,
    symmetry: features.symmetry,
    orientationDeg: features.orientationDeg,
  };
}

function physicalFeatures(
  features: MorphometricFeatures,
  calibration: ScaleCalibrationResult | null,
): Record<string, number> | null {
  if (!calibration || !calibration.ok || !calibration.calibration.reliable) {
    return null;
  }
  const scaled = applyScaleToFeatures(features, calibration.calibration);
  return {
    bodyLengthCm: scaled.bodyLengthCm ?? 0,
    bodyHeightCm: scaled.bodyHeightCm ?? 0,
    maxWidthCm: scaled.maxWidthCm ?? 0,
    maskAreaCm2: scaled.maskAreaCm2 ?? 0,
    majorAxisCm: scaled.majorAxisCm ?? 0,
    minorAxisCm: scaled.minorAxisCm ?? 0,
    widthAt50PctCm: scaled.widthAt50PctCm ?? 0,
    widthAt75PctCm: scaled.widthAt75PctCm ?? 0,
    cmPerPixel: scaled.cmPerPixel ?? 0,
  };
}

function dedupe(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

/**
 * Monta a amostra versionada de coleta.
 *
 * A amostra só recebe `status: "eligible"` quando identificadores, máscara,
 * escala confiável, peso positivo e data válida estão presentes. Caso contrário
 * permanece `draft` e lista os motivos. Nenhum peso é estimado aqui.
 */
export function buildCollectionSample(input: SampleInput): CollectionSample {
  const eligibility = evaluateSample(input);
  const referenceEvaluation = evaluateReference(
    input.reference,
    input.image.analysisWidth,
    input.image.analysisHeight,
  );
  const stats = maskStats(input.mask);

  let mask: CollectionSample['mask'] = null;
  if (stats.valid) {
    const encoded = encodeMaskRle(input.mask);
    mask = {
      ...encoded,
      origin: input.maskOrigin,
      corrections: input.corrections,
      segmentationWarnings: dedupe(input.segmentationWarnings ?? []),
    };
  }

  const physical = input.features
    ? physicalFeatures(input.features, referenceEvaluation.calibration)
    : null;

  return {
    schemaVersion: COLLECTION_SCHEMA_VERSION,
    status: eligibility.eligible ? 'eligible' : 'draft',
    sampleId: input.sampleId.trim(),
    animalId: input.animalId.trim(),
    createdAt: input.createdAt ?? new Date().toISOString(),
    extractorVersion: COLLECTION_EXTRACTOR_VERSION,
    image: input.image,
    mask,
    reference: referenceEvaluation.reference,
    features: {
      schemaVersion: input.features?.schemaVersion ?? 'boiscan.morphometrics/1',
      units: {
        pixelLength: 'px',
        pixelArea: 'px^2',
        angle: 'deg',
        ratio: 'unitless',
        physicalLength: physical ? 'cm' : null,
        physicalArea: physical ? 'cm^2' : null,
      },
      pixels: input.features ? pixelFeatures(input.features) : null,
      physical,
    },
    weight: {
      liveWeightKg: input.weightKg,
      weighedAt: input.weighedAt,
      source: input.weightSource?.trim() || null,
    },
    qualityWarnings: dedupe([
      ...(input.qualityWarnings ?? []),
      ...(input.segmentationWarnings ?? []),
      ...(referenceEvaluation.reference?.warnings ?? []),
    ]),
    eligibility,
    limitations: LIMITATIONS,
  };
}
