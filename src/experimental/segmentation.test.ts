import { describe, expect, it } from 'vitest';
import type { PixelFrame } from '../domain/imageQuality';
import { segmentForeground, SegmentationError } from './segmentation';

function frame(width: number, height: number, background: number[]): PixelFrame {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    data[i * 4] = background[0] ?? 0;
    data[i * 4 + 1] = background[1] ?? 0;
    data[i * 4 + 2] = background[2] ?? 0;
    data[i * 4 + 3] = 255;
  }
  return { data, width, height };
}

function fillRect(
  target: PixelFrame,
  x: number,
  y: number,
  w: number,
  h: number,
  color: number[],
): void {
  for (let row = y; row < y + h; row += 1) {
    for (let col = x; col < x + w; col += 1) {
      const offset = (row * target.width + col) * 4;
      target.data[offset] = color[0] ?? 0;
      target.data[offset + 1] = color[1] ?? 0;
      target.data[offset + 2] = color[2] ?? 0;
      target.data[offset + 3] = 255;
    }
  }
}

describe('segmentação clássica experimental', () => {
  it('separa um objeto contrastante do fundo', () => {
    const image = frame(120, 80, [30, 60, 30]);
    fillRect(image, 20, 20, 80, 36, [150, 90, 40]);
    const result = segmentForeground(image);
    const foreground = result.mask.data.reduce((sum, value) => sum + value, 0);
    expect(foreground).toBeGreaterThan(2000);
    expect(result.diagnostics.foregroundRatio).toBeGreaterThan(0.2);
    expect(result.diagnostics.backgroundRgb).toEqual([30, 60, 30]);
    expect(result.diagnostics.borderTouchRatio).toBe(0);
  });

  it('mantém o maior objeto quando há dois', () => {
    const image = frame(120, 80, [20, 20, 20]);
    fillRect(image, 10, 10, 10, 10, [200, 100, 30]);
    fillRect(image, 30, 20, 60, 30, [200, 100, 30]);
    const result = segmentForeground(image);
    expect(result.diagnostics.componentCount).toBe(2);
    expect(result.diagnostics.removedPixels).toBeGreaterThan(0);
    expect(result.diagnostics.warnings.join(' ')).toMatch(/componentes/);
  });

  it('devolve máscara vazia e aviso em imagem uniforme', () => {
    const result = segmentForeground(frame(40, 30, [128, 128, 128]));
    expect(result.mask.data.some(Boolean)).toBe(false);
    expect(result.diagnostics.warnings.join(' ')).toMatch(/Nenhum animal/);
  });

  it('rejeita buffers e dimensões inválidas', () => {
    expect(() =>
      segmentForeground({ width: 2, height: 2, data: new Uint8ClampedArray(4) }),
    ).toThrow(SegmentationError);
    expect(() =>
      segmentForeground({
        width: 3,
        height: 3,
        data: new Uint8ClampedArray(3 * 3 * 4 + 1),
      }),
    ).toThrow(SegmentationError);
  });

  it('restringe a máscara à ROI normalizada', () => {
    const image = frame(120, 80, [30, 60, 30]);
    fillRect(image, 10, 10, 20, 20, [180, 100, 30]);
    fillRect(image, 70, 40, 30, 20, [180, 100, 30]);
    const result = segmentForeground(image, {
      roi: { x: 0.5, y: 0.45, width: 0.35, height: 0.4 },
    });
    expect(result.diagnostics.roi).toEqual({
      x: 0.5,
      y: 0.45,
      width: 0.35,
      height: 0.4,
    });
    expect(result.mask.data[10 * 120 + 10]).toBe(0);
    expect(result.mask.data.some(Boolean)).toBe(true);
  });});
