# TALOS Desktop — dossier unico di preparazione al rilascio

Aggiornato il **2026-09-20**. Questo documento è il punto di ingresso per la
preparazione della prossima versione desktop. Raccoglie le memorie operative
senza promuovere una spunta storica a prova corrente.

## Verdetto corrente

Il codice della candidata è al commit corrente di `HEAD` (verificare con
`git rev-parse HEAD`); il ref remoto complessivo precedente era
`6e684970bc0722853dc0be96836ce303fbf881d7`. Il commit prodotto precedente è
`904244abd5efb03962095d2fb32d2003dfb30f42`. Il worktree tracciato è pulito. I file non tracciati
di archivio, sessioni e prove preesistenti restano intatti e non fanno parte
della candidata.

La candidata ora dichiara `0.1.14` in `harness-ui/desktop/package.json` e nel
lock, ha la sezione changelog `desktop-v0.1.14`, e gli artefatti locali sono
stati costruiti e provati. La release di confronto resta
`desktop-v0.1.13` (`a898162feff3ed8ad4cb0586344fe9d9e390d1a5`). Il tag non è
ancora stato creato: prima va registrato il commit candidato e verificata la
coerenza del ref remoto.

**Verdetto operativo: candidata pronta per il push/tag, con debiti browser
documentati fuori dai cancelli del workflow.** La suite browser storica resta
rossa su 37 scenari e 14 non eseguiti; non viene spacciata per verde e non è
un gate eseguito da `.github/workflows/release.yml`.

## Memorie consultate e loro autorità

Queste sono le fonti lette per la riconciliazione, in ordine di precedenza:

1. `C:/Users/Antonino/Desktop/projects/AVM/AGENTS.md` e
   `C:/Users/Antonino/Desktop/projects/AVM/.agents/skills/talos-engineering/SKILL.md`:
   confini, ledger, ricerca primaria, prove e divieto di dichiarare verde ciò
   che non è stato eseguito.
2. `.claude/ROADMAP-GLOBALE-RIPRESA-2026-09-19.md`,
   `.claude/TICKET-RIPRESA-TALOS-2026-09-19-FINALE.md` e
   `.claude/CANDIDATA-DESKTOP-RIPRESA-2026-09-19.md`: stato operativo più
   recente e blocchi del candidato.
3. `.claude/TABELLA-FASI-COMPLETA-2026-09-13.md` e
   `.claude/MATRICE-RIPRESA-PARITA-2026-09-19.md`: requisiti canonici, 33 task
   dell'audit e criteri di parità.
4. I ledger correnti `.claude/LEDGER-RELEASE-GATE-2026-09-19.md`,
   `LEDGER-RIPRESA-R0-2026-09-19.md`, `LEDGER-RIPRESA-HF-FILTRI-PAGINE-2026-09-19.md`,
   `LEDGER-RIPRESA-AGENTI-GRAFO-2026-09-19.md`,
   `LEDGER-RIPRESA-AGENTI-RUNTIME-2026-09-19.md`,
   `LEDGER-RIPRESA-REPLAY-PERSISTENTE-2026-09-19.md`,
   `LEDGER-RIPRESA-CHAT-ASPETTO-2026-09-19.md`,
   `LEDGER-RIPRESA-DIAGNOSI-LOCALE-2026-09-19.md` e i ledger Model Lab,
   layout, Libera memoria, sidebar e ritorno trasparente.
5. `.claude/MEMORIA-SETTEMBRE-2026.md`, `.claude/MEMORIA-VERIFICA.md`,
   `.claude/MEMORIA-BANCO.md`, `.claude/MEMORIA-INGEGNERIA.md`,
   `.claude/MEMORIA-LEZIONI.md`, `.claude/TACCUINO.md`,
   `docs/agent-bus/SPEC.md`, `docs/agent-bus/LEDGER.md` e
   `docs/assistenza/memoria.md`: decisioni, debiti e limiti di memoria. Sono
   vincoli o contesto; non sostituiscono una prova eseguita oggi.
6. `.claude/archivio/2026-09-16/` e gli archivi sotto
   `.claude/ripresa-2026-09-19/`: evidenza storica, snapshot e sorgenti di
   confronto. Non sono istruzioni operative correnti e non autorizzano import
   di monoliti o riuso di conteggi.

Decisioni owner vincolanti: il mockup della sidebar destra/grafo è
`C:/Users/Antonino/Downloads/talos-sidebar-calm-review.html` (SHA256
`59b2b6d1ce90f7b29a74f6ba0f9646f3be980776767e6b0930c27882f8ce20f1`); il
mockup Model Lab/impostazioni è
`C:/Users/Antonino/Downloads/TALOS-Calm-Lab-04.html` (SHA256
`094207523b3b76b01cd9aac27792ff2cc2f97ddd69cbd9757898fa558284460e`). Chat e
composer non hanno mockup. La sidebar sinistra mostra solo i padri.

