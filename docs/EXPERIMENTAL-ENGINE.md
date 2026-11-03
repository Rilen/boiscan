# Motor experimental de peso bovino

**Estado:** `BOISCAN_006_COLLECTION_READY_WEIGHT_BLOCKED`
**Versão do app:** 0.2.0 (não publicada com este motor)
**Data:** 2026-11-03
**Branch:** `feat/006-collection-flow`

## 1. Resultado da missão

Foi implementada uma base experimental local e testável:

```text
foto → máscara de silhueta → morfometria → escala física → regressão calibrada
```

O pipeline **não calcula peso sem escala confiável e sem um artefato de modelo
válido**. Não há dataset real, modelo treinado com pesagens reais, intervalo
calibrado em campo ou validação independente. O motor público continua
`unavailable` e o app distribuído em `boiscan.pages.dev` não foi alterado.

**Classificação:** infraestrutura experimental funcional; estimativa real bloqueada
por dados. Não é um modelo validado.

## 2. Componentes implementados

| Arquivo | Função |
| --- | --- |
| `src/experimental/types.ts` | Contratos de escala, máscara, features, artefato e métricas |
| `src/experimental/mask.ts` | Componentes conexos, maior componente, preenchimento de buracos, borda, IoU |
| `src/experimental/segmentation.ts` | Baseline clássico por contraste com o fundo da borda |
| `src/experimental/morphometrics.ts` | Área, caixa, perímetro, eixos principais, perfis, simetria e conversão para cm |
| `src/experimental/scale.ts` | Calibração por referência conhecida, coordenadas normalizadas e incerteza |
| `src/experimental/model.ts` | Validação estrita do artefato, inferência ridge, domínio e intervalo |
| `src/experimental/training.ts` | Split agrupado, regressão ridge, métricas, faixas e quantis |
| `src/experimental/dataset.ts` | CSV de features, validação, consentimento/licença e fingerprint |
| `src/experimental/pipeline.ts` | Orquestração e estados de rejeição/indisponibilidade |
| `src/experimental/collection.ts` | Amostra versionada: unidades, RLE da máscara, elegibilidade e rascunho |
| `src/experimental/tool.ts` | Ferramenta local: máscara, escala, peso real e exportação |
| `src/experimental/browser.ts` | Decodificação local e canvas (máx. 512 px) |
| `src/experimental/engine.ts` | Adaptador `WeightEstimationEngine`, sempre experimental/indisponível |
| `src/experimental/synthetic.ts` | Dataset sintético determinístico para testar o pipeline |
| `scripts/experimental/train.ts` | CLI de treino reproduzível |
| `scripts/experimental/demo.ts` | Demonstração sintética; nunca é estimativa real |

Nenhuma imagem sai do dispositivo. O motor experimental não usa rede, API paga ou
credencial. O artefato e o CSV de demo são gravados em `experimental-output/`,
ignorado pelo Git.

## 3. Fluxo e estados

```text
frame RGBA
  │
  ├─ segmentação falhou / silhueta vazia ─────────► rejected
  │
  ├─ sem escala ou escala não confiável ─────────► features-only
  │
  ├─ sem artefato de modelo ─────────────────────► features-only
  │
  ├─ artefato inválido / feature fora do domínio ► prediction-unavailable
  │
  └─ escala confiável + artefato válido ─────────► predicted (experimental)
```

O adaptador do motor (`createExperimentalEngine`) converte esses estados para o
contrato existente:

- `predicted` → `status: "experimental"`, `validated: false`;
- qualquer falta/rejeição → `status: "unavailable"` com motivo explícito;
- exceção inesperada → `status: "error"` recuperável;
- `status: "ok"` **nunca** é produzido por este motor.

Artefato com `validated: true` é recusado pela validação. A promoção a validado
exige processo independente, não um booleano em JSON.

## 4. Escala física

### Método adotado

