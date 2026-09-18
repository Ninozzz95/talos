/*
 * Barra a faccette del catalogo modelli — corsia 1, 18/09/2026.
 * Porta la STRUTTURA di `prototypes/calm-lab/src/catalog-controls.mjs` (ordinamento, chip di
 * ambito, faccette a gruppi coi conteggi, chip dei filtri attivi, pannello avanzato ripiegabile)
 * nel design system di casa. Le classi sono `talos-*`: del prototipo NON si copiano `chip`,
 * `facet-select`, `facet-check`, `faceted-grid`, `catalog-discovery` — non esistono qui.
 *
 * ⛔ RICERCA — ogni scelta di questo file ha la sua fonte, letta il **18/09/2026**:
 *  · OR dentro una faccetta / AND fra faccette; il conteggio di un valore si calcola SENZA il
 *    filtro della sua stessa faccetta; i valori a zero restano VISIBILI; i conteggi stanno
 *    accanto ai valori; le faccette lunghe si limitano con «vedi altri».
 *    Fonti: multigrid.ai · meilisearch · Nosto · Voyado Elevate · AWS QuickSight (`NullOption`) ·
 *    Algolia. (acquisite dal brief; il prototipo le applica — tranne la prima metà dell'ultima:
 *    vedi la riga sui valori a zero)
 *  · «Vedi altri»: il trigger è un `<button>` VERO con `aria-expanded` che CAMBIA stato e
 *    `aria-controls` verso il pannello; il contenuto ripiegato esce dall'albero di accessibilità
 *    con `hidden` (mai `height:0` o sola opacità); l'etichetta si aggiorna e porta il NUMERO delle
 *    voci nascoste; ogni trigger ha un nome unico; il fuoco resta sul trigger.
 *    Fonti: accessibility.build «Accessible Accordion & Disclosure Pattern Guide» · Vercel Geist
 *    «Show more» · NSW Design System «Show more» · VA.gov «Navigate a long list» · PatternFly
 *    «Expandable section». (18/09/2026)
 *  · «Vedi altri» NON si usa per i dati che arrivano dal server: per quelli c'è «Mostra altri
 *    modelli» (`[data-catalog-more]`), che resta com'è. Fonte: NSW Design System. (18/09/2026)
 *  · Un valore che non si può scegliere si spegne con `disabled` SOLO se è un controllo di modulo:
 *    su un `<li>` o un `<a>` il browser lo ignora. Qui i valori sono `input[type=checkbox]` e i
 *    chip sono `<button>`, quindi `disabled` è onorato. Fonte: feder-cr/invisible_playwright,
 *    guida allo scraping delle faccette multi-valore. (18/09/2026)
 *  · Un valore a zero si mostra NON cliccabile (brief, da Voyado Elevate). ⛔ Il prototipo dice
 *    l'opposto — `<small>` «Zero resta selezionabile» — e la divergenza è dichiarata nel referto:
 *    vince il brief.
 *
 * ⛔ PERCHE' QUI E NON NELL'ENGINE: `catalog-engine.ts` è un port VERBATIM del prototipo e resta
 * tale. La barra non tocca la sua logica: chiama `selectCatalog`/`facetCount`/`toggleCatalogFacet`.
 * L'unica cosa che il motore non offre è il conteggio di UNA faccetta su MOLTI valori in un
 * passaggio solo (`conteggiPerFornitore`): 53 valori × 445 modelli con `facetCount` costano
 * **70,1 ms misurati**, che a ogni tasto premuto nella ricerca sono un ritardo visibile.
 */
import { FACET_OPTIONS, CATALOG_SORTS, activeCatalogFilters, emptyCatalogFilters, facetCount, removeCatalogFilter, selectCatalog, toggleCatalogFacet } from '../domain/catalog-engine.ts';

/** Le voci di una faccetta oltre questa soglia finiscono dietro «Vedi altri». */
export const VOCI_VISIBILI = 8;

/** Le soglie di contesto: quelle del prototipo, identiche e nello stesso ordine. */
export const SOGLIE_CONTESTO = Object.freeze([8192, 16384, 32768, 65536, 131072, 262144]);