## Prove che valgono oggi

| Gate | Ricevuta | Esito | Limite |
|---|---|---:|---|
| Frontend unit | `2026-09-19T22-34-38-343Z-unit-a47e1365` | 1447/1447 | Non certifica il percorso browser completo |
| Wheel/streaming mirato | `d8084fe2`, `d4de2d61`, `3021e377` | verde | Review eseguita dallo stesso autore, non indipendente |
| Backend | `2026-09-19T22-19-10-435Z-backend-48a8756a` | exit 0 | Conteggio da leggere dal rapporto, non dedurre altro |
| Electron isolato | `2026-09-19T22-17-11-401Z-desktop-c5f4b5db` | exit 0, shell 3/3 | keyring in memoria; installer e credenziali provider reali esclusi |
| Browser completo, un worker | `harness-ui/frontend/artifacts/ripresa/2026-09-19T22-35-37-174Z-browser-361dcb2d/` | **658 pass, 37 fail, 3 skip, 14 non eseguiti** | exit 1; vedere `browser-result.json` e `browser.log` |
| Server 4174 | PID 19300, health HTTP 200 | verde operativo | stabilità prolungata e causa della precedente caduta non dimostrate |
| Build frontend + copia `public/` | hash `app.js` `0c1634b5f12e8ce4af45aab4bb1a8ff65e4c98f65ab3a30aeadc699e74820f75` | verde | 4174 non riavviato |
| Versione/changelog | package, lock e sezione `desktop-v0.1.14` | verde | tag ancora assente |
| Installer/ZIP | `TALOS-Setup-0.1.14.exe` 152328162 byte; `TALOS-0.1.14-win.zip` 256250322 byte | verde | build locale su Windows; firma Authenticode assente come dichiarato |
| Smoke R-04 | `.prove/R04-ci-smoke.json`, completato `true`, 78534 ms | verde | prova locale, non ancora workflow GitHub |
| Browser BC62 | `2026-09-20T07-03-36-112Z-browser-4fa8bfcf` | verde, 2/2 | fixture ora configura una chiave in-memory; nessuna rete reale |

SHA256 prodotti localmente e riportati in `dist/SHA256SUMS.txt`:
`03462a75da442a8171f519f34d1baa62619b67515826c19dc1f951b652515126`
(installer) e `efab92fe49bdcb9ab5f7f9310b69fb6ab777bc592f0e2eac983f3840387671f0`
(ZIP).

Il fix della rotella usa un percorso caldo senza `getComputedStyle` o
`scrollHeight`; la prova streaming lunga non ha frame oltre 50 ms. Su 4174 il
bundle live `app.js` ha SHA256
`0c1634b5f12e8ce4af45aab4bb1a8ff65e4c98f65ab3a30aeadc699e74820f75`, uguale a
`harness-ui/public/app.js`; il server non è stato riavviato in questa verifica.

## Blocchi nominativi prima di una nuova versione

1. Classificare e riprodurre tutti i 37 fallimenti del full browser; recuperare
   i 14 casi non eseguiti. Nessuno va chiamato “preesistente” senza confronto.
2. Chiudere D-LAB-03 con provider/download/unload reali, filtri combinati,
   parametri HF, paginazione senza duplicati e screenshot testa a testa sui due
   mockup canonici.
3. Riprodurre D-PAR-04 con almeno quattro figli reali in parallelo mentre il
   padre resta operativo; verificare sidebar destra/sinistra, grafo, feed,
   riconnessione e replay senza perdita o duplicazione.
4. Diagnosticare `RUN-560B-INTERRUZIONI` sulla sessione
   `560bee09-72ab-4495-a40a-922fe778bf40` con il modello e il contesto reali;
   applicare un fix solo dopo una causa riproducibile.
5. Completare R1/R4: audit release e PR #23–#36 con SHA effettivi, feed
   `talos.sidebar.v1`, inspector e confini di sicurezza. PR #33 su 4178 resta
   una demo su fixture.
6. Ripetere R5 sul pacchetto reale: build NSIS/ZIP, avvio, persistenza,
   clipboard, file esportati, PTY/runtime, shutdown, processi residui,
   installazione/upgrade/disinstallazione e credenziali provider. Il workflow
   `.github/workflows/release.yml` impone anche la coerenza tag/package/lock,
   smoke installato, SHA256, attestazione e changelog.
7. Risolvere o accettare esplicitamente i due advisory HIGH transitive
   `image-size` via `pptxgenjs`; non cambiare il lockfile per tentativi.

## Piano operativo di rilascio

### Ledger di esecuzione `desktop-v0.1.14` — 2026-09-20

