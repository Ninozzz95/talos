# TALOS Mobile Model Lab Hub — piano implementativo in cinque fasi

> **Per gli agenti esecutori:** usare `superpowers:subagent-driven-development`
> nella sessione corrente oppure `superpowers:executing-plans` in una sessione
> separata. Nel repository AVM il main agent mantiene ownership di architettura,
> sicurezza, piano e implementazione; eventuali subagent possono soltanto
> eseguire test focalizzati o review meccaniche e non modificano codice o ledger.
> Ogni passo usa checkbox come stato persistente.

**Obiettivo:** trasformare Model Lab mobile in un hub telefonico con tre pagine
dedicate, un'unica capacità del dispositivo, filtri Hugging Face veri, catalogo
scalabile e OAuth provider valutato/implementato senza simulazioni.

**Architettura:** rotte Vue nominate e lineari; componenti provider/catalogo/local
riusati dietro screen dedicati; verdetto capienza puro e discriminato; metadati
Hugging Face normalizzati dietro contratti AVM; token semantici derivati dal
Theme Engine; OAuth provider futuro soltanto per flussi ufficiali compatibili
con native app, dietro adapter TALOS e callback su dominio verificato.

**Stack pin:** Vue 3.5.40, vue-router 5.2.0, Reka UI 2.10.1, Capacitor 8.4.2,
`@capacitor/app` 8.1.1, `@capacitor/inappbrowser` 4.0.1, secure storage 8.0.0,
Vite 7.3.6, Vitest 4.1.10, Playwright 1.61.1, TypeScript 5.9.3.

**Specifica approvata:**
`../specs/2026-08-04-model-lab-mobile-hub-design.md`
**Dossier upstream:**
`../research/2026-08-04-model-lab-mobile-hub-research.md`
**Protocollo evidenze:** `../evidence/model-lab/README.md`

---

## 0. Vincoli globali non negoziabili

- [ ] Operare soltanto nella lane `mobile`; nessun file desktop, core,
      validator o control-plane entra nel diff.
- [ ] Non scartare, riscrivere o nascondere il WIP preesistente nei cinque file
      di capienza.
- [x] Non creare commit né push: l'autorizzazione owner a un commit locale non
      supera il vincolo non negoziabile più restrittivo del `AGENTS.md` root
      (“Never commit on behalf of the user”).
- [ ] Prima di ogni modifica di comportamento, leggere integralmente il ledger
      della fase e riconfermare le fonti/pin che instrada.
- [ ] Ogni RED deve fallire per la ragione attesa prima del GREEN.
- [ ] Ogni regressione scoperta diventa scenario nominato e test permanente;
      prima si emenda il ledger, poi si modifica il prodotto.
- [ ] Nessun dato sintetico viene presentato come dispositivo, modello, byte,
      token o accesso reale.
- [ ] Nessun nuovo pacchetto senza emendamento esplicito, ricerca upstream,
      pin, licenza, impatto bundle e rollback.
- [ ] Ogni decisione visuale Model Lab risolve attraverso il Theme Engine.
- [ ] Ogni fase termina con suite interessate, build, bundle gate,
      `git diff --check` e audit del diff.
- [ ] Ogni fase resta non implementata finché gli screenshot freschi del
      telefono fisico e il relativo manifest non sono verdi.

### Tooling operativo prioritario — RTK

- [x] Verificare la release stabile ufficiale: `rtk-ai/rtk` v0.44.2, commit
      `700bdde3343299ea06bbca18dc6670a80c88b289`.
- [x] Verificare in memoria l'asset Windows contro il digest ufficiale
      `3a1e114edce9080f8a10663e9c87488363a82f14a5ca8aab2ad416817f89d47c`.
- [x] Confermare che entrambe le copie installate di `rtk.exe` coincidano con
      il binario dell'archive ufficiale, SHA-256
      `60640b970fdf10451813ab4d9d24deb5c6370e43a5192eb14c6ba101a15b633c`.
