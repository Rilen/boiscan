import { describe, expect, it } from 'vitest';
import {
  buildCollectionSample,
  decodeMaskRle,
  encodeMaskRle,
  evaluateSample,
  lengthToCentimeters,
  MASK_RLE_ENCODING,
  type SampleInput,
} from './collection';
import { MaskError } from './mask';
import { extractMorphometrics } from './morphometrics';
import type { BinaryMask } from './types';

const NOW = '2026-11-03T12:00:00.000Z';

function rectangleMask(width = 100, height = 80): BinaryMask {
  const data = new Uint8Array(width * height);
  for (let y = 20; y <= 60; y += 1) {
    for (let x = 20; x <= 80; x += 1) {
      data[y * width + x] = 1;
    }
  }
  return { width, height, data };
}

function sampleInput(overrides: Partial<SampleInput> = {}): SampleInput {
  const mask = rectangleMask();
  const features = extractMorphometrics(mask, mask.width, mask.height);
  return {
    sampleId: 'S-2026-11-03-001',
    animalId: 'ANIMAL-001',
    image: {
      name: 'animal-001.jpg',
      sha256: 'a'.repeat(64),
      originalWidth: 200,
      originalHeight: 160,
      analysisWidth: mask.width,
      analysisHeight: mask.height,
    },
    mask,
    features,
    maskOrigin: 'hybrid',
    corrections: {
      brushStrokes: 2,
      editedPixels: 120,
      cleared: false,
      roi: { x: 0, y: 0, width: 1, height: 1 },
    },
    segmentationWarnings: [],
    reference: {
      knownLength: 50,
      unit: 'cm',
      start: { x: 0.1, y: 0.5 },
      end: { x: 0.6, y: 0.5 },
      samePlaneAsAnimal: true,
      uncertaintyCm: 0.2,
    },
    weightKg: 450,
    weighedAt: '2026-11-01',
    weightSource: 'balança digital',
    qualityWarnings: [],
    now: NOW,
    ...overrides,
  };
}

describe('unidades da referência física', () => {
  it('converte mm, cm e m para centímetros', () => {
    expect(lengthToCentimeters(1000, 'mm')).toBeCloseTo(100, 8);
    expect(lengthToCentimeters(100, 'cm')).toBeCloseTo(100, 8);
    expect(lengthToCentimeters(1, 'm')).toBeCloseTo(100, 8);
  });

  it('rejeita valores não positivos e não finitos', () => {
    expect(lengthToCentimeters(0, 'cm')).toBeNull();
    expect(lengthToCentimeters(-5, 'cm')).toBeNull();
    expect(lengthToCentimeters(Number.NaN, 'cm')).toBeNull();
  });
});

describe('máscara RLE', () => {
  it('codifica e decodifica a máscara sem perda', () => {
    const mask = rectangleMask(13, 7);
    const encoded = encodeMaskRle(mask);
    expect(encoded.encoding).toBe(MASK_RLE_ENCODING);
    expect(encoded.foregroundPixels).toBe(
      mask.data.reduce((sum, value) => sum + (value ? 1 : 0), 0),
    );
    const decoded = decodeMaskRle(encoded);
    expect(decoded.width).toBe(mask.width);
    expect(decoded.height).toBe(mask.height);
    expect([...decoded.data]).toEqual([...mask.data]);
  });

  it('rejeita sequência RLE que não cobre a máscara', () => {
    expect(() =>
      decodeMaskRle({
        encoding: MASK_RLE_ENCODING,
        width: 4,
        height: 2,
        runs: [3],
        foregroundPixels: 0,
      }),
    ).toThrow(MaskError);
  });
});

