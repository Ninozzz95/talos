/**
 * F5 File reader (26/09/2026) — le FONTI del lettore: lo stesso contratto per un file della cartella (tab File) e per una
 * voce della Libreria, così le due porte mostrano lo STESSO file con gli STESSI byte (criterio della fetta F5-4).
 *
 *   leggiByte()   — i byte veri: `GET /sessions/:id/file?percorso=` o `/library/:voceId/file` (rotte di scarico già
 *                   esistenti: `attachment` riguarda la navigazione, non una `fetch`);
 *   creaPagina()  — per l'HTML: `POST /sessions/:id/pagine` {percorso} | {voceId}, il lasciapassare della resa;
 *   indirizzoPdf  — per il PDF: la rotta IN LINEA (`/file/anteprima` o `/library/:voceId/anteprima`), perché la CSP della
 *                   pagina di TALOS non ammette `blob:` in `frame-src` (misurato il 26/09).
 */
import { t } from '../lingua.js';
import { FORMATI_OSPITE, corniceOspite } from './office/cornice-ospite.js';
import { erroreDalRifiuto, FRASE_GENERICA, FRASE_GENERICA_ALLEGATO } from '../rifiuti-dei-file.js';

const API = '/api/v1';
const enc = encodeURIComponent;

/* Decisione 215 (owner 04/11/2026): «Il file non si è aperto: File not found» mostrava l'inglese della busta. Ora il codice (e il
   motivo) diventa una frase di TALOS nella lingua della persona; un codice ignoto, la frase generica (`rifiuti-dei-file.js`). */
const erroreDa = erroreDalRifiuto;

async function byteDa(fetchFn, indirizzo, generica = FRASE_GENERICA) {
  const risposta = await fetchFn(indirizzo, { credentials: 'same-origin' });
  if (!risposta.ok) throw await erroreDa(risposta, generica);
  return risposta.arrayBuffer();
}

async function rispostaPagina(fetchFn, sessionId, corpo) {
  const risposta = await fetchFn(`${API}/sessions/${enc(sessionId)}/pagine`, {
    method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo),
  });
  if (!risposta.ok) throw await erroreDa(risposta);
  const dati = await risposta.json();
  if (typeof dati?.data?.indirizzo !== 'string' || !dati.data.indirizzo.startsWith(`${API}/pagine/`)) throw new Error(t('varie.reader.source.noPageAddress'));
  return dati.data;
}
/** L'indirizzo della pagina sul nome del servizio: per i BYTE (la politica dell'app, `connect-src 'self'`, non ammette altre origini). */
const paginaDa = async (fetchFn, sessionId, corpo) => (await rispostaPagina(fetchFn, sessionId, corpo)).indirizzo;

/*
 * Giro di sicurezza 5 delle anteprime (11/11/2026; forma `FORMA-ORIGINE-PER-PAGINA-2026-11-11.md`, giudice v1417 a e c): nel guscio del PC la pagina
 *   si apre sulla SUA origine, `http://<etichetta>.localhost:<porta>`: Chromium le dà un processo suo (una che cade non porta via le sorelle) e
 *   risolve il nome da sé, senza DNS. L'etichetta la dà il servizio col lasciapassare; il servizio apre quel nome solo per quel lasciapassare.
 * ⛔ Solo nel guscio del PC (il suo gettone, l'app su 127.0.0.1 con una porta): nel browser (remoto, 4174) e nel telefono l'indirizzo resta quello
 *   di sempre, perché fuori da Chromium un nome sotto `localhost` può finire al DNS. Un'etichetta fuori forma vale come nessuna etichetta.
 */
const ETICHETTA_PAGINA = /^[0-9a-f]{32}$/;
const GETTONE_DEL_GUSCIO = /^[0-9a-f]{48}$/;
export function indirizzoDellaPagina({ indirizzo, etichetta } = {}, finestra = globalThis, gettone = finestra?.__talosGuscioArtefatti?.gettone) {
  const posto = finestra?.location;
  const nelGuscio = typeof gettone === 'string' && GETTONE_DEL_GUSCIO.test(gettone)
    && posto?.protocol === 'http:' && posto.hostname === '127.0.0.1' && /^\d{1,5}$/.test(String(posto.port ?? ''));
  if (!nelGuscio || typeof etichetta !== 'string' || !ETICHETTA_PAGINA.test(etichetta)) return indirizzo;
  return `http://${etichetta}.localhost:${posto.port}${indirizzo}`;
}
/** La pagina per la CORNICE (pannello, lettore, finestra a parte): sulla sua origine nel guscio, altrimenti com'è. */
const paginaPerLaCornice = async (fetchFn, sessionId, corpo, perLaCornice) => perLaCornice(await rispostaPagina(fetchFn, sessionId, corpo));

/**
 * Un file della cartella della sessione (percorso relativo, con `/`).
 * `perIlModello` (anteprima nelle domande, owner 29/10/2026): il file l'ha indicato il MODELLO. Le rotte ricevono `origine=modello` e
 *   applicano la regola dei segreti della lettura (`PREVIEW_FILE_SECRET`); e niente `creaPagina`: una pagina HTML resa coi suoi vicini
 *   potrebbe incorniciare un `.env` accanto a lei, quindi l'HTML di un'anteprima si disegna da solo, senza file né rete (chi la chiama).
 */
