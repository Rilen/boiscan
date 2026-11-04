# Peso experimental por fotografia — Missão 012

**Estado:** preview experimental; modelo não validado em campo. Não é pesagem comprovada.

## Como abrir

O preview da branch de Missão 012 ativa o motor pelo parâmetro:

```text
https://<preview>.boiscan.pages.dev/?experimental=weight
```

Sem `?experimental=weight`, o app continua usando o motor indisponível padrão. A produção em `boiscan.pages.dev` não deve ser alterada por esta branch.

## Modelo

- Versão: `2026-11-04-v1` (`photo-embedding-ridge`).
- Backbone: MobileNetV3-small (ImageNet, torchvision), exportado para ONNX; 576-d embedding.
- Gate de presença: YOLO11n-seg ONNX, COCO classe `cow=19`, confiança 0.25, usado **apenas** para recusar fotos sem bovino.
- Regressão: ridge (`alpha=300`) treinada em embeddings; sem intervalo/confiança.
- Arquivos: `public/models/photo-weight-v1.json`, `public/models/mobilenet_v3_small_features.onnx`, `public/models/yolo11n-seg.onnx`.
- Runtime: `onnxruntime-web` (WASM) no navegador; nenhuma foto é enviada. Os pesos dos modelos são baixados do próprio preview.

## Dados e split

- A: *Cattle side view and back view dataset* (CC BY 4.0), lado; 71 animais utilizáveis; pesos 341–644 kg; origem do peso desconhecida.
- B: *Multi-View Cow Image Dataset* (CC BY 4.0), `Angle1`; 72 animais; pesos 40–1300 kg; origem do peso desconhecida.
- Uma imagem por animal; split agrupado por animal, determinístico e estratificado por base (20% teste; 15% validação; treino+validação no ajuste final).
- **n:** 115 animais no ajuste, 28 no teste (14 A + 14 B).
- Rótulos A/B não têm método/data de pesagem comprovados; não são validação de campo.
- CID/CattleNet-XAI não forneceram pesos treinados utilizáveis: o repositório CID não contém o modelo treinado; as imagens CID estão em S3 (833 MB + 4,0 GB YouTube) e a licença das imagens de terceiros não foi confirmada. O artigo CattleNet-XAI relata MAE 18,02 kg, mas **não** é o MAE deste modelo.

## Avaliação (teste, 28 animais)

| Métrica | Resultado |
|---|---:|
| MAE | **112,59 kg** |
| RMSE | 142,81 kg |
| Viés | +5,66 kg |
| MAPE | 43,15% |
| Mediana do erro percentual absoluto | 25,12% |
| R² | 0,499 |
| Baseline constante (média do treino) | 160,36 kg MAE |
| A (14 animais) | 77,15 kg MAE; R² −0,13 |
| B (14 animais) | 148,03 kg MAE; R² 0,40 |

O modelo melhora o baseline constante no agregado, mas o erro é alto, o A tem R² negativo e o B tem erro grande. **Não** é precisão validada.

## Falhas e limites

- Sem bovino identificável: o gate retorna falha e nenhum peso é exibido (testado com imagem NASA sem bovino).
- Imagem abaixo do mínimo de qualidade: o app bloqueia antes do modelo.
- Imagens do mesmo animal não são repetidas; não há estabilidade entre capturas.
- Enquadramento/corte altera a previsão; em teste, A-04 caiu de 506 kg para 388 kg com um recorte de 75%.
- Fotos de B muito grande/pequena podem errar muito (ex.: B-0018 950 kg → 499 kg no teste).
- Sem escala física; nenhum cm é recuperado. Nenhum peso é “pesagem comprovada”.
- YOLO11 é AGPL-3.0; o gate é apenas para preview experimental. Não distribuir produto fechado sem licença/revisão.

## Reprodução local do treino

Os scripts de treino/exportação estão em `boiscan-benchmark-012` (fora do bundle público): `scripts/build_dataset.py`, `scripts/train_embed.py`, `scripts/export_models.py`. Os caminhos apontam para os datasets locais em `/home/rtl/Downloads` e para o artefato B da Missão 008. O modelo publicado contém somente coeficientes e métricas; nenhuma foto é incluída no repositório.

## Teste no preview

1. Abra `https://<preview>.boiscan.pages.dev/?experimental=weight`.
2. Escolha uma foto lateral; aguarde o resultado.
3. Deve aparecer: “Peso estimado experimental: aproximadamente X kg.” e “Modelo em teste, ainda sem validação de campo.”
4. Uma foto sem bovino deve mostrar “Nenhum bovino identificável…”, sem número.
