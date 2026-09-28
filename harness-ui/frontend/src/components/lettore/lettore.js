/**
 * F5 File reader (26/09/2026) — IL LETTORE: un file della cartella o della Libreria, mostrato DENTRO TALOS.
 *
 * Decisioni owner: 23/09 n. 6 (testo/codice/Markdown, PDF, immagini, Office in sola lettura; rail destro e schermo
 * intero; dalla Libreria e dalla tab File) e 26/09 (memoria `decisioni-owner-f5-file-reader-26-09`): PDF col lettore di
 * Chromium, Office con librerie nel browser, HTML con script ma senza rete, più la vista Sorgente.
 *
 * Com'è fatto, e da dove viene:
 *   · la testata ha la grammatica della tab File (`scheda-file.css`, `.talos-file-head`: icona, nome con ellissi, pochi
 *     comandi) e un solo menu «⋯» — lo STESSO menu contestuale di Terminale e Revisione (`schede.js`), aperto anche col
 *     tasto destro; ciò che sta nel menu non si ripete fuori;
 *   · le viste Resa/Sorgente sono il pattern Tabs dell'APG, come «Anteprima/Testo» della Libreria (`libreria-anteprima.js`);
 *   · il tipo lo decidono il nome E i byte (`tipo-file.js`), mai l'etichetta salvata; una contraddizione si DICE;
 *   · i PDF col lettore di Chromium in un `iframe` sull'indirizzo IN LINEA della fonte (`fonti.js`): Hermes usa `blob:`
 *     (`preview-file.tsx:815-844`), ma la CSP della pagina di TALOS non ammette `blob:` in `frame-src` né in `img-src`
 *     (misurato il 26/09) — le immagini quindi vanno in `data:`; il lettore di Chromium, misurato nel guscio Electron
 *     44.3.0, disegna senza `plugins: true` e sotto le intestazioni della rotta in linea;
 *   · l'HTML in una cornice `sandbox="allow-scripts"` (mai `allow-same-origin`) sull'indirizzo col lasciapassare
 *     (`POST /sessions/:id/pagine`), con l'attributo `csp` che è la STESSA politica del server (`politicaPagina`,
 *     `http-app.mjs`; un test le confronta): CSP Embedded Enforcement, nessuna pagina esterna disegnata qui dentro;
 *   · tetti dichiarati a schermo: il testo oltre 512 kB chiede «Mostra comunque» (come Hermes e come `/tree/file`),
 *     qualunque file oltre 50 MB si apre con l'app del sistema (Codex ne ha 10 fissi, e gli utenti lo contestano).
 */
import { renderizzaMarkdown } from '../markdown.js';
import { dimensioneLeggibile, righeCsv, separatoreDi } from '../libreria-anteprima.js';
import { apriMenuContestuale, creaMenuContestuale } from '../schede.js';
import { tipoDaNome, tipoDelFile } from './tipo-file.js';

export const TETTO_TESTO = 512 * 1024;
export const TETTO_FILE = 50 * 1024 * 1024;
export const CARATTERI_MOSTRATI = 400_000;
export const RIGHE_TABELLA = 200;

/** Le viste che un tipo ha DAVVERO: un interruttore con una scelta sola non è un interruttore. */
export function modiDelTipo(tipo, estensione = '') {
  if (tipo === 'markdown' || tipo === 'tabella' || tipo === 'html') return ['resa', 'sorgente'];
  if (tipo === 'immagine' && estensione === 'svg') return ['resa', 'sorgente'];
  if (tipo === 'testo') return ['sorgente'];
  return ['resa'];
}
// le parole che l'owner conosce già dalla Libreria (11/09: «sia renderizzato che in versione testuale»)
export const PAROLE_MODO = Object.freeze({ resa: 'Anteprima', sorgente: 'Testo' });

