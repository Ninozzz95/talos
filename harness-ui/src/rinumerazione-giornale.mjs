// @ts-check
/*
 * ⛔⛔⛔ 14/11/2026 — TERZO GIRO, «MAI RISCRIVERE» (scelta dell'owner, giudice v1838): il prodotto NON chiama più `rinumeraGiornale`
 *   (né la porta `rinumeraDoppiDelGiornale` dello store). I numeri li dà la lettura (`numeraLaVista`, regola V, più sotto) e il diario
 *   cresce solo in coda (righe «adozione»). La riscrittura resta qui, con le sue prove, solo come storia del pezzo 4: chi la volesse
 *   riaccendere deve rifare la domanda all'owner (perde le righe di chi scrive senza affitto nel momento del `rename`, revisore 2).
 */
/*
 * ⭐⭐⭐ 13/11/2026 — LA RINUMERAZIONE DEI GIORNALI GIÀ SPORCHI (pezzo 4 della cura dell'affitto compromesso; regola approvata dal giudice
 *   v1779, `in-corso/REGOLA-RINUMERAZIONE-AFFITTO-COMPROMESSO-2026-11-12.md`). Prima dei pezzi 1-3 un processo fermo oltre la scadenza
 *   dell'affitto poteva scrivere coi numeri d'ordine già usati da un altro (`[1..7, 3, 4]`, REV-A14): i lettori curati li tengono
 *   nell'ordine del disco, ma i numeri doppi restano sul disco e confondono chi si ricollega col numero vecchio.
 *
 *   LA REGOLA. Si legge il giornale nell'ordine delle righe. Finché non si incontra un numero GIÀ VISTO niente cambia (anche le righe
 *   fuori ordine senza doppi, 28, 27, 29). Dal primo doppio in poi OGNI riga che ha un numero prende il più alto visto fin lì più uno,
 *   nell'ordine del disco; le righe senza numero non si toccano. Nessun doppio dopo, l'ordine resta quello di scrittura, i numeri
 *   della parte sana restano gli stessi (i cursori sotto il primo doppio restano validi).
 *
 *   LA RISCRITTURA, ognuna con la sua prova (`tests/affitto-rinumerazione.test.mjs`):
 *   1. copia accanto in creazione ESCLUSIVA (`COPYFILE_EXCL`: mai sopra una copia esistente), prima sotto `<copia>.da-verificare`
 *      (13/11/2026, vedi `rinumeraGiornale`). ⛔ Nell'ora ISO `:` e `.` diventano `-`, come la copia `.bak-` della coda spezzata
 *      (`session-store.mjs`, `marcaTemporale`): Windows non ammette `:` in un nome di file;
 *   2. VERIFICA: copia e originale con la stessa dimensione e la stessa SHA-256, lette a stream (un giornale da 55 MB non sta in una
 *      stringa per niente); solo dopo la copia prende il nome `<id>.jsonl.prima-della-rinumerazione-<ora ISO>`;
 *   3. il giornale nuovo su un temporaneo `<id>.jsonl.<uuid>.rinumerazione` aperto in `wx`, scritto a blocchi (il flush dei nostri
 *      blocchi), poi `fsync` del temporaneo PRIMA del `rename` (giudice v1779) e chiusura;
 *   4. se il giornale è cambiato di dimensione nel frattempo, niente rename (non dovrebbe: si lavora nella coda del percorso e con
 *      l'affitto in mano, ma il controllo costa una `stat`);
 *   5. `rename` sopra il giornale coi ritentativi brevi su EPERM/EBUSY/EACCES (antivirus che tiene il file), come la coda spezzata.
 *   Qualunque errore ⇒ resta il giornale di prima, la copia non si tocca, il temporaneo nostro si toglie, e chi chiama legge la chat
 *   com'è coi lettori già curati (i doppi nell'ordine del disco). Questa funzione non lancia: ritorna l'esito.
 *
 *   ⛔ Le righe che non cambiano si riscrivono coi LORO byte (anche `\r`, righe vuote, l'ultima senza `\n`); solo le righe rinumerate
 *   si riserializzano (`JSON.stringify` dell'oggetto letto con il numero nuovo al suo posto: la chiave resta dov'era).
 *
 *   Concorrenti letti alla fonte (13/11/2026): Hermes riscrive i file con temporaneo + flush + fsync + replace
 *   (`hermes-agent-2026-11-01/utils.py:410-412`, «f.flush() / os.fsync(f.fileno()) / atomic_replace(tmp_path, path)»); DeepSeek tronca
 *   solo la coda spezzata e non rinumera (`deepseek-harness-2026-10-02/packages/session/session-persistence-jsonl/src/storage.ts:328-329`,
 *   `truncateTornTail`); opencode rende i doppi impossibili con un indice unico (`opencode-2026-10-15/packages/core/src/event/sql.ts:23`);
 *   Codex salta le righe rotte (`codex-2026-11-01/codex-rs/rollout/src/ordinal.rs:71`); pi non ha numeri (`session-manager.ts:279`).
 *   Nessuno rinumera un giornale già scritto: è una riparazione nostra, per questo la copia accanto verificata è obbligatoria.
 *   Doc Node v24 (ctx7 `/websites/nodejs_latest-v24_x_api`, 13/11/2026): `filehandle.sync()` «Request that all data for the open file
 *   descriptor is flushed to the storage device»; `fs.copyFile` «By using COPYFILE_EXCL, the operation will fail if destination exists».
 */
