import type { BinaryMask, BoundingBox } from './types';

export class MaskError extends Error {
  constructor(
    public readonly code:
      | 'invalid-dimensions'
      | 'invalid-data'
      | 'empty-mask'
      | 'invalid-threshold',
    message: string,
  ) {
    super(message);
    this.name = 'MaskError';
  }
}

export function assertMask(mask: BinaryMask): void {
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
}

export function createMask(width: number, height: number): BinaryMask {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width <= 0 ||
    height <= 0
  ) {
    throw new MaskError('invalid-dimensions', 'Dimensões de máscara inválidas.');
  }
  return { width, height, data: new Uint8Array(width * height) };
}

export function countForeground(mask: BinaryMask): number {
  assertMask(mask);
  let count = 0;
  for (let i = 0; i < mask.data.length; i += 1) {
    if (mask.data[i]) count += 1;
  }
  return count;
}

export function maskBoundingBox(mask: BinaryMask): BoundingBox {
  assertMask(mask);
  let minX = mask.width;
  let minY = mask.height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < mask.height; y += 1) {
    for (let x = 0; x < mask.width; x += 1) {
      if (!mask.data[y * mask.width + x]) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  if (maxX < minX || maxY < minY) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
}

export interface ComponentLabeling {
  labels: Int32Array;
  componentCount: number;
  areas: number[];
  largestLabel: number;
  largestArea: number;
}

/** Rotula componentes conexos com conectividade 8 (silhueta contínua). */
export function labelComponents(mask: BinaryMask): ComponentLabeling {
  assertMask(mask);
  const { width, height, data } = mask;
  const labels = new Int32Array(width * height);
  const areas: number[] = [0];
  const queue = new Int32Array(width * height);
  let componentCount = 0;
  let largestLabel = 0;
  let largestArea = 0;

  for (let start = 0; start < data.length; start += 1) {
    if (!data[start] || labels[start] !== 0) continue;

    componentCount += 1;
    const label = componentCount;
    let head = 0;
    let tail = 0;
    queue[tail] = start;
    tail += 1;
    labels[start] = label;
    let area = 0;

    while (head < tail) {
      const index = queue[head] ?? 0;
      head += 1;
      area += 1;
      const x = index % width;
      const y = (index - x) / width;

      for (let dy = -1; dy <= 1; dy += 1) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          if (nx < 0 || nx >= width) continue;
          const neighbor = ny * width + nx;
          if (data[neighbor] && labels[neighbor] === 0) {
            labels[neighbor] = label;
            queue[tail] = neighbor;
            tail += 1;
          }
        }
      }
    }

    areas[label] = area;
    if (area > largestArea) {
      largestArea = area;
      largestLabel = label;
    }
  }

  return { labels, componentCount, areas, largestLabel, largestArea };
}

export interface LargestComponentResult {
  mask: BinaryMask;
  componentCount: number;
  largestArea: number;
  removedPixels: number;
}

export function keepLargestComponent(mask: BinaryMask): LargestComponentResult {
  const labeling = labelComponents(mask);
  const result = createMask(mask.width, mask.height);
  const foreground = countForeground(mask);

  if (labeling.largestLabel === 0) {
    return {
      mask: result,
      componentCount: 0,
      largestArea: 0,
      removedPixels: 0,
    };
  }

  for (let i = 0; i < labeling.labels.length; i += 1) {
    if (labeling.labels[i] === labeling.largestLabel) result.data[i] = 1;
  }

  return {
    mask: result,
    componentCount: labeling.componentCount,
    largestArea: labeling.largestArea,
    removedPixels: foreground - labeling.largestArea,
  };
}

/**
 * Preenche buracos totalmente cercados pela silhueta.
 * O fundo conectado à borda da imagem permanece fundo.
 */
export function fillEnclosedHoles(mask: BinaryMask): BinaryMask {
  assertMask(mask);
  const { width, height, data } = mask;
  const outside = new Uint8Array(data.length);
  const queue = new Int32Array(data.length);
  let head = 0;
  let tail = 0;

  const enqueueOutside = (index: number): void => {
    if (data[index] || outside[index]) return;
    outside[index] = 1;
    queue[tail] = index;
    tail += 1;
  };

  for (let x = 0; x < width; x += 1) {
    enqueueOutside(x);
    enqueueOutside((height - 1) * width + x);
  }
  for (let y = 0; y < height; y += 1) {
    enqueueOutside(y * width);
    enqueueOutside(y * width + width - 1);
  }

  while (head < tail) {
    const index = queue[head] ?? 0;
    head += 1;
    const x = index % width;
    const y = (index - x) / width;
    if (x > 0) enqueueOutside(index - 1);
    if (x < width - 1) enqueueOutside(index + 1);
    if (y > 0) enqueueOutside(index - width);
    if (y < height - 1) enqueueOutside(index + width);
  }

  const result = createMask(width, height);
  for (let i = 0; i < data.length; i += 1) {
    result.data[i] = data[i] || !outside[i] ? 1 : 0;
  }
  return result;
}

export function maskBorderTouchRatio(mask: BinaryMask): number {
  assertMask(mask);
  const foreground = countForeground(mask);
  if (foreground === 0) return 0;

  let touching = 0;
  for (let x = 0; x < mask.width; x += 1) {
    if (mask.data[x]) touching += 1;
    if (mask.data[(mask.height - 1) * mask.width + x]) touching += 1;
  }
  for (let y = 1; y < mask.height - 1; y += 1) {
    if (mask.data[y * mask.width]) touching += 1;
    if (mask.data[y * mask.width + mask.width - 1]) touching += 1;
  }
  return touching / foreground;
}

/** Pinta um disco na máscara; usado pelo editor visual experimental. */
export function paintMaskCircle(
  mask: BinaryMask,
  centerX: number,
  centerY: number,
  radius: number,
  value: 0 | 1,
): number {
  assertMask(mask);
  if (!Number.isFinite(radius) || radius < 0) {
    throw new MaskError('invalid-threshold', 'Raio de pincel inválido.');
  }
  const r = Math.round(radius);
  const radiusSquared = r * r;
  let changed = 0;
  for (let y = Math.max(0, Math.floor(centerY - r)); y <= Math.min(mask.height - 1, Math.ceil(centerY + r)); y += 1) {
    for (let x = Math.max(0, Math.floor(centerX - r)); x <= Math.min(mask.width - 1, Math.ceil(centerX + r)); x += 1) {
      if ((x - centerX) ** 2 + (y - centerY) ** 2 > radiusSquared) continue;
      const index = y * mask.width + x;
      if (mask.data[index] !== value) {
        mask.data[index] = value;
        changed += 1;
      }
    }
  }
  return changed;
}

export function maskIoU(a: BinaryMask, b: BinaryMask): number {
  assertMask(a);
  assertMask(b);
  if (a.width !== b.width || a.height !== b.height) {
    throw new MaskError('invalid-dimensions', 'Máscaras com dimensões diferentes.');
  }
  let intersection = 0;
  let union = 0;
  for (let i = 0; i < a.data.length; i += 1) {
    const av = Boolean(a.data[i]);
    const bv = Boolean(b.data[i]);
    if (av && bv) intersection += 1;
    if (av || bv) union += 1;
  }
  return union === 0 ? 0 : intersection / union;
}
