# TALOS Desktop — dossier unico di preparazione al rilascio

Aggiornato il **2026-09-20**. Questo documento è il punto di ingresso per la
preparazione della prossima versione desktop. Raccoglie le memorie operative
senza promuovere una spunta storica a prova corrente.

## Verdetto corrente

Il ramo `lane/harness-desktop` è sincronizzato con
`talos-private/lane/harness-desktop` al commit
`e7a7a796a94c82b84e097d1a2964e9adb68f3ffb`. Il commit precedente contiene il
fix prodotto `904244abd5efb03962095d2fb32d2003dfb30f42`; l'ultimo commit è
documentazione di rilascio. Il worktree tracciato è pulito. I file non tracciati
di archivio, sessioni e prove preesistenti restano intatti e non fanno parte
della candidata.

**Verdetto: non rilasciabile e nessun tag da creare.** La versione del desktop
è ancora `0.1.13` in `harness-ui/desktop/package.json` e nel lock; la release di
confronto è `desktop-v0.1.13` (`a898162feff3ed8ad4cb0586344fe9d9e390d1a5`).
Non si assegna `0.1.14` finché i cancelli sotto non sono verdi e il changelog
non è scritto.

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

**Fase D — manifest e pubblicazione autorizzata.** Solo con tutti i blocchi
chiusi: incrementare package/lock alla versione scelta, aggiungere la sezione
`## desktop-vX.Y.Z` a `harness-ui/desktop/CHANGELOG.md`, rieseguire i cancelli,
costruire gli artefatti, verificare `SHA256SUMS.txt` e smoke installato. Il tag
`desktop-vX.Y.Z` e il push del tag sono un'azione separata: non eseguirli
automaticamente in questo checkpoint.

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
