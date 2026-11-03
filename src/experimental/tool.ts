import type { PixelFrame } from '../domain/imageQuality';
import {
  buildCollectionSample,
  isLengthUnit,
  type CollectionSample,
  type MaskCorrections,
  type MaskOrigin,
  type ReferenceInput,
} from './collection';
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
import type { MorphometricFeatures, Point } from './types';

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
const saveDraftButton = must<HTMLButtonElement>('saveDraft');
const clearButton = must<HTMLButtonElement>('clearMask');
const statusElement = must<HTMLDivElement>('status');
const diagnosticsElement = must<HTMLPreElement>('diagnostics');
const featuresElement = must<HTMLPreElement>('features');
const pipelineElement = must<HTMLPreElement>('pipeline');
const scaleInfoElement = must<HTMLPreElement>('scaleInfo');
const eligibilityElement = must<HTMLPreElement>('eligibility');
const eligibilityStatusElement = must<HTMLParagraphElement>('eligibilityStatus');

const sampleIdInput = must<HTMLInputElement>('sampleId');
const animalIdInput = must<HTMLInputElement>('animalId');
const weightKgInput = must<HTMLInputElement>('weightKg');
const weighedAtInput = must<HTMLInputElement>('weighedAt');
const weightSourceInput = must<HTMLInputElement>('weightSource');
const refLengthInput = must<HTMLInputElement>('refLength');
const refUnitInput = must<HTMLSelectElement>('refUnit');
const refUncertaintyInput = must<HTMLInputElement>('refUncertainty');
const refSamePlaneInput = must<HTMLInputElement>('refSamePlane');
const markScaleButton = must<HTMLButtonElement>('markScale');
const clearScaleButton = must<HTMLButtonElement>('clearScale');

const roiInputs = {
  x: must<HTMLInputElement>('roiX'),
  y: must<HTMLInputElement>('roiY'),
  width: must<HTMLInputElement>('roiW'),
  height: must<HTMLInputElement>('roiH'),
};

const DRAFT_STORAGE_KEY = 'boiscan.collection.draft';

let frame: PixelFrame | null = null;
let sourceName = '';
let originalWidth = 0;
let originalHeight = 0;
let imageSha256: string | null = null;
let roi: SegmentationRoi = { x: 0, y: 0, width: 1, height: 1 };
let segmentation: SegmentationResult | null = null;
let mask: Uint8Array | null = null;
let features: MorphometricFeatures | null = null;
let pipeline: ExperimentalPipelineResult | null = null;
let maskOrigin: MaskOrigin = 'automatic';
let corrections: MaskCorrections = {
  brushStrokes: 0,
  editedPixels: 0,
  cleared: false,
  roi: { x: 0, y: 0, width: 1, height: 1 },
};
let drawing = false;
let paintedThisStroke = false;
let scaleMode = false;
let scaleStart: Point | null = null;
let scaleEnd: Point | null = null;

