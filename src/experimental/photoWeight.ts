/**
 * Experimental photo -> weight model for the Mission 012 Cloudflare preview.
 *
 * Local browser inference only:
 *   1. YOLO11n-seg ONNX is used ONLY as a cow-presence gate (COCO class 19).
 *   2. MobileNetV3-small ONNX produces a 576-d embedding of the photo.
 *   3. A ridge regression trained on local A/B animal-split data predicts kg.
 *
 * The trained regression is the numeric model. There is no pixel->kg formula,
 * no filename lookup and no fallback number. If the gate/model fails, callers
 * must display a failure instead of a prediction.
 */

export interface PhotoWeightArtifact {
  schemaVersion: 'boiscan.photo-weight/1';
  modelId: string;
  modelVersion: string;
  createdAt: string;
  backbone: {
    name: string;
    version: string;
    file: string;
    sha256: string;
    input: [number, number, number, number];
    embeddingSize: number;
    preprocessing: string;
  };
  detector: {
    name: string;
    version: string;
    file: string;
    sha256: string;
    input: [number, number, number, number];
    preprocessing: string;
    classId: number;
    confidenceThreshold: number;
    use: string;
  };
  regression: {
    algorithm: 'ridge-regression';
    alpha: number;
    means: number[];
    scales: number[];
    coefficients: number[];
    intercept: number;
  };
  training: {
    nAnimalsTrain: number;
    nAnimalsTest: number;
    sources: Record<string, { name: string; license: string; role: string }>;
    imagesPerAnimal: number;
    animalSplit: string;
    testAnimals: string[];
    datasetSha256: string;
    notes: string;
  };
  metrics: Record<string, unknown>;
  limitations: string[];
}

export type PhotoWeightFailureReason =
  | 'no-bovine-detected'
  | 'model-unavailable'
  | 'invalid-image'
  | 'out-of-domain'
  | 'processing-failed';

export interface PhotoWeightFailure {
  ok: false;
  reason: PhotoWeightFailureReason;
  message: string;
  details: string[];
}

export type PhotoWeightResult =
  | { ok: true; weightKg: number }
  | PhotoWeightFailure;

export interface PhotoWeightOptions {
  artifactUrl?: string;
  wasmPaths?: string;
  minimumWeightKg?: number;
  maximumWeightKg?: number;
}

const DEFAULT_ARTIFACT = '/models/photo-weight-v1.json';
const DEFAULT_WASM = '/ort-wasm/';
const DEFAULT_MIN_KG = 1;
const DEFAULT_MAX_KG = 3000;
const DETECTOR_SIZE = 640;
const DETECTOR_PAD = 114;
const FEATURE_SIZE = 224;
const IMAGENET_MEAN = [0.485, 0.456, 0.406] as const;
const IMAGENET_STD = [0.229, 0.224, 0.225] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function failure(
  reason: PhotoWeightFailureReason,
  message: string,
  details: string[] = [],
): PhotoWeightFailure {
  return { ok: false, reason, message, details };
}

export function validatePhotoWeightArtifact(value: unknown): string[] {
  const errors: string[] = [];
  if (!isRecord(value)) return ['artefato não é um objeto'];
  if (value.schemaVersion !== 'boiscan.photo-weight/1') {
    errors.push('schemaVersion inválido');
  }
  if (typeof value.modelId !== 'string' || !value.modelId.trim()) {
    errors.push('modelId ausente');
  }
  if (typeof value.modelVersion !== 'string' || !value.modelVersion.trim()) {
    errors.push('modelVersion ausente');
  }
  const backbone = value.backbone;
  const detector = value.detector;
  const regression = value.regression;
  if (!isRecord(backbone)) errors.push('backbone ausente');
  if (!isRecord(detector)) errors.push('detector ausente');
  if (!isRecord(regression)) errors.push('regression ausente');
  const size = isRecord(backbone) && Number.isInteger(backbone.embeddingSize)
    ? (backbone.embeddingSize as number)
    : 0;
  if (size <= 0) errors.push('embeddingSize inválido');
  if (isRecord(regression)) {
    if (regression.algorithm !== 'ridge-regression') {
      errors.push('algorithm não suportado');
    }
    for (const key of ['means', 'scales', 'coefficients'] as const) {
      const values = regression[key];
      if (!Array.isArray(values) || values.length !== size) {
        errors.push(`${key} com tamanho incompatível`);
      } else if (!values.every(finite)) {
        errors.push(`${key} contém valor não finito`);
      }
    }
    if (Array.isArray(regression.scales) && regression.scales.some((v) => finite(v) && v <= 0)) {
      errors.push('scales deve ser positivo');
    }
    if (!finite(regression.intercept)) errors.push('intercept inválido');
  }
  if (isRecord(detector)) {
    if (detector.classId !== 19) errors.push('classId deve ser 19 (cow)');
    if (!finite(detector.confidenceThreshold)) errors.push('confidenceThreshold inválido');
    if (typeof detector.file !== 'string' || !detector.file) errors.push('detector.file ausente');
  }
  if (isRecord(backbone) && (typeof backbone.file !== 'string' || !backbone.file)) {
    errors.push('backbone.file ausente');
  }
  return errors;
}

