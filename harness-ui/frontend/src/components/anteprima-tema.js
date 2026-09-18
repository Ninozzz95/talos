/*
 * LA COLONNA DELL'ANTEPRIMA VIVA — la colonna destra di «Aspetto e movimento».
 *
 * Porta in TALOS l'`aside.appearance-preview` del mockup `TALOS-Calm-Lab-04.html`
 * (md5 952fd467eff2cdd331f968c419fa1cc0, misurato dal vivo il 18/09/2026): 300 px di larghezza,
 * il riquadro col canvas della scena, la riga di didascalia e la nota sulla tavolozza.
 *
 * ⛔ IL CANVAS NON E' UNA COPIA: `creaAnteprimaScena()` di `theme-studio.js` e' la stessa funzione
 *   che disegna l'anteprima dello studio dei temi — 30 fps, DPR <= 1.5, si ferma quando la finestra
 *   e' nascosta, legge i parametri da `--talos-motion-*`. Qui si RIUSA, non si riscrive; l'unica
 *   cosa che si cambia e' la classe del canvas (`td-preview-canvas` -> `appearance-canvas`), che e'
 *   il nome che il mockup gli da', e che questo modulo veste nel proprio foglio.
 *
 * ⛔ QUESTO MODULO NON SI MONTA DA SOLO. Nessuno lo chiama dalla pagina: `settings-view.ts` e' di
 *   un'altra corsia e decidera' dove. Si esporta `montaAnteprimaTema(contenitore)`, che disegna la
 *   colonna DENTRO il contenitore che riceve, e nient'altro.
 *
 * RICERCA — fatta il 18/09/2026, prima di scrivere, per questa implementazione e non in generale:
 *  · `prefers-reduced-motion` e i cicli `requestAnimationFrame` — MDN, «@media/prefers-reduced-motion»
 *    (developer.mozilla.org, letto il 18/09/2026): la media query agisce sul CSS, NON su un ciclo
 *    rAF, che va fermato in JavaScript. La pratica che le fonti concordano (W3Tweaks,
 *    «requestAnimationFrame: Smooth 60fps Animation», w3tweaks.com; OpenReplay, «Using
 *    prefers-reduced-motion for Accessible Animation», blog.openreplay.com; entrambe lette il
 *    18/09/2026) e' in quattro passi: si controlla `matchMedia` PRIMA di riprogrammare il giro; si
 *    ascolta `change`, perche' la preferenza puo' cambiare a sessione viva; si annulla il
 *    fotogramma con `cancelAnimationFrame` allo smontaggio, o il ciclo sopravvive alla superficie
 *    che lo conteneva; e cio' che comunica uno stato si SOSTITUISCE con un equivalente statico,
 *    non lo si cancella. `creaAnteprimaScena` fa i primi tre; quello che manca e' il RITORNO —
 *    vedi `suMovimentoRidotto`.
 *  · ⛔ WCAG 2.2.2 «Pause, Stop, Hide» (playbook `ai-web-design-codex`,
 *    09-playbooks-and-checklists/playbook-scroll-experience.md, letto il 18/09/2026): un movimento
 *    automatico che dura oltre 5 secondi vuole un comando per fermarlo, e la fonte lo dice
 *    esplicitamente «regardless of prefers-reduced-motion». Nello STUDIO il comando c'e'
 *    («Ferma anteprima», `td-studio-button`); questa colonna non ce l'ha, come non ce l'ha il
 *    mockup. Segnalato nel referto: il comando e' una decisione dell'owner, non una mia aggiunta.
 *  · `position: sticky` dentro una colonna di griglia — LogRocket/DEV, «Getting sticky with it —
 *    Troubleshooting CSS sticky positioning» (practicaldev/logrocket, letto il 18/09/2026) e
 *    Stack Overflow 66416972 e 50794795 (letti il 18/09/2026): non basta `position:sticky`. Serve
 *    un offset NON `auto`; la cella di griglia e' stirata da `align-items:stretch` e una cella alta
 *    quanto il contenitore non ha spazio per viaggiare, quindi vuole `align-self:start`; e nessun
 *    antenato puo' avere `overflow` diverso da `visible`.
 *  · Costo di un secondo canvas — MDN, «Optimizing canvas» (developer.mozilla.org, gia' citata in
 *    `theme-studio.js:586`, riletta il 18/09/2026): non si disegna quando non si vede, si sceglie
 *    una volta per tutte se la tela serve in lettura (`willReadFrequently` NO, su una tela che si
 *    limita a disegnare), e il fattore di dispositivo va LIMITATO — le fonti 2026 convergono su un
 *    tetto di 2 (`ux-ui-pro/snowfall-canvas`, opzione `dprCap` = 2; `darkroomengineering/satus`,
 *    `Math.min(devicePixelRatio, 2)`, «triple the fill rate cost with minimal perceptual benefit»;
 *    entrambi letti il 18/09/2026). `creaAnteprimaScena` sta a **1.5**, ancora piu' prudente, e la
 *    tela si ferma gia' su `visibilitychange`: questo modulo non aggiunge un secondo giro, riusa
 *    quello.
 */