Uma referência de comprimento conhecido, no **mesmo plano do perfil do animal**, é
marcada com dois pontos. Os pontos são normalizados (0–1), portanto independentes da
resolução da prévia. O app futuro deve:

1. Exibir instruções de captura: animal inteiro, perfil perpendicular, luz difusa.
2. Pedir o comprimento real do marcador (ex.: placa A3 de 42 × 29,7 cm) ou uma
   medida corporal informada.
3. Coletar dois cliques normalizados sobre as extremidades do marcador.
4. Confirmar que o marcador está no plano lateral do animal, não no chão nem à
   frente.
5. Calcular `cmPorPixel = comprimentoRealCm / distânciaEmPixels`.
6. Propagar a incerteza da medida e do clique; acima de **10% de incerteza relativa**,
   o peso não é liberado.

A referência aceita nesta versão é `known-length-marker`. Os contratos
`body-measurement` e `camera-calibration` existem, mas a calibração por câmera não foi
implementada e a medida corporal depende de protocolo com fita.

### Limitações

- Um marcador no plano errado introduz erro sistemático de escala.
- Um marcador pequeno na imagem amplia a incerteza de clique.
- Perspectiva, lente grande-angular e animal não perpendicular distorcem medidas.
- A escala calibra o plano 2D; profundidade corporal e condição corporal continuam
  ambíguas em uma única vista lateral.
- Não há precisão percentual prometida nem confiança estatística sem validação.

### Protocolo recomendado para o piloto

- Placa rígida de dimensões conhecidas (A3 ou barra pintada) apoiada no plano lateral
  do animal, visível e sem oclusão.
- Câmera na altura aproximada do meio do corpo, perpendicular, distância registrada.
- Sem zoom digital; registrar modelo do celular e distância.
- Marcar a referência na foto com o maior comprimento possível.
- Registrar a incerteza da medida e a condição de alinhamento.

## 5. Segmentação

O baseline implementado (`segmentForeground`) estima a cor mediana da borda da
imagem, calcula distância RGB, aplica limiar robusto, mantém o maior componente e
preenche buracos internos. Ele é útil para demonstrar o pipeline e para imagens
controladas com fundo uniforme.

**Não é um segmentador de gado validado.** Falha com:

- pasto alto, cercas, sombras e outros animais;
- animal tocando a borda/cortado;
- fundo com variação de cor semelhante ao pelo;
- oclusões e movimento.

O contrato aceita um segmentador futuro (YOLO/ONNX/runtime local) via opção
`segment`, sem alterar o restante do pipeline. Nenhum modelo de segmentação foi
baixado ou incorporado nesta missão.

## 6. Características extraídas

Em pixels, e em cm quando a escala é confiável:

- caixa delimitadora, comprimento e altura aparentes;
- área da máscara e preenchimento da caixa;
- perímetro e compacidade (4πA/P²);
- eixos principais por PCA (comprimento, largura, razão e orientação);
- largura máxima e perfis em 25/50/75% do comprimento;
- fração de borda, componentes conexos e simetria aproximada.

O vetor de modelo usa:

```text
body_length_cm, body_height_cm, max_width_cm, mask_area_cm2,
major_axis_cm, minor_axis_cm, axis_ratio, fill_ratio,
compactness, symmetry
```

`bodyLengthPx`/`bodyHeightPx` são extensões da caixa; `major/minor` são projeções
nos eixos principais. A documentação do artefato registra a versão do conjunto de
features (`morphometrics-v1`) para evitar mistura silenciosa.

## 7. Modelo e treinamento

### Algoritmo

Baseline **ridge regression** com padronização das features. O treinador escolhe
λ em uma grade usando o split de validação, ajusta somente no treino, avalia no
teste e deriva quantis residuais 5%/95% da validação. Nada é ajustado no teste.

### Guardrails

