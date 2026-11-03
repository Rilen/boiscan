import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MODEL_FEATURE_NAMES } from '../experimental/types';

function readText(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

describe('contrato de dados experimentais', () => {
  it('mantém template de coleta com escala, peso, consentimento e split', () => {
    const header = readText('data/templates/collection.template.csv').trim();
    for (const column of [
      'animal_id',
      'farm_id',
      'live_weight_kg',
      'weight_unit',
      'weighed_at',
      'weight_source',
      'scale_reference_type',
      'scale_known_length_cm',
      'scale_start_x',
      'scale_start_y',
      'scale_same_plane',
      'consent_reference',
      'license',
      'split',
    ]) {
      expect(header.split(',')).toContain(column);
    }
    expect(header.split(',')).toContain('image_path');
    expect(header.split(',')).toContain('mask_path');
  });

  it('template de features contém todas as características do modelo', () => {
    const header = readText('data/templates/features.template.csv').trim();
    for (const feature of MODEL_FEATURE_NAMES) {
      expect(header).toContain(`feature_${feature}`);
    }
    for (const column of [
      'record_id',
      'animal_id',
      'farm_id',
      'split',
      'live_weight_kg',
      'weight_unit',
      'consent_reference',
      'license',
    ]) {
      expect(header.split(',')).toContain(column);
    }
  });

  it('templates não contêm dados de animais reais', () => {
    const collection = readText('data/templates/collection.template.csv').trim();
    const features = readText('data/templates/features.template.csv').trim();
    expect(collection.split('\n')).toHaveLength(1);
    expect(features.split('\n')).toHaveLength(1);
    expect(collection).not.toMatch(/synthetic-farm|animal-\d/);
  });

  it('documenta privacidade, licença e separação por fazenda', () => {
    const readme = readText('data/README.md');
    expect(readme).toMatch(/consentimento/i);
    expect(readme).toMatch(/licença/i);
    expect(readme).toMatch(/propriedade/i);
    expect(readme).toMatch(/nunca/i);
    expect(readme).toMatch(/privacidade|pseudonim/i);
  });

  it('dados privados e artefatos não entram no Git', () => {
    const ignore = readText('.gitignore');
    for (const pattern of [
      'data/private/',
      'data/images/',
      'data/masks/',
      'data/features/',
      'experimental-output/',
    ]) {
      expect(ignore).toContain(pattern);
    }
  });

  it('pasta data contém apenas documentação e templates', () => {
    const top = readdirSync(resolve(process.cwd(), 'data')).sort();
    expect(top).toEqual(['README.md', 'templates']);
  });
});
