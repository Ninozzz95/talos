# Registro di esecuzione R-04 — 12/09/2026

Sottosistema posseduto: TALOS UI, confezionamento desktop e solo job `desktop`
di `.github/workflows/release.yml`. Base verificata: `5c3cb15cd056b6adf374cf059a1c043b361477b7`.
Nessuna modifica utente tracciata; conservare `.claude/R04-BASE.txt` e
`harness-ui/.claude/`. Nessun commit, push, porta 4174 o servizio a pagamento.

## Ispezione e dossier prima delle modifiche

Letti README, rapporto R-02, package/lock desktop, staging/distribuzione,
installer.spec.mjs, support.mjs, guscio.spec.mjs, main.mjs e workflow.
EXE/ZIP e staging assenti nel worktree; node_modules sono junction verso il
banco dell'owner: NON eseguire npm ci su queste junction. Le installazioni
di staging sono separate e autorizzate dal comando dist del brief R-04.
Il rapporto R-02 non attesta una build completa: segnala dati backend fuori
userData, crash GPU e cache NSIS assente. Non correggere file fuori perimetro.

Fonti primarie consultate il 12/09/2026:

- https://github.com/actions/runner-images/blob/main/README.md e
  https://github.com/actions/runner-images/blob/main/images/windows/Windows2025-VS2026-Readme.md:
  windows-latest = Server 2025 x64, VS 2026, PowerShell 7.6.5 nell'immagine
  documentata; Python, SDK Windows e librerie C++ Spectre presenti. L'etichetta
  è mobile: registrare ImageOS/ImageVersion, PowerShell e Node nel summary.
- https://github.com/actions/setup-node/blob/main/docs/advanced-usage.md:
  Node 24 e cache npm con elenco di lock, senza cache node_modules.
- https://github.com/actions/attest e action.yml al pin
  `1e69f48acb82d1966a394da916b4c1698aa569d6` (v4): subject-path multilinea,
  permessi id-token/attestations/artifact-metadata write. Contents write per release.
- https://github.com/actions/cache/releases/tag/v6.0.0:
  `2c8a9bd7457de244a408f35966fab2fb45fda9c8`; espandere LOCALAPPDATA in un passo
  PowerShell, cache Electron e builder separata e chiave con lock.
- https://github.com/actions/upload-artifact/releases/tag/v7.0.0:
  `bbbca2ddaa5d8feaa63e36b76fdaad77386f024f`; lista esplicita, compressione 0,
  errore se file mancanti, conservazione 14 giorni.
- https://cli.github.com/manual/gh_release_create: più asset, --verify-tag,
  --notes-file e --repo dinamico; nessun nome repository privato.
- https://nsis.sourceforge.io/Docs/Chapter3.html e template upstream
  https://github.com/electron-userland/electron-builder/blob/master/packages/app-builder-lib/templates/nsis/installSection.nsh:
  /S sensibile al caso, /D ultimo e senza virgolette; /S non avvia l'app
  salvo force-run. Pin effettivo: electron-builder 26.16.1, tool NSIS 1.2.1/3.12
  e 7zip 1.0.0 con digest già in R-02. Percorso R-02: Programs/talos-desktop,
  diverso da Programs/TALOS ipotizzato nel brief. Preservare installazioni esistenti.
- https://github.com/microsoft/node-pty: Python/C++/SDK/Spectre per fallback;
  package 1.1.0 locale usa `prebuild.js || node-gyp rebuild`, prebuild win32-x64.
- https://playwright.dev/docs/api/class-electron: integrazione sperimentale
  _electron.launch, firstWindow e close; adottata direttamente a 1.62.1 già nel lock
  frontend con Electron 44.3.0. Non richiede download Chromium per _electron.
- https://github.com/nodeca/js-yaml: parser YAML 1.2, adottare js-yaml 4.3.2
  già nel lock desktop come dipendenza builder, nessun parser scritto in casa.
- https://github.com/rhysd/actionlint/releases/tag/v1.7.12 e
  https://github.com/judeallred/github-actionlint: binario ufficiale actionlint
  1.7.12 via npx github-actionlint@1.7.12 (wrapper npm MIT, uso solo di verifica).
- https://docs.github.com/en/actions/reference/limits: job hosted massimo 6 ore;
  R-04 limita a 45 minuti e smoke a 8. https://docs.github.com/en/billing/concepts/product-billing/github-actions
  e https://docs.github.com/en/billing/reference/actions-runner-pricing:
  Windows baseline $0.010/min contro Linux $0.006/min nella pagina attuale;
  il vecchio URL dei moltiplicatori redirige alle tariffe. Non confondere il ×2
  della quota minuti citato dal brief con un moltiplicatore del prezzo attuale.
  Nessun job remoto eseguito da questa sessione.

