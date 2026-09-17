/*
 * schede.js — UN SOLO componente di linguette, per tutte le superfici che ne hanno.
 *
 * ⛔ Perché nasce (BC-63, owner 17/09/2026: «la scheda revisione deve avere lo stesso component
 *    tab di terminale (schede stile chrome)»): il progetto aveva TRE implementazioni diverse di
 *    schede, misurate il 17/09 sul commit `e2853725`.
 *      1. Terminale  — `terminale.js:202`, `.talos-terminal__tab[role=tab]`: pallino, «×»
 *         disegnata dal CSS in coda, «+ Nuovo», menu contestuale, rinomina.
 *         ⛔ Misurato il 17/09 e NON dedotto: Ctrl+Tab non esiste in nessuna delle tre —
 *         `grep -rn "Ctrl+Tab\|ctrlKey && .*Tab" src/` non trova un gestore. Il commento del
 *         06/09 in cima a `terminale.js` lo nominava, ma `cicla()` serve alle FRECCE.
 *      2. Browser    — `browser.js:717`, `.talos-tabstrip__scheda[role=tab]`: icona per stato,
 *         ✕ vera, pillola HTTP, scroll-snap. Resta com'è (vedi in fondo a questo commento).
 *      3. Revisione  — `review.js:73`, `.talos-tabs__tab` + `.talos-review__scheda`: il gruppo a
 *         pillole GENERICO, senza menu contestuale, senza tetto alla larghezza della linguetta
 *         e con la tastiera cablata a parte dentro `app.js`.
 *
 * ⇒ Qui sta la MECCANICA che era una sola cosa scritta tre volte: il giro di disegno con il
 *   roving tabindex, la tastiera, il menu contestuale, e lo scorrimento orizzontale. Ciò che
 *   resta ai chiamanti è solo ciò che è davvero loro: cosa c'è DENTRO una linguetta e quali
 *   azioni hanno un comportamento vero dietro.
 *
 * Ricerca fatta PRIMA di scrivere:
 *  · WAI-ARIA APG «Tabs Pattern» (w3.org/WAI/ARIA/apg/patterns/tabs, letto il 17/09/2026):
 *    roving tabindex — una sola linguetta raggiungibile con Tab, le altre a `tabindex="-1"`;
 *    Freccia destra/sinistra si spostano e CICLANO («If focus is on the last tab element, moves
 *    focus to the first tab»); Home/End sono opzionali e vanno alla prima/ultima; Canc, quando
 *    la scheda si può chiudere, la chiude e passa il fuoco alla vicina. L'attivazione
 *    AUTOMATICA è quella consigliata «as long as their associated tab panels are displayed
 *    without noticeable latency» — qui il pannello è già nel DOM, quindi si attiva sul fuoco.
 *  · Eleken «Tabs UX Best Practices» e Chrome «scrollable-tabstrip» (letti il 17/09/2026):
 *    quando le schede non ci stanno la striscia SCORRE e non va a capo — una seconda riga rompe
 *    il modello «una riga sola» e rende ambigua quale riga sia attiva — e non si stringe tutto
 *    fino a lasciare due lettere.
 *  · MDN `EventTarget.addEventListener` (letto il 17/09/2026): `passive` vale `true` di default
 *    per `wheel` SOLO sui nodi di livello documento (`Window`, `Document`, `Document.body`); su
 *    un elemento normale resta `false`. Lo dichiariamo lo stesso, perché Safari fa eccezione e
 *    perché una `preventDefault()` dentro un listener passivo non fa niente e non protesta.
 *
 * ⛔ Il Browser NON è stato portato qui: le sue linguette hanno una forma propria (bordo
 *    superiore arrotondato, icona che cambia FORMA con lo stato per la WCAG 1.4.1, ✕ come
 *    elemento vero, pillola HTTP, `scroll-snap`), e riscriverle avrebbe toccato 13 prove che
 *    oggi sono verdi per guadagnare una somiglianza che l'owner non ha chiesto. Sta scritto nel
 *    resoconto, non lasciato in silenzio.
 */

import { t } from './lingua.js';