const ETICHETTE = new Map([
  ['markdown', 'Markdown'], ['tabella', 'Tabella CSV'], ['testo', 'Testo'], ['html', 'Pagina HTML'], ['immagine', 'Immagine'],
  ['pdf', 'PDF'], ['documento', 'Documento Word'], ['foglio', 'Foglio di calcolo'], ['presentazione', 'Presentazione'],
]);
export const etichettaTipo = (tipo) => ETICHETTE.get(tipo) ?? 'File';
const ICONE = new Map([
  ['markdown', 'i-doc'], ['tabella', 'i-grid'], ['testo', 'i-code'], ['html', 'i-globe'], ['immagine', 'i-image'], ['pdf', 'i-doc'],
  ['documento', 'i-doc'], ['foglio', 'i-grid'], ['presentazione', 'i-layout'],
]);
export const iconaTipo = (tipo) => ICONE.get(tipo) ?? 'i-file';

/** La lingua per l'evidenziazione (nomi di Prism) dall'estensione; `''` se non la sappiamo. */
const LINGUE = new Map(Object.entries({
  js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'jsx', ts: 'typescript', tsx: 'tsx', py: 'python', rb: 'ruby',
  go: 'go', rs: 'rust', java: 'java', kt: 'kotlin', c: 'c', h: 'c', cpp: 'cpp', hpp: 'cpp', cs: 'csharp', php: 'php', sh: 'bash',
  bash: 'bash', zsh: 'bash', ps1: 'powershell', bat: 'batch', cmd: 'batch', sql: 'sql', css: 'css', scss: 'scss', json: 'json',
  jsonl: 'json', yml: 'yaml', yaml: 'yaml', toml: 'toml', ini: 'ini', md: 'markdown', markdown: 'markdown', html: 'markup',
  htm: 'markup', xhtml: 'markup', xml: 'markup', svg: 'markup', diff: 'diff', patch: 'diff',
}));
export const linguaDi = (estensione) => LINGUE.get(estensione) ?? '';

/**
 * La politica delle sorgenti di una pagina resa, PER L'ATTRIBUTO `csp` della cornice: la stessa stringa di
 * `politicaPagina` del server (`http-app.mjs`), e `tests/unit/lettore.test.mjs` le confronta byte per byte.
 */
export function politicaCornice(base) {
  return [
    "default-src 'none'",
    `script-src ${base} 'unsafe-inline' 'unsafe-eval'`,
    `style-src ${base} 'unsafe-inline'`,
    `img-src ${base} data: blob:`,
    `font-src ${base} data:`,
    `media-src ${base} data: blob:`,
    "connect-src 'none'",
    "form-action 'none'",
    "frame-src 'none'",
    "worker-src 'none'",
    "manifest-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
  ].join('; ');
}

/** Gli scalini dello zoom di un'immagine, e il prossimo nel verso chiesto (`+1`/`-1`). */
export const SCALINI_ZOOM = Object.freeze([0.1, 0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4, 8]);
export function prossimoZoomImmagine(attuale, verso) {
  const k = Number(attuale) || 1;
  if (verso > 0) return SCALINI_ZOOM.find((s) => s > k + 1e-9) ?? SCALINI_ZOOM[SCALINI_ZOOM.length - 1];
  return [...SCALINI_ZOOM].reverse().find((s) => s < k - 1e-9) ?? SCALINI_ZOOM[0];
}

/** Il tipo MIME di un'immagine dalla sua firma (o dall'estensione, per l'SVG che è testo). */
const MIME_FIRMA = { png: 'image/png', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif', ico: 'image/x-icon', bmp: 'image/bmp' };
export const mimeImmagine = (firma, estensione) => MIME_FIRMA[firma] ?? (estensione === 'svg' ? 'image/svg+xml' : 'application/octet-stream');

/**
 * Che cosa fare prima di leggere: `leggi`, o `fuori` se il file supera il tetto generale (lo si sa già dalla taglia che
 * la fonte dichiara, così non si scaricano 60 MB per dire che non si mostrano).
 */
export function decidiLettura(dimensione) {
  return Number.isFinite(dimensione) && dimensione > TETTO_FILE ? 'fuori' : 'leggi';
}

/* ------------------------------------------------------------------------------------------------ il DOM */

function crea(doc, tag, classe, testo) {
  const nodo = doc.createElement(tag);
  if (classe) nodo.className = classe;
  if (testo !== undefined && testo !== null) nodo.textContent = String(testo);
  return nodo;
}
function icona(doc, id) {
  const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'i');
  svg.setAttribute('aria-hidden', 'true');
  const use = doc.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `#${id}`);
  svg.append(use);
  return svg;
}
function bottoneIcona(doc, id, etichetta, fai) {
  const b = crea(doc, 'button', 'talos-button talos-button--ghost talos-button--sm talos-icon-button');
  b.type = 'button';
  b.setAttribute('aria-label', etichetta);
  b.title = etichetta;
  b.append(icona(doc, id));
  b.addEventListener('click', fai);
  return b;
}
function bottoneTesto(doc, testo, fai, variante = 'secondary') {
  const b = crea(doc, 'button', `talos-button talos-button--${variante} talos-button--sm`, testo);
  b.type = 'button';
  b.addEventListener('click', fai);
  return b;
}