- `train`, `validation` e `test` precisam existir.
- Nenhum `animal_id` pode aparecer em dois splits.
- Nenhuma `farm_id` pode aparecer em dois splits.
- Dados reais exigem, no mínimo, 60 registros, 30 animais e 3 propriedades. Esses
  valores são guardrails de pipeline, não garantia de poder estatístico.
- Pesos em kg, entre 50 e 2.000 kg; origem da pesagem, consentimento e licença
  obrigatórios.
- Dado com `weightSource` sintético é recusado se o treino for declarado real.
- Peso previsto fora de 50–2.000 kg ou feature fora da faixa de treino é recusado;
  não há clipping ou extrapolação silenciosa.
- Intervalo só é gerado com pelo menos 20 amostras de validação; a cobertura é
  reportada, não prometida.

### Comandos

```powershell
# Treinar com um CSV de features reais (bloqueado se os gates falharem)
npm run experimental:train -- --input data/private/features.csv --output experimental-output/model.json

# Demonstração SINTÉTICA (não é estimativa real)
npm run experimental:demo
```

A demo gera 72 registros sintéticos, treina e grava artefato sintético em
`experimental-output/`. A execução da missão obteve MAE sintética de validação
20,14 kg, MAE de teste 23,79 kg e cobertura sintética de 87,5% — números **sem
qualquer significado zootécnico**, apenas verificação do pipeline.

## 8. Dados e validação

- Templates: `data/templates/collection.template.csv` e
  `data/templates/features.template.csv`.
- Schema, privacidade, consentimento e licença: `data/README.md`.
- Nenhuma foto ou pesagem real está no repositório.
- A coleta deve ser pseudônima, com autorização e licença registradas por registro.
- O teste deve ser congelado antes do ajuste e separado por animal e propriedade;
  idealmente outra propriedade e outro período.
- Métricas obrigatórias: MAE, RMSE, viés, MAPE/erro percentual mediano, R², faixas
  de peso, cobertura e largura do intervalo.
- Relatório deve incluir versão do dataset, hash, código, seed/λ, métricas por
  fazenda e cartão de modelo.
- **Nenhum desempenho preditivo foi medido em animais reais.**

## 9. Bibliotecas, modelos e datasets avaliados

| Recurso | Licença declarada | Avaliação para o BoiScan |
| --- | --- | --- |
| COCO-SSD / TensorFlow.js | Apache-2.0 (código) | Detecta `cow` como caixa, não fornece máscara nem peso; adicionaria dependência e download de modelo. Não integrado. |
| Ultralytics YOLO (detecção/segmentação) | AGPL-3.0 ou licença Enterprise | Segmentação de silhueta é candidata técnica, mas o uso em produto exigiria decisão de licença comercial. Não integrado. |
| ONNX Runtime Web | MIT | Runtime viável para modelo local futuro (WASM/WebGPU); não há modelo para executar. Não integrado. |
| Segmentação clássica própria | Código do projeto | Baseline implementado e testado; limitado a fundos controlados. |
| COCO dataset | Anotações CC BY 4.0; imagens com licenças individuais (verificar termos) | Só detecção/segmentação genérica; não contém pesagens nem escala. Não usado. |
| Dataset bovino com foto + peso + escala | Não localizado/verificado nesta missão | **Bloqueio principal.** Necessário coletar e licenciar dados próprios; nenhuma licença foi presumida. |

As licenças devem ser revalidadas na versão vigente antes de qualquer incorporação.
Nenhum peso de modelo de terceiros foi baixado.

## 10. Como ativar (etapas futuras, não feitas)

1. Coletar dataset licenciado com fotos laterais, escala no plano e pesagens reais.
2. Extrair features com o pipeline e congelar a coorte de teste por propriedade.
3. Treinar o baseline; revisar métricas e viés por faixa/raça.
4. Validar em coorte independente; se falhar, não promover.
5. Implementar a UI de marcação de escala e consentimento local.
6. Conectar o motor experimental ao registry apenas em ambiente controlado,
   mantendo o padrão público `unavailable`.
