/*
 * Ultima richiesta ed esportazione lette a pezzi dal dispositivo (`CONTRATTO-REMOTO-CONTEXT-MANAGER-2026-10-31.md`, con le condizioni di Mobile, CLI e Performance).
 *   Il filo porta al più 1 MiB (`remoto/filo.mjs:17`), l'ultima richiesta arriva a circa uno e un'esportazione a decine. Le due letture hanno la stessa forma:
 *   un elenco con l'impronta, poi pezzi a byte `{ testo, byteTotali, prossimoByte }`.
 *   · Prima si oscura, poi si taglia: un segreto a cavallo di due pezzi non sfugge, e byte e scostamenti si contano sul testo oscurato.
 *   · Il taglio non spezza un carattere UTF-8, e `prossimoByte` dice da dove ripartire. Mai un taglio muto: un pezzo chiesto oltre il tetto è `TOO_LARGE`.
 *   · Impronta cambiata ⇒ `PIECE_CHANGED`, e il dispositivo riparte dall'elenco.
 *   · Ultima richiesta: oscurata una volta per impronta, in memoria finché non cambia (`oscuraFormeDiSegreto` su ~1 MB passa una ventina di espressioni).
 *   · Esportazione: una copia fissata alla prima lettura, su disco e mai in RAM, una per sessione. Il confine è l'ultimo evento di quel momento: su una sessione che lavora
 *     un'esportazione «com'è adesso» non finirebbe mai. Sparisce a impronta cambiata, dopo dieci minuti senza letture, e all'avvio se è rimasta.
 *   Stessa forma di `file.read` del ponte (`remoto/file-dispositivi.mjs:665`, pezzi per scostamento con la versione). Il PC non passa da qui: le sue due rotte restano intere.
 */
import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, open, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { oscuraFormeDiSegreto } from './forme-di-segreto.mjs';
import { cartellaScratchAttesa } from './scratch.mjs';
import { BYTE_MASSIMI } from './remoto/filo.mjs';

/** L'involucro del filo (id, tipo, dati) e l'escape del JSON devono starci: il pezzo cede, il testo non si perde. */
export const PESO_MASSIMO_SUL_FILO = BYTE_MASSIMI - 16 * 1024;
export const ESPORTAZIONE_MASSIMA_BYTE = 256 * 1024 * 1024; // quello che l'importazione della CLI accetta
export const COPIA_ESPORTAZIONE_VIVE_MS = 10 * 60_000;
const RICHIESTE_IN_MEMORIA = 8;
const EVENTI_PER_PAUSA = 200; // ogni tanto si cede il filo: un'esportazione da 20 MB non ferma il server

const errore = (code, message, extra = {}) => Object.assign(new Error(message), { code, ...extra });
const impronta = (...parti) => { const h = createHash('sha256'); for (const p of parti) h.update(String(p)).update('\0'); return h.digest('hex'); };
const pesoJson = (testo) => Buffer.byteLength(JSON.stringify(testo), 'utf8');

const lunghezzaDa = (primo) => (primo < 0x80 ? 1 : (primo & 0xe0) === 0xc0 ? 2 : (primo & 0xf0) === 0xe0 ? 3 : (primo & 0xf8) === 0xf0 ? 4 : 1);
/** Un taglio a `fine` non deve lasciare un carattere a metà: si guarda solo ciò che sta prima, e se l'ultimo carattere non è intero si taglia prima di lui. */
const finoAlCarattere = (byte, fine) => {
  let i = fine - 1;
  while (i > 0 && (byte[i] & 0xc0) === 0x80 && fine - i < 4) i -= 1;
  return i >= 0 && i + lunghezzaDa(byte[i]) > fine ? i : fine;
};

/** Da `byte` (una finestra che parte da `daByte` in un testo di `byteTotali`) un pezzo che sta sul filo e finisce su un carattere intero. */
export function pezzoDi(byte, { daByte, byteTotali }) {
  let fine = daByte + byte.length >= byteTotali ? byte.length : finoAlCarattere(byte, byte.length);
  let testo = byte.subarray(0, fine).toString('utf8');
  while (fine > 0 && pesoJson(testo) > PESO_MASSIMO_SUL_FILO) {
    fine = finoAlCarattere(byte, Math.floor(fine / 2));
    testo = byte.subarray(0, fine).toString('utf8');
  }
  /* una finestra più stretta di un carattere non può avanzare: va chiesta più larga, non restituita vuota per sempre */
  if (fine === 0 && byte.length > 0) throw errore('QUERY_INVALID', 'The piece is too small for one character.');
  const arrivo = daByte + fine;
  return { testo, byteTotali, prossimoByte: arrivo >= byteTotali ? null : arrivo };
}

