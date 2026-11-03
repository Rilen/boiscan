import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DEFAULT_DRESSING_PERCENT,
  isValidDressingPercent,
  parseDecimalInput,
} from '../domain/arroba';
import { canAnalyzeQuality, type ImageQuality } from '../domain/imageQuality';
import { validateImageFile } from '../domain/imageValidation';
import type { EstimationResult, WeightEstimationEngine } from '../engine/types';
import {
  ImageDecodeError,
  analyzeImageQuality,
  loadImageFile,
  releaseLoadedImage,
  type LoadedImage,
} from '../lib/image';

export type FlowPhase = 'home' | 'review' | 'analyzing' | 'result';
export type Rotation = 0 | 90 | 180 | 270;

const DRESSING_STORAGE_KEY = 'boiscan.dressingPercent';
const LEGACY_DRESSING_STORAGE_KEY = 'arroba.dressingPercent';

function readStoredDressing(): number {
  try {
    const stored = globalThis.localStorage?.getItem(DRESSING_STORAGE_KEY);
    const raw = stored ?? globalThis.localStorage?.getItem(LEGACY_DRESSING_STORAGE_KEY);
    if (!raw) return DEFAULT_DRESSING_PERCENT;

    const parsed = parseDecimalInput(raw);
    if (parsed === null || !isValidDressingPercent(parsed)) {
      return DEFAULT_DRESSING_PERCENT;
    }

    if (!stored) {
      globalThis.localStorage?.setItem(DRESSING_STORAGE_KEY, String(parsed));
      globalThis.localStorage?.removeItem(LEGACY_DRESSING_STORAGE_KEY);
    }

    return parsed;
  } catch {
    return DEFAULT_DRESSING_PERCENT;
  }
}

function persistDressing(value: number): void {
  try {
    globalThis.localStorage?.setItem(DRESSING_STORAGE_KEY, String(value));
  } catch {
    // Preferência é opcional; falha de armazenamento não interrompe o fluxo.
  }
}

export interface BoiScanFlow {
  phase: FlowPhase;
  image: LoadedImage | null;
  imageLoading: boolean;
  quality: ImageQuality | null;
  qualityChecking: boolean;
  rotation: Rotation;
  estimate: EstimationResult | null;
  error: string | null;
  dressingPercent: number;
  canAnalyze: boolean;
  chooseFile: (file: File) => Promise<void>;
  removeImage: () => void;
  rotate: () => void;
  analyze: () => Promise<void>;
  cancelAnalysis: () => void;
  reset: () => void;
  dismissError: () => void;
  setDressingPercent: (value: number) => boolean;
}

