# Model Lab mobile — Fase 5: accesso OAuth provider

Data: 2026-08-04
Owner: main agent della lane mobile
Stato: PLANNED — NON IMPLEMENTATA; gate esterno client HF non ancora soddisfatto
Prerequisito: Fase 4 `IMPLEMENTED` e client pubblico Hugging Face registrato
Specifica: `../specs/2026-08-04-model-lab-mobile-hub-design.md`
Ricerca: `../research/2026-08-04-model-lab-mobile-hub-research.md`
Piano: `../plans/2026-08-04-model-lab-mobile-hub-plan.md`

## 1. Decisione upstream

Implementare soltanto Hugging Face con Authorization Code + PKCE S256 nel
browser di sistema. Device Authorization Grant è fallback, non percorso
primario. Non inserire client secret nell'APK. Non simulare OAuth per provider
che documentano soltanto API key o richiedono un diverso confine applicativo.

Matrice iniziale:

| Provider | Stato fase 5 | Motivo |
|---|---|---|
| Hugging Face | ADAPT/IMPLEMENT | client pubblico, PKCE e metadata OIDC ufficiali |
| OpenRouter | DEFER | callback ufficiale HTTPS/localhost; custom scheme Android non documentato |
| Gemini | DEFER | setup identità Google Cloud/Android separato |
| OpenAI | REJECT | API key per questo contratto; nessun sign-in end-user provider |
| Anthropic | REJECT | API key/WIF non è consumer OAuth diretto |
| DeepSeek | REJECT | bearer API key |
| Ollama | N/A | locale senza auth; cloud non coperto dal flusso scelto |

La matrice va riconfermata su sole fonti ufficiali all'apertura della fase. Un
nuovo upstream può cambiare una riga soltanto tramite emendamento.

## 2. Blocco esterno esplicito

Serve un client pubblico HF registrato dall'owner con redirect esatto:

```text
ai.talos://oauth/huggingface
```

Il client ID entra in build tramite `VITE_TALOS_HF_OAUTH_CLIENT_ID`. Non viene
hardcoded nel source e non è un segreto. In assenza del valore:

- la card spiega che l'accesso rapido non è configurato;
- il token manuale resta funzionante;
- nessun pulsante avvia un URL con client fittizio;
- il ledger può arrivare al massimo `BLOCKED — external client registration`,
  mai `IMPLEMENTED`.

La registrazione deve inoltre provare che Hugging Face accetti il private-use
URI. La documentazione pubblica non lo garantisce esplicitamente. Se lo rifiuta,
la fase resta bloccata finché non esiste un HTTPS App Link su dominio verificato
e il ledger non viene emendato; non si sostituisce l'URI in silenzio.

## 3. Inventario esatto dei file

### Creare

1. `mobile/src/config/providerOAuth.ts`
2. `mobile/src/lib/auth/oauthPkce.ts`
3. `mobile/src/lib/auth/huggingFaceOAuth.ts`
4. `mobile/src/services/providerOAuthSession.ts`
5. `mobile/src/stores/huggingFaceAccess.ts`
6. `mobile/tests/unit/auth/oauthPkce.test.ts`
7. `mobile/tests/unit/auth/huggingFaceOAuth.test.ts`
8. `mobile/tests/unit/services/providerOAuthSession.test.ts`
9. `mobile/tests/unit/stores/huggingFaceAccess.test.ts`
10. `mobile/tests/unit/security/providerOAuthManifest.test.ts`
11. `mobile/tests/integration/huggingFaceOAuthUpstream.integration.test.ts`
12. `mobile/tests/e2e/mobile-model-lab-oauth.e2e.spec.ts`
13. `mobile/docs/superpowers/evidence/model-lab/phase-5/hf-oauth-ready.png`
14. `mobile/docs/superpowers/evidence/model-lab/phase-5/hf-oauth-connected.png`
15. `mobile/docs/superpowers/evidence/model-lab/phase-5/hf-oauth-disconnected.png`
16. `mobile/docs/superpowers/evidence/model-lab/phase-5/manifest.md`

### Modificare