7. Somente após validação humana/independente, criar um motor `validated`.

A UI atual não coleta escala; portanto o motor experimental não é registrado no app.
O campo opcional `scaleReference` existe no contrato para a futura integração e não
altera o fluxo público.

## 11. Testes e limitações

Testes automatizados cobrem máscaras, segmentação sintética, morfometria, escala,
CSV, splits, vazamento, ridge, métricas, artefato, domínio, pipeline e adaptador de
motor. A suíte existente permanece aprovada. O caminho de canvas do navegador não é
executado pelo jsdom; a segmentação e a matemática são testadas com frames
sintéticos.

Limitações científicas e técnicas:

- dataset real ausente;
- segmentação clássica não robusta em campo;
- escala 2D não resolve profundidade/condição corporal;
- raça, idade e condição corporal não estão no modelo por falta de dados;
- intervalo sintético não é calibração de campo;
- nenhuma validação independente;
- A ferramenta local de coleta marca escala, registra peso real/data e exporta
  amostras elegíveis ou rascunhos, mas a UI de escala no fluxo público ainda não foi
  implementada.

## 12. Atualização da missão 005

Avaliação com cinco fotografias públicas em `experimental/fixtures/images/`:

- ROI normalizada e modelo de fundo por k-means de 6 clusters;
- máscara restrita à ROI, maior componente e fechamento de buracos;
- ferramenta local `experimental/visual-tool.html` com ROI, pincel e exportação;
- harness `npm run experimental:images`;
- testes Node com JPEG real e teste headless de canvas.

Resultado: a segmentação automática produziu apenas **máscaras parciais** em todas as
imagens laterais; o caso frontal foi rejeitado por baixa cobertura. Portanto:

- o peso continua **bloqueado**;
- a ferramenta é o caminho operacional para correção manual de máscara;
- não há modelo de segmentação com licença compatível integrado;
- o app público permanece inalterado.

Detalhes, tabela por imagem e exemplos visuais:
[`REAL-IMAGE-EVALUATION.md`](REAL-IMAGE-EVALUATION.md).

## 13. Bloqueios explícitos

1. Dataset com pesagens reais, escala, consentimento e licença.
2. Piloto em pelo menos três propriedades para o guardrail de treino.
3. Coorte de teste independente, congelada.
4. Segmentador robusto com licença compatível (ou segmentação clássica melhorada).
5. UI de referência de escala no fluxo público; a ferramenta experimental de coleta
   já permite marcar escala, registrar peso real e exportar features.
6. Validação estatística e revisão humana antes de qualquer promoção a validado.

## 14. Atualização da missão 006 — coleta

A ferramenta `experimental/visual-tool.html` passou a cobrir o fluxo operacional de
coleta, sem alterar o app público:

```text
foto local → ROI → máscara corrigida → referência (mm/cm/m) → peso real + data
           → amostra versionada (eligible | draft)
```

- `collection.ts` é puro e testável: conversão de unidades, RLE da máscara,
  elegibilidade, rascunho e medidas físicas condicionais.
- A referência exige dois pontos distintos, mesmo plano confirmado e incerteza
  relativa ≤ 10%; a ferramenta documenta que isso não elimina erros de perspectiva.
- A amostra `boiscan.collection-sample/1` registra IDs pseudônimos, SHA-256 e
  dimensões da imagem, máscara final reproduzível, origem/correções da segmentação,
  pontos e unidade da referência, features com unidades, peso/data e avisos.
- Sem escala válida e confiável, `features.physical` é `null` e nenhuma dimensão
  física é apresentada. Nenhum peso, confiança ou precisão é gerado.
- Máscara vazia, escala degenerada e valores não positivos são rejeitados; amostras
  incompletas só podem ser salvas como rascunho.
- Protocolo de campo: [`COLLECTION-PROTOCOL.md`](COLLECTION-PROTOCOL.md).
