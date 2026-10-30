/*
 * Controllo remoto — lo SCAMBIO DI FILE fra il PC e un dispositivo collegato, il filo lato server (R5.13, 24/10/2026 notte).
 *
 * Contratto `CONTRATTO-DISPOSITIVI-CARTELLE-FILE-RISORSE-2026-10-23.md`, Parte 2: la PROPOSTA del Desktop e la «Revision 1: AGREED»
 * col Mobile (che vince dove le due differiscono); decisioni dell'owner D1-D8 (memoria `decisioni-owner-scambio-file-r513-24-10`).
 *
 *   P2.1 dal dispositivo al PC: `inizia` / `pezzo` / `fine` (le operazioni `file.upload.begin|chunk|end` di `operazioni.mjs`).
 *     · `da` è uno scostamento in byte; 512 KiB grezzi sono un MASSIMO; un pezzo già ricevuto è idempotente; si rifiuta solo
 *       `da ≠ ricevuti`, col `ricevuti` attuale nell'errore. Come tus 1.0 («Core Protocol», PATCH): con uno scostamento che non
 *       torna il server risponde 409 e lascia il caricamento COM'ERA (tus.io/protocols/resumable-upload, letto il 24/10/2026), così
 *       il dispositivo riparte dal `ricevuti` senza ricominciare.
 *     · Il parziale è indicizzato per (dispositivoId, trasferimentoId), MAI per nome (richiesta del Mobile del 23/10), sta nella
 *       cartella dei dati di TALOS (non in quella della sessione) e vive 24 h dall'ultima attività (`TRANSFER_EXPIRED` dopo).
 *     · Il tetto si controlla sulla dimensione dichiarata E sui byte che arrivano: una dimensione che mente non porta più byte del
 *       tetto (Hermes `gateway/platforms/base.py:513-530`, `_read_httpx_body_with_limit`: «reject an oversized Content-Length early,
 *       then re-check the running total per chunk (a lying/absent header can't smuggle more)»).
 *     · La pubblicazione passa dallo STESSO `saveChatFile` della finestra (`chat-file-upload.mjs`, l'helper nativo verificato):
 *       nessun secondo scrittore, stessi controlli sul nome. Il tipo si decide sui BYTE (Happy, `useAttachmentImage.ts:33-49`,
 *       `detectImageMime`: numeri magici PNG/JPEG/GIF/WebP), mai sul nome.
 *   P2.2 dal PC al dispositivo: `elenco` e `leggi` (`file.list`, `file.read`). Solo i file DI QUELLA conversazione: i suoi allegati,
 *     i file che il modello ha scritto nei suoi giri, le offerte fatte a QUEL dispositivo — e solo dentro la cartella della sessione.
 *     Mai un percorso arbitrario, mai l'elenco di una cartella: il dispositivo nomina un file solo col `fileId` (HMAC del percorso
 *     reale, come `idDi` in `cartelle-dispositivi.mjs`) e la `versione` (HMAC di percorso + dimensione + mtime): se non torna,
 *     `FILE_GONE`.
 *   P2.4 le OFFERTE (senza l'attrezzo, che è della corsa dopo): `registraOfferta` le scrive su file (D2: un dispositivo fuori linea
 *     le ritrova), vivono finché il file non cambia o la conversazione non si cancella (D8), e il PC sa a che punto è lo scarico
 *     contando i `file.read` nell'ordine di `da` («In scaricamento · 62%» dei bozzetti approvati).
 *   L'avviso leggero `file.nuovo {sessionId, fileId}` va sullo stream degli eventi della sessione già aperto (`ascoltaSessione`,
 *     agganciato da `operazioni.mjs` a `session.events`): non si salva e non si rigioca, `file.list` resta la fonte di verità.
 */

import { createHash, createHmac, randomBytes } from 'node:crypto';
import { createReadStream, mkdirSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, statSync, writeFileSync, promises as fsp } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

import { MAX_CHAT_FILE_BYTES, checkedName, saveChatFile } from '../chat-file-upload.mjs';
import { bloccataDa } from '../path-policy.mjs';
import { CHAT_IMAGE_MAX_BYTES } from '../chat-image-attachments.mjs';

export const PEZZO_MASSIMO = 512 * 1024;
export const VITA_TRASFERIMENTO_MS = 24 * 60 * 60_000;
/* per dispositivo: oltre, chi apre senza mai finire riempirebbe il disco del PC (8 × 25 MiB al più) */
export const TRASFERIMENTI_APERTI_MASSIMI = 8;
/* B9-3: un trasferimento senza un pezzo da tanto è «fermo», e al tetto lascia il posto a uno nuovo dello stesso dispositivo */
export const TRASFERIMENTO_FERMO_MS = 10 * 60_000;
/* A10-4: quante volte si ritenta una rinomina caduta su EPERM/EACCES/EBUSY prima di arrendersi */
const RINOMINA_RITENTATIVI = 2;
const RIGHE_MASSIME = 500;
const CARICATI_RICORDATI = 2_000;
const OFFERTE_RICORDATE = 2_000;
const TESTA_PER_IL_TIPO = 4_096;
const ID_TRASFERIMENTO = /^[A-Za-z0-9_-]{22}$/u;
const ID_FILE = /^[A-Za-z0-9_-]{32}$/u;
const SHA256 = /^[0-9a-f]{64}$/iu;
const BASE64URL = /^[A-Za-z0-9_-]*$/u;
/* gli attrezzi che scrivono un file, coi nomi dell'argomento del percorso — la stessa lettura di `proveDelGiro` (obiettivo/giudice.mjs) */
const ATTREZZI_DI_SCRITTURA = new Set(['scrivi', 'file_edit']);

function errore(code, message, extra = {}) {
  return Object.assign(new Error(message), { code }, extra);
}
const sconosciuto = () => errore('TRANSFER_UNKNOWN', 'This transfer is not known on this computer.', { stato: 404 });
const scaduto = () => errore('TRANSFER_EXPIRED', 'This transfer expired: start it again.', { stato: 410 });
const sparito = () => errore('FILE_GONE', 'This file changed or is no longer in this conversation.', { stato: 410 });
const troppoGrande = () => errore('FILE_TOO_LARGE', `A file can be at most ${MAX_CHAT_FILE_BYTES} bytes.`, { stato: 413, reason: 'file-too-large', params: { massimo: MAX_CHAT_FILE_BYTES } });
const malformato = (message) => errore('BAD_MESSAGE', message, { stato: 400 });

/** Il tipo di un file dai suoi primi byte, mai dal nome. `immagine` solo per i quattro formati che una carta mostra in linea. */
export function tipoDaiByte(testa) {
  const b = testa instanceof Uint8Array ? testa : Buffer.alloc(0);
  const inizia = (...firma) => b.length >= firma.length && firma.every((v, i) => v === null || b[i] === v);
  if (inizia(0x89, 0x50, 0x4e, 0x47)) return { mime: 'image/png', immagine: true };
  if (inizia(0xff, 0xd8, 0xff)) return { mime: 'image/jpeg', immagine: true };
  if (inizia(0x47, 0x49, 0x46, 0x38)) return { mime: 'image/gif', immagine: true };
  if (inizia(0x52, 0x49, 0x46, 0x46, null, null, null, null, 0x57, 0x45, 0x42, 0x50)) return { mime: 'image/webp', immagine: true };
  if (inizia(0x25, 0x50, 0x44, 0x46, 0x2d)) return { mime: 'application/pdf', immagine: false };
  if (inizia(0x50, 0x4b, 0x03, 0x04)) return { mime: 'application/zip', immagine: false };
  if (b.length > 0 && !b.includes(0)) {
    /* testo se è UTF-8 valido; la testa può tagliare a metà un carattere di più byte, quindi si prova togliendo fino a 3 byte */
    for (let taglio = 0; taglio <= Math.min(3, b.length - 1); taglio += 1) {
      try { new TextDecoder('utf-8', { fatal: true }).decode(b.subarray(0, b.length - taglio)); return { mime: 'text/plain', immagine: false }; } catch { /* prossimo */ }
    }
  }
  return { mime: 'application/octet-stream', immagine: false };
}

