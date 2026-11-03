# Avaliação com fotografias reais — Missão 005

**Estado:** `BOISCAN_005_VISUAL_PIPELINE_READY_WEIGHT_BLOCKED`
**Data:** 2026-11-03
**Branch:** `feat/005-real-image-pipeline`
**Base:** `329fe3bae0f9fd1c8ca247ada4557ede5d5cf0d0`

## 1. Conjunto de imagens

Cinco fotografias públicas do Wikimedia Commons foram incorporadas em
`experimental/fixtures/images/`, com autoria, licença, origem, SHA-256, ROI e
categoria registrados em `manifest.json`. Nenhum peso real foi atribuído.

| Arquivo | Categoria | Licença | Uso no teste |
| --- | --- | --- | --- |
| `holstein_1920s.jpg` | usável | Domínio público | Perfil lateral histórico |
| `bos_indicus_brazil.jpg` | usável | Domínio público | Perfil lateral, zebu |
| `brahman_pasture.jpg` | difícil | Domínio público | Vários animais e animal pequeno |
| `instituto_frontal.jpg` | inadequada | CC BY 2.0 | Animal frontal, não serve para perfil |
| `beef_cattle_ayr_1989.jpg` | difícil | CC BY 4.0 | Vários animais, sombra forte |

Créditos completos e URLs: `experimental/fixtures/images/CREDITS.md`.

## 2. Segmentação automática

O baseline atual usa ROI normalizada, modelo de fundo por k-means (6 clusters),
distância RGB ao fundo, maior componente conexo e preenchimento de buracos. A ROI
reduz a interferência de outros animais e do fundo.

Comando reproduzível:

```powershell
npm run experimental:images
```

Saídas ignoradas pelo Git em `experimental-output/real-images/` (`report.json` e
JPEGs com máscara em vermelho e ROI em verde).

| Imagem | Máscara (px) | Cobertura da ROI | Orientação | Pipeline | Avaliação |
| --- | ---: | ---: | ---: | --- | --- |
| `holstein_1920s` | 257.021 | 27,4% | −2,2° | features-only | **Parcial**: corpo escuro, perde manchas claras, cabeça e pernas |
| `bos_indicus_brazil` | 221.035 | 21,4% | +14,3° | features-only | **Parcial**: tronco, perde cabeça/pernas/úbere |
| `brahman_pasture` | 8.397 | 3,4% | +6,8° | features-only | **Limitada**: apenas parte do tronco do animal-alvo |
| `instituto_frontal` | 1.829 | 0,3% | −22,1° | **rejected** | **Incorreta/rejeitada**: frente do animal não é perfil; máscara minúscula |
| `beef_cattle_ayr_1989` | 25.428 | 11,2% | −8,4° | features-only | **Parcial**: tronco do bovino preto; sombra e pernas incompletas |

**Conclusão:** nenhuma das cinco imagens produziu automaticamente uma silhueta
completa do animal. O melhor resultado é o tronco de `bos_indicus_brazil` e do bovino
preto de `beef_cattle_ayr_1989`; o caso frontal foi corretamente rejeitado (por área,
não por um classificador de vista). A segmentação clássica não é adequada para
morfometria de produção.

### Exemplos visuais

- Melhor caso parcial (imagem de domínio público):
  `docs/screenshots/real-bos-indicus-mask.jpg`
- Falha/rejeição (CC BY 2.0, crédito em `CREDITS.md`):
  `docs/screenshots/real-instituto-mask.jpg`
- Ferramenta local com máscara parcial:
  `docs/screenshots/visual-tool.png`

## 3. Ferramenta de inspeção

Arquivo local (não incluído no build público):

```text
experimental/visual-tool.html
```

Com `npm run dev`, abrir:

```text
http://localhost:5173/experimental/visual-tool.html
```

Recursos:

