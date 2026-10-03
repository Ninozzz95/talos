import { t } from './lingua.js';

/* Due fonti indipendenti nella stessa sessione: workflow e deleghe ordinarie. */
const TIPI = Object.freeze(['workflow', 'deleghe']);
let prossimoId = 0;

function bottone(d, testo) {
  const nodo = d.createElement('button');
  nodo.type = 'button';
  nodo.textContent = testo;
  return nodo;
}

export function montaSelettoreRail(contenitore, { iniziale = 'workflow', onSelezione } = {}) {
  const d = contenitore.ownerDocument;
  const id = `talos-sorgenti-${++prossimoId}`;
  const radice = d.createElement('div');
  radice.className = 'talos-sorgenti';
  radice.dataset.c = 'SorgentiAgenti';
  const schede = d.createElement('div');
  schede.className = 'talos-sorgenti__schede';
  schede.setAttribute('role', 'tablist');
  schede.setAttribute('aria-label', t('agenti.sources.workLabel'));
  const pulsanti = new Map();
  const pannelli = new Map();
  for (const tipo of TIPI) {
    const etichetta = tipo === 'workflow' ? t('agenti.sources.workflow') : t('agenti.sources.delegations');
    const tab = bottone(d, etichetta);
    const pannello = d.createElement('section');
    tab.id = `${id}-${tipo}-tab`;
    tab.className = 'talos-sorgenti__scheda';
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-controls', `${id}-${tipo}-pannello`);
    pannello.id = `${id}-${tipo}-pannello`;
    pannello.className = 'talos-sorgenti__pannello';
    pannello.setAttribute('role', 'tabpanel');
    pannello.setAttribute('aria-labelledby', tab.id);
    if (tipo === 'deleghe') pannello.id = 'railDeleghe';
    tab.setAttribute('aria-controls', pannello.id);
    tab.addEventListener('click', () => seleziona(tipo, { notifica: true }));
    schede.append(tab);
    radice.append(pannello);
    pulsanti.set(tipo, tab);
    pannelli.set(tipo, pannello);
  }
  radice.prepend(schede);
  contenitore.replaceChildren(radice);
  let corrente = null;
  function seleziona(tipo, { notifica = false } = {}) {
    if (!TIPI.includes(tipo)) return;
    const cambiata = corrente !== tipo;
    corrente = tipo;
    for (const voce of TIPI) {
      const attiva = voce === tipo;
      const tab = pulsanti.get(voce);
      const pannello = pannelli.get(voce);
      tab.setAttribute('aria-selected', String(attiva));
      tab.tabIndex = attiva ? 0 : -1;
      pannello.dataset.attivo = String(attiva);
      pannello.inert = !attiva;
      pannello.setAttribute('aria-hidden', String(!attiva));
    }
    if (notifica && cambiata) onSelezione?.(tipo);
  }
  schede.addEventListener('keydown', (evento) => {
    const correnteFocus = TIPI.findIndex(tipo => pulsanti.get(tipo) === d.activeElement);
    if (correnteFocus < 0) return;
    let indice = correnteFocus;
    if (evento.key === 'ArrowRight') indice = (indice + 1) % TIPI.length;
    else if (evento.key === 'ArrowLeft') indice = (indice + TIPI.length - 1) % TIPI.length;
    else if (evento.key === 'Home') indice = 0;
    else if (evento.key === 'End') indice = TIPI.length - 1;
    else return;
    evento.preventDefault();
    pulsanti.get(TIPI[indice]).focus();
  });
  seleziona(TIPI.includes(iniziale) ? iniziale : 'workflow');
  return Object.freeze({
    elemento: radice,
    workflowPanel: pannelli.get('workflow'),
    deleghePanel: pannelli.get('deleghe'),
    seleziona,
    corrente: () => corrente,
    distruggi: () => radice.remove(),
  });
}

export function montaSelettoreGrafo(testata, { iniziale, onSelezione } = {}) {
  const d = testata.ownerDocument;
  const gruppo = d.createElement('div');
  gruppo.className = 'talos-sorgenti__grafo';
  gruppo.setAttribute('role', 'group');
  gruppo.setAttribute('aria-label', t('agenti.sources.showDiagram'));
  const pulsanti = new Map();
  for (const tipo of TIPI) {
    const tab = bottone(d, tipo === 'workflow' ? t('agenti.sources.workflow') : t('agenti.sources.delegations'));
    tab.className = 'talos-sorgenti__scheda';
    tab.addEventListener('click', () => { if (tipo !== iniziale) onSelezione?.(tipo); });
    gruppo.append(tab);
    pulsanti.set(tipo, tab);
  }
  function seleziona(tipo) {
    iniziale = tipo;
    for (const voce of TIPI) pulsanti.get(voce).setAttribute('aria-pressed', String(voce === tipo));
  }
  seleziona(iniziale);
  testata.insertBefore(gruppo, testata.lastElementChild);
  return Object.freeze({ elemento: gruppo, seleziona, distruggi: () => gruppo.remove() });
}