import { constants as fsConstants, createReadStream } from 'node:fs';
import * as fsp from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { rigaJson } from './kernel/riga-json.mjs';

const RITENTATIVI_RENAME = [0, 20, 60, 120, 250];
const CODICI_TRANSITORI = new Set(['EPERM', 'EBUSY', 'EACCES']);
const BLOCCO_SCRITTURA = 1024 * 1024;
const attendi = (ms) => new Promise((risolvi) => setTimeout(risolvi, ms));

/**
 * Il numeratore della regola, una riga alla volta nell'ordine del disco.
 * `prossimo(numero)`: il numero da scrivere (lo stesso finché non c'è stato un doppio; dopo, il più alto visto + 1); un valore che
 * non è un intero sicuro (riga senza numero) torna com'è e non prende numero.
 */
export function creaNumeratore() {
  const visti = new Set();
  let massimo = 0;
  let sporco = false;
  return {
    get sporco() { return sporco; },
    get massimo() { return massimo; },
    /** @param {unknown} numero */
    prossimo(numero) {
      if (!Number.isSafeInteger(numero)) return numero;
      const n = /** @type {number} */ (numero);
      if (!sporco && !visti.has(n)) {
        visti.add(n);
        if (visti.size === 1 || n > massimo) massimo = n;
        return n;
      }
      sporco = true;
      massimo += 1;
      return massimo;
    },
  };
}

/** I record già letti (nell'ordine del disco) hanno un numero d'ordine GIÀ VISTO? Il ripristino lo chiede prima di chiamare la porta. @param {any[]} records */
export function haNumeriDoppi(records) {
  const numeratore = creaNumeratore();
  for (const record of records) {
    numeratore.prossimo(record && typeof record === 'object' ? record._sequenza : undefined);
    if (numeratore.sporco) return true;
  }
  return false;
}

/**
 * 13/11/2026 sera (giudice v1804 punto 2): le soglie dei cursori scritte nelle righe «recuperata» del giornale. Ogni riga dice da
 * quale numero vecchio in su un cursore è ambiguo (`value.soglia`) e vale fino a sé esclusa (`fino` = il suo numero): chi ha già
 * visto la riga ha i numeri nuovi. Le righe senza soglia (di prima, o di un altro avviso) non contano.
 * @param {any[]} eventi @returns {{ soglia: number, fino: number | null }[]}
 */
export function intervalliDellaRinumerazione(eventi) {
  const intervalli = [];
  for (const evento of eventi ?? []) {
    if (evento?.type !== 'CUSTOM' || evento.name !== 'talos.journal-riparato') continue;
    const soglia = evento.value?.soglia;
    if (!Number.isSafeInteger(soglia) || soglia < 1 || !Number.isSafeInteger(evento._sequenza) || evento._sequenza <= soglia) continue;
    intervalli.push({ soglia, fino: evento._sequenza });
  }
  return intervalli;
}

