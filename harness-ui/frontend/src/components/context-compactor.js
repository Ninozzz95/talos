import { preparaMisuraDialogo, collegaRidimensionamentoDialoghi } from './dialoghi.js';
import { t, linguaCorrenteDiT, EVENTO_LINGUA } from './lingua.js';

const ACTIVE = new Set(['queued', 'preparing', 'summarizing', 'validating', 'ready', 'paused']);
const JOB_LABELS = { queued: 'In attesa', preparing: 'Preparazione', summarizing: 'Compattazione contesto in corso', validating: 'Verifica della sintesi', ready: 'Pubblicazione in corso', committed: 'Contesto aggiornato', paused: 'Compattazione in pausa', cancelled: 'Compattazione annullata', failed: 'Compattazione non riuscita' };
const EN = {
  'Apri una conversazione per gestirne il contesto.': 'Open a conversation to manage its context.',
  'Context Manager non è ancora attivo per questa conversazione. Nessun messaggio è stato modificato.': 'Context Manager is not enabled for this conversation yet. No messages have been changed.',
  'Contesto della chat': 'Chat context', 'Solo questa chat. Gli originali restano disponibili.': 'This chat only. Original messages remain available.',
  'Chiudi': 'Close', 'Aggiorna': 'Refresh', 'Gestisci automaticamente': 'Manage automatically', 'TALOS prepara una sintesi quando il contesto si riempie.': 'TALOS prepares a summary as the context fills up.',
  'Misura non ancora disponibile.': 'Measurement is not available yet.', 'misurata alle': 'measured at', 'il contesto è cambiato dopo la misura': 'the context changed after this measurement', 'Token in ingresso': 'Input tokens', 'Finestra del modello': 'Model context window', 'Riservati alla risposta': 'Reserved for the response', 'Non disponibile': 'Not available',
  'Conteggio del motore': 'Runtime count', 'Conteggio del fornitore': 'Provider count', 'Stima euristica': 'Heuristic estimate', 'esatto': 'exact', 'stima': 'estimate',
  'In attesa': 'Queued', 'Preparazione': 'Preparing', 'Compattazione contesto in corso': 'Context compaction in progress', 'Verifica della sintesi': 'Validating summary', 'Pubblicazione in corso': 'Publishing', 'Contesto aggiornato': 'Context updated', 'Compattazione in pausa': 'Compaction paused', 'Compattazione annullata': 'Compaction cancelled', 'Compattazione non riuscita': 'Compaction failed',
  'Nessuna compattazione in corso.': 'No compaction in progress.', 'Caricamento del contesto…': 'Loading context…', 'Annulla compattazione': 'Cancel compaction', 'Riprendi compattazione': 'Resume compaction', 'Compatta ora': 'Compact now', 'Rigenera sintesi': 'Regenerate summary',
  'Da non dimenticare': 'Keep in mind', 'Questi fatti restano separati dalla sintesi.': 'These facts remain separate from the summary.', 'Nessun fatto protetto. Aggiungi ciò che TALOS deve conservare.': 'No protected facts. Add what TALOS must retain.', 'Aggiungi un fatto': 'Add a fact', 'Salva fatto': 'Save fact', 'Annulla modifica': 'Cancel edit', 'Modifica': 'Edit', 'Rimuovi': 'Remove', 'Proposta da verificare': 'Proposal to review', 'Accetta proposta': 'Accept proposal', 'Mantieni il fatto': 'Keep the fact',
  'Versioni': 'Versions', 'Nessuna versione salvata.': 'No saved versions.', 'Versione attiva': 'Active version', 'Ripristina': 'Restore', 'Ripristinare questa versione? I messaggi successivi restano nella chat.': 'Restore this version? Later messages stay in the chat.', 'Conferma ripristino': 'Confirm restore', 'Annulla': 'Cancel', 'Fonti': 'Sources', 'Apri fonte': 'Open source', 'Nessuna fonte nella sintesi attiva.': 'No sources in the active summary.', 'Fonte originale': 'Original source',
  'Impostazioni avanzate': 'Advanced settings', 'Modello per la sintesi': 'Summary model', 'Segui il modello della chat': 'Follow the chat model', 'Scegli un modello': 'Choose a model', 'Fornitore': 'Provider', 'Modello': 'Model', 'Avvia automaticamente al (%)': 'Start automatically at (%)', 'Obiettivo dopo la sintesi (%)': 'Target after summary (%)', 'Scambi recenti da conservare': 'Recent turns to retain', 'Istruzioni per la sintesi': 'Summary instructions', 'Ricerca semantica locale': 'Local semantic search', 'Compattazione nativa qualificata': 'Qualified native compaction', 'Non qualificata per questo modello.': 'Not qualified for this model.', 'Salva impostazioni': 'Save settings', 'L’obiettivo deve essere inferiore alla soglia di avvio.': 'The target must be below the start threshold.',
  'Il contesto è cambiato. I dati sono aggiornati: verifica e ripeti la modifica.': 'The context changed. Data is refreshed: review and repeat your change.', 'Contesto non disponibile. Usa Aggiorna per riprovare.': 'Context unavailable. Use Refresh to retry.', 'Operazione non riuscita. Usa Aggiorna per verificare lo stato prima di riprovare.': 'Operation failed. Use Refresh to check the state before trying again.', 'Impostazioni salvate.': 'Settings saved.', 'Fatto salvato.': 'Fact saved.', 'Ricerca semantica non disponibile. La ricerca testuale resta attiva.': 'Semantic search unavailable. Text search remains active.', 'Ricerca semantica disponibile.': 'Semantic search available.', 'Completati': 'Completed', 'di': 'of',
};
EN['Non ci sono scambi precedenti da compattare mantenendo intero l’ultimo scambio. Nessun messaggio è stato modificato.'] = 'There are no earlier exchanges to compact while keeping the latest exchange intact. No messages were changed.';
function translateDefault(text) { return linguaCorrenteDiT() === 'en' ? (EN[text] ?? t(text)) : t(text); }
const number = v => typeof v === 'number' && Number.isFinite(v) && v >= 0;