- [x] Inizializzare Codex globalmente con `rtk init -g --codex` e Claude con il
      hook nativo `rtk init -g --auto-patch`, preservando le impostazioni
      esistenti.
- [x] Provare `rtk --version`, `rtk gain`, `rtk init ... --show` e
      `rtk git status --short` su questo repository.

RTK è tooling globale e non una tranche Model Lab: non autorizza l'avvio della
Fase 5 e non aggiunge file prodotto alla lane mobile. Le nuove sessioni
Codex/Claude devono essere riavviate per caricare integralmente istruzioni/hook.

### Stato formale di una fase

```text
PLANNED
  → RED PROVEN
  → GREEN AUTOMATED
  → GREEN UPSTREAM
  → GREEN DEVICE
  → IMPLEMENTED
```

Non sono ammesse scorciatoie. `GREEN AUTOMATED` non implica qualità visiva;
`GREEN UPSTREAM` non implica funzionamento Android; `GREEN DEVICE` non è valido
senza PNG e manifest tracciati. Se il telefono è assente, la fase si ferma a
`GREEN UPSTREAM`.

### Protocollo comune del cancello dispositivo

- [ ] Risolvere ADB da `mobile/android/local.properties`, non assumere che sia
      nel `PATH`.
- [ ] Rilevare seriale, modello, Android/API, `wm size` e `wm density`.
- [ ] Se il dispositivo fisico è un tablet, registrare i valori nativi,
      applicare soltanto per la cattura un override ADB equivalente a 360×792
      CSS e ripristinare sempre size/density originali; verificare anche la
      geometria tablet nativa con la stessa build.
- [ ] Costruire e sincronizzare l'APK dal tree verificato.
- [ ] Installare/avviare quella build sul seriale rilevato.
- [ ] Navigare ogni route/scenario indicato dal ledger, incluse modalità tema.
- [ ] Catturare con `adb exec-out screencap -p` senza ritaglio che nasconda
      overflow o chrome rilevante.
- [ ] Ispezionare visivamente testo, gerarchia, wrapping, touch target, focus,
      stati e assenza di duplicazioni/overflow.
- [ ] Calcolare SHA-256 di ogni PNG e compilare `manifest.md`.
- [ ] Verificare che PNG e manifest non espongano token o dati personali.
- [ ] Lasciare vuoto il campo difetti; in caso contrario tornare al RED.
- [x] Verificare con `git check-ignore -v` che tutte le evidenze siano
      tracciabili prima di promuovere la fase.

---

## 1. Fase 1 — Capienza e contratto Hugging Face

**Stato:** IMPLEMENTED; review F1-RED-11…17 risolta, nuova APK verificata sul
dispositivo fisico e prove sostitutive tracciate.
**Ledger:**
`../ledgers/2026-08-04-model-lab-phase-1-capacity-ledger.md`

**Esito:** il WIP interrotto torna type-safe; RAM e disco sono vincoli distinti
con una sola autorità; la browse list usa una variante Q4 rappresentativa
onesta, non `gguf.totalFileSize`.

### Task 1.1 — Congelare il WIP e provare il RED

- [x] Registrare HEAD e `git status --short` nel ledger senza ripulire nulla.
- [x] Eseguire typecheck e i test focalizzati del ledger.
- [x] Conservare i quattro difetti attesi come RED nominati F1-RED-01…04.
- [x] Se compare un fallimento diverso, fermarsi, diagnosticarlo ed emendare il
      ledger prima del prodotto.

### Task 1.2 — Rendere discriminato il verdetto

- [x] Scrivere test puri per `unknown`, `storage-blocked`, `memory-blocked`,
      `tight` e `fits`.
- [x] Unificare riserva di 1 GiB e shortfall in `fit.ts`.
- [x] Migrare ogni chiamante da `talosEstimatedBand` al verdetto centrale.
- [x] Normalizzare storage non positivo/non finito a `null` nel boundary
      dispositivo.
- [x] Rendere badge e barra coerenti col limite effettivo.