export function predictRidge(
  embedding: ArrayLike<number>,
  regression: PhotoWeightArtifact['regression'],
): number {
  if (embedding.length !== regression.coefficients.length) {
    throw new Error('embedding incompatível com o modelo');
  }
  let value = regression.intercept;
  for (let i = 0; i < embedding.length; i += 1) {
    const mean = regression.means[i];
    const scale = regression.scales[i];
    const coefficient = regression.coefficients[i];
    if (mean === undefined || scale === undefined || coefficient === undefined) {
      throw new Error('modelo inconsistente');
    }
    value += coefficient * ((embedding[i]! - mean) / scale);
  }
  return value;
}

function normaliseRotation(rotation: number): number {
  return ((rotation % 360) + 360) % 360;
}

function makeRotatedBase(bitmap: ImageBitmap, rotation: number, maxSide = 640): HTMLCanvasElement {
  const angle = (normaliseRotation(rotation) * Math.PI) / 180;
  const quarter = Math.round(normaliseRotation(rotation) / 90) % 2 !== 0;
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const bw = Math.max(1, Math.round(bitmap.width * scale));
  const bh = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = quarter ? bh : bw;
  canvas.height = quarter ? bw : bh;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2d indisponível');
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate(angle);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, -bw / 2, -bh / 2, bw, bh);
  return canvas;
}

function detectorInput(bitmap: ImageBitmap, rotation: number): Float32Array {
  const base = makeRotatedBase(bitmap, rotation, 640);
  const canvas = document.createElement('canvas');
  canvas.width = DETECTOR_SIZE;
  canvas.height = DETECTOR_SIZE;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('canvas 2d indisponível');
  ctx.fillStyle = `rgb(${DETECTOR_PAD},${DETECTOR_PAD},${DETECTOR_PAD})`;
  ctx.fillRect(0, 0, DETECTOR_SIZE, DETECTOR_SIZE);
  const scale = Math.min(DETECTOR_SIZE / base.width, DETECTOR_SIZE / base.height);
  const dw = base.width * scale;
  const dh = base.height * scale;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(base, (DETECTOR_SIZE - dw) / 2, (DETECTOR_SIZE - dh) / 2, dw, dh);
  const rgba = ctx.getImageData(0, 0, DETECTOR_SIZE, DETECTOR_SIZE).data;
  const out = new Float32Array(3 * DETECTOR_SIZE * DETECTOR_SIZE);
  const plane = DETECTOR_SIZE * DETECTOR_SIZE;
  for (let i = 0; i < plane; i += 1) {
    out[i] = rgba[i * 4]! / 255;
    out[plane + i] = rgba[i * 4 + 1]! / 255;
    out[2 * plane + i] = rgba[i * 4 + 2]! / 255;
  }
  return out;
}

function featureInput(bitmap: ImageBitmap, rotation: number): Float32Array {
  const base = makeRotatedBase(bitmap, rotation, 640);
  const canvas = document.createElement('canvas');
  canvas.width = FEATURE_SIZE;
  canvas.height = FEATURE_SIZE;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('canvas 2d indisponível');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(base, 0, 0, FEATURE_SIZE, FEATURE_SIZE);
  const rgba = ctx.getImageData(0, 0, FEATURE_SIZE, FEATURE_SIZE).data;
  const plane = FEATURE_SIZE * FEATURE_SIZE;
  const out = new Float32Array(3 * plane);
  for (let i = 0; i < plane; i += 1) {
    out[i] = (rgba[i * 4]! / 255 - IMAGENET_MEAN[0]) / IMAGENET_STD[0];
    out[plane + i] = (rgba[i * 4 + 1]! / 255 - IMAGENET_MEAN[1]) / IMAGENET_STD[1];
    out[2 * plane + i] = (rgba[i * 4 + 2]! / 255 - IMAGENET_MEAN[2]) / IMAGENET_STD[2];
  }
  return out;
}

type OrtModule = typeof import('onnxruntime-web');
type OrtSession = import('onnxruntime-web').InferenceSession;

async function createSession(
  ort: OrtModule,
  url: string,
): Promise<OrtSession> {
  return ort.InferenceSession.create(url, {
    executionProviders: ['wasm'],
    graphOptimizationLevel: 'all',
  });
}

