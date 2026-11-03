# Arquitetura do BoiScan

## 1. Escopo

O BoiScan é um app web mobile-first com um único objetivo: receber uma foto lateral
de um bovino e, **quando houver um modelo validado**, mostrar peso vivo estimado e
arrobas comerciais de carcaça. Não é um sistema de gestão pecuária.

O MVP entrega a fundação técnica sem fingir uma capacidade de IA que ainda não
existe:

- captura/seleção e pré-visualização local;
- conferência técnica da imagem;
- máquina de estados de análise;
- contrato de motor desacoplado;
- conversão determinística de kg para arrobas;
- PWA e interface acessível.

## 2. Stack e decisões

| Decisão | Motivo |
| --- | --- |
| React + TypeScript + Vite | Interface pequena, tipagem forte, build rápido e sem servidor. |
| CSS puro | Evita dependência de framework visual e mantém o bundle enxuto. |
| Sem backend nesta etapa | Não há modelo treinado para servir. Um FastAPI sem modelo agregaria infraestrutura sem função. |
| Adaptador HTTP opcional | Permite conectar um backend futuro sem alterar a interface. |
| PWA manual (manifest + service worker) | Instalação e shell offline sem adicionar plugin/dependência. |
| Processamento de imagem no navegador | Privacidade por padrão e funcionamento offline para a conferência técnica. |
| Vitest + Testing Library | Testes de domínio e de fluxo sem depender de navegador real. |

Diretriz: **o valor exibido só pode vir de um resultado de motor**. A interface não
calcula peso, não sorteia peso e não usa um valor de fallback. A conversão para
arrobas é uma regra de negócio aplicada sobre um peso fornecido pelo motor.

## 3. Visão de componentes

```text
┌──────────────────────────────────────────────────────────────┐
│ App (React)                                                  │
│  ├─ HomeScreen ──────────────┐                               │
│  ├─ ReviewScreen             │  useBoiScanFlow (máquina)      │
│  ├─ AnalyzingScreen          │   ├─ valida arquivo           │
│  ├─ ResultScreen             │   ├─ carrega imagem local     │
│  └─ componentes              │   ├─ analisa qualidade        │
│                              │   ├─ chama o motor            │
│                              │   └─ controla runId/erros     │
│                              │                               │
│  domain/                     │  engine/                      │
│   ├─ arrobas                 │   ├─ tipos do contrato        │
│   ├─ validação de arquivo    │   ├─ registry (seleção)       │
│   └─ qualidade de pixels     │   ├─ unavailableEngine        │
│                              │   ├─ remoteEngine (opcional)   │
│  lib/                        │   └─ simulationEngine (dev)    │
│   ├─ loadImageFile           │                               │
│   └─ analyzeImageQuality     │                               │
└──────────────────────────────────────────────────────────────┘
```

### Camadas

- `src/domain`: funções puras e regras testáveis (arrobas, validação, métricas de
  imagem).
- `src/engine`: contrato do motor e implementações. Nenhuma tela importa um
  adaptador concreto; todas usam `WeightEstimationEngine`.
- `src/lib`: integração com APIs do navegador (blob, canvas, bitmap).
- `src/hooks/useBoiScanFlow.ts`: orquestração do fluxo, cancelamento e limpeza de
  recursos.
- `src/screens` e `src/components`: apresentação. Não contêm regra de conversão.

## 4. Fluxo e estados

```text
home ──(arquivo válido)──► review ──(analisar)──► analyzing ──► result
  ▲                          │  ▲                     │           │
  └────── remover ───────────┘  └──── cancelar ───────┘           │
  └──────────────────────── nova análise ─────────────────────────┘
```

Estados internos de `review`:

1. imagem carregada (`imageLoading`);
2. qualidade em verificação (`qualityChecking`);
3. pronta para análise (`canAnalyze`);
4. bloqueada por problema técnico (issues `blocking`);
5. erro recuperável no banner.

`result` cobre:

- sucesso validado (`status: "ok"`, `model.validated: true`);
- resultado experimental (`status: "experimental"`);
- estimativa indisponível (`status: "unavailable"`);
- erro defensivo (`status: "error"`) — normalmente já tratado em `review`.

