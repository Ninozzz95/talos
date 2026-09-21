/**
 * IL CONTENUTO DI UN FILE DELLA LIBRERIA, DENTRO IL DETTAGLIO.
 *
 * ⛔⛔ 11/09/2026, foto dell'owner sul 4174: il dettaglio della Libreria diceva il nome del file,
 *   tre metadati e «Azioni sul file» — e del FILE non mostrava niente. Owner: «il file non viene
 *   visualizzato come nel mockup, sia renderizzato che in versione testuale».
 *   Il mockup interattivo (`Talos_Desktop_Final_Mockup_Interattivo.html`) lo fa in due punti:
 *     · riga 6078 — il dettaglio: `<h3>Contenuto locale</h3><pre class="td-code">…</pre>`, cioè il
 *       testo grezzo del file;
 *     · riga 6309 (`fileCover`) — la copertina della scheda: una RESA per tipo, tabella per il CSV
 *       e titolo + corpo per il Markdown.
 *   Sono i due modi che l'owner nomina. Qui stanno l'uno accanto all'altro, su un interruttore.
 *
 * ⛔ NESSUN SECONDO MOTORE MARKDOWN. Il render è quello della chat, iniettato come `rendiMarkdown`
 *   esattamente come fa il dettaglio della Ricerca: si passa per `prosaInNodi` di
 *   `ricerca-dettaglio.js`, che con l'iniezione usa quello della chat e senza cade su una lettura
 *   strutturale minima. Un secondo motore sarebbe una seconda cosa da tenere allineata alla prima.
 *
 * ⛔ NIENTE FINZIONI SUI BINARI. Il server NON sa estrarre testo da un PDF o da un DOCX: in
 *   `harness-ui/src/` ci sono i GENERATORI (`document-generator.mjs`: docx, pdf-lib, pdfmake,
 *   xlsx) e nessun lettore — verificato l'11/09/2026 con
 *   `grep -n "estraiTesto\|mammoth\|pdf-parse\|pdfjs" harness-ui/src/*.mjs`, zero risultati.
 *   Quindi per quei formati non si mostra un'anteprima finta e non si stampano i byte come testo:
 *   si dice che cosa si può fare e si offre l'azione che lo fa davvero («Apri», la rotta POST
 *   `/library/:voceId/apri` che esiste dal 10/09).
 *
 * ⛔ E NON SI INCORNICIA LA ROTTA DEI BYTE. `GET /library/:voceId/file` (http-app.mjs:2023-2062)
 *   manda `Content-Type: application/octet-stream`, `Content-Disposition: attachment` e
 *   `Content-Security-Policy: default-src 'none'; sandbox`. Un `<iframe>` su quell'indirizzo non
 *   mostrerebbe un PDF: lo SCARICHEREBBE — «attachment (indicating it should be downloaded; most
 *   browsers presenting a "Save as" dialog)», MDN, `Content-Disposition`, letta l'11/09/2026 — e
 *   anche con l'intestazione giusta un `sandbox` senza valore «prevents the execution of plugins»
 *   (MDN, CSP `sandbox`, letta l'11/09/2026), cioè spegne il lettore PDF del browser. La riga di
 *   server che servirebbe sta nel rapporto del lotto, non qui: questa finestra dice la verità su
 *   quello che oggi può.
 */

import { prosaInNodi } from './ricerca-dettaglio.js';
import { testiVoceLibreria, indirizzoFileLibreria } from './libreria.js';

/* --------------------------------------------------------------------------- i formati */

const MARKDOWN = new Set(['md', 'markdown', 'mdown', 'mkd']);
const TABELLA = new Set(['csv', 'tsv']);
const TESTO = new Set([
  'txt', 'text', 'json', 'jsonl', 'ndjson', 'html', 'htm', 'xml', 'svg', 'yml', 'yaml', 'toml',
  'ini', 'cfg', 'conf', 'log', 'csslog', 'css', 'scss', 'js', 'mjs', 'cjs', 'jsx', 'ts', 'tsx',
  'py', 'rb', 'go', 'rs', 'java', 'kt', 'c', 'h', 'cpp', 'hpp', 'cs', 'php', 'sh', 'bash', 'zsh',
  'bat', 'cmd', 'ps1', 'sql', 'env', 'patch', 'diff', 'gitignore', 'properties', 'srt', 'vtt',
]);