/** La soglia più bassa fra gli intervalli che contengono il cursore (`soglia ≤ cursore < fino`), o `null`. */
export function sogliaDellaRinumerazione(intervalli, daSequenza) {
  if (!Array.isArray(intervalli) || !Number.isSafeInteger(daSequenza)) return null;
  let soglia = null;
  for (const intervallo of intervalli) {
    if (daSequenza < intervallo.soglia || (intervallo.fino !== null && daSequenza >= intervallo.fino)) continue;
    soglia = soglia === null ? intervallo.soglia : Math.min(soglia, intervallo.soglia);
  }
  return soglia;
}

/** La regola sui soli numeri (le prove dei tre esempi). @param {unknown[]} numeri */
export function rinumeraNumeri(numeri) {
  const numeratore = creaNumeratore();
  return numeri.map((n) => numeratore.prossimo(n));
}

/**
 * ⭐⭐⭐ 14/11/2026 — LA REGOLA V: IL NUMERO LO DÀ LA LETTURA, IL FILE NON SI RISCRIVE MAI (terzo giro dell'affitto, «mai riscrivere»,
 *   scelta dell'owner, giudice v1838; forma `in-corso/FORMA-AFFITTO-MAI-RISCRIVERE-2026-11-14.md`). Il revisore 2 ha misurato che la
 *   riscrittura qui sotto (`rinumeraGiornale`: copia, temporaneo, `rename`) perde le righe di chi scrive senza affitto nel momento del
 *   `rename` (51 su 2308, forma «tutti»), lascia 21 copie da 63,6 MB e fa prendere EBUSY all'altro durante la copia (1286/1619). Il
 *   ripristino non la chiama più: i numeri si ricavano dal contenuto, uguali in ogni processo e dopo ogni riavvio.
 *   `voci`: le righe numerate e le righe «adozione», nell'ordine del disco, `{ inizio, record }` (`inizio` = byte d'inizio della riga).
 *   1) Ogni riga «adozione» `{tipo:'adozione', inizi, primo}` (scritta dallo store in coda, mai sopra niente) dà alla riga numerata
 *      PRIMA di lei che comincia al byte `inizi[p]` il numero `primo + p`; una riga già presa resta alla prima adozione.
 *   2) Le altre, nell'ordine del disco: il loro numero se nessuno l'ha preso, se no il primo libero sopra il più alto visto fin lì.
 *   Sui giornali senza doppi e senza adozioni non cambia niente (anche `28, 27, 29`); sui tre esempi del pezzo 4 dà gli stessi numeri.
 *   Senza `inizio` (una lettura finta delle prove) le adozioni non si applicano.
 *   Concorrenti letti alla fonte (14/11/2026): Codex non riscrive mai il rollout, lo apre solo in aggiunta
 *   (`codex-2026-11-01/codex-rs/rollout/src/recorder.rs:1804-1806`, `.append(true)`); opencode fa nascere il numero dall'ultimo
 *   (`opencode-2026-10-15/packages/core/src/bus.ts:371`); DeepSeek rifiuta un numero che non segue (`storage-contract.ts:147`).
 * @param {{ inizio?: number, record: any }[]} voci
 * @returns {Map<number, number>} indice in `voci` → numero della vista (solo le righe numerate)
 */
export function numeraLaVista(voci) {
  /** @type {Map<number, number>} */
  const numero = new Map();
  const usati = new Set();
  const numerata = (i) => Number.isSafeInteger(voci[i]?.record?._sequenza);
  /** byte d'inizio → indice in `voci`, solo le righe numerate: un'adozione guarda solo le righe PRIMA di lei */
  const perInizio = new Map();
  for (let j = 0; j < voci.length; j += 1) {
    const inizio = voci[j]?.inizio;
    if (!Number.isSafeInteger(inizio)) continue;
    const ad = voci[j].record;
    if (numerata(j)) { perInizio.set(inizio, j); continue; }
    if (!eRigaDiAdozione(ad)) continue;
    /* la p-esima riga elencata prende `primo + p` (lo stesso conto dello store); una riga già presa da un'adozione prima resta sua */
    ad.inizi.forEach((inizioAdottato, p) => {
      const i = perInizio.get(inizioAdottato);
      if (i === undefined || numero.has(i)) return;
      numero.set(i, ad.primo + p);
      usati.add(ad.primo + p);
    });
  }
  let massimo = 0;
  for (let i = 0; i < voci.length; i += 1) {
    if (!numerata(i)) continue;
    if (!numero.has(i)) {
      let n = voci[i].record._sequenza;
      if (usati.has(n)) { n = massimo + 1; while (usati.has(n)) n += 1; }
      usati.add(n);
      numero.set(i, n);
    }
    massimo = Math.max(massimo, /** @type {number} */ (numero.get(i)));
  }
  return numero;
}

