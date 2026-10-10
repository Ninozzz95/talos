import { linguaCorrenteDiT, t } from './lingua.js';

/* Le chiavi dei testi di stato: la lingua si risolve al momento dell'uso, non al caricamento del modulo. */
const STATUS = Object.freeze({
  created: 'agenti.history.status.created', running: 'agenti.history.status.running', paused: 'agenti.history.status.paused',
  needs_attention: 'agenti.history.status.needsAttention', succeeded: 'agenti.history.status.succeeded',
  failed: 'agenti.history.status.failed', cancelled: 'agenti.history.status.cancelled',
  succeeded_with_set_aside: 'agenti.history.status.succeededWithSetAside',
});
const localeUI = () => (linguaCorrenteDiT() === 'en' ? 'en-US' : 'it-IT');

/** Cronologia dei run della sola sessione corrente; l'ID esatto viene passato alla Board. */
export function montaCronologiaWorkflow(contenitore, { fetchFn, sessionId, onApri } = {}) {
  const doc = contenitore.ownerDocument;
  const element = (tag, cls, value) => {
    const node = doc.createElement(tag);
    if (cls) node.className = cls;
    if (value != null) node.textContent = value;
    return node;
  };
  const root = element('section', 'talos-wfh');
  root.setAttribute('aria-label', t('agenti.history.title'));
  const title = element('h3', 'talos-wfh__title', t('agenti.history.title'));
  const controls = element('div', 'talos-wfh__controls');
  const search = element('input', 'talos-wfh__search');
  search.type = 'search'; search.placeholder = t('agenti.history.searchPlaceholder'); search.setAttribute('aria-label', t('agenti.history.searchPlaceholder'));
  const status = element('select', 'talos-wfh__status'); status.setAttribute('aria-label', t('agenti.history.statusFilter'));
  for (const [value, chiave] of [['', 'agenti.history.allStatuses'], ...Object.entries(STATUS)]) {
    const option = element('option', null, t(chiave)); option.value = value; status.append(option);
  }
  controls.append(search, status);
  const list = element('ul', 'talos-wfh__list');
  const more = element('button', 'talos-wfh__more', t('agenti.history.showMore')); more.type = 'button'; more.hidden = true;
  const message = element('p', 'talos-wfh__message'); message.setAttribute('role', 'status');
  root.append(title, controls, list, more, message);
  contenitore.append(root);

  let dead = false; let generation = 0; let offset = 0; let nextOffset = null; let busy = false;
  const limit = 20;
  function row(run) {
    const li = element('li', 'talos-wfh__row');
    const button = element('button', 'talos-wfh__open'); button.type = 'button';
    const valid = typeof run.runId === 'string' && run.runId.length > 0
      && typeof run.workflowId === 'string' && run.workflowId.length > 0
      && Number.isSafeInteger(run.version) && run.version > 0;
    button.disabled = !valid;
    const label = element('span', 'talos-wfh__label', typeof run.title === 'string' && run.title ? run.title : t('agenti.history.untitled'));
    const state = element('span', 'talos-wfh__state', t(STATUS[run.status] ?? 'agenti.history.status.unknown'));
    const detail = element('span', 'talos-wfh__detail');
    const facts = [run.runId];
    if (run.createdAt) facts.push(new Date(run.createdAt).toLocaleString(localeUI()));
    if (Number.isFinite(run.durationMs) && run.durationMs >= 0) facts.push(`${Math.round(run.durationMs / 1000)} s`);
    if (Number.isSafeInteger(run.steps?.total)) facts.push(t('agenti.history.stepsProgress', { fatti: run.steps.terminal ?? 0, totale: run.steps.total }));
    if (run.model && run.model !== 'unknown') facts.push(run.model === 'mixed' ? t('agenti.history.mixedModels') : run.model);
    detail.textContent = facts.join(' · ');
    button.append(label, state, detail);
    if (valid) button.addEventListener('click', () => onApri?.({ runId: run.runId, workflowId: run.workflowId, version: run.version }));
    li.append(button);
    return li;
  }
  async function load({ append = false } = {}) {
    if (dead || busy) return;
    busy = true;
    const current = ++generation;
    if (!append) { offset = 0; nextOffset = null; list.replaceChildren(); }
    more.hidden = true;
    message.textContent = t('agenti.history.loading');
    try {
      const params = new URLSearchParams({ offset: String(offset), limit: String(limit) });
      if (status.value) params.set('stato', status.value);
      const q = search.value?.trim();
      if (q) params.set('q', q.slice(0, 256));
      const response = await fetchFn(`/api/v1/sessions/${encodeURIComponent(sessionId)}/workflows?${params}`);
      const envelope = await response.json();
      if (!response.ok || envelope?.ok !== true || !Array.isArray(envelope.data?.items)) throw new Error('lettura fallita');
      if (dead || current !== generation) return;
      const page = envelope.data;
      list.append(...page.items.map(row));
      nextOffset = Number.isSafeInteger(page.nextOffset) && page.nextOffset > offset ? page.nextOffset : null;
      more.hidden = nextOffset === null;
      message.textContent = list.children.length === 0 ? t('agenti.history.noMatches') : '';
    } catch {
      if (!dead && current === generation) {
        message.textContent = t('agenti.history.loadFailed');
        more.hidden = nextOffset === null;
      }
    } finally { if (current === generation) busy = false; }
  }
  const refresh = () => { if (!dead) { generation++; busy = false; return load(); } };
  let debounce = null;
  search.addEventListener('input', () => { clearTimeout(debounce); debounce = setTimeout(refresh, 180); });
  status.addEventListener('change', refresh);
  more.addEventListener('click', () => { if (nextOffset !== null) { offset = nextOffset; void load({ append: true }); } });
  void load();
  return {
    elemento: root,
    aggiorna: refresh,
    distruggi() { if (dead) return; dead = true; generation++; clearTimeout(debounce); root.remove(); },
  };
}
