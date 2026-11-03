import { describe, expect, it } from 'vitest';
import { MAX_IMAGE_BYTES, validateImageFile } from './imageValidation';

function fakeFile(overrides: Partial<File>): File {
  return {
    size: 1024,
    type: 'image/jpeg',
    name: 'boi.jpg',
    ...overrides,
  } as File;
}

describe('validação de arquivo de imagem', () => {
  it('aceita JPG, PNG e WebP', () => {
    expect(validateImageFile(fakeFile({ type: 'image/jpeg' })).ok).toBe(true);
    expect(validateImageFile(fakeFile({ type: 'image/png' })).ok).toBe(true);
    expect(validateImageFile(fakeFile({ type: 'image/webp' })).ok).toBe(true);
  });

  it('aceita HEIC e AVIF com tipos normalizados', () => {
    expect(validateImageFile(fakeFile({ type: 'image/heic' })).ok).toBe(true);
    expect(validateImageFile(fakeFile({ type: 'image/avif' })).ok).toBe(true);
    expect(validateImageFile(fakeFile({ type: 'IMAGE/JPEG' })).ok).toBe(true);
  });

  it('rejeita SVG e tipos não-imagem', () => {
    const svg = validateImageFile(fakeFile({ type: 'image/svg+xml' }));
    const text = validateImageFile(fakeFile({ type: 'text/plain' }));
    const pdf = validateImageFile(fakeFile({ type: 'application/pdf' }));

    expect(svg.ok).toBe(false);
    expect(text.ok).toBe(false);
    expect(pdf.ok).toBe(false);
    if (!svg.ok) expect(svg.code).toBe('unsupported-type');
  });

  it('rejeita arquivo vazio', () => {
    const result = validateImageFile(fakeFile({ size: 0 }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('empty');
  });

  it('rejeita arquivo acima de 15 MB', () => {
    const result = validateImageFile(fakeFile({ size: MAX_IMAGE_BYTES + 1 }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('too-large');
  });

  it('aceita exatamente 15 MB', () => {
    expect(validateImageFile(fakeFile({ size: MAX_IMAGE_BYTES })).ok).toBe(true);
  });

  it('retorna mensagens em português', () => {
    const result = validateImageFile(fakeFile({ type: 'text/plain' }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toMatch(/Formato não suportado/);
    }
  });
});