Não existe barra de progresso percentual. A tela de análise mostra um indicador
indeterminado e `aria-live`, sem simular etapas.

### Cancelamento e concorrência

Cada operação assíncrona incrementa `runIdRef`. Respostas antigas são descartadas
antes de alterar o estado. Cancelar uma análise volta para `review` e ignora o
resultado que chegar depois. Ao remover/trocar a imagem, o `objectURL` anterior é
revogado e o `ImageBitmap`, quando existir, é fechado.

## 5. Contrato do motor

```ts
type EngineAvailability = 'validated' | 'experimental' | 'unavailable';

interface WeightEstimationEngine {
  id: string;
  name: string;
  version: string;
  availability: EngineAvailability;
  estimate(request: EstimationRequest): Promise<EstimationResult>;
}

interface EstimationRequest {
  image: Blob;
  fileName: string;
  width: number;
  height: number;
  rotation: 0 | 90 | 180 | 270;
  quality: ImageQuality;
  dressingPercent: number;
  /** Opcional: raça, idade, sexo e condição corporal para calibração futura. */
  animal?: AnimalMetadata;
  /** Opcional: referência de escala para o motor experimental; a UI pública não a envia. */
  scaleReference?: ScaleReference;
}

type EstimationResult =
  | { status: 'ok' | 'experimental'; liveWeightKg: number; model: ModelInfo; analyzedAt: string; interval?: ...; simulated: boolean; disclaimer?: string }
  | { status: 'unavailable'; reason: ...; message: string; details: string[] }
  | { status: 'error'; message: string; recoverable: boolean; code?: string };
```

### Invariantes

1. Nenhuma tela sintetiza `liveWeightKg`.
2. `status: "ok"` exige `model.validated === true` e `simulated === false`.
3. `simulated === true` força `status: "experimental"` e
   `model.validated === false`.
4. Resposta remota fora do contrato vira `error`, nunca um valor aproximado.
5. Peso plausível aceito pelo adaptador: 50–2.000 kg. Intervalo, se presente, deve
   conter o peso e ter limites coerentes.
6. O app calcula arrobas com
   `peso_vivo_kg × rendimento_carcaça / 15`, usando o rendimento atual da interface.
   O resultado é arredondado apenas na apresentação (uma casa decimal).

### Seleção do motor (`src/engine/registry.ts`)

1. `VITE_ENGINE_ENDPOINT` definido → adaptador remoto.
2. `DEV === true` **e** `VITE_ENABLE_SIMULATION === "true"` → simulação.
3. Caso contrário → `unavailableEngine`.

A simulação é registrada como experimental, usa um hash do arquivo para gerar um
valor determinístico e inclui aviso ostensivo. Ela existe somente para exercitar a
UI em desenvolvimento. Em build de produção, `DEV` é falso, portanto a simulação
fica inativa mesmo que a variável seja definida no build.

## 6. API remota opcional

O adaptador `createRemoteEngine` implementa:

```http
POST {VITE_ENGINE_ENDPOINT}/v1/estimate
Content-Type: multipart/form-data

image=<arquivo>
metadata={
  "rotation": 0,
  "dressingPercent": 52,
  "quality": { "analyzed": true, "score": 86, "level": "good", "issues": [] },
  "animal": { "breed": "Nelore", "ageMonths": 30, "sex": "male", "bodyConditionScore": 3 },
  "app": "boiscan",
  "appVersion": "0.2.0"
}
```

O campo `animal` é opcional e não é coletado pela UI atual. Ele existe para que a
calibração por raça/idade/condição corporal possa ser adicionada sem quebrar o
contrato.

Resposta `200`:

```json
{
  "liveWeightKg": 520.4,
  "model": { "name": "bovine-weightnet", "version": "1.2.0", "validated": true },
  "analyzedAt": "2026-11-03T12:00:00.000Z",
  "interval": { "lowerKg": 488, "upperKg": 552, "coveragePercent": 90 },
  "disclaimer": "opcional para modelos não validados",
  "simulated": false
}
```

