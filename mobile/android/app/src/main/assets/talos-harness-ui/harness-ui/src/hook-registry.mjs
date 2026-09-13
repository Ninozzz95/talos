/**
 * hook-registry.mjs — FASE A del piano `elegant-spinning-dongarra.md`
 * ("Harness Desktop al 100%"), owner 28/8. Ricerca fatta prima di
 * scrivere: Hermes ha hook "universali e attivi di default" su ogni
 * tool (https://hermes-agent.nousresearch.com/docs/user-guide/features/hooks);
 * Codex CLI (installato qui, v0.149.1) ha un sistema di *trust*
 * persistito — un hook nuovo o modificato non gira finché non è
 * esplicitamente fidato (`--dangerously-bypass-hook-trust` esiste solo
 * per bypassarlo). Questo file implementa entrambi i pattern, adattati.
 *
 * ⛔⛔ Due cartelle DIVERSE, per un motivo preciso:
 * - `hooks.json` vive DENTRO il workspace del progetto (`cartella`
 *   della sessione) — un hook è dichiarato "per-progetto", come
 *   AGENTS.md o un file di config di build: chi clona il progetto
 *   vede quali hook esistono.
 * - il registro di TRUST vive FUORI, accanto a `server.mjs` (stesso
 *   pattern già in uso per `.automations/`, verificato in
 *   `automation-store.mjs`/`server.mjs`: `cartella:
 *   fileURLToPath(new URL('.automations/', import.meta.url))`) — il
 *   trust è una decisione dell'OWNER su questa macchina, mai qualcosa
 *   che un progetto clonato può auto-concedersi scrivendo un file.
 *
 * ⛔ Correzione di una nota nel piano madre: quella sezione ipotizzava
 * un trust "accanto a .sessions/" — verificato oggi che `.sessions/`
 * non esiste ancora (le sessioni vivono solo in memoria, dichiarato
 * in `automation-store.mjs`: "diverso da session-registry.mjs
 * apposta"). Il trust usa lo stesso pattern REALE di `.automations/`.
 *
 * ⭐ 29/8 — copia PORTATA verbatim dal canonico
 * (AVM-harness-desktop/harness-ui/src/hook-registry.mjs) nella copia
 * standalone imbarcata nell'APK: LEDGER-MOBILE-PAREGGIO-DESKTOP-CODICE.md
 * §13. Solo LISTA+FIDA portati qui (session-registry.mjs), non il
 * gate pre_tool_call/post_tool_call dentro il loop dell'agente
 * (costruisciHookFn/avviaESegui) — quello tocca agent-service.mjs, che
 * su questa copia è ancora molto più piccolo del canonico (224 vs 499
 * righe): dichiarato aperto, non nascosto, vedi il ledger.
 */
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { promises as fsp } from 'node:fs';
import { join } from 'node:path';

export class HookRegistryError extends Error {
  constructor(message, code = 'HOOK_INVALID') {
    super(message);
    this.name = 'HookRegistryError';
    this.code = code;
  }
}

const NOME_FILE_HOOKS = '.harness-ui-hooks.json';

/**
 * Legge `<cartella>/.harness-ui-hooks.json`. Un progetto senza hook è
 * uno stato valido — mai un errore, torna `{ hooks: [] }`. Uno schema
 * malformato invece È un errore dichiarato (`HookRegistryError`, mai
 * un hook fantasma silenziosamente ignorato): un file che l'owner ha
 * scritto a mano e sbagliato deve saperlo, non vedere l'hook
 * semplicemente non funzionare.
 */
export async function caricaHooks({ cartella }, deps = {}) {
  const readFileFn = deps.readFileFn ?? fsp.readFile;
  const percorso = join(cartella, NOME_FILE_HOOKS);
  let testo;
  try {
    testo = await readFileFn(percorso, 'utf8');
  } catch (errore) {
    if (errore?.code === 'ENOENT') return { hooks: [] };
    throw new HookRegistryError(`Impossibile leggere ${NOME_FILE_HOOKS}: ${errore.message}`, 'HOOK_READ_FAILED');
  }
  let dati;
  try {
    dati = JSON.parse(testo);
  } catch {
    throw new HookRegistryError(`${NOME_FILE_HOOKS} non è un JSON valido`, 'HOOK_MALFORMED');
  }
  if (!dati || !Array.isArray(dati.hooks)) {
    throw new HookRegistryError(`${NOME_FILE_HOOKS} deve avere un campo "hooks" (array)`, 'HOOK_MALFORMED');
  }
  const EVENTI_VALIDI = new Set(['pre_tool_call', 'post_tool_call', 'session_start', 'session_end']);
  const hooks = dati.hooks.map((voce, indice) => {
    if (typeof voce?.id !== 'string' || voce.id.length === 0) {
      throw new HookRegistryError(`hooks[${indice}] manca di "id" (stringa non vuota)`, 'HOOK_MALFORMED');
    }
    if (!Array.isArray(voce.eventi) || voce.eventi.length === 0 || !voce.eventi.every((e) => EVENTI_VALIDI.has(e))) {
      throw new HookRegistryError(`hooks[${indice}] ("${voce.id}") ha "eventi" non valido — atteso un array non vuoto fra ${[...EVENTI_VALIDI].join('/')}`, 'HOOK_MALFORMED');
    }
    if (typeof voce.comando !== 'string' || voce.comando.length === 0) {
      throw new HookRegistryError(`hooks[${indice}] ("${voce.id}") manca di "comando" (stringa non vuota)`, 'HOOK_MALFORMED');
    }
    const hash = createHash('sha256').update(voce.comando).digest('hex');
    return { id: voce.id, eventi: voce.eventi, comando: voce.comando, hash };
  });
  return { hooks };
}

