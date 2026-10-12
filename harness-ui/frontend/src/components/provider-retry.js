import { TESTI } from '../i18n/testi/index.js';
import { linguaCorrenteDiT, t, interpola } from './lingua.js';

/** La pagina dei consumi del piano ChatGPT: il link fisso delle linee guida di OpenAI («Manage usage»). Una sola copia, qui. */
export const PAGINA_CONSUMI_CHATGPT = 'https://chatgpt.com/settings/usage';

function valoreRetry(evento) {
  if (evento?.type !== 'CUSTOM' || evento.name !== 'talos.provider-retry') return null;
  const v = evento.value;
  const id = x => typeof x === 'string' && x.length > 0 && x.length <= 256;
  /* R1 della review avversariale BUG-16: il canale «esito-incerto» (reinvio automatico del kernel dopo
     un giro perso senza effetti) NON ha uno HTTP status: il suo motivo arriva nel campo `motivo` e il
     primo tentativo è 1 (il canale HTTP parte da 2 perché il primo giro non è un «ritenta»). */
  const incerto = v.canale === 'esito-incerto';
  if (!v || v.schema !== 'talos.provider-retry.v1'
    || ![v.runId, v.threadId, v.requestId].every(id)
    || !['attesa', 'invio', 'fine'].includes(v.fase)
    || !Number.isSafeInteger(v.tentativo) || v.tentativo < (incerto ? 1 : 2)
    || !Number.isSafeInteger(v.tentativiMassimi) || v.tentativiMassimi < v.tentativo
    || (incerto
      ? (v.httpStatus !== undefined && v.httpStatus !== null) || (v.motivo !== undefined && typeof v.motivo !== 'string')
      : (!Number.isInteger(v.httpStatus) || (v.motivo !== undefined && !((v.httpStatus === 402 && v.motivo === 'budget-occupato') || (v.httpStatus === 429 && v.motivo === 'limite-del-piano')))
        || !((v.httpStatus === 402 && v.motivo === 'budget-occupato')
        || v.httpStatus === 408 || v.httpStatus === 429 || (v.httpStatus >= 500 && v.httpStatus <= 599))))
    || !Number.isFinite(v.attesaMs) || v.attesaMs < 0 || v.attesaMs > 2_147_483_647
    || (v.fase === 'attesa' && (!Number.isSafeInteger(v.retryAt) || v.retryAt < 1))) return null;
  return { requestId: v.requestId, runId: v.runId, threadId: v.threadId, fase: v.fase,
    tentativo: v.tentativo, tentativiMassimi: v.tentativiMassimi, httpStatus: v.httpStatus,
    canale: incerto ? 'esito-incerto' : 'http',
    retryAt: v.fase === 'attesa' ? v.retryAt : null,
    ...(v.httpStatus === 402 ? { motivo: v.motivo } : {}),
    ...(v.httpStatus === 429 && v.motivo === 'limite-del-piano' ? { motivo: v.motivo } : {}),
    ...(incerto && typeof v.motivo === 'string' ? { motivo: v.motivo } : {}),
    /* OWN-01 (CLI, 09/10/2026; nomi concordati col bugfixer): il fornitore non ha mandato NEMMENO gli header. Campo additivo: il
       canale resta «esito-incerto», ma la frase non è più «si è interrotta» — non era mai cominciata. */
    ...(incerto && v.causa === 'nessuna-prima-risposta' ? { causa: v.causa } : {}) };
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

/*
 * 03/10/2026, seconda ondata della lingua: le frasi stanno nel dizionario (`chat.retry.*`). Senza `en` si legge la lingua
 *   corrente (anche la pseudo-lingua); `en` true/false resta per chi chiede una lingua precisa (le prove).
 */
export function testoRetry(retry, ora = Date.now(), en) {
  const voce = (chiave, parametri) => (en === undefined ? t(`chat.retry.${chiave}`, parametri)
    : interpola(TESTI[en ? 'en' : 'it'][`chat.retry.${chiave}`], parametri));
  const numero = voce('attempt', { attempt: retry.tentativo, max: retry.tentativiMassimi });
  /* R1 (BUG-16): il canale «esito-incerto» dice il SUO motivo, senza «stato null» — non c'è nessuno status HTTP da citare. */
  const incerto = retry.canale === 'esito-incerto';
  const motivo = incerto ? voce(retry.causa === 'nessuna-prima-risposta' ? 'reason.noFirstResponse' : 'reason.outcomeUnknown')
    : retry.httpStatus === 402 && retry.motivo === 'budget-occupato' ? voce('reason.budgetBusy')
      : retry.httpStatus === 429 ? voce('reason.rateLimited')
        : retry.httpStatus === 408 ? voce('reason.timeout') : voce('reason.unavailable');
  const secondi = Math.max(0, Math.ceil((retry.retryAt - ora) / 1000));
  /* 11/10/2026 — il limite d'uso del piano ChatGPT, con le parole di Claude Code: «Usage limit reached · continuing automatically
     at …». L'attesa dura mezz'ora o più: si dice l'ORA, non i secondi; «Ferma» annulla. */
  if (retry.motivo === 'limite-del-piano' && retry.httpStatus === 429) {
    const ore = new Date(retry.retryAt ?? ora).toLocaleTimeString(en === undefined ? undefined : en ? 'en-GB' : 'it-IT', { hour: '2-digit', minute: '2-digit' });
    return {
      titolo: voce('planLimit.title'),
      /* linee guida OpenAI per «Sign in with ChatGPT» (ui-ux-guidelines, lette l'11/10/2026): «Usage limit reached» / «Review your
         plan or this app's limit in ChatGPT settings.», e «Make Manage usage the primary action» (`azione`, sotto) */
      motivo: retry.fase === 'attesa' ? `${voce('planLimit.review')} ${voce('planLimit.continuesAt', { time: ore, attempt: retry.tentativo - 1, max: retry.tentativiMassimi - 1 })}` : voce('planLimit.retrying'),
      azione: { testo: voce('planLimit.manageUsage'), indirizzo: PAGINA_CONSUMI_CHATGPT },
      tempo: retry.fase !== 'attesa' ? voce('inProgress') : secondi > 0 ? voce('planLimit.stopToCancel') : voce('waitingConfirmation'),
    };
  }
  return {
    titolo: retry.fase === 'attesa' ? voce('scheduled') : numero,
    motivo: `${incerto ? motivo : voce('reason.withStatus', { reason: motivo, status: retry.httpStatus })}${retry.fase === 'attesa' ? ` ${numero}.` : ''}`,
    tempo: retry.fase !== 'attesa' ? voce('inProgress')
      : secondi > 0 ? voce('inSeconds', { seconds: secondi }) : voce('waitingConfirmation'),
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
      const destra = doc.createElement('div'); destra.className = 'talos-provider-retry__destra';
      destra.append(tempo);
      nodo.append(statoEl, destra); parent.append(nodo);
    }
    nodo.dataset.fase = stato.retry.fase;
    const testi = testoRetry(stato.retry, Date.now()); // la lingua corrente, pseudo-lingua compresa
    for (const nome of ['titolo', 'motivo', 'tempo']) {
      const el = nodo.querySelector(`.talos-provider-retry__${nome}`);
      if (el.textContent !== testi[nome]) el.textContent = testi[nome];
    }
    /* 11/10/2026 — l'azione della carta (oggi solo il limite del piano ChatGPT: «Manage usage», azione primaria). È un LINK con la
       veste del pulsante: porta a una pagina, non fa niente qui. */
    let azione = nodo.querySelector('[data-provider-retry-azione]');
    if (!testi.azione) azione?.remove();
    else {
      if (!azione) {
        azione = doc.createElement('a');
        azione.className = 'talos-button talos-button--primary talos-button--sm';
        azione.dataset.providerRetryAzione = ''; azione.target = '_blank'; azione.rel = 'noopener noreferrer';
        nodo.querySelector('.talos-provider-retry__destra')?.append(azione);
      }
      if (azione.textContent !== testi.azione.testo) azione.textContent = testi.azione.testo;
      if (azione.getAttribute('href') !== testi.azione.indirizzo) azione.setAttribute('href', testi.azione.indirizzo);
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
