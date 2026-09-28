/*
 * TALOS Graph Engineering R4 — mockup SOLO di laboratorio.
 * Inserito/refactor da ChatGPT / GPT-5.6 Sol su istruzione Owner, 22/09/2026.
 *
 * Autorità R4:
 * - Plan / Ask Question / Workflow sono tool, non tab/route/mode.
 * - Il grafo reale resta nella Chat centrale.
 * - #railAgenti resta launcher/list/status/detail e può adattarsi alla scala.
 * - Nessun dato di questa pagina è presentato come runtime production.
 */
import { montaGrafoAgenti } from '../src/components/grafo-agenti.js';
import { disegnaAgenti } from '../src/components/inspector.js';
import { creaDettaglioAgente } from '../src/components/dettaglio-agente.js';
import {
  ASK_FIXTURE,
  PLAN_FIXTURE,
  R4_ALL_SCENES,
  R4_PRIMARY_SCENES,
  R4_RAIL_VARIANTS,
  makeGraphFixture,
  makeRailFixture,
  sceneFixture,
} from './fixtures/workflow-r4.js';

export const WORKFLOW_SPEC_SCENE_NAMES = R4_ALL_SCENES;
export const WORKFLOW_SPEC_DEFAULT = 'baseline-chat';
export const WORKFLOW_R4_PRIMARY_SCENES = R4_PRIMARY_SCENES;

const LAB_NOTICE = 'Mockup R4 · fixture dichiarata · nessuna mutazione production';
const formatAgentCount = new Intl.NumberFormat('it-IT', { useGrouping: 'always' });

function el(d, tag, cls = '', text = null) {
  const node = d.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
}

function button(d, text, { cls = 'talos-button talos-button--secondary talos-button--sm', disabled = false, label = '' } = {}) {
  const b = el(d, 'button', cls, text);
  b.type = 'button';
  b.disabled = disabled;
  if (label) b.setAttribute('aria-label', label);
  return b;
}

function badge(d, text, tone = '') {
  return el(d, 'span', `talos-badge talos-badge--sm${tone ? ` talos-badge--${tone}` : ''}`, text);
}

function icon(d, id) {
  const svg = d.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'i');
  svg.setAttribute('aria-hidden', 'true');
  const use = d.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `#${id}`);
  svg.append(use);
  return svg;
}

