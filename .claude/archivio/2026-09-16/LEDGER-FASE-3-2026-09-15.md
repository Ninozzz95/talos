# Ledger esecutivo — Fase 3 reale (15 settembre 2026)

## Confine misurato

La tabella del 13/09 parla di sette superfici e quindici tool. Il codice corrente espone cinque collezioni eliminabili (`library`, `notes`, `tasks`, `memory`, `research`), Progetti in sola lettura e Board con selezione sessioni gia condivisa. Gli unici contratti di elenco capaci di avanzare una pagina sono `library_list`, `library_search` e `research_list`; i primi due hanno gia il cancello BC-10. Questa tranche implementa solo i contratti reali e non inventa una DELETE di Progetti o una seconda selezione nel Board.

## File e simboli

### Da creare

- `harness-ui/tests/http-routes-batch-delete.test.mjs`: scenari `FASE3-BATCH-214`, `FASE3-BATCH-PARZIALE`, `FASE3-BATCH-CAP`, `FASE3-BATCH-SESSIONE`.
- `harness-ui/src/assistenza.mjs`: `cercaAssistenza`, `indicizzaAssistenza`, `normalizzaDomandaAssistenza`.
- `harness-ui/tests/http-routes-assistenza.test.mjs`: scenari `FASE3-HELP-FONTE-REALE`, `FASE3-HELP-NON-LO-SO`, `FASE3-HELP-LIMITE`.

### Da modificare

- `harness-ui/src/http-app.mjs`: inventario `ROTTE_API`, validazione `requireBatchDeleteBody`, esecuzione `eliminaInBlocco`, route `POST /api/v1/sessions/:sessionId/:resource/batch`, route `POST /api/v1/assistenza`.
- `harness-ui/tests/http-inventario-rotte.test.mjs`: metodi dichiarati delle nuove route.
- `harness-ui/frontend/src/components/sezione-elenco-dettaglio.js`: stato `selezionateInBlocco`, toolbar condivisa, checkbox per voce, conferma e applicazione degli esiti parziali.
- `harness-ui/frontend/src/components/sezioni-adattatori.js`: `eliminaInBlocco` nelle cinque configurazioni scrivibili; Progetti resta senza il contratto.
- `harness-ui/frontend/src/components/modulo-voce.js`: metodo pubblico `servizioVoci.eliminaInBlocco(ids)`.
- `harness-ui/frontend/src/legacy/app.js`: passa la rete reale anche a Libreria e collega il ricaricamento dopo il batch.
- `harness-ui/frontend/src/styles/mockup-td.css`: stile compatto e accessibile della selezione multipla.
- `harness-ui/frontend/tests/unit/sezione-elenco-dettaglio.test.mjs`: scenario `FASE3-MULTISELECT-PARZIALE` sui puri estratti.
- `harness-ui/frontend/tests/unit/modulo-voce.test.mjs`: contratto dell'unica POST batch per Note, Attività e Memoria.
- `harness-ui/frontend/tests/parity/nessun-errore-a-runtime.spec.mjs`: scenario umano `FASE3-MULTISELECT-UNA-POST`, con esito parziale sulla Libreria reale e una sola richiesta.
- `harness-ui/src/kernel/talosHarness.mjs`: schema/descrizione `research_list`, `CAMPI_CHE_IDENTIFICANO_LA_DOMANDA.research_list`, guardia nell'esecuzione.
- `harness-ui/src/kernel/talosHarness.test.mjs`: sostituisce il debito che pretendeva il `TypeError` con `FASE3-RESEARCH-PAGINATION-GUARD` e censisce tutti i tool realmente paginabili.
- `harness-ui/tests/ricerca-deposito-a-pezzi.test.mjs`: mantiene l'impronta storica BC49 esentando e verificando il solo nuovo campo opzionale di `research_list`.
- `harness-ui/tests/http-routes-batch-delete.test.mjs`: usa la pulizia classificata BC09 anche nel nuovo banco batch.
- `scripts/tests/prepara-monorepo-pubblico.test.mjs`: ricostruisce nel solo banco una copia pre-monorepo per provare davvero anteprima, rinomine R100 e conservazione mobile; la copia pubblica corrente e' gia monorepo e non puo piu essere la premessa del test di prima migrazione.
- `harness-ui/public/app.js`, `harness-ui/public/styles.css`, `harness-ui/public/build-manifest.json`: soli artefatti deterministici della build frontend.
- `.claude/TABELLA-FASI-COMPLETA-2026-09-13.md`: esito e scostamento misurato della Fase 3.

Nessun file viene eliminato. Se l'ispezione di C4/C5 invalida un percorso, questo ledger viene corretto prima del relativo prodotto.

## RED, GREEN e regressioni

