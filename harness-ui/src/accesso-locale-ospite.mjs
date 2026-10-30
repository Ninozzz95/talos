/**
 * Il motore locale DELL'APP che ospita r4 (il telefono): la fonte `locale-ospite`.
 *
 * ⛔ Legge dell'owner, 18/10/2026: «il Codice è identico alla chat» ⇒ i modelli locali della chat anche nel Codice. Il modello è già
 *   aperto dall'app (llama.cpp nell'APK, con la NPU e la finestra scelta per quel telefono): r4 non lo carica una seconda volta, gli
 *   parla. Contratto fissato con la sessione mobile il 18/10/2026 (ledger mobile `LEDGER-CODICE-MOTORE-LOCALE-2026-10-18.md`):
 *   - l'app apre un server HTTP/1.1 su un SOCKET UNIX privato dentro la sua cartella (niente TCP: nessun'altra app lo raggiunge), con
 *     una chiave casuale per avvio, e la SPINGE a r4 con `POST /api/v1/providers/locale-ospite/access`
 *     `{ socketPath, chiave, modello, nCtx ≥ 4096, capacita?: { tools, reasoning } }`; ogni altro campo è un 400;
 *   - `socketPath` assoluto, dentro `TALOS_LOCALE_OSPITE_DIR` DOPO realpath, ed è un socket (lstat): r4 non bussa altrove;
 *   - r4 chiama con `Authorization: Bearer <chiave>`; `/access/remove` lo dimentica; senza accesso `LOCAL_RUNTIME_NOT_READY`.
 *   La forma ricalca `chatgpt-accesso-ospite.mjs`: l'app spinge, r4 tiene solo in memoria, e la chiave non esce mai da qui (né in
 *   `stato()`, né in un messaggio d'errore) — come la chiave effimera di llama-server dentro il suo supervisore.
 *
 * Spedire: `http.request({ socketPath })` trasformata in una `Response` web, così il ponte (`runtime-owner-adapter.mjs`) la tratta
 *   come ogni altra (sorveglianza del silenzio, SSE, 400 degli attrezzi). Non un `fetch` con un dispatcher costruito dalla classe
 *   globale di undici: con un proxy nell'ambiente quella classe è un `EnvHttpProxyAgent`, e la richiesta andrebbe al proxy.
 */

import { request as richiestaHttp } from 'node:http';
import { lstat as lstatReale, realpath as realpathReale } from 'node:fs/promises';
import { isAbsolute, sep } from 'node:path';
import { Readable } from 'node:stream';

import { FORMA_ID_MODELLO_LOCALE } from './local-model-store.mjs';

export const ROTTA_ACCESSO_LOCALE_OSPITE = '/api/v1/providers/locale-ospite/access';
export const ROTTA_DIMENTICA_LOCALE_OSPITE = '/api/v1/providers/locale-ospite/access/remove';
export const FONTE_LOCALE_OSPITE = 'locale-ospite';
export const CONTESTO_MINIMO = 4096;
const CAMPI = new Set(['socketPath', 'chiave', 'modello', 'nCtx', 'capacita']);
const CAMPI_CAPACITA = new Set(['tools', 'reasoning']);
/* la stessa grammatica degli id del motore locale (`config.mjs` FORMA_LOCALE): un nome accettato qui è anche un modello di sessione valido */
const ID_MODELLO = new RegExp(`^${FORMA_ID_MODELLO_LOCALE}$`, 'iu');

function errore(message, code) {
  return Object.assign(new Error(message), { code });
}

const dentro = (figlio, padre) => figlio === padre || figlio.startsWith(padre.endsWith(sep) ? padre : `${padre}${sep}`);

/**
 * `cartella`: `TALOS_LOCALE_OSPITE_DIR`. Senza, la fonte non esiste su questo server (`attivo: false`).
 * `fs` e `richiesta` servono alle prove (su Windows un socket Unix non si crea in una cartella: si prova la regola con un finto).
 */
