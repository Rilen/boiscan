# BoiScan — empacotamento Android (TWA)

## Estado

Estrutura de configuração preparada. **Nenhum projeto Android, APK, AAB ou chave de
assinatura foi gerado nesta missão**, porque esta máquina não possui Java/JDK 17,
Android SDK nem Bubblewrap. O host HTTPS de produção também ainda não foi definido.

O caminho recomendado é **Trusted Web Activity (TWA)** via Bubblewrap ou PWABuilder.
O app web já é PWA instalável; o TWA reutiliza o mesmo código e mantém a privacidade
do processamento local.

## Decisões

| Item | Valor | Observação |
| --- | --- | --- |
| Nome | BoiScan | Nome exibido no app e na loja |
| Package ID | `br.com.boiscan.app` | **Provisório**: confirmar domínio/marca antes do primeiro upload; imutável depois |
| versionName | `0.2.0` | Acompanha `package.json` |
| versionCode | `1` | Primeiro artefato Android |
| minSdkVersion | `23` | Padrão atual do Bubblewrap |
| compileSdk / targetSdk | **36** | Exigência da Google Play para novos apps a partir de 31/08/2026 |
| Orientação | `portrait` | Uso a campo em celular |
| Assinatura | Play App Signing + upload key | Nenhuma chave criada ou armazenada no repositório |
| Host | `<PUBLIC_HOST>` | Bloqueado até definir domínio HTTPS público |

Verificação do target API: o template atual do Bubblewrap (consultado em
2026-11-03) gera `compileSdkVersion 36` e `targetSdkVersion 36`. A exigência oficial
da Google Play para novos apps é Android 16 (API 36) desde 31/08/2026. Revalidar no
Play Console antes de cada envio.

## Pré-requisitos

- Node.js 18+ (o projeto já usa Node 24).
- JDK 17 (Bubblewrap exige 17; versões maiores não são suportadas pelo
  Android command-line tools).
- Android SDK / command-line tools.
- Bubblewrap CLI: `npm i -g @bubblewrap/cli`.
- Conta de desenvolvedor Google Play aprovada.
- Domínio HTTPS público com o build web publicado.
- Modelo de peso **validado** (ver bloqueio de publicação abaixo).

## Preparação no Bubblewrap

1. Publique o build web em HTTPS no host confirmado:

   ```bash
   npm run build
   ```

   O host precisa servir `/`, `/manifest.webmanifest`, `/icons/icon-512.png`,
   `/privacidade.html`, `/sw.js` e `/.well-known/assetlinks.json`.

2. Valide o ambiente:

   ```bash
   bubblewrap doctor
   ```

3. Inicialize o projeto usando o manifesto web publicado:

   ```bash
   bubblewrap init --manifest https://<PUBLIC_HOST>/manifest.webmanifest --directory android
   ```

   Respostas esperadas:

   | Prompt | Valor |
   | --- | --- |
   | Application name | `BoiScan` |
   | Short name | `BoiScan` |
   | Package ID | `br.com.boiscan.app` (confirmar antes) |
   | Host | host HTTPS confirmado |
   | Start URL | `/` |
   | Theme color | `#1f4d38` |
   | Background color | `#f4f6f1` |
   | Version name | `0.2.0` |
   | Version code | `1` |
   | Signing key | criar upload keystore **fora do repositório** |

   O arquivo `android/twa-manifest.example.json` registra a configuração de
   referência. Não use os placeholders `<PUBLIC_HOST>` nem
   `<ABSOLUTE_PATH_TO_UPLOAD_KEYSTORE>` como valores finais.

4. Confirme o SDK no projeto gerado:

   ```powershell
   Select-String -Path android/app/build.gradle -Pattern 'compileSdkVersion|targetSdkVersion'
   ```

   Ambos devem ser **36 ou superior**. Se o Bubblewrap instalado gerar valor inferior,
   atualize o Bubblewrap ou ajuste o projeto gerado conscientemente; `bubblewrap update`
   pode sobrescrever edições manuais.

5. Gere o App Bundle para teste interno:

   ```bash
   bubblewrap build
   ```

   Saída esperada: `app-release-bundle.aab` (Play) e `app-release-signed.apk`
   (teste local). **Não** envie para produção enquanto o bloqueio de modelo abaixo
   existir.

6. Configure Digital Asset Links:

   - Copie `android/assetlinks.example.json` para o site em
     `/.well-known/assetlinks.json`.
   - Substitua a impressão digital pela **SHA-256 do certificado do Play App
     Signing** (e, durante testes com APK sideload, também a do upload key).
   - Confirme em `https://<PUBLIC_HOST>/.well-known/assetlinks.json` que o JSON é
     servido com `Content-Type: application/json`.
   - O host **não pode** responder a esse caminho com o fallback HTML do SPA
     (`index.html` com status 200). Publique um arquivo estático real; caso contrário,
     a verificação do TWA falhará.
   - Verifique no dispositivo:

     ```bash
     adb shell pm get-app-links br.com.boiscan.app
     ```

7. Instale e teste em dispositivo real:

   ```bash
   bubblewrap install
   ```

8. Siga o checklist completo em [CHECKLIST.md](CHECKLIST.md).

## Assinatura

- Ative **Play App Signing** no Play Console.
- Crie a upload key localmente com `keytool`, fora do repositório:

   ```bash
   keytool -genkeypair -v -keystore ../secrets/boiscan-upload.keystore \
     -alias boiscan-upload -keyalg RSA -keysize 2048 -validity 10000
   ```

   Em Windows PowerShell, use uma pasta fora do repositório ou `..\secrets`.
- Guarde senhas em gerenciador de segredos. Nunca commite `.jks`, `.keystore`,
  `local.properties`, `*.aab`, `*.apk` ou arquivos de service account.
- A upload key não é a chave usada pelo Google para assinar a versão distribuída;
  para o asset links, use a impressão digital do certificado do Play App Signing.

## Bloqueio de publicação

O BoiScan ainda **não possui modelo de peso validado**. A função principal de
estimativa está indisponível por padrão. Publicar na Google Play como se a função
estivesse concluída violaria a restrição da missão e induziria o usuário a erro.

Portanto:

- **Não** abrir produção pública.
- É aceitável um teste interno/fechado técnico, desde que a listagem e o app digam
  claramente que a estimativa de peso está indisponível.
- Remover o bloqueio somente após validação preditiva documentada, com pesagens
  reais e coorte independente.

## Referências

- Google Play — target API: https://developer.android.com/google/play/requirements/target-sdk
- TWA: https://developer.chrome.com/docs/android/trusted-web-activity/
- Bubblewrap: https://github.com/GoogleChromeLabs/bubblewrap
- Digital Asset Links: https://developers.google.com/digital-asset-links/v1/getting-started
- Testes para contas pessoais novas: https://support.google.com/googleplay/android-developer/answer/14151465
