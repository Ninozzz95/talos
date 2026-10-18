/**
 * «Continue with ChatGPT» — il traffico: l'elenco dei modelli del piano e le rotte dell'accesso.
 *
 * Tenuto fuori da `http-app.mjs` di proposito: lì entra una riga che chiede a questo modulo «è tua?»; qui sta tutto il resto, e
 * si prova senza un server. Le rotte:
 *   GET  /api/v1/auth/chatgpt/stato    chi è collegato, se il piano è abilitato, l'esito dell'ultimo tentativo
 *   POST /api/v1/auth/chatgpt/inizia   apre un tentativo; torna l'indirizzo da aprire nel browser di sistema
 *   POST /api/v1/auth/chatgpt/annulla  chiude il tentativo in corso
 *   POST /api/v1/auth/chatgpt/esci     revoca e toglie i token
 * ⛔ Nessuna risposta porta un token. L'accesso nel browser lo fa la persona: qui non c'è una rotta che lo conclude al posto suo.
 *
 * Modelli: `GET https://api.openai.com/v1/models` col token del piano; la radice è `models`; si tengono quelli con
 * `visibility == "list"`, si mostra `display_name`, si passa `slug`, si tiene l'ordine del server e si rilegge quando cambia
 * l'account (developers.openai.com/siwc/token-sharing-open-source/models-and-inference, riletta l'11/10/2026; forma dei campi
 * dalla prova dal vivo dello stesso giorno, PIANO §10: `context_window`, `supported_reasoning_levels`, `input_modalities`).
 */

import { RISORSA } from './chatgpt-oauth.mjs';

export const PREFISSO_ROTTE = '/api/v1/auth/chatgpt/';
export const ROTTE_CHATGPT = Object.freeze([
  Object.freeze({ schema: `${PREFISSO_ROTTE}stato`, metodi: Object.freeze(['GET']) }),
  Object.freeze({ schema: `${PREFISSO_ROTTE}inizia`, metodi: Object.freeze(['POST']) }),
  Object.freeze({ schema: `${PREFISSO_ROTTE}annulla`, metodi: Object.freeze(['POST']) }),
  Object.freeze({ schema: `${PREFISSO_ROTTE}esci`, metodi: Object.freeze(['POST']) }),
]);
/** Per quanto vale l'elenco letto: i modelli di un piano non cambiano di minuto in minuto, ma un piano può cambiare. */
/* 18/10/2026, custode nell'app (contratto con la sessione mobile): l'app spinge il token di accesso prima di ogni giro, come le chiavi
   dei fornitori (`/api/v1/providers/:id/key`); r4 lo tiene solo in memoria (`chatgpt-accesso-ospite.mjs`). Fuori da quella modalità:
   409 `CHATGPT_CUSTODE_NON_APP`. Corpo: `{ accessToken, scadeAlle, accountId? }`, niente altro (l'email non esce dalla chat). */
export const ROTTA_TOKEN_DALL_APP = '/api/v1/providers/chatgpt/access';
export const ROTTA_TOKEN_DIMENTICA = '/api/v1/providers/chatgpt/access/remove';
export const ROTTE_TOKEN_CHATGPT = Object.freeze([
  Object.freeze({ schema: ROTTA_TOKEN_DALL_APP, metodi: Object.freeze(['POST']) }),
  Object.freeze({ schema: ROTTA_TOKEN_DIMENTICA, metodi: Object.freeze(['POST']) }),
]);
const CAMPI_DEL_TOKEN = new Set(['accessToken', 'scadeAlle', 'accountId']);

export const VITA_ELENCO_MS = 10 * 60 * 1000;

function errore(messaggio, code, extra = {}) {
  return Object.assign(new Error(messaggio), { code, ...extra });
}

const stato3 = (valore) => (valore === true ? 'osservato-si' : valore === false ? 'osservato-no' : 'ignoto');

