import { parseCsv, serializeCsv } from './csv';
import {
  MODEL_FEATURE_NAMES,
  type ExperimentalDatasetRecord,
  type ModelFeatureName,
} from './types';

export const DATASET_METADATA_COLUMNS = [
  'record_id',
  'animal_id',
  'farm_id',
  'split',
  'live_weight_kg',
  'weight_unit',
  'weighed_at',
  'weight_source',
  'consent_reference',
  'license',
] as const;

export const FEATURE_COLUMN_PREFIX = 'feature_';

export type DatasetErrorCode =
  | 'empty'
  | 'missing-column'
  | 'duplicate-column'
  | 'row-length'
  | 'invalid-value'
  | 'duplicate-record'
  | 'unknown-feature';

export class DatasetError extends Error {
  constructor(
    public readonly code: DatasetErrorCode,
    message: string,
    public readonly row?: number,
  ) {
    super(message);
    this.name = 'DatasetError';
  }
}

export interface ParsedFeatureDataset {
  records: ExperimentalDatasetRecord[];
  featureNames: ModelFeatureName[];
}

function parseWeight(value: string, row: number): number {
  const weight = Number(value);
  if (!Number.isFinite(weight) || weight < 50 || weight > 2000) {
    throw new DatasetError(
      'invalid-value',
      'live_weight_kg deve estar entre 50 e 2.000 kg.',
      row,
    );
  }
  return weight;
}

/**
 * Lê o CSV de características usado no treino.
 *
 * Ele é derivado das fotos pelo pipeline local, mas não contém imagens.
 * O CSV bruto de coleta (com caminhos de imagem e escala) é separado e nunca
 * deve ser versionado sem consentimento e licença.
 */
