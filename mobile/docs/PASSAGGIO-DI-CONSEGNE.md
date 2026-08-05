# Passaggio di consegne TALOS mobile — Model Lab, 2026-08-04

**Lane posseduta:** `mobile` soltanto; nessuna ownership desktop.
**Branch:** `lane/talos-mobile`
**HEAD base incorporato nell'APK Fase 4:** `11156fd1456c7289395c9e9ef8ca5a79af3a352b`
**Stato tree:** modifiche Fasi 3 e 4 presenti e verificate nella lane mobile;
`.codex/` resta fuori scope.
**Stato programma Model Lab:** Fasi 1–4 IMPLEMENTED. F4-RED-01…15, suite,
upstream, APK e quattro prove fisiche sono verdi; l'APK Fase 4 è sul Desktop.
La tranche correttiva pre-Fase 5 è `IN PROGRESS — SLICE A GREEN DEVICE +
REVIEW`: Settings, Download Center, compattezza locale, policy contesto e
matrice GGUF sono congelati nei documenti del 2026-08-05; la prima slice ha
test, review, build e prove fisiche verdi. Fase 5 non è iniziata ed è `DEFERRED` per
decisione owner: il dominio necessario ai callback OAuth verrà reso disponibile
in seguito.

Questo è il punto di ripresa autosufficiente per Claude/Codex. Se contraddice
un ledger più recente o il codice, vince l'evidenza fresca; il ledger va
emendato prima di modificare comportamento.

---

## 0. Leggere in quest'ordine

1. `mobile/docs/superpowers/research/2026-08-05-model-lab-corrective-tranche-research.md`
2. `mobile/docs/superpowers/specs/2026-08-05-model-lab-download-center-local-compatibility-design.md`
3. `mobile/docs/superpowers/plans/2026-08-05-model-lab-corrective-tranche-plan.md`
4. `mobile/docs/superpowers/ledgers/2026-08-05-model-lab-corrective-tranche-ledger.md`
5. `mobile/docs/superpowers/specs/2026-08-04-model-lab-mobile-hub-design.md`
6. `mobile/docs/superpowers/research/2026-08-04-model-lab-mobile-hub-research.md`
7. `mobile/docs/superpowers/plans/2026-08-04-model-lab-mobile-hub-plan.md`
8. il ledger dell'ultima fase chiusa:
   `mobile/docs/superpowers/ledgers/2026-08-04-model-lab-phase-4-mobile-coherence-catalog-ledger.md`
9. per la sola valutazione owner, non per esecuzione automatica:
   `mobile/docs/superpowers/ledgers/2026-08-04-model-lab-phase-5-provider-oauth-ledger.md`
10. `mobile/docs/superpowers/evidence/model-lab/README.md`
11. `mobile/docs/superpowers/COMPETITIVE-ONE-UP-DOCTRINE.md`

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

## 6. Stato del programma

| Fase | Stato | Esito | Evidenza fisica minima |
|---|---|---|---|
| 1 · Capienza/HF | IMPLEMENTED | verdict unico, variante Q4, boundary/revision chiusi | storage + memory sulla APK `94b68d…` |
| 2 · Hub/Theme | IMPLEMENTED | hub, 3 route, device unico, token-only, ingresso unico sotto Settings | 6 PNG sulla APK `b6a24b…` |
| 3 · Filtri | IMPLEMENTED | filtri veri, provider stabile, access card sicura, header responsive | 3 PNG sulla APK `c6716d…` |
| 4 · Coerenza/scala | IMPLEMENTED | dettaglio deep-link, righe compatte, catalogo 40/+40; APK Desktop consegnata | 4 PNG sulla APK `085e98…` |
| 4.C · Correttiva | IN PROGRESS — SLICE A GREEN DEVICE + REVIEW | Settings sotto account provato e review chiusa; Download Center, rail single-line, runtime tipizzato e matrice GGUF seguono | 2/13 PNG finali Slice A + manifest tracciati |
| 5 · OAuth | DEFERRED — OWNER DECISION / NO DOMAIN | in futuro tutti i provider con OAuth ufficiale compatibile; HF solo `gated-repos` | da ripianificare dopo dominio |

