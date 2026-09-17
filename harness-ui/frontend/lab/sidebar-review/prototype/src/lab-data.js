// Offline interaction laboratory. No fetch, sockets, filesystem or model calls.
const $ = (q, r = document) => r.querySelector(q);
const $$ = (q, r = document) => Array.from(r.querySelectorAll(q));
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const icon = n => `<svg class="i" aria-hidden="true"><use href="#i-${n}"/></svg>`;
const badge = (text, tone = '') => `<span class="badge ${tone}">${esc(text)}</span>`;
const store = createStore();
const act = (type, value) => store.dispatch({ type, ...value });
const contextBySession = new Map();
let scenario = 'normal', folderOpen = new Set(['components', 'styles', 'bridge', 'tests']), renaming = null, clipboard = null, deleted = [], contextFiles = [], scrolls = new Map(), graph = { zoom: 1, x: 0, y: 0, collapsed: new Set(), query: '', status: 'all', time: 4, follow: false, split: false }, lastSelected = null, toastTimer, menuReturn, guideReturn, simulationStep = 0;
const bodies = {
    'inspector.js': `// Fixture di lettura: estratto semplificato, non il file completo.\n// L’inspector consuma i dati della sessione.\nexport function renderInspector(session) {\n  const { agents, files, processes } = session;\n  renderAgentList(agents);\n  renderFileTree(files);\n  renderProcesses(processes);\n}\n\n// Ogni vista conserva il suo contesto.\n// Il dettaglio non decide mai la tab attiva.`,
    'conversazione-figlia.js': `// Anteprima dimostrativa — conversazione delegata.\nconst drawnTurns = new Map();\n\nfunction updateEvent(event) {\n  // Conserva i nodi già disegnati e lo scroll.\n  const turn = drawnTurns.get(event.turnId);\n  if (turn) updateTurn(turn, event);\n  else drawnTurns.set(event.turnId, createTurn(event));\n}`,
    'legacy-dom.js': `// Mappa presente nel ponte Talos:\nconst schede = {\n  contesto: 'context', file: 'files',\n  agenti: 'agents', processi: 'processes'\n};\n// Il laboratorio usa lo stesso vocabolario DOM.`,
    'main.css': `@import './index.css';\n// … fogli esistenti invariati …\n@import './mockup-animazioni.css';\n@import './inspector-tab-visibility.css';`,
    'index.css': `/* Token Calm effettivi */\n:root {\n  --talos-background: #1e1f22;\n  --talos-panel: #25262a;\n  --talos-accent: #c08b3c;\n  --talos-text: #f3f0e9;\n  --talos-radius-card: 12px;\n  --talos-inspector-w: 340px;\n}`,
    'inspector-state.test.mjs': `// Test dimostrativo: tab e dettaglio indipendenti.\ntest('File non è bloccato dal dettaglio', () => {\n  const s = { activeTab: 'agents', agent: 'audit' };\n  const next = { ...s, activeTab: 'files' };\n  assert.equal(next.activeTab, 'files');\n  assert.equal(next.agent, 'audit');\n});`
};
let files = [
    { id: 'inspector.js', folder: 'components', git: 'M', agent: 'ux', activity: 'lettura', favorite: true },
    { id: 'conversazione-figlia.js', folder: 'components', git: '', agent: 'audit', activity: 'lettura' },
    { id: 'chat.js', folder: 'components', git: '', agent: null },
    { id: 'file-explorer.js', folder: 'components', git: '', agent: null },
    { id: 'inspector-tab-visibility.css', folder: 'styles', git: 'A', agent: 'fix', activity: 'scrittura', favorite: true },
    { id: 'index.css', folder: 'styles', git: '', agent: 'ux', activity: 'lettura' },
    { id: 'main.css', folder: 'styles', git: 'M', agent: 'fix', activity: 'scrittura' },
    { id: 'desktop-final.css', folder: 'styles', git: '', agent: null },
    { id: 'legacy-dom.js', folder: 'bridge', git: '', agent: 'audit', activity: 'lettura' },
    { id: 'inspector-state.test.mjs', folder: 'tests', git: 'A', agent: 'qa', activity: 'test' },
    { id: 'sidebar.test.mjs', folder: 'tests', git: '', agent: 'e2e', activity: 'errore' },
    { id: 'README.md', folder: '', git: '', agent: 'docs', activity: 'lettura' },
    { id: 'package.json', folder: '', git: '', agent: null }
];
/*VISIBILITY_FIXTURE*/
const initialFiles = structuredClone(files);
const initialBodies = structuredClone(bodies);
let virtualFiles = [], largeSeeded = false, selectionMode = false, cachedQuery = '', compiledQuery = compileFileQuery('');
const agents = [
    { id: 'lead', name: 'Coordinatore', role: 'Sessione principale', task: 'Refactor della sidebar destra, senza modificare la navigazione globale.', status: 'active', tool: 'Delega', session: 'sidebar', run: 'r1', parent: null, model: 'Modello demo', duration: '4m 12s', files: ['inspector.js'], pos: [358, 22], born: 0 },
    { id: 'audit', name: 'Audit stato', role: 'Analisi · sola lettura', task: 'Verifica il ponte legacy, la tab attiva e la conversazione figlia.', status: 'done', tool: 'Read', session: 'sidebar', run: 'r1', parent: 'lead', model: 'Modello demo', duration: '1m 26s', files: ['legacy-dom.js', 'conversazione-figlia.js'], pos: [50, 216], born: 1 },
    { id: 'fix', name: 'Navigazione', role: 'Implementazione isolata', task: 'Confina la visibilità del dettaglio alla tab Agenti e conserva il contesto.', status: 'active', tool: 'Edit', session: 'sidebar', run: 'r1', parent: 'lead', model: 'Modello demo', duration: '2m 04s', files: ['inspector-tab-visibility.css', 'main.css'], pos: [358, 216], born: 1 },
    { id: 'ux', name: 'File explorer', role: 'UX · design system', task: 'Rivede densità, azioni contestuali e uso dei token Calm.', status: 'waiting', tool: 'Attesa', session: 'sidebar', run: 'r2', parent: 'lead', model: 'Modello demo', duration: '1m 18s', files: ['index.css', 'inspector.js'], pos: [666, 216], born: 2 },
    { id: 'qa', name: 'Test stato', role: 'Verifica regressioni', task: 'Verifica File ↔ Agenti, isolamento del contesto e applicazione con conflitto.', status: 'active', tool: 'Test', session: 'sidebar', run: 'r1', parent: 'fix', model: 'Modello demo', duration: '42s', files: ['inspector-state.test.mjs'], pos: [205, 410], born: 2 },
    { id: 'e2e', name: 'Prova desktop', role: 'Verifica interazione', task: 'Controlla scroll, focus e sidebar stretta.', status: 'error', tool: 'Browser', session: 'sidebar', run: 'r1', parent: 'fix', model: 'Modello demo', duration: '28s', files: ['sidebar.test.mjs'], pos: [514, 410], born: 3 },
    { id: 'docs', name: 'Documentazione', role: 'Altro contesto', task: 'Documenta i contratti del workspace.', status: 'done', tool: 'Write', session: 'docs', run: 'r3', parent: null, model: 'Modello demo', duration: '3m 11s', files: ['README.md'], pos: [666, 22], born: 0 },
    { id: 'tests-agent', name: 'Suite isolata', role: 'Altra sessione', task: 'Verifica i test del progetto.', status: 'active', tool: 'Test', session: 'tests', run: 'r4', parent: null, model: 'Modello demo', duration: '51s', files: ['inspector-state.test.mjs'], pos: [50, 22], born: 0 }
];
const initialAgents = structuredClone(agents);
const statuses = { active: ['In corso', 'accent'], done: ['Terminato', 'good'], waiting: ['In attesa', 'warn'], error: ['Errore', 'danger'] };
function toast(t) { clearTimeout(toastTimer); $('#toast').textContent = t; $('#toast').hidden = false; toastTimer = setTimeout(() => $('#toast').hidden = true, 4000); }
function filePath(f) { return f.folder ? (f.folder === 'tests' ? 'tests/' : 'src/') + f.folder.replace(/^tests$/, '') + (f.folder === 'tests' ? '' : '/') + f.id : f.id; }
function fileBy(id) { return files.find(f => f.id === id); }
function stateBadge(a) { const v = statuses[a.status]; return badge(v[0], v[1]); }
function sessionAgents() { return agents.filter(a => a.session === store.get().session); }
function tabMarkup() { const s = store.get(); $$('#railTabs [role=tab]').forEach(b => { const active = b.dataset.tab === s.activeTab; b.setAttribute('aria-selected', String(active)); b.tabIndex = active ? 0 : -1; }); $$('.session').forEach(b => b.classList.toggle('selected', b.dataset.id === s.session)); $('#sessionTitle').textContent = ({ sidebar: 'Refactor sidebar destra', tests: 'Verifica regressioni', docs: 'Documentazione del workspace', new: 'Nuova conversazione demo' })[s.session] || s.session; }
