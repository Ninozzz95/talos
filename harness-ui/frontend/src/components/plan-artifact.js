import { t } from './lingua.js';
import { renderizzaMarkdown } from './markdown.js';

/**
 * La scheda del PIANO nella conversazione.
 * - Senza richiesta (`requestId`): il vecchio piano dal testo finale di un giro in Piano, da leggere e basta.
 * - ⛔ 24/09/2026, decisioni owner 3, 36-39: col piano presentato dall'attrezzo, la scheda porta le QUATTRO scelte come Claude
 *   Code («Yes, and use auto mode» · «Yes, manually approve edits» · «No, keep planning», più «approva e pulisci il contesto»)
 *   e come Codex (`plan_implementation.rs:9-12`: «Yes, implement this plan» / «Yes, clear context and implement» / «No, stay
 *   in Plan mode»); dossier `.claude/RICERCA-10x4-WORKFLOW-PLAN-ASK-2026-09-23.md` D1, R2, R6. Dopo la scelta la scheda diventa
 *   la ricevuta: «Approvato · rev. n» con l'impronta (38), «Da rivedere» con la correzione, o chiusa senza scelta e perché.
 *   L'approvazione non scade mai («Permission prompts, including plan approval, never auto-resolve on idle», D1).
 */
export function renderPlanText(text, { document = globalThis.document } = {}) {
  return renderizzaMarkdown(String(text ?? ''), { document });
}

const IMPRONTA = /^sha256:[0-9a-f]{64}$/u;
const MOTIVI_CHIUSURA = ['fermato', 'reindirizzamento', 'nuovo-messaggio', 'interrotta'];

export function parsePlanEvent(value, sessionId) {
  if (value?.schema !== 'talos.plan.v1' || value.sessionId !== sessionId
    || typeof value.planId !== 'string' || !value.planId || value.planId.length > 256
    || !Number.isSafeInteger(value.revision) || value.revision < 1
    || typeof value.at !== 'string' || !Number.isFinite(Date.parse(value.at))) return null;
  const richiesta = typeof value.requestId === 'string' && value.requestId.length > 0 && value.requestId.length <= 256
    && typeof value.hash === 'string' && IMPRONTA.test(value.hash);
  if (value.status === 'proposed' && typeof value.content === 'string'
    && value.content.trim() && value.content.length <= 100_000) {
    return { planId: value.planId, revision: value.revision,
      status: 'proposed', text: value.content, at: value.at,
      // Solo il piano presentato con l'attrezzo è approvabile: ha la sua richiesta e la sua impronta.
      ...(richiesta ? { requestId: value.requestId, hash: value.hash } : {}) };
  }
  if (value.status === 'unavailable' && value.content === null
    && value.reason === 'PLAN_CONTENT_TOO_LARGE') {
    return { planId: value.planId, revision: value.revision,
      status: 'unavailable', text: null, at: value.at };
  }
  /* 24/09/2026 — la scelta sul piano, o la sua chiusura senza scelta: sempre legata alla richiesta e alla revisione. */
  if (!richiesta) return null;
  if (value.status === 'approved'
    && ['procedi-con-conferma', 'procedi-accetta-modifiche', 'conversazione-pulita'].includes(value.decisione)) {
    return { planId: value.planId, revision: value.revision, status: 'approved', decisione: value.decisione,
      requestId: value.requestId, hash: value.hash, at: value.at, da: value.da === 'sistema' ? 'sistema' : 'persona',
      ...(value.decisione === 'conversazione-pulita' && typeof value.nuovaSessionId === 'string' && value.nuovaSessionId
        ? { nuovaSessionId: value.nuovaSessionId } : {}) };
  }
  if (value.status === 'changes-requested' && value.decisione === 'continua-a-pianificare') {
    return { planId: value.planId, revision: value.revision, status: 'changes-requested', decisione: value.decisione,
      requestId: value.requestId, hash: value.hash, at: value.at, da: 'persona',
      ...(typeof value.feedback === 'string' && value.feedback.trim() ? { feedback: value.feedback.slice(0, 4_000) } : {}) };
  }
  if (value.status === 'cancelled') {
    return { planId: value.planId, revision: value.revision, status: 'cancelled', requestId: value.requestId, hash: value.hash,
      at: value.at, da: value.da === 'sistema' ? 'sistema' : 'persona',
      motivo: MOTIVI_CHIUSURA.includes(value.motivo) ? value.motivo : null };
  }
  return null;
}

