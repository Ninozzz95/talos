import { t, tn } from './lingua.js';
/* Ask Question is a tool result surface, not a new view or modal. */

/*
 * ⛔ 23/09/2026, riparazione D1 (revisione avversaria, RAPPORTO-UI §3) — una domanda che arriva dal
 * vivo NON prende il fuoco: prima `app.js` lo portava sul primo radio, e lo spazio che la persona
 * stava battendo nel composer spuntava l'opzione e la INVIAVA. La domanda si ANNUNCIA invece a chi
 * usa un lettore di schermo, con una regione viva educata.
 * Fonti (consultate il 23/09/2026):
 *  - WAI-ARIA APG, Developing a Keyboard Interface — il fuoco si sposta da solo solo quando la pagina
 *    ha una funzione primaria che quasi tutti usano subito: https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/
 *  - MDN, ARIA live regions — la regione deve ESISTERE nel DOM prima che il testo cambi; se la si
 *    crea al volo, il testo si scrive dopo con setTimeout; `polite` aspetta che la persona sia ferma,
 *    `assertive` solo per l'urgente: https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Guides/Live_regions
 * ⇒ `role=status` (implicito `aria-live=polite`, dichiarato anche esplicito) + `aria-atomic`, fuori dal
 *   dock (che è `hidden` quando è vuoto: una regione nascosta non parla), svuotata e riscritta nel task
 *   successivo così anche due domande uguali di fila vengono lette.
 * ⛔ 24/09/2026, decisione owner 31 (D37): confermato — nessun furto di fuoco; i tasti 1-9 funzionano quando il fuoco
 *   è nella scheda.
 */
/*
 * ⛔ 24/09/2026 — Ask completa, lato interfaccia (fetta F3-22), decisioni owner 10, 11 e 32:
 *   11: una domanda ALLA VOLTA («Domanda 2 di 3»), «Altro» sempre, consigliata per prima, invio al clic della scelta
 *       singola finale, tasti 1-9;
 *   32: sotto ogni domanda il suo «Perché conta», e la consigliata lo dice (a schermo e al lettore di schermo);
 *   10: a domanda chiusa la scheda diventa la RICEVUTA «Decisione»: domanda, perché conta, risposta, opzioni offerte con
 *       la consigliata e la scelta, chi e quando, in quale modo — e un esito che distingue risposta, salto, annullamento
 *       (col suo motivo), interruzione dal riavvio, scadenza e «nessuno poteva rispondere».
 * Fonti (dossier `.claude/RICERCA-10x4-WORKFLOW-PLAN-ASK-2026-09-23.md`, 23/09/2026): Spec Kit `/clarify` (una alla
 *   volta, col suo «why it matters», risposte scritte nella specifica); Claude Code AskUserQuestion (schede per domanda e
 *   revisione finale); Cline (la scelta singola si invia al clic); Codex `request_user_input_async.rs:42` (consigliata
 *   prima). ⇒ La struttura sta qui; la famiglia visiva (`talos-approval`) la ridisegna il refactor ATLAS.
 */
const ID_ANNUNCIO = 'talosAnnuncioDomanda';
let prossimoIdOpzione = 0;

function testoAnnuncio(questions) {
  const testi = questions.map((entry) => String(entry?.question || '').trim()).filter(Boolean);
  const corpo = testi.join(' · ') || t('chat.question.withoutText');
  // «prima?.» nella prima foto: il punto si aggiunge solo se la domanda non finisce già con una pausa.
  return tn('chat.question.announceOne', 'chat.question.announceMany', questions.length, { corpo, pausa: /[.?!…]$/.test(corpo) ? ' ' : '. ' });
}

function annunciaDomanda(doc, questions, pianifica) {
  const body = doc.body;
  if (!body) return;
  let regione = doc.getElementById?.(ID_ANNUNCIO) || null;
  if (!regione) {
    regione = doc.createElement('div');
    regione.id = ID_ANNUNCIO;
    regione.className = 'sr-only';
    regione.setAttribute('role', 'status');
    regione.setAttribute('aria-live', 'polite');
    regione.setAttribute('aria-atomic', 'true');
    body.append(regione);
  }
  regione.textContent = '';
  const testo = testoAnnuncio(questions);
  pianifica(() => { regione.textContent = testo; });
}

