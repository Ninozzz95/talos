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
Theme Engine; OAuth Hugging Face pubblico Authorization Code + PKCE nel browser
di sistema.

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
- [ ] Creare un commit locale soltanto dopo il cancello fisico verde di ogni
      fase, come autorizzato esplicitamente dall'owner il 2026-08-04; non
      eseguire alcun push.
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

**Stato iniziale:** PLANNED; dipende da Fase 1 IMPLEMENTED.
**Ledger:**
`../ledgers/2026-08-04-model-lab-phase-2-hub-navigation-theme-ledger.md`

**Esito:** `/settings/models` mostra una sola scheda dispositivo e tre link;
ogni area ha uno screen dedicato; il perimetro è 100% Theme Engine.

### Task 2.1 — Estendere il Theme Engine in TDD

- [ ] Provare RED per scale semantiche di spazio/raggio e 48dp invarianti.
- [ ] Aggiungere token centrali nel package design-tokens e applicatore DOM.
- [ ] Aggiungere default di boot in `style.css`.
- [ ] Creare il gate statico sulle sorgenti Model Lab e la matrice runtime per
      identità, mode, density, radius e reduced motion.

### Task 2.2 — Dichiarare il route tree

- [ ] Provare RED per cinque route, parent e deep-link legacy.
- [ ] Aggiungere hub e tre screen; il dettaglio repository viene dichiarato in
      Fase 4, non anticipato con una superficie finta.
- [ ] Collegare route title, sidebar, chat event e System Back.
- [ ] Canonicalizzare `/settings?tab=models` con `replace`.

### Task 2.3 — Separare Model Lab dalle tab Impostazioni

- [ ] Conservare l'ID `models` soltanto come compatibilità legacy.
- [ ] Rimuovere `models` dai gruppi del `tablist`.
- [ ] Renderizzare Model Lab come `RouterLink` autonomo fuori dal ruolo tablist.
- [ ] Portare il default inline a `ai_defaults` e aggiornare i test tablet/phone.

### Task 2.4 — Costruire hub e wrapper dedicati

- [ ] Creare `TalosMobileDeviceCapacityCard` con soli dati reali/unknown.
- [ ] Creare `TalosMobileModelLabHub` con tre link semantici.
- [ ] Montare provider, catalogo e locale nei rispettivi screen lazy.
- [ ] Eliminare il vecchio pannello a tre tab.
- [ ] Rimuovere le schede dispositivo duplicate dalle pagine figlie.

### Task 2.5 — Regressione e prova fisica

- [ ] Eseguire route, Settings, shell, back, tema, chunk, E2E e gate globali.
- [ ] Catturare hub Paper chiaro, hub Terminal scuro e pagina Provider senza
      duplicato nelle tre immagini prescritte.
- [ ] Compilare manifest e promuovere solo dopo ispezione fisica.

Checkpoint: la Fase 3 parte soltanto quando la nuova destinazione delle
credenziali Hugging Face esiste davvero.

---

## 3. Fase 3 — Filtri Hugging Face e semantica UI

**Stato iniziale:** PLANNED; dipende da Fase 2 IMPLEMENTED.
**Ledger:**
`../ledgers/2026-08-04-model-lab-phase-3-hugging-face-filters-ledger.md`

**Esito:** ogni filtro ha semantica documentata e dati upstream coerenti; i
controlli non spariscono, non si tagliano e hanno uno stato zero risultati.

### Task 3.1 — Policy licenze e metadati

- [ ] Provare RED per allowlist conservativa e valori unknown/custom.
- [ ] Implementare `licensePolicy.ts` come boundary puro e versionabile.
- [ ] Esporre chat template, quantizzazione e download 30 giorni nel modello
      normalizzato.

### Task 3.2 — Correggere i cinque filtri

- [ ] `Gira qui` usa soltanto il verdetto centrale noto.
- [ ] Chat usa conversational OR chat template.
- [ ] Code diventa “Orientato al codice” e resta euristica dichiarata.
- [ ] Q4 legge sibling/variante.
- [ ] Licenza usa soltanto la policy dichiarata.
- [ ] Le combinazioni restano AND e hanno test di intersezione.

### Task 3.3 — Rendere stabile la barra filtri

- [ ] Derivare provider dai risultati non filtrati più la selezione corrente.
- [ ] Sostituire qualsiasi label generica inglese con i18n esplicita.
- [ ] Fare wrapping dei controlli a 360px.
- [ ] Aggiungere zero-state e azione Reimposta filtri.

### Task 3.4 — Spostare accesso Hugging Face

- [ ] Creare la access card nella pagina Provider.
- [ ] Conservare key store e comportamento token manuale.
- [ ] Rimuovere il controllo duplicato dalla pagina Locale.
- [ ] Dichiarare il conteggio download “ultimi 30 giorni”.

### Task 3.5 — Gate

- [ ] Eseguire unit, store, i18n, upstream pin, E2E e gate globali.
- [ ] Catturare combinazione filtri con risultati, zero-state con provider
      stabile e access card HF nella pagina Provider.
- [ ] Compilare manifest e promuovere solo dopo ispezione fisica.

---

## 4. Fase 4 — Coerenza telefonica e scala

**Stato iniziale:** PLANNED; dipende da Fase 3 IMPLEMENTED.
**Ledger:**
`../ledgers/2026-08-04-model-lab-phase-4-mobile-coherence-catalog-ledger.md`