### Task 1.3 — Normalizzare la variante browse

- [x] Aggiungere fixture pin e test per selezione Q4.
- [x] Espandere `siblings` nel client Hugging Face.
- [x] Separare parametri, byte repository e byte variante.
- [x] Implementare ranking deterministico e stima esplicitamente marcata.
- [x] Conservare `paths-info` come autorità esatta nel dettaglio/download.

### Task 1.4 — Integrare e regredire

- [x] Migrare store, locale, catalogo e tool model.
- [x] Aggiungere chiavi i18n RAM/disco/unknown in italiano e inglese.
- [x] Eseguire test focalizzati, suite modelli, store, servizi e localizzazione.
- [x] Eseguire typecheck, unit completa, build, bundle gate e diff check.
- [x] Eseguire il gate upstream HF opt-in sulle revision pin.

### Task 1.5 — Prova fisica

- [x] Catturare `phase-1/storage-first.png` con il 70B storage-blocked.
- [x] Catturare `phase-1/memory-after-storage.png` con il 32B memory-blocked.
- [x] Compilare `phase-1/manifest.md` e verificare SHA-256.
- [x] Promuovere il ledger a IMPLEMENTED solo se i due messaggi e le due barre
      descrivono il vincolo corretto e non esiste overflow.

Checkpoint: nessuna ristrutturazione della UI comincia prima di Fase 1
IMPLEMENTED; altrimenti l'hub replicherebbe una capacità falsa.

---

## 2. Fase 2 — Theme Engine, hub e navigazione

**Stato:** IMPLEMENTED — GREEN DEVICE il 2026-08-05; Fase 1 confermata.
**Ledger:**
`../ledgers/2026-08-04-model-lab-phase-2-hub-navigation-theme-ledger.md`

**Esito:** `/settings/models` mostra una sola scheda dispositivo e tre link;
ogni area ha uno screen dedicato; il perimetro è 100% Theme Engine.

### Task 2.1 — Estendere il Theme Engine in TDD

- [x] Provare RED per scale semantiche di spazio/raggio e 48dp invarianti.
- [x] Aggiungere token centrali nel package design-tokens e applicatore DOM.
- [x] Aggiungere default di boot in `style.css`.
- [x] Creare il gate statico sulle sorgenti Model Lab e la matrice runtime per
      identità, mode, density, radius e reduced motion.

### Task 2.2 — Dichiarare il route tree

- [x] Provare RED per cinque route, parent e deep-link legacy.
- [x] Aggiungere hub e tre screen; il dettaglio repository viene dichiarato in
      Fase 4, non anticipato con una superficie finta.
- [x] Collegare route title, Settings, chat event e System Back; dopo F2-RED-20
      il drawer conserva un solo parent primario, `Impostazioni`.
- [x] Canonicalizzare `/settings?tab=models` con `replace`.

### Task 2.3 — Separare Model Lab dalle tab Impostazioni

- [x] Conservare l'ID `models` soltanto come compatibilità legacy.
- [x] Rimuovere `models` dai gruppi del `tablist`.
- [x] Renderizzare Model Lab come `RouterLink` autonomo fuori dal ruolo tablist.
- [x] Portare il default inline a `ai_defaults` e aggiornare i test tablet/phone.

### Task 2.4 — Costruire hub e wrapper dedicati

- [x] Creare `TalosMobileDeviceCapacityCard` con soli dati reali/unknown.
- [x] Creare `TalosMobileModelLabHub` con tre link semantici.
- [x] Montare provider, catalogo e locale nei rispettivi screen lazy.
- [x] Eliminare il vecchio pannello a tre tab.
- [x] Rimuovere le schede dispositivo duplicate dalle pagine figlie.

### Task 2.5 — Regressione e prova fisica

- [x] Eseguire route, Settings, shell, back, tema, chunk, E2E e gate globali.
- [x] Catturare hub Paper chiaro, hub Terminal scuro, pagina Provider senza
      duplicato, drawer canonico, ingresso unico Settings e hub tablet nativo.