/** Un modello dell'elenco di OpenAI nella forma che il selettore di TALOS conosce. L'id porta il prefisso del fornitore. */
export function modelloDelPiano(m) {
  const livelli = Array.isArray(m.supported_reasoning_levels) ? m.supported_reasoning_levels.map((l) => (typeof l === 'string' ? l : l?.effort)).filter((l) => typeof l === 'string') : null;
  const modalita = Array.isArray(m.input_modalities) ? m.input_modalities.filter((x) => typeof x === 'string') : null;
  const contesto = Number.isFinite(m.context_window) ? m.context_window : Number.isFinite(m.max_context_window) ? m.max_context_window : null;
  return {
    id: `chatgpt:${m.slug}`, nome: typeof m.display_name === 'string' && m.display_name.trim() ? m.display_name : m.slug, provider: 'chatgpt',
    descrizione: typeof m.description === 'string' ? m.description : null,
    contextLength: contesto, contestoVerificato: contesto !== null,
    capacita: { visione: modalita ? stato3(modalita.includes('image')) : 'ignoto', toolUse: 'ignoto', reasoning: livelli ? stato3(livelli.length > 0) : 'ignoto' },
    ...(modalita ? { inputModalities: modalita } : {}),
    ...(livelli?.length ? { livelliRagionamento: livelli, livelloRagionamentoPredefinito: typeof m.default_reasoning_level === 'string' ? m.default_reasoning_level : null } : {}),
  };
}

/** L'elenco dei modelli del piano, con una memoria breve legata all'account. `accesso` è `creaAccessoChatgpt(...)`. */
export function creaCatalogoChatgpt({ accesso, fetchDiRete = globalThis.fetch, clock = () => Date.now(), vitaMs = VITA_ELENCO_MS } = {}) {
  let memoria = null; // { di, quando, modelli }
  return {
    dimentica() { memoria = null; },
    async elenca({ rileggi = false } = {}) {
      const chi = accesso.stato();
      if (!chi.collegato) throw errore('No ChatGPT account is connected.', 'CHATGPT_NON_COLLEGATO');
      const di = chi.email ?? 'account';
      if (!rileggi && memoria && memoria.di === di && clock() - memoria.quando < vitaMs) return memoria.modelli;
      const token = await accesso.tokenDiAccesso();
      let risposta;
      try { risposta = await fetchDiRete(`${RISORSA}/models`, { headers: { authorization: `Bearer ${token}`, accept: 'application/json' } }); }
      catch { throw errore('OpenAI could not be reached.', 'CHATGPT_RETE'); }
      if (!risposta.ok) throw errore('The model list of the ChatGPT plan could not be read.', risposta.status === 401 ? 'CHATGPT_ACCESSO_NON_VALIDO' : 'CHATGPT_ELENCO_NON_LETTO', { stato: risposta.status });
      const dati = await risposta.json().catch(() => null);
      const righe = Array.isArray(dati?.models) ? dati.models : Array.isArray(dati?.data) ? dati.data : null;
      if (!righe) throw errore('OpenAI answered the model list in an unknown shape.', 'CHATGPT_ELENCO_NON_LETTO', { stato: risposta.status });
      const modelli = righe.filter((m) => m && typeof m.slug === 'string' && m.slug !== '' && m.visibility === 'list').map(modelloDelPiano);
      memoria = { di, quando: clock(), modelli };
      return modelli;
    },
  };
}

/** Lo stato HTTP di ogni codice che queste rotte possono dire. */
export const STATO_PER_CODICE_CHATGPT = Object.freeze({
  CHATGPT_NON_DISPONIBILE: 503, CHATGPT_NON_COLLEGATO: 409, CHATGPT_PIANO_NON_ABILITATO: 409, CHATGPT_ACCESSO_SCADUTO: 401, CHATGPT_ACCESSO_NON_VALIDO: 401,
  CHATGPT_RETE: 502, CHATGPT_RINNOVO_FALLITO: 502, CHATGPT_ELENCO_NON_LETTO: 502, CHATGPT_RICHIESTA_NON_VALIDA: 400, CHATGPT_CUSTODIA_FALLITA: 500,
  CHATGPT_TOKEN_DA_RINNOVARE: 409, CHATGPT_GESTITO_DALL_APP: 409, CHATGPT_CUSTODE_NON_APP: 409,
});