let contatore = 0;

/**
 * Il lettore di UN file.
 * @param {object} p
 * @param {Document} [p.doc]
 * @param {object} [p.finestra] dove stanno `URL.createObjectURL`, `innerWidth`, `location`
 * @param {{nome:string, percorso?:string, dimensione?:number, leggiByte:()=>Promise<ArrayBuffer>, creaPagina?:()=>Promise<string>}} p.fonte
 * @param {object} [p.opzioni]
 * @param {(testo:string, lingua:string)=>Node} [p.opzioni.bloccoCodice] il blocco di codice della chat (evidenziazione)
 * @param {(stato:object)=>Array<[string, Function, boolean?]>} [p.opzioni.azioni] le voci del menu «⋯» oltre a «Copia il testo»
 * @param {()=>void} [p.opzioni.apriFuori] «Apri con l'app del sistema», per ciò che qui non si mostra
 * @param {boolean} [p.opzioni.schermoIntero] il lettore è a schermo intero (cambia il comando)
 * @param {()=>void} [p.opzioni.onSchermoIntero]
 * @param {()=>void} [p.opzioni.onChiudi]
 * @param {(tipo:string)=>Promise<{rendi:Function}>} [p.opzioni.lettoreOffice] il lettore di docx/xlsx/pptx, caricato quando serve
 * @param {(testo:string)=>void} [p.opzioni.copia]
 */
