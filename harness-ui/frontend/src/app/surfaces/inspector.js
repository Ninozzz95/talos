import { createListRow, createMeasure, createTabs } from '../../design-system/index.js';
import { ACTIONS } from '../../state/actions.js';
import { selectDock } from '../../state/selectors.js';

/*
 * L'Inspector: la colonna di destra, quinta superficie dell'estrazione.
 *
 * Decisione G11-G13 del redesign: quattro schede — Contesto · File toccati ·
 * Sotto-agenti · Processi. La scheda «Processi» (G20-G21) è la metà UI della
 * riga W1-02, lasciata aperta di proposito quando il motore è stato
 * consegnato: `processiDaEventi` e `guardiaDiStallo` esistono e sono provati,
 * mancava il posto dove guardarli.
 *
 * ⛔⛔ Il vincolo che avremmo sbagliato, dalla ricerca del 05/09/2026: un
 * pannello di scheda NON attivo porta `hidden` e quindi **esce dall'albero di
 * accessibilità**. Un avviso di stallo scritto dentro il pannello «Processi»
 * mentre si guarda «Contesto» non esisterebbe affatto per chi ascolta, e
 * nemmeno una regione live messa lì dentro parlerebbe. ⇒ L'avviso vive in DUE
 * posti: un contrassegno sulla SCHEDA (che è sempre nell'albero) e una regione
 * `role="status"` piccola tenuta FUORI dai pannelli.
 * Fonti: accessibility.build/guides/accessible-tabs ·
 * a11y-collective.com/blog/accessibility-tab/ ·
 * deque.com/blog/a11y-support-series-part-1-aria-tab-panel-accessibility/
 *
 * ⛔ La guardia di stallo è OSSERVATIVA per contratto (`interviene: false`):
 * non ferma niente, segnala. L'interfaccia deve suonare come un'osservazione,
 * non come un verdetto — e deve dire CHI e DA QUANTO, mai un conteggio
 * anonimo. E i suoi due stalli (silenzio · giro a vuoto) restano DUE: appiattirli
 * in un generico «bloccato» butterebbe via la distinzione che il motore paga
 * per costruire.
 *
 * ⛔ Quando la guardia dichiara di NON poter misurare il silenzio
 * (`silenzioValutabile: false`) si scrive il suo motivo. «Nessun allarme»
 * perché non abbiamo guardato non è «nessun allarme».
 */
const SEGNO_NON_MISURATO = '—';

/** Il trattino con il motivo: non misurato non è zero. */
function nonMisurato(documentObj, motivo, parola) {
  const span = documentObj.createElement('span');
  span.className = 'talos-inspector__unmeasured';
  const segno = documentObj.createElement('span');
  segno.setAttribute('aria-hidden', 'true');
  segno.textContent = SEGNO_NON_MISURATO;
  const detto = documentObj.createElement('span');
  detto.className = 'sr-only';
  detto.textContent = parola || 'non misurato';
  span.append(segno, detto);
  if (motivo) span.setAttribute('title', String(motivo));
  return span;
}

