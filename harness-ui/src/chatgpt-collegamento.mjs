/**
 * «Continue with ChatGPT» — il piano su collegamento aperto (forma chiusa da Desktop, CLI e Mobile il 31/10/2026:
 * `handoff-talos-2026-09-27/in-corso/PROPOSTA-COLLEGAMENTO-APERTO-PIANO-2026-10-31.md`).
 *
 * Guida ufficiale «WebSocket mode» (developers.openai.com/api/docs/guides/websocket-mode, letta il 31/10/2026): si manda solo l'input nuovo con
 * `previous_response_id`, compatibile con `store: false`, stato in memoria locale al collegamento, 60 minuti al massimo. «SIWC preview
 * limitations»: su HTTP niente `previous_response_id`; «WebSocket continuation can reference only responses from the same authenticated
 * connection». Codex fa lo stesso con questo modello (`core/src/client.rs:1500`, `get_incremental_items`).
 * Misurato sul piano (corse ws3 e ws4): il costo fisso a chiamata scende da ~4,6 a ~2,8 s; la velocità di scrittura non cambia.
 *
 * Il resto del programma non vede niente di nuovo: una `Response` col flusso SSE di sempre. `null` vuol dire «usa HTTP con l'input intero», ed è
 * la risposta a ogni dubbio: un collegamento rifiutato, un errore prima del primo evento (così il 429 vero, con le sue intestazioni, lo fa
 * vedere HTTP), un collegamento morto che non risponde (Mobile: dopo un cambio di rete `send` riesce e non arriva più niente).
 */
import { createHash } from 'node:crypto';
import { appendFileSync } from 'node:fs';

export const ATTESA_PRIMO_EVENTO_MS = 15_000;
export const INATTIVITA_MS = 45_000; // Desktop: un collegamento fermo non resta aperto
export const DURATA_MASSIMA_MS = 55 * 60_000; // il servizio chiude a 60 minuti
export const PAUSA_DOPO_CADUTA_MS = 5 * 60_000; // Mobile: una caduta di rete non spegne il collegamento per tutta la sessione

const CAMPI_FISSI = ['model', 'instructions', 'tools', 'tool_choice', 'parallel_tool_calls', 'reasoning', 'text', 'include', 'prompt_cache_key', 'service_tier'];
const TIPI_DEL_MODELLO = new Set(['reasoning', 'function_call', 'custom_tool_call', 'item_reference']);
const TERMINALI = new Set(['response.completed', 'response.failed', 'response.incomplete']);
const delModello = (voce) => TIPI_DEL_MODELLO.has(voce?.type) || voce?.role === 'assistant';
const aperto = (ws) => ws?.readyState === 1;

function improntaDi(voci, quante) {
  const h = createHash('sha256');
  for (let i = 0; i < quante; i += 1) h.update(JSON.stringify(voci[i])).update('\0');
  return h.digest('base64url');
}
const improntaFissa = (corpo) => improntaDi(CAMPI_FISSI.map((campo) => corpo[campo] ?? null), CAMPI_FISSI.length);
/*
 * Il testo scritto dal modello. La chiave del collegamento è quella della cache, senza la conversazione: due conversazioni con lo stesso primo
 * messaggio (il ramo di «Riprova», due figlie con la stessa consegna) stanno sullo stesso collegamento, e una non deve continuare dalla risposta
 * dell'altra. La storia locale può tenere il testo come stringa o a pezzi: gli spazi non contano.
 */
const testoDi = (voce) => (typeof voce?.content === 'string' ? voce.content : Array.isArray(voce?.content) ? voce.content.map((pezzo) => pezzo?.text ?? '').join('') : '');
const improntaDelTesto = (voci) => createHash('sha256').update(voci.filter((voce) => voce?.role === 'assistant').map(testoDi).join('').replace(/\s+/gu, '')).digest('base64url');

