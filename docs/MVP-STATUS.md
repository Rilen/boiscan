# Status do MVP

**Data:** 2026-11-03
**Estado:** `BOISCAN_004_DATA_DEPENDENCY_DOCUMENTED`
**Estimativa preditiva:** base experimental implementada; **não validada e não ativa no app público**

## Entregue

| Área | Status | Evidência |
| --- | --- | --- |
| Executa localmente | ✅ | `npm run dev` e `npm run preview` |
| Build de produção | ✅ | `npm run build` (tsc + Vite) |
| Interface mobile-first | ✅ | layout testado em viewport emulado de 390 px, tema claro/escuro |
| Captura/seleção de foto | ✅ | inputs nativos com `capture="environment"` e galeria |
| Pré-visualização | ✅ | imagem via `blob:` local |
| Substituição/remoção | ✅ | troca libera URL anterior; remoção volta ao início |
| Rotação | ✅ | prévia e análise de pixels com rotação |
| Validação de arquivo | ✅ | MIME permitido + limite de 15 MB + falha de decodificação |
| Qualidade da foto | ✅ | resolução, brilho, contraste e nitidez em canvas local |
| Estados de análise | ✅ | verificação, pronta, analisando, resultado, indisponível, erro |
| Motor desacoplado | ✅ | `WeightEstimationEngine` + registry |
| Indisponibilidade | ✅ | padrão sem modelo; nenhum número exibido |
| Conversão kg → arrobas | ✅ | `peso × rendimento / 15`, testada |
| Rendimento configurável | ✅ | 30–75%, padrão 52%, persistido localmente |
| Resultado com metadados | ✅ | modelo, versão, data, qualidade, avisos |
| Intervalo de incerteza | ✅ condicional | exibido somente se o motor devolver |
| Experimental x validado | ✅ | estados e avisos distintos |
| Simulação | ✅ somente dev | flag explícita, aviso ostensivo, inativa em produção |
| PWA | ✅ | manifesto, ícones, service worker, shell offline |
| Identidade BoiScan | ✅ | UI, manifesto, ícones, metadados, pacote npm e documentos |
| Política de privacidade | ✅ | página estática `/privacidade.html` + link no app |
| Privacidade | ✅ | sem cadastro/GPS/analytics; upload remoto só com consentimento explícito |
| Acessibilidade básica | ✅ | skip link, foco visível, labels, `aria-live`, alvos ≥ 44 px |
| Android/TWA (preparação) | ⏳ | templates, package ID provisório e checklist; sem SDK/JDK para gerar AAB |
| Motor experimental local | ✅ | pipeline morfometria + escala + ridge; não registrado no app |
| Dataset/treino | ✅ infraestrutura | templates, validação, split agrupado, treinador e demo sintética |
| Testes automatizados | ✅ | 133 testes, 17 arquivos |
| Documentação | ✅ | README + docs técnicos + experimental + dados + Android |

## Telas

1. **Início**: marca, proposta, aviso de disponibilidade do motor, captura,
   galeria e orientação.
2. **Conferir foto**: prévia, rotação, troca, qualidade técnica, rendimento de
   carcaça e ação de análise bloqueável.
3. **Analisando**: estado indeterminado com cancelamento, sem progresso falso.
4. **Resultado**: peso, arrobas, intervalo opcional, metadados e avisos; ou
   **Estimativa indisponível** sem valores.
5. **Erro recuperável**: banner na conferência, com nova tentativa.

## Testes executados

```text
npm run typecheck   → sem erros
npm test            → 17 arquivos, 133 testes aprovados
npm run build       → dist/ gerado com sucesso
```

Cobertura funcional inclui: seleção, captura declarada, prévia, substituição,
rotação, formato inválido, imagem corrompida, resultado validado, recálculo de
arrobas, migração da preferência antiga, indisponibilidade sem números, experimental,
simulação rotulada, falha recuperável, cancelamento, PWA, política de privacidade e
templates Android.

**Importante:** esses testes demonstram que o software funciona. Eles **não**
demonstram que o peso é estimado corretamente, porque não há modelo validado.

## Não entregue (por escopo e por bloqueio)

- Modelo real treinado com pesagens reais ou pesos de visão computacional validados.
- Ativação do motor experimental no app público/UI de escala.
- Backend FastAPI de inferência (não havia modelo para servir).
- Dataset com pesagens reais e calibração de escala.
- Histórico de análises, contas, sincronização ou gestão de rebanho.
- Reconhecimento de raça.
- Intervalo de confiança real (só é exibido se vier do motor).
- Inferência offline de modelo (o shell e a qualidade local são offline).
- Projeto Android gerado, AAB/APK assinado e credenciais de assinatura.
- Domínio HTTPS público, conta Play e Digital Asset Links verificados.
- Deploy, commit, push ou publicação.

## Limitações conhecidas

- A qualidade técnica não verifica se o animal inteiro está enquadrado.
- A segmentação experimental é clássica e limitada a fundos controlados; não é um
  modelo de gado validado.
- O motor experimental não está ligado à UI pública: falta a marcação de escala e a
  exportação de features; sem elas, não há fluxo de campo.
- Sem escala física, uma foto única não determina peso absoluto com confiança.
- A demonstração sintética tem métricas apenas de pipeline; não são desempenho real.
- Rotação/correção de orientação usa CSS na prévia e canvas na análise; EXIF é
  tratado pelo navegador ao decodificar.
- O adaptador remoto considera o modelo experimental até a resposta; a validação é
  informada por resultado.
- jsdom não executa canvas; o caminho visual de qualidade foi verificado em Chrome
  headless durante a missão, mas não é um teste automatizado de imagem real.
- PWA/offline exige HTTPS em produção; em IP local HTTP o navegador pode não
  instalar o app.
- A distribuição Android está bloqueada por ausência de JDK 17/Android SDK/Bubblewrap,
  domínio público, conta Play e assinatura — e, principalmente, pela ausência de
  modelo de peso validado.
- O package ID `br.com.boiscan.app` é provisório e se torna imutável após o primeiro
  upload na Play.

## Próxima missão recomendada

**Executar o piloto de dados e instrumentar a coleta de features/escala**: usar os
templates de `data/`, coletar fotos com marcador no plano do animal e pesagens reais
em pelo menos três propriedades, congelar a coorte de teste e só então treinar o
baseline. A UI de marcação de escala e a exportação de features são o elo
operacional que falta; sem dados licenciados, não há modelo defensável.

Não é recomendado investir primeiro em novas telas ou em estética: o produto já
funciona como funil honesto. O gargalo é evidência de dados.

## Governança

`NO_COMMIT`
`NO_PUSH`
`NO_DEPLOY`
`NO_PAID_SERVICES`
`LOCAL_IMPLEMENTATION_ONLY`
