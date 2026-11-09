/*
 * ⭐ RICERCA APPROFONDITA A DUE PORTE — la porta della SEZIONE (owner 21/10/2026 notte; bozzetto approvato il 22/10/2026,
 *   `archivio/2026-10-29/mockup-ricerca-due-porte-2026-10-22/`, foto E-G; forma `FORMA-RICERCA-DUE-PORTE-2026-11-01.md`).
 *
 *   ⛔ Owner 01/11/2026 sera: «niente pillola ricerca approfondita nel composer, solo sezione o richiesta al modello». Le due porte sono:
 *   - «New research» in testa alla sezione Ricerca approfondita: questa modale. La ricerca apre una conversazione NUOVA del progetto e
 *     parte col suo primo giro (`POST /api/v1/sessions/custom` con `ricerca: {profondita}`; il kernel la riceve come `chiamataIniziale`);
 *   - il modello, con `research_start` davanti sul PC (`ricercaDavanti`).
 *   La pillola del compositore, il menu «How deep», la voce del «+» e `/research` del bozzetto (foto A-D) NON ci sono.
 *
 * Fonti lette PRIMA di scrivere (01/11/2026): ChatGPT, «Deep research in ChatGPT» (help.openai.com/en/articles/10500283), la voce nella
 *   barra laterale; W3C APG «Radio Group» per la scelta della profondità (frecce, Home/Fine, una voce sola nel giro del Tab).
 *   ⛔ Niente controlli nativi, niente nomi tecnici a schermo: «research_start» non compare mai.
 */

/** Le profondità vere di `research_start.depth` (kernel), nell'ordine del bozzetto. «Deep» è quella di serie. */
export const PROFONDITA = Object.freeze(['quick', 'deep', 'exhaustive']);
export const PROFONDITA_DI_SERIE = 'deep';
/** Il limite di `research_start.question` (kernel, `DOMANDA_RICERCA_MASSIMA`): uno solo, ripetuto qui perché il bundle non importa il kernel. */
export const DOMANDA_MASSIMA = 500;

function nodo(doc, tag, classe, testo) {
  const el = doc.createElement(tag);
  if (classe) el.className = classe;
  if (testo !== undefined && testo !== null) el.textContent = String(testo);
  return el;
}
function icona(doc, nome, classe = 'i i--sm') {
  const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', classe);
  svg.setAttribute('aria-hidden', 'true');
  const use = doc.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `#i-${nome}`);
  svg.append(use);
  return svg;
}

/**
 * «New research» (foto F e G): la domanda, il conto dei caratteri, e «Advanced» con la profondità (chiuso di serie: semplice a primo
 * sguardo, avanzato a richiesta — owner 22/10). `apriModale` è quella delle sezioni (`modale-td.js`); `onAvvia({domanda, profondita})`
 * fa il resto (una conversazione nuova, la pillola accesa, l'invio). Torna la modale aperta.
 */