export function descriviContextCompactor(state, { translate = translateDefault } = {}) {
  // 09/09 — la misura arriva dallo stato come {revision, measuredAt, tokens}: i numeri stanno in `tokens`,
  //   e la revisione dice se il contesto è cambiato DOPO la misura. Una misura vecchia non si spaccia per viva.
  const meta = state?.measurement && typeof state.measurement === 'object' ? state.measurement : null;
  // forma piatta (stati e fixture precedenti al 09/09): i numeri valgono, ma senza revisione né ora
  //   non si afferma nulla su quanto siano freschi — niente «cambiato dopo», niente «misurata alle»
  const m = meta?.tokens ?? (number(meta?.inputTokens) ? meta : null);
  const known = number(m?.inputTokens) && number(m?.windowTokens) && m.windowTokens > 0;
  const current = known && (meta?.tokens ? Number.isSafeInteger(meta?.revision) && meta.revision === state?.revision : false);
  const dichiaraFreschezza = Boolean(meta?.tokens);
  const oraMisura = known && typeof meta?.measuredAt === 'string' && !Number.isNaN(Date.parse(meta.measuredAt))
    ? new Date(meta.measuredAt).toLocaleTimeString(linguaCorrenteDiT() === 'en' ? 'en-GB' : 'it-IT', { hour: '2-digit', minute: '2-digit' }) : null;
  const exact = m?.exact === true && m?.method !== 'heuristic';
  const method = m?.method === 'runtime' ? 'Conteggio del motore' : m?.method === 'provider' ? 'Conteggio del fornitore' : m?.method === 'heuristic' ? 'Stima euristica' : 'Non disponibile';
  const jobs = Array.isArray(state?.jobs) ? state.jobs : [];
  const job = jobs.find(j => ACTIVE.has(j.state)) ?? [...jobs].sort((a, b) => String(b.updatedAt ?? b.createdAt).localeCompare(String(a.updatedAt ?? a.createdAt)))[0] ?? null;
  return {
    measurement: { known, inputTokens: number(m?.inputTokens) ? m.inputTokens : null, windowTokens: number(m?.windowTokens) ? m.windowTokens : null, responseReserve: number(m?.responseReserve) ? m.responseReserve : null,
      ratio: known ? m.inputTokens / m.windowTokens : null, exact, current, measuredAt: meta?.measuredAt ?? null,
      methodLabel: `${translate(method)}${known && m?.method !== 'heuristic' ? ` (${translate(exact ? 'esatto' : 'stima')})` : ''}${oraMisura ? ` · ${translate('misurata alle')} ${oraMisura}` : ''}${known && dichiaraFreschezza && !current ? ` · ${translate('il contesto è cambiato dopo la misura')}` : ''}` },
    job, jobLabel: translate(job ? JOB_LABELS[job.state] ?? 'Non disponibile' : 'Nessuna compattazione in corso.'),
    auto: state?.settings?.auto !== false, canCompact: Boolean(state) && state?.capabilities?.compact !== false && !ACTIVE.has(job?.state),
  };
}