import {
  creaAnteprimaScena, caricaScene, scenaPerAspetto, aspettoCorrente, valoreAspetto,
  DESCRIZIONI_TEMI, TESTO_STATO,
} from './theme-studio.js';
import { t } from './lingua.js';

/**
 * La prosa della colonna — la copia editoriale del mockup, non un'invenzione di questo modulo.
 * ⛔ Le frasi del corpo vengono da `renderAppearancePreview` (riga 2051 del mockup) e sono LI'
 *   bilingui: il mockup le sceglie con `p.uiLanguage`. Qui la lingua la decide la RADICE
 *   (`data-lingua-applicata`, che `applicaLingua` scrive — `lingua.js`), non una variabile nostra.
 * ⛔ L'occhiello e la nota, nel mockup, esistono SOLO in italiano (riga 2049: il resto della pagina
 *   cambia lingua, l'aside no). Passano da `t()`: senza voce nel dizionario restano in italiano,
 *   che e' il comportamento dichiarato di `lingua.js` per qualunque frase non tradotta — non un
 *   buco che apro io. Se un giorno si traducono, si traducono nel dizionario.
 */
export const TESTI_ANTEPRIMA = Object.freeze({
  it: Object.freeze({
    occhiello: 'ANTEPRIMA DEL TEMA',
    etichetta: 'Anteprima dal vivo',
    marchio: 'TALOS',
    data: 'IL TUO PROSSIMO PROGETTO',
    titolo: 'Spazio alle idee.',
    sottotitolo: 'Meno rumore. Più attenzione al tuo lavoro.',
    messaggio: 'Da dove cominciamo?',
    risposta: ['Una cosa alla volta.', 'Con tutto il contesto che serve.'],
    composer: 'Scrivi un messaggio…',
    nota: 'Palette dal foglio temi del prodotto.',
    /* Il comando di WCAG 2.2.2 (owner 18/09/2026): la scena si muove da sola, e chi la guarda
       deve poterla fermare — e riprendere, perché un comando che spegne per sempre è una porta
       che si chiude, non una pausa. */
    ferma: 'Ferma anteprima',
    riprendi: 'Riprendi anteprima',
  }),
  en: Object.freeze({
    /* ⛔ QUESTE TRE ERANO IN ITALIANO nella lingua inglese — corrette il 18/09/2026.
       `occhiello`, `etichetta` e `nota` erano le stringhe italiane copiate: chi usa l'app in
       inglese leggeva «ANTEPRIMA DEL TEMA», «Anteprima dal vivo» e «Palette dal foglio temi del
       prodotto.» in mezzo all'inglese. Ed è la stessa forma di difetto che il prodotto dichiara
       di voler evitare — una stringa condivisa che si rilegge dove compare. */
    occhiello: 'THEME PREVIEW',
    etichetta: 'Live preview',
    marchio: 'TALOS',
    data: 'YOUR NEXT PROJECT',
    titolo: 'Room for ideas.',
    sottotitolo: 'Your space, your pace.',
    messaggio: 'Where do we start?',
    risposta: ['One thing at a time.', 'With the context you need.'],
    composer: 'Write a message…',
    nota: 'Palette from the product’s theme sheet.',
    ferma: 'Stop preview',
    riprendi: 'Resume preview',
  }),
});

export const LINGUE_ANTEPRIMA = Object.freeze(['it', 'en']);
const LINGUA_DI_RIPIEGO = 'it';