/** Ciò che resta di una risposta per il passo dopo. Mobile: impronte, non la copia della storia. */
export function statoDopoRisposta(corpo, idRisposta, elementi) {
  const voci = corpo.input;
  const ultima = voci[voci.length - 1];
  const notaInCoda = ultima?.role === 'developer' || ultima?.role === 'system';
  return {
    idRisposta,
    quante: voci.length,
    storia: improntaDi(voci, voci.length),
    storiaSenzaCoda: notaInCoda ? improntaDi(voci, voci.length - 1) : null,
    coda: notaInCoda ? JSON.stringify(ultima) : null,
    fissi: improntaFissa(corpo),
    testo: improntaDelTesto(elementi),
    chiamate: new Set(elementi.map((voce) => voce?.call_id).filter(Boolean)),
  };
}

/** `{ previous_response_id, input }` con le sole voci nuove, o `null` se serve l'input intero. */
export function calcolaContinuazione(stato, corpo) {
  if (!stato?.idRisposta || !Array.isArray(corpo?.input) || stato.fissi !== improntaFissa(corpo)) return null;
  /* la nota che TALOS rimette in coda a ogni richiesta (R-29) sta già nel contesto del collegamento: non si rimanda */
  const ultima = corpo.input.length > stato.quante ? JSON.stringify(corpo.input[corpo.input.length - 1]) : null;
  const notaInCoda = stato.coda !== null && ultima === stato.coda;
  const base = notaInCoda ? stato.quante - 1 : stato.quante;
  const attuale = notaInCoda ? corpo.input.slice(0, -1) : corpo.input;
  if (attuale.length < base || improntaDi(attuale, base) !== (notaInCoda ? stato.storiaSenzaCoda : stato.storia)) return null;
  let i = base;
  for (; i < attuale.length && delModello(attuale[i]); i += 1) {
    if (attuale[i].call_id && !stato.chiamate.has(attuale[i].call_id)) return null;
  }
  if (improntaDelTesto(attuale.slice(base, i)) !== stato.testo) return null;
  const nuove = attuale.slice(i);
  if (nuove.length === 0 || nuove.some(delModello)) return null;
  return { previous_response_id: stato.idRisposta, input: nuove };
}

const sse = (testo) => new TextEncoder().encode(`data: ${testo}\n\n`);

/**
 * @param {{ webSocketFn: Function, ora?: () => number, pianifica?: Function, annulla?: Function, annota?: Function|null }} dipendenze
 *   CLI: la porta si inietta; chi finge `fetch` non deve aprire una connessione vera.
 */