export function createPlanArtifact({
  document = globalThis.document, text, status = 'proposed',
  source = 'legacy', planId = null, revision = null,
  requestId = null, hash = null, onDecisione = null,
} = {}) {
  if (status !== 'proposed' && status !== 'unavailable') return null;
  if (status === 'proposed' && (typeof text !== 'string' || !text.trim())) return null;
  const approvabile = status === 'proposed' && typeof requestId === 'string' && requestId.length > 0
    && typeof hash === 'string' && IMPRONTA.test(hash) && typeof onDecisione === 'function';
  const section = document.createElement('section');
  section.className = 'talos-plan-artifact';
  section.dataset.c = 'PlanArtifact';
  section.dataset.status = status;
  section.dataset.source = source;
  if (planId) section.dataset.planId = planId;
  if (Number.isSafeInteger(revision)) section.dataset.revision = String(revision);
  section.setAttribute('aria-label', status === 'proposed' ? t('chat.plan.proposed') : t('chat.plan.unavailable'));

  const heading = document.createElement('div');
  heading.className = 'talos-plan-artifact__heading';
  const title = document.createElement('h3');
  title.textContent = status === 'proposed' ? t('chat.plan.proposed') : t('chat.plan.unavailable');
  const state = document.createElement('span');
  state.className = 'talos-plan-artifact__state';
  state.textContent = status !== 'proposed' ? t('chat.plan.tooLong')
    : approvabile ? t('chat.plan.waitingForChoice', { revisione: Number.isSafeInteger(revision) ? t('chat.plan.revision', { n: revision }) : '' })
      : t('chat.plan.needsReview');
  heading.append(title, state);

  const body = document.createElement('div');
  body.className = 'talos-plan-artifact__body';
  body.tabIndex = 0;
  body.setAttribute('aria-label', t('chat.plan.content'));
  if (status === 'proposed') body.append(renderPlanText(text, { document }));
  else {
    const message = document.createElement('p');
    message.textContent = t('chat.plan.tooLongHint');
    body.append(message);
  }

  if (approvabile) {
    section.dataset.approvabile = '';
    section.dataset.requestId = requestId;
    section.dataset.hash = hash;
    section.append(heading, body, creaScelte({ document, requestId, hash, onDecisione, section }));
    return section;
  }
  const footer = document.createElement('p');
  footer.className = 'talos-plan-artifact__footer';
  footer.textContent = status === 'proposed'
    ? t('chat.plan.cannotApproveHere')
    : t('chat.plan.noPartialContent');
  section.append(heading, body, footer);
  return section;
}

/* Le quattro scelte (decisioni owner 3 e 37), nell'ordine dell'owner; ogni riga dice che cosa succede, in parole. */
export const SCELTE_PIANO = Object.freeze([
  Object.freeze({ decisione: 'procedi-con-conferma', get titolo() { return t('chat.plan.choice.askFirst.title'); },
    get descrizione() { return t('chat.plan.choice.askFirst.description'); } }),
  Object.freeze({ decisione: 'procedi-accetta-modifiche', get titolo() { return t('chat.plan.choice.acceptChanges.title'); },
    get descrizione() { return t('chat.plan.choice.acceptChanges.description'); } }),
  Object.freeze({ decisione: 'conversazione-pulita', get titolo() { return t('chat.plan.choice.freshConversation.title'); },
    get descrizione() { return t('chat.plan.choice.freshConversation.description'); } }),
  Object.freeze({ decisione: 'continua-a-pianificare', get titolo() { return t('chat.plan.choice.keepPlanning.title'); },
    get descrizione() { return t('chat.plan.choice.keepPlanning.description'); } }),
]);