function hasCow(output: { dims: readonly number[]; data: Float32Array | Int32Array | Uint8Array }, threshold: number, classId: number): boolean {
  const dims = output.dims;
  if (dims.length !== 3 || dims[1] === undefined || dims[2] === undefined) return false;
  const stride = dims[2];
  const classRow = 4 + classId;
  if (stride <= 0 || dims[1] <= classRow) return false;
  const data = output.data;
  const offset = classRow * stride;
  for (let i = 0; i < stride; i += 1) {
    if ((data[offset + i] ?? 0) >= threshold) return true;
  }
  return false;
}

export function createPhotoWeightPredictor(options: PhotoWeightOptions = {}) {
  const artifactUrl = options.artifactUrl ?? DEFAULT_ARTIFACT;
  const wasmPaths = options.wasmPaths ?? DEFAULT_WASM;
  const minimum = options.minimumWeightKg ?? DEFAULT_MIN_KG;
  const maximum = options.maximumWeightKg ?? DEFAULT_MAX_KG;
  let artifactPromise: Promise<PhotoWeightArtifact> | null = null;
  let sessionsPromise: Promise<{ ort: OrtModule; detector: OrtSession; features: OrtSession }> | null = null;

  function getArtifact(): Promise<PhotoWeightArtifact> {
    if (!artifactPromise) {
      artifactPromise = (async () => {
        const response = await fetch(artifactUrl, { cache: 'force-cache' });
        if (!response.ok) throw new Error(`HTTP ${response.status} ao carregar o modelo`);
        const value: unknown = await response.json();
        const errors = validatePhotoWeightArtifact(value);
        if (errors.length > 0) throw new Error(errors.join('; '));
        return value as PhotoWeightArtifact;
      })();
    }
    return artifactPromise;
  }

  function getSessions() {
    if (!sessionsPromise) {
      sessionsPromise = (async () => {
        const artifact = await getArtifact();
        const ort = await import('onnxruntime-web');
        ort.env.wasm.wasmPaths = wasmPaths;
        ort.env.wasm.numThreads = 1;
        ort.env.wasm.proxy = false;
        const [detector, features] = await Promise.all([
          createSession(ort, artifact.detector.file),
          createSession(ort, artifact.backbone.file),
        ]);
        return { ort, detector, features };
      })();
    }
    return sessionsPromise;
  }

  async function predict(blob: Blob, rotation = 0): Promise<PhotoWeightResult> {
    if (typeof createImageBitmap !== 'function') {
      return failure('invalid-image', 'Este navegador não permite processar a foto localmente.');
    }
    let bitmap: ImageBitmap | null = null;
    try {
      bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
      const artifact = await getArtifact();
      const { ort, detector, features } = await getSessions();

      const detTensor = new ort.Tensor('float32', detectorInput(bitmap, rotation), [1, 3, DETECTOR_SIZE, DETECTOR_SIZE]);
      const detOut = await detector.run({ images: detTensor });
      const det = detOut.output0;
      if (!det || !det.data) {
        return failure('processing-failed', 'O modelo de presença não retornou resultado. Nenhum peso foi exibido.');
      }
      const cow = hasCow(det as { dims: readonly number[]; data: Float32Array | Int32Array | Uint8Array }, artifact.detector.confidenceThreshold, artifact.detector.classId);
      if (!cow) {
        return failure(
          'no-bovine-detected',
          'Nenhum bovino identificável foi encontrado nesta foto. Nenhum peso foi estimado.',
          ['A foto precisa mostrar um bovino suficientemente visível; tente outra imagem lateral.'],
        );
      }

      const featTensor = new ort.Tensor('float32', featureInput(bitmap, rotation), [1, 3, FEATURE_SIZE, FEATURE_SIZE]);
      const featOut = await features.run({ input: featTensor });
      const embedding = featOut.features?.data as ArrayLike<number> | undefined;
      if (!embedding || embedding.length !== artifact.backbone.embeddingSize) {
        return failure('processing-failed', 'O extrator de características não retornou o vetor esperado. Nenhum peso foi exibido.');
      }
      const weight = predictRidge(embedding, artifact.regression);
      if (!Number.isFinite(weight) || weight < minimum || weight > maximum) {
        return failure(
          'out-of-domain',
          'O resultado ficou fora da faixa plausível do experimento. Nenhum peso foi exibido.',
          [`Faixa aceita: ${minimum}–${maximum} kg.`],
        );
      }
      return { ok: true, weightKg: weight };
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (message.includes('HTTP') || message.includes('artefato') || message.includes('modelo')) {
        return failure('model-unavailable', 'O modelo experimental não pôde ser carregado. Nenhum peso foi exibido.', [message]);
      }
      return failure('processing-failed', 'O processamento local da foto falhou. Nenhum peso foi exibido.');
    } finally {
      if (bitmap && typeof ImageBitmap !== 'undefined' && bitmap instanceof ImageBitmap) bitmap.close();
    }
  }

  return { predict, getArtifact };
}