/**
 * Le rotte. Torna `null` se il percorso non è suo, altrimenti `{ stato, dati }` o `{ stato, errore: { code, message } }`.
 * `accesso` null = questo server non ha un portachiavi: le rotte lo dicono (503) invece di fingere.
 * `corpo` è il JSON già letto (o `null`). L'esito dell'ultimo tentativo si tiene qui in memoria finché l'interfaccia non lo legge.
 */
/* `uso` (11/10/2026): il conteggio NOSTRO di ciò che TALOS ha mandato col piano (`chatgpt-uso.mjs`). Lo stato lo porta solo da
   collegati; un accesso con un ALTRO account lo fa ripartire (era dell'account di prima), lo stesso account lo tiene. */
export function creaRotteChatgpt({ accesso, catalogo = null, uso = null } = {}) {
  let ultimoEsito = null;
  let tentativoCorrente = 0; // parla solo l'ULTIMO tentativo: uno sostituito o annullato finisce comunque, ma il suo esito non è più di nessuno
  const rifiuta = (code, message) => ({ stato: STATO_PER_CODICE_CHATGPT[code] ?? 500, errore: { code, message } });
  return async function rottaChatgpt({ method, percorso, corpo = null }) {
    const rottaToken = ROTTE_TOKEN_CHATGPT.find((r) => r.schema === percorso);
    if (rottaToken) {
      if (!rottaToken.metodi.includes(method)) return { stato: 405, errore: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed.' }, allow: rottaToken.metodi.join(', ') };
      if (!accesso?.gestitoDallApp) return rifiuta('CHATGPT_CUSTODE_NON_APP', 'This server keeps its own ChatGPT sign-in: it does not take a token from an app.');
      if (percorso === ROTTA_TOKEN_DIMENTICA) { accesso.dimentica(); catalogo?.dimentica(); return { stato: 200, dati: { dimenticato: true } }; }
      if (!corpo || typeof corpo !== 'object' || Array.isArray(corpo) || Object.keys(corpo).some((k) => !CAMPI_DEL_TOKEN.has(k))) {
        return rifiuta('CHATGPT_RICHIESTA_NON_VALIDA', 'The token request accepts only «accessToken», «scadeAlle» and «accountId».');
      }
      const accountDiPrima = accesso.stato().accountId ?? null;
      const rifiuto = accesso.ricevi(corpo);
      if (rifiuto) return rifiuta(rifiuto.code, rifiuto.message);
      if ((accesso.stato().accountId ?? null) !== accountDiPrima) catalogo?.dimentica(); // l'elenco dei modelli è dell'account
      return { stato: 200, dati: { scadeAlle: accesso.stato().scadeAlle } };
    }
    if (!percorso.startsWith(PREFISSO_ROTTE)) return null;
    const rotta = ROTTE_CHATGPT.find((r) => r.schema === percorso);
    if (!rotta) return { stato: 404, errore: { code: 'CHATGPT_ROTTA_SCONOSCIUTA', message: 'Unknown ChatGPT sign-in route.' } };
    if (!rotta.metodi.includes(method)) return { stato: 405, errore: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed.' }, allow: rotta.metodi.join(', ') };
    if (!accesso) return rifiuta('CHATGPT_NON_DISPONIBILE', 'A ChatGPT account cannot be connected on this server: the system keyring is not available.');
    const nome = percorso.slice(PREFISSO_ROTTE.length);
    try {
      if (nome === 'stato') {
        const stato = accesso.stato();
        return { stato: 200, dati: { ...stato, ultimoEsito, ...(uso && stato.collegato ? { usoTalos: uso.riepilogo(), limiti: uso.limiti?.() ?? null } : {}) } };
      }
      if (nome === 'inizia') {
        if (corpo !== null && (typeof corpo !== 'object' || Array.isArray(corpo) || Object.keys(corpo).some((k) => k !== 'consenso') || ('consenso' in corpo && typeof corpo.consenso !== 'boolean'))) {
          return rifiuta('CHATGPT_RICHIESTA_NON_VALIDA', 'The sign-in request accepts only «consenso» (true or false).');
        }
        ultimoEsito = null;
        const mio = ++tentativoCorrente;
        const emailDiPrima = accesso.stato().email ?? null;
        const { indirizzo, scadeTraMs, esito } = await accesso.inizia({ consenso: corpo?.consenso === true });
        esito.then((e) => {
          if (mio !== tentativoCorrente) return;
          /* 13/10/2026 (B1): un tentativo chiuso prima che il browser tornasse (scaduto, annullato) ora finisce con un esito
             dichiarato invece di restare appeso. L'interfaccia continua a vedere ciò che vedeva: nessun esito pubblicato. */
          if (e?.senzaRitorno === true) return;
          ultimoEsito = e;
          if (!e?.ok) return;
          catalogo?.dimentica();
          if (emailDiPrima && e.email && e.email !== emailDiPrima) void Promise.resolve(uso?.azzera?.()).catch(() => {});
        }, () => { if (mio === tentativoCorrente) ultimoEsito = { ok: false, codice: 'CHATGPT_ERRORE', codiceOpenAi: null }; });
        return { stato: 200, dati: { indirizzo, scadeTraMs } };
      }
      if (nome === 'annulla') { tentativoCorrente += 1; accesso.annulla(); return { stato: 200, dati: { annullato: true } }; }
      tentativoCorrente += 1;
      const uscita = await accesso.esci();
      ultimoEsito = null;
      catalogo?.dimentica();
      return { stato: 200, dati: uscita };
    } catch (guasto) {
      const code = typeof guasto?.code === 'string' && guasto.code.startsWith('CHATGPT_') ? guasto.code : 'CHATGPT_ERRORE';
      return rifiuta(code, code === 'CHATGPT_ERRORE' ? 'The ChatGPT sign-in could not be completed.' : guasto.message);
    }
  };
}

/*
 * 11/10/2026 — I LIVELLI DI RAGIONAMENTO DEL PIANO, per la pillola (owner: «tutto quello che è già disponibile deve funzionare col
 *   piano»; decisione dell'11/10: le opzioni non ammesse si vedono SPENTE, non si promettono).
 * ⛔ `LIVELLI_INOLTRATI_DAL_PIANO` è una MISURA, non una scelta: attraverso il motore vero (SDK di OpenAI, wire Responses) solo questi
 *   arrivano al servizio com'è chiesto; «off», «minimal» e «ultra» non partono affatto e il modello usa il suo predefinito. La prova
 *   `INSTRADA-09` rifà la misura e confronta la lista: se l'SDK cambia, diventa rossa lei.
 * Ogni modello dichiara i suoi livelli nell'elenco dell'account (`supported_reasoning_levels`): si offrono quelli che il modello
 *   dichiara E che l'adattatore inoltra. Il «filo» dice, per ogni livello chiesto, che cosa parte davvero (`null` = niente, decide il
 *   modello), a prescindere da che cosa il modello dichiara — la stessa forma di `filoRagionamentoDiretti()` (`model-destination.mjs`), così la pillola non ha una regola in più.
 */
export const LIVELLI_INOLTRATI_DAL_PIANO = Object.freeze(['low', 'medium', 'high', 'xhigh', 'max']);
const LIVELLI_CHIESTI = Object.freeze(['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']);
export function ragionamentoDelPiano(modelli) {
  const livelli = {}; const filo = {};
  for (const m of Array.isArray(modelli) ? modelli : []) {
    if (typeof m?.id !== 'string' || !m.id.startsWith('chatgpt:') || !Array.isArray(m.livelliRagionamento)) continue;
    const suoi = LIVELLI_INOLTRATI_DAL_PIANO.filter((l) => m.livelliRagionamento.includes(l));
    if (!suoi.length) continue;
    const slug = m.id.slice('chatgpt:'.length);
    livelli[slug] = suoi;
    // ciò che PARTE: l'adattatore inoltra low…max com'è chiesto, il resto non lo manda; che cosa si OFFRE lo decide `livelli`
    filo[slug] = Object.fromEntries(LIVELLI_CHIESTI.map((chiesto) => [chiesto, LIVELLI_INOLTRATI_DAL_PIANO.includes(chiesto) ? chiesto : null]));
  }
  return { livelli, filo };
}