function creaScelte({ document, requestId, hash, onDecisione, section }) {
  const make = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const blocco = make('div', 'talos-plan-artifact__choices');
  blocco.setAttribute('role', 'group');
  blocco.setAttribute('aria-label', t('chat.plan.proceedLabel'));
  const domanda = make('p', 'talos-plan-artifact__ask', t('chat.plan.proceedQuestion'));
  const elenco = make('div', 'talos-plan-artifact__choice-list');
  const errore = make('p', 'talos-plan-artifact__error');
  errore.setAttribute('role', 'alert');
  errore.hidden = true;
  const bottoni = [];
  let campo = null;

  const abilita = (si) => {
    for (const b of bottoni) b.disabled = !si;
    if (campo) { campo.textarea.disabled = !si; campo.invia.disabled = !si; campo.annulla.disabled = !si; }
    if (si) blocco.removeAttribute('aria-busy'); else blocco.setAttribute('aria-busy', 'true');
  };
  /* Le scelte si spengono nello stesso istante del clic: un secondo clic durante l'invio non parte (il bottone spento non lo riceve). */
  const invia = async (decisione, feedback) => {
    errore.hidden = true;
    errore.textContent = '';
    abilita(false);
    section.dataset.inVolo = decisione;
    let esito;
    try { esito = await onDecisione({ requestId, decisione, hash, ...(feedback ? { feedback } : {}) }); }
    catch (rotto) { esito = { ok: false, messaggio: rotto instanceof Error ? rotto.message : String(rotto) }; }
    delete section.dataset.inVolo;
    if (esito?.ok === false) {
      errore.textContent = t('chat.plan.choiceFailed', { messaggio: esito.messaggio || t('chat.plan.tryAgain') });
      errore.hidden = false;
      abilita(true);
    }
    /* Riuscita: la ricevuta la scrive l'evento del server (`applicaDecisionePiano`), uguale in ogni finestra aperta. */
  };

  for (const scelta of SCELTE_PIANO) {
    const b = make('button', 'talos-plan-artifact__choice');
    b.type = 'button';
    b.dataset.decisione = scelta.decisione;
    const testo = make('span', 'talos-plan-artifact__choice-text');
    testo.append(make('span', 'talos-plan-artifact__choice-title', scelta.titolo),
      make('span', 'talos-plan-artifact__choice-description', scelta.descrizione));
    b.append(testo);
    bottoni.push(b);
    elenco.append(b);
    if (scelta.decisione !== 'continua-a-pianificare') {
      b.addEventListener('click', () => { void invia(scelta.decisione); });
      continue;
    }
    b.setAttribute('aria-expanded', 'false');
    const riquadro = make('div', 'talos-plan-artifact__feedback');
    riquadro.hidden = true;
    const idCampo = 'piano-correzione-' + String(requestId).replace(/[^A-Za-z0-9_-]/gu, '').slice(0, 64);
    /* ⛔ 24/09/2026, visto nel browser vero: niente `aria-controls` qui. La pagina ha una regia generica che tratta ogni
       `[aria-expanded][aria-controls]` come una disclosure e la ribalta sullo stesso clic (app.js, «i `[aria-expanded][aria-controls]`
       sono disclosure»): due ribaltamenti = il campo non si apriva. `aria-expanded` da solo basta a un pulsante che apre un
       riquadro (WAI-ARIA APG, Disclosure pattern: `aria-controls` è facoltativo). */
    const etichetta = make('label', 'talos-plan-artifact__feedback-label', t('chat.plan.feedback.label'));
    etichetta.setAttribute('for', idCampo);
    const textarea = make('textarea', 'talos-textarea'); // l'area di testo del sistema (index.css), non la riga singola con icona
    textarea.id = idCampo;
    textarea.rows = 3;
    textarea.maxLength = 4_000;
    textarea.placeholder = t('chat.plan.feedback.placeholder');
    const azioni = make('div', 'talos-plan-artifact__feedback-actions');
    const annulla = make('button', 'talos-button talos-button--ghost talos-button--sm', t('chat.common.cancel'));
    annulla.type = 'button';
    const inviaCorrezione = make('button', 'talos-button talos-button--primary talos-button--sm', t('chat.plan.feedback.send'));
    inviaCorrezione.type = 'button';
    azioni.append(annulla, inviaCorrezione);
    riquadro.append(etichetta, textarea, azioni);
    campo = { textarea, invia: inviaCorrezione, annulla };
    const apri = (si) => {
      riquadro.hidden = !si;
      b.setAttribute('aria-expanded', String(si));
      if (si) textarea.focus?.(); else b.focus?.();
    };
    b.addEventListener('click', () => apri(riquadro.hidden));
    annulla.addEventListener('click', () => apri(false));
    inviaCorrezione.addEventListener('click', () => { void invia('continua-a-pianificare', textarea.value.trim()); });
    elenco.append(riquadro);
  }
  blocco.append(domanda, elenco, errore);
  return blocco;
}

function oraDi(at) {
  const data = typeof at === 'string' ? new Date(at) : null;
  if (!data || Number.isNaN(data.getTime())) return null;
  return String(data.getHours()).padStart(2, '0') + ':' + String(data.getMinutes()).padStart(2, '0');
}

