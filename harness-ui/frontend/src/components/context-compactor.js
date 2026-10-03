import { preparaMisuraDialogo, collegaRidimensionamentoDialoghi } from './dialoghi.js';
import { t, linguaCorrenteDiT, EVENTO_LINGUA } from './lingua.js';
import { TESTI } from '../i18n/testi/index.js';

const ACTIVE = new Set(['queued', 'preparing', 'summarizing', 'validating', 'ready', 'paused']);
const JOB_LABELS = { get queued() { return t('chat.context.job.queued'); }, get preparing() { return t('chat.context.job.preparing'); }, get summarizing() { return t('chat.context.job.compacting'); }, get validating() { return t('chat.context.job.validating'); }, get ready() { return t('chat.context.job.publishing'); }, get committed() { return t('chat.context.job.updated'); }, get paused() { return t('chat.context.job.paused'); }, get cancelled() { return t('chat.context.job.cancelled'); }, get failed() { return t('chat.context.job.failed'); } };
/*
 * Le etichette del modello HTML (`data-context-label`, in `index.template.html`) sono scritte in italiano nel template e il
 * template non è di questo file: si riconoscono dal loro testo e si dicono nella lingua corrente. L'italiano NON è riscritto
 * qui — si legge dal dizionario, così una frase vive in un posto solo. Se un giorno il template porterà le chiavi, questa
 * tabella sparisce.
 */
const ETICHETTE_DEL_MODELLO = new Map([
  'chat.context.label.title', 'chat.context.label.scope', 'chat.common.close', 'chat.context.label.refresh', 'chat.context.label.auto',
  'chat.context.label.autoHint', 'chat.context.label.inputTokens', 'chat.context.label.window', 'chat.context.label.reserve',
  'chat.context.label.cancel', 'chat.context.label.resume', 'chat.context.compactNow', 'chat.context.label.regenerate', 'chat.context.label.facts',
  'chat.context.label.factsHint', 'chat.context.label.addFact', 'chat.context.label.saveFact', 'chat.context.label.cancelEdit', 'chat.context.label.versions', 'chat.context.label.sources',
  'chat.context.label.originalSource', 'chat.context.label.advanced', 'chat.context.label.summaryModel', 'chat.context.label.followChatModel', 'chat.context.label.chooseModel', 'chat.context.label.provider',
  'chat.common.model', 'chat.context.label.startAt', 'chat.context.label.target', 'chat.context.label.recentTurns', 'chat.context.label.instructions',
  'chat.context.label.semanticSearch', 'chat.context.label.nativeCompaction', 'chat.context.label.nativeHelp', 'chat.context.label.saveSettings',
].map((chiave) => [TESTI.it[chiave], chiave]));
/** Un'etichetta del template (italiana) nella lingua corrente; ciò che non è un'etichetta del template passa da `t()` com'è. */
function translateDefault(text) { const chiave = ETICHETTE_DEL_MODELLO.get(text); return chiave ? t(chiave) : t(text); }
const number = v => typeof v === 'number' && Number.isFinite(v) && v >= 0;

