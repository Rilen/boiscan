# Checkpoint — Missão 005

**Estado:** `BOISCAN_005_VISUAL_PIPELINE_READY_WEIGHT_BLOCKED`
**Branch:** `feat/005-real-image-pipeline`
**Base (main):** `329fe3bae0f9fd1c8ca247ada4557ede5d5cf0d0`
**Data:** 2026-11-03
**Publicação:** branch publicada para continuidade; sem merge, release, tag ou deploy manual de produção.

## O que foi feito

- Pipeline local com ROI normalizada, segmentação clássica por clusters de fundo,
  maior componente, fechamento de buracos e morfometria.
- Cinco fotografias públicas licenciadas com manifesto, autoria, licença, ROI,
  categoria e SHA-256 em `experimental/fixtures/images/`.
- Harness reproducible `npm run experimental:images` (JS + JPEG real) com relatório
  e overlays em `experimental-output/` (ignorado).
- Ferramenta local `experimental/visual-tool.html`:
  - upload local;
  - ROI;
  - máscara sobreposta;
  - medidas em pixels;
  - pincel para corrigir máscara;
  - exportação JSON sem a fotografia;
  - seletor de fixtures somente em desenvolvimento.
- Testes automatizados com JPEG real, ROI, pincel e caso frontal rejeitado.
- Documentação: `REAL-IMAGE-EVALUATION.md` e atualizações em README/ARCHITECTURE/
  EXPERIMENTAL-ENGINE/MVP-STATUS/WEIGHT-ESTIMATION.

## Arquivos alterados

**Modificados (13):** `README.md`, `docs/ARCHITECTURE.md`,
`docs/EXPERIMENTAL-ENGINE.md`, `docs/MVP-STATUS.md`, `docs/WEIGHT-ESTIMATION.md`,
`package.json`, `package-lock.json`, `src/experimental/engine.test.ts`,
`src/experimental/mask.test.ts`, `src/experimental/mask.ts`,
`src/experimental/pipeline.ts`, `src/experimental/segmentation.test.ts`,
`src/experimental/segmentation.ts`.

**Novos (19):** `docs/CHECKPOINT-005.md`, `docs/REAL-IMAGE-EVALUATION.md`, 3 imagens
em `docs/screenshots/`, `experimental/visual-tool.html`, 8 arquivos em
`experimental/fixtures/images/`, `scripts/experimental/real-images.ts`,
`src/experimental/realImages.test.ts`, `src/experimental/tool.ts`,
`src/test/experimentalIsolation.test.ts` e `src/test/realImageFixtures.ts`.

## Resultados

```text
npm run typecheck   → aprovado
npm test            → 19 arquivos, 145 testes aprovados
npm run build       → aprovado, 37 módulos
npm audit           → 0 vulnerabilidades
npm audit --omit=dev→ 0 vulnerabilidades
```

O bundle público continua idêntico ao baseline:

```text
JS  SHA-256 65ac545a34d95de7c6c562fda78f80188b50fe7f99a295feb61df67fd243f353
CSS SHA-256 71958e50b53f2c1e6bb14af19058d89181b797a608b7eb304965fb93b89c9a03
```

A ferramenta visual não está em `dist/` e não é importada pelo app.

## Fotos reais

Resumo (detalhes em `REAL-IMAGE-EVALUATION.md`):

| Imagem | Resultado automático |
| --- | --- |
| `bos_indicus_brazil.jpg` | parcial (tronco; cabeça/pernas ausentes) |
| `beef_cattle_ayr_1989.jpg` | parcial (tronco; sombra/pernas incompletas) |
| `holstein_1920s.jpg` | parcial (corpo escuro; perde manchas claras e pernas) |
| `brahman_pasture.jpg` | limitada (animal pequeno; múltiplos animais) |
| `instituto_frontal.jpg` | rejeitada (vista frontal; cobertura mínima) |

Nenhuma imagem gerou segmentação automática completa. A ferramenta permite correção
manual; o peso continua indisponível.

## Bloqueios

1. Sem dataset com pesagens reais, escala e licença verificada.
2. Segmentação automática incompleta nos casos reais.
3. Sem UI de escala no fluxo público.
4. Sem modelo de segmentação com licença compatível integrado.
5. Sem validação independente/estatística.

## Retomada em outro computador

1. `git fetch --all --prune`
2. `git switch feat/005-real-image-pipeline` (após publicação da branch).
3. `npm install`
4. `npm test`
5. `npm run experimental:images`
6. `npm run dev` e abrir `/experimental/visual-tool.html`

Nenhum caminho temporário é necessário: imagens, manifesto e scripts estão no
repositório. Apenas as saídas de `experimental-output/` são regeneráveis e ignoradas.

## Próximo passo

Coletar fotos com marcador de escala no plano do animal e pesagens reais; corrigir
máscaras na ferramenta, congelar coorte por propriedade e medir o baseline. Avaliar
GrabCut/OpenCV.js ou segmentador com licença compatível para reduzir anotação manual.
