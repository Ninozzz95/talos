import { TESTI } from '../i18n/testi/index.js';
import { linguaCorrenteDiT, t, interpola } from './lingua.js';
import { nomeModello } from './session-item.js';

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
  /* CONTRATTO-R30-R31 (30/10/2026): il tetto d'uscita — un rinvio SUBITO, senza stato HTTP né attesa; si chiude col suo `fine` */
  const tetto = v?.canale === 'tetto-uscita';
  /* Decisione 116 C (owner 04/11/2026): il rinnovo dell'accesso col piano ChatGPT a metà giro — senza stato HTTP (mai «401» a schermo),
     senza attesa, con l'ora d'inizio `at` per contare i secondi; `chiedeTokenAllApp` e `impronta` sono del telefono, qui si ignorano. */
  if (v?.canale === 'rinnovo-accesso') {
    if (v.schema !== 'talos.provider-retry.v1' || ![v.runId, v.threadId, v.requestId].every(id) || !['invio', 'fine'].includes(v.fase)
      || !Number.isSafeInteger(v.tentativo) || v.tentativo < 1 || !Number.isSafeInteger(v.tentativiMassimi) || v.tentativiMassimi < v.tentativo
      || (v.httpStatus !== undefined && v.httpStatus !== null) || !Number.isSafeInteger(v.at) || v.at < 1) return null;
    return { requestId: v.requestId, runId: v.runId, threadId: v.threadId, fase: v.fase, tentativo: v.tentativo, tentativiMassimi: v.tentativiMassimi,
      canale: 'rinnovo-accesso', retryAt: null, at: v.at };
  }
  if (tetto) {
    if (v.schema !== 'talos.provider-retry.v1' || ![v.runId, v.threadId, v.requestId].every(id) || !['invio', 'fine'].includes(v.fase)
      || !Number.isSafeInteger(v.tentativo) || v.tentativo < 1 || !Number.isSafeInteger(v.tentativiMassimi) || v.tentativiMassimi < v.tentativo
      || (v.httpStatus !== undefined && v.httpStatus !== null)) return null;
    return { requestId: v.requestId, runId: v.runId, threadId: v.threadId, fase: v.fase, tentativo: v.tentativo, tentativiMassimi: v.tentativiMassimi,
      canale: 'tetto-uscita', retryAt: null, motivo: ['solo-ragionamento', 'chiamata-tagliata', 'credito'].includes(v.motivo) ? v.motivo : null,
      tettoNuovo: Number.isSafeInteger(v.tettoNuovo) ? v.tettoNuovo : null,
      ragionamento: typeof v.ragionamento?.a === 'string' ? v.ragionamento.a : null, costoDiNuovo: v.costoDiNuovo === true };
  }
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
    ...(typeof v.modello === 'string' && v.modello && v.modello.length <= 256 ? { modello: v.modello } : {}),
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
  /* Decisione 116 C: «Rinnovo l'accesso a ChatGPT», il perché, e i secondi da quando è cominciato (nessun numero di tentativo) */
  if (retry.canale === 'rinnovo-accesso') {
    const accesso = (chiave, parametri) => (en === undefined ? t(`chat.chatgptAccess.${chiave}`, parametri)
      : interpola(TESTI[en ? 'en' : 'it'][`chat.chatgptAccess.${chiave}`], parametri));
    return { titolo: accesso('renewingTitle'), motivo: accesso('renewingReason'),
      tempo: accesso('seconds', { n: Math.max(0, Math.floor((ora - retry.at) / 1000)) }) };
  }
  const numero = voce('attempt', { attempt: retry.tentativo, max: retry.tentativiMassimi });
  /* CONTRATTO-R30-R31: il limite di risposta raggiunto — che cosa cambia nel nuovo invio, e se si paga di nuovo (un motore locale no) */
  if (retry.canale === 'tetto-uscita') {
    const livelli = { medium: 'level.medium', low: 'level.low', high: 'level.high', xhigh: 'level.xhigh' };
    const cosa = retry.ragionamento && livelli[retry.ragionamento]
      ? voce('outputCap.lowerReasoning', { level: voce(`outputCap.${livelli[retry.ragionamento]}`) })
      : voce(Number(retry.tettoNuovo) === 1 ? 'outputCap.higherCapOne' : 'outputCap.higherCapMany', { tokens: Number(retry.tettoNuovo ?? 0).toLocaleString(en === undefined ? undefined : en ? 'en-US' : 'it-IT') });
    const perche = voce(retry.motivo === 'chiamata-tagliata' ? 'outputCap.whyTool' : retry.motivo === 'credito' ? 'outputCap.whyCredit' : 'outputCap.whyReasoning');
    return { titolo: voce('outputCap.title'), motivo: `${perche} ${cosa}${retry.costoDiNuovo ? ` ${voce('outputCap.mayCost')}` : ''} ${numero}.`, tempo: voce('inProgress') };
  }
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

