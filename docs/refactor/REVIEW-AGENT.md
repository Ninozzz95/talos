# TALOS Desktop — istruzioni per l'agente revisore della PR #27

## 1. Mandato e autorità

Repository: `Ninozzz95/talos`. PR: `27`. Ramo: `refactor/desktop-ledger-2026-09-17`. Baseline del lavoro: `13f65c15cdeaf8986b882993a0773cdeafb867d2`.

L'utente ha approvato le raccomandazioni D01–D56 e il successivo ledger operativo, autorizzando l'implementazione sull'harness reale. **D21 prevale: la modale di primo avvio deve sparire**, senza wizard sostitutivo, configurazioni fittizie o concessione automatica di permessi. L'ultima consegna richiesta comprende sorgenti ZIP completi, avvio one-click e dossier per revisione e merge. Il vecchio stato "sola lettura" del primo registro decisionale è storico e superato dai successivi ordini di procedere; non equivale però ad autorizzazione indiscriminata a pubblicare release o spendere su provider.

La PR resta in bozza. **Questo documento non è un'approvazione al merge e non dichiara conclusi i 57 lotti.** Verificare codice ed evidenze in modo indipendente. Non usare numero di test, file modificati o integrità dello ZIP come prova del completamento progettuale.

## 2. Materiali del dossier

La consegna separata di revisione conserva: brief originali UI/UX e audit; registro approvato D01–D56; ledger primario da 57 lotti e relative 82 schede; inventari e mappa di 6.883 blocchi; precedente ledger da 23 lotti, mantenuto solo come storico; audit Desktop e fonti; patch completa dalla baseline; inventario del codice consegnato; matrice cumulativa di esecuzione; prove e limitazioni dell'ambiente; procedura di rollback e checklist di merge.

Usare il **ledger da 57 lotti** come piano principale. Non sommare i conteggi delle due versioni: il ledger precedente include anche righe di tooling, test e vendor, quello successivo distingue sorgenti primari e resto dell'inventario. Non modificare retroattivamente i documenti approvati per farli coincidere con le sole parti già implementate.

Nel sorgente ZIP, `SOURCE_COMMIT.txt`, `SOURCE-MANIFEST.json`, `DELIVERY-ASSETS.json` e `EXTERNAL-GITLINKS.json` identificano la fotografia. Il manifesto distingue blob tracciati e frontend generato: `public/app.js` deve essere la build dei sorgenti consegnati, non il vecchio file distribuito presente nella baseline.

## 3. Avvio e riproducibilità

Estrarre tutto l'archivio, aprire `TALOS/AVVIA-TALOS.cmd` su Windows x64. Il primo avvio scarica Node portabile e dipendenze dai lock, verifica asset e runtime, compila e apre la vera shell Electron in modalità Preview. Nessuna installazione globale o bypass delle policy Windows.

Modalità disponibili: `--verify`, `--prepare-only`, `--cpu`, `--data-dir` con percorso assoluto. Il primo avvio necessita Internet. Non sono inclusi modelli o credenziali. La preview usa dati e portachiavi separati da TALOS stabile; due copie della stessa preview condividono il namespace `desktop-preview`. Non usare profili personali per test distruttivi.

Verificare nel workflow `desktop-source-delivery` la sequenza completa: verifica ZIP e manifesti; prima preparazione con runtime privato; seconda preparazione con riuso delle quattro installazioni; avvio della shell dai file estratti in un percorso con spazi; home senza wizard; richieste autenticate; comandi e preferenze; PTY reale ed evento di uscita; chiusura del backend. Il test strumentato avvia lo stesso Electron e gli stessi sorgenti preparati dal lanciatore; non è una prova manuale di doppio clic sul dispositivo dell'utente.

## 4. Revisione del diff

In un checkout separato, senza modificare il lavoro dell'utente:

```sh
git fetch origin main refactor/desktop-ledger-2026-09-17
git rev-parse origin/main
git rev-parse origin/refactor/desktop-ledger-2026-09-17
git diff --check 13f65c15cdeaf8986b882993a0773cdeafb867d2 origin/refactor/desktop-ledger-2026-09-17
git diff --stat 13f65c15cdeaf8986b882993a0773cdeafb867d2 origin/refactor/desktop-ledger-2026-09-17
git log --reverse --oneline 13f65c15cdeaf8986b882993a0773cdeafb867d2..origin/refactor/desktop-ledger-2026-09-17
```