/*
 * Gli ordinamenti che il prototipo offre sono nove; qui se ne offrono solo quelli che il catalogo
 * VERO può sostenere, deciso da una misura sui record (vedi `capacitaDelCatalogo`) e non da una
 * lista scritta a mano. Le etichette che nel prototipo portano «· demo» — `price-asc` — qui non lo
 * portano: i prezzi di questo catalogo sono osservati da OpenRouter, non finti.
 */
const ETICHETTE_ORDINAMENTO = Object.freeze({
  catalog: 'Ordine del catalogo',
  name: 'Nome A–Z',
  'context-desc': 'Contesto: maggiore',
  'price-asc': 'Costo input: crescente',
});

const el = (tag, cls, txt) => { const n = document.createElement(tag); if (cls) n.className = cls; if (txt != null) n.textContent = String(txt); return n; };
const numero = (n) => new Intl.NumberFormat('it-IT').format(n);

/*
 * ⛔ Una faccetta si offre quando c'è DAVVERO il dato che le serve, e non si offre quando non c'è:
 * è la regola delle «sorgenti vere» del 18/09 (ciò che non si collega si elenca, non si inventa).
 * Il predicato è misurato sui record, quindi il giorno che il catalogo porta un dato nuovo la
 * faccetta si accende da sola — nessuna riga da cambiare.
 */
export function capacitaDelCatalogo(modelli, contesto = {}) {
  const sa = (f) => modelli.some(f);
  const noto = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0;
  const ordinamenti = ['catalog', 'name', 'context-desc', 'price-asc'].filter((id) => {
    if (id === 'context-desc') return sa((m) => noto(m.context));
    if (id === 'price-asc') return sa((m) => noto(m.priceInput));
    return true;
  }).map((id) => [id, ETICHETTE_ORDINAMENTO[id] || (CATALOG_SORTS.find(([x]) => x === id) || [])[1]]);
  return {
    ordinamenti,
    /** I parametri che il catalogo accetta, in ordine di frequenza: è la faccetta con più valori. */
    parametri: [...modelli.reduce((acc, m) => { for (const v of m.capabilities || []) acc.set(v, (acc.get(v) || 0) + 1); return acc; }, new Map())]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'it')).map(([v]) => v),
    haContesto: sa((m) => noto(m.context)),
    haPrezzo: sa((m) => noto(m.priceInput) || noto(m.priceOutput)),
    /** Il dato manca a qualcuno? Solo allora «includi i non noti» cambia qualcosa e si offre. */
    haBuchi: sa((m) => !noto(m.context) || !noto(m.priceInput) || !noto(m.priceOutput)),
    contesto,
  };
}

/*
 * ⛔ I conteggi di TUTTI i fornitori in un passaggio solo.
 * È lo stesso numero che `facetCount(modelli, filtri, 'providers', v)` — che SOSTITUISCE la
 * faccetta col valore — perché qui la faccetta si Svuota e poi si contano i record per fornitore:
 * stesse righe, stesso insieme. La prova che i due coincidono su ogni valore è in
 * `tests/unit/catalog-faccette.test.mjs`, ed è scritta come confronto, non come asserzione mia.
 * Per le faccette a lista non si usa invece per `capabilities`: lì `facetCount` AGGIUNGE il valore
 * a quelli già scelti (AND), e svuotare l'array darebbe un numero diverso e meno utile.
 */
export function conteggiPerFornitore(modelli, filtri, contesto = {}) {
  const senza = { ...filtri, providers: [] };
  const conteggi = new Map();
  for (const m of selectCatalog(modelli, senza, contesto)) conteggi.set(m.provider, (conteggi.get(m.provider) || 0) + 1);
  return conteggi;
}

/* ─────────────────────────── disegno ─────────────────────────── */

/* ⛔ 18/09/2026 — il chip acceso si distingue con `--primary`, non con `aria-pressed`: nel design
   system NON esiste una regola `talos-button[aria-pressed="true"]`, e un chip acceso identico a uno
   spento è la stessa classe di difetto del «pulsante che promette un'altra cosa». `--primary` è la
   variante che il sistema usa per «scelto». */