- [x] Compilare manifest e promuovere solo dopo ispezione fisica.

Esito osservato: suite completa 3593 pass / 9 skip, E2E estesi 37/37, build e
Gradle verdi; APK SHA-256 `b6a24bc695127aaf912719f6a4d102e3f484aef71ddecc8d73fd32438406aa3d`.
Le sei prove sono indicizzate nel manifest Fase 2. Nessun push eseguito.

Checkpoint: la Fase 3 parte soltanto quando la nuova destinazione delle
credenziali Hugging Face esiste davvero.

---

## 3. Fase 3 — Filtri Hugging Face e semantica UI

**Stato:** IMPLEMENTED — gate automatico, upstream e dispositivo fisico verdi.
**Ledger:**
`../ledgers/2026-08-04-model-lab-phase-3-hugging-face-filters-ledger.md`

**Esito:** ogni filtro ha semantica documentata e dati upstream coerenti; i
controlli non spariscono, non si tagliano e hanno uno stato zero risultati.

### Task 3.1 — Policy licenze e metadati

- [x] Provare RED per allowlist conservativa e valori unknown/custom.
- [x] Implementare `licensePolicy.ts` come boundary puro e versionabile.
- [x] Esporre chat template, quantizzazione e download 30 giorni nel modello
      normalizzato.

### Task 3.2 — Correggere i cinque filtri

- [x] `Gira qui` usa soltanto il verdetto centrale noto.
- [x] Chat usa conversational OR chat template.
- [x] Code diventa “Orientato al codice” e resta euristica dichiarata.
- [x] Q4 legge sibling/variante.
- [x] Licenza usa soltanto la policy dichiarata.
- [x] Le combinazioni restano AND e hanno test di intersezione.

### Task 3.3 — Rendere stabile la barra filtri

- [x] Derivare provider dai risultati non filtrati più la selezione corrente.
- [x] Sostituire qualsiasi label generica inglese con i18n esplicita.
- [x] Fare wrapping dei controlli a 360px. **SUPERATO il 2026-08-05 dalla
      direttiva owner 4.C:** i chip non devono più wrappare; il RED correttivo
      impone una sola rail orizzontale scorrevole con label complete.
- [x] Aggiungere zero-state e azione Reimposta filtri.

### Task 3.4 — Spostare accesso Hugging Face

- [x] Creare la access card nella pagina Provider.
- [x] Conservare key store e comportamento token manuale.
- [x] Rimuovere il controllo duplicato dalla pagina Locale.
- [x] Dichiarare il conteggio download “ultimi 30 giorni”.

### Task 3.5 — Gate

- [x] Eseguire unit, store, i18n, upstream pin, E2E e gate globali.
- [x] Catturare combinazione filtri con risultati, zero-state con provider
      stabile e access card HF nella pagina Provider.
- [x] Compilare manifest e promuovere solo dopo ispezione fisica.

Esito osservato: suite completa 3616 pass / 10 skip, E2E Model Lab 11/11,
upstream live 3/3, build e 591 task Gradle verdi. F3-RED-13 e F3-RED-14,
scoperti sul dispositivo, sono test permanenti e risultano verdi. Le tre prove
fisiche e l'APK `c6716d…fcea45` sono indicizzate nel manifest Fase 3.

---

## 4. Fase 4 — Coerenza telefonica e scala

**Stato:** IMPLEMENTED — GREEN DEVICE il 2026-08-05; Fase 3 confermata e
F4-RED-01…15 chiusi sul tree corrente.
**Ledger:**
`../ledgers/2026-08-04-model-lab-phase-4-mobile-coherence-catalog-ledger.md`

**Esito:** Locale, dettaglio e Catalogo sono armoniosi a 360×792, con gerarchia
compatta, URL propri, nessun mega-scroll iniziale e touch target accessibili.

### Task 4.1 — Dettaglio locale come pagina

