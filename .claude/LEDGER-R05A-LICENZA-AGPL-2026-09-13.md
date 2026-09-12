# Ledger R-05A — licenza del monorepo e note desktop

Data: 13/09/2026. Sottosistema posseduto: TALOS UI/desktop e documentazione legale radice, limitatamente all'elenco esplicito del brief. Nessuna modifica al comportamento applicativo, nessun server, installazione o chiamata a pagamento. Mai porta 4174, indice, commit o push.

## Ispezione e ricerca prima delle modifiche

Base dichiarata `.claude/R05A-BASE.txt`: `ae7c26fa`; HEAD staccato, da verificare nel verbale finale. Preesistenti non tracciati: quel file e `.claude/RAPPORTO-R01-GUSCIO-ELECTRON-2026-09-13.md`, da conservare. Letti AGENTS radice e harness-ui, RTK, manifesti, quattro lock, avvisi terzi e ledger/rapporti R-01/R-02/R-04/R-06. `rg` non è nel PATH: inventario con `git ls-files` e letture Node tramite `rtk proxy`.

Fonti consultate il 13/09/2026, dossier esteso nel rapporto finale:

- [AGPLv3 ufficiale GNU, testo](https://www.gnu.org/licenses/agpl-3.0.txt): endpoint www non disponibile (timeout/403); download riuscito dello stesso documento dall'[archivio ufficiale GNU](https://ftp.gnu.org/gnu/Licenses/agpl-3.0.txt). 34.523 byte; SHA-256 `0d96a4ff68ad6d4b6f1f30f713b18d5184912ba8dd389f86aa7710db079abcb0`. Versione 3, 19 novembre 2007, §13 e istruzioni finali di applicazione.
- [SPDX AGPL-3.0-only](https://spdx.org/licenses/AGPL-3.0-only.html): scelta solo v3 distinta da or-later, da dichiarare negli avvisi; l'appendice del testo integrale resta intatta.
- [GitHub, riconoscimento licenza](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/licensing-a-repository): Licensee confronta LICENSE; [Choose a License](https://choosealicense.com/licenses/agpl-3.0/) indica file integrale e campo npm SPDX.
- [FSF, elenco licenze](https://www.gnu.org/licenses/license-list.html.en) e [compatibilità](https://www.gnu.org/licenses/license-compatibility.en.html): Apache-2.0, MIT/Expat, ISC e BSD a 2/3 clausole compatibili; MPL-2.0 condizionata all'assenza dell'avviso di incompatibilità con licenze secondarie. GPLv3/AGPLv3 combinabili tramite §13, non intercambiabili.
- [FSF, titolare e licenze multiple](https://www.gnu.org/licenses/gpl-faq.html.en#ReleaseUnderGPLAndNF); [Apache-2.0, §§2 e 4](https://choosealicense.com/licenses/apache-2.0/): vecchi diritti non revocati; avvisi terzi da conservare. Titolarità unica e assenza di contributori esterni sono la premessa esplicita dell'owner, non una verifica di GitHub in questo lotto.
- SPDX [SSPL-1.0](https://spdx.org/licenses/SSPL-1.0.html), [BUSL-1.1](https://spdx.org/licenses/BUSL-1.1.html), [CC-BY-NC-4.0](https://spdx.org/licenses/CC-BY-NC-4.0.html), [Elastic-2.0](https://spdx.org/licenses/Elastic-2.0.html): restrizioni ulteriori da non accettare automaticamente in un'opera combinata AGPL.
- Licenze nei pacchetti installati: Electron 44.3.0, node-pty 1.1.0, png-js 1.1.0 MIT; llama.cpp b10517, commit `dc72703fc69698b1ea68ece8d2dd8a96e6a4e1fe`, MIT. [sqlite-vec 0.1.9 MIT](https://raw.githubusercontent.com/asg017/sqlite-vec/v0.1.9/LICENSE-MIT) risolve il metadato non SPDX `MIT OR Apache` scegliendo MIT.

Decisione upstream: **adozione diretta** del testo GNU, pin sopra e SHA-256, identificatore SPDX ufficiale; nessuna licenza riscritta, nessun nuovo pacchetto. Lo script di audit legge JSON nativo e conta le espressioni esatte: non implementa un parser SPDX o un motore giuridico. Le alternative ambigue vengono valutate esplicitamente nel rapporto.

## Emendamenti dovuti all'ispezione

1. `package.json` radice è assente su disco e in Git: crearlo con il solo campo `license`, senza inventare script, workspace o dipendenze.
2. Il requisito generale «ogni altro manifesto» è limitato dall'elenco finale dei file autorizzati. Worker, validator, benchmark, frontend, mobile e manifesti PHP/Python ricevono inventario e diff non applicati, senza sconfinare.
3. `NOTICE` contiene attribuzioni APK e font oltre al cappello Apache. Spostare le informazioni terze in **aggiunta** a `THIRD_PARTY_NOTICES.md`, preservando nomi, licenze e riferimenti. `talos.onnx`, dichiarato opera di questo progetto, segue AGPL-3.0-only; i componenti altrui conservano le proprie licenze.
4. `harness-ui/README.md` non cita licenze: nessun cambiamento necessario. Il README desktop già documenta package/tag; aggiungere soltanto una riga esplicita sull'assenza di VERSION separato.
5. `.gitattributes` contiene marcatori di conflitto già nella base: solo segnalazione, file escluso dall'incarico. I byte del LICENSE saranno verificati sul disco e fissati nel test.

## File esatti

Modificare: `LICENSE`, `NOTICE`, `README.md`, `harness-ui/package.json` (solo license), `context-engine/package.json` (solo license), `harness-ui/THIRD_PARTY_NOTICES.md`, `THIRD_PARTY_NOTICES.md` (solo aggiunte), `harness-ui/desktop/README.md` (una riga).

Creare: `package.json` (solo license), `harness-ui/desktop/CHANGELOG.md`, `harness-ui/desktop/tests/licenza.test.mjs`.

Evidenze in `.claude/`: `LEDGER-R05A-LICENZA-AGPL-2026-09-13.md` (questo file), `RAPPORTO-R05A-LICENZA-AGPL-2026-09-13.md`, `R05A-agpl-3.0-ufficiale.txt` (download già eseguito), `R05A-audit-licenze.mjs`, `R05A-audit-licenze.json`, `R05A-verifica.mjs`, `R05A-base-file.json`, `R05A-red.log`, `R05A-test-puri.log`, `R05A-verifica.json`, `R05A-handoff.diff`.

Nessun file eliminato. `harness-ui/desktop/package.json` e tutti i lock restano intatti. Le copie di staging/installazione non vengono rigenerate: la prossima build dovrà copiare la nuova fonte e produrre nuovi hash.

## Simboli e contratti

Nessuna classe, API, funzione pubblica, interfaccia, schema o migrazione creata/modificata. Stabili `version=0.1.0`, script npm, dipendenze e contratto tag `desktop-vX.Y.Z`. Test interni: `leggi` per percorsi risolti da import.meta.url, quattro scenari nominati sotto. Script locali di evidenza senza export/API applicativa.

## RED, GREEN, regressioni e prova

- **R05A-TESTO-UFFICIALE**: prime due righe normalizzate sono titolo e data ufficiali; SHA-256 esatto del documento integrale. RED atteso: Apache presente.
- **R05A-MANIFESTI**: quattro percorsi espliciti radice, harness-ui, context-engine e desktop, tutti AGPL-3.0-only. RED atteso: radice assente e campi mancanti; desktop già verde.
- **R05A-README**: nessun Apache fuori da eventuali sezioni terze parti, badge che rimanda a LICENSE, dichiarazione AGPL-3.0-only e «Telemetria: nessuna». RED atteso: badge/sezione Apache.
- **R05A-CHANGELOG**: sezione `## desktop-v0.1.0 — non rilasciata`. RED atteso: file assente.
- RED focalizzato: `rtk proxy node --test harness-ui/desktop/tests/licenza.test.mjs` (registrare output e codice).
- GREEN/regressione completa del solo desktop puro: `rtk proxy npm --prefix harness-ui/desktop run test:puri`. Non tocca reti/provider né avvia il prodotto. Nessuna E2E applicativa per soli metadati/documentazione.
- Verifica npm offline: `npm pkg get license` con prefix esplicito per i quattro manifesti; controllo che solo license differisca nei manifesti esistenti, nessun lock o file escluso modificato, aggiunte soltanto agli avvisi radice.
- Gate upstream reale: confronto binario LICENSE/download GNU e SHA-256 fissato; non sostituito da fixture inventata. Licensee remoto non eseguito: richiederebbe pubblicazione fuori lotto.
- Audit: tutte le voci `packages` dei quattro lock, esclusa la radice e i link; includere dev e piattaforme opzionali; contare occorrenze per lock, non pacchetti unici. Registrare licenza mancante, alternative OR e obblighi AND; nessuna rimozione se incompatibile.
- Prova umana: README, NOTICE e CHANGELOG leggibili più tabella, fonti, limiti e diff nel rapporto. Le misure del changelog sono storiche R-06 con macchina/metodo, non rimisurate R-05A.
- Rollback: rimuovere soltanto le aggiunte di questo lotto o ripristinare singoli hunks confrontando base e rapporto, a cura dell'owner; mai reset/revert globale né cancellazione dei suoi file. Nessun rollback automatico.

## Chiusura e riscontri del 13/09/2026

Emendamento prima della correzione finale: la verifica dei collegamenti ha trovato due riferimenti nel nuovo CHANGELOG con un livello padre di troppo (`../../../.claude` invece di `../../.claude`). Scenario permanente **R05A-RIFERIMENTI-CHANGELOG** in `harness-ui/desktop/tests/licenza.test.mjs`: ogni rimando locale deve essere leggibile rispetto al documento. RED prima della correzione, nuovo log `.claude/R05A-red-riferimenti.log`; correggere soltanto i due link nel file già autorizzato e aggiornare il rapporto. Rieseguire la suite pura dopo questa modifica al test. Nessun nuovo file applicativo.

- RED effettivo: sette casi, sei fallimenti attesi, manifesto desktop già verde; exit 1.
- GREEN: `npm --prefix harness-ui/desktop run test:puri`, 40/40, zero fail/skip, 19.738,1185 ms, exit 0. Output finale conservato in `R05A-test-puri.log`.
- Quattro `npm pkg get license` offline: tutti `AGPL-3.0-only`. Verifica semantica dei manifesti: soltanto license cambia; root creato con quel solo campo. Trenta file campionati intatti, compresi lock e manifesti esclusi.
- Audit: 448 occorrenze (106 backend, 38 frontend, 297 desktop, 7 contesto). Zero SSPL/BUSL/NC/Elastic; png-js 1.1.0 risolto MIT, sqlite-vec 0.1.9 via alternativa MIT. MPL condizionata; nessuna conclusione di compatibilità globale per Docker Desktop, font OFL o eventuale combinazione GPLv2-only.
- Verificato il LICENSE di llama.cpp b10517 tramite download Node del file upstream: 1.078 byte, hash `94f29bbed6a22c35b992c5c6ebf0e7c92f13b836b90f36f461c9cf2f0f1d010d`, identico all'asset locale. Il tag png-js v1.1.0 non espone LICENSE (404): il rimando è al testo corrente, mentre il pacchetto locale vincolato al lock resta l'evidenza per 1.1.0.
- README, NOTICE e changelog verificati leggendo i testi e i riferimenti; cifre R-06 dichiarate storiche. Tutte le attribuzioni APK originarie restano integralmente nell'appendice aggiunta agli avvisi radice.
- Handoff: mobile README e 16 manifesti, solo diff. `git apply --check --unidiff-zero .claude/R05A-handoff.diff` exit 0, nessuna applicazione. Riportati integralmente nel rapporto finale.
- `git diff --check` exit 0, HEAD immutato `ae7c26fa5138d6e803591ef477cab16c97d49ca7`, indice senza modifiche. Nessun file di un'altra lane modificato.
- Nessuna nuova regressione applicativa scoperta. Il conflitto testuale preesistente in `.gitattributes` è un riscontro fuori perimetro, da consegnare al proprietario, senza cambiare questo lotto.

Verifica conclusiva dopo la correzione dei riferimenti: RED **R05A-RIFERIMENTI-CHANGELOG** con 7 verdi/1 rosso, poi suite completa **41/41**, zero fail/skip, **18.147,4551 ms**, exit 0. Il log `R05A-test-puri.log` contiene ora l'output completo di questa esecuzione finale offline. Il test ha 62 righe e otto casi. Entrambi i riferimenti sono corretti; nessuna modifica applicativa successiva ai test. Anche le cartelle proposte per gli header sono state verificate presenti.