export function creaLettore({ doc = globalThis.document, finestra = globalThis, fonte, opzioni = {} }) {
  contatore += 1;
  const radiceId = `talos-lettore-${contatore}`;
  const nome = String(fonte?.nome ?? '');
  const stimato = tipoDaNome(nome);
  const stato = { fase: 'caricando', tipo: stimato.tipo, estensione: stimato.estensione, avviso: null, modo: null, byte: null, testo: null, forzato: false, zoom: 'adatta', tuttaLaTabella: false, errore: null };

  const radice = crea(doc, 'section', 'talos-lettore');
  radice.setAttribute('aria-label', `Lettore: ${nome}`);
  radice.dataset.stato = 'caricando';

  /* ---- la testata ---- */
  const testata = crea(doc, 'header', 'talos-lettore__testata');
  const iconaTipoNodo = crea(doc, 'span', 'talos-lettore__icona');
  const nomeNodo = crea(doc, 'h3', 'talos-lettore__nome', nome);
  nomeNodo.title = fonte?.percorso || nome;
  nomeNodo.tabIndex = -1; // chi apre il lettore ci porta il fuoco (un lettore di schermo annuncia il file); non entra nel Tab
  const meta = crea(doc, 'p', 'talos-lettore__meta', 'Leggo il file…');
  const titoli = crea(doc, 'div', 'talos-lettore__titoli');
  titoli.append(nomeNodo, meta);
  const comandi = crea(doc, 'div', 'talos-lettore__comandi');
  const modi = crea(doc, 'div', 'td-segment talos-lettore__modi');
  modi.setAttribute('role', 'tablist');
  modi.setAttribute('aria-label', `Come guardare ${nome}`);
  modi.hidden = true;
  const zoom = crea(doc, 'div', 'talos-lettore__zoom');
  zoom.setAttribute('role', 'group');
  zoom.setAttribute('aria-label', 'Ingrandimento');
  zoom.hidden = true;
  const percentuale = crea(doc, 'span', 'talos-lettore__percentuale');
  percentuale.setAttribute('aria-live', 'polite');
  zoom.append(
    bottoneIcona(doc, 'i-minus', 'Riduci', () => cambiaZoom(-1)),
    percentuale,
    bottoneIcona(doc, 'i-plus', 'Ingrandisci', () => cambiaZoom(1)),
    bottoneIcona(doc, 'i-fit', 'Adatta alla finestra', () => { stato.zoom = 'adatta'; applicaZoom(); }),
  );
  const schermo = bottoneIcona(doc, 'i-layout', opzioni.schermoIntero ? 'Esci dallo schermo intero' : 'Schermo intero', () => opzioni.onSchermoIntero?.());
  schermo.setAttribute('aria-pressed', String(Boolean(opzioni.schermoIntero)));
  if (typeof opzioni.onSchermoIntero !== 'function') schermo.hidden = true;
  const altro = bottoneIcona(doc, 'i-more', 'Altre azioni sul file', (e) => apriMenu(e.currentTarget));
  altro.setAttribute('aria-haspopup', 'menu');
  const chiudi = bottoneIcona(doc, 'i-x', 'Chiudi il lettore', () => opzioni.onChiudi?.());
  if (typeof opzioni.onChiudi !== 'function') chiudi.hidden = true;
  comandi.append(zoom, schermo, altro, chiudi);
  testata.append(iconaTipoNodo, titoli, comandi);

  const riga = crea(doc, 'div', 'talos-lettore__riga');
  riga.append(modi);
  const avviso = crea(doc, 'p', 'talos-lettore__avviso');
  avviso.setAttribute('role', 'status');
  avviso.hidden = true;
  const corpo = crea(doc, 'div', 'talos-lettore__corpo');
  corpo.id = `${radiceId}-corpo`;
  corpo.setAttribute('role', 'region');
  corpo.setAttribute('aria-label', `Contenuto di ${nome}`);
  corpo.tabIndex = 0;
  radice.append(testata, riga, avviso, corpo);
  corpo.append(crea(doc, 'p', 'talos-muted talos-lettore__attesa', 'Leggo il file…'));

  /* ---- il menu «⋯» e il tasto destro ---- */
  const menu = creaMenuContestuale(doc.body ?? radice, { id: `${radiceId}-menu`, etichetta: `Azioni su ${nome}` });
  let chiusuraMenu = null;
  function chiudiMenu() {
    menu.hidden = true;
    chiusuraMenu?.();
    chiusuraMenu = null;
  }
  function vociMenu() {
    const voci = [];
    if (typeof stato.testo === 'string') voci.push(['Copia il testo', () => opzioni.copia?.(stato.testo), typeof opzioni.copia === 'function' && stato.testo.length > 0]);
    for (const voce of opzioni.azioni?.(leggiStato()) ?? []) voci.push(voce);
    return voci;
  }
  function apriMenu(ancora, x = null, y = null) {
    const r = ancora?.getBoundingClientRect?.();
    apriMenuContestuale(menu, { titolo: nome, voci: vociMenu(), x: x ?? (r ? r.right - 240 : 0), y: y ?? (r ? r.bottom + 4 : 0), chiudi: chiudiMenu, finestra });
    const fuori = (e) => { if (!menu.contains(e.target) && e.target !== ancora) chiudiMenu(); };
    const tasto = (e) => { if (e.key === 'Escape') { chiudiMenu(); ancora?.focus?.(); } };
    doc.addEventListener('pointerdown', fuori, true);
    doc.addEventListener('keydown', tasto, true);
    chiusuraMenu = () => { doc.removeEventListener('pointerdown', fuori, true); doc.removeEventListener('keydown', tasto, true); };
  }
  const suTastoDestro = (e) => { if (!vociMenu().length) return; e.preventDefault(); apriMenu(null, e.clientX, e.clientY); }; // niente voci: resta il menu del browser, non uno vuoto
  corpo.addEventListener('contextmenu', suTastoDestro);
  testata.addEventListener('contextmenu', suTastoDestro);

  /* ---- zoom delle immagini ---- */
  let immagine = null;
  function cambiaZoom(verso) {
    const attuale = stato.zoom === 'adatta' ? (immagine?.naturalWidth ? immagine.clientWidth / immagine.naturalWidth : 1) : stato.zoom;
    stato.zoom = prossimoZoomImmagine(attuale, verso);
    applicaZoom();
  }
  function applicaZoom() {
    if (!immagine) return;
    const adatta = stato.zoom === 'adatta';
    corpo.dataset.zoom = adatta ? 'adatta' : 'libero';
    immagine.style.width = adatta || !immagine.naturalWidth ? '' : `${Math.round(immagine.naturalWidth * stato.zoom)}px`;
    percentuale.textContent = adatta ? 'Adatta' : `${Math.round(stato.zoom * 100)}%`;
  }

  /* ---- le viste ---- */
  function disegnaModi() {
    const elenco = modiDelTipo(stato.tipo, stato.estensione);
    modi.replaceChildren();
    modi.hidden = elenco.length < 2 || !['pronto'].includes(stato.fase);
    if (!elenco.includes(stato.modo)) stato.modo = elenco[0];
    for (const modo of elenco) {
      const b = crea(doc, 'button', '', PAROLE_MODO[modo]);
      b.type = 'button';
      b.id = `${radiceId}-${modo}`;
      b.dataset.modo = modo;
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-controls', corpo.id);
      b.setAttribute('aria-selected', String(modo === stato.modo));
      b.tabIndex = modo === stato.modo ? 0 : -1;
      modi.append(b);
    }
    if (!modi.hidden) corpo.setAttribute('aria-labelledby', `${radiceId}-${stato.modo}`);
  }
  modi.addEventListener('click', (e) => {
    const b = e.target.closest?.('[data-modo]');
    if (b && b.dataset.modo !== stato.modo) { stato.modo = b.dataset.modo; disegnaModi(); void disegna(); }
  });
  modi.addEventListener('keydown', (e) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    const elenco = modiDelTipo(stato.tipo, stato.estensione);
    const i = elenco.indexOf(stato.modo);
    const j = e.key === 'Home' ? 0 : e.key === 'End' ? elenco.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + elenco.length) % elenco.length;
    stato.modo = elenco[j];
    disegnaModi();
    modi.querySelector(`[data-modo="${stato.modo}"]`)?.focus();
    void disegna();
  });

  function leggiStato() {
    return { fase: stato.fase, tipo: stato.tipo, estensione: stato.estensione, modo: stato.modo, avviso: stato.avviso, byte: stato.byte, zoom: stato.zoom, testoDisponibile: typeof stato.testo === 'string' };
  }
  function fase(nuova) {
    stato.fase = nuova;
    radice.dataset.stato = nuova;
  }
  function aggiornaTestata() {
    iconaTipoNodo.replaceChildren(icona(doc, iconaTipo(stato.tipo)));
    radice.dataset.tipo = stato.tipo;
    const pezzi = [etichettaTipo(stato.tipo)];
    if (Number.isFinite(stato.byte)) pezzi.push(dimensioneLeggibile(stato.byte));
    meta.textContent = pezzi.join(' · ');
    avviso.hidden = !stato.avviso;
    avviso.textContent = stato.avviso ?? '';
    zoom.hidden = !(stato.fase === 'pronto' && stato.tipo === 'immagine' && stato.modo === 'resa');
    altro.hidden = vociMenu().length === 0; // un menu vuoto non si offre (un PDF in Libreria: le azioni stanno nella riga)
  }
  /** Un'immagine in `data:` (la CSP della pagina vieta `blob:` in `img-src`), letta da `FileReader` senza bloccare. */
  function urlDati(byte, tipo) {
    return new Promise((risolvi, rifiuta) => {
      const lettore = new finestra.FileReader();
      lettore.onload = () => risolvi(String(lettore.result));
      lettore.onerror = () => rifiuta(lettore.error ?? new Error('immagine illeggibile'));
      lettore.readAsDataURL(new finestra.Blob([byte], { type: tipo }));
    });
  }
  function cartaFuori(frase, dettaglio = null) {
    const box = crea(doc, 'div', 'talos-lettore__fuori');
    const p = crea(doc, 'p', '', frase);
    if (dettaglio) p.title = dettaglio; // il testo tecnico resta per chi lo cerca (passandoci sopra), non a schermo
    box.append(p);
    if (typeof opzioni.apriFuori === 'function') box.append(bottoneTesto(doc, 'Apri con l’app del sistema', () => opzioni.apriFuori()));
    return box;
  }
  /* ⛔ Una resa che fallisce si dice con parole da persona (foto 26/09 sul 4174: «Cannot read properties of null (reading
     'find')» a schermo per uno ZIP chiamato .docx). Il messaggio della libreria resta nel `title`, non nella frase. */
  const PAROLE_RESA = { documento: 'Questo documento Word', foglio: 'Questo foglio di calcolo', presentazione: 'Questa presentazione' };
  function cartaResaFallita(tipo, dettaglio) {
    const soggetto = PAROLE_RESA[tipo] ?? 'Questo file';
    return cartaFuori(`${soggetto} non si apre qui: il file è rotto o non è nel formato che il nome promette.`, dettaglio || null);
  }
  function testoMostrato() {
    const t = stato.testo ?? '';
    return t.length > CARATTERI_MOSTRATI ? t.slice(0, CARATTERI_MOSTRATI) : t;
  }
  function notaTaglio(pezzi) {
    const t = stato.testo ?? '';
    if (t.length > CARATTERI_MOSTRATI) pezzi.push(crea(doc, 'p', 'talos-lettore__nota', `Mostrati i primi ${CARATTERI_MOSTRATI.toLocaleString('it-IT')} caratteri di ${t.length.toLocaleString('it-IT')}.`));
  }
  function sorgente() {
    const testo = testoMostrato();
    const lingua = stato.tipo === 'html' ? 'markup' : linguaDi(stato.estensione);
    const blocco = typeof opzioni.bloccoCodice === 'function' ? opzioni.bloccoCodice(testo, lingua) : null;
    if (blocco) { blocco.classList?.add('talos-lettore__sorgente'); return blocco; }
    const pre = crea(doc, 'pre', 'talos-lettore__sorgente');
    const code = crea(doc, 'code', lingua ? `language-${lingua}` : '', testo);
    pre.append(code);
    return pre;
  }
  function tabella() {
    const righe = righeCsv(testoMostrato(), separatoreDi(nome));
    if (!righe.length) return [crea(doc, 'p', 'talos-muted', 'Il file non ha righe.')];
    const quante = stato.tuttaLaTabella ? righe.length : Math.min(righe.length, RIGHE_TABELLA + 1);
    const scorre = crea(doc, 'div', 'td-file-tabella-scorre talos-lettore__tabella');
    const t = crea(doc, 'table', 'td-file-tabella');
    const testa = crea(doc, 'thead');
    const tr = crea(doc, 'tr');
    for (const cella of righe[0]) { const th = crea(doc, 'th', '', cella); th.scope = 'col'; tr.append(th); }
    testa.append(tr);
    const corpoT = crea(doc, 'tbody');
    for (let i = 1; i < quante; i += 1) {
      const r = crea(doc, 'tr');
      for (const cella of righe[i]) r.append(crea(doc, 'td', '', cella));
      corpoT.append(r);
    }
    t.append(testa, corpoT);
    scorre.append(t);
    const pezzi = [scorre];
    const dati = righe.length - 1;
    if (dati > quante - 1) pezzi.push(bottoneTesto(doc, `Mostra tutte le ${dati.toLocaleString('it-IT')} righe`, () => { stato.tuttaLaTabella = true; void disegna(); }));
    return pezzi;
  }

  function smontaOffice() {
    stato.nodoOffice?.smontaTalos?.();
    stato.nodoOffice = null;
  }

  let disegnoCorrente = 0;
  async function disegna() {
    const mio = ++disegnoCorrente;
    smontaOffice();
    aggiornaTestata();
    immagine = null;
    delete corpo.dataset.zoom;
    const pezzi = [];
    const { tipo, modo } = stato;
    try {
      if (stato.fase === 'fuori') {
        pezzi.push(cartaFuori(`Il file pesa ${dimensioneLeggibile(stato.byte ?? fonte.dimensione)}: oltre ${dimensioneLeggibile(TETTO_FILE)} non si mostra qui.`));
      } else if (stato.fase === 'errore') {
        const box = crea(doc, 'div', 'talos-lettore__fuori');
        const frase = crea(doc, 'p', '', `Il file non si è aperto: ${stato.errore}`);
        frase.setAttribute('role', 'alert');
        box.append(frase, bottoneTesto(doc, 'Riprova', () => { void carica(); }));
        pezzi.push(box);
      } else if (stato.fase === 'grande') {
        const box = crea(doc, 'div', 'talos-lettore__fuori');
        box.append(crea(doc, 'p', '', `Il file pesa ${dimensioneLeggibile(stato.byte)}: oltre ${dimensioneLeggibile(TETTO_TESTO)} l’anteprima si ferma per non rallentare la finestra.`),
          bottoneTesto(doc, 'Mostra comunque', () => { stato.forzato = true; void interpreta(stato.byteGrezzi); }));
        pezzi.push(box);
      } else if (tipo === 'binario') {
        pezzi.push(cartaFuori(stato.avviso ? 'Questo file non si mostra qui.' : 'Questo formato non si mostra qui: si apre con l’app del sistema.'));
      } else if (stato.testo === '') {
        pezzi.push(crea(doc, 'p', 'talos-muted talos-lettore__attesa', 'Il file è vuoto.')); // un esito, non un guasto: lo si dice invece di un riquadro muto
      } else if (modo === 'sorgente') {
        pezzi.push(sorgente());
        notaTaglio(pezzi);
      } else if (tipo === 'markdown') {
        const prosa = crea(doc, 'div', 'talos-lettore__prosa');
        prosa.append(renderizzaMarkdown(testoMostrato(), { document: doc, bloccoCodice: opzioni.bloccoCodice }));
        pezzi.push(prosa);
        notaTaglio(pezzi);
      } else if (tipo === 'tabella') {
        pezzi.push(...tabella());
      } else if (tipo === 'immagine') {
        const img = crea(doc, 'img', 'talos-lettore__immagine');
        img.alt = nome;
        img.decoding = 'async';
        img.src = stato.urlImmagine;
        img.addEventListener('load', applicaZoom);
        immagine = img;
        pezzi.push(img);
      } else if (tipo === 'pdf') {
        if (!fonte.indirizzoPdf) {
          pezzi.push(cartaFuori('Questo PDF si apre con l’app del sistema.'));
        } else {
          // niente `sandbox` qui: lo mette la risposta stessa (CSP `sandbox allow-scripts`), e il lettore di Chromium vuole i suoi script
          const cornice = crea(doc, 'iframe', 'talos-lettore__cornice talos-lettore__cornice--pdf');
          cornice.title = `PDF: ${nome}`;
          cornice.setAttribute('referrerpolicy', 'no-referrer');
          cornice.src = fonte.indirizzoPdf;
          pezzi.push(cornice);
        }
      } else if (tipo === 'html') {
        if (typeof fonte.creaPagina !== 'function') {
          pezzi.push(cartaFuori('Questa pagina non si può rendere da qui: guarda la vista Sorgente.'));
        } else {
          // un lasciapassare NUOVO a ogni resa: scade dopo 30 minuti senza uso, e tornare alla vista dopo un'ora non deve dare un 404
          const indirizzo = await fonte.creaPagina();
          if (mio !== disegnoCorrente) return;
          const assoluto = new finestra.URL(indirizzo, finestra.location?.href ?? 'http://127.0.0.1/');
          const cartella = `${assoluto.origin}${assoluto.pathname.slice(0, assoluto.pathname.lastIndexOf('/') + 1)}`;
          const cornice = crea(doc, 'iframe', 'talos-lettore__cornice');
          cornice.title = `Pagina: ${nome}`;
          cornice.setAttribute('sandbox', 'allow-scripts');
          cornice.setAttribute('csp', politicaCornice(cartella));
          cornice.setAttribute('referrerpolicy', 'no-referrer');
          cornice.setAttribute('allow', '');
          cornice.src = assoluto.href;
          pezzi.push(cornice);
        }
      } else if (['documento', 'foglio', 'presentazione'].includes(tipo)) {
        if (typeof opzioni.lettoreOffice !== 'function') {
          pezzi.push(cartaFuori('Questo formato si apre con l’app del sistema.'));
        } else {
          pezzi.push(crea(doc, 'p', 'talos-muted talos-lettore__attesa', 'Preparo il documento…'));
          corpo.replaceChildren(...pezzi);
          const lettoreOffice = await opzioni.lettoreOffice(tipo);
          if (mio !== disegnoCorrente) return;
          /* Word e PowerPoint si rendono DENTRO la cornice ospite: se lì qualcosa va storto (un file rotto, la resa che non
             si carica) lo dice con un messaggio, e qui si mostra la stessa carta di qualunque altro errore di resa. */
          const onErrore = (messaggio) => {
            if (mio !== disegnoCorrente) return;
            smontaOffice();
            corpo.replaceChildren(cartaResaFallita(tipo, messaggio));
          };
          const nodo = await lettoreOffice.rendi({ doc, finestra, byte: stato.byteGrezzi, nome, tipo, onErrore });
          if (mio !== disegnoCorrente) { nodo?.smontaTalos?.(); return; }
          stato.nodoOffice = nodo;
          pezzi.length = 0;
          pezzi.push(nodo);
        }
      }
    } catch (errore) {
      if (mio !== disegnoCorrente) return;
      pezzi.length = 0;
      pezzi.push(cartaResaFallita(tipo, errore?.message));
    }
    if (mio !== disegnoCorrente) return;
    corpo.replaceChildren(...pezzi);
    aggiornaTestata();
  }

  async function carica() {
    fase('caricando');
    stato.errore = null;
    corpo.replaceChildren(crea(doc, 'p', 'talos-muted talos-lettore__attesa', 'Leggo il file…'));
    meta.textContent = 'Leggo il file…';
    if (decidiLettura(fonte.dimensione) === 'fuori') {
      stato.byte = fonte.dimensione;
      fase('fuori');
      return disegna();
    }
    let buffer;
    try {
      buffer = await fonte.leggiByte();
    } catch (errore) {
      stato.errore = errore?.message || 'motivo non registrato';
      fase('errore');
      return disegna();
    }
    return interpreta(buffer);
  }

  /** I byte letti: tipo, avviso, tetti, e ciò che ogni resa si prepara (testo decodificato, URL `blob:`). */
  async function interpreta(buffer) {
    const byte = new Uint8Array(buffer);
    stato.byte = byte.byteLength;
    stato.byteGrezzi = buffer;
    stato.testo = null;
    const esito = tipoDelFile({ nome, byte: byte.subarray(0, 8192) });
    stato.tipo = esito.tipo;
    stato.estensione = esito.estensione;
    stato.avviso = esito.avviso ?? (esito.macro ? 'Il file contiene macro: qui si mostra solo il contenuto, le macro non si eseguono.' : null);
    if (byte.byteLength > TETTO_FILE) { fase('fuori'); return disegna(); }
    const testuale = ['markdown', 'tabella', 'testo', 'html'].includes(stato.tipo) || (stato.tipo === 'immagine' && stato.estensione === 'svg');
    if (testuale) {
      if (byte.byteLength > TETTO_TESTO && !stato.forzato) { fase('grande'); return disegna(); }
      stato.testo = new TextDecoder('utf-8').decode(byte); // `fatal:false`: una riga sporca si legge lo stesso, e si VEDE
    }
    if (stato.tipo === 'immagine') stato.urlImmagine = await urlDati(buffer, mimeImmagine(esito.firma, stato.estensione));
    fase('pronto');
    disegnaModi();
    return disegna();
  }

  aggiornaTestata();
  void carica();

  return {
    elemento: radice,
    stato: leggiStato,
    ricarica: () => carica(),
    /** Il lettore passa dal rail allo schermo intero (o torna): cambia il comando, non il contenuto. */
    impostaSchermoIntero(attivo) {
      schermo.setAttribute('aria-pressed', String(Boolean(attivo)));
      schermo.setAttribute('aria-label', attivo ? 'Esci dallo schermo intero' : 'Schermo intero');
      schermo.title = attivo ? 'Esci dallo schermo intero' : 'Schermo intero';
      radice.dataset.schermoIntero = attivo ? 'si' : 'no';
    },
    distruggi() {
      disegnoCorrente += 1;
      chiudiMenu();
      menu.remove();
      smontaOffice();
      radice.remove();
    },
  };
}

