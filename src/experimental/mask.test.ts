import { describe, expect, it } from 'vitest';
import {
  countForeground,
  createMask,
  fillEnclosedHoles,
  keepLargestComponent,
  labelComponents,
  maskBorderTouchRatio,
  maskBoundingBox,
  maskIoU,
  MaskError,
} from './mask';
import type { BinaryMask } from './types';

function rectangleMask(
  width: number,
  height: number,
  x: number,
  y: number,
  w: number,
  h: number,
): BinaryMask {
  const mask = createMask(width, height);
  for (let row = y; row < y + h; row += 1) {
    for (let col = x; col < x + w; col += 1) {
      mask.data[row * width + col] = 1;
    }
  }
  return mask;
}

describe('máscaras binárias', () => {
  it('conta área, caixa e componentes', () => {
    const mask = rectangleMask(20, 15, 3, 2, 10, 5);
    expect(countForeground(mask)).toBe(50);
    expect(maskBoundingBox(mask)).toEqual({ x: 3, y: 2, width: 10, height: 5 });

    const labeling = labelComponents(mask);
    expect(labeling.componentCount).toBe(1);
    expect(labeling.largestArea).toBe(50);
  });

  it('mantém apenas o maior componente', () => {
    const mask = rectangleMask(20, 20, 1, 1, 3, 3);
    for (let y = 6; y < 16; y += 1) {
      for (let x = 6; x < 16; x += 1) {
        mask.data[y * 20 + x] = 1;
      }
    }

    const result = keepLargestComponent(mask);
    expect(result.componentCount).toBe(2);
    expect(result.largestArea).toBe(100);
    expect(countForeground(result.mask)).toBe(100);
    expect(result.removedPixels).toBe(9);
  });

  it('preenche buracos internos e preserva fundo externo', () => {
    const mask = createMask(7, 7);
    for (let y = 1; y <= 5; y += 1) {
      for (let x = 1; x <= 5; x += 1) {
        const edge = x === 1 || x === 5 || y === 1 || y === 5;
        if (edge) mask.data[y * 7 + x] = 1;
      }
    }
    expect(countForeground(mask)).toBe(16);
    const filled = fillEnclosedHoles(mask);
    expect(countForeground(filled)).toBe(25);
    expect(filled.data[0]).toBe(0);
  });

  it('mede a fração de pixels tocando a borda', () => {
    const edge = rectangleMask(10, 10, 0, 0, 10, 2);
    expect(maskBorderTouchRatio(edge)).toBeCloseTo(0.6, 6);
    const inner = rectangleMask(10, 10, 2, 2, 4, 4);
    expect(maskBorderTouchRatio(inner)).toBe(0);
  });

  it('calcula IoU entre máscaras de mesmo tamanho', () => {
    const a = rectangleMask(10, 10, 1, 1, 4, 4);
    const b = rectangleMask(10, 10, 2, 2, 4, 4);
    expect(maskIoU(a, a)).toBe(1);
    expect(maskIoU(a, b)).toBeCloseTo(9 / 23, 6);
  });

  it('rejeita máscaras inválidas', () => {
    expect(() => createMask(0, 10)).toThrow(MaskError);
    expect(() =>
      countForeground({ width: 2, height: 2, data: new Uint8Array(3) }),
    ).toThrow(MaskError);
    expect(() => maskIoU(createMask(2, 2), createMask(3, 2))).toThrow(MaskError);
  });
});
