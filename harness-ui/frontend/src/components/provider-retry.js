import { linguaCorrenteDiT } from './lingua.js';

function valoreRetry(evento) {
  if (evento?.type !== 'CUSTOM' || evento.name !== 'talos.provider-retry') return null;
  const v = evento.value;
  const id = x => typeof x === 'string' && x.length > 0 && x.length <= 256;
  if (!v || v.schema !== 'talos.provider-retry.v1'
    || ![v.runId, v.threadId, v.requestId].every(id)
    || !['attesa', 'invio', 'fine'].includes(v.fase)
    || !Number.isSafeInteger(v.tentativo) || v.tentativo < 2
    || !Number.isSafeInteger(v.tentativiMassimi) || v.tentativiMassimi < v.tentativo
    || !Number.isInteger(v.httpStatus) || !((v.httpStatus === 402 && v.motivo === 'budget-occupato')
      || v.httpStatus === 408 || v.httpStatus === 429 || (v.httpStatus >= 500 && v.httpStatus <= 599))
    || !Number.isFinite(v.attesaMs) || v.attesaMs < 0 || v.attesaMs > 2_147_483_647
    || (v.fase === 'attesa' && (!Number.isSafeInteger(v.retryAt) || v.retryAt < 1))) return null;
  return { requestId: v.requestId, runId: v.runId, threadId: v.threadId, fase: v.fase,
    tentativo: v.tentativo, tentativiMassimi: v.tentativiMassimi, httpStatus: v.httpStatus,
    retryAt: v.fase === 'attesa' ? v.retryAt : null,
    ...(v.httpStatus === 402 ? { motivo: v.motivo } : {}) };
}

/** Proiezione del journal: nessuna richiesta o decisione di ritentare nel client. */
export function riduciRetry(stato, evento) {
  const s = stato ?? { runId: null, threadId: null, retry: null, lastSequence: -1, closed: true };
  if (evento?.type === 'RunStarted' && evento.runId && evento.runId !== s.runId) {
    return { runId: evento.runId, threadId: evento.threadId, retry: null, lastSequence: -1, closed: false };
  }
  if (['RunFinished', 'RunError'].includes(evento?.type) && (!evento.runId || evento.runId === s.runId)) {
    return { ...s, retry: null, closed: true };
  }
  const v = valoreRetry(evento);
  if (!v || s.closed || v.runId !== s.runId || v.threadId !== s.threadId) return s;
  const seq = Number.isSafeInteger(evento._sequenza) ? evento._sequenza : s.lastSequence + 1;
  if (seq <= s.lastSequence) return s;
  if (v.fase === 'fine' && s.retry && v.requestId !== s.retry.requestId) return s;
  return { ...s, retry: v.fase === 'fine' ? null : v, lastSequence: seq };
}

export function testoRetry(retry, ora = Date.now(), en = false) {
  const numero = en ? `Attempt ${retry.tentativo} of ${retry.tentativiMassimi}` : `Tentativo ${retry.tentativo} di ${retry.tentativiMassimi}`;
  const motivo = retry.httpStatus === 402 && retry.motivo === 'budget-occupato'
    ? (en ? 'The budget is temporarily occupied by ongoing or recently completed requests' : 'Il budget è temporaneamente occupato da richieste in corso o appena concluse')
    : retry.httpStatus === 429
    ? (en ? 'The service is limiting requests' : 'Il servizio sta limitando le richieste')
    : retry.httpStatus === 408
      ? (en ? 'The service rejected the request after a timeout' : 'Il servizio ha rifiutato la richiesta per timeout')
      : (en ? 'The service is temporarily unavailable' : 'Il servizio è temporaneamente indisponibile');
  const secondi = Math.max(0, Math.ceil((retry.retryAt - ora) / 1000));
  return {
    titolo: retry.fase === 'attesa' ? (en ? 'Retry scheduled' : 'Nuovo tentativo programmato') : numero,
    motivo: `${motivo} (HTTP ${retry.httpStatus}).${retry.fase === 'attesa' ? ` ${numero}.` : ''}`,
    tempo: retry.fase !== 'attesa' ? (en ? 'Request in progress' : 'Richiesta in corso')
      : secondi > 0 ? (en ? `In ${secondi} s` : `Tra ${secondi} s`)
        : (en ? 'Waiting for server confirmation' : 'In attesa di conferma del server'),
  };
}

/** Un solo nodo e timer, limitati all'attesa viva della sessione selezionata. */
export function montaProviderRetry({ contenitore, onShow = () => {}, document: doc = globalThis.document } = {}) {
  let stato = null, replay = true, vivo = false, nodo = null, timer = null;
  const nascondi = () => {
    if (timer !== null) { clearInterval(timer); timer = null; }
    nodo?.remove(); nodo = null;
  };
  const disegna = () => {
    const parent = contenitore?.();
    if (!stato?.retry || replay || !vivo || !parent) { nascondi(); return; }
    if (!nodo?.isConnected) {
      nascondi(); onShow();
      nodo = doc.createElement('aside');
      nodo.className = 'talos-provider-retry';
      nodo.dataset.providerRetry = '';
      const statoEl = doc.createElement('div');
      statoEl.setAttribute('role', 'status');
      statoEl.setAttribute('aria-atomic', 'true');
      const titolo = doc.createElement('strong'); titolo.className = 'talos-provider-retry__titolo';
      const motivo = doc.createElement('p'); motivo.className = 'talos-provider-retry__motivo';
      statoEl.append(titolo, motivo);
      const tempo = doc.createElement('span'); tempo.className = 'talos-provider-retry__tempo';
      tempo.setAttribute('role', 'timer'); tempo.setAttribute('aria-live', 'off');
      nodo.append(statoEl, tempo); parent.append(nodo);
    }
    nodo.dataset.fase = stato.retry.fase;
    const testi = testoRetry(stato.retry, Date.now(), linguaCorrenteDiT() === 'en');
    for (const nome of ['titolo', 'motivo', 'tempo']) {
      const el = nodo.querySelector(`.talos-provider-retry__${nome}`);
      if (el.textContent !== testi[nome]) el.textContent = testi[nome];
    }
    const conta = stato.retry.fase === 'attesa' && stato.retry.retryAt > Date.now();
    if (conta && timer === null) timer = setInterval(disegna, 1000);
    if (!conta && timer !== null) { clearInterval(timer); timer = null; }
  };
  return {
    evento(evento, { inReplay = false, attivo = false } = {}) {
      const prossimoReplay = evento?.type === 'CUSTOM' && evento.name === 'talos.fine-rigiocata' ? false : inReplay;
      const prossimoStato = riduciRetry(stato, evento);
      if (prossimoStato === stato && prossimoReplay === replay && attivo === vivo) return;
      replay = prossimoReplay;
      vivo = attivo;
      stato = prossimoStato;
      disegna();
    },
    sospendi() { replay = true; nascondi(); },
    reset() { stato = null; replay = true; vivo = false; nascondi(); },
  };
}