/*
 * ⛔ 07/9, visto in una foto del Terminale: nel piede il percorso della cartella era tagliato in
 *   CODA — «C:\Users\<utente>\AppData\Local\Temp\claude\C--Users-<u…» — cioè spariva proprio la
 *   parte che serve, il nome della cartella dove i comandi girano davvero.
 *
 * ⛔ La via ovvia — `direction:rtl` per troncare in testa — è SBAGLIATA qui: con la punteggiatura
 *   sposta i segni all'inizio della riga (ricerca 07/09/2026: David Walsh «CSS Ellipsis Beginning
 *   of String», WebKit #164999), e un percorso Windows è tutto `\` e `:`. Si taglia nel MEZZO,
 *   come fa un editor: restano la radice e la coda, che sono le due parti che dicono qualcosa.
 *
 * ⭐ 17/09 — spostata qui da `terminale.js` senza cambiarne una riga: la Revisione ha lo stesso
 *   problema del Terminale (i percorsi di questo repo arrivano a 60 caratteri) e la cura era già
 *   scritta e provata. Cercare nel PROPRIO codice prima di scriverne dell'altro.
 */
export function accorciaPercorso(percorso, massimo = 46) {
  const testo = String(percorso ?? '');
  if (testo.length <= massimo) return testo;
  /* ⛔ Il taglio cade su un CONFINE di cartella, non in mezzo a una parola: «…hpad\banco-umano»
     (visto in una foto) non è un percorso, è un rebus. Si tengono le ultime cartelle intere che
     entrano nello spazio, e la radice davanti. */
  const pezzi = testo.split(/(?<=[\\/])/);              // i separatori restano attaccati al pezzo
  const radice = pezzi[0] + (pezzi[1] ?? '');           // «C:\» + «Users\» — dice disco e persona
  let coda = '';
  for (let i = pezzi.length - 1; i > 1; i -= 1) {
    const prova = pezzi[i] + coda;
    if (radice.length + 1 + prova.length > massimo) break;
    coda = prova;
  }
  if (!coda) { // nemmeno una cartella intera ci sta: si torna al taglio secco, meglio che niente
    const quanti = Math.max(6, massimo - radice.length - 1);
    coda = testo.slice(-quanti);
  }
  return `${radice}…${coda}`;
}

/** Chi prende il fuoco quando si chiude la scheda in posizione `indice` (stessa regola nota). */
export function prossimaAttivaDopoChiusura(lista, indice) {
  const resto = lista.filter((_, i) => i !== indice);
  return (resto[indice] ?? resto[indice - 1]) ?? null;
}

/** La scheda dopo/prima di quella attiva, ciclica (APG: dall'ultima si torna alla prima). */
export function cicla(lista, attiva, direzione) {
  if (lista.length < 2) return attiva ?? lista[0] ?? null;
  const corrente = Math.max(0, lista.indexOf(attiva));
  return lista[(corrente + direzione + lista.length) % lista.length];
}

export function nomeSchedaValido(nome) {
  const pulito = String(nome ?? '').trim();
  return pulito.length > 0 && pulito.length <= 40;
}

/*
 * ⛔ 16/09/2026 — i due aiuti del menu contestuale sono ESPORTATI, e non è generalizzazione
 *   preventiva: il corpo del terminale (`terminale-xterm.js`, P0/A punto 3) ha bisogno dello stesso
 *   menu con altre voci, e la regola di casa dice di guardare cosa il progetto ha già prima di
 *   disegnare una superficie nuova. Un secondo menu scritto a parte avrebbe avuto un'altra
 *   grammatica visiva a una settimana di distanza.
 *   ⭐ 17/09 — dal Terminale a qui, invariati: ora li usa anche la Revisione.
 */

/** Il nodo del menu, creato una volta sola per id. */
export function creaMenuContestuale(root, { id = 'menuSchedaTerminale', etichetta = 'Azioni sulla scheda' } = {}) {
  let menu = root.querySelector(`#${id}`);
  if (menu) return menu;
  const documento = root.ownerDocument || globalThis.document;
  menu = documento.createElement('div');
  menu.id = id;
  menu.className = 'talos-card talos-context-menu';
  menu.setAttribute('role', 'menu');
  menu.setAttribute('aria-label', t(etichetta));
  menu.hidden = true;
  root.append(menu);
  return menu;
}

