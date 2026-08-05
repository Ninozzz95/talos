# Passaggio di consegne TALOS mobile — Model Lab, 2026-08-04

**Lane posseduta:** `mobile` soltanto; nessuna ownership desktop.
**Branch:** `lane/talos-mobile`
**HEAD base incorporato nell'APK Fase 2:** `3b6a4fbc2e051b5f2769eed4176353c91174b50b`
**Relazione con origin prima del commit Fase 2:** 1 ahead / 0 behind.
**Stato programma Model Lab:** Fasi 1 e 2 IMPLEMENTED; F2-RED-01…20,
regressioni, nuova APK e sei prove fisiche sono verdi. Fase 3 è la prossima.

Questo è il punto di ripresa autosufficiente per Claude/Codex. Se contraddice
un ledger più recente o il codice, vince l'evidenza fresca; il ledger va
emendato prima di modificare comportamento.

---

## 0. Leggere in quest'ordine

1. `mobile/docs/superpowers/specs/2026-08-04-model-lab-mobile-hub-design.md`
2. `mobile/docs/superpowers/research/2026-08-04-model-lab-mobile-hub-research.md`
3. `mobile/docs/superpowers/plans/2026-08-04-model-lab-mobile-hub-plan.md`
4. il ledger della fase corrente:
   `mobile/docs/superpowers/ledgers/2026-08-04-model-lab-phase-3-hugging-face-filters-ledger.md`
5. `mobile/docs/superpowers/evidence/model-lab/README.md`
6. `mobile/docs/superpowers/COMPETITIVE-ONE-UP-DOCTRINE.md`

Non partire dal vecchio racconto “Modelli locali” di questo file: è stato
sostituito perché due sue affermazioni erano diventate false.

---

## 1. Decisione approvata dall'owner

Model Lab diventa una gerarchia mobile vera:

```text
Impostazioni
└── Model Lab                    /settings/models
    ├── Provider e accessi       /settings/models/providers
    ├── Catalogo modelli         /settings/models/catalog
    └── Modelli locali           /settings/models/local
        └── Dettaglio repo       /settings/models/local/:owner/:repo
```

Nell'hub c'è una sola scheda capacità dispositivo, sopra tre schede/link. Ogni
scheda apre una pagina dedicata. Le pagine figlie non ripetono il dispositivo e
non aggiungono un secondo Back nel body. Header Back e System Back leggono
`talosMobileParentRoute()`.

Il deep link storico `/settings?tab=models` resta e viene canonicalizzato con
`replace`. Model Lab esce dal `role=tablist` di Settings: tre destinazioni con
URL non sono tab APG.

L'intera UI Model Lab, esistente e nuova, deve usare al 100% il Theme Engine:
nessun colore, raggio, spazio, fallback o durata visuale locale. Il piano
introduce token semantici centrali di layout derivati da density/radius, con
touch target fisso a 48dp.

---

## 2. Regola di completamento, testuale e bloccante

Direttiva owner: una fase non si considera implementata finché non è stata
provata visivamente con screenshot dal dispositivo fisico collegato.

Stato formale:

```text
PLANNED → RED PROVEN → GREEN AUTOMATED → GREEN UPSTREAM → GREEN DEVICE → IMPLEMENTED
```

Ogni fase ha nomi PNG prescritti e un `manifest.md` con HEAD, dirty paths, hash
APK, seriale/modello, Android, pixel/viewport/DPR, tema/mode/density/radius,
route, scenario, timestamp, SHA-256 PNG ed esito. `Defects` deve essere `none`.

Typecheck, test, build, Playwright, CDP e screenshot desktop non sostituiscono
il gate. Una build vecchia non vale. Se il device manca, la fase resta al
massimo `GREEN UPSTREAM`.

Gli screenshot Model Lab prescritti sono documentazione tracciata sotto
`mobile/docs/superpowers/evidence/model-lab/`; non devono contenere token, code,
state, verifier, username, e-mail o altri dati personali.

---

## 3. WIP preesistente: non scartare

Cinque file prodotto erano già modificati quando questa sessione ha iniziato:

1. `mobile/src/lib/models/browseFilters.ts`
2. `mobile/src/lib/models/catalogue.ts`
3. `mobile/src/lib/models/fit.ts`
4. `mobile/src/lib/models/fitBadge.ts`
5. `mobile/src/lib/models/sizeFromName.ts`

Erano il lavoro interrotto di Claude sul disco come vincolo distinto dalla RAM.
Sono stati integrati e verificati nella Fase 1; restano parte intenzionale del
commit di fase. Non resettarli, non fare checkout e non nasconderli in stash.

`.codex/` era già non tracciato ed è fuori ambito.

La sessione esecutiva ha completato il WIP con TDD, gate Hugging Face reale,
build Android e prova fisica; il dettaglio autorevole è nel ledger Fase 1.

---

## 4. Baseline RED reale

Eseguita prima della stesura del piano:

```text
npm run typecheck
```

Fallisce perché:

- `TalosMobileLocalModels.vue` importa `talosEstimatedBand`, ormai eliminato;
- due chiamanti passano storage nullable a formatter non nullable;
- `browseFilters.ts` passa un numero dove ora serve `TalosFilterDevice`.

Suite focalizzata:

```text
npx vitest run modelFit browseFilters catalogue fitBadge sizeFromName huggingFaceBrowse
```

Risultato osservato: 4 file passati, 2 falliti; 61 test passati, 3 falliti.

Difetti:

- un 30B passa erroneamente **Gira qui**;
- Code+Fits include erroneamente lo stesso 30B;
- `sizeFromName.test.ts` chiama `talosEstimatedBand` non più esportata.

Il precedente claim “3546 test verdi / build verde” descriveva HEAD prima del
WIP e non è il baseline corrente.

---

## 5. Correzioni fattuali che non vanno riscoperte

### Disco e RAM

Il plugin Android espone già `getAllocatableBytes`; il trasporto nativo riserva
spazio. Il buco è nei percorsi di browse/catalogo/filtro e nel fatto che zero
plugin viene propagato invece di diventare `null`.

Il verdetto centrale deve essere discriminato:

```text
unknown | fits | tight | memory-blocked | storage-blocked
```

Storage considera sempre 1 GiB di riserva e viene giudicato prima della RAM.
Unknown non passa il filtro positivo e si mostra **Da verificare**.

### `gguf.totalFileSize` non è la variante

Probe reale `unsloth/Qwen3.5-4B-GGUF`, revision
`e87f176479d0855a907a41277aca2f8ee7a09523`:

- `gguf.totalFileSize`: 8.424.393.632 byte;
- Q4_K_M reale: 2.740.937.888 byte;
- SHA-256 Q4_K_M:
  `00fe7986ff5f6b463e62455821146049db6f9313603938a70800d1fb69ef11a4`.

Quindi il vecchio handoff sbagliava quando chiamava `totalFileSize` “byte esatti
della variante”. La Fase 1 espande siblings, seleziona Q4 in modo deterministico
e mantiene `paths-info` come autorità esatta nel dettaglio/download.

### Fixture visive dei due muri

Storage-blocked:

- `bartowski/Meta-Llama-3.1-70B-Instruct-GGUF`;
- revision `83fb6e83d0a8aada42d499259bc929d922e9a558`;
- Q4_K_M 42.520.398.400 byte.

Memory-blocked dopo disco:

- `bartowski/Qwen2.5-32B-Instruct-GGUF`;
- revision `2116cbb385b8ce3a4d28cf3bf1cd2039a55821a6`;
- Q4_K_M 19.851.336.576 byte.

---

## 6. Stato delle cinque fasi

| Fase | Stato | Esito | Evidenza fisica minima |
|---|---|---|---|
| 1 · Capienza/HF | IMPLEMENTED | verdict unico, variante Q4, boundary/revision chiusi | storage + memory sulla APK `94b68d…` |
| 2 · Hub/Theme | IMPLEMENTED | hub, 3 route, device unico, token-only, ingresso unico sotto Settings | 6 PNG sulla APK `b6a24b…` |
| 3 · Filtri | PLANNED | filtri veri, provider stabile, access card | combinazione + zero-state + HF access |
| 4 · Coerenza/scala | PLANNED | dettaglio route, righe compatte, catalogo 40/+40 | Local + detail + catalog 40/80 |
| 5 · OAuth | PLANNED/BLOCKED esterno | HF PKCE reale; altri provider motivati | ready + connected + disconnected |