function installStyle(d) {
  if (d.getElementById('workflow-r4-style')) return;
  const s = d.createElement('style');
  s.id = 'workflow-r4-style';
  s.textContent = `
#schermoChat.talos-grafo-aperto > .talos-topbar{visibility:visible;pointer-events:auto;position:relative;z-index:5}
#schermoChat.talos-grafo-aperto > .talos-grafo{top:var(--talos-topbar-h)}
.r4-lab-flag{display:flex;align-items:center;gap:8px;max-width:var(--talos-measure-w);margin:10px auto 0;padding:7px 10px;border:1px dashed var(--talos-border-strong);border-radius:9px;color:var(--talos-muted);font-size:11px;background:var(--talos-card-faint)}
.r4-lab-flag:before{content:"";width:7px;height:7px;border-radius:50%;background:var(--talos-warning);flex:0 0 auto}
.r4-turn{max-width:var(--talos-measure-w);margin:0 auto;width:100%;padding-inline:var(--talos-chat-gutter)}
.r4-artifact{border:1px solid var(--talos-border);border-radius:var(--talos-radius-card);background:var(--talos-card-faint);padding:16px;box-shadow:var(--talos-shadow-card)}
.r4-artifact__head{display:flex;gap:12px;align-items:flex-start;justify-content:space-between}
.r4-artifact__title{margin:2px 0 4px;font-size:16px;line-height:1.3}
.r4-artifact__meta{display:flex;gap:7px;align-items:center;flex-wrap:wrap;color:var(--talos-muted);font-size:11px}
.r4-artifact__body{display:grid;gap:10px;margin-top:14px}
.r4-artifact__section{border-top:1px solid var(--talos-border-subtle);padding-top:10px}
.r4-artifact__section h4{margin:0 0 6px;font-size:12px}.r4-artifact__section p{margin:0;color:var(--talos-muted);font-size:12px;line-height:1.5}
.r4-list{display:grid;gap:7px;margin:0;padding:0;list-style:none}.r4-list li{padding:8px 10px;border:1px solid var(--talos-border);border-radius:9px;background:var(--talos-panel-soft);font-size:12px}
.r4-list li[data-tone=warning]{border-color:var(--talos-warning-border);background:var(--talos-warning-soft)}
.r4-list li[data-tone=danger]{border-color:var(--talos-danger-border);background:var(--talos-danger-soft)}
.r4-artifact__actions{display:flex;gap:7px;justify-content:flex-end;flex-wrap:wrap;margin-top:14px}
.r4-ask{margin:0 0 10px;border:1px solid var(--talos-accent-border);border-radius:12px;background:color-mix(in srgb,var(--talos-panel) 90%,var(--talos-accent-soft));box-shadow:var(--talos-shadow-card);overflow:hidden}
.r4-ask[data-state=error-retry]{border-color:var(--talos-danger-border)}.r4-ask[data-state=stale]{border-color:var(--talos-border-strong);opacity:.85}
.r4-ask__head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:12px 14px;border-bottom:1px solid var(--talos-border-subtle)}
.r4-ask__head h3{margin:1px 0 2px;font-size:13px}.r4-ask__source{font-size:11px;color:var(--talos-muted)}
.r4-ask__progress{font:500 11px var(--talos-font-mono);color:var(--talos-muted);white-space:nowrap}
.r4-ask__body{padding:13px 14px;display:grid;gap:10px}.r4-ask__question{font-size:13px;line-height:1.45}
.r4-ask__options{display:grid;gap:7px}.r4-ask__option{display:grid;grid-template-columns:auto minmax(0,1fr);gap:9px;align-items:start;padding:9px 10px;border:1px solid var(--talos-border);border-radius:9px;background:var(--talos-card-faint);cursor:pointer}
.r4-ask__option:has(input:checked){border-color:var(--talos-accent);background:var(--talos-accent-soft)}
.r4-ask__other{width:100%;min-height:36px;border:1px solid var(--talos-border);border-radius:9px;background:var(--talos-panel);color:var(--talos-text);padding:8px 10px;font:inherit}
.r4-ask__tabs{display:flex;gap:5px;flex-wrap:wrap}.r4-ask__tab{border:1px solid var(--talos-border);border-radius:999px;background:transparent;color:var(--talos-muted);padding:5px 9px;font:inherit;font-size:11px}
.r4-ask__tab[aria-pressed=true]{background:var(--talos-accent-soft);border-color:var(--talos-accent-border);color:var(--talos-text)}
.r4-ask__review{display:grid;gap:8px}.r4-ask__review-row{padding:9px 10px;border:1px solid var(--talos-border);border-radius:9px;background:var(--talos-panel-soft)}
.r4-ask__review-row b{display:block;font-size:11px;margin-bottom:3px}.r4-ask__review-row span{font-size:12px;color:var(--talos-muted)}
.r4-ask__error{padding:8px 10px;border:1px solid var(--talos-danger-border);background:var(--talos-danger-soft);border-radius:9px;font-size:12px}
.r4-ask__foot{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:10px 14px;border-top:1px solid var(--talos-border-subtle)}
.r4-ask__foot-actions{display:flex;gap:7px;flex-wrap:wrap}
.r4-receipt{border-left:3px solid var(--talos-success);padding:12px 14px;background:var(--talos-card-faint);border-radius:0 10px 10px 0}
.r4-receipt__head{display:flex;align-items:center;gap:8px;margin-bottom:7px}.r4-receipt__q{font-size:12px;color:var(--talos-muted);margin-bottom:4px}.r4-receipt__a{font-size:13px}
.r4-rail-head{display:grid;gap:9px;margin-bottom:12px}.r4-rail-head__top{display:flex;align-items:center;justify-content:space-between;gap:8px}.r4-rail-head h3{margin:0;font-size:13px}
.r4-rail-search{width:100%;min-height:32px;border:1px solid var(--talos-border);border-radius:7px;background:var(--talos-panel);color:var(--talos-text);padding:5px 9px;font:inherit;font-size:12px}
.r4-summary{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}.r4-summary__item{padding:8px 9px;border:1px solid var(--talos-border);border-radius:9px;background:var(--talos-card-faint)}
.r4-summary__item b{display:block;font:600 14px var(--talos-font-mono)}.r4-summary__item span{font-size:10.5px;color:var(--talos-muted)}
.r4-rail-section{display:grid;gap:7px;margin-top:12px}.r4-rail-section__head{display:flex;align-items:center;justify-content:space-between;gap:8px}.r4-rail-section__head h4{margin:0;font-size:11.5px}.r4-rail-section__head span{font-size:10.5px;color:var(--talos-muted)}
.r4-attention,.r4-group,.r4-status-row{width:100%;text-align:left;border:1px solid var(--talos-border);border-radius:9px;background:var(--talos-card-faint);color:var(--talos-text);padding:9px 10px;font:inherit}
.r4-attention{border-color:var(--talos-warning-border);background:var(--talos-warning-soft)}.r4-attention b,.r4-group b,.r4-status-row b{display:block;font-size:11.5px}
.r4-attention small,.r4-group small,.r4-status-row small{display:block;color:var(--talos-muted);margin-top:3px;font-size:10.5px}
.r4-group__line{display:flex;align-items:center;justify-content:space-between;gap:8px}.r4-progress{height:4px;border-radius:99px;background:var(--talos-border-subtle);overflow:hidden;margin-top:7px}.r4-progress>span{display:block;height:100%;background:var(--talos-accent);width:var(--r4-progress)}
.r4-status-row{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:8px}.r4-status-dot{width:7px;height:7px;border-radius:50%;background:var(--talos-muted)}
.r4-status-dot[data-tone=active]{background:var(--talos-accent)}.r4-status-dot[data-tone=waiting]{background:var(--talos-warning)}.r4-status-dot[data-tone=error]{background:var(--talos-danger)}.r4-status-dot[data-tone=done]{background:var(--talos-success)}
.r4-variant-note{padding:8px 9px;border-radius:9px;background:var(--talos-panel-soft);font-size:10.5px;color:var(--talos-muted);line-height:1.45}
.r4-graph-note{margin:0 24px 6px;padding:8px 10px;border:1px dashed var(--talos-border-strong);border-radius:9px;color:var(--talos-muted);font-size:11px;background:var(--talos-card-faint)}
.r4-graph-alert{margin:0 24px 8px;display:flex;justify-content:space-between;align-items:center;gap:10px;padding:9px 10px;border:1px solid var(--talos-warning-border);border-radius:9px;background:var(--talos-warning-soft);font-size:11px}
.r4-a11y-note{max-width:var(--talos-measure-w);margin:10px auto;padding:10px 12px;border:1px solid var(--talos-info-border);border-radius:9px;background:var(--talos-info-soft);font-size:12px}
html[data-r4-reflow="200"]{font-size:200%}
@media(max-width:1240px){.r4-turn{padding-inline:20px}.r4-graph-note,.r4-graph-alert{margin-inline:16px}}
@media(prefers-reduced-motion:reduce){.r4-ask,.r4-artifact,.r4-attention,.r4-group{transition:none!important;animation:none!important}}
`;
  d.head.append(s);
}