17. `mobile/android/app/src/main/AndroidManifest.xml`
18. `mobile/src/services/secureKeyStore.ts`
19. `mobile/tests/unit/services/secureKeyStore.test.ts`
20. `mobile/src/components/talos/models/TalosMobileHuggingFaceAccessCard.vue`
21. `mobile/tests/unit/models/TalosMobileHuggingFaceAccessCard.test.ts`
22. `mobile/src/stores/localModels.ts`
23. `mobile/tests/unit/stores/localModels.test.ts`
24. `mobile/src/screens/SettingsModelsProvidersScreen.vue`
25. `mobile/tests/unit/screens/settingsModelsScreens.test.ts`
26. `mobile/src/App.vue`
27. `mobile/tests/unit/shell/appShell.test.ts`
28. `mobile/src/i18n/locales/it.ts`
29. `mobile/src/i18n/locales/en.ts`
30. `mobile/tests/unit/i18n/localization.test.ts`
31. `mobile/tests/unit/i18n/localizationCoverage.test.ts`
32. `mobile/tests/unit/theme/modelLabThemeTokenContract.test.ts`
33. `mobile/tests/e2e/mobile-model-lab-navigation.e2e.spec.ts`
34. `mobile/docs/superpowers/ledgers/2026-08-04-model-lab-phase-5-provider-oauth-ledger.md`
35. `mobile/docs/PASSAGGIO-DI-CONSEGNE.md`

### Eliminare

Nessun file e nessuna chiave manuale esistente.

Non si modifica `mobile/src/stores/account.ts`: Google/Apple account sync è un
altro dominio.

## 4. Contratti e simboli pubblici

### Configurazione

- `TalosProviderOAuthConfig`;
- `TALOS_HF_OAUTH_REDIRECT_URI = 'ai.talos://oauth/huggingface'`;
- `TALOS_HF_OAUTH_SCOPES = ['gated-repos']`;
- `talosHuggingFaceOAuthConfig(env)` → configurazione valida oppure
  `{ available: false, reason: 'missing-client-id' }`.

Nessun simbolo `clientSecret`, nessuna env `SECRET` e nessuna Basic auth.
`openid`, `profile` ed `email` sono vietati in questo flusso perché Model Lab
non usa identità personale.

### PKCE

- `TalosPkceTransaction`;
- `talosCreatePkceVerifier(random)`;
- `talosPkceS256(verifier)`;
- `talosCreateOAuthState(random)`;
- `talosCreatePkceTransaction(clock, random)`.

Verifier e state usano CSPRNG/Web Crypto, base64url senza padding, lunghezze RFC
e comparazione esatta. Il pending record scade dopo 10 minuti e viene consumato
una sola volta.

### Adapter Hugging Face

- `TalosHuggingFaceOAuthTokens`;
- `TalosHuggingFaceOAuthError` con codici bounded e senza response/token body;
- `talosBuildHuggingFaceAuthorizeUrl(config, transaction)`;
- `talosParseHuggingFaceCallback(url)`;
- `talosExchangeHuggingFaceCode(input)`;
- `talosRefreshHuggingFaceToken(input)` quando upstream restituisce refresh.

Il callback parser accetta soltanto scheme `ai.talos`, host `oauth`, path
`/huggingface`, un singolo code/state e gli errori OAuth documentati. Frammenti,
duplicati, URL simili e callback di altri provider falliscono chiusi.

### Secure session

- `TalosProviderOAuthPendingRecord`;
- `TalosProviderOAuthTokenRecord`;
- `setProviderOAuthPending`, `getProviderOAuthPending`,
  `clearProviderOAuthPending`;
- `setProviderOAuthTokens`, `getProviderOAuthTokens`,
  `clearProviderOAuthTokens`;
- namespace `talos.provider.oauth.<provider>.*`, distinto da
  `talos.provider.key.<provider>`.

Il parser shape-safe rifiuta versioni, provider, tempi o token malformati. I
record non vengono mai restituiti dallo store reattivo, serializzati nelle
preferenze o loggati.

### Store accesso

- `TalosHuggingFaceAccessStatus = 'unavailable' | 'idle' | 'authorizing' |
  'connected' | 'expired' | 'error'`;
- `TalosHuggingFaceAccessState` senza campi secret/identity;
- `talosHuggingFaceAccess`;
- `talosStartHuggingFaceOAuth()`;
- `talosHandleProviderOAuthUrl(url)`;
- `talosHydrateHuggingFaceAccess()`;
- `talosDisconnectHuggingFaceOAuth()`;
- `talosGetEffectiveHuggingFaceToken()`.

Il token OAuth valido ha precedenza per le richieste HF; il token manuale
rimane intatto e torna effettivo dopo disconnect/scadenza non rinnovabile.

## 5. Android e browser

Dentro `.MainActivity`, intent filter esatto:

```xml
<intent-filter>
    <action android:name="android.intent.action.VIEW" />
    <category android:name="android.intent.category.DEFAULT" />
    <category android:name="android.intent.category.BROWSABLE" />
    <data
        android:scheme="@string/custom_url_scheme"
        android:host="oauth"
        android:pathPrefix="/huggingface" />
</intent-filter>
```

`android:launchMode="singleTask"` resta. Non aggiungere wildcard host/path e
non rendere altri componenti exported.

L'authorize URL si apre con il percorso `system_browser` già supportato da
`inAppBrowserService.ts`; non si usa la WebView isolata. `App.vue` registra
`appUrlOpen`, interroga `getLaunchUrl()` al cold start, rimuove listener allo
smontaggio e consegna URL soltanto al parser provider.

## 6. Scenari RED → GREEN permanenti

### F5-RED-01 — PKCE S256 con vettore RFC

RED: challenge plain, base64 standard o padding.
GREEN: vettore RFC 7636 esatto, verifier bounds e S256.

### F5-RED-02 — state e replay

RED: callback con state errato/assente o seconda callback scambia il code.
GREEN: rifiuto prima della rete; pending consumato atomicamente una volta.

### F5-RED-03 — pending scaduto

RED: verifier vecchio resta utilizzabile.
GREEN: record oltre 10 minuti eliminato e stato `expired`/azione riprova.

### F5-RED-04 — callback ristretto

RED: `https://...`, `ai.talos://evil/...`, path diverso, parametri duplicati o
fragment vengono accettati.
GREEN: soltanto URI esatto e query shape valida.

### F5-RED-05 — nessun client secret

RED: manifest/source/bundle contiene un secret o parametro `client_secret`.
GREEN: gate statico fallisce su ogni occorrenza e token exchange usa public
client + verifier.

### F5-RED-06 — manifest minimo

RED: manca VIEW/BROWSABLE oppure data filter è largo.
GREEN: test XML verifica action, categorie, scheme resource, host e path esatti;
nessun nuovo exported.

### F5-RED-07 — browser esterno

RED: flusso usa isolated WebView.
GREEN: port mock prova `system_browser`; gate fisico apre browser di sistema.

### F5-RED-08 — warm e cold return

RED: funziona solo con app viva oppure registra listener duplicati.
GREEN: `appUrlOpen` e `getLaunchUrl` convergono nello stesso handler idempotente.

### F5-RED-09 — token response shape-safe

RED: HTML, JSON incompleto, token type diverso o expiry invalida entra nel
secure store/errore UI.
GREEN: parse fail-closed, error code bounded, nessun body/secret esposto.

### F5-RED-10 — manual token preservato

RED: connettere/disconnettere OAuth sovrascrive la chiave manuale.
GREEN: namespace separati; OAuth valido ha precedenza, disconnect ripristina il
manuale senza copiarlo nel DOM.

### F5-RED-11 — refresh e scadenza

RED: token scaduto continua a partire sul filo o loop di refresh.
GREEN: un solo refresh se disponibile; altrimenti stato expired e reauth; errori
non cancellano la chiave manuale.

### F5-RED-12 — assenza client ID onesta

RED: bottone attivo costruisce URL con stringa vuota/demo.
GREEN: stato unavailable, spiegazione localizzata, nessuna chiamata browser.

### F5-RED-13 — store/log/screenshot senza segreti

RED: access token, refresh token, code, verifier, state, username o e-mail
appare nello snapshot state, log/error o UI connected.
GREEN: soltanto stato/expiry coarse; UI dice **Connesso** senza identità.

### F5-RED-14 — disconnect reale

RED: UI cambia ma token resta effettivo nel secure store.
GREEN: record OAuth rimosso, client successivo usa manual token o anonimo,
status idle.

## 7. Ordine TDD eseguibile

1. Riconfermare metadata OIDC e matrice provider; registrare pin/drift.
2. Scrivere F5-RED-01…04 e implementare PKCE/parser puri.
3. Scrivere F5-RED-05/06 e applicare il manifest minimo.
4. Scrivere F5-RED-09…11 e implementare secure session/exchange.
5. Scrivere F5-RED-07/08 e integrare lifecycle/browser in App.
6. Scrivere F5-RED-12…14 e collegare store/card/localModels.
7. Eseguire metadata upstream gate e suite completa.
8. Con client reale, eseguire login/disconnect sul dispositivo e screenshot.

## 8. Comandi di prova

Da `mobile/`:

```powershell
npx vitest run tests/unit/auth/oauthPkce.test.ts tests/unit/auth/huggingFaceOAuth.test.ts tests/unit/services/providerOAuthSession.test.ts tests/unit/stores/huggingFaceAccess.test.ts tests/unit/security/providerOAuthManifest.test.ts tests/unit/services/secureKeyStore.test.ts
npx vitest run tests/unit/models/TalosMobileHuggingFaceAccessCard.test.ts tests/unit/stores/localModels.test.ts tests/unit/screens/settingsModelsScreens.test.ts tests/unit/shell/appShell.test.ts tests/unit/theme/modelLabThemeTokenContract.test.ts tests/unit/i18n/localization.test.ts tests/unit/i18n/localizationCoverage.test.ts
$env:TALOS_RUN_HF_UPSTREAM='1'; npx vitest run tests/integration/huggingFaceOAuthUpstream.integration.test.ts; Remove-Item Env:TALOS_RUN_HF_UPSTREAM
npx playwright test tests/e2e/mobile-model-lab-oauth.e2e.spec.ts tests/e2e/mobile-model-lab-navigation.e2e.spec.ts --workers=1
npm run typecheck
npm run test:unit
npm run build
Push-Location android; .\gradlew.bat test; Pop-Location
```

Da root:

```powershell
git diff --check
git diff --name-only
git status --short
```

Prova manifest/deep link sul seriale rilevato, dopo installazione della build:

```powershell
& $adb shell am start -W -a android.intent.action.VIEW -d "ai.talos://oauth/huggingface?code=invalid&state=invalid" ai.talos.dev
```

Questa sonda deve raggiungere l'app e mostrare un errore state-safe senza rete;
non è la prova OAuth end-to-end.

## 9. Gate upstream reale

Metadata pin iniziale:

- SHA-256 OIDC:
  `fc57107dcf0d8a09890016ea57bdde0ccda12227d49d014fbb48dbf270bae435`;
- authorize `https://huggingface.co/oauth/authorize`;
- token `https://huggingface.co/oauth/token`;
- PKCE method `S256`.

La guida HF dichiara supporto ai public client senza secret, mentre il metadata
pin non elenca `none` fra i metodi del token endpoint. Il gate live deve quindi
provare il token exchange public-client esatto; non si aggiunge un secret per
aggirare l'incoerenza.

Il test opt-in verifica metadata/config e una risposta di errore token
shape-safe. Non può sostituire il login umano. `GREEN UPSTREAM` richiede poi un
authorization code reale, token exchange riuscito e una chiamata HF autenticata
sul dispositivo. Mock e fixture non bastano.

## 10. Cancello visivo fisico

File obbligatori, non ritoccati e senza PII:

1. `phase-5/hf-oauth-ready.png` — card con azione reale configurata, nessun
   token/ID;
2. `phase-5/hf-oauth-connected.png` — ritorno dal browser, stato **Connesso**
   senza username/e-mail;
3. `phase-5/hf-oauth-disconnected.png` — disconnect reale completato, token
   OAuth non più effettivo;
4. `phase-5/manifest.md` — registra che il consenso browser è avvenuto ma non
   include account, URL callback, code, state o token.

Il browser di consenso non viene catturato: potrebbe contenere identità
personale. Il manifest annota verifica umana dell'apertura nel browser di
sistema. Le tre catture app devono provenire dalla stessa build/sessione
controllata e il connected state deve essere supportato da una chiamata upstream
autenticata riuscita registrata senza secret.

Solo allora la fase può diventare `GREEN DEVICE` e `IMPLEMENTED`.

## 11. Prova umana e one-up

Baseline PocketPal: token Hugging Face manuale in keychain. One-up L2: PKCE
pubblico nel browser di sistema, fallback manuale intatto, sessione e failure
state espliciti dentro lo stesso hub provider/local.

Domanda: “posso connettermi senza incollare un token e posso scollegarmi sapendo
che la credenziale non resta attiva?”

## 12. Rollback e revoca

Non esiste un endpoint revocation nel metadata pin: disconnect cancella la
sessione locale e l'effettività del token; il manifest lo dichiara senza
promettere revoca server. Il rollback disabilita `available` e conserva token
manuale/route/UI. Intent filter e record OAuth possono essere rimossi con patch
mirata soltanto dopo aver pulito la sessione sul dispositivo di test. Nessuna
chiave viene stampata per il rollback.

## 13. Registro emendamenti

Nessun emendamento al momento della stesura. Il client pubblico mancante è un
gate esterno noto, non un elemento da riempire con un valore demo.
