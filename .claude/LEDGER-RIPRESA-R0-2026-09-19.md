# Ledger R0 — banco e prove ripetibili

Sottosistema: infrastruttura test desktop. Nessuna modifica al comportamento del prodotto. Difetto accertato: playwright.config.mjs isola solo le sessioni, eredita process.env, usa il portachiavi reale e sovrascrive artifacts/playwright.json. Non lanciare questa configurazione per la ripresa.

## File esatti del lotto

| File da creare | Simboli/ruolo |
|---|---|
| harness-ui/frontend/scripts/ripresa-run.mjs | creaAmbienteIsolato, creaEsecuzione, esegui; launcher con directory nuova e inventario/provenienza/log |
| harness-ui/frontend/playwright.ripresa.config.mjs | configurazione esportata; un worker, server posseduto, rapporti unici, bundle dist |
| harness-ui/frontend/tests/fixtures/ripresa-keyring-preload.mjs | registerHooks: sostituzione esclusivamente test del modulo nativo, prima del server |
| harness-ui/frontend/tests/fixtures/ripresa-keyring-memory.mjs | Entry: constructor, getPassword, setPassword, deletePassword; credenziali soltanto in memoria per processo |
| harness-ui/frontend/tests/unit/ripresa-isolamento.test.mjs | RIPRESA-R0-ISOLAMENTO, RIPRESA-R0-PORTACHIAVI, RIPRESA-R0-RAPPORTI: processi reali di test con credenziali sentinella |

Documenti creati separatamente: .claude/RIPRESA-OPERATIVA-2026-09-19.md, questo ledger, .claude/ROADMAP-GLOBALE-RIPRESA-2026-09-19.md. Gli artefatti del run sono output sotto frontend/artifacts/ripresa/<ID>/, non sorgenti prodotto; lo stato scrivibile è in directory temporanee nuove e non viene eliminato automaticamente.

## RED e GREEN

- RED: launcher assente; dopo implementazione i test devono provare che segreti, NODE_OPTIONS e percorsi owner non arrivano al figlio, che due run non condividono stato/rapporti e che l'adattatore reale TALOS legge/scrive esclusivamente il keyring in memoria. Non chiamare mai il modulo nativo durante questi test.
- GREEN: `rtk proxy node --test tests/unit/ripresa-isolamento.test.mjs` dalla frontend; poi launcher build/unit/browser con rapporti distinti e `rtk git diff --check`.
- Il mock del portachiavi limita la prova: non certifica Credential Manager né persistenza tra riavvii; questi restano gate Electron successivi. API e store del server restano reali.
- Revisione avversariale dello stesso autore: verificare eredità ambiente, moduli importati prima del preload, collisioni porte/report, destinazioni scrittura, eventuali suite che avviano server propri; non è review indipendente.
- Rollback: rimuovere esclusivamente i cinque nuovi sorgenti dopo verifica che siano quelli creati da questo lotto; non ripulire archivi owner né artefatti storici. Nessun cambiamento a public o 4174.

## Ricerca primaria — consultata 19 settembre 2026

