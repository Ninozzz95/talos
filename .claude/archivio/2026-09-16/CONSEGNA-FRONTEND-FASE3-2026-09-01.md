# Consegna — Frontend desktop Fase 3

Data: 2026-09-01  
Owner: TALOS UI desktop  
Stato: GREEN tecnico e visivo; chiusura subordinata alla review indipendente.  
Cutover: nessuno. La UI owner in `harness-ui/public/` non è stata sostituita.

## Cosa è stato costruito

La fondazione frontend modulare possiede ora un Design system Calm verificabile
e non decorativo. Colori, tipografia, densità, raggi, focus e movimento hanno
una sola fonte tokenizzata; pulsanti, badge, switch, tabs, menu, tooltip e sheet
sono componenti posseduti con stato controllato, accessibilità, teardown
idempotente e comportamento da tastiera.

Il laboratorio separato permette di provare ogni primitiva senza pubblicarla
nella schermata usata dall'owner. Nessun endpoint, formato sessione, flusso chat
o file mobile è stato cambiato.

## Decisione upstream

È stato adottato direttamente `@floating-ui/dom@1.8.0`, pin esatto, licenza MIT
inclusa nel bundle e uso confinato dietro l'adapter TALOS
`createFloatingPositioner`. La libreria risolve flip, shift e aggiornamento del
posizionamento per menu e tooltip; non diventa il modello di dominio interno.

Sono stati adattati i pattern WAI-ARIA ufficiali per Button, Tabs, Switch, Menu,
Tooltip e Dialog, i token Calm già canonici nel prodotto e i contratti
`prefers-reduced-motion`/forced colors. Il formato DTCG JSON resta differito:
introdurlo ora aggiungerebbe una seconda sorgente senza un consumatore reale.
Non è stato introdotto un secondo framework UI.

## Regressioni scoperte e chiuse

- `PHASE3-TABS-FOCUS-12`: un update controllato ricreava le tabs e perdeva il
  focus prima del comando successivo. Il componente conserva e ripristina ora
  il tab focalizzato.
- `PHASE3-MOTION-SPECIFICITY-13`: il selettore del tema poteva prevalere sul
  token motion ridotto. La regola media ha ora specificità equivalente.
- `PHASE3-VISUAL-BALANCE-14`: l'ultimo gruppo del laboratorio lasciava una
  colonna vuota priva di significato. Il gruppo usa ora la larghezza utile.
- `PHASE3-SHEET-MOTION-15`: una cattura dello stato finale non provava davvero
  l'animazione. Il gate misura durata, geometria, hit-test e differenze pixel
  prima, durante e dopo il passaggio.
- `PHASE3-MENU-VIEWPORT-16`: una cattura `fullPage` poteva nascondere un menu
  uscito dal viewport. Il gate usa il viewport reale e asserisce tutti i bordi.

## Evidenza fresca

- frontend unit/contract: `57/57`;
- matrice Design system focalizzata: `27/27` su 1440×900, 1280×800 e
  1024×800;
- laboratorio browser completo: `42/42` sulle stesse tre viewport;
- backend Harness completo: `1259/1259`;
- UI desktop prodotto: `76` passati, `2` gate reali opt-in saltati;
- `npm --prefix harness-ui/frontend run verify`: GREEN, attestato
  `harness-ui/frontend/artifacts/phase-03-verification.json` coerente;
- server owner `http://127.0.0.1:4174/`: `200` prima e dopo;
- nessuna nuova chiamata reale al provider;
- hash SHA-256 pubblici identici alla Fase 2:
  - `index.html`: `967aaa91a3282e200c9c0c50af40d51c848167ded636cd8d3c0380de52e605a3`;
  - `app.js`: `8e2bc70fe4a1c204b5a1c5da6b2edd729db67b8b82a3c4358398dbf892437e2c`;
  - `styles.css`: `43e4ac6c07e04ad86f9457d2eecc054f9169eecc56e44a6ac27f8dfcdee1b73a`.

Il primo tentativo della suite backend è stato lanciato dalla directory
`harness-ui/` con un percorso già prefissato `harness-ui/`: i quattro errori
erano quindi file non trovati per una directory duplicata, non regressioni.
Il comando canonico dalla radice del worktree ha chiuso `1259/1259`.

## Prova visiva ispezionata integralmente

In `harness-ui/frontend/artifacts/phase-03/`:

- tre viste complete `design-system-desktop-*`;
- tre menu aperti `menu-open-desktop-*` catturati nel viewport reale;
- tre sheet aperti `sheet-open-desktop-*`;
- per ogni viewport, i frame `sheet-motion-before-*`,
  `sheet-motion-during-*` e `sheet-motion-after-*`.

Le catture sono state aperte e controllate per intero. Non presentano overflow
orizzontale, clipping, sovrapposizioni, contrasto anomalo o controlli
irraggiungibili. Il menu resta dentro il viewport, lo sheet mantiene corretti
z-index, background inerte e controlli visibili, e il passaggio animato ha uno
stato intermedio misurabile. Reduced motion e forced colors hanno gate propri.
Sono catture Playwright locali, non vengono dichiarate screenshot del browser
in-app.

## Limiti intenzionali

- Nessun cutover della shell: avverrà soltanto nelle fasi previste dalla
  roadmap.
- Nessuna capability nuova viene mostrata nella produzione owner.
- `MESSAGE-ACTIONS-6.3B` resta nella Fase 5 al pin mobile stabile
  `e69402bcf940a4a347434ab93e551c39ff7f86c6`.
- Le pagine reali Libreria, Memoria, Note, Attività e Ricerca approfondita
  restano nella Fase 4.
- La valutazione FreeToken resta differita dopo il contratto runtime locale e
  non altera questa sequenza.

## File e rollback

L'elenco esatto di file, simboli, test e comandi è nel
`LEDGER-FRONTEND-FASE3-2026-09-01.md`. Il rollback rimuove soltanto primitive,
fogli token, route e test del laboratorio e la dipendenza Floating UI; non
richiede migrazioni, restart del server o modifica delle sessioni.

## Riassunto semplice

È stato costruito il vocabolario visivo e comportamentale comune che le nuove
schermate desktop useranno: gli stessi controlli avranno aspetto, focus,
movimento e risposta alla tastiera coerenti. Tutto è stato provato in un
laboratorio isolato, quindi la schermata corrente dell'owner non è cambiata.
La prossima fase potrà ricomporre sidebar, header, contenuto, composer e pannello
destro usando componenti già misurati invece di aggiungere altro codice
monolitico.