export function creaAccessoLocaleOspite({ cartella = null, fs = {}, richiesta = richiestaHttp } = {}) {
  const lstat = fs.lstat ?? lstatReale;
  const realpath = fs.realpath ?? realpathReale;
  let attuale = null; // { socketPath, chiave, modello, nCtx, capacita }

  return {
    attivo: typeof cartella === 'string' && cartella.trim() !== '',

    /** L'accesso spinto dall'app. Torna l'errore da dire alla rotta, o `null` se l'ha tenuto. */
    async ricevi(corpo) {
      if (!this.attivo) return errore('This server does not take a local engine from an app.', 'LOCAL_GUEST_DISABLED');
      if (!corpo || typeof corpo !== 'object' || Array.isArray(corpo) || Object.keys(corpo).some((k) => !CAMPI.has(k))) {
        return errore('The local engine access accepts only socketPath, chiave, modello, nCtx and capacita.', 'QUERY_INVALID');
      }
      const { socketPath, chiave, modello, nCtx, capacita } = corpo;
      if (typeof chiave !== 'string' || chiave.length < 16 || chiave.length > 512) return errore('The local engine key is missing or invalid.', 'QUERY_INVALID');
      if (typeof modello !== 'string' || !ID_MODELLO.test(modello)) return errore('The local model name is missing or invalid.', 'QUERY_INVALID');
      if (!Number.isSafeInteger(nCtx) || nCtx < CONTESTO_MINIMO || nCtx > 10_000_000) return errore(`The context window must be a whole number of at least ${CONTESTO_MINIMO} tokens.`, 'QUERY_INVALID');
      if (capacita !== undefined && (!capacita || typeof capacita !== 'object' || Array.isArray(capacita)
        || Object.entries(capacita).some(([k, v]) => !CAMPI_CAPACITA.has(k) || typeof v !== 'boolean'))) {
        return errore('capacita accepts only tools and reasoning, as true or false.', 'QUERY_INVALID');
      }
      if (typeof socketPath !== 'string' || !isAbsolute(socketPath)) return errore('The socket path must be absolute.', 'QUERY_INVALID');
      /* dopo realpath, di tutti e due: un collegamento dentro la cartella che punta fuori non passa */
      let vero;
      let radice;
      try { [vero, radice] = await Promise.all([realpath(socketPath), realpath(cartella)]); }
      catch { return errore('The local engine socket does not exist.', 'LOCAL_GUEST_SOCKET_INVALID'); }
      if (!dentro(vero, radice)) return errore('The local engine socket is outside the app folder.', 'LOCAL_GUEST_SOCKET_INVALID');
      let info;
      try { info = await lstat(vero); } catch { return errore('The local engine socket does not exist.', 'LOCAL_GUEST_SOCKET_INVALID'); }
      if (!info.isSocket()) return errore('The local engine path is not a socket.', 'LOCAL_GUEST_SOCKET_INVALID');
      attuale = { socketPath: vero, chiave, modello, nCtx, capacita: { tools: capacita?.tools ?? null, reasoning: capacita?.reasoning ?? null } };
      return null;
    },

    /** Nessun modello aperto nell'app, o la chat l'ha chiuso. */
    dimentica() { attuale = null; },

    /** Mai la chiave, mai il percorso del socket. */
    stato() {
      return attuale ? { pronto: true, modello: attuale.modello, nCtx: attuale.nCtx, capacita: { ...attuale.capacita } } : { pronto: false };
    },

    /** Il modello aperto adesso è quello che la conversazione chiede? */
    pronto(modello) { return Boolean(attuale) && (modello === undefined || modello === attuale.modello); },

    /** La finestra vera dell'apertura, per la compattazione. */
    finestra(modello) { return attuale && modello === attuale.modello ? attuale.nCtx : null; },

    /**
     * Spedisce sul socket e torna una `Response`. `opzioni` come per `fetch` (method, headers, body stringa, signal).
     * La chiave la mette questa funzione, sopra ogni `Authorization` arrivata da fuori.
     */
    chiama(percorso, opzioni = {}) {
      if (!attuale) return Promise.reject(errore('No local model is open in the app.', 'LOCAL_RUNTIME_NOT_READY'));
      const { socketPath, chiave } = attuale;
      const corpo = typeof opzioni.body === 'string' ? opzioni.body : opzioni.body == null ? null : String(opzioni.body);
      const intestazioni = {};
      for (const [k, v] of Object.entries(opzioni.headers ?? {})) if (k.toLowerCase() !== 'authorization') intestazioni[k] = v;
      intestazioni.Authorization = `Bearer ${chiave}`;
      intestazioni.Host = 'localhost';
      if (corpo !== null) intestazioni['Content-Length'] = String(Buffer.byteLength(corpo));
      return new Promise((risolvi, rifiuta) => {
        if (opzioni.signal?.aborted) { rifiuta(opzioni.signal.reason ?? errore('The request was aborted.', 'ABORT_ERR')); return; }
        const req = richiesta({ socketPath, path: percorso, method: opzioni.method ?? 'POST', headers: intestazioni, ...(opzioni.signal ? { signal: opzioni.signal } : {}) }, (res) => {
          const h = new Headers();
          for (const [k, v] of Object.entries(res.headers)) if (v != null) h.set(k, Array.isArray(v) ? v.join(', ') : String(v));
          const senzaCorpo = res.statusCode === 204 || res.statusCode === 304 || (opzioni.method ?? 'POST') === 'HEAD';
          if (senzaCorpo) res.resume();
          risolvi(new Response(senzaCorpo ? null : Readable.toWeb(res), { status: res.statusCode, statusText: res.statusMessage ?? '', headers: h }));
        });
        /* il messaggio di rete non porta mai la chiave: si dice solo che il motore non risponde.
           ⛔ 26/10/2026 (D-0146-1 del Mobile): era LOCAL_RUNTIME_NOT_READY, che l'app traduce «Nessun modello locale è aperto» — falso
           quando il modello è aperto e il socket è morto (R8 nelle 0.1.44/0.1.45). Codice suo: l'app rifà il motore al prossimo invio
           (il suo `Custode`) e spinge il percorso nuovo, quindi basta rimandare. Nessun reinvio dentro il giro: il percorso vecchio è
           ancora quello che r4 conosce. */
        req.on('error', (e) => rifiuta(e?.name === 'AbortError' ? e
          : errore('The on-device engine in the app did not answer: send the message again, the app reopens it.', 'LOCAL_GUEST_UNREACHABLE')));
        req.end(corpo ?? undefined);
      });
    },
  };
}

