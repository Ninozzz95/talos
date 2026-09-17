/**
 * hook-registry.mjs — FASE A del piano `elegant-spinning-dongarra.md`
 * ("Harness Desktop al 100%"), owner 28/8. Ricerca fatta prima di
 * scrivere: lo stato dell'arte offre due pattern diversi — hook
 * "universali e attivi di default" su ogni tool, oppure un sistema di
 * *trust* persistito, dove un hook nuovo o modificato non gira finché non
 * è esplicitamente fidato (un flag esplicito esiste solo per bypassarlo).
 * Questo file implementa entrambi i pattern, adattati.
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
 */
import { createHash } from 'node:crypto';
import { promises as fsp } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { createProcessPolicy, parseProcessCommand } from './process-policy.mjs';

export class HookRegistryError extends Error {
  constructor(message, code = 'HOOK_INVALID') {
    super(message);
    this.name = 'HookRegistryError';
    this.code = code;
  }
}

const NOME_FILE_HOOKS = '.harness-ui-hooks.json';
/**
 * ⭐ 29/8 — esportata (era locale a caricaHooks) perché FASE G
 * (plugin-registry.mjs) valida gli hook dichiarati DENTRO un
 * plugin.json con la STESSA regola — un import qui, non una seconda
 * lista che potrebbe divergere in silenzio se un evento nuovo si
 * aggiunge un domani.
 */
export const EVENTI_VALIDI = new Set(['pre_tool_call', 'post_tool_call', 'session_start', 'session_end']);

/**
 * Legge `<cartella>/.harness-ui-hooks.json`. Un progetto senza hook è
 * uno stato valido — mai un errore, torna `{ hooks: [] }`. Uno schema
 * malformato invece È un errore dichiarato (`HookRegistryError`, mai
 * un hook fantasma silenziosamente ignorato): un file che l'owner ha
 * scritto a mano e sbagliato deve saperlo, non vedere l'hook
 * semplicemente non funzionare.
 */
/*
 * ⛔⛔⛔ 17/09/2026 — L'IMPRONTA DI UN HOOK COPRE ANCHE I FILE CHE IL SUO COMANDO NOMINA.
 *
 * Misurato prima di scrivere (sonda con le funzioni vere di questo file): un hook
 * `node guardia.mjs`, approvato, restava APPROVATO dopo che `guardia.mjs` era stato riscritto —
 * stessa impronta `b76e9d114849` prima e dopo — e `eseguiHook` faceva girare la versione
 * sostituita. L'impronta era lo sha256 della sola STRINGA del comando: la fiducia era legata al
 * nome del file, non al suo contenuto. `guardia.mjs` è un file qualunque del workspace, che
 * l'agente può scrivere: bastava riscriverlo per far girare codice proprio alla chiamata dopo.
 * È la stessa classe di CVE-2026-25725 (codice in sandbox che si inietta negli hook) e del worm
 * CHAINDROP dell'agosto 2026 — letti il 17/09/2026 (karanb192/claude-code-hooks, thepromptshelf.dev
 * «Claude Code Hooks: Complete Reference 2026»).
 *
 * ⇒ Nell'impronta entrano, oltre al comando, nome relativo e sha256 di OGNI argomento che cade su
 *   un file regolare dentro la cartella del progetto. Un comando che non nomina file (`echo …`,
 *   `node -e "…"`, dove il codice È la stringa) conserva l'impronta di prima, byte per byte: chi
 *   l'aveva approvato non deve riapprovarlo. Chi aveva approvato un `node file.mjs` sì, una volta.
 * ⇒ E si RICONTROLLA ALL'USO (`eseguiHook`): la sessione fotografa gli hook all'avvio, e una foto
 *   senza ricontrollo eseguirebbe per ore un file sostituito a sessione viva.
 * ⛔ Un collegamento non si segue e non si salta: si rifiuta (stessa regola dei pacchetti plugin).
 * ⛔ DOVE NON ARRIVA, detto: copre i file NOMINATI nel comando, non ciò che quei file importano a
 *   loro volta. Una guardia che fa `import './aiuto.mjs'` resta scoperta su `aiuto.mjs`.
 */
export const MAX_BYTE_FILE_HOOK = 8 * 1024 * 1024;

