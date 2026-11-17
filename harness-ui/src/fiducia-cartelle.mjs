/*
 * Decisioni 173, 189 e 196 (owner 04/11/2026) sul PC: la fiducia della persona nelle cartelle, lato server.
 *
 * «Ti fidi di questa cartella?» si chiede una volta. Con «No» la cartella lavora come in «On request» anche in Accesso pieno (173), lascia
 * fuori le sue istruzioni CLAUDE.md e AGENTS.md (189), non fa partire i suoi ganci e non collega i suoi server MCP né i suoi plugin
 * (196). La fiducia si dà dopo dalla pillola dei permessi, come Codex (`set_project_trust_level`, `thread_processor.rs:1479-1505`).
 *
 * Tre stati per cartella: `true` (fidata), `false` («No»), `null` (mai chiesta: l'interfaccia la chiede; il registro NON concede l'Accesso
 * pieno finché la persona non risponde — falla del 10/11, `pienoNonConcesso` in `session-registry.mjs`; istruzioni e ganci restano). La voce
 * della cartella più vicina vince, come Codex (`trust_level` sul progetto, che vale per le sottocartelle) e VS Code Workspace Trust
 * (fidarsi di una cartella madre vale per le figlie).
 * Giro 2 (giudice v1461, «la via della giunzione»): la chiave è la cartella VERA (`realpath`), non il nome con cui la si raggiunge. Prima un
 * collegamento dentro una cartella fidata prestava il suo «Sì» a una cartella mai chiesta altrove. Come la CLI
 * (`cli/src/security/workspace-identity.ts`), Codex (`normalized_project_trust_keys`, `config/src/loader/mod.rs:1579-1592`: il percorso
 * canonico prima) e Hermes (`skill_utils.py:563-568`, `Path(root).resolve()`). Una cartella che non esiste vale per il suo nome. Il percorso
 * vero si chiede al disco una volta e si ricorda (Performance: a ogni attrezzo si legge la memoria); una risposta svuota il ricordo.
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
import { readFileSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, posix, resolve, win32 } from 'node:path';
import { scriviAtomico } from './research-store.mjs';

export const SCHEMA_FIDUCIA_CARTELLE = 'talos.folder-trust.v1';
const errore = (messaggio) => Object.assign(new Error(messaggio), { code: 'FOLDER_TRUST_INVALID' });
const erroreTroppoLarga = () => Object.assign(new Error('A whole disk, the home folder or a folder above it is never trusted: open the conversation in a project folder.'), { code: 'FOLDER_TRUST_TOO_WIDE' });

/*
 * Controllore 11/11 (c): su Windows `\\?\C:\x` e `\\?\UNC\server\x` (il prefisso dei percorsi lunghi, anche nella forma `\\.\`) sono la
 *   stessa cartella di `C:\x` e `\\server\x`: il prefisso si toglie prima della chiave, anche quando il disco non si legge.
 */
const senzaPrefissoLungo = (cartella) => {
  const s = String(cartella);
  if (/^[\\/]{2}[?.][\\/]UNC[\\/]/iu.test(s)) return `\\\\${s.slice(8)}`;
  return /^[\\/]{2}[?.][\\/]/u.test(s) ? s.slice(4) : s;
};

/** La chiave di una cartella: assoluta, risolta, senza barra finale; su Windows senza maiuscole e con una barra sola. */
function chiaveDi(cartella, piattaforma) {
  const p = piattaforma === 'win32' ? win32 : posix;
  let k = p === win32 ? win32.resolve(senzaPrefissoLungo(cartella)).toLowerCase() : posix.resolve(cartella);
  const radice = p.parse(k).root;
  while (k.length > radice.length && k.endsWith(p.sep)) k = k.slice(0, -1);
  return k;
}
const genitoreDi = (chiave, piattaforma) => {
  const p = piattaforma === 'win32' ? win32 : posix;
  const su = p.dirname(chiave);
  return su === chiave ? null : su;
};

const percorsoVeroDiSerie = (cartella) => realpathSync.native(cartella);
const RICORDATI_MASSIMI = 512;