L'ordine è rigido. La Fase 3 parte soltanto dopo il commit locale della Fase 2.
Ogni ledger enumera file, simboli, RED, comandi, upstream, screenshot e rollback.

### Chiusura osservata Fase 2

- il vecchio pannello a tre tab è eliminato; `/settings/models` è un hub con una
  scheda dispositivo e tre route figlie lazy;
- il duplicato segnalato dall'owner è chiuso da F2-RED-20: il drawer espone solo
  `Impostazioni`, mentre il Centro impostazioni contiene un solo
  `settings-model-lab-link`; le scorciatoie contestuali chat restano;
- 3593 test unitari passano, 9 sono saltati; il batch E2E esteso passa 37/37;
- build web, parity, `cap sync`, test Android e assemble side-by-side sono verdi;
- APK: 31103284 byte, timestamp `2026-08-05T05:51:21.7394103Z`, SHA-256
  `b6a24bc695127aaf912719f6a4d102e3f484aef71ddecc8d73fd32438406aa3d`;
- cinque prove a 360×792 CSS/DPR 3 e una a 914×1292/DPR 2.625 sono tracciate
  in `mobile/docs/superpowers/evidence/model-lab/phase-2/manifest.md`;
- account originale e geometria tablet 2400×3392/density 420 sono ripristinati;
  nessun override ADB resta attivo;
- i due reviewer dedicati non hanno prodotto output perché bloccati in
  `pending_init` dal limite crediti del workspace; il main agent ha eseguito
  l'audit completo. Il batch indipendente obbligatorio della Fase 5.5 resta da
  ritentare e non è considerato soddisfatto da questo fallback.

---

## 7. Filtri Hugging Face decisi

- **Gira qui**: verdict centrale noto; RAM e disco entrambi compatibili.
- **Chat**: tag conversational oppure chat template GGUF; pipeline da sola non
  basta.
- **Orientato al codice**: euristica TALOS dichiarata; HF non ha facet canonica.
- **Q4**: sibling/quantizzazione, non nome repository.
- **Licenza permissiva dichiarata**: allowlist conservativa; unknown, other,
  OpenRAIL, Llama e custom non passano.
- combinazioni AND.
- provider selector da risultati non filtrati + valore corrente, così non
  sparisce.
- zero-state con **Reimposta filtri**.
- download label **ultimi 30 giorni**.

Il form token Hugging Face si sposta da Locale a Provider e accessi nella Fase
3, mantenendo il secure store.

---

## 8. Theme Engine deciso

Nuove CSS properties centrali:

```text
--talos-space-page
--talos-space-section
--talos-space-card
--talos-space-control
--talos-space-inline
--talos-icon-size
--talos-touch-target
--talos-radius-card
--talos-radius-control
```

Sono applicate da `applyTalosMobileDesignTokens()`, con default di boot in
`style.css`. Un test statico legge l'elenco esatto delle surface Model Lab e
fallisce su colori letterali, fallback locali, classi Tailwind visuali con
spazio/raggio/durata e ombre/moto non tokenizzati. Test runtime coprono 14
identity, light/dark, density/radius e reduced motion.

---

## 9. OAuth: decisione e blocco

Hugging Face supporta client pubblico, Authorization Code + PKCE S256 e device
flow. Su smartphone il percorso primario è browser di sistema; niente WebView
embedded. Callback scelta:

```text
ai.talos://oauth/huggingface
```

Scope minimo: soltanto `gated-repos`. `openid`, `profile` ed `email` sono fuori
perché questa è autorizzazione a leggere pesi gated, non identità account;
acquisirebbero PII inutile. Pending state/verifier e token restano nel secure
store, namespace distinto dalla chiave manuale. App gestisce warm `appUrlOpen`
e cold `getLaunchUrl`.

