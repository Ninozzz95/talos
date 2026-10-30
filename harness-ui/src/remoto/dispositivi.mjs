/*
 * Controllo remoto — l'ELENCO dei telefoni accoppiati a questo PC (contratto v0.3 §B.1, §12; mockup v5 «Telefoni collegati»).
 *
 * È l'elenco che decide chi entra: il PC ammette una connessione solo se `remoteId()` è qui e non revocato, e lo controlla PRIMA di
 * leggere un byte (condizione B.1 di Nino1). L'accoppiamento vale finché lo revochi (owner 17/10): nessuna scadenza.
 *
 * Su file nella cartella dei dati, non nel portachiavi: sono dati pubblici (l'EndpointId è la chiave PUBBLICA del telefono) più
 * l'iscrizione Web Push, che serve solo a chi ha anche la VAPID del PC, che invece sta nel portachiavi. Il file si scrive come
 * Hermes scrive i suoi (`gateway/pairing.py:1-8`, «chmod 0600 data files»; `atomic_json_write`): su un temporaneo, poi rename.
 *
 * Un telefono revocato resta nell'elenco con `revocatoAlle` e `revocatoDa` ('pc' | 'telefono'), perché la finestra deve poter dire
 * «revocato dal telefono» (§12); riaccoppiato, torna una voce nuova.
 */

import { randomBytes } from 'node:crypto';
import { isIP } from 'node:net';
import { promises as fsp } from 'node:fs';
import { dirname } from 'node:path';
import { firmaDelFile } from './firma-file.mjs';
import { pulisciNomeDispositivo } from './nome-dispositivo.mjs';
import { creaLucchettoFraProcessi } from '../lucchetto-fra-processi.mjs';

export const TELEFONI_MASSIMI = 16; // contratto §13
const VERSIONE = 1;

function errore(code, message) {
  return Object.assign(new Error(message), { code });
}

/*
 * L'iscrizione Web Push di un telefono, o null se non vale (R-M5, Mobile 21/10/2026: ora la manda anche `device.wake`, dopo
 * l'accoppiamento, e un'iscrizione cambia quando il distributore ne dà una nuova). Il PC la usa per POSTare: si accetta solo ciò che
 * una sveglia vera può essere, mai un indirizzo qualunque.
 *   · `endpoint`: un URL https (RFC 8030 §5: il push service si raggiunge in HTTPS), al più 2.048 caratteri;
 *   · `keys.p256dh`: base64url di un punto P-256 NON compresso, 65 byte che iniziano con 0x04 (RFC 8291 §3.1; `web-push`
 *     `encryption-helper.js:15-16` rifiuta qualunque altra lunghezza);
 *   · `keys.auth`: base64url di 16 byte (RFC 8291 §3.2).
 */
const BASE64URL = /^[A-Za-z0-9_-]+={0,2}$/u;
/*
 * ⛔ Revisione del 21/10 (R-M5, S4 insieme al tetto): il PC POSTa all'endpoint, quindi un endpoint che punta al PC stesso o ai
 *   metadati di un cloud non si accetta mai. Come il «pavimento» di Hermes (`tools/url_safety.py:97-113`, `:263-265`: metadati e
 *   tutto il link-local bloccati sempre, anche quando le reti private sono ammesse), più loopback, multicast e l'indirizzo nullo.
 *   Le reti private restano: un ntfy di UnifiedPush ospitato in casa (in https) è un uso vero. ⛔ Si guarda la FORMA dell'indirizzo
 *   (il parser WHATWG porta `2130706433` e `0x7f.1` a `127.0.0.1`), non la risoluzione: un nome che risolve in 127.0.0.1 passa
 *   (limite dichiarato; il tetto delle sveglie ne limita l'uso).
 */
