import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  datasetFingerprint,
  serializeFeatureDatasetCsv,
} from '../../src/experimental/dataset';
import { generateSyntheticDataset } from '../../src/experimental/synthetic';
import { trainBaseline } from '../../src/experimental/training';

function main(): void {
  const outputDir = resolve('experimental-output');
  mkdirSync(outputDir, { recursive: true });
  const records = generateSyntheticDataset(42, 24);
  const csvPath = resolve(outputDir, 'synthetic-features.csv');
  const modelPath = resolve(outputDir, 'synthetic-model.json');
  writeFileSync(csvPath, serializeFeatureDatasetCsv(records), 'utf8');

  const result = trainBaseline(records, {
    synthetic: true,
    modelId: 'boiscan-synthetic-demo',
    modelVersion: 'demo-1',
    trainedAt: '2026-11-03T00:00:00.000Z',
    datasetHash: datasetFingerprint(records),
  });
  writeFileSync(modelPath, `${JSON.stringify(result.model, null, 2)}\n`, 'utf8');

  console.log('DEMONSTRAÇÃO SINTÉTICA — NÃO É UMA ESTIMATIVA DE PESO REAL');
  console.log(`Registros sintéticos: ${records.length}`);
  console.log(`CSV: ${csvPath}`);
  console.log(`Artefato: ${modelPath}`);
  console.log(`Lambda selecionado: ${result.selectedLambda}`);
  console.log(
    `MAE sintética de validação: ${result.model.metrics.validation.maeKg.toFixed(2)} kg`,
  );
  console.log(
    `MAE sintética de teste: ${result.model.metrics.test.maeKg.toFixed(2)} kg`,
  );
  console.log(
    `Cobertura do intervalo sintético: ${
      result.model.metrics.intervalCoveragePercent?.toFixed(1) ?? 'não gerado'
    }%`,
  );
  console.log('Este artefato não deve ser carregado no app público.');
}

main();