/**
 * La finestra per la compattazione (`finestraTokenFn` del registro). Per un modello `locale-ospite:<nome>` è quella VERA
 * dell'apertura spinta dall'app (16-32k sul Pad, decisione dell'owner del 18/10), o `null` se l'app non ha aperto quel modello:
 * mai la finestra di un catalogo, che la sforerebbe. Per ogni altro modello `undefined`, e decide chi chiama.
 */
export function finestraDelModelloOspite(accesso, modello) {
  if (typeof modello !== 'string' || !modello.startsWith(`${FONTE_LOCALE_OSPITE}:`)) return undefined;
  return accesso?.finestra?.(modello.slice(FONTE_LOCALE_OSPITE.length + 1)) ?? null;
}

/**
 * Un 503 del motore dell'app col suo codice diventa un rifiuto leggibile, non un errore generico del giro (richiesta della
 * sessione mobile, 18/10): `LOCAL_ENGINE_BUSY` = il motore sta facendo un altro lavoro sullo stesso modello (una risposta della
 * chat o un riassunto del contesto, un lavoro alla volta: la frase è neutra dal 21/10, allineata a quella del servizio del Mobile),
 * `LOCAL_RUNTIME_NOT_READY` = nessun modello aperto; un 409 `LOCAL_MODEL_CHANGED` = nell'app ora è aperto un altro modello
 * (si sceglie di nuovo nel Codice, nessun ritentativo). Torna l'errore da lanciare, o `null` se la risposta non è una di queste.
 */
export async function rifiutoDelMotoreOspite(risposta) {
  if (risposta?.status !== 503 && risposta?.status !== 409) return null;
  let codice = null;
  try { codice = JSON.parse(await risposta.clone().text())?.error?.code ?? null; } catch { codice = null; }
  if (risposta.status === 409) return codice === 'LOCAL_MODEL_CHANGED' ? rifiutoOspiteDalCodice(codice) : null;
  return codice === 'LOCAL_ENGINE_BUSY' || codice === 'LOCAL_RUNTIME_NOT_READY' ? rifiutoOspiteDalCodice(codice) : null;
}

/* Le frasi dei tre rifiuti, in un posto solo: le dice il 409/503 qui sopra e, dal 21/10, il kernel quando lo stesso rifiuto arriva come
   pacchetto d'errore DENTRO il flusso (contratto del Mobile: dopo la sua coda il motore non può più rispondere 409/503). La carta
   d'errore le traduce per frase esatta (`frontend/src/components/errori.js`). */
const FRASI_DEI_RIFIUTI_OSPITE = Object.freeze({
  LOCAL_MODEL_CHANGED: 'Another on-device model is open now; choose it again in Code.',
  LOCAL_ENGINE_BUSY: 'The on-device model is busy with another job (a chat reply or a context summary); try again when it has finished.',
  LOCAL_RUNTIME_NOT_READY: 'No local model is open in the app: open one from the model picker.',
});

/** Il rifiuto noto del motore dell'app per il suo codice (`transitorio: false`, nessun ritentativo), o `null` se il codice non è suo. */
export function rifiutoOspiteDalCodice(codice) {
  if (typeof codice !== 'string' || !Object.hasOwn(FRASI_DEI_RIFIUTI_OSPITE, codice)) return null;
  return Object.assign(errore(FRASI_DEI_RIFIUTI_OSPITE[codice], codice), { transitorio: false, fornitore: FONTE_LOCALE_OSPITE });
}