function chip(etichetta, valore, { premuto = false, conteggio = null, disabilitato = false, titolo = null } = {}) {
  const b = el('button', 'talos-button talos-button--sm ' + (premuto ? 'talos-button--primary' : 'talos-button--secondary'), etichetta);
  b.type = 'button'; b.dataset.facetChip = valore; b.setAttribute('aria-pressed', String(premuto));
  if (disabilitato) b.disabled = true;
  if (titolo) b.title = titolo;
  if (conteggio !== null) b.append(el('span', 'talos-badge talos-badge--sm', numero(conteggio)));
  return b;
}

function rigaValore(gruppo, valore, testo, conteggio, acceso) {
  const riga = el('label', 'talos-cluster');
  riga.dataset.facetRow = valore;
  const casella = el('input', 'talos-checkbox');
  casella.type = 'checkbox'; casella.value = valore; casella.dataset.facetCheck = gruppo; casella.checked = acceso;
  // ⛔ «Zero non cliccabile»: il valore resta a schermo — dice che quel valore esiste nel
  // vocabolario — ma non porta a un vicolo cieco. Se è già acceso resta spegnibile.
  if (!conteggio && !acceso) { casella.disabled = true; riga.dataset.facetZero = ''; }
  const conto = el('small', 'talos-muted', numero(conteggio));
  conto.setAttribute('aria-label', conteggio + ' corrispondenze con gli altri filtri');
  riga.append(casella, el('span', 'talos-grow', testo), conto);
  return riga;
}

function gruppoValori(chiave, titolo, nota) {
  const g = el('fieldset', 'talos-lab__space');
  g.dataset.facetGroup = chiave;
  g.append(el('legend', 'talos-lab__heading', titolo));
  if (nota) g.append(el('p', 'talos-muted', nota));
  const righe = el('div', 'talos-card talos-card--pad');
  righe.dataset.facetRows = '';
  /* ⛔ 18/09/2026 — un disclosure si annuncia: `aria-expanded` sullo stato e `aria-controls` che
     punta al contenitore che si apre. `aria-controls` vuole un id, e il contenitore non ne aveva:
     senza, un lettore di schermo sente «Vedi altri 18 parametri» e non sa cosa si apre.
     Fonti (ricerca 18/09/2026): W3C WAI-ARIA Authoring Practices, «Disclosure (Show/Hide)» —
     un `<button>` vero con `aria-expanded` (false = contenuto nascosto) e `aria-controls` verso
     l'id del contenitore, con l'etichetta che dice lo STATO (MDN, `aria-expanded`); per le
     faccette in particolare Shopify Dawn issue #107 «Faceted Filters» (WCAG 1.3.1 e 4.1.2), che
     raccomanda proprio `aria-expanded` + `aria-controls` sul contenitore; Vercel Geist «Show more»
     per le due metà che qui sono rispettate: il trigger porta il NUMERO delle voci nascoste
     («Vedi altri 18 parametri») e si taglia fra 5 e 10 righe (`VOCI_VISIBILI = 8`).
     ⛔ DUE DIVERGENZE DICHIARATE, non provate qui: Geist sposta il fuoco sulla prima riga appena
     rivelata e l'APG riporta il fuoco sul trigger con Esc — questa barra non fa né l'una né
     l'altra. Sono annotate nel referto, non silenziose. */
  righe.id = 'modelLabFacetsRows-' + chiave;
  g.append(righe);
  const altri = el('button', 'talos-button talos-button--ghost talos-button--sm', 'Vedi altri');
  altri.type = 'button'; altri.dataset.facetMore = chiave; altri.hidden = true;
  altri.setAttribute('aria-expanded', 'false'); altri.setAttribute('aria-controls', righe.id);
  g.append(altri);
  return g;
}

