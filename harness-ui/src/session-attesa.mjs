/*
 * ⭐⭐⭐ 14/11/2026 — IL FILE DI ATTESA DI UNA CHAT (sesto giro dell'affitto, owner 16:26 «attesa su disco», giudice v1888-v1889).
 *   Una riga che questo TALOS non può scrivere nel diario perché un ALTRO TALOS tiene la chat (`SESSION_LEASED`) non si perde più e
 *   non vive solo in memoria: va in un file ACCANTO al diario, `<id>.attesa` (mai dentro il diario, mai riscrivendolo), e si adotta in
 *   coda al diario quando la chat si libera, anche dopo un riavvio.
 *   Condizioni del giudice v1888, vincolanti, tutte qui:
 *   · il file si scrive SOLO in aggiunta (`openSync(…, 'a')`), una scrittura per volta e `fsyncSync` prima di chiudere; non si apre mai
 *     in scrittura, non si tronca, non si rinomina, non si svuota: nessuna funzione di questo modulo lo fa;
 *   · dopo l'adozione si AGGIUNGE allo stesso file una riga «adottata» con l'identità della riga: un arresto fra la scrittura nel diario e
 *     quella riga non la scrive due volte, perché la lettura confronta anche col diario (la riga adottata porta `_attesa: <id>`).
 *   Righe del file (JSON, una per riga, divise SOLO su `\n` come il diario):
 *     {"tipo":"attesa","id":"<uuid>","alle":"<iso>","record":{…l'evento, senza numero d'ordine…}}
 *     {"tipo":"adottata","id":"<uuid>","alle":"<iso>","sequenza":N}
 *   Nome senza `.jsonl`: l'elenco delle chat (`elencaSessioniPersistite`) e gli avanzi della rinumerazione (`.jsonl.`) non lo vedono.
 *   ⛔ Giudice v1889: il file non si svuota mai, quindi cresce; il riordino eventuale è un lavoro a parte che decide l'owner.
 *   Doc Node v24 (ctx7 `/websites/nodejs_latest-v24_x_api`, 14/11/2026): `fs.fsyncSync(fd)` «Request that all data for the open file
 *   descriptor is flushed to the storage device»; il flag 'a' apre in accodamento (su Windows libuv chiede `FILE_APPEND_DATA`: ogni
 *   scrittura va in fondo, anche con due processi).
 *   Concorrenti alla fonte: Codex tiene il resto non scritto e lo riprova, ma IN MEMORIA (`codex-2026-11-01/codex-rs/rollout/src/
 *   recorder.rs:1828-1830` «keep the unwritten suffix so the next barrier can reopen the file and retry»): un arresto lo perde; qui sta
 *   sul disco. Hermes rifiuta e basta (`hermes-agent-2026-11-01/hermes_state_messages.py:252-253` «refusing transcript write»).
 */
import { closeSync, fstatSync, fsyncSync, openSync, readSync, readdirSync, writeSync } from 'node:fs';
import { join } from 'node:path';

import { rigaJson } from './kernel/riga-json.mjs';

export const ESTENSIONE_ATTESA = '.attesa';
export const TIPO_ATTESA = 'attesa';
export const TIPO_ADOTTATA = 'adottata';
/* Il campo che la riga adottata porta nel diario: l'identità della sua riga di attesa (la lettura la confronta col file). */
export const CAMPO_ATTESA = '_attesa';
/* La scrittura che il disco ha accettato solo in parte (`writeSync` lo dice col numero dei byte): un errore, mai «scritto». */
export const SCRITTURA_CORTA = 'SESSION_WAITING_SHORT_WRITE';

export function percorsoAttesa(cartellaStore, sessionId) {
  return join(cartellaStore, `${sessionId}${ESTENSIONE_ATTESA}`);
}

const fsReale = { openSync, writeSync, fsyncSync, closeSync, fstatSync, readSync };