L'ordine è rigido: prima si chiude 4.C con prove fisiche e matrice sequenziale;
la Fase 5 riparte soltanto quando esiste il dominio e dopo una nuova
autorizzazione esplicita dell'owner. Ogni ledger enumera file, simboli, RED,
comandi, upstream, screenshot e rollback.

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

### Chiusura osservata Fase 3

- filtri Chat, Code, Q4, licenza e fit hanno autorità esplicite e combinazione
  AND; publisher e zero-state non collassano i controlli;
- token Hugging Face vive soltanto in Provider e accessi, resta nel secure
  store e il form non conserva il draft prima di una `await`;
- F3-RED-13 ha chiuso “1 modelli”; F3-RED-14 ha corretto la card HF compressa
  scoperta dalla prima cattura fisica;
- 3616 test unitari passano, 10 sono saltati; E2E Model Lab 11/11 e gate HF
  live 3/3;
- build/parity/chunk, `cap sync`, test Android e assemble side-by-side sono
  verdi; APK 30351219 byte, timestamp `2026-08-05T06:51:12.7828897Z`, SHA-256
  `c6716d11f013ba9df1c5834ce145de8c79cdc2d607cb3be1883ceb1ad9fcea45`;
- tre prove a 360×792 CSS/DPR 3 sono tracciate in
  `mobile/docs/superpowers/evidence/model-lab/phase-3/manifest.md`;
- geometria 2400×3392/density 420 e auto-rotazione sono ripristinate; cold
  start tablet verificato a 914×1292/DPR 2.625.

### Chiusura osservata Fase 4

- Catalogo progressivo puro: 40 righe iniziali e 80 dopo **Mostra altri** su
  479 profili scoperti, ID unici, ordine stabile e totale globale preservato
  sotto filtro;
- Modelli locali in righe compatte; dettaglio repository su route nominata con
  owner/repo e revision, reload/deep link reale, un solo Back di header e nessun
  device duplicato;
- README pulito e collassabile, titolo multilinea, 27 set di varianti reali e
  controlli telefonici in una colonna senza collisioni;
- lifecycle Back e pausa/ripresa sono nello store: una risposta HF tardiva non
  risuscita il dettaglio e il trasferimento conserva target/file/byte/hash;
- 3633 test unitari passano, 10 sono saltati; E2E Model Lab 13/13 e gate HF live
  3/3;
- typecheck, build/parity/chunk, `cap sync`, test Android e assemble
  side-by-side sono verdi; JS iniziale 599981/600000 byte, CSS
  205078/220000 byte;
- APK: 30574412 byte, timestamp `2026-08-05T08:01:08.0928758Z`, SHA-256
  `085e98242359d7bd03d5c2408eb638859f9421112ec92f8b31b264ccbb272e32`;
- copia consegnata:
  `C:\Users\Antonino\Desktop\TALOS-mobile-phase-4-20260805.apk`;
- quattro PNG finali a 360×792 CSS/DPR 3, metriche DOM e hash sono nel
  `mobile/docs/superpowers/evidence/model-lab/phase-4/manifest.md`;
- geometria ripristinata a 2400×3392/density 420 e auto-rotazione attiva; il
  forward task-owned `tcp:9222` è rimosso, mentre un diverso `tcp:9223` non
  creato dalla cattura è stato preservato;
- nessun commit e nessun push; il divieto root `AGENTS.md` prevale sulla
  precedente autorizzazione owner al commit locale.

### Tranche correttiva 4.C aperta il 2026-08-05

L'owner ha aperto una tranche obbligatoria prima di OAuth:

1. Model Lab va sotto il nome utente, prima voce del gruppo Intelligenza;
2. un'icona download globale apre un Download Center reale in chat, drawer,
   Model Lab e tablet;
3. lista locale e dettaglio repo diventano ulteriormente compatti;
4. tutti i chip filtro restano su una sola riga orizzontale scorrevole;
5. il caso `TALOS_LLAMA_OPEN_FAILED` viene chiuso con policy contesto unica,
   failure tipizzato e prova chat reale;
6. una matrice HF revision/hash-pinned prova in sequenza SmolLM2, Qwen3, LFM2,
   Granite, Phi-3, Llama 3.2 e Gemma 3 gated condizionale, un file temporaneo
   alla volta e senza cancellare i modelli owner.

La ricerca primaria, il design, il piano e il ledger lowest-level sono già
tracciati nei quattro documenti 2026-08-05 indicati nella sezione 0.

Slice A è GREEN automated/upstream/review/device ed è formalmente promossa:

- Settings rende Account per primo e il gruppo Intelligenza subito sotto;
- Laboratorio modelli è la prima riga del gruppo, sopra Predefiniti AI e
  Strumenti agente;
- telefono e tablet usano entrambi `nav`/`region`, senza finto tablist o roving
  arrow-key model;
- il reviewer read-only ha rilevato tre Important e zero Critical: token Tema
  rigidi sulla nuova riga, focus browser non provato e side-by-side tablet non
  misurato; tutti e tre sono diventati scenari permanenti C45-RED-01A/02A/02B;
- review RED 2/22, review GREEN 22/22, suite Settings + Theme Engine 29/29 e
  browser 13/13 sul `dist` ricostruito;
- build 599981/600000 byte startup, Gradle 591 task e installazione fisica
  `ai.talos.dev` verdi;
- APK post-review: 30574433 byte, SHA-256
  `7477f92d913f29bae3c8db27aa5970c9a9123f47ef7d1e1d5ea78181c32db588`;
- screenshot fisici `corrective/settings-intelligence-phone.png` e
  `settings-intelligence-tablet.png` ispezionati e hashati nel manifest;
- geometria 2400×3392/density 420 e stato account ripristinati; soltanto il
  forward owner `tcp:9223` resta presente.

Il test corrente sui filtri impone ancora il wrapping: è il RED della Slice C
da invertire, non un comportamento da preservare. Le Slice B–E non sono ancora
state toccate da questa sessione correttiva.

Addendum owner 2026-08-05, già inserito in piano e ledger ma non ancora
implementato: nella Slice C la card Hugging Face deve adottare lo stesso
accordion/logo dei provider API key; i cambi route interni Model Lab devono
avere motion TALOS con reduced-motion; `Su questo dispositivo` deve essere
assente dopo una scansione valida a zero modelli e presente soltanto con almeno
un modello. Prima del RED serve l'addendum di ricerca primaria indicato nel
piano. `App.vue` è autorizzato soltanto per quel boundary motion, non per il
Download Center.

Mini-fix owner 2026-08-05, registrata e ricercata ma non ancora implementata:
la riga attività chat non deve mostrare il wire identifier `memory_write`.
L'ispezione ha isolato il difetto in `lib/tools/toolLabels.ts`: il renderer usa
già il registro corretto, ma la factory memory-write manca sia dalle mappe
label/key/icona sia dalla guardia `EVERY tool`. Scenario permanente
`C45-RED-09D`: aggiungere copy naturale IT/EN tramite `vue-i18n` 11.4.8,
conservare l'ID tecnico soltanto nei contratti/trace e chiudere con vera chiamata
memory-write più screenshot fisico `chat-memory-write-natural.png`. La ricerca
primaria e la decisione ADAPT sono nella sezione 10 del dossier correttivo.