export function descriviContextCompactor(state) {
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
  const method = m?.method === 'runtime' ? t('chat.context.measure.runtime') : m?.method === 'provider' ? t('chat.context.measure.provider') : m?.method === 'heuristic' ? t('chat.context.measure.heuristic') : t('chat.common.notAvailable');
  const jobs = Array.isArray(state?.jobs) ? state.jobs : [];
  const job = jobs.find(j => ACTIVE.has(j.state)) ?? [...jobs].sort((a, b) => String(b.updatedAt ?? b.createdAt).localeCompare(String(a.updatedAt ?? a.createdAt)))[0] ?? null;
  return {
    measurement: { known, inputTokens: number(m?.inputTokens) ? m.inputTokens : null, windowTokens: number(m?.windowTokens) ? m.windowTokens : null, responseReserve: number(m?.responseReserve) ? m.responseReserve : null,
      ratio: known ? m.inputTokens / m.windowTokens : null, exact, current, measuredAt: meta?.measuredAt ?? null,
      methodLabel: `${method}${known && m?.method !== 'heuristic' ? ` (${exact ? t('chat.context.measure.exact') : t('chat.context.measure.estimate')})` : ''}${oraMisura ? ` · ${t('chat.context.measure.measuredAt')} ${oraMisura}` : ''}${known && dichiaraFreschezza && !current ? ` · ${t('chat.context.measure.stale')}` : ''}` },
    job, jobLabel: job ? JOB_LABELS[job.state] ?? t('chat.common.notAvailable') : t('chat.context.noCompaction'),
    auto: state?.settings?.auto !== false, canCompact: Boolean(state) && state?.capabilities?.compact !== false && !ACTIVE.has(job?.state),
  };
}

const MOUNTED = new WeakMap();
/*
 * ⭐ 24/09/2026 sera — LA FINESTRA SI APRE SEMPRE, ANCHE SENZA IL TRIAL (decisione owner, testuale alla domanda
 * «Cosa deve fare il bottone Context Manager quando il motore del contesto è spento?»: «Apre sempre la finestra»;
 * e prima: «il click su context manager prima apriva una modale adesso fa compatta e basta»).
 *
 * `7a96744eb` (F5 onda 2, 24/09 13:04) aveva fatto compattare il bottone SUBITO sul 4174, dove il trial è spento
 * per costruzione (`config.mjs:501`): un clic, nessuna finestra, nessuna conferma, e la storia della sessione
 * del Desktop dell'owner passata da 48 messaggi a 3 (registro, checkpoint delle 22:00 e delle 22:11).
 *
 * ⇒ Il bottone apre questa finestra; quando `GET /context` risponde `CTX_NOT_ENABLED` e l'host passa `legacy`,
 *   la finestra entra nel MODO SEMPLICE: misura dell'ultima richiesta (gli stessi numeri dell'avviso sopra il
 *   composer), «Compatta ora» con conferma in linea, avanzamento ed esito dentro la finestra. Il resto del
 *   trial (fatti, versioni, impostazioni) resta spento e lo dice.
 * Fonti, 24/09/2026: Hermes `apps/desktop/src/app/shell/context-usage-panel.tsx` (il pannello del contesto
 * MOSTRA e basta; la compressione è il comando esplicito `/compress`, `e2e/session-compression-and-queue-stop.spec.ts`);
 * Claude Code `/context` guarda e `/compact` agisce (datacamp.com/tutorial/claude-code-slash-commands, 2026).
 * `legacy` = { misura(sessionId) → Promise<{inputTokens, windowTokens, soglia}|null>, inCorso(sessionId) → bool,
 *   compatta(sessionId) → Promise<{ stato: 'riassunta'|'invariata'|'errore'|'in-corso', messaggio? }> }.
 */
