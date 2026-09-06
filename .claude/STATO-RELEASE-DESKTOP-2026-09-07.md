# Quanto manca alla prima release desktop di TALOS — stato al 07/09/2026

> Chiesto dall'owner il 06/09 («alla fine mi dici quanto manca ad una prima release desktop, con
> tutte le eventuali modifiche al repo GitHub e readme etc»). Ogni riga qui sotto è un fatto letto
> nel repo o misurato, non una stima a occhio. Le taglie sono conteggi (file, righe, test), non ore:
> le ore non si danno senza misura (regola del 03/09).

## Cosa c'è, e regge

- La app nuova è **servita** (`public/` = build modulare dal cutover del 06/09), il monolite è un
  backup fuori dal repo. Tutte le 16 schermate del mockup sono vive: chat, terminale a schede con
  shell vere, review, browser a schede con cornice viva e annotazione degli elementi (oltre Hermes),
  capability, board, libreria, memoria, attività, ricerca, officina, automazioni, doctor,
  impostazioni (40 righe), Model Lab, intro del primo avvio.
- Cancelli verdi al 07/09: server **1626/1626**, frontend unit **125/125**, statico **195/195**,
  componenti **111/111** (parità struttura/parole/pixel col mockup a tre viewport), contratto
  pubblico conservato (11 global, 7 chiavi, 23 eventi, 10 asset, 19 rotte meno una ritirata).
- Lingua: menu, Impostazioni, attrezzi, terminale, browser in inglese, a caldo, ricordata.
- Sicurezza: server solo su loopback, cookie di sessione, CSP stretta, proxy del Browser solo per
  dev server locali, ricevute firmate lato server, permessi per attrezzo con approvazione in chat.

## Cosa BLOCCA una release (in quest'ordine)

1. **Il kernel non è nel repo.** Il server parte, ma i giri reali passano da
   `TALOS_OWNER_RUNTIME_MODULE`, che punta a `AVM-harness/mobile/scripts/harness-talos/talosHarness.mjs`
   — un file di un ALTRO repo (`mobile/scripts/harness-talos/` qui non esiste). Chi clona questo repo
   ha un server in sola lettura. Decisione dell'owner (`DECISIONE-KERNEL-DUE-COPIE-2026-09-02.md`,
   kernel fuori dalla mia lane): portare il kernel qui, o pubblicarlo a parte e documentare la
   variabile. Il README non nomina nemmeno la variabile.
