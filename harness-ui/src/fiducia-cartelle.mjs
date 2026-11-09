/*
 * Decisioni 173, 189 e 196 (owner 04/11/2026) sul PC: la fiducia della persona nelle cartelle, lato server.
 *
 * «Ti fidi di questa cartella?» si chiede una volta. Con «No» la cartella lavora come in «On request» anche in Accesso pieno (173), lascia
 * fuori le sue istruzioni CLAUDE.md e AGENTS.md (189), non fa partire i suoi ganci e non collega i suoi server MCP né i suoi plugin
 * (196). La fiducia si dà dopo dalla pillola dei permessi, come Codex (`set_project_trust_level`, `thread_processor.rs:1479-1505`).
 *
 * Tre stati per cartella: `true` (fidata), `false` («No»), `null` (mai chiesta: l'interfaccia la chiede prima di mandare; il registro la
 * tratta come fidata, contratto R2-F2). La voce della cartella più vicina vince, come Codex (`trust_level` sul progetto, che vale per le
 * sottocartelle) e VS Code Workspace Trust (fidarsi di una cartella madre vale per le figlie).
 *
 * ⛔ Condizione di Performance (forma permessi 2, 04/11/2026): il registro chiede la fiducia a ogni attrezzo; qui si legge SOLO la memoria.
 *   Il file si legge una volta (alla prima domanda) e si riscrive quando la persona risponde: temporaneo + rinomina (`scriviAtomico`), in
 *   fila (come `impostazioni-contesto.mjs`).
 * ⛔ Un file illeggibile vale «non fidata» per ogni cartella non impostata da questo processo, come l'errore della fonte nel registro
 *   (`cartellaNonFidata`): mai istruzioni, ganci o Accesso pieno di una cartella che non si è potuta dire fidata. La prossima risposta lo
 *   riscrive.
 * ⛔ Non è la fiducia della CLI (`cli/src/security/project-trust.ts`, che fissa anche l'impronta di ogni gancio e server): due ospiti, due
 *   archivi, la stessa regola. Sul telefono il server non la usa (contratto del 29/10, «CLI e telefono non cambiano»).
 */
import { readFileSync } from 'node:fs';
import { dirname, isAbsolute, posix, resolve, win32 } from 'node:path';
import { scriviAtomico } from './research-store.mjs';

export const SCHEMA_FIDUCIA_CARTELLE = 'talos.folder-trust.v1';
const errore = (messaggio) => Object.assign(new Error(messaggio), { code: 'FOLDER_TRUST_INVALID' });

/** La chiave di una cartella: assoluta, risolta, senza barra finale; su Windows senza maiuscole e con una barra sola. */
function chiaveDi(cartella, piattaforma) {
  const p = piattaforma === 'win32' ? win32 : posix;
  let k = p === win32 ? win32.resolve(cartella).toLowerCase() : posix.resolve(cartella);
  const radice = p.parse(k).root;
  while (k.length > radice.length && k.endsWith(p.sep)) k = k.slice(0, -1);
  return k;
}
const genitoreDi = (chiave, piattaforma) => {
  const p = piattaforma === 'win32' ? win32 : posix;
  const su = p.dirname(chiave);
  return su === chiave ? null : su;
};

export function creaFiduciaCartelle({ file, piattaforma = process.platform, avvisa = (m) => console.warn(m), leggiFileFn = readFileSync } = {}) {
  if (typeof file !== 'string' || !file) throw errore('The folder trust file is required.');
  /** chiave → { cartella (come la persona l'ha data), fidata } */
  let voci = null;
  let illeggibile = false;
  let fila = Promise.resolve();
  const carica = () => {
    if (voci) return voci;
    voci = new Map();
    let testo = null;
    try { testo = leggiFileFn(file, 'utf8'); } catch (e) {
      if (e?.code !== 'ENOENT') { illeggibile = true; avvisa(`[folder-trust] ${file} cannot be read (${e?.code ?? e}): every folder counts as not trusted until it is answered again`); }
      return voci;
    }
    try {
      const letto = JSON.parse(testo);
      if (letto?.schema !== SCHEMA_FIDUCIA_CARTELLE || !letto.cartelle || typeof letto.cartelle !== 'object') throw new Error('schema');
      for (const [cartella, fidata] of Object.entries(letto.cartelle)) {
        if (typeof fidata === 'boolean' && isAbsolute(cartella)) voci.set(chiaveDi(cartella, piattaforma), { cartella, fidata });
      }
    } catch {
      illeggibile = true;
      avvisa(`[folder-trust] ${file} is unreadable: every folder counts as not trusted until it is answered again`);
    }
    return voci;
  };
  /** true | false | null, dalla memoria. */
  const stato = (cartella) => {
    if (typeof cartella !== 'string' || !cartella) return null;
    const mappa = carica();
    for (let k = chiaveDi(cartella, piattaforma); k; k = genitoreDi(k, piattaforma)) {
      if (mappa.has(k)) return mappa.get(k).fidata;
    }
    return illeggibile ? false : null;
  };
  return Object.freeze({
    stato,
    /** `fidata`: true, false, o null per toglierla (si richiede). Risolve quando il file è scritto. */
    async imposta(cartella, fidata) {
      if (fidata !== true && fidata !== false && fidata !== null) throw errore('Folder trust is true, false or null.');
      if (typeof cartella !== 'string' || !isAbsolute(cartella)) throw errore('The folder must be an absolute path.');
      const turno = fila.then(async () => {
        const mappa = new Map(carica());
        const chiave = chiaveDi(cartella, piattaforma);
        if (fidata === null) mappa.delete(chiave); else mappa.set(chiave, { cartella: resolve(cartella), fidata });
        const cartelle = Object.fromEntries([...mappa.values()].map((v) => [v.cartella, v.fidata]));
        await scriviAtomico(file, `${JSON.stringify({ schema: SCHEMA_FIDUCIA_CARTELLE, cartelle }, null, 2)}\n`);
        voci = mappa;
        illeggibile = false;
        return stato(cartella);
      });
      fila = turno.catch(() => {});
      return turno;
    },
    elenco: () => [...carica().values()].map((v) => ({ ...v })),
    cartellaDelFile: () => dirname(file),
  });
}

/**
 * Le due funzioni che il server passa al registro (189: insieme). Sul telefono nessuna: il suo server non chiede la fiducia.
 * `senzaIstruzioniDelProgettoFn` vale solo per il «No» esplicito; «mai chiesta» tiene le istruzioni, come oggi.
 */
export function opzioniFiduciaPerIlRegistro(store, { telefono = false } = {}) {
  if (!store || telefono) return {};
  return {
    fiduciaDellaCartellaFn: (cartella) => store.stato(cartella),
    senzaIstruzioniDelProgettoFn: (cartella) => store.stato(cartella) === false,
  };
}