export function createInspectorSurface({ documentObj, store, labels, testId }) {
  if (!documentObj || !store) throw new TypeError('dipendenze inspector mancanti');
  if (!labels || !Array.isArray(labels.tabs) || labels.tabs.length === 0 || !labels.unmeasured) {
    throw new TypeError('l\'inspector richiede le sue etichette (tabs, unmeasured)');
  }

  const radice = documentObj.createElement('aside');
  radice.className = 'talos-inspector';
  radice.setAttribute('aria-label', labels.regionLabel || 'Dettagli');
  if (testId) radice.dataset.testid = testId;

  /*
   * La regione che parla, FUORI dai pannelli: dentro un pannello nascosto non
   * sarebbe nell'albero di accessibilità e non annuncerebbe mai.
   */
  const annuncio = documentObj.createElement('span');
  annuncio.className = 'sr-only';
  annuncio.setAttribute('role', 'status');

  const pannelli = new Map();
  for (const scheda of labels.tabs) {
    const pannello = documentObj.createElement('div');
    pannello.className = 'talos-inspector__panel';
    pannelli.set(scheda.id, pannello);
  }

  let props = { processes: null, context: null, files: null, subagents: null };
  let righe = [];
  let misure = [];
  let ultimaFrase = null;

  function pulisci() {
    for (const riga of righe) riga.destroy();
    for (const misura of misure) misura.destroy();
    righe = [];
    misure = [];
  }

  /** Uno stato vuoto ONESTO: dice che non c'è niente, e perché. */
  function vuoto(testo, motivo) {
    const p = documentObj.createElement('p');
    p.className = 'talos-inspector__empty';
    // ⛔ Due NODI, mai testo scalare mescolato ai figli: la prova l'ha preso —
    // scrivere `p.textContent` e poi appendere un figlio faceva sparire la
    // frase principale. Stessa regola gia' scritta in `nav-item.js`.
    const frase = documentObj.createElement('span');
    frase.textContent = testo;
    p.append(frase);
    if (motivo) {
      const dettaglio = documentObj.createElement('span');
      dettaglio.className = 'talos-inspector__empty-reason';
      dettaglio.textContent = ` ${motivo}`;
      p.append(dettaglio);
    }
    return p;
  }

  /** La durata di un processo, o il motivo per cui non c'è. */
  function durata(processo) {
    if (processo.durataMs !== null && processo.durataMs !== undefined) {
      const misura = createMeasure({
        document: documentObj,
        value: (processo.durataMs / 1000).toFixed(1).replace('.', ','),
        unit: 's',
        provenance: 'measured',
      });
      misure.push(misura);
      return misura.element;
    }
    // ⛔ «In corso da N s» è una misura vera e diversa da «durata ignota»:
    // dirle nello stesso modo perderebbe l'informazione più utile che c'è.
    if (processo.inCorsoDaMs !== null && processo.inCorsoDaMs !== undefined) {
      const misura = createMeasure({
        document: documentObj,
        value: (processo.inCorsoDaMs / 1000).toFixed(1).replace('.', ','),
        unit: labels.runningForUnit || 's',
        provenance: 'measured',
      });
      misure.push(misura);
      return misura.element;
    }
    return nonMisurato(documentObj, processo.motivoTempoAssente, labels.unmeasured);
  }

  function disegnaProcessi(pannello) {
    const dati = props.processes;
    if (!dati) {
      pannello.replaceChildren(vuoto(labels.processesUnknown || labels.unmeasured));
      return 0;
    }
    if (!dati.registrato) {
      pannello.replaceChildren(vuoto(labels.processesNone || labels.unmeasured, labels.reasons?.[dati.motivo] || dati.motivo));
      return 0;
    }

    const figli = [];
    const guardia = dati.guardia;
    const segnalazioni = guardia?.segnalazioni || [];

    /*
     * ⛔ Prima l'onestà sulla MISURA, poi le segnalazioni. Se la guardia non
     * ha potuto valutare il silenzio, dirlo viene prima di «nessun allarme»:
     * un allarme che non è stato cercato non è un allarme che non c'è.
     */
    if (guardia && guardia.silenzioValutabile === false && guardia.motivoSilenzioNonValutabile) {
      const nota = documentObj.createElement('p');
      nota.className = 'talos-inspector__note';
      nota.textContent = `${labels.stallNotEvaluated || ''} ${guardia.motivoSilenzioNonValutabile}`.trim();
      figli.push(nota);
    }

    for (const segnalazione of segnalazioni) {
      const avviso = documentObj.createElement('div');
      // Il tipo resta leggibile nel DOM: silenzio e giro a vuoto sono due cose.
      avviso.className = `talos-inspector__stall talos-inspector__stall--${segnalazione.tipo}`;
      avviso.dataset.tipo = segnalazione.tipo;
      const titolo = documentObj.createElement('p');
      titolo.className = 'talos-inspector__stall-title';
      titolo.textContent = labels.stallKinds?.[segnalazione.tipo] || segnalazione.tipo;
      const corpo = documentObj.createElement('p');
      corpo.className = 'talos-inspector__stall-body';
      // ⛔ La descrizione la scrive il motore, con CHI e DA QUANTO dentro: non
      // si riassume qui, si mostra. Riscriverla perderebbe il soggetto.
      corpo.textContent = segnalazione.descrizione;
      avviso.append(titolo, corpo);
      figli.push(avviso);
    }

    const elenco = documentObj.createElement('ul');
    elenco.className = 'talos-inspector__list';
    for (const processo of dati.processi || []) {
      const riga = createListRow({
        document: documentObj,
        interactive: 'none',
        title: processo.comando || processo.descrizione || processo.attrezzo,
        subtitle: labels.origins?.[processo.origine] || processo.origine,
        aside: [durata(processo)],
        testId: `inspector-process-${processo.toolCallId}`,
      });
      righe.push(riga);
      const li = documentObj.createElement('li');
      li.append(riga.element);
      // Lo stato del processo resta leggibile anche da una prova e da un CSS.
      li.dataset.esito = processo.esito;
      if (!processo.comando && processo.motivoComandoAssente) {
        li.setAttribute('title', String(processo.motivoComandoAssente));
      }
      elenco.append(li);
    }
    if (!(dati.processi || []).length) figli.push(vuoto(labels.processesEmpty || labels.processesNone || ''));
    else figli.push(elenco);
    pannello.replaceChildren(...figli);
    return segnalazioni.length;
  }

  function disegnaSemplice(pannello, contenuto, testoVuoto) {
    if (Array.isArray(contenuto) && contenuto.length) {
      const elenco = documentObj.createElement('ul');
      elenco.className = 'talos-inspector__list';
      for (const voce of contenuto) {
        const riga = createListRow({
          document: documentObj,
          interactive: 'none',
          title: voce.title || voce.path || voce.id,
          subtitle: voce.subtitle || '',
        });
        righe.push(riga);
        const li = documentObj.createElement('li');
        li.append(riga.element);
        elenco.append(li);
      }
      pannello.replaceChildren(elenco);
      return;
    }
    // ⛔ Stato vuoto ONESTO, mai dati finti: un pannello che mostra esempi
    // quando non ha dati insegna a non fidarsi di quando ne ha.
    pannello.replaceChildren(vuoto(testoVuoto || ''));
  }

  const schede = createTabs({
    document: documentObj,
    items: labels.tabs.map((scheda) => ({ id: scheda.id, label: scheda.label, content: pannelli.get(scheda.id) })),
    value: labels.tabs[0].id,
    activation: 'manual',
    onChange: (id) => store.dispatch({ type: ACTIONS.LAYOUT_UPDATED, payload: { values: { activeDockTab: id } } }),
    testId: testId ? `${testId}-tabs` : undefined,
  });
  radice.append(schede.element, annuncio);

  function disegna({ tab }) {
    pulisci();
    /*
     * ⛔ Una scheda salvata che non esiste più non deve far esplodere la
     * colonna: si ricade sulla prima DICHIARATA. È un caso vero — il layout
     * persistito di ieri può nominare una scheda che il redesign ha tolto.
     */
    const attiva = pannelli.has(tab) ? tab : labels.tabs[0].id;

    let allarmi = 0;
    for (const scheda of labels.tabs) {
      const pannello = pannelli.get(scheda.id);
      if (scheda.id === 'processi') allarmi = disegnaProcessi(pannello);
      else if (scheda.id === 'file') disegnaSemplice(pannello, props.files, labels.filesEmpty);
      else if (scheda.id === 'sottoagenti') disegnaSemplice(pannello, props.subagents, labels.subagentsEmpty);
      else disegnaSemplice(pannello, props.context, labels.contextEmpty);
    }

    schede.update({
      value: attiva,
      items: labels.tabs.map((scheda) => ({
        id: scheda.id,
        label: scheda.label,
        // Il contrassegno sta sulla SCHEDA, che resta nell'albero anche
        // quando il suo pannello è nascosto.
        count: scheda.id === 'processi' && allarmi > 0 ? allarmi : undefined,
        countUnit: scheda.id === 'processi' && allarmi > 0 ? (labels.stallCountUnit || '') : undefined,
        content: pannelli.get(scheda.id),
      })),
    });

    const frase = allarmi > 0
      ? (labels.stallAnnounce || '').replace('{n}', String(allarmi))
      : '';
    if (frase !== ultimaFrase) {
      ultimaFrase = frase;
      annuncio.textContent = frase;
    }
  }

  const unsubscribe = store.subscribe(selectDock, disegna, { equal: Object.is });

  let distrutta = false;
  return Object.freeze({
    element: radice,
    update(nextProps = {}) {
      props = { ...props, ...nextProps };
      disegna(selectDock(store.getState()));
    },
    destroy() {
      if (distrutta) return false;
      distrutta = true;
      unsubscribe();
      pulisci();
      schede.destroy();
      radice.remove();
      return true;
    },
  });
}
