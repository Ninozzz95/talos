/**
 * L3-1 (13/10/2026) — «Continue with ChatGPT»: UN rinnovo alla volta fra i PROCESSI che condividono la stessa custodia.
 *
 * Il fatto: il refresh token di OpenAI RUOTA a ogni uso. `rinnovoInCorso` in `chatgpt-accesso.mjs` vale per un processo solo; ma
 *   l'app installata e un server avviato a mano (o due finestre dell'app) leggono la stessa voce del portachiavi di sistema
 *   (`talos-harness-chatgpt`). Se rinnovano nella stessa finestra di tempo, il secondo manda un refresh token già usato, riceve
 *   «non vale più» e — prima di questa cura — TOGLIEVA la sessione che il primo aveva appena salvato.
 *
 * La cura ha due metà: nel modulo dell'accesso, prima di rinnovare e prima di togliere si RILEGGE la custodia (se è cambiata, un
 *   altro ha già rinnovato: si usa quella); qui, un lucchetto fra processi che fa aspettare il secondo finché il primo ha salvato.
 *
 * Forma letta nel codice della CLI (`cli/src/provider/chatgpt-plan.ts`, `withRenewalLock`/`takeOver`, che cita Hermes
 *   `hermes_cli/auth_codex.py:102-111`, Pi `auth-storage.ts:69-102`, Codex `codex-rs/login/src/auth/manager.rs:1855-1997`) e in
 *   `session-lease.mjs` (creazione ESCLUSIVA atomica `wx`, pid vivo, scadenza sull'`mtime`):
 *   · chi crea il file tiene il lucchetto; chi lo trova aspetta e riprova;
 *   · un lucchetto ABBANDONATO (pid che su questo host non esiste più, o file più vecchio della scadenza) si prende — sotto un
 *     secondo file di guardia, perché due processi che lo prendono insieme non si cancellino il lucchetto nuovo a vicenda;
 *   · oltre l'attesa massima: `CHATGPT_RINNOVO_FALLITO` (riprovabile: un token che vale ancora resta usabile, lo decide chi chiama);
 *   · ⛔ se il MECCANISMO non funziona (cartella non scrivibile) si lascia passare, come Hermes (`cli.py:933-935`): il lucchetto
 *     protegge una gara rara, non deve diventare il motivo per cui il piano non si usa.
 *
 * Nel file: `{ pid, host, at, token }`. Nessun segreto.
 */
import { homedir, hostname } from 'node:os';
import { join } from 'node:path';

import { creaLucchettoFraProcessi } from './lucchetto-fra-processi.mjs'; // 27/10/2026: la logica è lì, condivisa col controllo remoto
import { processoVivoPredefinito } from './session-lease.mjs';

export const ATTESA_RINNOVO_MS = 20_000;
export const RIPROVA_RINNOVO_MS = 50;
export const SCADENZA_RINNOVO_MS = 60_000;

function errore(messaggio, code) {
  return Object.assign(new Error(messaggio), { code });
}

/**
 * Dove sta il lucchetto: una cartella dell'UTENTE, uguale per ogni processo TALOS desktop qualunque sia la sua cartella dei
 * dati (l'app installata e un server avviato a mano ne hanno due diverse, ma il portachiavi di sistema è lo stesso). Un file per
 * `scope` del portachiavi, perché scope diversi sono custodie diverse. Stessa regola delle cache in `scratch.mjs`.
 */
export function fileLucchettoRinnovoChatgpt({ env = process.env, platform = process.platform, home = homedir(), scope = null } = {}) {
  const base = platform === 'win32' ? (env.LOCALAPPDATA?.trim() || join(home, 'AppData', 'Local'))
    : platform === 'darwin' ? join(home, 'Library', 'Caches')
      : (env.XDG_CACHE_HOME?.trim() || join(home, '.cache'));
  const coda = typeof scope === 'string' && /^[a-z0-9-]{1,40}$/u.test(scope) ? `-${scope}` : '';
  return join(base, 'TALOS', 'locks', `chatgpt-renewal${coda}.lock`);
}

/**
 * @param {object} opzioni
 * @param {string} opzioni.file il file del lucchetto: lo stesso per tutti i processi che condividono la custodia
 * @returns {(lavoro: () => Promise<T>) => Promise<T>} esegue `lavoro` tenendo il lucchetto
 */
export function creaLucchettoRinnovoChatgpt({
  file, attesaMs = ATTESA_RINNOVO_MS, riprovaMs = RIPROVA_RINNOVO_MS, scadenzaMs = SCADENZA_RINNOVO_MS,
  processoVivo = processoVivoPredefinito, pid = process.pid, host = hostname(),
} = {}) {
  if (typeof file !== 'string' || file === '') throw errore('The ChatGPT renewal lock needs a file.', 'CHATGPT_LUCCHETTO_SENZA_FILE');

  return creaLucchettoFraProcessi({ file, attesaMs, riprovaMs, scadenzaMs, processoVivo, pid, host,
    codice: 'CHATGPT_RINNOVO_FALLITO', messaggio: 'The ChatGPT session could not be renewed.' });
}

