# Consegna — Frontend desktop Fase 2

Data: 2026-09-01  
Owner: TALOS UI desktop  
Stato: GREEN tecnico, visivo, documentale e di review indipendente.  
Cutover: nessuno. La UI owner in `harness-ui/public/` non è stata sostituita.

## Cosa è stato chiuso

La fondazione frontend parallela possiede ora uno stato applicativo esplicito,
un reducer con invarianti, sottoscrizioni selettive e un lifecycle unico che
chiude listener, timer, richieste, observer e risorse in ordine deterministico.
La UI modulare dispone inoltre di componenti con teardown idempotente, liste
keyed, virtualizzazione per collezioni grandi, focus trap, overlay, shortcut e
annunci accessibili.

Il laboratorio separato prova tre superfici reali:

- lista da 10.000 elementi con un numero limitato di righe montate;
- modale con focus iniziale, ciclo Tab, Escape, sfondo inerte e ritorno del
  focus;
- avvio e distruzione dell'app senza listener o globali duplicati.

Non sono state pubblicate nuove pagine, route o capability decorative. La
Fase 2 prepara il confine, non effettua il cutover della UI esistente.

## Decisione architetturale

La ricerca e le misure non giustificano un cambio framework in questa fase.
Il lag osservato proveniva dal watcher del workspace e da scritture di stile a
ogni frame, già corretti nel P0, non dall'assenza di Vue. La base resta quindi
ESM nativa e framework-neutral. Un eventuale verticale Vue richiederà una
decisione owner separata, una misura comparativa e parità dimostrata prima di
qualunque cutover.

Per la virtualizzazione è stato adottato direttamente
`@tanstack/virtual-core@3.17.8`, pin esatto, licenza MIT inclusa nel bundle e
uso confinato dietro l'adapter TALOS `createVirtualList`.

## Regressioni scoperte e chiuse

`PHASE2-OVERLAY-STATE-11`: la prima implementazione azzerava uno stato
`inert`/`aria-hidden` già appartenente alla pagina quando una modale veniva
chiusa. Il RED ha misurato `{ inert: false, ariaHidden: null }` al posto dello
stato precedente. Il manager conserva ora ogni valore originale e lo ripristina
esattamente. Il gate browser è verde nelle tre viewport.

`PHASE2-GLOBAL-TEARDOWN-10`: il teardown elimina correttamente il proprio
globale alla prima chiamata. Il test conserva il riferimento e prova che la
prima distruzione restituisce `true`, la seconda `false`, senza confondere la
rimozione del globale con un errore applicativo.

La review indipendente ha inoltre trasformato in contratti permanenti:

- `PHASE2-SELECTOR-STABILITY-12`: cache separate per store concorrenti;
- `PHASE2-EFFECT-CLEANUP-ISOLATION-13`: un cleanup guasto non lascia risorse
  vive;
- `PHASE2-OVERLAY-STACK-14` e `PHASE2-OVERLAY-DESTROY-15`: stack modale
  fail-closed e manager non riutilizzabile dopo la distruzione;
- `PHASE2-EFFECT-TIMEOUT-16`: i timer conclusi non accumulano cleanup;
- `PHASE2-STATE-PLAIN-17`, `PHASE2-SESSION-MEMBERSHIP-18` e
  `PHASE2-STATE-IMMUTABLE-22`: lo stato accetta soltanto valori semplici,
  selezioni osservate e riferimenti profondamente immutabili, incluse chiavi
  simboliche e non enumerabili;
- `PHASE2-EVENT-CONTRACT-DRIFT-19` e `PHASE2-STORAGE-CONTRACT-DRIFT-20`: eventi
  redirect e dimensioni modali restano allineati alla baseline owner;
- `PHASE2-LIVE-REGION-MODAL-21`: gli annunci restano percepibili mentre il
  resto dello sfondo è inerte;
- `PHASE2-VERIFICATION-EVIDENCE-23`: il gate scrive e dichiara realmente
  l'attestato della Fase 2, senza metadati residui della Fase 1.

## Evidenza fresca

- frontend unit/contract: `53/53`;
- laboratorio browser: `15/15` su 1440×900, 1280×800 e 1024×800;
- backend Harness completo: `1259/1259`;
- UI desktop prodotto: `76` passati, `2` gate reali opt-in saltati;
- `npm --prefix harness-ui/frontend run verify`: GREEN, attestato
  `harness-ui/frontend/artifacts/phase-02-verification.json` coerente;
- `git diff --check`: pulito;
- server owner `http://127.0.0.1:4174/api/v1/health`: `200` prima e dopo;
- nessuna nuova chiamata reale al provider;
- hash SHA-256 pubblici identici prima e dopo:
  - `index.html`: `967aaa91a3282e200c9c0c50af40d51c848167ded636cd8d3c0380de52e605a3`;
  - `app.js`: `8e2bc70fe4a1c204b5a1c5da6b2edd729db67b8b82a3c4358398dbf892437e2c`;
  - `styles.css`: `43e4ac6c07e04ad86f9457d2eecc054f9169eecc56e44a6ac27f8dfcdee1b73a`.

## Prova visiva ispezionata integralmente

In `harness-ui/frontend/artifacts/phase-02/`:

- `virtual-list-desktop-1440x900.png`;
- `virtual-list-desktop-1280x800.png`;
- `virtual-list-desktop-1024x800.png`;
- `focus-overlay-desktop-1440x900.png`;
- `focus-overlay-desktop-1280x800.png`;
- `focus-overlay-desktop-1024x800.png`;
- `application-lifecycle-desktop-1440x900.png`;
- `application-lifecycle-desktop-1280x800.png`;
- `application-lifecycle-desktop-1024x800.png`.

Tutte e nove le catture sono state aperte e controllate per intero. Non sono
emersi overflow orizzontali, clipping, sovrapposizioni, errori rete/console o
salti di geometria. La quantità diversa di righe visibili nella lista dipende
dall'altezza utile e l'ultimo elemento `9999` resta raggiungibile.

## Pin e debiti che non vanno confusi con questa fase

- `MESSAGE-ACTIONS-6.3B`: futuro pin mobile stabile
  `e69402bcf940a4a347434ab93e551c39ff7f86c6`. Verrà consumato solo nella
  fase Conversazioni/sessioni. Il desktop non modifica il mirror mobile.
- `NAV-CAPABILITY-FIRSTCLASS-01`: Libreria, Memoria, Note, Attività e Ricerca
  approfondita devono diventare righe/pagine reali nella Fase 4.
- `RESEARCH-MOBILE-PARITY-01`: il motore Ricerca desktop resta una thin slice;
  la parità funzionale col mobile è un programma distinto.

## File e rollback

L'elenco esatto di ogni file e simbolo è in
`.claude/LEDGER-FRONTEND-FASE2-2026-09-01.md`. Il rollback rimuove soltanto la
fondazione parallela e ripristina gli script frontend modificati; non richiede
migrazioni, cambio server o modifica delle sessioni.

## Riassunto semplice

È stato costruito il telaio interno che impedisce a finestre, scorciatoie,
liste e connessioni di restare appese o duplicarsi mentre l'app cambia pagina
o sessione. È stato provato separatamente senza sostituire la schermata che
l'owner usa oggi. Il prodotto corrente è rimasto invariato e tutti i controlli
automatici, visivi e di review indipendente sono verdi. La prossima fase può
quindi consolidare il Design system Calm e le primitive sopra un lifecycle già
misurato; la ricomposizione della shell viene subito dopo.
