/*
 * ⭐ Router mode of the desktop local engine (owner 26/10/2026 night, A3-1: «Anticipare il router adesso»). Design and the owner's three
 *   decisions: handoff `PROGETTO-ROUTER-MOTORE-LOCALE-2026-10-26.md`; brief `BRIEF-ROUTER-MOTORE-LOCALE-2026-10-27.md`.
 *
 * Today TALOS starts one `llama-server` per model (`llama-server-supervisor.mjs`). In router mode ONE `llama-server` is the router: it
 * reads a preset file written by TALOS (one section per installed model, with that model's arguments) and starts a child process per
 * model when asked, up to `--models-max` together; past that it unloads the least recently used one (llama.cpp
 * `tools/server/server-models.cpp:1295-1310`, clone f849095 of 21/10/2026). Why the owner moved this phase earlier: the real
 * load-progress bar only exists here (`/models/sse`, `server-models.cpp:2020-2027` relays the child's
 * `{stages, current, value}`, `server-context.cpp:1174-1177`).
 *
 * The owner's decisions (26/10 night, three recommended ones):
 *   1. how many models stay loaded together is COMPUTED FROM MEMORY, as Hermes does: more than one only if the biggest fits twice,
 *      at least one (`hermes_cli/local_runtime/presets.py:323-354`, `admitted_residency_count`);
 *   2. if the router fails to load a model that loads standalone, it falls back AUTOMATICALLY to today's engine for that model, with a
 *      line in the chat and the reason in the log (llama.cpp #29225 «Router mode fails to load models but standalone models work»,
 *      #27351 a child that stays «loading» forever);
 *   3. behind a switch, OFF by default (`TALOS_LOCAL_ROUTER=1`, `config.mjs`), until the bench promotes it.
 *
 * What stays exactly as today: the per-model choices (fitter, `-ngl 99` or `--fit`, KV cache type, n-gram speculative decoding, the
 * window, `-np 1`) come from the standalone supervisor's own functions (`sceltePerIlRouter`), the offline variable, the size-based
 * health wait (`attesaSaluteMs`), stop without waiting for the exit (A-6) and the next start waiting for it (A-7, A-R4).
 *
 * Read before writing (27/10/2026):
 *   - Hermes `hermes_cli/local_runtime/supervisor.py` (clone 2026-10-22): router spawn `:175-213` (`--models-max`, `--models-autoload`,
 *     `--metrics`, `--jinja`, `--models-preset`), health `:243-256`, the restart with backoff 1/5/15/60 s in `_watch` `:258-285`
 *     (`_RESTART_BACKOFF_S`, `:35`), the stop that terminates the router AND its children `:303-335`, `unload_model` `:382-393`,
 *     `IDLE_UNLOAD_S = 15 * 60` `:118`; `presets.py` the flag→key map `:21-25` and the INI `:388-398`; `load_progress.py` the SSE
 *     reader `:80-112` and the composite percent `:34-46` (text model 85%); `endpoint.py:20-29` `model=…&autoload=false` for status reads.
 *   - llama.cpp `tools/server/server-models.cpp`: preset keys are the long option names without dashes (`common/preset.cpp:249-260`),
 *     a value ends at `#` or `;` (`common/preset.cpp:200-202`), the router's own arguments override every section
 *     (`server-models.cpp:934-939`), the child never gets the API key (`:432-450`), `GET /models?reload=1` unloads only the models whose
 *     section changed (`:1086-1118`), a failed child is `unloaded` with `failed: true` and `exit_code` (`:2454-2458`), `POST /models/load`
 *     answers at once and the load goes on (`:2409-2425`), SSE lines are `data: {"model","event","data"}` (`:877-887`, `:2570-2585`),
 *     `/health` is the router's own (`server.cpp:241, 280`), `/props?model=` is proxied to the child (`:2313-2353`).
 *   - The shipped binary (b11669 = v0.7.0, `desktop/scripts/prepara-pacchetto.mjs:23`): every router flag used here appears in its
 *     `--help` (`--models-preset`, `--models-max`, `--models-autoload`, `--metrics`, `--jinja`, `--host`, `--port`, `--api-key-file` with
 *     its variable `LLAMA_ARG_API_KEY_FILE`, and in the sections `ctx-size`, `n-gpu-layers`, `device`, `flash-attn`, `cache-type-k`,
 *     `cache-type-v`, `spec-type`, `parallel`, `props`, `sleep-idle-seconds`), checked on 27/10/2026 against
 *     `resources/local-runtime/{cpu,vulkan}/llama-server.exe` (build 11669, commit 620d2225c).
 */
import { randomBytes } from 'node:crypto';
import { execFile } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdirSync, renameSync, rmdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { setTimeout as wait } from 'node:timers/promises';
import { createProcessPolicy, DEFAULT_ENV_ALLOWLIST } from './process-policy.mjs';
import { percorsoTaskkill, radiceDiSistema } from './taskkill-di-sistema.mjs';
import { AMBIENTE_OFFLINE, LlamaServerSupervisorError, attesaSaluteMs } from './llama-server-supervisor.mjs';
import { leggiArchitetturaGguf, readGgufHeader } from './gguf-header.mjs';
import { libreriaDelMotorePresente, motoreConosceArchitettura } from './motore-architetture.mjs';

const LOOPBACK = '127.0.0.1';
const DEFAULT_TIMEOUT_MS = 15_000;

/** Hermes `supervisor.py:35`: `_RESTART_BACKOFF_S = (1, 5, 15, 60)`. */
export const ATTESE_DI_RIAVVIO_MS = Object.freeze([1_000, 5_000, 15_000, 60_000]);
/*
 * J-R3 (block 9 review, 27/10/2026): a router that cannot start was restarted every 60 s for as long as the app stayed open. Hermes does
 * the same — `_watch` (`hermes_cli/local_runtime/supervisor.py:258-285`, clone 2026-10-22) loops `while not self._stopping`, the backoff
 * index saturates at 60 s (`:270`, `_RESTART_BACKOFF_S[min(self._restarts, len - 1)]`), `_restarts` is never reset (`:139`, `:274`) and a
 * failed restart only logs (`:284-285`): there is no cap to copy. ⇒ TALOS stops: after this many router starts IN A ROW that did not
 * bring the engine back (the first start, then once each step of Hermes' backoff table), no more restarts until a router comes up
 * healthy again — a load the person asks for still tries it once. The reason goes in the status (`router.fermo`) and in the log.
 */
export const AVVII_FALLITI_MASSIMI = 1 + ATTESE_DI_RIAVVIO_MS.length;
/*
 * G-R3 (block 10 review, 27/10/2026): a restart used to clear the J-R3 count as soon as its router answered /health. A router that
 * answers and dies 20 ms later, with no model to load again, was then «a restart that worked» every time: 27 restarts in 1 s with 10 ms
 * waits, one a minute for ever with the real ones (REV-B10-G6). Now a RESTARTED router counts as a start that worked only once it has
 * stayed up for the last step of the backoff table (the reviewer's measure, 60 s); a death before that is a failed start. Hermes has no
 * cap at all (`supervisor.py:258-285`), so there is nothing to copy here: the cap is TALOS' own (J-R3).
 */
export const VITA_SANA_MS = ATTESE_DI_RIAVVIO_MS.at(-1);
/** Hermes `supervisor.py:118` (`IDLE_UNLOAD_S = 15 * 60`) and the owner's Ollama/Jan decision (26/10): unload after 15 min, changeable. */
export const DORMI_DOPO_SECONDI = 15 * 60;
/** Hermes `supervisor.py:121` (`models_max: int = 4`): the ceiling; the memory decides below it (decision 1). */
export const MODELLI_INSIEME_TETTO = 4;
/** Hermes `context_policy.py:33`: `RUNTIME_OVERHEAD_BYTES = int(1.5 * (1 << 30))`, the runtime's own buffers beside weights and cache. */
export const SOVRACCARICO_BYTE = 1.5 * 2 ** 30;
/** Hermes `load_progress.py:20-21`. */
const QUOTA_DEL_TESTO = 0.85;
const RICONNESSIONE_SSE_MS = 3_000;
/** A model that holds memory in the router (`server-models.h:56-63`). */
const RESIDENTI = new Set(['loaded', 'sleeping']);
const IN_MOVIMENTO = new Set(['loading', 'loaded', 'sleeping']);

/*
 * The per-model arguments (from `-c` to `-np 1`, `llama-server-supervisor.mjs` `argomentiDelModello`) as preset keys. A preset key is the
 * long option name without its dashes (`common/preset.cpp:249-260`); the map is Hermes' (`presets.py:21-25`) plus the three flags TALOS
 * passes that Hermes does not. ⛔ A flag missing here throws: a new per-model choice of the standalone supervisor must not be dropped in
 * silence on its way to the router (lesson «un'opzione nuova si prova lungo tutto il filo», 17/10 and 21/10).
 */
