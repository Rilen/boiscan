# Checklist — Google Play (BoiScan)

Atualizado em 2026-11-03. Marcar apenas com evidência. Regras da Play mudam; conferir
o Play Console e as páginas oficiais antes de cada envio.

## 0. Bloqueios absolutos (Go/No-Go)

- [ ] **Modelo de peso validado** com pesagens reais, coorte independente e métricas
      documentadas. Sem isso, **não abrir produção** nem anunciar estimativa de peso.
- [ ] **Domínio HTTPS público** definido e build web publicado.
- [ ] **Package ID confirmado**: `br.com.boiscan.app` (provisório) está alinhado ao
      domínio/marca e não será alterado após o primeiro upload.
- [ ] **Contato de privacidade** publicado na política (e-mail dedicado ou canal
      estável). O GitHub Issues atual é provisório.
- [ ] Listagem e app deixam claro que a estimativa está indisponível ou é experimental,
      conforme o estado real do motor.

## 1. Conta e identidade do desenvolvedor

- [ ] Conta Google Play Console ativa e verificada.
- [ ] Verificação de identidade do desenvolvedor concluída (dados pessoais ou
      organizacionais, conforme o tipo de conta).
- [ ] Se conta de organização: D-U-N-S e site/verificação compatíveis com a política
      vigente.
- [ ] Endereço de contato e e-mail de suporte monitorados.
- [ ] Conta pessoal criada após 13/11/2023: planejar **teste fechado com pelo menos 12
      testadores opt-in contínuos por 14 dias** e solicitar acesso à produção.
- [ ] Revisar exigências de teste fechado e verificação de dispositivo no Play Console.

## 2. Técnico — PWA e TWA

- [ ] Build de produção `npm run build` publicado em HTTPS.
- [ ] `manifest.webmanifest` acessível, com `name`, `short_name`, `id`, `start_url`,
      `scope`, `display: standalone`, ícones 192/512 e maskable.
- [ ] Ícones servidos com MIME correto; ícone de 512×512 válido.
- [ ] Service worker registrado e shell offline testado.
- [ ] `/privacidade.html` acessível publicamente, sem login e sem paywall.
- [ ] `/.well-known/assetlinks.json` com package ID e SHA-256 corretos, servido como
      `application/json` e **sem** cair no fallback HTML do SPA.
- [ ] TWA verificado (`adb shell pm get-app-links br.com.boiscan.app` → `verified`).
- [ ] `compileSdkVersion` **36** e `targetSdkVersion` **36** (ou superior).
- [ ] App Bundle (`.aab`) gerado; nenhuma permissão desnecessária.
- [ ] Sem `usesCleartextTraffic`; nenhuma URL HTTP insegura.
- [ ] Fallback de navegador e ausência do Chrome testados.
- [ ] `bubblewrap validate --url https://<HOST>/` executado e critérios de qualidade
      do TWA atendidos.
- [ ] Testar câmera/galeria, rotação, imagem corrompida, offline, política de
      privacidade e retorno ao app em Android real.
- [ ] Revisar comportamento nas versões Android 16+ e em tela pequena/grande.
- [ ] Não usar WebView próprio para contornar limitações da web; TWA deve abrir a PWA
      real.

## 3. Assinatura e integridade

- [ ] Play App Signing habilitado.
- [ ] Upload keystore criada fora do repositório e com backup seguro.
- [ ] Senhas da keystore e da chave em gerenciador de segredos; nunca em Git, issues,
      logs ou capturas.
- [ ] SHA-256 do certificado de assinatura do Play adicionado ao asset links.
- [ ] Durante testes com APK sideload, fingerprint do upload key adicionado
      temporariamente e removido depois, se aplicável.
- [ ] `versionCode` incrementado a cada envio; AAB final auditado.
- [ ] Verificar que `node_modules`, `dist`, keystores, `.env` e artefatos não estão
      no commit.

## 4. Política de privacidade e segurança de dados

- [ ] Política publicada em URL pública, estável, em português, sem geobloqueio.
- [ ] Política descreve fotos, processamento local, preferência em `localStorage`,
      modo remoto opcional com consentimento e ausência de analytics/GPS.
- [ ] Identidade/contato do controlador e canal para direitos LGPD.
- [ ] Data safety preenchido de forma coerente:
  - build público padrão: sem coleta/compartilhamento de dados pelo app;
  - se backend remoto for habilitado no futuro: declarar fotos e metadados enviados,
    finalidade, criptografia em trânsito, retenção e compartilhamento;
  - nenhuma localização, contatos ou identificadores de publicidade.
- [ ] Declaração de anúncios: **sem anúncios**.
- [ ] App access: **sem login**; não há credenciais de teste necessárias.
- [ ] Nenhum SDK de analytics, ads ou crash reporting não declarado.
- [ ] Revisar permissões Android: o app não deve pedir localização, câmera nativa,
      contatos ou armazenamento amplo sem necessidade.
- [ ] Contas: não se aplica exclusão de conta; documentar exclusão de dados locais.
- [ ] Revisar política de conteúdo, propriedade intelectual e segurança infantil.

## 5. Store listing

- [ ] Nome do app com até 30 caracteres: `BoiScan`.
- [ ] Descrição curta (até 80) e completa (até 4.000) honestas: o que funciona e o
      estado da estimativa.
- [ ] Ícone de loja 512×512 (sem transparência indevida).
- [ ] Feature graphic 1024×500.
- [ ] Pelo menos 2 capturas de telefone válidas, sem dados pessoais nem números
      fictícios apresentados como reais.
- [ ] Categoria, tags e público-alvo definidos; não direcionado a crianças.
- [ ] Classificação de conteúdo respondida no Console.
- [ ] E-mail de suporte e site publicados.
- [ ] URL da política de privacidade na ficha da loja e dentro do app.
- [ ] Revisar texto para não prometer precisão não validada.

## 6. Testes antes da produção

- [ ] Teste interno com build assinado instalado via Play.
- [ ] Teste fechado com 12+ testadores por 14 dias (se exigido para conta pessoal).
- [ ] Pre-launch report revisado (crashes, ANRs, acessibilidade, segurança).
- [ ] Matriz de dispositivos: Android 16 e versões mínimas suportadas, telas
      pequenas/grandes, câmera e seletor de fotos.
- [ ] Fluxos testados: primeira abertura, offline, foto inválida, foto grande,
      rotação, consentimento remoto, indisponibilidade do motor.
- [ ] Feedback dos testadores registrado e bugs corrigidos.
- [ ] Revalidar target API 36 no Console imediatamente antes do envio.

## 7. Publicação

- [ ] AAB revisado e upload na track correta.
- [ ] Notas da versão, países, preço (gratuito) e declarações preenchidos.
- [ ] Rollout gradual recomendado (ex.: 10% → 50% → 100%).
- [ ] Monitorar crashes, ANRs, avaliações e política de dados após a publicação.
- [ ] Revalidar estimativa e avisos; não promover modelo experimental a validado sem
      evidência.
- [ ] Plano de atualização do target API e do modelo documentado.

## Evidências a anexar ao processo

- Saída de `npm run typecheck`, `npm test`, `npm run build` e `npm audit`.
- Relatório de validação do modelo (quando existir).
- Capturas do app, política de privacidade e ficha da loja.
- Hash/versão do AAB e impressão digital do certificado.
- Resultado da verificação do asset links e do pre-launch report.
