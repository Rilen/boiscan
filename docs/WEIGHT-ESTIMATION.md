# Estimativa de peso por fotografia

## Status

**Não há modelo de estimativa de peso validado neste repositório.** A missão 004
implementou uma base experimental local (segmentação clássica, morfometria, escala,
regressão ridge, treinador e adaptador); a missão 005 avaliou cinco fotos públicas
reais e adicionou ROI e uma ferramenta de inspeção. A segmentação automática foi
apenas parcial; não há dataset real, coeficientes treinados com pesagens reais nem
validação independente. O motor padrão continua `unavailable` e o app público não
exibe peso.

Este documento registra a viabilidade técnica, os requisitos de dados e o plano de
validação. As afirmações abaixo são de engenharia e revisão de literatura geral; não
substituem um estudo experimental. A implementação e os bloqueios estão detalhados
em [`EXPERIMENTAL-ENGINE.md`](EXPERIMENTAL-ENGINE.md).

## 1. É tecnicamente possível estimar peso com uma única foto RGB?

Sim, **com incerteza relevante e sob condições controladas**. Uma foto lateral
contém informação sobre comprimento, altura, profundidade aparente, área de silhueta
e proporções corporais. Modelos de visão computacional e regressões morfométricas
conseguem correlacionar essas características com peso.

O limite central é que uma imagem RGB monocromática não contém **escala física
absoluta**. Sem distância, altura ou referência conhecida, dois animais com a mesma
silhueta podem ter tamanhos reais diferentes. Portanto:

- é viável obter um **indicador** de peso com erro mensurável;
- não é possível prometer precisão fixa nem confiabilidade comercial sem calibração;
- a estimativa deve ser apresentada com intervalo e limitações;
- uma única foto sem calibração é insuficiente para uso zootécnico crítico.

A literatura relata abordagens com erro na ordem de poucos por cento a mais de 10%,
mas os números variam com raça, dataset, protocolo de captura, escala e método de
avaliação. Nenhum percentual deve ser adotado pelo produto antes de replicação.

## 2. Quais dados de treinamento são necessários?

O dado mínimo é um par confiável:

```text
foto lateral + peso vivo real na mesma data + condições de captura registradas
```

Além disso:

- **Escala**: distância câmera–animal, altura da câmera, comprimento focal,
  presença de marcador ou sensor de profundidade.
- **Animal**: identificação, raça ou composição racial, sexo, idade, condição
  corporal (escala 1–5), gestação/lactação quando aplicável.
- **Captura**: data/hora, fazenda/lote, ângulo, oclusão, iluminação, resolução.
- **Repetição**: várias fotos por animal, em dias diferentes, para medir
  estabilidade.
- **Segmentação** (desejável): máscara do animal para treinar/avaliar
  segmentação e extrair medidas.
- **Peso real**: balança calibrada, com protocolo e horário registrados.

Qualidade de anotação e balanceamento importam mais do que volume bruto. Um piloto
útil começa com algo na ordem de **centenas a poucos milhares de animais**, com
múltiplas condições e pesagens repetidas; o número exato depende da variabilidade e
do erro-alvo. O dataset deve ser dividido **por animal e por fazenda**, não apenas por
imagem, para evitar vazamento de identidade e superestimar a generalização.

**Bloqueio atual:** não há dataset com pesagens reais e calibração de escala
disponível neste repositório. Sem isso, treinar seria teatro. O pipeline e o
treinador já recusam dados insuficientes/sintéticos apresentados como reais; veja
`data/README.md`, `EXPERIMENTAL-ENGINE.md` e a avaliação visual em
`REAL-IMAGE-EVALUATION.md`.

## 3. Como obter escala física confiável?

Opções, em ordem de robustez prática:

1. **Marcador de escala conhecido** no plano do animal (ex.: bastão com medidas),
   detectado automaticamente.
2. **Câmera calibrada + distância conhecida**: intrínsecos e pose conhecidos;
   reconstrução métrica aproximada.
3. **Sensor de profundidade** (LiDAR/ToF/estéreo), que fornece distância por pixel.
4. **Plano de apoio e câmera a altura/distância fixas**: homografia do chão e
   altura da câmera; depende de protocolo rígido.