- [x] Provare route/parent e parametri owner/repo.
- [x] Creare screen e componente dettaglio senza device/back duplicati.
- [x] Rendere titolo multilinea, README conciso/collassabile e varianti in righe
      compatte.

### Task 4.2 — Lista locale compatta

- [x] Estrarre una riga modello riusabile e token-only.
- [x] Conservare tutte le azioni reali, gli stati di download e i verdict.
- [x] Eliminare ridondanze testuali e verificare zoom/wrapping.

### Task 4.3 — Catalogo progressivo

- [x] Provare RED sulla baseline fresca di 479 profili: al primo render massimo
      40 righe.
- [x] Implementare limite puro 40/+40 e reset su query/provider.
- [x] Creare riga profilo compatta; nessuna nuova dipendenza.
- [x] Provare raggiungibilità deterministica degli elementi tramite Mostra altri.

### Task 4.4 — Regressione e prestazioni

- [x] Eseguire componenti, route, back, shell, tema, chunk e E2E.
- [x] Misurare numero DOM iniziale e altezza pagina; registrare nel ledger.
- [x] Eseguire suite completa, build e bundle gate.

### Task 4.5 — Prova fisica

- [x] Catturare elenco Locale, dettaglio repo, Catalogo 40 e Catalogo dopo
      Mostra altri.
- [x] Compilare manifest e verificare nessun overflow/taglio/duplicato.
- [x] Promuovere solo dopo ispezione fisica a 360×792.
- [x] Compilare dal tree verificato l'APK side-by-side Fase 4, copiarlo sul
      Desktop con nome univoco e registrare path, UTC, byte e SHA-256.

Chiusura: unit 3633/3633 passati (10 skipped), Model Lab E2E 13/13, upstream
HF 3/3, build iniziale JS 599981/600000 byte e Android 591 task verdi. Le
quattro prove fisiche finali e le metriche 40→80/479 sono nel manifest Fase 4.
L'APK consegnata è
`C:\Users\Antonino\Desktop\TALOS-mobile-phase-4-20260805.apk`, 30574412 byte,
SHA-256 `085e98242359d7bd03d5c2408eb638859f9421112ec92f8b31b264ccbb272e32`.
La Fase 5 non è stata avviata.

---

## 4.C. Tranche correttiva pre-Fase 5

**Stato:** PLANNED — RESEARCH GREEN — PRODUCT UNTOUCHED.
**Ricerca:**
`../research/2026-08-05-model-lab-corrective-tranche-research.md`
**Specifica:**
`../specs/2026-08-05-model-lab-download-center-local-compatibility-design.md`
**Piano esecutivo:**
`2026-08-05-model-lab-corrective-tranche-plan.md`
**Ledger:**
`../ledgers/2026-08-05-model-lab-corrective-tranche-ledger.md`

Questa tranche è un prerequisito nuovo e autonomo della Fase 5. Chiude quattro
finding owner e il bug runtime esportato:

- Model Lab primo elemento di Intelligenza, sotto account;
- Download Center globale e trasferimento durevole/process-death-safe;
- liste locali e varianti più compatte;
- chip filtro single-line con horizontal scroll;
- policy chat/fit unica a 4096, failure nativo tipizzato e fallback limitato;
- matrice HF sequenziale su dispositivo fisico, una famiglia e un file
  temporaneo alla volta.

L'ordine interno, i 21 RED, i file, i simboli, gli upstream pin, gli screenshot
e il rollback sono nel ledger dedicato. La tranche non autorizza OAuth, non
alza il budget iniziale, non aggiunge dipendenze e non cancella i modelli già
installati dall'owner.

---

## 5. Fase 5 — OAuth provider, rinviata

**Stato:** DEFERRED — OWNER DECISION 2026-08-05. Fase 4 è IMPLEMENTED; la
tranche 4.C deve ancora essere chiusa e il dominio verificato necessario ai
callback non è disponibile. Non avviare ricerca operativa, RED o modifiche
prodotto OAuth fino a 4.C IMPLEMENTED, dominio disponibile e nuova
autorizzazione esplicita dell'owner.
**Ledger:**
`../ledgers/2026-08-04-model-lab-phase-5-provider-oauth-ledger.md`

