(() => {
  'use strict';

  /*
   * Owner 24/8: montato dentro uno shadow root da `HarnessSessionScreen.vue`
   * (non più un documento a sé tramite `window.location.assign` — la stessa
   * pagina resta la SPA, la cronologia resta condivisa, il tasto Indietro
   * torna a essere quello vero di sempre). `HarnessSessionScreen.vue` pianta
   * `window.__talosHarnessRoot` PRIMA di aggiungere questo script; ROOT()
   * torna a `document` se qualcuno lo apre com'era prima (nessuna regressione
   * per un test/anteprima diretto del file).
   */
  function ROOT() { return window.__talosHarnessRoot || document; }
  /*
   * `:root` nel CSS di questo file è diventato `:host` (vedi styles.css) —
   * `:root` dentro un foglio di stile di uno shadow root punta SEMPRE
   * all'`<html>` reale della pagina, non all'host: le variabili --sidebar
   * ecc. sarebbero finite sul documento sbagliato, o peggio, `:host` le
   * dichiara direttamente sull'host e una dichiarazione diretta batte
   * SEMPRE un valore ereditato — scrivere su document.documentElement non
   * avrebbe avuto alcun effetto visibile, sovrascritto in silenzio da
   * `:host`. HOST() punta all'elemento giusto per leggere/scrivere queste
   * proprietà personalizzate.
   */
  function HOST() { return window.__talosHarnessHost || document.documentElement; }
  const $ = (selector, root = ROOT()) => root.querySelector(selector);
  const $$ = (selector, root = ROOT()) => [...root.querySelectorAll(selector)];

  const state = {
    view: 'chat',
    mode: 'chat',
    queueMode: false,
    permissions: 'Workspace write',
    model: 'gpt-5.6-sol · high',
    environment: 'wt/auth-61c · feat/mobile-code',
    session: 'Refactor auth flow',
    running: true,
    board: {
      initialized: false,
      bootstrapPromise: null,
      campaign: null,
      campaigns: [],
      runs: [],
      nextCursor: null,
      totalMatched: 0,
      generation: 0,
    },
    /*
     * ⭐⭐⭐ 26/8 — riconciliazione desktop→mobile, DEC-053 (owner, 24/8:
     * "harness deve essere fatto sia per mobile che desktop... quando
     * riprenderemo il desktop lo legheremo al desktop"). Stessa forma di
     * `state.realSession` già viva su `lane/harness-ui` (AVM-harness-ui,
     * pipeline AG-UI reale): qui arriva SOLO la parte di consumo eventi
     * (vedi handleRealEvent più sotto), non ancora agganciata a nessun
     * pulsante — vedi la nota davanti a startRealSession per il perché.
     */
    realSession: {
      id: null,
      taskId: null,
      generation: 0,
      eventSource: null,
      messageElements: new Map(),
      runCount: 0,
      taskBubbleMostrata: false,
      /** Piano §1.3, riga Review — percorso -> {path, code, nuovo}, UNA voce per file scritto, non solo l'ultima. */
      reviewFiles: new Map(),
      /** Piano §1.3, riga "Contesto workspace" — la cartella corrente sfogliata nell'albero file reale, '' = radice. */
      treePercorso: '',
      /** Piano §1.3-BIS.T — toolCallId -> nome attrezzo, SOLO per riconoscere quando un ToolCallResult appartiene a "shell" e specchiarlo nella vista Terminale. Non tocca il rendering generico della chat, già esistente. */
      toolCallNomi: new Map(),
      /** ⛔ 27/8 — vero se l'ULTIMO evento visto su questa connessione era RunFinished/RunError: dice a onerror se la chiusura che sta per arrivare è attesa (niente da segnalare) o una vera interruzione. Vedi collegaEventiSessione. */
      eventoTerminaleVisto: false,
    },
  };

  const QA_VIEWPORTS = Object.freeze({
    'desktop': '1440x900',
    'laptop': '1024x800',
    'tablet': '768x1024',
    'mobile': '390x844',
    'mobile-narrow': '320x720',
    'capabilities': '390x844',
  });

  const appShell = $('#app');
  const views = $$('.view-pane');
  const chatConversation = $('.conversation');
  const mobileViewButtons = $$('[data-mobile-view]');
  const modeTabs = $$('.mode-tab');
  const backdrop = $('#overlayBackdrop');
  const sessionsPanel = $('#sessionsPanel');
  const inspectorPanel = $('#inspectorPanel');
  const commandDialog = $('#commandDialog');
  const commandSearch = $('#commandSearch');
  const sheetDialog = $('#sheetDialog');
  const harnessDialogBackdrop = $('#harnessDialogBackdrop');
  const sheetTitle = $('#sheetTitle');
  const sheetEyebrow = $('#sheetEyebrow');
  const sheetBody = $('#sheetBody');
  const composerInput = $('#composerInput');
  const composerForm = $('#composerForm');
  const queueToggle = $('#queueToggle');
  const queuedMessage = $('#queuedMessage');
  const sessionTitle = $('#sessionTitle');
  const toastRegion = $('#toastRegion');
  const runStrip = $('.run-strip');
  const runStateToggle = $('#runStateToggle');
  const desktopInspectorToggle = $('.desktop-context-toggle');
  const sessionsCollapseBtn = $('#sessionsCollapseBtn');
  const commandEmpty = $('#commandEmpty');
  const diffPath = $('#diffPath');
  const diffCode = $('#diffCode');
  const campaignSelect = $('#campaignSelect');
  const harnessFilter = $('#harnessFilter');
  const outcomeFilter = $('#outcomeFilter');
  const connectionState = $('[data-connection-state]');
  const campaignReadMeta = $('#campaignReadMeta');
  const campaignRunList = $('#campaignRunList');
  const campaignRunCount = $('#campaignRunCount');
  const campaignReportText = $('#campaignReportText');
  const campaignReportState = $('#campaignReportState');
  const loadMoreRunsButton = $('[data-action="load-more-runs"]');
  const refreshCampaignButton = $('[data-action="refresh-campaign"]');
  const boardEyebrow = $('#boardEyebrow');
  const boardTitle = $('#boardTitle');
  const boardDescription = $('#boardDescription');
  const composerMic = $('.composer-mic');
  const embeddedSessionBack = $('[data-open-panel="sessions"]');
  const topbar = $('.topbar');
  const embeddedHeaderScrollers = [...new Set([...views, chatConversation].filter(Boolean))];
  const embeddedHeaderScrollPositions = new WeakMap();

  if (HOST().classList.contains('talos-embedded')) {
    embeddedSessionBack?.setAttribute('aria-label', 'Torna alle sessioni Codice');
  }

  const motionAnimations = new Set();

  function motionMilliseconds(name, fallback = 0) {
    if (document.body.classList.contains('reduce-motion')) return 0;
    const raw = getComputedStyle(HOST()).getPropertyValue(name).trim();
    if (!raw) return fallback;
    const value = Number.parseFloat(raw);
    if (!Number.isFinite(value)) return fallback;
    return raw.endsWith('s') && !raw.endsWith('ms') ? value * 1000 : value;
  }

  function animateExit(element, options = {}, finalize = () => {}) {
    if (!element) { finalize(); return null; }
    const durationToken = options.durationToken || '--talos-motion-duration-surface-exit';
    const duration = motionMilliseconds(durationToken, 180);
    if (duration <= 0 || typeof element.animate !== 'function') {
      finalize();
      return null;
    }
    const style = getComputedStyle(HOST());
    const easing = options.easing
      || style.getPropertyValue('--talos-motion-ease-exit').trim()
      || 'ease-in';
    const transform = options.transform || 'translateY(6px)';
    element.classList.add('motion-exit');
    const animation = element.animate(
      [{ opacity: 1, transform: 'none' }, { opacity: 0, transform }],
      { duration, easing, fill: 'none' },
    );
    motionAnimations.add(animation);
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      motionAnimations.delete(animation);
      element.classList.remove('motion-exit');
      finalize();
    };
    animation.finished.then(finish, finish);
    return animation;
  }

  function cancelMotionAnimations() {
    for (const animation of motionAnimations) animation.cancel();
    motionAnimations.clear();
  }

  function markMotionEnter(element) {
    if (!element) return;
    element.classList.remove('motion-exit');
    element.classList.add('motion-enter');
    element.addEventListener('animationend', () => element.classList.remove('motion-enter'), { once: true });
  }

  function icon(id) {
    return `<svg aria-hidden="true"><use href="#${id}"/></svg>`;
  }

  function ensureDemoLabels() {
    $$('[data-demo-surface]').forEach((surface) => {
      if (surface.querySelector('.demo-surface-badge')) return;
      const badge = document.createElement('span');
      badge.className = 'demo-surface-badge';
      badge.textContent = 'Demo UI · non collegato';
      badge.setAttribute('aria-label', `Demo UI non collegata: ${surface.dataset.demoSurface || 'superficie'}`);
      if (surface.classList.contains('chat-view')) surface.querySelector('.conversation')?.prepend(badge);
      else if (surface.classList.contains('sessions-panel')) surface.querySelector('.brand-row')?.after(badge);
      else surface.prepend(badge);
    });
  }

  function applyQaState() {
    const requested = new URLSearchParams(window.location.search).get('qa');
    if (!requested || !Object.hasOwn(QA_VIEWPORTS, requested)) return;
    document.documentElement.dataset.qaState = requested;
    document.documentElement.dataset.qaViewport = QA_VIEWPORTS[requested];
    if (requested === 'capabilities') window.setTimeout(() => openSheet('capabilities'), 0);
    else setView('dashboard', { mode: 'dashboard' });
  }

  function syncNavigationState() {
    mobileViewButtons.forEach((button) => {
      const active = button.dataset.mobileView === state.view;
      button.classList.toggle('active', active);
      if (active) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
    modeTabs.forEach((button) => {
      const active = button.dataset.mode === state.mode;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }

  function setEmbeddedTopbarHidden(hidden) {
    if (!HOST().classList.contains('talos-embedded')) return;
    topbar?.classList.toggle('is-scroll-hidden', hidden);
  }

  function resetEmbeddedTopbarScroll(scroller = null) {
    setEmbeddedTopbarHidden(false);
    if (scroller) embeddedHeaderScrollPositions.set(scroller, Math.max(0, scroller.scrollTop));
    else embeddedHeaderScrollers.forEach((element) => {
      embeddedHeaderScrollPositions.set(element, Math.max(0, element.scrollTop));
    });
  }

  function embeddedScrollerAtEnd(scroller, current) {
    const maximum = scroller.scrollHeight - scroller.clientHeight;
    return maximum > 0 && maximum - current <= 2;
  }

  function handleEmbeddedContentScroll(event) {
    if (!HOST().classList.contains('talos-embedded')) return;
    const scroller = event.currentTarget;
    const current = Math.max(0, scroller.scrollTop);
    const previous = embeddedHeaderScrollPositions.get(scroller) ?? current;
    const delta = current - previous;
    embeddedHeaderScrollPositions.set(scroller, current);
    if (current <= 4) {
      setEmbeddedTopbarHidden(false);
      return;
    }
    if (delta < -1) {
      // Collapsing the topbar increases the scrollport height. Near the end,
      // the browser then clamps scrollTop to its smaller maximum and emits a
      // negative delta even though the person is still flinging downward.
      // A real upward gesture leaves that maximum, so only that case reopens.
      if (!embeddedScrollerAtEnd(scroller, current)) setEmbeddedTopbarHidden(false);
      return;
    }
    if (current > 12 && delta > 2) setEmbeddedTopbarHidden(true);
  }

  function setView(view, options = {}) {
    const target = $(`[data-view="${view}"]`);
    if (!target) return;
    const previous = views.find((pane) => pane.classList.contains('active'));
    state.view = view;
    if (options.mode) state.mode = options.mode;
    else if (view === 'dashboard') state.mode = 'dashboard';
    else if (view === 'chat') state.mode = 'chat';
    else state.mode = null;
    views.forEach((pane) => {
      if (pane !== target && pane !== previous) pane.classList.remove('active', 'motion-enter', 'motion-exit');
    });
    if (previous && previous !== target) {
      animateExit(previous, { durationToken: '--talos-motion-duration-tab-change', transform: 'translateX(-8px)' }, () => {
        previous.classList.remove('active');
      });
    }
    target.classList.add('active');
    if (previous !== target) markMotionEnter(target);
    syncNavigationState();
    target.scrollTop = 0;
    resetEmbeddedTopbarScroll(view === 'chat' ? chatConversation : target);
    window.__talosHarnessHostViewChange?.(view);
    if (view === 'dashboard') ensureCampaignBoard();
  }

  function syncInspectorToggle() {
    const expanded = window.innerWidth <= 1040 || !appShell.classList.contains('inspector-collapsed');
    desktopInspectorToggle?.setAttribute('aria-expanded', String(expanded));
  }

  function toggleDesktopInspector() {
    if (window.innerWidth <= 1040) {
      openPanel('inspector');
      return;
    }
    appShell.classList.toggle('inspector-collapsed');
    syncInspectorToggle();
  }

  // Owner 24/8: la sidebar sessioni comprimibile quanto l'inspector — stesso
  // schema esatto, un solo pulsante desktop-only, nessuna scorciatoia nuova.
  function syncSessionsToggle() {
    const expanded = window.innerWidth <= 1040 || !appShell.classList.contains('sessions-collapsed');
    sessionsCollapseBtn?.setAttribute('aria-expanded', String(expanded));
  }

  function toggleSessionsPanel() {
    if (window.innerWidth <= 1040) {
      openPanel('sessions');
      return;
    }
    appShell.classList.toggle('sessions-collapsed');
    syncSessionsToggle();
  }

  function openPanel(name) {
    if (name === 'inspector' && window.innerWidth > 1040) {
      appShell.classList.remove('inspector-collapsed');
      syncInspectorToggle();
      return;
    }
    if (name === 'sessions') sessionsPanel.classList.add('open');
    if (name === 'inspector') inspectorPanel.classList.add('open');
    backdrop.classList.add('show');
  }

  function closePanels() {
    sessionsPanel.classList.remove('open');
    inspectorPanel.classList.remove('open');
    backdrop.classList.remove('show');
  }

  function syncEmbeddedDialogBackdrop() {
    const shouldShow = commandDialog.open || sheetDialog.open;
    if (shouldShow) {
      harnessDialogBackdrop.hidden = false;
      markMotionEnter(harnessDialogBackdrop);
      return;
    }
    if (harnessDialogBackdrop.hidden || harnessDialogBackdrop.classList.contains('motion-exit')) return;
    animateExit(
      harnessDialogBackdrop,
      { durationToken: '--talos-motion-duration-popover', transform: 'none' },
      () => { harnessDialogBackdrop.hidden = true; },
    );
  }

  function showEmbeddedDialog(dialog) {
    if (!dialog.open) dialog.show();
    markMotionEnter(dialog);
    syncEmbeddedDialogBackdrop();
  }

  function closeEmbeddedDialog(dialog) {
    if (!dialog.open || dialog.classList.contains('motion-exit')) return;
    animateExit(dialog, { durationToken: '--talos-motion-duration-popover' }, () => {
      if (dialog.open) dialog.close();
      syncEmbeddedDialogBackdrop();
    });
  }

  function transientLayersActive() {
    return commandDialog.open
      || sheetDialog.open
      || sessionsPanel.classList.contains('open')
      || inspectorPanel.classList.contains('open');
  }

  function dismissTransientLayers() {
    if (!transientLayersActive()) return false;
    closeEmbeddedDialog(commandDialog);
    closeEmbeddedDialog(sheetDialog);
    closePanels();
    return true;
  }

  function toast(title, message = '') {
    if (toastRegion.children.length >= 3) {
      const oldest = toastRegion.firstElementChild;
      animateExit(oldest, {}, () => oldest?.remove());
    }
    const el = document.createElement('div');
    el.className = 'toast';
    el.setAttribute('role', 'status');
    const strong = document.createElement('strong');
    strong.textContent = String(title);
    el.appendChild(strong);
    if (message) {
      const span = document.createElement('span');
      span.textContent = String(message);
      el.appendChild(span);
    }
    toastRegion.appendChild(el);
    markMotionEnter(el);
    window.setTimeout(() => animateExit(el, {}, () => el.remove()), 3300);
  }

  // REAL_DATA_RENDER_START
  function textElement(tagName, className, value) {
    const element = document.createElement(tagName);
    if (className) element.className = className;
    element.textContent = value === null || value === undefined ? '—' : String(value);
    return element;
  }

  function setConnectionState(value, label, detail) {
    connectionState.dataset.connectionState = value;
    connectionState.textContent = label;
    if (detail !== undefined) campaignReadMeta.textContent = detail;
  }

  function boardErrorMessage(error) {
    if (error?.code && typeof error.message === 'string' && error.message) return error.message;
    return 'Il server locale non risponde. Apri Codice sul PC e riprova.';
  }

  function formatCost(value, estimated = false) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
    const amount = value.toFixed(9).replace(/\.?0+$/, '');
    return `${estimated ? '~' : ''}$${amount}`;
  }

  function formatPassRate(value) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
    return `${(value * 100).toFixed(1).replace(/\.0$/, '')}%`;
  }

  function replaceSelectOptions(select, values, allLabel, selectedValue = '') {
    select.replaceChildren();
    if (allLabel !== null) {
      const all = document.createElement('option');
      all.value = '';
      all.textContent = allLabel;
      select.appendChild(all);
    }
    for (const value of values) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = value;
      select.appendChild(option);
    }
    select.value = values.includes(selectedValue) ? selectedValue : '';
  }

  function renderCampaignOptions(campaigns) {
    campaignSelect.replaceChildren();
    for (const campaign of campaigns) {
      const option = document.createElement('option');
      option.value = campaign.name;
      option.textContent = campaign.available ? campaign.name : `${campaign.name} · non disponibile`;
      option.disabled = !campaign.available;
      campaignSelect.appendChild(option);
    }
    campaignSelect.disabled = campaigns.every((campaign) => !campaign.available);
    if (state.board.campaign) campaignSelect.value = state.board.campaign;
  }

  function renderCampaignFilters(summary) {
    const harnesses = (summary?.harnesses || []).map((entry) => entry.harness);
    const outcomes = Object.keys(summary?.outcomeCounts || {});
    replaceSelectOptions(harnessFilter, harnesses, 'Tutti', harnessFilter.value);
    replaceSelectOptions(outcomeFilter, outcomes, 'Tutti', outcomeFilter.value);
  }

  function renderCampaignSummary(summary) {
    $('#summaryTotal').textContent = summary ? String(summary.totalRows) : '—';
    $('#summaryMeasured').textContent = summary ? String(summary.measuredRows) : '—';
    $('#summaryPassRate').textContent = summary ? formatPassRate(summary.passRate) : '—';
    $('#summaryCost').textContent = summary
      ? formatCost(summary.canonicalCostUsd, summary.costEstimated)
      : '—';
    $('#summaryDiagnostics').textContent = summary ? String(summary.diagnosticCount) : '—';
    $('#summaryCostSource').textContent = !summary || summary.canonicalCostUsd === null
      ? 'non disponibile'
      : (summary.costEstimated ? '~ somma righe' : 'file corsa');
    renderCampaignFilters(summary);
  }

  function appendRunDetail(detail, label, value) {
    const item = document.createElement('div');
    const term = textElement('dt', '', label);
    const description = textElement('dd', '', value);
    item.append(term, description);
    detail.appendChild(item);
  }

  let runDetailSequence = 0;
  function createCampaignRun(row) {
    const article = document.createElement('article');
    article.className = 'campaign-run';
    const toggle = document.createElement('button');
    toggle.className = 'campaign-run-toggle';
    toggle.type = 'button';
    toggle.setAttribute('aria-expanded', 'false');

    const identity = document.createElement('span');
    identity.append(
      textElement('strong', '', `${row.harness} · ${row.id}`),
      textElement('small', '', `${row.source.file}:${row.source.line} · ${row.modello || 'modello non dichiarato'}`),
    );
    const outcome = textElement('span', 'status-chip campaign-run-outcome', row.esito);
    toggle.append(identity, outcome);

    const detail = document.createElement('div');
    detail.className = 'campaign-run-detail';
    detail.hidden = true;
    detail.id = `campaign-run-detail-${runDetailSequence += 1}`;
    toggle.setAttribute('aria-controls', detail.id);
    const facts = document.createElement('dl');
    appendRunDetail(facts, 'Difficoltà', row.difficolta);
    appendRunDetail(facts, 'Durata', typeof row.ms === 'number' ? `${row.ms} ms` : '—');
    appendRunDetail(facts, 'Costo riga', formatCost(row.costoUsd));
    appendRunDetail(facts, 'Corpus', row.corpus);
    appendRunDetail(facts, 'Quando', row.quando);
    appendRunDetail(facts, 'Cambiamenti', row.cambiamenti?.quanti ?? '—');
    detail.appendChild(facts);

    toggle.addEventListener('click', () => {
      const opening = detail.hidden;
      toggle.setAttribute('aria-expanded', String(opening));
      if (!opening) {
        animateExit(detail, { durationToken: '--talos-motion-duration-disclosure' }, () => { detail.hidden = true; });
        return;
      }
      detail.hidden = false;
      markMotionEnter(detail);
      if (!detail.querySelector('.run-evidence')) {
        const evidence = textElement(
          row.detto === null || row.detto === undefined ? 'p' : 'pre',
          'run-evidence',
          row.detto === null || row.detto === undefined ? 'Evidenza svuotata dalla memoria della pagina.' : row.detto,
        );
        detail.appendChild(evidence);
      }
    });

    article.append(toggle, detail);
    return article;
  }

  function renderCampaignRuns(items, { append = false } = {}) {
    if (!append) campaignRunList.replaceChildren();
    for (const row of items) campaignRunList.appendChild(createCampaignRun(row));
    if (!append && items.length === 0) {
      campaignRunList.appendChild(textElement('p', 'board-empty', 'Nessuna riga corrisponde ai filtri selezionati.'));
    }
    campaignRunCount.textContent = `${state.board.runs.length} di ${state.board.totalMatched} righe`;
    loadMoreRunsButton.hidden = !state.board.nextCursor;
  }

  function renderCampaignReport(report, errorCode = null) {
    campaignReportState.classList.toggle('success', Boolean(report));
    if (report) {
      campaignReportState.textContent = 'Disponibile';
      campaignReportText.textContent = report.text;
      return;
    }
    campaignReportState.textContent = errorCode === 'REPORT_UNAVAILABLE' ? 'Non prodotto' : 'Non disponibile';
    campaignReportText.textContent = errorCode === 'REPORT_UNAVAILABLE'
      ? 'Rapporto non ancora prodotto'
      : 'Rapporto non disponibile';
  }

  async function apiGet(pathname) {
    const response = await fetch(pathname, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
    let envelope;
    try {
      envelope = await response.json();
    } catch {
      const error = new Error('Risposta locale non valida');
      error.code = 'INTERNAL_ERROR';
      throw error;
    }
    if (!response.ok || !envelope?.ok) {
      const error = new Error(envelope?.error?.message || 'Richiesta locale non riuscita');
      error.code = envelope?.error?.code || 'INTERNAL_ERROR';
      throw error;
    }
    return envelope.data;
  }

  /** ⭐ 26/8, riconciliazione desktop→mobile — stesso contratto envelope di apiGet, per POST /api/v1/sessions/*. */
  async function apiPost(pathname, body) {
    const response = await fetch(pathname, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    let envelope;
    try {
      envelope = await response.json();
    } catch {
      const error = new Error('Risposta locale non valida');
      error.code = 'INTERNAL_ERROR';
      throw error;
    }
    if (!response.ok || !envelope?.ok) {
      const error = new Error(envelope?.error?.message || 'Richiesta locale non riuscita');
      error.code = envelope?.error?.code || 'INTERNAL_ERROR';
      throw error;
    }
    return envelope.data;
  }

  function runsPath(cursor = null) {
    const params = new URLSearchParams({ limit: '40' });
    if (harnessFilter.value) params.set('harness', harnessFilter.value);
    if (outcomeFilter.value) params.set('esito', outcomeFilter.value);
    if (cursor) params.set('cursor', cursor);
    return `/api/v1/campaigns/${encodeURIComponent(state.board.campaign)}/runs?${params}`;
  }

  async function loadCampaignRuns({ append = false, generation = state.board.generation } = {}) {
    const page = await apiGet(runsPath(append ? state.board.nextCursor : null));
    if (generation !== state.board.generation) return;
    state.board.runs = append ? state.board.runs.concat(page.items) : page.items;
    state.board.nextCursor = page.nextCursor;
    state.board.totalMatched = page.totalMatched;
    renderCampaignRuns(page.items, { append });
  }

  async function loadCampaignReport(generation) {
    try {
      const report = await apiGet(`/api/v1/campaigns/${encodeURIComponent(state.board.campaign)}/report`);
      if (generation === state.board.generation) renderCampaignReport(report);
    } catch (error) {
      if (generation !== state.board.generation) return;
      if (error.code === 'REPORT_UNAVAILABLE') {
        renderCampaignReport(null, error.code);
        return;
      }
      throw error;
    }
  }

  async function refreshCampaign() {
    if (!state.board.campaign) return;
    const generation = state.board.generation += 1;
    refreshCampaignButton.disabled = true;
    setConnectionState('loading', 'Lettura in corso', 'Rileggo i file locali autorizzati.');
    campaignReportState.textContent = 'Lettura…';
    try {
      const snapshot = await apiGet(`/api/v1/campaigns/${encodeURIComponent(state.board.campaign)}/snapshot`);
      if (generation !== state.board.generation) return;
      renderCampaignSummary(snapshot.summary);
      campaignReadMeta.textContent = `Lettura ${snapshot.readAt} · SHA-256 ${snapshot.sourceHash}`;
      await Promise.all([
        loadCampaignRuns({ append: false, generation }),
        loadCampaignReport(generation),
      ]);
      if (generation !== state.board.generation) return;
      setConnectionState('ready', 'Dati reali · sola lettura');
      // ⭐ 26/8, riconciliazione desktop→mobile — trovato con una prova vera
      // (browser reale contro il server vero, non ipotizzato): il badge
      // "Demo UI" della Board restava visibile anche a dati reali caricati,
      // difetto preesistente MAI notato perché su mobile embedded questo
      // ramo non veniva mai raggiunto. Stesso principio già applicato ad
      // aggiornaAlberoReale/aggiornaPannelloAmbiente: dati reali arrivati,
      // l'etichetta demo deve sparire.
      const demoBadgeBoard = $('.demo-surface-badge', $('[data-view="dashboard"]'));
      if (demoBadgeBoard) demoBadgeBoard.hidden = true;
    } catch (error) {
      if (generation !== state.board.generation) return;
      state.board.runs = [];
      state.board.nextCursor = null;
      state.board.totalMatched = 0;
      renderCampaignSummary(null);
      renderCampaignRuns([]);
      renderCampaignReport(null, error.code);
      setConnectionState('error', 'Collegamento non disponibile', boardErrorMessage(error));
    } finally {
      if (generation === state.board.generation) refreshCampaignButton.disabled = false;
    }
  }

  async function loadCampaigns() {
    setConnectionState('loading', 'Connessione locale', 'Leggo la allowlist dal server Codice.');
    const campaigns = await apiGet('/api/v1/campaigns');
    state.board.campaigns = campaigns;
    const available = campaigns.filter((campaign) => campaign.available);
    if (available.length === 0) throw new Error('Nessuna campagna autorizzata disponibile');
    if (!available.some((campaign) => campaign.name === state.board.campaign)) {
      state.board.campaign = available[0].name;
    }
    renderCampaignOptions(campaigns);
    campaignSelect.value = state.board.campaign;
    state.board.initialized = true;
    await refreshCampaign();
  }

  function renderEmbeddedBoardDemo(announce = false) {
    state.board.initialized = true;
    state.board.campaign = null;
    state.board.campaigns = [];
    state.board.runs = [];
    state.board.nextCursor = null;
    state.board.totalMatched = 0;
    boardEyebrow.textContent = 'Board Codice · Demo UI';
    boardTitle.textContent = 'Anteprima campagne';
    boardDescription.textContent = 'Questa superficie mobile non ha un backend: nessun dato TALOS-BANCO viene letto o simulato.';
    campaignSelect.replaceChildren(new Option('Demo non collegata', ''));
    campaignSelect.disabled = true;
    harnessFilter.replaceChildren(new Option('Tutti', ''));
    harnessFilter.disabled = true;
    outcomeFilter.replaceChildren(new Option('Tutti', ''));
    outcomeFilter.disabled = true;
    renderCampaignSummary(null);
    renderCampaignRuns([]);
    renderCampaignReport(null, 'REPORT_UNAVAILABLE');
    $('.board-empty', campaignRunList).textContent = 'Nessun dato mobile collegato.';
    campaignReportState.textContent = 'Demo';
    campaignReportText.textContent = 'Nessun rapporto mobile collegato';
    setConnectionState('demo', 'Demo UI · non collegato', 'Nessun backend mobile è configurato per Codice.');
    if (announce) toast('Board demo non collegata', 'Nessuna richiesta di rete è stata eseguita.');
  }

  function ensureCampaignBoard() {
    if (HOST().classList.contains('talos-embedded')) {
      renderEmbeddedBoardDemo();
      return Promise.resolve();
    }
    if (state.board.initialized || state.board.bootstrapPromise) return state.board.bootstrapPromise;
    state.board.bootstrapPromise = loadCampaigns()
      .catch((error) => {
        state.board.initialized = false;
        setConnectionState('error', 'Server locale non disponibile', boardErrorMessage(error));
        renderCampaignSummary(null);
        renderCampaignRuns([]);
        renderCampaignReport(null, error.code);
      })
      .finally(() => { state.board.bootstrapPromise = null; });
    return state.board.bootstrapPromise;
  }

  async function reloadRunsFromFilters() {
    if (!state.board.initialized) return;
    const generation = state.board.generation;
    loadMoreRunsButton.disabled = true;
    try {
      await loadCampaignRuns({ append: false, generation });
      setConnectionState('ready', 'Dati reali · sola lettura');
    } catch (error) {
      setConnectionState('error', 'Filtro non disponibile', boardErrorMessage(error));
    } finally {
      loadMoreRunsButton.disabled = false;
    }
  }

  function clearCampaignEvidence() {
    if (HOST().classList.contains('talos-embedded')) {
      toast('Nessuna evidenza collegata', 'La Board mobile è una Demo UI senza backend.');
      return;
    }
    for (const row of state.board.runs) row.detto = null;
    $$('.run-evidence', campaignRunList).forEach((element) => element.remove());
    $$('.campaign-run-detail', campaignRunList).forEach((detail) => { detail.hidden = true; });
    $$('.campaign-run-toggle', campaignRunList).forEach((button) => button.setAttribute('aria-expanded', 'false'));
    toast('Evidenze svuotate', 'I testi detto sono stati rimossi solo dalla memoria e dal DOM della pagina.');
  }
  // REAL_DATA_RENDER_END

  async function copyText(text, success = 'Copiato negli appunti') {
    const value = String(text || '').trim();
    if (!value) return;
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(value);
      else {
        const area = document.createElement('textarea');
        area.value = value;
        area.setAttribute('readonly', '');
        area.className = 'clipboard-fallback';
        document.body.appendChild(area);
        area.select();
        document.execCommand('copy');
        area.remove();
      }
      toast(success);
    } catch {
      toast('Copia non disponibile', 'Seleziona manualmente il contenuto.');
    }
  }

  function openSheet(type) {
    const content = sheetTemplates[type];
    if (!content) return;
    sheetEyebrow.textContent = content.eyebrow;
    sheetTitle.textContent = content.title;
    sheetBody.innerHTML = content.html();
    showEmbeddedDialog(sheetDialog);
    wireSheetActions(type);
  }

  const sheetTemplates = {
    model: {
      eyebrow: 'Runtime',
      title: 'Modello e ragionamento',
      html: () => `
        <div class="sheet-section">
          <span class="sheet-label">Modelli disponibili</span>
          ${[
            ['gpt-5.6-sol · high', 'OpenAI', 'Attivo', 'i-brain'],
            ['claude-opus-4.6 · high', 'Anthropic', '128k', 'i-brain'],
            ['deepseek-v4-flash · high', 'DeepSeek', 'fast', 'i-bolt'],
            ['gemini-3.1-pro · medium', 'Google', 'local route', 'i-brain'],
          ].map(([name, provider, note, ico]) => `
            <button class="sheet-option ${name === state.model ? 'active' : ''}" data-model-choice="${name}">
              <span class="sheet-icon">${icon(ico)}</span><span><strong>${name}</strong><small>${provider}</small></span><span>${note}</span>
            </button>`).join('')}
        </div>
        <div class="sheet-section">
          <span class="sheet-label">Comportamento</span>
          <div class="sheet-toggle-row"><span>Mostra ragionamento sintetico</span><input type="checkbox" checked></div>
          <div class="sheet-toggle-row"><span>Compatta contesto automaticamente</span><input type="checkbox" checked></div>
        </div>`,
    },
    permissions: {
      eyebrow: 'Safety lens',
      title: 'Permessi di esecuzione',
      html: () => `
        <div class="sheet-section">
          <span class="sheet-label">Policy sessione</span>
          ${[
            ['Read only', 'Legge progetto e comandi non mutanti.', 'Minimo rischio'],
            ['Workspace write', 'Scrive solo nel workspace/worktree corrente.', 'Consigliato'],
            ['On request', 'Chiede prima delle azioni sensibili.', 'Controllato'],
            ['Full access', 'Filesystem e rete senza gate ordinari.', 'Alto rischio'],
          ].map(([name, desc, note]) => `
            <button class="sheet-option ${name === state.permissions ? 'active' : ''}" data-permission-choice="${name}">
              <span class="sheet-icon">${icon('i-shield')}</span><span><strong>${name}</strong><small>${desc}</small></span><span>${note}</span>
            </button>`).join('')}
        </div>
        <div class="sheet-section">
          <span class="sheet-label">Scope corrente</span>
          <div class="sheet-toggle-row"><span>Rete esterna</span><input type="checkbox"></div>
          <div class="sheet-toggle-row"><span>Browser locale 127.0.0.1</span><input type="checkbox" checked></div>
          <div class="sheet-toggle-row"><span>Git push</span><input type="checkbox"></div>
        </div>`,
    },
    environment: {
      eyebrow: 'Environment proof',
      title: 'Workspace e worktree',
      html: () => `
        <div class="sheet-section">
          <span class="sheet-label">Ambiente attivo</span>
          <button class="sheet-option active" data-environment-choice="active">
            <span class="sheet-icon">${icon('i-branch')}</span><span><strong>wt/auth-61c · feat/mobile-code</strong><small>~/dev/talos/.worktrees/auth-61c</small></span><span>Attivo</span>
          </button>
          <button class="sheet-option" data-environment-choice="local">
            <span class="sheet-icon">${icon('i-git')}</span><span><strong>Local · main</strong><small>~/dev/talos</small></span><span>pulito</span>
          </button>
          <button class="sheet-option" data-environment-choice="docker">
            <span class="sheet-icon">${icon('i-terminal')}</span><span><strong>Docker sandbox</strong><small>talos-dev:latest · isolated</small></span><span>pronto</span>
          </button>
          <button class="sheet-option" data-environment-choice="ssh">
            <span class="sheet-icon">${icon('i-link')}</span><span><strong>SSH remote</strong><small>devbox · /workspace/talos</small></span><span>offline</span>
          </button>
          <button class="sheet-option" data-environment-choice="cloud">
            <span class="sheet-icon">${icon('i-web')}</span><span><strong>Cloud sandbox</strong><small>ephemeral · hibernate when idle</small></span><span>+</span>
          </button>
        </div>
        <div class="sheet-section">
          <span class="sheet-label">Regole</span>
          <div class="sheet-toggle-row"><span>Mostra branch sempre</span><input type="checkbox" checked></div>
          <div class="sheet-toggle-row"><span>Crea worktree per task</span><input type="checkbox" checked></div>
          <div class="sheet-toggle-row"><span>Setup non bloccante</span><input type="checkbox" checked></div>
        </div>`,
    },
    capabilities: {
      eyebrow: 'Capability hub',
      title: 'Strumenti, skill e connettori',
      html: () => `
        <div class="sheet-section">
          <span class="sheet-label">Sessione</span>
          ${[
            ['Skills', '6 abilitate · frontend, review, testing', 'i-bolt', true],
            ['MCP', '3 server · filesystem, docs, browser', 'i-link', true],
            ['Plugin market', 'Plugin installabili e aggiornabili', 'i-grid', true],
            ['Toolsets', 'Set di tool per task e profilo', 'i-code', true],
            ['Web search', 'Ricerca e fetch gestiti', 'i-search', true],
            ['Browser', 'Naviga, ispeziona, annota', 'i-web', true],
            ['Computer use', 'Disattivato per questa sessione', 'i-layout', false],
            ['Images', 'Paste / drag / screenshot context', 'i-image', true],
            ['Voice', 'Memo, dettatura e trascrizione', 'i-mic', true],
            ['Gateways', 'Telegram · Discord · Slack · WhatsApp', 'i-link', false],
            ['Profiles', 'Persona / SOUL / project profile', 'i-robot', true],
          ].map(([name, desc, ico, checked]) => `
            <div class="sheet-option" role="group">
              <span class="sheet-icon">${icon(ico)}</span><span><strong>${name}</strong><small>${desc}</small></span><span><input aria-label="${name}" type="checkbox" ${checked ? 'checked' : ''}></span>
            </div>`).join('')}
        </div>
        <div class="sheet-section">
          <span class="sheet-label">Input rapido</span>
          <button class="sheet-option" data-capability-action="file"><span class="sheet-icon">${icon('i-files')}</span><span><strong>Allega file</strong><small>Seleziona dal workspace o dispositivo</small></span><span>+</span></button>
          <button class="sheet-option" data-capability-action="image"><span class="sheet-icon">${icon('i-image')}</span><span><strong>Screenshot / immagine</strong><small>Contesto visivo per il task</small></span><span>+</span></button>
        </div>`,
    },
    control: {
      eyebrow: 'Control plane',
      title: 'Agents, hook e diagnostica',
      html: () => `
        <div class="sheet-section">
          <span class="sheet-label">Agent runtime</span>
          <button class="sheet-option" data-control-action="agents"><span class="sheet-icon">${icon('i-robot')}</span><span><strong>Agents</strong><small>Subagent, deleghe, isolamento e limiti</small></span><span>2</span></button>
          <button class="sheet-option" data-control-action="hooks"><span class="sheet-icon">${icon('i-bolt')}</span><span><strong>Hooks</strong><small>Pre/Post tool, stop, notify e policy</small></span><span>4</span></button>
          <button class="sheet-option" data-control-action="doctor"><span class="sheet-icon">${icon('i-check')}</span><span><strong>Doctor</strong><small>Runtime, provider, shell, git e browser</small></span><span>Healthy</span></button>
          <button class="sheet-option" data-control-action="settings"><span class="sheet-icon">${icon('i-settings')}</span><span><strong>Impostazioni Codice</strong><small>Aspetto, interazione e preferenze demo</small></span><span>Apri</span></button>
        </div>
        <div class="sheet-section">
          <span class="sheet-label">Approval policy</span>
          <div class="sheet-toggle-row"><span>Auto-approve read</span><input type="checkbox" checked></div>
          <div class="sheet-toggle-row"><span>Diff gate prima di done</span><input type="checkbox" checked></div>
          <div class="sheet-toggle-row"><span>Chiedi per rete / push / esterno</span><input type="checkbox" checked></div>
        </div>`,
    },
    sessionTree: {
      eyebrow: 'Conversation graph',
      title: 'Albero sessione',
      html: () => `
        <div class="sheet-section session-tree-sheet">
          <span class="sheet-label">Thread e fork</span>
          <button class="sheet-option active" data-session-action="main"><span class="sheet-icon">${icon('i-list')}</span><span><strong data-current-session-title>${state.session.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')}</strong><small>Main · contesto 18.7k · live</small></span><span>●</span></button>
          <button class="sheet-option" data-session-action="side"><span class="sheet-icon">${icon('i-branch')}</span><span><strong>Responsive audit</strong><small>Side thread · subagent A1</small></span><span>↗</span></button>
          <button class="sheet-option" data-session-action="fork"><span class="sheet-icon">${icon('i-branch')}</span><span><strong>A11y review</strong><small>Fork dal turn 14 · pronto</small></span><span>✓</span></button>
        </div>
        <div class="sheet-section">
          <button class="primary-btn full" data-session-action="new-side">+ Nuovo side thread</button>
        </div>`,
    },
    rename: {
      eyebrow: 'Sessione',
      title: 'Rinomina sessione',
      html: () => `
        <form class="sheet-section rename-form" id="renameSessionForm">
          <label class="sheet-label" for="renameSessionInput">Nome sessione</label>
          <input class="sheet-input" id="renameSessionInput" value="${state.session.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')}" maxlength="80" autocomplete="off">
          <div class="sheet-actions">
            <button type="button" class="secondary-btn" data-rename-cancel>Annulla</button>
            <button type="submit" class="primary-btn">Salva</button>
          </div>
        </form>`,
    },
    references: {
      eyebrow: 'Context reference',
      title: 'Aggiungi file con @',
      html: () => `
        <div class="sheet-section">
          <span class="sheet-label">Suggerimenti workspace</span>
          ${['src/components/chat/TalosComposer.vue','src/style.css','src/lib/talosThemes.ts','tests/unit/chat/composer.spec.ts','AGENTS.md'].map((file) => `<button class="sheet-option reference-option" data-reference-file="${file}"><span class="sheet-icon">${icon('i-files')}</span><span><strong>${file}</strong><small>Aggiungi al contesto del messaggio</small></span><span>@</span></button>`).join('')}
        </div>`,
    },
  };

  function wireSheetActions(type) {
    $$('[data-model-choice]', sheetBody).forEach((button) => {
      button.addEventListener('click', () => {
        state.model = button.dataset.modelChoice;
        $$('.selector-pill span').filter((span) => span.textContent.includes('gpt-') || span.textContent.includes('claude-') || span.textContent.includes('deepseek-') || span.textContent.includes('gemini-')).forEach((span) => { span.textContent = state.model; });
        toast('Modello aggiornato', state.model);
        closeEmbeddedDialog(sheetDialog);
      });
    });
    $$('[data-permission-choice]', sheetBody).forEach((button) => {
      button.addEventListener('click', () => {
        state.permissions = button.dataset.permissionChoice;
        $$('.selector-pill span').filter((span) => ['Workspace write', 'Read only', 'On request', 'Full access'].includes(span.textContent)).forEach((span) => { span.textContent = state.permissions; });
        window.__talosHarnessHostPermissionChange?.(state.permissions);
        toast('Policy aggiornata', state.permissions);
        closeEmbeddedDialog(sheetDialog);
      });
    });
    $$('[data-capability-action]', sheetBody).forEach((button) => {
      button.addEventListener('click', () => {
        toast(button.dataset.capabilityAction === 'file' ? 'File picker simulato' : 'Cattura visiva pronta', 'Il mockup rappresenta il flusso senza backend.');
        closeEmbeddedDialog(sheetDialog);
      });
    });
    $$('[data-environment-choice]', sheetBody).forEach((button) => {
      button.addEventListener('click', () => {
        state.environment = button.querySelector('strong')?.textContent || 'Runtime aggiornato';
        const chip = $('.environment-chip span');
        if (chip) chip.textContent = state.environment;
        toast('Environment selezionato', state.environment);
        closeEmbeddedDialog(sheetDialog);
      });
    });
    $$('[data-control-action]', sheetBody).forEach((button) => {
      button.addEventListener('click', () => {
        const action = button.dataset.controlAction;
        if (action === 'agents') { closeEmbeddedDialog(sheetDialog); openPanel('inspector'); const agents = $('[data-inspector-tab="agents"]'); agents?.click(); }
        else if (action === 'settings') { closeEmbeddedDialog(sheetDialog); setView('settings'); }
        else toast(action === 'doctor' ? 'Doctor: Healthy' : 'Hook center aperto', action === 'doctor' ? 'Provider, shell, git, browser e workspace verificati.' : '4 hook configurati per questa sessione.');
      });
    });
    $$('[data-session-action]', sheetBody).forEach((button) => {
      button.addEventListener('click', () => {
        const action = button.dataset.sessionAction;
        toast(action === 'new-side' ? 'Side thread creato' : 'Thread selezionato', action === 'fork' ? 'Fork indipendente con contesto ereditato.' : 'Il contesto resta isolato ma collegato al task principale.');
        closeEmbeddedDialog(sheetDialog);
      });
    });
    $$('[data-reference-file]', sheetBody).forEach((button) => {
      button.addEventListener('click', () => {
        const file = button.dataset.referenceFile;
        composerInput.value = `${composerInput.value.replace(/@[^\s]*$/, '')}@${file} `;
        autoGrowTextarea();
        closeEmbeddedDialog(sheetDialog);
        composerInput.focus();
      });
    });

    const renameForm = $('#renameSessionForm', sheetBody);
    if (renameForm) {
      const input = $('#renameSessionInput', renameForm);
      window.setTimeout(() => { input?.focus(); input?.select(); }, 30);
      $('[data-rename-cancel]', renameForm)?.addEventListener('click', () => closeEmbeddedDialog(sheetDialog));
      renameForm.addEventListener('submit', (event) => {
        event.preventDefault();
        const next = input?.value.trim();
        if (!next) { input?.focus(); return; }
        state.session = next;
        sessionTitle.textContent = state.session;
        const activeSession = $('.session-item.active .session-main strong');
        if (activeSession) activeSession.textContent = state.session;
        closeEmbeddedDialog(sheetDialog);
        toast('Sessione rinominata', state.session);
      });
    }
  }

  function setQueueMode(enabled, announce = false) {
    state.queueMode = Boolean(enabled);
    queueToggle.classList.toggle('active', state.queueMode);
    queueToggle.setAttribute('aria-pressed', String(state.queueMode));
    queueToggle.textContent = state.queueMode ? 'In coda' : 'Follow-up';
    runStateToggle?.setAttribute('aria-pressed', String(state.queueMode));
    if (announce) toast(state.queueMode ? 'Steering queue attiva' : 'Steering queue disattivata');
  }

  function setRunState(running) {
    state.running = Boolean(running);
    runStrip?.classList.toggle('is-stopped', !state.running);
    const label = $('strong', runStateToggle);
    const timer = runStateToggle?.querySelector('span:last-child');
    if (label) label.textContent = state.running ? 'In esecuzione' : 'Interrotto';
    if (timer) timer.textContent = state.running ? '01:42' : '—';
    const stopButton = $('.stop-run');
    if (stopButton) {
      stopButton.disabled = !state.running;
      stopButton.setAttribute('aria-label', state.running ? 'Interrompi esecuzione' : 'Esecuzione interrotta');
    }
  }

  let nativeKeyboardOpen = null;

  function applyKeyboardOpen(open) {
    document.body.classList.toggle('keyboard-open', Boolean(open));
  }

  function setKeyboardOpen(open) {
    nativeKeyboardOpen = Boolean(open);
    applyKeyboardOpen(nativeKeyboardOpen);
    if (!nativeKeyboardOpen && ROOT().activeElement === composerInput) composerInput.blur();
  }

  function syncVisualViewport() {
    const viewport = window.visualViewport;
    const rawOffset = viewport ? Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop) : 0;
    const keyboardOffset = rawOffset > 80 ? rawOffset : 0;
    // ROOT().activeElement, non document.activeElement: dentro uno shadow
    // root il focus reale si legge da lì (Document e ShadowRoot condividono
    // l'interfaccia DocumentOrShadowRoot) — document.activeElement da fuori
    // vedrebbe solo l'host, mai composerInput.
    const composerFocused = ROOT().activeElement === composerInput;
    const viewportKeyboardOpen = composerFocused && keyboardOffset > 0 && window.innerWidth <= 780;
    applyKeyboardOpen(nativeKeyboardOpen ?? viewportKeyboardOpen);
  }

  const toolDetails = {
    read: ['File letto', 'TalosComposer.vue · 214 righe · nessun conflitto rilevato.'],
    search: ['Ricerca completata', 'Trovati breakpoint 360/430/780, safe-area e 11 target interattivi da rifinire.'],
    edit: ['Patch applicata', '+28 −19 · layout composer convertito a container-aware responsive surface.'],
    bash: ['Test completati', '6/6 test superati in 8.4s · touch target, safe-area e command palette verificati.'],
    browser: ['Browser check live', '390×844 · viewport dinamico, composer, drawer e bottom navigation sotto osservazione.'],
  };

  function toggleToolDetail(button) {
    const key = button.dataset.toolDetail;
    const existing = button.nextElementSibling?.classList.contains('tool-inline-detail') ? button.nextElementSibling : null;
    $$('.tool-row[aria-expanded="true"]').forEach((row) => {
      if (row !== button) row.setAttribute('aria-expanded', 'false');
    });
    $$('.tool-inline-detail').forEach((detail) => {
      if (detail !== existing) animateExit(detail, { durationToken: '--talos-motion-duration-disclosure' }, () => detail.remove());
    });
    if (existing) {
      button.setAttribute('aria-expanded', 'false');
      animateExit(existing, { durationToken: '--talos-motion-duration-disclosure' }, () => existing.remove());
      return;
    }
    const [title, detail] = toolDetails[key] || ['Dettaglio tool', 'Nessun dettaglio aggiuntivo disponibile.'];
    const row = document.createElement('div');
    row.className = 'tool-inline-detail';
    row.innerHTML = `<strong>${title}</strong><span>${detail}</span>`;
    button.insertAdjacentElement('afterend', row);
    markMotionEnter(row);
    button.setAttribute('aria-expanded', 'true');
  }

  const reviewFiles = {
    composer: {
      path: 'src/components/chat/TalosComposer.vue',
      code: [
        ['ctx', '@@ composer layout @@'],
        ['del', '- .composer { grid-template-columns: 48px 1fr auto auto; }'],
        ['add', '+ .composer { container-type: inline-size; }'],
        ['add', '+ .composer-toolbar { grid-template-columns: 48px minmax(0, 1fr) 48px; }'],
        ['add', '+ @container (max-width: 560px) {'],
        ['add', '+   .secondary-context { display: none; }'],
        ['add', '+ }'],
        ['ctx', ' '],
        ['ctx', '@@ safe area @@'],
        ['add', '+ padding-bottom: max(12px, env(safe-area-inset-bottom));'],
      ],
    },
    layout: {
      path: 'src/styles/chat-layout.css',
      code: [
        ['ctx', '@@ mobile interaction density @@'],
        ['del', '- .message-actions button { width: 34px; height: 32px; }'],
        ['add', '+ .message-actions button { width: 44px; height: 44px; }'],
        ['add', '+ .view-pane { overscroll-behavior: contain; }'],
        ['add', '+ .mobile-nav { padding-bottom: env(safe-area-inset-bottom); }'],
      ],
    },
    tests: {
      path: 'tests/unit/chat/composer.spec.ts',
      code: [
        ['ctx', '@@ responsive guardrails @@'],
        ['add', '+ expect(target.height).toBeGreaterThanOrEqual(44)'],
        ['add', '+ expect(document.documentElement.scrollWidth).toBe(innerWidth)'],
        ['add', '+ expect(dialog.getAttribute("aria-labelledby")).toBeTruthy()'],
        ['add', '+ expect(queueButton.getAttribute("aria-pressed")).toBe("true")'],
      ],
    },
  };

  function renderReviewFile(key) {
    // ⭐ 26/8, riconciliazione desktop→mobile — le voci reali vivono in
    // state.realSession.reviewFiles (una per percorso scritto), non nel
    // fisso `reviewFiles` demo: chiave "real:<percorso>" le distingue,
    // stesso schema già in produzione su lane/harness-ui.
    const file = key.startsWith('real:') ? state.realSession.reviewFiles.get(key.slice(5)) : reviewFiles[key];
    if (!file || !diffPath || !diffCode) return;
    diffPath.textContent = file.path;
    diffCode.replaceChildren(...file.code.map(([kind, text]) => {
      const span = document.createElement('span');
      span.className = kind;
      span.textContent = text;
      return span;
    }));
    markMotionEnter(diffCode);
  }

  function setInspectorTab(button) {
    $$('.inspector-tabs button').forEach((tab) => {
      const active = tab === button;
      tab.classList.toggle('active', active);
      tab.setAttribute('aria-selected', String(active));
    });
    $$('.inspector-section').forEach((section) => {
      const active = section.dataset.inspectorSection === button.dataset.inspectorTab;
      section.classList.toggle('active', active);
      section.hidden = !active;
      if (active) markMotionEnter(section);
    });
  }

  /*
   * ⭐⭐⭐ 26/8 — LA SESSIONE VERA, riconciliazione desktop→mobile (DEC-053).
   * Porta da `lane/harness-ui` (AVM-harness-ui/harness-ui/public/app.js) la
   * pipeline di CONSUMO eventi AG-UI: stessa API `/api/v1/sessions/*`, stesso
   * contratto envelope (apiGet/apiPost sopra), zero dipendenze nuove — solo
   * `$`/`$$` al posto di `document.querySelector` dov'era bare, il resto
   * (createElement/createElementNS/createTextNode/setTimeout) funziona già
   * identico dentro uno shadow root, quindi resta invariato.
   *
   * ⭐ 26/8, seconda metà dello stesso giorno: forkSession / resumeSession /
   * compactSession / passaASessione / contenitoreSessioniReali /
   * aggiornaElencoSessioniReali / openRealTaskSheet sono state portate
   * anche loro (vedi il blocco dopo stopRealSession, poco più sotto) — su
   * desktop pescano/scrivono #sessionList, lo stesso elemento che esiste
   * IDENTICO in questo bundle; il vincolo "serve un ponte verso la sidebar
   * nativa Vue" vale solo quando il bundle è EMBEDDED
   * (`:host(.talos-embedded)` in styles.css nasconde già #sessionList per
   * quel caso, stesso meccanismo della Board demo) — standalone (il caso
   * desktop) non c'è nessuna sidebar nativa da sostituire, quindi niente
   * ponte da costruire prima di portarle.
   *
   * ⛔ NON ANCORA fatto (dichiarato, non taciuto): nessuna di queste — né
   * startRealSession né le sette appena elencate — è agganciata a un
   * tocco. openRealTaskSheet userebbe showEmbeddedDialog(sheetDialog), mai
   * il metodo nativo bloccante dell'elemento <dialog> (vietato,
   * HARNESS-NATIVE-TOP-LAYER-HITTEST-01), ma manca ancora il bottone che la
   * apre: su mobile "dove va" resta la
   * stessa decisione UX già rimandata (superficie Codice iterata per otto
   * fasi, non mia da decidere sola); sul desktop standalone il vincolo
   * tecnico non c'è, ma la scelta di COSA far fare a "Nuova sessione" in
   * quel contesto è comunque un prodotto, non un'ovvietà.
   *
   * ⇒ Zero rischio di regressione sulla suite Pad-verificata di Codice: il
   * prossimo passo è la decisione UX del trigger, non altro porting.
   */

  function appendRealTaskStart(task) {
    const conversation = $('#conversation');
    const article = document.createElement('article');
    article.className = 'message user-message';
    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';
    bubble.textContent = task.consegna || task.consegnaCorta || task.id;
    const meta = document.createElement('div');
    meta.className = 'message-meta';
    const span = document.createElement('span');
    span.textContent = `Task reale · ${task.id}`;
    meta.appendChild(span);
    article.append(bubble, meta);
    conversation.appendChild(article);
    markMotionEnter(article);
    window.setTimeout(() => article.scrollIntoView({ behavior: document.body.classList.contains('reduce-motion') ? 'auto' : 'smooth', block: 'center' }), 40);
    state.realSession.taskBubbleMostrata = true;
  }

  function ensureAssistantMessageElement(messageId) {
    const existing = state.realSession.messageElements.get(messageId);
    if (existing) return existing;
    const conversation = $('#conversation');
    const article = document.createElement('article');
    article.className = 'message assistant-message compact-message';
    const meta = document.createElement('div');
    meta.className = 'assistant-meta';
    const glyph = document.createElement('span');
    glyph.className = 'talos-glyph';
    glyph.appendChild(textElement('span', 'brand-glyph-mark', ''));
    meta.append(glyph, document.createTextNode('TALOS · sessione reale'));
    const copy = document.createElement('div');
    copy.className = 'assistant-copy';
    article.append(meta, copy);
    conversation.appendChild(article);
    markMotionEnter(article);
    state.realSession.messageElements.set(messageId, article);
    return article;
  }

  function appendToolNote(text) {
    const conversation = $('#conversation');
    const article = document.createElement('article');
    article.className = 'message assistant-message compact-message real-tool-note';
    const meta = document.createElement('div');
    meta.className = 'assistant-meta';
    const glyph = document.createElement('span');
    glyph.className = 'talos-glyph';
    glyph.textContent = '⚙';
    meta.append(glyph, document.createTextNode('Attrezzo'));
    const copy = document.createElement('div');
    copy.className = 'assistant-copy';
    copy.textContent = text;
    article.append(meta, copy);
    conversation.appendChild(article);
    markMotionEnter(article);
    window.setTimeout(() => article.scrollIntoView({ behavior: document.body.classList.contains('reduce-motion') ? 'auto' : 'smooth', block: 'end' }), 40);
  }

  function appendStatusNote(text, isError = false) {
    const conversation = $('#conversation');
    const article = document.createElement('article');
    article.className = `message assistant-message compact-message real-session-status${isError ? ' real-session-error' : ''}`;
    const meta = document.createElement('div');
    meta.className = 'assistant-meta';
    const glyph = document.createElement('span');
    glyph.className = 'talos-glyph';
    glyph.textContent = isError ? '!' : '✓';
    meta.append(glyph, document.createTextNode(isError ? 'TALOS · errore' : 'TALOS · concluso'));
    const copy = document.createElement('div');
    copy.className = 'assistant-copy';
    copy.textContent = text;
    article.append(meta, copy);
    conversation.appendChild(article);
    markMotionEnter(article);
    window.setTimeout(() => article.scrollIntoView({ behavior: document.body.classList.contains('reduce-motion') ? 'auto' : 'smooth', block: 'end' }), 40);
  }

  /**
   * ⭐ Piano §1.3-BIS.T (seconda metà) — la vista Terminale dedicata smette
   * di essere demo la prima volta che un comando VERO gira. Non un vero
   * emulatore (niente cursore che si muove, niente ANSI): un prompt riga
   * per riga, stesso stile visivo del mockup (span .prompt/.path/.cursor),
   * ma con l'output reale.
   *
   * ⛔ Non tocca il rendering generico della chat (appendToolNote già
   * mostra lo stesso tool-call lì) — questa è un'AGGIUNTA, non una
   * sostituzione: lo stesso comando compare in entrambe le viste, come nel
   * mockup originale (Terminale è una vista dedicata, non l'unica prova
   * che qualcosa è girato).
   */
  function appendTerminalEntry(comando, testo) {
    const code = $('[data-view="terminal"] .terminal-window code');
    if (!code) return;
    if (!code.dataset.reale) {
      code.replaceChildren();
      code.dataset.reale = '1';
      const demoBadge = $('.demo-surface-badge', $('[data-view="terminal"]'));
      if (demoBadge) demoBadge.hidden = true;
    }
    const workspace = $('#envWorkspace')?.textContent || 'talos';
    const rigaPrompt = document.createElement('span');
    rigaPrompt.append(
      textElement('span', 'prompt', 'talos'),
      document.createTextNode(' '),
      textElement('span', 'path', `~/${workspace}`),
    );
    code.append(rigaPrompt, document.createTextNode(`\n$ ${comando}\n\n${testo}\n\n`));
    const contenitore = code.closest('.terminal-window');
    if (contenitore) contenitore.scrollTop = contenitore.scrollHeight;
  }

  /**
   * ⭐ Piano §1.3-BIS.T (seconda metà) — il comando diretto (`!comando` nel
   * composer): un endpoint dedicato (`POST .../shell`), FUORI dal ciclo del
   * modello — l'owner sceglie il comando, non un attrezzo che il modello
   * decide di chiamare. Riusa esattamente lo schema già in uso per
   * `resumeSession`: POST, poi una connessione SSE FRESCA (mai quella
   * vecchia — provato nel backend che una connessione già aperta da prima
   * non riceve questi eventi dal vivo).
   */
  async function runDirectShell(comando, silenzioso) {
    if (!state.realSession.id) {
      toast('Nessuna sessione reale attiva', 'Avvia un task dal corpus prima di usare un comando diretto.');
      return;
    }
    const sessionId = state.realSession.id;
    const taskId = state.realSession.taskId;
    try {
      await apiPost(`/api/v1/sessions/${encodeURIComponent(sessionId)}/shell`, { comando });
      const generation = nuovaGenerazioneSessione({ continua: true });
      state.realSession.taskId = taskId;
      collegaEventiSessione(sessionId, generation);
      aggiornaElencoSessioniReali();
      if (!silenzioso) toast('Comando inviato', comando);
    } catch (error) {
      toast('Comando non eseguito', error.message);
    }
  }

  /**
   * ⭐ Piano §1.3, riga Review — ogni scrittura reale aggiorna la scheda
   * Review già esistente, non solo la conversazione. Una voce PER
   * percorso, così un task che scrive più file resta tutto ispezionabile.
   *
   * ⛔ `value` è il contenuto INTERO del file, mai un vero diff riga per
   * riga: talosHarness.mjs non passa il "prima" a onScrittura oggi, solo il
   * "dopo" — 'add' mostra righe verdi (file nuovo), 'replace' righe neutre
   * (file toccato, contenuto attuale) invece di inventare +/- che non ha.
   */
  function updateRealReview(delta) {
    const operazione = delta?.[0];
    if (!operazione || typeof operazione.path !== 'string') return;
    const percorso = operazione.path.replace(/^\/file\//, '');
    state.realSession.reviewFiles.set(percorso, {
      path: percorso,
      nuovo: operazione.op === 'add',
      code: String(operazione.value ?? '').split('\n').map((riga) => [operazione.op === 'add' ? 'add' : 'ctx', riga]),
    });
    renderRealReviewList();
    renderReviewFile(`real:${percorso}`);
  }

  /**
   * ⭐ Ricostruisce `.file-review-list` con UNA voce per file reale scritto
   * finora in questa sessione, sostituendo le voci demo la prima volta che
   * esiste almeno una scrittura vera.
   */
  function renderRealReviewList() {
    const contenitore = $('[data-view="diff"] .file-review-list');
    if (!contenitore) return;
    const voci = [...state.realSession.reviewFiles.values()];
    const ultimoPercorso = voci.at(-1)?.path;
    contenitore.replaceChildren(...voci.map((file) => {
      const attiva = file.path === ultimoPercorso;
      const button = document.createElement('button');
      button.className = `file-review${attiva ? ' active' : ''}`;
      button.dataset.reviewFile = `real:${file.path}`;
      button.setAttribute('aria-pressed', String(attiva));
      const etichetta = document.createElement('span');
      const svgNs = 'http://www.w3.org/2000/svg';
      const icona = document.createElementNS(svgNs, 'svg');
      const uso = document.createElementNS(svgNs, 'use');
      uso.setAttribute('href', '#i-diff'); // ⛔ mai innerHTML: costruito nodo per nodo
      icona.append(uso);
      etichetta.append(icona, textElement('strong', '', file.path.split('/').pop()));
      button.append(etichetta, textElement('span', 'diff-stats', `${file.nuovo ? 'nuovo' : 'modificato'} · ${file.code.length} righe`));
      button.addEventListener('click', () => {
        $$('.file-review', contenitore).forEach((f) => { f.classList.remove('active'); f.setAttribute('aria-pressed', 'false'); });
        button.classList.add('active');
        button.setAttribute('aria-pressed', 'true');
        renderReviewFile(button.dataset.reviewFile);
      });
      return button;
    }));
    const titolo = $('[data-view="diff"] .view-heading h2');
    if (titolo) titolo.textContent = `${voci.length} file modificat${voci.length === 1 ? 'o' : 'i'}`;
  }

  /**
   * ⭐ Piano §1.3, riga "Contesto workspace" — l'albero file REALE, un
   * livello alla volta (GET /api/v1/sessions/:id/tree?percorso=...): le
   * cartelle sono bottoni che scendono di un livello, ".. (su)" risale.
   */
  async function aggiornaAlberoReale(percorso = '') {
    if (!state.realSession.id) return;
    const contenitore = $('#inspector-files .file-tree');
    if (!contenitore) return;
    let voci;
    try {
      voci = (await apiGet(`/api/v1/sessions/${encodeURIComponent(state.realSession.id)}/tree?percorso=${encodeURIComponent(percorso)}`)).voci;
    } catch {
      return; // ⛔ un fallimento qui non è un'azione richiesta, non merita un toast
    }
    state.realSession.treePercorso = percorso;
    const demoBadge = $('.demo-surface-badge', $('[data-inspector-section="files"]'));
    if (demoBadge) demoBadge.hidden = true;

    const svgNs = 'http://www.w3.org/2000/svg';
    const iconaCon = (id) => {
      const svg = document.createElementNS(svgNs, 'svg');
      const uso = document.createElementNS(svgNs, 'use');
      uso.setAttribute('href', `#${id}`);
      svg.append(uso);
      return svg;
    };

    const radice = document.createElement('div');
    radice.className = 'tree-root';
    radice.append(iconaCon('i-files'), textElement('strong', '', percorso || state.realSession.taskId || 'workspace'));
    const pezzi = [radice];

    if (percorso) {
      const su = document.createElement('button');
      su.textContent = '.. (su)';
      const genitore = percorso.split('/').slice(0, -1).join('/');
      su.addEventListener('click', () => aggiornaAlberoReale(genitore));
      pezzi.push(su);
    }
    for (const voce of voci) {
      const button = document.createElement('button');
      if (voce.cartella) button.className = 'nested';
      button.textContent = voce.cartella ? `${voce.nome}/` : voce.nome;
      if (voce.cartella) {
        const dentro = percorso ? `${percorso}/${voce.nome}` : voce.nome;
        button.addEventListener('click', () => aggiornaAlberoReale(dentro));
      }
      pezzi.push(button);
    }
    contenitore.replaceChildren(...pezzi);
  }

  /**
   * ⭐ Il pannello "Ambiente" del Context Rail — prima statico/demo.
   * `branch`/`worktree` mostrano "—" quando non applicabili — un trattino
   * onesto, MAI il valore demo lasciato al suo posto.
   */
  function aggiornaPannelloAmbiente(contesto) {
    const workspace = $('#envWorkspace');
    const branch = $('#envBranch');
    const worktree = $('#envWorktree');
    const root = $('#envRoot');
    if (workspace) workspace.textContent = contesto.progetto || '—';
    if (branch) branch.textContent = contesto.branch || '—';
    if (worktree) worktree.textContent = '—'; // mai un repository git nel corpus di oggi, vedi doc in workspace-context.mjs
    if (root) root.textContent = contesto.cartella;
    const sezione = $('[data-inspector-section="context"]');
    const demoBadge = sezione && $('.demo-surface-badge', sezione);
    if (demoBadge) demoBadge.hidden = true;
  }

  function handleRealEvent(evento, generation) {
    if (generation !== state.realSession.generation) return; // sessione più vecchia: scartato, non renderizzato
    switch (evento.type) {
      case 'RunStarted': {
        state.realSession.runCount = (state.realSession.runCount || 0) + 1;
        if (!state.realSession.taskBubbleMostrata && evento.input) {
          appendRealTaskStart(evento.input);
        } else if (state.realSession.runCount > 1) {
          appendStatusNote('Nuovo giro iniziato sulla stessa conversazione.');
        }
        if (evento.contesto) aggiornaPannelloAmbiente(evento.contesto);
        aggiornaAlberoReale('');
        break;
      }
      case 'TextMessageContent': {
        const element = ensureAssistantMessageElement(evento.messageId);
        $('.assistant-copy', element).textContent += evento.delta;
        break;
      }
      case 'ToolCallStart': {
        appendToolNote(`🔧 ${evento.toolCallName}(…)`);
        /*
         * ⭐ Ricordato SOLO per riconoscere in ToolCallResult se questa
         * chiamata era "shell" (dal modello, dentro un task, O dal
         * comando diretto dell'owner — stesso attrezzo, stesso evento) e
         * specchiarla nella vista Terminale. Non cambia il rendering
         * generico sopra, già esistente.
         */
        state.realSession.toolCallNomi.set(evento.toolCallId, { nome: evento.toolCallName, argomenti: '' });
        break;
      }
      case 'ToolCallArgs': {
        const ultima = $$('.real-tool-note .assistant-copy').at(-1);
        if (ultima) ultima.textContent += `\n${evento.delta}`;
        const info = state.realSession.toolCallNomi.get(evento.toolCallId);
        if (info) info.argomenti += evento.delta;
        break;
      }
      case 'ToolCallResult': {
        const info = state.realSession.toolCallNomi.get(evento.toolCallId);
        if (info?.nome === 'shell') {
          let comando = '(comando)';
          try { comando = JSON.parse(info.argomenti).comando || comando; } catch { /* args incompleti o non ancora arrivati: meglio un'etichetta onesta che un crash */ }
          appendTerminalEntry(comando, String(evento.content));
        }
        state.realSession.toolCallNomi.delete(evento.toolCallId);
        appendToolNote(`→ ${String(evento.content).slice(0, 2000)}`);
        break;
      }
      case 'StateDelta': {
        updateRealReview(evento.delta);
        aggiornaAlberoReale(state.realSession.treePercorso);
        appendStatusNote('✏️ File scritto — vedi la scheda Review per il contenuto intero.');
        break;
      }
      case 'RunFinished': {
        appendStatusNote(evento.result?.detto || 'Task concluso.');
        /*
         * ⛔⛔ 27/8, trovato verificando il comando diretto: QUI si chiudeva
         * l'EventSource lato browser (closeRealSession, rimossa) — giusto
         * quando una sessione aveva un giro solo, sbagliato ora che può
         * averne di più (un resume, un comando diretto): durante il REPLAY
         * di una cronologia con due giri, questo troncava la vista alla
         * fine del PRIMO RunFinished, esattamente come il gemello lato
         * server corretto poco fa in http-app.mjs (stessa famiglia di
         * difetto, due lati). Ora si aspetta che sia il SERVER a chiudere
         * lo stream (lo fa già, correttamente, solo a replay finito e
         * senza un giro dal vivo dietro) — si segna solo che l'ultimo
         * evento era terminale, per onerror.
         */
        state.realSession.eventoTerminaleVisto = true;
        aggiornaElencoSessioniReali(); // lo stato in #sessionList passa da "in corso" a "concluso" (visibile solo standalone, vedi nota di testa)
        break;
      }
      case 'RunError': {
        appendStatusNote(`${evento.code ? `[${evento.code}] ` : ''}${evento.message}`, true);
        state.realSession.eventoTerminaleVisto = true;
        break;
      }
      default:
        break;
    }
  }

  /** Apre l'EventSource per una sessione GIÀ avviata sul server e collega gli eventi al rendering reale. */
  /*
   * ⛔ 27/8, buco trovato eseguendo la PRIMA sessione vera end-to-end
   * (piano §1.3-BIS, blocco 1): il badge "Demo UI · non collegato" della
   * chat restava visibile anche con una conversazione reale a schermo —
   * a differenza di Board/contesto/file-tree/foglio, la chat non aveva
   * MAI un punto che lo nascondesse. `collegaEventiSessione` è l'unico
   * luogo comune a `startRealSession` E `passaASessione` (la seconda non
   * passa da `handleRealEvent`/RunStarted se la sessione è già conclusa
   * e si sta solo rivedendo la sua cronologia) — un solo punto, non due.
   *
   * ⛔⛔ Prima versione cercava il PRIMO `.demo-surface-badge` sotto
   * `.chat-view` — sbagliato, scoperto da un test scritto apposta:
   * `nuovaGenerazioneSessione()` (chiamata da entrambi i chiamanti PRIMA
   * di questa funzione) svuota `#conversation` con `replaceChildren()`,
   * portando via CON SÉ sia il badge della chat sia quello di
   * `.approval-card` (entrambi vivono lì dentro) — il primo badge ancora
   * in piedi sotto `.chat-view` a quel punto è quello di `.queued-message`
   * (fuori da `#conversation`, dentro `.composer-wrap`), una superficie
   * SENZA relazione con "la chat è collegata". Il selettore ora risale
   * dal badge al suo `[data-demo-surface]` più vicino e lo accetta solo
   * se è ESATTAMENTE "chat" — mai un altro badge per coincidenza di
   * posizione. Nel caso comune (badge già svuotato dal wipe) trova
   * `undefined` e non fa niente: l'assenza del badge è già l'esito
   * corretto, cercare non serve più ma non deve nuocere.
   */
  function collegaEventiSessione(sessionId, generation) {
    state.realSession.id = sessionId;
    state.realSession.eventoTerminaleVisto = false;
    const demoBadgeChat = $$('.demo-surface-badge', $('.chat-view'))
      .find((badge) => badge.closest('[data-demo-surface]')?.dataset.demoSurface === 'chat');
    if (demoBadgeChat) demoBadgeChat.hidden = true;
    const source = new EventSource(`/api/v1/sessions/${encodeURIComponent(sessionId)}/events`);
    state.realSession.eventSource = source;
    source.onmessage = (message) => {
      let evento;
      try { evento = JSON.parse(message.data); } catch { return; }
      handleRealEvent(evento, generation);
    };
    /*
     * ⛔⛔ 27/8 — riscritto insieme al fix gemello lato server (vedi
     * handleRealEvent, caso RunFinished): EventSource riprova DA SOLO ad
     * OGNI caduta di connessione, inclusa quella che il server fa apposta
     * quando lo stream è davvero finito — per spec non esiste un
     * "readyState CLOSED da solo", solo un client che chiama .close() lo
     * ottiene. Prima lo faceva closeRealSession (rimossa) appena vedeva UN
     * RunFinished — sbagliato con più giri nel buffer, chiudeva al primo.
     * Ora: se l'ULTIMO evento visto era terminale, questa caduta era attesa
     * (il server ha appena chiuso lo stream a posta fatta) — si chiude qui,
     * niente avviso. Altrimenti è una caduta vera: si lascia che
     * EventSource riprovi da solo, un avviso solo se ha già rinunciato.
     */
    source.onerror = () => {
      if (generation !== state.realSession.generation) return;
      if (state.realSession.eventoTerminaleVisto) {
        source.close();
        state.realSession.eventSource = null;
        return;
      }
      if (source.readyState === EventSource.CLOSED) {
        appendStatusNote('Connessione agli eventi interrotta.', true);
      }
    };
  }

  /** Chiude l'EventSource corrente (se c'è) e apre una nuova generazione. */
  function nuovaGenerazioneSessione({ continua = false } = {}) {
    if (state.realSession.eventSource) {
      state.realSession.eventSource.close();
      state.realSession.eventSource = null;
    }
    if (!continua) {
      $('#conversation').replaceChildren();
      state.realSession.messageElements = new Map();
      state.realSession.runCount = 0;
      state.realSession.taskBubbleMostrata = false;
      state.realSession.reviewFiles = new Map();
      state.realSession.treePercorso = '';
    }
    state.realSession.id = null;
    return (state.realSession.generation += 1);
  }

  /**
   * ⛔ Nessun chiamante ancora: vedi la nota di testa del blocco "LA
   * SESSIONE VERA" — manca il punto d'ingresso UX su mobile. Pronta a
   * essere invocata non appena quella decisione arriva.
   */
  async function startRealSession(task) {
    const generation = nuovaGenerazioneSessione();
    state.realSession.taskId = task.id;
    state.session = `Task reale · ${task.id}`;
    sessionTitle.textContent = state.session;
    setView('chat');
    closePanels();
    appendRealTaskStart(task);
    toast('Avvio in corso', `${task.id} · checkout del progetto sul PC che serve questa pagina.`);

    let sessionId;
    try {
      const data = await apiPost('/api/v1/sessions', { taskId: task.id });
      sessionId = data.sessionId;
    } catch (error) {
      if (generation !== state.realSession.generation) return;
      appendStatusNote(`Avvio non riuscito: ${error.message}`, true);
      toast('Avvio non riuscito', error.message);
      return;
    }
    if (generation !== state.realSession.generation) return;
    collegaEventiSessione(sessionId, generation);
    aggiornaElencoSessioniReali();
  }

  async function stopRealSession() {
    if (!state.realSession.id) { toast('Nessuna sessione reale attiva'); return; }
    try {
      await apiPost(`/api/v1/sessions/${encodeURIComponent(state.realSession.id)}/stop`, {});
      toast('Stop richiesto', 'La sessione si ferma al prossimo giro.');
    } catch (error) {
      toast('Stop non riuscito', error.message);
    }
  }

  /*
   * ⭐⭐⭐ 26/8 — seconda metà del porting desktop→mobile: fork/resume/compact/
   * l'elenco sessioni e l'avvio da corpus. Esclusi dal primo giro perché
   * pescano/scrivono su #sessionList — su mobile EMBEDDED quel pannello è
   * nascosto in favore della sidebar nativa Vue (:host(.talos-embedded) in
   * styles.css lo nasconde già, stesso meccanismo della Board demo). Fuori
   * da un mount embedded (bundle aperto standalone, il caso desktop) quel
   * limite non esiste: #sessionList è lo stesso identico elemento visibile
   * che aveva la copia desktop separata — nessuna duplicazione, nessun
   * secondo elenco da inventare.
   *
   * ⛔ Ancora NON agganciate a createNewSession: cambiare cosa fa "Nuova
   * sessione" è la stessa decisione UX già rimandata (vedi il blocco sopra),
   * solo posticipata al perimetro standalone invece che a quello embedded —
   * non è più ovvia solo perché il vincolo tecnico è diverso.
   */

  /**
   * ⭐ Fork reale quando c'è una sessione reale CONCLUSA attiva. Il server
   * rifiuta con SESSION_NOT_READY (409) su una sessione ancora in corso.
   */
  async function forkSession() {
    if (!state.realSession.id) {
      toast('Fork creato', 'Nuovo ramo di conversazione da questo punto.');
      return;
    }
    const idOrigine = state.realSession.id;
    const taskIdOrigine = state.realSession.taskId;
    try {
      const dati = await apiPost(`/api/v1/sessions/${encodeURIComponent(idOrigine)}/fork`, {});
      const generation = nuovaGenerazioneSessione();
      state.realSession.taskId = taskIdOrigine;
      state.session = `Task reale · ${taskIdOrigine} (fork)`;
      sessionTitle.textContent = state.session;
      appendStatusNote(`Fork avviato dalla sessione ${idOrigine.slice(0, 8)}… — stessa cartella, stessa storia.`);
      collegaEventiSessione(dati.sessionId, generation);
      aggiornaElencoSessioniReali();
      toast('Fork creato', 'Nuovo ramo di conversazione da questo punto.');
    } catch (error) {
      toast('Fork non riuscito', error.message);
    }
  }

  /**
   * ⭐ Resume reale quando c'è una sessione reale CONCLUSA attiva. A
   * differenza del fork, torna LO STESSO sessionId: riprende un giro in più
   * sulla stessa conversazione, non ne crea una nuova.
   */
  async function resumeSession() {
    if (!state.realSession.id) { toast('Nessuna sessione reale da riprendere'); return; }
    const sessionId = state.realSession.id;
    const taskId = state.realSession.taskId;
    try {
      await apiPost(`/api/v1/sessions/${encodeURIComponent(sessionId)}/resume`, {});
      // continua:true — STESSA vista: il "Nuovo giro iniziato" lo mostra
      // handleRealEvent quando arriva il RunStarted del giro ripreso.
      const generation = nuovaGenerazioneSessione({ continua: true });
      state.realSession.taskId = taskId;
      collegaEventiSessione(sessionId, generation);
      aggiornaElencoSessioniReali();
      toast('Sessione ripresa', 'Un nuovo giro è iniziato sulla stessa conversazione.');
    } catch (error) {
      toast('Resume non riuscito', error.message);
    }
  }

  /**
   * ⭐ "Compatta ora" reale quando c'è una sessione reale CONCLUSA attiva.
   * Non avvia nessun giro nuovo: sostituisce ciò che una PROSSIMA
   * resume/fork erediterebbe — la conversazione già mostrata non cambia.
   */
  async function compactSession() {
    if (!state.realSession.id) {
      toast('Contesto compattato', '18.7k -> 9.3k token equivalenti.');
      return;
    }
    try {
      const dati = await apiPost(`/api/v1/sessions/${encodeURIComponent(state.realSession.id)}/compact`, {});
      toast(
        dati.compattato ? 'Contesto compattato' : 'Compattazione saltata',
        dati.compattato
          ? 'Il prossimo resume o fork riparte dal riassunto.'
          : 'Il modello non ha risposto: la conversazione resta quella intera.',
      );
    } catch (error) {
      toast('Compattazione non riuscita', error.message);
    }
  }

  /**
   * ⭐⭐⭐ "Cronologia": passa a una sessione GIÀ esistente (viva o conclusa)
   * invece di avviarne una nuova. Non serve leggere la sua storia a parte:
   * aprire l'EventSource la riproduce da sola (iscriviti() nel registro
   * rimanda TUTTI gli eventi già accaduti a chi si collega).
   */
  function passaASessione(sessionId, taskId, nome) {
    if (sessionId === state.realSession.id) { setView('chat'); closePanels(); return; }
    const generation = nuovaGenerazioneSessione();
    state.realSession.taskId = taskId;
    state.session = nome || `Task reale · ${taskId}`; // ⭐ un nome scelto dall'owner vince sul taskId
    sessionTitle.textContent = state.session;
    setView('chat');
    closePanels();
    collegaEventiSessione(sessionId, generation);
    aggiornaElencoSessioniReali();
  }

  function formattaOraSessione(iso) {
    try {
      return new Date(iso).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  }

  function contenitoreSessioniReali() {
    let contenitore = $('#realSessionsBlock');
    if (!contenitore) {
      contenitore = document.createElement('div');
      contenitore.id = 'realSessionsBlock';
      $('#sessionList')?.prepend(contenitore);
    }
    return contenitore;
  }

  /**
   * ⭐⭐⭐ La "cronologia" reale della sidebar — sostituisce (in un blocco
   * suo, sopra le voci demo che restano invariate) un elenco vuoto con
   * quello vero appena almeno una sessione reale esiste. Su mobile
   * EMBEDDED #sessionList resta nascosto da styles.css: questa funzione
   * scrive comunque nel DOM (nessun guard qui, il guard è visivo/CSS,
   * stesso principio già in uso per renderCampaignRuns/Board), pronta a
   * comparire appena il ponte verso la sidebar nativa Vue esisterà.
   */
  async function aggiornaElencoSessioniReali() {
    const contenitore = contenitoreSessioniReali();
    let elenco;
    try {
      elenco = (await apiGet('/api/v1/sessions')).items;
    } catch {
      return; // ⛔ un aggiornamento sidebar fallito non è un'azione richiesta, non merita un toast
    }
    if (elenco.length === 0) { contenitore.replaceChildren(); return; }

    const pezzi = [textElement('div', 'list-heading', 'Sessioni reali')];
    for (const sessione of elenco) {
      const button = document.createElement('button');
      button.className = `session-item real-session-item${sessione.sessionId === state.realSession.id ? ' active' : ''}`;
      button.dataset.realSessionId = sessione.sessionId;
      const main = document.createElement('span');
      main.className = 'session-main';
      const etichetta = sessione.nome || sessione.taskId; // ⭐ un nome scelto dall'owner vince sempre sul taskId
      main.append(
        textElement('strong', '', sessione.forkDa ? `${etichetta} · fork` : etichetta),
        textElement('small', '', sessione.conclusa ? 'concluso' : 'in corso · live'),
      );
      const meta = document.createElement('span');
      meta.className = 'session-meta';
      meta.textContent = formattaOraSessione(sessione.avviataAlle);
      button.append(main, meta);
      button.addEventListener('click', () => passaASessione(sessione.sessionId, sessione.taskId, sessione.nome));
      pezzi.push(button);
    }
    contenitore.replaceChildren(...pezzi);
  }

  /**
   * ⭐ Il foglio "Avvia un task dal corpus". Adattato dall'originale
   * desktop: il metodo nativo bloccante del dialog sostituito con
   * `showEmbeddedDialog`/`closeEmbeddedDialog` (già usati da openSheet),
   * l'unico modo ammesso di aprire #sheetDialog in questo bundle (guardia
   * HARNESS-NATIVE-TOP-LAYER-HITTEST-01) — funziona identico standalone e
   * in shadow root, dialog.show()/dialog.close() non hanno bisogno del
   * comportamento modale nativo qui.
   */
  async function openRealTaskSheet() {
    sheetEyebrow.textContent = 'Task reale';
    sheetTitle.textContent = 'Avvia un task dal corpus';
    sheetBody.replaceChildren(textElement('p', 'board-empty', 'Carico l’elenco dal server…'));
    const demoBadge = $('.demo-surface-badge', sheetDialog);
    if (demoBadge) demoBadge.hidden = true;
    showEmbeddedDialog(sheetDialog);

    let tasks;
    try {
      tasks = (await apiGet('/api/v1/tasks')).items;
    } catch (error) {
      sheetBody.replaceChildren(textElement('p', 'board-empty', `Elenco non disponibile: ${error.message}`));
      return;
    }

    const section = document.createElement('div');
    section.className = 'sheet-section';
    section.appendChild(textElement('span', 'sheet-label', `${tasks.length} task dal corpus progetti/ — checkout ed esecuzione reali`));
    for (const task of tasks) {
      const button = document.createElement('button');
      button.className = 'sheet-option';
      button.dataset.startTask = task.id;
      const iconWrap = document.createElement('span');
      iconWrap.className = 'sheet-icon';
      iconWrap.innerHTML = icon('i-play');
      const textWrap = document.createElement('span');
      textWrap.append(textElement('strong', '', task.id), textElement('small', '', task.consegnaCorta));
      button.append(iconWrap, textWrap, textElement('span', '', `difficoltà ${task.difficolta}`));
      button.addEventListener('click', () => { closeEmbeddedDialog(sheetDialog); startRealSession(task); });
      section.appendChild(button);
    }
    sheetBody.replaceChildren(section);
  }

  function appendUserMessage(text) {
    const conversation = $('#conversation');
    const article = document.createElement('article');
    article.className = 'message user-message motion-enter';
    article.innerHTML = `<div class="message-bubble"></div><div class="message-meta"><span>Tu · ora</span><button class="mini-icon" aria-label="Copia">${icon('i-copy')}</button></div>`;
    $('.message-bubble', article).textContent = text;
    conversation.appendChild(article);
    const assistant = document.createElement('article');
    assistant.className = 'message assistant-message compact-message motion-enter';
    assistant.innerHTML = `<div class="assistant-meta"><span class="talos-glyph">T</span><span>TALOS · ${state.model.split(' · ')[0]}</span><span>ora</span></div><div class="assistant-copy">Ricevuto. Ho aggiunto il messaggio al run corrente mantenendo ambiente, permessi e contesto visibili.</div><div class="message-actions"><button data-message-action="copy" aria-label="Copia risposta">${icon('i-copy')}</button><button data-message-action="like" aria-label="Risposta utile" aria-pressed="false">👍</button><button data-message-action="dislike" aria-label="Risposta non utile" aria-pressed="false">👎</button><button data-message-action="retry" aria-label="Rigenera risposta">${icon('i-history')}</button></div>`;
    conversation.appendChild(assistant);
    window.setTimeout(() => article.scrollIntoView({ behavior: document.body.classList.contains('reduce-motion') ? 'auto' : 'smooth', block: 'center' }), 40);
  }

  function submitPrompt(text) {
    const value = String(text || '').trim();
    if (!value) return false;
    if (value.startsWith('!')) {
      const hidden = value.startsWith('!!');
      const comando = value.replace(/^!!?/, '').trim();
      setView('terminal');
      if (!comando) { toast('Comando vuoto', 'Scrivi qualcosa dopo "!".'); return true; }
      runDirectShell(comando, hidden);
      return true;
    }
    if (state.queueMode) {
      queuedMessage.classList.add('show', 'motion-enter');
      const queuedCopy = $('#queuedMessage span');
      queuedCopy.textContent = '';
      const queuedLabel = document.createElement('b');
      queuedLabel.textContent = 'Follow-up in coda';
      queuedCopy.append(queuedLabel, document.createTextNode(` · ${value}`));
      toast('Follow-up accodato', 'Verrà consegnato dopo il run corrente.');
    } else {
      appendUserMessage(value);
    }
    return true;
  }

  function announceComposerAction(action) {
    if (action === 'references') {
      openSheet('references');
      return true;
    }
    if (action === 'permissions') {
      openSheet('permissions');
      return true;
    }
    if (action === 'new_session') {
      createNewSession();
      return true;
    }
    const copy = {
      attach: ['Allegato demo', 'Il selettore è UI locale e non carica file reali.'],
      photo: ['Fotocamera demo', 'Nessuna foto è stata acquisita.'],
      photos: ['Galleria demo', 'Nessuna immagine è stata importata.'],
      browse: ['Browse demo', 'Lo stato resta locale a questa sessione Codice.'],
      enhance: ['Miglioramento demo', 'Nessun modello è stato chiamato.'],
      'enhance-blocked': ['Miglioramento non collegato', 'Questa superficie resta locale.'],
      'refresh-models': ['Profili demo', 'Nessuna discovery di rete eseguita.'],
      'browser-url': ['Browser demo', 'Nessuna navigazione esterna eseguita.'],
      attach_file: ['Allegato demo', 'Il selettore è UI locale e non carica file reali.'],
      export_report: ['Export demo', 'Nessun rapporto reale è stato prodotto.'],
    };
    const feedback = copy[action] || ['Demo UI · non collegato', 'Azione locale registrata senza backend.'];
    toast(...feedback);
    return true;
  }

  function autoGrowTextarea() {
    const explicitLines = composerInput.value.split('\n').length;
    composerInput.rows = Math.min(5, Math.max(1, explicitLines));
  }

  /*
   * ⭐⭐⭐ 26/8 — il trigger su desktop standalone. Owner: "abbiamo già la
   * grammatica... va adattata", non una decisione UX da inventare da zero.
   * La grammatica è openRealTaskSheet() (26/8, mattina: porta i task veri
   * dal corpus, mai collegata a un tocco) — su mobile resta non collegata
   * perché la superficie "Codice" è negoziata in OTTO fasi (non è mia da
   * riaprire), ma su desktop standalone non c'è quel vincolo: il backend
   * oggi sa far partire SOLO un task del corpus (talosLavora vuole una
   * `cartella` e una `consegna` note, non un prompt libero — piano
   * `elegant-spinning-dongarra.md` §1.5, Opzione B esplicitamente fuori
   * fase), quindi mostrare qui il reset da chat vuota sarebbe demo, non
   * realtà. embedded (mobile) invariato bit per bit — stesso identico
   * comportamento di sempre, zero rischio sulla suite Pad-verificata.
   */
  function createNewSession() {
    if (!HOST().classList.contains('talos-embedded')) {
      openRealTaskSheet();
      return;
    }
    state.session = 'Nuova sessione';
    sessionTitle.textContent = state.session;
    $$('.session-item').forEach((item) => item.classList.remove('active'));
    setView('chat');
    closePanels();
    toast('Nuova sessione', 'La sessione verrà creata al primo invio.');
    composerInput.focus();
  }

  function selectSession(selection) {
    if (!selection || typeof selection.id !== 'string' || typeof selection.title !== 'string') return false;
    const item = $$('.session-item').find((candidate) => candidate.dataset.sessionId === selection.id);
    if (!item) return false;
    $$('.session-item').forEach((other) => other.classList.remove('active'));
    item.classList.add('active');
    state.session = selection.title;
    $$('[data-current-session-title]').forEach((label) => { label.textContent = state.session; });
    const itemTitle = $('.session-main strong', item);
    if (itemTitle) itemTitle.textContent = state.session;
    closePanels();
    setView('chat');
    return true;
  }

  function exportSession() {
    const payload = {
      schema: 'talos_mock_session_v1',
      exported_at: new Date().toISOString(),
      session: state.session,
      model: state.model,
      permissions: state.permissions,
      branch: 'feat/mobile-code',
      worktree: 'wt/auth-61c',
      note: 'Interactive TALOS frontend mockup export',
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'talos-session-export.json'; a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 500);
    toast('Sessione esportata', 'JSON pronto.');
  }

  async function shareSession() {
    const text = `TALOS · ${state.session} · feat/mobile-code`;
    try {
      if (navigator.share) await navigator.share({ title: state.session, text });
      else if (navigator.clipboard) { await navigator.clipboard.writeText(text); toast('Snapshot copiato', 'Pronto da condividere.'); }
      else toast('Snapshot pronto', text);
    } catch (error) {
      if (error?.name !== 'AbortError') toast('Condivisione non disponibile', text);
    }
  }

  function announceVoiceUnavailable() {
    toast('Voce demo non collegata', 'Il microfono non registra e non invia audio in questa superficie.');
  }

  function visibleCommandButtons() {
    return $$('#commandResults button[data-command]').filter((button) => !button.hidden);
  }

  function setActiveCommand(button) {
    $$('#commandResults button[data-command]').forEach((item) => item.classList.toggle('command-active', item === button));
    button?.scrollIntoView({ block: 'nearest' });
  }

  function openCommandPalette() {
    showEmbeddedDialog(commandDialog);
    commandSearch.value = '';
    filterCommands('');
    window.setTimeout(() => commandSearch.focus(), 20);
  }

  function filterCommands(query) {
    const q = query.trim().toLowerCase();
    $$('#commandResults button[data-command]').forEach((button) => {
      button.hidden = Boolean(q && !button.textContent.toLowerCase().includes(q));
    });
    const visible = visibleCommandButtons();
    if (commandEmpty) commandEmpty.hidden = visible.length > 0;
    setActiveCommand(visible[0] || null);
  }

  function moveActiveCommand(delta) {
    const visible = visibleCommandButtons();
    if (!visible.length) return;
    const current = visible.findIndex((button) => button.classList.contains('command-active'));
    const next = visible[(current + delta + visible.length) % visible.length];
    setActiveCommand(next);
  }

  function executeCommand(command) {
    closeEmbeddedDialog(commandDialog);
    switch (command) {
      case 'new': createNewSession(); break;
      case 'review': setView('diff'); break;
      case 'terminal': setView('terminal'); break;
      case 'browser': setView('browser'); break;
      case 'permissions': openSheet('permissions'); break;
      case 'dashboard': setView('dashboard'); break;
      case 'fork': toast('Fork creato', 'Nuovo ramo di conversazione da questo punto.'); break;
      case 'compact': toast('Contesto compattato', '18.7k -> 9.3k token equivalenti.'); break;
      case 'tree': openSheet('sessionTree'); break;
      case 'skills': openSheet('capabilities'); break;
      case 'control': openSheet('control'); break;
      case 'rename': openSheet('rename'); break;
      case 'export': exportSession(); break;
      case 'share': shareSession(); break;
      default: break;
    }
  }

  $$('[data-open-panel]').forEach((button) => button.addEventListener('click', () => {
    if (button.dataset.openPanel === 'sessions' && HOST().classList.contains('talos-embedded')) {
      window.__talosHarnessHostBack?.();
    } else if (button.classList.contains('desktop-context-toggle') && button.dataset.openPanel === 'inspector' && window.innerWidth > 1040) toggleDesktopInspector();
    else openPanel(button.dataset.openPanel);
  }));
  $$('[data-close-panel]').forEach((button) => button.addEventListener('click', closePanels));
  backdrop.addEventListener('click', closePanels);

  $$('[data-open-view]').forEach((button) => button.addEventListener('click', () => { setView(button.dataset.openView); closePanels(); }));
  mobileViewButtons.forEach((button) => button.addEventListener('click', () => setView(button.dataset.mobileView)));

  modeTabs.forEach((button) => {
    button.addEventListener('click', () => {
      if (button.dataset.mode === 'chat') {
        setView('chat', { mode: 'chat' });
        if (window.innerWidth <= 1040) closePanels();
      } else if (button.dataset.mode === 'split') {
        setView('chat', { mode: 'split' });
        openPanel('inspector');
      } else {
        setView('dashboard', { mode: 'dashboard' });
      }
    });
  });

  $$('[data-open-sheet]').forEach((button) => button.addEventListener('click', () => openSheet(button.dataset.openSheet)));
  $$('[data-session-action]').forEach((button) => button.addEventListener('click', () => {
    toast(button.dataset.sessionAction === 'fork' ? 'Fork creato' : 'Side thread creato', 'Contesto isolato, collegamento mantenuto nel grafo sessione.');
  }));
  $$('[data-control-action]').forEach((button) => button.addEventListener('click', () => {
    if (button.dataset.controlAction === 'doctor') toast('Doctor: Healthy', 'Provider, shell, git, browser e workspace verificati.');
  }));
  $('#capabilityBtn').addEventListener('click', () => openSheet('capabilities'));
  $('#manageCapabilitiesBtn').addEventListener('click', () => openSheet('capabilities'));
  $('#closeSheet').addEventListener('click', () => closeEmbeddedDialog(sheetDialog));

  $$('.inspector-tabs button').forEach((button) => {
    button.addEventListener('click', () => setInspectorTab(button));
    button.addEventListener('keydown', (event) => {
      if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      event.preventDefault();
      const tabs = $$('.inspector-tabs button');
      const index = tabs.indexOf(button);
      const next = tabs[(index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length];
      next.focus();
      setInspectorTab(next);
    });
  });

  $$('[data-collapse-target]').forEach((button) => {
    button.addEventListener('click', () => {
      const target = ROOT().getElementById(button.dataset.collapseTarget);
      if (!target) return;
      const collapsed = target.classList.contains('collapsed');
      button.setAttribute('aria-expanded', String(collapsed));
      if (collapsed) {
        target.classList.remove('collapsed');
        markMotionEnter(target);
      } else {
        animateExit(target, { durationToken: '--talos-motion-duration-disclosure' }, () => target.classList.add('collapsed'));
      }
    });
  });

  $$('[data-tool-detail]').forEach((button) => {
    button.setAttribute('aria-expanded', 'false');
    button.addEventListener('click', () => toggleToolDetail(button));
  });

  /*
   * Owner 24/8: era `document.addEventListener` — su tutta la pagina andava
   * bene perché la pagina ERA il mockup. Montato nello shadow root, un
   * ascoltatore su `document` riceverebbe l'evento RIETICHETTATO (event.target
   * diventa l'host, non il bottone vero dentro — retargeting di spec) e
   * continuerebbe ad ascoltare anche quando l'utente è altrove nell'app.
   * Sullo shadow root invece l'evento porta il target vero, e l'ascoltatore
   * smette di ricevere nulla da solo quando lo shadow root muore col
   * componente Vue — nessuna pulizia esplicita necessaria per questi due.
   */
  ROOT().addEventListener('click', (event) => {
    const copyButton = event.target.closest('[data-copy-message]');
    if (copyButton) {
      const message = copyButton.closest('.message');
      copyText($('.message-bubble, .assistant-copy', message)?.textContent || '', 'Messaggio copiato');
      return;
    }
    const actionButton = event.target.closest('[data-message-action]');
    if (!actionButton) return;
    const message = actionButton.closest('.assistant-message');
    const action = actionButton.dataset.messageAction;
    if (action === 'copy') copyText($('.assistant-copy', message)?.textContent || '', 'Risposta copiata');
    if (action === 'retry') toast('Rigenerazione avviata', 'Il contesto e i permessi della sessione restano invariati.');
    if (action === 'like' || action === 'dislike') {
      const group = $$('.message-actions [data-message-action="like"], .message-actions [data-message-action="dislike"]', message);
      const wasPressed = actionButton.getAttribute('aria-pressed') === 'true';
      group.forEach((button) => button.setAttribute('aria-pressed', 'false'));
      actionButton.setAttribute('aria-pressed', String(!wasPressed));
      toast(!wasPressed ? 'Feedback registrato' : 'Feedback rimosso');
    }
  });

  $$('[data-browser-action]').forEach((button) => button.addEventListener('click', () => {
    const labels = { back: 'Indietro', forward: 'Avanti', reload: 'Preview ricaricata', annotate: 'Modalità annotazione', inspect: 'Inspector browser' };
    toast(labels[button.dataset.browserAction] || 'Browser', 'Azione simulata nel mockup locale.');
  }));

  const demoActionCopy = {
    notifications: ['Notifiche demo', 'La superficie non è collegata a notifiche reali.'],
    widget: ['Widget demo', 'L’aggiunta sarà disponibile quando questa Board avrà un backend.'],
    delegate: ['Delega demo', 'Nessun subagent è stato avviato da questa interfaccia.'],
  };
  $$('[data-demo-action]').forEach((button) => button.addEventListener('click', () => {
    toast(...(demoActionCopy[button.dataset.demoAction] || ['Demo UI · non collegato', 'Nessuna azione reale eseguita.']));
  }));

  $$('[data-file-entry]').forEach((button) => button.addEventListener('click', () => {
    $$('[data-file-entry]').forEach((entry) => entry.classList.toggle('active', entry === button));
    toast('Elemento selezionato', button.textContent.trim());
  }));

  /*
   * ⭐ 27/8, piano §1.3-BIS, blocco Automazioni — riusa startRealSession
   * (già reale, già testata) invece di un toast: "Esegui ora" su una riga
   * con data-task-id avvia per davvero quel task del corpus, la stessa
   * strada di "Nuova sessione". La SCHEDULAZIONE vera (un cron che parte
   * da solo, senza un tocco) resta dichiaratamente fuori — spenderebbe
   * credito reale senza nessuno a guardare, una cosa diversa da un
   * bottone premuto apposta, e vuole la sua stessa persistenza che oggi
   * non c'è (session-registry.mjs, "solo in memoria, deliberato").
   */
  $$('[data-automation-action]').forEach((button) => button.addEventListener('click', () => {
    const action = button.dataset.automationAction;
    // ⛔ Stesso cancello di createNewSession(): su mobile embedded non c'è un
    // backend raggiungibile per costruzione, mai un fetch lì (HARNESS-BOARD-
    // MOBILE-HONESTY-01, stesso principio applicato qui).
    if (action === 'run' && button.dataset.taskId && !HOST().classList.contains('talos-embedded')) {
      startRealSession({ id: button.dataset.taskId });
      return;
    }
    const labels = { new: ['Nuova automazione', 'Il mockup rappresenta il flusso senza backend.'], run: ['Run avviato', 'Il mockup rappresenta il flusso senza backend.'], edit: ['Automazione aperta', 'Il mockup rappresenta il flusso senza backend.'] };
    toast(...(labels[action] || ['Automazione', 'Il mockup rappresenta il flusso senza backend.']));
  }));

  $('.stop-run')?.addEventListener('click', () => {
    if (!state.running) return;
    setRunState(false);
    setQueueMode(false);
    toast('Esecuzione interrotta', 'Stato, diff e output restano disponibili per la review.');
  });

  runStateToggle?.addEventListener('click', () => setQueueMode(!state.queueMode, true));

  $('#sessionSearch').addEventListener('input', (event) => {
    const q = event.target.value.toLowerCase().trim();
    $$('.session-item').forEach((item) => item.hidden = q && !item.textContent.toLowerCase().includes(q));
  });

  $$('.session-item').forEach((item) => {
    item.addEventListener('click', () => {
      selectSession({
        id: item.dataset.sessionId || '',
        title: item.dataset.session || item.querySelector('.session-main strong')?.textContent || '',
      });
    });
  });

  $('#newSessionBtn').addEventListener('click', createNewSession);
  $('#commandPaletteBtn').addEventListener('click', openCommandPalette);
  $('#closeCommand')?.addEventListener('click', () => closeEmbeddedDialog(commandDialog));
  harnessDialogBackdrop.addEventListener('click', dismissTransientLayers);
  commandSearch.addEventListener('input', () => filterCommands(commandSearch.value));
  commandSearch.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown') { event.preventDefault(); moveActiveCommand(1); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); moveActiveCommand(-1); }
    else if (event.key === 'Enter') {
      const active = $('#commandResults .command-active[data-command]');
      if (active) { event.preventDefault(); executeCommand(active.dataset.command); }
    }
  });
  $$('#commandResults button[data-command]').forEach((button) => {
    button.addEventListener('mouseenter', () => setActiveCommand(button));
    button.addEventListener('click', () => executeCommand(button.dataset.command));
  });

  composerInput.addEventListener('input', () => {
    autoGrowTextarea();
    const value = composerInput.value;
    if (value === '/') openCommandPalette();
    if (/@[^\s]*$/.test(value) && value.endsWith('@')) openSheet('references');
  });
  composerInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      composerForm.requestSubmit();
    }
  });

  queueToggle.addEventListener('click', () => setQueueMode(!state.queueMode));
  composerMic?.addEventListener('click', announceVoiceUnavailable);

  composerForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const text = composerInput.value.trim();
    if (!submitPrompt(text)) return;
    composerInput.value = '';
    autoGrowTextarea();
  });

  $('#cancelQueued').addEventListener('click', () => {
    animateExit(queuedMessage, { durationToken: '--talos-motion-duration-composer-collapse' }, () => {
      queuedMessage.classList.remove('show');
    });
    toast('Follow-up annullato');
  });

  $$('[data-approve], [data-allow-session], [data-deny]').forEach((button) => {
    button.addEventListener('click', () => {
      const card = button.closest('.approval-card');
      animateExit(card, {}, () => card?.remove());
      if (button.hasAttribute('data-deny')) toast('Permesso negato', 'Il browser locale non verrà aperto.');
      else toast(button.hasAttribute('data-allow-session') ? 'Permesso per sessione' : 'Permesso concesso', 'Browser locale autorizzato.');
    });
  });

  $('#approveAllDiffs').addEventListener('click', () => {
    toast('Review approvata', '3 file pronti per il gate finale.');
    $$('.file-review').forEach((file) => { file.classList.remove('active'); file.setAttribute('aria-pressed', 'false'); });
  });

  $$('.file-review').forEach((button) => {
    button.addEventListener('click', () => {
      $$('.file-review').forEach((file) => {
        const active = file === button;
        file.classList.toggle('active', active);
        file.setAttribute('aria-pressed', String(active));
      });
      renderReviewFile(button.dataset.reviewFile);
    });
  });

  $$('[data-review-action]').forEach((button) => button.addEventListener('click', () => {
    toast(button.dataset.reviewAction === 'comment' ? 'Commento inline pronto' : 'File aperto nel workspace', diffPath?.textContent || 'Review');
  }));

  $('#reducedMotionToggle').addEventListener('change', (event) => {
    document.body.classList.toggle('reduce-motion', event.target.checked);
    toast('Movimento', event.target.checked ? 'Ridotto' : 'Standard');
  });

  campaignSelect?.addEventListener('change', () => {
    state.board.campaign = campaignSelect.value;
    harnessFilter.value = '';
    outcomeFilter.value = '';
    refreshCampaign();
  });
  harnessFilter?.addEventListener('change', reloadRunsFromFilters);
  outcomeFilter?.addEventListener('change', reloadRunsFromFilters);
  refreshCampaignButton?.addEventListener('click', () => {
    if (HOST().classList.contains('talos-embedded')) renderEmbeddedBoardDemo(true);
    else if (state.board.initialized) refreshCampaign();
    else ensureCampaignBoard();
  });
  loadMoreRunsButton?.addEventListener('click', async () => {
    const dashboard = $('[data-view="dashboard"]');
    const scrollTop = dashboard.scrollTop;
    const firstNewIndex = state.board.runs.length;
    loadMoreRunsButton.disabled = true;
    try {
      await loadCampaignRuns({ append: true });
      dashboard.scrollTop = scrollTop;
    } catch (error) {
      setConnectionState('error', 'Paginazione non disponibile', boardErrorMessage(error));
    } finally {
      loadMoreRunsButton.disabled = false;
      const focusTarget = loadMoreRunsButton.hidden
        ? campaignRunList.querySelectorAll('.campaign-run-toggle')[firstNewIndex]
        : loadMoreRunsButton;
      focusTarget?.focus({ preventScroll: true });
    }
  });
  $('[data-action="clear-evidence"]')?.addEventListener('click', clearCampaignEvidence);

  ROOT().addEventListener('keydown', (event) => {
    const mod = event.metaKey || event.ctrlKey;
    if (mod && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      openCommandPalette();
    }
    if (mod && event.key.toLowerCase() === 'n') {
      event.preventDefault();
      createNewSession();
    }
    if (event.key === 'Escape' && (commandDialog.open || sheetDialog.open)) dismissTransientLayers();
    else if (event.key === 'Escape' && (sessionsPanel.classList.contains('open') || inspectorPanel.classList.contains('open'))) closePanels();
  });

  /*
   * Owner 24/8: questi tre, a differenza dei due sopra, vivono su `window` —
   * escono dallo shadow root e NON muoiono col componente Vue. Prima (pagina
   * a sé, `window.location.assign`) lasciare la pagina uccideva l'intero
   * contesto JS, pulizia gratis. Ora no: se l'utente esce da Harness e resta
   * su questi tre, `onResize` continuerebbe a leggere/scrivere pannelli di
   * uno shadow root ormai smontato. `window.__talosHarnessDestroy()` li
   * rimuove — `HarnessSessionScreen.vue` la chiama nel suo `onBeforeUnmount`,
   * lo stesso contratto del "destroyer" che le app incorporate reali usano
   * (es. PagerDuty: https://www.pagerduty.com/eng/react-embedded-apps/).
   */
  let hostResizeObserver = null;

  function syncHostLayout() {
    const host = HOST();
    const rect = host.getBoundingClientRect();
    const wideShort = host.classList.contains('talos-embedded')
      && rect.width > 780
      && rect.width <= 900
      && rect.height <= 500;
    host.classList.toggle('talos-embedded-wide-short', wideShort);
  }

  function onResize() {
    if (window.innerWidth > 1040) {
      inspectorPanel.classList.remove('open');
      backdrop.classList.remove('show');
    } else {
      appShell.classList.remove('inspector-collapsed');
    }
    if (window.innerWidth > 780) sessionsPanel.classList.remove('open');
    syncInspectorToggle();
    syncHostLayout();
    syncVisualViewport();
  }
  window.addEventListener('resize', onResize);
  window.visualViewport?.addEventListener('resize', syncVisualViewport);
  window.visualViewport?.addEventListener('scroll', syncVisualViewport);
  if (HOST().classList.contains('talos-embedded')) {
    embeddedHeaderScrollers.forEach((scroller) => {
      embeddedHeaderScrollPositions.set(scroller, Math.max(0, scroller.scrollTop));
      scroller.addEventListener('scroll', handleEmbeddedContentScroll, { passive: true });
    });
  }
  if (typeof ResizeObserver === 'function') {
    hostResizeObserver = new ResizeObserver(syncHostLayout);
    hostResizeObserver.observe(HOST());
  }
  window.__talosHarnessUiRuntime = {
    selectSession,
    dismissTransientLayers,
    transientLayersActive,
    setKeyboardOpen,
    submitPrompt,
    announceComposerAction,
    // ⭐ 26/8, riconciliazione desktop→mobile — esposti per i test dedicati
    // (stesso schema di sopra: internals reali, non un secondo contratto).
    startRealSession,
    stopRealSession,
    handleRealEvent,
    forkSession,
    resumeSession,
    compactSession,
    passaASessione,
    openRealTaskSheet,
    aggiornaElencoSessioniReali,
    runDirectShell,
    realSessionState: state.realSession,
  };
  window.__talosHarnessDestroy = () => {
    cancelMotionAnimations();
    setEmbeddedTopbarHidden(false);
    embeddedHeaderScrollers.forEach((scroller) => {
      scroller.removeEventListener('scroll', handleEmbeddedContentScroll);
      embeddedHeaderScrollPositions.delete(scroller);
    });
    window.removeEventListener('resize', onResize);
    window.visualViewport?.removeEventListener('resize', syncVisualViewport);
    window.visualViewport?.removeEventListener('scroll', syncVisualViewport);
    hostResizeObserver?.disconnect();
    hostResizeObserver = null;
    HOST().classList.remove('talos-embedded-wide-short');
    nativeKeyboardOpen = null;
    applyKeyboardOpen(false);
    delete window.__talosHarnessUiRuntime;
    delete window.__talosHarnessDestroy;
  };
  composerInput.addEventListener('focus', () => window.setTimeout(syncVisualViewport, 30));
  composerInput.addEventListener('blur', () => window.setTimeout(syncVisualViewport, 60));

  sessionsCollapseBtn?.addEventListener('click', toggleSessionsPanel);

  // Ridimensionamento reale delle due sidebar, con limiti — owner 24/8.
  // Un trascinamento vero (pointer capture) e la stessa cosa da tastiera,
  // perché una maniglia raggiungibile solo dal dito non lo è da chi non
  // può trascinare. Persistito per-viewer in localStorage, come le altre
  // comodità di sola interfaccia di questo mockup (non è dato reale).
  const PANEL_RESIZE_LIMITS = { sessions: [220, 420], inspector: [280, 480] };
  const PANEL_RESIZE_STORAGE_KEY = 'talos-harness-panel-widths';
  const PANEL_RESIZE_VAR = { sessions: '--sidebar', inspector: '--inspector' };
  const PANEL_RESIZE_DEFAULT = { sessions: 292, inspector: 340 };

  function readSavedPanelWidths() {
    try {
      return JSON.parse(window.localStorage.getItem(PANEL_RESIZE_STORAGE_KEY) || '{}');
    } catch {
      return {};
    }
  }

  function savePanelWidth(which, px) {
    try {
      const saved = readSavedPanelWidths();
      saved[which] = px;
      window.localStorage.setItem(PANEL_RESIZE_STORAGE_KEY, JSON.stringify(saved));
    } catch {
      // Un mockup che perde una preferenza di comodo non deve rompersi per questo.
    }
  }

  function applyPanelWidth(which, px) {
    const [min, max] = PANEL_RESIZE_LIMITS[which];
    const clamped = Math.min(max, Math.max(min, Math.round(px)));
    HOST().style.setProperty(PANEL_RESIZE_VAR[which], `${clamped}px`);
    return clamped;
  }

  function loadPanelWidths() {
    const saved = readSavedPanelWidths();
    for (const which of Object.keys(PANEL_RESIZE_VAR)) {
      if (typeof saved[which] === 'number') applyPanelWidth(which, saved[which]);
    }
  }

  function setupPanelResize() {
    $$('.panel-resize-handle').forEach((handle) => {
      const which = handle.dataset.resize;
      if (!PANEL_RESIZE_LIMITS[which]) return;
      const panel = which === 'sessions' ? sessionsPanel : inspectorPanel;

      handle.addEventListener('pointerdown', (event) => {
        if (window.innerWidth <= 1040) return;
        event.preventDefault();
        handle.setPointerCapture(event.pointerId);
        handle.classList.add('dragging');
        const startX = event.clientX;
        const startWidth = panel.getBoundingClientRect().width;

        function onMove(moveEvent) {
          const delta = which === 'sessions' ? moveEvent.clientX - startX : startX - moveEvent.clientX;
          applyPanelWidth(which, startWidth + delta);
        }
        function onUp() {
          handle.classList.remove('dragging');
          handle.releasePointerCapture(event.pointerId);
          savePanelWidth(which, panel.getBoundingClientRect().width);
          window.removeEventListener('pointermove', onMove);
          window.removeEventListener('pointerup', onUp);
        }
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
      });

      handle.addEventListener('keydown', (event) => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
        event.preventDefault();
        const growsOnArrowRight = which === 'sessions';
        const sign = (event.key === 'ArrowRight') === growsOnArrowRight ? 1 : -1;
        const current = parseInt(getComputedStyle(HOST()).getPropertyValue(PANEL_RESIZE_VAR[which]), 10)
          || PANEL_RESIZE_DEFAULT[which];
        const next = applyPanelWidth(which, current + sign * 12);
        savePanelWidth(which, next);
      });
    });
  }

  /*
   * Owner 24/8, RIVISTO dopo l'architettura a shadow DOM: qui c'era un
   * listener 'backButton' scritto apposta, perché la pagina viveva da sola
   * (`window.location.assign`) e il tasto Indietro non tornava alla SPA né
   * usciva dall'app — vedi [[tocchi-reali-adb-obbligatori]] per come è
   * stato trovato. Montato dentro `HarnessSessionScreen.vue` invece, la
   * pagina non cambia mai: è la STESSA cronologia Vue Router già verificata
   * su `/memoria` (Indietro → `/`), niente da reinventare qui.
   */

  ensureDemoLabels();
  applyQaState();
  syncNavigationState();
  syncInspectorToggle();
  syncSessionsToggle();
  loadPanelWidths();
  setupPanelResize();
  syncHostLayout();
  setQueueMode(false);
  setRunState(true);
  setInspectorTab($('.inspector-tabs button.active'));
  renderReviewFile('composer');
  autoGrowTextarea();
  syncVisualViewport();
  /*
   * ⛔ 26/8 — provato e SCARTATO: aggiungere qui una chiamata a
   * aggiornaElencoSessioniReali() per sincronizzare la sidebar all'avvio.
   * Sembrava un buco (le sette funzioni di sessione la richiamano dopo
   * ogni azione, ma nessuna all'avvio), ma DUE test lo smentiscono:
   * CODE-COMPOSER-DEMO-SEND-01 (mount standalone, senza `talos-embedded`)
   * e HARNESS-BOARD-MOBILE-HONESTY-01 (mount embedded) pretendono ENTRAMBI
   * zero fetch al mount — non solo in embedded. È lo stesso principio
   * della Board (ensureCampaignBoard/loadCampaigns, mai chiamate al boot,
   * solo al cambio vista): il boot non fa MAI una chiamata di rete propria,
   * a prescindere da standalone/embedded. Non un buco: design deliberato.
   */
})();
