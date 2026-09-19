# Release gate — 19 settembre 2026

Base: 143145103a59dfb8f8411e7cea8610d98bfd0c2c. Nessun tag prima dei gate.

## R-SCROLL-RETURN-01 — rotella sul tasto «torna in fondo» durante streaming

- File esatti: `harness-ui/frontend/src/components/chat-foot.js` (binding del ritorno), `harness-ui/frontend/tests/browser/baseline-shell.spec.mjs` (regressione browser).
- Simboli/contratti: `scrollerConversazione`, `scorriInFondoConversazione`, `#chatTornaInFondo`, `.talos-chat-return`; il click deve continuare a riarmare il follow, la rotella deve muovere lo stesso `.talos-conversation` anche quando il puntatore è sopra il pulsante.
- RED riprodotto sul 4174 in sola lettura: con il ritorno visibile e il puntatore sul bottone, `wheel(-250)` lasciava `scrollTop` invariato; spostando il puntatore sullo scroller lo cambiava (`1292 -> 892` contro `892 -> 642`). La fascia ha altezza zero ma il bottone è l'unico hit target e il browser non sceglie il fratello scorrevole.
- Ricerca primaria: MDN `Element: wheel event` e `EventTarget.addEventListener`; il wheel può colpire un elemento non scorrevole e il forwarding deve rispettare `deltaMode`, `preventDefault` solo su evento cancellabile/non-passive. Decisione: adapter locale minimo sul bottone, senza cambiare la semantica del click o la geometria trasparente.
- GREEN: test mirato `RIPRESA-RITORNO-WHEEL-SUL-TONDO` prima con RED, poi con `node scripts/ripresa-run.mjs browser baseline-shell.spec.mjs`; regressione `scroll-p0.spec.mjs` e `RIPRESA-RITORNO-TRASPARENTE`.
- Rollback: rimuovere il solo listener wheel e il test aggiunto; nessuna modifica a `public/` finché build e diff sono verificati.

## R-SCROLL-STREAM-02 — nessun layout sincrono sul percorso caldo della rotella

- Regressione segnalata dopo il primo GREEN: lo scroll sul tondo funzionava, ma l'owner percepiva parole streammate a scatti mentre usava la rotella.
- Ispezione: il renderer Markdown non è la causa nel banco aggiornato (240 delta, render massimo 0,5 ms; `chat-lunga-p0` e `LAG-LIVE-TEXT-37` verdi). L'unico lavoro introdotto sul gesto era nel listener wheel: `getComputedStyle`, `scrollHeight` e `clientHeight` a ogni evento, letture che possono forzare layout sincroni durante il paint.
- Intervento: `inoltraRotellaConversazione` usa 16 px fissi per `deltaMode=line`, legge `clientHeight` solo per `page` e lascia a `scrollTop` il clamp ai bordi; non legge più stile/altezza del contenuto sul percorso pixel normale. Click, `preventDefault` condizionale e follow dello scroller restano invariati.
- Test RED/GREEN: `RIPRESA-RITORNO-WHEEL-SUL-TONDO` ora misura anche che il percorso lineare non chiami `getComputedStyle`; GREEN `2026-09-19T22-30-42-540Z-browser-d8084fe2`. Regressioni `scroll-p0` `2026-09-19T22-31-01-489Z-browser-d4de2d61` e `chat-lunga-p0` `2026-09-19T22-32-35-584Z-browser-3021e377` verdi.
- Rollback: ripristinare esclusivamente il corpo di `inoltraRotellaConversazione`; lasciare il test per evitare il ritorno delle letture forzate.

## R-4174-UPDATE-01 — consegna bundle verificato senza interrompere il server