export const CHIAVI_DEL_PRESET = Object.freeze(new Map([
  ['-c', 'ctx-size'],
  ['-ngl', 'n-gpu-layers'],
  ['--device', 'device'],
  ['-fa', 'flash-attn'],
  ['--cache-type-k', 'cache-type-k'],
  ['--cache-type-v', 'cache-type-v'],
  ['--spec-type', 'spec-type'],
  ['-np', 'parallel'],
]));

export function chiaviDagliArgomenti(argomenti) {
  const chiavi = [];
  for (let i = 0; i < argomenti.length; i += 2) {
    const chiave = CHIAVI_DEL_PRESET.get(argomenti[i]);
    if (!chiave || i + 1 >= argomenti.length) throw new LlamaServerSupervisorError(`router preset: no preset key for the argument ${argomenti[i]}`, 'RUNTIME_MISCONFIGURED');
    chiavi.push([chiave, String(argomenti[i + 1])]);
  }
  return chiavi;
}

/** A section name the INI parser keeps as it is: the model store's own id shape (`local-model-store.mjs:24`), and never a `:` tag. */
export function nomeDiSezioneValido(modelId) {
  return typeof modelId === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(modelId);
}

/** A value ends at `#` or `;` (`common/preset.cpp:200-202`) and at a line end: such a path cannot be written in the preset. */
export function valoreScrivibile(valore) {
  return typeof valore === 'string' && valore !== '' && !/[#;\r\n]/u.test(valore);
}

/**
 * The section of one model, or null when it cannot be written (its path or name would be cut by the INI parser): such a model goes to
 * today's engine (decision 2).
 */
export function sezioneDelModello({ modelId, modelPath, argomenti, dormiDopoSecondi = DORMI_DOPO_SECONDI }) {
  if (!nomeDiSezioneValido(modelId) || !valoreScrivibile(modelPath)) return null;
  const chiavi = [['model', modelPath], ...chiaviDagliArgomenti(argomenti), ['props', 'true']];
  /* A2 (owner, 26/10): the model leaves the memory after 15 idle minutes. `--sleep-idle-seconds` is an ordinary server argument, so in a
     section it reaches only that model's child (`server-models.cpp:463-475` renders the section into the child's arguments). */
  if (Number.isSafeInteger(dormiDopoSecondi) && dormiDopoSecondi > 0) chiavi.push(['sleep-idle-seconds', String(dormiDopoSecondi)]);
  return { modelId, modelPath, chiavi, testo: `[${modelId}]\n${chiavi.map(([k, v]) => `${k} = ${v}`).join('\n')}\n` };
}

export function testoDelPreset(sezioni) {
  const ordinate = [...sezioni].sort((a, b) => a.modelId.localeCompare(b.modelId));
  return ['; TALOS — router mode of the local engine. Written by TALOS before every load: changes made here do not last.', 'version = 1', '',
    ...ordinate.map((s) => s.testo)].join('\n');
}

/** Atomic: a temporary file, then a rename over the old one (the router may read it at any moment). */
export function scriviPresetAtomico(percorso, testo) {
  mkdirSync(dirname(percorso), { recursive: true });
  const temporaneo = `${percorso}.${process.pid}.tmp`;
  writeFileSync(temporaneo, testo, 'utf8');
  renameSync(temporaneo, percorso);
}

/** Bytes one model holds while loaded (Hermes `estimator.py:217-221`): weights + KV cache at its window + the runtime's overhead. */
export function improntaDelModello({ byteFile, kvPerToken, finestra }) {
  if (!Number.isFinite(byteFile) || byteFile <= 0 || !Number.isFinite(kvPerToken) || kvPerToken <= 0 || !Number.isSafeInteger(finestra) || finestra <= 0) return null;
  return byteFile + kvPerToken * finestra + SOVRACCARICO_BYTE;
}

/**
 * Decision 1 (owner 26/10/2026): how many models the router may hold together. Hermes `presets.py:323-354`: «The cap rises above one
 * only while the LARGEST staged model still fits TWICE», `max(1, min(configured, usable // largest))`.
 * ⛔ Where Hermes keeps its configured number when nothing can be priced, TALOS keeps ITS today: one model at a time.
 */
export function modelliInsieme({ impronte, utilizzabile, tetto = MODELLI_INSIEME_TETTO }) {
  const note = (impronte ?? []).filter((n) => Number.isFinite(n) && n > 0);
  if (!note.length || !Number.isFinite(utilizzabile) || utilizzabile <= 0) return 1;
  return Math.max(1, Math.min(tetto, Math.floor(utilizzabile / Math.max(...note))));
}

/** One 0-100 for the load, text model first (Hermes `load_progress.py:34-46`). */
export function percentualeDiCaricamento({ stages, current, value } = {}) {
  const pct = (x) => Math.max(0, Math.min(100, Math.round(x * 100)));
  if (!Number.isFinite(value)) return null;
  const fasi = Array.isArray(stages) ? stages.map(String) : [];
  if (!fasi.length || !fasi.includes(current) || fasi.length === 1) return pct(value);
  const altre = fasi.filter((f) => f !== 'text_model');
  const quotaAltre = altre.length ? (1 - QUOTA_DEL_TESTO) / altre.length : 0;
  let partenza = 0;
  for (const fase of fasi) {
    const quota = fase === 'text_model' ? QUOTA_DEL_TESTO : quotaAltre;
    if (fase === current) return pct(partenza + quota * value);
    partenza += quota;
  }
  return pct(value);
}

/** The `/models/sse` reader: pieces come split anywhere; only `data:` lines are events (`server-models.cpp:2580`). */
export function creaLettoreSse(suEvento) {
  let resto = '';
  return (pezzo) => {
    resto += pezzo;
    const righe = resto.split('\n');
    resto = righe.pop();
    for (const riga of righe) {
      const testo = riga.trim();
      if (!testo.startsWith('data:')) continue;
      let evento;
      try { evento = JSON.parse(testo.slice(5).trim()); } catch { continue; }
      if (evento && typeof evento === 'object') suEvento(evento);
    }
  };
}

/**
 * The router's own arguments: the brief's list, and nothing per model (they would override every section, `server-models.cpp:934-939`).
 * ⛔ The API key is NOT on the command line: it goes in a file named by `LLAMA_ARG_API_KEY_FILE` (the environment form of
 *   `--api-key-file`, in b11669's `--help`). Measured on b11669 (27/10/2026): with `--api-key` the router's CHILDREN run with no key at all
 *   («security: no API key is set and CORS allows all origins»), because the router removes the key from every section
 *   (`server-models.cpp:432-450`, `unset_reserved_args`) — any local process, or a web page that finds the port, could use the model.
 *   The environment instead is copied to every child (`server-models.cpp:1419`, `child_env = base_env`): with the file in the environment
 *   the router AND each child answer 401 without the key, and the router's proxy still reaches them (same key). It also keeps the key out
 *   of the process list, where today's `--api-key` shows it.
 */
export const VARIABILE_FILE_CHIAVE = 'LLAMA_ARG_API_KEY_FILE';
/*
 * ⛔ J-R1 (block 9 review, 27/10/2026): the preset and the key file are passed by NAME, and the router runs in their folder.
 *   b11669 reads both paths as narrow strings in the ANSI code page: `--models-preset` reaches `load_from_ini(base_params.models_preset, …)`
 *   (`server-models.cpp:904-905`, clone f849095), where a UTF-8 `std::string` becomes a `std::filesystem::path` (`common/preset.cpp:170-177`
 *   `std::filesystem::exists(path)`) — read in the ANSI code page on Windows, while the rest of llama.cpp uses `std::filesystem::u8path`
 *   on purpose (`common/preset.cpp:388`); the key file is opened with `std::ifstream key_file(value)` on the `std::getenv` value
 *   (`common/arg.cpp:3547`, `:137`). With «Jörg» or «モデル» in the profile path the real router exited 1 at every start («preset file does
 *   not exist: …\JÃ¶rg\…», «failed to open file '…\???\…'»). Today's engine never had it: `-m` goes through the command line, which
 *   llama.cpp reads with `CommandLineToArgvW`.
 *   A relative name is resolved by Windows against the process's current folder, which Node passes to `CreateProcessW` in UTF-16; the
 *   children inherit both that folder and the environment (`subprocess.h` `CreateProcessW` with no folder of its own, `child_env =
 *   base_env`), so they find the same key. The names are ASCII by construction (`presets-<pid>.ini|key`) and checked at construction.
 *   The model paths stay absolute and UTF-8 INSIDE the preset: they reach the child through `CreateProcessW` after
 *   `MultiByteToWideChar(CP_UTF8, …)` (`vendor/sheredom/subprocess.h:1182-1279`), measured on b11669 with a non-ASCII model path.
 *
 * ⛔ G-R1 (block 10 review, 27/10/2026): the J-R1 cure put the router's CURRENT FOLDER in the data folder, and ggml loads every
 *   `ggml-<backend>-*.dll` it finds in the executable's folder AND in the current folder (`ggml/src/ggml-backend-reg.cpp:486-499`, «default
 *   search paths: executable directory, current directory»; `:508-520` calls `dl_load_library` on each match before reading its score,
 *   clone f849095): a file written there became native code in the router and in each child (`G-dll-cartella-router.mjs`). Now the router
 *   runs in the BINARY's folder — as today's engine does, and as Hermes does (`supervisor.py:207-208`, `cwd=str(exe.parent)`), so it reads
 *   no DLL that the standalone engine would not read — and the two files are named by an ASCII string, whichever exists first
 *   (`postoDelPreset`). Measured on b11669, cpu and vulkan, 27/10/2026, with the binary mirrored in «Jörg Müller\bin» and the data in
 *   «Jörg Müller\モデル»: the absolute non-ASCII path and the non-ASCII relative one exit 1 («preset file does not exist: …\JÃ¶rg MÃ¼ller\
 *   ãƒ¢ãƒ‡ãƒ«\…»); `talos-router\presets.ini` beside the binary and `..\AppData\Roaming\TALOS\…` load the model. The other two ways the
 *   review named do not exist here: 8.3 short names are OFF on this PC (`NtfsDisable8dot3NameCreation = 1`, and off by default on
 *   other volumes, Dev Drives, ReFS), and b11669 reads no variable that RESTRICTS the backend search — `GGML_BACKEND_PATH` loads one MORE
 *   backend (`ggml-backend-reg.cpp:593-597`), and the strings of the shipped `ggml.dll` name only it among the GGML_ variables of loading.
 */
const ASCII_STAMPABILE = /^[\x20-\x7e]+$/u;
/** Where the preset and the key go when the data folder has no ASCII name: a folder of their own beside the binary (not searched). */
export const CARTELLA_DI_RISERVA = 'talos-router';

/**
 * Where the router's two files live and how the router is told about them. The router's current folder is always the binary's.
 *   1. the data folder (`presetFile`), named by its absolute path if that is ASCII, else by its path from the binary's folder if THAT is
 *      ASCII (a non-ASCII user name with TALOS' own folders: `…\Local\Programs\TALOS\…\cpu` → `..\..\…\Roaming\TALOS\…`);
 *   2. else `talos-router\` beside the binary, by that relative name — always ASCII (the file names are checked at construction).
 * @returns {{ cartellaDelRouter: string, preset: string, chiave: string, argomentoPreset: string, argomentoChiave: string, riserva: string|null }}
 */
export function postoDelPreset({ presetFile, binaryPath }) {
  const cartellaDelRouter = dirname(resolve(binaryPath));
  const fileChiave = `${presetFile.replace(/\.ini$/u, '')}.key`;
  const comeAscii = (percorso) => {
    if (ASCII_STAMPABILE.test(percorso)) return percorso;
    const daQui = relative(cartellaDelRouter, percorso);
    return daQui && !isAbsolute(daQui) && ASCII_STAMPABILE.test(daQui) ? daQui : null;
  };
  const argomentoPreset = comeAscii(presetFile);
  const argomentoChiave = comeAscii(fileChiave);
  if (argomentoPreset && argomentoChiave) return { cartellaDelRouter, preset: presetFile, chiave: fileChiave, argomentoPreset, argomentoChiave, riserva: null };
  const riserva = join(cartellaDelRouter, CARTELLA_DI_RISERVA);
  return {
    cartellaDelRouter,
    preset: join(riserva, basename(presetFile)),
    chiave: join(riserva, basename(fileChiave)),
    argomentoPreset: join(CARTELLA_DI_RISERVA, basename(presetFile)),
    argomentoChiave: join(CARTELLA_DI_RISERVA, basename(fileChiave)),
    riserva,
  };
}

export function argomentiDelRouter({ preset, modelliMax, porta }) {
  return ['--models-preset', preset, '--models-max', String(modelliMax), '--models-autoload', '--metrics', '--jinja',
    '--host', LOOPBACK, '--port', String(porta)];
}

async function allocatePort() {
  const server = createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, LOOPBACK, resolve); });
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

