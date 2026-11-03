import type { PixelFrame } from '../domain/imageQuality';
import {
  analyzeExperimentalFrame,
  type ExperimentalPipelineOptions,
  type ExperimentalPipelineResult,
} from './pipeline';

export interface BrowserExperimentalOptions extends ExperimentalPipelineOptions {
  rotation?: number;
  maxSide?: number;
}

function rejected(message: string): ExperimentalPipelineResult {
  return { status: 'rejected', reason: 'invalid-frame', message };
}

/**
 * Decodifica a foto localmente, reduz para no máximo 512 px e executa o pipeline.
 * Nenhum pixel ou imagem sai do dispositivo nesta função.
 */
export async function analyzeImageBlobExperimental(
  blob: Blob,
  options: BrowserExperimentalOptions = {},
): Promise<ExperimentalPipelineResult> {
  if (typeof createImageBitmap !== 'function') {
    return rejected('Este navegador não permite decodificar a imagem localmente.');
  }

  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(blob);
    const rotation = ((options.rotation ?? 0) % 360 + 360) % 360;
    const maxSide = options.maxSide ?? 512;
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const drawWidth = Math.max(1, Math.round(bitmap.width * scale));
    const drawHeight = Math.max(1, Math.round(bitmap.height * scale));
    const quarterTurn = rotation % 180 !== 0;
    const canvasWidth = quarterTurn ? drawHeight : drawWidth;
    const canvasHeight = quarterTurn ? drawWidth : drawHeight;

    const canvas = document.createElement('canvas');
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) {
      return rejected('Este navegador não permite ler os pixels da imagem.');
    }

    context.translate(canvasWidth / 2, canvasHeight / 2);
    context.rotate((rotation * Math.PI) / 180);
    context.drawImage(bitmap, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);

    const imageData = context.getImageData(0, 0, canvasWidth, canvasHeight);
    const frame: PixelFrame = {
      data: imageData.data,
      width: canvasWidth,
      height: canvasHeight,
    };
    return analyzeExperimentalFrame(frame, options);
  } catch {
    return rejected(
      'Não foi possível decodificar ou processar a imagem experimentalmente.',
    );
  } finally {
    if (
      bitmap &&
      typeof ImageBitmap !== 'undefined' &&
      bitmap instanceof ImageBitmap
    ) {
      bitmap.close();
    }
  }
}
