# Protocolo de coleta experimental — Missão 006

**Estado:** `BOISCAN_006_COLLECTION_READY_WEIGHT_BLOCKED`
**Ferramenta:** `experimental/visual-tool.html`
**Saída:** `boiscan.collection-sample/1` (JSON)

Este protocolo descreve como coletar amostras para uma futura validação do peso.
A ferramenta **não estima peso**, não calcula confiança e não substitui uma balança.
O peso permanece bloqueado até existir modelo treinado e validado em coorte
independente.

## 1. Materiais

- Balança de gado calibrada (ou balança de plataforma com registro da marca/modelo).
- Marcador rígido de comprimento conhecido, por exemplo barra pintada, placa A3
  (42 × 29,7 cm) ou bastão graduado. Meça e registre o comprimento real.
- Fita métrica para conferir o marcador e a distância à câmera.
- Celular com câmera limpa, sem zoom digital.
- Caderno ou planilha local para IDs pseudônimos.

## 2. Captura

1. Fotografe o animal **de perfil**, com o corpo inteiro no quadro e sem cortar
   cabeça, patas ou traseiro.
2. Posicione o marcador de escala no **plano lateral do animal** (encostado ou
   paralelo ao corpo), visível e sem oclusão. Não apoie o marcador no chão nem o
   coloque mais próximo da câmera.
3. Mantenha a câmera aproximadamente perpendicular ao animal, na altura do meio do
   corpo, a uma distância que permita enquadrar o animal inteiro.
4. Não use zoom digital, filtros ou recorte. Evite sol direto forte, sombras duras e
   fundo com outros animais na mesma ROI.
5. Registre o comprimento do marcador, a unidade (mm, cm ou m) e a incerteza da
   medida (padrão de 0,5 cm).
6. Pese o animal o mais próximo possível da fotografia, preferencialmente no mesmo
   manejo e no mesmo dia. Registre a data real da pesagem.
7. Use um identificador **pseudônimo** por animal (ex.: `ANIMAL-001`). Não use nome,
   e-mail, CPF, telefone ou outro dado pessoal.

## 3. Processamento na ferramenta

1. Rode `npm run dev` e abra `/experimental/visual-tool.html`.
2. Carregue a fotografia local. Nenhuma imagem sai do dispositivo.
3. Ajuste a ROI para isolar o animal.
4. Revise a máscara automática e corrija com o pincel. A exportação registra a
   origem (`automatic`, `manual` ou `hybrid`) e o número de correções.
5. Preencha o ID da amostra e o ID pseudônimo do animal.
6. Em “Referência física”, informe comprimento, unidade e incerteza; clique em
   “Marcar referência” e marque os dois extremos do marcador. Confirme que ele está
   aproximadamente no mesmo plano do animal.
7. Preencha peso real (kg), data da pesagem e fonte/método.
8. Confira o painel de elegibilidade.

## 4. Rascunho e elegibilidade

- **Salvar rascunho** sempre é permitido quando há foto e máscara. O arquivo sai com
  `status: "draft"` e lista as pendências. Uma cópia fica em `localStorage` quando
  disponível.
- **Exportar amostra elegível** só funciona quando todos os campos necessários são
  válidos. Caso contrário, a ferramenta bloqueia e mostra os motivos.
- A amostra só recebe `status: "eligible"` com:
  - ID da amostra e ID pseudônimo válidos;
  - imagem identificada, dimensões positivas e máscara não vazia compatível;
  - características extraídas correspondentes à máscara final e às dimensões da
    imagem;
  - referência com comprimento positivo, unidade válida, dois pontos distintos,
    mesmo plano confirmado e incerteza relativa ≤ 10%;
  - peso real positivo em kg;
  - data de pesagem real, no formato `AAAA-MM-DD`, não futura.
- Máscara vazia, escala degenerada (dois pontos iguais), comprimento ou peso não
  positivo são rejeitados explicitamente.

## 5. Critérios de qualidade

- Animal inteiro, perfil perpendicular e sem oclusão.
- Máscara cobrindo a silhueta real; sem membros de outros animais.
- Referência com pelo menos 40 px na imagem analisada; idealmente acima de 100 px.
- Incerteza relativa da escala abaixo de 10%.
- Marcador no plano do animal; perspectiva continua sendo uma fonte de erro mesmo
  assim.
- Peso e fotografia no mesmo manejo/dia, com balança identificada.
- Uma amostra por animal, foto e pesagem. Evite duplicar a mesma foto.

## 6. Exportação

O JSON contém:

- `schemaVersion`, `status`, `sampleId`, `animalId`, `createdAt`;
- `extractorVersion`;
- `image`: nome, SHA-256 do arquivo, dimensões originais e dimensões de análise;
- `mask`: RLE (`rle-0-1-v1`), origem, correções e avisos de segmentação;
- `reference`: unidade, comprimento, pontos normalizados, pixels, cm/px, incerteza e
  confiabilidade;
- `features`: pixels com unidade `px`/`px^2`/`deg` e, somente com escala confiável,
  medidas físicas em `cm`/`cm^2`;
- `weight`: peso real, data e fonte;
- `qualityWarnings`, `eligibility` e `limitations`.

A fotografia não é incluída. Não há peso estimado, confiança ou precisão fictícia.

## 7. Separação para validação

- Agrupe por **animal**, não por foto. Todas as fotos do mesmo animal ficam no mesmo
  conjunto.
- Separe desenvolvimento (treino/validação) e avaliação independente por animal e,
  de preferência, por propriedade e período.
- Congele a coorte de avaliação antes de ajustar o modelo. Nunca mova um animal da
  avaliação para o treino depois de ver as métricas.
- Registre a data da coleta e mantenha o mesmo protocolo de escala entre conjuntos.
- Só promova um modelo a validado após revisão humana e métricas documentadas.

## 8. Limitações

- A referência no mesmo plano reduz, mas **não elimina**, erros de perspectiva,
  lente e distância.
- A máscara manual depende do operador e pode variar entre anotações.
- Uma única vista lateral não determina condição corporal nem profundidade.
- Sem pesagens reais licenciadas e consentidas, a estimativa permanece bloqueada.

## 9. Privacidade

- Nenhuma imagem ou dado é enviado a serviços externos.
- A exportação contém apenas geometria, máscara RLE e metadados técnicos.
- Não inclua dados pessoais em IDs, nomes de arquivo ou campos livres.
- Dados privados devem ficar em `data/private/` (ignorado pelo Git).