function showChatShell(d) {
  d.documentElement.setAttribute('data-vista', 'sessione');
  d.documentElement.setAttribute('data-schermo', 'chat');
  for (const pane of d.querySelectorAll('#centro > .talos-screen')) pane.hidden = pane.id !== 'schermoChat';
  const screen = d.getElementById('schermoChat');
  screen.hidden = false;
  screen.classList.remove('talos-grafo-aperto');
  screen.querySelectorAll('[data-r4-generated]').forEach((n) => n.remove());
  const conversation = screen.querySelector('.talos-conversation');
  if (conversation) {
    conversation.hidden = false;
    conversation.style.visibility = '';
    conversation.style.pointerEvents = '';
  }
  const foot = screen.querySelector('.talos-chat-foot');
  if (foot) {
    foot.hidden = false;
    foot.style.visibility = '';
    foot.style.pointerEvents = '';
  }
  d.documentElement.style.removeProperty('font-size');
  delete d.documentElement.dataset.r4Reflow;
  return screen;
}

function selectAgentsRail(d) {
  const rail = d.getElementById('railAgenti');
  if (!rail) return null;
  rail.hidden = false;
  for (const tab of d.querySelectorAll('#railTabs [data-rail]')) {
    tab.setAttribute('aria-selected', String(tab.dataset.rail === 'agenti'));
  }
  for (const id of ['railContesto', 'railFile', 'railProcessi']) {
    const pane = d.getElementById(id);
    if (pane) pane.hidden = true;
  }
  return rail;
}

function prependLabFlag(d, screen, scene) {
  const conversation = screen.querySelector('.talos-conversation');
  if (!conversation) return;
  const flag = el(d, 'div', 'r4-lab-flag', `${LAB_NOTICE} · ${scene}`);
  flag.dataset.r4Generated = '';
  conversation.prepend(flag);
}

function addTurn(d, screen, node) {
  const column = screen.querySelector('.talos-conversation__column');
  if (!column) return;
  const turn = el(d, 'div', 'talos-turn r4-turn');
  turn.dataset.r4Generated = '';
  const spine = el(d, 'div', 'talos-turn-spine');
  const message = el(d, 'div', 'talos-message');
  message.append(node);
  turn.append(spine, message);
  column.append(turn);
}

function renderPlan(d, screen, state, plan = PLAN_FIXTURE) {
  const artifact = el(d, 'article', 'r4-artifact');
  artifact.dataset.r4Plan = state;
  const head = el(d, 'div', 'r4-artifact__head');
  const left = el(d, 'div');
  left.append(el(d, 'span', 'talos-eyebrow', state === 'approved' ? 'Piano approvato' : state === 'revised' ? 'Piano aggiornato' : 'Piano proposto'));
  left.append(el(d, 'h3', 'r4-artifact__title', plan.title));
  const meta = el(d, 'div', 'r4-artifact__meta');
  meta.append(badge(d, `v${plan.version}`, 'accent'), el(d, 'span', 'talos-mono', `hash ${plan.hash}`));
  if (state === 'approved') meta.append(badge(d, 'Approvato', 'success'));
  if (state === 'revised') meta.append(badge(d, 'Sostituisce v3', 'warning'));
  left.append(meta);
  const expander = button(d, state === 'expanded' ? 'Comprimi' : 'Apri piano', { cls: 'talos-button talos-button--ghost talos-button--sm' });
  head.append(left, expander);
  artifact.append(head);

  const body = el(d, 'div', 'r4-artifact__body');
  body.append(el(d, 'p', 'talos-muted', plan.objective));
  const acceptance = el(d, 'div', 'r4-artifact__section');
  acceptance.append(el(d, 'h4', '', 'Acceptance'));
  const list = el(d, 'ul', 'r4-list');
  for (const item of plan.acceptance) list.append(el(d, 'li', '', item));
  acceptance.append(list);
  body.append(acceptance);

  if (['warning', 'expanded', 'revised'].includes(state)) {
    const section = el(d, 'div', 'r4-artifact__section');
    section.append(el(d, 'h4', '', 'Avvisi'));
    const warnings = el(d, 'ul', 'r4-list');
    for (const item of plan.warnings) {
      const li = el(d, 'li', '', item);
      li.dataset.tone = 'warning';
      warnings.append(li);
    }
    section.append(warnings);
    body.append(section);
  }
  if (state === 'error') {
    const section = el(d, 'div', 'r4-artifact__section');
    section.append(el(d, 'h4', '', 'Errori bloccanti'));
    const errors = el(d, 'ul', 'r4-list');
    for (const item of plan.errors) {
      const li = el(d, 'li', '', item);
      li.dataset.tone = 'danger';
      errors.append(li);
    }
    section.append(errors);
    body.append(section);
  }
  if (state === 'expanded') {
    const section = el(d, 'div', 'r4-artifact__section');
    section.append(el(d, 'h4', '', 'Handoff all’esecuzione'));
    section.append(el(d, 'p', '', 'L’esecuzione deve riferirsi alla stessa versione/hash approvati; la UI mostra l’identità, non la inventa.'));
    body.append(section);
  }
  artifact.append(body);

  const actions = el(d, 'div', 'r4-artifact__actions');
  actions.append(button(d, 'Chiedi modifica', { cls: 'talos-button talos-button--ghost talos-button--sm' }));
  actions.append(button(d, 'Approva piano', {
    cls: 'talos-button talos-button--primary talos-button--sm',
    disabled: state === 'error' || state === 'approved',
  }));
  artifact.append(actions);
  expander.addEventListener('click', () => body.hidden = !body.hidden);
  if (!['expanded', 'warning', 'error', 'revised'].includes(state)) body.hidden = true;
  addTurn(d, screen, artifact);
}

