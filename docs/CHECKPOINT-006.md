# Checkpoint — Missão 006

**Estado:** `BOISCAN_006_COLLECTION_READY_WEIGHT_BLOCKED`
**Branch:** `feat/006-collection-flow`
**Base (main integrada):** `bf7ad96691b3f7ec97e3ee3977f438f8b3b00bd7`
**Data:** 2026-11-03
**Publicação:** branch e PR para revisão; sem merge, tag, release, deploy ou APK nesta missão.

## Integração da Missão 005

- PR: https://github.com/Rilen/boiscan/pull/1
- HEAD revisado: `db3567cf26f8fd453cb076a7aa9b89b3d2dc8517`
- Merge commit na main: `bf7ad96691b3f7ec97e3ee3977f438f8b3b00bd7`
- Checks locais aprovados: typecheck, 145 testes, build, `npm audit` e
  `npm run experimental:images`.
- Cloudflare Pages: PR/preview e produção serviram o mesmo bundle do baseline
  (`index-SlogXva6.js` / `index-BG4QOYpe.css`); a ferramenta experimental não está
  em `dist/` e as rotas `/experimental/*` caem no fallback HTML do app público.
- Nenhum workflow de publicação automática existe em `.github/`; o Cloudflare Pages
  é a única automação externa observada e não publica o pipeline experimental.

## O que foi feito

- Novo módulo puro `src/experimental/collection.ts`:
  - unidades explícitas `mm`, `cm`, `m` convertidas para centímetros;
  - máscara final em RLE reproduzível (`rle-0-1-v1`);
  - esquema versionado `boiscan.collection-sample/1`;
  - elegibilidade estrita e rascunho;
  - medidas físicas somente com escala válida e confiável.
- Ferramenta `experimental/visual-tool.html` + `src/experimental/tool.ts`:
  - marcação de referência física com dois cliques e unidade;
  - confirmação de mesmo plano e aviso de perspectiva;
  - campos de ID da amostra, ID pseudônimo do animal, peso real, data e fonte;
  - exportação de amostra elegível e salvamento de rascunho;
  - painel de elegibilidade com motivos explícitos;
  - identificação da imagem por nome, SHA-256 e dimensões.
- Testes de escala/unidades, RLE, máscara vazia/incompatível, escala degenerada,
  incerteza, peso não positivo, data futura, identificadores e ausência de peso
  estimado.
- Protocolo de coleta em `docs/COLLECTION-PROTOCOL.md`.

## Esquema da amostra

```text
boiscan.collection-sample/1
  status: eligible | draft
  sampleId, animalId, createdAt, extractorVersion
  image { name, sha256, dimensões original/análise }
  mask  { rle-0-1-v1, origin, corrections, segmentationWarnings }
  reference { unit, knownLength, knownLengthCm, start, end, pixelLength, cmPerPixel,
              relativeUncertainty, reliable, warnings }
  features { pixelUnits, physicalUnits, pixels, physical|null }
  weight { liveWeightKg, weighedAt, source }
  qualityWarnings, eligibility, limitations
```

## Elegibilidade

Uma amostra só é `eligible` quando:

- IDs são válidos e pseudônimos;
- a imagem tem dimensões positivas e a máscara não está vazia nem incompatível;
- as características extraídas correspondem à máscara final e às dimensões da
  imagem (área, máscara, imagem);
- a referência tem comprimento positivo, unidade válida, dois pontos distintos,
  mesmo plano confirmado e incerteza relativa ≤ 10%;
- o peso real é positivo;
- a data da pesagem é real e não futura.

Caso contrário, permanece `draft` com a lista de pendências. Máscara vazia, escala
degenerada, características ausentes/inconsistentes e valores não positivos são
rejeitados explicitamente. Nenhum peso, confiança ou precisão é gerado.

## Verificação visual

Fluxo exercitado em Chrome headless com a fixture `bos_indicus-brazil`:

- fixture carregada localmente e máscara automática aplicada;
- referência marcada por dois cliques em `1,5 m`, com `samePlaneAsAnimal`;
- amostra completa avaliada como `eligible`;
- exportação **de teste, com dados fictícios e sem alegação de validação real**,
  gerou `S-EXPORT-006.json` com `boiscan.collection-sample/1`, SHA-256/dimensões
  da imagem, máscara `rle-0-1-v1`, referência `150 cm`, features em `cm`/`cm^2`,
  peso de teste `512,5 kg` (fictício), data de teste e avisos — sem a fotografia e
  sem peso estimado;
- remover o peso levou a `draft` com `weight-missing` e bloqueio da exportação;
- limpar a máscara levou a `draft` com `mask-empty`, `physical: null` e bloqueio da
  exportação; o rascunho continuou sendo salvo.

## Resultados

```text
npm run typecheck   → aprovado
npm test            → 20 arquivos, 165 testes aprovados
npm run build       → aprovado, 37 módulos
npm run experimental:images → harness executado
npm audit           → 0 vulnerabilidades
```

O bundle público permanece idêntico ao baseline:

```text
JS  SHA-256 65ac545a34d95de7c6c562fda78f80188b50fe7f99a295feb61df67fd243f353
CSS SHA-256 71958e50b53f2c1e6bb14af19058d89181b797a608b7eb304965fb93b89c9a03
```

## Limitações

1. Sem dataset real de pesagens, escala e licença verificada.
2. Segmentação automática ainda incompleta; a correção manual é obrigatória.
3. A referência no mesmo plano não elimina erros de perspectiva.
4. Sem UI de escala no app público; a coleta é apenas na ferramenta experimental.
5. Sem modelo validado, sem validação independente e sem peso estimado.
6. Nenhum dado real de campo foi incluído nesta missão.

## Próximo passo

Executar o protocolo em campo: marcar escala no plano do animal, corrigir máscaras na
ferramenta, pesar no mesmo manejo e congelar coortes por animal. Só depois treinar e
avaliar o baseline; a estimativa de peso continua bloqueada.