export function controllaFinestra({ daByte, quantiByte }) {
  if (!Number.isSafeInteger(daByte) || daByte < 0 || !Number.isSafeInteger(quantiByte) || quantiByte < 1) throw errore('QUERY_INVALID', 'A valid byte range is needed.');
  if (quantiByte > BYTE_MASSIMI) throw errore('TOO_LARGE', `A message cannot exceed ${BYTE_MASSIMI} bytes.`); // revisione del blocco 25 (R10): una frase per codice
}

/*
 * «Esportata fino a…» per la persona: il numero di sequenza non le dice niente. Quasi nessun evento porta un orario (`session-registry.mjs:2105`): inizio e fine dei giri sì, in
 * `timestamp`, quindi vale l'ultimo che ce l'ha. `null` se nessuno ce l'ha: mai un orario inventato.
 */
export function oraDellUltimoEvento(eventi) {
  for (let i = eventi.length - 1; i >= 0; i -= 1) {
    const ms = eventi[i]?.timestamp;
    if (Number.isFinite(ms) && Math.abs(ms) <= 8.64e15) return new Date(ms).toISOString();
  }
  return null;
}

const testoDelMessaggio = (contenuto) => (typeof contenuto === 'string' ? contenuto : JSON.stringify(contenuto ?? null));

/* Ogni stringa, a qualunque profondità: anche le chiavi di un oggetto possono portare un segreto incollato */
function oscurato(valore, oscura) {
  if (typeof valore === 'string') return oscura(valore);
  if (Array.isArray(valore)) return valore.map((v) => oscurato(v, oscura));
  if (valore && typeof valore === 'object') return Object.fromEntries(Object.entries(valore).map(([k, v]) => [oscura(k), oscurato(v, oscura)]));
  return valore;
}

/*
 * Revisione del blocco 25, R2 (forma approvata da Mobile, CLI e Performance, 01/11/2026): una fonte dell'archivio del motore del contesto (`message-<n>`: il prompt di
 *   sistema, la memoria, le regole del progetto, le uscite degli attrezzi) chiesta dal dispositivo. Sono gli stessi messaggi dell'ultima richiesta, quindi lo stesso
 *   trattamento: ogni stringa oscurata (`oscurato`, come sopra), e mai oltre il filo — un errore onesto `TOO_LARGE`, mai un taglio muto. Il consenso della cartella lo
 *   controllano il ponte e la rotta PRIMA di leggere il record (Performance). Dalla finestra del PC la fonte resta intera: questa funzione la chiama solo l'origine remota.
 *   ⛔ Un record più del doppio del filo si rifiuta senza oscurarlo: l'oscuramento su decine di MB costerebbe CPU per una risposta che non può comunque partire.
 *   Ricerca 01/11/2026: oscurare all'uscita, a ogni passaggio (gravitee.io, «Secrets Redaction in AI Agent Management»); il consenso decide prima dell'accesso
 *   (GuruConnect v2, «secure session core», consent_state pending finché non è concesso).
 */
const fonteTroppoGrande = () => errore('TOO_LARGE', `A message cannot exceed ${BYTE_MASSIMI} bytes.`);
export function fonteOscurataPerIlDispositivo(risultato, { oscura = oscuraFormeDiSegreto } = {}) {
  if (pesoJson(risultato) > 2 * PESO_MASSIMO_SUL_FILO) throw fonteTroppoGrande();
  const fuori = oscurato(risultato, oscura);
  if (pesoJson(fuori) > PESO_MASSIMO_SUL_FILO) throw fonteTroppoGrande();
  return fuori;
}

