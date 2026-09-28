/**
 * scratch.mjs — la radice UNICA dei temporanei di TALOS (24/09/2026, corsia SCRATCH).
 *
 * ⛔ Il difetto che chiude, misurato il 23/09/2026: `%TEMP%` dell'owner conteneva **3.500** voci
 *   `talos-*` sciolte (una ventina di prefissi), e il prodotto ne creava da tre posti diversi
 *   (`doctor.mjs`, `git-service.mjs`, `scripts/avvia-talos.mjs`) più le cartelle `avvio-*` che il
 *   guscio desktop lasciava in `%APPDATA%\TALOS` (3 orfane trovate). Nessuna rete dopo un crash.
 *
 * ⇒ Decisione dell'owner (23/09/2026 notte): la radice è **`%LOCALAPPDATA%\TALOS\cache\scratch`**; se
 *   la cartella dati è stata spostata con `TALOS_DESKTOP_DATA_DIR`, la radice la segue in
 *   `<dati>\cache\scratch`. `TALOS_SCRATCH_DIR` la sposta in modo esplicito (test, guscio desktop che
 *   passa la sua scelta al figlio, server avviato a mano). Pulizia all'avvio di ciò che è fermo da 24
 *   ore; il Doctor mostra percorso, dimensione e numero di voci.
 *
 * Fonti, lette il 23-24/09/2026:
 * - Hermes Agent (NousResearch/hermes-agent, main @ 0087827510b6): `hermes_constants.py:1041-1054`
 *   «Scratch dir: Hermes' own temp space, never the system /tmp … an entry lives while anything inside
 *   it is still being written and goes 24h after the last write anywhere in its subtree. A fixed age
 *   was wrong both ways — a directory's own mtime only moves when a direct child is added or removed»;
 *   `:1198-1210` `get_scratch_dir()` → `<home>/cache/scratch`; `:1234-1248` `_prune_scratch_dir_once`:
 *   timbro `.last_prune`, al massimo una volta l'ora fra processi, timbro toccato PRIMA di potare;
 *   `hermes_constants_scratch.py:25-54` `subtree_touched_since` (non segue i link, una voce illeggibile
 *   si TIENE); `:167-198` `prune_idle_entries` (solo le voci di primo livello della radice);
 *   `hermes_cli/doctor_state.py:193-198` il Doctor mostra percorso e dimensione.
 * - Zed (`crates/paths/src/paths.rs:193-206`): su Windows `temp_dir()` = `%LOCALAPPDATA%\Zed`.
 * - Node 24 `fs.rm` (https://nodejs.org/docs/latest-v24.x/api/fs.html): `maxRetries` vale 0 di
 *   default e ritenta solo su EBUSY, EMFILE, ENFILE, ENOTEMPTY, EPERM, con attesa lineare `retryDelay`.
 * - Electron `app.getPath` (docs/api/app.md): non esiste un nome per `%LOCALAPPDATA%` (`appData` è
 *   Roaming) ⇒ la cartella locale si legge da `LOCALAPPDATA`.
 * - Misurato qui, Node v24.18.0 su Windows 11: `rm({recursive:true})` su una cartella che contiene una
 *   GIUNZIONE toglie la giunzione e NON il contenuto del bersaglio (il file fuori è rimasto), e `lstat`
 *   di una giunzione dice `isSymbolicLink() === true`. È la trappola di robocopy /MIR (17/09): qui non
 *   c'è.
 */