/**
 * Che cosa sappiamo fare con questo file, dal suo nome.
 *
 * ⛔ Un file SENZA estensione vale `binario`, non `testo`: stampare byte ignoti dentro un `<pre>`
 *   riempie il pannello di caratteri di sostituzione e non si capisce che è andata male — è la
 *   riga onesta e inservibile `[binary docx file, 7714 bytes]` in un'altra forma.
 */
export function formatoFile(nome) {
  const intero = String(nome ?? '').trim().toLowerCase();
  const pezzo = intero.split('.').pop();
  if (!pezzo || pezzo === intero) return 'binario';
  if (MARKDOWN.has(pezzo)) return 'markdown';
  if (TABELLA.has(pezzo)) return 'tabella';
  if (TESTO.has(pezzo)) return 'testo';
  return 'binario';
}

/**
 * I modi che questo formato ha DAVVERO.
 *
 * ⛔ Un interruttore con una scelta sola non è un interruttore: su un `.json` o un `.txt` la resa
 *   e il testo sarebbero lo stesso blocco monospazio due volte, quindi il modo è uno e la striscia
 *   non compare — è la stessa regola che in `sezione-elenco-dettaglio.js` nasconde la riga dei
 *   filtri quando il filtro è uno solo.
 * ⛔ Su un binario i modi restano DUE e non dicono la stessa cosa: «Anteprima» parla di come si
 *   guarda il file, «Testo» parla di estrarne le parole. Sono due assenze diverse, con due ragioni
 *   diverse, e appiattirle in una sola frase toglierebbe a chi legge il perché.
 */
export function modiFile(formato) {
  return formato === 'testo' ? ['testo'] : ['anteprima', 'testo'];
}

const PAROLE_MODO = new Map([['anteprima', 'Anteprima'], ['testo', 'Testo']]);

/** Il formato ha bisogno dei byte? Su un binario non si chiede niente al server. */
export function serveLettura(formato) {
  return formato !== 'binario';
}

/* ------------------------------------------------------------------------ misure e numeri */

const MASSIMO_CARATTERI = 400_000;

/** «12,4 kB» — la taglia del file letta sui byte veri, non sui caratteri. */
export function dimensioneLeggibile(byte) {
  const n = Number(byte);
  if (!Number.isFinite(n) || n < 0) return '';
  if (n < 1024) return `${n.toLocaleString('it-IT')} byte`;
  const kb = n / 1024;
  if (kb < 1024) return `${kb.toLocaleString('it-IT', { maximumFractionDigits: 1 })} kB`;
  return `${(kb / 1024).toLocaleString('it-IT', { maximumFractionDigits: 1 })} MB`;
}

/** Quante righe ha il testo. Un file che finisce con un a capo non ha una riga vuota in più. */
export function conteggioRighe(testo) {
  const t = String(testo ?? '');
  if (!t) return 0;
  const righe = t.split('\n');
  if (righe.length > 1 && righe[righe.length - 1] === '') righe.pop();
  return righe.length;
}

/**
 * Il CSV in righe e celle, nella forma di RFC 4180: virgolette doppie per proteggere separatore e
 * a capo, virgolette raddoppiate per una virgoletta letterale.
 *
 * ⛔ Scritto a mano e non con `split(',')`: una cella «Rossi, Mario» spezzerebbe la riga in due e
 *   la tabella mostrerebbe colonne sfalsate — cioè un dato SBAGLIATO con l'aria di essere giusto.
 */