/* La frase della ricevuta: una per scelta, e per la chiusura senza scelta una per motivo. Mai «approvato» per ciò che non lo è. */
function fraseDecisione(fact) {
  if (fact.status === 'approved') {
    if (fact.decisione === 'procedi-con-conferma') return t('chat.plan.fact.approvedAskFirst');
    if (fact.decisione === 'procedi-accetta-modifiche') return t('chat.plan.fact.approvedAcceptChanges');
    return t('chat.plan.fact.approvedFresh');
  }
  if (fact.status === 'changes-requested') return t('chat.plan.fact.keepPlanning');
  if (fact.motivo === 'fermato') return t('chat.plan.fact.closed.stopped');
  if (fact.motivo === 'reindirizzamento') return t('chat.plan.fact.closed.redirected');
  if (fact.motivo === 'nuovo-messaggio') return t('chat.plan.fact.closed.newMessage');
  if (fact.motivo === 'interrotta') return t('chat.plan.fact.closed.interrupted');
  return t('chat.plan.fact.closed.generic');
}

/*
 * ⛔ 24/09/2026 — la scheda diventa la RICEVUTA della scelta (decisione 38): stato in testata, una frase, l'impronta del piano
 *   approvato e l'ora. Vale per la revisione e la richiesta della scheda: una decisione di un'altra revisione non la tocca.
 */
export function applicaDecisionePiano(section, fact, { document = globalThis.document, onApriSessione = null } = {}) {
  if (!section || !fact || !['approved', 'changes-requested', 'cancelled'].includes(fact.status)) return false;
  if (section.dataset.revision && Number(section.dataset.revision) !== fact.revision) return false;
  if (section.dataset.requestId && section.dataset.requestId !== fact.requestId) return false;
  const make = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  section.dataset.status = fact.status;
  delete section.dataset.approvabile;
  const rev = Number.isSafeInteger(fact.revision) ? t('chat.plan.revision', { n: fact.revision }) : '';
  const etichetta = fact.status === 'approved' ? t('chat.common.approved') + rev
    : fact.status === 'changes-requested' ? t('chat.plan.needsReview') + rev : t('chat.plan.closedWithoutChoice');
  const stato = section.querySelector?.('.talos-plan-artifact__state');
  if (stato) stato.textContent = etichetta;
  // 24/09/2026, visto nella foto del giro vero: dopo la scelta il titolo diceva ancora «Piano proposto» accanto ad «Approvato».
  const titolo = section.querySelector?.('.talos-plan-artifact__heading')?.children?.[0] ?? null;
  if (titolo) titolo.textContent = fact.status === 'approved' ? t('chat.plan.title.approved') : fact.status === 'changes-requested' ? t('chat.plan.title.needsReview') : t('chat.plan.title.closed');
  section.setAttribute('aria-label', t('chat.plan.ariaLabel', { stato: etichetta }));
  const ricevuta = make('div', 'talos-plan-artifact__receipt');
  ricevuta.setAttribute('role', 'status');
  ricevuta.append(make('p', 'talos-plan-artifact__receipt-line', fraseDecisione(fact)));
  if (fact.status === 'changes-requested' && fact.feedback) {
    ricevuta.append(make('p', 'talos-plan-artifact__receipt-feedback', '«' + fact.feedback + '»'));
  }
  const meta = [];
  if (fact.status === 'approved' && typeof fact.hash === 'string') meta.push(t('chat.plan.hash', { hash: fact.hash.slice(7, 19) }));
  const quando = oraDi(fact.at);
  if (quando) meta.push(t('chat.plan.meta.timeLine', { azione: fact.da === 'sistema' ? t('chat.plan.meta.closedBySystemAt') : fact.status === 'cancelled' ? t('chat.plan.meta.cancelledAt') : t('chat.plan.meta.chosenAt'), ora: quando }));
  if (meta.length) ricevuta.append(make('p', 'talos-plan-artifact__receipt-meta', meta.join(' · ')));
  if (fact.status === 'approved' && fact.nuovaSessionId && typeof onApriSessione === 'function') {
    const apri = make('button', 'talos-button talos-button--secondary talos-button--sm', t('chat.plan.openNewConversation'));
    apri.type = 'button';
    apri.dataset.sessionId = fact.nuovaSessionId;
    apri.addEventListener('click', () => onApriSessione(fact.nuovaSessionId));
    ricevuta.append(apri);
  }
  const vecchia = section.querySelector?.('.talos-plan-artifact__choices, .talos-plan-artifact__receipt, .talos-plan-artifact__footer');
  if (vecchia) vecchia.replaceWith(ricevuta);
  else section.append(ricevuta);
  return true;
}