/*
 * ⭐⭐ 15/11/2026 — SETTIMO GIRO DELL'AFFITTO (revisore 3 del giro 6, owner 23:55, giudice v1919-v1921). Due righe si perdevano:
 *   · una riga rimasta a metà (un arresto dentro la scrittura) e poi una riga nuova: la nuova si attaccava alla metà e non si leggeva più
 *     (dal vivo 30 su 30, e il TALOS riavviato non sapeva nemmeno che aspettava). Ora, prima di aggiungere, se il file non finisce con
 *     un a capo se ne aggiunge uno: la metà resta una riga rotta che la lettura salta, la riga nuova è intera. Come pi
 *     (`pi-mono-2026-10-15/packages/coding-agent/src/core/session-manager.ts:668` «if (pending) appendFileSync(…, "\n")») e come il
 *     diario, che si difende con `verificaCodaAppendibile` (`session-store.mjs`); qui non si rifiuta: il file di attesa non ha un numero
 *     d'ordine da proteggere, e rifiutare vorrebbe dire perdere la riga nuova;
 *   · una scrittura corta (disco pieno) diceva «scritto» e la riga dopo si attaccava ai suoi resti: si perdevano tutte e due (30 su 30).
 *     Ora i byte che `writeSync` dice di aver scritto si contano: se sono meno, `SESSION_WAITING_SHORT_WRITE` e chi chiama tiene la riga
 *     in memoria e la riscrive al prossimo ritento (Codex `codex-2026-11-01/codex-rs/rollout/src/recorder.rs:1828-1830` «keep the
 *     unwritten suffix so the next barrier can reopen the file and retry»); i resti della scrittura corta restano una riga rotta.
 *   La condizione v1888 resta intera: il file si apre in scrittura SOLO in aggiunta (`'a'`); l'ultimo byte si guarda in sola lettura.
 *   Doc Node v24 (ctx7 `/websites/nodejs_latest-v24_x_api`, 15/11/2026): `fs.writeSync` «Returns: <number> The number of bytes written».
 */
function finisceConUnACapo(fs, percorso, dimensione) {
  if (dimensione === 0) return true;
  const fd = fs.openSync(percorso, 'r');
  try {
    const byte = Buffer.alloc(1);
    return fs.readSync(fd, byte, 0, 1, dimensione - 1) === 1 && byte[0] === 10;
  } finally {
    fs.closeSync(fd);
  }
}

/**
 * Aggiunge righe in fondo al file di attesa: una sola scrittura, `fsync`, chiusura. Mai altro modo di aprire il file in scrittura.
 * `deps` (solo le prove): `{ openSync, writeSync, fsyncSync, closeSync, fstatSync, readSync }` per simulare un arresto o un disco pieno.
 * @returns {number} i byte scritti; una scrittura corta lancia `SESSION_WAITING_SHORT_WRITE`
 */
export function aggiungiAllAttesaSync(cartellaStore, sessionId, righe, deps = {}) {
  const fs = { ...fsReale, ...deps };
  const righeJson = righe.map((r) => rigaJson(r)).join('');
  if (!righeJson) return 0;
  const percorso = percorsoAttesa(cartellaStore, sessionId);
  const fd = fs.openSync(percorso, 'a');
  try {
    const testo = finisceConUnACapo(fs, percorso, fs.fstatSync(fd).size) ? righeJson : `\n${righeJson}`;
    const attesi = Buffer.byteLength(testo, 'utf8');
    const scritti = fs.writeSync(fd, testo);
    fs.fsyncSync(fd);
    if (scritti !== attesi) {
      throw Object.assign(new Error(`The waiting file of ${sessionId} took ${scritti} of ${attesi} bytes: the line stays in memory and is written again.`), { code: SCRITTURA_CORTA, scritti, attesi });
    }
    return attesi;
  } finally {
    fs.closeSync(fd);
  }
}

