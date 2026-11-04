# Relatório 013 — Redução do erro do peso experimental

**Data:** 2026-11-04  
**Estado:** `BOISCAN_013_NO_CONSISTENT_GAIN`  
**Produção mantida:** https://boiscan.pages.dev/ (SHA `4f5a99b48c8a9e22777a679d8ccc1f72a2e8a0b8`)  
**Modelo atual:** `photo-embedding-ridge` — `2026-11-04-v1` (MAE teste 112,59 kg)

## 1. Reprodução do baseline

- Dataset: 143 animais (A 71, B 72), split por animal: dev 115 (A 57, B 58), teste 28 (A 14, B 14), seed 1201 (idêntico à Missão 012).
- Baseline reproduzido: MobileNetV3-small (ImageNet) + ridge, MAE de teste ≈ 112,59 kg (012). Nenhuma fuga de split detectada; 143/143 imagens presentes; pesos 40–1300 kg.

## 2. Matriz de experimentos (validação cruzada por animal, 5 folds, nos 115 de dev)

| Candidato | CV MAE (kg) | CV RMSE (kg) | CV viés (kg) | CV MAPE (%) | α (ridge) |
|---|---:|---:|---:|---:|---:|
| MobileNetV3-small, original | 129,13 | 179,25 | +2,72 | 62,83 | 300 |
| MobileNetV3-small, recorte bovino (YOLO, margem 10%) | 135,80 | 188,56 | −2,52 | 64,89 | 300 |
| EfficientNet-B0, original | 134,93 | 198,15 | +0,38 | 61,94 | 300 |
| EfficientNet-B0, recorte bovino (YOLO, margem 10%) | **128,16** | 185,45 | +4,78 | 58,41 | 300 |
| Constante (média do treino) | 187,21 | — | — | — | — |

- Todas as imagens tiveram bovino detectado pelo YOLO (143/143); nenhum caso rejeitado.
- Seleção feita apenas pela CV no dev; teste histórico não usado para escolha.

## 3. Avaliação final do candidato selecionado (28 animais históricos, uma vez)

Candidato: EfficientNet-B0 + recorte bovino.

| Métrica | Teste (28) | A (14) | B (14) |
|---|---:|---:|---:|
| MAE | 112,68 kg | 73,64 kg | 151,72 kg |
| Constante MAE | 160,36 kg | 99,16 kg | 221,56 kg |
| Viés | +11,47 kg | — | — |

Comparação com o modelo publicado (`2026-11-04-v1`): MAE teste 112,59 → 112,68 kg (**sem ganho; +0,09 kg**).

## 4. Conclusão e recomendação

- Não houve ganho consistente. O recorte automático e o extrator alternativo não superaram o baseline no teste; a diferença é desprezível e dentro da variabilidade.
- Não foi publicado preview nem criado PR: publicar uma versão pior/igual violaria o critério de ganho consistente.
- Recomendação: **manter o modelo atual** `photo-embedding-ridge` / `2026-11-04-v1`. Preservar o anterior para comparação/reversão (já preservado).

## 5. Limitações e próximos passos sugeridos

- Apenas backbones leves de torchvision testados; sem timm (não instalado). Fundo mascarado não avaliado (fora do escopo viável nesta rodada).
- Rótulos A/B têm origem/método de pesagem desconhecidos; erro alto permanece esperado.
- Próximo passo razoável: coleta de campo com múltiplas fotos por animal e pesagem de referência rastreável, antes de novas iterações de modelo.

## Artefatos

- Workspace: `/home/rtl/Documentos/GitHub/boiscan-benchmark-013`
- Scripts: `scripts/build_dataset.py`, `scripts/experiment.py`
- Métricas: `metrics/experiment.json`
- Candidate (não publicado): `models/candidate.json`
PYEOF
echo done