export function fonteDaCartella({ sessionId, percorso, nome = null, dimensione, perIlModello = false, fetchFn = (...a) => globalThis.fetch(...a), finestra = globalThis,
  perLaCornice = (dati) => indirizzoDellaPagina(dati, finestra) }) {
  const nomeVero = nome ?? String(percorso ?? '').split('/').pop();
  const origine = perIlModello ? '&origine=modello' : '';
  return {
    origine: 'cartella',
    nome: nomeVero,
    percorso,
    dimensione: Number.isFinite(dimensione) ? dimensione : undefined,
    leggiByte: () => byteDa(fetchFn, `${API}/sessions/${enc(sessionId)}/file?percorso=${enc(percorso)}${origine}`),
    ...(perIlModello ? {} : { creaPagina: () => paginaPerLaCornice(fetchFn, sessionId, { percorso }, perLaCornice) }),
    indirizzoPdf: `${API}/sessions/${enc(sessionId)}/file/anteprima?percorso=${enc(percorso)}${origine}`,
  };
}

/** Decisioni 43 e 47: un allegato di questa conversazione, per riferimento: non sta nella cartella del progetto. */
export function fonteDaAllegato({ sessionId, allegatoId, nome, fetchFn = (...a) => globalThis.fetch(...a) }) {
  return {
    origine: 'allegato',
    nome,
    percorso: null,
    dimensione: undefined,
    leggiByte: () => byteDa(fetchFn, `${API}/sessions/${enc(sessionId)}/allegati/${enc(allegatoId)}`, FRASE_GENERICA_ALLEGATO),
    indirizzoPdf: `${API}/sessions/${enc(sessionId)}/allegati/${enc(allegatoId)}/anteprima`,
  };
}

/** Una voce della Libreria (`{id, nome, ...}`). */
export function fonteDaLibreria({ sessionId, voce, nome = null, dimensione, versione = null, fetchFn = (...a) => globalThis.fetch(...a), finestra = globalThis,
  perLaCornice = (dati) => indirizzoDellaPagina(dati, finestra) }) {
  const voceId = String(voce?.id ?? '');
  /* 24/10/2026 (artefatti con versioni): `versione` rende QUELLA versione — la pagina e il suo testo; senza, l'ultima come prima */
  if (Number.isSafeInteger(versione) && versione >= 1) {
    return {
      origine: 'libreria',
      nome: nome ?? String(voce?.nome ?? voce?.titolo ?? voceId),
      percorso: null,
      versione,
      dimensione: undefined,
      leggiByte: async () => byteDa(fetchFn, await paginaDa(fetchFn, sessionId, { voceId, versione })),
      creaPagina: () => paginaPerLaCornice(fetchFn, sessionId, { voceId, versione }, perLaCornice),
      indirizzoPdf: null,
    };
  }
  return {
    origine: 'libreria',
    nome: nome ?? String(voce?.nome ?? voce?.titolo ?? voceId),
    percorso: null,
    dimensione: Number.isFinite(dimensione) ? dimensione : undefined,
    leggiByte: () => byteDa(fetchFn, `${API}/sessions/${enc(sessionId)}/library/${enc(voceId)}/file`),
    creaPagina: () => paginaPerLaCornice(fetchFn, sessionId, { voceId }, perLaCornice),
    indirizzoPdf: `${API}/sessions/${enc(sessionId)}/library/${enc(voceId)}/anteprima`,
  };
}

/**
 * Il caricatore delle rese Office. Il FOGLIO è un modulo della pagina (una tabella nostra, costruita con classi e
 * `textContent`: zero avvisi della CSP, misurato il 26/09), chiesto per indirizzo solo quando serve. Word e PowerPoint
 * invece si rendono DENTRO la pagina ospite (`office/cornice-ospite.js`): qui non si importa niente, si crea la cornice.
 */
export const RESE_OFFICE = Object.freeze({ foglio: '/lettore-foglio.js' });
const RESA_IN_CORNICE = Object.freeze({
  rendi: ({ doc, finestra, byte, nome, tipo, onErrore }) => corniceOspite({ doc, finestra, formato: tipo, byte, nome, onErrore }),
});
export function caricatoreOffice(importa = (indirizzo) => import(indirizzo)) {
  const inVolo = new Map();
  return (tipo) => {
    if (FORMATI_OSPITE.includes(tipo)) return Promise.resolve(RESA_IN_CORNICE);
    const indirizzo = RESE_OFFICE[tipo];
    if (!indirizzo) return Promise.reject(new Error(t('varie.reader.source.noRenderer', { type: tipo })));
    if (!inVolo.has(tipo)) inVolo.set(tipo, importa(indirizzo).catch((errore) => { inVolo.delete(tipo); throw errore; }));
    return inVolo.get(tipo);
  };
}