export function useBoiScanFlow(engine: WeightEstimationEngine): BoiScanFlow {
  const [phase, setPhase] = useState<FlowPhase>('home');
  const [image, setImage] = useState<LoadedImage | null>(null);
  const [imageLoading, setImageLoading] = useState(false);
  const [quality, setQuality] = useState<ImageQuality | null>(null);
  const [qualityChecking, setQualityChecking] = useState(false);
  const [rotation, setRotation] = useState<Rotation>(0);
  const [estimate, setEstimate] = useState<EstimationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dressingPercent, setDressingState] = useState<number>(readStoredDressing);

  const runIdRef = useRef(0);
  const imageRef = useRef<LoadedImage | null>(null);
  const qualityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  imageRef.current = image;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      runIdRef.current += 1;
      if (qualityTimerRef.current !== null) {
        clearTimeout(qualityTimerRef.current);
      }
      releaseLoadedImage(imageRef.current);
    };
  }, []);

  const chooseFile = useCallback(async (file: File): Promise<void> => {
    const validation = validateImageFile(file);
    if (!validation.ok) {
      setError(validation.message);
      return;
    }

    const runId = runIdRef.current + 1;
    runIdRef.current = runId;
    setImageLoading(true);
    setError(null);

    let loaded: LoadedImage;
    try {
      loaded = await loadImageFile(file);
    } catch (loadError) {
      if (!mountedRef.current || runId !== runIdRef.current) return;
      setImageLoading(false);
      setError(
        loadError instanceof ImageDecodeError
          ? loadError.message
          : 'Não foi possível ler esta imagem. Tente outra foto.',
      );
      return;
    }

    if (!mountedRef.current || runId !== runIdRef.current) {
      releaseLoadedImage(loaded);
      return;
    }

    const previous = imageRef.current;
    imageRef.current = loaded;
    releaseLoadedImage(previous);
    setImage(loaded);
    setRotation(0);
    setEstimate(null);
    setImageLoading(false);
    setPhase('review');
    setQuality(null);
    setQualityChecking(true);

    if (qualityTimerRef.current !== null) {
      clearTimeout(qualityTimerRef.current);
    }

    qualityTimerRef.current = setTimeout(() => {
      if (!mountedRef.current || runId !== runIdRef.current) return;
      const result = analyzeImageQuality(loaded.source, 0);
      setQuality(result);
      setQualityChecking(false);
    }, 0);
  }, []);

  const removeImage = useCallback(() => {
    runIdRef.current += 1;
    if (qualityTimerRef.current !== null) {
      clearTimeout(qualityTimerRef.current);
      qualityTimerRef.current = null;
    }
    releaseLoadedImage(imageRef.current);
    imageRef.current = null;
    setImage(null);
    setPhase('home');
    setQuality(null);
    setQualityChecking(false);
    setImageLoading(false);
    setEstimate(null);
    setRotation(0);
    setError(null);
  }, []);

  const rotate = useCallback(() => {
    setRotation((current) => ((current + 90) % 360) as Rotation);
  }, []);

  const analyze = useCallback(async (): Promise<void> => {
    if (!image || !quality || qualityChecking) return;
    if (!canAnalyzeQuality(quality)) {
      setError('A foto não atende aos requisitos mínimos. Escolha outra imagem.');
      return;
    }

    const runId = runIdRef.current + 1;
    runIdRef.current = runId;
    setPhase('analyzing');
    setError(null);
    setEstimate(null);

    try {
      const result = await engine.estimate({
        image: image.file,
        fileName: image.file.name || 'foto.jpg',
        width: image.width,
        height: image.height,
        rotation,
        quality,
        dressingPercent,
      });

      if (!mountedRef.current || runId !== runIdRef.current) return;

      if (result.status === 'error') {
        setEstimate(null);
        setPhase('review');
        setError(result.message);
        return;
      }

      setEstimate(result);
      setPhase('result');
    } catch {
      if (!mountedRef.current || runId !== runIdRef.current) return;
      setEstimate(null);
      setPhase('review');
      setError('Ocorreu um erro inesperado durante a análise. Tente novamente.');
    }
  }, [dressingPercent, engine, image, quality, qualityChecking, rotation]);

  const cancelAnalysis = useCallback(() => {
    runIdRef.current += 1;
    setPhase('review');
    setEstimate(null);
  }, []);

  const reset = useCallback(() => {
    runIdRef.current += 1;
    if (qualityTimerRef.current !== null) {
      clearTimeout(qualityTimerRef.current);
      qualityTimerRef.current = null;
    }
    releaseLoadedImage(imageRef.current);
    imageRef.current = null;
    setImage(null);
    setPhase('home');
    setQuality(null);
    setQualityChecking(false);
    setImageLoading(false);
    setEstimate(null);
    setRotation(0);
    setError(null);
  }, []);

  const dismissError = useCallback(() => setError(null), []);

  const setDressingPercent = useCallback((value: number): boolean => {
    if (!isValidDressingPercent(value)) return false;
    setDressingState(value);
    persistDressing(value);
    return true;
  }, []);

  const canAnalyze = useMemo(() => {
    if (!image || !quality || qualityChecking || imageLoading) return false;
    return canAnalyzeQuality(quality);
  }, [image, quality, qualityChecking, imageLoading]);

  return {
    phase,
    image,
    imageLoading,
    quality,
    qualityChecking,
    rotation,
    estimate,
    error,
    dressingPercent,
    canAnalyze,
    chooseFile,
    removeImage,
    rotate,
    analyze,
    cancelAnalysis,
    reset,
    dismissError,
    setDressingPercent,
  };
}