const MOUNTED = new WeakMap();
/** Mount the canonical #veloContesto markup. Transport, session and snapshots are injected. */
export function montaContextCompactor(root, { client, sessionId, state = null, document: doc = root?.ownerDocument ?? globalThis.document, onState, onClose, translate = translateDefault } = {}) {
  if (MOUNTED.has(root)) return MOUNTED.get(root);
  if (!root?.querySelector('[data-context-body]') || !client) throw new TypeError('ContextCompactor richiede markup canonico e client.');
  const win = doc.defaultView ?? globalThis.window;
  const q = name => root.querySelector(`[data-context-${name}]`);
  const listen = (node, event, callback) => { node.addEventListener(event, callback); removers.push(() => node.removeEventListener(event, callback)); };
  const removers = [];
  let snapshot = state?.sessionId === sessionId ? structuredClone(state) : null;
  let available = Boolean(snapshot);
  let epoch = 0, sequence = 0, busy = false, destroyed = false, opened = !root.hidden, timer, requestController, trigger, editingId = null, editingSources = [], settingsDirty = false, versions = [], factsKey = '', versionsKey = '', sourcesKey = '', statusText = '';
  const inertBefore = new Map();
  const num = value => number(value) ? new Intl.NumberFormat(linguaCorrenteDiT() === 'en' ? 'en-US' : 'it-IT').format(value) : translate('Non disponibile');
  function element(tag, text, className) { const node = doc.createElement(tag); if (text != null) node.textContent = text; if (className) node.className = className; return node; }
  function button(text, action) { const node = element('button', translate(text), 'talos-button talos-button--ghost talos-button--sm'); node.type = 'button'; node.dataset.contextMutation = ''; node.disabled = busy || !snapshot; node.addEventListener('click', action); return node; }
  function say(message, error = false) { statusText = message; const node = q('status'); node.textContent = message; node.setAttribute('role', error ? 'alert' : 'status'); }
  function requestOptions(extra = {}) { return { sessionId, expectedRevision: snapshot?.revision, signal: requestController?.signal, ...extra }; }
  function resetEditor() { editingId = null; editingSources = []; q('fact-text').value = ''; q('fact-cancel').hidden = true; }
  function renderSettings() {
    if (settingsDirty) return;
    const s = snapshot?.settings;
    q('model-mode').value = s?.model?.mode ?? 'follow-session';
    q('provider').value = s?.model?.provider ?? ''; q('model').value = s?.model?.model ?? '';
    q('trigger').value = String((s?.triggerRatio ?? .75) * 100); q('target').value = String((s?.targetRatio ?? .55) * 100);
    q('recent').value = String(s?.retainRecentTurns ?? 2); q('focus').value = s?.focus ?? '';
    q('semantic').checked = s?.semanticSearch !== false; q('native').checked = s?.nativeMode === 'qualified';
    q('explicit-model').hidden = q('model-mode').value !== 'explicit';
  }
  function showSource(ref) {
    const current = epoch;
    q('source-detail').hidden = false; q('source-text').textContent = translate('Caricamento del contesto…');
    client.readContextSource(requestOptions({ sourceId: ref.recordId })).then(({ source }) => {
      if (current !== epoch || destroyed) return;
      const content = source?.message?.content;
      q('source-text').textContent = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
      q('source-id').textContent = source?.id ?? ref.recordId;
    }).catch(error => { if (current === epoch && !destroyed && error.name !== 'AbortError') q('source-text').textContent = translate('Contesto non disponibile. Usa Aggiorna per riprovare.'); });
  }
  function sourceLinks(parent, refs = []) {
    for (const ref of refs) {
      const row = element('div', null, 'talos-context__source');
      const quote = element('blockquote', ref.quote); const open = button('Apri fonte', () => showSource(ref)); delete open.dataset.contextMutation; open.disabled = false;
      row.append(quote, open); parent.append(row);
    }
  }
  function renderFacts() {
    const facts = (snapshot?.facts ?? []).filter(f => f.status !== 'removed');
    const key = JSON.stringify(facts); if (key === factsKey) return; factsKey = key;
    const list = q('facts'); list.replaceChildren();
    if (!facts.length) list.append(element('p', translate('Nessun fatto protetto. Aggiungi ciò che TALOS deve conservare.'), 'talos-muted'));
    for (const fact of facts) {
      const row = element('article', null, 'talos-context__fact'); row.dataset.contextFactId = fact.id;
      row.append(element('p', fact.text));
      const actions = element('div', null, 'talos-context__actions');
      actions.append(button('Modifica', () => { editingId = fact.id; editingSources = structuredClone(fact.sources ?? []); q('fact-text').value = fact.text; q('fact-cancel').hidden = false; q('fact-text').focus(); }), button('Rimuovi', () => mutate(() => client.removeProtectedFact(requestOptions({ factId: fact.id })))));
      row.append(actions); sourceLinks(row, fact.sources);
      if (fact.status === 'conflict' && fact.conflict) {
        const conflict = element('div', null, 'talos-context__conflict'); conflict.append(element('strong', translate('Proposta da verificare')), element('p', fact.conflict.proposedText));
        sourceLinks(conflict, fact.conflict.sources);
        conflict.append(button('Accetta proposta', () => mutate(() => client.resolveFactConflict(requestOptions({ factId: fact.id, accept: true })))), button('Mantieni il fatto', () => mutate(() => client.resolveFactConflict(requestOptions({ factId: fact.id, accept: false })))));
        row.append(conflict);
      }
      list.append(row);
    }
  }
  function renderVersions() {
    const key = JSON.stringify([versions, snapshot?.activeVersion?.id]); if (key === versionsKey) return; versionsKey = key;
    q('versions').replaceChildren();
    if (!versions.length) q('versions').append(element('p', translate('Nessuna versione salvata.'), 'talos-muted'));
    for (const version of versions) {
      const row = element('article', null, 'talos-context__version'); row.dataset.contextVersionId = version.id;
      const date = new Date(version.createdAt); row.append(element('strong', Number.isFinite(date.getTime()) ? date.toLocaleString(linguaCorrenteDiT() === 'en' ? 'en-US' : 'it-IT') : version.id));
      row.append(element('p', version.summary?.text ?? ''));
      if (snapshot?.activeVersion?.id === version.id) row.append(element('span', translate('Versione attiva'), 'talos-badge'));
      else row.append(button('Ripristina', () => {
        const confirm = element('div', null, 'talos-context__conflict'); confirm.append(element('p', translate('Ripristinare questa versione? I messaggi successivi restano nella chat.')));
        const yes = button('Conferma ripristino', () => mutate(() => client.restoreContextVersion(requestOptions({ versionId: version.id }))));
        confirm.append(yes, button('Annulla', () => { confirm.remove(); row.querySelector('button')?.focus(); }));
        row.querySelector('.talos-context__conflict')?.remove(); row.append(confirm); yes.focus();
      }));
      q('versions').append(row);
    }
  }
  function render() {
    if (destroyed) return;
    const view = descriviContextCompactor(snapshot, { translate }); const m = view.measurement;
    for (const node of root.querySelectorAll('[data-context-label]')) node.textContent = translate(node.dataset.contextLabel);
    if (!busy) q('auto').checked = view.auto;
    q('meter').hidden = !m.known; if (m.known) { q('meter').value = Math.min(m.inputTokens, m.windowTokens); q('meter').max = m.windowTokens; q('meter').setAttribute('aria-valuetext', `${num(m.inputTokens)} / ${num(m.windowTokens)}`); }
    q('measurement').textContent = m.known ? `${num(m.inputTokens)} / ${num(m.windowTokens)} token — ${m.methodLabel}` : translate('Misura non ancora disponibile.');
    q('input').textContent = num(m.inputTokens); q('window').textContent = num(m.windowTokens); q('reserve').textContent = num(m.responseReserve);
    q('job').textContent = view.jobLabel;
    const p = view.job?.progress; q('progress').textContent = number(p?.completed) && number(p?.total) && p.total > 0 && p.completed <= p.total ? `${translate('Completati')} ${num(p.completed)} ${translate('di')} ${num(p.total)}` : '';
    const progress = q('progress-bar');
    progress.hidden = !ACTIVE.has(view.job?.state);
    progress.setAttribute('aria-label', view.jobLabel);
    if (number(p?.completed) && number(p?.total) && p.total > 0 && p.completed <= p.total) { progress.max = p.total; progress.value = p.completed; }
    else progress.removeAttribute('value');
    q('job-error').textContent = view.job?.error?.message ?? ''; q('job-error').hidden = !view.job?.error;
    renderSettings(); renderFacts(); renderVersions();
    const refs = snapshot?.activeVersion?.summary?.sources ?? []; const key = JSON.stringify(refs);
    if (key !== sourcesKey) { sourcesKey = key; q('sources').replaceChildren(); if (!refs.length) q('sources').append(element('p', translate('Nessuna fonte nella sintesi attiva.'), 'talos-muted')); else sourceLinks(q('sources'), refs); }
    q('semantic-status').textContent = translate(snapshot?.semanticStatus === 'ready' || snapshot?.semanticStatus?.available === true ? 'Ricerca semantica disponibile.' : 'Ricerca semantica non disponibile. La ricerca testuale resta attiva.');
    const focused = doc.activeElement;
    for (const node of root.querySelectorAll('[data-context-mutation]')) node.disabled = busy || !available;
    q('start').disabled = busy || !available || !view.canCompact; q('regenerate').disabled = busy || !available || !view.canCompact || !snapshot?.activeVersion;
    q('cancel').hidden = !ACTIVE.has(view.job?.state); q('resume').hidden = view.job?.state !== 'paused';
    q('native').disabled = busy || !available || snapshot?.capabilities?.nativeCompaction !== true;
    q('native-help').hidden = snapshot?.capabilities?.nativeCompaction === true;
    root.setAttribute('aria-busy', String(busy));
    root.querySelector('[data-context-close]').setAttribute('aria-label', translate('Chiudi'));
    if (opened && focused?.disabled && root.contains(focused)) q('title').focus({ preventScroll: true });
  }
  function schedule() { clearTimeout(timer); if (opened && !destroyed && ACTIVE.has(descriviContextCompactor(snapshot).job?.state)) timer = setTimeout(() => refresh(), 1200); }
  async function refresh({ quiet = false } = {}) {
    if (destroyed || busy) return null;
    if (!sessionId) { available = false; render(); say(translate('Apri una conversazione per gestirne il contesto.')); return null; }
    const current = epoch, ticket = ++sequence;
    if (!quiet) say(translate('Caricamento del contesto…'));
    try {
      const [next, history] = await Promise.all([client.getContextState(requestOptions()), client.listContextVersions(requestOptions())]);
      if (current !== epoch || ticket !== sequence || destroyed) return null;
      if (next?.sessionId !== sessionId || !Array.isArray(history?.versions)) throw new Error('CTX_INVALID_RESPONSE');
      snapshot = structuredClone(next); available = true; versions = history.versions.filter(v => v.sessionId === sessionId); render();
      if (!quiet) say(''); onState?.(structuredClone(snapshot)); schedule(); return snapshot;
    } catch (error) {
      if (current !== epoch || ticket !== sequence || destroyed || error.name === 'AbortError') return null;
      available = false; render(); say(translate(error.code === 'CTX_NOT_ENABLED' ? 'Context Manager non è ancora attivo per questa conversazione. Nessun messaggio è stato modificato.' : 'Contesto non disponibile. Usa Aggiorna per riprovare.'), error.code !== 'CTX_NOT_ENABLED'); clearTimeout(timer); return null;
    }
  }
  async function mutate(action, success) {
    if (busy || !available || !snapshot || destroyed) return;
    const current = epoch; busy = true; clearTimeout(timer); ++sequence; say(''); render();
    try {
      await action(); if (current !== epoch || destroyed) return;
      busy = false; const refreshed = await refresh({ quiet: true });
      if (refreshed && current === epoch && !destroyed) { success?.(); render(); }
    } catch (error) {
      if (current !== epoch || destroyed) return;
      busy = false;
      if (error.name !== 'AbortError') {
        if (error.code === 'CTX_NOTHING_TO_COMPACT') say(translate('Non ci sono scambi precedenti da compattare mantenendo intero l’ultimo scambio. Nessun messaggio è stato modificato.'));
        else if (error.code === 'CTX_STALE_REVISION') { await refresh({ quiet: true }); say(translate('Il contesto è cambiato. I dati sono aggiornati: verifica e ripeti la modifica.'), true); }
        else say(translate('Operazione non riuscita. Usa Aggiorna per verificare lo stato prima di riprovare.'), true);
      }
      render();
    }
  }
  listen(q('auto'), 'change', () => { const auto = q('auto').checked; mutate(() => client.updateContextSettings(requestOptions({ patch: { auto } }))); });
  listen(q('refresh'), 'click', () => refresh());
  listen(q('start'), 'click', () => mutate(() => client.startCompaction(requestOptions({ kind: 'compact' }))));
  listen(q('regenerate'), 'click', () => mutate(() => client.startCompaction(requestOptions({ kind: 'regenerate' }))));
  listen(q('cancel'), 'click', () => mutate(() => client.cancelCompaction(requestOptions({ jobId: descriviContextCompactor(snapshot).job.id }))));
  listen(q('resume'), 'click', () => mutate(() => client.resumeCompaction(requestOptions({ jobId: descriviContextCompactor(snapshot).job.id }))));
  listen(q('fact-form'), 'submit', event => { event.preventDefault(); const text = q('fact-text').value.trim(); if (!text) return; mutate(() => client.upsertProtectedFact(requestOptions({ fact: { ...(editingId ? { id: editingId } : {}), text, sources: editingSources } })), () => { resetEditor(); say(translate('Fatto salvato.')); }); });
  listen(q('fact-cancel'), 'click', resetEditor);
  listen(q('settings'), 'input', () => { settingsDirty = true; });
  listen(q('model-mode'), 'change', () => { settingsDirty = true; q('explicit-model').hidden = q('model-mode').value !== 'explicit'; });
  listen(q('settings'), 'submit', event => {
    event.preventDefault();
    const triggerRatio = Number(q('trigger').value) / 100, targetRatio = Number(q('target').value) / 100;
    if (!(targetRatio > 0 && targetRatio < triggerRatio && triggerRatio < 1)) { say(translate('L’obiettivo deve essere inferiore alla soglia di avvio.'), true); return; }
    const model = q('model-mode').value === 'explicit' ? { mode: 'explicit', provider: q('provider').value.trim(), model: q('model').value.trim() } : { mode: 'follow-session' };
    if (model.mode === 'explicit' && (!model.provider || !model.model)) { q(!model.provider ? 'provider' : 'model').focus(); return; }
    const patch = { model, triggerRatio, targetRatio, retainRecentTurns: Number(q('recent').value), focus: q('focus').value, semanticSearch: q('semantic').checked, nativeMode: q('native').checked ? 'qualified' : 'off' };
    mutate(() => client.updateContextSettings(requestOptions({ patch })), () => { settingsDirty = false; say(translate('Impostazioni salvate.')); });
  });
  function close() {
    if (!opened) return;
    ++epoch; ++sequence; busy = false; opened = false; root.hidden = true; clearTimeout(timer); requestController?.abort();
    for (const [node, old] of inertBefore) node.inert = old; inertBefore.clear();
    trigger?.focus?.({ preventScroll: true }); onClose?.();
  }
  function open() {
    if (destroyed) return;
    if (!opened) { trigger = doc.activeElement; opened = true; }
    requestController?.abort(); requestController = new AbortController(); root.hidden = false;
    // Reuse the application's resize owner and persistence key, including keyboard handles.
    preparaMisuraDialogo(root, { finestra: win }); collegaRidimensionamentoDialoghi(root, { finestra: win });
    for (let current = root; current?.parentElement; current = current.parentElement) for (const sibling of current.parentElement.children) {
      if (sibling === current || ['SCRIPT', 'STYLE', 'LINK'].includes(sibling.tagName)) continue;
      if (!inertBefore.has(sibling)) inertBefore.set(sibling, sibling.inert); sibling.inert = true;
    }
    q('title').focus(); refresh();
  }
  listen(root, 'click', event => { if (event.target === root || event.target.closest('[data-context-close]')) close(); });
  listen(doc, 'keydown', event => {
    if (!opened || destroyed) return;
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
    if (event.key !== 'Tab') return;
    const items = [...root.querySelectorAll('button,input,textarea,select,summary,[tabindex="0"]')].filter(node => !node.disabled && !node.closest('[hidden]') && node.getClientRects().length);
    const first = items[0], last = items.at(-1);
    if (event.shiftKey && (doc.activeElement === first || doc.activeElement === q('title'))) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && doc.activeElement === last) { event.preventDefault(); first?.focus(); }
  });
  const languageChange = () => { factsKey = versionsKey = sourcesKey = ''; render(); };
  listen(win, EVENTO_LINGUA, languageChange);
  const api = {
    refresh, open, close,
    update(next) { if (next?.sessionId !== sessionId || (snapshot && next.revision < snapshot.revision)) return; snapshot = structuredClone(next); available = true; render(); schedule(); },
    setSession(nextSession, nextState = null) {
      ++epoch; ++sequence; requestController?.abort(); clearTimeout(timer); requestController = new AbortController(); busy = false; sessionId = nextSession;
      snapshot = nextState?.sessionId === sessionId ? structuredClone(nextState) : null; available = Boolean(snapshot); versions = []; settingsDirty = false; factsKey = versionsKey = sourcesKey = ''; resetEditor(); q('source-detail').hidden = true; q('source-text').textContent = ''; say(''); render();
      if (opened) return refresh();
    },
    destroy() { close(); destroyed = true; ++epoch; requestController?.abort(); clearTimeout(timer); removers.forEach(remove => remove()); MOUNTED.delete(root); },
  };
  requestController = new AbortController(); MOUNTED.set(root, api); render();
  return api;
}

export function aggiornaContextCompactor(root, state, options) {
  const controller = MOUNTED.get(root) ?? montaContextCompactor(root, { ...options, sessionId: options?.sessionId ?? state?.sessionId, state });
  controller.update(state); return controller;
}
