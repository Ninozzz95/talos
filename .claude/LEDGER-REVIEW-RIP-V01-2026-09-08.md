# RIP-V01 — Review: azioni senza sovrapposizione

## Decisione e misure prima dell'edit

Owner 08/09/2026: approvato «Copia i diff» come icona quando manca spazio, con testo al passaggio e nome accessibile. Restano una riga, schede al centro vero, titolo troncato per primo e diff approvata. Decisioni lette integralmente: registro in `LEDGER-RIPRESA-2026-09-08.md`; vincoli G1–G2/G23–G26/H27–H30.

4174, viewport 1280×720: testata x276–940, larghezza 664; colonne 143,708 / 316,583 / 143,708 px. Schede x449,708–766,292, azioni x729,573–922: sovrapposizione 36,719 px. Titolo e schede sono già nella stessa riga: il vecchio difetto del quarto figlio è diverso. Foto aperta: `4174-review-rip-v01-misura.jpg`, Browser coperto dall'azione Albero; resto della Review vuota integro.

## Ricerca prima del codice — consultata 08/09/2026

- W3C CSS Grid Level 1, versione pubblicata 26/03/2025: https://www.w3.org/TR/2025/CRD-css-grid-1-20250326/ — le dimensioni delle tracce non impediscono al contenuto di eccedere. Il layout attuale usa due tracce simmetriche; espandere solo quella destra cambierebbe la centratura approvata.
- Microsoft Fluent 2, Toolbar: https://fluent2.microsoft.design/components/web/react/core/toolbar/usage — toolbar su una riga, icone con tooltip e nome accessibile oppure overflow menu. L'owner ha scelto l'icona adattiva; menu non scelto.
- WAI APG Toolbar: https://www.w3.org/WAI/ARIA/apg/patterns/toolbar/ — accessibilità e interazione da tastiera dei controlli; nessuna nuova semantica toolbar introdotta per questo fix.

Ricerca eseguita oggi su documentazione attuale; la specifica W3C ha data precedente, non è presentata come novità dell'ultimo mese. Decisione upstream: adottare il comportamento CSS nativo e adattare il pattern Fluent nel componente esistente; nessuna nuova dipendenza React per un bottone HTML. Pin di riferimento W3C sopra; runner già fissato `@playwright/test` 1.62.1. Nessun protocollo, schema, trasporto o formato nuovo.

## Piano esecutivo prima del codice

File da modificare:

1. `harness-ui/frontend/mockup/talos-mockup.html`: solo regole e markup della testata Review. `#copyAllDiffs` mantiene id e gestore; testo in span `.talos-review__copy-label`, nome accessibile persistente, icona e tooltip esistenti. Container query compatta il controllo sotto 1000 px di contenuto della testata, mantenendolo quadrato 36 px. I due pulsanti della testata `[data-richiede="fase3"]` vengono dichiarati `hidden` anche nella fonte, come già richiesto e applicato dal runtime; non competono come azioni disponibili nel laboratorio.
2. `harness-ui/frontend/index.template.html`: rigenerato soltanto.
3. `harness-ui/frontend/src/styles/index.css`: rigenerato soltanto.
4. `harness-ui/frontend/playwright.componenti.config.mjs`: includere il nuovo test geometrico permanente.
5. `harness-ui/public/index.html`: consegna generata.
6. `harness-ui/public/styles.css`: consegna generata.
7. `harness-ui/public/build-manifest.json`: hash aggiornati dalla build. Se la build modifica un altro asset, registrarlo qui prima della consegna.
8. `.claude/LEDGER-RIPRESA-2026-09-08.md`: lettura decisioni, regole owner e stato finale.
9. `.claude/LEDGER-REVIEW-RIP-V01-2026-09-08.md`: questo piano, risultati e consegna.

File da creare:

10. `harness-ui/frontend/tests/parity/review-testata.spec.mjs`: helper locali `misuraTestata` e `verificaTestata`; test RIP-V01 geometria/click/focus, stato vuoto/pieno, ricarica, larghezza ampia ed esperimento al contrario con etichetta ripristinata. Nessun export pubblico.
11. `.claude/taccuini/astra-review-2026-09-08.md`: giudizi delle immagini aperte; foto in `scratchpad/prove/foto/astra-review-20260908/` (evidenze non di prodotto).

Simboli compatibili: `#copyAllDiffs`, `testoDiffCompleto`, `renderReviewFile`, `aggiornaDiffReview`, `nascondiAzioniFase3`, `data-vaia`, `data-vistetab`, `talos-topbar__title`, `talos-topbar__actions` e sprite `#i-copy` restano stabili. Nessuna modifica al gestore copia, API, storage, traduzione o dipendenze. Nessun token CSS nuovo.

RED: `RIP-V01: Review mantiene schede e azioni separate` deve fallire sulla sovrapposizione reale anche nascondendo le azioni future come fa il runtime. Il test al contrario forza la vecchia larghezza con testo e deve respingere il layout; geometria e hit-test sono asserzioni, non soli screenshot.