function percorsoTrust(cartellaTrust, hookId) {
  // ⛔ hookId arriva da un file scritto dall'owner (hooks.json), ma è
  // comunque un input esterno: mai costruire un percorso da una
  // stringa non validata come nome file — stesso principio già in uso
  // in workspace-files.mjs per un "nome, non un percorso".
  if (typeof hookId !== 'string' || hookId.length === 0 || /[\\/]|\.\./.test(hookId)) {
    throw new HookRegistryError('hookId non valido — un nome, non un percorso', 'HOOK_ID_INVALID');
  }
  return join(cartellaTrust, `${hookId}.json`);
}

/**
 * Un hook è fidato SOLO se il registro persistito porta lo STESSO hash
 * del comando attuale — un hook il cui contenuto è cambiato (hash
 * diverso) torna automaticamente "non fidato", senza bisogno di
 * un'azione esplicita di sfiducia: il trust è legato al CONTENUTO, non
 * al nome.
 */
export async function verificaTrust({ cartellaTrust, hookId, hash }, deps = {}) {
  const readFileFn = deps.readFileFn ?? fsp.readFile;
  let testo;
  try {
    testo = await readFileFn(percorsoTrust(cartellaTrust, hookId), 'utf8');
  } catch {
    return false; // mai fidato per default: assente = non fidato, non un errore
  }
  try {
    const dati = JSON.parse(testo);
    return dati?.hash === hash;
  } catch {
    return false;
  }
}

/**
 * Registra il trust — chiamata SOLO da un'azione owner esplicita (la
 * rotta HTTP dedicata, mai automatica dal ciclo dell'agente).
 */
export async function fidaHook({ cartellaTrust, hookId, hash }, deps = {}) {
  const mkdirFn = deps.mkdirFn ?? fsp.mkdir;
  const writeFileFn = deps.writeFileFn ?? fsp.writeFile;
  await mkdirFn(cartellaTrust, { recursive: true });
  await writeFileFn(percorsoTrust(cartellaTrust, hookId), JSON.stringify({ hash, fidatoIl: new Date().toISOString() }), 'utf8');
  return { fidato: true };
}

/**
 * Esegue un hook come sottoprocesso shell — stesso pattern di
 * `eseguiComandoSandboxato`/`eseguiProva` in talosHarness.mjs (spawn,
 * cwd della sessione, windowsHide, timeout), qui duplicato
 * deliberatamente invece di importato: `hook-registry.mjs` vive nel
 * backend (`harness-ui/`), `talosHarness.mjs` nel kernel benchmarkato
 * (`AVM-harness/`) — repository diversi, la doc di `talosHarness.mjs`
 * vieta esplicitamente una copia del KERNEL stesso ("divergerebbe in
 * silenzio"), ma questa è solo una utility di spawn, non il kernel.
 *
 * Contratto d'uscita, dichiarato non presunto: se stdout è un JSON
 * valido `{consentito, motivo?}`, quello è l'esito. Altrimenti
 * `exit 0` → consentito, qualunque altro codice → rifiutato (stesso
 * principio "un contratto d'uscita chiaro" già usato per
 * `rivelaInEsploraFile`/explorer.exe).
 */
export async function eseguiHook({ hook, evento, cartella }, deps = {}) {
  const spawnFn = deps.spawnFn ?? spawn;
  const TIMEOUT_MS = 10_000; // un hook è un controllo rapido, non un giro di test — 10s, non 120s come eseguiProva
  return new Promise((risolvi) => {
    const p = spawnFn(hook.comando, {
      cwd: cartella,
      // ⛔ 29/8 — misurato dal vivo su device (LEDGER-MOBILE-PAREGGIO-DESKTOP-CODICE.md
      // §18): con `shell:true` nudo, il Node imbarcato su Android risolve
      // '/data/data/com.termux/files/usr/bin/sh' — non presente su questo device
      // (ENOENT), ogni hook falliva nell'ESECUZIONE (non nella decisione) e il
      // fail-closed di costruisciHookFn bloccava ogni tool a valle. '/bin/sh'
      // esiste ed è eseguibile (verificato `ls -la //bin/sh`), fissato solo fuori
      // da win32 per non rompere i test locali su questa macchina di sviluppo.
      shell: process.platform === 'win32' ? true : '/bin/sh',
      windowsHide: true,
      env: { ...process.env, TALOS_HOOK_EVENT: JSON.stringify(evento) },
    });
    let fuori = '';
    let errori = '';
    p.stdout?.on('data', (d) => { fuori += d; });
    p.stderr?.on('data', (d) => { errori += d; });
    const timer = setTimeout(() => p.kill(), TIMEOUT_MS);
    p.on('close', (codice) => {
      clearTimeout(timer);
      const testoFuori = fuori.trim();
      try {
        const dati = JSON.parse(testoFuori);
        if (typeof dati?.consentito === 'boolean') {
          risolvi({ consentito: dati.consentito, motivo: typeof dati.motivo === 'string' ? dati.motivo : undefined });
          return;
        }
      } catch { /* non è JSON: si ricade sul codice di uscita */ }
      risolvi({ consentito: codice === 0, motivo: codice === 0 ? undefined : (errori.trim() || testoFuori || `hook exited ${codice}`) });
    });
    p.on('error', (e) => {
      clearTimeout(timer);
      risolvi({ consentito: false, motivo: String(e.message) });
    });
  });
}