describe('elegibilidade da amostra de coleta', () => {
  it('aceita amostra completa com escala confiável e peso positivo', () => {
    const sample = buildCollectionSample(sampleInput());
    expect(sample.status).toBe('eligible');
    expect(sample.eligibility.eligible).toBe(true);
    expect(sample.eligibility.issues).toEqual([]);
    expect(sample.schemaVersion).toBe('boiscan.collection-sample/1');
    expect(sample.mask?.origin).toBe('hybrid');
    expect(sample.mask?.corrections.brushStrokes).toBe(2);
    expect(sample.reference?.unit).toBe('cm');
    expect(sample.reference?.reliable).toBe(true);
    expect(sample.features.units.physicalLength).toBe('cm');
    expect(sample.features.physical?.cmPerPixel).toBeCloseTo(1, 8);
    expect(sample.weight.liveWeightKg).toBe(450);
    expect(sample.limitations.length).toBeGreaterThan(0);
  });

  it('converte referência em milímetros antes da calibração', () => {
    const sample = buildCollectionSample(
      sampleInput({
        reference: {
          knownLength: 500,
          unit: 'mm',
          start: { x: 0.1, y: 0.5 },
          end: { x: 0.6, y: 0.5 },
          samePlaneAsAnimal: true,
          uncertaintyCm: 0.2,
        },
      }),
    );
    expect(sample.status).toBe('eligible');
    expect(sample.reference?.knownLengthCm).toBeCloseTo(50, 8);
    expect(sample.reference?.cmPerPixel).toBeCloseTo(1, 8);
  });

  it('mantém amostra incompleta como rascunho e lista os motivos', () => {
    const sample = buildCollectionSample(
      sampleInput({ weightKg: null, weighedAt: null, reference: null }),
    );
    expect(sample.status).toBe('draft');
    expect(sample.eligibility.eligible).toBe(false);
    const codes = sample.eligibility.issues.map((issue) => issue.code);
    expect(codes).toContain('weight-missing');
    expect(codes).toContain('weighed-at-missing');
    expect(codes).toContain('scale-missing');
    expect(sample.features.physical).toBeNull();
    expect(sample.features.units.physicalLength).toBeNull();
  });

  it('rejeita máscara vazia sem gerar medidas físicas', () => {
    const mask: BinaryMask = {
      width: 100,
      height: 80,
      data: new Uint8Array(100 * 80),
    };
    const sample = buildCollectionSample(sampleInput({ mask, features: null }));
    expect(sample.status).toBe('draft');
    expect(sample.eligibility.issues.map((issue) => issue.code)).toContain(
      'mask-empty',
    );
    expect(sample.mask?.foregroundPixels).toBe(0);
    expect(sample.features.pixels).toBeNull();
    expect(sample.features.physical).toBeNull();
  });

  it('rejeita máscara com buffer incompatível', () => {
    const mask: BinaryMask = { width: 100, height: 80, data: new Uint8Array(10) };
    const sample = buildCollectionSample(sampleInput({ mask }));
    expect(sample.mask).toBeNull();
    expect(sample.eligibility.issues.map((issue) => issue.code)).toContain(
      'mask-dimensions',
    );
  });

  it('rejeita máscara cujas dimensões diferem da imagem analisada', () => {
    const mask = rectangleMask(50, 40);
    const sample = buildCollectionSample(
      sampleInput({
        mask,
        features: extractMorphometrics(mask, 50, 40),
      }),
    );
    expect(sample.status).toBe('draft');
    expect(sample.eligibility.issues.map((issue) => issue.code)).toContain(
      'mask-dimensions',
    );
  });

  it('rejeita máscara não vazia sem características extraídas', () => {
    const sample = buildCollectionSample(sampleInput({ features: null }));
    expect(sample.status).toBe('draft');
    expect(sample.eligibility.issues.map((issue) => issue.code)).toContain(
      'features-missing',
    );
    expect(sample.features.pixels).toBeNull();
  });

  it('rejeita características que não correspondem à máscara final', () => {
    const otherMask = rectangleMask(50, 40);
    const sample = buildCollectionSample(
      sampleInput({ features: extractMorphometrics(otherMask, 50, 40) }),
    );
    expect(sample.status).toBe('draft');
    expect(sample.eligibility.issues.map((issue) => issue.code)).toContain(
      'features-inconsistent',
    );
    expect(sample.features.physical).toBeNull();
  });

  it('rejeita escala degenerada', () => {
    const sample = buildCollectionSample(
      sampleInput({
        reference: {
          knownLength: 50,
          unit: 'cm',
          start: { x: 0.4, y: 0.4 },
          end: { x: 0.4, y: 0.4 },
          samePlaneAsAnimal: true,
        },
      }),
    );
    expect(sample.status).toBe('draft');
    expect(sample.eligibility.issues.map((issue) => issue.code)).toContain(
      'scale-invalid',
    );
    expect(sample.features.physical).toBeNull();
  });

  it('rejeita referência fora do plano do animal', () => {
    const sample = buildCollectionSample(
      sampleInput({
        reference: {
          knownLength: 50,
          unit: 'cm',
          start: { x: 0.1, y: 0.5 },
          end: { x: 0.6, y: 0.5 },
          samePlaneAsAnimal: false,
        },
      }),
    );
    expect(sample.eligibility.issues.map((issue) => issue.code)).toContain(
      'scale-invalid',
    );
  });

  it('rejeita escala com incerteza relativa acima de 10%', () => {
    const sample = buildCollectionSample(
      sampleInput({
        image: {
          name: 'animal-001.jpg',
          sha256: null,
          originalWidth: 400,
          originalHeight: 320,
          analysisWidth: 200,
          analysisHeight: 160,
        },
        mask: rectangleMask(200, 160),
        features: extractMorphometrics(rectangleMask(200, 160), 200, 160),
        reference: {
          knownLength: 5,
          unit: 'cm',
          start: { x: 0.1, y: 0.5 },
          end: { x: 0.16, y: 0.5 },
          samePlaneAsAnimal: true,
          uncertaintyCm: 0.5,
        },
      }),
    );
    expect(sample.status).toBe('draft');
    expect(sample.eligibility.issues.map((issue) => issue.code)).toContain(
      'scale-unreliable',
    );
    expect(sample.features.physical).toBeNull();
  });

  it('rejeita peso não positivo e data futura', () => {
    const sample = buildCollectionSample(
      sampleInput({ weightKg: 0, weighedAt: '2027-01-01' }),
    );
    const codes = sample.eligibility.issues.map((issue) => issue.code);
    expect(codes).toContain('weight-invalid');
    expect(codes).toContain('weighed-at-invalid');
  });

  it('rejeita identificadores com caracteres pessoais ou inválidos', () => {
    const sample = buildCollectionSample(
      sampleInput({ sampleId: '', animalId: 'joao@example.com' }),
    );
    const codes = sample.eligibility.issues.map((issue) => issue.code);
    expect(codes).toContain('sample-id-invalid');
    expect(codes).toContain('animal-id-invalid');
  });

  it('expõe apenas problemas, sem peso estimado ou confiança', () => {
    const sample = buildCollectionSample(sampleInput({ reference: null }));
    const serialized = JSON.stringify(sample);
    expect(serialized).not.toMatch(/predicted|confidence|estimatedWeight/i);
    expect(sample.features.physical).toBeNull();
  });
});

describe('evaluateSample', () => {
  it('não altera o resultado ao ser chamada isoladamente', () => {
    const input = sampleInput();
    const direct = evaluateSample(input);
    const built = buildCollectionSample(input).eligibility;
    expect(direct).toEqual(built);
  });
});
