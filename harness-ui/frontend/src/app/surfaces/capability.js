import { createField, createListRow, createTabs } from '../../design-system/index.js';
import { attrezziSenzaNome, corrispondeARicerca, nomeUmanoAttrezzo } from '../nomi-attrezzi.js';

/*
 * L'inventario delle Capability: sesta superficie dell'estrazione.
 *
 * Decisione O-08: il composer ha DUE pulsanti separati — «Capability», che
 * apre questo inventario, e il «+», che allega file e basta. Ogni voce
 * dell'inventario (Attrezzi · Skill · MCP · Plugin · Libreria) è una
 * funzionalità reale, non uno stato vuoto onesto messo lì per riempire.
 *
 * ⛔⛔ Regola dell'owner: NIENTE NOMI TECNICI A SCHERMO. Il nome umano viene
 * da `nomi-attrezzi.js`, che è l'UNICO posto dove vive la mappa; l'id tecnico
 * resta come dettaglio secondario (si legge, si copia, si cerca) e NON cambia
 * mai per il modello — è il contratto col kernel.
 *
 * ⛔ E la ricerca accetta tutti e due (ricerca 05/09/2026): chi ha letto una
 * ricevuta scrive `web_search`, non «ricerca sul web». Cercare solo per nome
 * umano punirebbe proprio chi conosce il prodotto.
 *
 * ⛔ Un attrezzo di cui non conosciamo il nome NON scivola a schermo col suo
 * id: si dichiara come «senza nome ancora», perché è un debito nostro e va
 * visto. `nomeUmanoAttrezzo` torna `null` apposta, invece di restituire l'id.
 *
 * ⛔ Ogni sezione dice se una capability è offerta A QUESTO MODELLO (O-06):
 * «Gemma 3 non ha gli attrezzi nel template» è un fatto vero, e un inventario
 * che elenca attrezzi che il modello non riceverà mai è una bugia gentile.
 * Quando non lo sappiamo si scrive che non lo sappiamo.
 */
const SEZIONI = ['attrezzi', 'skill', 'mcp', 'plugin', 'libreria'];