- upload local de foto;
- ROI normalizada (x, y, largura, altura);
- visualização da imagem e da máscara sobreposta;
- medidas morfométricas em pixels;
- diagnóstico de segmentação e avisos;
- pincel para adicionar/apagar máscara;
- exportação de relatório JSON sem a fotografia;
- seletor de fixtures apenas em desenvolvimento.

A ferramenta foi exercitada em Chrome headless com uma foto real: carregou 900×733,
segmentou, exibiu medidas e retornou `features-only` sem peso. O canvas e o pipeline
local funcionaram.

## 4. O que foi implementado

- ROI normalizada na segmentação e no pipeline.
- Modelo de fundo com múltiplos clusters de cor (k-means determinístico).
- Máscara restrita à ROI, maior componente e fechamento de buracos.
- Ferramenta visual de inspeção/edição/exportação.
- Cinco fixtures reais licenciadas + manifesto verificável por SHA-256.
- Harness `experimental:images` com relatório e overlays.
- Testes Node com JPEG real via `jpeg-js` (BSD-3-Clause), incluindo caso frontal
  rejeitado.
- Teste de pintura de máscara (`paintMaskCircle`).

## 5. Métodos e bibliotecas avaliados

| Alternativa | Licença | Avaliação |
| --- | --- | --- |
| Segmentação clássica + ROI (atual) | código do projeto | Barata e local; não recupera contorno completo em fundos reais |
| COCO-SSD / TensorFlow.js | Apache-2.0 | Detecta `cow` como caixa, não fornece máscara; exigiria dependência grande e modelo remoto; não integrado |
| MediaPipe Image Segmenter / DeepLab-V3 | Apache-2.0 (tasks) | Modelo consultado tem metadados de pessoa/plano de fundo, não silhueta bovina confiável; não integrado |
| YOLO segmentation (Ultralytics) | AGPL-3.0/Enterprise | Segmentação forte, mas exige decisão de licença comercial; não integrado |
| OpenCV.js / GrabCut | Apache-2.0 | Alternativa interativa viável (ROI + modelo de cor), porém 14,7 MB e sem teste de qualidade neste ciclo; candidato futuro |
| SAM/MobileSAM | verificar licença/modelo | Segmentação genérica por prompt; peso e tamanho altos; não integrado |
| `jpeg-js` | BSD-3-Clause | Apenas decodificação para testes Node |

Nenhum peso de modelo de terceiros ou dataset externo de peso foi baixado. As imagens
são apenas fixtures de teste, não dataset de treinamento.

## 6. Estimativa de peso

**Bloqueada.** Não há:

- escala física confiável para as fotos (sem marcador no plano do animal);
- pesos reais de balança associados às fotos;
- dataset licenciado para treinar coeficientes;
- validação independente;
- silhueta completa automática para extrair medidas corporais estáveis.

Fórmulas de fita (por exemplo, baseadas em perímetro torácico e comprimento corporal)
não são aplicáveis a uma foto lateral sem a medida de perímetro e sem protocolo. Não
foram criados coeficientes arbitrários nem intervalos de confiança. O motor continua
retornando `unavailable`/`features-only`; nenhum peso é exibido.

## 7. Limitações

- Segmentação clássica falha em fundos heterogêneos, sombras, oclusões e animais de
  pelagem próxima ao fundo; o caso Holstein demonstra isso.
- A ROI precisa ser fornecida/ajustada; detecção automática de animal não foi integrada.
- Não há classificação automática de vista lateral vs frontal; a rejeição do caso
  frontal ocorreu por baixa cobertura de máscara.
- Sem escala e sem dataset real, a estimativa de peso permanece indefensável.
- A ferramenta não faz parte do app público e não foi incluída no build de produção.

## 8. Próximo passo

Instrumentar a coleta real com ROI, máscara manual corrigível e marcador de escala,
congelar uma coorte por propriedade e obter pesagens reais. Em paralelo, avaliar
GrabCut/OpenCV.js ou um segmentador com licença compatível para reduzir a correção
manual. Só depois treinar o baseline ridge e medir erro em coorte independente.