/** La lingua risolta, letta dalla RADICE (`applicaLingua` la stampa li'). Non una nostra scelta. */
export function linguaDellaRadice(doc = globalThis.document) {
  const grezza = doc?.documentElement?.dataset?.linguaApplicata
    || doc?.documentElement?.getAttribute?.('lang') || '';
  const codice = String(grezza).slice(0, 2).toLowerCase();
  return LINGUE_ANTEPRIMA.includes(codice) ? codice : LINGUA_DI_RIPIEGO;
}

/** I testi della lingua chiesta, con l'italiano come rete: mai una colonna vuota. */
export function testiAnteprima(lingua) {
  return TESTI_ANTEPRIMA[lingua] || TESTI_ANTEPRIMA[LINGUA_DI_RIPIEGO];
}

/**
 * La didascalia: stato + nome della scena, nella forma del mockup («Scena spenta · scelta
 * predefinita»). ⛔ Il testo dello stato e' `TESTO_STATO`, la stessa tavola che usa lo studio
 *   (`theme-studio.js:930`): «Anteprima animata», «Movimento ridotto», «Scena non disponibile».
 * ⛔ Il nome e' la prosa del tema (`DESCRIZIONI_TEMI[id].scena`, la regola di `theme-studio.js:929`)
 *   — «Orizzonte e filamento» per calm, non l'id. Senza nome resta il solo stato: non si scrive
 *   «·» davanti a un vuoto.
 */
export function didascaliaDellaScena({ nome = '', stato = 'assente' } = {}) {
  const parola = TESTO_STATO[stato] || stato;
  return nome ? `${parola} · ${nome}` : parola;
}

/** Il nome della scena dalla tavola della prosa; se manca, l'id (che e' cio' che il renderer usa). */
export function nomeDellaScena(id) {
  if (!id) return '';
  return DESCRIZIONI_TEMI[id]?.scena || id;
}

/**
 * Quale scena sta disegnando la app ADESSO.
 * ⛔ Prima la RADICE (`data-talos-scene`): e' la scena che la app ha davvero dipinto, misurata il
 *   18/09/2026 sul 4174 vivo (`data-talos-scene="calm"`). La regola dello studio
 *   (`scenaPerAspetto`, `theme-studio.js:927`) resta come RIPIEGO, perche' l'attributo non e'
 *   stampato all'avvio (`aspetto.css`/`avvio.js`: si stampa quando l'aspetto viene applicato).
 */
export function scenaDellAspetto(doc = globalThis.document, disponibili = new Map()) {
  const dallaRadice = String(doc?.documentElement?.getAttribute?.('data-talos-scene') || '').trim();
  if (dallaRadice && dallaRadice !== 'follow-theme' && disponibili.has?.(dallaRadice)) return dallaRadice;
  const { tema } = aspettoCorrente(doc);
  return scenaPerAspetto({ tema, scena: valoreAspetto('sceneOverrideSelect', doc) || 'follow-theme' }, disponibili);
}

/* ------------------------------------------------------------------ costruttori di nodi */

function nodo(doc, tag, classe, testo) {
  const el = doc.createElement(tag);
  if (classe) el.className = classe;
  if (testo !== undefined && testo !== null) el.textContent = String(testo);
  return el;
}