- File esatti: `harness-ui/frontend/dist/{index.html,app.js,styles.css,manifest.json}` generati dalla build; `harness-ui/public/{index.html,app.js,styles.css,manifest.json}` aggiornati dopo il focused GREEN. Il processo 4174 resta PID 19300 e non viene riavviato.
- Precondizioni: build frontend exit 0; `RIPRESA-RITORNO-WHEEL-SUL-TONDO` e `scroll-p0.spec.mjs` exit 0; backup append-only di `public/` con hash; nessuna richiesta non-GET al server owner.
- Verifica: health GET 200, hash serviti uguali ai file `public/`, screenshot live solo dopo navigazione controllata. Rollback: ripristino dei quattro file dal backup con hash, senza toccare lo store sessioni.

Aggiornamento bundle streaming: backup `public-before-scroll-stream-20260919T223158Z`; `app.js` servito e `public/app.js` SHA256 `0c1634b5f12e8ce4af45aab4bb1a8ff65e4c98f65ab3a30aeadc699e74820f75`. La sonda live ha registrato `6000 → 5740`, health 200 e zero richieste non-GET.
## R-TEST-01 — ciclo di vita dei test replay
RED: backend completo 2026-09-19T21-20-46-421Z-backend-fbbc97a8: 3916 test, 3900 pass, 3 fail, 13 skip. BC09 segnala due rimozioni non classificate.
File esatti:
- harness-ui/tests/agent-timeline.test.mjs: banco, teardown e RIPRESA-REPLAY-FINE; attendere le scritture vere anziché 50 ms e retries.
- harness-ui/frontend/tests/browser/ripresa-replay.spec.mjs: RIPRESA-REPLAY-HTTP-UI, opzioni registro e finally; chiudere browser/server e attendere writer.
- harness-ui/tests/bc09-classificazione-rimozioni.test.mjs: CLASSE_B, motivazioni dei due server/writer reali.
Contratti stabili: API registro, formato timeline e scenari replay invariati. Nessuna modifica prodotto.
GREEN: runner backend agent-timeline.test.mjs bc09-classificazione-rimozioni.test.mjs; runner browser ripresa-replay.spec.mjs; backend completo.
Ricerca primaria: https://nodejs.org/docs/latest-v24.x/api/fs.html (19/09; promise appendFile completata prima della pulizia; rm retry maschera handle). Decisione: adottare Promise e fs già forniti da Node v24.18.0 fissato nel progetto; nessuna dipendenza. Rollback: ripristino selettivo dei tre file dalla base, senza toccare altri cambiamenti. Prova visibile: screenshot della spec browser e log univoci.

## R-SHELL-01 — approvazione segreti, due fallimenti da classificare
Nella stessa baseline falliscono le asserzioni marker in shell-chiede-davanti-a-un-segreto.test.mjs:261,368. Prima ripetizione diagnostica in snapshot, senza correzioni prodotto: tutta la spec passa (shell-diagnostic-8e4c06a7). Causa ancora ignota: NON dichiarato preesistente o risolto. Conservare il fallimento e ripetere con diagnostica del risultato tool se ricompare.
Ricerca primaria: https://nodejs.org/docs/latest-v24.x/api/child_process.html e https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_pipeline_chain_operators?view=powershell-7.5. Il kernel usa shell:true (cmd su Windows); nessuna base per attribuire il guasto a PowerShell.

## R-PUBLIC-01 — provenienza
Public main 13f65c15cdeaf8986b882993a0773cdeafb867d2; release desktop-v0.1.13 a898162feff3ed8ad4cb0586344fe9d9e390d1a5. Public workflow contiene pin più recenti del privato: preservarli, vietato export cieco. Nuova PR #37 Evolution Windows process tree, head4175dc760d39d78011fa1e545d7fc9d23049055c: censire, nessuna integrazione implicita.

