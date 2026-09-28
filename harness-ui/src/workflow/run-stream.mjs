/*
 * ⭐ F3-51d (25/09/2026) — il FLUSSO DAL VIVO di un run Workflow (decisione owner D33: SSE dedicato al run, cursore sulla
 *   sequenza del registro, riletta del grafo con l'ETag a un buco; RP §8.14: «SSE usa cursor/gap detection/resync e bounded
 *   per-client backpressure»).
 *
 * Fonti, lette il 25/09/2026:
 *   · WHATWG HTML, «Server-sent events»: il campo `id` diventa l'ultimo id visto, e la riconnessione lo rimanda in
 *     `Last-Event-ID`; «a client can be told to stop reconnecting using the HTTP 204 No Content response code»; un commento
 *     «every 15 seconds or so» contro i proxy che chiudono le connessioni ferme.
 *   · Node `http`: `res.write()` restituisce false quando il buffer del socket è pieno, e `drain` dice quando riprendere;
 *     scrivere senza aspettarlo accumula tutto in memoria (server-sent-events.com, «Handling slow consumers», 2026).
 *   · Hermes, `gateway/platforms/api_server_runs.py:1016-1053` (clone `65ad529` del 23/09/2026): stesso impianto (tipo
 *     `text/event-stream`, `X-Accel-Buffering: no`, commento di vita, chiusura a run finito), ma una coda in memoria senza
 *     limite (`:662`, `asyncio.Queue()`) e nessuna ripresa: chi si stacca perde gli eventi.
 *
 * ⇒ Qui il client TIRA dal registro durevole: nessuna coda per client. Un fatto nuovo sveglia il flusso solo col suo numero
 *   (`watchRun`); il flusso rilegge lo stato, scrive UN fotogramma che copre tutto ciò che è successo dopo il cursore
 *   (`projectWorkflowRunUpdate`: una raffica di fatti diventa una scrittura sola) e, se il socket è pieno, aspetta `drain`
 *   prima del prossimo. La memoria per client è un fotogramma, qualunque sia la velocità del run o la lentezza del client.
 */
import { readRunState, watchRun } from './store.mjs';
import { projectWorkflowRunUpdate } from './read-model.mjs';

const RUN_TERMINALI = new Set(['succeeded', 'failed', 'cancelled']);
export const RUN_STREAM_HEARTBEAT_MS = 15_000;

/**
 * Il cursore del client: `Last-Event-ID` (la riconnessione del browser) vince su `?after=` (la prima apertura, dal `lastSeq`
 * del grafo appena letto). Un valore che non è un intero ≥ 0 è un errore della richiesta, non un «ricomincia da capo».
 */
export function runStreamCursor({ lastEventId, after } = {}) {
  const leggi = (value) => {
    if (value === undefined || value === null || value === '') return null;
    if (!/^(0|[1-9][0-9]{0,15})$/u.test(String(value))) {
      throw Object.assign(new Error('Workflow stream cursor must be a nonnegative integer'), { code: 'QUERY_INVALID' });
    }
    return Number(value);
  };
  return leggi(lastEventId) ?? leggi(after) ?? 0;
}

export async function serveWorkflowRunStream({
  res, store, runId, afterSeq, headers = {}, heartbeatMs = RUN_STREAM_HEARTBEAT_MS,
  setIntervalFn = setInterval, clearIntervalFn = clearInterval, onError = null,
} = {}) {
  const iniziale = await readRunState(store, { runId });
  // run finito e client in pari: 204, che ferma la riconnessione di EventSource (WHATWG) invece di un giro a vuoto per sempre
  if (RUN_TERMINALI.has(iniziale.state.run.status) && afterSeq === iniziale.state.lastSeq) {
    res.writeHead(204, headers); res.end(); return { stato: 'finito' };
  }
  res.writeHead(200, {
    ...headers,
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-store',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.socket?.setNoDelay?.(true);
  res.write(':ok\n\n');

  let cursore = afterSeq;
  let chiuso = false;
  let sporco = true;
  let inCorso = false;
  let aspettaDrain = false;
  let smetti = () => {};
  let battito = null;
  const chiudi = () => {
    if (chiuso) return;
    chiuso = true;
    smetti();
    if (battito !== null) clearIntervalFn(battito);
    res.removeListener?.('close', chiudi);
    res.removeListener?.('drain', dopoDrain);
    if (!res.writableEnded && !res.destroyed) res.end();
  };
  const dopoDrain = () => { aspettaDrain = false; void pompa(); };
  const pompa = async () => {
    if (chiuso || inCorso || aspettaDrain || !sporco) return;
    inCorso = true; sporco = false;
    try {
      const input = await readRunState(store, { runId });
      if (chiuso) return;
      const { lastSeq } = input.state;
      if (lastSeq !== cursore) {
        const update = projectWorkflowRunUpdate(input, { afterSeq: cursore });
        cursore = lastSeq;
        if (!res.write(`id: ${lastSeq}\nevent: run-update\ndata: ${JSON.stringify(update)}\n\n`)) aspettaDrain = true;
      }
      // run finito e tutto consegnato: si chiude; il browser si riconnette col cursore in pari e riceve 204
      if (RUN_TERMINALI.has(input.state.run.status) && cursore === lastSeq) chiudi();
    } catch (error) {
      if (!chiuso) {
        // gli header sono già partiti: si dice il codice e si chiude, mai un secondo corpo JSON
        res.write(`event: run-error\ndata: ${JSON.stringify({ code: error?.code ?? 'INTERNAL_ERROR' })}\n\n`);
        chiudi();
      }
      onError?.(error);
    } finally {
      inCorso = false;
    }
    if (sporco && !chiuso) void pompa();
  };
  smetti = watchRun(store, { runId, onAppend: () => { sporco = true; void pompa(); } });
  res.once?.('close', chiudi);
  res.on?.('drain', dopoDrain);
  battito = setIntervalFn(() => {
    if (chiuso || res.writableEnded || res.destroyed) { chiudi(); return; }
    if (!aspettaDrain) res.write(':battito\n\n');
  }, heartbeatMs);
  battito?.unref?.();
  await pompa();
  return { stato: chiuso ? 'chiuso' : 'aperto', chiudi };
}