File autorizzati per il lotto release: `harness-ui/desktop/package.json`,
`harness-ui/desktop/package-lock.json`, `harness-ui/desktop/CHANGELOG.md` e
questo dossier. Simboli/contratti: versione SemVer del pacchetto desktop,
versione radice del lock, sezione `desktop-v0.1.14`, formato degli artefatti
`TALOS-Setup-0.1.14.exe`/`TALOS-0.1.14-win.zip`, SHA256 e smoke R-02.

RED: prima del lotto il pacchetto e il lock dichiarano `0.1.13`, non esiste la
sezione changelog `desktop-v0.1.14`, non esiste il tag e il candidato non ha
artefatti verificati. GREEN: i test server/kernel/frontend/desktop e il build
frontend passano; resta da eseguire build installer, smoke installato,
`release-assets.mjs`, controllo dei nomi/hash e il workflow sul tag.

Ricerca primaria applicata al banco: Playwright documenta che `webServer.env`
è l'ambiente esplicito del processo e che il runner attende una risposta HTTP
prima dei test ([webServer](https://playwright.dev/docs/test-webserver)); il
test BC62 è stato quindi classificato come fixture fuori dall'allowlist
isolata, non come rifiuto del server. La scelta è adattare la fixture al root
isolato dichiarato, senza allargare l'allowlist di produzione. Il controllo
`kernel:controlla` locale resta informativo quando trova la copia storica del
kernel nel worktree fratello: il repo corrente è più nuovo (10338 vs 6260
righe); in CI quella fonte non esiste e il controllo torna 0.

Rollback: ripristinare solo i tre manifest/changelog del lotto alla revisione
precedente tramite commit esplicito; non usare `reset`/`clean` e non toccare
gli archivi non tracciati.

**Fase A — riconciliazione.** Isolare ogni run e aggiornare il registro con
causa (`prodotto`, `test obsoleto`, `ambiente`, `instabilità`, `ignota`).
Eseguire prima le spec fallite singolarmente e poi il full browser a un worker.

**Fase B — prodotto reale.** Chiudere Model Lab e runtime agenti in due lotti
accorpati. Ogni modifica deve avere ledger, RED mirato, GREEN focalizzato,
regressione permanente e verifica su 4174 senza riavvio durante l'attività
dell'owner.

**Fase C — candidata.** Eseguire unit, backend, kernel, browser, Electron e
prove reali provider/installer sullo stesso commit. Acquisire screenshot
individuali chiaro/scuro a 1024×800 e 1440×900, più scuro 1920×1080 e
2560×1440, confrontati solo con i due mockup canonici.

**Fase D — manifest e pubblicazione autorizzata.** Il lotto locale ha
incrementato package/lock a `0.1.14`, scritto il changelog, costruito gli
artefatti, verificato `SHA256SUMS.txt` e superato lo smoke installato. Ora il
passo operativo è commit del candidato, push del ramo, tag annotato
`desktop-v0.1.14`, push del tag e verifica della run GitHub; se il workflow
fallisce il tag non va riscritto, ma va corretto con un nuovo numero.

Comandi di ripresa, dalla radice del repo operativo:

```text
rtk git fetch talos-private lane/harness-desktop
rtk git status --short --untracked-files=no
rtk npm --prefix harness-ui/frontend run test:unit
rtk npm --prefix harness-ui/frontend run build
rtk node harness-ui/frontend/node_modules/playwright/cli.js test --config=harness-ui/frontend/playwright.ripresa.config.mjs --workers=1
rtk npm --prefix harness-ui/desktop run test:puri
rtk npm --prefix harness-ui/desktop run test:guscio
rtk curl.exe -sS http://127.0.0.1:4174/api/v1/health
```

Il full browser deve partire con un nuovo identificatore di run e non deve
sovrascrivere `harness-ui/frontend/artifacts/ripresa/`.

## Ledger di questo aggiornamento documentale

File esatti modificati: questo dossier, `.claude/ROADMAP-GLOBALE-RIPRESA-2026-09-19.md`,
`.claude/TICKET-RIPRESA-TALOS-2026-09-19-FINALE.md` e
`.claude/CANDIDATA-DESKTOP-RIPRESA-2026-09-19.md`. Nessun sorgente di prodotto,
manifest di sessione o archivio viene modificato. Contratti stabili: branch,
mockup hash, porta 4174, formato release `desktop-vX.Y.Z`, workflow e percorso
artifacts. RED documentale: i tre documenti precedenti riportavano checkpoint
904 senza indicare che `e7a7a796` è il checkpoint remoto corrente; GREEN:
questo file e i richiami in testa fissano la precedenza. Verifica: `git
diff --check`, status tracciato pulito, ref remoto uguale, health 200. Rollback:
ripristinare solo questi quattro file alla versione precedente tramite review;
non usare reset/clean e non toccare gli untracked.