const NOMI_MAI = new Set(['localhost', 'metadata.google.internal', 'metadata.goog']);
const ipv4Mai = (ip) => {
  const [a, b] = ip.split('.').map(Number);
  return a === 0 || a === 127 || (a === 169 && b === 254) || a >= 224 || ip === '100.100.100.200';
};
function indirizzoMai(hostname) {
  const h = hostname.replace(/^\[|\]$/gu, '').replace(/\.$/u, '').toLowerCase();
  if (NOMI_MAI.has(h) || h.endsWith('.localhost')) return true;
  if (isIP(h) === 4) return ipv4Mai(h);
  if (isIP(h) !== 6) return false;
  const mappato = /^::ffff:(?:(\d+\.\d+\.\d+\.\d+)|([0-9a-f]{1,4}):([0-9a-f]{1,4}))$/u.exec(h);
  if (mappato) {
    const v4 = mappato[1] ?? [parseInt(mappato[2], 16) >> 8, parseInt(mappato[2], 16) & 255, parseInt(mappato[3], 16) >> 8, parseInt(mappato[3], 16) & 255].join('.');
    return ipv4Mai(v4);
  }
  return h === '::' || h === '::1' || /^fe[89ab][0-9a-f]?:/u.test(h) || /^ff[0-9a-f]{0,2}:/u.test(h) || h === 'fd00:ec2::254';
}
const byteDi = (testo, massimo) => (typeof testo === 'string' && testo.length <= massimo && BASE64URL.test(testo) ? Buffer.from(testo, 'base64url') : null);
export function svegliaValida(sveglia) {
  if (!sveglia || typeof sveglia !== 'object' || typeof sveglia.endpoint !== 'string' || sveglia.endpoint.length > 2048) return null;
  let url; try { url = new URL(sveglia.endpoint); } catch { return null; }
  if (url.protocol !== 'https:' || url.username || url.password || indirizzoMai(url.hostname)) return null;
  const p256dh = byteDi(sveglia.keys?.p256dh, 128);
  const auth = byteDi(sveglia.keys?.auth, 64);
  if (!p256dh || p256dh.length !== 65 || p256dh[0] !== 0x04 || !auth || auth.length !== 16) return null;
  return { endpoint: sveglia.endpoint, keys: { p256dh: sveglia.keys.p256dh, auth: sveglia.keys.auth } };
}

function normalizza(voce) {
  if (!voce || typeof voce.id !== 'string' || typeof voce.endpointId !== 'string') return null;
  const sveglia = svegliaValida(voce.sveglia);
  return {
    id: voce.id,
    endpointId: voce.endpointId,
    /* E-R1 (27/10/2026): anche i nomi salvati PRIMA della pulizia escono puliti */
    nome: pulisciNomeDispositivo(voce.nome) || null,
    piattaforma: pulisciNomeDispositivo(voce.piattaforma, 40) || null,
    collegatoAlle: Number.isFinite(voce.collegatoAlle) ? voce.collegatoAlle : null,
    ultimaVoltaAlle: Number.isFinite(voce.ultimaVoltaAlle) ? voce.ultimaVoltaAlle : null,
    sveglia,
    revocatoAlle: Number.isFinite(voce.revocatoAlle) ? voce.revocatoAlle : null,
    revocatoDa: voce.revocatoDa === 'pc' || voce.revocatoDa === 'telefono' ? voce.revocatoDa : null,
  };
}

/** Ciò che l'interfaccia può vedere: mai le chiavi dell'iscrizione Web Push. */
export function vocePubblica(v) {
  return { id: v.id, endpointId: v.endpointId, nome: v.nome, piattaforma: v.piattaforma, collegatoAlle: v.collegatoAlle, ultimaVoltaAlle: v.ultimaVoltaAlle,
    sveglia: Boolean(v.sveglia), revocatoAlle: v.revocatoAlle, revocatoDa: v.revocatoDa };
}

