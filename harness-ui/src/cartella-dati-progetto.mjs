/*
 * ⭐⭐⭐ PO-26 — UNA CARTELLA DATI PER PROGETTO, FUORI DAL PROGETTO.
 *
 * Owner 16/09/2026 «PO-26 si», riaperta il 24/09/2026 sera con «PO-26 intera, adesso» dopo che la
 * sessione `f2424a97…` (cartella di progetto = il Desktop) ha lasciato `.harness-ui-library` e
 * `.harness-ui-research` sul Desktop. Memoria `po-26-una-cartella-dati-sola-fuori-dal-workspace`.
 *
 * Cosa fa questo modulo, e solo questo:
 *   1. dà a ogni progetto una cartella sua dentro la cartella dati dell'app,
 *      `<dati>/.workspaces/<slug>-<impronta>/`, dove Libreria e Ricerca continuano a vivere coi
 *      loro nomi di sempre (`.harness-ui-library/`, `.harness-ui-research/`): i negozi non cambiano,
 *      cambia solo la radice che ricevono;
 *   2. la prima volta che un progetto viene toccato in questo processo, SPOSTA lì le cartelle che
 *      le versioni precedenti avevano lasciato nel progetto (migrazione automatica, decisa il 16/09).
 *
 * ⛔ Perché slug + impronta e non lo slug e basta. Claude Code codifica il percorso sostituendo con
 *   `-` ogni carattere non alfanumerico, e la codifica perde informazione: `/a/spec-rl` e
 *   `/a/spec/rl` finiscono nella STESSA cartella e i due progetti condividono memoria e sessioni
 *   (anthropics/claude-code #35162; #40946 per i percorsi non ASCII, letti il 24/09/2026). Qui una
 *   collisione mescolerebbe la Libreria di due progetti in silenzio. OpenCode evita il problema con
 *   un identificativo stabile in un database (`packages/opencode/src/project/project.ts`, clone
 *   `0f54984`). ⇒ Lo slug resta, perché la cartella deve essere riconoscibile a occhio; i primi 10
 *   caratteri esadecimali dello SHA-256 del percorso canonico la rendono unica.
 * ⛔ Il percorso canonico è quello di `fs.promises.realpath`: risolve collegamenti e giunzioni e, su
 *   Windows, restituisce le maiuscole vere (`c:/users/x` ⇒ `C:\Users\X`, misurato il 24/09/2026 con
 *   Node 24.18). Su Windows l'impronta si calcola sul percorso in minuscolo: il file system non
 *   distingue le maiuscole, e due grafie dello stesso progetto non devono diventare due progetti.
 *
 * ⛔⛔ La migrazione non sovrascrive MAI. `fs.rename` su una destinazione che esiste fallisce (o, su
 *   POSIX, sostituisce una cartella vuota): per questo si controlla prima e, quando la destinazione
 *   c'è già, si fonde voce per voce. Una voce presente da entrambe le parti resta dov'è ed è un
 *   CONFLITTO dichiarato, a meno che il contenuto sia identico byte per byte (allora la copia nel
 *   progetto è un doppione e si toglie). Fra dischi diversi `rename` fallisce con `EXDEV` (Node,
 *   `fs.rename`, letto via Context7 il 24/09/2026): si copia, si verifica il contenuto, e solo
 *   dopo si toglie l'originale. Un collegamento simbolico o una giunzione non si segue mai: la lezione
 *   di `robocopy /MIR` del 17/09 è che seguirli porta a svuotare cartelle che non sono nostre.
 */
import { createHash } from 'node:crypto';
import { promises as fsp } from 'node:fs';
import { join, resolve } from 'node:path';

import { CARTELLA_LIBRERIA } from './library-store.mjs';
import { CARTELLA_RICERCA } from './research-store.mjs';

/** La cartella, dentro la cartella dati dell'app, che contiene una cartella per progetto. */
export const CARTELLA_PROGETTI = '.workspaces';

/** I dati GENERATI che le versioni precedenti scrivevano nella radice del progetto. */
export const NOMI_DATI_GENERATI = Object.freeze([CARTELLA_LIBRERIA, CARTELLA_RICERCA]);

/*
 * ⛔ Lo slug si tiene corto: su Windows un percorso di rapporto è già
 *   `<dati>\.workspaces\<nome>\.harness-ui-research\<uuid>\fonti\<file>`, e il limite classico di
 *   260 caratteri non va sprecato nel nome. Si tiene la CODA del percorso, cioè le cartelle più
 *   vicine al progetto, che sono quelle che lo fanno riconoscere.
 */
const LUNGHEZZA_MASSIMA_SLUG = 48;
const LUNGHEZZA_IMPRONTA = 10;

function chiaveDelPercorso(percorso, piattaforma) {
  return piattaforma === 'win32' ? percorso.toLowerCase() : percorso;
}

function senzaSeparatoriInCoda(percorso) {
  const pulito = percorso.replace(/[\\/]+$/u, '');
  return pulito.length > 0 ? pulito : percorso;
}

