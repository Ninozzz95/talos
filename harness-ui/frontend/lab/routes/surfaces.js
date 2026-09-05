import { createBoardSurface } from '../../src/app/surfaces/board.js';
import { createDoctorSurface } from '../../src/app/surfaces/doctor.js';
import { createCapabilitySurface } from '../../src/app/surfaces/capability.js';
import { createInspectorSurface } from '../../src/app/surfaces/inspector.js';
import { createSettingsSurface } from '../../src/app/surfaces/settings.js';
import { createSidebarSurface } from '../../src/app/surfaces/sidebar.js';
import { createStatusBarSurface } from '../../src/app/surfaces/status-bar.js';
import { createTerminalSurface } from '../../src/app/surfaces/terminal.js';
import { createTopbarSurface } from '../../src/app/surfaces/topbar.js';
import { ACTIONS } from '../../src/state/actions.js';
import { createInitialState } from '../../src/state/initial-state.js';
import { createStore } from '../../src/state/create-store.js';
import { reducer } from '../../src/state/reducer.js';

/*
 * Il laboratorio delle SUPERFICI: le otto estratte, montate nel browser vero
 * con dati realistici, così si possono guardare prima del cutover.
 *
 * ⛔ Perché esiste: fino a ieri le superfici avevano il laboratorio Playwright
 * verde e nessuno le aveva GUARDATE. Un test che passa dice che il codice fa
 * quello che il test chiede, non che a schermo si veda qualcosa di sensato — e
 * la regola di questo progetto è che ogni funzione si fotografa e ogni foto si
 * ispeziona. L'assemblaggio nella pagina vera è il cutover, che aspetta un sì
 * dell'owner: questa rotta non lo anticipa, mostra i pezzi.
 *
 * ⛔ I dati qui dentro sono FINTI e devono restare riconoscibili come tali:
 * questa è una vetrina, non uno stato dell'applicazione. Nessun numero di qui
 * finisce in un ledger.
 */
const SESSIONI = [
  { id: 's1', title: 'W1-01 schede terminale', status: 'running', model: 'claude-opus-5', turns: 7, updatedAtLabel: '2 min fa' },
  { id: 's2', title: 'Guardia di stallo', status: 'awaiting-approval', model: 'claude-opus-5', turns: 3, updatedAtLabel: '18 min fa' },
  { id: 's3', title: 'Barra di stato onesta', status: 'done', model: 'claude-sonnet-5', turns: 12, updatedAtLabel: 'ieri' },
  { id: 's4', title: 'Estrazione modulare', status: 'interrupted', model: 'claude-opus-5', turns: 24, updatedAtLabel: 'ieri' },
  { id: 's5', title: 'Sessione con stato ignoto', status: 'quantum', model: null, turns: null, updatedAtLabel: '3 giorni fa' },
];

const PROCESSI = {
  registrato: true,
  processi: [
    { toolCallId: 'tc1', attrezzo: 'shell', origine: 'agente', comando: 'npm run verify:all', durataMs: 16936, inCorsoDaMs: null, motivoTempoAssente: null, esito: 'riuscito', codiceUscita: 0 },
    { toolCallId: 'tc2', attrezzo: 'shell', origine: 'utente', comando: 'git status --short', durataMs: 210, inCorsoDaMs: null, motivoTempoAssente: null, esito: 'riuscito', codiceUscita: 0 },
    { toolCallId: 'tc3', attrezzo: 'prova', origine: 'agente', comando: 'node --test tests/unit', durataMs: null, inCorsoDaMs: 91_000, motivoTempoAssente: 'il processo è ancora in corso', esito: 'in-corso', codiceUscita: null },
    { toolCallId: 'tc4', attrezzo: 'shell', origine: 'agente', comando: null, motivoComandoAssente: 'gli argomenti della chiamata non sono stati registrati', durataMs: null, inCorsoDaMs: null, motivoTempoAssente: 'gli eventi persistiti non portano un orario', esito: 'ignoto', codiceUscita: null },
  ],
  guardia: {
    osservata: true,
    interviene: false,
    silenzioValutabile: true,
    segnalazioni: [
      { tipo: 'silenzio', descrizione: 'Approvazione «scrivi .claude/settings.json» (r-8821) in attesa da 240 s, soglia 120 s: il giro è vivo ma non andrà avanti finché nessuno risponde.' },
      { tipo: 'giro-a-vuoto', descrizione: 'L’attrezzo «leggi» è stato chiamato 4 volte con gli stessi argomenti e lo stesso esito dentro 6 chiamate.' },
    ],
  },
};

