import type { PixelFrame } from '../domain/imageQuality';
import { paintMaskCircle } from './mask';
import { extractMorphometrics } from './morphometrics';
import {
  analyzeExperimentalFrame,
  type ExperimentalPipelineResult,
} from './pipeline';
import {
  segmentForeground,
  type SegmentationResult,
  type SegmentationRoi,
} from './segmentation';
import type { MorphometricFeatures } from './types';

function must<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Elemento ausente: ${id}`);
  return element as T;
}

const fileInput = must<HTMLInputElement>('file');
const fixtureSelect = must<HTMLSelectElement>('fixture');
const canvas = must<HTMLCanvasElement>('canvas');
const context = canvas.getContext('2d');
const brushMode = must<HTMLSelectElement>('brushMode');
const brushSize = must<HTMLInputElement>('brushSize');
const brushValue = must<HTMLSpanElement>('brushValue');
const analyzeButton = must<HTMLButtonElement>('analyze');
const resetButton = must<HTMLButtonElement>('resetEdits');
const exportButton = must<HTMLButtonElement>('export');
const clearButton = must<HTMLButtonElement>('clearMask');
const statusElement = must<HTMLDivElement>('status');
const diagnosticsElement = must<HTMLPreElement>('diagnostics');
const featuresElement = must<HTMLPreElement>('features');
const pipelineElement = must<HTMLPreElement>('pipeline');

const roiInputs = {
  x: must<HTMLInputElement>('roiX'),
  y: must<HTMLInputElement>('roiY'),
  width: must<HTMLInputElement>('roiW'),
  height: must<HTMLInputElement>('roiH'),
};

let frame: PixelFrame | null = null;
let sourceName = '';
let roi: SegmentationRoi = { x: 0, y: 0, width: 1, height: 1 };
let segmentation: SegmentationResult | null = null;
let mask: Uint8Array | null = null;
let features: MorphometricFeatures | null = null;
let pipeline: ExperimentalPipelineResult | null = null;
let edited = false;
let drawing = false;

function readRoi(): SegmentationRoi {
  const x = Math.min(0.99, Math.max(0, Number(roiInputs.x.value) || 0));
  const y = Math.min(0.99, Math.max(0, Number(roiInputs.y.value) || 0));
  const width = Math.min(1 - x, Math.max(0.01, Number(roiInputs.width.value) || 1));
  const height = Math.min(1 - y, Math.max(0.01, Number(roiInputs.height.value) || 1));
  roi = { x, y, width, height };
  return roi;
}

function writeRoi(value: SegmentationRoi): void {
  roiInputs.x.value = String(value.x);
  roiInputs.y.value = String(value.y);
  roiInputs.width.value = String(value.width);
  roiInputs.height.value = String(value.height);
  roi = value;
}

async function decodeBlob(blob: Blob): Promise<PixelFrame> {
  const bitmap = await createImageBitmap(blob);
  const maxSide = 900;
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const temp = document.createElement('canvas');
  temp.width = width;
  temp.height = height;
  const tempContext = temp.getContext('2d', { willReadFrequently: true });
  if (!tempContext) {
    bitmap.close();
    throw new Error('Canvas 2D indisponível.');
  }
  tempContext.drawImage(bitmap, 0, 0, width, height);
  const data = tempContext.getImageData(0, 0, width, height).data;
  bitmap.close();
  return { width, height, data };
}

function roiPixelArea(value: SegmentationRoi): number {
  if (!frame) return 0;
  const x0 = Math.max(0, Math.floor(value.x * frame.width));
  const y0 = Math.max(0, Math.floor(value.y * frame.height));
  const x1 = Math.min(
    frame.width - 1,
    Math.ceil((value.x + value.width) * frame.width) - 1,
  );
  const y1 = Math.min(
    frame.height - 1,
    Math.ceil((value.y + value.height) * frame.height) - 1,
  );
  return Math.max(1, (x1 - x0 + 1) * (y1 - y0 + 1));
}

function render(): void {
  if (!context || !frame) return;
  canvas.width = frame.width;
  canvas.height = frame.height;
  const image = new ImageData(
    new Uint8ClampedArray(frame.data),
    frame.width,
    frame.height,
  );
  if (mask) {
    for (let i = 0; i < mask.length; i += 1) {
      if (!mask[i]) continue;
      const offset = i * 4;
      image.data[offset] = Math.round((image.data[offset] ?? 0) * 0.45 + 220 * 0.55);
      image.data[offset + 1] = Math.round(
        (image.data[offset + 1] ?? 0) * 0.45 + 40 * 0.55,
      );
      image.data[offset + 2] = Math.round(
        (image.data[offset + 2] ?? 0) * 0.45 + 40 * 0.55,
      );
    }
  }
  context.putImageData(image, 0, 0);

  const x0 = Math.floor(roi.x * frame.width);
  const y0 = Math.floor(roi.y * frame.height);
  const x1 = Math.min(
    frame.width - 1,
    Math.ceil((roi.x + roi.width) * frame.width) - 1,
  );
  const y1 = Math.min(
    frame.height - 1,
    Math.ceil((roi.y + roi.height) * frame.height) - 1,
  );
  context.strokeStyle = '#2ee682';
  context.lineWidth = Math.max(2, Math.round(frame.width / 500));
  context.strokeRect(
    x0 + 1,
    y0 + 1,
    Math.max(1, x1 - x0 - 1),
    Math.max(1, y1 - y0 - 1),
  );
}

function updateDisplays(): void {
  if (!frame || !segmentation) {
    diagnosticsElement.textContent = 'Carregue uma foto.';
    featuresElement.textContent = '—';
    pipelineElement.textContent = '—';
    return;
  }

  diagnosticsElement.textContent = JSON.stringify(
    {
      image: { width: frame.width, height: frame.height },
      roi,
      edited,
      threshold: segmentation.diagnostics.threshold,
      backgroundRgb: segmentation.diagnostics.backgroundRgb,
      foregroundRatio: segmentation.diagnostics.foregroundRatio,
      borderTouchRatio: segmentation.diagnostics.borderTouchRatio,
      componentCount: segmentation.diagnostics.componentCount,
      warnings: segmentation.diagnostics.warnings,
    },
    null,
    2,
  );
  featuresElement.textContent = features
    ? JSON.stringify(
        {
          maskAreaPx: features.maskAreaPx,
          bbox: features.bbox,
          bodyLengthPx: features.bodyLengthPx,
          bodyHeightPx: features.bodyHeightPx,
          perimeterPx: features.perimeterPx,
          fillRatio: features.fillRatio,
          compactness: features.compactness,
          majorAxisPx: features.majorAxisPx,
          minorAxisPx: features.minorAxisPx,
          axisRatio: features.axisRatio,
          orientationDeg: features.orientationDeg,
          maxWidthPx: features.maxWidthPx,
          symmetry: features.symmetry,
        },
        null,
        2,
      )
    : 'Morfometria indisponível para esta máscara.';
  pipelineElement.textContent = pipeline
    ? JSON.stringify(
        {
          status: pipeline.status,
          reason: pipeline.status === 'rejected' ? pipeline.reason : undefined,
          message: 'message' in pipeline ? pipeline.message : 'Predição experimental.',
          warnings: 'warnings' in pipeline ? pipeline.warnings : [],
        },
        null,
        2,
      )
    : '—';

  if (pipeline?.status === 'features-only') {
    statusElement.textContent =
      'Características extraídas. Peso indisponível: falta escala confiável e/ou modelo experimental.';
  } else if (pipeline?.status === 'rejected') {
    statusElement.textContent = `Máscara rejeitada: ${pipeline.message}`;
  } else if (pipeline?.status === 'prediction-unavailable') {
    statusElement.textContent = `Predição indisponível: ${pipeline.message}`;
  } else if (pipeline?.status === 'predicted') {
    statusElement.textContent = 'Predição experimental produzida (não validada).';
  } else {
    statusElement.textContent = 'Carregue e analise uma foto.';
  }
}

function refreshFromMask(): void {
  if (!frame || !segmentation || !mask) return;
  try {
    features = extractMorphometrics(
      { width: frame.width, height: frame.height, data: mask },
      frame.width,
      frame.height,
    );
  } catch {
    features = null;
  }
  const x0 = Math.max(0, Math.floor(roi.x * frame.width));
  const y0 = Math.max(0, Math.floor(roi.y * frame.height));
  const x1 = Math.min(
    frame.width - 1,
    Math.ceil((roi.x + roi.width) * frame.width) - 1,
  );
  const y1 = Math.min(
    frame.height - 1,
    Math.ceil((roi.y + roi.height) * frame.height) - 1,
  );
  let count = 0;
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      if (mask[y * frame.width + x]) count += 1;
    }
  }
  const diagnostics = {
    ...segmentation.diagnostics,
    foregroundRatio: count / roiPixelArea(roi),
    roi,
  };
  const currentMask = { width: frame.width, height: frame.height, data: mask };
  pipeline = analyzeExperimentalFrame(frame, {
    segment: () => ({ mask: currentMask, diagnostics }),
    segmentationRoi: roi,
    minimumMaskAreaPx: 500,
  });
  render();
  updateDisplays();
}

function runAutomatic(): void {
  if (!frame) return;
  readRoi();
  segmentation = segmentForeground(frame, { roi });
  mask = new Uint8Array(segmentation.mask.data);
  edited = false;
  refreshFromMask();
}

async function loadBlob(blob: Blob, name: string, initialRoi?: SegmentationRoi): Promise<void> {
  statusElement.textContent = 'Carregando imagem localmente…';
  try {
    frame = await decodeBlob(blob);
    sourceName = name;
    writeRoi(initialRoi ?? { x: 0, y: 0, width: 1, height: 1 });
    runAutomatic();
    statusElement.textContent = 'Imagem carregada. Nenhum dado foi enviado.';
  } catch (error) {
    statusElement.textContent = `Falha ao carregar: ${error instanceof Error ? error.message : 'erro'}`;
  }
}

function canvasPoint(event: PointerEvent): { x: number; y: number } | null {
  if (!frame) return null;
  const rect = canvas.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return null;
  return {
    x: Math.floor(((event.clientX - rect.left) / rect.width) * frame.width),
    y: Math.floor(((event.clientY - rect.top) / rect.height) * frame.height),
  };
}

function paint(event: PointerEvent): void {
  if (!frame || !mask || brushMode.value === 'off') return;
  const point = canvasPoint(event);
  if (!point) return;
  const radius = Number(brushSize.value) || 18;
  paintMaskCircle(
    { width: frame.width, height: frame.height, data: mask },
    point.x,
    point.y,
    radius,
    brushMode.value === 'add' ? 1 : 0,
  );
  edited = true;
  render();
  statusElement.textContent = 'Máscara editada manualmente. Solte para recalcular.';
}

canvas.addEventListener('pointerdown', (event) => {
  if (brushMode.value === 'off') return;
  drawing = true;
  canvas.setPointerCapture(event.pointerId);
  paint(event);
});
canvas.addEventListener('pointermove', (event) => {
  if (drawing) paint(event);
});
canvas.addEventListener('pointerup', () => {
  if (!drawing) return;
  drawing = false;
  refreshFromMask();
});
canvas.addEventListener('pointercancel', () => {
  drawing = false;
});
canvas.addEventListener('pointerleave', () => {
  if (!drawing) return;
  drawing = false;
  refreshFromMask();
});

brushSize.addEventListener('input', () => {
  brushValue.textContent = brushSize.value;
});

analyzeButton.addEventListener('click', runAutomatic);
resetButton.addEventListener('click', runAutomatic);
clearButton.addEventListener('click', () => {
  if (!frame) return;
  mask = new Uint8Array(frame.width * frame.height);
  edited = true;
  refreshFromMask();
});

fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  void loadBlob(file, file.name);
});

exportButton.addEventListener('click', () => {
  if (!frame || !segmentation || !features || !pipeline) return;
  const report = {
    schemaVersion: 'boiscan.visual-tool/1',
    createdAt: new Date().toISOString(),
    source: { name: sourceName, width: frame.width, height: frame.height },
    edited,
    roi,
    segmentation: segmentation.diagnostics,
    features,
    pipeline: {
      status: pipeline.status,
      reason: pipeline.status === 'rejected' ? pipeline.reason : undefined,
      message: 'message' in pipeline ? pipeline.message : 'Predição experimental.',
      warnings: 'warnings' in pipeline ? pipeline.warnings : [],
    },
    note: 'Ferramenta experimental local; não é uma estimativa de peso validada.',
  };
  const blob = new Blob([`${JSON.stringify(report, null, 2)}\n`], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `boiscan-visual-${Date.now()}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
});

async function loadFixtureList(): Promise<void> {
  try {
    const response = await fetch('/experimental/fixtures/images/manifest.json');
    if (!response.ok) return;
    const manifest = (await response.json()) as {
      images: Array<{
        id: string;
        file: string;
        target: string;
        roi: SegmentationRoi;
      }>;
    };
    for (const image of manifest.images) {
      const option = document.createElement('option');
      option.value = image.id;
      option.textContent = `${image.id} — ${image.target}`;
      fixtureSelect.append(option);
    }
    fixtureSelect.addEventListener('change', async () => {
      const selected = manifest.images.find((image) => image.id === fixtureSelect.value);
      if (!selected) return;
      const imageResponse = await fetch(`/experimental/fixtures/images/${selected.file}`);
      if (!imageResponse.ok) {
        statusElement.textContent = 'Fixture não encontrada.';
        return;
      }
      const blob = await imageResponse.blob();
      fixtureSelect.value = selected.id;
      await loadBlob(blob, selected.file, selected.roi);
    });
  } catch {
    // O seletor de fixtures é opcional; o upload local continua disponível.
  }
}

void loadFixtureList();