/**
 * Il nome della cartella di un progetto: `<slug>-<impronta>`. PURO.
 * @param {string} percorsoCanonico percorso assoluto già risolto
 * @param {{piattaforma?: string}} [opzioni]
 */
export function nomeCartellaProgetto(percorsoCanonico, { piattaforma = process.platform } = {}) {
  if (typeof percorsoCanonico !== 'string' || percorsoCanonico.length === 0) {
    throw new TypeError('nomeCartellaProgetto: serve un percorso assoluto.');
  }
  const pulito = senzaSeparatoriInCoda(percorsoCanonico);
  const impronta = createHash('sha256').update(chiaveDelPercorso(pulito, piattaforma), 'utf8').digest('hex').slice(0, LUNGHEZZA_IMPRONTA);
  let slug = pulito.replace(/[^A-Za-z0-9]/gu, '-');
  if (slug.length > LUNGHEZZA_MASSIMA_SLUG) slug = slug.slice(-LUNGHEZZA_MASSIMA_SLUG);
  slug = slug.replace(/^-+|-+$/gu, '');
  return slug.length > 0 ? `${slug}-${impronta}` : impronta;
}

/** Il percorso canonico di una cartella; se non esiste (o non si può risolvere) resta quello assoluto. */
export async function percorsoCanonico(cartella, { realpathFn = fsp.realpath } = {}) {
  const assoluto = resolve(cartella);
  try {
    return await realpathFn(assoluto);
  } catch {
    return assoluto;
  }
}

async function esiste(percorso, lstatFn) {
  try {
    await lstatFn(percorso);
    return true;
  } catch (errore) {
    if (errore?.code === 'ENOENT') return false;
    throw errore;
  }
}

/**
 * Vero se due alberi hanno gli stessi nomi e gli stessi byte. Conservativo: un collegamento, un tipo
 * diverso o un errore di lettura rispondono `false` — nel dubbio una voce resta dov'è.
 */
export async function stessoContenuto(a, b, deps = {}) {
  const lstatFn = deps.lstatFn ?? fsp.lstat;
  const readdirFn = deps.readdirFn ?? fsp.readdir;
  const readFileFn = deps.readFileFn ?? fsp.readFile;
  try {
    const [ia, ib] = await Promise.all([lstatFn(a), lstatFn(b)]);
    if (ia.isSymbolicLink() || ib.isSymbolicLink()) return false;
    if (ia.isDirectory() !== ib.isDirectory() || ia.isFile() !== ib.isFile()) return false;
    if (ia.isFile()) {
      if (ia.size !== ib.size) return false;
      const [ba, bb] = await Promise.all([readFileFn(a), readFileFn(b)]);
      return Buffer.compare(ba, bb) === 0;
    }
    if (!ia.isDirectory()) return false;
    const [na, nb] = await Promise.all([readdirFn(a), readdirFn(b)]);
    if (na.length !== nb.length) return false;
    const insieme = new Set(nb);
    for (const nome of na) {
      if (!insieme.has(nome)) return false;
      if (!(await stessoContenuto(join(a, nome), join(b, nome), deps))) return false;
    }
    return true;
  } catch {
    return false;
  }
}

const CODICI_DA_COPIARE = new Set(['EXDEV', 'EPERM', 'EBUSY', 'EACCES']);

/**
 * Sposta `da` in `a` (che NON deve esistere). `rename` quando si può; altrimenti copia, verifica e
 * toglie l'originale. Una copia che non torna identica si butta e l'originale resta intatto.
 */
async function sposta(da, a, deps) {
  try {
    await deps.renameFn(da, a);
    return 'rinominata';
  } catch (errore) {
    if (!CODICI_DA_COPIARE.has(errore?.code)) throw errore;
  }
  await deps.cpFn(da, a, { recursive: true, errorOnExist: true, force: false, verbatimSymlinks: true });
  if (!(await stessoContenuto(da, a, deps))) {
    await deps.rmFn(a, { recursive: true, force: true });
    throw Object.assign(new Error(`la copia di ${da} non coincide con l'originale: l'originale resta dov'è`), { code: 'PO26_COPIA_DIVERSA' });
  }
  await deps.rmFn(da, { recursive: true, force: true });
  return 'copiata';
}

/**
 * La migrazione automatica: porta `<progetto>/<nome>` in `<destinazione>/<nome>` per ogni nome dei dati
 * generati. Non lancia: ogni guasto finisce nel rapporto, perché un progetto illeggibile non deve
 * impedire a una sessione di partire.
 * @returns {Promise<{progetto:string, destinazione:string, spostate:string[], unite:string[], doppioni:string[], conflitti:string[], saltate:{percorso:string,motivo:string}[], errori:{percorso:string,codice:string|null,messaggio:string}[]}>}
 */