/* Windows does not end a process tree with the parent (`TerminateProcess`): the router's children hold gigabytes of memory (Hermes
   `supervisor.py:303-335`). They also leave by themselves on EOF of their stdin (`server-models.cpp:2156-2175`), but the tree goes first.
   Same shape as `browser-vivo.mjs:448`. ⛔ J-R4: `taskkill` by its full path, never by name (`taskkill-di-sistema.mjs`). */
function uccidiAlberoDiSistema(child) {
  return new Promise((risolvi) => {
    const pid = child?.pid;
    if (process.platform === 'win32' && Number.isInteger(pid) && pid > 0) {
      execFile(percorsoTaskkill(process.env.SystemRoot), ['/PID', String(pid), '/T', '/F'], { windowsHide: true, timeout: 10_000, env: { SystemRoot: radiceDiSistema(process.env.SystemRoot) } }, () => {
        try { child.kill('SIGTERM'); } catch { /* already gone */ }
        risolvi(true);
      });
      return;
    }
    try { child?.kill?.('SIGTERM'); } catch { /* already gone */ }
    risolvi(true);
  });
}

/** A router-side load failure: the cases decision 2 sends to today's engine. */
function guastoDelRouter(motivo, codice = 'ROUTER_LOAD_FAILED') {
  const errore = new LlamaServerSupervisorError(motivo, codice);
  errore.guastoDelRouter = true;
  errore.motivo = motivo;
  return errore;
}

/**
 * @param {object} opzioni
 * @param {string} opzioni.binaryPath the same `llama-server` the standalone engine uses (the router is that binary with no `-m`)
 * @param {object} opzioni.standalone today's supervisor (`createLlamaServerSupervisor`): the choices per model and the fallback
 * @param {string} opzioni.presetFile where the preset INI lives
 * @param {() => Promise<Array<{modelId: string, modelPath: string, opzioni?: object}>>} [opzioni.modelliInstallati] every installed model,
 *   with the start options today's load would give it (one section each)
 * @param {() => Promise<number|null>} [opzioni.memoriaUtilizzabile] bytes the models may take together (decision 1), null if unknown
 */