function receiptNode(d, { question, answer, origin, status }, { elsewhere = false, skipped = false } = {}) {
  const receipt = el(d, 'article', 'r4-receipt');
  receipt.dataset.r4Receipt = '';
  const head = el(d, 'div', 'r4-receipt__head');
  head.append(badge(d, skipped ? 'Saltata' : status, skipped ? 'warning' : 'success'));
  head.append(el(d, 'span', 'talos-muted', elsewhere ? 'Risolta da un’altra finestra' : origin));
  receipt.append(head, el(d, 'div', 'r4-receipt__q', question), el(d, 'div', 'r4-receipt__a', skipped ? 'Nessuna risposta inviata.' : answer));
  return receipt;
}

function readAnswers(dock, questions) {
  const result = {};
  for (const q of questions) {
    const selected = [...dock.querySelectorAll(`[data-question-id="${q.id}"] input:checked`)].map((n) => n.value);
    const other = dock.querySelector(`[data-other-for="${q.id}"]`)?.value.trim();
    if (other) selected.push(other);
    result[q.id] = selected;
  }
  return result;
}

function renderAsk(d, screen, state, ask = ASK_FIXTURE) {
  if (state === 'resolved-receipt' || state === 'resolved-other-window') {
    addTurn(d, screen, receiptNode(d, ask.receipt, { elsewhere: state === 'resolved-other-window' }));
    return;
  }

  const foot = screen.querySelector('.talos-chat-foot');
  const composer = foot?.querySelector('#composerForm');
  if (!foot || !composer) return;
  const source = state.startsWith('multi') || state === 'submitting' || state === 'error-retry' || state === 'after-reload' ? ask.multi : ask.single;
  const dock = el(d, 'section', 'r4-ask');
  dock.dataset.r4Generated = '';
  dock.dataset.r4Ask = source.id;
  dock.dataset.state = state;
  dock.setAttribute('aria-label', 'Domanda di TALOS');

  const head = el(d, 'div', 'r4-ask__head');
  const copy = el(d, 'div');
  copy.append(el(d, 'h3', '', source.title), el(d, 'div', 'r4-ask__source', `${ask.source}${state === 'after-reload' ? ' · ripristinata dopo reload' : ''}`));
  const progress = el(d, 'span', 'r4-ask__progress', source.questions.length > 1 ? `1 / ${source.questions.length}` : '1 domanda');
  head.append(copy, progress);
  dock.append(head);

  let currentIndex = 0;
  let review = state === 'multi-review';
  const body = el(d, 'div', 'r4-ask__body');
  const footRow = el(d, 'div', 'r4-ask__foot');
  const hint = el(d, 'span', 'talos-muted', state === 'submitting' ? 'Invio in corso… selezioni preservate' : state === 'stale' ? 'Questa richiesta non accetta più risposte.' : 'La risposta resta collegata a questa richiesta.');
  const actions = el(d, 'div', 'r4-ask__foot-actions');

  const renderBody = () => {
    body.replaceChildren();
    if (state === 'stale') {
      body.append(el(d, 'div', 'r4-ask__error', 'Decisione non più attiva: il Workflow è cambiato. Una risposta tardiva non verrà collegata alla nuova richiesta.'));
      return;
    }
    if (review) {
      const summary = el(d, 'div', 'r4-ask__review');
      const answers = readAnswers(dock, source.questions);
      for (const q of source.questions) {
        const row = el(d, 'div', 'r4-ask__review-row');
        row.append(el(d, 'b', '', q.question), el(d, 'span', '', answers[q.id]?.length ? answers[q.id].join(', ') : 'Non risposta'));
        summary.append(row);
      }
      body.append(summary);
      return;
    }
    if (source.questions.length > 1) {
      const tabs = el(d, 'div', 'r4-ask__tabs');
      source.questions.forEach((q, i) => {
        const tab = button(d, `${i + 1}. ${i === 0 ? 'Verifiche' : 'Priorità'}`, { cls: 'r4-ask__tab' });
        tab.setAttribute('aria-pressed', String(i === currentIndex));
        tab.addEventListener('click', () => { currentIndex = i; renderBody(); });
        tabs.append(tab);
      });
      body.append(tabs);
    }
    const q = source.questions[currentIndex];
    const block = el(d, 'div');
    block.dataset.questionId = q.id;
    block.append(el(d, 'div', 'r4-ask__question', q.question));
    const options = el(d, 'div', 'r4-ask__options');
    q.options.forEach((option) => {
      const label = el(d, 'label', 'r4-ask__option');
      const input = d.createElement('input');
      input.type = q.multi ? 'checkbox' : 'radio';
      input.name = `r4-${source.id}-${q.id}`;
      input.value = option;
      label.append(input, el(d, 'span', '', option));
      options.append(label);
    });
    block.append(options);
    if (q.other) {
      const other = el(d, 'input', 'r4-ask__other');
      other.type = 'text';
      other.placeholder = 'Altro…';
      other.setAttribute('aria-label', 'Altra risposta');
      other.dataset.otherFor = q.id;
      block.append(other);
    }
    body.append(block);
    progress.textContent = source.questions.length > 1 ? `${currentIndex + 1} / ${source.questions.length}` : '1 domanda';
  };

  const goBack = button(d, 'Indietro', { cls: 'talos-button talos-button--ghost talos-button--sm' });
  const skip = button(d, 'Salta', { cls: 'talos-button talos-button--ghost talos-button--sm', disabled: state === 'submitting' || state === 'stale' });
  const primary = button(d, source.questions.length > 1 ? (review ? 'Invia risposte' : 'Rivedi risposte') : 'Invia risposta', {
    cls: 'talos-button talos-button--primary talos-button--sm',
    disabled: state === 'submitting' || state === 'stale',
  });
  goBack.hidden = !review;
  actions.append(goBack, skip, primary);
  footRow.append(hint, actions);

  if (state === 'error-retry') {
    body.append(el(d, 'div', 'r4-ask__error', 'La risposta non è stata registrata. Selezioni e bozza restano qui.'));
    primary.textContent = 'Riprova invio';
  }

  goBack.addEventListener('click', () => {
    review = false;
    goBack.hidden = true;
    primary.textContent = 'Rivedi risposte';
    renderBody();
  });
  primary.addEventListener('click', () => {
    if (state === 'error-retry') {
      hint.textContent = 'Riprova simulata nel mockup · nessuna rete chiamata.';
      return;
    }
    if (source.questions.length > 1 && !review) {
      review = true;
      goBack.hidden = false;
      primary.textContent = 'Invia risposte';
      renderBody();
      return;
    }
    const answers = readAnswers(dock, source.questions);
    const answer = Object.values(answers).flat().filter(Boolean).join(', ') || 'Nessuna risposta';
    addTurn(d, screen, receiptNode(d, {
      question: source.questions.map((q) => q.question).join(' · '),
      answer,
      origin: ask.source,
      status: 'Risposta registrata',
    }));
    dock.remove();
  });
  skip.addEventListener('click', () => {
    addTurn(d, screen, receiptNode(d, {
      question: source.questions.map((q) => q.question).join(' · '),
      answer: '',
      origin: ask.source,
      status: 'Saltata',
    }, { skipped: true }));
    dock.remove();
  });

  dock.append(body, footRow);
  composer.before(dock);
  renderBody();
  if (state === 'multi-review') {
    source.questions.forEach((q, idx) => {
      const first = dock.querySelector(`[data-question-id="${q.id}"] input`);
      if (first) first.checked = true;
      if (idx === source.questions.length - 1) review = true;
    });
    review = true;
    goBack.hidden = false;
    primary.textContent = 'Invia risposte';
    renderBody();
  }
}

