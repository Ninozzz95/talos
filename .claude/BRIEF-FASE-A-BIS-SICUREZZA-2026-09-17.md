# BRIEF — Fase A-bis · sicurezza di secondo livello (solo backend)

> Collocata da me il 17/09/2026 sul mandato dell'owner («decidilo tu per priorità e complessità»). Parte dopo la fusione di BC-73.
> Un agente Opus 5, sforzo alto. La revisione avversariale la fa l'ORCHESTRATORE, non un agente (owner 17/09, ribadito la notte).
> Ramo tuo con `git.exe checkout -b fase-a-bis <sha che ti do>`; nessun checkout fra rami dopo; A/B sulla base con `git.exe archive`.

## Cosa esiste già (letto o misurato il 17/09 — RIACCERTALO sul tuo albero prima di fidarti)
- ✅ CURATO, non rifarlo: il dirottamento di `git.exe` dal workspace (BC-83, `src/difesa-ricerca-programmi.mjs`, importato per primo
  da `server.mjs`). Vale per ogni `spawn` per nome nudo. La sua prova lancia il genitore ad ambiente RIPULITO: imitala.
- ✅ CURATI: la shell del Terminale, il browser pilotato, la sonda del binario del motore (`llama-binary-probe.mjs`) — tutti con
  `ambienteSenzaVariabiliDelServer()` (`src/ambiente-solo-server.mjs`, elenco chiuso `VARIABILI_SOLO_DEL_SERVER`, filtro SOTTRATTIVO).
- L'inventario è `.claude/ELENCO-SPAWN-AMBIENTE-2026-09-17.md` (31 chiamate, comando di censimento dentro). ⛔ È parzialmente STANTIO:
  il punto 5 risulta «aperto» ed è curato. Rifai il censimento col SUO comando e parti dal risultato, non dalla tabella.
- La fiducia dei plugin: impronta dell'INTERO pacchetto (`plugin-registry.mjs`), riverificata prima di OGNI esecuzione di un attrezzo
  di plugin (CLI-REQ-02). ⛔ Debito dichiarato: gli HOOK di un plugin riverificano la fiducia solo all'avvio della sessione
  (`plugin-session.mjs:143`).