GREEN: `node scripts/mockup-to-template.mjs`; `npm run test:unit`; `npm run test:componenti -- --grep "RIP-V01|COMP Review:|COMP Topbar:"`. I test Review coprono tutte le tre larghezze, desktop ampio, focus da tastiera, nome accessibile, azionabilità del controllo tramite click trial senza sostituire il gestore reale, ricarica e movimento ridotto. La suite unitaria completa copre i contratti frontend; il confronto include Topbar Chat per assicurare lo scope. Server/kernel già verdi nella ripresa e non modificati da questo intervento esclusivamente HTML/CSS.

Consegna: `npm run aggiorna` in harness-ui costruisce, copia e riavvia 4174; poi verifica visiva in sola lettura a 1440/1280/1024 e verifica asset serviti. Nessuna run pagata o modifica alle sessioni dell'owner. Stato vuoto deve mantenere copia disabilitata; il click di copia con dati reali non si certifica da un evento sintetico. La funzionalità del gestore resta invariata.

Rollback: ripristinare esclusivamente le modifiche di questa consegna alla fonte, rigenerare, ricostruire e riconsegnare tramite lo stesso script. Nessuna migrazione o dato da ripristinare. Failure: non consegnare build/test rossi; non riavviare se build fallisce.

## Risultati freschi

- RED prima dell'edit della fonte: tre fallimenti RIP-V01, separazione negativa −12,656 / −50,656 / −8,656 px nelle fixture 1440/1280/1024; le tre prove inverse respingono il vecchio comportamento.
- GREEN dopo il fix: sei test RIP-V01 passano; vecchia larghezza reintrodotta solo nel DOM della prova inversa, respinta dallo stesso controllo geometrico.
- Regressione frontend: 463/463 unitari, 0 fallimenti/skipped, 1179,8799 ms. Parità Review e Topbar più RIP-V01: 12/12, 16,7 s. La suite completa componenti era 120/120 nella ripresa; qui ripetuti i due componenti interessati alle tre larghezze e i nuovi controlli. Nessuna modifica globale della griglia, nessuna modifica al backend.
- Build: 31 asset. Rigenerazione: 18 schermate, 122 blocchi, 576 istanze. Nessun asset modificato fuori dai tre file public pianificati; `public/app.js` invariato.
- Consegna tramite `npm run aggiorna`: frontend costruito e copiato, vecchio server fermato, 4174 riavviato e health 200. Log senza avviso di kernel mancante. La risposta CSS è identica al file consegnato.
- Una prima verifica impropria degli hash HTTP è fallita: l'HTML incorpora un nonce CSP dinamico (`iniettaNonceNelDocumento`), e `build-manifest.json` non è nella allowlist degli asset pubblici (404 previsto). Nessuna regressione: verificati il codice del server, il CSS identico e il DOM aggiornato nel browser; nessuna modifica alla CSP o alle rotte.
- 12 immagini componenti aperte singolarmente (Review/Topbar × app/mockup × tre larghezze). Altre tre immagini fresche sul 4174, aperte singolarmente e registrate in `.claude/taccuini/astra-review-2026-09-08.md`. La precedente foto del difetto è registrata nello stesso taccuino.
- Distanza schede–azioni misurata sul 4174: 73,708 px a 1440; 35,708 px a 1280; 77,708 px a 1024. Errore di centratura a 1280 e 1024 inferiore a 0,001 px; controllo automatico anche a 1920. Copia larga 36 px e disabilitata nella Review reale senza file, come previsto.
- Il browser temporaneo è stato chiuso e le dimensioni ripristinate. Nessuna sessione nuova, run, modifica di provider o scrittura di prova sul 4174.
- `git diff --check` verde. `.gitignore` dell'owner conservato e escluso dal commit. Nessun AGENTS modificato, nessun push.

Log grezzi: `C:/Users/Antonino/AppData/Local/Temp/talos-review-rip-v01-unit.log`, `talos-review-rip-v01-componenti.log`, `talos-review-rip-v01-consegna.log` nella stessa directory. Immagini conservate in `scratchpad/prove/foto/astra-review-20260908/`.

## Consegna

RIP-V01 corretto e visto nella app. Il fix riguarda layout e accessibilità del controllo: non certifica nuovamente copia di dati reali, API, ricevute o azioni future. La prova del flusso dati non è stata simulata come se fosse una run umana.

**Cosa deve fare l'owner:** può verificare Review su http://127.0.0.1:4174; nessuna azione obbligatoria. **Cosa fai tu dopo:** affrontare il pannello destro, sottoponendo all'owner scelte aperte e dubbi prima del lavoro dipendente. **Cosa rimane:** pannello e prove reali isolate, debiti del ticket e coda PO-01–PO-07.
