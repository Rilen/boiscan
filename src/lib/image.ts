import { analyzePixels, unknownQuality, type ImageQuality } from '../domain/imageQuality';

export interface LoadedImage {
  file: File;
  url: string;
  width: number;
  height: number;
  source: ImageBitmap | HTMLImageElement;
}

export class ImageDecodeError extends Error {
  constructor(message = 'Não foi possível decodificar a imagem.') {
    super(message);
    this.name = 'ImageDecodeError';
  }
}

function loadHtmlImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new ImageDecodeError());
    image.src = url;
  });
}

export async function loadImageFile(file: File): Promise<LoadedImage> {
  const url = URL.createObjectURL(file);

  try {
    let source: ImageBitmap | HTMLImageElement;
    if (typeof createImageBitmap === 'function') {
      source = await createImageBitmap(file);
    } else {
      source = await loadHtmlImage(url);
    }

    const width = source.width;
    const height = source.height;
    if (!width || !height) {
      throw new ImageDecodeError('A imagem não possui dimensões válidas.');
    }

    return { file, url, width, height, source };
  } catch (error) {
    URL.revokeObjectURL(url);
    if (error instanceof ImageDecodeError) throw error;
    throw new ImageDecodeError(
      'Não foi possível ler esta imagem. Tente outra foto em JPG, PNG ou WebP.',
    );
  }
}

export function releaseLoadedImage(image: LoadedImage | null): void {
  if (!image) return;
  URL.revokeObjectURL(image.url);
  if (typeof ImageBitmap !== 'undefined' && image.source instanceof ImageBitmap) {
    image.source.close();
  }
}

const MAX_ANALYSIS_SIDE = 384;

function drawRotated(
  source: ImageBitmap | HTMLImageElement,
  rotation: number,
): { canvas: HTMLCanvasElement | null; width: number; height: number } {
  const width = source.width;
  const height = source.height;
  const scale = Math.min(1, MAX_ANALYSIS_SIDE / Math.max(width, height));
  const drawWidth = Math.max(1, Math.round(width * scale));
  const drawHeight = Math.max(1, Math.round(height * scale));
  const quarterTurn = rotation % 180 !== 0;
  const canvasWidth = quarterTurn ? drawHeight : drawWidth;
  const canvasHeight = quarterTurn ? drawWidth : drawHeight;

  const canvas = document.createElement('canvas');
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;

  let context: CanvasRenderingContext2D | null = null;
  try {
    context = canvas.getContext('2d', { willReadFrequently: true });
  } catch {
    context = null;
  }
  if (!context) return { canvas: null, width: width, height: height };

  context.translate(canvasWidth / 2, canvasHeight / 2);
  context.rotate((rotation * Math.PI) / 180);
  context.drawImage(source, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);

  return { canvas, width: canvasWidth, height: canvasHeight };
}

/**
 * Renderiza a imagem em escala reduzida e analisa os pixels.
 * Retorna qualidade "não avaliada" quando o navegador não expõe canvas 2D
 * ou bloqueia a leitura dos pixels.
 */
export function analyzeImageQuality(
  source: ImageBitmap | HTMLImageElement,
  rotation = 0,
): ImageQuality {
  try {
    const { canvas } = drawRotated(source, rotation);
    if (!canvas) return unknownQuality();

    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return unknownQuality();

    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    return analyzePixels(
      { data: imageData.data, width: canvas.width, height: canvas.height },
      source.width,
      source.height,
    );
  } catch {
    return unknownQuality();
  }
}