- La grammatica AMMESSA dei comandi di plugin (`echo …`, `node <file coperto> [arg]`, `<file coperto> [arg]`, nessuna opzione
  dell'interprete) vale al CARICAMENTO dei plugin. ⛔ Debito dichiarato nel codice (`plugin-registry.mjs` ~409): gli hook STANDALONE di
  `.harness-ui-hooks.json` non passano di lì — per loro `node -e` è ancora ammesso.
- `scansionaPatternSospetti` (`plugin-registry.mjs:96`): quattro regex su testo. Il secondo revisore del 17/09 ha misurato che 4 forme
  su 5 che riconosce sono GIÀ rifiutate prima dalla grammatica, e la quinta è un falso positivo: oggi rassicura e basta. Gli avvisi
  arrivano a schermo nel pannello Estensioni (tradotti da `origineAvvisoPlugin`, frontend — NON toccarlo).

## Ricerca (17/09/2026) — i vincoli
- Claude Code fotografa la configurazione degli hook ALL'AVVIO e usa quella foto per tutta la sessione; le modifiche a sessione viva non
  hanno effetto e vanno riviste (thepromptshelf.dev «Claude Code Hooks: Complete Reference 2026»; hidekazu-konishi.com «Hooks complete
  guide»). Il motivo è un attacco vero: CVE-2026-25725 (codice in sandbox che inietta hook in `settings.json`) e il worm npm CHAINDROP
  dell'agosto 2026, che nascondeva il carico in `.claude/settings.json` (karanb192/claude-code-hooks, `config-guard`/`config-watch`).
  ⇒ Due difese DIVERSE, e servono tutte e due: la FOTO (ciò che gira è ciò che è stato approvato) e il RICONTROLLO (il file sul disco è
  ancora quello approvato). Una foto senza ricontrollo esegue per ore un file che nel frattempo è stato sostituito.
- Node: senza `env` un figlio eredita `process.env` INTERO (nodejs.org/api/child_process.html).

## Le righe, in quest'ordine — una riga, un commit
1. **Gli hook di plugin riverificano la fiducia all'USO.** Prima di lanciare un hook di plugin si ricalcola l'impronta del pacchetto
   (stessa funzione degli attrezzi: una verità sola) e, se è cambiata, l'hook NON gira e la sessione lo dice con una frase umana, una
   volta. ⛔ Misura il costo: l'impronta è a flusso con tetti (32 MiB/file, 128 MiB/pacchetto); se un hook frequente la rende cara,
   proponi una cache invalidata da `mtime`+dimensione DICHIARANDO che cosa non vede, non metterla in silenzio.
2. **Gli hook standalone passano dalla stessa grammatica.** `.harness-ui-hooks.json`: niente `node -e`/`-p`/`--eval`/`-r`, niente
   opzioni dell'interprete; ammesso ciò che la grammatica dei plugin ammette. ⛔ PRIMA misura chi rompi: cerca nel repo, nelle fixture e
   nei documenti gli hook standalone che usano `node -e` (le prove di `eseguiComandoPlugin` lo usano APPOSTA: non sono hook standalone,
   non toccarle). Un hook già FIDATO che diventa inammissibile non sparisce in silenzio: resta elencato come «non più ammesso», col
   perché. Se la migrazione tocca file dell'owner fuori dal repo, FERMATI e scrivilo.
3. **I punti dell'inventario che ereditano l'ambiente intero.** Per ognuno ancora aperto dopo il TUO censimento: o passa da
   `ambienteSenzaVariabiliDelServer()`, o da una politica `process-policy` con allowlist, oppure resta aperto con una ragione scritta e
   misurata. ⛔ `desktop/main.mjs` è l'ORIGINE dei segreti (voluto): non si tocca. ⛔ `src/kernel/talosHarness.mjs` è dell'owner: il
   punto 8 (`wsl.exe -l -v`) si cura SOLO se sta in una riga, e dillo.
4. **`scansionaPatternSospetti`: vera o via.** Decisione dell'orchestratore: si TOGLIE dal percorso a schermo se non sai farle dire
   una cosa vera che la grammatica non dica già. Misura prima, con un corpus di comandi (almeno 30 forme, ammessi e no): per ogni
   avviso, la grammatica lo rifiuta già? Se tutti sì → via la funzione, via gli avvisi dalla rotta, e una riga di changelog interno;
   il frontend regge un elenco vuoto (verificalo leggendo, senza toccarlo). Se trovi una classe VERA che la grammatica ammette e che
   merita un avviso, tienila SOLO per quella, con la prova.
5. **Aggiorna l'inventario** su disco col censimento rifatto (è il documento, non un rapporto di chat).

## Regole
RED prima, GREEN dopo, AL CONTRARIO (almeno tre rotture per riga, ripristino per COPIA + sha256). Nessuna prova tocca la rete vera né
lancia programmi veri fuori da `node`/`git`/`whoami` innocui. Segreti: solo valori finti. Script con escape su FILE. Nessun nome tecnico
nelle frasi che arrivano a schermo. NON toccare `frontend/`, `mobile/`, `core/`, la CLI, `tests/research-orchestrator.test.mjs`,
`tests/ricerca-deposito-strutturato.test.mjs`. Porte vietate: 4174, 9333, 4177. Commit in inglese, da file con `-F`, senza trailer,
attraverso i cancelli. Prima di chiudere: nessun processo tuo vivo.

## Consegna
Per riga: misura sulla base, causa, cura, prova, rotture. Conteggi interi (`node --test --test-concurrency=2 tests/*.test.mjs
labs/electron-shell/*.test.mjs`, `npm run test:kernel`). MISURATO contro LETTO. NON verificato per nome. `git.exe status --short` vuoto.