export function creaFiduciaCartelle({ file, piattaforma = process.platform, avvisa = (m) => console.warn(m), leggiFileFn = readFileSync,
  percorsoVeroFn = percorsoVeroDiSerie, casaFn = homedir } = {}) {
  if (typeof file !== 'string' || !file) throw errore('The folder trust file is required.');
  /** La chiave della cartella VERA: un collegamento (giunzione, symlink) vale per la cartella a cui porta. */
  const ricordati = new Map();
  const chiaveVera = (cartella) => {
    if (ricordati.has(cartella)) return ricordati.get(cartella);
    let vera = cartella;
    try { vera = percorsoVeroFn(cartella) || cartella; } catch { vera = cartella; } // non esiste (ancora): vale il suo nome
    const chiave = chiaveDi(vera, piattaforma);
    if (ricordati.size >= RICORDATI_MASSIMI) ricordati.clear();
    ricordati.set(cartella, chiave);
    return chiave;
  };
  /*
   * Giro 3 (controllore G2-d, giudice v1483): un disco intero, la cartella di casa e le cartelle sopra la casa non sono MAI un bersaglio
   *   della fiducia, da nessuna via (la carta, la rotta, il telefono, `/settings`, il modello): un «sì» lì varrebbe per ogni cartella sotto.
   *   Come Claude Code (`CHANGELOG.md:4739`: nella cartella di casa «trust there is never saved») e Hermes (`agent/lsp/workspace.py:158-161`:
   *   «A repo at or above $HOME never counts»). Una voce così già sul disco vale «mai chiesta» (`carica`).
   */
  const troppoLarga = (chiave) => {
    if (genitoreDi(chiave, piattaforma) === null) return true;
    let casa = null;
    try { const c = casaFn(); casa = typeof c === 'string' && c ? chiaveVera(c) : null; } catch { casa = null; }
    if (!casa) return false;
    const sep = piattaforma === 'win32' ? '\\' : '/';
    return casa === chiave || casa.startsWith(chiave.endsWith(sep) ? chiave : `${chiave}${sep}`);
  };
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
      const scartate = [];
      for (const [cartella, fidata] of Object.entries(letto.cartelle)) {
        if (typeof fidata !== 'boolean' || !isAbsolute(cartella)) continue;
        const chiave = chiaveVera(cartella);
        if (troppoLarga(chiave)) scartate.push(cartella); else voci.set(chiave, { cartella, fidata });
      }
      if (scartate.length) avvisa(`[folder-trust] ${scartate.length} answer(s) on a whole disk or the home folder ignored: they count as never asked`);
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
    for (let k = chiaveVera(cartella); k; k = genitoreDi(k, piattaforma)) {
      if (mappa.has(k)) return mappa.get(k).fidata;
    }
    return illeggibile ? false : null;
  };
  return Object.freeze({
    stato,
    /** Giro 3-bis: un disco intero, la casa o sopra la casa: lì la fiducia si dà solo per la conversazione (il registro), mai qui. */
    troppoLarga: (cartella) => typeof cartella === 'string' && isAbsolute(cartella) && troppoLarga(chiaveVera(cartella)),
    /** `fidata`: true, false, o null per toglierla (si richiede). Risolve quando il file è scritto. */
    async imposta(cartella, fidata, { soloSeMaiChiesta = false } = {}) {
      if (fidata !== true && fidata !== false && fidata !== null) throw errore('Folder trust is true, false or null.');
      if (typeof cartella !== 'string' || !isAbsolute(cartella)) throw errore('The folder must be an absolute path.');
      const turno = fila.then(async () => {
        ricordati.clear(); // un collegamento può essere cambiato: la risposta rilegge il disco
        /* controllore 11/11 (a): la risposta della carta vale solo se la cartella è ancora mai chiesta, controllato DENTRO la fila (due
           finestre che rispondono nello stesso istante: vince la prima, la seconda riceve la decisione vera) */
        if (soloSeMaiChiesta && stato(cartella) !== null) return stato(cartella);
        const mappa = new Map(carica());
        const chiave = chiaveVera(cartella);
        if (fidata !== null && troppoLarga(chiave)) throw erroreTroppoLarga(); // giro 3: togliere (null) pulisce, non concede
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
    ...(typeof store.troppoLarga === 'function' ? { fiduciaTroppoLargaFn: (cartella) => store.troppoLarga(cartella) } : {}), // giro 3-bis
    senzaIstruzioniDelProgettoFn: (cartella) => store.stato(cartella) === false,
  };
}
