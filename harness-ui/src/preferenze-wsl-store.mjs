/*
 * ⛔⛔ F009 — LA PREFERENZA DELL'UTENTE DI WSL (owner 01/10/2026: «come gli altri, insieme», impostazione «accesa»).
 *
 * Una sola scelta: quando la distro esegue come root ma ha anche un utente normale, i comandi girano come quell'utente
 * (`wsl -d <distro> -u <utente>`, `kernel/utente-wsl.mjs`). È la forma di Hermes (`docker_run_as_host_user`, opt-in in
 * `tools/environments/docker.py:498-509`), qui accesa di partenza per decisione dell'owner. TALOS non crea utenti.
 *
 * Il file sta accanto a `.search-source.json` (stessa cartella dati, stessa scrittura su temporaneo + rename).
 * ⛔ Un file mancante o illeggibile vale «accesa»: è il valore scelto dall'owner, ed è il verso più prudente.
 */
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';

export class PreferenzeWslError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

function leggiFile(percorso) {
  if (!percorso || !existsSync(percorso)) return null;
  try {
    const dati = JSON.parse(readFileSync(percorso, 'utf8'));
    return dati && typeof dati === 'object' && !Array.isArray(dati) ? dati : null;
  } catch { return null; }
}

function scriviFile(percorso, dati) {
  if (!percorso) return;
  const tmp = `${percorso}.tmp-${process.pid}`;
  writeFileSync(tmp, `${JSON.stringify(dati, null, 2)}\n`);
  renameSync(tmp, percorso);
}

/**
 * @param {object} deps
 * @param {string|null} [deps.file] il JSON della preferenza
 * @param {(preferenze: {usaUtenteNormale: boolean}) => Promise<object>} [deps.statoFn] i fatti di WSL per quella preferenza
 *   (`statoWsl` del kernel); assente ⇒ `{ disponibile: false }`
 */
export function createPreferenzeWslStore({ file = null, statoFn = null } = {}) {
  let inMemoria = null; // senza file (prove, server senza cartella dati) la scelta vive finché vive il processo

  /** Sincrona: la legge il registro a ogni comando. */
  function leggi() {
    const dati = file ? leggiFile(file) : inMemoria;
    return { usaUtenteNormale: dati?.usaUtenteNormale !== false };
  }

  function imposta({ usaUtenteNormale } = {}) {
    if (typeof usaUtenteNormale !== 'boolean') throw new PreferenzeWslError('QUERY_INVALID', 'usaUtenteNormale deve essere vero o falso.');
    if (file) scriviFile(file, { usaUtenteNormale });
    else inMemoria = { usaUtenteNormale };
    return leggi();
  }

  async function stato() {
    const preferenze = leggi();
    const wsl = typeof statoFn === 'function' ? await statoFn(preferenze) : { disponibile: false };
    return { preferenze, wsl };
  }

  return { leggi, imposta, stato };
}
