/*
 * Decisioni 43 e 47 dell'owner (02/11/2026, reperto D13 del Tester): i file allegati stanno nei dati di TALOS, mai nel progetto, e git non
 *   li vede. Forma chiusa coi ritocchi di Performance, CLI e Mobile: `in-corso/FORMA-ALLEGATI-NEI-DATI-2026-11-02.md`.
 *
 * Nessun concorrente letto scrive nel progetto. Hermes tiene gli allegati nella sua cartella (`agent/context_references.py:490-500`,
 * «the gateway's OWN payload, never a workspace escape»), Open WebUI in `UPLOAD_DIR` (`backend/open_webui/config.py:180`). TALOS è più
 * stretto di Hermes: non è ammessa la cartella intera, solo gli allegati legati a QUELLA conversazione.
 *
 * - Ogni allegato ha un riferimento opaco, `allegatoId`, e al modello arriva un nome corto: `attachments/<id>/<nome>`. Il percorso vero
 *   col nome utente del PC non esce da qui (`percorsoDi` lo chiede solo il server).
 * - Sul disco `<sessioni>/allegati/<id>/allegati/<nome>` più `voce.json`. L'`allegati/` interno è dell'aiutante nativo verificato
 *   (`native/chat-file-upload/main.go:105`): tenerlo evita di ricompilarlo.
 * - Il legame nasce dall'invio: `lega` lo chiama il server con gli id del campo strutturato della bolla, mai leggendo il testo.
 * - Senza `cartella` nessuna scrittura e un errore chiaro, mai un ripiego nel progetto (ritocco 1 della CLI).
 * - I due tetti, spazio e numero di file, più quello per dispositivo, valgono PRIMA di scrivere (ritocco 3 della CLI). Sono provvisori:
 *   vanno misurati, poi decide l'owner (forma, punto 7).
 */
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdir, readdir, readFile, realpath, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { MAX_CHAT_FILE_BYTES, saveChatFile } from './chat-file-upload.mjs';

export const TETTI_ALLEGATI_DATI = Object.freeze({ byteTotali: 2 * 1024 ** 3, file: 2_000, bytePerDispositivo: 1024 ** 3, filePerDispositivo: 1_000 });
/* BD19: una bozza può restare aperta per giorni; il prezzo è poco spazio per una settimana */
const ETA_MASSIMA_SENZA_LEGAME_MS = 7 * 24 * 3_600_000;
const ETA_MASSIMA_ORFANA_MS = 24 * 3_600_000; // una cartella senza voce: un caricamento interrotto
const ETA_MINIMA_PER_SCIOGLIERE_MS = 3_600_000;
const ID_ALLEGATO = /^[0-9a-f]{24}$/u;
const VOCE = 'voce.json';
const DISPOSITIVO_DEL_PC = 'pc';

export const eIdAllegato = (id) => typeof id === 'string' && ID_ALLEGATO.test(id);
export const riferimentoAllegato = (allegatoId, nome) => `attachments/${allegatoId}/${nome}`;
/** La forma esatta del nome corto: tre pezzi, id vero, un nome di file senza barre e senza salite. */
export function eRiferimentoAllegato(testo) {
  if (typeof testo !== 'string') return false;
  const pezzi = testo.split('/');
  return pezzi.length === 3 && pezzi[0] === 'attachments' && eIdAllegato(pezzi[1]) && pezzi[2] !== '' && pezzi[2] !== '.' && pezzi[2] !== '..' && !pezzi[2].includes('\\');
}

/* BD15: un nome di file, non un percorso */
const eNomeDiFile = (nome) => typeof nome === 'string' && nome !== '' && nome !== '.' && nome !== '..' && nome.length <= 255 && !/[/\\\0]/u.test(nome);

/*
 * Revisione del blocco dati, BD2: gli allegati stanno accanto alle sessioni, nella stessa cartella dei giornali. Il 4174 e l'app hanno le stesse
 * sessioni ma non la stessa `TALOS_DESKTOP_DATA_DIR`: con la cartella del programma una chat si apriva da una parte col file rimasto dall'altra.
 * Senza sessioni non c'è cartella: mai accanto al codice.
 */