function statusLabel(key) {
  return {
    active: ['In corso', 'active'],
    waiting: ['In attesa', 'waiting'],
    error: ['Errori', 'error'],
    done: ['Terminati', 'done'],
  }[key] || [key, key];
}

function railHeader(d, railEl, data, variant, onGraph) {
  const head = el(d, 'div', 'r4-rail-head');
  const top = el(d, 'div', 'r4-rail-head__top');
  top.append(el(d, 'h3', '', 'Agenti della sessione'));
  const graph = button(d, 'Apri diagramma', { cls: 'talos-button talos-button--ghost talos-button--sm' });
  graph.addEventListener('click', onGraph);
  top.append(graph);
  const search = el(d, 'input', 'r4-rail-search');
  search.type = 'search';
  search.placeholder = 'Cerca agenti, gruppi o stato…';
  search.setAttribute('aria-label', 'Cerca agenti');
  head.append(top, search);
  if (variant) head.append(el(d, 'div', 'r4-variant-note', `Proposta R4: ${variant} · ${formatAgentCount.format(data.count)} agenti logici · fixture da confrontare con l’Owner.`));
  railEl.append(head);
  return search;
}

function openRealDetail(d, railEl, agent, back, openGraph) {
  const detail = creaDettaglioAgente(agent, {
    document: d,
    eta: () => '6 min',
    azioni: {
      indietro: back,
      apriFile: () => {},
      apriGrafo: () => openGraph(agent),
    },
  });
  railEl.replaceChildren(detail.elemento);
}

