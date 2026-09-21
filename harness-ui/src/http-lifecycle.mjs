/** Shared lifecycle primitives for HTTP requests, SSE streams and shutdown. */

/*
 * ⛔⛔⛔ P0 · punto 7 (16/09/2026) — QUI C'ERA UNA MINA: `createRequestLifecycle`, RIMOSSA.
 *
 * Era una funzione che abortiva una richiesta dopo `timeoutMs = 30_000`, e **non la usava
 * nessuno**: misurato con `grep -rn createRequestLifecycle harness-ui --include=*.mjs` — due sole
 * occorrenze, la sua definizione e il suo test. Zero chiamanti in tre mesi.
 *
 * ⛔ Perché toglierla invece di lasciarla lì: era pronta per essere cablata dal primo che avesse
 *   cercato «lifecycle» per la rotta `/events`. E cablarla avrebbe ucciso OGNI sessione SSE dopo
 *   trenta secondi — cioè avrebbe rimesso, in un colpo solo, il tetto di durata che questo punto
 *   sta togliendo, dalla parte del server invece che da quella del fornitore. Un attrezzo che fa
 *   la cosa sbagliata e aspetta paziente è peggio di un attrezzo mancante: il secondo lo scrivi
 *   guardando il problema, il primo lo adotti perché c'era già.
 * ⭐ Ciò che serviva davvero — chiudere quando il client se ne va — `createSseSession` lo fa già,
 *   qui sotto, senza nessun orologio: ascolta `close` sulla risposta e l'abort del segnale.
 * ⛔ Il cancello che impedisce di rimetterla sta in `tests/timeout-generazione-p0.test.mjs`
 *   (P0-D-13), non nella memoria di qualcuno.
 */

/**
 * ⛔⛔ P0 · punto 7 (16/09/2026) — I TEMPI DEL SERVER, DICHIARATI INVECE CHE SUBITI.
 *
 * `server.mjs` faceva `createServer(app)` e `listen()` senza toccare nessuno dei quattro tempi:
 * quelli attivi erano quelli che capitavano. Misurati su **Node v24.18.0** (script su file, non
 * `node -e`), il 16/09/2026:
 *     server.timeout = 0 · headersTimeout = 60000 · keepAliveTimeout = 5000 · requestTimeout = 300000
 * Sono i default di OGGI, e cambiano fra le versioni di Node — `server.timeout` valeva 120 s fino a
 * Node 13. Una rotta SSE che deve reggere un ragionamento lungo non può dipendere da quale Node è
 * installato sul computer di chi apre l'app.
 *
 * I quattro valori, e perché:
 *  · `timeout: 0` — nessun guardiano di inattività sul SOCKET. È il valore che rende possibile una
 *    risposta SSE lunga: qualunque numero qui ucciderebbe la chat mentre il modello pensa. Il
 *    canale non resta comunque muto, perché il battito scrive ogni 15 s.
 *  · `keepAliveTimeout: 72_000` — quanto si tiene aperta una connessione INUTILIZZATA fra due
 *    richieste. Il default di 5 s fa ricostruire il socket di continuo a un'interfaccia che
 *    chiacchiera; 72 s sono poco meno di cinque battiti, cioè comodamente oltre il ritmo con cui
 *    l'app parla col server.
 *  · `headersTimeout: 75_000` — **deve restare maggiore di `keepAliveTimeout`**: se fosse minore,
 *    Node può chiudere un socket riusato mentre la richiesta successiva è per strada, e il browser
 *    vede un `ECONNRESET` senza colpevole. Tre secondi di margine sopra il keep-alive.
 *  · `requestTimeout: 300_000` — tempo per ricevere la RICHIESTA completa (intestazioni + corpo),
 *    non la risposta: non tocca lo streaming in uscita, e a zero aprirebbe uno slowloris. Resta il
 *    valore di Node, ma scritto, così nessuno deve andare a cercarlo.
 *
 * ⛔ Stanno QUI e non dentro `server.mjs` perché la prova che il battito regge oltre il vecchio
 *   muro (`P0-D-12`, e la misura lunga in `tests/aiuto/`) deve usare gli STESSI numeri del
 *   prodotto: due copie divergerebbero, e la prova continuerebbe a essere verde su numeri che
 *   nessuno usa più.
 */