Confrontare l'head con `SOURCE_COMMIT.txt`. Se diverso, il dossier è una fotografia precedente: esaminare separatamente il delta, non attribuire prove vecchie a righe nuove. Prima di qualsiasi scrittura rilevare branch, worktree sporco e modifiche concorrenti; niente reset, force push o checkout distruttivi.

Ogni hunk deve essere collegato al ledger. I riferimenti basati su intersezioni di righe servono a navigare, non sostituiscono la revisione semantica. Se un hunk grande attraversa più lotti, leggere le singole responsabilità. I nuovi file devono essere raggiunti dall'entry o da un test/strumento esplicitamente identificato.

Le cartelle storiche `docs/refactor/*-slice` contengono dati di trasporto con precondizioni di hash. I loro contenuti sono già stati applicati nei successivi commit ordinari: **non rieseguirli su una revisione più recente**. Nessuna installazione o build normale deve applicare patch storiche di nascosto.

## 5. Controlli prioritari sul prodotto

### BOOT / D21

Verificare assenza di entrambi i wizard nel markup e nel bootstrap, impossibilità di riapertura dalle impostazioni e impossibilità di rigenerazione dal vecchio mockup. Provare profilo nuovo, vecchi flag intro, assenza di modello, destinazione esplicita non valida, workspace non accessibile, navigazione utente precedente a una risposta tardiva. La configurazione deve restare accessibile nei pannelli normali. Nessuna esecuzione automatica al ripristino.

### Navigazione e continuità

Verificare home con dati reali, nomi e ID delle sessioni, 30 comandi registrati, indisponibilità spiegata senza nascondere comandi, IT/EN, tastiera e composizione IME, esclusione del terminale dalle scorciatoie globali. Verificare preset, densità, persistenza, errori di storage, dati futuri e backup di preferenze danneggiate. Non descrivere come completo il layout gerarchico per ogni risorsa finché non è provato.

### Overlay e API

Verificare Tab/Maiusc+Tab, Escape sullo strato superiore, ritorno al controllo iniziale e ripristino di inert con modali sovrapposte. Un annullamento di fetch non deve generare una falsa disconnessione; errori HTTP, parsing, serializzazione e rete mantengono categorie distinte. Risposte obsolete non devono cambiare la vista o il profilo selezionato.

### Isolamento reale

Leggere `desktop/profile.mjs`, `main.mjs`, `runtime.mjs`, la configurazione di packaging e il routing del portachiavi. Verificare identità incorporata del pacchetto e identità esplicita dell'avvio sorgenti, dati/browser/lock separati, nessuna importazione di chiavi stable o ambientali, nessuna pulizia del profilo stabile. I test OS devono usare account sintetici univoci e cancellare soltanto quei sentinel. Non registrare token o chiavi nei log.

### Browser e contenuto non fidato

**La preview dell'app isolata non equivale alla preview web isolata.** `ISOL-01` riguarda il profilo dell'eseguibile. `EXT-02` riguarda HTML non fidato, origini e broker di annotazione. Non chiudere F01 o EXT-02 in base alla riuscita dei test del portachiavi. Riesaminare `src/browser-proxy.mjs`, `sendHtmlProxato` e l'iframe in `components/browser.js`: l'accoppiata same-origin più script è un confine da risolvere e verificare negativamente. I limiti di byte e i redirect sono controlli distinti, non sostituti della separazione delle origini.

## 6. Test e gate richiesti

Usare Node 24.18.0 e i lock, non aggiornare versioni casualmente per far passare le suite. Installare **prima** Chromium e Chrome: la suite chiamata `test:unit` contiene anche test DOM/browser.

```sh
npm ci --prefix harness-ui
npm ci --prefix harness-ui/frontend
npm ci --prefix harness-ui/desktop
npm ci --prefix context-engine
node harness-ui/frontend/node_modules/playwright/cli.js install chromium chrome
node --test tools/delivery/start.test.mjs
npm --prefix harness-ui/frontend run build
node harness-ui/node_modules/typescript/bin/tsc -p harness-ui/frontend/tsconfig.refactor.json
node --test harness-ui/frontend/tests/refactor/*.test.mjs
npm --prefix harness-ui/frontend run test:unit
node harness-ui/frontend/tests/qualification/workspace-real.mjs
node --test harness-ui/tests/*.test.mjs
npm --prefix harness-ui run test:kernel
npm --prefix harness-ui run kernel:controlla
npm --prefix harness-ui/desktop run test:puri
npm --prefix harness-ui/desktop run test:guscio
```

