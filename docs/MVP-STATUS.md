# Status do MVP

**Data:** 2026-11-03
**Estado:** `BOISCAN_006_COLLECTION_READY_WEIGHT_BLOCKED`
**Estimativa preditiva:** pipeline visual real e fluxo de coleta experimental prontos; **peso bloqueado, não validado e não ativo no app público**

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
| Fotos reais + ferramenta | ✅ experimental | 5 fixtures licenciadas, ROI/pincel e exportação local; máscaras parciais |
| Coleta experimental (006) | ✅ experimental | máscara, escala com unidade, peso real/data, rascunho e amostra elegível versionada |
| Testes automatizados | ✅ | 165 testes, 20 arquivos |
| Documentação | ✅ | README + docs técnicos + experimental + protocolo de coleta + dados + Android |

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
npm test            → 20 arquivos, 165 testes aprovados
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
- Amostras reais de campo: nenhuma foto/pesagem privada foi incluída.
- Ativação do motor experimental no app público/UI de escala.
- Segmentação automática completa em fotos reais; a atual é parcial.
- Dataset com pesagens e escala reais; peso continua indisponível.
- Backend FastAPI de inferência (não havia modelo para servir).
- Histórico de análises, contas, sincronização ou gestão de rebanho.
- Reconhecimento de raça.
- Intervalo de confiança real (só é exibido se vier do motor).
- Inferência offline de modelo (o shell e a qualidade local são offline).
- Projeto Android gerado, AAB/APK assinado e credenciais de assinatura.
- Domínio HTTPS público, conta Play e Digital Asset Links verificados.
- Merge da missão 006, deploy, tag, release ou publicação Android nesta missão.

## Limitações conhecidas

- A qualidade técnica não verifica se o animal inteiro está enquadrado.
- A segmentação experimental é clássica e limitada a fundos controlados; não é um
  modelo de gado validado.
- O motor experimental não está ligado à UI pública: a coleta com escala, peso real
  e exportação existe apenas na ferramenta experimental (`experimental/visual-tool.html`).
- A referência marcada aproximadamente no mesmo plano do animal reduz, mas não
  elimina, erros de perspectiva, lente e distância.
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

**Executar o protocolo de coleta com marcador de escala e pesagens reais**
([docs/COLLECTION-PROTOCOL.md](COLLECTION-PROTOCOL.md)): usar a ferramenta para
corrigir máscaras, exportar amostras elegíveis, congelar a coorte por animal e medir
o erro do baseline. Em paralelo, avaliar GrabCut/OpenCV.js ou segmentador compatível
para reduzir a correção manual. Sem dados licenciados, a estimativa de peso continua
bloqueada.

Não é recomendado investir primeiro em novas telas ou em estética: o produto já
funciona como funil honesto. O gargalo é evidência de dados.

## Governança

Missão 006: branch e PR para revisão, sem merge.

`NO_MERGE_006`
`NO_TAG`
`NO_RELEASE`
`NO_DEPLOY`
`NO_PAID_SERVICES`
`NO_PRIVATE_DATA`
