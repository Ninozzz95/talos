# Chi avvia processi con l'ambiente INTERO — harness desktop, misurato il 17/09/2026

> ⛔ Nasce da CLI-REQ-04, punto (b) del brief: «accerta nel codice ogni altro punto che avvia
> processi con `process.env` intero; per ognuno scrivi se è coperto da D-10E o no. Non curare
> fuori dal terminale: ELENCA».
> ⛔ Sta su disco e non in un rapporto di chat perché nel primo giro era solo nel rapporto, e un
> elenco che non resta sull'albero è un elenco che non esiste (riserva B2 del revisore).
>
> ⛔⛔ **RIFATTO il 17/09/2026, terzo giro: il primo censimento era INCOMPLETO.** Ero partito da chi
> IMPORTA `node:child_process` in cima al file, e quel filtro non vede gli import DINAMICI: mi era
> sfuggito `src/scheda-di-lavoro.mjs:233`, che fa `const { spawn } = await import('node:child_process')`
> DENTRO la funzione e poi `spawn('git', …)` senza `env`. Trovato dal revisore.
> ⇒ Il censimento adesso parte dalle CHIAMATE, non dagli import. Comando usato, da `harness-ui/`:
>
> ```
> grep -rnE "\b(spawn|spawnSync|execFile|execFileSync|execSync|fork)\(" --include=*.mjs \
>   src/ desktop/ server.mjs scripts/ \
>   | grep -vE "tests?/|\.test\.mjs|/(spec|tests)/" \
>   | grep -vE "policy\.(spawn|execFile)|processPolicy\.|DOCTOR_PROCESS_POLICY"
> ```
>
> **31 righe**, poi ognuna letta a mano per guardare il suo oggetto opzioni. ⛔ Il criterio è
> l'assenza dell'opzione `env`: il valore predefinito di `node:child_process` è `process.env` INTERO
> (nodejs.org/api/child_process.html, letto il 17/09/2026), quindi «nessun `env`» e
> «`env: process.env`» sono la stessa cosa.

## 1 · Ereditano tutto `process.env` — e **nessuno** è coperto da D-10E

| # | Punto | Che cosa lancia | Stato |
|---|---|---|---|
| 1 | `src/pty-terminal.mjs` (`apri`) | la shell della scheda Terminale | **CURATO** (CLI-REQ-04): `ambienteSenzaVariabiliDelServer()` |
| 2 | `src/browser-vivo.mjs` `avviaDiSistema` | Chromium/Edge di sistema, pilotato via CDP | **CURATO** (D1, 2º giro): stessa fonte, `opzioniAvvioBrowser()` |
| 3 | `src/browser-vivo.mjs` (`execFile('taskkill', ['/PID', …])`) | binario di sistema per chiudere l'albero del browser | **APERTO** — argomenti fissi, niente shell, nessun binario di terzi |
| 4 | `src/workspace-info.mjs:95` (`spawn('git', argomenti, {cwd, windowsHide})`) | `git` per lo stato del workspace | **APERTO** — programma fisso, array di argomenti, niente shell; `git` risolto dal PATH ereditato |
| 4-bis | `src/scheda-di-lavoro.mjs:233` (`spawn('git', ['log', …], {cwd, windowsHide})`) | `git log -3` per la scheda di lavoro | **APERTO** — ⛔ **trovato solo al terzo giro**: l'import è DINAMICO (`await import` dentro la funzione), e il primo censimento partiva dagli import in cima al file. Stessa classe del n. 4 |
| 5 | `src/llama-server-supervisor.mjs` `creaSondaBinario` | sonda del binario del motore locale | **APERTO** — `shell:false` |
| 6 | `src/config.mjs` (`sondaMotore`, chiamata da `parseLlamaServerPath`) | `llama-server --list-devices` | **APERTO** — `shell:false` |
| 7 | `desktop/runtime.mjs` `scegliMotoreLocale` | la stessa sonda, dal processo main di Electron | **APERTO** — `shell:false` |
| 8 | `src/kernel/talosHarness.mjs` `distroWslPredefinita` (`spawnSync('wsl.exe', ['-l','-v'])`) | enumerazione delle distro WSL | **APERTO** — sola lettura |
| 9 | `scripts/avvia-talos.mjs` (`{...process.env, TALOS_HARNESS_UI_REPORT_FILE}`) | il server, da riga di comando | **FUORI PRODOTTO** — script di avvio per sviluppo, non spedito |
| 10 | `desktop/main.mjs` (via `creaAvvioFiglio`, `desktop/runtime.mjs`) | il server figlio | **VOLUTO** — copia filtrata (toglie `NODE_OPTIONS`, `NODE_PATH`, `ELECTRON_*`) più i `TALOS_*` aggiunti. È l'ORIGINE dei segreti, non un difetto |