import { mkdirSync, mkdtempSync } from 'node:fs';
import { lstat, mkdir, mkdtemp, readdir, rm, utimes, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';

export const NOME_APP = 'TALOS';
/** Una voce della radice si toglie quando nel suo intero sottoalbero nessuno scrive da tanto così. */
export const ETA_MINIMA_SCRATCH_MS = 24 * 60 * 60 * 1000;
/** La pulizia generale gira al massimo una volta ogni tanto così, anche fra processi diversi. */
export const INTERVALLO_PULIZIA_MS = 60 * 60 * 1000;
/** Il file-timbro dell'ultima pulizia, dentro la radice; non è mai una voce da togliere. */
export const FILE_TIMBRO = '.ultima-pulizia';
/*
 * I residui che le versioni di prima lasciavano FUORI dalla radice: si tolgono con la stessa regola
 * (24 ore di silenzio nel sottoalbero), solo cartelle vere, solo questi prefissi — mai altro di TEMP.
 */
// 24/09/2026: più il vecchio profilo del browser pilotato (`%TEMP%\talos-browser-vivo`), che ora vive sotto la radice.
export const PREFISSI_STORICI_IN_TEMP = Object.freeze(['talos-doctor-', 'talos-git-msg-', 'talos-avvio-', 'talos-browser-vivo']);
export const PREFISSO_STORICO_AVVIO_DESKTOP = 'avvio-';

const RIMOZIONE_CON_RITENTATIVI = Object.freeze({ recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
/* Un prefisso è un NOME, mai un percorso: così la cartella nasce per costruzione SOTTO la radice. */
const PREFISSO_VALIDO = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

function assoluta(valore, nome) {
  if (!isAbsolute(valore)) throw new Error(`${nome} deve essere una cartella assoluta.`);
  return resolve(valore);
}

/** La cartella delle cache dell'utente, come `dirs::cache_dir()` che usa Zed. */
function cartellaCacheUtente(env, platform, home) {
  if (platform === 'win32') return env.LOCALAPPDATA?.trim() || join(home, 'AppData', 'Local');
  if (platform === 'darwin') return join(home, 'Library', 'Caches');
  return env.XDG_CACHE_HOME?.trim() || join(home, '.cache');
}

/**
 * Dove vivono i temporanei di TALOS. Ordine: `TALOS_SCRATCH_DIR` (esplicita) → `<TALOS_DESKTOP_DATA_DIR>\cache\scratch`
 * (cartella dati spostata) → `%LOCALAPPDATA%\TALOS\cache\scratch`.
 * ⛔ Il guscio desktop passa SEMPRE `TALOS_DESKTOP_DATA_DIR` al figlio (anche quando non è spostata,
 *   `desktop/runtime.mjs`): per questo passa anche `TALOS_SCRATCH_DIR`, calcolata dove si sa se la
 *   cartella è stata spostata davvero (`desktop/profile.mjs`). Le due regole devono restare uguali: lo
 *   prova `tests/scratch.test.mjs`.
 */
export function radiceScratch(env = process.env, { platform = process.platform, home = homedir() } = {}) {
  const esplicita = env.TALOS_SCRATCH_DIR?.trim();
  if (esplicita) return assoluta(esplicita, 'TALOS_SCRATCH_DIR');
  const dati = env.TALOS_DESKTOP_DATA_DIR?.trim();
  if (dati) return join(assoluta(dati, 'TALOS_DESKTOP_DATA_DIR'), 'cache', 'scratch');
  return join(cartellaCacheUtente(env, platform, home), NOME_APP, 'cache', 'scratch');
}

function controllaPrefisso(prefisso) {
  if (typeof prefisso !== 'string' || !PREFISSO_VALIDO.test(prefisso)) {
    throw new Error(`Prefisso della cartella temporanea non valido: ${JSON.stringify(prefisso)}`);
  }
}

/** Crea una cartella usa-e-getta SOTTO la radice (mai in `%TEMP%`). Chi la crea la toglie sul percorso felice. */
export function cartellaScratch(prefisso, { radice = radiceScratch() } = {}) {
  controllaPrefisso(prefisso);
  mkdirSync(radice, { recursive: true });
  return mkdtempSync(join(radice, prefisso));
}

/** Come `cartellaScratch`, con l'API a promesse. */
export async function cartellaScratchAttesa(prefisso, { radice = radiceScratch() } = {}) {
  controllaPrefisso(prefisso);
  await mkdir(radice, { recursive: true });
  return mkdtemp(join(radice, prefisso));
}

/**
 * Vero se `percorso` o qualunque cosa sotto ha un mtime ≥ `soglia` (Hermes `subtree_touched_since`).
 * Si ferma al primo recente. Non segue i collegamenti. Una voce illeggibile conta come VIVA: una
 * scansione incompleta non può dimostrare che sia ferma.
 */
async function sottoalberoToccatoDopo(percorso, soglia) {
  try {
    const info = await lstat(percorso);
    if (info.mtimeMs >= soglia) return true;
    if (!info.isDirectory() || info.isSymbolicLink()) return false;
  } catch { return true; }
  const pila = [percorso];
  while (pila.length) {
    const cartella = pila.pop();
    let figli;
    try { figli = await readdir(cartella, { withFileTypes: true }); } catch { return true; }
    for (const figlio of figli) {
      const pieno = join(cartella, figlio.name);
      let info;
      try { info = await lstat(pieno); } catch { return true; }
      if (info.mtimeMs >= soglia) return true;
      if (info.isDirectory() && !info.isSymbolicLink()) pila.push(pieno);
    }
  }
  return false;
}

/**
 * Toglie le voci di primo livello di `radice` il cui SOTTOALBERO è fermo da almeno `etaMinimaMs`.
 * Non lancia mai: una voce che non si toglie si DICHIARA (in `rimaste` e con un avviso) e si ritenta
 * al giro dopo.
 *
 * @param {object} [opzioni]
 * @param {string} [opzioni.radice] la cartella da potare (predefinita: `radiceScratch()`)
 * @param {number} [opzioni.adesso] l'istante di riferimento, in ms
 * @param {number} [opzioni.etaMinimaMs] quanto deve essere fermo il sottoalbero (24 h)
 * @param {string[]|null} [opzioni.prefissi] se dati, solo le voci che iniziano così (le altre non sono nostre)
 * @param {boolean} [opzioni.soloCartelle] se vero, mai file né collegamenti: solo cartelle vere
 * @param {boolean} [opzioni.timbro] se vero, al massimo una volta ogni `intervalloMs` (file `.ultima-pulizia`)
 * @param {number} [opzioni.intervalloMs]
 * @param {typeof rm} [opzioni.rimuovi] iniettabile per provare la voce che non si toglie
 * @returns {Promise<{radice:string, eseguita:boolean, motivo?:string, tolte:string[], rimaste:Array<{nome:string,codice:string}>}>}
 */
export async function ripulisciScratch({
  radice, adesso = Date.now(), etaMinimaMs = ETA_MINIMA_SCRATCH_MS, prefissi = null, soloCartelle = false,
  timbro = true, intervalloMs = INTERVALLO_PULIZIA_MS, rimuovi = rm,
} = {}) {
  const esito = { radice: null, eseguita: false, tolte: [], rimaste: [] };
  try {
    esito.radice = radice ?? radiceScratch();
  } catch (errore) {
    esito.motivo = `radice non valida: ${errore?.message ?? errore}`;
    return esito;
  }
  let voci;
  try { voci = await readdir(esito.radice); } catch { esito.motivo = 'radice illeggibile o assente'; return esito; }
  if (timbro) {
    const fileTimbro = join(esito.radice, FILE_TIMBRO);
    try {
      const info = await lstat(fileTimbro);
      if (adesso - info.mtimeMs < intervalloMs) { esito.motivo = 'già eseguita nell’ultima ora'; return esito; }
    } catch { /* nessun timbro: prima pulizia */ }
    // Come Hermes: il timbro si tocca PRIMA di potare, così un secondo processo che parte adesso salta.
    try {
      await writeFile(fileTimbro, '');
      await utimes(fileTimbro, adesso / 1000, adesso / 1000);
    } catch { /* un timbro non scrivibile non impedisce la pulizia */ }
  }
  esito.eseguita = true;
  const soglia = adesso - etaMinimaMs;
  for (const nome of voci) {
    if (nome === FILE_TIMBRO) continue;
    if (prefissi && !prefissi.some((p) => nome.startsWith(p))) continue;
    const percorso = join(esito.radice, nome);
    if (soloCartelle) {
      let info;
      try { info = await lstat(percorso); } catch { continue; } // sparita nel frattempo
      if (!info.isDirectory() || info.isSymbolicLink()) continue;
    }
    if (await sottoalberoToccatoDopo(percorso, soglia)) continue;
    try {
      await rimuovi(percorso, RIMOZIONE_CON_RITENTATIVI);
      esito.tolte.push(nome);
    } catch (errore) {
      const codice = errore?.code ?? 'errore';
      esito.rimaste.push({ nome, codice });
      process.emitWarning(`voce dei temporanei non rimossa (${codice}), si ritenta alla prossima pulizia: ${percorso}`, 'ResiduoScratch');
    }
  }
  return esito;
}

/**
 * La pulizia che parte all'avvio del server: la radice (con timbro) più i residui storici fuori radice
 * (`talos-doctor-`/`talos-git-msg-`/`talos-avvio-` in `%TEMP%`, `avvio-*` nella cartella dati del
 * desktop). Non lancia mai e non va attesa: chi avvia il server la lancia e prosegue.
 */
export async function avviaPuliziaScratch({ env = process.env, adesso = Date.now(), log = console } = {}) {
  const giri = [];
  try {
    let radice = null;
    try { radice = radiceScratch(env); } catch (errore) {
      // Una radice mal configurata si dichiara; i residui storici si tolgono lo stesso.
      giri.push({ radice: null, eseguita: false, motivo: `radice non valida: ${errore?.message ?? errore}`, tolte: [], rimaste: [] });
    }
    if (radice) giri.push(await ripulisciScratch({ radice, adesso }));
    giri.push(await ripulisciScratch({ radice: tmpdir(), adesso, prefissi: PREFISSI_STORICI_IN_TEMP, soloCartelle: true, timbro: false }));
    const dati = env.TALOS_DESKTOP_DATA_DIR?.trim();
    if (dati && isAbsolute(dati)) {
      giri.push(await ripulisciScratch({ radice: resolve(dati), adesso, prefissi: [PREFISSO_STORICO_AVVIO_DESKTOP], soloCartelle: true, timbro: false }));
    }
  } catch (errore) {
    try { log.warn?.(`[scratch] pulizia all'avvio interrotta: ${errore?.message ?? errore}`); } catch { /* il log non deve rompere l'avvio */ }
    return giri;
  }
  for (const giro of giri) {
    if (giro.motivo?.startsWith('radice non valida')) {
      try { log.warn?.(`[scratch] ${giro.motivo}`); } catch { /* il log non deve rompere l'avvio */ }
    }
  }
  const tolte = giri.reduce((n, g) => n + g.tolte.length, 0);
  const rimaste = giri.reduce((n, g) => n + g.rimaste.length, 0);
  if (tolte || rimaste) {
    try { log.log?.(`[scratch] pulizia all'avvio: ${tolte} voci tolte, ${rimaste} non rimosse (si ritenta alla prossima).`); } catch { /* idem */ }
  }
  return giri;
}

/**
 * Percorso, byte e numero di voci della radice, per il Doctor (Hermes `scratch_dir_usage_bytes`).
 * Somma le dimensioni senza seguire i collegamenti; ciò che non si legge non si conta e si dichiara.
 */
export async function statoScratch({ radice } = {}) {
  let percorso;
  try { percorso = radice ?? radiceScratch(); } catch (errore) { return { percorso: null, esiste: false, byte: 0, voci: 0, illeggibili: 0, errore: String(errore?.message ?? errore) }; }
  let primoLivello;
  try { primoLivello = await readdir(percorso); } catch { return { percorso, esiste: false, byte: 0, voci: 0, illeggibili: 0 }; }
  let byte = 0;
  let illeggibili = 0;
  const pila = [percorso];
  while (pila.length) {
    const cartella = pila.pop();
    let figli;
    try { figli = await readdir(cartella, { withFileTypes: true }); } catch { illeggibili += 1; continue; }
    for (const figlio of figli) {
      const pieno = join(cartella, figlio.name);
      try {
        const info = await lstat(pieno);
        if (info.isDirectory() && !info.isSymbolicLink()) pila.push(pieno);
        else byte += info.size;
      } catch { illeggibili += 1; }
    }
  }
  return { percorso, esiste: true, byte, voci: primoLivello.filter((n) => n !== FILE_TIMBRO).length, illeggibili };
}