export function apriNuovaRicerca(doc, { apriModale, chiudiModale, tr, profondita: iniziale = PROFONDITA_DI_SERIE, onAvvia }) {
  let profondita = PROFONDITA.includes(iniziale) ? iniziale : PROFONDITA_DI_SERIE;
  let partita = false; // revisione S2-2: una modale, una ricerca
  const idAiuto = `nuova-ricerca-aiuto-${Math.random().toString(36).slice(2, 8)}`;
  const idAvanzate = `nuova-ricerca-avanzate-${Math.random().toString(36).slice(2, 8)}`;

  const campo = nodo(doc, 'label', 'talos-field--stack');
  const domanda = nodo(doc, 'textarea', 'talos-textarea talos-nuova-ricerca__domanda');
  domanda.maxLength = DOMANDA_MASSIMA;
  domanda.rows = 5;
  domanda.dataset.nuovaRicercaDomanda = '';
  domanda.setAttribute('aria-describedby', idAiuto);
  campo.append(nodo(doc, 'span', 'talos-field__label', tr('chat.research.modal.question')), domanda);

  const aiuto = nodo(doc, 'p', 'td-subtle talos-nuova-ricerca__aiuto');
  aiuto.id = idAiuto;
  const conto = nodo(doc, 'span', 'talos-nuova-ricerca__conto');
  conto.dataset.nuovaRicercaConto = '';
  aiuto.append(conto, doc.createTextNode(` · ${tr('chat.research.modal.where')}`));

  const avanzate = nodo(doc, 'button', 'talos-nuova-ricerca__avanzate');
  avanzate.type = 'button';
  avanzate.dataset.nuovaRicercaAvanzate = '';
  /* Revisione del blocco 25, R4: lo apre e lo chiude questo modulo (ascoltatore più sotto). Senza il segno la regia generica delle disclosure di `app.js`
     ribalta di nuovo `aria-expanded` sullo stesso clic e il pannello si richiude: è la trappola già scritta in `piano-rivisto.js:76` e `barra-comparsa.js:15` */
  avanzate.dataset.disclosurePropria = '';
  avanzate.setAttribute('aria-expanded', 'false');
  avanzate.setAttribute('aria-controls', idAvanzate);
  const etichettaAvanzate = nodo(doc, 'span');
  avanzate.append(icona(doc, 'chevron-right', 'i i--sm talos-nuova-ricerca__freccia'), etichettaAvanzate);

  const pannello = nodo(doc, 'div', 'talos-stack talos-nuova-ricerca__pannello');
  pannello.id = idAvanzate;
  pannello.hidden = true;
  const titoloGruppo = nodo(doc, 'span', 'talos-eyebrow', tr('chat.research.modal.howDeep'));
  titoloGruppo.id = `${idAvanzate}-titolo`;
  const gruppo = nodo(doc, 'div', 'talos-card talos-list');
  gruppo.setAttribute('role', 'radiogroup');
  gruppo.setAttribute('aria-labelledby', titoloGruppo.id);
  const righe = PROFONDITA.map((p) => {
    const riga = nodo(doc, 'button', 'talos-list-row');
    riga.type = 'button';
    riga.setAttribute('role', 'radio');
    riga.dataset.profondita = p;
    const testo = nodo(doc, 'span', 'talos-list-row__text');
    testo.append(nodo(doc, 'span', 'talos-list-row__title', tr(`chat.research.depth.${p}`)), nodo(doc, 'span', 'talos-list-row__sub', tr(`chat.research.depth.${p}Help`)));
    const lato = nodo(doc, 'span', 'talos-list-row__aside');
    lato.append(icona(doc, 'check', 'i'));
    riga.append(testo, lato);
    riga.addEventListener('click', () => { profondita = p; aggiorna(); });
    riga.addEventListener('keydown', (e) => {
      if (!['ArrowDown', 'ArrowUp', 'ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(e.key)) return;
      e.preventDefault();
      const i = PROFONDITA.indexOf(p);
      const n = e.key === 'Home' ? 0 : e.key === 'End' ? PROFONDITA.length - 1 : (i + (['ArrowDown', 'ArrowRight'].includes(e.key) ? 1 : -1) + PROFONDITA.length) % PROFONDITA.length;
      profondita = PROFONDITA[n];
      aggiorna();
      righe[n].focus();
    });
    gruppo.append(riga);
    return riga;
  });
  pannello.append(titoloGruppo, gruppo, nodo(doc, 'p', 'td-subtle', tr('chat.research.modal.searchNote')));

  avanzate.addEventListener('click', () => {
    const aperto = avanzate.getAttribute('aria-expanded') !== 'true';
    avanzate.setAttribute('aria-expanded', String(aperto));
    pannello.hidden = !aperto;
    aggiorna();
  });

  const piede = nodo(doc, 'div', 'td-detail-footer talos-nuova-ricerca__piede');
  const annulla = nodo(doc, 'button', 'talos-button talos-button--secondary', tr('chat.common.cancel'));
  annulla.type = 'button';
  annulla.addEventListener('click', () => chiudiModale());
  const avvia = nodo(doc, 'button', 'talos-button talos-button--primary');
  avvia.type = 'button';
  avvia.dataset.nuovaRicercaAvvia = '';
  avvia.append(icona(doc, 'globe'), doc.createTextNode(tr('chat.research.modal.start')));
  piede.append(annulla, nodo(doc, 'span', 'talos-grow'), avvia);

  function aggiorna() {
    const n = domanda.value.trim().length;
    conto.textContent = tr('chat.research.modal.count', { n, massimo: DOMANDA_MASSIMA });
    avvia.disabled = partita || n === 0; // partita: un ridisegno non riaccende il bottone (revisione S2-2)
    const aperto = avanzate.getAttribute('aria-expanded') === 'true';
    etichettaAvanzate.textContent = aperto ? tr('chat.research.modal.advanced')
      : tr('chat.research.modal.advancedWithDepth', { profondita: tr(`chat.research.depth.${profondita}`) });
    for (const riga of righe) {
      const scelta = riga.dataset.profondita === profondita;
      riga.setAttribute('aria-checked', String(scelta));
      riga.setAttribute('aria-selected', String(scelta));
      riga.tabIndex = scelta ? 0 : -1;
      riga.querySelector('.talos-list-row__aside').hidden = !scelta;
    }
  }
  domanda.addEventListener('input', aggiorna);
  /* Ctrl/Cmd+Invio avvia, come il compositore; l'Invio da solo va a capo (una domanda può essere lunga) */
  domanda.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !avvia.disabled) { e.preventDefault(); avvia.click(); } });
  /* Revisione S2-2 (01/11/2026): la modale resta a schermo ~150 ms mentre esce (`modale-td.js`, `pointer-events:none` ferma il mouse ma non
     la tastiera) e il fuoco resta nel campo: un Ctrl+Invio tenuto premuto ripeteva il clic e apriva DUE conversazioni con la loro ricerca.
     Il segno «già partita» vale per qualunque strada arrivi il secondo clic, e il bottone si spegne. */
  avvia.addEventListener('click', () => {
    if (partita) return;
    const testo = domanda.value.trim();
    if (!testo) { domanda.focus(); return; }
    partita = true;
    avvia.disabled = true;
    chiudiModale();
    onAvvia({ domanda: testo, profondita });
  });
  aggiorna();

  /* l'occhiello «Deep research» sopra il titolo, come il bozzetto (foto F: `talos-eyebrow` + `talos-dialog__title`) */
  const aperta = apriModale(tr('chat.research.modal.title'), [campo, aiuto, avanzate, pannello, piede], { document: doc, occhiello: tr('chat.research.modal.eyebrow') });
  aperta?.dialogo?.setAttribute('data-nuova-ricerca', '');
  domanda.focus?.({ preventScroll: true });
  return aperta;
}