/** Una riga «adozione» ben formata? @param {any} record */
export function eRigaDiAdozione(record) {
  return Boolean(record) && typeof record === 'object' && record.tipo === 'adozione' && !Number.isSafeInteger(record._sequenza)
    && Array.isArray(record.inizi) && record.inizi.length > 0 && record.inizi.every((x) => Number.isSafeInteger(x) && x >= 0)
    && Number.isSafeInteger(record.primo) && record.primo > 0;
}

/** Applica la regola V ai record (cambia `_sequenza` sul posto). Ritorna quante righe hanno un numero diverso da quello scritto. @param {{ inizio?: number, record: any }[]} voci */
export function applicaLaVista(voci) {
  let cambiate = 0;
  for (const [i, n] of numeraLaVista(voci)) {
    if (voci[i].record._sequenza !== n) { voci[i].record._sequenza = n; cambiate += 1; }
  }
  return cambiate;
}

/**
 * Le righe del file come Buffer, divise SOLO su `\n` (U+2028 non spezza), ognuna con `terminata` (aveva il suo `\n`).
 * @param {string} percorso
 * @param {typeof createReadStream} createReadStreamFn
 */
async function* righeDelFile(percorso, createReadStreamFn) {
  /** @type {Buffer[]} */
  let pezzi = [];
  for await (const pezzo of createReadStreamFn(percorso)) {
    const blocco = /** @type {Buffer} */ (pezzo);
    let inizio = 0;
    for (let fine = blocco.indexOf(10); fine !== -1; fine = blocco.indexOf(10, inizio)) {
      pezzi.push(blocco.subarray(inizio, fine));
      yield { riga: pezzi.length === 1 ? pezzi[0] : Buffer.concat(pezzi), terminata: true };
      pezzi = [];
      inizio = fine + 1;
    }
    if (inizio < blocco.length) pezzi.push(blocco.subarray(inizio));
  }
  if (pezzi.length) yield { riga: Buffer.concat(pezzi), terminata: false };
}

/** Il record di una riga, `undefined` se vuota, `null` se non è JSON. @param {Buffer} riga */
function recordDi(riga) {
  const testo = riga.toString('utf8');
  if (testo.trim() === '') return undefined;
  try { return JSON.parse(testo); } catch { return null; }
}
/** @param {any} record */
const numeroDi = (record) => (record && typeof record === 'object' && !Array.isArray(record) ? record._sequenza : undefined);

/**
 * C'è un doppio? Si ferma al primo. `illeggibile` se una riga non è JSON (un giornale così non si riscrive: lo dice la lettura).
 * @param {string} percorso
 * @param {typeof createReadStream} createReadStreamFn
 */
async function cercaPrimoDoppio(percorso, createReadStreamFn) {
  const numeratore = creaNumeratore();
  for await (const { riga } of righeDelFile(percorso, createReadStreamFn)) {
    const record = recordDi(riga);
    if (record === null) return { doppio: false, illeggibile: true };
    numeratore.prossimo(numeroDi(record));
    if (numeratore.sporco) return { doppio: true, illeggibile: false };
  }
  return { doppio: false, illeggibile: false };
}

/** @param {string} percorso @param {typeof createReadStream} createReadStreamFn */
function sha256DelFile(percorso, createReadStreamFn) {
  return new Promise((risolvi, rifiuta) => {
    const hash = createHash('sha256');
    const input = createReadStreamFn(percorso);
    input.on('data', (pezzo) => hash.update(pezzo));
    input.on('error', rifiuta);
    input.on('end', () => risolvi(hash.digest('hex')));
  });
}

/** @param {Date} quando */
function marcaTemporale(quando) {
  return quando.toISOString().replace(/[:.]/g, '-');
}
/** @param {any} errore */
const testoErrore = (errore) => `${errore?.code ? `${errore.code}: ` : ''}${errore?.message ?? String(errore)}`;