- `503`: motor indisponível; o app mostra a mensagem sem peso.
- `429`/`5xx`: erro recuperável; a tela de conferência permite tentar novamente.
- `4xx` restante: erro definitivo.
- Timeout: 20 s.
- Resposta inválida: erro `invalid-response`, sem exibir número.

Um backend FastAPI futuro deve autenticar/limitar o endpoint conforme o ambiente e
**não** devolver peso se o modelo não estiver validado.

## 7. Conferência de qualidade

Executada localmente, em resolução reduzida (máx. 384 px no maior lado) e com a
rotação aplicada:

- resolução do arquivo original;
- luminância média;
- desvio-padrão da luminância (contraste);
- média do laplaciano em escala de cinza (nitidez).

Bloqueios: lado menor < 480 px, brilho < 40 ou > 230, contraste < 12, nitidez < 1,5.
Avisos: lado menor < 800 px, exposição fora de 75–195, contraste < 25, nitidez < 7.
O índice (0–100) é informativo e não é uma probabilidade de acerto.

Se o navegador não permitir ler pixels (canvas ausente ou protegido), a qualidade é
marcada como "não avaliada" e o fluxo continua, com aviso explícito. A qualidade
não detecta enquadramento, raça, oclusão ou presença de animal.

## 8. Segurança e privacidade

- Lista permitida de MIME (`image/jpeg`, `png`, `webp`, `avif`, `heic`, `heif`);
  SVG e tipos não-imagem são recusados.
- Limite de 15 MB e validação de decodificação.
- Nenhum `innerHTML`, `eval` ou execução de conteúdo do arquivo.
- Imagens ficam em `blob:` local; não há upload por padrão.
- Quando um backend remoto está configurado, a análise só é liberada após o
  usuário marcar o consentimento explícito de envio daquela foto.
- Sem cookies, analytics ou chaves no repositório.
- `localStorage` guarda apenas o rendimento de carcaça (`boiscan.dressingPercent`);
  a chave legada `arroba.dressingPercent` é migrada e removida.
- A política de privacidade pública fica em `public/privacidade.html` e é vinculada
  no rodapé do app.
- O service worker ignora métodos não-GET, requisições cross-origin e `/v1/*`.

## 9. PWA e offline

- `public/manifest.webmanifest`: identidade BoiScan, `id`, `scope`, `standalone`,
  ícones 192/512 e maskable, `theme_color`.
- `public/sw.js`: pré-cache do shell, da política de privacidade e dos ícones;
  estratégia rede-primeiro para navegação e cache-primeiro para assets.
- Registro apenas em produção (`import.meta.env.PROD`).
- O shell abre offline; a análise de qualidade local também funciona offline. Uma
  estimativa remota, obviamente, exige conexão.

## 10. Testes

- `src/domain/*.test.ts`: fórmula de arrobas, formatação, limites, validação de
  arquivo e métricas de qualidade com pixels sintéticos.
- `src/engine/engines.test.ts`: indisponibilidade, simulação determinística,
  validação do contrato remoto, erros, timeout, prioridade do registry.
- `src/App.test.tsx`: seleção, captura declarada, prévia, troca, rotação,
  arquivo inválido/corrompido, resultado validado, arrobas recalculadas,
  indisponibilidade sem números, experimental, simulação rotulada, erro
  recuperável e cancelamento.
- `src/test/pwa.test.ts`: manifesto, vínculo no HTML, política de privacidade e
  comportamento do service worker.
- `src/test/android.test.ts`: package ID provisório, target API 36 e ausência de
  segredos nos templates Android.
- `src/experimental/*.test.ts`: máscaras, segmentação, morfometria, escala,
  dataset, splits, treino ridge, artefato, domínio e adaptador do motor.
- `src/test/experimentalData.test.ts`: templates de coleta/features e exclusão de
  dados privados no Git.
- `src/experimental/realImages.test.ts`: cinco fotos públicas licenciadas, máscaras
  reais, ROI e rejeição do caso frontal.
- `src/experimental/mask.test.ts`: componentes, buracos e pincel de máscara.

Limitação: jsdom não renderiza canvas real. A análise de pixels é testada por
funções puras; o caminho de canvas foi verificado manualmente em navegador
headless durante a missão.