/**
 * Riempie il menu e lo mette dove sta il puntatore, senza uscire dalla finestra.
 * @param {HTMLElement} menu il nodo di `creaMenuContestuale`
 * @param {{titolo?:string, voci:Array<[string, Function, boolean?]>, x:number, y:number, chiudi:Function, finestra?:object}} opzioni
 */
export function apriMenuContestuale(menu, { titolo = '', voci = [], x = 0, y = 0, chiudi = () => {}, finestra = globalThis }) {
  const documento = menu.ownerDocument || globalThis.document;
  menu.replaceChildren();
  if (titolo) {
    const intestazione = documento.createElement('div');
    intestazione.className = 'talos-context-menu__title';
    intestazione.textContent = titolo;
    menu.append(intestazione);
  }
  for (const [testo, fai, abilitato = true] of voci) {
    const b = documento.createElement('button');
    b.type = 'button'; b.className = 'talos-button talos-button--ghost'; b.setAttribute('role', 'menuitem');
    b.textContent = testo; b.disabled = !abilitato;
    b.addEventListener('click', () => { chiudi(); fai(); });
    menu.append(b);
  }
  menu.hidden = false;
  const larghezza = menu.offsetWidth || 240; const altezza = menu.offsetHeight || 160;
  menu.style.left = `${Math.max(8, Math.min(x, (finestra.innerWidth ?? 0) - larghezza - 8))}px`;
  menu.style.top = `${Math.max(8, Math.min(y, (finestra.innerHeight ?? 0) - altezza - 8))}px`;
  menu.querySelector('[role=menuitem]:not([disabled])')?.focus();
  return menu;
}