**Esito futuro:** accesso tramite browser di sistema per tutti e soltanto i
provider con OAuth ufficiale realmente implementabile in TALOS mobile. Ogni
provider usa minimo privilegio; Hugging Face richiede soltanto `gated-repos`.
Provider senza OAuth adatto conservano token/API key manuali.

Le task 5.1–5.5 sono una bozza storica da riconciliare al riavvio, non istruzioni
eseguibili oggi. Il ledger lowest-level andrà riscritto provider per provider
dopo ricerca ufficiale corrente, dominio e registrazione client reali.

### Task 5.1 — Ricostruire la matrice provider dopo il dominio

- [ ] Rileggere documentazione OAuth ufficiale corrente di ogni provider.
- [ ] Ammettere soltanto flussi native/public-client senza secret nell'APK e con
      redirect compatibile col dominio TALOS verificato.
- [ ] Registrare per ogni provider adopt/adapt/reject, scope minimo, client ID,
      callback esatta, licenza/provenienza e gate reale.
- [ ] Per Hugging Face richiedere soltanto `gated-repos`; non richiedere
      `openid`, `profile` o `email` senza nuova esigenza approvata.

### Task 5.2 — PKCE e sessione sicura per provider in TDD

- [ ] Provare verifier/challenge/state/scadenza e replay rejection.
- [ ] Implementare Web Crypto S256 senza libreria nuova.
- [ ] Persistire stato pendente e token nel secure store, mai nello store JSON.
- [ ] Preservare compatibilità col token manuale.

### Task 5.3 — Browser e callback Android su dominio verificato

- [ ] Definire soltanto dopo disponibilità del dominio l'HTTPS App Link e
      l'intent filter ristretto esatti; vietati callback provvisori/demo.
- [ ] Aprire il browser di sistema; vietare WebView embedded.
- [ ] Gestire `appUrlOpen` e cold-start `getLaunchUrl`.
- [ ] Verificare provider e state prima del token exchange, scartare callback
      duplicate o indirizzate a un altro adapter.
- [ ] Gestire refresh per provider quando documentato e re-login quando non
      possibile.

### Task 5.4 — UI e failure states

- [ ] Collegare la access card a stato reale: pronto, in corso, connesso,
      scaduto, errore, disconnesso.
- [ ] Non mostrare token, username o e-mail negli screenshot.
- [ ] Rendere l'assenza client ID una spiegazione non interattiva onesta.
- [ ] Conservare i flussi chiave per provider senza OAuth ufficiale adatto.

### Task 5.5 — Gate reale per ogni provider ammesso

- [ ] Eseguire unit sicurezza, manifest, store, E2E e suite globali.
- [ ] Eseguire un accesso reale su ogni provider ammesso, non soltanto mock.
- [ ] Catturare stato pronto, connesso redatto e recupero da sessione scaduta.
- [ ] Compilare manifest, eliminare dati personali e promuovere solo con il
      flusso end-to-end riuscito.
- [ ] Dopo tutti i gate della Fase 5, compilare l'APK side-by-side dal tree
      completo delle Fasi 1–5 e copiarne una copia con nome univoco sul Desktop
      dell'owner. Registrare percorso assoluto, timestamp UTC, byte e SHA-256
      nel manifest/handoff; non sostituire silenziosamente un APK preesistente.

Senza dominio verificato, callback esatta e client pubblico reale per ciascun
provider, la fase resta `DEFERRED` e non è implementata. Le Fasi 1–4 restano
verdi; token/API key manuali continuano a essere il comportamento reale.

Direttiva owner 2026-08-05, successiva alla valutazione: OAuth verrà esteso in
futuro a ogni provider con documentazione ufficiale implementabile in TALOS;
Hugging Face userà il solo scope `gated-repos`. Poiché il dominio non è ancora
disponibile, rinviare integralmente la fase. Nessuna ricerca operativa, RED o
modifica prodotto riparte senza dominio e nuova autorizzazione owner.