5. **Priori de tamanho corporal**: útil apenas como regularização; não substitui
   escala e aumenta o erro entre raças e idades.

Para um MVP de campo, a opção 1 ou 4 é a mais barata. A opção 5 sozinha não deve ser
vendida como estimativa confiável de peso absoluto.

## 4. Como controlar distorção de perspectiva?

- Fotografar perpendicular ao plano lateral do animal, com o corpo inteiro visível.
- Manter distância suficiente para reduzir distorção de lente grande-angular
  (evitar aproximação excessiva; evitar zoom digital).
- Registrar altura e distância da câmera; corrigir rolagem/inclinação.
- Usar segmentação e normalização por pontos anatômicos, não apenas pixels brutos.
- Aumentar dados com variações de ângulo, lente, distância e iluminação.
- Considerar duas vistas (lateral + traseira) para profundidade; eleva custo e
  complexidade, mas reduz ambiguidade.
- Validar o erro por faixa de ângulo; não assumir que o modelo generaliza para
  fotos amadoras.

## 5. Influência de raça, idade e condição corporal

- **Raça/composição**: muda proporções, musculosidade e relação peso/volume. Um
  único modelo global tende a ter viés entre Nelore, Angus, Brahman e cruzamentos.
- **Idade**: animais jovens crescem em estrutura e composição; peso e medidas não
  têm a mesma relação que em adultos.
- **Condição corporal**: gordura subcutânea e vísceras alteram peso sem alterar
  muito a silhueta. O mesmo contorno pode representar pesos diferentes.
- **Sexo, gestação e lactação** também deslocam a relação.
- **Pelo, barro e oclusões** alteram a segmentação.

Estratégia: incluir esses fatores como covariáveis quando disponíveis; treinar
modelos por grupo ou com efeitos parciais; reportar erro estratificado; usar
intervalos de incerteza maiores quando a raça/condição é desconhecida. **Não inferir
raça sem um classificador validado** e não apresentar reconhecimento de raça como
fato.

## 6. Como avaliar o erro com pesagens reais?

Separar rigorosamente treino, validação e teste. O teste deve ser **out-of-farm** e
**out-of-animal** quando possível, além de uma coorte temporal.

Métricas mínimas:

- **MAE** (erro absoluto médio, kg) e **RMSE**;
- **MAPE** ou erro percentual absoluto mediano (cuidado com animais leves);
- **Viés médio** (previsto − real), com intervalo de confiança;
- **Bland–Altman**: limites de concordância e tendência por faixa de peso;
- **Cobertura do intervalo** (PICP) e largura média do intervalo;
- **Erro por estrato**: raça, sexo, idade, condição corporal, fazenda, faixa de
  peso, qualidade da foto e ângulo.

Procedimento:

1. Congelar o dataset de teste antes de ajustar hiperparâmetros.
2. Repetir a avaliação com seeds e versões registradas.
3. Comparar com baselines: média por lote/raça, regressão só com metadados e
   morfometria simples.
4. Verificar estabilidade em fotos repetidas do mesmo animal.
5. Publicar cartão de modelo com métricas, cobertura, falhas e condições de uso.

Metas provisórias sugeridas para um piloto (a serem acordadas com o responsável
técnico, **não prometidas**): erro absoluto percentual mediano abaixo de 5% e
cobertura de um intervalo de 90% entre 85% e 95%. Se não forem atingidas, o produto
deve continuar exibindo "indisponível" ou "experimental".

## 7. Melhor equilíbrio entre precisão, custo e velocidade

Para este produto, a arquitetura com melhor relação custo/benefício é:

```text
detecção/segmentação do animal
  → normalização geométrica e escala
  → características morfométricas + metadados
  → regressão calibrada
  → intervalo de incerteza
```

Motivos:

- segmentação (ex.: família YOLO de segmentação) é madura e barata;
- medidas interpretáveis permitem auditoria e detecção de outliers;
- a regressão pode ser leve e executar no dispositivo;
- o modelo profundo ponta a ponta pode melhorar precisão, mas exige muito mais
  dados e é mais difícil de explicar;
- inferência remota é útil para modelos pesados, mas adiciona latência, custo,
  privacidade e disponibilidade.