/** `data-schedaId` → `data-scheda-id`: il nome dell'attributo che corrisponde a una chiave del dataset. */
export function attributoDi(chiave) {
  return `data-${String(chiave).replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;
}

/**
 * Il componente. Disegna una striscia di linguette e le fa funzionare; NON sa che cosa ci sia
 * dentro una linguetta né cosa succeda quando se ne sceglie una: quello lo dice chi lo monta.
 *
 * @param {HTMLElement} striscia il contenitore visibile (`.talos-schede`)
 * @param {object} opzioni
 * @param {HTMLElement} [opzioni.lista] il `[role=tablist]` che scorre; se manca è la striscia stessa
 * @param {HTMLElement} [opzioni.root] dove vive il menu contestuale
 * @param {string} [opzioni.chiave] la chiave del dataset che porta l'id della scheda
 * @param {string} [opzioni.classe] le classi della linguetta
 * @param {string} [opzioni.idMenu] l'id del nodo del menu contestuale
 * @param {(voce:object)=>string} opzioni.identifica l'id di una voce
 * @param {(voce:object, tutte:object[])=>string} [opzioni.etichetta] il testo della linguetta
 * @param {(voce:object, indice:number, tutte:object[])=>string} [opzioni.suggerimento] il `title`
 * @param {(bottone:HTMLElement, voce:object, indice:number)=>void} [opzioni.contenuto] chi riempie la linguetta
 * @param {(voce:object)=>Array} [opzioni.vociMenu] le voci del menu contestuale, o `null` per non averlo
 * @param {(voce:object, evento:MouseEvent, bottone:HTMLElement)=>boolean} [opzioni.suClick] gestione propria del clic
 * @param {()=>Node[]} [opzioni.coda] i nodi dopo le linguette (il «+», i badge)
 * @param {boolean} [opzioni.scorre] la striscia scorre in orizzontale (rotella compresa)
 * @param {boolean} [opzioni.chiudibile] Canc chiude, clic centrale chiude
 * @param {boolean} [opzioni.rinominabile] F2 e doppio clic rinominano
 * @param {{seleziona?:Function, chiudi?:Function, rinomina?:Function, menuAperto?:Function}} [opzioni.azioni]
 */
export function creaSchede(striscia, {
  lista = null,
  root = globalThis.document?.body,
  chiave = 'schedaId',
  classe = 'talos-schede__tab',
  idMenu = 'menuScheda',
  etichettaMenu = 'Azioni sulla scheda',
  identifica = (voce) => String(voce?.id ?? ''),
  etichetta = (voce) => String(voce?.id ?? ''),
  suggerimento = () => '',
  contenuto = null,
  vociMenu = null,
  suClick = null,
  suDoppioClick = null,
  inerte = null,
  coda = null,
  scorre = false,
  chiudibile = false,
  rinominabile = false,
  azioni = {},
} = {}) {
  const documento = striscia.ownerDocument || globalThis.document;
  const contenitore = lista
    || (striscia.matches?.('[role=tablist]') ? striscia : striscia.querySelector('[role=tablist]'))
    || striscia;
  const attributo = attributoDi(chiave);
  const menu = vociMenu ? creaMenuContestuale(root, { id: idMenu, etichetta: etichettaMenu }) : null;

  let voci = [];
  let attiva = null;

  const chiudiMenu = () => { if (menu) { menu.hidden = true; menu.replaceChildren(); } };
  if (menu) {
    root.addEventListener('pointerdown', (e) => { if (!menu.hidden && !menu.contains(e.target)) chiudiMenu(); });
    root.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !menu.hidden) { chiudiMenu(); e.stopPropagation(); } });
  }

  function apriMenu(voce, x, y) {
    if (!menu) return;
    apriMenuContestuale(menu, {
      titolo: etichetta(voce, voci),
      voci: vociMenu(voce, voci) || [],
      x,
      y,
      chiudi: chiudiMenu,
      finestra: globalThis,
    });
    azioni.menuAperto?.(voce);
  }

  /*
   * ⛔ La rotella: senza, con dodici file le ultime linguette sono irraggiungibili col mouse —
   *   un trackpad manda quasi solo `deltaY`, e una striscia che scorre in orizzontale non lo
   *   riceve. Si lascia passare quando non c'è niente da scorrere (altrimenti si ruba lo
   *   scorrimento della pagina) e quando c'è il Ctrl premuto (è lo zoom del browser).
   *   `passive:false` esplicito: su un elemento normale è già il default (MDN, 17/09/2026), ma
   *   Safari fa eccezione e una `preventDefault()` dentro un listener passivo TACE.
   */
  if (scorre) {
    contenitore.addEventListener('wheel', (e) => {
      if (e.ctrlKey || e.deltaY === 0) return;
      if (contenitore.scrollWidth <= contenitore.clientWidth) return;
      e.preventDefault();
      contenitore.scrollLeft += e.deltaY;
    }, { passive: false });
  }

  /*
   * ⛔ 17/09, trovato GUARDANDO UNA FOTO (`artifacts/bc63/revisione-12-file-*.png`, primo giro):
   *   con dodici file la linguetta ATTIVA restava fuori vista e a schermo se ne vedevano tre che
   *   non c'entravano col diff mostrato sotto. Causa misurata: la app riceve le scritture mentre
   *   la Revisione è CHIUSA — è il caso normale, l'agente lavora e tu guardi la chat — e un
   *   elemento nascosto ha `clientWidth` 0, quindi ogni calcolo di scorrimento esce a vuoto.
   *   Quando poi la vista si apre, nessuno riprova.
   * ⇒ Quando non si può misurare, la richiesta resta IN SOSPESO e la consuma il `ResizeObserver`
   *   alla prima misura utile: niente `setTimeout`, niente ritentativi a vuoto, e una volta sola.
   */
  let inVistaInSospeso = null;

  /*
   * Porta in vista la linguetta scelta, calcolando lo scorrimento a mano:
   * `scrollIntoView` scorre anche gli ANTENATI, e qui basta la striscia.
   */
  function portaInVista(bottone) {
    if (!scorre || !bottone) return;
    if (contenitore.clientWidth === 0) { inVistaInSospeso = bottone.dataset[chiave] ?? null; return; }
    inVistaInSospeso = null;
    if (contenitore.scrollWidth > contenitore.clientWidth) {
      const r = bottone.getBoundingClientRect();
      const c = contenitore.getBoundingClientRect();
      if (r.left < c.left) contenitore.scrollLeft -= (c.left - r.left) + 8;
      else if (r.right > c.right) contenitore.scrollLeft += (r.right - c.right) + 8;
    }
    segnaBordi();
  }

  /*
   * I bordi che dicono «c'è dell'altro»: una sfumatura sul lato dove la striscia può ancora
   * scorrere. ⛔ Nasce da una foto, non da un'idea: con dodici file la striscia scorreva ma non lo
   * dichiarava in nessun modo — su Windows la barra sottile non si vede finché non ci passi sopra,
   * quindi chi guarda crede che i file siano quelli. La ricerca del 17/09/2026 (Eleken «Tabs UX
   * Best Practices») chiede esattamente «a gradient fade at the container's edge to hint at more».
   */
  function segnaBordi() {
    if (!scorre) return;
    const massimo = contenitore.scrollWidth - contenitore.clientWidth;
    if (massimo <= 1) { delete contenitore.dataset.bordi; return; }
    const aSinistra = contenitore.scrollLeft > 1;
    const aDestra = contenitore.scrollLeft < massimo - 1;
    contenitore.dataset.bordi = aSinistra && aDestra ? 'entrambi' : aSinistra ? 'sinistra' : 'destra';
  }

  if (scorre) {
    contenitore.addEventListener('scroll', segnaBordi, { passive: true });
    if (typeof ResizeObserver === 'function') {
      new ResizeObserver(() => {
        if (contenitore.clientWidth === 0) return;
        if (inVistaInSospeso != null) { const b = bottoneDi(inVistaInSospeso); inVistaInSospeso = null; if (b) portaInVista(b); }
        segnaBordi();
      }).observe(contenitore);
    }
  }

  function bottoneDi(id) {
    return contenitore.querySelector(`[role=tab][${attributo}="${CSS.escape(id)}"]`);
  }

  function creaLinguetta(voce, indice) {
    const b = documento.createElement('button');
    b.className = classe;
    b.setAttribute('role', 'tab');
    b.type = 'button';
    const id = identifica(voce);
    const scelta = id === attiva;
    b.setAttribute('aria-selected', String(scelta));
    b.tabIndex = scelta ? 0 : -1;               // roving tabindex (APG «Tabs», 17/09/2026)
    b.dataset[chiave] = id;
    const suggerisci = suggerimento(voce, indice, voci);
    if (suggerisci) b.title = suggerisci;
    if (contenuto) contenuto(b, voce, indice, voci);
    else b.append(documento.createTextNode(etichetta(voce, voci)));
    /* ⛔ Una linguetta in rinomina ospita un campo di testo: attaccarle sopra clic, doppio clic e
       menu contestuale significherebbe che un gesto dentro il campo chiude o rinomina un'altra
       volta. Chi ha uno stato così lo dichiara e la linguetta resta INERTE finché dura. */
    if (inerte?.(voce)) return b;
    b.addEventListener('click', (e) => {
      if (suClick?.(voce, e, b)) return;
      if (chiudibile && (e.ctrlKey || e.metaKey)) azioni.chiudi?.(id);
      else azioni.seleziona?.(id);
    });
    if (chiudibile) b.addEventListener('auxclick', (e) => { if (e.button === 1) { e.preventDefault(); azioni.chiudi?.(id); } });
    if (suDoppioClick) b.addEventListener('dblclick', (e) => { e.preventDefault(); suDoppioClick(voce, e, b); });
    if (menu) b.addEventListener('contextmenu', (e) => { e.preventDefault(); apriMenu(voce, e.clientX, e.clientY); });
    return b;
  }

  /*
   * La tastiera dentro la lista, dall'APG: frecce che CICLANO, Home/End, Canc dove si chiude,
   * F2 dove si rinomina, e il tasto del menu contestuale (o Maiusc+F10) per chi non ha il mouse.
   */
  function suTastiera(e) {
    const tab = e.target.closest?.(`[role=tab][${attributo}]`);
    if (!tab || azioni.tastieraSospesa?.()) return;
    const ids = voci.map((v) => identifica(v));
    const id = tab.dataset[chiave];
    const voce = voci.find((v) => identifica(v) === id);
    let prossima = null;
    if (e.key === 'ArrowRight') prossima = cicla(ids, id, 1);
    else if (e.key === 'ArrowLeft') prossima = cicla(ids, id, -1);
    else if (e.key === 'Home') prossima = ids[0];
    else if (e.key === 'End') prossima = ids[ids.length - 1];
    else if (e.key === 'Delete' && chiudibile) { e.preventDefault(); azioni.chiudi?.(id); return; }
    else if (e.key === 'F2' && rinominabile) { e.preventDefault(); if (voce) suDoppioClick?.(voce, e, tab); return; }
    else if (menu && (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10'))) { e.preventDefault(); const r = tab.getBoundingClientRect(); if (voce) apriMenu(voce, r.left, r.bottom); return; }
    else return;
    e.preventDefault();
    if (prossima && prossima !== id) {
      azioni.seleziona?.(prossima);
      const bersaglio = bottoneDi(prossima);
      bersaglio?.focus();
      portaInVista(bersaglio);
    }
  }
  contenitore.addEventListener('keydown', suTastiera);

  /*
   * ⛔ 17/09, R2 del revisore, MISURATA: `replaceChildren()` butta i nodi vecchi, e il nodo che
   *   aveva il fuoco se ne va con loro — il fuoco cade su `BODY`. Succede al caso normale: l'agente
   *   scrive un file mentre tu stai scegliendo una scheda con le frecce, la striscia si ridisegna e
   *   la tastiera smette di funzionare senza che niente lo dica.
   * ⇒ Prima del ridisegno si guarda CHI aveva il fuoco; dopo, se quella stessa linguetta esiste
   *   ancora, glielo si rende. ⛔ Mai rubarlo a chi non era nella striscia: si riparte solo da un
   *   `[role=tab]` figlio di questo contenitore, e solo se il suo id sopravvive al ridisegno.
   *
   * ⛔⛔ DUE condizioni che sembrano pignoleria e sono la differenza fra una cura e un difetto
   *   nuovo — le ha trovate la prova `BC63-R1-DOPPIOCLIC`, non il ragionamento:
   *   1. il fuoco deve stare sulla linguetta STESSA, non su un suo discendente. Durante la
   *      rinomina il fuoco è nel campo di testo DENTRO la linguetta: rimetterlo sul bottone lo
   *      toglie al campo, il `blur` del campo chiude la rinomina, e la rinomina si chiude da sola
   *      mentre scrivi. (Misurato: `locator.fill` restava appeso finché non scadeva il test.)
   *   2. si ripristina solo se il fuoco si è DAVVERO perso, cioè è finito sul corpo del documento.
   *      Se dopo il ridisegno qualcuno lo ha già preso — un campo, un menu — non è roba nostra.
   */
  function linguettaColFuoco() {
    const attivo = (contenitore.ownerDocument || document).activeElement;
    if (!attivo?.matches?.(`[role=tab][${attributo}]`)) return null;
    return contenitore.contains(attivo) ? attivo.dataset[chiave] : null;
  }

  function fuocoPerduto() {
    const documento = contenitore.ownerDocument || document;
    const attivo = documento.activeElement;
    return !attivo || attivo === documento.body || attivo === documento.documentElement;
  }

  function renderizza() {
    const avevaIlFuoco = linguettaColFuoco();
    contenitore.replaceChildren();
    voci.forEach((voce, i) => { contenitore.append('\n', creaLinguetta(voce, i)); });
    for (const nodo of coda?.(voci) || []) contenitore.append('\n', nodo);
    contenitore.append('\n');
    if (avevaIlFuoco != null && fuocoPerduto()) bottoneDi(avevaIlFuoco)?.focus();
    portaInVista(attiva != null ? bottoneDi(attiva) : null);
  }

  return {
    get lista() { return contenitore; },
    get voci() { return voci; },
    get attiva() { return attiva; },
    menu,
    chiudiMenu,
    apriMenu,
    bottoneDi,
    portaInVista,
    /** Ridisegna con l'elenco e la scelta correnti. */
    aggiorna(nuoveVoci = voci, nuovaAttiva = attiva) {
      voci = nuoveVoci;
      attiva = nuovaAttiva;
      renderizza();
    },
    /** Cambia solo la selezione, senza ridisegnare (nessun nodo buttato, nessun fuoco perso). */
    seleziona(id) {
      attiva = id;
      for (const b of contenitore.querySelectorAll(`[role=tab][${attributo}]`)) {
        const scelta = b.dataset[chiave] === id;
        b.setAttribute('aria-selected', String(scelta));
        b.tabIndex = scelta ? 0 : -1;
      }
      portaInVista(bottoneDi(id));
    },
    fuocoSullaAttiva() { contenitore.querySelector('[role=tab][aria-selected="true"]')?.focus(); },
  };
}
