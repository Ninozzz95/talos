import { createScope, createRevision } from '../../app/lifecycle.ts';
import { createWorkspacePreferences, isPreset, workspacePreferenceKey } from '../../services/workspace-preferences.ts';
import { LAYOUT_PRESETS } from './presets.ts';
import type { View } from '../../domain/navigation.ts';

export interface SessionSummary {
  sessionId: string; taskId?: string; nome?: string; modello?: string; avviataAlle?: string;
  conclusa?: boolean; interrotta?: boolean; attesaApprovazione?: boolean; cartella?: string;
  [field: string]: unknown;
}
export interface WorkspaceChromeOptions {
  document: Document;
  translate(text: string): string;
  apiGet(path: string, options?: { signal: AbortSignal }): Promise<unknown>;
  navigate(view: View): void;
  openProject(): void;
  openModel(): void;
  openProviders(): void;
  openSession(row: SessionSummary): void;
  describeSession(row: SessionSummary): string;
  currentSession(): string | null;
  currentWorkspace?(): string | null;
  currentModel(): string;
  setInspectorVisible(visible: boolean): void;
  preferences: ReturnType<typeof createWorkspacePreferences>;
}
const isObject = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
export function normalizeSessions(raw: unknown): SessionSummary[] {
  if (!isObject(raw) || !Array.isArray(raw.items)) return [];
  const found = new Set<string>();
  return raw.items.filter((item): item is SessionSummary => {
    if (!isObject(item) || typeof item.sessionId !== 'string' || !item.sessionId || found.has(item.sessionId)) return false;
    found.add(item.sessionId); return true;
  });
}
export function createWorkspaceChrome(options: WorkspaceChromeOptions) {
  const { document: doc, preferences } = options;
  const scope = createScope(); const requests = createRevision();
  const root = doc.getElementById('schermoHome');
  const header = doc.querySelector<HTMLElement>('[data-workspace-bar]');
  if (!root || !header) return null;
  const t = options.translate;
  let sessions: SessionSummary[] = [];
  let setup: Record<string, unknown> | null = null;
  let loading = false; let failed = false; let notice = ''; let hasLoaded = false;
  let renderScope = createScope();
  let currentPresetKey = "";
  let currentView: View = 'home';
  let readController: AbortController | null = null;

  function node<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text = ''): HTMLElementTagNameMap[K] {
    const item = doc.createElement(tag); item.className = className; item.textContent = t(text); return item;
  }
  function icon(name: string): SVGSVGElement {
    const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'i'); svg.setAttribute('aria-hidden', 'true');
    const use = doc.createElementNS(svg.namespaceURI, 'use'); use.setAttribute('href', `#${name}`); svg.append(use); return svg;
  }
  function button(text: string, action: () => void, className = 'talos-button talos-button--secondary', symbol?: string): HTMLButtonElement {
    const b = node('button', className); b.type = 'button'; b.dataset.homeAction = text;
    if (symbol) b.append(icon(symbol)); b.append(node('span', '', text));
    b.addEventListener('click', action, { signal: renderScope.signal }); return b;
  }
  function render() {
    if (scope.disposed || !root) return;
    const active = doc.activeElement;
    const focused = active && root.contains(active) ? {
      session: active.getAttribute('data-session'), action: active.getAttribute('data-home-action'),
    } : null;
    renderScope.dispose(); renderScope = createScope();
    const fragment = doc.createDocumentFragment();
    const hero = node('header', 'workspace-home__hero');
    const copy = node('div', '');
    copy.append(node('p', 'workspace-eyebrow', 'TALOS / Il tuo spazio di lavoro'), node('h1', '', 'Da dove ripartiamo?'),
      node('p', 'workspace-home__lead', 'Progetti, conversazioni e strumenti. Il tuo lavoro, in un unico posto.'));
    const primary = button('Apri un progetto', options.openProject, 'talos-button talos-button--primary workspace-primary', 'i-folder-open');
    primary.dataset.homeAction = 'project'; hero.append(copy, primary); fragment.append(hero);

    const actions = node('nav', 'workspace-home__actions'); actions.setAttribute('aria-label', t('Inizia un lavoro'));
    for (const [label, subtitle, symbol, action] of [
      ['Conversazione', 'Scrivi e lavora con l’agente', 'i-list', () => options.navigate('chat')],
      ['Terminale', 'Apri la shell del computer', 'i-terminal', () => options.navigate('terminal')],
      ['Documenti', 'Consulta la tua libreria', 'i-doc', () => options.navigate('libreria')],
      ['Ricerca', 'Raccogli e confronta le fonti', 'i-globe', () => options.navigate('ricerca')],
    ] as const) {
      const b = button(label, action, 'workspace-action', symbol);
      b.append(node('small', '', subtitle), icon('i-chevron-right')); actions.append(b);
    }
    fragment.append(actions);
    if (notice) { const n = node('p', 'workspace-notice', notice); n.setAttribute('role', 'status'); fragment.append(n); }
    const columns = node('div', 'workspace-home__columns');
    const recent = node('section', 'workspace-card workspace-recents'); recent.setAttribute('aria-labelledby', 'homeRecentTitle');
    const titlebar = node('div', 'workspace-card__heading');
    const title = node('h2', '', 'Riprendi il lavoro'); title.id = 'homeRecentTitle';
    const refresh = button('Aggiorna', () => { void load(); }, 'talos-button talos-button--ghost', 'i-history'); refresh.disabled = loading;
    refresh.dataset.homeAction = 'refresh'; titlebar.append(title, refresh); recent.append(titlebar);
    recent.setAttribute('aria-busy', String(loading));
    if (loading && !hasLoaded) {
      const p = node('p', 'workspace-empty', 'Leggo le sessioni…'); p.setAttribute('role', 'status'); recent.append(p);
    } else if (failed && !hasLoaded) {
      const p = node('div', 'workspace-empty'); p.setAttribute('role', 'status');
      p.append(icon('i-history'), node('h3', '', 'La cronologia non è disponibile'), node('p', '', 'Il lavoro non è stato cancellato. Riprova a leggere le sessioni.')); recent.append(p);
    } else if (sessions.length === 0) {
      const empty = node('div', 'workspace-empty');
      empty.append(icon('i-folder-open'), node('h3', '', 'Il prossimo lavoro inizia qui'),
        node('p', '', 'Apri un progetto o una conversazione. Le tue sessioni compariranno qui.'),
        button('Nuova conversazione', options.openProject, 'talos-button talos-button--secondary'));
      recent.append(empty);
    } else {
      if (failed) { const msg = node('p', 'workspace-notice', 'Aggiornamento non riuscito. Stai vedendo l’ultima lettura disponibile.'); msg.setAttribute('role', 'status'); recent.append(msg); }
      const list = node('ul', 'workspace-recents__list');
      const time = (row: SessionSummary): number => { const n = Date.parse(row.avviataAlle || ''); return Number.isFinite(n) ? n : 0; };
      for (const row of [...sessions].sort((a, b) => time(b) - time(a)).slice(0, 8)) {
        const li = node('li', '');
        const b = button('Sessione senza nome', () => options.openSession(row), 'workspace-recent', 'i-list');
        const sessionLabel = b.querySelector('span');
        if (sessionLabel && typeof row.nome === 'string' && row.nome) sessionLabel.textContent = row.nome;
        b.dataset.session = row.sessionId;
        const details = node('small', 'workspace-recent__meta');
        details.append(node('span', 'workspace-state', options.describeSession(row)));
        if (typeof row.modello === 'string' && row.modello) { const modelLabel = node('span', ''); modelLabel.textContent = row.modello; details.append(modelLabel); }
        b.append(details, icon('i-chevron-right')); li.append(b); list.append(li);
      }
      recent.append(list, button('Tutte le sessioni', () => options.navigate('dashboard'), 'talos-button talos-button--ghost', 'i-grid'));
    }
    const aside = node('aside', 'workspace-home__aside');
    const readiness = node('section', 'workspace-card');
    readiness.append(node('p', 'workspace-eyebrow', 'Prima della prossima richiesta'), node('h2', '', 'Il tuo agente'));
    const model = options.currentModel();
    const provider = setup && isObject(setup.provider) ? setup.provider : null;
    const ready = provider?.pronto === true;
    const modelLabel = node('p', 'workspace-model', 'Nessun modello selezionato');
    if (model) modelLabel.textContent = model; readiness.append(modelLabel);
    readiness.append(node('p', 'workspace-muted', model && ready
      ? 'Modello selezionato. Le autorizzazioni vengono richieste quando servono.'
      : 'Puoi esplorare il workspace. Configura un modello quando vuoi usare l’agente.'));
    readiness.append(button(model ? 'Cambia modello' : 'Scegli un modello', options.openModel, 'talos-button talos-button--secondary', 'i-bolt'),
      button('Provider e accessi', options.openProviders, 'talos-button talos-button--ghost', 'i-shield'));
    const shortcuts = node('section', 'workspace-card workspace-links');
    shortcuts.append(node('h2', '', 'Organizza il lavoro'));
    for (const [label, view, symbol] of [['Progetti', 'progetti', 'i-folder'], ['Attività', 'attivita', 'i-check-sq'], ['Note', 'note', 'i-edit'], ['Automazioni', 'automations', 'i-clock']] as const) {
      shortcuts.append(button(label, () => options.navigate(view), 'talos-button talos-button--ghost', symbol));
    }
    aside.append(readiness, shortcuts); columns.append(recent, aside); fragment.append(columns);
    const foot = node('p', 'workspace-home__foot', 'Nessuna operazione viene avviata automaticamente.');
    fragment.append(foot); root.replaceChildren(fragment);
    const focusKey = focused?.session ? `[data-session="${CSS.escape(focused.session)}"]`
      : focused?.action ? `[data-home-action="${CSS.escape(focused.action)}"]` : null;
    if (focusKey) root.querySelector<HTMLButtonElement>(focusKey)?.focus({ preventScroll: true });
  }
  async function load(): Promise<void> {
    if (loading || scope.disposed) return;
    const issued = requests.next(); loading = true; failed = false; render();
    const controller = new AbortController(); readController = controller;
    const release = scope.own(() => controller.abort());
    const [rows, readiness] = await Promise.allSettled([options.apiGet('/api/v1/sessions', { signal: controller.signal }), options.apiGet('/api/v1/setup/stato', { signal: controller.signal })]);
    const cancelled = controller.signal.aborted; release();
    if (readController === controller) readController = null;
    if (scope.disposed || cancelled || !requests.isCurrent(issued)) return;
    loading = false; failed = rows.status === 'rejected' || !isObject(rows.value) || !Array.isArray(rows.value.items);
    if (rows.status === 'fulfilled' && !failed) { sessions = normalizeSessions(rows.value); hasLoaded = true; }
    if (readiness.status === 'fulfilled' && isObject(readiness.value)) setup = readiness.value;
    render();
  }
  function syncControls(): void {
    const prefs = preferences.read();
    const restoreLabel = doc.querySelector<HTMLLabelElement>('label[for="setting-workspaceRestore"]');
    if (restoreLabel) restoreLabel.textContent = t('Riprendi il workspace all’avvio');
    const restoreHelp = doc.getElementById('workspaceRestoreHelp');
    if (restoreHelp) restoreHelp.textContent = t('Riapre l’ultima sessione disponibile senza avviare operazioni.');
    doc.documentElement.dataset.density = prefs.density;
    const sessionId = options.currentSession();
    const key = workspacePreferenceKey(options.currentWorkspace?.(), sessionId);
    const preset = preferences.presetFor(key, sessionId ? [sessionId] : []);
    if (prefs.density === 'compact') doc.documentElement.dataset.densita = 'compatta'; else delete doc.documentElement.dataset.densita;
    const densitySelect = doc.querySelector<HTMLSelectElement>('#setting-uiDensitySelect');
    if (densitySelect) densitySelect.value = prefs.density === 'compact' ? 'compatta' : 'comoda';
    const restore = doc.querySelector<HTMLInputElement>('[data-workspace-restore]');
    if (restore) restore.checked = prefs.restoreWorkspace;
    if (currentPresetKey !== key) { options.setInspectorVisible(LAYOUT_PRESETS[preset].inspector); currentPresetKey = key; }
    doc.documentElement.dataset.workspacePreset = preset;
    const select = header?.querySelector<HTMLSelectElement>('[data-workspace-preset]'); if (select) { select.value = preset; select.setAttribute('aria-label', t('Disposizione del workspace')); }
    const density = header?.querySelector<HTMLButtonElement>('[data-workspace-density]');
    if (density) { density.setAttribute('aria-pressed', String(prefs.density === 'compact')); density.textContent = t(prefs.density === 'compact' ? 'Compatta' : 'Confortevole'); }
    const location = header?.querySelector('[data-workspace-location]');
    const labels: Partial<Record<View, string>> = { home: 'Home', chat: 'Conversazione', terminal: 'Terminale', diff: 'Revisione', dashboard: 'Sessioni', settings: 'Impostazioni', doctor: 'Diagnostica', libreria: 'Libreria', ricerca: 'Ricerca', progetti: 'Progetti', note: 'Note', attivita: 'Attività', memoria: 'Memoria', automations: 'Automazioni', browser: 'Browser', officina: 'Officina', capability: 'Capacità' };
    if (location) location.textContent = t(labels[currentView] || currentView);
    doc.title = `TALOS · ${t(labels[currentView] || currentView)}`;
    const persistent = header?.querySelector<HTMLElement>('[data-workspace-persistence]');
    if (persistent) {
      persistent.hidden = preferences.persistent;
      persistent.textContent = t(preferences.persistenceProblem === 'future-version'
        ? 'Preferenze salvate da una versione più recente: le modifiche restano temporanee.'
        : 'Preferenze temporanee: memoria locale non disponibile.');
    }
  }
  const density = header.querySelector('[data-workspace-density]');
  density?.addEventListener('click', () => { preferences.update({ density: preferences.read().density === 'compact' ? 'comfortable' : 'compact' }); syncControls(); }, { signal: scope.signal });
  const select = header.querySelector<HTMLSelectElement>('[data-workspace-preset]');
  if (select) {
    select.replaceChildren(...Object.entries(LAYOUT_PRESETS).map(([value, definition]) => { const option = node('option', '', definition.label); option.value = value; return option; }));
    select.addEventListener('change', () => {
      if (!isPreset(select.value)) return;
      preferences.setPreset(workspacePreferenceKey(options.currentWorkspace?.(), options.currentSession()), select.value);
      options.setInspectorVisible(LAYOUT_PRESETS[select.value].inspector); syncControls();
    }, { signal: scope.signal });
  }
  doc.documentElement.addEventListener('talos:lingua', () => {
    if (select) for (const option of select.options) if (isPreset(option.value)) option.textContent = t(LAYOUT_PRESETS[option.value].label);
    syncControls(); render(); }, { signal: scope.signal });
  const restore = doc.querySelector<HTMLInputElement>('[data-workspace-restore]');
  if (restore) { restore.checked = preferences.read().restoreWorkspace; restore.addEventListener('change', () => { preferences.update({ restoreWorkspace: restore.checked }); }, { signal: scope.signal }); }
  scope.own(preferences.subscribe(syncControls));
  render(); syncControls();
  return {
    refresh: load,
    update(view: View): void {
      const entered = currentView !== view; currentView = view; syncControls();
      if (entered && view !== 'home' && readController) { requests.next(); readController.abort(); loading = false; }
      if (view === 'home') { if (entered || !hasLoaded) void load(); else render(); }
    },
    acceptSessions(items: unknown): void { sessions = normalizeSessions({ items }); hasLoaded = true; if (currentView === 'home' && !loading) render(); },
    showNotice(text: string): void { notice = text; render(); },
    dispose: () => { requests.next(); renderScope.dispose(); scope.dispose(); },
  };
}