export function creaElencoDispositivi({ file, fs = fsp, clock = () => Date.now(), casuale = (n) => randomBytes(n), lucchetto = null } = {}) {
  if (typeof file !== 'string' || !file) throw errore('REMOTE_DEVICES_FILE', 'The paired devices need a data file.');
  /* Revisione blocco 9 (E-R1, 27/10/2026): la CLI revocava un telefono mentre la finestra segnava «visto», e il telefono tornava ammesso
     20 volte su 20. Un lavoro alla volta fra i processi, come Hermes (`gateway/pairing.py:376-388`); con un fs finto nessun lucchetto. */
  const conLucchetto = typeof lucchetto === 'function' ? lucchetto
    : fs === fsp ? creaLucchettoFraProcessi({ file: `${file}.lock`, attesaMs: 10_000, scadenzaMs: 30_000,
      codice: 'REMOTE_STORE_BUSY', messaggio: 'Another TALOS window is changing the paired devices: try again in a moment.' })
      : (lavoro) => lavoro();
  let voci = null;
  let coda = Promise.resolve();
  /*
   * 27/10/2026 — il file si rilegge quando CAMBIA sul disco (impronta dello stat, `firmaDelFile`), come Hermes `gateway/pairing.py:397-415`.
   *   La finestra e `talos remote` (CLI) scrivono lo stesso file: con una lettura sola per processo, un telefono revocato dall'altro
   *   restava ammesso qui, e la nostra scrittura dopo lo rimetteva in vita.
   * ⛔ Mai DURANTE una scrittura (`inScrittura`): l'elenco che la scrittura sta cambiando non si sostituisce, o la modifica si perde.
   *   La rilettura per chi scrive avviene all'inizio di ogni lavoro in fila, prima di guardare l'elenco.
   */
  let firmaLetta = null;
  let inScrittura = 0;

  const leggi = async () => {
    const firma = await firmaDelFile(fs, file);
    if (voci && firma !== null && firma === firmaLetta) return voci;
    let grezzo = null;
    try { grezzo = await fs.readFile(file, 'utf8'); } catch (e) { if (e?.code !== 'ENOENT') throw e; }
    let dati = null;
    if (grezzo != null) {
      try { dati = JSON.parse(grezzo); } catch { throw errore('REMOTE_DEVICES_UNREADABLE', 'The list of paired devices cannot be read.'); }
    }
    /* Un file illeggibile NON si legge come vuoto: vorrebbe dire ammettere nessuno, ma anche riscriverlo e perdere le revoche. */
    if (voci && inScrittura > 0) return voci; // una scrittura è cominciata mentre si leggeva: vince lei
    voci = Array.isArray(dati?.dispositivi) ? dati.dispositivi.map(normalizza).filter(Boolean) : [];
    firmaLetta = firma;
    return voci;
  };
  /* un fs finto senza `stat` (prove vecchie) resta come prima: una lettura sola */
  const carica = async () => (voci && (inScrittura > 0 || typeof fs.stat !== 'function') ? voci : leggi());
  const salva = async () => {
    await fs.mkdir(dirname(file), { recursive: true });
    const temporaneo = `${file}.${process.pid}.${randomBytes(8).toString('hex')}.tmp`; // due scritture nello stesso ms non si pestano (REV5-COL-2)
    await fs.writeFile(temporaneo, JSON.stringify({ v: VERSIONE, dispositivi: voci }, null, 1), { encoding: 'utf8', mode: 0o600 });
    await fs.rename(temporaneo, file);
    firmaLetta = await firmaDelFile(fs, file); // il file ora è il nostro: nessuna rilettura per una scrittura propria
  };
  /* Una scrittura alla volta: due conferme ravvicinate non si pestano. Prima di ogni lavoro, l'elenco com'è ADESSO sul disco. */
  const inFila = (lavoro) => {
    const esegui = () => conLucchetto(async () => {
      if (typeof fs.stat === 'function') await leggi();
      inScrittura += 1;
      try { return await lavoro(); } finally { inScrittura -= 1; }
    });
    const prossimo = coda.then(esegui, esegui);
    coda = prossimo.catch(() => {});
    return prossimo;
  };

  return {
    async elenca() { return (await carica()).map(vocePubblica); },

    /** Il controllo d'ammissione: vero solo per un telefono accoppiato e non revocato. */
    async ammesso(endpointId) {
      if (typeof endpointId !== 'string' || !endpointId) return null;
      const v = (await carica()).find((x) => x.endpointId === endpointId && !x.revocatoAlle);
      return v ? vocePubblica(v) : null;
    },

    /** L'iscrizione Web Push di un telefono, per la sveglia: solo per chi la manda, mai all'interfaccia. */
    async iscrizione(id) {
      const v = (await carica()).find((x) => x.id === id && !x.revocatoAlle);
      return v?.sveglia ?? null;
    },

    aggiungi({ endpointId, nome = null, piattaforma = null, sveglia = null }) {
      return inFila(async () => {
        await carica();
        if (typeof endpointId !== 'string' || !endpointId) throw errore('REMOTE_DEVICE_BAD', 'A device needs its endpoint id.');
        const vivi = voci.filter((x) => !x.revocatoAlle);
        /* Lo stesso telefono riaccoppiato: la voce vecchia esce, non restano due voci vive per una chiave. */
        for (const x of vivi) if (x.endpointId === endpointId) { x.revocatoAlle = clock(); x.revocatoDa = 'pc'; }
        if (voci.filter((x) => !x.revocatoAlle).length >= TELEFONI_MASSIMI) throw errore('REMOTE_TOO_MANY_PHONES', `At most ${TELEFONI_MASSIMI} devices can be paired with this computer.`);
        const voce = normalizza({ id: Buffer.from(casuale(12)).toString('base64url'), endpointId, nome, piattaforma, sveglia, collegatoAlle: clock() });
        voci.push(voce);
        await salva();
        return vocePubblica(voce);
      });
    },

    rinomina(id, nome) {
      return inFila(async () => {
        await carica();
        const v = voci.find((x) => x.id === id);
        if (!v) throw errore('REMOTE_DEVICE_UNKNOWN', 'This device is not paired.');
        const pulito = pulisciNomeDispositivo(String(nome ?? '')); // E-R1 (27/10/2026)
        if (!pulito) throw errore('REMOTE_DEVICE_BAD', 'The name cannot be empty.');
        v.nome = pulito;
        await salva();
        return vocePubblica(v);
      });
    },

    aggiornaSveglia(id, sveglia) {
      return inFila(async () => {
        await carica();
        const v = voci.find((x) => x.id === id && !x.revocatoAlle);
        if (!v) throw errore('REMOTE_DEVICE_UNKNOWN', 'This device is not paired.');
        v.sveglia = normalizza({ ...v, sveglia }).sveglia;
        await salva();
        return vocePubblica(v);
      });
    },

    /** Annotato quando il telefono si collega: è il «visto l'ultima volta» della finestra. */
    visto(id) {
      return inFila(async () => {
        await carica();
        const v = voci.find((x) => x.id === id);
        if (!v) return null;
        v.ultimaVoltaAlle = clock();
        await salva();
        return vocePubblica(v);
      });
    },

    /** `da`: 'pc' (finestra o `talos remote revoke`) o 'telefono' («Dimentica questo computer»). */
    revoca(id, da = 'pc') {
      return inFila(async () => {
        await carica();
        const v = voci.find((x) => x.id === id);
        if (!v) throw errore('REMOTE_DEVICE_UNKNOWN', 'This device is not paired.');
        if (!v.revocatoAlle) { v.revocatoAlle = clock(); v.revocatoDa = da === 'telefono' ? 'telefono' : 'pc'; v.sveglia = null; await salva(); }
        return vocePubblica(v);
      });
    },
  };
}