- RED HTTP: una lista di 214 id non ha ancora una route unica; i limiti, l'ordine e gli esiti per id devono fallire prima del codice.
- RED UI: le cinque sezioni non espongono checkbox, seleziona-visibili o conferma batch; il test vivo deve provare una sola POST e mantenere selezionati i falliti. Ispezione correttiva: il file `dettaglio-sei-sezioni-vivo.spec.mjs` previsto inizialmente non esiste e la configurazione Playwright include una allowlist stretta; la prova entra quindi nel cancello vivo `nessun-errore-a-runtime.spec.mjs` già isolato sulle porte 4176/4177.
- RED kernel: la terza pagina di `research_list` raggiunge ancora `onRicercaLista`; deve essere rifiutata e non consumare lo store senza `browse_every_page:true`.
- RED assistenza: manca una route che indicizzi `docs/assistenza/*.md`, restituisca fonti reali e dica esattamente `non lo so` senza corrispondenze.
- RED assistenza di prodotto: la pagina metadocumentale `docs/assistenza/README.md` batteva la fonte di prodotto sulla domanda repository/licenza. Inoltre la regex dei separatori di tabella cancellava tutte le righe Markdown che iniziavano con `-`, comprese AGPL e repository; una volta conservate, il taglio a 1.200 caratteri spezzava il nome della repository. Il README dell'indice viene escluso dal corpus servito, il separatore riconosce soltanto righe di tabella complete e l'estratto privilegia i passaggi che contengono i termini chiesti; identita, repository, licenza e versione sono scenari permanenti `FASE3-HELP-TALOS`.
- RED esportatore misurato: 11/15 verdi; `R05B-ANTEPRIMA`, `R05B-R100`, `R05B-SOTTOMODULI` e `R05B-SNAPSHOT` partivano dalla copia pubblica gia riordinata. Il banco deve fabbricare una premessa legacy locale e continuare a non mutare `AVM-PUBBLICA`.
- GREEN mirati: i quattro file di test sopra, i test unitari frontend toccati e il banco esportatore R05B.
- Regressione: suite kernel completa, suite HTTP interessata, suite frontend unit/contract, Playwright desktop mirato, `npm run build`, `npm run verify-build`, `git diff --check`.

## Contratti e limiti

- Batch: `POST .../:resource/batch`, corpo `{ "azione": "elimina", "ids": [...] }`; massimo dichiarato 250 id unici e non vuoti, corpo massimo 64 KiB. Una richiesta valida torna 200 con un esito ordinato per id; errori di una voce non annullano le altre. Richiesta invalida 400; sessione assente 404.
- Selezione UI: checkbox native separate dal bottone che apre la scheda; selezione di tutte le sole voci visibili; una conferma distruttiva; una richiesta; successi deselezionati e falliti mantenuti per ritentare.
- Paginazione: al massimo due pagine spontanee; tutte le pagine solo con `browse_every_page:true`; massimo assoluto invariato; `research_list` usa `status` come identita della domanda e `offset` come cursore.
- Assistenza: solo Markdown tracciato sotto `docs/assistenza`; domanda limitata; risposta composta da estratti trovati e citazioni relative. Nessuna corrispondenza affidabile produce `non lo so` e `fonti: []`.

## Dossier upstream e decisione

- WHATWG `requestAnimationFrame`: adottato direttamente per aggregare il paint dello streaming, senza coda artificiale.
- W3C Long Animation Frames, WD 28/04/2026: adottata la soglia osservabile di 50 ms nel banco del renderer.
- RFC 9110 sezione 9.3.5: adattato dietro API AVM; il batch usa POST per non affidarsi a un corpo DELETE privo di semantica generale e spesso rifiutato.
- RFC 4918: `207 Multi-Status` respinto perche e un contratto WebDAV/XML; il JSON AVM usa 200 con esiti per voce.
- WAI-ARIA APG Listbox: respinto il pattern listbox con controlli interattivi annidati; vengono usati checkbox e button HTML nativi.
- JSON:API Atomic Operations: respinto per questo caso, perché la Fase 3 richiede successi e fallimenti parziali per voce, non atomicita tutto-o-niente.
- SQLite FTS5/BM25: valutato dalla documentazione ufficiale e respinto per il corpus locale di 33 pagine piccole e immutabili durante il processo; introdurrebbe database, schema e migrazione senza migliorare il confine richiesto. Si mantiene l'indice in memoria deterministico, con il README metadocumentale fuori dalle risposte di prodotto.

Pin di contratto: WHATWG Living Standard letto il 15/09/2026; W3C WD `2026-04-28`; RFC 9110 (2022); RFC 4918 (2007). Nessuna nuova dipendenza runtime.

## Prova umana e rollback

Prova: aprire ciascuna delle cinque sezioni, selezionare piu voci, usare “Seleziona visibili”, confermare, osservare una sola richiesta e un riepilogo successi/fallimenti; chiedere all'assistenza una funzione documentata e poi una stringa ignota; provocare tre pagine `research_list` e verificare il rifiuto prima dello store.

Rollback: revert dei soli file elencati; il contratto singola-voce resta invariato. Gli artefatti `public/*` si rigenerano dai sorgenti. Nessun dato viene migrato.

## Esito finale verificato

- Suite server completa: 3.016 test, 3.012 passati, 0 falliti, 4 skip (`node --test tests/*.test.mjs`).
- Kernel: 598/598 passati.
- Frontend unitario interessato: 54/54 passati.
- Browser: i nuovi scenari batch, Help/Prompt Enhance e streaming sono verdi a tre viewport; il totale resta 147 passati e 12 debiti parity preesistenti su ProviderCard, Conversazione e Inspector.
- Esportatore pubblico: 15/15 passati sulla premessa legacy temporanea; R100 ha misurato 2.224 rinomine.
- Documentazione assistenza: 24 controlli, 218 elementi guardati, 0 rossi.
- Build frontend e UI pubblica: 32 e 33 asset verificati; manifest pubblico di 33 asset valido.
- Desktop Electron: 61/61 passati.
- Controllo whitespace: `git diff --check` pulito.