export function righeCsv(testo, separatore = ',') {
  const t = String(testo ?? '');
  const righe = [];
  let riga = [];
  let cella = '';
  let dentroVirgolette = false;
  let vuota = true;
  const chiudiCella = () => { riga.push(cella); cella = ''; };
  const chiudiRiga = () => { chiudiCella(); righe.push(riga); riga = []; vuota = true; };
  for (let i = 0; i < t.length; i += 1) {
    const c = t[i];
    if (dentroVirgolette) {
      if (c === '"') {
        if (t[i + 1] === '"') { cella += '"'; i += 1; } else dentroVirgolette = false;
      } else cella += c;
      vuota = false;
      continue;
    }
    if (c === '"') { dentroVirgolette = true; vuota = false; continue; }
    if (c === separatore) { chiudiCella(); vuota = false; continue; }
    if (c === '\r') continue; // CRLF: l'a capo lo decide il \n che segue
    if (c === '\n') { chiudiRiga(); continue; }
    cella += c;
    vuota = false;
  }
  // L'ultima riga conta solo se ha qualcosa: un file che finisce con un a capo non ha una riga in più.
  if (!vuota || cella) chiudiRiga();
  return righe;
}

/**
 * «31 righe», o «30 righe di dati» se il file è una tabella.
 *
 * ⛔ VISTO NELLA FOTO (csv, scuro, 1440): il bottone diceva «Mostra tutte le 30 righe» e la misura
 *   sotto diceva «31 righe». Tutte e due vere — una conta i DATI, l'altra le righe del file — e
 *   insieme sembravano un errore di conteggio. Su una tabella la riga d'intestazione non è un dato,
 *   e la parola lo dice.
 */
export function frasiRighe(formato, testo) {
  const righe = conteggioRighe(testo);
  if (formato !== 'tabella') return `${righe.toLocaleString('it-IT')} righe`;
  return `${Math.max(righe - 1, 0).toLocaleString('it-IT')} righe di dati`;
}

/** Il separatore lo dice il nome: un `.tsv` è separato da tabulazioni, non da virgole. */
export function separatoreDi(nome) {
  return String(nome ?? '').toLowerCase().endsWith('.tsv') ? '\t' : ',';
}

/* -------------------------------------------------------------------------- il magazzino */

const MAGAZZINI = new WeakMap();

/**
 * Quello che questa schermata ha già letto: i file, il modo scelto per ognuno, le tabelle aperte
 * per intero. Per SCHERMO, come `magazzinoRicerche`: `montaSezione` ricostruisce il dettaglio a
 * ogni ridisegno, e uno stato tenuto nel nodo morirebbe con lui.
 */
export function magazzinoFileLibreria(schermo) {
  let magazzino = MAGAZZINI.get(schermo);
  if (!magazzino) {
    magazzino = { file: new Map(), modi: new Map(), tabelleAperte: new Set(), modoUltimo: null };
    MAGAZZINI.set(schermo, magazzino);
  }
  return magazzino;
}

/* --------------------------------------------------------------------- costruzione DOM */

function nodo(doc, tag, classe, testo) {
  const el = doc.createElement(tag);
  if (classe) el.className = classe;
  if (testo !== undefined && testo !== null) el.textContent = String(testo);
  return el;
}

function bottone(doc, testo, esegui, variante = 'secondary') {
  const b = nodo(doc, 'button', `talos-button talos-button--${variante} talos-button--sm`, testo);
  b.type = 'button';
  b.addEventListener('click', esegui);
  return b;
}

const RIGHE_MOSTRATE = 30;
let contatore = 0;

/* ----------------------------------------------------------------- il contenuto di un modo */

/**
 * La carta di un formato che questa finestra non sa aprire: dice la cosa che si può fare, e la fa.
 *
 * ⛔ UNA azione sola. Le altre cinque (scarica, rinomina, elimina, mostra nella cartella, apri)
 *   stanno nel menu «⋯» della riga qui sotto e nel tasto destro: ripeterne una qui è la stessa
 *   doppia manutenzione che il dettaglio evita ospitando la riga vera invece di rifarla.
 */
function cartaEsterna(doc, frase, { voce, opzioni }) {
  const box = nodo(doc, 'div', 'td-file-esterno');
  box.append(nodo(doc, 'p', '', frase));
  if (typeof opzioni?.onApri === 'function') {
    box.append(bottone(doc, 'Apri con l’app del sistema', () => opzioni.onApri(voce)));
  }
  return box;
}