function gruppoNumero(chiave, titolo, coppie, nota) {
  const g = el('fieldset', 'talos-lab__space');
  g.dataset.facetGroup = chiave;
  g.append(el('legend', 'talos-lab__heading', titolo));
  const riga = el('div', 'talos-cluster');
  for (const [campo, etichetta, unita] of coppie) {
    const l = el('label', 'talos-field talos-field--sm');
    l.append(el('span', 'talos-muted', etichetta));
    const i = el('input', 'talos-field__input');
    i.type = 'number'; i.min = '0'; i.step = 'any'; i.placeholder = 'Nessun limite'; i.dataset.facetNumber = campo;
    i.setAttribute('aria-label', etichetta);
    l.append(i, el('span', 'talos-muted', unita));
    riga.append(l);
  }
  g.append(riga);
  if (nota) g.append(el('p', 'talos-muted', nota));
  return g;
}

/**
 * Costruisce la barra UNA volta sola e la aggiorna in place: rifarla a ogni tasto premuto
 * porterebbe via il fuoco dalla casella appena toccata.
 * @param {{onCambia: (filtri: object) => void, etichetta?: (chiave: string, valore: string) => string}} opzioni
 */
export function creaBarraFaccette({ onCambia, etichetta = (k, v) => v } = {}) {
  const barra = el('section', 'talos-stack');
  barra.id = 'modelLabFacets';
  barra.dataset.catalogFacets = '';
  barra.setAttribute('aria-label', 'Ricerca e filtri del catalogo');

  const strumenti = el('div', 'talos-cluster');
  const ordina = el('label', 'talos-field talos-field--sm');
  ordina.append(el('span', 'talos-muted', 'Ordina'));
  const selectOrdina = el('select', 'talos-select talos-select--sm');
  selectOrdina.id = 'modelLabSort';
  selectOrdina.setAttribute('aria-label', 'Ordina i modelli');
  ordina.append(selectOrdina);
  strumenti.append(ordina);

  const ambito = el('div', 'talos-cluster');
  ambito.setAttribute('role', 'group'); ambito.setAttribute('aria-label', 'Destinazione e raccolta');
  ambito.dataset.facetScope = '';
  strumenti.append(ambito);

  const apri = el('button', 'talos-button talos-button--secondary talos-button--sm', 'Tutti i filtri');
  apri.type = 'button'; apri.dataset.facetToggle = '';
  apri.setAttribute('aria-expanded', 'false'); apri.setAttribute('aria-controls', 'modelLabFacetsAdvanced');
  const insegna = el('span', 'talos-badge talos-badge--sm', '0'); insegna.dataset.facetTotal = ''; insegna.hidden = true;
  apri.append(insegna);
  strumenti.append(apri);
  barra.append(strumenti);

  const avanzati = el('div', 'talos-choice-grid');
  avanzati.id = 'modelLabFacetsAdvanced'; avanzati.dataset.facetAdvanced = ''; avanzati.hidden = true;

  const gContesto = el('fieldset', 'talos-lab__space');
  gContesto.dataset.facetGroup = 'contesto';
  gContesto.append(el('legend', 'talos-lab__heading', 'Contesto minimo'));
  const lContesto = el('label', 'talos-field talos-field--sm');
  lContesto.append(el('span', 'talos-muted', 'Il modello deve reggere almeno'));
  const selContesto = el('select', 'talos-select talos-select--sm');
  selContesto.id = 'modelLabMinContext'; selContesto.dataset.facetSelect = 'minContext';
  selContesto.setAttribute('aria-label', 'Contesto minimo in token');
  lContesto.append(selContesto, el('span', 'talos-muted', 'token'));
  gContesto.append(lContesto);
  avanzati.append(gContesto);

  const gParametri = gruppoValori('capabilities', 'Parametri accettati',
    'Sono richiesti TUTTI quelli scelti: sono dichiarazioni del fornitore, non una prova del runtime.');
  avanzati.append(gParametri);

  const gCosto = gruppoNumero('prezzo', 'Costo dichiarato', [['maxInput', 'Ingresso massimo', 'USD/M'], ['maxOutput', 'Uscita massima', 'USD/M']],
    'USD per milione di token, come in scheda. Un prezzo mancante non è un prezzo pari a zero.');
  avanzati.append(gCosto);

  const gNonNoti = el('fieldset', 'talos-lab__space');
  gNonNoti.dataset.facetGroup = 'nonnoti';
  gNonNoti.append(el('legend', 'talos-lab__heading', 'Dati non dichiarati'));
  const rigaNonNoti = el('label', 'talos-cluster');
  const casellaNonNoti = el('input', 'talos-checkbox');
  casellaNonNoti.type = 'checkbox'; casellaNonNoti.dataset.facetBool = 'includeUnknown';
  rigaNonNoti.append(casellaNonNoti, el('span', 'talos-grow', 'Tieni dentro anche i modelli senza il dato'));
  gNonNoti.append(rigaNonNoti, el('p', 'talos-muted', 'Un prezzo mancante non è un prezzo basso.'));
  avanzati.append(gNonNoti);

  barra.append(avanzati);

  const attivi = el('div', 'talos-cluster');
  attivi.setAttribute('role', 'group'); attivi.setAttribute('aria-label', 'Filtri applicati');
  attivi.dataset.facetActive = '';
  barra.append(attivi);

  let filtri = emptyCatalogFilters();   // i filtri CORRENTI: la sola fonte per chi risponde al clic
  let stato = { modelli: [], contesto: {}, capacita: capacitaDelCatalogo([]) };
  let aperti = new Set();               // quali gruppi hanno «Vedi altri» premuto

  const cambia = (nuovi) => { filtri = nuovi; onCambia?.(nuovi); };

  /*
   * ⛔⛔ 18/09/2026 — MISURATO: un `[aria-expanded][aria-controls]` NON è nostro. In
   *   `src/legacy/app.js:22339` vive la regia del mockup — un ascoltatore sul documento che
   *   tratta OGNI elemento con quella coppia come una «disclosure» e la inverte da sé:
   *   `disclosure.setAttribute('aria-expanded', String(!aperto)); c.hidden = aperto`.
   *   Con l'ascoltatore qui sotto i due si ANNULLAVANO: la sonda che registra CHI scrive
   *   (`%TEMP%/corsia1-probe/toggle3.mjs`, 18/09/2026, pile comprese) ha misurato la sequenza
   *   `aria-expanded: false → true` a 22 ms (noi) e `true → false` a 25 ms (la regia), col
   *   pannello che restava chiuso e l'etichetta che invece cambiava: un interruttore INERTE,
   *   cioè il peggior esito possibile — non un errore, un comando che non fa niente.
   *   ⇒ Il clic non arriva alla regia. È la via di casa per chi possiede la propria disclosure
   *   con un'etichetta che dice lo stato: `src/components/inspector.js` (`bottoneApri`) fa lo
   *   stesso `stopPropagation` sul proprio pulsante, per la stessa ragione.
   */
  apri.addEventListener('click', (evento) => {
    evento.stopPropagation();
    const aperto = apri.getAttribute('aria-expanded') === 'true';
    apri.setAttribute('aria-expanded', String(!aperto));
    avanzati.hidden = aperto;
    apri.firstChild.textContent = aperto ? 'Tutti i filtri' : 'Meno filtri';
  });
  selectOrdina.addEventListener('change', () => cambia({ ...filtri, sort: selectOrdina.value }));
  selContesto.addEventListener('change', () => cambia({ ...filtri, minContext: selContesto.value }));
  casellaNonNoti.addEventListener('change', () => cambia({ ...filtri, includeUnknown: casellaNonNoti.checked }));
  ambito.addEventListener('click', (evento) => {
    const b = evento.target.closest('[data-facet-chip]'); if (!b || b.disabled) return;
    cambia({ ...filtri, destination: b.dataset.facetChip === 'all' ? [] : [b.dataset.facetChip] });
  });
  /* ⛔ Stessa regia, stesso rimedio dell'interruttore qui sopra: «Vedi altri» porta anche lui
     `aria-expanded` + `aria-controls`, quindi la regia lo prende — e il contenitore che
     promette è `#modelLabFacetsRows-capabilities`, cioè proprio quello che stiamo aprendo:
     senza questo `stopPropagation` la regia scriverebbe `c.hidden = aperto` subito dopo di
     noi, lasciando a schermo l'etichetta «Vedi meno parametri» e nessuna riga in più (è il
     difetto dell'interruttore, misurato il 18/09/2026 con `toggle3.mjs`: `aria-expanded`
     invertito da noi a 22 ms e riportato indietro dalla regia a 25 ms). */
  gParametri.addEventListener('click', (evento) => {
    if (evento.target.closest('[data-facet-more]')) { evento.stopPropagation(); aperti.has('capabilities') ? aperti.delete('capabilities') : aperti.add('capabilities'); aggiorna(); }
  });
  /* ⛔ 18/09/2026 — si ascolta `change` e non `click`: cliccare il TESTO di una riga attiva la
     casella per via nativa (`<label>`), e quel percorso NON produce nessun clic sull'input — un
     ascolto sul clic avrebbe filtrato a schermo senza filtrare lo stato, cioè un filtro che mente.
     Il `change` invece arriva dall'input in tutti e due i percorsi (nativo e controllo Calm). */
  gParametri.addEventListener('change', (evento) => {
    const c = evento.target.closest('[data-facet-check]');
    if (c) cambia(toggleCatalogFacet(filtri, 'capabilities', c.value));
  });
  gCosto.addEventListener('input', (evento) => {
    const i = evento.target.closest('[data-facet-number]'); if (!i) return;
    cambia({ ...filtri, [i.dataset.facetNumber]: i.value === '' ? '' : String(Math.max(0, Number(i.value) || 0)) });
  });
  attivi.addEventListener('click', (evento) => {
    const b = evento.target.closest('[data-facet-remove]'); if (!b) return;
    const dopo = b.dataset.facetRemove === '__azzera' ? emptyCatalogFilters() : removeCatalogFilter(filtri, b.dataset.facetKey, b.dataset.facetValue || undefined);
    /* ⛔ Il fuoco NON si perde: chi toglie un filtro con la tastiera si ritrova sul chip successivo
       (o sulla ricerca quando i chip finiscono), altrimenti cadrebbe sul corpo della pagina.
       Fonti: accessibility.build · NSW Design System, «focus resta sul trigger». (18/09/2026) */
    cambia(dopo);
    const restanti = attivi.querySelectorAll('[data-facet-remove]');
    (restanti[0] || document.querySelector('#modelLabSearch'))?.focus();
  });

  function aggiorna(nuovoStato) {
    if (nuovoStato) stato = nuovoStato;
    const { modelli, contesto, capacita } = stato;
    if (stato.filtri) filtri = stato.filtri;

    const ordinaSelezionata = filtri.sort || 'catalog';
    if (selectOrdina.dataset.firma !== JSON.stringify(capacita.ordinamenti)) {
      selectOrdina.dataset.firma = JSON.stringify(capacita.ordinamenti);
      selectOrdina.replaceChildren(...capacita.ordinamenti.map(([id, testo]) => new Option(testo, id, false, id === ordinaSelezionata)));
    }
    selectOrdina.value = ordinaSelezionata;

    ambito.replaceChildren();
    const totale = selectCatalog(modelli, { ...filtri, destination: [] }, contesto).length;
    ambito.append(chip('Tutti', 'all', { premuto: !filtri.destination.length, conteggio: totale }));
    for (const [valore, testo] of FACET_OPTIONS.destination) {
      const n = facetCount(modelli, filtri, 'destination', valore, contesto);
      ambito.append(chip(testo, valore, {
        premuto: filtri.destination.includes(valore), conteggio: n, disabilitato: !n && !filtri.destination.includes(valore),
        titolo: !n && !filtri.destination.includes(valore) ? 'Nessun modello in questo catalogo' : null,
      }));
    }

    // Le soglie di contesto, coi conteggi nelle voci: identico al prototipo, `opt(v,label,sel,n)`.
    const contestoMostrato = capacita.haContesto || filtri.minContext !== '';
    gContesto.hidden = !contestoMostrato;
    if (contestoMostrato) {
      selContesto.replaceChildren();
      selContesto.append(new Option('Qualsiasi', '', false, filtri.minContext === ''));
      for (const s of SOGLIE_CONTESTO) {
        const n = facetCount(modelli, filtri, 'minContext', String(s), contesto);
        selContesto.append(new Option(`${numero(s)} (${numero(n)})`, String(s), false, filtri.minContext === String(s)));
        selContesto.lastChild.disabled = !n && filtri.minContext !== String(s);
      }
      selContesto.value = filtri.minContext;
      if (selContesto.selectedIndex < 0) selContesto.selectedIndex = 0;
    }

    // I valori dei parametri: conteggi con `facetCount` (l'AND tiene dentro gli altri scelti),
    // solo per le voci a schermo — le nascoste si contano quando si aprono.
    gParametri.hidden = !capacita.parametri.length;
    if (!gParametri.hidden) {
      const gruppi = capacita.parametri.filter((v) => filtri.capabilities.includes(v) || aperti.has('capabilities'));
      const visibili = capacita.parametri.slice(0, VOCI_VISIBILI);
      const daMostrare = [...new Set([...gruppi, ...visibili])];
      const righe = gParametri.querySelector('[data-facet-rows]');
      righe.replaceChildren(...daMostrare.map((v) => rigaValore('capabilities', v, etichetta('capabilities', v), facetCount(modelli, filtri, 'capabilities', v, contesto), filtri.capabilities.includes(v))));
      const altri = gParametri.querySelector('[data-facet-more]');
      const resto = capacita.parametri.length - daMostrare.length;
      const apertoOra = aperti.has('capabilities');
      altri.hidden = !resto && !apertoOra;
      altri.setAttribute('aria-expanded', String(apertoOra));
      if (!altri.hidden) {
        altri.textContent = apertoOra ? 'Vedi meno parametri' : `Vedi altri ${numero(resto)} parametri`;
        altri.setAttribute('aria-label', apertoOra ? 'Chiudi l’elenco dei parametri' : `Mostra altri ${numero(resto)} parametri accettati`);
      }
    }

    gCosto.hidden = !capacita.haPrezzo;
    if (!gCosto.hidden) for (const [campo] of [['maxInput'], ['maxOutput']]) {
      const i = gCosto.querySelector('[data-facet-number="' + campo + '"]');
      if (i && document.activeElement !== i) i.value = filtri[campo];
    }
    // Il dato manca a qualcuno? Se no, la casella non cambierebbe niente e non si mostra.
    gNonNoti.hidden = !capacita.haBuchi;
    if (!gNonNoti.hidden) casellaNonNoti.checked = filtri.includeUnknown;

    const chips = activeCatalogFilters(filtri);
    const ricerca = attivi.closest('#modelLabCatalogPanel')?.querySelector('input[type="search"]')?.value?.trim() || '';
    attivi.replaceChildren();
    if (ricerca) attivi.append(chipRicerca(ricerca));
    for (const c of chips) attivi.append(chipFiltro(c));
    if (chips.length || ricerca) {
      const azzera = el('button', 'talos-button talos-button--ghost talos-button--sm', 'Azzera tutto');
      azzera.type = 'button'; azzera.dataset.facetRemove = '__azzera';
      attivi.append(azzera);
    }
    attivi.hidden = !attivi.children.length;
    insegna.textContent = String(chips.length);
    insegna.hidden = !chips.length;
  }

  function chipFiltro(c) {
    const b = el('button', 'talos-button talos-button--secondary talos-button--sm', c.label);
    b.type = 'button'; b.dataset.facetRemove = ''; b.dataset.facetKey = c.key;
    if (typeof c.value === 'string') b.dataset.facetValue = c.value;
    b.setAttribute('aria-label', 'Rimuovi ' + c.label);
    return b;
  }
  function chipRicerca(q) {
    const b = el('button', 'talos-button talos-button--secondary talos-button--sm', 'Ricerca: ' + q);
    b.type = 'button'; b.dataset.facetRemoveSearch = '';
    b.setAttribute('aria-label', 'Rimuovi ricerca ' + q);
    b.addEventListener('click', () => {
      const campo = barra.closest('#modelLabCatalogPanel')?.querySelector('input[type="search"]');
      if (!campo) return;
      campo.value = ''; campo.dispatchEvent(new Event('input', { bubbles: true })); campo.focus();
    });
    return b;
  }
  barra.aggiorna = aggiorna;
  return barra;
}

export function aggiornaBarraFaccette(barra, stato) { barra.aggiorna(stato); }
