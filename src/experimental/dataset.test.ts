import { describe, expect, it } from 'vitest';
import {
  DatasetError,
  datasetFingerprint,
  parseFeatureDatasetCsv,
  serializeFeatureDatasetCsv,
} from './dataset';
import { generateSyntheticDataset } from './synthetic';

const records = generateSyntheticDataset(7, 3);
const csv = serializeFeatureDatasetCsv(records);

function mutateRow(
  text: string,
  rowIndex: number,
  column: string,
  value: string,
): string {
  const rows = text.trimEnd().split('\n');
  const header = rows[0]?.split(',') ?? [];
  const index = header.indexOf(column);
  if (index < 0) throw new Error(`coluna ${column} não encontrada`);
  const fields = rows[rowIndex]?.split(',') ?? [];
  fields[index] = value;
  rows[rowIndex] = fields.join(',');
  return `${rows.join('\n')}\n`;
}

function removeColumn(text: string, column: string): string {
  const rows = text.trimEnd().split('\n');
  const header = rows[0]?.split(',') ?? [];
  const index = header.indexOf(column);
  if (index < 0) throw new Error(`coluna ${column} não encontrada`);
  return `${rows
    .map((row) => {
      const fields = row.split(',');
      fields.splice(index, 1);
      return fields.join(',');
    })
    .join('\n')}\n`;
}

describe('dataset experimental em CSV', () => {
  it('faz round-trip de registros e características', () => {
    const parsed = parseFeatureDatasetCsv(csv);
    expect(parsed.records).toHaveLength(9);
    expect(parsed.featureNames).toContain('body_length_cm');
    expect(parsed.records[0]?.weightUnit).toBe('kg');
    expect(parsed.records[0]?.features.body_length_cm).toBeGreaterThan(0);
    expect(serializeFeatureDatasetCsv(parsed.records, parsed.featureNames)).toContain(
      'record_id',
    );
  });

  it('aceita BOM e CRLF', () => {
    const parsed = parseFeatureDatasetCsv(`\uFEFF${csv.replace(/\n/g, '\r\n')}`);
    expect(parsed.records).toHaveLength(9);
  });

  it('rejeita CSV vazio, coluna ausente e característica desconhecida', () => {
    expect(() => parseFeatureDatasetCsv('')).toThrow(DatasetError);
    const withoutFeature = removeColumn(csv, 'feature_symmetry');
    expect(() => parseFeatureDatasetCsv(withoutFeature)).toThrow(/obrigatória/);

    const unknown = csv.replace('feature_fill_ratio', 'feature_invented');
    expect(() => parseFeatureDatasetCsv(unknown)).toThrow(/desconhecida/);
  });

  it('rejeita peso, unidade, consentimento e data inválidos', () => {
    expect(() => parseFeatureDatasetCsv(mutateRow(csv, 1, 'live_weight_kg', '0'))).toThrow(
      /50 e 2.000/,
    );
    expect(() =>
      parseFeatureDatasetCsv(mutateRow(csv, 1, 'weight_unit', 'lb')),
    ).toThrow(/kg/);
    expect(() =>
      parseFeatureDatasetCsv(mutateRow(csv, 1, 'consent_reference', '')),
    ).toThrow(/consent_reference/);
    expect(() =>
      parseFeatureDatasetCsv(mutateRow(csv, 1, 'weighed_at', 'ontem')),
    ).toThrow(/data válida/);
    expect(() =>
      parseFeatureDatasetCsv(mutateRow(csv, 1, 'feature_body_length_cm', 'abc')),
    ).toThrow(/body_length_cm/);
  });

  it('rejeita registros duplicados e linhas incompletas', () => {
    const duplicated = mutateRow(
      csv,
      2,
      'record_id',
      records[0]?.recordId ?? '',
    );
    expect(() => parseFeatureDatasetCsv(duplicated)).toThrow(/duplicado/);
    const broken = `${csv.trimEnd()},\n`;
    expect(() => parseFeatureDatasetCsv(broken)).toThrow(/campos/);
  });

  it('gera impressão digital determinística', () => {
    expect(datasetFingerprint(records)).toBe(datasetFingerprint([...records].reverse()));
    expect(datasetFingerprint(records)).toMatch(/^fnv1a32:[0-9a-f]{8}$/);
  });
});