✅ **CURATO il 17/09/2026 notte, e il rischio era PIÙ GRAVE di come sta scritto qui sotto.** Non serviva un `PATH` ostile: su Windows
un nome nudo si cerca PRIMA nella cartella di lavoro del figlio, cioè nel WORKSPACE. Misurato con un finto `git.exe` innocuo (copia di
`whoami.exe`): un processo Node senza `NoDefaultCurrentDirectoryInExePath` esegue il FINTO; con la variabile, o impostandosela da sé a
inizio processo, esegue il git vero. Cura: `src/difesa-ricerca-programmi.mjs`, importato per PRIMO da `server.mjs` — vale per i punti 4,
4-bis e per ogni `spawn` per nome che verrà. Prova nei due versi: `tests/difesa-ricerca-programmi.test.mjs`. ⛔ Il punto 5 (sonda del
binario) è già stato curato applicando la PR #30 (`llama-binary-probe.mjs`, ambiente filtrato): questa tabella lo dà ancora «aperto».

⛔ Il candidato più serio che resta aperto è il **n. 4**: `git` è il nome che si risolve dal `PATH`
ereditato, quindi in una cartella ostile con un `git` proprio nel percorso si sposterebbe il
bersaglio. Non è la riga di oggi, ed è scritto qui perché non si perda.

## 2 · Coperti da D-10E (`ambienteSenzaCredenziali()`, filtro a FORMA)

`src/kernel/talosHarness.mjs`: `prova` · il runner generico dietro le strade WSL e adb ·
`eseguiSuWindows` (cioè `!comando` della persona **e** l'attrezzo `shell` del modello).

## 3 · Coperti da una ALLOWLIST esplicita (`process-policy.mjs`, `buildEnvironment`)

`src/git-service.mjs` · `src/hook-registry.mjs` · `src/plugin-session.mjs` ·
`src/context-embedding-runtime.mjs` · `src/context-tool-output.mjs` · `src/hf-model-transfer.mjs`
(la sua `spawn` locale, `:101`, passa dalla politica) ·
`src/llama-server-supervisor.mjs` (l'avvio del server, a differenza della sonda del punto 5) ·
`src/doctor.mjs` · `src/workspace-context.mjs:111` (`GIT_PROCESS_POLICY.execFileSync`) ·
`src/workspace-files.mjs:499` (`EXPLORER_PROCESS_POLICY.execFile` — ⛔ mancava nel primo giro).

## 4 · Coperti dal default dell'SDK MCP

`src/mcp-client.mjs` non passa `env`, e `StdioClientTransport` usa `getDefaultEnvironment()`, cioè
un sottoinsieme sicuro e NON tutto l'ambiente. `src/acp-agent.mjs` parte da quello stesso
sottoinsieme e aggiunge le variabili dichiarate nel runtime dell'agente esterno.

## 5 · Non sono spawn

`server.mjs` legge `process.env` per costruire lo store delle credenziali dei fornitori e quello
della fonte di ricerca: leggono, non lanciano niente.

---

## ⛔⛔⛔ E D-10E NON copre i nomi che il terminale toglie — misurato, non dedotto

Il commit del primo giro affermava che il kernel tratta già da segreti i nomi dell'elenco del
terminale «su OGNI altra strada». È **falso**. Misurato il 17/09/2026 chiamando
`eUnaCredenziale()` di `src/kernel/talosHarness.mjs`:

| nome | `eUnaCredenziale()` |
|---|---|
| `TALOS_HARNESS_UI_TOKEN` | `true` |
| `TALOS_HARNESS_RECEIPT_PRIVATE_KEY_B64` | `true` |
| `TALOS_HARNESS_SEARCH_API_KEY` | `true` |
| `TALOS_HARNESS_RECEIPT_KEY_ID` | **`false`** |
| `ELECTRON_RUN_AS_NODE` | **`false`** |

Causa: `FORMA_DI_CREDENZIALE` ha `_KEY$` e `^KEY_` ma **non** `_KEY_`, e `ELECTRON_RUN_AS_NODE`
non ha forma di credenziale perché non è un segreto — è un cambio di comportamento.
⇒ Quei due arrivano ancora all'attrezzo `shell` e a `prova` del modello.

⛔ **NON è curato**: il filtro del kernel è fuori dal perimetro di questa riga. È dichiarato qui e
in `src/ambiente-solo-server.mjs`, perché una cosa non curata e non scritta è una cosa dimenticata.