const chiave = (p) => (process.platform === 'win32' ? p.toLowerCase() : p);
const dentro = (figlio, padre) => {
  const r = relative(padre, figlio);
  /* REV6-F1 (25/10/2026): «..» come SEGMENTO, non come prefisso — `..appunti.md` è un file della cartella, non la cartella di sopra */
  return r === '' ? false : r !== '..' && !r.startsWith(`..${sep}`) && !isAbsolute(r);
};
/** REV6-F2/F3 (25/10/2026): il percorso dentro la cartella della conversazione, con «/», per la finestra (scheda, «Download», menu). */
const relativoDi = (reale, base) => relative(base, reale).split(sep).join('/');
const realeOppureNull = (p) => { try { return realpathSync.native(p); } catch { return null; } };

/**
 * `cartella`: la cartella dei dati di questo modulo (dentro i dati di TALOS). `sessionRegistry`: `esiste` e `cartellaPerChatFile`.
 * `eventiDellaSessione(sessionId) → eventi[]`: per i file allegati e scritti dal modello. `salva`: `saveChatFile` (le prove non lo
 * sostituiscono: è l'unico scrittore). `clock`: l'orologio, per le scadenze.
 */
export function creaFileDeiDispositivi({
  cartella, sessionRegistry, eventiDellaSessione = () => [], salva = saveChatFile, clock = () => Date.now(), casuale = (n) => randomBytes(n),
  /* D-5 del Mobile (25/10/2026, contratto Parte 2 «Revision 3»): `({nome, dataUrl}) → {id, mimeType, byte}`, l'archivio delle
     immagini della chat (`chat-image-attachments.mjs`), lo stesso della finestra; senza, le immagini dal dispositivo non ci sono */
  salvaImmagine = null,
  /* A10-4: la rinomina del salvataggio atomico, iniettabile solo per provare i suoi guasti */
  rinomina = renameSync,
  /* Revisione blocco 11 (A-R2): `async (dispositivoId) => string[]`, le cartelle bloccate per quel dispositivo. Un file dentro una di
     loro non si offre, non si elenca e non si legge per LUI. Senza (prove vecchie), nessun blocco. */
  bloccateDi = null,
} = {}) {
  if (typeof cartella !== 'string' || !cartella) throw errore('REMOTE_FILES_FOLDER', 'The device files need their data folder.');
  /** La cartella bloccata per `dispositivoId` che contiene `reale`, o null. Un elenco che non si legge chiude a guasto (bloccato). */
  async function bloccataPerIlDispositivo(dispositivoId, reale) {
    if (typeof bloccateDi !== 'function' || typeof dispositivoId !== 'string' || !dispositivoId) return null;
    let bloccati;
    try { bloccati = await bloccateDi(dispositivoId); } catch { return { radice: null, illeggibile: true }; }
    return Array.isArray(bloccati) && bloccati.length ? bloccataDa(reale, { bloccati }) : null;
  }
  const dirTrasferimenti = join(cartella, 'trasferimenti');
  const fileOfferte = join(cartella, 'offerte.json');
  const fileCaricati = join(cartella, 'caricati.json');
  const fileSegreto = join(cartella, 'segreto');

  const scriviAtomicoSync = (file, testo) => {
    mkdirSync(dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
    /* A10-4 (revisione 10, 25/10/2026): su Windows la rinomina cade con EPERM/EACCES/EBUSY quando un altro processo (o
       l'antivirus) tiene aperto il file d'arrivo — misurati 4.673 EPERM su 23.692 con due processi, e 2.301 `.tmp` rimasti
       per sempre. Come graceful-fs (ritenta la rinomina su EPERM/EACCES) e write-file-atomic (toglie il temporaneo se
       fallisce): due ritentativi brevi, poi il temporaneo si toglie e l'errore porta un codice già concordato col Mobile (OPERATION_FAILED, `filo.mjs` CODICI). */
    try {
      writeFileSync(tmp, testo, { encoding: 'utf8', mode: 0o600 });
      for (let tentativo = 0; ; tentativo += 1) {
        try { rinomina(tmp, file); return; } catch (e) {
          if (tentativo >= RINOMINA_RITENTATIVI || !['EPERM', 'EACCES', 'EBUSY'].includes(e?.code)) throw e;
          Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 15 * (tentativo + 1));
        }
      }
    } catch (e) {
      try { rmSync(tmp, { force: true }); } catch { /* il temporaneo resta solo se nemmeno la rimozione riesce */ }
      throw errore('OPERATION_FAILED', 'The device files could not be saved on this computer.', { stato: 500, reason: 'save-failed', causa: e?.code ?? null });
    }
  };
  const leggiJsonSync = (file, vuoto) => {
    try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return vuoto; }
  };

  /* Il segreto degli id, suo e non quello delle cartelle: un id di file non deve mai coincidere con un id di cartella. */
  let segreto;
  {
    let letto = null;
    try { letto = readFileSync(fileSegreto, 'utf8').trim(); } catch { letto = null; }
    if (letto && /^[0-9a-f]{64}$/u.test(letto)) segreto = Buffer.from(letto, 'hex');
    else { segreto = casuale(32); scriviAtomicoSync(fileSegreto, segreto.toString('hex')); }
  }
  const hmac = (...pezzi) => createHmac('sha256', segreto).update(pezzi.join('\0')).digest('base64url').slice(0, 32);
  /* il fileId lega anche la sessione: lo stesso file in due conversazioni ha due id, e uno non apre l'altra */
  const idDelFile = (sessionId, reale) => hmac('id', sessionId, chiave(reale));
  /* ⛔ REV5-F5 (24/10/2026, S4): con dimensione e mtime troncato al millisecondo, un file riscritto con la STESSA dimensione e lo stesso
     mtime (un programma che lo rimette con `utimes`, due scritture nello stesso millisecondo su NTFS) teneva la stessa versione, e il
     dispositivo ricomponeva metà vecchio e metà nuovo (misurato: «AAAAABBBBB», sonda REV5-F5). Ora anche `ctimeMs`, che cambia a ogni
     scrittura E a ogni `utimes`, e i due tempi interi invece di troncati (frazione di millisecondo dai nanosecondi del disco: 100 ns
     su NTFS). La cura più piccola: niente `bigint` (cambierebbe `size` in tutto il modulo), e un double tiene ~0,2 µs a queste date.
     ⛔ Limite: su FAT/exFAT il disco non ha un ctime vero e l'mtime va a 2 s — lì resta lo sha256 finale delle offerte. */
  const versioneDi = (reale, st) => hmac('v', chiave(reale), String(st.size), String(st.mtimeMs), String(st.ctimeMs), String(st.ino ?? 0));

  /* ---------- stato persistente: offerte (D2) e file caricati (per lo sha256 in `file.list`) ---------- */
  let offerte = (leggiJsonSync(fileOfferte, {}).offerte ?? []).filter((o) => o && typeof o.dispositivoId === 'string' && typeof o.sessionId === 'string' && typeof o.percorso === 'string');
  let caricati = (leggiJsonSync(fileCaricati, {}).caricati ?? []).filter((c) => c && typeof c.sessionId === 'string' && typeof c.percorso === 'string');
  /* ⛔ Revisione del debito 10 (25/10/2026 notte): i due elenchi si salvano DOPO che il fatto è già successo (il file pubblicato in
     `allegati/`, l'offerta già in memoria). Un salvataggio fallito lì diceva al dispositivo «errore» per un file già pubblicato, il
     ricordo dei finiti non partiva, e il dispositivo lo ricaricava: due copie (`x.txt` e `x-2.txt`), misurato dal revisore. Come
     `ricordaCompletato`: lo stato in memoria resta quello vero, e la scrittura dopo riscrive l'elenco intero. */
  const salvaOfferte = () => {
    try { scriviAtomicoSync(fileOfferte, JSON.stringify({ v: 1, offerte: offerte.slice(-OFFERTE_RICORDATE) })); } catch { /* alla prossima */ }
  };
  const salvaCaricati = () => {
    try { scriviAtomicoSync(fileCaricati, JSON.stringify({ v: 1, caricati: caricati.slice(-CARICATI_RICORDATI) })); } catch { /* alla prossima */ }
  };

  /* Una conversazione si dice cancellata solo se QUESTO processo l'ha vista esistere e ora non c'è più: un registro che carica le
     sessioni dopo l'avvio non deve far sparire le offerte di una conversazione che c'è ancora. */
  const viste = new Set();
  const esiste = (sessionId) => {
    const si = Boolean(sessionRegistry?.esiste?.(sessionId));
    if (si) viste.add(sessionId);
    else if (viste.has(sessionId)) {
      viste.delete(sessionId);
      const prima = offerte.length + caricati.length;
      offerte = offerte.filter((o) => o.sessionId !== sessionId);
      caricati = caricati.filter((c) => c.sessionId !== sessionId);
      if (offerte.length + caricati.length !== prima) { try { salvaOfferte(); salvaCaricati(); } catch { /* si riprova alla prossima scrittura */ } }
    }
    return si;
  };
  const cartellaDellaSessione = async (sessionId) => {
    try {
      const w = await sessionRegistry?.cartellaPerChatFile?.(sessionId);
      return typeof w?.cartella === 'string' && w.cartella ? realeOppureNull(w.cartella) : null;
    } catch { return null; }
  };

  /* ---------- ascoltatori: `file.nuovo` per le iscrizioni dei dispositivi, i cambi d'offerta per la carta del PC ---------- */
  const ascoltatoriSessione = new Set(); // { sessionId, dispositivoId, fn }
  const ascoltatoriOfferte = new Set();
  const avvisaNuovo = (sessionId, fileId, soloDispositivo = null) => {
    for (const a of [...ascoltatoriSessione]) {
      if (a.sessionId !== sessionId || (soloDispositivo && a.dispositivoId !== soloDispositivo)) continue;
      try { a.fn({ type: 'CUSTOM', name: 'file.nuovo', value: { sessionId, fileId } }); } catch { /* un ascoltatore che cade non ferma gli altri */ }
    }
  };
  const vistaOfferta = (o) => ({
    offertaId: o.offertaId, sessionId: o.sessionId, dispositivoId: o.dispositivoId, fileId: idDelFile(o.sessionId, o.percorso), nome: o.nome,
    dimensione: o.dimensione, stato: o.stato, percentuale: o.percentuale ?? 0, inviataAlle: o.at, ...(Number.isFinite(o.scaricatoAlle) ? { scaricatoAlle: o.scaricatoAlle } : {}),
    /* R5.13 corsa 2 (24/10/2026): il percorso vero, per la scheda del file nella FINESTRA (il link «Download», il menu). Questa vista va
       solo alla finestra (`offerte`, `ascoltaOfferte` → lo stream `/api/v1/remote/events`, dietro la guardia d'origine): al dispositivo
       arrivano le righe di `elenco`, che il percorso non lo portano mai. */
    percorso: o.percorso,
    /* REV6-F2/F3: e quello dentro la cartella della conversazione, che la scheda confronta per UGUAGLIANZA (non per suffisso). Le
       offerte salvate prima di questa versione non l'hanno: `null`, e la finestra non le aggancia per percorso. */
    relativo: typeof o.relativo === 'string' ? o.relativo : null,
    ...(o.cambiatoDopo ? { cambiatoDopo: true } : {}),
  });
  const avvisaOfferta = (o) => {
    for (const fn of [...ascoltatoriOfferte]) { try { fn(vistaOfferta(o)); } catch { /* niente */ } }
  };

  /* ---------- trasferimenti in arrivo ---------- */
  const dirDi = (dispositivoId) => join(dirTrasferimenti, createHash('sha256').update(String(dispositivoId)).digest('hex').slice(0, 32));
  const chiaveT = (dispositivoId, id) => `${dispositivoId}\0${id}`;
  const aperti = new Map(); // chiaveT → meta (con `ricevuti`, che è la dimensione del parziale)
  const tombe = new Map(); // chiaveT → quando è scaduto: per dire TRANSFER_EXPIRED invece di TRANSFER_UNKNOWN
  const completati = new Map(); // chiaveT → { at, risultato }: un `end` ripetuto con un `n` nuovo ridà lo stesso esito
  /* ⛔ Revisione a blocco 8 (B8-8): `completati` viveva solo in memoria. Dopo un riavvio del PC un `end` ripetuto (la risposta di prima
     persa per strada) diceva TRANSFER_UNKNOWN, e il dispositivo rimandava tutto: due copie della stessa immagine nell'archivio, o
     «nome (1).pdf» accanto al file già arrivato. Si salvano su disco per le stesse 24 ore, al più 500, come le offerte. */
  const fileCompletati = join(cartella, 'completati.json');
  /* A10-5 (revisione a blocco 10): al più le ultime 500 voci, come le scrive `ricordaCompletato` — un file enorme (fatto a mano o
     rovinato) non blocca l'avvio, e il taglio dopo non diventa quadratico */
  const vociSalvate = leggiJsonSync(fileCompletati, {}).completati;
  for (const v of Array.isArray(vociSalvate) ? vociSalvate.slice(-500) : []) {
    if (!v || typeof v.k !== 'string' || !Number.isFinite(v.at) || !v.risultato || typeof v.risultato !== 'object') continue;
    if (v.sessionId !== null && typeof v.sessionId !== 'string') continue;
    if (clock() - v.at >= VITA_TRASFERIMENTO_MS) continue;
    /* A10-7: un ricordo scritto prima che portasse il tipo — senza sessione è un'immagine (un file ne ha sempre una) */
    const immagine = v.immagine === true || (v.immagine === undefined && v.sessionId === null);
    completati.set(v.k, { at: v.at, risultato: v.risultato, sessionId: v.sessionId, immagine,
      ...(Number.isSafeInteger(v.dimensione) && v.dimensione >= 0 ? { dimensione: v.dimensione } : {}) });
  }
  const ricordaCompletato = (k, voce) => {
    completati.set(k, voce);
    while (completati.size > 500) completati.delete(completati.keys().next().value);
    const ora = clock();
    try {
      scriviAtomicoSync(fileCompletati, JSON.stringify({ v: 1, completati: [...completati].filter(([, x]) => ora - x.at < VITA_TRASFERIMENTO_MS).map(([chiaveC, x]) => ({ k: chiaveC, ...x })) }));
    } catch { /* il disco pieno non ferma un trasferimento già pubblicato: resta il ricordo in memoria */ }
  };
  const file = (meta, est) => join(dirDi(meta.dispositivoId), `${meta.trasferimentoId}.${est}`);
  const salvaMeta = (meta) => scriviAtomicoSync(file(meta, 'json'), JSON.stringify({ v: 1, ...meta, ricevuti: undefined }));
  const butta = async (meta) => {
    aperti.delete(chiaveT(meta.dispositivoId, meta.trasferimentoId));
    await fsp.rm(file(meta, 'part'), { force: true }).catch(() => {});
    await fsp.rm(file(meta, 'json'), { force: true }).catch(() => {});
  };
  const eScaduto = (meta) => clock() - meta.attivoAlle > VITA_TRASFERIMENTO_MS;
  const seppellisci = async (meta) => {
    tombe.set(chiaveT(meta.dispositivoId, meta.trasferimentoId), clock());
    if (tombe.size > 2_000) tombe.delete(tombe.keys().next().value);
    await butta(meta);
  };
  /* All'avvio: i trasferimenti lasciati sul disco da un server di prima (la ripresa sopravvive al riavvio del PC). */
  try {
    for (const sotto of readdirSync(dirTrasferimenti, { withFileTypes: true })) {
      if (!sotto.isDirectory()) continue;
      for (const nome of readdirSync(join(dirTrasferimenti, sotto.name))) {
        if (!nome.endsWith('.json')) continue;
        const m = leggiJsonSync(join(dirTrasferimenti, sotto.name, nome), null);
        /* A10-6 (revisione a blocco 10): un `.json` scritto da una versione PIÙ NUOVA (si è tornati indietro) non lo capiamo, ma non è
           rovinato: non si carica e non si cancella, come fanno Checkmk e OpenClaw con lo stato di uno schema più nuovo. Lo riprende la
           versione che l'ha scritto. */
        if (m && typeof m === 'object' && Number.isSafeInteger(m.v) && m.v > 1) continue;
        /* ⛔ Revisione a blocco 8 (B8-1): un'immagine per il modello (D-5) non ha sessione — `sessionId: null` con `immagine: true` — e
           scartarla qui voleva dire niente ripresa dopo il riavvio e un parziale fino a 5 MiB sul disco PER SEMPRE (mai ricaricata, la
           pulizia delle 24 ore non la vedeva) */
        /* ⛔ Revisione a blocco 9 (A9-4): il tipo si legge in UN modo solo, `immagine === true`, qui e in `fine` (prima qui `=== true` e
           là «truthy»: `immagine: 'no'` con una sessione si caricava come file e finiva come immagine). Un file e un'immagine si
           distinguono anche dalla sessione: un'immagine non ne ha, un file sì. */
        const tipoValido = m?.immagine === true ? m.sessionId === null : (m?.immagine === undefined || m?.immagine === false) && typeof m?.sessionId === 'string';
        const valido = Boolean(m) && ID_TRASFERIMENTO.test(m.trasferimentoId ?? '') && typeof m.dispositivoId === 'string' && tipoValido
          && `${m.trasferimentoId}.json` === nome && dirDi(m.dispositivoId) === join(dirTrasferimenti, sotto.name);
        if (!valido) {
          /* A9-4: un `.json` col nome di un trasferimento ma illeggibile o storto non si riprenderà mai: via, col suo parziale, invece di
             restare sul disco per sempre (la pulizia delle 24 ore vede solo i trasferimenti caricati). Un nome che non è il nostro resta. */
          if (ID_TRASFERIMENTO.test(nome.slice(0, -'.json'.length))) {
            for (const est of ['json', 'part']) {
              try { rmSync(join(dirTrasferimenti, sotto.name, `${nome.slice(0, -'.json'.length)}.${est}`), { force: true }); } catch { /* al prossimo avvio */ }
            }
          }
          continue;
        }
        let ricevuti = 0;
        /* ⛔ REV5-F3 (24/10/2026): un `.json` senza il suo `.part` (un «dimentica» con un pezzo in volo, nelle versioni di prima) non è
           un trasferimento che si riprende: si toglie, invece di restare sul disco per sempre */
        try { ricevuti = statSync(join(dirTrasferimenti, sotto.name, `${m.trasferimentoId}.part`)).size; } catch {
          try { rmSync(join(dirTrasferimenti, sotto.name, nome), { force: true }); } catch { /* resta: ci si riprova al prossimo avvio */ }
          continue;
        }
        const { v: _v, ...meta } = m;
        aperti.set(chiaveT(meta.dispositivoId, meta.trasferimentoId), { ...meta, ricevuti });
      }
    }
  } catch { /* nessuna cartella ancora */ }
  const spazzaScaduti = async () => {
    for (const meta of [...aperti.values()]) if (eScaduto(meta)) await seppellisci(meta);
  };
  /* anche all'avvio: un dispositivo che non torna più non lascia 25 MiB di parziale sul disco del PC */
  spazzaScaduti().catch(() => {});

  /* Un trasferimento si tocca uno alla volta: due connessioni dello stesso dispositivo non intrecciano i pezzi. */
  const code = new Map();
  const inFila = (k, lavoro) => {
    const prossimo = (code.get(k) ?? Promise.resolve()).then(lavoro, lavoro);
    const coda = prossimo.catch(() => {});
    code.set(k, coda);
    coda.then(() => { if (code.get(k) === coda) code.delete(k); });
    return prossimo;
  };
  /** Il trasferimento vivo di QUEL dispositivo, o l'errore che il dispositivo sa dire. */
  const cerca = async (dispositivoId, trasferimentoId) => {
    if (typeof trasferimentoId !== 'string' || !ID_TRASFERIMENTO.test(trasferimentoId)) throw sconosciuto();
    const k = chiaveT(dispositivoId, trasferimentoId);
    if (tombe.has(k)) throw scaduto();
    const meta = aperti.get(k);
    if (!meta) throw sconosciuto();
    if (eScaduto(meta)) { await seppellisci(meta); throw scaduto(); }
    return meta;
  };
  const shaDelFile = (percorso) => new Promise((ok, ko) => {
    const h = createHash('sha256');
    createReadStream(percorso).on('error', ko).on('data', (d) => h.update(d)).on('end', () => ok(h.digest('hex')));
  });
  const testaDi = async (percorso) => {
    const fh = await fsp.open(percorso, 'r');
    try { const buf = Buffer.alloc(TESTA_PER_IL_TIPO); const { bytesRead } = await fh.read(buf, 0, buf.length, 0); return buf.subarray(0, bytesRead); } finally { await fh.close(); }
  };

  /* ---------- i file di una conversazione, per un dispositivo ---------- */
  /** I percorsi che la conversazione nomina: allegati delle bolle (solo sotto `allegati/`) e scritture riuscite del modello. */
  const daiEventi = (eventi) => {
    const allegati = []; const scritti = [];
    const chiamate = new Map();
    let giro = 0;
    const cercaAllegati = (v, profondita) => {
      if (!v || typeof v !== 'object' || profondita > 5) return;
      if (Array.isArray(v)) { for (const x of v.slice(0, 50)) cercaAllegati(x, profondita + 1); return; }
      if (Array.isArray(v.allegati)) for (const a of v.allegati.slice(0, 50)) if (typeof a?.percorso === 'string' && a.percorso) allegati.push({ percorso: a.percorso, giro });
      for (const [k, x] of Object.entries(v)) if (k !== 'allegati' && x && typeof x === 'object') cercaAllegati(x, profondita + 1);
    };
    for (const e of Array.isArray(eventi) ? eventi : []) {
      if (e?.type === 'RunStarted') giro += 1;
      if (e?.type === 'ToolCallStart' && typeof e.toolCallId === 'string') chiamate.set(e.toolCallId, { nome: String(e.toolCallName ?? ''), argomenti: '' });
      else if (e?.type === 'ToolCallArgs' && chiamate.has(e.toolCallId)) { const c = chiamate.get(e.toolCallId); if (c.argomenti.length < 1_000_000) c.argomenti += String(e.delta ?? ''); }
      else if (e?.type === 'ToolCallResult' && chiamate.has(e.toolCallId)) {
        const c = chiamate.get(e.toolCallId);
        chiamate.delete(e.toolCallId);
        if (ATTREZZI_DI_SCRITTURA.has(c.nome) && e.isError !== true) {
          let p = null;
          try { const a = JSON.parse(c.argomenti); p = a?.percorso ?? a?.path ?? a?.file_path ?? null; } catch { /* argomenti illeggibili: il file non si nomina */ }
          if (typeof p === 'string' && p) scritti.push({ percorso: p, giro });
        }
      } else cercaAllegati(e, 0);
    }
    return { allegati, scritti };
  };

  /** Le righe vere (col percorso reale, che NON esce di qui) dei file di `sessionId` per `dispositivoId`. */
  const righeInterne = async (dispositivoId, sessionId) => {
    if (!esiste(sessionId)) throw errore('NOT_FOUND', 'Session not found.', { stato: 404 });
    const base = await cartellaDellaSessione(sessionId);
    if (!base) return [];
    const allegatiDir = join(base, 'allegati');
    const candidati = [];
    for (const o of offerte) if (o.dispositivoId === dispositivoId && o.sessionId === sessionId && o.stato !== 'cambiato') candidati.push({ percorso: o.percorso, origine: 'inviato', offerta: o });
    for (const c of caricati) if (c.sessionId === sessionId) candidati.push({ percorso: c.percorso, origine: 'allegato', caricato: c });
    const { allegati, scritti } = daiEventi(eventiDellaSessione(sessionId));
    for (const a of allegati) candidati.push({ percorso: a.percorso, origine: 'allegato', giro: a.giro, soloAllegati: true });
    for (const s of scritti) candidati.push({ percorso: s.percorso, origine: 'modello', giro: s.giro });
    const righe = []; const perChiave = new Map();
    let offerteCambiate = false;
    for (const c of candidati) {
      if (righe.length >= RIGHE_MASSIME) break;
      const reale = realeOppureNull(isAbsolute(c.percorso) ? c.percorso : resolve(base, c.percorso));
      const valida = reale && dentro(reale, c.soloAllegati ? allegatiDir : base);
      let st = null;
      if (valida) { try { st = statSync(reale); } catch { st = null; } }
      const versione = st?.isFile() ? versioneDi(reale, st) : null;
      if (c.offerta && versione !== c.offerta.versione) {
        /* D8: il file è cambiato (o sparito) ⇒ l'offerta muore per il dispositivo; il PC la vede «cambiato» e offre «Manda di nuovo» (D6).
           Owner 25/10/2026 (consigliata): se il dispositivo l'aveva GIÀ scaricata, per il PC resta «scaricato» col segno della versione
           nuova («Invia la versione nuova»), come in `offerteAggiornate` */
        if (c.offerta.stato === 'scaricato') {
          if (!c.offerta.cambiatoDopo) { c.offerta.cambiatoDopo = true; offerteCambiate = true; avvisaOfferta(c.offerta); }
        } else { c.offerta.stato = 'cambiato'; offerteCambiate = true; avvisaOfferta(c.offerta); }
        continue;
      }
      if (!versione) continue;
      const k = chiave(reale);
      if (perChiave.has(k)) { const r = perChiave.get(k); if (r.giro === undefined && c.giro !== undefined) r.giro = c.giro; continue; }
      const sha256 = c.offerta?.sha256 ?? (c.caricato && c.caricato.versione === versione ? c.caricato.sha256 : null)
        ?? caricati.find((x) => x.sessionId === sessionId && chiave(x.percorso) === k && x.versione === versione)?.sha256 ?? null;
      const riga = { reale, st, fileId: idDelFile(sessionId, reale), versione, origine: c.origine, ...(c.giro !== undefined ? { giro: c.giro } : {}), ...(sha256 ? { sha256 } : {}), ...(c.offerta ? { offerta: c.offerta } : {}) };
      perChiave.set(k, riga);
      righe.push(riga);
    }
    if (offerteCambiate) salvaOfferte();
    return righe;
  };
  /* l'ultima lettura dell'elenco per (dispositivo, sessione): `file.read` non rilegge tutta la conversazione a ogni pezzo */
  const ricordoRighe = new Map();
  const rigaPerLettura = async (dispositivoId, sessionId, fileId) => {
    const k = `${dispositivoId}\0${sessionId}`;
    let righe = ricordoRighe.get(k)?.righe;
    let riga = righe?.find((r) => r.fileId === fileId);
    if (!riga) { righe = await righeInterne(dispositivoId, sessionId); ricordoRighe.set(k, { righe }); riga = righe.find((r) => r.fileId === fileId); }
    else if (!esiste(sessionId)) throw errore('NOT_FOUND', 'Session not found.', { stato: 404 });
    if (riga?.offerta && !offerte.includes(riga.offerta)) riga = null; // offerta tolta (dispositivo dimenticato) nel frattempo
    if (riga?.offerta?.stato === 'cambiato') riga = null;
    return riga ?? null;
  };

  return {
    PEZZO_MASSIMO,

    /** P2.1 `file.upload.begin`: un trasferimento nuovo, o la ripresa di uno vivo (`riprendi`). */
    async inizia({ dispositivoId, sessionId, nome, dimensione, sha256, riprendi, immagine = false } = {}) {
      if (typeof dispositivoId !== 'string' || !dispositivoId) throw malformato('A device is needed.');
      /* D-5/D-6 (25/10/2026, «Revision 3»): un'IMMAGINE per il modello, come quella della finestra — senza conversazione (si può
         allegare anche al primo messaggio), mai in `allegati/`, al più 5 MiB, il tipo deciso sui byte alla fine */
      const perImmagine = immagine === true;
      if (perImmagine && sessionId !== undefined && sessionId !== null) throw malformato('An image for the model carries no session.');
      if (riprendi !== undefined && riprendi !== null) {
        /* ⛔ Revisione a blocco 9 (B9-1): la risposta a `end` persa per strada (o il PC riavviato dopo) ⇒ il dispositivo riprende un
           trasferimento che qui è GIÀ finito. Prima: TRANSFER_UNKNOWN, e il dispositivo ricaricava tutto (un secondo «nome-2.txt» in
           allegati/, una seconda copia dell'immagine). Ora la ripresa dice «hai già mandato tutto» (ricevuti = dimensione), e il suo
           `end` ridà lo stesso esito da `completati`. Stesso dispositivo (la chiave lo porta), stessa sessione, stesso tipo. */
        const finito = typeof riprendi === 'string' ? completati.get(chiaveT(dispositivoId, riprendi)) : null;
        if (finito && clock() - finito.at < VITA_TRASFERIMENTO_MS) {
          const dimensione = finito.dimensione ?? finito.risultato?.dimensione ?? finito.risultato?.byte;
          if ((finito.sessionId ?? null) !== (sessionId ?? null) || Boolean(finito.immagine) !== perImmagine || !Number.isSafeInteger(dimensione)) throw sconosciuto();
          return { trasferimentoId: riprendi, pezzo: PEZZO_MASSIMO, ricevuti: dimensione };
        }
        const meta = await cerca(dispositivoId, riprendi);
        if ((meta.sessionId ?? null) !== (sessionId ?? null) || Boolean(meta.immagine) !== perImmagine) throw sconosciuto();
        /* ⛔ A10-1 (revisione a blocco 10): una ripresa è attività. Senza, dopo una pausa di oltre 10 minuti il tetto (B9-3) poteva
           liberare proprio il trasferimento appena ripreso, e il pezzo dopo diceva TRANSFER_EXPIRED */
        meta.attivoAlle = clock();
        try { salvaMeta(meta); } catch { /* il ricordo in memoria basta per questa ripresa; il disco si riallinea al pezzo dopo */ }
        return { trasferimentoId: meta.trasferimentoId, pezzo: PEZZO_MASSIMO, ricevuti: meta.ricevuti };
      }
      if (perImmagine && typeof salvaImmagine !== 'function') {
        throw errore('BAD_MESSAGE', 'Images for the model are not available on this computer.', { stato: 409, reason: 'images-unavailable' });
      }
      /* il nome prima di tutto: un nome ostile non fa partire un trasferimento (stesso controllo di `saveChatFile`, una volta sola) */
      const nomeValido = checkedName(nome);
      if (!Number.isSafeInteger(dimensione) || dimensione < 0) throw malformato('The size must be a whole number of bytes.');
      if (dimensione > MAX_CHAT_FILE_BYTES) throw troppoGrande();
      /* B8-7 (revisione a blocco 8): un'immagine vuota non è «troppo grande» */
      if (perImmagine && dimensione === 0) throw errore('BAD_MESSAGE', 'An image for the model cannot be empty.', { stato: 400, reason: 'image-empty' });
      if (perImmagine && dimensione > CHAT_IMAGE_MAX_BYTES) {
        throw errore('BAD_MESSAGE', 'An image for the model is at most 5 MiB.', { stato: 413, reason: 'image-too-large' });
      }
      if (typeof sha256 !== 'string' || !SHA256.test(sha256)) throw malformato('The sha256 must be 64 hexadecimal characters.');
      if (!perImmagine && !esiste(sessionId)) throw errore('NOT_FOUND', 'Session not found.', { stato: 404 });
      /* ⛔ A10-2 (revisione a blocco 10): fra il conto dei posti e `aperti.set` ci sono degli `await`, e tre `begin` in parallelo
         contavano tutti 7 e arrivavano a 10 aperti. I `begin` NUOVI dello stesso dispositivo passano uno alla volta (una fila sua,
         diversa da quella dei singoli trasferimenti); fra dispositivi diversi niente attesa. */
      return inFila(`\u0001nuovi\u0000${dispositivoId}`, async () => {
        await spazzaScaduti();
        /* `while`, non `if` (revisione del debito 10): con più di 8 già aperti — lo stato lasciato dalla corsa di A10-2 prima della cura —
           un `begin` ne toglieva uno e ne aggiungeva uno, e il conto restava sopra il tetto */
        const suoiAperti = () => [...aperti.values()].filter((m) => m.dispositivoId === dispositivoId);
        for (let suoi = suoiAperti(); suoi.length >= TRASFERIMENTI_APERTI_MASSIMI; suoi = suoiAperti()) {
          /* ⛔ Revisione a blocco 9 (B9-3): il dispositivo non ricorda gli id, quindi ogni app chiusa a metà invio lascia qui trasferimenti
             che nessuno riprenderà; al tetto di 8 ogni `begin` diceva RATE_LIMITED fino a 24 ore. Ora al tetto si libera il SUO
             trasferimento fermo da più tempo (nessun pezzo da 10 minuti): una ripresa tardiva di quello dice TRANSFER_EXPIRED, come dopo
             le 24 ore. Se sono tutti attivi resta RATE_LIMITED: il dispositivo aspetta il suo turno. */
          const fermo = suoi.filter((m) => clock() - m.attivoAlle >= TRASFERIMENTO_FERMO_MS).sort((a, b) => a.attivoAlle - b.attivoAlle)[0];
          if (!fermo) throw errore('RATE_LIMITED', 'Too many unfinished transfers from this device: finish or let some expire.', { stato: 429 });
          await seppellisci(fermo);
        }
        const ora = clock();
        const meta = { trasferimentoId: casuale(16).toString('base64url'), dispositivoId, sessionId: perImmagine ? null : sessionId, nome: nomeValido, dimensione, sha256: sha256.toLowerCase(), creatoAlle: ora, attivoAlle: ora, ricevuti: 0, ...(perImmagine ? { immagine: true } : {}) };
        await fsp.mkdir(dirDi(dispositivoId), { recursive: true });
        await fsp.writeFile(file(meta, 'part'), Buffer.alloc(0), { flag: 'wx', mode: 0o600 });
        /* A10-4: senza il suo `.json` il `.part` non lo ritrova nessuno, nemmeno al riavvio: se la scheda non si salva, via anche lui */
        try { salvaMeta(meta); } catch (e) { await fsp.rm(file(meta, 'part'), { force: true }).catch(() => {}); throw e; }
        aperti.set(chiaveT(dispositivoId, meta.trasferimentoId), meta);
        return { trasferimentoId: meta.trasferimentoId, pezzo: PEZZO_MASSIMO, ricevuti: 0 };
      });
    },

    /**
     * B10-1 (revisione a blocco 10, contratto Parte 2 «Revision 4»): `file.upload.abort` — il dispositivo ha tolto la bozza (o svuotato
     * il vassoio) e il trasferimento non si riprenderà: il parziale si toglie SUBITO, invece di occupare un posto del tetto per 10 minuti
     * (B9-3) o 24 ore. Idempotente: un id sconosciuto, già finito o già tolto risponde ok. Solo i trasferimenti di QUEL dispositivo (la
     * chiave lo porta); niente consenso, perché toglie soltanto un parziale suo. Un pezzo che arriva dopo dice TRANSFER_UNKNOWN.
     */
    annulla({ dispositivoId, trasferimentoId } = {}) {
      if (typeof trasferimentoId !== 'string' || !ID_TRASFERIMENTO.test(trasferimentoId)) throw malformato('A transfer id is needed.');
      return inFila(chiaveT(dispositivoId, trasferimentoId), async () => {
        const meta = aperti.get(chiaveT(dispositivoId, trasferimentoId));
        if (meta) await butta(meta);
        return { ok: true };
      });
    },

    /** Per il consenso in `operazioni.mjs`: la sessione di un trasferimento vivo di QUEL dispositivo, o null. */
    async sessioneDelTrasferimento(dispositivoId, trasferimentoId) {
      if (typeof trasferimentoId !== 'string' || !ID_TRASFERIMENTO.test(trasferimentoId)) return null;
      return aperti.get(chiaveT(dispositivoId, trasferimentoId))?.sessionId ?? completati.get(chiaveT(dispositivoId, trasferimentoId))?.sessionId ?? null;
    },

    /** P2.1 `file.upload.chunk`. */
    pezzo({ dispositivoId, trasferimentoId, da, dati } = {}) {
      return inFila(chiaveT(dispositivoId, trasferimentoId), async () => {
        const meta = await cerca(dispositivoId, trasferimentoId);
        if (!Number.isSafeInteger(da) || da < 0) throw malformato('`da` must be a byte offset.');
        if (typeof dati !== 'string' || !BASE64URL.test(dati) || dati.length % 4 === 1 || dati.length > Math.ceil((PEZZO_MASSIMO * 4) / 3)) throw malformato('`dati` must be base64url of at most 512 KiB.');
        const byte = Buffer.from(dati, 'base64url');
        if (byte.length === 0 || byte.length > PEZZO_MASSIMO) throw malformato('A chunk carries from 1 byte to 512 KiB.');
        /* già ricevuto per intero: idempotente, niente si riscrive */
        if (da + byte.length <= meta.ricevuti) { meta.attivoAlle = clock(); salvaMeta(meta); return { ricevuti: meta.ricevuti }; }
        if (da !== meta.ricevuti) {
          throw errore('BAD_MESSAGE', `This chunk starts at ${da}, the computer has ${meta.ricevuti} bytes.`, { stato: 409, reason: 'offset-mismatch', params: { ricevuti: meta.ricevuti } });
        }
        if (da + byte.length > meta.dimensione) { await butta(meta); throw troppoGrande(); }
        const fh = await fsp.open(file(meta, 'part'), 'r+');
        try { await fh.write(byte, 0, byte.length, da); } finally { await fh.close(); }
        /* ⛔ REV5-F3 (24/10/2026): buttato mentre si scriveva (scaduto, o il dispositivo dimenticato per una strada che non passa dalla
           fila) ⇒ niente `salvaMeta`, che riscriverebbe il `.json` dopo che `butta` l'aveva tolto: un orfano per sempre */
        if (aperti.get(chiaveT(dispositivoId, trasferimentoId)) !== meta) throw sconosciuto();
        meta.ricevuti += byte.length;
        meta.attivoAlle = clock();
        salvaMeta(meta);
        return { ricevuti: meta.ricevuti };
      });
    },

    /** P2.1 `file.upload.end`: controlla dimensione e sha256, pubblica con `saveChatFile`, decide il tipo sui byte. */
    fine({ dispositivoId, trasferimentoId } = {}) {
      return inFila(chiaveT(dispositivoId, trasferimentoId), async () => {
        const k = chiaveT(dispositivoId, trasferimentoId);
        const gia = completati.get(k);
        if (gia && clock() - gia.at < VITA_TRASFERIMENTO_MS) return gia.risultato;
        const meta = await cerca(dispositivoId, trasferimentoId);
        if (meta.ricevuti !== meta.dimensione) {
          throw errore('BAD_MESSAGE', `The computer has ${meta.ricevuti} of ${meta.dimensione} bytes.`, { stato: 409, reason: 'transfer-incomplete', params: { ricevuti: meta.ricevuti } });
        }
        const parziale = file(meta, 'part');
        if (await shaDelFile(parziale) !== meta.sha256) {
          await butta(meta);
          throw errore('CHECKSUM_MISMATCH', 'The file arrived different from how it left: send it again.', { stato: 422 });
        }
        if (meta.immagine === true) {
          /* D-5 (25/10/2026): l'immagine va SOLO all'archivio delle immagini della chat, con le regole della finestra (PNG, JPEG o WebP
             decisi sui byte, 5 MiB); la conversazione la riceve poi con `immagini:[{id}]` in `session.start`/`session.send` */
          const byte = await fsp.readFile(parziale);
          const tipoImmagine = tipoDaiByte(byte.subarray(0, 4096));
          if (!['image/png', 'image/jpeg', 'image/webp'].includes(tipoImmagine.mime)) {
            await butta(meta);
            throw errore('BAD_MESSAGE', 'Attach a PNG, JPEG or WebP image.', { stato: 415, reason: 'image-invalid' });
          }
          let salvata;
          try {
            salvata = await salvaImmagine({ nome: meta.nome, dataUrl: `data:${tipoImmagine.mime};base64,${byte.toString('base64')}` });
          } finally { await butta(meta); }
          const risultato = { immagineId: salvata.id, nome: meta.nome, mime: salvata.mimeType ?? tipoImmagine.mime, byte: salvata.byte ?? byte.length, sha256: meta.sha256 };
          ricordaCompletato(k, { at: clock(), risultato, sessionId: null, immagine: true, dimensione: meta.dimensione });
          return risultato;
        }
        const base = await cartellaDellaSessione(meta.sessionId);
        if (!base) throw errore('NOT_FOUND', 'Session not found.', { stato: 404 });
        const tipo = tipoDaiByte(await testaDi(parziale));
        const salvato = await salva({ rootDir: base, name: meta.nome, source: createReadStream(parziale) });
        const reale = realeOppureNull(salvato.assoluto ?? join(base, salvato.percorso));
        const st = reale ? statSync(reale) : null;
        await butta(meta);
        if (!reale || !st) throw errore('FILE_WRITE_FAILED', 'The file was saved but cannot be read back.');
        const versione = versioneDi(reale, st);
        caricati = caricati.filter((c) => !(c.sessionId === meta.sessionId && chiave(c.percorso) === chiave(reale)));
        caricati.push({ sessionId: meta.sessionId, dispositivoId, percorso: reale, sha256: meta.sha256, versione, at: clock() });
        salvaCaricati();
        const fileId = idDelFile(meta.sessionId, reale);
        /* al dispositivo il percorso RELATIVO della cartella della sessione (`allegati/<nome>`), mai l'assoluto del PC */
        const risultato = { fileId, versione, nome: salvato.nome, percorso: salvato.percorso, dimensione: salvato.bytes, mime: tipo.mime, immagine: tipo.immagine, sha256: meta.sha256 };
        ricordaCompletato(k, { at: clock(), risultato, sessionId: meta.sessionId, immagine: false, dimensione: meta.dimensione });
        avvisaNuovo(meta.sessionId, fileId);
        return risultato;
      });
    },

    /** P2.2 `file.list`: le righe che il dispositivo può vedere, senza percorsi. */
    async elenco({ dispositivoId, sessionId } = {}) {
      const tutte = await righeInterne(dispositivoId, sessionId);
      const righe = [];
      for (const r of tutte) if (!(await bloccataPerIlDispositivo(dispositivoId, r.reale))) righe.push(r); // A-R2
      ricordoRighe.set(`${dispositivoId}\0${sessionId}`, { righe });
      const items = [];
      for (const r of righe) {
        let tipo = { mime: 'application/octet-stream', immagine: false };
        try { tipo = tipoDaiByte(await testaDi(r.reale)); } catch { /* illeggibile adesso: resta il tipo generico */ }
        items.push({ fileId: r.fileId, nome: basename(r.reale), dimensione: r.st.size, mime: tipo.mime, immagine: tipo.immagine, origine: r.origine, versione: r.versione,
          ...(r.giro !== undefined ? { giro: r.giro } : {}), ...(r.sha256 ? { sha256: r.sha256 } : {}),
          /* D-1 del Mobile (25/10/2026): una riga «inviato» porta l'id dell'offerta e l'ora dell'invio, perché il dispositivo metta la
             riga al suo posto nella conversazione (l'esito dell'attrezzo è testo per il modello, e il dispositivo non lo legge) */
          ...(r.offerta ? { offertaId: r.offerta.offertaId, inviataAlle: r.offerta.at } : {}) });
      }
      return { items };
    },

    /** P2.2 `file.read`: al più 512 KiB da `da`; `FILE_GONE` se la versione non torna. Conta lo scarico delle offerte. */
    async leggi({ dispositivoId, sessionId, fileId, versione, da, quanti } = {}) {
      if (typeof versione !== 'string' || !ID_FILE.test(versione)) throw malformato('A file version is needed.');
      if (!Number.isSafeInteger(da) || da < 0) throw malformato('`da` must be a byte offset.');
      if (!Number.isSafeInteger(quanti) || quanti < 1 || quanti > PEZZO_MASSIMO) throw malformato('`quanti` goes from 1 byte to 512 KiB.');
      if (typeof fileId !== 'string' || !ID_FILE.test(fileId)) throw sparito();
      const riga = await rigaPerLettura(dispositivoId, sessionId, fileId);
      if (!riga || riga.versione !== versione) throw sparito();
      if (await bloccataPerIlDispositivo(dispositivoId, riga.reale)) throw sparito(); // A-R2: per lui il file non c'è
      const fh = await fsp.open(riga.reale, 'r').catch(() => { throw sparito(); });
      let letti; let st; let dati;
      try {
        /* il file APERTO deve essere quello elencato: stessa versione (percorso + dimensione + mtime + inode), o è stato sostituito */
        st = await fh.stat();
        if (versioneDi(riga.reale, st) !== versione) throw sparito();
        if (st.size > MAX_CHAT_FILE_BYTES) throw troppoGrande();
        if (da > st.size) throw malformato('`da` is past the end of the file.');
        const buf = Buffer.alloc(Math.min(quanti, st.size - da));
        letti = buf.length ? (await fh.read(buf, 0, buf.length, da)).bytesRead : 0;
        if (versioneDi(riga.reale, await fh.stat()) !== versione) throw sparito();
        dati = buf.subarray(0, letti).toString('base64url');
      } finally { await fh.close(); }
      const fine = da + letti >= st.size;
      const o = riga.offerta;
      if (o) {
        /* «In scaricamento · 62%»: si contano i byte letti NELL'ORDINE di `da`; da capo riparte, fuori ordine non sposta */
        const prima = o.stato;
        if (da === 0) o.letti = letti; else if (da === (o.letti ?? 0)) o.letti += letti;
        const percentuale = st.size ? Math.min(100, Math.floor(((o.letti ?? 0) * 100) / st.size)) : 100;
        if (o.stato !== 'scaricato') {
          if (fine && (o.letti ?? 0) >= st.size) { o.stato = 'scaricato'; o.percentuale = 100; o.scaricatoAlle = clock(); }
          else { o.stato = 'in-scaricamento'; o.percentuale = percentuale; }
        }
        if (o.stato !== prima) salvaOfferte();
        avvisaOfferta(o);
      }
      return { dati, fine };
    },

    /**
     * P2.4 — registra «questo file è offerto a questo dispositivo» (l'attrezzo e la carta sono della corsa dopo). Il file deve stare
     * dentro la cartella della sessione. D2: resta su file per chi è fuori linea; D8: muore quando il file cambia o la conversazione
     * si cancella. Lo sha256 si calcola qui: il dispositivo lo verifica alla fine dello scarico.
     */
    /**
     * R5.13 corsa 2 (24/10/2026) — l'esame di `registraOfferta` SENZA registrare: per la carta dell'attrezzo del modello (il file e la
     * sua `versione`, che l'esecuzione rilega con `versioneAttesa`). Errori col `motivo` che l'ospite traduce in parole per il modello:
     * `fuori` (non nella cartella della conversazione), `assente`, `cartella`; più FILE_TOO_LARGE.
     */
    async esaminaOfferta({ sessionId, percorso, dispositivoId = null } = {}) {
      if (!esiste(sessionId)) throw errore('NOT_FOUND', 'Session not found.', { stato: 404 });
      const base = await cartellaDellaSessione(sessionId);
      if (!base || typeof percorso !== 'string' || !percorso) throw Object.assign(sparito(), { motivo: 'assente' });
      const richiesto = isAbsolute(percorso) ? resolve(percorso) : resolve(base, percorso);
      const reale = realeOppureNull(richiesto);
      /* il controllo del contenitore si fa sul nome chiesto E sul reale: `../fuori/x` che non esiste è «fuori», non «assente» */
      if (!dentro(richiesto, base) || (reale && !dentro(reale, base))) throw Object.assign(sparito(), { motivo: 'fuori' });
      if (!reale) throw Object.assign(sparito(), { motivo: 'assente' });
      let st;
      try { st = statSync(reale); } catch { throw Object.assign(sparito(), { motivo: 'assente' }); }
      if (st.isDirectory()) throw Object.assign(sparito(), { motivo: 'cartella' });
      if (!st.isFile()) throw Object.assign(sparito(), { motivo: 'assente' });
      if (st.size > MAX_CHAT_FILE_BYTES) throw Object.assign(troppoGrande(), { dimensione: st.size, relativo: relativoDi(reale, base) });
      const bloccata = await bloccataPerIlDispositivo(dispositivoId, reale); // A-R2
      if (bloccata) throw Object.assign(sparito(), { motivo: 'bloccata', radice: bloccata.radice ?? null });
      return { percorso: reale, relativo: relativoDi(reale, base), nome: basename(reale), dimensione: st.size, versione: versioneDi(reale, st) };
    },

    async registraOfferta({ sessionId, dispositivoId, percorso, versioneAttesa = null } = {}) {
      if (typeof dispositivoId !== 'string' || !dispositivoId) throw malformato('A device is needed.');
      if (!esiste(sessionId)) throw errore('NOT_FOUND', 'Session not found.', { stato: 404 });
      const base = await cartellaDellaSessione(sessionId);
      if (!base || typeof percorso !== 'string' || !percorso) throw sparito();
      const reale = realeOppureNull(isAbsolute(percorso) ? percorso : resolve(base, percorso));
      if (!reale || !dentro(reale, base)) throw sparito();
      let st;
      try { st = statSync(reale); } catch { throw sparito(); }
      if (!st.isFile()) throw sparito();
      if (st.size > MAX_CHAT_FILE_BYTES) throw troppoGrande();
      const bloccata = await bloccataPerIlDispositivo(dispositivoId, reale); // A-R2: anche fra la carta e l'invio
      if (bloccata) throw Object.assign(sparito(), { motivo: 'bloccata', radice: bloccata.radice ?? null });
      /* R5.13 corsa 2: la carta ha mostrato QUESTA versione; se il file è cambiato dopo, non si manda quello che la persona non ha visto
         (lo stesso «controllato ≠ usato» delle cartelle, legato all'oggetto e non al nome) */
      if (versioneAttesa !== null && versioneDi(reale, st) !== versioneAttesa) throw Object.assign(sparito(), { motivo: 'cambiato' });
      const sha256 = await shaDelFile(reale);
      const dopo = statSync(reale);
      const versione = versioneDi(reale, st);
      if (versioneDi(reale, dopo) !== versione) throw sparito();
      offerte = offerte.filter((o) => !(o.dispositivoId === dispositivoId && o.sessionId === sessionId && chiave(o.percorso) === chiave(reale)));
      const o = { offertaId: casuale(12).toString('base64url'), dispositivoId, sessionId, percorso: reale, relativo: relativoDi(reale, base), nome: basename(reale), dimensione: st.size, versione, sha256, at: clock(), stato: 'inviato', percentuale: 0, letti: 0 };
      offerte.push(o);
      salvaOfferte();
      const fileId = idDelFile(sessionId, reale);
      avvisaNuovo(sessionId, fileId, dispositivoId);
      avvisaOfferta(o);
      return { offertaId: o.offertaId, fileId, versione, nome: o.nome, relativo: o.relativo, dimensione: o.dimensione, sha256 };
    },

    /** Le offerte di una conversazione, per la carta del PC (stato, percentuale, ora dello scarico). */
    offerte(sessionId) {
      if (!esiste(sessionId)) return [];
      return offerte.filter((o) => o.sessionId === sessionId).map(vistaOfferta);
    },
    /**
     * R5.13 corsa 2 (24/10/2026) — le offerte per la FINESTRA, dopo aver riguardato i file: un file cambiato dopo l'invio fa morire la
     * sua offerta anche se il dispositivo non è ancora passato a leggerla (D8), e la scheda lo dice in rosso con «Invia di nuovo» (D6).
     * Senza, il PC lo saprebbe solo quando il dispositivo prova a scaricare.
     */
    async offerteAggiornate(sessionId) {
      if (!esiste(sessionId)) return [];
      let cambiate = false;
      /* Revisione a blocco 7 (B-8): le offerte salvate prima di `relativo` lo ricevono qui, dalla cartella della sessione, così la scheda
         della finestra le aggancia ancora (prima per suffisso, ora per uguaglianza).
         ⛔ Revisione a blocco 8 (B8-5): lo si calcola a OGNI lettura e non si salva. Salvato alla prima lettura restava legato alla cartella
         di quel momento: cambiata la cartella della conversazione, il valore vecchio poteva agganciare lo stato a un'altra scheda. */
      const relativiDiOra = new Map();
      if (offerte.some((o) => o.sessionId === sessionId && typeof o.relativo !== 'string')) {
        const base = await cartellaDellaSessione(sessionId);
        for (const o of offerte) {
          if (o.sessionId !== sessionId || typeof o.relativo === 'string' || !base) continue;
          if (dentro(o.percorso, base)) relativiDiOra.set(o, relativoDi(o.percorso, base));
        }
      }
      for (const o of offerte) {
        if (o.sessionId !== sessionId || o.stato === 'cambiato' || o.cambiatoDopo) continue;
        let versione = null;
        try { const st = statSync(o.percorso); versione = st.isFile() ? versioneDi(o.percorso, st) : null; } catch { versione = null; }
        if (versione === o.versione) continue;
        /* owner 25/10/2026 (consigliata): un file GIÀ scaricato e poi cambiato sul PC resta «scaricato» — il dispositivo ha la sua copia —
           e la finestra offre «Invia la versione nuova»; il rosso «cambiato» resta per un file cambiato PRIMA dello scarico (D8) */
        if (o.stato === 'scaricato') o.cambiatoDopo = true;
        else o.stato = 'cambiato';
        cambiate = true; avvisaOfferta(o);
      }
      if (cambiate) salvaOfferte();
      return offerte.filter((o) => o.sessionId === sessionId)
        .map((o) => vistaOfferta(relativiDiOra.has(o) ? { ...o, relativo: relativiDiOra.get(o) } : o));
    },
    /**
     * D-3 del Mobile (25/10/2026, contratto Parte 2 «Revision 2»): `file.offers` — le offerte ANCORA da scaricare di questo dispositivo,
     * in tutte le conversazioni, per la notifica dopo una sveglia `f: 1`. Senza percorsi: sessione, offerta, file, versione, nome,
     * misura, tipo (dai byte) e ora. Un file cambiato nel frattempo fa morire la sua offerta (D8) e non c'è; una conversazione
     * cancellata nemmeno.
     */
    async offerteInAttesa(dispositivoId) {
      if (typeof dispositivoId !== 'string' || !dispositivoId) throw malformato('A device is needed.');
      const items = [];
      let cambiate = false;
      for (const o of offerte) {
        if (o.dispositivoId !== dispositivoId || (o.stato !== 'inviato' && o.stato !== 'in-scaricamento') || !esiste(o.sessionId)) continue;
        let st = null;
        try { st = statSync(o.percorso); } catch { st = null; }
        if (!st?.isFile() || versioneDi(o.percorso, st) !== o.versione) { o.stato = 'cambiato'; cambiate = true; avvisaOfferta(o); continue; }
        let tipo = { mime: 'application/octet-stream', immagine: false };
        try { tipo = tipoDaiByte(await testaDi(o.percorso)); } catch { /* illeggibile adesso: resta il tipo generico */ }
        items.push({ sessionId: o.sessionId, offertaId: o.offertaId, fileId: idDelFile(o.sessionId, o.percorso), versione: o.versione,
          nome: o.nome, dimensione: o.dimensione, mime: tipo.mime, inviataAlle: o.at });
      }
      if (cambiate) salvaOfferte();
      return { items };
    },
    ascoltaOfferte(fn) {
      if (typeof fn !== 'function') return () => {};
      ascoltatoriOfferte.add(fn);
      return () => { ascoltatoriOfferte.delete(fn); };
    },
    /** `file.nuovo` per un'iscrizione `session.events` di un dispositivo; torna la funzione che smette. */
    ascoltaSessione(sessionId, dispositivoId, fn) {
      if (typeof fn !== 'function') return () => {};
      const a = { sessionId, dispositivoId, fn };
      ascoltatoriSessione.add(a);
      return () => { ascoltatoriSessione.delete(a); };
    },
    /** Un dispositivo dimenticato o revocato: i suoi trasferimenti e le sue offerte se ne vanno con lui. */
    async dimenticaDispositivo(dispositivoId) {
      /* ⛔ REV5-F3 (24/10/2026): ogni trasferimento si butta DALLA SUA FILA. Prima `butta` correva accanto a un pezzo in volo: il pezzo
         rispondeva ok e il suo `salvaMeta` riscriveva `<id>.json` dopo la cancellazione (misurato: `trasferimenti/<hash>/<id>.json`
         rimasto, saltato a ogni avvio). Ora il pezzo in volo finisce, poi la fila butta tutto; il pezzo dopo dice TRANSFER_UNKNOWN. */
      for (const meta of [...aperti.values()]) {
        if (meta.dispositivoId === dispositivoId) await inFila(chiaveT(meta.dispositivoId, meta.trasferimentoId), () => butta(meta));
      }
      const prima = offerte.length;
      offerte = offerte.filter((o) => o.dispositivoId !== dispositivoId);
      if (offerte.length !== prima) salvaOfferte();
      for (const k of [...ricordoRighe.keys()]) if (k.startsWith(`${dispositivoId}\0`)) ricordoRighe.delete(k);
    },
  };
}