const METRICHE = {
  s1: { registrato: true, giri: 7, cache: { percentuale: 87 }, primoToken: { ms: 1420 }, chiusura: { motivo: null, motivoAssente: 'il giro non ha ancora un esito' } },
  s2: { registrato: true, giri: 3, cache: { percentuale: 0 }, primoToken: { ms: null, motivoAssente: 'gli eventi persistiti non portano un orario' }, chiusura: { motivo: null, motivoAssente: 'il giro non ha ancora un esito' } },
  s3: { registrato: true, giri: 12, cache: { percentuale: 64 }, primoToken: { ms: 890 }, chiusura: { motivo: 'fine-lavoro', codice: 'stop' } },
  s4: { registrato: true, giri: 24, cache: { percentuale: null, motivoAssente: 'il fornitore non ha dichiarato la cache' }, primoToken: { ms: null, motivoAssente: 'gli eventi persistiti non portano un orario' }, chiusura: { motivo: 'giri-finiti', codice: 'giri-esauriti' } },
  s5: { registrato: false, motivo: 'non-registrato' },
};

const ATTREZZI = [
  { id: 'shell', enabled: true }, { id: 'leggi', enabled: true }, { id: 'scrivi', enabled: true },
  { id: 'web_search', enabled: true }, { id: 'document_create', enabled: false },
  { id: 'delega_sottotask', enabled: true }, { id: 'attrezzo_nuovissimo', enabled: false },
];

function blocco(documentObj, titolo, nota) {
  const sezione = documentObj.createElement('section');
  sezione.className = 'surfaces-lab__block';
  const h2 = documentObj.createElement('h2');
  h2.textContent = titolo;
  const p = documentObj.createElement('p');
  p.className = 'foundation-copy';
  p.textContent = nota;
  const corpo = documentObj.createElement('div');
  corpo.className = 'surfaces-lab__body';
  sezione.append(h2, p, corpo);
  return { sezione, corpo };
}