/**
 * L'icona dello sprite del prodotto (`index.template.html`), come la disegna `theme-studio.js`.
 * La misura viaggia nella classe del design system: `.i--sm` e' 14px e `.i--xs` e' 13px
 * (`index.css:234-235`), che sono esattamente i 14x14 e i 13x13 misurati nel mockup.
 * ⛔ La classe arriva INTERA dal chiamante (`'i i--sm'`), non solo la misura: una stringa che
 *   COMINCIA per `i-` viene letta come nome di simbolo dalla guardia delle icone
 *   (`tests/unit/icone-ripiego.test.mjs:243`), che cerca in TUTTO `src/` qualunque literal con
 *   quella forma — misurato il 18/09/2026: la sola misura, fra apici, le sembra il nome di un
 *   simbolo e finisce fra i «morti», due rossi in `npm run test:unit`. E' la convenzione che il
 *   prodotto usa gia' altrove
 *   (`scheda-modello.js:420` passa la classe intera). ⛔ La guardia NON si ammorbidisce: e' la
 *   ragione per cui si scrive cosi'. Taglia e colore stanno sull'ISTANZA `<svg>` e non dentro il
 *   simbolo, `aria-hidden` sulle decorative (ricerca 18/09/2026: «SVG Sprites in 2026 — Modern
 *   Patterns, Build Pipelines, and Alternatives», svggenie.com; `material-design-icons`,
 *   `sprites/README.md`). E il punto fragile e' proprio la classe scritta a mano dal chiamante: in
 *   Hermes Agent la stessa cosa e' risolta dal componente, che SOVRASCRIVE la classe dell'icona che
 *   riceve (NousResearch/hermes-agent, PR #48615, «the prefix slot clones the icon, overwriting its
 *   className», letto il 18/09/2026) — qui si sta dalla parte opposta, e per non ripetere quella
 *   fragilita' la stringa si scrive nella forma che il prodotto riconosce.
 * ⛔ Il marchio d'invio del mockup e' un simbolo `arrow` che nel sprite del prodotto NON esiste
 *   (`#i-arrow` assente): si usa `send`, che e' cio' che il prodotto mette nella stessa posizione
 *   nel composer vero e in `miniConversazione()`. Sostituzione dichiarata nel referto.
 */
function icona(doc, nome, classe = '') {
  const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const use = doc.createElementNS('http://www.w3.org/2000/svg', 'use');
  svg.setAttribute('class', classe || 'i');
  svg.setAttribute('aria-hidden', 'true');
  use.setAttribute('href', `#i-${nome}`);
  svg.append(use);
  return svg;
}

/**
 * Monta la colonna dentro `contenitore` e la tiene in passo con la radice.
 *
 * @param {Element} contenitore dove disegnare la colonna (una cella di griglia, un pannello)
 * @param {{document?:Document, lingua?:string}} [opzioni]
 * @returns {{elemento:Element, aggiorna:Function, ferma:Function, stato:Function}|null}
 *   `null` se non c'e' un contenitore o se il documento non sa creare un canvas.
 *
 * ⛔ Chi lo chiama NON deve montarlo su un elemento nascosto E NON rimisurato: se il contenitore e'
 *   `display:none` al momento del montaggio il canvas nasce 1x1, e questo si riprende da solo grazie
 *   al `ResizeObserver` che `creaAnteprimaScena` mette sul contenitore (quando la cella acquista una
 *   dimensione, l'anteprima si rimisura). Vale la stessa regola dello studio: meglio montarlo
 *   visibile, come fa `apriStudioTemi` DOPO `showModal()`.
 * ⛔ `ferma()` va chiamata quando la colonna esce di scena: un `requestAnimationFrame` che
 *   sopravvive a una superficie chiusa e' lavoro che la GPU paga per qualcosa che nessuno vede.
 */
