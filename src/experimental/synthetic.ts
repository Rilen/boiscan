import { MODEL_FEATURE_NAMES, type ExperimentalDatasetRecord } from './types';

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function normal(random: () => number): number {
  const u = Math.max(Number.EPSILON, random());
  const v = Math.max(Number.EPSILON, random());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Dataset SINTÉTICO para exercitar o pipeline e o treinador.
 *
 * Os "animais" não existem e os pesos seguem uma relação inventada. O artefato
 * resultante é marcado como sintético e nunca deve ser usado como estimativa.
 * A separação por propriedade é mantida para testar a prevenção de vazamento.
 */
export function generateSyntheticDataset(
  seed = 42,
  animalsPerFarm = 24,
): ExperimentalDatasetRecord[] {
  const random = mulberry32(seed);
  const farms = [
    { farmId: 'synthetic-farm-a', split: 'train' as const },
    { farmId: 'synthetic-farm-b', split: 'validation' as const },
    { farmId: 'synthetic-farm-c', split: 'test' as const },
  ];
  const records: ExperimentalDatasetRecord[] = [];

  for (const farm of farms) {
    for (let index = 0; index < animalsPerFarm; index += 1) {
      const latent = normal(random);
      const weight = clamp(440 + 95 * latent + normal(random) * 28, 240, 880);
      const bodyLength = clamp(
        120 + weight * 0.13 + normal(random) * 5,
        120,
        240,
      );
      const bodyHeight = clamp(98 + weight * 0.085 + normal(random) * 4, 100, 190);
      const maxWidth = clamp(25 + weight * 0.058 + normal(random) * 3, 25, 90);
      const maskArea = clamp(
        bodyLength * bodyHeight * (0.55 + normal(random) * 0.03),
        5000,
        25000,
      );
      const majorAxis = bodyLength * (1.02 + normal(random) * 0.01);
      const minorAxis = bodyHeight * (1.03 + normal(random) * 0.01);

      records.push({
        recordId: `${farm.farmId}-${String(index + 1).padStart(3, '0')}`,
        animalId: `animal-${farm.farmId}-${String(index + 1).padStart(3, '0')}`,
        farmId: farm.farmId,
        split: farm.split,
        liveWeightKg: Math.round(weight * 10) / 10,
        weightUnit: 'kg',
        weighedAt: '2026-01-15',
        weightSource: 'synthetic-demo',
        consentReference: 'synthetic-demo',
        license: 'CC0-1.0',
        features: {
          body_length_cm: bodyLength,
          body_height_cm: bodyHeight,
          max_width_cm: maxWidth,
          mask_area_cm2: maskArea,
          major_axis_cm: majorAxis,
          minor_axis_cm: minorAxis,
          axis_ratio: majorAxis / minorAxis,
          fill_ratio: clamp(0.58 + normal(random) * 0.04, 0.4, 0.8),
          compactness: clamp(0.36 + normal(random) * 0.03, 0.2, 0.6),
          symmetry: clamp(0.66 + normal(random) * 0.05, 0.4, 0.9),
        },
      });
    }
  }

  // Garante compatibilidade com o contrato de features padrão.
  for (const record of records) {
    for (const feature of MODEL_FEATURE_NAMES) {
      if (!Number.isFinite(record.features[feature])) {
        throw new Error('Gerador sintético produziu característica inválida.');
      }
    }
  }

  return records;
}