export function mountSurfacesLab(root) {
  const documentObj = root.ownerDocument;
  const html = documentObj.documentElement;
  html.dataset.talosTheme = 'calm';
  html.dataset.talosMode = 'dark';

  const store = createStore({ initialState: createInitialState(), reducer });
  store.dispatch({ type: ACTIONS.BOOTSTRAP_SUCCEEDED, payload: { sessions: SESSIONI, projects: [] } });
  store.dispatch({ type: ACTIONS.SESSION_SELECTED, payload: { id: 's1' } });
  store.dispatch({ type: ACTIONS.USAGE_UPDATED, payload: { usage: { tokens: 100_100, turns: 7, cacheTokens: 50_700 } } });

  const pagina = documentObj.createElement('main');
  pagina.className = 'surfaces-lab';
  const testata = documentObj.createElement('header');
  testata.className = 'surfaces-lab__header';
  const occhiello = documentObj.createElement('p');
  occhiello.className = 'foundation-eyebrow';
  occhiello.textContent = 'Fase 4 · estrazione modulare';
  const h1 = documentObj.createElement('h1');
  h1.textContent = 'Le superfici, prima del cutover';
  const sotto = documentObj.createElement('p');
  sotto.className = 'foundation-copy';
  sotto.textContent = 'Dati finti e riconoscibili: questa è una vetrina, non lo stato dell’applicazione.';
  testata.append(occhiello, h1, sotto);
  pagina.append(testata);
  root.replaceChildren(pagina);

  const componenti = [];

  const sidebar = createSidebarSurface({
    documentObj,
    store,
    testId: 'lab-sidebar',
    labels: {
      navigation: 'Navigazione', places: 'Luoghi', sessions: 'Cronologia',
      empty: 'Nessuna sessione', turnsUnit: 'giri', unknownStatus: 'stato ignoto',
      status: { live: 'in corso', waiting: 'aspetta te', done: 'conclusa', error: 'giri finiti', interrupted: 'interrotta' },
      placeItems: [
        { id: 'chat', label: 'Chat' },
        { id: 'dashboard', label: 'Board', count: 5, countUnit: 'sessioni' },
        { id: 'automations', label: 'Automazioni' },
        { id: 'settings', label: 'Impostazioni' },
      ],
    },
  });
  const b1 = blocco(documentObj, 'Sidebar', 'Stati tradotti; «quantum» resta grezzo perché non lo conosciamo.');
  b1.corpo.append(sidebar.element);
  pagina.append(b1.sezione);
  componenti.push(sidebar);

  const topbar = createTopbarSurface({
    documentObj,
    store,
    testId: 'lab-topbar',
    labels: {
      untitled: 'Nuova conversazione', noWorkspace: 'nessuna cartella scelta', pathMax: 44,
      views: [
        { id: 'chat', label: 'Chat' },
        { id: 'terminal', label: 'Terminale', countUnit: 'schede' },
        { id: 'diff', label: 'Review', countUnit: 'file' },
      ],
    },
  });
  topbar.update({ workspace: 'C:/Users/Antonino/Desktop/projects/AVM-harness-desktop/harness-ui', counts: { terminal: 2, diff: 3 } });
  const b2 = blocco(documentObj, 'Topbar', 'Il percorso è troncato al centro; il testo intero resta per chi ascolta.');
  b2.corpo.append(topbar.element);
  pagina.append(b2.sezione);
  componenti.push(topbar);

  const inspector = createInspectorSurface({
    documentObj,
    store,
    testId: 'lab-inspector',
    labels: {
      regionLabel: 'Dettagli', unmeasured: 'non misurato',
      tabs: [
        { id: 'contesto', label: 'Contesto' }, { id: 'file', label: 'File toccati' },
        { id: 'sottoagenti', label: 'Sotto-agenti' }, { id: 'processi', label: 'Processi' },
      ],
      contextEmpty: 'Nessun contesto da mostrare.',
      filesEmpty: 'Questo giro non ha toccato file.',
      subagentsEmpty: 'Nessun sotto-agente in questo giro.',
      processesUnknown: 'Registro dei processi non ancora caricato.',
      stallNotEvaluated: 'Il silenzio non è stato valutato:',
      stallKinds: { silenzio: 'Fermo da un po’', 'giro-a-vuoto': 'Sta rifacendo la stessa cosa' },
      stallAnnounce: '{n} avvisi nel registro dei processi',
      stallCountUnit: 'avvisi',
      origins: { agente: 'lanciato dall’agente', utente: 'lanciato da te' },
      runningForUnit: 's finora',
    },
  });
  inspector.update({ processes: PROCESSI });
  const b3 = blocco(documentObj, 'Inspector', 'Due stalli distinti, e il contrassegno sta sulla scheda anche mentre guardi un’altra.');
  b3.corpo.append(inspector.element);
  pagina.append(b3.sezione);
  componenti.push(inspector);

  const board = createBoardSurface({
    documentObj,
    store,
    testId: 'lab-board',
    labels: {
      caption: 'Tutte le sessioni', unmeasured: 'non misurato', stillRunning: 'ancora in corso',
      ascending: 'crescente', descending: 'decrescente',
      status: { live: 'in corso', waiting: 'aspetta te', done: 'conclusa', error: 'giri finiti', interrupted: 'interrotta' },
      closeReasons: { 'fine-lavoro': 'fine lavoro', 'giri-finiti': 'giri finiti' },
      columns: [
        { id: 'sessione', label: 'Sessione', rowHeader: true },
        { id: 'stato', label: 'Stato' },
        { id: 'modello', label: 'Modello' },
        { id: 'giri', label: 'Giri', align: 'end', sortable: true },
        { id: 'cache', label: 'Cache', align: 'end', sortable: true },
        { id: 'primoToken', label: 'Primo token', align: 'end', sortable: true },
        { id: 'chiusura', label: 'Chiusa per' },
      ],
    },
  });
  board.update({ metricsById: METRICHE });
  const b4 = blocco(documentObj, 'Board', '«0 %» è misurato; il trattino è non misurato e porta il motivo nel title.');
  b4.corpo.append(board.element);
  pagina.append(b4.sezione);
  componenti.push(board);

  const capability = createCapabilitySurface({
    documentObj,
    testId: 'lab-capability',
    labels: {
      regionLabel: 'Capability', searchLabel: 'Cerca fra le capability',
      sections: [
        { id: 'attrezzi', label: 'Attrezzi', countUnit: 'attrezzi', emptyLabel: 'Nessun attrezzo offerto.' },
        { id: 'skill', label: 'Skill', countUnit: 'skill' },
        { id: 'mcp', label: 'Connettori', countUnit: 'connettori' },
      ],
      unnamed: 'Attrezzo senza nome ancora',
      unnamedNote: '{n} attrezzi non hanno ancora un nome leggibile.',
      unnamedNoteOne: '1 attrezzo non ha ancora un nome leggibile.',
      offered: 'offerto a questo modello', notOffered: 'NON offerto a questo modello',
      offeredUnknown: 'non sappiamo se arriva a questo modello',
      notLoaded: 'Non ancora caricato.', noResults: 'Nessun risultato per «{q}».',
    },
    onToggle: () => {},
  });
  capability.update({ items: { attrezzi: ATTREZZI }, model: { id: 'gemma-3', tools: ['shell', 'leggi', 'scrivi'] } });
  const b5 = blocco(documentObj, 'Capability', 'Nomi umani a schermo, id tecnico come dettaglio; la ricerca trova entrambi.');
  b5.corpo.append(capability.element);
  pagina.append(b5.sezione);
  componenti.push(capability);

  const terminale = createTerminalSurface({
    documentObj,
    testId: 'lab-terminal',
    trasporto: { open: () => ({ send() {}, resize() {}, destroy() {} }) },
    creaVista: () => ({ scrivi() {}, destroy() {} }),
    labels: {
      regionLabel: 'Terminale', noFolder: 'nessuna cartella',
      states: {
        connecting: 'collegamento in corso', open: 'collegato',
        'reconnected-resumed': 'riconnesso — è la stessa shell di prima',
        'reconnected-new': 'riconnesso — questa è una shell NUOVA, quella di prima è stata chiusa',
        'reconnected-unknown': 'riconnesso — non sappiamo se la shell è ancora quella di prima',
        reconnecting: 'caduto, riprovo fra', disconnected: 'scollegato dopo tentativi:',
        exited: 'la shell è uscita, codice', forbidden: 'questa scheda non esiste più o non è tua',
        error: 'errore di collegamento', closed: 'nessuna scheda aperta',
      },
      isolation: { isolated: 'isolato', host: 'sulla tua macchina', unknownIsolation: 'non sappiamo se è isolato' },
      launchedBy: { utente: 'lo hai lanciato tu', agente: 'lo ha lanciato l’agente', unknown: 'non sappiamo chi lo ha lanciato' },
    },
  });
  terminale.update({ tab: { terminalId: 't1', cartella: 'C:/Users/Antonino/Desktop/projects/AVM-harness-desktop', isolato: false }, launchedBy: 'agente' });
  const b6 = blocco(documentObj, 'Terminale', 'Dichiara cartella, isolamento e chi ha lanciato; lo stato del collegamento è testo.');
  b6.corpo.append(terminale.element);
  pagina.append(b6.sezione);
  componenti.push(terminale);

  const barra = createStatusBarSurface({
    documentObj,
    store,
    testId: 'lab-status-bar',
    labels: {
      regionLabel: 'Stato della sessione', unmeasured: 'non misurato',
      noUsageReason: 'nessun consumo misurato per questa sessione',
      announceTemplate: 'Sessione {fase}',
      fields: [
        { id: 'tokens', label: 'token' }, { id: 'turns', label: 'giri' },
        { id: 'cacheTokens', label: 'cache' }, { id: 'connection', label: 'ponte' },
      ],
      phases: { 'ready-active': 'pronta', 'ready-empty': 'nessuna sessione', running: 'in corso', booting: 'in avvio' },
      connections: { connecting: 'in collegamento', open: 'collegato' },
    },
  });
  const b7 = blocco(documentObj, 'Barra di stato', 'I numeri non sono una regione live: cambiano troppo spesso per essere annunciati.');
  b7.corpo.append(barra.element);
  pagina.append(b7.sezione);
  componenti.push(barra);

  const doctor = createDoctorSurface({
    documentObj,
    testId: 'lab-doctor',
    labels: {
      regionLabel: 'Doctor',
      notChecked: 'Questo controllo non è stato eseguito.',
      missingRemedy: 'Questo problema non ha ancora un rimedio scritto: segnalalo.',
      severities: { ok: 'a posto', info: 'nota', warning: 'da guardare', danger: 'guasto' },
      order: ['chiaveApi', 'shell', 'git', 'naviga', 'sessioniPersistenza'],
      checks: {
        chiaveApi: { title: 'Chiave del fornitore', ok: 'Configurata.', fail: 'Nessuna chiave configurata.', failSeverity: 'danger', remedy: 'Apri le impostazioni' },
        shell: { title: 'Shell', ok: 'Comandi eseguiti con enforcement {v}.' },
        git: { title: 'Git', ok: 'Disponibile.', fail: 'Non trovato nel PATH.', failSeverity: 'warning', remedy: 'Installa Git' },
        naviga: { title: 'Navigazione web', ok: 'Attiva.', fail: 'Non disponibile.', failSeverity: 'warning' },
        sessioniPersistenza: { title: 'Persistenza delle sessioni', failSeverity: 'danger', remedy: 'Apri la cartella dello store' },
      },
    },
    onRemedy: () => {},
  });
  // ⛔ Di proposito manca `sessioniPersistenza`: è il caso che conta, e a
  // schermo deve leggersi «non verificato», mai un verde.
  doctor.update({ diagnosi: { chiaveApi: true, shell: 'desktop', git: false, naviga: true } });
  const b8 = blocco(documentObj, 'Doctor', 'Un controllo assente NON è verde: diventa una nota che dice «non verificato».');
  b8.corpo.append(doctor.element);
  pagina.append(b8.sezione);
  componenti.push(doctor);

  const impostazioni = createSettingsSurface({
    documentObj,
    store,
    testId: 'lab-settings',
    labels: {
      regionLabel: 'Impostazioni',
      save: 'Salva', discard: 'Scarta le modifiche',
      unsaved: 'Hai modifiche non salvate.',
      sections: [
        {
          id: 'aspetto', label: 'Aspetto', saving: 'auto',
          rows: [
            { id: 'temaChiaro', type: 'switch', label: 'Tema chiaro', scope: 'vale da subito' },
            { id: 'animazioni', type: 'switch', label: 'Sfondi animati', scope: 'vale da subito' },
          ],
        },
        {
          id: 'fornitore', label: 'Fornitore', saving: 'explicit',
          rows: [
            { id: 'chiaveApi', type: 'password', label: 'Chiave API', scope: 'vale dalle sessioni nuove', placeholder: 'sk-…' },
            { id: 'modello', type: 'select', label: 'Modello', scope: 'vale dalle sessioni nuove', options: [{ value: 'opus', label: 'claude-opus-5' }, { value: 'sonnet', label: 'claude-sonnet-5' }] },
          ],
        },
      ],
    },
  });
  // ⛔ Un errore e delle modifiche non salvate: sono i due stati che a schermo
  // devono leggersi, non quello a riposo.
  impostazioni.update({ dirty: { fornitore: true }, validation: { chiaveApi: 'La chiave deve iniziare con «sk-».' } });
  const b9 = blocco(documentObj, 'Impostazioni', 'Gli interruttori si salvano da soli; i campi vogliono «Salva». I due modi non si mescolano.');
  b9.corpo.append(impostazioni.element);
  pagina.append(b9.sezione);
  componenti.push(impostazioni);

  html.dataset.visualReady = 'true';

  return () => {
    delete html.dataset.visualReady;
    for (const componente of [...componenti].reverse()) componente.destroy();
    pagina.remove();
  };
}
