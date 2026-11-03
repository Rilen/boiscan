export const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
  'image/heic',
  'image/heif',
]);

export type ImageValidationCode =
  | 'empty'
  | 'unsupported-type'
  | 'too-large';

export type ImageValidationResult =
  | { ok: true }
  | { ok: false; code: ImageValidationCode; message: string };

export function validateImageFile(file: File): ImageValidationResult {
  if (!file || file.size <= 0) {
    return {
      ok: false,
      code: 'empty',
      message: 'O arquivo está vazio. Escolha uma foto válida.',
    };
  }

  const type = file.type.toLowerCase();
  if (!ALLOWED_MIME_TYPES.has(type)) {
    return {
      ok: false,
      code: 'unsupported-type',
      message:
        'Formato não suportado. Use uma foto JPG, PNG, WebP, AVIF ou HEIC.',
    };
  }

  if (file.size > MAX_IMAGE_BYTES) {
    return {
      ok: false,
      code: 'too-large',
      message: 'A imagem é muito grande. Use uma foto de até 15 MB.',
    };
  }

  return { ok: true };
}