function renderStatusFirst(d, railEl, data, openGraph) {
  const redraw = () => renderRailVariant(d, railEl, 'status-first', data, openGraph);
  railHeader(d, railEl, data, 'status-first', () => openGraph());
  const summary = el(d, 'div', 'r4-rail-section');
  const head = el(d, 'div', 'r4-rail-section__head');
  head.append(el(d, 'h4', '', 'Stato del lavoro'), el(d, 'span', '', 'prima le eccezioni'));
  summary.append(head);
  for (const key of ['error', 'waiting', 'active', 'done']) {
    const [label, tone] = statusLabel(key);
    const row = button(d, '', { cls: 'r4-status-row' });
    row.append(el(d, 'span', 'r4-status-dot'));
    row.firstChild.dataset.tone = tone;
    row.append(el(d, 'b', '', label), el(d, 'span', 'talos-mono', formatAgentCount.format(data.counts[key] || 0)));
    summary.append(row);
  }
  railEl.append(summary);
  if (data.attention.length) {
    const section = el(d, 'div', 'r4-rail-section');
    const h = el(d, 'div', 'r4-rail-section__head');
    h.append(el(d, 'h4', '', 'Richiedono attenzione'), el(d, 'span', '', `${data.attention.length} in evidenza`));
    section.append(h);
    for (const item of data.attention) {
      const b = button(d, '', { cls: 'r4-attention' });
      b.append(el(d, 'b', '', item.title), el(d, 'small', '', item.reason));
      const agent = data.agents.find((a) => a.sessionId === item.id);
      if (agent) b.addEventListener('click', () => openRealDetail(d, railEl, agent, redraw, openGraph));
      section.append(b);
    }
    railEl.append(section);
  }
}

function renderGroupFirst(d, railEl, data, openGraph) {
  const redraw = () => renderRailVariant(d, railEl, 'group-first', data, openGraph);
  railHeader(d, railEl, data, 'group-first', () => openGraph());
  const section = el(d, 'div', 'r4-rail-section');
  const h = el(d, 'div', 'r4-rail-section__head');
  h.append(el(d, 'h4', '', 'Fasi del Workflow'), el(d, 'span', '', `${data.groups.length} gruppi`));
  section.append(h);
  for (const group of data.groups) {
    const b = button(d, '', { cls: 'r4-group' });
    const line = el(d, 'div', 'r4-group__line');
    line.append(el(d, 'b', '', group.name), el(d, 'span', 'talos-mono', formatAgentCount.format(group.total)));
    b.append(line, el(d, 'small', '', `${formatAgentCount.format(group.active)} attivi · ${formatAgentCount.format(group.attention)} richiedono attenzione · ${group.progress}% completato`));
    const bar = el(d, 'div', 'r4-progress');
    const fill = el(d, 'span');
    fill.style.setProperty('--r4-progress', `${group.progress}%`);
    bar.append(fill);
    b.append(bar);
    b.addEventListener('click', () => {
      const sample = data.agents.find((a) => a.taskCorto?.includes(group.name)) || data.agents[0];
      if (sample) openRealDetail(d, railEl, sample, redraw, openGraph);
    });
    section.append(b);
  }
  railEl.append(section);
}

function renderHybrid(d, railEl, data, openGraph) {
  const redraw = () => renderRailVariant(d, railEl, 'hybrid', data, openGraph);
  railHeader(d, railEl, data, 'hybrid', () => openGraph());
  if (data.attention.length) {
    const attention = el(d, 'div', 'r4-rail-section');
    const h = el(d, 'div', 'r4-rail-section__head');
    h.append(el(d, 'h4', '', 'Serve te'), el(d, 'span', '', 'prima delle metriche'));
    attention.append(h);
    for (const item of data.attention.slice(0, 3)) {
      const b = button(d, '', { cls: 'r4-attention' });
      b.append(el(d, 'b', '', item.title), el(d, 'small', '', item.reason));
      const agent = data.agents.find((a) => a.sessionId === item.id);
      if (agent) b.addEventListener('click', () => openRealDetail(d, railEl, agent, redraw, openGraph));
      attention.append(b);
    }
    railEl.append(attention);
  }
  const summary = el(d, 'div', 'r4-summary');
  for (const key of ['active', 'waiting', 'error', 'done']) {
    const [label] = statusLabel(key);
    const item = el(d, 'div', 'r4-summary__item');
    item.append(el(d, 'b', '', formatAgentCount.format(data.counts[key] || 0)), el(d, 'span', '', label));
    summary.append(item);
  }
  railEl.append(summary);
  const groups = el(d, 'div', 'r4-rail-section');
  const h = el(d, 'div', 'r4-rail-section__head');
  h.append(el(d, 'h4', '', 'Gruppi'), el(d, 'span', '', 'drill-down'));
  groups.append(h);
  for (const group of data.groups) {
    const b = button(d, '', { cls: 'r4-group' });
    const line = el(d, 'div', 'r4-group__line');
    line.append(el(d, 'b', '', group.name), el(d, 'span', 'talos-mono', formatAgentCount.format(group.total)));
    b.append(line, el(d, 'small', '', `${formatAgentCount.format(group.active)} attivi · ${group.progress}% completato`));
    groups.append(b);
  }
  railEl.append(groups);
}