Recomendação: começar com segmentação + morfometria + regressão calibrada; usar
modelo profundo como comparação, não como ponto de partida. Medir o erro real antes
de otimizar latência.

## 8. Tecnologias que podem funcionar offline

- **ONNX Runtime Web** (WASM e WebGPU) para modelos exportados de PyTorch.
- **TensorFlow.js** (WebGL/WebGPU/WASM) para modelos leves.
- **YOLO exportado para ONNX** e quantizado (INT8/FP16), conforme suporte do
  runtime e do dispositivo.
- **OpenCV.js/WASM** para operações geométricas e morfometria.
- Service worker para cache do app e dos pesos do modelo (com cuidado de tamanho e
  versionamento).

Offline é viável para um modelo compacto e para a conferência de qualidade. Um
modelo grande de segmentação pode ficar lento em celulares antigos; nesse caso, a
alternativa é processamento remoto opcional, explicitamente consentido. Nesta
missão, apenas a interface e a análise de qualidade são offline; não há pesos de
modelo.

## 9. Plano para chegar a uma estimativa real

### Fase 0 — Contrato de dados e ética

- Definir schema, consentimento, retenção e anonimização (LGPD).
- Escolher protocolo de captura e escala.
- Criar formulário de coleta e validação de pesagens.

### Fase 1 — Piloto de dados (bloqueante)

- Coletar fotos + peso real em pelo menos duas propriedades e múltiplas raças.
- Registrar escala, distância, altura e condições.
- Medir repetibilidade da balança e da foto.
- Versionar dataset e congelar teste.

### Fase 2 — Baseline auditável

- Segmentação do animal.
- Extração de comprimento, altura, área e proporções.
- Regressão com metadados e validação out-of-farm.
- Relatório de erro e intervalos.

### Fase 3 — Modelo aprimorado

- Comparar CNN/regressão ponta a ponta e modelo multimodal.
- Calibrar incerteza (quantis/conformal).
- Testar em dispositivo e medir latência.

### Fase 4 — Validação independente

- Coorte nova, outra fazenda, avaliação cega.
- Critérios de aceitação acordados; se falhar, não promover.
- Cartão de modelo e auditoria reproduzível.

### Fase 5 — Integração no app

- Implementar `POST /v1/estimate` ou motor ONNX local.
- Configurar `VITE_ENGINE_ENDPOINT` (ou registry local).
- Exibir apenas resultados sustentados, com intervalo e avisos.

## 10. Contrato de dados (proposta)

Uma linha por foto, com chave para animal e pesagem:

```csv
record_id,animal_id,farm_id,image_path,captured_at,live_weight_kg,weighing_at,
scale_method,camera_height_cm,distance_cm,focal_length_mm,marker_present,
breed,breed_source,sex,age_months,bcs_1_5,angle_deg,occlusion,lighting,
quality_score,split
```

Regras:

- `live_weight_kg` deve vir de balança calibrada; `weighing_at` próximo da foto.
- Uma imagem pode ter várias pesagens ao longo do tempo; nunca duplicar o mesmo
  peso para inflar o dataset.
- `split` nunca deve colocar o mesmo `animal_id` em treino e teste.
- Guardar hash do dataset e versão do código que gerou as métricas.
- Fotos de pessoas, placas e localização devem ser evitadas ou anonimizadas.

## 11. Riscos e comunicação

- **Risco de falsa confiança**: usuário tratar a estimativa como pesagem oficial.
  Mitigação: linguagem de estimativa, intervalo, modelo/versão e "não use para
  decisões comerciais" quando experimental.
- **Risco de viés**: modelo pior em raças/regiões sub-representadas. Mitigação:
  estratificação e coleta diversa.
- **Risco de privacidade**: upload sem consentimento. Mitigação: padrão local,
  endpoint opcional explícito e consentimento por foto na tela de conferência.
- **Risco de drift**: mudança de câmeras, manejos ou raças. Mitigação:
  monitoramento com pesagens amostrais e revalidação.

O BoiScan só deve remover o selo experimental após evidência reproduzível de
validação com pesagens reais, em coorte independente. Aprovar testes de software
não aprova o modelo.
