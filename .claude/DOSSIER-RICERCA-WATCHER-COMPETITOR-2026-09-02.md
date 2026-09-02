# Dossier — watcher del workspace e storia della sessione: come fanno gli altri (02/09/2026)

> Ordine owner 02/09: *"siamo un harness di codice: fai esattamente come fanno
> Claude Code, Hermes e tutti gli altri, non vietare cartelle arbitrariamente;
> l'harness ha accesso anche a tutto il computer. Ricerca bene i competitor,
> punti deboli e di forza, noi dobbiamo migliorarli."*
> Fatto misurato che ha aperto la ricerca: `.claude/CONSEGNA-REVIEW-COMPLESSIVA-2026-09-02.md` §2.

## Cosa fanno i concorrenti (fonti primarie, lette il 02/09)

| harness | osserva il filesystem? | cosa finisce nella storia della sessione | limiti sulle cartelle |
|---|---|---|---|
| **Claude Code** | sì, un watcher per hook e file di configurazione; il checkpointing traccia **solo i file modificati dai tool nella sessione** — le modifiche esterne "normally are not captured" | conversazione e tool call (`.jsonl` di sessione); nessun evento del filesystem | nessun divieto di cartella: lavora nella cwd scelta, anche `~` |
| **Hermes Agent** | no (sandbox/contenitore persistente; nessun watcher nella documentazione sessioni) | `state.db`: sessioni CLI/TUI/gateway, conversazione | nessun divieto |
| **Cline** | `FileSystemWatcher` di VS Code **solo per invalidare cache** (hook discovery, contesto file); `.clineignore` come `.gitignore` | transcript della task; "no queryable index of specific changes" | nessun divieto, esclusioni per pattern |
| **VS Code** (il riferimento per il tree) | watcher ricorsivo (parcel) con `files.watcherExclude` (default `**/.git/objects/**`, `**/.git/subtree-cache/**`, `**/node_modules/**`), glob | niente: gli eventi sono effimeri | nessun divieto; avvisa se il watcher costa troppo |

Fonti: [Claude Code — Checkpointing](https://code.claude.com/docs/en/checkpointing) ·
[Claude Code — Hooks guide](https://code.claude.com/docs/en/hooks-guide) ·
[Hermes — Sessions](https://hermes-agent.nousresearch.com/docs/user-guide/sessions) ·
[Hermes — Configuration](https://hermes-agent.nousresearch.com/docs/user-guide/configuration) ·
[Cline — .clineignore](https://docs.cline.bot/customization/clineignore) ·
[Cline — workspace tracker su FileSystemWatcher](https://github.com/cline/cline/actions/runs/14859136354) ·
[VS Code — File Watcher Internals](https://github.com/microsoft/vscode/wiki/File-Watcher-Internals) ·
[VS Code — glob per watcherExclude](https://github.com/microsoft/vscode/issues/137872).

## Punti di forza e deboli, e dove TALOS si posiziona

- **Forza comune**: nessuno scrive gli eventi del watcher nella storia. La
  storia è la conversazione. TALOS lo violava (`broadcast()` persisteva
  `WorkspaceChanged`): **corretto il 02/09**, segnale vivo agli iscritti,
  mai su disco, mai nel replay; i log vecchi si alleggeriscono da soli al
  ripristino (filtro in lettura, nessuna riscrittura di file già pagati).
- **Debolezza di Claude Code**: le modifiche fatte fuori dai tool non
  aggiornano niente (il tree non esiste). **TALOS fa di più**: il tree si
  aggiorna dal vivo anche per un `git checkout` esterno, contratto già
  provato (`SESSION-WATCHER-LIFECYCLE-28`).
- **Debolezza di Cline/VS Code**: le esclusioni vanno scritte a mano in un
  file di pattern. **TALOS** ha già l'elenco degli store interni escluso per
  costruzione (`workspace-watcher.mjs`, `IGNORATI`); manca ancora la
  possibilità per l'owner di aggiungere pattern propri (tipo
  `files.watcherExclude`) — debito registrato, non urgente: dopo la cura il
  costo di un evento in più è zero byte su disco.
- **Forza di Hermes**: sessioni in un database, non in file `.jsonl` per
  sessione. **TALOS** resta su `.jsonl` append-only per scelta (mai
  riscrivere ciò che è costato denaro); con i `WorkspaceChanged` fuori dal
  log la dimensione torna a essere quella della conversazione (e572474a:
  1,9 MB → 394 KB di storia vera).
- **Nessun concorrente vieta cartelle**: la guardia TALOS resta solo sulla
  radice del volume (`C:\`), dove `fs.watch` ricorsivo è davvero
  insostenibile. Desktop, Home, Documenti restano workspace legittimi.

## Misura prima/dopo (server isolato 4177 col codice curato, stesso store, Chrome con GPU)

| | prima | dopo |
|---|---|---|
| byte SSE trasferiti aprendo e572474a | 1.606.366 | **98.241** (−94 %) |
| eventi rigiocati | 743 | **250** |
| letture dell'albero | 1 | 1 |
| mutazioni DOM (UI identica) | 648 | 648 |
| tempo di replay | 930 ms | 933 ms |
| backend | 1259/1259 | **1261/1261** (2 test nuovi, `WORKSPACE-CHANGED-EPHEMERAL-01/02`, RED visto prima della cura) |

Il server owner 4174 non è stato riavviato: gira ancora il codice precedente
finché l'owner non lo riavvia — e infatti continua a persistere: il file
`e572474a…jsonl` è passato da 756 a 1.372 righe (1,9 → 2,5 MB) durante questa
sessione di review, tutte `WorkspaceChanged` scritte dal 4174 (la scheda
dell'owner è iscritta a quella sessione, e ogni artefatto scritto sul Desktop
dalla review diventa un evento). Il server isolato 4177 non ha scritto una
riga. La crescita si ferma al primo riavvio del 4174 col codice curato.