## 11. Como conectar um modelo real

1. Treinar/validar o modelo fora deste app, com dataset versionado e cartão de
   modelo (ver `WEIGHT-ESTIMATION.md`).
2. Publicar um serviço que implemente `POST /v1/estimate` e devolva o contrato
   acima, marcando `validated: true` somente após validação independente.
3. Definir `VITE_ENGINE_ENDPOINT` no build da instalação.
4. Opcionalmente, adicionar um motor local (ONNX Runtime Web/WebGPU) implementando
   a mesma interface e ajustar o `registry` por prioridade.
5. Manter o fallback `unavailable` para falhas de carregamento do modelo.

Nenhuma alteração de tela é necessária para trocar o motor. O resultado já exibe
modelo, versão, data, intervalo (quando fornecido) e avisos.

## 12. Android e Google Play

A distribuição planejada usa **Trusted Web Activity (TWA)**, que abre a PWA em tela
cheia usando o Chrome e preserva o processamento local. A pasta `android/` contém:

- `twa-manifest.example.json`: package ID, versão, cores e placeholders de host e
  assinatura;
- `assetlinks.example.json`: template de Digital Asset Links;
- `README.md`: pré-requisitos e sequência Bubblewrap;
- `CHECKLIST.md`: cadastro, privacidade, Data safety, assinatura, testes e publicação.

Decisões:

- package ID provisório `br.com.boiscan.app`, imutável após o primeiro upload;
- `versionName 0.2.0`, `versionCode 1`;
- `minSdkVersion 23`, `compileSdkVersion 36`, `targetSdkVersion 36` — o template
  atual do Bubblewrap já gera 36, conforme exigência da Play desde 31/08/2026;
- assinatura por Play App Signing, com upload key fora do repositório;
- asset links publicado em `https://<HOST>/.well-known/assetlinks.json`.

Nesta missão não foram gerados projeto Gradle, AAB, APK nem chaves, porque não há
JDK 17, Android SDK ou Bubblewrap instalados e o host público ainda não existe.
A publicação em produção permanece bloqueada enquanto não houver modelo de peso
validado; a listagem não deve sugerir que a estimativa está concluída.

## 13. Base experimental (missões 004/005)

`src/experimental/` implementa um pipeline local isolado:

```text
frame RGBA → ROI → segmentação clássica → máscara → morfometria → escala → ridge
```

A missão 005 acrescentou ROI normalizada, modelo de fundo por k-means, cinco
fotografias reais licenciadas, um harness de avaliação e a ferramenta local
`experimental/visual-tool.html`. A ferramenta permite corrigir a máscara com pincel e
exportar um relatório técnico, mas **não é uma entrada do build público** (não aparece
em `dist/`).

- `types.ts`: contratos de máscara, escala normalizada, features, artefato e métricas.
- `segmentation.ts`: baseline por contraste de fundo; substituível por segmentador
  futuro; não é modelo validado de gado.
- `morphometrics.ts`: área, perímetro, caixa, eixos por PCA, perfis e conversão para
  cm após escala.
- `scale.ts`: referência de comprimento conhecido, coordenadas normalizadas (0–1),
  mesma plano e incerteza relativa máxima de 10%.
- `model.ts` e `training.ts`: regressão ridge, padronização, split agrupado,
  métricas, intervalos empíricos e bloqueio de extrapolação.
- `engine.ts`: adaptador `WeightEstimationEngine` que só devolve `experimental` ou
  `unavailable`; nunca `ok`/`validated`.
- `dataset.ts` e `data/`: schema CSV, consentimento, licença, fingerprint e regras
  de não vazamento entre animal/propriedade.

O motor **não está registrado no app público** e não altera o fluxo atual. A UI de
marcação de escala no fluxo público e o dataset real ainda não existem. A segmentação
automática foi apenas parcial nas cinco fotos reais; por isso o peso permanece
bloqueado. Detalhes, licenças, resultados e bloqueios em
`docs/EXPERIMENTAL-ENGINE.md`, `docs/REAL-IMAGE-EVALUATION.md` e `data/README.md`.
