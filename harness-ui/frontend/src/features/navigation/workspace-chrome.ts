import { createScope, createRevision } from '../../app/lifecycle.ts';
import { createWorkspacePreferences } from '../../services/workspace-preferences.ts';
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
  /*
   * ⛔ 18/09/2026 — LA BARRA DELLA WORKSPACE NON ESISTE PIÙ (ordine dell'owner: via l'header con
   * «TALOS / <vista>», la disposizione, la densità e «Comandi Ctrl K»). Questo modulo non la cerca
   * più e non dipende da lei: prima la sua assenza lo faceva uscire con `null` e la HOME non si
   * disegnava affatto — cioè togliere una barra avrebbe spento una schermata.
   */
  const root = doc.getElementById('schermoHome');
  if (!root) return null;
  const t = options.translate;
  let sessions: SessionSummary[] = [];
  let setup: Record<string, unknown> | null = null;
  let loading = false; let failed = false; let notice = ''; let hasLoaded = false;
  let renderScope = createScope();
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
    /* ⛔⛔ 18/09/2026 — LA «DISPOSIZIONE DEL WORKSPACE» È STATA ELIMINATA, non solo il suo comando.
       Owner: «eliminalo» — e non si poteva togliere solo il pulsante, perché quella preferenza
       guidava anche `data-workspace-preset` (larghezza di lettura del testo) e l'apertura della
       colonna destra per preset. Qui c'erano: la chiave del workspace, il preset scelto, il
       `data-workspace-preset` sulla radice e il `setInspectorVisible` per preset.
       ⇒ Con la funzione spariscono la preferenza `presets`, il tipo e gli elenchi (`presets.ts` è
       stato cancellato), e le due regole CSS che leggevano l'attributo. La colonna destra non viene
       più aperta o chiusa da sola: resta come l'ha lasciata la persona.
       ⛔ Il `presets` già SALVATO nei profili esistenti non si legge più e sparisce da solo alla
       prima scrittura (il record viene ricomposto senza) — nessun bump di versione, che avrebbe
       fatto leggere il profilo come «di una versione futura» alle build precedenti. */
    if (prefs.density === 'compact') doc.documentElement.dataset.densita = 'compatta'; else delete doc.documentElement.dataset.densita;
    const densitySelect = doc.querySelector<HTMLSelectElement>('#setting-uiDensitySelect');
    if (densitySelect) densitySelect.value = prefs.density === 'compact' ? 'compatta' : 'comoda';
    const restore = doc.querySelector<HTMLInputElement>('[data-workspace-restore]');
    if (restore) restore.checked = prefs.restoreWorkspace;
    /*
     * ⛔ 18/09/2026 — QUI C'ERANO I COMANDI DELLA BARRA (disposizione, densità, «Comandi Ctrl K»,
     * posizione, avviso sulle preferenze temporanee): sono usciti con la barra, su ordine dell'owner.
     * Restano vivi e sincronizzati ciò che NON stava nella barra: la densità in Impostazioni
     * (`#setting-uiDensitySelect`), «Riprendi il workspace all'avvio» e il titolo della finestra.
     * (Il preset è stato eliminato il 18/09/2026: vedi il blocco qui sopra.)
     */
    const labels: Partial<Record<View, string>> = { home: 'Home', chat: 'Conversazione', terminal: 'Terminale', diff: 'Revisione', dashboard: 'Sessioni', settings: 'Impostazioni', doctor: 'Diagnostica', libreria: 'Libreria', ricerca: 'Ricerca', progetti: 'Progetti', note: 'Note', attivita: 'Attività', memoria: 'Memoria', automations: 'Automazioni', browser: 'Browser', officina: 'Officina', capability: 'Capacità' };
    doc.title = `TALOS · ${t(labels[currentView] || currentView)}`;
  }
  doc.documentElement.addEventListener('talos:lingua', () => {
    syncControls(); render(); }, { signal: scope.signal });
  const restore = doc.querySelector<HTMLInputElement>('[data-workspace-restore]');
  if (restore) { restore.checked = preferences.read().restoreWorkspace; restore.addEventListener('change', () => { preferences.update({ restoreWorkspace: restore.checked }); }, { signal: scope.signal }); }
  /*
   * ⛔ 18/09/2026 — LA MISURA DELL'ALTEZZA DELLA BARRA È USCITA CON LA BARRA.
   * Era nata per BC-78.3 (il pannello `sticky` era più alto dello spazio che aveva, 336 contro 301 a
   * 1200×420, e il suo piede restava fuori): si misurava `.workspace-bar` e si pubblicava
   * `--talos-workspace-bar-h`. Senza la barra non c'è niente da misurare e il token in
   * `styles/index.css` vale il suo fallback `0px` — la formula resta corretta, e resta corretta
   * anche se un giorno la barra tornasse.
   */
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
