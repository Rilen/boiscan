# Peso experimental por fotografia — Missão 012

**Estado:** publicado experimentalmente em produção; modelo não validado em campo. Não é pesagem comprovada.

## Como abrir

A rota principal abre diretamente o fluxo experimental; não é necessário parâmetro de URL.

- **Produção:** https://boiscan.pages.dev/
- **Preview da branch:** https://feat-012-experimental-weight.boiscan.pages.dev/

O build inclui o modelo e o runtime ONNX; a fotografia permanece no navegador.

## Modelo

Avisos de licença e fontes: [/third-party.html](/third-party.html). YOLO11n-seg é AGPL-3.0; MobileNetV3/torchvision é BSD-3-Clause; ONNX Runtime é MIT; as bases A/B são CC BY 4.0.

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
- YOLO11 é AGPL-3.0; o gate é distribuído neste build público experimental. O código-fonte está no repositório; uso comercial fechado exige licença/revisão jurídica. Ver `/third-party.html`.

## Reprodução local do treino

Os scripts de treino/exportação estão em `boiscan-benchmark-012` (fora do bundle público): `scripts/build_dataset.py`, `scripts/train_embed.py`, `scripts/export_models.py`. Os caminhos apontam para os datasets locais em `/home/rtl/Downloads` e para o artefato B da Missão 008. O modelo publicado contém somente coeficientes e métricas; nenhuma foto é incluída no repositório.

## Teste no preview

1. Abra `https://boiscan.pages.dev/` (ou o preview da branch).
2. Escolha uma foto lateral; aguarde o resultado.
3. Deve aparecer: “Peso estimado experimental: aproximadamente X kg.” e “Modelo em teste, ainda sem validação de campo.”
4. Uma foto sem bovino deve mostrar “Nenhum bovino identificável…”, sem número.

## Execução remota verificada

- A-01 (teste, 545 kg): **490 kg**.
- A-04 (validação, 604 kg): **506 kg**; com 640×480: **502 kg**; com recorte de 75%: **388 kg**.
- B-0018 (teste, 950 kg): **499 kg** (erro grande, documentado).
- B-0062 (teste, 120 kg): **97 kg**.
- Imagem NASA sem bovino: falha “Nenhum bovino identificável…”, sem peso.
- Imagem 450×338: bloqueada pela qualidade antes do modelo.

Esses números são qualitativos e não substituem a avaliação de 28 animais (MAE 112,59 kg; baseline constante 160,36 kg).