function renderRailVariant(d, railEl, variant, data, openGraph) {
  railEl.replaceChildren();
  railEl.dataset.r4Variant = variant;
  if (variant === 'status-first') renderStatusFirst(d, railEl, data, openGraph);
  else if (variant === 'group-first') renderGroupFirst(d, railEl, data, openGraph);
  else renderHybrid(d, railEl, data, openGraph);
}

function renderCurrentRail(d, railEl, data, openGraph) {
  const three = data.agents.slice(0, 3);
  disegnaAgenti(d, railEl, three, {
    sessionId: 'r4-current',
    onGrafo: () => openGraph(),
    onApri: (agent) => openRealDetail(d, railEl, agent, () => renderCurrentRail(d, railEl, data, openGraph), openGraph),
    onMenu: () => {},
  });
}

function renderGraph(d, screen, graph, state, railEl) {
  screen.querySelectorAll('[data-r4-generated]').forEach((n) => n.remove());
  screen.classList.add('talos-grafo-aperto');
  let controller = null;
  const close = () => {
    controller?.distruggi();
    screen.classList.remove('talos-grafo-aperto');
    const conversation = screen.querySelector('.talos-conversation');
    if (conversation) conversation.style.visibility = '';
    const foot = screen.querySelector('.talos-chat-foot');
    if (foot) foot.style.visibility = '';
  };
  const openAgent = (agent) => {
    if (!railEl || !agent?.sessionId) return;
    openRealDetail(d, railEl, agent, () => {
      const fixture = makeRailFixture(Math.min(graph.logicalCount, 300));
      renderHybrid(d, railEl, fixture, () => {});
    }, (target) => controller?.seleziona(target?.sessionId));
  };
  controller = montaGrafoAgenti(screen, {
    dati: graph.data,
    onApri: openAgent,
    onChiudi: close,
    onAggiorna: () => {},
    onLeggiFile: async (_agent, path) => `// Fixture R4\n// ${path}\n// Nessun file production viene letto dal mockup.`,
    storage: { getItem: () => null, setItem: () => {} },
  });
  const root = controller.elemento;
  const top = root.querySelector('.talos-grafo__cima');
  const note = el(d, 'div', 'r4-graph-note');
  note.dataset.r4Generated = '';
  note.textContent = graph.bounded
    ? `Fixture R4 bounded: ${formatAgentCount.format(graph.logicalCount)} agenti logici → ${formatAgentCount.format(graph.renderedCount)} proxy visuali nel renderer reale. Nessun flood di migliaia di card DOM.`
    : `Fixture R4: ${formatAgentCount.format(graph.logicalCount)} agenti logici renderizzati attraverso il vero montaGrafoAgenti().`;
  top?.after(note);
  if (state === 'pending-question') {
    const alert = el(d, 'div', 'r4-graph-alert');
    alert.dataset.r4Generated = '';
    alert.append(el(d, 'span', '', '1 decisione umana sta bloccando parte del Workflow.'));
    const open = button(d, 'Apri domanda', { cls: 'talos-button talos-button--secondary talos-button--sm' });
    open.addEventListener('click', () => {
      close();
      renderAsk(d, screen, 'single', ASK_FIXTURE);
      screen.querySelector('.r4-ask input, .r4-ask button')?.focus();
    });
    alert.append(open);
    note.after(alert);
  }
  if (['disconnected', 'resync', 'reload', 'error'].includes(state)) {
    const alert = el(d, 'div', 'r4-graph-alert');
    alert.dataset.r4Generated = '';
    const text = {
      disconnected: 'Aggiornamenti in pausa: il Workflow continua, questa vista sta cercando di riallinearsi.',
      resync: 'Riallineamento in corso: proiezione congelata finché arriva uno snapshot coerente.',
      reload: 'Vista ripristinata dopo reload: filtri e contesto devono restare coerenti con la sessione.',
      error: 'Dati non aggiornati: il grafo conserva l’ultimo snapshot verificato e rende visibile l’errore.',
    }[state];
    alert.append(el(d, 'span', '', text));
    note.after(alert);
  }
  return controller;
}

function renderAccessibility(d, screen, state, railEl) {
  const fixture = makeRailFixture(30);
  renderHybrid(d, railEl, fixture, () => {});
  const note = el(d, 'div', 'r4-a11y-note');
  note.dataset.r4Generated = '';
  const copy = {
    keyboard: 'Scenario tastiera: focus iniziale sulla ricerca Agenti; tutte le azioni principali devono restare raggiungibili senza puntatore.',
    'reduced-motion': 'Scenario reduced motion: nessuna informazione dipende dall’animazione; stati e focus restano leggibili staticamente.',
    'long-labels': 'Scenario label estese: compiti, gruppi e stati lunghi devono andare a capo senza collisioni o overflow.',
    '200-percent-reflow': 'Scenario 200% reflow: la shell deve restare usabile senza scroll orizzontale della pagina.',
  }[state];
  note.textContent = copy;
  screen.querySelector('.talos-conversation')?.prepend(note);
  if (state === 'keyboard') railEl.querySelector('input')?.focus();
  if (state === 'long-labels') {
    const group = railEl.querySelector('.r4-group b');
    if (group) group.textContent = 'Implementazione · validazione delle dipendenze, sicurezza, replay e riconciliazione del risultato prima dell’integrazione';
  }
  if (state === '200-percent-reflow') d.documentElement.dataset.r4Reflow = '200';
}