export const cartellaDegliAllegati = (cartellaStore) => (typeof cartellaStore === 'string' && cartellaStore !== '' ? join(cartellaStore, 'allegati') : null);

const errore = (code, reason, message, stato) => Object.assign(new Error(message), { code, reason, stato });

/*
 * L'elenco degli allegati di una conversazione, dal suo giornale: vale dopo ripresa, riavvio, compattazione e in un'altra finestra (ritocco 2
 * della CLI, ritocco b di Performance). Il percorso vero non è nel giornale: lo sa solo l'archivio.
 */
export const EVENTO_ALLEGATI_LEGATI = 'talos.allegati-legati';
export function allegatiDaEventi(eventi) {
  const allegati = new Map();
  for (const e of Array.isArray(eventi) ? eventi : []) {
    if (e?.type !== 'CUSTOM' || e.name !== EVENTO_ALLEGATI_LEGATI) continue;
    for (const a of Array.isArray(e.value?.allegati) ? e.value.allegati : []) {
      if (!eIdAllegato(a?.allegatoId) || typeof a.riferimento !== 'string') continue;
      allegati.set(a.allegatoId, { allegatoId: a.allegatoId, nome: String(a.nome ?? ''), riferimento: a.riferimento });
    }
  }
  return [...allegati.values()];
}

/*
 * Revisione del blocco dati, BD5: la cartella è comune a tutti i processi che usano le stesse sessioni (il 4174 e l'app), quindi la memoria di un
 * processo può essere vecchia. Il disco decide: una voce si rilegge prima di cambiarla o cancellarla, e un id che qui non c'è si cerca lì.
 * Fra due scritture nello stesso istante vince l'ultima: un legame perso così lo rimette la ripresa della chat, che lo rilegge dal giornale.
 */