/*
 * ⭐⭐ 21/11/2026 — OTTAVO GIRO DEL SALVATAGGIO (candidata 0.2.5; revisore 3 del giro 7). Ogni lotto dell'adozione (2.000 righe)
 *   rileggeva e rianalizzava TUTTO il file di attesa: a 50.000 righe 1,9 milioni di `JSON.parse` e il server fermo 257-949 ms, un lavoro
 *   che cresceva col quadrato delle righe. Il file cresce solo in coda (condizione v1888: mai riscritto, troncato o rinominato), quindi
 *   ora si legge una volta e poi, a ogni lettura, solo i byte AGGIUNTI dopo l'ultima riga intera già letta: una riga si analizza una
 *   volta. Come Hermes, che legge da una posizione del file e non dall'inizio (`hermes-agent-2026-11-01/gateway/session_ancillary.py:
 *   583-585`, `stream.seek(max(0, size - _TAIL_BYTES))`). La memoria della lettura si butta e si rilegge tutto se il file non è più
 *   quello (un altro file allo stesso nome, uno più corto, o gli ultimi byte già letti cambiati: un editor che l'ha riscritto). Una riga
 *   in fondo ancora senza a capo (a metà, o scritta da un editor) si analizza ogni volta ma non si ricorda, come prima.
 *   Doc Node v24 (ctx7 `/websites/nodejs_latest-v24_x_api`, 21/11/2026): `fs.readSync` «Returns the number of bytesRead»; l'a capo
 *   (0x0A) non compare mai dentro un carattere UTF-8 di più byte, quindi tagliare all'ultimo a capo non spezza un carattere.
 *   Chi chiama non cambia gli elenchi che riceve (sono la memoria della lettura): li legge e basta.
 */
const letture = new Map(); // percorso → ciò che è già stato letto; al più LETTURE_MASSIME chat, la più vecchia esce
const LETTURE_MASSIME = 256;
const CODA_DI_CONTROLLO = 64; // gli ultimi byte già letti: se cambiano, il file è stato riscritto e si rilegge da capo

function nuovaLettura(identita) {
  return { identita, dimensione: 0, coda: Buffer.alloc(0), attese: [], viste: new Set(), adottate: new Set(), potaDa: 1024, adottateAllaPota: 0 };
}
function analizza(testo, stato) {
  for (const riga of testo.split('\n')) {
    if (!riga) continue;
    let r;
    try { r = JSON.parse(riga); } catch { continue; }
    if (!r || typeof r !== 'object' || typeof r.id !== 'string' || !r.id) continue;
    if (r.tipo === TIPO_ADOTTATA) stato.adottate.add(r.id);
    else if (r.tipo === TIPO_ATTESA && r.record && typeof r.record === 'object' && !stato.viste.has(r.id)) {
      stato.viste.add(r.id);
      stato.attese.push({ id: r.id, alle: typeof r.alle === 'string' ? r.alle : null, record: r.record });
    }
  }
}
function leggiDa(fd, da, quanti) {
  const buf = Buffer.allocUnsafe(quanti);
  let letti = 0;
  while (letti < quanti) {
    const n = readSync(fd, buf, letti, quanti - letti, da + letti);
    if (n === 0) break;
    letti += n;
  }
  return buf.subarray(0, letti);
}
/* la lettura intera di prima: resta per le prove che simulano un errore di lettura (`deps.readFileSync`) */
function leggiAttesaIntera(percorso, leggi) {
  let testo = '';
  try { testo = leggi(percorso, 'utf8'); }
  catch (errore) { if (errore?.code === 'ENOENT') return { attese: [], adottate: new Set(), byte: 0 }; throw errore; }
  if (testo.charCodeAt(0) === 0xfeff) testo = testo.slice(1);
  const stato = nuovaLettura(null);
  analizza(testo, stato);
  return { attese: stato.attese, adottate: stato.adottate, byte: Buffer.byteLength(testo, 'utf8') };
}

/**
 * Legge il file di attesa. Una riga rotta (un arresto a metà) o vuota si salta; un file che non c'è è un file vuoto; ogni altro errore
 * di lettura si lancia (chi chiama lo dice nel log). Il BOM in testa (lo scrive solo un editor esterno) si toglie: `readFileSync` con
 * 'utf8' lo lascia e `JSON.parse` rifiutava la prima riga (revisore 3 del giro 6: 30 su 30). Dal 21/11 incrementale (vedi sopra).
 * @returns {{ attese: Array<{id:string, alle:string|null, record:object}>, adottate: Set<string>, byte: number }}
 */
