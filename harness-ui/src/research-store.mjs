/**
 * research-store.mjs — FASE N, ottavo sistema, "Fetta onesta" di Deep
 * Research (owner, AskUserQuestion 30/8: "Fetta onesta (consigliato)").
 * Letto alla fonte PRIMA di disegnare questa fetta: `mobile/src/lib/
 * research/*` (21 file, macchina a stati event-sourced — `researchRun.ts`
 * — con verifica/indipendenza/citazioni/approvazione piano) e il
 * CONTRATTO vero del tool, `mobile/src/lib/tools/researchTools.ts` (8
 * tool, letti verbatim, non presunti). L'owner ha scelto esplicitamente
 * la fetta scoperta: stesso CONTRATTO (nomi/schema/semantica dei tool),
 * esecuzione riusando la macchina GIÀ COSTRUITA di Harness Desktop
 * (talosLavora via avviaESegui, l'abort già usato da ferma() per la
 * pausa, resume() per la ripresa, library-store.mjs per il rapporto
 * finale) invece del motore event-sourced mobile (pianificazione a più
 * linee di indagine, verifica/indipendenza/citazioni/approvazione piano)
 * — dichiarato debito, non perso in silenzio.
 *
 * ⭐⭐⭐ Deep Research è PER-PROGETTO, non GLOBALE come Notes/Tasks/Memory
 * — decisione DIVERSA dagli ultimi tre sistemi, verificata non presunta:
 * il tool mobile stesso dice "i rapporti di ricerca SONO file di
 * Libreria" (`library_list` li trova, li elenca come documenti — vedi
 * il commento di testa di researchTools.ts) — e la Libreria desktop è
 * PER-PROGETTO (FASE N, prima fetta: `.harness-ui-library/` dentro il
 * workspace, mai cross-chat come sul mobile). Una ricerca avviata
 * mentre si lavora sul progetto C deve finire nella Libreria di QUEL
 * progetto, raggiungibile dalle sessioni future sullo STESSO progetto —
 * non in un limbo globale che nessun `library_list` di progetto
 * vedrebbe mai. Storage quindi accanto a `.harness-ui-library/`, dentro
 * il workspace: `.harness-ui-research/<id>.json`, un file per ricerca
 * (mai un array riscritto — la classe di bug già evitata altrove).
 *
 * ⛔⛔⛔ Deliberatamente SENZA lo stato "sta girando ORA" come campo:
 * mobile stesso separa "il giornale" (`sources.list()`) da "sta girando
 * adesso" (`sources.isRunning(id)`, calcolato al volo — vedi
 * `TalosResearchToolSources.isRunning` in researchTools.ts) — questo
 * store tiene SOLO `terminata` (null finché non è definitivamente
 * conclusa: 'done'|'failed'|'cancelled'). "In corso" vs "in pausa" si
 * derivano DAL VIVO in research-orchestrator.mjs confrontando
 * `terminata` con lo stato reale della sessione in session-registry —
 * per costruzione non può disallinearsi, mai duplicato qui.
 *
 * Stile DI: stesso pattern di library-store.mjs/notes-store.mjs —
 * funzioni async con `deps` opzionali per i test, mai un vero
 * filesystem mockato altrove.
 */
import { promises as fsp } from 'node:fs';
import { join } from 'node:path';

export class ResearchStoreError extends Error {
  constructor(message, code = 'RESEARCH_INVALID') {
    super(message);
    this.name = 'ResearchStoreError';
    this.code = code;
  }
}

export const CARTELLA_RICERCA = '.harness-ui-research';

function percorsoVoce(cartella, id) {
  return join(cartella, CARTELLA_RICERCA, `${id}.json`);
}

/**
 * @returns {Promise<Array<object>>} — [] se la cartella non esiste ancora
 * (mai un errore: nessuna ricerca avviata su questo progetto è uno
 * stato onesto, non un guasto). Più recenti prime, come `research_list`
 * mobile ("«che ricerche ho fatto» quasi sempre vuol dire «le ultime»").
 */
export async function elencaRicerche({ cartella }, deps = {}) {
  const readdirFn = deps.readdirFn ?? fsp.readdir;
  const readFileFn = deps.readFileFn ?? fsp.readFile;
  const cartellaRicerca = join(cartella, CARTELLA_RICERCA);
  let file;
  try {
    file = await readdirFn(cartellaRicerca);
  } catch {
    return [];
  }
  const ricerche = [];
  for (const nomeFile of file) {
    if (!nomeFile.endsWith('.json')) continue;
    try {
      const grezzo = await readFileFn(join(cartellaRicerca, nomeFile), 'utf8');
      ricerche.push(JSON.parse(grezzo));
    } catch {
      // ⛔ una voce corrotta non impedisce di vedere le altre — stesso principio di leggiRegistro (session-store.mjs) su un'ultima riga tollerata.
    }
  }
  ricerche.sort((a, b) => String(b.avviataAlle || '').localeCompare(String(a.avviataAlle || '')));
  return ricerche;
}