export async function improntaHook({ comando, cartella }, deps = {}) {
  const lstatFn = deps.lstatFn ?? fsp.lstat;
  const leggiFn = deps.leggiFileHookFn ?? ((percorso) => fsp.readFile(percorso));
  const base = createHash('sha256').update(comando).digest('hex');
  if (typeof cartella !== 'string' || cartella.length === 0) return base;
  let pezzi;
  try { pezzi = parseProcessCommand(comando); } catch { return base; } // un comando che non si analizza non gira comunque
  const radice = resolve(cartella);
  const file = [];
  for (const pezzo of pezzi) {
    if (typeof pezzo !== 'string' || pezzo.length === 0 || pezzo.startsWith('-')) continue;
    const assoluto = resolve(radice, pezzo);
    const relativo = relative(radice, assoluto);
    if (relativo === '' || relativo.startsWith('..') || isAbsolute(relativo)) continue; // fuori dal progetto: non è un file di questo hook
    let stato;
    try { stato = await lstatFn(assoluto); } catch { continue; } // non è un file: è un argomento qualunque
    if (stato.isSymbolicLink()) throw new HookRegistryError(`il comando nomina un collegamento ("${pezzo}"): un hook deve nominare file veri`, 'HOOK_FILE_LINK');
    if (!stato.isFile()) continue;
    if (stato.size > MAX_BYTE_FILE_HOOK) throw new HookRegistryError(`il file "${pezzo}" è troppo grande per entrare nell'impronta dell'hook`, 'HOOK_FILE_TOO_LARGE');
    const contenuto = await leggiFn(assoluto);
    file.push(`${relativo.split('\\').join('/')}\0${createHash('sha256').update(contenuto).digest('hex')}`);
  }
  if (file.length === 0) return base;
  return createHash('sha256').update(`${comando}\0file\0${file.sort().join('\0')}`).digest('hex');
}

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
  const hooks = await Promise.all(dati.hooks.map(async (voce, indice) => {
    if (typeof voce?.id !== 'string' || voce.id.length === 0) {
      throw new HookRegistryError(`hooks[${indice}] manca di "id" (stringa non vuota)`, 'HOOK_MALFORMED');
    }
    if (!Array.isArray(voce.eventi) || voce.eventi.length === 0 || !voce.eventi.every((e) => EVENTI_VALIDI.has(e))) {
      throw new HookRegistryError(`hooks[${indice}] ("${voce.id}") ha "eventi" non valido — atteso un array non vuoto fra ${[...EVENTI_VALIDI].join('/')}`, 'HOOK_MALFORMED');
    }
    if (typeof voce.comando !== 'string' || voce.comando.length === 0) {
      throw new HookRegistryError(`hooks[${indice}] ("${voce.id}") manca di "comando" (stringa non vuota)`, 'HOOK_MALFORMED');
    }
    const hash = await improntaHook({ comando: voce.comando, cartella }, deps);
    return { id: voce.id, eventi: voce.eventi, comando: voce.comando, hash };
  }));
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
  try {
    /* ⛔ 17/09/2026 — IL RICONTROLLO ALL'USO. Gli hook si fotografano all'avvio della sessione; qui si
       guarda che i file nominati dal comando siano ANCORA quelli dell'impronta approvata. Vale per chi
       porta un'impronta (gli hook di `.harness-ui-hooks.json`); gli hook dei plugin hanno la loro,
       sull'intero pacchetto, e non passano di qui con un `hash`. Chiuso per difetto: se non torna, la
       guardia NON gira e nega — una guardia sostituita che «consente» sarebbe peggio di nessuna. */
    if (typeof hook?.hash === 'string' && hook.hash.length > 0) {
      const adesso = await improntaHook({ comando: hook.comando, cartella }, deps);
      if (adesso !== hook.hash) {
        return { consentito: false, motivo: 'Un file di questa guardia è cambiato dopo che l’avevi approvata: non la eseguo. Riapprovala dalle impostazioni delle guardie.', codice: 'HOOK_CHANGED_SINCE_TRUST' };
      }
    }
    const [executable, ...args] = parseProcessCommand(hook.comando);
    const policy = createProcessPolicy({
      allowedExecutables: deps.allowedExecutables ?? ['node', 'node.exe', 'echo', 'echo.exe'],
      capabilities: { hook: cartella },
      envAllowlist: ['PATH', 'Path', 'PATHEXT', 'SystemRoot', 'WINDIR', 'COMSPEC', 'TALOS_HOOK_EVENT'],
      spawnFn: deps.spawnFn,
    });
    const result = await policy.runApprovedProcess({
      executable,
      args,
      cwd: cartella,
      capability: 'hook',
      timeoutMs: 10_000,
      envKeys: ['PATH', 'Path', 'PATHEXT', 'SystemRoot', 'WINDIR', 'COMSPEC', 'TALOS_HOOK_EVENT'],
      env: { TALOS_HOOK_EVENT: JSON.stringify(evento) },
      captureLimitBytes: 64 * 1024,
    });
    const testoFuori = result.stdout.trim();
    try {
      const dati = JSON.parse(testoFuori);
      if (typeof dati?.consentito === 'boolean') {
        return { consentito: dati.consentito, motivo: typeof dati.motivo === 'string' ? dati.motivo : undefined };
      }
    } catch { /* non è JSON: si ricade sul codice di uscita */ }
    return { consentito: result.code === 0, motivo: result.code === 0 ? undefined : (result.stderr.trim() || testoFuori || `hook exited ${result.code}`) };
  } catch (error) {
    return { consentito: false, motivo: String(error?.message || error) };
  }
}