export function leggiAttesa(cartellaStore, sessionId, deps = {}) {
  const percorso = percorsoAttesa(cartellaStore, sessionId);
  if (deps.readFileSync) return leggiAttesaIntera(percorso, deps.readFileSync);
  let fd;
  try { fd = openSync(percorso, 'r'); }
  catch (errore) { if (errore?.code === 'ENOENT') { letture.delete(percorso); return { attese: [], adottate: new Set(), byte: 0 }; } throw errore; }
  try {
    const st = fstatSync(fd);
    if (st.isDirectory()) throw Object.assign(new Error(`EISDIR: illegal operation on a directory, read '${percorso}'`), { code: 'EISDIR' });
    const identita = `${st.dev}:${st.ino}:${st.birthtimeMs}`;
    let c = letture.get(percorso);
    if (c && (c.identita !== identita || st.size < c.dimensione
      || (c.coda.length > 0 && !leggiDa(fd, c.dimensione - c.coda.length, c.coda.length).equals(c.coda)))) c = null;
    c ??= nuovaLettura(identita);
    letture.delete(percorso);
    letture.set(percorso, c); // l'ultima usata in fondo
    if (letture.size > LETTURE_MASSIME) letture.delete(letture.keys().next().value);
    let resto = '';
    if (st.size > c.dimensione) {
      const nuovi = leggiDa(fd, c.dimensione, st.size - c.dimensione);
      const ultimoACapo = nuovi.lastIndexOf(10);
      const interi = ultimoACapo >= 0 ? nuovi.subarray(0, ultimoACapo + 1) : nuovi.subarray(0, 0);
      let testo = interi.toString('utf8');
      if (c.dimensione === 0 && testo.charCodeAt(0) === 0xfeff) testo = testo.slice(1);
      analizza(testo, c);
      if (interi.length > 0) {
        c.dimensione += interi.length;
        c.coda = Buffer.from(interi.subarray(Math.max(0, interi.length - CODA_DI_CONTROLLO)));
      }
      resto = nuovi.subarray(interi.length).toString('utf8');
      if (c.dimensione === 0 && resto.charCodeAt(0) === 0xfeff) resto = resto.slice(1);
    }
    /* le righe già adottate non servono più a nessuno (chi chiama guarda solo quelle ancora in attesa): si tolgono di rado, quando ne
       sono state adottate almeno quante l'elenco ne aveva dopo l'ultima volta (e almeno 1.024), così il lavoro resta proporzionale */
    if (c.adottate.size - c.adottateAllaPota >= c.potaDa) {
      c.attese = c.attese.filter((a) => !c.adottate.has(a.id));
      c.adottateAllaPota = c.adottate.size;
      c.potaDa = Math.max(1024, c.attese.length);
    }
    if (!resto) return { attese: c.attese, adottate: c.adottate, byte: st.size };
    /* una riga in fondo senza a capo: si legge per questa volta, non si ricorda (il prossimo a capo la chiude, o la lascia rotta) */
    const extra = { attese: [], viste: new Set(c.viste), adottate: new Set() };
    analizza(resto, extra);
    if (!extra.attese.length && !extra.adottate.size) return { attese: c.attese, adottate: c.adottate, byte: st.size };
    return { attese: extra.attese.length ? [...c.attese, ...extra.attese] : c.attese,
      adottate: extra.adottate.size ? new Set([...c.adottate, ...extra.adottate]) : c.adottate, byte: st.size };
  } finally {
    closeSync(fd);
  }
}

/** Le righe ancora in attesa: né segnate «adottata» nel file, né già nel diario (`nelDiario`: gli `_attesa` letti dal diario). */
export function righeAncoraInAttesa(stato, nelDiario = new Set()) {
  return stato.attese.filter((a) => !stato.adottate.has(a.id) && !nelDiario.has(a.id));
}

/** Le chat che hanno un file di attesa (una sola lettura della cartella per ripristino). */
export function sessioniConAttesa(cartellaStore, deps = {}) {
  const leggi = deps.readdirSync ?? readdirSync;
  let nomi = [];
  try { nomi = leggi(cartellaStore); } catch { return new Set(); }
  return new Set(nomi.filter((n) => typeof n === 'string' && n.endsWith(ESTENSIONE_ATTESA)).map((n) => n.slice(0, -ESTENSIONE_ATTESA.length)));
}