/**
 * Quante colonne restano fuori a destra, e come dirlo.
 *
 * ⛔ Si misura, non si indovina: quante colonne escono dipende dalla larghezza del PANNELLO, che il
 *   divisorio cambia a mano in qualunque momento. Quindi `ResizeObserver` (il pannello che si
 *   stringe) più l'evento `scroll` (chi si è già spostato): la frase e la sfumatura dicono sempre
 *   lo stato di adesso, e quando non c'è più niente a destra spariscono tutte e due.
 * ⛔ Si misura coi rettangoli veri e non con `offsetLeft`: `offsetLeft` è relativo all'antenato
 *   posizionato, che qui non è detto sia il riquadro che scorre.
 * ⛔ Tutto in guardia: nel DOM finto dei test non esistono né `ResizeObserver` né
 *   `getBoundingClientRect`, e una sonda che fa cadere una prova non prova niente.
 */
/**
 * Quante colonne sforano il bordo destro, e la frase che lo dice.
 *
 * ⛔ Separata dal DOM di proposito: è la sola parte che può SBAGLIARE (un fuori-di-uno qui vuol
 *   dire «scorri» su una tabella che sta tutta dentro), e così un test la morde senza dover
 *   costruire un browser finto.
 */
export function colonneFuori(bordoDestro, destreDelleColonne) {
  return (Array.isArray(destreDelleColonne) ? destreDelleColonne : []).filter((x) => x > bordoDestro + 1).length;
}

export function fraseScorrimento(quante) {
  if (!quante) return '';
  return quante === 1
    ? 'Scorri a destra per l’altra colonna.'
    : `Scorri a destra per le altre ${quante.toLocaleString('it-IT')} colonne.`;
}

function collegaScorrimento(scorre, tabella, avviso) {
  if (typeof scorre?.addEventListener !== 'function' || typeof scorre.getBoundingClientRect !== 'function') return null;
  let osservatore = null;
  const celle = () => (tabella.querySelectorAll ? [...tabella.querySelectorAll('thead th')] : []);
  const aggiorna = () => {
    // ⛔ Il pannello si ridisegna a ogni giro: senza questo l'osservatore sopravvive al suo nodo.
    if (scorre.isConnected === false) { osservatore?.disconnect?.(); return; }
    const bordo = scorre.getBoundingClientRect().right;
    const fuori = colonneFuori(bordo, celle().map((c) => c.getBoundingClientRect().right));
    scorre.dataset.scorre = fuori ? 'si' : 'no';
    avviso.hidden = fuori === 0;
    avviso.textContent = fraseScorrimento(fuori);
  };
  scorre.addEventListener('scroll', aggiorna, { passive: true });
  if (typeof globalThis.ResizeObserver === 'function') {
    osservatore = new globalThis.ResizeObserver(aggiorna);
    osservatore.observe(scorre);
  } else if (typeof globalThis.requestAnimationFrame === 'function') {
    globalThis.requestAnimationFrame(aggiorna);
  }
  return aggiorna;
}