function defaultSampleId(): string {
  const now = new Date();
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `S-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(
    now.getHours(),
  )}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

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

async function sha256Of(blob: Blob): Promise<string | null> {
  try {
    if (!globalThis.crypto?.subtle) return null;
    const digest = await globalThis.crypto.subtle.digest(
      'SHA-256',
      await blob.arrayBuffer(),
    );
    return [...new Uint8Array(digest)]
      .map((value) => value.toString(16).padStart(2, '0'))
      .join('');
  } catch {
    return null;
  }
}

async function decodeBlob(
  blob: Blob,
): Promise<{ frame: PixelFrame; originalWidth: number; originalHeight: number }> {
  const bitmap = await createImageBitmap(blob);
  const originalWidth = bitmap.width;
  const originalHeight = bitmap.height;
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
  return { frame: { width, height, data }, originalWidth, originalHeight };
}

function parseOptionalNumber(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === '') return null;
  return Number(trimmed);
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

function drawScaleOverlay(): void {
  if (!context || !frame || !scaleStart) return;
  const lineWidth = Math.max(2, Math.round(frame.width / 500));
  const toPixel = (point: Point): Point => ({
    x: point.x * frame!.width,
    y: point.y * frame!.height,
  });
  const start = toPixel(scaleStart);
  const end = scaleEnd ? toPixel(scaleEnd) : null;

  context.strokeStyle = '#7fd1ff';
  context.fillStyle = '#7fd1ff';
  context.lineWidth = lineWidth;
  if (end) {
    context.beginPath();
    context.moveTo(start.x, start.y);
    context.lineTo(end.x, end.y);
    context.stroke();
  }

  for (const point of end ? [start, end] : [start]) {
    context.beginPath();
    context.arc(point.x, point.y, Math.max(4, lineWidth * 2), 0, Math.PI * 2);
    context.fill();
  }

  if (end) {
    const pixelLength = Math.hypot(end.x - start.x, end.y - start.y);
    context.font = `${Math.max(12, Math.round(frame.width / 60))}px system-ui, sans-serif`;
    context.fillText(
      `${pixelLength.toFixed(1)} px`,
      Math.min(start.x, end.x) + 8,
      Math.min(start.y, end.y) - 8,
    );
  }
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

  drawScaleOverlay();
}

function currentReference(): ReferenceInput | null {
  if (!scaleStart || !scaleEnd) return null;
  const unitValue = refUnitInput.value;
  const unit = isLengthUnit(unitValue) ? unitValue : 'cm';
  const knownLength = parseOptionalNumber(refLengthInput.value);
  const uncertainty = parseOptionalNumber(refUncertaintyInput.value);
  return {
    knownLength: knownLength ?? 0,
    unit,
    start: { ...scaleStart },
    end: { ...scaleEnd },
    samePlaneAsAnimal: refSamePlaneInput.checked,
    ...(uncertainty === null ? {} : { uncertaintyCm: uncertainty }),
  };
}

function currentSample(): CollectionSample | null {
  if (!frame || !segmentation || !mask) return null;
  const warnings =
    pipeline !== null && 'warnings' in pipeline ? pipeline.warnings : [];
  return buildCollectionSample({
    sampleId: sampleIdInput.value,
    animalId: animalIdInput.value,
    image: {
      name: sourceName,
      sha256: imageSha256,
      originalWidth,
      originalHeight,
      analysisWidth: frame.width,
      analysisHeight: frame.height,
    },
    mask: { width: frame.width, height: frame.height, data: mask },
    features,
    maskOrigin,
    corrections: { ...corrections, roi: { ...roi } },
    segmentationWarnings: segmentation.diagnostics.warnings,
    reference: currentReference(),
    weightKg: parseOptionalNumber(weightKgInput.value),
    weighedAt: weighedAtInput.value.trim() === '' ? null : weighedAtInput.value,
    weightSource:
      weightSourceInput.value.trim() === '' ? null : weightSourceInput.value,
    qualityWarnings: warnings,
  });
}

function formatScaleInfo(sample: CollectionSample): string {
  if (!sample.reference) return 'Sem referência marcada.';
  const reference = sample.reference;
  if (reference.pixelLength === null) {
    return [
      'Referência inválida: nenhuma dimensão física foi calculada.',
      ...reference.warnings.map((warning) => `- ${warning}`),
    ].join('\n');
  }
  return [
    `Comprimento informado: ${reference.knownLength} ${reference.unit} (${reference.knownLengthCm} cm)`,
    `Comprimento em pixels: ${reference.pixelLength.toFixed(2)} px`,
    `Escala: ${reference.cmPerPixel?.toFixed(5)} cm/px`,
    `Incerteza relativa: ${((reference.relativeUncertainty ?? 0) * 100).toFixed(2)}%`,
    `Confiável: ${reference.reliable ? 'sim' : 'não'}`,
    ...reference.warnings.map((warning) => `- ${warning}`),
  ].join('\n');
}

function updateSamplePanel(): void {
  const sample = currentSample();
  if (!sample) {
    featuresElement.textContent = '—';
    scaleInfoElement.textContent = 'Sem referência marcada.';
    eligibilityElement.textContent = '—';
    eligibilityStatusElement.textContent = 'Carregue uma foto para avaliar a amostra.';
    return;
  }

  featuresElement.textContent = JSON.stringify(
    {
      pixelUnits: sample.features.units.pixelLength,
      pixels: sample.features.pixels,
      physicalUnits: sample.features.units.physicalLength,
      physical:
        sample.features.physical ??
        'indisponível sem referência de escala válida e confiável',
    },
    null,
    2,
  );
  scaleInfoElement.textContent = formatScaleInfo(sample);

  eligibilityStatusElement.textContent =
    sample.status === 'eligible'
      ? 'Elegível para análise: identificadores, máscara, escala, peso e data válidos.'
      : `Rascunho: ${sample.eligibility.issues.length} pendência(s) impedem a elegibilidade.`;

  eligibilityElement.textContent = JSON.stringify(
    {
      status: sample.status,
      eligible: sample.eligibility.eligible,
      issues: sample.eligibility.issues.map((issue) => ({
        code: issue.code,
        field: issue.field,
        message: issue.message,
      })),
      physicalFeatures: sample.features.physical ? 'available-cm' : 'unavailable',
    },
    null,
    2,
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
      image: {
        original: { width: originalWidth, height: originalHeight },
        analysis: { width: frame.width, height: frame.height },
      },
      roi,
      maskOrigin,
      corrections,
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
  corrections.roi = { ...roi };
  render();
  updateDisplays();
  updateSamplePanel();
}

function runAutomatic(): void {
  if (!frame) return;
  readRoi();
  segmentation = segmentForeground(frame, { roi });
  mask = new Uint8Array(segmentation.mask.data);
  maskOrigin = 'automatic';
  corrections = {
    brushStrokes: 0,
    editedPixels: 0,
    cleared: false,
    roi: { ...roi },
  };
  refreshFromMask();
}

async function loadBlob(
  blob: Blob,
  name: string,
  initialRoi?: SegmentationRoi,
): Promise<void> {
  statusElement.textContent = 'Carregando imagem localmente…';
  try {
    const decoded = await decodeBlob(blob);
    frame = decoded.frame;
    originalWidth = decoded.originalWidth;
    originalHeight = decoded.originalHeight;
    imageSha256 = await sha256Of(blob);
    sourceName = name;
    writeRoi(initialRoi ?? { x: 0, y: 0, width: 1, height: 1 });
    scaleStart = null;
    scaleEnd = null;
    setScaleMode(false);
    sampleIdInput.value = defaultSampleId();
    runAutomatic();
    statusElement.textContent =
      'Imagem carregada. Nenhum dado foi enviado. Revise a máscara e a referência de escala.';
  } catch (error) {
    statusElement.textContent = `Falha ao carregar: ${error instanceof Error ? error.message : 'erro'}`;
  }
}

function canvasPoint(event: PointerEvent): Point | null {
  if (!frame) return null;
  const rect = canvas.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return null;
  return {
    x: Math.floor(((event.clientX - rect.left) / rect.width) * frame.width),
    y: Math.floor(((event.clientY - rect.top) / rect.height) * frame.height),
  };
}

function setScaleMode(next: boolean): void {
  scaleMode = next;
  markScaleButton.textContent = next
    ? 'Cancelar marcação'
    : 'Marcar referência (2 pontos)';
  canvas.classList.toggle('scale-mode', next);
  if (next) {
    if (scaleStart && scaleEnd) {
      scaleStart = null;
      scaleEnd = null;
    }
    statusElement.textContent = scaleStart
      ? 'Clique no segundo ponto da referência física.'
      : 'Clique no primeiro ponto da referência física.';
    render();
  }
}

function paint(event: PointerEvent): void {
  if (!frame || !mask || brushMode.value === 'off') return;
  const point = canvasPoint(event);
  if (!point) return;
  const radius = Number(brushSize.value) || 18;
  const changed = paintMaskCircle(
    { width: frame.width, height: frame.height, data: mask },
    point.x,
    point.y,
    radius,
    brushMode.value === 'add' ? 1 : 0,
  );
  if (changed > 0) {
    corrections.editedPixels += changed;
    paintedThisStroke = true;
    if (maskOrigin === 'automatic' || maskOrigin === 'hybrid') {
      maskOrigin = 'hybrid';
    } else {
      maskOrigin = 'manual';
    }
  }
  render();
  statusElement.textContent = 'Máscara editada manualmente. Solte para recalcular.';
}

function endStroke(recalculate: boolean): void {
  if (!drawing) return;
  drawing = false;
  if (paintedThisStroke) {
    corrections.brushStrokes += 1;
    paintedThisStroke = false;
  }
  if (recalculate) refreshFromMask();
}

canvas.addEventListener('pointerdown', (event) => {
  if (scaleMode) {
    if (!frame) return;
    const point = canvasPoint(event);
    if (!point) return;
    const normalized: Point = {
      x: point.x / frame.width,
      y: point.y / frame.height,
    };
    if (!scaleStart || (scaleStart && scaleEnd)) {
      scaleStart = normalized;
      scaleEnd = null;
      statusElement.textContent = 'Primeiro ponto marcado. Clique no segundo ponto.';
    } else {
      scaleEnd = normalized;
      setScaleMode(false);
      statusElement.textContent =
        'Referência marcada. Informe o comprimento e a unidade para calcular a escala.';
    }
    render();
    updateSamplePanel();
    return;
  }
  if (brushMode.value === 'off') return;
  drawing = true;
  paintedThisStroke = false;
  canvas.setPointerCapture(event.pointerId);
  paint(event);
});
canvas.addEventListener('pointermove', (event) => {
  if (drawing) paint(event);
});
canvas.addEventListener('pointerup', () => endStroke(true));
canvas.addEventListener('pointercancel', () => endStroke(false));
canvas.addEventListener('pointerleave', () => endStroke(true));

brushSize.addEventListener('input', () => {
  brushValue.textContent = brushSize.value;
});

analyzeButton.addEventListener('click', runAutomatic);
resetButton.addEventListener('click', runAutomatic);
clearButton.addEventListener('click', () => {
  if (!frame) return;
  const previousForeground = mask
    ? mask.reduce((sum, value) => sum + (value ? 1 : 0), 0)
    : 0;
  mask = new Uint8Array(frame.width * frame.height);
  maskOrigin = 'manual';
  corrections.cleared = true;
  corrections.editedPixels += previousForeground;
  corrections.roi = { ...roi };
  refreshFromMask();
});

markScaleButton.addEventListener('click', () => setScaleMode(!scaleMode));
clearScaleButton.addEventListener('click', () => {
  scaleStart = null;
  scaleEnd = null;
  setScaleMode(false);
  statusElement.textContent = 'Referência de escala removida.';
  render();
  updateSamplePanel();
});

for (const element of [
  sampleIdInput,
  animalIdInput,
  weightKgInput,
  weighedAtInput,
  weightSourceInput,
  refLengthInput,
  refUnitInput,
  refUncertaintyInput,
  refSamePlaneInput,
]) {
  element.addEventListener('input', () => updateSamplePanel());
  element.addEventListener('change', () => updateSamplePanel());
}

function downloadJson(value: unknown, filename: string): void {
  const blob = new Blob([`${JSON.stringify(value, null, 2)}\n`], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

exportButton.addEventListener('click', () => {
  const sample = currentSample();
  if (!sample) {
    statusElement.textContent = 'Carregue uma foto antes de exportar a amostra.';
    return;
  }
  updateSamplePanel();
  if (!sample.eligibility.eligible) {
    statusElement.textContent = `Amostra não elegível: ${sample.eligibility.issues.length} pendência(s). Corrija os campos ou salve como rascunho.`;
    return;
  }
  downloadJson(sample, `${sample.sampleId}.json`);
  statusElement.textContent = `Amostra elegível exportada (${sample.sampleId}).`;
});

saveDraftButton.addEventListener('click', () => {
  const sample = currentSample();
  if (!sample) {
    statusElement.textContent = 'Carregue uma foto antes de salvar o rascunho.';
    return;
  }
  const draft: CollectionSample = { ...sample, status: 'draft' };
  try {
    globalThis.localStorage?.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
  } catch {
    // O download continua disponível mesmo sem localStorage.
  }
  const filename = `${sample.sampleId || 'amostra'}.draft.json`;
  downloadJson(draft, filename);
  statusElement.textContent =
    sample.status === 'eligible'
      ? `Amostra elegível salva como rascunho em ${filename}.`
      : `Rascunho salvo em ${filename} com ${sample.eligibility.issues.length} pendência(s).`;
});

fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  void loadBlob(file, file.name);
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

sampleIdInput.value = defaultSampleId();
void loadFixtureList();