---

## 5.5. Spedizione autonoma whole-app — prima del go-out

**Stato iniziale:** DEFERRED; si pianifica sullo stato reale ottenuto dopo la
Fase 5 e blocca qualunque audit/go-out finale.

**Direttiva owner 2026-08-04:** il main agent deve esplorare l'intera app sul
dispositivo fisico come un utente umano, senza limitarsi a Model Lab. Prima di
iniziare crea una specifica, un piano lowest-level, un ledger e una matrice di
copertura dedicati, tracciati e non ignorati. La spedizione include almeno:

**Emendamento owner 2026-08-05 — profondità obbligatoria:** questa fase è una
campagna esaustiva di bug testing e stress testing, non un giro dimostrativo.
Prima di scriverne spec o piano esecutivo il main agent svolge ricerca web
just-in-time su fonti primarie e standard correnti di mobile exploratory
testing, state-transition/negative testing, reliability/stress, accessibilità
e Android quality; registra fonti, versioni e decisioni nel dossier dedicato.
Memoria del modello o una checklist generica non soddisfano il gate.

Il dispositivo fisico è una risorsa seriale: un solo agente/tester per volta
può prenderne ownership, partendo da stato e fixture registrati e chiudendo con
cleanup, log, screenshot e handoff prima del tester seguente. Il batch preflight
può parallelizzare soltanto review read-only di codice e contratti che non
mutano né condividono lo stato del device. Nessun agente fisico lavora in
parallelo e nessun esito viene dedotto dal lavoro di un altro agente.

- [ ] preflight statico/dinamico a batch prima dello stress test: dispatcher
      read-only distinti per chat, ricerca/memoria, file/libreria, shell e
      navigazione, Settings/provider/Model Lab, stato/persistenza e
      accessibilità/Theme Engine;
- [ ] bug tester read-only separati per UI responsive e flussi funzionali,
      autorizzati a ispezionare e a eseguire prove focalizzate ma non a
      modificare prodotto, piani o ledger;
- [ ] triage centralizzato del main agent: deduplicare i finding, verificarli
      sul codice e sul dispositivo, assegnare severità e aprire uno scenario
      RED permanente prima di qualunque fix;
- [ ] inventario di tutte le route, superfici, azioni, stati e boundary reali;
- [ ] inventario enumerato di ogni controllo raggiungibile e di ogni prompt,
      dialogo, menu, riga, gesture e stato vuoto/loading/success/error; ogni
      voce ha un ID univoco, precondizioni, risultato atteso ed evidenza;
- [ ] per ogni controllo verificare sia l'azione sia il suo contrario o
      compensatore: apri/chiudi, conferma/annulla, abilita/disabilita,
      concedi/nega/revoca, start/pausa/riprendi/cancella, salva/scarta,
      online/offline/riconnessione, input valido/invalido/vuoto/limite,
      successo/failure/retry e persistenza/non-persistenza dopo reload;
- [ ] per ogni classe di prompt verificare formulazioni umane realistiche,
      typo, ambiguità, follow-up contestuale, rifiuto/correzione, contenuti
      minimi/massimi e prompt opposto/metamorfico; i prompt arbitrari vengono
      coperti da un corpus versionato per classe, mentre ogni prompt fisso
      dell'interfaccia viene provato individualmente;
- [ ] onboarding, shell, navigazione, back/system back e deep link;
- [ ] chat realistica multi-turno, retry, errori, typo, URL e persistenza;
- [ ] ricerca, memoria, file/libreria, impostazioni, provider e Model Lab;
- [ ] reload, cold start, background/foreground, perdita rete e sessioni
      scadute;
- [ ] stress su liste, messaggi lunghi, input rapidi, azioni ripetute e storage;
- [ ] comportamento umano avverso ma plausibile: doppio tap, tap rapidi,
      scroll durante streaming/caricamento, cambio schermata durante lavoro,
      background/foreground ripetuto, interruzione e ripresa, rotazione o
      cambio viewport consentito e pressione Back nei punti intermedi;
