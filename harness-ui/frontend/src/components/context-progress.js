import { descriviContextCompactor } from './context-compactor.js';
import { linguaCorrenteDiT } from './lingua.js';

const ACTIVE = new Set(['queued', 'preparing', 'summarizing', 'validating', 'ready']);
export function descriviAvanzamentoContesto(snapshot) {
  const view = descriviContextCompactor(snapshot);
  const job = view.job;
  const completed = job?.progress?.completed, total = job?.progress?.total;
  const determinate = job?.state === 'summarizing' && Number.isSafeInteger(completed) && Number.isSafeInteger(total) && total > 0 && completed >= 0 && completed <= total;
  return { job, label: view.jobLabel, visible: Boolean(job && job.state !== 'committed'), active: ACTIVE.has(job?.state), determinate, value: determinate ? completed : null, max: determinate ? total : null };
}

/** Progress belongs to the persisted job; only a committed version adds a separator. */
export function aggiornaAvanzamentoContesto(container, snapshot, { onOpen, stale = false } = {}) {
  if (!container) return;
  const view = descriviAvanzamentoContesto(snapshot);
  let row = container.querySelector('[data-context-chat-progress]');
  if (!view.visible) { row?.remove(); return; }
  const doc = container.ownerDocument, english = linguaCorrenteDiT() === 'en';
  if (!row || row.dataset.contextSession !== snapshot.sessionId) {
    row?.remove(); row = doc.createElement('section'); row.className = 'talos-context-chat-progress';
    row.dataset.contextChatProgress = ''; row.dataset.contextSession = snapshot.sessionId;
    const status = doc.createElement('span'); status.dataset.contextChatStatus = ''; status.setAttribute('role', 'status');
    const bar = doc.createElement('progress'); bar.className = 'talos-context__progress';
    const button = doc.createElement('button'); button.type = 'button'; button.className = 'talos-button talos-button--ghost talos-button--sm'; button.textContent = 'Context Manager'; button.addEventListener('click', () => onOpen?.());
    row.append(status, button, bar); container.append(row);
  }
  row.dataset.contextJob = view.job.id; row.dataset.contextState = view.job.state;
  const bar = row.querySelector('progress'); bar.hidden = !view.active;
  const text = stale ? (english ? 'Progress unavailable. Reconnecting…' : 'Avanzamento non disponibile. Riconnessione…') : view.label;
  row.querySelector('[data-context-chat-status]').textContent = text;
  bar.setAttribute('aria-label', english ? 'Context compaction' : 'Compattazione del contesto');
  if (view.determinate && !stale) {
    bar.max = view.max; bar.value = view.value;
    bar.setAttribute('aria-valuetext', english ? `${view.value} of ${view.max} segments` : `${view.value} di ${view.max} segmenti`);
  } else { bar.removeAttribute('value'); bar.removeAttribute('aria-valuetext'); }
  return row;
}