export const TEMPI_SERVER_HTTP = Object.freeze({
  timeout: 0,
  keepAliveTimeout: 72_000,
  headersTimeout: 75_000,
  requestTimeout: 300_000,
});

/**
 * Applica i tempi dichiarati sopra a un server HTTP, e li restituisce come letti DAL server —
 * non come li abbiamo chiesti.
 *
 * ⛔ Il ritorno è la lettura vera (`server.timeout`, …) perché un assegnamento che non attecchisse
 *   (una versione di Node che rifiuta un valore, un server finto) lascerebbe il chiamante convinto
 *   di aver deciso qualcosa. «L'ho scritto» e «è così» sono due misure diverse.
 */
export function applicaTempiDelServer(server, tempi = TEMPI_SERVER_HTTP) {
  if (!server) return null;
  for (const [nome, valore] of Object.entries(tempi)) server[nome] = valore;
  return Object.freeze(Object.fromEntries(Object.keys(tempi).map((nome) => [nome, server[nome]])));
}

export function createSseSession({ response, heartbeatMs = 15_000, signal = null, lastEventId = 0, headers = {}, setIntervalFn = setInterval, clearIntervalFn = clearInterval } = {}) {
  let closed = false;
  let heartbeat = null;
  let onResponseClose;
  let onAbort;
  const send = (event) => {
    if (closed || response?.writableEnded || response?.destroyed) return false;
    if (typeof event?._sequenza === 'number' && event._sequenza <= lastEventId) return false;
    if (typeof event?._sequenza === 'number') response.write(`id: ${event._sequenza}\n`);
    response.write(`data: ${JSON.stringify(event)}\n\n`);
    return true;
  };
  const close = () => {
    if (closed) return;
    closed = true;
    if (heartbeat !== null) clearIntervalFn(heartbeat);
    response?.removeListener?.('close', onResponseClose);
    signal?.removeEventListener?.('abort', onAbort);
  };
  const start = () => {
    if (closed) return;
    response.writeHead(200, {
      ...headers,
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store',
      Connection: 'keep-alive',
    });
    response.socket?.setNoDelay?.(true);
    response.write(':ok\n\n');
    onResponseClose = close;
    response.once?.('close', onResponseClose);
    onAbort = close;
    signal?.addEventListener?.('abort', onAbort, { once: true });
    heartbeat = setIntervalFn(() => {
      if (closed || response.writableEnded || response.destroyed) { close(); return; }
      response.write(':battito\n\n');
    }, heartbeatMs);
    heartbeat?.unref?.();
  };
  return Object.freeze({ start, send, close, get closed() { return closed; } });
}

export async function closeRuntimeResources(reason, { resources = [], logger = null } = {}) {
  const pending = [];
  for (const resource of resources) {
    try {
      const result = typeof resource?.abort === 'function' ? resource.abort(reason)
        : typeof resource?.stop === 'function' ? resource.stop(reason)
          : typeof resource?.close === 'function' ? resource.close(reason)
            : typeof resource?.destroy === 'function' ? resource.destroy(reason) : undefined;
      if (result && typeof result.then === 'function') pending.push(Promise.resolve(result).catch((error) => {
        try { logger?.warn?.(`[runtime-close] ${error?.code || 'cleanup-failed'}`); } catch { /* cleanup best effort */ }
      }));
    } catch (error) {
      try { logger?.warn?.(`[runtime-close] ${error?.code || 'cleanup-failed'}`); } catch { /* cleanup best effort */ }
    }
  }
  await Promise.all(pending);
}