Manca ancora un client pubblico registrato dall'owner e quindi
`VITE_TALOS_HF_OAUTH_CLIENT_ID`. Non inventarlo. La registrazione deve anche
provare che HF accetti `ai.talos://oauth/huggingface`: la guida parla di app
native ma non garantisce esplicitamente i private-use URI. Inoltre la guida
dichiara public client senza secret mentre il metadata OIDC non pubblicizza
`token_endpoint_auth_method=none`; il token exchange reale è un gate. Senza
queste prove, la Fase 5 è bloccata e la UI deve dirlo onestamente.

OpenRouter è differito perché documenta callback HTTPS/localhost, non custom
scheme Android. Gemini richiede un progetto identità separato. OpenAI,
Anthropic e DeepSeek non offrono per questo caso un sign-in end-user equivalente
alle loro API key; Ollama locale non richiede auth. Non creare OAuth per
analogia.

L'OAuth Google/Apple di `account.ts` è sincronizzazione account TALOS e resta
fuori ambito.

---

## 10. Device collegato e cattura

ADB non è nel `PATH`, ma esiste qui:

```text
C:\Users\Antonino\AppData\Local\Android\Sdk\platform-tools\adb.exe
```

Il telefono OnePlus osservato in ricognizione è stato scollegato dall'owner
durante la Fase 1 e viene sostituito da un tablet fisico. I dati seguenti sono
quindi storici e non devono essere riusati nel manifest del tablet:

- seriale `3B1F6DE8WTX78PET`, stato `device`;
- OnePlus `PJZ110`;
- Android 16 / API 36;
- 1080×2376 fisici;
- density override 480;
- viewport atteso 360×792, DPR 3.

Usare build side-by-side `-PtalosSideBySide` (`ai.talos.dev`) per non
disinstallare o sovrascrivere l'app/dati dell'owner. Sul tablet, registrare
prima size/density native; per il gate telefonico applicare soltanto
temporaneamente un override equivalente a 360×792 CSS, catturare via ADB e
ripristinare sempre i valori originali. Verificare anche il layout tablet
nativo con la stessa build. Il protocollo completo è nel README evidenze.

Gate Fase 1 eseguito sul sostituto reale: OnePlus OPD2415, seriale `2ea6573c`,
Android 16/API 36, 2400×3392/density 420 nativi. L'override temporaneo
1080×2376/density 480 ha prodotto 360×792 CSS/DPR 3; dopo le due prove il
tablet è stato riconfermato a geometria nativa, rotazione automatica attiva.
La prova sostitutiva usa l'APK SHA-256 `94b68dbf…174dc3f`; screenshot storage
`7515693d…9fca52` e memory `0282e9ea…12e466`.

Gate Fase 2 eseguito sullo stesso tablet con APK SHA-256 `b6a24bc6…06aa3d`.
L'override telefono 1080×2376/density 480 ha prodotto 360×792 CSS/DPR 3; dopo
cinque catture è stato rimosso. Un cold start a geometria nativa ha provato il
layout 914×1292 CSS/DPR 2.625 e il contrasto della status bar Paper/chiaro.
Stato finale verificato: 2400×3392, density 420, nessun override.

---

## 11. Pacco d'avvio e catalogo

Misura fresca Fase 2: pacco JavaScript iniziale 599.681/600.000 byte e CSS
iniziale 203.928/220.000 byte; typecheck, parity ledger e build sono verdi.
Restano soltanto 319 byte di margine JavaScript iniziale: le fasi UI non
devono aggiungere import al bootstrap senza prima spostarli dietro lazy route.

Il catalogo corrente rende 476 card, circa 141.839 CSS px. La Fase 4 usa 40
iniziali e +40 tramite **Mostra altri**, senza nuova dipendenza. Search/provider
resettano a 40 e l'ultimo elemento resta raggiungibile.

---

## 12. Ricerca upstream già eseguita

Pin nel dossier:

- HF OpenAPI SHA-256 canonico
  `92e1d8823c21541a993b28d0453b868bd0e42099d1090746a97ac3b84a8489f1`;