/* L'ora di un istante ISO, «15:02», nel fuso di chi guarda. Un istante illeggibile non diventa un'ora inventata. */
function ora(at) {
  const data = typeof at === 'string' ? new Date(at) : null;
  if (!data || Number.isNaN(data.getTime())) return null;
  return String(data.getHours()).padStart(2, '0') + ':' + String(data.getMinutes()).padStart(2, '0');
}

/* La frase dell'esito: una per stato, e per `cancelled` una per motivo. Mai «annullata» per ciò che non lo è. */
function fraseEsito(status, motivo, altrove) {

  if (status === 'answered') return altrove ? t('chat.question.outcome.answeredElsewhere') : t('chat.question.outcome.answered');
  if (status === 'skipped') return altrove ? t('chat.question.outcome.skippedElsewhere') : t('chat.question.outcome.skipped');
  if (status === 'expired') return t('chat.question.outcome.expired');
  if (status === 'unanswerable') return t('chat.question.outcome.unanswerable');
  if (motivo === 'fermato') return t('chat.question.outcome.stopped');
  if (motivo === 'reindirizzamento') return t('chat.question.outcome.redirected');
  if (motivo === 'nuovo-messaggio') return t('chat.question.outcome.newMessage');
  if (motivo === 'interrotta') return t('chat.question.outcome.interrupted');
  if (motivo === 'non-salvata') return t('chat.question.outcome.notSaved');
  return t('chat.question.outcome.cancelled');
}

/* Chi e quando: «Chiesta alle 15:01 in modalità Piano · hai risposto alle 15:02».
   ⛔ Revisione Codex del 02/10/2026, rilievo 3: con la testata «… da un’altra finestra» la ricevuta non dice «hai risposto». */
function fraseChiEQuando(richiesta, status, esito, altrove = false) {
  const parti = [];
  const chiesta = ora(richiesta?.at);
  const modo = richiesta?.origine?.modalita === 'piano' ? t('chat.question.mode.plan') : richiesta?.origine?.modalita ? t('chat.question.mode.normal') : null;
  if (chiesta || modo) parti.push(t('chat.question.asked', { ora: chiesta ? t('chat.question.at', { ora: chiesta }) : '', modo: modo ? t('chat.question.inMode', { modo }) : '' }));
  const chiusa = ora(esito?.at);
  if (chiusa) {
    const chi = esito?.da === 'sistema' ? t('chat.question.closedBy.system')
      : status === 'answered' ? (altrove ? t('chat.question.closedBy.answeredElsewhere') : t('chat.question.closedBy.youAnswered'))
        : status === 'skipped' ? (altrove ? t('chat.question.closedBy.skippedElsewhere') : t('chat.question.closedBy.youSkipped')) : t('chat.question.closedBy.closed');
    parti.push(t('chat.question.closedAt', { chi, ora: chiusa }));
  }
  return parti.join(' · ');
}

/*
 * ⛔ 24/09/2026, decisioni owner 9 e 35 — la SCADENZA facoltativa è un'impostazione della persona (Nessuna, 1, 5, 10 minuti).
 *   Fonte (dossier `.claude/RICERCA-10x4-WORKFLOW-PLAN-ASK-2026-09-23.md`, D1): Claude Code `askUserQuestionTimeout` —
 *   «Questions stay open until you answer them», timeout facoltativo 60 s / 5 min / 10 min con conto alla rovescia. WCAG 2.2
 *   SC 2.2.1 Timing Adjustable: un limite di tempo si spegne o si regola, ed è spento di serie.
 * ⇒ Il conto parte da quando la scheda è a VISTA (mai prima della nascita della domanda): una domanda rimasta aperta con la
 *   finestra chiusa o sopravvissuta a un riavvio non scade nell'istante in cui la si apre. Alla fine la scheda la chiude
 *   `expired`; il registro la attribuisce al sistema e ferma il giro. Il conto non parla al lettore di schermo ogni secondo.
 */
function ogniSecondoPredefinito(fn) {
  const id = setInterval(fn, 1000);
  return () => clearInterval(id);
}