function tabellaCsv(doc, testo, { nome, magazzino, chiave, ridisegna }) {
  const righe = righeCsv(testo, separatoreDi(nome));
  const pezzi = [];
  if (!righe.length) {
    pezzi.push(nodo(doc, 'p', 'td-subtle', 'Il file non ha righe.'));
    return pezzi;
  }
  const tutte = magazzino.tabelleAperte.has(chiave);
  const quante = tutte ? righe.length : Math.min(righe.length, RIGHE_MOSTRATE);
  const scorre = nodo(doc, 'div', 'td-file-tabella-scorre');
  scorre.tabIndex = 0;
  scorre.setAttribute('role', 'region');
  scorre.setAttribute('aria-label', `Contenuto di ${nome}`);
  const tabella = nodo(doc, 'table', 'td-file-tabella');
  const testa = nodo(doc, 'thead');
  const rigaTesta = nodo(doc, 'tr');
  for (const cella of righe[0]) {
    const th = nodo(doc, 'th', '', cella);
    th.scope = 'col';
    rigaTesta.append(th);
  }
  testa.append(rigaTesta);
  const corpo = nodo(doc, 'tbody');
  for (let i = 1; i < quante; i += 1) {
    const tr = nodo(doc, 'tr');
    for (const cella of righe[i]) tr.append(nodo(doc, 'td', '', cella));
    corpo.append(tr);
  }
  tabella.append(testa, corpo);
  scorre.append(tabella);
  pezzi.push(scorre);
  /*
   * ⛔ VISTO NELLA FOTO (csv, scuro, 1440): a 415 px di dettaglio le ultime colonne uscivano dal
   *   riquadro e NIENTE lo diceva — la tabella si poteva scorrere, ma sembrava tagliata. La
   *   sfumatura sul bordo la disegna il CSS (`.td-file-tabella-scorre`); qui si conta quante
   *   colonne restano fuori DAVVERO, perché «scorri a destra» quando non c'è niente a destra è
   *   una promessa vuota come quella che questo pannello è nato per togliere.
   */
  const avviso = nodo(doc, 'p', 'td-file-scorri');
  avviso.hidden = true;
  avviso.setAttribute('role', 'status');
  pezzi.push(avviso);
  collegaScorrimento(scorre, tabella, avviso);
  /* ⛔ La prima riga è l'INTESTAZIONE: «30 righe su 214» conterebbe una riga che non è un dato. */
  const dati = Math.max(righe.length - 1, 0);
  const mostrati = Math.max(quante - 1, 0);
  if (dati > mostrati) {
    const apri = bottone(doc, `Mostra tutte le ${dati.toLocaleString('it-IT')} righe`, () => {
      magazzino.tabelleAperte.add(chiave);
      ridisegna?.();
    });
    pezzi.push(apri);
  }
  return pezzi;
}

/**
 * Che cosa sta nel pannello, per modo.
 * Torna sempre un array di nodi: chi chiama non deve sapere quale ramo ha vinto.
 */
export function contenutoModoFile(doc, modo, contesto) {
  const { voce, nome, formato, lettura, opzioni, magazzino, ridisegna } = contesto;
  const chiave = String(voce?.id ?? '');

  if (formato === 'binario') {
    /* ⛔ Le due frasi dicono due cose diverse, e nessuna delle due è una scusa: la prima è su come
       si GUARDA il file, la seconda è su estrarne le PAROLE. Chi legge deve poter capire perché. */
    const frase = modo === 'anteprima'
      ? 'Questo formato si apre con l’app del sistema: TALOS non lo disegna in questa finestra.'
      : 'Il testo di questo formato non si estrae: TALOS sa creare PDF, DOCX e fogli di calcolo, non rileggerne le parole. Il file si apre con l’app del sistema.';
    return [cartaEsterna(doc, frase, { voce, opzioni })];
  }

  if (typeof opzioni?.leggiFile !== 'function') {
    return [nodo(doc, 'p', 'td-subtle', 'Il contenuto non è leggibile da questa finestra: manca la sessione a cui il file appartiene.')];
  }
  if (!lettura || lettura.stato === 'caricando') {
    return [nodo(doc, 'p', 'td-subtle', 'Leggo il file…')];
  }
  if (lettura.stato === 'errore') {
    const box = nodo(doc, 'div', 'td-file-esterno');
    const riga = nodo(doc, 'p', '', `Il file non si è aperto: ${lettura.errore}`);
    riga.setAttribute('role', 'alert');
    box.append(riga);
    if (typeof opzioni?.onApri === 'function') box.append(bottone(doc, 'Apri con l’app del sistema', () => opzioni.onApri(voce)));
    return [box];
  }

  const testo = lettura.testo || '';
  const tagliato = testo.length > MASSIMO_CARATTERI;
  const mostrato = tagliato ? testo.slice(0, MASSIMO_CARATTERI) : testo;
  const pezzi = [];

  if (modo === 'anteprima' && formato === 'markdown') {
    pezzi.push(prosaInNodi(doc, mostrato, opzioni?.rendiMarkdown));
  } else if (modo === 'anteprima' && formato === 'tabella') {
    pezzi.push(...tabellaCsv(doc, mostrato, { nome, magazzino, chiave, ridisegna }));
  } else {
    const pre = nodo(doc, 'pre', 'td-code td-file-testo', mostrato);
    pre.tabIndex = 0;
    pre.setAttribute('role', 'region');
    pre.setAttribute('aria-label', `Testo di ${nome}`);
    pezzi.push(pre);
  }

  if (tagliato) {
    pezzi.push(nodo(doc, 'p', 'td-subtle', `Mostrati i primi ${MASSIMO_CARATTERI.toLocaleString('it-IT')} caratteri di ${testo.length.toLocaleString('it-IT')}. Il file intero si apre con l’app del sistema.`));
  }
  pezzi.push(nodo(doc, 'p', 'td-file-misura', `${frasiRighe(formato, testo)} · ${dimensioneLeggibile(lettura.byte)}`));
  return pezzi;
}