/**
 * Un solo nodo e timer, limitati all'attesa viva della sessione selezionata.
 * `continuaAdesso` (owner 27/10/2026 notte, «Sì, un clic per continuare»; bozzetto approvato il 28/10): sulla carta del limite del
 *   piano, i modelli già configurati e «Altro modello…». `proposte({ bloccato })` li dà (anche con una promessa), `onScelto(valore)`
 *   cambia modello e riprende — `true` se è riuscito —, `montaAltro(contenitore, alScelto)` monta il selettore della chat.
 */
export function montaProviderRetry({ contenitore, onShow = () => {}, document: doc = globalThis.document, continuaAdesso = null } = {}) {
  let stato = null, replay = true, vivo = false, nodo = null, timer = null;
  /* la carta su cui la persona ha appena scelto un modello: finché il cambio non finisce non la tocca nessuno (lo stop del giro la
     toglierebbe prima che diventi la nota «Continuo con …»), e non se ne disegna un'altra accanto */
  let cartaInScelta = null;
  const nascondi = () => {
    if (timer !== null) { clearInterval(timer); timer = null; }
    nodo?.remove(); nodo = null;
  };
  const disegna = () => {
    if (cartaInScelta) return;
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
      /* la riga «Continua adesso con…» sta sotto lo stato ma FUORI dalla regione che si annuncia: pulsanti dentro un `role=status`
         si rileggerebbero a ogni cambio del testo */
      const sinistra = doc.createElement('div'); sinistra.className = 'talos-provider-retry__sinistra';
      sinistra.append(statoEl);
      const tempo = doc.createElement('span'); tempo.className = 'talos-provider-retry__tempo';
      tempo.setAttribute('role', 'timer'); tempo.setAttribute('aria-live', 'off');
      const destra = doc.createElement('div'); destra.className = 'talos-provider-retry__destra';
      destra.append(tempo);
      nodo.append(sinistra, destra); parent.append(nodo);
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
    disegnaContinua();
    if (!nodo) return; // un clic riuscito l'ha appena lasciato nella chat come nota
    const conta = (stato.retry.fase === 'attesa' && stato.retry.retryAt > Date.now()) || stato.retry.canale === 'rinnovo-accesso'; // 116 C: i secondi del rinnovo
    if (conta && timer === null) timer = setInterval(disegna, 1000);
    if (!conta && timer !== null) { clearInterval(timer); timer = null; }
  };
  /*
   * «Continua adesso con…» — solo sul limite del piano, solo mentre il giro aspetta il reset. Dal codice di Codex: sul limite d'uso
   *   cambia il modello del thread e rimanda il turno (`codex-rs/tui/src/app/backend_banner_fallback.rs:46-110`,
   *   `chatwidget/backend_banners.rs:215-236`); qui lo sceglie la persona, fra i modelli che ha già.
   */
  function disegnaContinua() {
    const r = stato?.retry;
    const offri = Boolean(continuaAdesso && typeof continuaAdesso.onScelto === 'function' && r
      && r.motivo === 'limite-del-piano' && r.httpStatus === 429 && r.fase === 'attesa');
    let riga = nodo.querySelector('[data-provider-retry-continua]');
    if (!offri) { riga?.remove(); return; }
    if (riga) return;
    riga = doc.createElement('div'); riga.className = 'talos-provider-retry__continua'; riga.dataset.providerRetryContinua = '';
    const etichetta = doc.createElement('span'); etichetta.className = 'talos-provider-retry__continua-etichetta';
    etichetta.textContent = t('chat.retry.planLimit.continueNowWith');
    const altro = doc.createElement('button'); altro.type = 'button'; altro.className = 'talos-button talos-button--ghost talos-button--sm';
    altro.dataset.continuaAltro = ''; altro.textContent = t('chat.retry.planLimit.otherModel'); altro.setAttribute('aria-expanded', 'false');
    const selettore = doc.createElement('div'); selettore.className = 'talos-provider-retry__selettore'; selettore.dataset.continuaSelettore = ''; selettore.hidden = true;
    riga.append(etichetta, altro, selettore);
    nodo.querySelector('.talos-provider-retry__sinistra')?.append(riga);
    const ore = new Date(r.retryAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    const scegli = async (valore) => {
      if (cartaInScelta || !valore) return;
      const carta = nodo;
      if (!carta) return;
      for (const b of riga.querySelectorAll('button')) b.disabled = true;
      /* la carta esce dalle mani della carta viva: resta dov'è, e il conto alla rovescia si ferma */
      cartaInScelta = carta; nodo = null;
      if (timer !== null) { clearInterval(timer); timer = null; }
      let riuscito = false;
      try { riuscito = (await continuaAdesso.onScelto(valore)) === true; } catch { riuscito = false; }
      cartaInScelta = null;
      if (riuscito) lasciaComeNota(carta, nomeModello(valore) || valore, ore);
      else carta.remove(); // non è riuscito: se il giro aspetta ancora, la carta torna fresca (sotto), coi pulsanti accesi
      disegna();
    };
    altro.addEventListener('click', () => {
      const apri = selettore.hidden;
      selettore.hidden = !apri; altro.setAttribute('aria-expanded', String(apri));
      if (apri && typeof continuaAdesso.montaAltro === 'function') continuaAdesso.montaAltro(selettore, (id) => { void scegli(id); });
    });
    Promise.resolve(typeof continuaAdesso.proposte === 'function' ? continuaAdesso.proposte({ bloccato: r.modello ?? null }) : [])
      .then((proposte) => {
        if (!riga.isConnected || !Array.isArray(proposte)) return;
        for (const p of proposte) {
          if (!p || typeof p.valore !== 'string' || !p.valore || typeof p.testo !== 'string' || !p.testo) continue;
          const b = doc.createElement('button'); b.type = 'button'; b.className = 'talos-button talos-button--secondary talos-button--sm';
          b.dataset.continuaCon = p.valore; b.textContent = p.fornitore ? `${p.testo} · ${p.fornitore}` : p.testo;
          b.addEventListener('click', () => { void scegli(p.valore); });
          riga.insertBefore(b, altro);
        }
      })
      .catch(() => { /* senza proposte resta «Altro modello…» */ });
  }
  /* Un clic riuscito: la carta diventa la nota «Continuo con …» e resta nella chat (in Codex «Automatically switched to …» è una riga
     della storia). Non è più la carta viva: il giro fermato finisce, e chi la mostra non la toglie. */
  function lasciaComeNota(carta, nome, ore) {
    if (!carta) return;
    carta.querySelector('[data-provider-retry-continua]')?.remove();
    carta.querySelector('.talos-provider-retry__destra')?.remove();
    carta.querySelector('.talos-provider-retry__titolo').textContent = t('chat.retry.planLimit.continuingWith', { model: nome });
    carta.querySelector('.talos-provider-retry__motivo').textContent = t('chat.retry.planLimit.backAt', { time: ore });
    delete carta.dataset.providerRetry; delete carta.dataset.fase;
    carta.dataset.providerRetryContinuato = '';
  }
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