/**
 * @typedef {object} DipendenzeRinumerazione
 * @property {() => Date} [oraFn]
 * @property {(src: string, dst: string, modo: number) => Promise<void>} [copyFileFn]
 * @property {(p: string) => Promise<{ size: number }>} [statFn]
 * @property {(p: string) => Promise<string>} [improntaFn]
 * @property {(p: string, flags: string) => Promise<import('node:fs/promises').FileHandle>} [openFn]
 * @property {(fh: import('node:fs/promises').FileHandle, buf: Buffer, percorso: string) => Promise<unknown>} [scriviFn]
 * @property {(fh: import('node:fs/promises').FileHandle) => Promise<void>} [fsyncFn]
 * @property {(da: string, a: string) => Promise<void>} [renameFn]
 * @property {(p: string) => Promise<void>} [unlinkFn]
 * @property {typeof createReadStream} [createReadStreamFn]
 */

/**
 * @typedef {object} OpzioniRinumerazione
 * @property {((r: { copia: string, righeRinumerate: number, righeDoppie: number, sogliaVecchia: number, primoNuovo: number, ultimaSequenza: number }) => object | null) | null} [rigaFinale]
 *   13/11/2026 (giudice v1804 punto 2): il record della riga «recuperata», scritto IN CODA al giornale rinumerato, dentro il temporaneo,
 *   PRIMA del fsync e del rename, col numero dopo l'ultimo: diventa visibile insieme al giornale, mai dopo. Un crash fra il rename e
 *   una scrittura a parte non la può più perdere (prima: 0 righe su 24 crash del revisore).
 */

/* esiste? (un nome già preso non si tocca mai) */
const esiste = async (/** @type {string} */ p) => { try { await fsp.lstat(p); return true; } catch (errore) { if (/** @type {any} */ (errore)?.code === 'ENOENT') return false; throw errore; } };

/**
 * Rinumera il giornale `percorso` secondo la regola. Chi chiama tiene l'affitto e la coda del percorso (la porta è
 * `rinumeraDoppiDelGiornale` dello store). Non lancia.
 *
 * ⭐ 13/11/2026 — LA COPIA ACCANTO NON PORTA MAI IL NOME BUONO PRIMA DI ESSERE VERIFICATA (giudice v1804 punto 3, limite v1805). Prima la
 *   copia si scriveva direttamente col nome `…prima-della-rinumerazione-<ora>`: un crash o un disco pieno a metà copia lasciava una copia a
 *   metà col nome di una copia buona, e l'esito diceva `copia: null`. Ora si copia su `<copia>.da-verificare` (creazione esclusiva), si
 *   verifica (dimensione e SHA-256), e SOLO allora prende il nome buono (`rename`, mai sopra un nome già preso). Una copia che fallisce:
 *   a metà (l'errore della copia con dei byte scritti, o la dimensione diversa) si SEGNA `<copia>.a-meta` e l'esito la dichiara
 *   (`copiaAMeta`); non verificata per un altro motivo resta `.da-verificare` (`copiaDaVerificare`). ⛔ Mai tolta, mai usata come buona.
 * @param {string} percorso
 * @param {DipendenzeRinumerazione & { rinominaCopiaFn?: (da: string, a: string) => Promise<void> }} [deps]
 * @param {OpzioniRinumerazione} [opzioni]
 * @returns {Promise<{ rinumerato: true, copia: string, righeRinumerate: number, righeDoppie: number, sogliaVecchia: number, primoNuovo: number, ultimaSequenza: number, byte: number, rigaScritta: boolean }
 *   | { rinumerato: false, motivo?: string, fase?: string, errore?: string, copia?: string | null, copiaAMeta?: string, copiaDaVerificare?: string }>}
 */
