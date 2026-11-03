import {
  assertMask,
  countForeground,
  labelComponents,
  maskBorderTouchRatio,
  maskBoundingBox,
  MaskError,
} from './mask';
import type {
  BinaryMask,
  MorphometricFeatures,
  ScaleCalibration,
} from './types';

interface Projection {
  min: number;
  max: number;
}

function project(
  points: Int32Array,
  count: number,
  width: number,
  originX: number,
  originY: number,
  axisX: number,
  axisY: number,
): Projection {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < count; i += 1) {
    const index = points[i] ?? 0;
    const x = index % width - originX;
    const y = (index - (index % width)) / width - originY;
    const value = x * axisX + y * axisY;
    if (value < min) min = value;
    if (value > max) max = value;
  }
  return { min, max };
}

/**
 * Extrai características geométricas da silhueta.
 *
 * As medidas em pixels só se tornam físicas após uma calibração de escala.
 * A "máscara" deve conter apenas o animal; o pipeline remove componentes menores.
 */
export function extractMorphometrics(
  mask: BinaryMask,
  imageWidth = mask.width,
  imageHeight = mask.height,
): MorphometricFeatures {
  assertMask(mask);
  if (
    !Number.isFinite(imageWidth) ||
    !Number.isFinite(imageHeight) ||
    imageWidth <= 0 ||
    imageHeight <= 0
  ) {
    throw new MaskError('invalid-dimensions', 'Dimensões da imagem inválidas.');
  }

  const area = countForeground(mask);
  if (area === 0) {
    throw new MaskError('empty-mask', 'Não há pixels de animal na máscara.');
  }

  const bbox = maskBoundingBox(mask);
  if (bbox.width === 0 || bbox.height === 0) {
    throw new MaskError('empty-mask', 'A máscara não possui extensão utilizável.');
  }

  const { width, height, data } = mask;
  const columnWidths = new Uint32Array(bbox.width);
  const points = new Int32Array(area);
  let pointCount = 0;
  let perimeterEdges = 0;

  let sumX = 0;
  let sumY = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      if (!data[index]) continue;

      sumX += x;
      sumY += y;
      points[pointCount] = index;
      pointCount += 1;

      const column = x - bbox.x;
      columnWidths[column] = (columnWidths[column] ?? 0) + 1;

      if (x === 0 || !data[index - 1]) perimeterEdges += 1;
      if (x === width - 1 || !data[index + 1]) perimeterEdges += 1;
      if (y === 0 || !data[index - width]) perimeterEdges += 1;
      if (y === height - 1 || !data[index + width]) perimeterEdges += 1;
    }
  }

  const centroidX = sumX / area;
  const centroidY = sumY / area;
  let covarianceXX = 0;
  let covarianceYY = 0;
  let covarianceXY = 0;

  for (let i = 0; i < pointCount; i += 1) {
    const index = points[i] ?? 0;
    const x = index % width - centroidX;
    const y = (index - (index % width)) / width - centroidY;
    covarianceXX += x * x;
    covarianceYY += y * y;
    covarianceXY += x * y;
  }
  covarianceXX /= area;
  covarianceYY /= area;
  covarianceXY /= area;

  const majorAngle = 0.5 * Math.atan2(2 * covarianceXY, covarianceXX - covarianceYY);
  const axisX = Math.cos(majorAngle);
  const axisY = Math.sin(majorAngle);
  const majorProjection = project(
    points,
    pointCount,
    width,
    centroidX,
    centroidY,
    axisX,
    axisY,
  );
  const minorProjection = project(
    points,
    pointCount,
    width,
    centroidX,
    centroidY,
    -axisY,
    axisX,
  );

  const majorAxisPx = majorProjection.max - majorProjection.min + 1;
  const minorAxisPx = minorProjection.max - minorProjection.min + 1;
  const orientationUnwrapped = (majorAngle * 180) / Math.PI;
  const orientationDeg = ((orientationUnwrapped + 90) % 180) - 90;

  let maxWidthPx = 0;
  for (const value of columnWidths) {
    if (value > maxWidthPx) maxWidthPx = value;
  }

  const widthAt = (fraction: number): number => {
    const column = Math.min(
      bbox.width - 1,
      Math.max(0, Math.floor((bbox.width - 1) * fraction)),
    );
    return columnWidths[column] ?? 0;
  };

  let mirroredIntersection = 0;
  let mirroredUnion = 0;
  for (let y = bbox.y; y < bbox.y + bbox.height; y += 1) {
    for (let x = bbox.x; x < bbox.x + bbox.width; x += 1) {
      const value = Boolean(mask.data[y * width + x]);
      const mirroredX = bbox.x + bbox.width - 1 - (x - bbox.x);
      const mirrored = Boolean(mask.data[y * width + mirroredX]);
      if (value && mirrored) mirroredIntersection += 1;
      if (value || mirrored) mirroredUnion += 1;
    }
  }

  const bboxAreaPx = bbox.width * bbox.height;
  const perimeterPx = perimeterEdges;
  const compactness =
    perimeterPx > 0 ? (4 * Math.PI * area) / (perimeterPx * perimeterPx) : 0;
  const componentCount = labelComponents(mask).componentCount;

  return {
    schemaVersion: 'boiscan.morphometrics/1',
    imageWidth,
    imageHeight,
    maskWidth: width,
    maskHeight: height,
    bbox,
    bodyLengthPx: bbox.width,
    bodyHeightPx: bbox.height,
    bboxAreaPx,
    maskAreaPx: area,
    fillRatio: bboxAreaPx > 0 ? area / bboxAreaPx : 0,
    perimeterPx,
    compactness,
    majorAxisPx,
    minorAxisPx,
    axisRatio: minorAxisPx > 0 ? majorAxisPx / minorAxisPx : 0,
    orientationDeg,
    maxWidthPx,
    widthAt25PctPx: widthAt(0.25),
    widthAt50PctPx: widthAt(0.5),
    widthAt75PctPx: widthAt(0.75),
    borderTouchRatio: maskBorderTouchRatio(mask),
    componentCount,
    symmetry: mirroredUnion > 0 ? mirroredIntersection / mirroredUnion : 0,
  };
}

/** Aplica a escala física às medidas em pixels. */
export function applyScaleToFeatures(
  features: MorphometricFeatures,
  calibration: ScaleCalibration,
): MorphometricFeatures {
  const cm = calibration.cmPerPixel;
  const cm2 = cm * cm;
  return {
    ...features,
    bodyLengthCm: features.bodyLengthPx * cm,
    bodyHeightCm: features.bodyHeightPx * cm,
    maxWidthCm: features.maxWidthPx * cm,
    maskAreaCm2: features.maskAreaPx * cm2,
    majorAxisCm: features.majorAxisPx * cm,
    minorAxisCm: features.minorAxisPx * cm,
    widthAt50PctCm: features.widthAt50PctPx * cm,
    widthAt75PctCm: features.widthAt75PctPx * cm,
    cmPerPixel: cm,
  };
}
