import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parseFeatureDatasetCsv } from '../../src/experimental/dataset';
import { validateModelArtifact } from '../../src/experimental/model';
import { trainBaseline } from '../../src/experimental/training';

interface Arguments {
  input?: string;
  output?: string;
  synthetic: boolean;
  modelId?: string;
  modelVersion?: string;
}

function parseArguments(argv: string[]): Arguments {
  const args: Arguments = { synthetic: false };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (flag === '--input' && value) {
      args.input = value;
      i += 1;
    } else if (flag === '--output' && value) {
      args.output = value;
      i += 1;
    } else if (flag === '--model-id' && value) {
      args.modelId = value;
      i += 1;
    } else if (flag === '--model-version' && value) {
      args.modelVersion = value;
      i += 1;
    } else if (flag === '--synthetic') {
      args.synthetic = true;
    } else if (flag === '--help' || flag === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Argumento desconhecido: ${String(flag)}`);
    }
  }
  return args;
}

function printHelp(): void {
  console.log(`Uso:
  npm run experimental:train -- --input <features.csv> --output <model.json> [opções]

Opções:
  --synthetic             Marca explicitamente um dataset sintético de demonstração.
  --model-id <id>         Identificador do artefato.
  --model-version <ver>   Versão do artefato.

Sem --synthetic, o treinador exige >= 60 registros, >= 30 animais e >= 3
propriedades, com splits agrupados e sem vazamento animal/propriedade.
Nenhum peso real é inventado: o CSV precisa conter pesagens reais e licença.`);
}

function main(): void {
  const args = parseArguments(process.argv.slice(2));
  if (!args.input || !args.output) {
    printHelp();
    process.exit(2);
  }

  const inputPath = resolve(args.input);
  const outputPath = resolve(args.output);
  if (!existsSync(inputPath)) {
    throw new Error(`CSV não encontrado: ${inputPath}`);
  }
  if (/[\\/]public[\\/]/i.test(outputPath)) {
    throw new Error('O artefato experimental não pode ser gravado em public/.');
  }

  const csv = readFileSync(inputPath, 'utf8');
  const parsed = parseFeatureDatasetCsv(csv);
  const hash = createHash('sha256').update(csv).digest('hex');
  const result = trainBaseline(parsed.records, {
    synthetic: args.synthetic,
    featureNames: parsed.featureNames,
    modelId: args.modelId,
    modelVersion: args.modelVersion,
    datasetHash: `sha256:${hash}`,
  });
  const validation = validateModelArtifact(result.model);
  if (!validation.ok) {
    throw new Error(`Artefato gerado é inválido: ${validation.errors.join('; ')}`);
  }

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(result.model, null, 2)}\n`, 'utf8');
  const reportPath = outputPath.replace(/\.json$/i, '.report.json');
  writeFileSync(
    reportPath,
    `${JSON.stringify(
      {
        modelId: result.model.modelId,
        synthetic: result.model.synthetic,
        validated: result.model.validated,
        selectedLambda: result.selectedLambda,
        warnings: result.warnings,
        metrics: result.model.metrics,
      },
      null,
      2,
    )}\n`,
    'utf8',
  );

  console.log('Treinamento experimental concluído.');
  console.log(`Artefato: ${outputPath}`);
  console.log(`Relatório: ${reportPath}`);
  console.log(`Synthetic: ${result.model.synthetic}`);
  console.log(`Validated: ${result.model.validated}`);
  console.log(`Registros: ${parsed.records.length}`);
  console.log(`MAE validação: ${result.model.metrics.validation.maeKg.toFixed(2)} kg`);
  console.log(`MAE teste: ${result.model.metrics.test.maeKg.toFixed(2)} kg`);
  if (result.model.synthetic) {
    console.log('AVISO: artefato sintético. Não use como estimativa de peso real.');
  }
}

try {
  main();
} catch (error) {
  console.error(
    `Falha: ${error instanceof Error ? error.message : 'erro desconhecido'}`,
  );
  process.exit(1);
}