/** Mount the canonical #veloContesto markup. Transport, session and snapshots are injected. */
export function montaContextCompactor(root, { client, sessionId, state = null, document: doc = root?.ownerDocument ?? globalThis.document, onState, onClose, modalManager = null, translate = translateDefault, legacy = null } = {}) {
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
  // modo semplice (trial spento, host con `legacy`): misura dell'ultima richiesta, conferma aperta, esito dell'ultima compattazione
  let modoLegacy = false, confermaLegacy = false, esitoLegacy = null, misuraLegacy = null;
  const num = value => number(value) ? new Intl.NumberFormat(linguaCorrenteDiT() === 'en' ? 'en-US' : 'it-IT').format(value) : t('chat.common.notAvailable');
  function element(tag, text, className) { const node = doc.createElement(tag); if (text != null) node.textContent = text; if (className) node.className = className; return node; }
  function button(text, action) { const node = element('button', text, 'talos-button talos-button--ghost talos-button--sm'); node.type = 'button'; node.dataset.contextMutation = ''; node.disabled = busy || !snapshot; node.addEventListener('click', action); return node; }
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
    q('source-detail').hidden = false; q('source-text').textContent = t('chat.context.loading');
    client.readContextSource(requestOptions({ sourceId: ref.recordId })).then(({ source }) => {
      if (current !== epoch || destroyed) return;
      const content = source?.message?.content;
      q('source-text').textContent = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
      q('source-id').textContent = source?.id ?? ref.recordId;
    }).catch(error => { if (current === epoch && !destroyed && error.name !== 'AbortError') q('source-text').textContent = t('chat.context.unavailable'); });
  }
  function sourceLinks(parent, refs = []) {
    for (const ref of refs) {
      const row = element('div', null, 'talos-context__source');
      const quote = element('blockquote', ref.quote); const open = button(t('chat.context.source.open'), () => showSource(ref)); delete open.dataset.contextMutation; open.disabled = false;
      row.append(quote, open); parent.append(row);
    }
  }
  function renderFacts() {
    const facts = (snapshot?.facts ?? []).filter(f => f.status !== 'removed');
    const key = JSON.stringify(facts); if (key === factsKey) return; factsKey = key;
    const list = q('facts'); list.replaceChildren();
    if (!facts.length) list.append(element('p', t('chat.context.facts.empty'), 'talos-muted'));
    for (const fact of facts) {
      const row = element('article', null, 'talos-context__fact'); row.dataset.contextFactId = fact.id;
      row.append(element('p', fact.text));
      const actions = element('div', null, 'talos-context__actions');
      actions.append(button(t('chat.common.edit'), () => { editingId = fact.id; editingSources = structuredClone(fact.sources ?? []); q('fact-text').value = fact.text; q('fact-cancel').hidden = false; q('fact-text').focus(); }), button(t('chat.context.facts.remove'), () => mutate(() => client.removeProtectedFact(requestOptions({ factId: fact.id })))));
      row.append(actions); sourceLinks(row, fact.sources);
      if (fact.status === 'conflict' && fact.conflict) {
        const conflict = element('div', null, 'talos-context__conflict'); conflict.append(element('strong', t('chat.context.facts.proposal')), element('p', fact.conflict.proposedText));
        sourceLinks(conflict, fact.conflict.sources);
        conflict.append(button(t('chat.context.facts.accept'), () => mutate(() => client.resolveFactConflict(requestOptions({ factId: fact.id, accept: true })))), button(t('chat.context.facts.keep'), () => mutate(() => client.resolveFactConflict(requestOptions({ factId: fact.id, accept: false })))));
        row.append(conflict);
      }
      list.append(row);
    }
  }
  function renderVersions() {
    const key = JSON.stringify([versions, snapshot?.activeVersion?.id]); if (key === versionsKey) return; versionsKey = key;
    q('versions').replaceChildren();
    if (!versions.length) q('versions').append(element('p', t('chat.context.versions.empty'), 'talos-muted'));
    for (const version of versions) {
      const row = element('article', null, 'talos-context__version'); row.dataset.contextVersionId = version.id;
      const date = new Date(version.createdAt); row.append(element('strong', Number.isFinite(date.getTime()) ? date.toLocaleString(linguaCorrenteDiT() === 'en' ? 'en-US' : 'it-IT') : version.id));
      row.append(element('p', version.summary?.text ?? ''));
      if (snapshot?.activeVersion?.id === version.id) row.append(element('span', t('chat.context.versions.active'), 'talos-badge'));
      else row.append(button(t('chat.context.versions.restore'), () => {
        const confirm = element('div', null, 'talos-context__conflict'); confirm.append(element('p', t('chat.context.versions.restoreConfirm')));
        const yes = button(t('chat.context.versions.confirm'), () => mutate(() => client.restoreContextVersion(requestOptions({ versionId: version.id }))));
        confirm.append(yes, button(t('chat.common.cancel'), () => { confirm.remove(); row.querySelector('button')?.focus(); }));
        row.querySelector('.talos-context__conflict')?.remove(); row.append(confirm); yes.focus();
      }));
      q('versions').append(row);
    }
  }
  function render() {
    if (destroyed) return;
    const view = descriviContextCompactor(snapshot); const m = view.measurement;
    for (const node of root.querySelectorAll('[data-context-label]')) node.textContent = translate(node.dataset.contextLabel);
    if (!busy) q('auto').checked = view.auto;
    q('meter').hidden = !m.known; if (m.known) { q('meter').value = Math.min(m.inputTokens, m.windowTokens); q('meter').max = m.windowTokens; q('meter').setAttribute('aria-valuetext', `${num(m.inputTokens)} / ${num(m.windowTokens)}`); }
    q('measurement').textContent = m.known ? t('chat.context.measure.tokensWithMethod', { token: num(m.inputTokens), finestra: num(m.windowTokens), metodo: m.methodLabel }) : t('chat.context.measure.unavailable');
    q('input').textContent = num(m.inputTokens); q('window').textContent = num(m.windowTokens); q('reserve').textContent = num(m.responseReserve);
    q('job').textContent = view.jobLabel;
    const p = view.job?.progress; q('progress').textContent = number(p?.completed) && number(p?.total) && p.total > 0 && p.completed <= p.total ? t('chat.context.progress.completedOf', { n: num(p.completed), totale: num(p.total) }) : '';
    const progress = q('progress-bar');
    progress.hidden = !ACTIVE.has(view.job?.state);
    progress.setAttribute('aria-label', view.jobLabel);
    if (number(p?.completed) && number(p?.total) && p.total > 0 && p.completed <= p.total) { progress.max = p.total; progress.value = p.completed; }
    else progress.removeAttribute('value');
    q('job-error').textContent = view.job?.error?.message ?? ''; q('job-error').hidden = !view.job?.error;
    renderSettings(); renderFacts(); renderVersions();
    const refs = snapshot?.activeVersion?.summary?.sources ?? []; const key = JSON.stringify(refs);
    if (key !== sourcesKey) { sourcesKey = key; q('sources').replaceChildren(); if (!refs.length) q('sources').append(element('p', t('chat.context.source.empty'), 'talos-muted')); else sourceLinks(q('sources'), refs); }
    q('semantic-status').textContent = snapshot?.semanticStatus === 'ready' || snapshot?.semanticStatus?.available === true ? t('chat.context.semantic.available') : t('chat.context.semantic.unavailable');
    const focused = doc.activeElement;
    for (const node of root.querySelectorAll('[data-context-mutation]')) node.disabled = busy || !available;
    q('start').disabled = busy || !available || !view.canCompact; q('regenerate').disabled = busy || !available || !view.canCompact || !snapshot?.activeVersion;
    q('cancel').hidden = !ACTIVE.has(view.job?.state); q('resume').hidden = view.job?.state !== 'paused';
    q('native').disabled = busy || !available || snapshot?.capabilities?.nativeCompaction !== true;
    q('native-help').hidden = snapshot?.capabilities?.nativeCompaction === true;
    root.setAttribute('aria-busy', String(busy));
    root.querySelector('[data-context-close]').setAttribute('aria-label', t('chat.common.close'));
    if (modoLegacy) renderLegacy(); else { delete root.dataset.contextModo; root.querySelector('[data-context-conferma-legacy]')?.remove(); }
    // `doc.activeElement === focused`: se il render ha già spostato il fuoco (la conferma lo porta su «Sì, compatta»), non si ruba
    if (opened && focused?.disabled && root.contains(focused) && doc.activeElement === focused) q('title').focus({ preventScroll: true });
  }
  /* Il modo semplice sovrascrive SOLO ciò che ha una sorgente vera: misura, stato del riassunto, «Compatta ora».
     Fatti, versioni e impostazioni restano spenti da `available = false`, come prima. */
  function renderLegacy() {
    root.dataset.contextModo = 'legacy';
    const m = misuraLegacy;
    const input = number(m?.inputTokens) && m.inputTokens > 0 ? m.inputTokens : null;
    const finestra = number(m?.windowTokens) && m.windowTokens > 0 ? m.windowTokens : null;
    const known = input != null && finestra != null;
    q('meter').hidden = !known;
    if (known) { q('meter').max = finestra; q('meter').value = Math.min(input, finestra); q('meter').setAttribute('aria-valuetext', `${num(input)} / ${num(finestra)}`); }
    const soglia = number(m?.soglia) && m.soglia > 0 ? ` · ${t('chat.context.measure.autoAbove')} ${num(m.soglia)}` : '';
    q('measurement').textContent = input == null ? t('chat.context.measure.unavailable')
      : t('chat.context.measure.tokensLegacy', { token: known ? `${num(input)} / ${num(finestra)}` : num(input), misura: t('chat.context.measure.lastRequest'), soglia });
    q('input').textContent = num(input); q('window').textContent = num(finestra);
    const inCorso = Boolean(legacy?.inCorso?.(sessionId));
    const errore = !inCorso && esitoLegacy?.stato === 'errore';
    q('job').textContent = inCorso ? t('chat.context.summarizing')
      : esitoLegacy?.stato === 'riassunta' ? t('chat.context.legacy.summarizedWithUpdate')
        : esitoLegacy?.stato === 'invariata' ? t('chat.context.legacy.unchanged')
          : errore ? t('chat.context.legacy.notSummarized') : t('chat.context.noCompaction');
    q('progress').textContent = '';
    const bar = q('progress-bar'); bar.hidden = !inCorso; bar.removeAttribute('value'); bar.setAttribute('aria-label', t('chat.context.summaryInProgress'));
    q('job-error').hidden = !errore; q('job-error').textContent = errore ? (esitoLegacy.messaggio || t('chat.common.operationFailed')) : '';
    q('start').disabled = busy || inCorso || confermaLegacy || !sessionId;
    let blocco = root.querySelector('[data-context-conferma-legacy]');
    if (!confermaLegacy || inCorso) { blocco?.remove(); return; }
    if (blocco) return;
    blocco = element('div', null, 'talos-context__conflict'); blocco.dataset.contextConfermaLegacy = '';
    blocco.setAttribute('role', 'group'); blocco.setAttribute('aria-label', t('chat.context.compactNow'));
    const testo = element('p', t('chat.context.legacy.confirm'));
    const azioni = element('div', null, 'talos-context__actions');
    const si = element('button', t('chat.context.legacy.confirmYes'), 'talos-button talos-button--primary'); si.type = 'button'; si.dataset.contextConfermaSi = '';
    const no = element('button', t('chat.common.cancel'), 'talos-button talos-button--ghost'); no.type = 'button'; no.dataset.contextConfermaNo = '';
    si.addEventListener('click', () => { void confermaCompattazioneLegacy(); });
    no.addEventListener('click', () => { confermaLegacy = false; render(); q('start').focus({ preventScroll: true }); });
    azioni.append(si, no); blocco.append(testo, azioni);
    q('start').parentElement.after(blocco);
    si.focus({ preventScroll: true });
  }
  async function aggiornaMisuraLegacy(current) {
    let misura = null;
    try { misura = await legacy?.misura?.(sessionId) ?? null; } catch { misura = null; }
    if (current !== epoch || destroyed || !modoLegacy) return;
    misuraLegacy = misura; render();
  }
  async function confermaCompattazioneLegacy() {
    if (!modoLegacy || !legacy || destroyed || legacy.inCorso?.(sessionId)) return;
    const current = epoch;
    confermaLegacy = false; esitoLegacy = null;
    let promessa;
    try { promessa = Promise.resolve(legacy.compatta(sessionId)); } catch (error) { promessa = Promise.resolve({ stato: 'errore', messaggio: error?.message }); }
    render(); q('title').focus({ preventScroll: true });
    let esito;
    try { esito = await promessa; } catch (error) { esito = { stato: 'errore', messaggio: error?.message }; }
    if (current !== epoch || destroyed) return;
    esitoLegacy = esito?.stato === 'in-corso' ? null : (esito ?? null);
    render(); void aggiornaMisuraLegacy(current);
  }
  function schedule() { clearTimeout(timer); if (opened && !destroyed && ACTIVE.has(descriviContextCompactor(snapshot).job?.state)) timer = setTimeout(() => refresh(), 1200); }
  async function refresh({ quiet = false } = {}) {
    if (destroyed || busy) return null;
    if (!sessionId) { available = false; render(); say(t('chat.context.openConversationFirst')); return null; }
    const current = epoch, ticket = ++sequence;
    if (!quiet) say(t('chat.context.loading'));
    try {
      const [next, history] = await Promise.all([client.getContextState(requestOptions()), client.listContextVersions(requestOptions())]);
      if (current !== epoch || ticket !== sequence || destroyed) return null;
      if (next?.sessionId !== sessionId || !Array.isArray(history?.versions)) throw new Error('CTX_INVALID_RESPONSE');
      snapshot = structuredClone(next); available = true; modoLegacy = false; confermaLegacy = false; esitoLegacy = null; versions = history.versions.filter(v => v.sessionId === sessionId); render();
      if (!quiet) say(''); onState?.(structuredClone(snapshot)); schedule(); return snapshot;
    } catch (error) {
      if (current !== epoch || ticket !== sequence || destroyed || error.name === 'AbortError') return null;
      if (error.code === 'CTX_NOT_ENABLED' && legacy) {
        available = false; modoLegacy = true; render(); clearTimeout(timer);
        say(t('chat.context.legacy.simpleMode'));
        void aggiornaMisuraLegacy(current); return null;
      }
      modoLegacy = false; available = false; render(); say(error.code === 'CTX_NOT_ENABLED' ? t('chat.context.notEnabled') : t('chat.context.unavailable'), error.code !== 'CTX_NOT_ENABLED'); clearTimeout(timer); return null;
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
        if (error.code === 'CTX_NOTHING_TO_COMPACT') say(t('chat.context.nothingToCompact'));
        else if (error.code === 'CTX_STALE_REVISION') { await refresh({ quiet: true }); say(t('chat.context.staleRevision'), true); }
        else say(t('chat.context.operationFailedRefresh'), true);
      }
      render();
    }
  }
  listen(q('auto'), 'change', () => { const auto = q('auto').checked; mutate(() => client.updateContextSettings(requestOptions({ patch: { auto } }))); });
  listen(q('refresh'), 'click', () => refresh());
  listen(q('start'), 'click', () => {
    if (modoLegacy) { if (!legacy?.inCorso?.(sessionId)) { confermaLegacy = true; esitoLegacy = null; render(); } return; }
    mutate(() => client.startCompaction(requestOptions({ kind: 'compact' })));
  });
  listen(q('regenerate'), 'click', () => mutate(() => client.startCompaction(requestOptions({ kind: 'regenerate' }))));
  listen(q('cancel'), 'click', () => mutate(() => client.cancelCompaction(requestOptions({ jobId: descriviContextCompactor(snapshot).job.id }))));
  listen(q('resume'), 'click', () => mutate(() => client.resumeCompaction(requestOptions({ jobId: descriviContextCompactor(snapshot).job.id }))));
  listen(q('fact-form'), 'submit', event => { event.preventDefault(); const text = q('fact-text').value.trim(); if (!text) return; mutate(() => client.upsertProtectedFact(requestOptions({ fact: { ...(editingId ? { id: editingId } : {}), text, sources: editingSources } })), () => { resetEditor(); say(t('chat.context.facts.saved')); }); });
  listen(q('fact-cancel'), 'click', resetEditor);
  listen(q('settings'), 'input', () => { settingsDirty = true; });
  listen(q('model-mode'), 'change', () => { settingsDirty = true; q('explicit-model').hidden = q('model-mode').value !== 'explicit'; });
  listen(q('settings'), 'submit', event => {
    event.preventDefault();
    const triggerRatio = Number(q('trigger').value) / 100, targetRatio = Number(q('target').value) / 100;
    if (!(targetRatio > 0 && targetRatio < triggerRatio && triggerRatio < 1)) { say(t('chat.context.settings.targetBelowStart'), true); return; }
    const model = q('model-mode').value === 'explicit' ? { mode: 'explicit', provider: q('provider').value.trim(), model: q('model').value.trim() } : { mode: 'follow-session' };
    if (model.mode === 'explicit' && (!model.provider || !model.model)) { q(!model.provider ? 'provider' : 'model').focus(); return; }
    const patch = { model, triggerRatio, targetRatio, retainRecentTurns: Number(q('recent').value), focus: q('focus').value, semanticSearch: q('semantic').checked, nativeMode: q('native').checked ? 'qualified' : 'off' };
    mutate(() => client.updateContextSettings(requestOptions({ patch })), () => { settingsDirty = false; say(t('chat.context.settings.saved')); });
  });
  function close() {
    if (!opened) return;
    ++epoch; ++sequence; busy = false; opened = false; confermaLegacy = false; root.hidden = true; clearTimeout(timer); requestController?.abort();
    for (const [node, old] of inertBefore) node.inert = old; inertBefore.clear();
    if (modalManager) modalManager.deactivate(root); else trigger?.focus?.({ preventScroll: true }); onClose?.();
  }
  function open() {
    if (destroyed) return;
    if (!opened) { trigger = doc.activeElement; opened = true; }
    requestController?.abort(); requestController = new AbortController(); root.hidden = false;
    // Reuse the application's resize owner and persistence key, including keyboard handles.
    preparaMisuraDialogo(root, { finestra: win }); collegaRidimensionamentoDialoghi(root, { finestra: win });
    if (!modalManager) for (let current = root; current?.parentElement; current = current.parentElement) for (const sibling of current.parentElement.children) {
      if (sibling === current || ['SCRIPT', 'STYLE', 'LINK'].includes(sibling.tagName)) continue;
      if (!inertBefore.has(sibling)) inertBefore.set(sibling, sibling.inert); sibling.inert = true;
    }
    if (modalManager) modalManager.activate(root, { content: root.querySelector('[role=dialog]') || root, opener: trigger, initialFocus: q('title'), requestClose: close });
    else q('title').focus();
    refresh();
  }
  listen(root, 'click', event => { if (event.target === root || event.target.closest('[data-context-close]')) close(); });
  listen(doc, 'keydown', event => {
    if (!opened || destroyed || modalManager) return;
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
    /** L'host lo chiama quando una compattazione legacy parte o finisce altrove (avviso, errore, server): la finestra aperta lo segue. */
    aggiornaLegacy() { if (!modoLegacy || destroyed) return; render(); if (opened) void aggiornaMisuraLegacy(epoch); },
    update(next) { if (next?.sessionId !== sessionId || (snapshot && next.revision < snapshot.revision)) return; snapshot = structuredClone(next); available = true; render(); schedule(); },
    setSession(nextSession, nextState = null) {
      ++epoch; ++sequence; requestController?.abort(); clearTimeout(timer); requestController = new AbortController(); busy = false; sessionId = nextSession;
      modoLegacy = false; confermaLegacy = false; esitoLegacy = null; misuraLegacy = null;
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