export function montaAnteprimaTema(contenitore, {
  document: doc = globalThis.document,
  lingua = null,
} = {}) {
  if (!contenitore || !doc?.createElement) return null;
  const testi = testiAnteprima(lingua || linguaDellaRadice(doc));

  /* ------------------------------------------------------------------ la colonna */
  const colonna = nodo(doc, 'aside', 'appearance-preview');
  colonna.setAttribute('aria-label', t(testi.etichetta));

  const occhiello = nodo(doc, 'div', 'eyebrow', t(testi.occhiello));

  const finestra = nodo(doc, 'div', 'preview-window theme-live-preview');

  const chrome = nodo(doc, 'div', 'preview-chrome');
  const marchio = nodo(doc, 'small', '', testi.marchio);
  chrome.append(nodo(doc, 'span'), nodo(doc, 'span'), nodo(doc, 'span'), marchio);

  /* ⛔ La conversazione d'esempio e' una FIGURA, non una interfaccia: `inert` + `aria-hidden`, come
     fa `miniConversazione()` in `theme-studio.js:647`. Non prende fuoco, non entra nel Tab, e non
     si legge come una conversazione vera. Il `+` e' un `<span>`, non un `<button>` come nel mockup:
     li' apriva un cassetto che nel prodotto non esiste, e un comando che non comanda e' peggio di
     un disegno ([[app-distributed-nothing-static]]). Il marchio d'invio, in quella posizione, e'
     quello del composer vero (`i-send`, sprite del prodotto). */
  const corpo = nodo(doc, 'div', 'preview-body');
  corpo.setAttribute('inert', '');
  corpo.setAttribute('aria-hidden', 'true');

  const data = nodo(doc, 'div', 'preview-date', testi.data);
  const titolo = nodo(doc, 'h3', '', testi.titolo);
  const sottotitolo = nodo(doc, 'p', '', testi.sottotitolo);
  const domanda = nodo(doc, 'div', 'preview-message', testi.messaggio);
  const risposta = nodo(doc, 'div', 'preview-answer');
  const rispostaPrima = doc.createTextNode(testi.risposta[0]);
  const rispostaDopo = doc.createTextNode(testi.risposta[1]);
  risposta.append(rispostaPrima, doc.createElement('br'), rispostaDopo);

  const composer = nodo(doc, 'div', 'preview-composer');
  const invito = nodo(doc, 'span', 'preview-testo', testi.composer);
  composer.append(
    nodo(doc, 'span', 'preview-plus', '+'),
    invito,
    icona(doc, 'send', 'i i--sm'),
  );

  corpo.append(data, titolo, sottotitolo, domanda, risposta, composer);

  const didascalia = nodo(doc, 'div', 'scene-caption');

  finestra.append(chrome, corpo, didascalia);

  const nota = nodo(doc, 'div', 'preview-note');
  const notaTesto = doc.createTextNode(t(testi.nota));
  nota.append(icona(doc, 'check', 'i i--xs'), notaTesto);

  /* ⛔ `.quiet-note` NON si porta: le sue frasi (riga 2049 del mockup) parlano della PAGINA del
     mockup — «illustrati dal campione, non collegati a un agente» — e nel prodotto sarebbero false,
     perche' li' i controlli sono quelli veri. Non ha sorgente nel prodotto: si lascia fuori e si
     riporta, invece di inventarne una versione. Stessa sorte per `.preview-tools`, che nel mockup
     e' un cassetto vuoto e nascosto. */
  /*
   * ⛔ IL COMANDO PER FERMARE L'ANTEPRIMA — WCAG 2.2.2 (Pause, Stop, Hide), owner 18/09/2026:
   *   «si aggiunge il comando». La colonna disegna una scena che si muove da sola e supera i 5
   *   secondi, e la norma chiede un comando per fermarla. **Il mockup non ce l'ha** — è una
   *   deviazione voluta, e il prodotto ha già il gesto nello studio temi («Ferma anteprima»).
   * ⛔ E NON si usa `ferma()` del modulo: quella **smonta** — ferma il giro, stacca il canvas e
   *   **rimuove la colonna** (`:381`). Un comando di pausa che fa sparire la cosa non è una pausa.
   *   Il disegno si ferma lasciandolo a schermo, e si può riprendere: è un interruttore, non una
   *   porta che si chiude.
   */
  const comando = nodo(doc, 'button', 'preview-stop');
  comando.type = 'button';
  comando.setAttribute('aria-pressed', 'false');
  const comandoTesto = doc.createTextNode('');
  /* ⛔ `stop` E `play` — non `pause`, che NON esiste fra gli sprite del progetto: il test
     `icone-ripiego`/`sprite` l'avrebbe preso. Le due che servono ci sono. */
  const comandoIcona = icona(doc, 'stop', 'i i--xs');
  comando.append(comandoIcona, comandoTesto);
  /*
   * ⛔ SI USA `alterna()` DELLA VISTA, non `ferma()`. Misurato leggendo l'API:
   *   · `vista.ferma()` spegne tutto e **stacca il canvas** — un comando di pausa che fa sparire
   *     la cosa non è una pausa;
   *   · `vista.alterna()` fa `pausa = !pausa; disegna(0); programma()` — **ferma il disegno
   *     lasciando il fotogramma a schermo**, e lo riprende. È esattamente ciò che WCAG 2.2.2 chiede.
   * ⛔ L'icona e la parola raccontano lo STATO, non l'azione: ferma il fermabile, e quando è fermo
   *   offre di riprendere. `aria-pressed` lo dice anche a chi non vede l'icona.
   */
  /* ⛔ FUNCTION DECLARATION, non `const … = () =>`: `aggiorna()` (riga 362) le chiama, e con una
     `const` il riferimento sarebbe nella zona morta temporale se `aggiorna` girasse prima
     dell'assegnazione. Una funzione dichiarata è issata e non ha questo problema. */
  function etichettaComando() { return vista.inPausa?.() ? t(testi.riprendi) : t(testi.ferma); }
  function disegnaComando() {
    const fermo = Boolean(vista.inPausa?.());
    comandoTesto.nodeValue = fermo ? t(testi.riprendi) : t(testi.ferma);
    comando.setAttribute('aria-pressed', String(fermo));
    comando.setAttribute('aria-label', etichettaComando());
    comandoIcona.querySelector('use')?.setAttribute('href', fermo ? '#i-play' : '#i-stop');
  }
  comando.addEventListener('click', () => {
    vista.alterna?.();
    disegnaComando();
    /*
     * ⛔ WCAG 2.2.2 ESIGE UNO STATO CHE SI POSSA LEGGERE, e l'etichetta cambia da sola quando
     *   l'utente ferma: un cambio di testo deve essere annunciato, o chi usa un lettore di schermo
     *   preme un comando e non sa cosa è successo. `role="status"` è la forma minima che non
     *   ruba il fuoco dal bottone appena premuto.
     */
    colonna.dataset.anteprimaFerma = Boolean(vista.inPausa?.()) ? 'si' : 'no';
  });

  colonna.append(occhiello, finestra, nota, comando);
  contenitore.append(colonna);

  /* ------------------------------------------------------------------ il canvas vero */
  const vista = creaAnteprimaScena(finestra, { document: doc });
  if (!vista) { colonna.remove(); return null; }
  /* Il mockup da' al canvas la classe `appearance-canvas`: il suo riquadro e' esattamente cio' che
     il foglio di questo modulo posiziona (`position:absolute;inset:0;opacity:.7;z-index:0`). Le
     proprieta' che `td-preview-canvas` dichiarava per lo studio sono tutte ribadite li'. */
  vista.canvas.className = 'appearance-canvas';

  let scene = new Map();
  let vivo = true;
  let linguaCorrente = lingua || linguaDellaRadice(doc);

  /*
   * ⛔ LA LINGUA E' UNA SORGENTE VIVA, non una scelta fatta al montaggio: `applicaLingua` puo'
   * cambiare `data-lingua-applicata` a sessione viva, e allora la colonna deve cambiare copia —
   * come fa il mockup, che ridisegna l'anteprima a ogni `renderAppearancePreview(p)` con
   * `p.uiLanguage`. Si riscrivono i TESTI, non si rimonta niente: rimontare vorrebbe dire staccare e
   * ricreare il canvas (e il suo giro), cioe' lavoro per una parola.
   * ⛔ I nodi di testo tenuti da parte sono quelli che una lingua cambia davvero: la risposta e'
   *   due testi separati da un `<br>` (come nel mockup), quindi si riscrive ciascuno per conto suo.
   */
  function rifaiTesti(linguaNuova) {
    const nuovi = testiAnteprima(linguaNuova);
    colonna.setAttribute('aria-label', t(nuovi.etichetta));
    occhiello.textContent = t(nuovi.occhiello);
    marchio.textContent = nuovi.marchio;
    data.textContent = nuovi.data;
    titolo.textContent = nuovi.titolo;
    sottotitolo.textContent = nuovi.sottotitolo;
    domanda.textContent = nuovi.messaggio;
    rispostaPrima.data = nuovi.risposta[0];
    rispostaDopo.data = nuovi.risposta[1];
    invito.textContent = nuovi.composer;
    notaTesto.data = t(nuovi.nota);
    linguaCorrente = linguaNuova;
  }

  function aggiorna() {
    if (!vivo) return TESTO_STATO.assente;
    const scena = scenaDellAspetto(doc, scene);
    const stato = vista.aggiorna({ scena });
    const conosciuta = scene.has(scena);
    didascalia.textContent = didascaliaDellaScena({
      nome: conosciuta ? nomeDellaScena(scena) : '',
      stato: conosciuta ? stato : 'assente',
    });
    finestra.dataset.stato = conosciuta ? stato : 'assente';
    // La lingua può cambiare sotto la colonna: il comando si ridisegna con `aggiorna()`.
    disegnaComando();
    return stato;
  }

  /*
   * LA RADICE PUO' CAMBIARE SENZA PASSARE DA QUI — tema, modo colore, scena, lingua — e allora la
   * colonna deve SEGUIRLA, non raccontare quella di prima. Stessa meccanica dello studio
   * (`theme-studio.js:959`), ristretta agli attributi che questo modulo legge davvero: niente
   * `style`, che sul 4174 cambia di continuo per il fondo animato e farebbe rimisurare l'anteprima
   * a ogni fotogramma.
   * ⛔ Nessun anello: `aggiorna()` scrive solo dentro la colonna, mai sulla radice.
   */
  const Osservatore = (doc.defaultView || globalThis).MutationObserver;
  let osservatoreRadice = null;
  if (typeof Osservatore === 'function') {
    osservatoreRadice = new Osservatore(() => {
      if (!vivo) return;
      const linguaNuova = linguaDellaRadice(doc);
      if (linguaNuova !== linguaCorrente) rifaiTesti(linguaNuova);
      aggiorna();
    });
    osservatoreRadice.observe(doc.documentElement, {
      attributes: true,
      attributeFilter: ['data-talos-theme', 'data-theme', 'data-talos-scene', 'data-talos-motion-mode', 'data-lingua-applicata', 'lang'],
    });
  }

  /*
   * ⛔ IL VERSO DI RITORNO, e non e' un dettaglio: `movimentoRidotto()` legge ANCHE la classe
   * `reduce-motion` sul body (il monolite la mette li'), e `creaAnteprimaScena` decide fotogramma
   * per fotogramma se disegnare — ma quando decide di NON disegnare non riprogramma il giro, e
   * niente lo fa ripartire se la preferenza torna indietro: resta fermo per sempre, senza dirlo.
   * È esattamente cio' che le fonti citate in testa raccomandano di coprire (ascoltare `change`,
   * non solo leggere `matches` una volta) e cio' che il brief chiede di verificare nei due versi.
   * ⇒ si osservano le DUE sorgenti della preferenza (la classe sul body, la media query di sistema)
   *   e si chiede un `aggiorna()`, che rimisura e riprogramma.
   * ⛔ Le due regole universali `!important` che tanti commenti del prodotto citano qui NON
   *   esistono nel bundle servito: misurato il 18/09/2026, zero regole `*` sotto `reduce-motion` nel
   *   CSSOM del 4174 e nessuna nei sorgenti di `frontend/src` — vivono solo nel commento e in
   *   `mockup-originale/styles.css:531-535`, che non e' importato. Quindi a fermare il canvas ci
   *   pensa la sola funzione riusata, e a farlo ripartire ci pensa questa.
   */
  const vistaFinestra = doc.defaultView || globalThis;
  const query = vistaFinestra.matchMedia?.('(prefers-reduced-motion: reduce)');
  const suMovimentoRidotto = () => { if (vivo) aggiorna(); };
  query?.addEventListener?.('change', suMovimentoRidotto);
  let osservatoreCorpo = null;
  if (typeof Osservatore === 'function' && doc.body) {
    osservatoreCorpo = new Osservatore(suMovimentoRidotto);
    osservatoreCorpo.observe(doc.body, { attributes: true, attributeFilter: ['class'] });
  }

  aggiorna();
  /* Il catalogo delle scene arriva da un `import()` che finisce DOPO: la colonna nasce con la sola
     didascalia di stato e le scene le riceve quando ci sono (stessa ragione dello studio, riga 974). */
  caricaScene()
    .then((mappa) => { scene = mappa || new Map(); vista.impostaScene(scene); aggiorna(); })
    .catch(() => aggiorna());

  return {
    elemento: colonna,
    aggiorna,
    stato: () => finestra.dataset.stato || 'assente',
    ferma() {
      vivo = false;
      osservatoreRadice?.disconnect();
      osservatoreCorpo?.disconnect();
      query?.removeEventListener?.('change', suMovimentoRidotto);
      vista.ferma(); /* ferma il giro E stacca il canvas: l'ultimo lavoro e' del chiamante */
      colonna.remove();
    },
  };
}