/** @returns {Promise<object|null>} — null se l'id non esiste. */
export async function leggiRicerca({ cartella, id }, deps = {}) {
  const readFileFn = deps.readFileFn ?? fsp.readFile;
  let grezzo;
  try {
    grezzo = await readFileFn(percorsoVoce(cartella, id), 'utf8');
  } catch (errore) {
    if (errore?.code === 'ENOENT') return null;
    throw new ResearchStoreError(`${id}: metadata presente ma illeggibile: ${errore.message}`, 'RESEARCH_READ_FAILED');
  }
  return JSON.parse(grezzo);
}

/**
 * Crea la voce di metadata — chiamata da research-orchestrator.mjs SUBITO
 * dopo che avviaESegui ha già assegnato un sessionId: l'id di una
 * ricerca È il sessionId della sessione che la esegue (nessuna doppia
 * mappatura ricerca→sessione, un solo spazio di identità, mai
 * disallineabile).
 */
export async function creaRicerca({ cartella, id, domanda, profondita }, deps = {}) {
  const mkdirFn = deps.mkdirFn ?? fsp.mkdir;
  const writeFileFn = deps.writeFileFn ?? fsp.writeFile;
  if (typeof id !== 'string' || id.length === 0) {
    throw new ResearchStoreError('Una ricerca vuole un id', 'RESEARCH_INVALID');
  }
  if (typeof domanda !== 'string' || domanda.trim().length === 0) {
    throw new ResearchStoreError('Una ricerca vuole una domanda', 'RESEARCH_INVALID');
  }
  const cartellaRicerca = join(cartella, CARTELLA_RICERCA);
  await mkdirFn(cartellaRicerca, { recursive: true });
  const adesso = new Date().toISOString();
  const voce = {
    id, domanda: domanda.trim(), profondita: profondita || 'deep',
    titolo: null, avviataAlle: adesso, aggiornataAlle: adesso,
    terminata: null, reportLibraryId: null,
  };
  await writeFileFn(percorsoVoce(cartella, id), JSON.stringify(voce, null, 2), 'utf8');
  return voce;
}

/**
 * Aggiorna campi (titolo/terminata/reportLibraryId) — `null` se l'id non
 * esiste. `undefined` per un campo significa "non toccarlo" (mai
 * confuso con `null`, un valore esplicito — stesso principio già
 * imparato sul clamping di `limit` in Notes: non trattare "assente"
 * come "falso"). Mai il campo "in corso": si deriva dal vivo (vedi la
 * doc di testa), questa funzione non può farlo disallineare.
 */
export async function aggiornaRicerca({ cartella, id, titolo, terminata, reportLibraryId }, deps = {}) {
  const readFileFn = deps.readFileFn ?? fsp.readFile;
  const writeFileFn = deps.writeFileFn ?? fsp.writeFile;
  let voce;
  try {
    voce = JSON.parse(await readFileFn(percorsoVoce(cartella, id), 'utf8'));
  } catch (errore) {
    if (errore?.code === 'ENOENT') return null;
    throw new ResearchStoreError(`${id}: metadata presente ma illeggibile: ${errore.message}`, 'RESEARCH_READ_FAILED');
  }
  const aggiornata = {
    ...voce,
    titolo: titolo !== undefined ? titolo : voce.titolo,
    terminata: terminata !== undefined ? terminata : voce.terminata,
    reportLibraryId: reportLibraryId !== undefined ? reportLibraryId : voce.reportLibraryId,
    aggiornataAlle: new Date().toISOString(),
  };
  await writeFileFn(percorsoVoce(cartella, id), JSON.stringify(aggiornata, null, 2), 'utf8');
  return aggiornata;
}

/**
 * Elimina SOLO la metadata — il rapporto in Libreria (se esiste) è
 * responsabilità del CHIAMANTE (research-orchestrator.mjs, che conosce
 * `reportLibraryId` PRIMA di chiamare questa funzione e compone le due
 * cancellazioni, stesso principio "questo file non sa COME" già in uso
 * altrove). `null` se l'id non esiste già (idempotente, mai
 * un'eccezione — stesso principio di `eliminaVoce` in library-store.mjs,
 * "It may already be gone").
 */
export async function eliminaRicerca({ cartella, id }, deps = {}) {
  const readFileFn = deps.readFileFn ?? fsp.readFile;
  const rmFn = deps.rmFn ?? fsp.rm;
  try {
    await readFileFn(percorsoVoce(cartella, id), 'utf8');
  } catch (errore) {
    if (errore?.code === 'ENOENT') return null;
    throw new ResearchStoreError(`${id}: metadata presente ma illeggibile: ${errore.message}`, 'RESEARCH_READ_FAILED');
  }
  await rmFn(percorsoVoce(cartella, id), { force: true });
  return { id };
}