Addendum Slice B 2026-08-05: il Download Center non è più limitato a un solo
record. Contratto owner: massimo **due download attivi**, richieste ulteriori in
coda durevole, controlli Pausa/Riprendi/Annulla nella riga del modello e nessuna
azione globale ambigua. La ricerca primaria e la decisione ADAPT sono nella
sezione 13 del dossier; design, piano e ledger sono emendati prima del prodotto.
La campagna di compatibilità famiglie resta separata e sequenziale.

Correzione baseline owner 2026-08-05: l'owner ha cancellato personalmente tutti
i GGUF dal dispositivo. Zero modelli locali è quindi stato atteso, non un bug di
TALOS e non evidenza di cancellazione automatica. Ogni gate successivo fotografa
l'inventario iniziale e pulisce soltanto i target temporanei nominati.

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

Il form token Hugging Face è ora soltanto in Provider e accessi e mantiene il
secure store.

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

Decisione owner 2026-08-05:

- quando riprenderà, OAuth coprirà tutti e soltanto i provider la cui
  documentazione ufficiale corrente descriva un flusso realmente implementabile
  in TALOS mobile;
- ogni provider dovrà supportare un client native/pubblico senza secret
  nell'APK, callback sul dominio verificato e prova end-to-end reale;
- per Hugging Face il permesso resta soltanto `gated-repos`; niente
  `openid`, `profile` o `email` senza nuova esigenza approvata;
- provider documentati soltanto con token/API key restano manuali: non creare
  OAuth per analogia;
- ogni wire provider resta dietro un adapter TALOS e usa minimo privilegio.

Il dominio non è disponibile adesso e verrà introdotto in seguito. Di
conseguenza il precedente custom scheme `ai.talos://oauth/huggingface` non è più
il callback scelto: l'esatto HTTPS App Link sarà definito solo quando il dominio
esisterà. La Fase 5 è rinviata integralmente; nessun pulsante OAuth finto,
client ID demo, RED o modifica prodotto viene aggiunto. Token e API key manuali
restano il comportamento reale.

Alla ripresa si rifanno da zero la matrice provider sulle fonti ufficiali, i
callback, gli scope e il ledger lowest-level. La bozza HF-only del 2026-08-04 è
conservata nel ledger come analisi storica ma non è più eseguibile.

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

Misura finale Fase 4: pacco JavaScript iniziale 599981/600000 byte e CSS
iniziale 205078/220000 byte; gzip 193253/31361. Typecheck, parity ledger e build
sono verdi. Restano 19 byte di margine JavaScript: non aggiungere import al
bootstrap; il dettaglio locale e i locali i18n restano lazy.

La baseline Fase 4 montava 479 card e misurava 171838 CSS px. Il GREEN monta 40
righe iniziali a 9812 px e +40 a 19453 px tramite **Mostra altri**, senza nuova
dipendenza. Search/provider resettano a 40, l'ordine resta stabile e il
denominatore globale non cambia sotto filtro.

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

### RTK globale — installato e verificato il 2026-08-05

Direttiva owner aggiunta durante la chiusura Fase 4 e già soddisfatta:

- release stabile ufficiale `rtk-ai/rtk` v0.44.2, commit
  `700bdde3343299ea06bbca18dc6670a80c88b289`;
- ZIP Windows verificato in memoria contro il digest release
  `3a1e114edce9080f8a10663e9c87488363a82f14a5ca8aab2ad416817f89d47c`;
- entrambe le copie installate coincidono con `rtk.exe` dell'archive ufficiale,
  SHA-256
  `60640b970fdf10451813ab4d9d24deb5c6370e43a5192eb14c6ba101a15b633c`;
- Codex configurato globalmente con `rtk init -g --codex`: esistono
  `C:\Users\Antonino\.codex\RTK.md` e il riferimento assoluto nel relativo
  `AGENTS.md`;
- Claude configurato con `rtk init -g --auto-patch`: hook nativo
  `rtk hook claude`, backup automatico delle impostazioni e valori esistenti
  preservati;
- `rtk --version`, `rtk gain`, i due `init --show` e
  `rtk git status --short` sono verdi sul repository AVM.