/*
 * C2-Q (08/10/2026): `chiChiede` = la riga «L’agente «…» chiede» quando la domanda è di una FIGLIA e la carta si disegna nella
 *   conversazione del padre. È la stessa riga della carta di permesso della figlia (C2), costruita da chi monta la carta; qui
 *   si mette in testa e basta. Senza, la carta è quella di sempre.
 */
export function mountUserQuestionDock({ root, composer, question, onSubmit, annuncia = false, pianifica,
  scadenzaMs = 0, adesso = () => Date.now(), ogniSecondo = ogniSecondoPredefinito, chiChiede = null }) {
  if (!root?.ownerDocument || !composer || !question?.requestId || !Array.isArray(question.questions)
    || typeof onSubmit !== 'function') throw new TypeError('Ask dock requires a real request and submit handler');
  const doc = root.ownerDocument;
  let storage;
  try { storage = doc.defaultView?.sessionStorage; } catch { /* Browser policy may block storage. */ }
  const storageKey = 'talos.ask-draft.v1:' + question.sessionId + ':' + question.requestId;
  const signature = JSON.stringify(question.questions);
  const make = (tag, className, content) => {
    const element = doc.createElement(tag);
    if (className) element.className = className;
    if (content !== undefined) element.textContent = content;
    return element;
  };
  const button = (content, className) => {
    const element = make('button', className, content);
    element.type = 'button';
    return element;
  };
  const card = make('section', 'talos-approval real-question-card talos-question-card');
  card.dataset.c = 'UserQuestionCard';
  card.dataset.requestId = question.requestId;
  card.setAttribute('aria-label', t('chat.question.cardLabel'));
  const head = make('div', 'talos-approval__head');
  /* C2-Q (08/10, visto nella foto): con la riga «L’agente «…» chiede» il badge non può dire anche «TALOS chiede» — due «chiede»
     in fila, e il secondo attribuisce a TALOS la domanda della figlia. Per una figlia dice solo che cos'è. */
  const badge = make('span', 'talos-badge talos-badge--accent', t(chiChiede ? 'chat.question.badgeFromAgent' : 'chat.question.badge'));
  const progresso = make('span', 'talos-muted talos-grow');
  const conto = make('span', 'talos-question-card__timer');
  conto.hidden = true;
  head.append(badge, progresso, conto);
  if (chiChiede) head.prepend(chiChiede);
  const answerPane = make('div', 'talos-question-card__questions');
  const reviewPane = make('div', 'talos-question-card__review');
  const reviewTitle = make('h3', 'talos-question-card__review-title', t('chat.question.review.title'));
  const reviewList = make('dl', 'talos-question-card__review-list');
  const reviewWarning = make('p', 'talos-question-card__warning');
  reviewWarning.setAttribute('role', 'status');
  reviewPane.append(reviewTitle, reviewList, reviewWarning);
  const receiptPane = make('div', 'talos-question-card__receipt');
  receiptPane.hidden = true;
  const notice = make('p', 'talos-question-card__notice');
  notice.setAttribute('role', 'status');
  const actions = make('div', 'talos-approval__foot talos-question-card__actions');
  const backButton = button(t('chat.common.back'), 'talos-button talos-button--ghost talos-button--sm');
  const nextButton = button(t('chat.question.next'), 'talos-button talos-button--primary talos-button--md');
  const reviewButton = button(t('chat.question.review.open'), 'talos-button talos-button--primary talos-button--md');
  const editButton = button(t('chat.question.review.edit'), 'talos-button talos-button--secondary talos-button--sm');
  const sendButton = button(t('chat.question.review.confirm'), 'talos-button talos-button--primary talos-button--md');
  const skipButton = button(t('chat.question.skip'), 'talos-button talos-button--ghost talos-button--sm');
  const confirmSkipButton = button(t('chat.question.confirmSkip'), 'talos-button talos-button--secondary talos-button--sm');
  actions.append(backButton, skipButton, editButton, confirmSkipButton, nextButton, reviewButton, sendButton);
  card.append(head, answerPane, reviewPane, receiptPane, notice, actions);
  const fields = [];
  let stage = 'answer';
  let corrente = 0;
  let busy = false;
  let resolved = false;
  let destroyed = false;
  let avvisoRipresa = '';
  let fermaConto = null;
  const nascita = Date.parse(question.at || '');
  const inizioConto = Math.max(Number.isFinite(nascita) ? nascita : 0, adesso());
  /*
   * ⛔ 23/09/2026, riparazione D2 — la scelta singola si invia all'atto ESPLICITO (clic, o Spazio che è
   * il clic della tastiera), MAI alla sola navigazione a frecce. Decisione owner 23/09.
   * Fonti (consultate il 23/09/2026):
   *  - WAI-ARIA APG, Radio Group: «Down Arrow … uncheck the previously focused button, and check the
   *    newly focused button» — la freccia SPUNTA: https://www.w3.org/WAI/ARIA/apg/patterns/radio/
   *  - WCAG 2.2 SC 3.2.2 On Input, fallimenti F36/F37 (un cambio di contesto alla selezione di un radio):
   *    https://www.w3.org/WAI/WCAG22/Understanding/on-input.html
   *  - facebook/react#7407 e CSS-Tricks «When a Click is Not Just a Click»: sulla freccia il browser emette
   *    anche un `click` (detail 0), quindi ascoltare `click` invece di `change` NON basta.
   * ⇒ Si ricorda l'ULTIMO gesto sulle opzioni: `pointerdown` sull'etichetta (il radio vi sta dentro, la
   *   bolla arriva) = puntatore; `keydown` sul radio = Spazio o navigazione. Solo i primi due inviano.
   * ⛔ 24/09/2026, decisione owner 11: anche un tasto 1-9 con il fuoco nella scheda è un gesto esplicito.
   */
  let gesto = null;
  /*
   * ⛔ 23/09/2026, trovato scrivendo la prova di MUT-8 — il ritorno del fuoco al composer non scattava
   * MAI nel browser vero: all'invio i controlli diventano `disabled` (busy), e un elemento a fuoco che
   * smette di essere focalizzabile manda il fuoco al <body> (HTML Standard, «focus fixup rule»,
   * https://html.spec.whatwg.org/multipage/interaction.html#focus-fixup-rule, consultato 23/09/2026).
   * Alla risoluzione `card.contains(activeElement)` era già falso. ⇒ Si ricorda se il fuoco era nella
   * scheda quando l'invio è partito, e lo si riporta al composer solo se nel frattempo non è andato
   * altrove (è ancora nella scheda, o è caduto sul body).
   */
  let fuocoNellaSchedaAllInvio = false;

  function readDraft() {
    const answers = {};
    for (const field of fields) {
      const custom = field.other?.value.trim() || '';
      if (field.options.length === 0) {
        const value = field.textarea.value.trim();
        if (value) answers[field.id] = value;
      } else if (field.multi) {
        const selected = field.options.filter((input) => input.checked).map((input) => input.value);
        const values = [...selected, ...(custom ? [custom] : [])];
        if (values.length) answers[field.id] = values;
      } else {
        const value = custom || field.options.find((input) => input.checked)?.value || '';
        if (value) answers[field.id] = value;
      }
    }
    return answers;
  }

  function persistDraft() {
    if (resolved || destroyed) return;
    try {
      storage?.setItem(storageKey, JSON.stringify({ signature, answers: readDraft() }));
    } catch { /* Session storage may be disabled. The live DOM still keeps the draft. */ }
  }

  function restoreDraft() {
    let saved;
    try {
      const raw = storage?.getItem(storageKey);
      if (!raw || raw.length > 24_000) return;
      saved = JSON.parse(raw);
    } catch { return; }
    if (saved?.signature !== signature || !saved.answers || typeof saved.answers !== 'object') return;
    for (const field of fields) {
      const value = saved.answers[field.id];
      if (field.options.length === 0) {
        if (typeof value === 'string') field.textarea.value = value;
        continue;
      }
      if (field.multi) {
        if (!Array.isArray(value)) continue;
        for (const option of field.options) option.checked = value.includes(option.value);
        if (field.other) field.other.value = value.find((entry) =>
          typeof entry === 'string' && !field.options.some((option) => option.value === entry)) || '';
        continue;
      }
      if (typeof value !== 'string') continue;
      const option = field.options.find((entry) => entry.value === value);
      if (option) option.checked = true;
      else if (field.other) field.other.value = value;
    }
  }

  const tutteSingoleSenzaAltro = () => fields.every((entry) => entry.options.length > 0 && !entry.multi && !entry.other?.value.trim());

  /* Dopo una scelta: la bozza si salva; un gesto esplicito su una scelta singola porta avanti, e sull'ultima invia. */
  function dopoLaScelta(field, input, esplicito) {
    if (!field.multi && input.checked && field.other) field.other.value = '';
    persistDraft();
    if (!esplicito || stage !== 'answer' || busy || field.multi || !input.checked) return;
    const indice = fields.indexOf(field);
    if (indice < fields.length - 1) {
      if (indice === corrente) { corrente = indice + 1; render(); }
      return;
    }
    if (tutteSingoleSenzaAltro() && Object.keys(readDraft()).length === fields.length) void submit('answered');
  }

  for (const [index, prompt] of question.questions.entries()) {
    const fieldset = make('fieldset', 'talos-stack talos-question-card__fieldset');
    const id = typeof prompt.id === 'string' && prompt.id ? prompt.id : 'q' + index;
    fieldset.dataset.questionId = id;
    fieldset.append(make('legend', 'assistant-copy', prompt.question || t('chat.question.label')));
    const perche = typeof prompt.why === 'string' ? prompt.why.trim() : '';
    if (perche) fieldset.append(make('p', 'talos-question-card__why', t('chat.question.whyItMatters', { perche })));
    const field = { id, prompt, multi: prompt.multiSelect === true, options: [], other: null, textarea: null, fieldset };
    if (Array.isArray(prompt.options) && prompt.options.length) {
      for (const [numero, option] of prompt.options.entries()) {
        const label = make('label', 'sheet-toggle-row');
        const input = make('input');
        input.type = field.multi ? 'checkbox' : 'radio';
        input.name = 'question-' + id;
        input.value = String(option.label || '');
        /* ⛔ 23/09/2026, riparazione D7 — «StabilePer tutti»: etichetta e descrizione erano due inline
           attaccati, a schermo e nel nome accessibile. Ora il nome è la sola etichetta e la descrizione
           è la descrizione (aria-labelledby / aria-describedby, WAI-ARIA 1.2 §accname), e a schermo va
           a capo (workflow-r4.css). */
        const description = make('span', 'talos-question-card__option-text');
        const suffisso = 'talosAskOpzione' + (++prossimoIdOpzione);
        const nome = make('strong', 'talos-question-card__option-label', input.value);
        nome.id = suffisso + '-nome';
        const titolo = make('span', 'talos-question-card__option-title');
        titolo.append(nome);
        description.append(titolo);
        input.setAttribute('aria-labelledby', nome.id);
        const descritta = [];
        if (option.recommended === true) {
          const consigliata = make('span', 'talos-badge talos-question-card__recommended', t('chat.question.recommended'));
          consigliata.id = suffisso + '-consigliata';
          titolo.append(consigliata);
          descritta.push(consigliata.id);
        }
        const spiegazione = String(option.description || '');
        if (spiegazione) {
          const dettaglio = make('small', 'talos-question-card__option-description', spiegazione);
          dettaglio.id = suffisso + '-descrizione';
          description.append(dettaglio);
          descritta.push(dettaglio.id);
        }
        if (descritta.length) input.setAttribute('aria-describedby', descritta.join(' '));
        /* Il tasto che la sceglie: 1-9 (decisione owner 11). Il numero è l'ordine vero dell'opzione, non un ornamento. */
        const tasto = make('kbd', 'talos-question-card__key', numero < 9 ? String(numero + 1) : '');
        tasto.setAttribute('aria-hidden', 'true');
        label.append(input, tasto, description);
        fieldset.append(label);
        field.options.push(input);
        label.addEventListener('pointerdown', () => { gesto = 'puntatore'; });
        input.addEventListener('keydown', (event) => { gesto = event.key === ' ' ? 'spazio' : 'navigazione'; });
        input.addEventListener('change', () => {
          const esplicito = gesto === 'puntatore' || gesto === 'spazio';
          gesto = null;
          dopoLaScelta(field, input, esplicito);
        });
      }
      field.other = make('input', 'talos-field__input');
      field.other.type = 'text';
      field.other.maxLength = 4_000;
      field.other.placeholder = t('chat.question.other.placeholder');
      field.other.setAttribute('aria-label', t('chat.question.other.label'));
      field.other.addEventListener('input', () => {
        if (!field.multi && field.other.value.trim()) {
          for (const option of field.options) option.checked = false;
        }
        persistDraft();
      });
      fieldset.append(field.other);
    } else {
      // 24/09/2026, visto nella foto del giro vero del Piano: `talos-field__input` è la riga singola con icona (rientro triplo,
      // nessun margine verticale); un'area di testo usa il suo componente, `.talos-textarea` (index.css).
      field.textarea = make('textarea', 'talos-textarea');
      field.textarea.rows = 3;
      field.textarea.maxLength = 4_000;
      // 24/09/2026, visto nella foto del giro vero: un campo vuoto senza indicazione non dice che cosa si aspetta.
      field.textarea.placeholder = t('chat.question.free.placeholder');
      field.textarea.setAttribute('aria-label', prompt.question || t('chat.question.free.label'));
      field.textarea.addEventListener('input', persistDraft);
      fieldset.append(field.textarea);
    }
    fields.push(field);
    answerPane.append(fieldset);
  }
  restoreDraft();

  /* La ricevuta «Decisione» (decisione owner 10): si costruisce una volta, dai dati della richiesta e dell'esito. */
  function disegnaRicevuta(status, esito, altrove = false) {
    const risposte = status === 'answered' && esito?.answers && typeof esito.answers === 'object' ? esito.answers : {};
    const elenco = make('dl', 'talos-question-card__receipt-list');
    for (const field of fields) {
      const riga = make('div', 'talos-question-card__receipt-row');
      riga.dataset.questionId = field.id;
      const valore = risposte[field.id];
      const scelte = Array.isArray(valore) ? valore : typeof valore === 'string' ? [valore] : [];
      const note = new Set(field.options.map((input) => input.value));
      const testoRisposta = scelte.length === 0 ? t('chat.question.receipt.noAnswer')
        : scelte.map((voce) => (field.options.length && !note.has(voce) ? t('chat.question.receipt.otherAnswer', { voce }) : voce)).join(', ');
      const risposta = make('dd', 'talos-question-card__receipt-answer', testoRisposta);
      riga.append(make('dt', 'talos-question-card__receipt-question', field.prompt.question || t('chat.question.label')), risposta);
      const perche = typeof field.prompt.why === 'string' ? field.prompt.why.trim() : '';
      if (perche) riga.append(make('dd', 'talos-question-card__why', t('chat.question.whyItMatters', { perche })));
      if (field.options.length) {
        const dettagli = make('details', 'talos-question-card__offered');
        dettagli.append(make('summary', '', t('chat.question.receipt.optionsOffered', { n: field.options.length })));
        const lista = make('ul', 'talos-question-card__offered-list');
        for (const [indice, input] of field.options.entries()) {
          const voce = make('li', 'talos-question-card__offered-item');
          voce.append(make('span', 'talos-question-card__option-label', input.value));
          if (field.prompt.options?.[indice]?.recommended === true) voce.append(make('span', 'talos-badge talos-question-card__recommended', t('chat.question.recommended')));
          if (scelte.includes(input.value)) {
            voce.dataset.scelta = 'true';
            voce.append(make('span', 'talos-badge talos-badge--accent talos-question-card__chosen', t('chat.question.receipt.chosen')));
          }
          lista.append(voce);
        }
        dettagli.append(lista);
        riga.append(dettagli);
      }
      elenco.append(riga);
    }
    const chiEQuando = fraseChiEQuando(question, status, esito, altrove);
    receiptPane.replaceChildren(...(chiEQuando ? [make('p', 'talos-question-card__receipt-meta', chiEQuando)] : []), elenco);
  }

  function render(next = {}) {
    if (destroyed) return;
    if (resolved && next.stage !== 'resolved') return;
    if (next.stage === 'resolved') {
      resolved = true;
      stage = 'resolved';
      fermaConto?.();
      fermaConto = null;
      conto.hidden = true;
      try { storage?.removeItem(storageKey); } catch { /* no storage */ }
      answerPane.hidden = true;
      reviewPane.hidden = true;
      actions.hidden = true;
      badge.textContent = t('chat.question.decision');
      badge.className = 'talos-badge';
      const frase = fraseEsito(next.status, next.esito?.motivo, next.altrove);
      progresso.textContent = frase;
      disegnaRicevuta(next.status, next.esito, Boolean(next.altrove));
      receiptPane.hidden = false;
      /* La frase sta già nella testata: qui resta per il lettore di schermo (regione `status`), fuori dalla vista. */
      notice.hidden = false;
      notice.className = 'talos-question-card__notice sr-only';
      notice.textContent = frase;
      card.dataset.state = stage;
      card.dataset.esito = String(next.status || '');
      const attivo = doc.activeElement;
      if (card.contains(attivo) || (fuocoNellaSchedaAllInvio && (!attivo || attivo === doc.body))) composer.focus();
      return;
    }
    if (next.stage) stage = next.stage;
    if (Number.isInteger(next.corrente)) corrente = Math.max(0, Math.min(fields.length - 1, next.corrente));
    card.dataset.state = stage;
    const ultima = corrente === fields.length - 1;
    progresso.textContent = fields.length === 1 ? t('chat.question.oneDecision') : t('chat.question.progress', { n: corrente + 1, totale: fields.length });
    answerPane.hidden = stage !== 'answer' && stage !== 'stale';
    for (const [indice, field] of fields.entries()) field.fieldset.hidden = indice !== corrente;
    reviewPane.hidden = stage !== 'review' && stage !== 'skip-review';
    backButton.hidden = stage !== 'answer' || corrente === 0;
    nextButton.hidden = stage !== 'answer' || ultima;
    reviewButton.hidden = stage !== 'answer' || !ultima;
    skipButton.hidden = stage !== 'answer';
    editButton.hidden = stage !== 'review' && stage !== 'skip-review';
    sendButton.hidden = stage !== 'review';
    confirmSkipButton.hidden = stage !== 'skip-review';
    actions.hidden = stage === 'stale';
    const messaggio = next.message || (busy ? t('chat.question.waitingForServer') : avvisoRipresa);
    notice.hidden = !messaggio;
    notice.textContent = messaggio;
    for (const control of [backButton, nextButton, reviewButton, editButton, sendButton, skipButton, confirmSkipButton]) control.disabled = busy;
    for (const field of fields) {
      for (const control of [...field.options, field.other, field.textarea]) {
        if (control) control.disabled = busy || stage === 'stale';
      }
    }
    if (stage === 'review') {
      const draft = readDraft();
      reviewList.replaceChildren();
      for (const [index, prompt] of question.questions.entries()) {
        const value = draft[fields[index].id];
        const row = make('div', 'talos-question-card__review-row');
        row.append(make('dt', '', prompt.question), make('dd', '', Array.isArray(value) ? value.join(', ') : value || t('chat.question.review.unanswered')));
        reviewList.append(row);
      }
      const missing = question.questions.length - Object.keys(draft).length;
      const duplicate = fields.some((field) => field.multi && field.other?.value.trim()
        && field.options.some((option) => option.checked && option.value === field.other.value.trim()));
      reviewWarning.textContent = duplicate ? t('chat.question.review.otherDuplicatesChoice')
        : missing ? tn('chat.question.review.unansweredOne', 'chat.question.review.unansweredMany', missing)
          : t('chat.question.review.allReady');
      sendButton.disabled = busy || missing > 0 || duplicate;
    } else if (stage === 'skip-review') {
      reviewTitle.textContent = t('chat.question.skipAll.title');
      reviewList.replaceChildren();
      reviewWarning.textContent = t('chat.question.skipAll.warning');
    }
    if (stage === 'review') reviewTitle.textContent = t('chat.question.review.title');
  }

  async function submit(status) {
    if (busy || resolved || destroyed) return;
    const answers = readDraft();
    if (status === 'answered' && Object.keys(answers).length !== question.questions.length) return;
    fuocoNellaSchedaAllInvio = card.contains(doc.activeElement);
    busy = true;
    render();
    try {
      await onSubmit({ requestId: question.requestId, status, ...(status === 'answered' ? { answers } : {}) });
      if (!resolved && !destroyed) render({ message: t('chat.question.submit.received') });
    } catch (error) {
      if (resolved || destroyed) return;
      if ([404, 409, 410].includes(error?.status)) {
        busy = false;
        render({ stage: 'stale', message: t('chat.question.submit.stale', { errore: error.message }) });
      } else if ([400, 422].includes(error?.status)) {
        busy = false;
        render({ message: t('chat.question.submit.failed', { errore: error.message }) });
      } else {
        render({ message: t('chat.question.submit.unverified') });
      }
    }
  }
  const primoControllo = (field) => field?.options[0] || field?.textarea;
  backButton.addEventListener('click', () => { render({ corrente: corrente - 1 }); primoControllo(fields[corrente])?.focus(); });
  nextButton.addEventListener('click', () => { render({ corrente: corrente + 1 }); primoControllo(fields[corrente])?.focus(); });
  reviewButton.addEventListener('click', () => { render({ stage: 'review' }); sendButton.focus(); });
  editButton.addEventListener('click', () => {
    const primaVuota = fields.findIndex((field) => readDraft()[field.id] === undefined);
    render({ stage: 'answer', corrente: primaVuota >= 0 ? primaVuota : 0 });
    primoControllo(fields[corrente])?.focus();
  });
  sendButton.addEventListener('click', () => { void submit('answered'); });
  skipButton.addEventListener('click', () => { render({ stage: 'skip-review' }); confirmSkipButton.focus(); });
  confirmSkipButton.addEventListener('click', () => { void submit('skipped'); });
  card.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && ['review', 'skip-review'].includes(stage) && !busy) {
      event.preventDefault();
      editButton.click();
      return;
    }
    /*
     * ⛔ 24/09/2026, decisione owner 11 + 31 — i tasti 1-9 scelgono l'opzione corrispondente della domanda a vista,
     *   SOLO con il fuoco nella scheda (l'ascoltatore sta sulla scheda: nel composer non arrivano) e mai mentre si
     *   scrive in un campo di testo («Altro», risposta libera): lì un numero è testo.
     */
    if (!/^[1-9]$/u.test(String(event.key)) || stage !== 'answer' || busy || resolved) return;
    const bersaglio = event.target;
    const tag = String(bersaglio?.tagName || '').toLowerCase();
    if (tag === 'textarea' || (tag === 'input' && bersaglio.type === 'text')) return;
    const field = fields[corrente];
    const input = field?.options[Number(event.key) - 1];
    if (!input || input.disabled) return;
    event.preventDefault?.();
    if (field.multi) input.checked = !input.checked;
    else {
      for (const option of field.options) option.checked = option === input;
    }
    dopoLaScelta(field, input, true);
  });
  root.append(card);
  root.hidden = false;
  render();
  if (Number.isFinite(scadenzaMs) && scadenzaMs > 0) {
    const aggiornaConto = () => {
      if (resolved || destroyed) { fermaConto?.(); fermaConto = null; return; }
      const restano = Math.max(0, inizioConto + scadenzaMs - adesso());
      const secondi = Math.ceil(restano / 1000);
      conto.hidden = false;
      conto.textContent = t('chat.question.expiresIn', { minuti: Math.floor(secondi / 60), secondi: String(secondi % 60).padStart(2, '0') });
      conto.dataset.ultimi = secondi <= 20 ? 'true' : 'false';
      if (restano <= 0 && !busy) {
        fermaConto?.();
        fermaConto = null;
        void submit('expired');
      }
    };
    aggiornaConto();
    if (!resolved) fermaConto = ogniSecondo(aggiornaConto);
  }
  if (annuncia) {
    annunciaDomanda(doc, question.questions,
      typeof pianifica === 'function' ? pianifica : (fn) => doc.defaultView?.setTimeout(fn, 150));
  }
  return Object.freeze({
    render,
    readDraft,
    /*
     * ⛔ 24/09/2026, decisione owner 29 — la domanda è sopravvissuta a un riavvio del server: nessun giro è in corso.
     *   Si dice alla persona che cosa succede con ciascuna delle due strade.
     */
    segnalaRipresa: () => {
      avvisoRipresa = t('chat.question.resumedAfterRestart');
      render();
    },
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      fermaConto?.();
      fermaConto = null;
      card.remove();
      root.hidden = !root.childElementCount;
    },
  });
}