export async function rinumeraGiornale(percorso, deps = {}, { rigaFinale = null } = {}) {
  const oraFn = deps.oraFn ?? (() => new Date());
  const copyFileFn = deps.copyFileFn ?? fsp.copyFile;
  const statFn = deps.statFn ?? fsp.stat;
  const createReadStreamFn = deps.createReadStreamFn ?? createReadStream;
  const improntaFn = deps.improntaFn ?? ((p) => sha256DelFile(p, createReadStreamFn));
  const openFn = deps.openFn ?? fsp.open;
  const scriviFn = deps.scriviFn ?? ((fh, buf) => fh.write(buf));
  const fsyncFn = deps.fsyncFn ?? ((fh) => fh.sync());
  const renameFn = deps.renameFn ?? fsp.rename;
  const rinominaCopiaFn = deps.rinominaCopiaFn ?? fsp.rename;
  const unlinkFn = deps.unlinkFn ?? fsp.unlink;

  let cercato;
  try { cercato = await cercaPrimoDoppio(percorso, createReadStreamFn); }
  catch (errore) { return { rinumerato: false, fase: 'lettura', errore: testoErrore(errore), copia: null }; }
  if (cercato.illeggibile) return { rinumerato: false, motivo: 'riga-illeggibile' };
  if (!cercato.doppio) return { rinumerato: false, motivo: 'senza-doppi' };

  // 1. la copia accanto: esclusiva, prima sotto il nome «da verificare»
  const copia = `${percorso}.prima-della-rinumerazione-${marcaTemporale(oraFn())}`;
  const daVerificare = `${copia}.da-verificare`;
  /* la copia a metà si SEGNA (mai tolta): `<copia>.a-meta`; se nemmeno questo riesce resta `.da-verificare`, dichiarata lo stesso */
  const segnaAMeta = async () => {
    try { if (!(await esiste(daVerificare))) return null; } catch { return daVerificare; }
    const aMeta = `${copia}.a-meta`;
    try { if (await esiste(aMeta)) return daVerificare; await rinominaCopiaFn(daVerificare, aMeta); return aMeta; }
    catch { return daVerificare; }
  };
  try {
    if (await esiste(copia) || await esiste(daVerificare)) {
      return { rinumerato: false, fase: 'copia', errore: `EEXIST: a copy named ${copia} is already there, never overwritten`, copia: null };
    }
  } catch (errore) { return { rinumerato: false, fase: 'copia', errore: testoErrore(errore), copia: null }; }
  try { await copyFileFn(percorso, daVerificare, fsConstants.COPYFILE_EXCL); }
  catch (errore) {
    const aMeta = await segnaAMeta();
    return { rinumerato: false, fase: 'copia', errore: testoErrore(errore), copia: null, ...(aMeta ? { copiaAMeta: aMeta } : {}) };
  }

  // 2. la verifica: stessa dimensione e stessa SHA-256; poi, solo poi, il nome buono
  let dimensione;
  try {
    const [originale, copiata] = await Promise.all([statFn(percorso), statFn(daVerificare)]);
    if (originale.size !== copiata.size) {
      const aMeta = await segnaAMeta();
      return { rinumerato: false, fase: 'verifica', errore: `size ${originale.size} vs copy ${copiata.size}`, copia: null, ...(aMeta ? { copiaAMeta: aMeta } : {}) };
    }
    const [improntaOriginale, improntaCopia] = await Promise.all([improntaFn(percorso), improntaFn(daVerificare)]);
    if (improntaOriginale !== improntaCopia) return { rinumerato: false, fase: 'verifica', errore: 'SHA-256 of the copy differs', copia: null, copiaDaVerificare: daVerificare };
    dimensione = originale.size;
  } catch (errore) {
    return { rinumerato: false, fase: 'verifica', errore: testoErrore(errore), copia: null, copiaDaVerificare: daVerificare };
  }
  try {
    if (await esiste(copia)) throw Object.assign(new Error(`a copy named ${copia} appeared meanwhile, never overwritten`), { code: 'EEXIST' });
    await rinominaCopiaFn(daVerificare, copia);
  } catch (errore) {
    return { rinumerato: false, fase: 'copia', errore: testoErrore(errore), copia: null, copiaDaVerificare: daVerificare };
  }

  // 3. il temporaneo: blocchi, fsync, chiusura
  const temporaneo = `${percorso}.${randomUUID()}.rinumerazione`;
  /** @type {import('node:fs/promises').FileHandle | null} */
  let fh = null;
  let fase = 'scrittura';
  const numeratore = creaNumeratore();
  const numeriVisti = new Set(); // i numeri VECCHI già visti: le righe che ne riusano uno sono quelle «scritte nello stesso momento da un altro TALOS»
  let righeRinumerate = 0;
  let righeDoppie = 0;
  let sogliaVecchia = Infinity;
  let primoNuovo = 0;
  let ultimaSequenza = 0;
  let byte = 0;
  let rigaScritta = false;
  try {
    fh = await openFn(temporaneo, 'wx');
    /** @type {Buffer[]} */
    let blocchi = [];
    let inBlocco = 0;
    const svuota = async () => {
      if (!inBlocco || !fh) return;
      const buf = blocchi.length === 1 ? blocchi[0] : Buffer.concat(blocchi, inBlocco);
      blocchi = []; inBlocco = 0;
      await scriviFn(fh, buf, percorso);
      byte += buf.length;
    };
    const accoda = async (/** @type {Buffer} */ buf) => {
      blocchi.push(buf); inBlocco += buf.length;
      if (inBlocco >= BLOCCO_SCRITTURA) await svuota();
    };
    let ultimaTerminata = true;
    for await (const { riga, terminata } of righeDelFile(percorso, createReadStreamFn)) {
      const record = recordDi(riga);
      if (record === null) throw Object.assign(new Error('a line is not JSON'), { code: 'RIGA_ILLEGGIBILE' });
      const vecchio = numeroDi(record);
      const nuovo = numeratore.prossimo(vecchio);
      let uscita = riga;
      ultimaTerminata = terminata;
      if (Number.isSafeInteger(vecchio)) {
        if (numeriVisti.has(vecchio)) righeDoppie += 1;
        else numeriVisti.add(vecchio);
        ultimaSequenza = Math.max(ultimaSequenza, /** @type {number} */ (nuovo));
        if (nuovo !== vecchio) { // dopo il primo doppio un numero può restare uguale (`[1,2,1,4]`: il 4 resta 4): quella riga non cambia
          if (righeRinumerate === 0) primoNuovo = /** @type {number} */ (nuovo);
          righeRinumerate += 1;
          sogliaVecchia = Math.min(sogliaVecchia, /** @type {number} */ (vecchio));
          record._sequenza = nuovo;
          const cr = riga.length > 0 && riga[riga.length - 1] === 13;
          uscita = Buffer.from(JSON.stringify(record) + (cr ? '\r' : ''), 'utf8');
        }
      }
      await accoda(uscita);
      if (terminata) await accoda(Buffer.from([10]));
    }
    /* la riga «recuperata» in coda, nello stesso temporaneo: col numero dopo l'ultimo, e la soglia dei cursori dentro (giudice v1804 punto 2) */
    const finale = typeof rigaFinale === 'function'
      ? rigaFinale({ copia, righeRinumerate, righeDoppie, sogliaVecchia, primoNuovo, ultimaSequenza })
      : null;
    if (finale && typeof finale === 'object') {
      if (!ultimaTerminata) await accoda(Buffer.from([10]));
      ultimaSequenza += 1;
      await accoda(Buffer.from(rigaJson({ ...finale, _sequenza: ultimaSequenza }), 'utf8'));
      rigaScritta = true;
    }
    await svuota();
    fase = 'fsync';
    await fsyncFn(fh);
    fase = 'chiusura';
    await fh.close();
    fh = null;
    fase = 'cambiato';
    const adesso = await statFn(percorso);
    if (adesso.size !== dimensione) throw Object.assign(new Error(`the journal changed meanwhile (${dimensione} → ${adesso.size} bytes)`), { code: 'JOURNAL_CHANGED' });
    // 5. il rename, coi ritentativi brevi
    fase = 'rename';
    let ultimoErrore = null;
    for (const pausa of RITENTATIVI_RENAME) {
      if (pausa) await attendi(pausa);
      try { await renameFn(temporaneo, percorso); ultimoErrore = null; break; }
      catch (errore) {
        ultimoErrore = errore;
        if (!CODICI_TRANSITORI.has(/** @type {any} */ (errore)?.code)) break;
      }
    }
    if (ultimoErrore) throw ultimoErrore;
  } catch (errore) {
    if (fh) { try { await fh.close(); } catch { /* già chiuso o guasto: il temporaneo si toglie lo stesso */ } }
    try { await unlinkFn(temporaneo); } catch { /* nome unico, mai letto dal ripristino */ }
    return { rinumerato: false, fase, errore: testoErrore(errore), copia };
  }
  return { rinumerato: true, copia, righeRinumerate, righeDoppie, sogliaVecchia, primoNuovo, ultimaSequenza, byte, rigaScritta };
}