/*
 * Integrazione 23/09/2026 (sessione Claude): la riscrittura R4 di questo file aveva
 * tolto le cinque esportazioni di revisione che il ramo backend usa in
 * `lab/main.js`, `playwright.workflow-review.config.mjs` e nei due test
 * `workflow-spec-review`. Riportate qui adattate alle scene R4, senza cambiare la
 * loro forma: owner 18/09 e 22/09, baseline reali 1080p e 1440p nei due temi.
 */
export const WORKFLOW_SPEC_REVIEW_VIEWPORTS = Object.freeze([
  Object.freeze({ name: '1080p', width: 1920, height: 1080 }),
  Object.freeze({ name: '1440p', width: 2560, height: 1440 }),
]);
export const WORKFLOW_SPEC_REVIEW_THEMES = Object.freeze(['light', 'dark']);

export function workflowSpecThemeFromLocation(loc = globalThis.location) {
  const value = new URLSearchParams(loc?.search || '').get('tema');
  return WORKFLOW_SPEC_REVIEW_THEMES.includes(value) ? value : 'light';
}

export function workflowSpecUrl({ sceneId = WORKFLOW_SPEC_DEFAULT, theme = 'light' } = {}) {
  if (!WORKFLOW_SPEC_SCENE_NAMES.includes(sceneId)) throw new Error(`scena WorkflowSpec non valida: ${sceneId}`);
  if (!WORKFLOW_SPEC_REVIEW_THEMES.includes(theme)) throw new Error(`tema WorkflowSpec non valido: ${theme}`);
  return `/?componente=WorkflowSpec&scena=${encodeURIComponent(sceneId)}&tema=${theme}`;
}

export function workflowSpecInspectionSessions() {
  return Object.freeze(WORKFLOW_SPEC_SCENE_NAMES.map((sceneId, index) => Object.freeze({
    sessionId: `wf0a-review:${sceneId}`,
    sceneId,
    nome: `R4 ${String(index + 1).padStart(2, '0')} · ${sceneId}`,
    conclusa: false,
    interrotta: false,
    inAttesaApprovazione: sceneFixture(sceneId)?.kind === 'ask',
    ultimoEsito: null,
    modello: 'fixture/workflow-spec',
    avviataAlle: `2026-09-22T${String(8 + (Math.floor(index / 4) % 16)).padStart(2, '0')}:${String((index % 4) * 15).padStart(2, '0')}:00+02:00`,
    usage: { giri: index + 1 },
  })));
}

export function workflowSpecSceneFromLocation(loc = globalThis.location) {
  const value = new URLSearchParams(loc?.search || '').get('scena');
  return WORKFLOW_SPEC_SCENE_NAMES.includes(value) ? value : WORKFLOW_SPEC_DEFAULT;
}

export function montaWorkflowSpec({ scena = WORKFLOW_SPEC_DEFAULT } = {}) {
  const d = document;
  installStyle(d);
  const screen = showChatShell(d);
  d.documentElement.dataset.workflowSpecScene = scena;
  const fixture = sceneFixture(scena);
  const railEl = selectAgentsRail(d);
  prependLabFlag(d, screen, scena);

  const openGraph = (logicalCount = 14) => {
    const graph = logicalCount >= 5000 ? makeGraphFixture(5000, { proxyCount: 48 }) : makeGraphFixture(logicalCount);
    return renderGraph(d, screen, graph, 'normal', railEl);
  };

  if (fixture.kind === 'plan') {
    renderPlan(d, screen, fixture.state, fixture.plan);
    if (railEl) renderCurrentRail(d, railEl, makeRailFixture(3), () => openGraph(14));
  } else if (fixture.kind === 'ask') {
    renderAsk(d, screen, fixture.state, fixture.ask);
    if (railEl) renderCurrentRail(d, railEl, makeRailFixture(3), () => openGraph(14));
  } else if (fixture.kind === 'rail-current') {
    if (railEl) renderCurrentRail(d, railEl, fixture.rail, () => openGraph(14));
  } else if (fixture.kind === 'rail') {
    if (railEl) renderRailVariant(d, railEl, fixture.variant, fixture.rail, () => openGraph(Math.min(fixture.rail.count, 5000)));
  } else if (fixture.kind === 'graph') {
    if (railEl) renderHybrid(d, railEl, makeRailFixture(Math.min(fixture.graph.logicalCount, 300)), () => {});
    renderGraph(d, screen, fixture.graph, fixture.state, railEl);
  } else if (fixture.kind === 'accessibility') {
    if (railEl) renderAccessibility(d, screen, fixture.state, railEl);
  } else {
    if (railEl) renderCurrentRail(d, railEl, makeRailFixture(3), () => openGraph(14));
  }

  d.documentElement.dataset.visualReady = 'true';
  return { scena, fixture };
}