/* ------------------------------------------------------------------------ il montaggio */

/**
 * L'interruttore e il pannello, da infilare nel dettaglio SOPRA le azioni.
 *
 * ⛔ `role="tablist"`, non `role="radiogroup"`: sono due viste dello STESSO pannello, che è
 *   esattamente il caso del pattern Tabs delle APG del W3C (letto l'11/09/2026 —
 *   `tablist`/`tab`/`tabpanel`, `aria-selected`, `aria-controls`, `aria-labelledby`, un solo stop
 *   del Tab sulla striscia e attivazione automatica con le frecce «as long as their associated tab
 *   panels are displayed without noticeable latency»). Un `radiogroup` sceglie un VALORE dentro un
 *   modulo. E il dettaglio della Ricerca, che sta due sezioni più in là e fa la stessa identica
 *   cosa con cinque viste, usa già `tablist`: due grammatiche per lo stesso gesto nella stessa
 *   colonna sarebbero due cose da imparare invece di una.
 */
export function montaAnteprimaFile(voce, ctx) {
  const doc = ctx.doc;
  const magazzino = ctx.magazzino;
  const opzioni = ctx.opzioni || {};
  const nome = testiVoceLibreria(voce).nome;
  const formato = formatoFile(nome);
  const chiave = String(voce?.id ?? '');
  const lettura = chiave ? magazzino.file.get(chiave) || null : null;
  const modi = modiFile(formato);
  const pezzi = [];

  /* ⛔ «Contenuto del file» e non «Contenuto locale» come il mockup: lì «locale» distingueva i dati
     della demo da una rete che non c'era, qui ogni file È sul disco del progetto e la parola non
     distinguerebbe niente. Il titolo fa il paio con «Azioni sul file», che gli sta sotto. */
  pezzi.push(nodo(doc, 'h3', '', 'Contenuto del file'));

  contatore += 1;
  const radice = `td-file-${contatore}`;
  const pannello = nodo(doc, 'div', 'td-vista td-file-vista');
  pannello.id = `${radice}-pannello`;
  pannello.setAttribute('role', 'tabpanel');
  pannello.tabIndex = 0;

  let scelto = magazzino.modi.get(chiave) || magazzino.modoUltimo;
  /* ⛔ Il modo ricordato vale solo se questo file ce l'ha: chi ha scelto «Testo» su un Markdown e
     poi apre un PDF non deve trovarsi davanti l'unica schermata che dice «non disponibile». */
  if (!modi.includes(scelto)) scelto = modi[0];

  let schede = [];
  let lista = null;
  if (modi.length > 1) {
    lista = nodo(doc, 'div', 'td-segment td-viste td-file-modi');
    lista.setAttribute('role', 'tablist');
    lista.setAttribute('aria-label', `Come guardare ${nome}`);
    schede = modi.map((modo) => {
      const b = nodo(doc, 'button', '', PAROLE_MODO.get(modo));
      b.type = 'button';
      b.id = `${radice}-${modo}`;
      b.dataset.modo = modo;
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-controls', pannello.id);
      lista.append(b);
      return b;
    });
  }

  function mostra(modo, muoviIlFuoco = false) {
    if (chiave) magazzino.modi.set(chiave, modo);
    magazzino.modoUltimo = modo;
    for (const b of schede) {
      const attiva = b.dataset.modo === modo;
      b.setAttribute('aria-selected', String(attiva));
      b.tabIndex = attiva ? 0 : -1; // un solo stop del Tab su tutta la striscia
      if (attiva && muoviIlFuoco) b.focus({ preventScroll: true });
    }
    if (schede.length) pannello.setAttribute('aria-labelledby', `${radice}-${modo}`);
    else pannello.setAttribute('aria-label', `Contenuto di ${nome}`);
    pannello.replaceChildren(...contenutoModoFile(doc, modo, {
      voce, nome, formato, lettura, opzioni, magazzino, ridisegna: ctx.ridisegna,
    }).filter(Boolean));
  }

  if (lista) {
    lista.addEventListener('click', (e) => {
      const b = e.target.closest?.('[data-modo]');
      if (b) mostra(b.dataset.modo);
    });
    lista.addEventListener('keydown', (e) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
      e.preventDefault();
      const attuale = schede.findIndex((b) => b.getAttribute('aria-selected') === 'true');
      const prossima = e.key === 'Home' ? 0
        : e.key === 'End' ? schede.length - 1
          : (attuale + (e.key === 'ArrowRight' ? 1 : -1) + schede.length) % schede.length;
      mostra(schede[prossima].dataset.modo, true);
    });
    pezzi.push(lista);
  }
  mostra(scelto);
  pezzi.push(pannello);

  /* ---- la lettura parte qui, una volta sola per file ---- */
  if (serveLettura(formato) && chiave && !lettura && typeof opzioni.leggiFile === 'function') {
    magazzino.file.set(chiave, { stato: 'caricando' });
    Promise.resolve()
      .then(() => opzioni.leggiFile(voce))
      .then((letto) => {
        /* Chi legge può dire i BYTE veri (`{testo, byte}`): senza, si contano quelli del testo. */
        const testo = typeof letto === 'string' ? letto : String(letto?.testo ?? '');
        const byte = Number.isFinite(letto?.byte) ? letto.byte : new TextEncoder().encode(testo).length;
        magazzino.file.set(chiave, { stato: 'pronto', testo, byte });
      })
      .catch((errore) => {
        magazzino.file.set(chiave, { stato: 'errore', errore: errore?.message || 'motivo non registrato' });
      })
      .then(() => ctx.ridisegna?.());
  }
  return pezzi;
}