export function creaLettureAPezzi({ sessionRegistry, cartella = null, oscura = oscuraFormeDiSegreto, clock = () => Date.now(), viveMs = COPIA_ESPORTAZIONE_VIVE_MS, massimoByte = ESPORTAZIONE_MASSIMA_BYTE } = {}) {
  const richieste = new Map(); // sessionId → { at, impronta, attrezziByte, ripartizione, messaggi: [{ indice, ruolo, byte: Buffer }] }
  const copie = new Map(); // sessionId → { impronta, percorso, byteTotali, finoAllEvento, usataAlle, timer }
  const inPreparazione = new Map();
  let radice = null;

  async function cartellaDelleCopie() {
    if (radice) return radice;
    radice = (async () => {
      /* rossa SCRATCH-CANCELLO-01 del blocco 24: senza la cartella del server (le prove), sotto la radice dei temporanei di TALOS, che si pulisce da sé (24 ore) */
      if (!cartella) return cartellaScratchAttesa('esportazioni-');
      await mkdir(cartella, { recursive: true });
      /* «all'avvio del server se è rimasta» */
      for (const nome of await readdir(cartella).catch(() => [])) if (nome.endsWith('.json')) await rm(join(cartella, nome), { force: true }).catch(() => {});
      return cartella;
    })();
    radice.catch(() => { radice = null; }); // una cartella che non si crea si riprova alla prossima esportazione
    return radice;
  }
  /* Revisione del Mobile (01/11/2026): subito, non alla prima esportazione. Una copia rimasta da una corsa caduta non aspetta sul disco a tempo indefinito */
  if (cartella) void cartellaDelleCopie().catch(() => {});
  const togliCopia = async (sessionId) => {
    const copia = copie.get(sessionId);
    if (!copia) return;
    copie.delete(sessionId);
    clearTimeout(copia.timer);
    await rm(copia.percorso, { force: true }).catch(() => {});
  };
  const armaScadenza = (sessionId, copia) => {
    clearTimeout(copia.timer);
    copia.timer = setTimeout(() => { void togliCopia(sessionId); }, viveMs);
    copia.timer.unref?.();
  };

  function richiestaIn(sessionId) {
    const ultima = sessionRegistry.leggiUltimaRichiesta(sessionId);
    if (ultima === undefined) throw errore('NOT_FOUND', 'Session not found.');
    if (!ultima) return null;
    const nota = richieste.get(sessionId);
    if (nota?.at === ultima.at) return nota;
    const messaggi = (Array.isArray(ultima.messages) ? ultima.messages : []).map((m, indice) => ({ indice, ruolo: typeof m?.role === 'string' ? m.role : null, byte: Buffer.from(oscura(testoDelMessaggio(m?.content)), 'utf8') }));
    const fatta = { at: ultima.at, impronta: impronta(ultima.at, ...messaggi.map((m) => m.byte.toString('base64'))), attrezziByte: Buffer.byteLength(JSON.stringify(ultima.tools ?? []), 'utf8'), ripartizione: ultima.ripartizione ?? null, messaggi };
    richieste.delete(sessionId);
    richieste.set(sessionId, fatta);
    if (richieste.size > RICHIESTE_IN_MEMORIA) richieste.delete(richieste.keys().next().value);
    return fatta;
  }

  async function preparaCopia(sessionId) {
    const esportata = sessionRegistry.esporta(sessionId);
    if (!esportata) throw errore('NOT_FOUND', 'Session not found.');
    const { eventi, ...testa } = esportata;
    const fissati = Array.isArray(eventi) ? eventi.slice() : []; // il confine: ciò che arriva dopo non entra
    const finoAllEvento = fissati.at(-1)?._sequenza ?? fissati.length;
    const finoAlle = oraDellUltimoEvento(fissati);
    const nota = copie.get(sessionId);
    if (nota?.finoAllEvento === finoAllEvento) { nota.usataAlle = clock(); armaScadenza(sessionId, nota); return nota; }
    await togliCopia(sessionId);
    const dove = await cartellaDelleCopie();
    const percorso = join(dove, `${impronta(sessionId)}-${finoAllEvento}.json`);
    const scrittore = createWriteStream(percorso, { flags: 'w', mode: 0o600 });
    const fallita = new Promise((_ok, no) => { scrittore.once('error', no); });
    fallita.catch(() => {});
    const hash = createHash('sha256');
    let byteTotali = 0;
    const scrivi = async (testo) => {
      const pezzo = Buffer.from(testo, 'utf8');
      byteTotali += pezzo.length;
      if (byteTotali > massimoByte) throw errore('EXPORT_TOO_LARGE', 'This conversation is too large to export from a device.', { byteTotali });
      hash.update(pezzo);
      if (!scrittore.write(pezzo)) await Promise.race([new Promise((ok) => { scrittore.once('drain', ok); }), fallita]);
    };
    try {
      await scrivi(`${JSON.stringify(oscurato(testa, oscura)).slice(0, -1)},"eventi":[`);
      for (let i = 0; i < fissati.length; i += 1) {
        await scrivi(`${i === 0 ? '' : ','}${JSON.stringify(oscurato(fissati[i], oscura))}`);
        if ((i + 1) % EVENTI_PER_PAUSA === 0) await new Promise((ok) => { setImmediate(ok); });
      }
      await scrivi(']}');
      await new Promise((ok, no) => { scrittore.end(ok); scrittore.once('error', no); });
    } catch (e) {
      /* il file si apre in differita: prima di toglierlo si aspetta la chiusura, o rinasce vuoto subito dopo */
      await new Promise((ok) => { scrittore.once('close', ok); scrittore.destroy(); });
      await rm(percorso, { force: true }).catch(() => {});
      throw e;
    }
    const copia = { impronta: hash.digest('hex'), percorso, byteTotali, finoAllEvento, finoAlle, usataAlle: clock(), timer: null };
    copie.set(sessionId, copia);
    armaScadenza(sessionId, copia);
    return copia;
  }

  return Object.freeze({
    /** L'elenco: `impronta: null` se in questa sessione non è ancora partita nessuna richiesta. */
    elencoUltimaRichiesta(sessionId) {
      const r = richiestaIn(sessionId);
      if (!r) return { impronta: null, attrezziByte: 0, messaggi: [], ripartizione: null };
      return { impronta: r.impronta, attrezziByte: r.attrezziByte, ripartizione: r.ripartizione, messaggi: r.messaggi.map(({ indice, ruolo, byte }) => ({ indice, ruolo, byte: byte.length })) };
    },
    pezzoDellUltimaRichiesta(sessionId, { impronta: attesa, indice, daByte, quantiByte }) {
      controllaFinestra({ daByte, quantiByte });
      const r = richiestaIn(sessionId);
      if (!r || r.impronta !== attesa) throw errore('PIECE_CHANGED', 'The request changed: read the list again.');
      const messaggio = Number.isSafeInteger(indice) ? r.messaggi[indice] : null;
      if (!messaggio) throw errore('QUERY_INVALID', 'A valid message index is needed.');
      return pezzoDi(messaggio.byte.subarray(daByte, daByte + quantiByte), { daByte, byteTotali: messaggio.byte.length });
    },
    /** Una preparazione sola per sessione: due letture insieme aspettano la stessa copia. */
    async elencoEsportazione(sessionId) {
      let corsa = inPreparazione.get(sessionId);
      if (!corsa) {
        corsa = preparaCopia(sessionId).finally(() => { inPreparazione.delete(sessionId); });
        inPreparazione.set(sessionId, corsa);
      }
      const { impronta: fatta, byteTotali, finoAllEvento, finoAlle } = await corsa;
      return { impronta: fatta, byteTotali, finoAllEvento, finoAlle };
    },
    async pezzoDellEsportazione(sessionId, { impronta: attesa, daByte, quantiByte }) {
      controllaFinestra({ daByte, quantiByte });
      const copia = copie.get(sessionId);
      if (!copia || copia.impronta !== attesa) throw errore('PIECE_CHANGED', 'The export changed: read the list again.');
      copia.usataAlle = clock();
      armaScadenza(sessionId, copia);
      /* la scadenza può togliere la copia proprio qui: per il dispositivo è una copia cambiata, non un guasto */
      const file = await open(copia.percorso, 'r').catch((e) => { throw e?.code === 'ENOENT' ? errore('PIECE_CHANGED', 'The export changed: read the list again.') : e; });
      try {
        const finestra = Buffer.allocUnsafe(Math.min(quantiByte, Math.max(0, copia.byteTotali - daByte)));
        const { bytesRead } = await file.read(finestra, 0, finestra.length, daByte);
        return pezzoDi(finestra.subarray(0, bytesRead), { daByte, byteTotali: copia.byteTotali });
      } finally { await file.close(); }
    },
    async chiudi() {
      await Promise.allSettled([...copie.keys()].map(togliCopia));
      richieste.clear();
    },
  });
}