export function creaCollegamentiDelPiano({ webSocketFn, ora = () => Date.now(), pianifica = setTimeout, annulla = clearTimeout, annota = null } = {}) {
  const voci = new Map();
  let rifiutato = false;
  let pausaFinoA = 0;
  const scrivi = (riga) => { if (annota) { try { annota(riga); } catch { /* il diario è un di più */ } } };

  function chiudiVoce(chiave) {
    const voce = voci.get(chiave);
    if (!voce) return;
    voci.delete(chiave);
    if (voce.timer) annulla(voce.timer);
    voce.interrompi?.();
    try { voce.ws?.close(); } catch { /* già chiuso */ }
  }

  function apri(indirizzo, headers, segnale, voce) {
    return new Promise((ok, no) => {
      /* Stop mentre si apre: una rete muta non fa aspettare la persona, e non è una caduta di rete */
      const fermata = () => Object.assign(new Error('stopped'), { fermata: true });
      if (segnale?.aborted) { no(fermata()); return; }
      let ws;
      try { ws = new webSocketFn(indirizzo, { headers }); } catch (errore) { no(Object.assign(new Error('unsupported'), { nonSupportato: true, causa: errore })); return; }
      const finito = () => { annulla(scadenza); segnale?.removeEventListener('abort', interrompi); voce.interrompi = null; };
      function interrompi() { finito(); try { ws.close(); } catch { /* già chiuso */ } no(fermata()); }
      const scadenza = pianifica(() => { finito(); try { ws.close(); } catch { /* già chiuso */ } no(new Error('timeout')); }, ATTESA_PRIMO_EVENTO_MS);
      segnale?.addEventListener('abort', interrompi, { once: true });
      voce.interrompi = interrompi;
      ws.addEventListener('open', () => { finito(); ok(ws); }, { once: true });
      ws.addEventListener('error', () => { finito(); no(new Error('refused')); }, { once: true });
    });
  }

  /* Una richiesta sul collegamento: si risolve al PRIMO evento, così fino a lì si può ancora tornare su HTTP. */
  function manda(chiave, voce, corpo, invio, opzioni) {
    const { ws } = voce;
    const elementi = [];
    return new Promise((risolvi) => {
      let controllore = null;
      let finito = false;
      const scadenza = pianifica(() => { togli(); scrivi({ evento: 'muto' }); chiudiVoce(chiave); risolvi({ esito: 'http' }); }, ATTESA_PRIMO_EVENTO_MS);
      function togli() { annulla(scadenza); ws.removeEventListener('message', suMessaggio); ws.removeEventListener('close', suChiusura); ws.removeEventListener('error', suChiusura); opzioni.signal?.removeEventListener('abort', suStop); }
      function chiudiFlusso() { finito = true; try { controllore?.close(); } catch { /* già chiuso */ } }
      function suMessaggio(evento) {
        let dato;
        try { dato = JSON.parse(String(evento.data)); } catch { return; }
        annulla(scadenza);
        if (dato.type === 'error' && !controllore) {
          togli();
          const codice = dato.error?.code ?? dato.code ?? null;
          scrivi({ evento: 'errore', codice, stato: dato.status ?? null });
          voce.continua = null;
          if (codice === 'previous_response_not_found' && aperto(ws)) { risolvi({ esito: 'intero' }); return; }
          chiudiVoce(chiave);
          risolvi({ esito: 'http' });
          return;
        }
        if (!controllore) {
          risolvi({ esito: 'flusso', risposta: new Response(new ReadableStream({
            start(c) { controllore = c; },
            cancel() { if (!finito) { togli(); chiudiVoce(chiave); } },
          }), { status: 200, headers: { 'content-type': 'text/event-stream' } }) });
        }
        if (dato.type === 'response.output_item.done' && dato.item) elementi.push(dato.item);
        controllore.enqueue(sse(String(evento.data)));
        if (dato.type === 'error') { togli(); chiudiVoce(chiave); chiudiFlusso(); return; }
        if (TERMINALI.has(dato.type)) {
          togli();
          voce.continua = dato.type === 'response.completed' && dato.response?.id ? statoDopoRisposta(corpo, dato.response.id, elementi) : null;
          voce.occupato = false;
          voce.timer = pianifica(() => chiudiVoce(chiave), INATTIVITA_MS);
          voce.timer?.unref?.();
          scrivi({ evento: 'risposta', incrementale: Boolean(invio.previous_response_id), voci: invio.input?.length ?? 0 });
          chiudiFlusso();
        }
      }
      function suChiusura() {
        togli();
        chiudiVoce(chiave);
        scrivi({ evento: 'caduto', aMeta: Boolean(controllore) });
        /* dopo il primo evento non si può ripetere senza dirlo: è un flusso interrotto, e il nuovo tentativo di chi chiama parte con l'input intero */
        if (controllore) { try { controllore.error(Object.assign(new Error('The connection closed before the response finished.'), { code: 'PROVIDER_STREAM_INCOMPLETE' })); } catch { /* già chiuso */ } finito = true; } else risolvi({ esito: 'http' });
      }
      function suStop() {
        if (finito) return;
        togli();
        chiudiVoce(chiave);
        if (controllore) { try { controllore.error(new DOMException('Aborted', 'AbortError')); } catch { /* già chiuso */ } finito = true; } else risolvi({ esito: 'http' });
      }
      /* Stop già premuto: non si manda niente, e HTTP rifiuta col suo errore di interruzione */
      if (opzioni.signal?.aborted) { togli(); chiudiVoce(chiave); risolvi({ esito: 'http' }); return; }
      opzioni.signal?.addEventListener('abort', suStop, { once: true });
      ws.addEventListener('message', suMessaggio);
      ws.addEventListener('close', suChiusura);
      ws.addEventListener('error', suChiusura);
      /* il collegamento può cadere fra il controllo e l'invio: anche questo è «usa HTTP», mai un'eccezione */
      try { ws.send(JSON.stringify({ type: 'response.create', ...invio })); } catch { togli(); chiudiVoce(chiave); scrivi({ evento: 'caduto', aMeta: false }); risolvi({ esito: 'http' }); }
    });
  }

  return {
    /** Torna una `Response`, o `null` per dire «usa HTTP». Mai un'eccezione. */
    async invia(indirizzo, opzioni, corpo, intestazioni) {
      const adesso = ora();
      if (rifiutato || adesso < pausaFinoA) return null;
      const chiave = corpo.prompt_cache_key;
      if (typeof chiave !== 'string' || chiave === '') return null; // senza chiave tutte le richieste finirebbero sullo stesso collegamento
      const autorizzazione = intestazioni.get('authorization');
      let voce = voci.get(chiave);
      if (voce?.occupato) return null; // una richiesta alla volta per collegamento
      if (voce && (!aperto(voce.ws) || voce.autorizzazione !== autorizzazione || adesso - voce.apertoAlle > DURATA_MASSIMA_MS)) { chiudiVoce(chiave); voce = null; }
      if (!voce) {
        const headers = Object.fromEntries([...intestazioni.entries()].filter(([nome]) => !['content-type', 'content-length', 'accept'].includes(nome)));
        /* la voce esiste già mentre si apre: una seconda richiesta con la stessa chiave va su HTTP, e nessun collegamento resta orfano */
        const nuova = { ws: null, apertoAlle: adesso, autorizzazione, occupato: true, continua: null, timer: null, interrompi: null };
        voci.set(chiave, nuova);
        try {
          nuova.ws = await apri(String(indirizzo).replace(/^http/u, 'ws'), headers, opzioni.signal, nuova);
          nuova.apertoAlle = ora();
          /* chiuso mentre l'apertura finiva: nessuno terrebbe più questo collegamento */
          if (voci.get(chiave) !== nuova) { try { nuova.ws.close(); } catch { /* già chiuso */ } return null; }
          voce = nuova;
          scrivi({ evento: 'aperto' });
        } catch (errore) {
          if (voci.get(chiave) === nuova) voci.delete(chiave);
          if (errore.fermata) return null;
          /* Mobile: il ricordo per la sessione vale solo per il rifiuto; una rete che manca riprova dopo una pausa */
          if (errore.nonSupportato) rifiutato = true; else pausaFinoA = ora() + PAUSA_DOPO_CADUTA_MS;
          scrivi({ evento: 'non-aperto', motivo: errore.message });
          return null;
        }
      }
      if (voce.timer) { annulla(voce.timer); voce.timer = null; }
      voce.occupato = true;
      const { stream: _stream, ...resto } = corpo;
      const continuazione = calcolaContinuazione(voce.continua, corpo);
      const primo = await manda(chiave, voce, corpo, continuazione ? { ...resto, ...continuazione } : resto, opzioni);
      if (primo.esito === 'flusso') return primo.risposta;
      if (primo.esito === 'intero') {
        const secondo = await manda(chiave, voce, corpo, resto, opzioni);
        if (secondo.esito === 'flusso') return secondo.risposta;
      }
      chiudiVoce(chiave);
      return null;
    },
    /** Desktop: a fine figlia. */
    chiudi: chiudiVoce,
    /** CLI e server: un collegamento aperto tiene vivo il processo. */
    chiudiTutti() { for (const chiave of [...voci.keys()]) chiudiVoce(chiave); },
    get aperti() { return voci.size; },
  };
}

let delProcesso = null;
/** I collegamenti sono del processo, non della `fetch`: l'adattatore ricrea la `fetch` a ogni richiesta. Il telefono resta su HTTP con la variabile. */
export function collegamentiDelProcesso(ambiente = process.env) {
  if (ambiente.TALOS_PIANO_SENZA_COLLEGAMENTO === '1' || typeof globalThis.WebSocket !== 'function') return null;
  const diario = ambiente.TALOS_MISURA_WS_DIARIO;
  delProcesso ??= creaCollegamentiDelPiano({ webSocketFn: globalThis.WebSocket, annota: diario ? (riga) => appendFileSync(diario, `${JSON.stringify(riga)}\n`) : null });
  return delProcesso;
}
export function chiudiCollegamentiDelPiano() { delProcesso?.chiudiTutti(); }