**Esito:** Locale, dettaglio e Catalogo sono armoniosi a 360×792, con gerarchia
compatta, URL propri, nessun mega-scroll iniziale e touch target accessibili.

### Task 4.1 — Dettaglio locale come pagina

- [ ] Provare route/parent e parametri owner/repo.
- [ ] Creare screen e componente dettaglio senza device/back duplicati.
- [ ] Rendere titolo multilinea, README conciso/collassabile e varianti in righe
      compatte.

### Task 4.2 — Lista locale compatta

- [ ] Estrarre una riga modello riusabile e token-only.
- [ ] Conservare tutte le azioni reali, gli stati di download e i verdict.
- [ ] Eliminare ridondanze testuali e verificare zoom/wrapping.

### Task 4.3 — Catalogo progressivo

- [ ] Provare RED su 476 profili: al primo render massimo 40 righe.
- [ ] Implementare limite puro 40/+40 e reset su query/provider.
- [ ] Creare riga profilo compatta; nessuna nuova dipendenza.
- [ ] Provare raggiungibilità dell'ultimo elemento tramite Mostra altri.

### Task 4.4 — Regressione e prestazioni

- [ ] Eseguire componenti, route, back, shell, tema, chunk e E2E.
- [ ] Misurare numero DOM iniziale e altezza pagina; registrare nel ledger.
- [ ] Eseguire suite completa, build e bundle gate.

### Task 4.5 — Prova fisica

- [ ] Catturare elenco Locale, dettaglio repo, Catalogo 40 e Catalogo dopo
      Mostra altri.
- [ ] Compilare manifest e verificare nessun overflow/taglio/duplicato.
- [ ] Promuovere solo dopo ispezione fisica a 360×792.

---

## 5. Fase 5 — OAuth provider, subito dopo la UI

**Stato iniziale:** PLANNED; dipende da Fase 4 IMPLEMENTED e da un client
pubblico Hugging Face registrato dall'owner.
**Ledger:**
`../ledgers/2026-08-04-model-lab-phase-5-provider-oauth-ledger.md`

**Esito:** accesso Hugging Face reale tramite browser di sistema e PKCE, oppure
fase esplicitamente bloccata senza UI finta. Gli altri provider conservano il
metodo realmente supportato.

### Task 5.1 — Riconfermare la matrice provider

- [ ] Rileggere metadata OIDC HF e documentazione ufficiale di ogni provider.
- [ ] Registrare drift e decisione adopt/adapt/reject.
- [ ] Verificare presenza di `VITE_TALOS_HF_OAUTH_CLIENT_ID`; un valore assente
      è un blocco reale, non una ragione per inventare un client.

### Task 5.2 — PKCE e sessione sicura in TDD

- [ ] Provare verifier/challenge/state/scadenza e replay rejection.
- [ ] Implementare Web Crypto S256 senza libreria nuova.
- [ ] Persistire stato pendente e token nel secure store, mai nello store JSON.
- [ ] Preservare compatibilità col token manuale.

### Task 5.3 — Browser e callback Android

- [ ] Aggiungere intent filter ristretto per
      `ai.talos://oauth/huggingface`.
- [ ] Aprire il browser di sistema; vietare WebView embedded.
- [ ] Gestire `appUrlOpen` e cold-start `getLaunchUrl`.
- [ ] Verificare state prima del token exchange, scartare callback duplicate.
- [ ] Gestire refresh quando restituito e re-login quando non possibile.

### Task 5.4 — UI e failure states

- [ ] Collegare la access card a stato reale: pronto, in corso, connesso,
      scaduto, errore, disconnesso.
- [ ] Non mostrare token, username o e-mail negli screenshot.
- [ ] Rendere l'assenza client ID una spiegazione non interattiva onesta.
- [ ] Conservare i flussi chiave per provider senza OAuth ufficiale adatto.

### Task 5.5 — Gate reale

- [ ] Eseguire unit sicurezza, manifest, store, E2E e suite globali.
- [ ] Eseguire un accesso reale sul provider upstream, non soltanto mock.
- [ ] Catturare stato pronto, connesso redatto e recupero da sessione scaduta.
- [ ] Compilare manifest, eliminare dati personali e promuovere solo con il
      flusso end-to-end riuscito.

Se il client pubblico non è disponibile, il ledger registra `BLOCKED — external
client registration` e la fase non è implementata. Le fasi 1–4 possono restare
verdi; il programma in cinque fasi non viene dichiarato completo.

---

## 5.5. Spedizione autonoma whole-app — prima del go-out

**Stato iniziale:** DEFERRED; si pianifica sullo stato reale ottenuto dopo la
Fase 5 e blocca qualunque audit/go-out finale.

**Direttiva owner 2026-08-04:** il main agent deve esplorare l'intera app sul
dispositivo fisico come un utente umano, senza limitarsi a Model Lab. Prima di
iniziare crea una specifica, un piano lowest-level, un ledger e una matrice di
copertura dedicati, tracciati e non ignorati. La spedizione include almeno:

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
- [ ] onboarding, shell, navigazione, back/system back e deep link;
- [ ] chat realistica multi-turno, retry, errori, typo, URL e persistenza;
- [ ] ricerca, memoria, file/libreria, impostazioni, provider e Model Lab;
- [ ] reload, cold start, background/foreground, perdita rete e sessioni
      scadute;
- [ ] stress su liste, messaggi lunghi, input rapidi, azioni ripetute e storage;
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