export function createLlamaRouterSupervisor({
  binaryPath,
  standalone,
  presetFile,
  modelStore = null,
  modelliInstallati = async () => [],
  memoriaUtilizzabile = async () => null,
  leggiIntestazione = readGgufHeader,
  spawnImpl,
  fetchImpl = fetch,
  portAllocator = allocatePort,
  now = () => new Date(),
  healthTimeoutMs = DEFAULT_TIMEOUT_MS,
  pollIntervalMs = 100,
  attesaChiusuraMs = 5_000,
  dormiDopoSecondi = DORMI_DOPO_SECONDI,
  atteseDiRiavvioMs = ATTESE_DI_RIAVVIO_MS,
  vitaSanaMs = VITA_SANA_MS,
  attendi = (ms, signal) => wait(ms, undefined, signal ? { signal } : undefined),
  uccidiAlbero = uccidiAlberoDiSistema,
  /* «the reason in the log» (decision 2): the server's stderr, which the desktop app keeps in its log file. */
  registro = (testo) => { try { process.stderr.write(testo); } catch { /* no log, the event still goes out */ } },
} = {}) {
  if (typeof binaryPath !== 'string' || binaryPath.trim() === '') throw new LlamaServerSupervisorError('binaryPath is required', 'RUNTIME_MISCONFIGURED');
  if (!standalone || typeof standalone.sceltePerIlRouter !== 'function' || typeof standalone.start !== 'function') throw new LlamaServerSupervisorError('the standalone supervisor is required', 'RUNTIME_MISCONFIGURED');
  if (typeof presetFile !== 'string' || !isAbsolute(presetFile)) throw new LlamaServerSupervisorError('presetFile must be absolute', 'RUNTIME_MISCONFIGURED');
  const processPolicy = createProcessPolicy({ allowedExecutables: [binaryPath], spawnFn: spawnImpl,
    envAllowlist: [...DEFAULT_ENV_ALLOWLIST, ...Object.keys(AMBIENTE_OFFLINE), VARIABILE_FILE_CHIAVE] }); // today's + the key FILE's path: no key, token or secret
  /* the router's key, in a file beside the preset (see `argomentiDelRouter`) */
  const fileChiave = `${presetFile.replace(/\.ini$/u, '')}.key`;
  const nomePreset = basename(presetFile);
  const nomeChiave = basename(fileChiave);
  if (![nomePreset, nomeChiave].every((nome) => /^[A-Za-z0-9._-]+$/u.test(nome))) {
    throw new LlamaServerSupervisorError('the preset file name must be ASCII (the router reads it as an ANSI string)', 'RUNTIME_MISCONFIGURED');
  }
  /* G-R1: the router runs in the binary's folder; preset and key are named by an ASCII string (see `postoDelPreset`) */
  const posto = postoDelPreset({ presetFile, binaryPath });
  /** A file of the router that cannot be written where the router can read it is a router failure: today's engine (decision 2). */
  function scriviNelPosto(percorso, testo) {
    try {
      scriviPresetAtomico(percorso, testo);
    } catch (errore) {
      throw guastoDelRouter(`the router's preset cannot be written in ${dirname(percorso)} (${errore?.code ?? errore?.message ?? errore})`, 'ROUTER_PRESET_UNWRITABLE');
    }
  }

  const listeners = new Set();
  let router = null;            // { child, porta, baseUrl, chiave, closed, ultimeRighe, residuo, sse, codiceUscita }
  let chiudendo = false;
  let riavvii = 0;              // Hermes never resets it (`supervisor.py:270-274`)
  let riavvio = null;           // { controller, promessa }
  let avviiFalliti = 0;         // J-R3: router starts in a row that did not bring the engine back
  let ultimoMotivoAvvio = null;
  let fermo = null;             // J-R3: { tentativi, motivo } once the restarts stopped
  let modelliMax = null;
  const sezioni = new Map();    // modelId -> section
  let proprietario = 'router';  // 'router' | 'standalone': who holds the current model
  let current = null;           // { modelId, modelPath, state, windowTokens, locked, opzioni }
  let state = 'unavailable';
  let pendingStart = null;
  let stopPromise = null;
  let fermatoNonUscito = null;  // the model stop() unloaded and did not wait for (A-6); the next start waits (A-7)
  let caricamento = null;       // { modelId, fase, percentuale }
  const ripieghi = new Map();   // modelId -> { motivo, codice }: decision 2, remembered for this process

  function emit(evento) {
    for (const listener of listeners) {
      try { listener(evento); } catch { /* observer isolation */ }
    }
  }
  const emitLog = (stream, chunk) => emit({ stream, text: Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk) });
  /* the standalone engine's lines (the fallback, its choices) reach the same listeners */
  standalone.subscribeLogs?.((voce) => emit(voce));

  function cancelled() {
    return new LlamaServerSupervisorError('runtime start cancelled', 'RUNTIME_START_CANCELLED');
  }
  function checkStart(operation) {
    if (pendingStart !== operation || operation.controller.signal.aborted) throw cancelled();
  }
  function invalid(message) {
    return new LlamaServerSupervisorError(message, 'RUNTIME_INVALID');
  }

  async function unlock(voce) {
    if (!voce?.locked) return;
    voce.locked = false;
    await Promise.resolve().then(() => modelStore.unlock(voce.modelId)).catch(() => {});
  }

  function fotoRouter() {
    const vivo = Boolean(router && !router.closed);
    return {
      /* G-R4: a router that did not answer /health and could not be stopped is alive, but not «attivo»: the status says what is true */
      attivo: vivo && !router.muto,
      ...(vivo && router.muto ? { nonRisponde: true } : {}),
      modelliMax,
      caricamento: caricamento ? { ...caricamento } : null,
      ripieghi: [...ripieghi].map(([modelId, r]) => ({ modelId, motivo: r.motivo })),
      fermo: fermo ? { ...fermo } : null,
    };
  }

  function status() {
    if (proprietario === 'standalone') return { ...standalone.status(), router: fotoRouter() };
    const motore = standalone.status()?.motore ?? null;
    const base = { runtimeId: 'llama.cpp', ...(motore ? { motore } : {}) };
    if (!current) return { state, ...base, observedAt: now().toISOString(), router: fotoRouter() };
    return {
      state: current.state,
      ...base,
      ...(router ? { port: router.porta, baseUrl: router.baseUrl } : {}),
      modelId: current.modelId,
      ...(Number.isSafeInteger(current.windowTokens) ? { windowTokens: current.windowTokens } : {}),
      observedAt: now().toISOString(),
      router: fotoRouter(),
    };
  }

  /* ── HTTP to the router ─────────────────────────────────────────────────────────────────────────────── */

  async function chiedi(percorso, { method = 'GET', body, signal, timeoutMs = 10_000 } = {}) {
    const r = router;
    if (!r || r.closed) throw guastoDelRouter('the router is not running');
    const segnali = [AbortSignal.timeout(timeoutMs), ...(signal ? [signal] : [])];
    try {
      return await fetchImpl(`${r.baseUrl}${percorso}`, {
        method,
        headers: { Accept: 'application/json', Authorization: `Bearer ${r.chiave}`, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.any(segnali),
      });
    } catch (errore) {
      if (signal?.aborted) throw errore; // a stop: the caller's own check says «cancelled»
      /* a router that does not answer (gone, hung past the wait) is a router failure: decision 2 sends the model to today's engine */
      throw guastoDelRouter(`the router did not answer ${method} ${percorso.split('?')[0]} (${errore?.message ?? errore})`, 'ROUTER_UNREACHABLE');
    }
  }

  /** `{ value, failed, exitCode }` of one model in `GET /models`, or null when the router does not list it. */
  async function statoNelRouter(modelId, signal) {
    const risposta = await chiedi('/models', { signal });
    if (!risposta?.ok) throw guastoDelRouter(`the router did not answer GET /models (HTTP ${risposta?.status})`);
    const elenco = (await risposta.json())?.data;
    const voce = Array.isArray(elenco) ? elenco.find((m) => m?.id === modelId) : null;
    if (!voce) return null;
    return { value: String(voce.status?.value ?? 'unknown'), failed: voce.status?.failed === true, exitCode: voce.status?.exit_code ?? null };
  }

  async function finestraDelFiglio(modelId, signal) {
    try {
      const risposta = await chiedi(`/props?model=${encodeURIComponent(modelId)}&autoload=false`, { signal, timeoutMs: 3_000 });
      if (!risposta?.ok || typeof risposta.json !== 'function') return { pronto: false, finestra: null };
      const nCtx = (await risposta.json())?.default_generation_settings?.n_ctx;
      return { pronto: true, finestra: Number.isSafeInteger(nCtx) && nCtx > 0 ? nCtx : null };
    } catch {
      return { pronto: false, finestra: null };
    }
  }

  /* ── the router process ─────────────────────────────────────────────────────────────────────────────── */

  function attaccaRouter(entry) {
    const righe = (testo) => {
      entry.residuo = (entry.residuo ?? '') + testo;
      const parti = entry.residuo.split('\n');
      entry.residuo = parti.pop();
      for (const riga of parti) {
        if (riga.trim() === '') continue;
        entry.ultimeRighe.push(riga.trim());
        if (entry.ultimeRighe.length > 12) entry.ultimeRighe.shift();
      }
    };
    /* The children's own log reaches the router's STDOUT, each line prefixed with the child's port (measured on b11669, 27/10/2026:
       «[65281] … E llama_model_load: error loading model …»), while the router's stderr only says «instance … exited with status 1».
       The error lines of the child are the cause #29225 says the router does not give: they are kept to say it. */
    entry.righeUscita = [];
    entry.contaUscita = 0;
    entry.residuoUscita = '';
    entry.child.stdout?.on('data', (chunk) => {
      entry.residuoUscita += Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);
      const parti = entry.residuoUscita.split('\n');
      entry.residuoUscita = parti.pop();
      for (const riga of parti) {
        if (riga.trim() === '') continue;
        entry.righeUscita.push({ n: entry.contaUscita++, testo: riga.trim() });
        if (entry.righeUscita.length > 60) entry.righeUscita.shift();
      }
      emitLog('stdout', chunk);
    });
    entry.child.stderr?.on('data', (chunk) => { righe(Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk)); emitLog('stderr', chunk); });
    entry.child.once('error', (errore) => { entry.failure = errore; });
    entry.child.once('close', (codice) => {
      entry.closed = true;
      entry.codiceUscita = typeof codice === 'number' ? codice : null;
      entry.sse?.abort();
      if (router !== entry) return;
      caricamento = null;
      if (chiudendo || entry.fermatoApposta) return;
      suCaduta(entry);
    });
  }

  async function scriviTutteLeSezioni(operation, richiesta) {
    /* The requested model first (its options are the ones today's load gave it), then every other installed model with the options
       today's load would give it — each through the SAME standalone functions. A model whose choices cannot be made has no section. */
    let installati = [];
    try { installati = await modelliInstallati(); } catch { installati = []; }
    checkStart(operation);
    for (const voce of Array.isArray(installati) ? installati : []) {
      if (!voce?.modelId || voce.modelId === richiesta.modelId || sezioni.has(voce.modelId) || !voce.modelPath) continue;
      try {
        const scelte = await standalone.sceltePerIlRouter({ modelPath: voce.modelPath, ...(voce.opzioni ?? {}), signal: operation.controller.signal, check: () => checkStart(operation) });
        const sezione = sezioneDelModello({ modelId: voce.modelId, modelPath: voce.modelPath, argomenti: scelte.argomenti, dormiDopoSecondi });
        if (sezione) sezioni.set(voce.modelId, sezione);
      } catch (errore) {
        checkStart(operation);
        registro(`[talos] router preset: no section for ${voce.modelId} (${errore?.message ?? errore})\n`);
      }
    }
    scriviNelPosto(posto.preset, testoDelPreset(sezioni.values()));
  }

  async function calcolaModelliMax() {
    const impronte = [];
    for (const sezione of sezioni.values()) {
      let byteFile = 0;
      try { byteFile = statSync(sezione.modelPath).size; } catch { byteFile = 0; }
      let kvPerToken = null;
      try { kvPerToken = Number((await leggiIntestazione(sezione.modelPath))?.kvCacheBytesPerToken); } catch { kvPerToken = null; }
      const finestra = Number(sezione.chiavi.find(([k]) => k === 'ctx-size')?.[1]);
      const impronta = improntaDelModello({ byteFile, kvPerToken, finestra });
      if (impronta !== null) impronte.push(impronta);
    }
    let utilizzabile = null;
    try { utilizzabile = await memoriaUtilizzabile(); } catch { utilizzabile = null; }
    return modelliInsieme({ impronte, utilizzabile });
  }

  /**
   * J-R3: a router start that did not reach health (or a restart that did not bring the engine back) is counted; a cancel is not.
   * G-R3: once per router — its death and its failed reload may both be seen, in either order.
   */
  function contaAvvioFallito(operation, errore, entry = null) {
    if (operation?.controller.signal.aborted || chiudendo) return;
    if (entry?.contato) {
      /* counted already, at its death: the failed reload says better WHY (it is the one with an operation) */
      if (operation) ultimoMotivoAvvio = errore?.motivo ?? errore?.message ?? String(errore);
      return;
    }
    if (entry) entry.contato = true;
    avviiFalliti += 1;
    ultimoMotivoAvvio = errore?.motivo ?? errore?.message ?? String(errore);
  }
  function avvioRiuscito() {
    avviiFalliti = 0;
    ultimoMotivoAvvio = null;
    fermo = null;
  }

  /**
   * `azzera`: a router that answers /health clears the J-R3 count (a start the person asked for). A restart (`daRiavvio`) never clears it
   * here: G-R3, its router is a start that worked only once it has stayed up `vitaSanaMs` (see `suCaduta`).
   */
  async function avviaRouter(operation, verifica, { azzera = true, daRiavvio = false } = {}) {
    try {
      const entry = await avviaRouterUnaVolta(operation, verifica, { daRiavvio });
      if (azzera) avvioRiuscito();
      return entry;
    } catch (errore) {
      contaAvvioFallito(operation, errore);
      throw errore;
    }
  }

  /**
   * G-R4 (block 10 review, 27/10/2026): a router alive but silent on /health used to stay up — no model, a process and a port held, and
   * `router.attivo: true` (REV-B10-G7). Hermes has the same hole: `_watch` (`supervisor.py:258-285`) logs the failed `_wait_health` and
   * loops on `proc.poll() is None`. Here its tree is stopped, as the J-R2 unload does, and the exit is the proof; if it cannot be stopped
   * it stays marked `muto`, and the status says it does not answer.
   */
  async function fermaRouterMuto(entry) {
    entry.muto = true;
    if (!entry.closed) {
      entry.fermatoApposta = true;
      entry.sse?.abort();
      try { await uccidiAlbero(entry.child); } catch { /* the exit below decides */ }
      const scadenza = Date.now() + attesaChiusuraMs;
      while (!entry.closed && Date.now() < scadenza) await wait(Math.max(1, pollIntervalMs));
    }
    if (entry.closed && router === entry) { router = null; caricamento = null; }
    registro(entry.closed
      ? '[talos] the local engine router did not answer /health: its process tree was stopped\n'
      : '[talos] the local engine router does not answer /health and could not be stopped\n');
    return entry.closed;
  }

  async function avviaRouterUnaVolta(operation, verifica, { daRiavvio = false } = {}) {
    modelliMax = await calcolaModelliMax();
    verifica();
    const porta = await portAllocator();
    verifica();
    const chiave = randomBytes(32).toString('hex');
    const entry = { child: null, porta, baseUrl: `http://${LOOPBACK}:${porta}`, chiave, closed: false, ultimeRighe: [], residuo: '', sse: null, codiceUscita: null,
      daRiavvio, saneAlle: null };
    const argomenti = argomentiDelRouter({ preset: posto.argomentoPreset, modelliMax, porta });
    scriviNelPosto(posto.chiave, `${chiave}\n`); // a new key at every spawn, as today at every start
    emitLog('stderr', `[talos] router: up to ${modelliMax} model${modelliMax === 1 ? '' : 's'} loaded together, preset ${posto.preset}\n`);
    /* G-R1: the binary's folder as the current folder (never the data folder), the two files by an ASCII name (see `postoDelPreset`) */
    entry.child = processPolicy.spawn(binaryPath, argomenti, { cwd: posto.cartellaDelRouter, shell: false,
      windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...AMBIENTE_OFFLINE, [VARIABILE_FILE_CHIAVE]: posto.argomentoChiave } });
    if (!entry.child || typeof entry.child.once !== 'function') throw guastoDelRouter('spawn did not return a router process');
    router = entry;
    attaccaRouter(entry);
    /* Hermes `_wait_health` (`supervisor.py:243-256`): the router's own `/health`, until it answers, exits, or the wait ends. */
    const scadenza = Date.now() + attesaSaluteMs(0, healthTimeoutMs);
    while (Date.now() < scadenza) {
      verifica();
      if (entry.failure) throw guastoDelRouter(`the router failed to start: ${entry.failure.message}`);
      if (entry.closed) throw guastoDelRouter(`the router exited during its start${entry.ultimeRighe.length ? `: ${entry.ultimeRighe.slice(-4).join(' | ')}` : ''}`);
      try {
        const risposta = await fetchImpl(`${entry.baseUrl}/health`, { headers: { Accept: 'application/json' }, signal: AbortSignal.any([operation.controller.signal, AbortSignal.timeout(3_000)]) });
        verifica();
        if (risposta?.ok && !entry.closed) { entry.saneAlle = Date.now(); avviaSse(entry); return entry; }
      } catch { verifica(); }
      await wait(pollIntervalMs, undefined, { signal: operation.controller.signal });
    }
    const errore = guastoDelRouter(`the router did not answer /health within ${Math.round(attesaSaluteMs(0, healthTimeoutMs) / 1000)} s`);
    await fermaRouterMuto(entry); // G-R4: alive and silent is not left running
    throw errore;
  }

  /* ── progress from /models/sse (Hermes `load_progress.py:80-112`) ──────────────────────────────────────── */

  function applicaEvento({ model, event, data } = {}) {
    if (typeof model !== 'string' || !data || typeof data !== 'object') return;
    const stato = String(data.status ?? '');
    if ((event === 'status_change' || event === 'model_status') && stato === 'loading') {
      const progresso = data.progress && typeof data.progress === 'object' ? data.progress : {};
      const percentuale = percentualeDiCaricamento({ stages: progresso.stages, current: progresso.current, value: Number(progresso.value) });
      const fase = typeof progresso.current === 'string' && progresso.current ? progresso.current : (caricamento?.modelId === model ? caricamento.fase : 'starting');
      const nuovo = { modelId: model, fase, percentuale: percentuale ?? (caricamento?.modelId === model ? caricamento.percentuale : 0) };
      if (caricamento && caricamento.modelId === nuovo.modelId && caricamento.fase === nuovo.fase && caricamento.percentuale === nuovo.percentuale) return;
      caricamento = nuovo;
      emit({ stream: 'stderr', text: `[talos] loading ${model}: ${nuovo.fase} ${nuovo.percentuale}%\n`, caricamento: { ...nuovo } });
      return;
    }
    if ((event === 'status_change' || event === 'model_status' || event === 'model_remove') && stato !== 'loading' && caricamento?.modelId === model) {
      caricamento = null;
      emit({ stream: 'stderr', text: `[talos] loading ${model}: ${stato || 'ended'}\n`, caricamento: null });
    }
  }

  function avviaSse(entry) {
    const controllo = new AbortController();
    entry.sse = controllo;
    (async () => {
      while (!controllo.signal.aborted && !entry.closed && router === entry) {
        try {
          const risposta = await fetchImpl(`${entry.baseUrl}/models/sse`, { headers: { Accept: 'text/event-stream', Authorization: `Bearer ${entry.chiave}` }, signal: controllo.signal });
          if (risposta?.ok && risposta.body) {
            const leggi = creaLettoreSse(applicaEvento);
            const decodifica = new TextDecoder();
            for await (const pezzo of risposta.body) leggi(typeof pezzo === 'string' ? pezzo : decodifica.decode(pezzo, { stream: true }));
          }
        } catch { /* a dropped stream reconnects below */ }
        /* «Stream ended … loading entries from the dead connection are unverifiable — drop rather than freeze» (`load_progress.py:109-111`) */
        if (caricamento) { caricamento = null; emit({ stream: 'stderr', text: '[talos] load progress: stream ended\n', caricamento: null }); }
        try { await attendi(RICONNESSIONE_SSE_MS, controllo.signal); } catch { return; }
      }
    })();
  }

  /* ── restart after a crash (Hermes `_watch`, `supervisor.py:258-285`) ─────────────────────────────────────── */

  function suCaduta(entry) {
    router = null;
    const daRicaricare = proprietario === 'router' && current?.state === 'ready' ? current : null;
    /* as today: a process that dies after it was ready leaves the engine «failed» (`llama-server-supervisor.mjs` attachProcess) */
    if (daRicaricare) { daRicaricare.state = 'failed'; state = 'failed'; }
    const detto = entry.ultimeRighe.slice(-4).join(' | ');
    registro(`[talos] the local engine router exited (code ${entry.codiceUscita ?? '?'})${detto ? `: ${detto}` : ''}\n`);
    /* G-R3: a RESTARTED router that came up is judged by how long it stayed up. Up for `vitaSanaMs` (the last backoff step): the restart
       worked, the count starts again. Dead before that: a failed start, whether or not it had a model to load again. A router the
       person's own load started already cleared the count when it answered /health (J-R3), and is not counted here. */
    if (entry.daRiavvio && entry.saneAlle !== null) {
      const visse = Date.now() - entry.saneAlle;
      if (visse >= vitaSanaMs) avvioRiuscito();
      else contaAvvioFallito(null, { motivo: `the router exited ${visse} ms after it came up (code ${entry.codiceUscita ?? '?'})${detto ? `: ${detto}` : ''}` }, entry);
    }
    programmaRiavvio(daRicaricare);
  }

  function programmaRiavvio(daRicaricare) {
    if (chiudendo || riavvio) return;
    if (avviiFalliti >= AVVII_FALLITI_MASSIMI) {
      /* J-R3: stop here, say it once; the next load the person asks for tries the router again (`start`) */
      if (!fermo) {
        fermo = { tentativi: avviiFalliti, motivo: ultimoMotivoAvvio ?? 'unknown' };
        const testo = `[talos] the local engine router failed to start ${avviiFalliti} times in a row: no more restarts until the next load (last reason: ${fermo.motivo})\n`;
        registro(testo);
        emitLog('stderr', testo);
      }
      return;
    }
    const ritardo = atteseDiRiavvioMs[Math.min(riavvii, atteseDiRiavvioMs.length - 1)];
    const controller = new AbortController();
    emitLog('stderr', `[talos] router restart #${riavvii + 1} in ${Math.round(ritardo / 1000)} s\n`);
    const voce = { controller, promessa: null };
    riavvio = voce;
    voce.promessa = (async () => {
      try { await attendi(ritardo, controller.signal); } catch { return; }
      riavvii += 1;
      const operation = { controller };
      const verifica = () => { if (controller.signal.aborted || chiudendo) throw cancelled(); };
      let partito = null;
      try {
        if (chiudendo || pendingStart || (router && !router.closed)) return;
        partito = await avviaRouter(operation, verifica, { azzera: false, daRiavvio: true });
        if (daRicaricare && current === daRicaricare && proprietario === 'router') {
          const { finestra } = await caricaNelRouter(operation, verifica, daRicaricare.modelId, daRicaricare.modelPath, { forza: false });
          verifica();
          if (current === daRicaricare) {
            current.state = 'ready';
            if (Number.isSafeInteger(finestra)) current.windowTokens = finestra;
            state = 'ready';
            emitLog('stderr', `[talos] router restarted, ${daRicaricare.modelId} loaded again\n`);
          }
        }
        /* G-R3: the count is NOT cleared here — this router is a start that worked only once it has stayed up (see `suCaduta`) */
      } catch (errore) {
        if (controller.signal.aborted || chiudendo) return;
        if (partito) contaAvvioFallito(operation, errore, partito); // J-R3: up, but the model did not come back (avviaRouter counts its own failures)
        registro(`[talos] router restart failed: ${errore?.message ?? errore}\n`);
        /* a router that died during its start already asked for the next restart from its `close`; one that never spawned asks here */
        if (!router || router.closed) { if (riavvio === voce) riavvio = null; programmaRiavvio(daRicaricare); }
      } finally {
        if (riavvio === voce) riavvio = null;
      }
    })();
  }

  async function fermaRiavvio() {
    const voce = riavvio;
    if (!voce) return;
    voce.controller.abort();
    try { await voce.promessa; } catch { /* its outcome is not ours */ }
    if (riavvio === voce) riavvio = null;
  }

  /* ── loading one model ────────────────────────────────────────────────────────────────────────────────── */

  /**
   * Load `modelId` in the router and wait until it is ready: `/models` says it is resident AND `/props` of that child answers (the brief:
   * «Ready = health of that model»). The wait is today's, from the file size (`attesaSaluteMs`). Every way it can fail here is a router
   * failure (decision 2): a model the router does not list, a refused load, a child that exits, a router that exits, a child still
   * «loading» past the wait (#27351 — the stuck child is unloaded before giving up).
   */
  async function caricaNelRouter(operation, verifica, modelId, modelPath, { forza }) {
    let stato = await statoNelRouter(modelId, operation.controller.signal);
    verifica();
    if (!stato) throw guastoDelRouter('the router does not list this model: its preset section was not accepted', 'ROUTER_MODEL_MISSING');
    let caricaInviato = false;
    const inizio = router?.contaUscita ?? 0; // the child's lines from here on are this load's
    /** Why it failed: the child's own error lines (level `E`) of this load, else the router's last lines. */
    const perche = (r) => {
      const errori = (r?.righeUscita ?? []).filter((x) => x.n >= inizio && /\sE\s/u.test(x.testo)).slice(-3).map((x) => x.testo);
      const detto = (errori.length ? errori : (r?.ultimeRighe ?? []).slice(-4)).join(' | ');
      return detto ? `: ${detto}` : '';
    };
    if (forza || !IN_MOVIMENTO.has(stato.value)) {
      const risposta = await chiedi('/models/load', { method: 'POST', body: { model: modelId }, signal: operation.controller.signal, timeoutMs: 30_000 });
      verifica();
      if (!risposta?.ok) {
        let dettaglio = '';
        try { dettaglio = (await risposta.json())?.error?.message ?? ''; } catch { dettaglio = ''; }
        if (!/already running/iu.test(dettaglio)) throw guastoDelRouter(`the router refused the load (HTTP ${risposta?.status}${dettaglio ? `: ${dettaglio}` : ''})`);
      } else {
        caricaInviato = true;
      }
    }
    let byteModello = 0;
    try { byteModello = statSync(modelPath).size; } catch { byteModello = 0; }
    const attesa = attesaSaluteMs(byteModello, healthTimeoutMs);
    const scadenza = Date.now() + attesa;
    let vistoCaricare = caricaInviato;
    while (Date.now() < scadenza) {
      verifica();
      const r = router;
      if (!r || r.closed) throw guastoDelRouter(`the router exited during the load${perche(r)}`, 'ROUTER_EXITED');
      stato = await statoNelRouter(modelId, operation.controller.signal);
      verifica();
      if (!stato) throw guastoDelRouter('the router no longer lists this model', 'ROUTER_MODEL_MISSING');
      if (stato.value === 'loading') vistoCaricare = true;
      if (RESIDENTI.has(stato.value)) {
        const figlio = await finestraDelFiglio(modelId, operation.controller.signal);
        verifica();
        if (figlio.pronto) return { finestra: figlio.finestra };
      } else if (stato.value === 'unloaded' && (stato.failed || vistoCaricare)) {
        throw guastoDelRouter(`the router could not load the model (exit code ${stato.exitCode ?? '?'})${perche(r)}`);
      }
      await wait(pollIntervalMs, undefined, { signal: operation.controller.signal });
    }
    /* #27351: a child that stays «loading» forever. It is unloaded before today's engine takes the model, or it keeps its memory. */
    try { await chiedi('/models/unload', { method: 'POST', body: { model: modelId }, timeoutMs: 5_000 }); } catch { /* the router may be gone */ }
    throw guastoDelRouter(`still loading after ${Math.round(attesa / 1000)} s (${(byteModello / 1_000_000_000).toFixed(1)} GB model)${perche(router)}`, 'ROUTER_LOAD_STUCK');
  }

  /** The models the router lists as holding memory (or about to), or null when it does not say (no answer, an error, not a list). */
  async function residentiNelRouter(signal) {
    try {
      const risposta = await chiedi('/models', { signal });
      if (!risposta?.ok) return null;
      const elenco = (await risposta.json())?.data;
      return Array.isArray(elenco) ? elenco.filter((m) => IN_MOVIMENTO.has(String(m?.status?.value))).map((m) => m.id) : null;
    } catch {
      return null;
    }
  }

  /**
   * Everything the router holds leaves the memory: today's engine is about to take the model, alone (decision 2).
   * ⛔ J-R2 (block 9 review, 27/10/2026): this used to give up in silence — a `GET /models` that failed returned at once, and unloads that
   *   did not finish in time logged «going on» — and today's engine then loaded the SAME model beside the router's copy: twice the memory
   *   on one graphics card, freed only by the child's 15-minute sleep. Now the memory is free only when it is PROVEN free:
   *     - the router says nothing is loaded (or loading), or the unloads it was asked for are over; or
   *     - the router's whole tree is stopped and the router process has EXITED (its `close`; the children go with `taskkill /T` and, on
   *       EOF of their stdin, by themselves, `server-models.cpp:2156-2175`).
   *   If neither can be proven, the fallback does NOT load: the start fails with today's code and a sentence for the person.
   */
  async function scaricaTuttoNelRouter(operation, modelId) {
    const r = router;
    if (!r || r.closed) return;
    const segnale = operation.controller.signal;
    const accesi = await residentiNelRouter(segnale);
    if (segnale.aborted) return; // a stop: the caller's check says «cancelled», and nothing loads
    if (accesi && !accesi.length) return;
    if (accesi) {
      for (const id of accesi) {
        try { await chiedi('/models/unload', { method: 'POST', body: { model: id }, timeoutMs: 5_000 }); } catch { /* the check below decides */ }
      }
      const scadenza = Date.now() + attesaChiusuraMs;
      while (Date.now() < scadenza && !segnale.aborted && router === r && !r.closed) {
        const ancora = await residentiNelRouter(segnale);
        if (ancora && !ancora.some((id) => accesi.includes(id))) return;
        if (!ancora) break; // it stopped answering: not proven
        try { await wait(pollIntervalMs, undefined, { signal: segnale }); } catch { return; }
      }
      if (segnale.aborted) return;
      if (r.closed) return; // it exited by itself: nothing of it holds memory
    }
    /* not proven: the router's tree goes, and its exit is the proof (no restart: it was stopped on purpose) */
    r.fermatoApposta = true;
    r.sse?.abort();
    try { await uccidiAlbero(r.child); } catch { /* the exit below decides */ }
    const scadenza = Date.now() + attesaChiusuraMs;
    while (!r.closed && Date.now() < scadenza) await wait(Math.max(1, pollIntervalMs));
    if (r.closed) {
      if (router === r) { router = null; caricamento = null; }
      registro(`[talos] the router did not let go of its models: its process tree was stopped before today's engine loads ${modelId}\n`);
      return;
    }
    /* G-R6 (block 10 review, 27/10/2026): with `RUNTIME_PROCESS_FAILED` the chat showed the «not yet translated» card and «retry the
       turn» — the wrong remedy, a retry waits on the same stuck router. Its own code now, with the chat's own card (`errori.js`), and a
       sentence that says what the person can do: free the memory the router holds, then try again. */
    const testo = `The local engine router does not answer and could not be stopped, so ${modelId} was not loaded a second time beside it: it may still hold the model in the graphics card memory. Close TALOS, or end «llama-server» (or another program using the graphics card) in Task Manager, then try again.`;
    registro(`[talos] ${testo}\n`);
    const errore = new LlamaServerSupervisorError(testo, 'RUNTIME_ROUTER_NOT_STOPPED');
    errore.routerNonFermato = true;
    throw errore;
  }

  /** A-7 in router mode: the model stop() unloaded (A-6) has left before a new load starts; a stop during the wait does not wait (A-R4). */
  async function attendiScarico(operation) {
    const modelId = fermatoNonUscito;
    if (!modelId || !router || router.closed) { fermatoNonUscito = null; return; }
    const scadenza = Date.now() + attesaChiusuraMs;
    while (Date.now() < scadenza && !operation.controller.signal.aborted) {
      let stato = null;
      try { stato = await statoNelRouter(modelId, operation.controller.signal); } catch { break; }
      if (!stato || !IN_MOVIMENTO.has(stato.value)) { if (fermatoNonUscito === modelId) fermatoNonUscito = null; return; }
      try { await wait(pollIntervalMs, undefined, { signal: operation.controller.signal }); } catch { return; }
    }
    if (!operation.controller.signal.aborted) emitLog('stderr', `[talos] the stopped model has not left the router after ${attesaChiusuraMs} ms: going on\n`);
  }

  /* ── decision 2: today's engine for THIS model ───────────────────────────────────────────────────────────── */

  async function suStandalone(operation, opzioni, { motivo, codice, ricordato = false }) {
    const ripiego = { modelId: opzioni.modelId ?? null, motivo, codice };
    if (current && proprietario === 'router') { await unlock(current); current = null; }
    /* J-R2: the router's copy leaves the memory BEFORE anything says «loading it with today's engine» */
    try {
      await scaricaTuttoNelRouter(operation, opzioni.modelId);
    } catch (errore) {
      if (errore && typeof errore === 'object') errore.ripiegoRouter = ripiego;
      throw errore;
    }
    checkStart(operation);
    const testo = ricordato
      ? `[talos] ${opzioni.modelId} runs on today's engine: the router could not load it earlier (${motivo})\n`
      : `[talos] the router could not load ${opzioni.modelId}: ${motivo}. Loading it with today's engine, one model at a time.\n`;
    if (!ricordato) registro(testo);
    emit({ stream: 'stderr', text: testo, ripiegoRouter: { ...ripiego } });
    proprietario = 'standalone';
    try {
      const esito = await standalone.start({ modelId: opzioni.modelId, modelPath: opzioni.modelPath, port: opzioni.port, contextLength: opzioni.contextLength,
        finestraDiRiserva: opzioni.finestraDiRiserva, signal: operation.controller.signal });
      /* Only a model that DOES load standalone is remembered: if today's engine fails too, the router was not the reason (a growth
         that does not fit, a broken file) and the next load tries the router again. */
      if (opzioni.modelId && !ricordato) ripieghi.set(opzioni.modelId, { motivo, codice });
      return { ...esito, router: fotoRouter(), ripiegoRouter: ripiego };
    } catch (errore) {
      if (errore && typeof errore === 'object') errore.ripiegoRouter = ripiego;
      throw errore;
    }
  }

  /* ── start / stop ─────────────────────────────────────────────────────────────────────────────────────── */

  async function start({ modelId, modelPath, port, contextLength, finestraDiRiserva, signal } = {}) {
    if (pendingStart || stopPromise) throw new LlamaServerSupervisorError('runtime is already active', 'RUNTIME_ALREADY_RUNNING');
    if (proprietario === 'standalone' && ['loading', 'ready', 'stopping'].includes(standalone.status()?.state)) {
      throw new LlamaServerSupervisorError('runtime is already active', 'RUNTIME_ALREADY_RUNNING'); // today's engine: one model at a time
    }
    /* Router mode keeps today's contract for the SAME model (already active ⇒ refused) and for a model still loading or stopping. A
       DIFFERENT model while one is ready is the router's switch: the old one stays loaded if the memory holds both (decision 1). */
    if (current && (['loading', 'stopping'].includes(current.state) || (current.state === 'ready' && current.modelId === modelId))) {
      throw new LlamaServerSupervisorError('runtime is already active', 'RUNTIME_ALREADY_RUNNING');
    }
    if (typeof modelPath !== 'string' || !isAbsolute(modelPath)) throw invalid('modelPath must be absolute');
    if (signal?.aborted) throw cancelled();
    let complete;
    const operation = { controller: new AbortController(), modelId, done: new Promise((resolve) => { complete = resolve; }) };
    const onAbort = () => operation.controller.abort(cancelled());
    signal?.addEventListener('abort', onAbort, { once: true });
    pendingStart = operation;
    state = 'loading';
    const verifica = () => checkStart(operation);
    const opzioni = { modelId, modelPath, port, contextLength, finestraDiRiserva };
    let voce = null;
    try {
      await fermaRiavvio(); // the person asks for the engine now: the restart in waiting is this start
      if (proprietario === 'standalone') {
        /* A-7 across engines: today's engine stopped without waiting (A-6); the router does not load beside its process */
        await standalone.attendiUscita?.({ signal: operation.controller.signal });
      }
      await attendiScarico(operation);
      verifica();
      if (!nomeDiSezioneValido(modelId)) return await suStandalone(operation, opzioni, { motivo: 'the model id cannot name a preset section', codice: 'ROUTER_SECTION_INVALID' });
      if (ripieghi.has(modelId)) return await suStandalone(operation, opzioni, { ...ripieghi.get(modelId), ricordato: true });
      /* ⭐ 27/09: the architecture check before the start, as today. Only a measured «no» sends the model to today's engine, which says
         it with today's card (`RUNTIME_ARCH_UNSUPPORTED`): the router would only say «failed». */
      if (libreriaDelMotorePresente(binaryPath)) {
        const architettura = await leggiArchitetturaGguf(modelPath);
        verifica();
        if (motoreConosceArchitettura(binaryPath, architettura) === false) {
          proprietario = 'standalone';
          return await standalone.start({ ...opzioni, signal: operation.controller.signal });
        }
      }
      if (current && proprietario === 'router') { await unlock(current); current = null; } // the switch: the old model stays in the router
      proprietario = 'router';
      voce = { modelId, modelPath, state: 'loading', windowTokens: null, locked: false, opzioni };
      if (modelStore && modelId) {
        await modelStore.lock(modelId);
        voce.locked = true;
      }
      current = voce;
      verifica();
      const scelte = await standalone.sceltePerIlRouter({ modelPath, contextLength, finestraDiRiserva, signal: operation.controller.signal, check: verifica });
      verifica();
      for (const riga of scelte.righe) emitLog('stderr', riga);
      const sezione = sezioneDelModello({ modelId, modelPath, argomenti: scelte.argomenti, dormiDopoSecondi });
      if (!sezione) return await suStandalone(operation, opzioni, { motivo: 'the model path cannot be written in the preset file (it holds # or ;)', codice: 'ROUTER_SECTION_INVALID' });
      try {
        const cambiata = sezioni.get(modelId)?.testo !== sezione.testo;
        sezioni.set(modelId, sezione);
        if (!router || router.closed) {
          await scriviTutteLeSezioni(operation, opzioni);
          verifica();
          await avviaRouter(operation, verifica);
        } else if (cambiata) {
          /* The window grows, or the choices changed: the section is rewritten and the router reads it again. `?reload=1` unloads only
             the models whose section changed (`server-models.cpp:1086-1118`): the others stay where they are. */
          scriviNelPosto(posto.preset, testoDelPreset(sezioni.values()));
          const risposta = await chiedi('/models?reload=1', { signal: operation.controller.signal, timeoutMs: 60_000 });
          verifica();
          if (!risposta?.ok) throw guastoDelRouter(`the router did not read the preset again (HTTP ${risposta?.status})`);
        }
        verifica();
        const { finestra } = await caricaNelRouter(operation, verifica, modelId, modelPath, { forza: false });
        verifica();
        voce.windowTokens = finestra;
        if (caricamento?.modelId === modelId) caricamento = null; // ready: whatever the stream still says, the load is over
        if (Number.isSafeInteger(finestra)) standalone.ricordaFinestra?.(modelId, finestra); // T3, D3: the same file as today
        voce.state = 'ready';
        state = 'ready';
        return status();
      } catch (errore) {
        verifica(); // a stop is never a reason to start today's engine (as R-03 never starts a CPU fallback after a stop)
        if (errore?.guastoDelRouter !== true) throw errore;
        return await suStandalone(operation, opzioni, { motivo: errore.motivo ?? errore.message, codice: errore.code });
      }
    } catch (error) {
      if (voce) { await unlock(voce); if (current === voce) current = null; }
      state = operation.controller.signal.aborted ? 'unavailable' : 'failed';
      if (operation.controller.signal.aborted) throw cancelled();
      throw error instanceof LlamaServerSupervisorError ? error : new LlamaServerSupervisorError(error?.message ?? 'runtime failed', 'RUNTIME_PROCESS_FAILED');
    } finally {
      signal?.removeEventListener('abort', onAbort);
      if (pendingStart === operation) pendingStart = null;
      complete();
    }
  }

  /**
   * Router mode stop: the current model leaves the memory (`POST /models/unload`, as the «free the memory» button expects), the router
   * stays up. Like today (A-6) it does not wait for the child to leave: the next start does (A-7).
   */
  function stop() {
    if (stopPromise) return stopPromise;
    const operation = pendingStart;
    const voce = current;
    operation?.controller.abort(cancelled());
    if (voce) voce.state = 'stopping';
    state = 'stopping';
    stopPromise = Promise.resolve().then(async () => {
      if (operation) {
        await operation.done; // the start owner releases its lock exactly once
      } else if (proprietario === 'standalone') {
        await standalone.stop();
      } else if (voce) {
        if (router && !router.closed) {
          try { await chiedi('/models/unload', { method: 'POST', body: { model: voce.modelId }, timeoutMs: 3_000 }); } catch { /* the router may be gone */ }
          fermatoNonUscito = voce.modelId;
        }
        if (current === voce) current = null;
        await unlock(voce);
      }
      state = 'unavailable';
      return status();
    }).finally(() => { stopPromise = null; });
    return stopPromise;
  }

  /** App shutdown: the model, today's engine, then the router and its children (the tree, not only the parent). */
  async function chiudi() {
    chiudendo = true;
    await fermaRiavvio();
    try { await stop(); } catch { /* going down anyway */ }
    try { await standalone.stop(); } catch { /* idem */ }
    const r = router;
    router = null;
    if (r && !r.closed) {
      r.fermatoApposta = true;
      r.sse?.abort();
      await uccidiAlbero(r.child);
    }
    try { rmSync(posto.preset, { force: true }); } catch { /* a leftover preset is harmless */ }
    try { rmSync(posto.chiave, { force: true }); } catch { /* the key of a dead router opens nothing */ }
    /* G-R1: the reserve folder beside the binary goes too, when nothing else is in it (another TALOS process may be using it) */
    if (posto.riserva) { try { rmdirSync(posto.riserva); } catch { /* not empty, or already gone */ } }
    state = 'unavailable';
  }

  /* ── requests for the current model ───────────────────────────────────────────────────────────────────── */

  async function health({ signal } = {}) {
    if (proprietario === 'standalone') return standalone.health({ signal });
    if (!current || !router || router.closed) return { ok: false, status: 0, code: 'RUNTIME_UNREACHABLE' };
    try {
      const risposta = await fetchImpl(`${router.baseUrl}/props?model=${encodeURIComponent(current.modelId)}&autoload=false`, {
        headers: { Accept: 'application/json', Authorization: `Bearer ${router.chiave}` }, ...(signal ? { signal } : {}) });
      return { ok: risposta.ok, status: risposta.status };
    } catch {
      return { ok: false, status: 0, code: 'RUNTIME_UNREACHABLE' };
    }
  }

  /**
   * Today a single server answered everything for the one loaded model. In router mode every request is sent to THAT model: status reads
   * get `model=…&autoload=false` (Hermes `endpoint.py:20-29`: a read never loads a model back), JSON bodies get `model` set to it, and the
   * model list shows it alone. `status()` stays true: the router never loads a model behind TALOS' back.
   */
  async function request(path, options = {}) {
    if (typeof path !== 'string' || !path.startsWith('/') || path.includes('://')) throw invalid('runtime request path must be relative');
    if (proprietario === 'standalone') return standalone.request(path, options);
    if (!current || current.state !== 'ready' || !router || router.closed) throw new LlamaServerSupervisorError('runtime is not ready', 'RUNTIME_NOT_READY');
    const modelId = current.modelId;
    const headers = new Headers(options.headers ?? {});
    if (!headers.has('Accept')) headers.set('Accept', 'application/json');
    headers.set('Authorization', `Bearer ${router.chiave}`);
    const metodo = String(options.method ?? 'GET').toUpperCase();
    const [soloPercorso] = path.split('?');
    if ((soloPercorso === '/v1/models' || soloPercorso === '/models') && metodo === 'GET') {
      const risposta = await fetchImpl(`${router.baseUrl}${path}`, { ...options, headers });
      if (!risposta.ok) return risposta;
      const corpo = await risposta.json();
      const data = Array.isArray(corpo?.data) ? corpo.data.filter((m) => m?.id === modelId) : [];
      return new Response(JSON.stringify({ ...corpo, data }), { status: risposta.status, headers: { 'Content-Type': 'application/json' } });
    }
    let percorso = path;
    let body = options.body;
    if (metodo === 'GET' || metodo === 'HEAD') {
      if (!/[?&]model=/u.test(path)) percorso = `${path}${path.includes('?') ? '&' : '?'}model=${encodeURIComponent(modelId)}&autoload=false`;
    } else if (typeof body === 'string') {
      try {
        const json = JSON.parse(body);
        if (json && typeof json === 'object' && !Array.isArray(json)) body = JSON.stringify({ ...json, model: modelId });
      } catch { /* not JSON: sent as it is */ }
    }
    return fetchImpl(`${router.baseUrl}${percorso}`, { ...options, headers, ...(body !== undefined ? { body } : {}) });
  }

  function subscribeLogs(listener) {
    if (typeof listener !== 'function') throw invalid('log listener must be a function');
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  const finestraNota = (modelId) => standalone.finestraNota?.(modelId);

  return Object.freeze({ start, health, request, stop, status, subscribeLogs, finestraNota, chiudi });
}