- HF OIDC SHA-256
  `fc57107dcf0d8a09890016ea57bdde0ccda12227d49d014fbb48dbf270bae435`;
- PocketPal `4f1ba9bdb32b0b4fbb2c0b6bb8f9cbb0b21da1bc`;
- Jan `ac663e6675a81684b5509c1888bd5c1fd5d940f1`;
- Chatbox `f90fc31afd634494bdf8f074eca3e38fcf8da740`.

Il raw OpenAPI non è pinnabile: genera a ogni fetch un nome repo casuale e tre
timestamp default, quindi ETag e SHA cambiano pur senza drift strutturale. Il
dossier nomina i quattro JSON Pointer e l'algoritmo canonico; non ripristinare
un hash raw come gate.

Decisione one-up: browse/detail e warning file sono baseline L1; verdict live
unico + filtri veri + Theme Engine sono L2; l'intersezione cloud BYOK, modelli
rivali locali, fit e agent tools è il differenziale prodotto L3. Non fare claim
prestazionali senza benchmark.

---

## 13. Spedizione whole-app obbligatoria dopo Fase 5

Prima del go-out finale, il main agent crea ed esegue autonomamente un piano
estensivo di esplorazione dell'intera applicazione sul dispositivo fisico. Deve
agire come un utente umano e coprire chat multi-turno, ricerca, memoria,
file/libreria, impostazioni, provider, Model Lab, navigazione, persistenza,
reload/cold start, background/foreground, failure di rete, sessioni scadute,
accessibilità, Theme Engine, viewport tablet nativo e telefono emulato, più
stress su contenuti lunghi, liste e azioni ripetute.

Prima dello stress test, un preflight a batch dispatcha reviewer read-only per
ogni area funzionale e bug tester separati per UI responsive e comportamento.
I subagent non implementano e non modificano piani: il main agent deduplica e
conferma ogni finding, apre il relativo RED, implementa il fix e ne possiede la
prova automatizzata e fisica.

Prima dell'esecuzione vanno creati spec, piano lowest-level, ledger, matrice di
copertura e protocollo evidenze tracciati. Ogni bug scoperto diventa scenario
nominato, test permanente, fix e nuova prova fisica. Il go-out non parte con
difetti aperti; un boundary esterno non disponibile viene dichiarato, mai
simulato. Requisito completo nella sezione 5.5 del piano master.

Direttiva owner 2026-08-05: alla fine della Fase 5 deve essere compilata dal
tree completo una APK side-by-side e ne va lasciata una copia con nome univoco
sul Desktop. Percorso, byte, timestamp UTC e SHA-256 entrano nel manifest e in
questo handoff. Non basta l'APK intermedia usata per una fase precedente e non
è autorizzato alcun push.

---

## 14. Regole operative per la prossima sessione

1. Ownership solo `mobile`.
2. Main agent implementa; subagent soltanto test focalizzati/review meccanica.
3. Ricontrollare fonte/pin prima della modifica della fase.
4. Riprodurre RED prima del codice.
5. Emendare inventario/ledger prima di toccare un file non elencato.
6. Nessun nuovo package senza ricerca, pin, licenza e bundle gate.
7. L'owner ha autorizzato un commit locale dopo ogni fase verde; nessun push.
8. Non scartare modifiche preesistenti.
9. Non chiamare una fase implementata senza PNG+manifest fisici.
10. Aggiornare questo handoff a ogni pausa con numeri veri.

### Prossima azione esatta

Creare il commit locale della Fase 2 senza push. Poi rileggere completamente il
ledger Fase 3, riconfermare i pin Hugging Face correnti, emendare il ledger se
l'ispezione invalida un file previsto e provare il primo RED sui cinque filtri.
Non modificare la lane desktop.

---

## 15. Cosa resta fuori

- lane desktop;
- maschera/segmentazione immagini;
- runtime llama.cpp e download center completo;
- accettazione licenze gated in-app;
- OAuth account TALOS e backend credenziali;
- cursore a metà parola, debito già accettato dall'owner;
- push remoto; i commit locali di fase sono autorizzati soltanto dopo il gate
  fisico verde.