Decisione upstream: adottare direttamente tutte le action e i tool sopra,
con adapter AVM solo per smoke, metadati e note. Rifiutati zip sorgenti (richiede
Node all'utente), Authenticode/Azure (decisione owner), wrapper attest-build-provenance
(v4 delega ad attest). Checkout/setup-node mantengono i pin già presenti.

## File e simboli previsti

1. Modificare `.github/workflows/release.yml`: esclusivamente job desktop e
   commento immediatamente precedente relativo al vecchio desktop. Contratti
   stabili: trigger desktop-v*, job apk e permessi globali identici.
2. Creare `harness-ui/desktop/scripts/ci-smoke.ps1`: parametri Installer,
   InstallDir, ReportPath; funzioni Attendi-Condizione, Processi-Installati,
   Esegui-Installer. Preflight, installazione /S, helper, finally/disinstallazione,
   cleanup circoscritto, JSON `talos.desktop.ci-smoke.v1` e misure.
3. Creare `harness-ui/desktop/scripts/ci-smoke-installed.mjs`: funzione esportata
   `provaInstallato`, avvio _electron del pacchetto reale, cookie/401/200/reload,
   close e report senza credenziali. Nessun nuovo endpoint o API del prodotto.
4. Creare `harness-ui/desktop/scripts/release-assets.mjs`: esportazioni
   `nomiArtefatti`, `preparaRelease`, SHA256SUMS, note italiane, output Actions
   e summary; nomi coerenti con package R-02 e rifiuto tag/versione incoerenti.
5. Creare `harness-ui/desktop/tests/workflow.test.mjs`: YAML reale js-yaml,
   piattaforma, shell, pin, permessi, ordine cancelli/smoke/provenienza/release,
   liste asset, cache, no segreti/repo fisso, contratti NSIS.
6. Creare `harness-ui/desktop/tests/release-assets.test.mjs`: nomi/versione,
   SHA reali, note e fallimenti per asset assente/tag incoerente/smoke fallito.
7. Modificare `harness-ui/desktop/README.md`: Come nasce una release, verifica,
   smoke locale e limiti ereditati distinti dalla nuova automazione.
8. Creare `.claude/RAPPORTO-R04-CI-WINDOWS-2026-09-13.md`: ricerca, evidenze,
   file/righe, handoff, proposta commit e chiusura richiesta.
9. Creare/aggiornare `.claude/LEDGER-R04.md` (questo registro).

Nessuna classe, interfaccia, migrazione o altro simbolo pubblico. package.json
non richiede modifiche: test:puri include già i nuovi *.test.mjs. ci.yml intatto.
File generati di prova solo in .claude/ o desktop/.prove, .cache-r02, .staging,
dist; eventuali icone rigenerate dal comando R-02 da verificare con git diff.

## RED, GREEN, regressione e accettazione

RED prima del workflow: R04-WINDOWS, R04-ATTEST, R04-ASSET e R04-PORTABILITA
devono fallire sul vecchio job Ubuntu/zip; release-assets.test fallisce per
modulo mancante. Eseguire `node --test tests/workflow.test.mjs` e test assets.
GREEN: stessi test, `npm.cmd run test:puri`, parsing PowerShell, npx pin actionlint.
Regressioni: test server completi, test:kernel, kernel:controlla, unit frontend,
test:guscio seriale; analizzare preventivamente uso di porte e servizi esterni.
Non usare junction node_modules per scritture o npm ci. Un solo runner build/test.
Gate reale: npm run dist con download gratuiti upstream autorizzati da R-04,
ci-smoke.ps1 sull'EXE; nessun mock sostituisce installazione/health/disinstallazione.
Prova visibile: report JSON, pesi/durate, cookie senza valore, nessun processo
residuo, note con hash reali e summary. GitHub OIDC/cache/upload/release sono gate
eseguibili solo dall'owner al push del tag corrispondente al package.
Rollback: rimuovere solo i nuovi file R-04 e riapplicare il job desktop della
base dopo revisione dell'owner; nessun reset automatico o modifica a dati utente.

## Rettifiche dopo le prove complete

- R04-TAG-COMMIT: due test server esistenti (agent-service:512 e
  workspace-context:18) esigono un nome di ramo anche sulla checkout di release,
  normalmente detached. Non modificarli né provare un commit diverso: creare
  nel solo runner un ramo locale `ci-desktop-release` sul medesimo HEAD e
  verificare prima/dopo lo SHA del commit del tag. Fonti 12/09:
  https://github.com/actions/checkout/blob/3d3c42e5aac5ba805825da76410c181273ba90b1/README.md
  e https://git-scm.com/docs/git-switch. Test permanente workflow.test.mjs:
  repository temporaneo ottenuto con fetch locale del commit esistente (nessun
  add/commit/push), checkout detached, tag di fixture e passo PowerShell reale.
  Il worktree dell'owner resta detached e invariato.
- R04-LOCK-CHIAVE-VUOTA: eseguire realmente il passo ambiente estratto dal YAML
  con file GITHUB_OUTPUT/ENV/SUMMARY temporanei. package-lock v3 contiene la
  chiave vuota packages['']: PowerShell deve usare ConvertFrom-Json -AsHashtable.
  Test permanente in workflow.test.mjs prima della correzione del workflow;
  verificare anche il rifiuto di un tag non corrispondente.
- R04-UNIT-BROWSER: test:unit include `provider-pkl-bis-dom.test.mjs`, che usa
  chromium.launch senza channel. Aggiungere download Chromium dal CLI Playwright
  1.62.1 locale al job desktop prima dei cancelli. Chrome per gli altri test è
  già nell'immagine ufficiale. Fonte: https://playwright.dev/docs/ci (12/09).
  _electron non richiede Chromium. Test permanente R04-WINDOWS esige il passo.
- Primo giro completo locale non valido come confronto finale del backend:
  il filtro credenziali della shell di prova ha rimosso GIT_CONFIG_KEY_0
  mantenendo GIT_CONFIG_COUNT. Ripetere con GIT_CONFIG_* preservato. Inoltre
  mancano i node_modules di context-engine: installare solo le dipendenze
  generate e ignorate da git con il lock esistente, senza cambiare sorgenti.
  Il job ha già questo npm ci. Le junction node_modules restano intatte.
- Output generati: `.claude/R04-server.log`, `.claude/R04-kernel.log`,
  `.claude/R04-kernel-controlla.log`, `.claude/R04-frontend.log`,
  `.claude/R04-guscio.log`, `.claude/R04-cancelli.json`,
  `.claude/R04-smoke-fallito.json`, `.claude/R04-pulizia.json`.
  Spostare la cache actionlint in desktop/.cache-r02 per non consegnare binari
  non tracciati sotto .claude. Destinazioni entrambe dentro questo worktree.
- Correzione documentale necessaria: la base già contiene percorsoDatiDesktop
  in server.mjs e il test R01-BACKEND passa, inclusa l'assenza di store accanto al
  server. Il vecchio rapporto R-02 non descrive questa cura successiva. Aggiornare
  solo README e rapporto R-04, senza riproporre il vecchio diff backend.

## Scenari permanenti

- R04-VERSIONE: tag diverso dalla versione package/lock non pubblica asset falsamente nominati.
- R04-ASSET-MANCANTE: un solo artefatto non basta alla provenienza/release.
- R04-SMOKE-FALLITO: niente pubblicazione senza installazione/health/cleanup riusciti.
- R04-PREFLIGHT: installazione o collegamenti preesistenti non si sovrascrivono.
- R04-PROCESSI: chiusura/disinstallazione fallite restano errore, anche dopo cleanup forzato.
- R04-PORTABILITA: token effimero github.token, nessun secrets.* o repository fisso nel desktop.

## Avanzamento e rettifiche

- RED eseguito: 5 fallimenti attesi (4 contratti workflow e modulo asset assente).
  Dopo implementazione, i 4 test YAML passano. R04-SHA ha rilevato solo una
  discordanza grammaticale nelle note (singolare/plurale), corretta.
- Ispezione `prova-pty.mjs`: scrive in `harness-ui/.claude/R01-pty.json` senza
  creare la directory. Il checkout CI pulito non la garantisce: tolto il richiamo
  aggiuntivo, mantenuta la vera prova PTY nel cancello esistente test:guscio.
  Nessuna modifica allo script R-01, nessun output fuori dai file autorizzati.
- Aggiungere `harness-ui/desktop/tests/ci-smoke.test.mjs` prima del prossimo
  cambiamento dello smoke: R04-PREFLIGHT (percorso relativo/installazione
  esistente) e parsing PowerShell. Nessun nuovo simbolo pubblico.
- Build R-02 avviata una sola volta, cache locali al worktree; staging reale:
  8.263 file e 343.727.282 byte. Restano misure finali EXE/ZIP e smoke.
- R04-REGISTRO-VUOTO: test:puri, 29/30. L'utente Windows della sandbox non
  possiede ancora HKCU/.../Uninstall. Il preflight deve trattare l'assenza come
  zero installazioni, mantenendo gli errori di accesso come errori. Aggiungere
  funzione interna `Registrazioni-Talos` a ci-smoke.ps1 e usarla anche nel cleanup;
  test permanente R04-PREFLIGHT riproduce il caso prima della correzione.
- R04-PROCESSI-SENZA-WMI: lo smoke si ferma prima dell'installazione perché
  CIM/WMI restituisce Accesso negato nella sandbox. `Get-Process` legge invece
  i processi propri e il loro Path. Fonti del 12/09:
  https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.management/get-process
  e https://learn.microsoft.com/en-us/dotnet/api/system.diagnostics.process.getprocesses.
  Adattare l'API standard .NET già in PowerShell, nessun permesso aggiuntivo:
  Processi-Installati filtra Path assoluto; TALOS senza Path leggibile fa fallire
  il controllo. Aggiungere il test permanente al file ci-smoke.test.mjs.

## Stato finale delle prove e scenari ereditati — 12/09, 21:32 UTC

- GREEN R-04: 33/33 test puri, 18.109 ms; actionlint ufficiale 1.7.12 via
  `npx --yes github-actionlint@1.7.12 .github/workflows/release.yml`, codice 0.
  Parsing PowerShell reale, node --check e git diff --check riusciti.
  `.claude/R04-verifica-finale.json` registra base detached invariata, prime
  378 righe, apk e permessi identici. Nuova evidenza generata autorizzata qui.
- Build R-02 reale: 297 secondi; EXE 152.074.299 byte, ZIP 255.856.493 byte.
  Hash completi nel rapporto finale. Test R02-PACCHETTO/R02-DATI: 2/2, 11.194 ms;
  backend 200 con cookie, 401 anonimo, PTY reale, zero dati fuori userData.
- R04-SMOKE-FALLITO resta ROSSO sul vero installer: installazione /S in
  42.318 ms; prima finestra chiusa; disinstallatore /S termina 0 ma TALOS.exe
  resta dopo 60 secondi. Durata 110.888 ms. Nessun SHA256SUMS o nota finale
  generati per questi asset: il generatore rifiuta completato:false.
  Pulizia manuale della sola cartella creata dalla prova, dopo verifica del
  percorso e dei processi: zero residui; non vale come disinstallazione riuscita.
- R04-RICEVUTE-IMPORT-ESTERNO: test permanente esistente
  harness-ui/tests/harness-receipt-keypair.test.mjs:131 importa un repository
  fratello assente anche in una checkout CI pulita. Handoff obbligatorio al
  proprietario backend: usare il kernel vendorizzato del repository.
- R04-STOP-ALBERO: kernel-loop-locale-e-stop.test.mjs:300 registra 45.217 ms
  per uno stop richiesto dopo 1 secondo; test permanente esistente, handoff
  backend/Windows. Causa non risolta da R-04.
- R04-HKCU-SANDBOX: windows-open-with-talos.test.mjs:72 e :97, accesso registro
  negato. Ripetere su runner reale; non concludere che sia la causa NSIS.
- R04-KERNEL-MARCATORE: talosHarness.test.mjs:435 attende una frase diversa da
  quella emessa. Test permanente esistente; diff proposto solo nel rapporto.
- R04-FRONTEND-BUILD: PHASE1-BUILD-PARALLEL-01, PHASE1-GRAPH-ISOLATION-01,
  PHASE1-ASSET-ALLOWLIST-01 falliscono per accesso esbuild a directory antenate.
- R04-FRONTEND-RISOLUTORE: PK-UI-02/03 e PH-UI-BROWSER falliscono con
  «Sorgente fuori dal frontend»; test permanenti esistenti, handoff frontend.
- R04-GPU: R01-GUSCIO/R01-ARRESO riproducono chiusura della finestra e crash
  GPU con codice -1073741515. Non aggiungere bypass GPU al solo test.
  Playwright prova ufficialmente Electron anche su windows-latest:
  https://github.com/microsoft/playwright/blob/main/.github/workflows/tests_secondary.yml
  (consultato 12/09/2026). L'esecuzione hosted di TALOS resta da provare.
- Le suite preesistenti restano in release senza skip aggiunti. Totali finali:
  server 2868 pass / 6 fail / 6 skip; kernel 556 / 1 / 1; frontend 1013 / 5 / 1;
  guscio 1 / 2 / 0. Due errori server da detached sono coperti dalla correzione
  del solo runner, verificata da R04-TAG-COMMIT; gli altri non sono mascherati.
- Dossier aggiuntivo: attestazioni disponibili per repo pubblici sui piani
  Free/Pro/Team; per privati/interni serve Enterprise Cloud secondo
  https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/use-artifact-attestations
  (12/09/2026). L'owner verifica l'idoneità prima del tag nel repo attuale.
- Il gate upstream completo installato/GUI/disinstallazione NON è superato.
  Nessuna pubblicazione, nessun commit, nessuna modifica fuori dal perimetro.
  Il rapporto R-04 contiene comandi, fonti, diff non applicati e istruzioni owner.