- [Playwright webServer](https://playwright.dev/docs/test-webserver): l'ambiente viene ereditato; sanitizzare nel launcher, non affidarsi all'oggetto env parziale.
- [Playwright reporter](https://playwright.dev/docs/test-reporters): output JSON distinto per esecuzione.
- [Playwright network](https://playwright.dev/docs/network): routing prima della navigazione, serviceWorkers block; la suite mutante non punta mai 4174.
- [Node registerHooks](https://nodejs.org/download/release/v24.0.1/docs/api/module.html): hook sincroni registrati prima dell'import dinamico del package. Runtime locale verificato Node 24.18.0; nessuna dipendenza aggiunta.

Decisione: adottare runner Playwright 1.62.1 già pinned e hook nativo Node; adattare il solo confine keyring con fixture test in memoria. Rifiutato riuso desktop-preview: namespace persistente reale, non isolato per run. Rifiutata variabile di bypass keyring nel prodotto: non necessaria e indebolirebbe il confine. Build esbuild 0.28.2 già pinned. Non si sostituisce il runtime TALOS con una demo.

## Emendamento dopo ispezione delle suite

Le spec scrivono anche fotografie in percorsi fissi e _fase2-niente-perso produce un file accanto al master. Due spec (_confronto-exa e _confronto-fase1) hanno la 4174 e cartelle Downloads hardcoded. Prima del baseline: aggiungere creaSnapshot nello stesso launcher, copia fisica dei file correnti con metadati Git separati, dipendenze installate condivise tramite junction ma sorgenti/output separati. Nessun hardlink dei sorgenti. Due spec escluse esplicitamente dal baseline isolato e registrate come gate visivo owner da eseguire separatamente in sola lettura; lab-bootstrap resta sul proprio banco. Non chiamare questa esecuzione «suite totale senza esclusioni».

Ricerca aggiuntiva 19/09: [Git archive](https://git-scm.com/docs/git-archive) fotografa il commit, non le modifiche correnti; per questo la copia sovrappone i file effettivi del worktree e registra i loro hash. [Node fs](https://nodejs.org/download/release/latest-jod/docs/api/fs.html) distingue copia fisica e link. Nessun file sorgente ulteriore rispetto ai cinque sopra; cambiano launcher/config. I test che avviano propri server erediteranno ambiente ripulito e dati del run, ma condividono tali dati fra server: eventuale contaminazione interna al run va ancora classificata.

Regressione permanente RIPRESA-R0-SNAPSHOT: prima copia fallita EPERM sul gitlink mobile/third_party/llama.cpp. Il submodule è una directory, non un blob: registrare il pin nell'inventario e non copiarlo come file. Nessun build mobile previsto. Il test deve anche provare che una scrittura nella copia non altera l'hash del sorgente originale.

Emendamento dopo interruzione del run browser 3487714b: processo terminato senza browser-result.json né rapporto finale Playwright; log fermo al test 142, causa dell'interruzione ignota. I risultati parziali non costituiscono suite completa. Aggiungere un sesto sorgente esatto, `harness-ui/frontend/scripts/ripresa-reporter.mjs`, default class RipresaReporter con onBegin/onTestEnd/onEnd: registro JSONL sincrono incrementale, così i test conclusi sopravvivono anche senza onEnd. Nuovo test nello stesso ripresa-isolamento.test.mjs: RIPRESA-R0-INTERRUZIONE, processo figlio che esce senza onEnd conserva record leggibili. Fonte primaria: API reporter Playwright, https://playwright.dev/docs/api/class-reporter. Modificare launcher/config già nel ledger per registrarlo e copiarlo nello snapshot. La build precederà anche le unit: il primo run saltava legittimamente il gate inventario bundle per dist assente.

Ulteriore estensione nello stesso launcher: modalità backend per suite Node in snapshot, e browser-release per confronto riproducibile. Per browser-release il solo riferimento accettato è desktop-v0.1.13: checkout detached esclusivamente nel clone appena creato, sorgenti prodotto della release e prove/runner correnti sovrapposti. package.json/package-lock frontend sono stati confrontati fra release e HEAD: nessuna differenza. Il manifest deve dichiarare che è un confronto con prove correnti, non il pacchetto Electron originale. Questa modalità serve a classificare fallimenti, non a promuovere come già verificato un flusso nuovo assente nella release.

Emendamento R0-SANDBOX, 19/09: Playwright 1.62.1 `lib/coreBundle.js:51294–51297` implementa serviceWorkers:block con un initScript che legge navigator.serviceWorker senza catch. In un iframe sandbox con origine opaca tale getter lancia. FACCETTE-07/PAGINA-10/OSS-3 della baseline riportano proprio questo errore; l'attribuzione al banco va confermata in una pagina minima senza TALOS.

Emendamento R0-DISCOVERY: `harness-ui/package.json:verify:all` usa tests/*.test.mjs e omette 26 file research annidati. Il runner riproduceva la stessa omissione. Prima del backend completo: nello stesso ripresa-run.mjs esportare `elencaTestBackend(root=repo)` e provare da ripresa-isolamento.test.mjs `RIPRESA-R0-DISCOVERY` con fixture annidata. RED con enumerazione piatta, GREEN con readdirSync recursive (Node v24.18.0, fs già ricercato), inclusi labs/electron-shell. Nessuna modifica package di prodotto in questo lotto; omissione del gate ufficiale registrata in G0/EX-CODE-BUILD. Kernel rimane gate distinto, non contato fra backend. Rollback del solo helper test/runner.

Emendamento R0-BINARI: baseline backend 4de04fbe non trova Chromium perché il banco non passa PROGRAMFILES/PROGRAMFILES(X86), lette da browser-vivo.mjs:120. Aggiornare soltanto creaAmbienteIsolato nello stesso runner dopo RED del test RIPRESA-R0-ISOLAMENTO esteso: i percorsi installazione programmi restano disponibili, le directory di profilo e credenziali restano isolate. Non passare LOCALAPPDATA originale né CHROME_PATH/TALOS_CHROMIUM arbitrari. GREEN: test isolamento e browser-vivo.test.mjs sul filesystem reale, profilo browser comunque temporaneo. L'aggiunta non autorizza scritture in Program Files. Fonte Node child_process.env già consultata, implementazione del cercatore letta.

Emendamento R0-RELEASE: run ac446896 fallisce build per LICENSE-shell-quote assente: l'overlay indiscriminato scripts/ usava copy-vendored-assets corrente su sorgenti release. In creaSnapshot conservare gli script di build DELLA RELEASE; overlay solo test e file del runner nominati in additions. Test permanente RIPRESA-R0-RELEASE in ripresa-isolamento.test.mjs: confronto del file copy-vendored-assets nello snapshot con git show del tag, normalizzando soltanto CRLF. RED prima della correzione, GREEN e ripetizione browser-release. Fonte primaria Git checkout/clone già consultata. Nessuna modifica della release o degli asset per farla costruire.

Secondo riscontro release, run 10e65ce0: build verde, server rifiuta scope desktop-preview, introdotto dopo il tag. Per kind browser-release passare scope desktop, accettato dal sorgente del tag; resta obbligatorio il preload che sostituisce il keyring nativo con quello in memoria. Stessa funzione creaAmbienteIsolato, nessun codice prodotto cambiato. Il test RIPRESA-R0-PORTACHIAVI copre la sostituzione del backend delle credenziali; l'avvio reale della release è il GREEN di compatibilità configurazione.

File aggiuntivo esatto `harness-ui/frontend/tests/browser/ripresa-banco.spec.mjs`, test RIPRESA-R0-SANDBOX: iframe sandbox vuoto, nessun JS prodotto, zero pageerror richiesti. Modificare `creaSnapshot` in `scripts/ripresa-run.mjs` per includere il test. RED prima di toccare `playwright.ripresa.config.mjs`; poi togliere soltanto serviceWorkers:block e riprovare stessa prova e spec interessate. Nessun filtro sugli errori, nessuna modifica a Playwright o alle protezioni iframe prodotto. TALOS frontend non registra service worker (ricerca sul sorgente); browser context nuovo per prova. La policy di sola lettura della 4174 resta separata e invariata: questo banco non la naviga. Rollback: ripristinare l'opzione nella configurazione del banco, mai nel prodotto. Ricerca: [Playwright network](https://playwright.dev/docs/network), documentazione già consultata; implementazione pinned locale letta e collegata a [sorgente upstream BrowserContext](https://github.com/microsoft/playwright/blob/v1.62.1/packages/playwright-core/src/server/browserContext.ts).