export async function migraDatiGenerati({ progetto, destinazione, nomi = NOMI_DATI_GENERATI }, deps = {}) {
  const d = {
    lstatFn: deps.lstatFn ?? fsp.lstat,
    readdirFn: deps.readdirFn ?? fsp.readdir,
    readFileFn: deps.readFileFn ?? fsp.readFile,
    renameFn: deps.renameFn ?? fsp.rename,
    cpFn: deps.cpFn ?? fsp.cp,
    rmFn: deps.rmFn ?? fsp.rm,
    rmdirFn: deps.rmdirFn ?? fsp.rmdir,
    mkdirFn: deps.mkdirFn ?? fsp.mkdir,
  };
  const rapporto = { progetto, destinazione, spostate: [], unite: [], doppioni: [], conflitti: [], saltate: [], errori: [] };
  const errore = (percorso, e) => rapporto.errori.push({ percorso, codice: e?.code ?? null, messaggio: e?.message ?? String(e) });
  if (resolve(progetto) === resolve(destinazione)) return rapporto;
  for (const nome of nomi) {
    const da = join(progetto, nome);
    const a = join(destinazione, nome);
    let info;
    try {
      info = await d.lstatFn(da);
    } catch (e) {
      if (e?.code !== 'ENOENT') errore(da, e);
      continue;
    }
    if (info.isSymbolicLink()) { rapporto.saltate.push({ percorso: da, motivo: 'collegamento' }); continue; }
    if (!info.isDirectory()) { rapporto.saltate.push({ percorso: da, motivo: 'non-cartella' }); continue; }
    try {
      await d.mkdirFn(destinazione, { recursive: true });
      if (!(await esiste(a, d.lstatFn))) {
        await sposta(da, a, d);
        rapporto.spostate.push(nome);
        continue;
      }
      const infoA = await d.lstatFn(a);
      if (infoA.isSymbolicLink() || !infoA.isDirectory()) { rapporto.saltate.push({ percorso: a, motivo: 'destinazione-non-cartella' }); continue; }
      for (const voce of await d.readdirFn(da, { withFileTypes: true })) {
        const vDa = join(da, voce.name);
        const vA = join(a, voce.name);
        const etichetta = `${nome}/${voce.name}`;
        try {
          if (voce.isSymbolicLink()) { rapporto.saltate.push({ percorso: vDa, motivo: 'collegamento' }); continue; }
          if (!(await esiste(vA, d.lstatFn))) {
            await sposta(vDa, vA, d);
            rapporto.unite.push(etichetta);
          } else if (await stessoContenuto(vDa, vA, d)) {
            await d.rmFn(vDa, { recursive: true, force: true });
            rapporto.doppioni.push(etichetta);
          } else {
            rapporto.conflitti.push(etichetta);
          }
        } catch (e) {
          errore(vDa, e);
        }
      }
      if ((await d.readdirFn(da)).length === 0) await d.rmdirFn(da);
    } catch (e) {
      errore(da, e);
    }
  }
  return rapporto;
}

/** Vero se il rapporto dice che è successo qualcosa che vale la pena scrivere nel registro del server. */
export function rapportoDaDire(rapporto) {
  return Boolean(rapporto) && ['spostate', 'unite', 'doppioni', 'conflitti', 'saltate', 'errori'].some((k) => rapporto[k]?.length > 0);
}

/**
 * La funzione che il server passa al registro: dato il percorso di un progetto, restituisce la sua
 * cartella dati, dopo aver migrato (una volta sola per processo) ciò che le versioni precedenti
 * avevano lasciato nel progetto. Le chiamate concorrenti sullo stesso progetto aspettano la STESSA
 * migrazione: nessuna lettura parte prima che i dati siano arrivati.
 * @param {{radiceDati: string, onMigrazione?: (rapporto: object) => void}} opzioni
 */
export function creaCartellaDatiProgetto({ radiceDati, onMigrazione = null, piattaforma = process.platform }, deps = {}) {
  if (typeof radiceDati !== 'string' || radiceDati.length === 0) throw new TypeError('creaCartellaDatiProgetto: serve radiceDati.');
  const realpathFn = deps.realpathFn ?? fsp.realpath;
  const migraFn = deps.migraFn ?? migraDatiGenerati;
  const perProgetto = new Map();
  return async function cartellaDatiDelProgetto(cartellaProgetto) {
    if (typeof cartellaProgetto !== 'string' || cartellaProgetto.length === 0) {
      throw new TypeError('cartellaDatiDelProgetto: serve la cartella del progetto.');
    }
    const canonico = await percorsoCanonico(cartellaProgetto, { realpathFn });
    const chiave = chiaveDelPercorso(senzaSeparatoriInCoda(canonico), piattaforma);
    let promessa = perProgetto.get(chiave);
    if (!promessa) {
      const destinazione = join(radiceDati, nomeCartellaProgetto(canonico, { piattaforma }));
      promessa = Promise.resolve()
        .then(() => migraFn({ progetto: canonico, destinazione }))
        .then((rapporto) => {
          if (typeof onMigrazione === 'function' && rapportoDaDire(rapporto)) onMigrazione(rapporto);
          return destinazione;
        }, (e) => {
          if (typeof onMigrazione === 'function') onMigrazione({ progetto: canonico, destinazione, errori: [{ percorso: canonico, codice: e?.code ?? null, messaggio: e?.message ?? String(e) }] });
          return destinazione;
        });
      perProgetto.set(chiave, promessa);
    }
    return promessa;
  };
}