Riavviare la nuova sessione Codex/Claude per caricare integralmente
istruzioni/hook. RTK è tooling globale: non modifica il prodotto mobile e non
autorizza la Fase 5.

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

Direttiva owner rafforzata 2026-08-05: non trattare questa fase come smoke test.
Prima di costruire il piano esecutivo si svolge ricerca web corrente su fonti
primarie/standard di exploratory, negative, state-transition, reliability,
stress, accessibilità e Android quality testing. Sul dispositivo fisico opera
un solo agente alla volta: acquisisce stato/fixture, prova la propria charter,
allega screenshot e log sanitizzati, ripristina e consegna al successivo. Il
batch può essere parallelo soltanto per review read-only senza device.

La matrice deve enumerare ogni controllo, prompt fisso, dialogo, menu, gesture,
route e stato. Per ogni voce si prova l'azione e il contrario/compensatore:
apri/chiudi, conferma/annulla, abilita/disabilita, concede/nega/revoca,
start/pausa/riprendi/cancella, salva/scarta, valido/invalido/vuoto/limite,
online/offline/reconnect, successo/failure/retry e persistenza dopo reload.
Ogni classe di prompt libero usa un corpus versionato di input umani, typo,
ambiguità, follow-up, correzioni, estremi e prompt metamorfici/opposti. Devono
essere provati anche doppi tap, tap rapidi, scroll durante lavoro,
background/foreground, interruzioni e Back nei punti intermedi.

Gate numerico minimo: 100% dei controlli inventariati, 100% delle coppie
azione/contrario e 100% del corpus prompt hanno un esito/evidenza esplicito;
zero difetti aperti. Azioni distruttive soltanto su fixture isolate: modelli,
file, account e dati dell'owner non si cancellano né si riscrivono.

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

Direttiva owner successiva 2026-08-05: produrre anche un APK side-by-side alla
chiusura della Fase 4 e copiarlo sul Desktop con nome univoco. La valutazione
Fase 5 è ora conclusa con decisione di rinvio fino alla disponibilità del
dominio; nessuna sua implementazione è autorizzata nel frattempo.

---

## 14. Regole operative per la prossima sessione

1. Ownership solo `mobile`.
2. Main agent implementa; subagent soltanto test focalizzati/review meccanica.
3. Ricontrollare fonte/pin prima della modifica della fase.
4. Riprodurre RED prima del codice.
5. Emendare inventario/ledger prima di toccare un file non elencato.
6. Nessun nuovo package senza ricerca, pin, licenza e bundle gate.
7. Non committare e non pushare: il `AGENTS.md` root vieta commit dell'agente e
   prevale sulla precedente autorizzazione owner più permissiva.
8. Non scartare modifiche preesistenti.
9. Non chiamare una fase implementata senza PNG+manifest fisici.
10. Aggiornare questo handoff a ogni pausa con numeri veri.

### Prossima azione esatta

Non modificare OAuth e non toccare la lane desktop. La Slice A è chiusa GREEN;
continuare la Slice B Download Center dai RED multi-transfer, partendo dal
registro journal schema 2, dal dispatcher a due slot, dall'isolamento per ID e
dallo store collection unico. Ogni difetto osservato va riprodotto come test
prima del fix.
Procedere una slice alla volta e non promuoverne nessuna senza screenshot del
dispositivo fisico. Soltanto dopo C45-RED-01…21, campagna GGUF, suite, build e
manifest verdi, presentare il risultato all'owner. La Fase 5 continua comunque
ad attendere dominio e nuova decisione esplicita; token e API key manuali
restano attivi.

---

## 15. Cosa resta fuori

- lane desktop;
- maschera/segmentazione immagini;
- accettazione licenze gated in-app;
- OAuth account TALOS e backend credenziali;
- cursore a metà parola, debito già accettato dall'owner;
- commit e push remoto da parte dell'agente.