/**
 * Il lettore predefinito: la rotta che ESISTE GIÀ, `GET /library/:voceId/file`.
 *
 * ⛔ Nessuna rotta nuova e nessun secondo modo di leggere lo stesso file — è la stessa scelta del
 *   rapporto della Ricerca. `attachment` riguarda la NAVIGAZIONE, non una `fetch`: qui i byte
 *   arrivano e basta. Chi vuole leggerli in un altro modo (un test, il laboratorio) passa
 *   `leggiFile` e vince.
 */
export function lettoreFileLibreria(sessionId, rete = globalThis.fetch) {
  if (!sessionId || typeof rete !== 'function') return null;
  return async (voce) => {
    const indirizzo = indirizzoFileLibreria(sessionId, voce?.id);
    if (!indirizzo) throw new Error('questo file non ha un indirizzo');
    const risposta = await rete(indirizzo);
    if (!risposta?.ok) throw new Error(`il server ha risposto HTTP ${risposta?.status ?? '—'}`);
    const buffer = await risposta.arrayBuffer();
    /* `fatal:false`: un byte non valido diventa «�» invece di far fallire tutta la lettura — un
       file di testo con una riga sporca si legge lo stesso, e si VEDE dov'è sporco. */
    return { testo: new TextDecoder('utf-8').decode(buffer), byte: buffer.byteLength };
  };
}