2. **Nessuna prova end-to-end col modello sulla UI nuova.** In questa sessione nessun giro a
   pagamento è stato lanciato (regola: decide l'owner). Il 4174 riavviato sul kernel dell'owner dà
   all'avvio «Il runtime agente non espone il catalogo task richiesto» (`runtime-owner-adapter.mjs:601`):
   il doctor lo dichiara non bloccante, ma è un disallineamento kernel↔adapter da chiarire PRIMA di
   dire «funziona». Serve una sessione vera (modello flash a chiave, pochi centesimi) che attraversi
   chat in streaming, un attrezzo con approvazione, una scrittura di file con Review, il terminale e
   il browser.
3. **Il ramo.** `lane/harness-desktop` è **1.583 commit avanti** a `main`, e `main` ha **50 commit**
   che la lane non ha (ultimo il 30/07). GitHub rilascia da `main`: serve un merge (o si dichiara la
   lane come ramo di release). Conflitti: ignoti finché non si prova un merge a secco — è la prima
   cosa da misurare.
4. **CI e release non sanno che il desktop esiste.** `.github/workflows/ci.yml` (job «gates»)
   esegue typecheck, vitest, build e grafo d'avvio della app MOBILE; `release.yml` costruisce e firma
   solo l'APK sui tag `v*`. Per il desktop mancano: un job che lanci `node --test harness-ui/tests`
   e i tre cancelli del frontend (headless, Chrome già installato sui runner), e un artefatto di
   release (uno zip di `harness-ui/` senza `node_modules`, con `npm ci` all'installazione, o il
   lanciatore `avvia-talos.cmd` impacchettato). `scripts/rilascia.ps1` e `pubblica.ps1` sono il
   percorso MOBILE: vanno adattati o affiancati.
5. **Controlli morti nella Review.** Nel template ci sono «Accetta questo file» e «Scarta tutto»
   senza nessun gestore (righe K-B del contratto: checkpoint per giro lato kernel). Prima di una
   release si nascondono o si dichiarano, mai lasciati inerti (regola «mai un pannello
   silenziosamente inerte»). Stessa verifica per «Apri nell'editor» (K-C) e il gruppo «Fissate»
   (K-A, oggi nascosto dal bridge).

## Modifiche al repo GitHub e alla documentazione

- `harness-ui/README.md` (7,7 KB): lo screenshot è quello del TABLET mobile
  (`../mobile/docs/immagini/tablet-9-coding-agent.png`); servono screenshot della UI desktop nuova,
  in inglese, approvati uno per uno (regola dell'owner). La tabella «Configuration» deve aggiungere
  `TALOS_OWNER_RUNTIME_MODULE` (obbligatoria per i giri), `TALOS_HARNESS_UI_PUBLIC_DIR`,
  `TALOS_HARNESS_UI_SESSIONS_DIR`, `TALOS_INTRO`. «Local API» deve elencare le rotte nate dopo:
  schede terminale (W1-01), git (W1-05), `browser/incorniciabile`, `browser/proxy`. «Intentional
  limits» deve dire: proxy solo locale, niente ritaglio d'immagine nelle annotazioni, letture web
  solo tramite l'agente. Il paragrafo sull'installer («The final installer must own a stable
  executable») descrive un futuro: va marcato come tale o tolto.
- `README.md` (radice): la sezione Desktop («Node.js 24 and Google Chrome») è giusta; aggiungere la
  riga sul kernel e il link alle note di release desktop.
- **Versione e changelog.** `VERSION` dice `v1.0.0`; `CHANGELOG.md` è del mobile (ultima `v0.1.22`,
  un solo cenno al desktop, riga 544). Decidere il nome del tag desktop (es. `desktop-v0.1.0`) così
  `release.yml` non tenta un APK; scrivere la sezione desktop del changelog dalle voci di questa
  lane (terminale, browser, lingua, intro, dialoghi, Model Lab, cutover).
- **Pulizia del pacchetto.** `public/vendor/floating-ui` e `public/vendor/tanstack` sono resti del
  frontend parallelo di Opus: nessun file li carica, e `THIRD_PARTY_NOTICES.md` non li cita — via
  dalla copia degli asset (con il test `PHASE1-ASSET-ALLOWLIST-01` aggiornato). `harness-ui/labs/
  electron-shell` è un laboratorio tracciato: si dichiara nel README o si toglie dal pacchetto.
- **`.claude/` è nel repo per decisione del 20/08** (1.261 file: ledger, mockup, prompt, memoria).
  Per una release pubblica è materiale interno con percorsi locali: decide l'owner se resta.
- `docs/` (architettura, benchmark, deployment, PUBLISHING) va riletto per il desktop: oggi parla
  quasi solo del mobile.

## Debito visibile ma non bloccante

- Lingua, seconda fascia: 129 chiamate `toast(` nel monolite e il testo statico delle pagine
  (titoli, spiegazioni, stati vuoti) restano in italiano quando i menu sono in inglese.
- Righe del contratto K-D…K-H (ricevute nella Review, suggerimenti dello stato vuoto, «approvato da
  un altro client», chip del costo): oggi non compaiono, quindi non ingannano; restano proposte.
- Avviso di console preesistente all'avvio (iframe `srcdoc` dell'anteprima demo degli artefatti,
  stile in linea rifiutato dalla CSP); `tests/browser/baseline-shell.spec.mjs` fuori dai cancelli,
  da rivedere sulla build nuova; `!important` nel pannello runtime di Astra; front matter grezzo nel
  README dei modelli Hugging Face.

## In una frase

La app è pronta; la RELEASE no: manca il kernel nel repo (decisione tua), una prova vera col modello
(pochi centesimi, decisione tua), il merge di 1.583 commit su `main` (da misurare a secco), un job di
CI e un artefatto per il desktop, i controlli morti della Review, e README/changelog/versione
riscritti per il desktop con screenshot inglesi approvati.