Su shell con gestione dei glob diversa, usare i runner del repository o un'espansione dei percorsi verificata. Registrare platform, versioni, commit, exit code, casi falliti, skip e durata. Nessuna esclusione di test problematici senza decisione e motivazione esplicite. Un test che richiede la vecchia introduzione va sostituito con un test del contratto D21; non vanno eliminati i controlli sugli altri contratti.

Controllare anche i workflow ordinari `gates`, `desktop-streaming-red` e `desktop-prompt-enhance`, oltre ai workflow del ledger. Un workflow dedicato verde non rende automaticamente verde l'intero commit. Un'esecuzione precedente sullo stesso codice applicativo può essere evidenza contestuale, ma non è un test del nuovo head.

La CSP e i criteri gestiti del browser non vanno disattivati per far passare il collaudo. Un ambiente che rifiuta la navigazione locale è un limite di quella prova, non un errore UX dimostrato e non una riuscita. Usare gli ambienti autorizzati disponibili e riportare il limite.

## 7. Criteri del ledger ancora da chiudere

La matrice cumulativa allegata è obbligatoria. Devono restare aperti finché non esistono implementazione e prove puntuali: cutover completo della regia legacy; transcript/composer e tutte le modalità di invio; revisione/hunk e strumenti; cataloghi e download; dettaglio delle risorse; tutte le superfici/varianti/stati; performance misurata; prove assistive NVDA/Narrator; secondo audit indipendente completo; inferenza reale sui provider/modelli autorizzati.

Non convertire "non fornito" in "superato": hardware personale, provider reali e budget non sono stati specificati. Non avviare spese di inferenza. Le fixture deterministiche sono lecite se dichiarate, ma non sono collaudo con un modello reale.

Per ogni lotto riportare separatamente: implementato, verifica automatica, verifica runtime, verifica visuale, verifica manuale, criterio non applicabile motivato, blocco. Conservare l'accettazione originale. La chiusura di un sotto-obiettivo non chiude l'intero lotto.

## 8. Verdetto e merge condizionato

Il revisore deve produrre: finding con file/righe/evidenza/severità; copertura realmente esaminata; test eseguiti sullo SHA; limiti; correzioni necessarie; verdetto `NO-GO`, `GO per ambito esplicito` o `GO globale`. **L'assenza di prova non è `GO`.** Se il mandato resta il completamento dei 57 lotti, finché esistono criteri aperti il verdetto globale è NO-GO. Un merge parziale richiede un ambito esplicitamente accettato, non una riduzione autonoma della consegna.

Soltanto dopo correzioni, check richiesti verdi, riconciliazione dell'head e approvazione appropriata: ricontrollare le regole del repository, l'assenza di conflitti e l'esatto head approvato. Non usare merge amministrativo o bypass delle protezioni. Esempio di comando condizionato, non da eseguire automaticamente:

```sh
gh pr checks 27 --repo Ninozzz95/talos
gh pr view 27 --repo Ninozzz95/talos --json headRefOid,baseRefName,mergeStateStatus,reviewDecision,isDraft
# Dopo approvazione del preciso SHA e dei prerequisiti:
# gh pr merge 27 --repo Ninozzz95/talos --merge --match-head-commit <SHA_APPROVATO>
```

Non rimuovere la bozza per aggirare il mancato completamento. Non cancellare rami, pubblicare tag o creare una release senza autorizzazione separata. Dopo il merge, build e prove devono essere legate al commit risultante su main; gli artefatti della PR restano una fotografia precedente.

## 9. Rollback

Revert del lotto o merge pertinente, non reset della cronologia condivisa. Per frontend generato ricostruire dalla versione sorgente da ripristinare e verificare app.js/index/asset. Prima di una migrazione, provare andata e ritorno su copia dei dati. Non trattare il revert del codice come annullamento di comandi shell, file esterni o modifiche di un provider.

Le credenziali restano nel portachiavi; una pulizia della cache `.talos-runtime` non deve toccarle. I profili stable e preview non vanno fusi. Conservare piani originali, manifesti, evidenze e il verdetto di revisione anche dopo il merge.