export function parseFeatureDatasetCsv(text: string): ParsedFeatureDataset {
  const rows = parseCsv(text);
  if (rows.length === 0) {
    throw new DatasetError('empty', 'CSV vazio.');
  }

  const rawHeader = rows[0] ?? [];
  const header = rawHeader.map((value) => value.trim());
  const headerIndex = new Map<string, number>();
  header.forEach((name, index) => {
    if (name === '') return;
    if (headerIndex.has(name)) {
      throw new DatasetError('duplicate-column', `Coluna duplicada: ${name}.`);
    }
    headerIndex.set(name, index);
  });

  for (const column of DATASET_METADATA_COLUMNS) {
    if (!headerIndex.has(column)) {
      throw new DatasetError('missing-column', `Coluna obrigatória ausente: ${column}.`);
    }
  }

  const featureNames: ModelFeatureName[] = [];
  for (const name of header) {
    if (!name.startsWith(FEATURE_COLUMN_PREFIX)) continue;
    const feature = name.slice(FEATURE_COLUMN_PREFIX.length) as ModelFeatureName;
    if (!MODEL_FEATURE_NAMES.includes(feature)) {
      throw new DatasetError('unknown-feature', `Característica desconhecida: ${feature}.`);
    }
    featureNames.push(feature);
  }
  if (featureNames.length === 0) {
    throw new DatasetError(
      'missing-column',
      'Nenhuma coluna feature_* foi encontrada.',
    );
  }
  for (const feature of MODEL_FEATURE_NAMES) {
    if (!featureNames.includes(feature)) {
      throw new DatasetError(
        'missing-column',
        `Coluna obrigatória ausente: feature_${feature}.`,
      );
    }
  }

  const records: ExperimentalDatasetRecord[] = [];
  const recordIds = new Set<string>();

  for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex] ?? [];
    if (row.length !== header.length) {
      throw new DatasetError(
        'row-length',
        `A linha ${rowIndex + 1} tem ${row.length} campos; esperado ${header.length}.`,
        rowIndex + 1,
      );
    }

    const value = (column: string): string => {
      const index = headerIndex.get(column);
      return index === undefined ? '' : (row[index] ?? '').trim();
    };

    const recordId = value('record_id');
    if (!recordId || recordIds.has(recordId)) {
      throw new DatasetError(
        'duplicate-record',
        'record_id vazio ou duplicado.',
        rowIndex + 1,
      );
    }
    recordIds.add(recordId);

    const animalId = value('animal_id');
    const farmId = value('farm_id');
    if (!animalId || !farmId) {
      throw new DatasetError(
        'invalid-value',
        'animal_id e farm_id são obrigatórios.',
        rowIndex + 1,
      );
    }

    const split = value('split').toLowerCase();
    if (split !== 'train' && split !== 'validation' && split !== 'test') {
      throw new DatasetError(
        'invalid-value',
        'split deve ser train, validation ou test.',
        rowIndex + 1,
      );
    }

    const weightUnit = value('weight_unit').toLowerCase();
    if (weightUnit !== 'kg') {
      throw new DatasetError(
        'invalid-value',
        'weight_unit deve ser kg.',
        rowIndex + 1,
      );
    }

    const weighedAt = value('weighed_at');
    if (!weighedAt || Number.isNaN(Date.parse(weighedAt))) {
      throw new DatasetError(
        'invalid-value',
        'weighed_at deve ser uma data válida.',
        rowIndex + 1,
      );
    }

    const weightSource = value('weight_source');
    const consentReference = value('consent_reference');
    const license = value('license');
    if (!weightSource || !consentReference || !license) {
      throw new DatasetError(
        'invalid-value',
        'weight_source, consent_reference e license são obrigatórios.',
        rowIndex + 1,
      );
    }

    const features = {} as Record<ModelFeatureName, number>;
    for (const feature of featureNames) {
      const raw = value(`${FEATURE_COLUMN_PREFIX}${feature}`);
      const numeric = Number(raw);
      if (raw === '' || !Number.isFinite(numeric)) {
        throw new DatasetError(
          'invalid-value',
          `feature_${feature} inválida.`,
          rowIndex + 1,
        );
      }
      features[feature] = numeric;
    }

    records.push({
      recordId,
      animalId,
      farmId,
      split,
      liveWeightKg: parseWeight(value('live_weight_kg'), rowIndex + 1),
      weightUnit: 'kg',
      weighedAt,
      weightSource,
      consentReference,
      license,
      features,
    });
  }

  if (records.length === 0) {
    throw new DatasetError('empty', 'CSV sem registros de dados.');
  }

  return { records, featureNames };
}

export function serializeFeatureDatasetCsv(
  records: ExperimentalDatasetRecord[],
  featureNames: readonly ModelFeatureName[] = MODEL_FEATURE_NAMES,
): string {
  const header = [
    ...DATASET_METADATA_COLUMNS,
    ...featureNames.map((feature) => `${FEATURE_COLUMN_PREFIX}${feature}`),
  ];
  const rows = records.map((record) => [
    record.recordId,
    record.animalId,
    record.farmId,
    record.split,
    String(record.liveWeightKg),
    record.weightUnit,
    record.weighedAt,
    record.weightSource,
    record.consentReference,
    record.license,
    ...featureNames.map((feature) => String(record.features[feature])),
  ]);
  return serializeCsv([header, ...rows]);
}

/** Impressão digital determinística e não criptográfica para rastrear o CSV de treino. */
export function datasetFingerprint(records: ExperimentalDatasetRecord[]): string {
  const canonical = [...records]
    .sort((a, b) => a.recordId.localeCompare(b.recordId))
    .map((record) =>
      [
        record.recordId,
        record.animalId,
        record.farmId,
        record.split,
        record.liveWeightKg,
        record.weightUnit,
        record.weighedAt,
        ...MODEL_FEATURE_NAMES.map((feature) => record.features[feature]),
      ].join('|'),
    )
    .join('\n');

  let hash = 0x811c9dc5;
  for (let i = 0; i < canonical.length; i += 1) {
    hash ^= canonical.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, '0')}`;
}
