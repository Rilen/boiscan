import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

let objectUrlCounter = 0;

Object.defineProperty(URL, 'createObjectURL', {
  writable: true,
  configurable: true,
  value: vi.fn(() => {
    objectUrlCounter += 1;
    return `blob:mock-image-${objectUrlCounter}`;
  }),
});

Object.defineProperty(URL, 'revokeObjectURL', {
  writable: true,
  configurable: true,
  value: vi.fn(),
});

class FakeImageBitmap {
  width = 1200;
  height = 800;
  close = vi.fn();
}

Object.defineProperty(globalThis, 'createImageBitmap', {
  writable: true,
  configurable: true,
  value: vi.fn(async () => new FakeImageBitmap()),
});

HTMLCanvasElement.prototype.getContext = vi.fn(() => null) as unknown as typeof HTMLCanvasElement.prototype.getContext;

afterEach(() => {
  cleanup();
  localStorage.clear();
});