- [ ] accessibilità, tastiera/focus, reduced motion, tutte le identità/mode,
      viewport tablet nativo e telefono emulato sul tablet fisico;
- [ ] screenshot per ogni charter e log sanitizzati, senza segreti o PII;
- [ ] ogni difetto riprodotto come scenario nominato, aggiunto al ledger,
      trasformato in test permanente, corretto e riverificato sul dispositivo;
- [ ] dossier finale con copertura, difetti, severità, test, hash evidenze e
      rischi residui espliciti.

La spedizione non è un semplice smoke test e non può essere verde con difetti
aperti. Se una funzione richiede autorità o credenziali esterne non disponibili,
si esauriscono i percorsi safe/in-scope e si registra il blocco senza simulare
successo. Il go-out resta fermo finché il ledger whole-app non è verde o
l'owner non accetta esplicitamente un rischio residuo nominato.

La completezza viene misurata, non dichiarata: matrice route×stato×azione,
copertura controlli 100%, copertura coppie azione/contrario 100%, corpus prompt
eseguito 100%, zero righe senza evidenza o esito esplicito e zero difetti aperti.
Le azioni distruttive usano soltanto dati di prova isolati e ripristinabili;
account, modelli e file dell'owner non vengono cancellati o riscritti.

---

## 6. Sequenza di verifica finale / go-out

- [ ] Tutti i ledger riportano stato `IMPLEMENTED` e nessun difetto aperto.
- [ ] Tutti i PNG prescritti e cinque manifest sono presenti e tracciabili.
- [ ] Gli hash dei PNG nei manifest coincidono con i file.
- [ ] Nessuna evidenza contiene segreti o dati personali.
- [ ] `npm run typecheck` verde.
- [ ] Suite unit mobile completa verde.
- [ ] E2E Model Lab e regressioni Settings/shell verdi con un worker.
- [ ] `npm run build` verde.
- [ ] Pacco d'avvio entro il limite vigente registrato dalla Fase 1.
- [ ] Gate upstream Hugging Face verde sulle revision pin.
- [ ] Build Android e test Android interessati verdi.
- [ ] `git diff --check` verde.
- [ ] `git status --short` contiene soltanto WIP owner preservato, modifiche
      pianificate e documentazione/evidenze dichiarate.
- [ ] `git diff --name-only` non contiene lane desktop/core/validator/control-plane.
- [ ] `PASSAGGIO-DI-CONSEGNE.md` riporta HEAD reale, stato di ogni fase,
      comandi, evidenze e blocchi residui.
- [ ] La spedizione whole-app 5.5 ha ledger e dossier verdi, senza difetti
      aperti o rischi residui non accettati esplicitamente.
- [ ] Sul Desktop dell'owner è presente l'APK finale Fase 5 corrispondente al
      tree verificato; hash e percorso coincidono con manifest e handoff.

## 7. Rollback del programma

Il rollback è per fase e non usa `git reset`, `checkout --` o cancellazioni
indiscriminate. L'owner può scegliere di non integrare una fase; l'agente deve
fornire l'elenco esatto dei file della relativa sezione e preservare qualunque
modifica preesistente sovrapposta. Le rotte legacy, i provider ID, il secure-key
namespace e i contratti chat non vengono rimossi, quindi ogni fase mantiene una
via di compatibilità esplicita.

## 8. Regola di handoff

Alla fine di ogni sessione, anche intermedia:

1. aggiornare checkbox e stato soltanto con evidenza fresca;
2. aggiungere al ledger ogni emendamento e causa;
3. aggiornare `mobile/docs/PASSAGGIO-DI-CONSEGNE.md`;
4. indicare test rossi/verdi con conteggi reali;
5. indicare esattamente quali screenshot esistono e quali mancano;
6. non scrivere “implementato”, “finito” o “funziona” per una fase priva del
   suo cancello `GREEN DEVICE`.
