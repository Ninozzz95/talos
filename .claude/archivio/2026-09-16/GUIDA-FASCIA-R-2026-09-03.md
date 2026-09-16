# GUIDA FASCIA R — apertura: release Windows minima (03/09/2026)

> Approvata dall'owner il 03/09 («approvo, resta in attesa»): l'ordine, non l'esecuzione. Ogni riga parte
> solo col suo sì su **quella** riga. Ancore per nome di funzione: prima di toccare, `grep -n "function <nome>"`.
> Regole d'esecuzione: §1 del ledger. Mai il 4174: ogni prova su una porta di prova con store copiato.

## Perché questa fascia viene prima di Wave 0

Il desktop oggi parte solo da checkout (`node harness-ui/server.mjs`), la chiave entra solo da
`OPENROUTER_API_KEY`, non esiste un primo avvio guidato, non esiste un pacchetto
(`frontend/scripts/package-frontend.mjs` esce con codice 2 per scelta). Wave 0 è contabilità interna,
invisibile a chi apre l'app. L'owner ha chiesto che l'app «parta correttamente e abbia un intro stile
mobile» prima di tutto il resto.

## Ordine

R-01 → R-02 → W0-04 → W1-10 → W2-13 → W2-15 → W2-16 → W2-17, poi si riprende dal piano A-Z alla
riga 9 (W0-06). Le righe W0-04/W1-10/W2-xx hanno già i passi in `GUIDA-WAVE-0`, `GUIDA-WAVE-1`,
`GUIDA-WAVE-2`: qui stanno solo R-01 e R-02.

## R-01 — Lanciatore doppio-clic (1,5 gg, stima per analogia con W1-03)

**Stato di partenza verificato il 03/09**: `server.mjs` chiama `server.listen(config.port, config.host)`
con `config.port` da `TALOS_HARNESS_UI_PORT` o `4174`; porta occupata = errore e uscita. Nessuno
script apre il browser. `src/doctor.mjs` esporta `diagnosi(...)` che già sa dire `chiaveApi:false` e
`shell:'wsl2'|'none'|'desktop'`.

RED
1. `tests/config.test.mjs`: con `TALOS_HARNESS_UI_PORT` assente e 4174 occupata, la porta scelta è la
   prima libera sopra 4174, e viene stampata; con la variabile presente e occupata → errore esplicito
   (chi la imposta la vuole quella).
2. Test del lanciatore a secco (`TALOS_PROVA_A_SECCO=1`, convenzione del mobile del 23/8, non tracciata in git: si definisce qui
   sul mobile): stampa il comando del browser invece di eseguirlo.

GREEN
3. `scripts/avvia-talos.mjs`: trova Node (quello che lo sta eseguendo), sceglie la porta come sopra,
   avvia `server.mjs` come figlio con la porta scelta, aspetta il primo `GET /` 200, apre il browser
   (`start ""` su Windows via `cmd /c`, mai una shell con la stringa dell'utente dentro), e se
   `diagnosi()` dice `chiaveApi:false` apre direttamente la vista Doctor (`/#doctor` o l'equivalente
   della route corrente: verificare in `public/app.js` come si apre `setInspectorTab`).
4. `scripts/avvia-talos.cmd`: due righe, chiama lo `.mjs` con `%~dp0`. Doppio clic da Explorer.
5. `harness-ui/README.md`: il quick start diventa il doppio clic; `node harness-ui/server.mjs` resta
   documentato come via da terminale.

Evidenza: macchina (o shell) senza variabili d'ambiente TALOS, doppio clic, la UI si apre, Doctor
mostra «chiave mancante»; screenshot 1024×800 e 1440×900. Rollback: cancellare i due script.

## R-02 — Intro al primo avvio stile mobile (3 gg, stima per analogia con W1-11)

**Stato di partenza verificato il 03/09**: sul mobile i passi sono in
`mobile/src/lib/onboarding/setupProgress.ts`, `TALOS_SETUP_STEPS` = identity, pin, model, autonomy,
permissions, e la UI in `mobile/src/components/intro/TalosMobileSetupIntro.vue` (la scheda «autonomia»
decide i tre poteri in un colpo: toccarla è sceglierla, owner 06/08). Sul desktop l'hero è
`costruisciConversationHero(titolo, sottotitolo)` in `public/app.js`; la chiave è letta in
`src/config.mjs` come `chiaveApi` solo da `env.OPENROUTER_API_KEY`; `@napi-rs/keyring` è già una
dipendenza e `server.mjs` la importa già (grep `@napi-rs/keyring`): verificare per cosa, e riusare
quel percorso invece di aprirne un secondo.

Passi del desktop (mappa dai cinque del mobile): **chiave e provider** (al posto di identity),
**cartella progetto** (al posto di pin: il PIN non ha senso su loopback), **modello**, **autonomia**
(`read/write/outbound` → allow/ask/deny, in un colpo come il mobile), **fine** (riassunto + Doctor).

RED
1. `tests/http-app.test.mjs`: `POST /setup` con chiave salva nel keyring e risponde `{ok:true}` senza
   mai rimandare la chiave; il log del server non la contiene (asserzione sul buffer di log).
2. `tests/config.test.mjs`: precedenza `env` > keyring > assente; con `TALOS_INTRO=0` l'intro non si
   presenta.
3. Test frontend (`frontend/scripts/run-node-tests.mjs`): con store vuoto il primo render è l'intro;
   con store non vuoto è la vista normale.

GREEN
4. `src/http-app.mjs`: `GET /setup/stato` (quali passi fatti, mai la chiave) e `POST /setup`.
5. `src/config.mjs`: `chiaveApi` da env, altrimenti dal keyring (servizio `talos-harness`, account
   `openrouter`).
6. `public/app.js`: `costruisciIntroPrimoAvvio()` accanto a `costruisciConversationHero`, cinque
   passi, stessa grammatica dei permessi del mobile (una sola: sempre/chiedi/nega). Niente mockup: si
   guarda nel browser vero (regola owner).
7. Il modulare (`frontend/src`) riceve lo stesso intro solo al cutover (W3-08): registrarlo in
   `PARITA.md` come da convenzione della Wave 3, non farlo due volte ora.

Evidenza: store vuoto su porta di prova, cinque passi, chiave nel keyring (`cmdkey /list` mostra
`talos-harness`), seconda apertura senza intro; screenshot dei cinque passi a 1024×800 e 1440×900.
Rollback: `TALOS_INTRO=0`; la chiave da env continua a vincere. Criterio: la chiave non compare mai in
log, JSONL, risposta HTTP o screenshot.

## Cosa costa all'owner, fuori dal codice

- Certificato Authenticode per firmare l'installer di W2-15: senza, SmartScreen blocca il primo doppio
  clic, cioè il contrario di «parte correttamente».
- Per la fascia M (Mac/Linux, dopo Wave 1): account Apple Developer per la notarizzazione.