## R-ELECTRON-01 — gate ripetibile in copia isolata
File nuovo esatto: harness-ui/desktop/scripts/ripresa-desktop-gate.mjs (entrypoint script, nessuna API prodotto). Riusa creaEsecuzione/creaSnapshot/creaAmbienteIsolato senza modificarli.
Problema accertato: tests/support.mjs elimina NODE_OPTIONS e imposta cartella dati, ma il bootstrap backend usa ancora il keyring OS; solo dataDir non isola le credenziali. Il runner crea snapshot e strumenta SOLO la copia di child-bootstrap.mjs col loader in-memory esistente; registra hash prima/dopo. Copia dipendenze con junction, profilo/home/temp isolati; preparaRuntime nella COPIA riceve preview. Non esegue installer. Gli screenshot esistenti scritti in .prove sono univoci perché il root è snapshot nuovo. I test del prodotto restano invariati, test keyring OS esplicitamente escluso dalla pretesa di completamento.
Ricerca primaria 19/09: https://playwright.dev/docs/api/class-electron (launch env, process inspection, close), https://nodejs.org/api/module.html#moduleregisterhooksoptions (hook già usato nel banco); versioni Electron44.3.0, Playwright1.62.1, Node24.18.0 esistenti. Adottare queste API e l'adapter test già presente, nessuna dipendenza.
Gate: node scripts/ripresa-desktop-gate.mjs; unit desktop poi backend.spec.mjs e guscio.spec.mjs seriali, rapporto per comando, nessun retry automatico. Preparazione ispezionabile con --prepare-only. Rollback: rimuovere solo il nuovo runner; nessun cambiamento prodotto/4174/installer.

## R-TEST-02 — scenari browser superati, senza indebolire il prodotto
RED: browser-00ccbf68; inventario pretende quattro ID rimossi dall'owner e dettaglio locale senza modelli nel banco; IMP-MOCKUP punta alla porta4210 e a un mockup sbagliato; sonde HF selezionano updated assente (API effettiva lastModified).
File esatti e simboli:
- harness-ui/frontend/tests/browser/_fase2-niente-perso.spec.mjs: apriImpostazioni e scenario; fixture deterministica GET local-models e apertura reale del pannello installati prima del censimento; nessun ID operativo tolto.
- harness-ui/frontend/tests/browser/fixtures/inventario-sezioni.json: rimuovere soltanto machineCapacityStatus, modelLabCatalogStatus, modelLabProviderStatus, modelLabRuntimeBadge, da models/models#1; decisione esplicita owner di eliminare i quattro riepiloghi. Controlli/righe/ganci invariati.
- harness-ui/frontend/tests/browser/_impostazioni-parita.spec.mjs: IMP-MOCKUP usa file canonico hash094207… e asserisce le sole tre voci funzionanti; le sette disabilitate restano dichiarate. IMP-APP mantiene inventario dieci superfici. Nessun click fallito inghiottito.
- harness-ui/frontend/tests/browser/_review-cure.spec.mjs: R18 selezione lastModified.
- harness-ui/frontend/tests/browser/_review-cure3.spec.mjs: tre selezioni lastModified.
- harness-ui/frontend/tests/browser/_review-cure4.spec.mjs: quattro selezioni lastModified.
Contratti: ricerca/filtri e controlli effettivi invariati; mockup originale intatto. Ricerca 19/09 https://playwright.dev/docs/network (route fixture), https://huggingface.co/docs/hub/api (API modelli), adapter hf-catalogo.js1242 traduce già createdAt/lastModified. Decisione: usare Playwright1.62.1 esistente, fixture solo per disponibilità modello nel test inventario; nessuna finzione nel prodotto.
GREEN: runner browser con i sei spec elencati, inventario invariato per tutti gli altri ID. Rollback selettivo delle sette modifiche dalla base, preservando gli altri lotti.

R-SHELL-01 integrazione diagnostica: file esatto harness-ui/tests/shell-chiede-davanti-a-un-segreto.test.mjs, due asserzioni positive marker. Aggiungere al messaggio fallito la risposta tool della rete di prova (solo segreto sintetico CHIAVE=segreta), senza modificare l'asserzione o il kernel. Gate RED completo già conservato; due rerun focused verdi 8e4c06a7/b610da00, non sufficienti per attribuire il problema. Rollback selettivo messaggi asserzione.