export function createCapabilitySurface({ documentObj, labels, testId, onToggle }) {
  if (!documentObj) throw new TypeError('dipendenze capability mancanti');
  if (!labels || !labels.sections || !labels.searchLabel) {
    throw new TypeError('l\'inventario richiede le sue etichette (sections, searchLabel)');
  }
  const sezioniDichiarate = labels.sections.filter((sezione) => SEZIONI.includes(sezione.id));
  if (sezioniDichiarate.length === 0) throw new TypeError('nessuna sezione valida dichiarata per l\'inventario');

  const radice = documentObj.createElement('div');
  radice.className = 'talos-capability';
  radice.setAttribute('aria-label', labels.regionLabel || 'Capability');
  if (testId) radice.dataset.testid = testId;

  let props = { items: {}, model: null, query: '', section: sezioniDichiarate[0].id };
  let righe = [];

  const ricerca = createField({
    document: documentObj,
    label: labels.searchLabel,
    type: 'search',
    value: '',
    hint: labels.searchHint,
    onInput: (valore) => {
      props = { ...props, query: valore };
      disegna();
    },
    testId: testId ? `${testId}-search` : undefined,
  });

  const pannelli = new Map();
  for (const sezione of sezioniDichiarate) {
    const pannello = documentObj.createElement('div');
    pannello.className = 'talos-capability__panel';
    pannelli.set(sezione.id, pannello);
  }

  function pulisci() {
    for (const riga of righe) riga.destroy();
    righe = [];
  }

  function vuoto(testo) {
    const p = documentObj.createElement('p');
    p.className = 'talos-capability__empty';
    const frase = documentObj.createElement('span');
    frase.textContent = testo;
    p.append(frase);
    return p;
  }

  /*
   * Se un attrezzo arriva a questo modello o no. Tre stati, non due:
   * `true` offerto · `false` non offerto (e si dice) · `null` NON LO SAPPIAMO.
   * Appiattire il terzo sul secondo direbbe «non ce l'hai» quando la verità è
   * «non l'abbiamo chiesto».
   */
  function offerta(voce) {
    if (!props.model) return null;
    if (!Array.isArray(props.model.tools)) return null;
    return props.model.tools.includes(voce.id);
  }

  function rigaCapability(sezione, voce) {
    const umano = sezione.id === 'attrezzi' ? nomeUmanoAttrezzo(voce.id, labels.toolNames) : (voce.name || null);
    const titolo = umano !== null ? umano : (labels.unnamed || voce.id);
    const dettagli = [];
    // ⛔ Il grezzo esiste, ma come dettaglio SECONDARIO — mai come titolo.
    dettagli.push(voce.id);
    const stato = offerta(voce);
    if (stato === true) dettagli.push(labels.offered || '');
    else if (stato === false) dettagli.push(labels.notOffered || '');
    else if (props.model) dettagli.push(labels.offeredUnknown || '');

    const riga = createListRow({
      document: documentObj,
      interactive: typeof onToggle === 'function' ? 'select' : 'none',
      selected: voce.enabled === true,
      title: titolo,
      subtitle: dettagli.filter(Boolean).join(' · '),
      onPress: typeof onToggle === 'function' ? () => onToggle(sezione.id, voce) : undefined,
      testId: `capability-${sezione.id}-${voce.id}`,
    });
    righe.push(riga);
    const li = documentObj.createElement('li');
    // L'id tecnico resta interrogabile dal DOM: le ricevute e i log lo usano.
    li.dataset.capabilityId = voce.id;
    if (umano === null) li.dataset.senzaNome = 'si';
    if (stato !== null) li.dataset.offerta = String(stato);
    li.append(riga.element);
    return li;
  }

  function disegnaSezione(sezione) {
    const pannello = pannelli.get(sezione.id);
    const voci = props.items?.[sezione.id];
    if (!Array.isArray(voci)) {
      pannello.replaceChildren(vuoto(labels.notLoaded || ''));
      return;
    }
    const filtrate = voci.filter((voce) => (
      sezione.id === 'attrezzi'
        ? corrispondeARicerca(voce.id, props.query, labels.toolNames)
        : `${voce.name || ''} ${voce.id}`.toLowerCase().includes(String(props.query).trim().toLowerCase())
    ));
    if (filtrate.length === 0) {
      // ⛔ «Nessun risultato per una ricerca» e «questa sezione è vuota» sono
      // due fatti diversi: dirli uguale fa credere che non ci sia niente.
      pannello.replaceChildren(vuoto(
        String(props.query).trim() === ''
          ? (sezione.emptyLabel || labels.empty || '')
          : (labels.noResults || '').replace('{q}', props.query),
      ));
      return;
    }
    const elenco = documentObj.createElement('ul');
    elenco.className = 'talos-capability__list';
    elenco.setAttribute('role', typeof onToggle === 'function' ? 'listbox' : 'list');
    if (typeof onToggle === 'function') elenco.setAttribute('aria-label', sezione.label);
    for (const voce of filtrate) elenco.append(rigaCapability(sezione, voce));

    const figli = [elenco];
    if (sezione.id === 'attrezzi') {
      const senzaNome = attrezziSenzaNome(filtrate.map((v) => v.id), labels.toolNames);
      if (senzaNome.length > 0 && labels.unnamedNote) {
        // Il debito si vede: sono attrezzi nostri che nessuno ha ancora nominato.
        const nota = documentObj.createElement('p');
        nota.className = 'talos-capability__note';
        nota.textContent = labels.unnamedNote.replace('{n}', String(senzaNome.length));
        nota.setAttribute('title', senzaNome.join(', '));
        figli.push(nota);
      }
    }
    pannello.replaceChildren(...figli);
  }

  const schede = createTabs({
    document: documentObj,
    label: labels.regionLabel,
    items: sezioniDichiarate.map((sezione) => ({ id: sezione.id, label: sezione.label, content: pannelli.get(sezione.id) })),
    value: props.section,
    activation: 'manual',
    onChange: (id) => {
      props = { ...props, section: id };
      disegna();
    },
    testId: testId ? `${testId}-tabs` : undefined,
  });
  radice.append(ricerca.element, schede.element);

  function disegna() {
    pulisci();
    for (const sezione of sezioniDichiarate) disegnaSezione(sezione);
    schede.update({
      value: pannelli.has(props.section) ? props.section : sezioniDichiarate[0].id,
      items: sezioniDichiarate.map((sezione) => ({
        id: sezione.id,
        label: sezione.label,
        count: Array.isArray(props.items?.[sezione.id]) ? props.items[sezione.id].length : undefined,
        countUnit: sezione.countUnit,
        content: pannelli.get(sezione.id),
      })),
    });
  }

  disegna();

  let distrutta = false;
  return Object.freeze({
    element: radice,
    update(nextProps = {}) {
      props = { ...props, ...nextProps };
      disegna();
    },
    destroy() {
      if (distrutta) return false;
      distrutta = true;
      pulisci();
      ricerca.destroy();
      schede.destroy();
      radice.remove();
      return true;
    },
  });
}
