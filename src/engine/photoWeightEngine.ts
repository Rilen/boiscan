import type { EstimationRequest, EstimationResult, WeightEstimationEngine } from './types';
import { createPhotoWeightPredictor, type PhotoWeightOptions } from '../experimental/photoWeight';

export const PHOTO_WEIGHT_MODEL_NAME = 'BoiScan — modelo fotográfico experimental';
export const PHOTO_WEIGHT_MODEL_VERSION = '2026-11-04-v1';
export const PHOTO_WEIGHT_DISCLAIMER = 'Modelo em teste, ainda sem validação de campo.';

/**
 * Experimental engine for the Mission 012 preview.
 *
 * It is activated only by `?experimental=weight` (or by an explicit engine prop
 * in tests). The public/default engine remains untouched.
 */
export function createPhotoWeightEngine(
  options: PhotoWeightOptions = {},
): WeightEstimationEngine {
  const predictor = createPhotoWeightPredictor(options);
  return {
    id: 'photo-weight-experimental',
    name: 'Modelo fotográfico experimental',
    version: PHOTO_WEIGHT_MODEL_VERSION,
    availability: 'experimental',
    async estimate(request: EstimationRequest): Promise<EstimationResult> {
      const result = await predictor.predict(request.image, request.rotation);
      if (!result.ok) {
        const reason =
          result.reason === 'no-bovine-detected'
            ? 'no-bovine-detected'
            : result.reason === 'model-unavailable'
              ? 'experimental-model-unavailable'
              : result.reason === 'out-of-domain'
                ? 'experimental-out-of-domain'
                : 'experimental-image-rejected';
        return {
          status: 'unavailable',
          reason,
          message: result.message,
          details: result.details,
        };
      }
      return {
        status: 'experimental',
        liveWeightKg: Math.round(result.weightKg * 10) / 10,
        model: {
          name: PHOTO_WEIGHT_MODEL_NAME,
          version: PHOTO_WEIGHT_MODEL_VERSION,
          validated: false,
        },
        analyzedAt: new Date().toISOString(),
        simulated: false,
        disclaimer: PHOTO_WEIGHT_DISCLAIMER,
      };
    },
  };
}