export function creaArchivioAllegati({ cartella = null, salva = saveChatFile, clock = () => Date.now(), casuale = (n) => randomBytes(n).toString('hex'), tetti = TETTI_ALLEGATI_DATI, scriviFn = writeFile } = {}) {
  const voci = new Map();
  let radice = null;
  let caricamento = null;
  /* Ciò che sta arrivando adesso conta già: due caricamenti insieme non passano il tetto in coppia. */
  const inArrivo = { byte: 0, file: 0, perDispositivo: new Map() };
  /* BD4: una scrittura del legame fallita non ferma la chat: si riprova alla prossima occasione */
  const daRiscrivere = new Set();

  const disponibile = typeof cartella === 'string' && cartella !== '';
  const usati = (dispositivo = null) => {
    let byte = 0, file = 0;
    for (const v of voci.values()) if (dispositivo === null || v.dispositivo === dispositivo) { byte += v.bytes; file += 1; }
    return { byte, file };
  };
  const scriviVoce = async (voce) => {
    const dove = join(radice, voce.allegatoId, VOCE);
    const temporaneo = `${dove}.tmp-${process.pid}-${casuale(4)}`;
    const { percorso: _nonSiSalva, vistaAlle: _soloInMemoria, ...salvata } = voce;
    await scriviFn(temporaneo, `${JSON.stringify(salvata, null, 2)}\n`);
    await rename(temporaneo, dove);
    daRiscrivere.delete(voce.allegatoId);
  };
  /* BD15: `voce.json` è un file sul disco: il nome deve restare un nome, o il percorso uscirebbe dalla sua cartella e si leggerebbe senza carta */
  const voceDalTesto = (id, testo) => {
    try {
      const dati = JSON.parse(testo);
      if (dati?.allegatoId !== id || !eNomeDiFile(dati.nome) || !Number.isSafeInteger(dati.bytes)) return null;
      return { allegatoId: id, nome: dati.nome, bytes: dati.bytes, creato: Number(dati.creato) || 0, dispositivo: String(dati.dispositivo ?? DISPOSITIVO_DEL_PC),
        legami: Array.isArray(dati.legami) ? dati.legami.filter((s) => typeof s === 'string') : [], ...(dati.scartata === true ? { scartata: true } : {}),
        percorso: join(radice, id, 'allegati', dati.nome) };
    } catch { return null; }
  };
  const leggiVoce = async (id) => {
    try { return voceDalTesto(id, await readFile(join(radice, id, VOCE), 'utf8')); } catch { return null; }
  };
  /* La voce com'è sul disco adesso; se sul disco non c'è, non c'è nemmeno qui. */
  const rileggi = async (id) => {
    if (daRiscrivere.has(id) && voci.has(id)) return voci.get(id); // il disco è indietro di un legame che ancora non si è potuto scrivere
    const voce = await leggiVoce(id);
    if (voce) { const vista = voci.get(id)?.vistaAlle; voci.set(id, vista ? { ...voce, vistaAlle: vista } : voce); } else voci.delete(id);
    return voci.get(id) ?? null;
  };
  /* Nomi nuovi sul disco, nomi spariti: un altro processo può aver aggiunto o tolto (BD5) */
  const allineaElenco = async () => {
    const presenti = new Set((await readdir(radice)).filter(eIdAllegato));
    for (const id of voci.keys()) if (!presenti.has(id)) voci.delete(id);
    for (const id of presenti) {
      if (voci.has(id)) continue;
      const voce = await leggiVoce(id);
      if (voce) voci.set(id, voce);
    }
    return presenti;
  };
  const pronta = () => {
    /* BD10: una partenza fallita (la cartella non si crea) non resta per sempre: si riprova alla prossima */
    caricamento ??= (async () => {
      if (!disponibile) return;
      await mkdir(cartella, { recursive: true });
      radice = await realpath(cartella); // il nucleo confronta col percorso vero: una giunzione più su non deve spegnere gli allegati
      await allineaElenco();
    })().catch((motivo) => { caricamento = null; throw motivo; });
    return caricamento;
  };
  /* BD6: prima la cartella, poi il ricordo: se `rm` fallisce la voce resta, e la pulizia ci riprova */
  const togli = async (id) => {
    await rm(join(radice, id), { recursive: true, force: true });
    voci.delete(id);
  };
  const riscriviIRimasti = async () => {
    for (const id of [...daRiscrivere]) {
      const voce = voci.get(id);
      if (!voce) { daRiscrivere.delete(id); continue; }
      await scriviVoce(voce).catch(() => {});
    }
  };
  const mettiLegame = async (voce, sessionId) => {
    if (voce.legami.includes(sessionId)) return;
    voce.legami.push(sessionId);
    daRiscrivere.add(voce.allegatoId);
    await scriviVoce(voce).catch(() => {}); // BD4: il legame resta in memoria e nel giornale; `voce.json` si riscrive dopo
  };
  const lasciaLegame = async (voce, tolti) => {
    voce.legami = voce.legami.filter((s) => !tolti.includes(s));
    if (voce.legami.length === 0) voce.scartata = true;
    await scriviVoce(voce);
    if (voce.legami.length === 0) await togli(voce.allegatoId);
  };

  const archivio = {
    disponibile,
    async pronto() { await pronta(); return archivio; },
    uso() { const { byte, file } = usati(); return { file, byte }; },
    /** Solo per il server e per il nucleo: non esce mai verso il modello o un dispositivo. Sincrona: il nucleo la legge durante una lettura. */
    percorsoDi(allegatoId) {
      const inMemoria = voci.get(allegatoId);
      if (inMemoria) return inMemoria.percorso;
      if (!radice || !eIdAllegato(allegatoId)) return null;
      try {
        const voce = voceDalTesto(allegatoId, readFileSync(join(radice, allegatoId, VOCE), 'utf8'));
        if (voce) voci.set(allegatoId, voce); // arrivato da un altro processo dopo la partenza (BD5)
        return voce?.percorso ?? null;
      } catch { return null; }
    },
    voceDi(allegatoId) {
      const v = voci.get(allegatoId);
      return v ? { allegatoId, nome: v.nome, bytes: v.bytes, riferimento: riferimentoAllegato(allegatoId, v.nome) } : null;
    },
    legamiDi(allegatoId) { return [...(voci.get(allegatoId)?.legami ?? [])]; },

    /** I tetti, prima di scrivere e prima che il telefono mandi il file (BD14). Lancia `ATTACHMENTS_FULL`. */
    async controllaSpazio({ byte = 0, dispositivo = DISPOSITIVO_DEL_PC } = {}) {
      await pronta();
      await allineaElenco();
      const peso = Math.max(0, Number(byte) || 0);
      const delDispositivo = usati(dispositivo);
      const suoInArrivo = inArrivo.perDispositivo.get(dispositivo) ?? { byte: 0, file: 0 };
      const tutti = usati();
      if (tutti.byte + inArrivo.byte + peso > tetti.byteTotali || tutti.file + inArrivo.file + 1 > tetti.file
        || delDispositivo.byte + suoInArrivo.byte + peso > tetti.bytePerDispositivo
        || delDispositivo.file + suoInArrivo.file + 1 > (tetti.filePerDispositivo ?? Number.POSITIVE_INFINITY)) {
        throw errore('ATTACHMENTS_FULL', 'attachments-full', 'The space for attached files is full. Delete a chat that has attachments and try again.', 507);
      }
    },

    async salva({ nome, source, previsti = 0, dispositivo = DISPOSITIVO_DEL_PC }) {
      const drena = async () => { for await (const _ of source) { /* il corpo della richiesta si legge comunque, poi si risponde */ } };
      const nonDisponibile = () => errore('ATTACHMENTS_UNAVAILABLE', 'attachments-no-data-folder', 'The TALOS data folder is not available, so the file was not saved.', 503);
      if (!disponibile) { await drena(); throw nonDisponibile(); }
      try { await pronta(); } catch { await drena(); throw nonDisponibile(); }
      try { await archivio.controllaSpazio({ byte: previsti, dispositivo }); } catch (motivo) { await drena(); throw motivo; }
      const peso = Math.max(0, Number(previsti) || 0);
      const suo = inArrivo.perDispositivo.get(dispositivo) ?? { byte: 0, file: 0 };
      inArrivo.byte += peso; inArrivo.file += 1; inArrivo.perDispositivo.set(dispositivo, { byte: suo.byte + peso, file: suo.file + 1 });
      const allegatoId = casuale(12);
      const dove = join(radice, allegatoId);
      try {
        await mkdir(dove);
        const ricevuta = await salva({ rootDir: dove, name: nome, source });
        const voce = { allegatoId, nome: ricevuta.nome, bytes: ricevuta.bytes, creato: clock(), dispositivo, legami: [], percorso: join(dove, 'allegati', ricevuta.nome) };
        await scriviVoce(voce);
        voci.set(allegatoId, voce);
        return { tipo: 'file', nome: voce.nome, bytes: voce.bytes, allegatoId, percorso: riferimentoAllegato(allegatoId, voce.nome) };
      } catch (motivo) {
        await rm(dove, { recursive: true, force: true }).catch(() => {});
        throw motivo;
      } finally {
        const ora = inArrivo.perDispositivo.get(dispositivo);
        inArrivo.byte -= peso; inArrivo.file -= 1; inArrivo.perDispositivo.set(dispositivo, { byte: ora.byte - peso, file: ora.file - 1 });
      }
    },

    /** `null` se tutti gli id si possono legare a questa conversazione; altrimenti il motivo. `sessionId` nullo: la chat sta per nascere. */
    async controlla(sessionId, ids) {
      await pronta();
      for (const id of ids) {
        const voce = await rileggi(id);
        if (!voce || voce.scartata) return { code: 'ATTACHMENT_NOT_AVAILABLE', reason: 'attachment-unknown', message: 'This attached file is no longer available. Attach it again.' };
        if (voce.legami.length > 0 && !voce.legami.includes(sessionId)) return { code: 'ATTACHMENT_NOT_AVAILABLE', reason: 'attachment-of-another-chat', message: 'This attached file belongs to another chat. Attach it again.' };
        voce.vistaAlle = clock(); // BD19: fra il controllo e il legame la pulizia non la tocca
      }
      return null;
    },
    /* BD4: non rifiuta mai per una scrittura: il messaggio è già partito, e un errore qui lo farebbe mandare due volte */
    async lega(sessionId, ids) {
      await pronta();
      for (const id of ids) {
        const voce = await rileggi(id);
        if (voce) await mettiLegame(voce, sessionId);
      }
    },
    /** Una fork eredita gli allegati del padre: il file resta finché una delle due lo usa. */
    async eredita(sessionIdPadre, sessionIdFork) {
      await pronta();
      await allineaElenco();
      for (const id of [...voci.keys()]) {
        const voce = await rileggi(id);
        if (voce?.legami.includes(sessionIdPadre)) await mettiLegame(voce, sessionIdFork);
      }
    },
    /** I file si cancellano con la chat (forma, punto 7); il file resta se un'altra chat della stessa storia lo usa. */
    async sciogli(sessionId) {
      await pronta();
      if (!radice) return;
      await allineaElenco();
      for (const id of [...voci.keys()]) {
        const voce = await rileggi(id);
        if (voce?.legami.includes(sessionId)) await lasciaLegame(voce, [sessionId]);
      }
    },
    /**
     * BD6: i legami verso chat che non ci sono più (un `sciogli` mai arrivato) tengono il file per sempre, e il tetto non si libera. All'avvio, con
     * `esiste` che guarda le sessioni vere. ⛔ Una voce appena nata si lascia stare: la sua chat può star nascendo in un altro processo.
     */
    async sciogliAssenti(esiste) {
      await pronta();
      if (!radice) return;
      const adesso = clock();
      for (const id of [...voci.keys()]) {
        const voce = await rileggi(id);
        if (!voce || voce.legami.length === 0 || adesso - voce.creato < ETA_MINIMA_PER_SCIOGLIERE_MS) continue;
        const assenti = [];
        for (const sessionId of voce.legami) if (!(await esiste(sessionId))) assenti.push(sessionId);
        if (assenti.length > 0) await lasciaLegame(voce, assenti);
      }
    },
    /** Ciò che non è mai stato legato: bozze tolte o mai inviate (ritocco del Mobile); le cartelle orfane di un caricamento interrotto (BD6). */
    async pulisci() {
      await pronta();
      if (!radice) return;
      await riscriviIRimasti();
      const adesso = clock();
      const presenti = await allineaElenco();
      for (const id of [...voci.keys()]) {
        const inMemoria = voci.get(id);
        const dallUltimaVista = adesso - Math.max(inMemoria.creato, inMemoria.vistaAlle ?? 0);
        if (inMemoria.legami.length > 0 && !inMemoria.scartata) continue;
        if (!inMemoria.scartata && dallUltimaVista <= ETA_MASSIMA_SENZA_LEGAME_MS) continue;
        const voce = await rileggi(id); // BD5: un altro processo può averla legata
        if (voce && voce.legami.length === 0) await togli(id).catch(() => {});
      }
      for (const id of presenti) {
        if (voci.has(id)) continue;
        const dove = join(radice, id);
        try {
          const { mtimeMs } = await stat(dove);
          if (adesso - mtimeMs > ETA_MASSIMA_ORFANA_MS) await rm(dove, { recursive: true, force: true });
        } catch { /* la riprova il prossimo giro */ }
      }
    },
  };
  return archivio;
}

/** La dimensione dichiarata dalla richiesta. Se non c'è (un invio a pezzi) vale il massimo: il tetto scatta prima di scrivere (BD12). */
export function byteDichiarati(valore) {
  const n = Number(valore);
  return valore !== undefined && valore !== null && valore !== '' && Number.isSafeInteger(n) && n >= 0 ? n : MAX_CHAT_FILE_BYTES;
}
