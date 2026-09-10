/*
 * Conversazione — i blocchi della chat, come nel mockup.
 *
 * Quinto componente della Fase 2 (il modello per tutte le altre schermate).
 * Qui stanno le FABBRICHE dei blocchi che il monolite (`legacy/app.js`,
 * handleRealEvent e i suoi append*) monta nella conversazione a partire dagli
 * eventi veri dello stream: Turn, TurnSpine, Message (utente e TALOS),
 * ActivityBundle, ToolRow, ToolFailure, SystemNote, ApprovalCard, DiffView,
 * SignedReceipt, TouchedFiles, ArtifactCard e lo scheletro dell'attesa. Il
 * markup è quello del mockup, byte per byte; il cervello resta nel monolite.
 *
 * ⛔ Convenzione: gli elementi che il monolite continua a toccare dopo la
 * creazione (il testo che scorre, la riga di riassunto del bundle, il
 * dettaglio di un attrezzo, il piede dell'approvazione) portano ANCHE le
 * classi-gancio del monolite (`assistant-copy`, `sheet-actions`,
 * `run-activity-label`…) accanto a quelle `talos-*`: sono senza stile (il CSS
 * legacy non è caricato) e invisibili al cancello di parità, che confronta
 * solo `data-c` e `talos-*`. Così handleRealEvent non cambia.
 *
 * Ricerca 05/09/2026: separare il filo della conversazione (obiettivi e
 * risposte) dall'attività autonoma dell'agente, con gli attrezzi raggruppati
 * in un pannello richiudibile e stati aggiornabili nel tempo (AG-UI «Messages»,
 * docs.ag-ui.com/concepts/messages; una guida tecnica sullo streaming di
 * agenti; fuselabcreative.com «UI Design for AI Agents 2026»). È la forma
 * del mockup: testo di TALOS in chiaro, ActivityBundle per gli attrezzi,
 * SystemNote per gli eventi di ciclo, ApprovalCard per il consenso.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

function el(documentObj, tag, className, testo) {
  const nodo = documentObj.createElement(tag);
  if (className) nodo.className = className;
  if (testo !== undefined && testo !== null) nodo.textContent = String(testo);
  return nodo;
}

function simbolo(documentObj, classe, nome) {
  const svg = documentObj.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', classe);
  const use = documentObj.createElementNS(SVG_NS, 'use');
  use.setAttribute('href', `#${nome}`);
  svg.append(use);
  return svg;
}

/** L'ora come la scrive il mockup nella meta di un messaggio («18:04»). */
export function oraMessaggio(quando = new Date()) {
  const data = quando instanceof Date ? quando : new Date(quando);
  if (Number.isNaN(data.getTime())) return '';
  return data.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
}

/* ------------------------------------------------------------------ Turn */

/**
 * Un turno: la colonna di sinistra (spine) con i numeri dei giri e i tick,
 * e il messaggio. `numeri` = [{ n, tick, tono }], tick 1-5 (larghezza), tono
 * null | 'info' | 'warning' | 'danger' | 'current'.
 */
export function creaTurno({ numeri = [] } = {}, opzioni = {}) {
  const documentObj = opzioni.document || globalThis.document;
  const turno = el(documentObj, 'div', 'talos-turn');
  turno.setAttribute('data-c', 'Turn');
  const spine = el(documentObj, 'div', 'talos-turn-spine');
  spine.setAttribute('data-c', 'TurnSpine');
  for (const voce of numeri) aggiungiGiroAllaSpine(spine, voce);
  turno.append(spine);
  return turno;
}

/** Aggiunge un giro (numero + tick) alla spine di un turno già montato. */
export function aggiungiGiroAllaSpine(spine, { n, tick = 1, tono = null } = {}) {
  if (!spine) return;
  const documentObj = spine.ownerDocument;
  spine.append(el(documentObj, 'span', 'talos-turn-spine__n', n));
  /*
   * ⭐ 06/9, owner: «che navighi un po' come una barra di cronologia della conversazione». Il tick non è più un
   * segno muto: è un bottone che porta al suo giro. Resta identico a vedersi (stessa classe, stessa misura),
   * quindi nessuna regressione nella parità col mockup; cambia solo che si può premere, anche da tastiera.
   */
  const segno = el(documentObj, 'button', `talos-turn-spine__tick${tono ? ` talos-turn-spine__tick--${tono}` : ''}`);
  segno.type = 'button';
  segno.dataset.tick = String(Math.min(5, Math.max(1, Math.trunc(tick) || 1)));
  segno.dataset.giro = String(n ?? '');
  segno.setAttribute('aria-label', 'Vai al giro'); // il numero sta gia' accanto: l'etichetta resta uguale a quella del mockup
  segno.title = `Giro ${n ?? ''}`.trim();
  spine.append(segno);
}

/**
 * Collega la navigazione della spina: un clic su un tick porta al suo giro, e il tick del giro che si sta
 * guardando resta acceso mentre si scorre — la stessa cosa che fa una barra di cronologia della conversazione.
 * Idempotente: si può chiamare a ogni disegno.
 * @param {Element} conversazione il contenitore che scorre (`#conversation`)
 * @returns {() => void} per staccare l'osservatore
 */
export function collegaNavigazioneSpina(conversazione) {
  if (!conversazione || conversazione.dataset.spinaCollegata === 'si') return () => {};
  conversazione.dataset.spinaCollegata = 'si';
  const documentObj = conversazione.ownerDocument;
  const finestra = documentObj.defaultView || globalThis;
  conversazione.addEventListener('click', (evento) => {
    const tick = evento.target.closest?.('.talos-turn-spine__tick');
    if (!tick) return;
    const turno = tick.closest('.talos-turn');
    if (!turno) return;
    const ridotto = finestra.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    turno.scrollIntoView({ behavior: ridotto ? 'auto' : 'smooth', block: 'start' });
  });
  if (typeof finestra.IntersectionObserver !== 'function') return () => {};
  const osservatore = new finestra.IntersectionObserver((voci) => {
    for (const voce of voci) {
      const spina = voce.target.querySelector('.talos-turn-spine');
      if (!spina) continue;
      for (const t of spina.querySelectorAll('.talos-turn-spine__tick')) t.classList.toggle('talos-turn-spine__tick--visibile', voce.isIntersecting);
    }
  }, { root: conversazione, threshold: 0.35 });
  const guarda = () => { for (const turno of conversazione.querySelectorAll('.talos-turn')) osservatore.observe(turno); };
  guarda();
  const mutazioni = new finestra.MutationObserver(guarda);
  mutazioni.observe(conversazione, { childList: true, subtree: true });
  return () => { osservatore.disconnect(); mutazioni.disconnect(); delete conversazione.dataset.spinaCollegata; };
}

/** Cambia il tono dell'ULTIMO tick di una spine (es. «current» → null a giro finito, «danger» su errore). */
export function impostaTonoUltimoTick(spine, tono) {
  const ultimo = spine?.querySelector('.talos-turn-spine__tick:last-of-type');
  if (!ultimo) return;
  ultimo.className = `talos-turn-spine__tick${tono ? ` talos-turn-spine__tick--${tono}` : ''}`;
}

/* --------------------------------------------------------------- Message */

/**
 * Il messaggio della persona: testata «Tu · 18:04 · <meta>» e corpo.
 * `meta` è ciò che l'originale scriveva sotto la bolla (Task reale · id,
 * Follow-up, i permessi del giro): resta, dopo l'ora.
 */
export function creaMessaggioUtente({ testo = '', ora = '', meta = '' } = {}, opzioni = {}) {
  const documentObj = opzioni.document || globalThis.document;
  const messaggio = el(documentObj, 'div', 'talos-message talos-message--user');
  messaggio.setAttribute('data-c', 'Message');
  const testata = el(documentObj, 'div', 'talos-message__head');
  testata.append(el(documentObj, 'span', 'talos-message__who', 'Tu'), el(documentObj, 'span', 'talos-message__meta', [ora, meta].filter(Boolean).join(' · ')));
  const corpo = el(documentObj, 'div', 'talos-message__body message-bubble');
  const p = el(documentObj, 'p', null, testo);
  corpo.append(p);
  messaggio.append(testata, corpo);
  return messaggio;
}

/**
 * Il messaggio di TALOS: testata (avatar, TALOS, «modello · ora») e uno spazio
 * in cui il monolite fa scorrere il testo (`.assistant-copy`, il suo gancio).
 * I paragrafi vanno direttamente nel messaggio, come nel mockup.
 */
export function creaMessaggioTalos({ modello = '', ora = '', paragrafi = [] } = {}, opzioni = {}) {
  const documentObj = opzioni.document || globalThis.document;
  const messaggio = el(documentObj, 'div', 'talos-message');
  messaggio.setAttribute('data-c', 'Message');
  const testata = el(documentObj, 'div', 'talos-message__head');
  /* ⛔ 10/09, owner, con la foto della testata davanti: «puoi levare il logo da qui e mantenere solo
     la scritta TALOS». Il glifo era stato ingrandito e liberato dalla capsula poche ore prima, nello
     stesso giro: guardato a schermo, accanto a un nome in maiuscoletto, era rumore. Chi risponde lo
     dice il nome; che stia lavorando lo dice il segnavia. */
  testata.append(el(documentObj, 'span', 'talos-message__who talos-message__who--talos', 'TALOS'), el(documentObj, 'span', 'talos-message__meta', [modello, ora].filter(Boolean).join(' · ')));
  messaggio.append(testata);
  for (const testo of paragrafi) messaggio.append(el(documentObj, 'p', null, testo));
  return messaggio;
}

/** Le azioni sulla risposta (copia · ascolta · chiedi di nuovo), come nel mockup: si vedono al passaggio del mouse. */
export function creaAzioniMessaggio({ ascolta = true } = {}, opzioni = {}) {
  const documentObj = opzioni.document || globalThis.document;
  const gruppo = el(documentObj, 'div', 'talos-message__actions message-actions');
  gruppo.setAttribute('role', 'group');
  gruppo.setAttribute('aria-label', 'Azioni sulla risposta');
  const bottone = (nome, titolo, icona) => {
    const b = el(documentObj, 'button', 'talos-button talos-button--ghost talos-icon-button talos-button--sm');
    b.type = 'button';
    b.title = titolo;
    b.setAttribute('aria-label', titolo); // 05/09: il solo `title` è un nome di ultima risorsa (W3C APG names-and-descriptions, ARIA14)
    b.dataset.messageAction = nome;
    b.append(simbolo(documentObj, 'i i--sm', icona));
    return b;
  };
  gruppo.append(bottone('copy', 'Copia la risposta', 'i-copy'));
  if (ascolta) {
    const b = bottone('listen', 'Ascolta la risposta', 'i-play');
    b.setAttribute('aria-pressed', 'false');
    b.classList.add('assistant-listen-btn');
    gruppo.append(b);
  }
  gruppo.append(bottone('ask-again', 'Chiedi di nuovo', 'i-history'));
  return gruppo;
}

/* ------------------------------------------------------------ FileScaricabile */

/*
 * ⛔⛔ PO-05, owner: «ogni file generato deve avere un collegamento diretto per scaricarlo con un
 * clic; nome, formato, dimensione e disponibilità REALI. Un link o una scheda SENZA FILE non soddisfa
 * il requisito.»
 *
 * Prima di oggi, dopo che il modello generava un documento, in chat si leggeva
 * `[binary docx file, 7714 bytes]`: vero, e inservibile — il file era nel workspace e per averlo
 * bisognava andarselo a prendere. Qui la riga diventa una scheda con il nome vero, il formato, la
 * dimensione, e un collegamento che scarica i byte veri dalla rotta `/sessions/:id/file`.
 *
 * ⛔ I numeri non si inventano: `byte` è la dimensione MISURATA dal server sul file scritto, non una
 *   stima e non la lunghezza del testo che si vede in chat. Se manca, la riga non la scrive.
 * ⛔ La scheda è un `<a download>`: è il browser a scaricare, non noi a ricostruire il file in
 *   pagina. Così vale anche per un `.docx` da 50 MB, che in memoria non ci starebbe.
 */

/** «7.714 byte» diventa «7,5 KB». Puro: nessuna unità inventata, e 0 resta 0. */
export function dimensioneLeggibile(byte) {
  /* ⛔ `Number(null)` è 0, e 0 è una dimensione LEGITTIMA (un file vuoto esiste): senza questo
     controllo un dato ASSENTE si sarebbe letto «0 byte», cioè un numero inventato. Zero si dice solo
     quando il server ha misurato zero. */
  if (typeof byte !== 'number') return '';
  const n = byte;
  if (!Number.isFinite(n) || n < 0) return '';
  if (n < 1024) return `${n} byte`;
  const unita = ['KB', 'MB', 'GB'];
  let valore = n / 1024;
  let i = 0;
  while (valore >= 1024 && i < unita.length - 1) { valore /= 1024; i += 1; }
  return `${valore.toFixed(valore < 10 ? 1 : 0).replace('.', ',')} ${unita[i]}`;
}

/** L'indirizzo da cui si scaricano i byte veri. Vuoto se manca ciò che serve: mai un link rotto. */
export function indirizzoScarico({ sessionId, percorso } = {}) {
  if (!sessionId || !percorso) return '';
  return `/api/v1/sessions/${encodeURIComponent(sessionId)}/file?percorso=${encodeURIComponent(percorso)}`;
}

/**
 * La scheda di un file pronto da scaricare.
 * `allegato` = { nome, formato, byte } (dal server), `percorso` = dove sta nel workspace.
 */
export function creaFileScaricabile({ allegato, percorso, sessionId } = {}, opzioni = {}) {
  const d = opzioni.document || globalThis.document;
  const nome = String(allegato?.nome || percorso || '').split(/[\\/]/).pop() || 'file';
  const formato = String(allegato?.formato || nome.split('.').pop() || '').toUpperCase();
  const indirizzo = opzioni.indirizzo ?? indirizzoScarico({ sessionId, percorso });

  const scheda = el(d, 'div', 'talos-file-scaricabile');
  scheda.dataset.c = 'FileScaricabile';
  const testo = el(d, 'div', 'talos-file-scaricabile__testo');
  testo.append(el(d, 'span', 'talos-file-scaricabile__nome', nome));
  /* ⛔ Formato e dimensione stanno su una riga sola e spenta: sono il contorno, il nome è la cosa. */
  const misura = [formato, dimensioneLeggibile(allegato?.byte)].filter(Boolean).join(' · ');
  if (misura) testo.append(el(d, 'span', 'talos-file-scaricabile__misura', misura));
  scheda.append(testo);

  if (indirizzo) {
    const link = el(d, 'a', 'talos-file-scaricabile__scarica', 'Scarica');
    link.href = indirizzo;
    link.setAttribute('download', nome); // il nome resta quello vero anche se l'indirizzo non lo dice
    /* ⛔ Il nome sta già accanto: senza questo, uno screen reader annuncerebbe solo «Scarica», e in
       una chat con tre allegati i tre collegamenti sarebbero indistinguibili. */
    link.setAttribute('aria-label', `Scarica ${nome}`);
    scheda.append(link);
  } else {
    /* ⛔ Nessun indirizzo = nessun bottone che finge. «Un link o una scheda senza file non soddisfa
       il requisito»: allora si dice che non è disponibile, invece di offrire un clic che fallisce. */
    scheda.append(el(d, 'span', 'talos-file-scaricabile__assente', 'Non disponibile da qui'));
  }
  return scheda;
}

/* --------------------------------------------------------------- CodeBlock */

/*
 * ⛔⛔⛔ 09/09/2026, owner con lo screenshot: «i blocchi di codice nella chat appaiono frammentati
 * in strisce come codice inline, separati dalla barra lingua/Copia».
 *
 * Misurato in Chromium 151 sul CSS spedito, prima della cura: `.code-block` aveva background
 * `rgba(0,0,0,0)`, `border none`, `border-radius 0px` — il contenitore non c'era proprio — e il
 * `<code>` dentro il `<pre>` risultava `display:inline` con `background rgb(43,44,48)`,
 * `padding 1px 5px`, `border-radius 5px`: gli stessi identici valori del codice inline dentro un
 * paragrafo. `code.getClientRects()` restituiva **5 rettangoli per 5 righe** — le strisce della foto.
 * Quelle due cause stanno nel CSS e sono curate lì; qui sta il markup, che misurando la stessa
 * pagina ha mostrato altri tre buchi:
 *
 *  1. il `<pre>` scorreva (`scrollWidth > clientWidth`) con `tabIndex` **-1**: chi usa la tastiera
 *     non poteva raggiungere la fine di una riga lunga. La regola axe `scrollable-region-focusable`
 *     (dequeuniversity.com, letta 09/09/2026) chiede il solo `tabindex="0"`; il nome lo diamo con
 *     `role="group"` e non con `role="region"`, che è un landmark e in una chat piena di blocchi
 *     riempirebbe di voci l'elenco dei punti di riferimento;
 *  2. durante lo streaming `renderizzaMarkdownIncrementale` tiene il fence aperto nella CODA, e la
 *     coda si distrugge e si ricostruisce a ogni frame: il blocco rinasce ogni volta e con lui se ne
 *     vanno la posizione di scorrimento e la selezione di chi stava leggendo. Da qui
 *     `aggiornaBloccoCodice`, che tocca lo stesso nodo invece di rifarlo;
 *  3. il testo grezzo non era tenuto da nessuna parte, quindi dopo un aggiornamento la copia avrebbe
 *     dato una versione vecchia. Ora vive in una WeakMap accanto al blocco.
 *
 * Ricerca 09/09/2026 (regola zero): streamdown.ai/docs/code-blocks — «copy buttons automatically
 * disabled during streaming», il blocco si disegna comunque «even without the closing backticks»,
 * scorrimento orizzontale per le righe lunghe e temi distinti per chiaro e scuro; css-tricks.com
 * «Styling Code In and Out of Blocks» — `pre code{display:block; background:none; padding:0}` e
 * l'idioma `:not(pre) > code` per separare inline e blocco; prismjs/prism `src/themes/dark.css`
 * (via ctx7) — un tema Prism fissa anche `white-space:pre`, `word-break:normal`, `word-wrap:normal`,
 * `tab-size:4`, `hyphens:none`, ⛔ ma i suoi selettori sono `pre[class*="language-"]` e qui la classe
 * `language-*` sta sul `<code>`, non sul `<pre>`: un tema di serie si applicherebbe a metà, e per un
 * linguaggio non riconosciuto (dove la classe non c'è per scelta) non si applicherebbe affatto.
 *
 * ⛔ Il linguaggio NON si indovina: si scrive quello che il fence dichiara, e l'evidenziazione si
 * accende solo se quella grammatica esiste davvero. ⛔ E finché il fence è aperto non si evidenzia:
 * sarebbe rifatta a ogni frame su un testo che cambia, con sfarfallio e costo, e la copia darebbe
 * codice a metà.
 */

/** Quello che il modello scrive dopo i backtick → il nome della grammatica Prism. */
export const ALIAS_LINGUAGGIO = Object.freeze({
  js: 'javascript', jsx: 'jsx', ts: 'typescript', tsx: 'tsx', mjs: 'javascript', cjs: 'javascript',
  py: 'python', python3: 'python', sh: 'bash', shell: 'bash', zsh: 'bash', console: 'bash',
  html: 'markup', xml: 'markup', svg: 'markup', vue: 'markup', yml: 'yaml',
  'c++': 'cpp', 'c#': 'csharp', cs: 'csharp', golang: 'go', rs: 'rust', md: 'markdown',
});

/** Il nome scritto per le persone: «JavaScript», non «javascript» né la chiave interna di Prism. */
const NOMI_LINGUAGGIO = Object.freeze({
  js: 'JavaScript', jsx: 'JSX', ts: 'TypeScript', tsx: 'TSX', javascript: 'JavaScript', typescript: 'TypeScript',
  py: 'Python', python: 'Python', sh: 'Bash', bash: 'Bash', shell: 'Shell', json: 'JSON', yaml: 'YAML', yml: 'YAML',
  sql: 'SQL', html: 'HTML', xml: 'XML', css: 'CSS', rust: 'Rust', go: 'Go', java: 'Java', c: 'C', cpp: 'C++',
  'c++': 'C++', csharp: 'C#', 'c#': 'C#', markdown: 'Markdown', md: 'Markdown', vue: 'Vue', php: 'PHP',
});

/** La chiave della grammatica per Prism (`py` → `python`); stringa vuota se il fence non dichiara niente. */
export function chiaveLinguaggio(dichiarato) {
  const pulito = String(dichiarato || '').trim().toLowerCase();
  if (!pulito) return '';
  return ALIAS_LINGUAGGIO[pulito] || pulito;
}

/** Il nome da mostrare nell'intestazione: quello dichiarato dal modello, non quello interno di Prism. */
export function etichettaLinguaggio(dichiarato) {
  const pulito = String(dichiarato || '').trim();
  if (!pulito) return '';
  return NOMI_LINGUAGGIO[pulito.toLowerCase()] || pulito;
}

/**
 * Le parti vive di un blocco, per poterlo aggiornare sul posto mentre arriva.
 * WeakMap e non `dataset`: il testo del codice può essere lungo migliaia di caratteri, e un attributo
 * HTML lo scriverebbe nel DOM una seconda volta.
 */
const PARTI_DEL_BLOCCO = new WeakMap();

/** L'evidenziatore di serie: Prism se la pagina ce l'ha, altrimenti niente colore — mai un errore. */
function evidenziaConPrism(testo, chiave) {
  const grammatica = chiave && globalThis.Prism?.languages?.[chiave];
  if (!grammatica) return null;
  try {
    // `highlightElement` passa da un hook globale e da `Prism.plugins`: qui basta la funzione pura.
    return globalThis.Prism.highlight(testo, grammatica, chiave);
  } catch {
    return null; // ⛔ una grammatica che lancia non deve mangiarsi il codice: si torna al testo nudo
  }
}

const copiaDiSerie = (testo) => globalThis.navigator?.clipboard?.writeText?.(testo) ?? Promise.resolve();

/** Scrive nel `<code>` senza perdere il punto in cui la persona stava leggendo. */
function scriviCodice(parti, testo, chiuso) {
  const { pre, code, chiave, evidenzia } = parti;
  const scorrimento = pre.scrollLeft;
  const evidenziato = chiuso && chiave ? evidenzia(testo, chiave) : null;
  if (evidenziato === null || evidenziato === undefined) {
    code.textContent = testo;
    // ⛔ Niente `language-*` se non stiamo evidenziando davvero: la classe è una dichiarazione, e
    // dichiarare un linguaggio che non abbiamo colorato è lo stesso genere di bugia dell'etichetta.
    code.className = '';
  } else {
    code.innerHTML = evidenziato;
    code.className = `language-${chiave}`;
  }
  // ⛔ Riscrivere il contenuto riporta il `<pre>` a sinistra: chi stava leggendo la coda di una riga
  // lunga la perderebbe a ogni frame dello streaming.
  pre.scrollLeft = scorrimento;
}

/** Il pulsante: durante lo streaming non si copia codice a metà (Streamdown, letto 09/09/2026). */
function aggiornaBottone(bottone, chiuso) {
  bottone.disabled = !chiuso;
  bottone.textContent = chiuso ? 'Copia' : 'In arrivo…';
}

/**
 * Un blocco di codice della chat: UN contenitore, con la barra del linguaggio e «Copia» dentro, e il
 * codice sotto. `chiuso` è falso finché il fence non ha trovato i backtick di chiusura.
 */
export function creaBloccoCodice({ testo = '', linguaggio = '', chiuso = true } = {}, opzioni = {}) {
  const documentObj = opzioni.document || globalThis.document;
  const etichetta = etichettaLinguaggio(linguaggio);

  const blocco = el(documentObj, 'div', 'code-block');
  blocco.dataset.lingua = chiaveLinguaggio(linguaggio);

  const intestazione = el(documentObj, 'div', 'code-block-head');
  const nome = el(documentObj, 'span', 'code-block-lang', etichetta || 'testo');
  const bottone = el(documentObj, 'button', 'code-block-copy');
  bottone.type = 'button';
  intestazione.append(nome, bottone);

  const pre = el(documentObj, 'pre');
  pre.setAttribute('tabindex', '0');
  pre.setAttribute('role', 'group');
  pre.setAttribute('aria-label', ['Blocco di codice', etichetta].filter(Boolean).join(' '));
  const code = el(documentObj, 'code');
  pre.append(code);

  const parti = {
    pre, code, bottone, nome,
    chiave: chiaveLinguaggio(linguaggio),
    evidenzia: opzioni.evidenzia || evidenziaConPrism,
    copia: opzioni.copia || copiaDiSerie,
    testo: String(testo ?? ''),
    chiuso: Boolean(chiuso),
  };
  PARTI_DEL_BLOCCO.set(blocco, parti);

  bottone.addEventListener('click', async () => {
    if (!parti.chiuso) return;
    // ⛔ Si copia il testo GREZZO tenuto qui, non `code.textContent`: dopo l'evidenziazione quello è
    // ricostruito da span, e un ritorno a capo o un tab persi lì renderebbero il codice non incollabile.
    await parti.copia(parti.testo);
    bottone.textContent = 'Copiato';
    bottone.classList.add('is-fatto');
    const attesa = globalThis.setTimeout?.(() => { aggiornaBottone(bottone, true); bottone.classList.remove('is-fatto'); }, 1800);
    attesa?.unref?.(); // un timer che riporta un'etichetta non tiene vivo un processo (si vede nei test)
  });

  if (!parti.chiuso) blocco.classList.add('code-block-in-arrivo');
  aggiornaBottone(bottone, parti.chiuso);
  scriviCodice(parti, parti.testo, parti.chiuso);
  blocco.append(intestazione, pre);
  return blocco;
}

/**
 * Il blocco cambia SUL POSTO mentre il modello scrive. Ritorna `false` quando non c'era niente da
 * fare: a fence aperto lo stream chiama a ogni frame, e toccare il DOM per niente cancella la
 * selezione di chi sta leggendo.
 */
export function aggiornaBloccoCodice(blocco, { testo, linguaggio, chiuso } = {}) {
  const parti = PARTI_DEL_BLOCCO.get(blocco);
  if (!parti) return false;
  const nuovoTesto = testo === undefined ? parti.testo : String(testo ?? '');
  const nuovoChiuso = chiuso === undefined ? parti.chiuso : Boolean(chiuso);
  const nuovaChiave = linguaggio === undefined ? parti.chiave : chiaveLinguaggio(linguaggio);
  if (nuovoTesto === parti.testo && nuovoChiuso === parti.chiuso && nuovaChiave === parti.chiave) return false;

  if (nuovaChiave !== parti.chiave) {
    const etichetta = etichettaLinguaggio(linguaggio);
    parti.chiave = nuovaChiave;
    parti.nome.textContent = etichetta || 'testo';
    parti.pre.setAttribute('aria-label', ['Blocco di codice', etichetta].filter(Boolean).join(' '));
    blocco.dataset.lingua = nuovaChiave;
  }
  parti.testo = nuovoTesto;
  parti.chiuso = nuovoChiuso;
  if (nuovoChiuso) blocco.classList.remove('code-block-in-arrivo');
  else blocco.classList.add('code-block-in-arrivo');
  aggiornaBottone(parti.bottone, nuovoChiuso);
  scriviCodice(parti, nuovoTesto, nuovoChiuso);
  return true;
}

/* ---------------------------------------------------------- Activity/Tool */

/** Le icone dello sprite per ogni attrezzo del kernel (i nomi che riceve il modello NON cambiano: qui si sceglie solo il simbolo). */
export const ICONA_ATTREZZO = Object.freeze({
  leggi: 'i-eye', cerca: 'i-search', elenca: 'i-search', shell: 'i-terminal', prova: 'i-terminal',
  scrivi: 'i-code', naviga: 'i-globe', web_search: 'i-globe', delega_sottotask: 'i-user',
  memory_write: 'i-brain', artifact_create: 'i-doc', document_create: 'i-doc', generate_image: 'i-doc',
  time_now: 'i-clock', research_start: 'i-globe',
});

export function iconaAttrezzo(nome) {
  return ICONA_ATTREZZO[nome] || 'i-bolt';
}

/**
 * Il raggruppamento degli attrezzi di un giro. Ritorna gli elementi che il
 * monolite aggiorna: `contenitore` (le righe), `summaryText` (la frase in
 * testa), `misure` (tempo/token/diff a destra).
 */
export function creaAttivita({ riassunto = 'Attività…', id, aperto = false, tempo = null, token = null } = {}, opzioni = {}) {
  const documentObj = opzioni.document || globalThis.document;
  const card = el(documentObj, 'div', 'talos-card talos-activity');
  card.setAttribute('data-c', 'ActivityBundle');
  const idCorpo = id || `attivita-${Math.random().toString(36).slice(2, 8)}`;
  const testa = el(documentObj, 'button', 'talos-activity__head');
  testa.type = 'button';
  testa.setAttribute('aria-expanded', String(Boolean(aperto)));
  testa.setAttribute('aria-controls', idCorpo);
  testa.append(simbolo(documentObj, 'i talos-activity__chev', 'i-chev'));
  const summaryText = el(documentObj, 'span', 'talos-grow tool-note-summary-text', riassunto);
  testa.append(summaryText);
  if (tempo) testa.append(el(documentObj, 'span', 'talos-mono talos-measure', tempo));
  if (token) testa.append(el(documentObj, 'span', 'talos-mono talos-measure--estimate', token));
  const contenitore = el(documentObj, 'div', 'talos-activity__body tool-batch-items');
  contenitore.id = idCorpo;
  contenitore.hidden = !aperto;
  // Il clic lo gestisce la regia del mockup (portata in app.js): ogni `[aria-expanded][aria-controls]` è un disclosure.
  card.append(testa, contenitore);
  return { card, testa, summaryText, contenitore };
}

/** Il badge «+18 −2» nella testa di un bundle che ha scritto qualcosa. */
export function impostaDiffAttivita(testa, aggiunte, rimozioni) {
  if (!testa) return;
  const documentObj = testa.ownerDocument;
  let piu = testa.querySelector('.talos-diff-num--plus');
  let meno = testa.querySelector('.talos-diff-num--minus');
  if (!piu) { piu = el(documentObj, 'span', 'talos-diff-num talos-diff-num--plus'); testa.append(piu); }
  if (!meno) { meno = el(documentObj, 'span', 'talos-diff-num talos-diff-num--minus'); testa.append(meno); }
  piu.textContent = `+${aggiunte}`;
  meno.textContent = `−${rimozioni}`;
}

/**
 * Una riga di attrezzo: icona, nome umano, dettaglio (percorso/comando) e il
 * pallino dell'esito. `esito` = 'running' | 'success' | 'error' | null.
 * Con `conDettaglio` la riga apre/chiude un corpo (`pre`) con argomenti ed
 * esito — il dettaglio espandibile dell'originale, nel linguaggio del mockup.
 */
export function creaRigaAttrezzo({ attrezzo = '', nome = '', dettaglio = '', esito = null, conDettaglio = false, id } = {}, opzioni = {}) {
  const documentObj = opzioni.document || globalThis.document;
  const riga = el(documentObj, 'div', 'talos-tool-row');
  riga.setAttribute('data-c', 'ToolRow');
  const icona = el(documentObj, 'span', 'talos-tool-row__icon');
  icona.append(simbolo(documentObj, 'i', iconaAttrezzo(attrezzo)));
  const summaryText = el(documentObj, 'span', 'talos-tool-row__name tool-note-summary-text', nome);
  const dettaglioEl = el(documentObj, 'span', 'talos-tool-row__detail', dettaglio);
  const pallino = el(documentObj, 'span', 'talos-dot');
  riga.append(icona, summaryText, dettaglioEl, pallino);
  impostaEsitoRiga(riga, esito);
  let corpo = null;
  if (conDettaglio) {
    const idCorpo = id || `riga-${Math.random().toString(36).slice(2, 8)}`;
    riga.setAttribute('role', 'button');
    riga.tabIndex = 0;
    riga.setAttribute('aria-expanded', 'false');
    riga.setAttribute('aria-controls', idCorpo);
    corpo = el(documentObj, 'pre', 'talos-tool-row__body tool-note-detail');
    corpo.id = idCorpo;
    // Il clic lo gestisce la regia del mockup (disclosure generico); da tastiera, Invio e Spazio fanno lo stesso.
    riga.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      const era = riga.getAttribute('aria-expanded') === 'true';
      riga.setAttribute('aria-expanded', String(!era));
      corpo.hidden = era;
    });
  }
  return { riga, summaryText, dettaglio: dettaglioEl, corpo };
}

/** Il pallino della riga: in corso (live), riuscito (success), fallito (danger); null = nessun tono. */
export function impostaEsitoRiga(riga, esito) {
  const pallino = riga?.querySelector('.talos-dot');
  if (!pallino) return;
  const tono = esito === 'running' ? 'live' : esito === 'success' ? 'success' : esito === 'error' ? 'danger' : null;
  pallino.className = `talos-dot${tono ? ` talos-dot--${tono}` : ''}`;
  riga.dataset.toolState = esito === 'running' ? 'running' : esito === 'error' ? 'error' : esito === 'success' ? 'complete' : '';
  if (!riga.dataset.toolState) delete riga.dataset.toolState;
}

/** Il fallimento di un attrezzo, spiegato: titolo, testo, azioni e codice. */
export function creaFallimentoAttrezzo({ titolo = '', testo = '', codice = '', azioni = [] } = {}, opzioni = {}) {
  const documentObj = opzioni.document || globalThis.document;
  const box = el(documentObj, 'div', 'talos-tool-failure');
  box.setAttribute('data-c', 'ToolFailure');
  box.append(el(documentObj, 'div', 'talos-tool-failure__title', titolo));
  if (testo) box.append(el(documentObj, 'p', null, testo));
  const riga = el(documentObj, 'div', 'talos-tool-failure__actions');
  for (const [i, azione] of azioni.entries()) {
    const b = el(documentObj, 'button', `talos-button ${i === 0 ? 'talos-button--secondary' : 'talos-button--ghost'} talos-button--sm`, azione.etichetta);
    b.type = 'button';
    if (typeof azione.onClick === 'function') b.addEventListener('click', azione.onClick);
    riga.append(b);
  }
  if (codice) riga.append(el(documentObj, 'span', 'talos-code', codice));
  box.append(riga);
  return box;
}

/* -------------------------------------------------------------- SystemNote */

/** Una nota di sistema: badge (Nota / Errore), titolo e testo. */
export function creaNotaSistema({ tipo = 'info', badge = 'Nota', titolo = '', testo = '' } = {}, opzioni = {}) {
  const documentObj = opzioni.document || globalThis.document;
  const nota = el(documentObj, 'div', 'talos-system-note');
  nota.setAttribute('data-c', 'SystemNote');
  nota.append(el(documentObj, 'span', `talos-badge talos-badge--${tipo} talos-badge--sm`, badge));
  const corpo = el(documentObj, 'div');
  if (titolo) corpo.append(el(documentObj, 'div', 'talos-system-note__title', titolo));
  corpo.append(el(documentObj, 'p', 'assistant-copy', testo));
  nota.append(corpo);
  return nota;
}

/*
 * ⛔ 06/9 — la nota di sistema con dentro un errore SPIEGATO. Prima l'errore del giro arrivava a
 * schermo come lo mandava il server: `[internal-error] HTTP 400 dopo 4 tentativi: {"error":{…}}`.
 * Qui la nota prende tre pezzi — cosa è successo, perché, cosa puoi fare — e tiene il testo tecnico
 * in un dettaglio richiudibile, chiuso: serve per una segnalazione, non per essere letto ogni volta.
 * La spiegazione la costruisce `components/errori.js`; questo componente la mostra e basta.
 */
export function creaNotaErrore({ badge = 'Errore', titolo = 'TALOS · errore', spiegazione = null, tono = 'danger' } = {}, opzioni = {}) {
  const documentObj = opzioni.document || globalThis.document;
  const nota = el(documentObj, 'div', `talos-system-note talos-system-note--${tono === 'danger' ? 'errore' : 'nota'}`);
  nota.setAttribute('data-c', 'SystemNote');
  // 06/9 (T05-D2): un giro fermato da te non e' un guasto — stessa forma, tono diverso
  nota.append(el(documentObj, 'span', `talos-badge talos-badge--${tono} talos-badge--sm`, badge));
  const corpo = el(documentObj, 'div');
  if (titolo) corpo.append(el(documentObj, 'div', 'talos-system-note__title', titolo));
  corpo.append(el(documentObj, 'p', 'assistant-copy', spiegazione?.cosa || ''));
  if (spiegazione?.perche) corpo.append(el(documentObj, 'p', 'talos-system-note__perche', spiegazione.perche));
  if (Array.isArray(spiegazione?.rimedi) && spiegazione.rimedi.length) {
    const lista = el(documentObj, 'ul', 'talos-system-note__rimedi');
    for (const r of spiegazione.rimedi) lista.append(el(documentObj, 'li', '', r));
    corpo.append(lista);
  }
  if (spiegazione?.tecnico) {
    const dettaglio = documentObj.createElement('details');
    dettaglio.className = 'talos-system-note__tecnico';
    const riassunto = documentObj.createElement('summary');
    riassunto.textContent = 'Testo del server';
    dettaglio.append(riassunto, el(documentObj, 'pre', 'talos-system-note__grezzo', spiegazione.tecnico));
    corpo.append(dettaglio);
  }
  nota.append(corpo);
  return nota;
}

/* ---------------------------------------------------------- Approval/Diff */

/** Le righe di un diff: [{ tipo: 'add'|'del'|'ctx', testo }]. */
export function creaDiff(righe = [], opzioni = {}) {
  const documentObj = opzioni.document || globalThis.document;
  const diff = el(documentObj, 'div', 'talos-diff');
  diff.setAttribute('data-c', 'DiffView');
  for (const r of righe) diff.append(el(documentObj, 'div', `talos-diff__line talos-diff__line--${r.tipo || 'ctx'}`, r.testo));
  return diff;
}

/**
 * La scheda di approvazione: cosa chiede (badge), il bersaglio, il perché, il
 * diff se c'è, e le tre risposte (una volta · per questa sessione · nega).
 * `pulsanti` riceve i tre handler; `piede` porta la classe-gancio
 * `sheet-actions` che ApprovalResolved rimuove; `perche` porta `assistant-copy`.
 */
/*
 * ⛔ 06/9, owner davanti allo schermo: «i comandi devono essere formattati bene in codice, così è
 * troppo brutto» — un `node --input-type=module -e '…'` finiva come paragrafo giustificato dentro la
 * frase «Vuole eseguire il comando: …», illeggibile proprio nel momento in cui va letto: prima di dire
 * sì. Ora la carta ha tre pezzi distinti: la frase (cosa vuole fare), il `codice` (cosa esattamente,
 * in monospazio, con il suo fondo e lo scorrimento), il `motivo` (perché lo sta chiedendo).
 * E l'esito non si appiccica più in coda alla frase: ha una riga sua.
 */
export function creaApprovazione({ badge = 'Chiede di scrivere', bersaglio = '', aggiunte = null, rimozioni = null, perche = '', codice = '', motivo = '', diff = null, nota = 'Scade a fine sessione', onUnaVolta, onSessione, onNega } = {}, opzioni = {}) {
  const documentObj = opzioni.document || globalThis.document;
  const scheda = el(documentObj, 'div', 'talos-approval');
  scheda.setAttribute('data-c', 'ApprovalCard');
  const testa = el(documentObj, 'div', 'talos-approval__head');
  const etichetta = el(documentObj, 'span', 'talos-badge talos-badge--accent');
  etichetta.append(simbolo(documentObj, 'i i--sm', 'i-shield'), documentObj.createTextNode(badge));
  testa.append(etichetta, el(documentObj, 'span', 'talos-mono talos-measure talos-grow talos-truncate', bersaglio));
  if (Number.isFinite(aggiunte)) testa.append(el(documentObj, 'span', 'talos-diff-num talos-diff-num--plus', `+${aggiunte}`));
  if (Number.isFinite(rimozioni)) testa.append(el(documentObj, 'span', 'talos-diff-num talos-diff-num--minus', `−${rimozioni}`));
  scheda.append(testa);
  const perchéEl = el(documentObj, 'p', 'talos-approval__why assistant-copy', perche);
  scheda.append(perchéEl);
  let codiceEl = null;
  if (codice) {
    codiceEl = el(documentObj, 'pre', 'talos-approval__codice', String(codice));
    codiceEl.tabIndex = 0; // si scorre anche da tastiera: un comando lungo non si legge col solo mouse
    codiceEl.setAttribute('aria-label', 'Il comando esatto che l’agente vuole eseguire');
    scheda.append(codiceEl);
  }
  let motivoEl = null;
  if (motivo) {
    motivoEl = el(documentObj, 'p', 'talos-approval__motivo', motivo);
    scheda.append(motivoEl);
  }
  if (Array.isArray(diff) && diff.length > 0) scheda.append(creaDiff(diff, opzioni));
  const piede = el(documentObj, 'div', 'talos-approval__foot sheet-actions');
  const bottone = (classi, testo, onClick) => {
    const b = el(documentObj, 'button', classi, testo);
    b.type = 'button';
    if (typeof onClick === 'function') b.addEventListener('click', onClick);
    return b;
  };
  const unaVolta = bottone('talos-button talos-button--primary talos-button--md', 'Consenti una volta', onUnaVolta);
  const sessione = bottone('talos-button talos-button--secondary', 'Per questa sessione', onSessione);
  const nega = bottone('talos-button talos-button--ghost talos-button--danger', 'Nega', onNega);
  piede.append(unaVolta, sessione, nega, el(documentObj, 'span', 'talos-grow'), el(documentObj, 'span', 'talos-approval__foot-note', nota));
  scheda.append(piede);
  return { scheda, perche: perchéEl, codice: codiceEl, motivo: motivoEl, piede, pulsanti: { unaVolta, sessione, nega } };
}

/**
 * L'esito di una richiesta di approvazione: toglie i pulsanti e mette una riga sua, col tono giusto.
 * Prima l'esito veniva concatenato in coda alla frase del perché — si leggeva come parte del comando.
 */
export function segnaEsitoApprovazione(scheda, { approvato = false, altrove = false } = {}, opzioni = {}) {
  if (!scheda) return null;
  const documentObj = opzioni.document || scheda.ownerDocument || globalThis.document;
  scheda.querySelector('.talos-approval__foot')?.remove();
  scheda.querySelector('.sheet-actions')?.remove();
  const esistente = scheda.querySelector('.talos-approval__esito');
  if (esistente) esistente.remove();
  const riga = el(documentObj, 'p', `talos-approval__esito talos-approval__esito--${approvato ? 'si' : 'no'}`, `${approvato ? 'Approvato' : 'Negato'}${altrove ? ' da un’altra finestra' : ''}`);
  riga.setAttribute('role', 'status');
  scheda.append(riga);
  return riga;
}

/** La ricevuta firmata di una scrittura. */
export function creaRicevuta({ testo = '', hash = '' } = {}, opzioni = {}) {
  const documentObj = opzioni.document || globalThis.document;
  const ricevuta = el(documentObj, 'div', 'talos-receipt');
  ricevuta.setAttribute('data-c', 'SignedReceipt');
  ricevuta.append(el(documentObj, 'span', 'talos-badge talos-badge--success talos-badge--sm', 'Ricevuta firmata'), el(documentObj, 'span', 'talos-receipt__text', testo), el(documentObj, 'span', 'talos-receipt__hash', hash));
  return ricevuta;
}

/** I file toccati in un giro: [{ percorso, aggiunte, rimozioni, onApri, onDiff }]. */
export function creaFileToccati(file = [], opzioni = {}) {
  const documentObj = opzioni.document || globalThis.document;
  const card = el(documentObj, 'div', 'talos-card talos-touched');
  card.setAttribute('data-c', 'TouchedFiles');
  const testa = el(documentObj, 'div', 'talos-touched__head');
  testa.append(el(documentObj, 'span', 'talos-eyebrow', 'File toccati in questo giro'));
  card.append(testa);
  for (const f of file) card.append(rigaFileToccato(f, opzioni));
  return card;
}

export function rigaFileToccato({ percorso = '', aggiunte = 0, rimozioni = 0, onApri, onDiff } = {}, opzioni = {}) {
  const documentObj = opzioni.document || globalThis.document;
  const riga = el(documentObj, 'div', 'talos-touched__row');
  riga.dataset.percorso = percorso;
  riga.append(el(documentObj, 'span', 'talos-touched__name', percorso), el(documentObj, 'span', 'talos-diff-num talos-diff-num--plus', `+${aggiunte}`), el(documentObj, 'span', 'talos-diff-num talos-diff-num--minus', `−${rimozioni}`));
  const apri = el(documentObj, 'button', 'talos-button talos-button--ghost talos-button--sm', 'Apri');
  apri.type = 'button';
  if (typeof onApri === 'function') apri.addEventListener('click', onApri);
  const diff = el(documentObj, 'button', 'talos-button talos-button--secondary talos-button--sm', 'Differenza');
  diff.type = 'button';
  diff.dataset.vaia = 'review'; // come nel mockup: porta alla Review (la regia portata in app.js instrada data-vaia)
  if (typeof onDiff === 'function') diff.addEventListener('click', onDiff);
  riga.append(apri, diff);
  return riga;
}

/* ---------------------------------------------------------------- Artifact */

/** La scheda di un artefatto creato dal modello: titolo, formato, «Apri» e l'anteprima in un iframe isolato. */
export function creaArtefatto({ titolo = 'Artefatto', formato = '', src = '', onApri } = {}, opzioni = {}) {
  const documentObj = opzioni.document || globalThis.document;
  const card = el(documentObj, 'div', 'talos-card talos-artifact');
  card.setAttribute('data-c', 'ArtifactCard');
  const testa = el(documentObj, 'div', 'talos-artifact__head');
  testa.append(el(documentObj, 'span', 'talos-badge talos-badge--accent talos-badge--sm', 'Artefatto'), el(documentObj, 'span', 'talos-artifact__title talos-grow talos-truncate', titolo));
  if (formato) testa.append(el(documentObj, 'span', 'talos-mono talos-muted', formato));
  const apri = el(documentObj, 'button', 'talos-button talos-button--ghost talos-button--sm', 'Apri');
  apri.type = 'button';
  if (typeof onApri === 'function') apri.addEventListener('click', onApri);
  testa.append(apri);
  const frame = documentObj.createElement('iframe');
  frame.className = 'talos-artifact__frame artifact-card-frame';
  frame.setAttribute('title', titolo);
  frame.setAttribute('sandbox', 'allow-scripts');
  frame.setAttribute('referrerpolicy', 'no-referrer');
  if (src) frame.src = src;
  card.append(testa, frame);
  return { card, frame, apri };
}

/* ------------------------------------------------------------------ Attesa */

/**
 * ⭐⭐⭐ IL MOTORE DEL SEGNAVIA — misura sul browser di chi guarda, e prende il comando se serve.
 *
 * ⛔⛔ Owner, 10/09, cinque volte: «non si muove», e ogni volta le mie misure dicevano di sì. Il
 *   punto è che le mie misure erano fatte in un Chromium headless mio, non nel suo Chrome: SMIL
 *   gira in tutte le condizioni che so riprodurre (due temi × tre modi di «riduci animazioni»:
 *   12 valori distinti su 12, sei volte su sei), quindi ciò che lo ferma da lui è qualcosa che io
 *   non riesco a mettere sul banco. ⇒ Si smette di indovinare la causa e si sposta la MISURA dove
 *   sta il problema: questa funzione guarda se il disegno si è mosso davvero, sul browser vero.
 *
 * Come funziona, e perché in quest'ordine:
 *   1. lascia lavorare SMIL — è il motore più economico, non costa un frame di JavaScript;
 *   2. dopo `ATTESA_VERIFICA_MS` legge `stroke-dashoffset`: se è cambiato, si spegne e non fa altro;
 *   3. se NON è cambiato, disegna lui con `requestAnimationFrame` — che «syncs animations with the
 *      browser's repaint cycle» (Paul Irish, «requestAnimationFrame for smart animating», letto il
 *      10/09/2026), mentre `setInterval` «isn't ideal … the browser can't really optimize it»;
 *   4. e se nemmeno rAF avanza (un caso che questo progetto ha già misurato: Chrome pilotato via CDP
 *      in background strozza rAF a ~1/s), passa a `setInterval`, che in quel caso continua.
 *
 * ⛔ `data-motore` sull'SVG dice QUALE via è viva: `smil`, `js`, `js-intervallo`. Non è un residuo
 *   di debug: è l'unico modo che ho di sapere cosa succede su una macchina che non è la mia — si
 *   legge da una foto o da una riga di console, senza chiedere niente a chi guarda.
 * ⛔ Si autospegne quando l'SVG esce dal documento (`isConnected`): la bolla d'attesa viene rimossa
 *   al primo token, e un timer che sopravvive al suo elemento è una perdita che nessuno vede.
 *
 * @param {SVGSVGElement} svg il segnavia già montato
 * @param {object} [deps] finestre e tempi iniettabili, per provarlo senza aspettare davvero
 * @returns {() => void} la funzione che ferma il motore
 */
export const ATTESA_VERIFICA_MS = 420;
/* ⛔ Fra le due letture: abbastanza perché un ciclo da 1,6 s abbia mosso il disegno in modo
   misurabile, abbastanza poco perché un segnavia fermo non resti fermo più di mezzo secondo. */
export const INTERVALLO_CONFRONTO_MS = 140;
const CICLO_MS = 1600;
const FASI_NODI = [0, 0.36 / 1.6, 0.73 / 1.6];
/*
 * ⭐⭐⭐ D-10R, 10/09/2026 — IL NODO NON SI LIMITA AD ACCENDERSI: CRESCE.
 *
 * ⛔ La misura che ha chiuso il debito non era sul DOM, era sui PIXEL. Fotografando il rettangolo
 *   del segnavia venti volte a 80 ms, in tema Calm scuro e con `--disable-gpu` (la condizione del
 *   Chrome dell'owner), cambiavano **11,6 pixel per fotogramma su 864 (1,3%)**, e fra i due istanti
 *   più diversi dell'intero ciclo **42 pixel (4,9%)**. Non era fermo: era troppo poco per leggersi
 *   come movimento. Cinque tentativi in una sera avevano tutti misurato quanti valori DISTINTI
 *   assumeva `stroke-dashoffset` — un attributo che cambia non è un pixel che cambia.
 *
 * ⛔ Cinque varianti provate sullo stesso banco, stessa misura, prima di scegliere:
 *     A com'è oggi ......................................... 11,6/fotogramma · salto massimo  42 (4,9%)
 *     F il nodo cresce (SMIL anche su `r`, 4→7) ............ 25,8 ............ salto massimo 132 (15,3%)
 *     G F + tratto 2,5→3,5 e traccia più accesa ............ 25,2 ............ salto massimo 105
 *     H G + nodi color accento ............................. 17,0 ............ salto massimo  69
 *     I H + linea che si disegna invece di scorrere ........ 13,4 ............ salto massimo  73
 *   ⇒ Vince **F**, e le due varianti "più forti" all'occhio (tratto grosso, colore d'accento) fanno
 *   PEGGIO: l'accento (#c08b3c) contro il fondo Calm scuro sta a 5,49:1, il grigio `currentColor`
 *   di serie a **6,09:1** — cambiare colore avrebbe abbassato il contrasto credendo di alzarlo.
 *   ⛔ Nessuna variante ingrandisce il segnavia: l'owner l'ha bocciato due volte («ancora troppo
 *   grande»), e la misura gli dà ragione — raddoppiando la scala la PERCENTUALE di pixel che
 *   cambiano resta 1,8%.
 */
const RAGGIO_SPENTO = 4;
const RAGGIO_ACCESO = 7;

export function animaSegnavia(svg, { window: finestra = globalThis, adesso = () => (finestra.performance?.now?.() ?? Date.now()) } = {}) {
  const sweep = svg?.querySelector?.('.talos-line-loader-sweep');
  if (!sweep) return () => {};
  const nodi = [...(svg.querySelectorAll?.('.talos-line-loader-node') ?? [])];
  let fermato = false;
  let handle = null;
  let intervallo = null;
  const ferma = () => {
    fermato = true;
    if (handle != null) finestra.cancelAnimationFrame?.(handle);
    if (intervallo != null) finestra.clearInterval?.(intervallo);
    handle = null; intervallo = null;
  };

  /* Il disegno, un istante alla volta: la stessa geometria dell'SMIL, scritta a mano. */
  const inizio = adesso();
  const disegna = () => {
    if (fermato || !svg.isConnected) return ferma();
    const t = ((adesso() - inizio) % CICLO_MS) / CICLO_MS;
    sweep.setAttribute('stroke-dashoffset', String(88 - 176 * t));
    nodi.forEach((nodo, i) => {
      const f = (t - FASI_NODI[i] + 1) % 1;
      /* Il profilo del mobile: spento fino al 12%, pieno dal 22% all'82%, poi si spegne. */
      const acceso = f < 0.12 ? 0 : f < 0.22 ? (f - 0.12) / 0.1 : f < 0.82 ? 1 : Math.max(0, 1 - (f - 0.82) / 0.18);
      nodo.setAttribute('fill-opacity', acceso.toFixed(3));
      /* ⛔ Anche il RAGGIO, con lo stesso profilo: è la metà del movimento (vedi RAGGIO_ACCESO).
         Se il ripiego disegnasse solo l'opacità, accendersi dal JavaScript varrebbe meno che da
         SMIL — e un ripiego che vale meno dell'originale è un ripiego che mente. */
      nodo.setAttribute('r', (RAGGIO_SPENTO + (RAGGIO_ACCESO - RAGGIO_SPENTO) * acceso).toFixed(2));
    });
  };

  let frameVisti = 0;
  const giro = () => {
    if (fermato || !svg.isConnected) return ferma();
    frameVisti += 1;
    disegna();
    handle = finestra.requestAnimationFrame?.(giro) ?? null;
    if (handle == null) { svg.setAttribute('data-motore', 'js-intervallo'); intervallo = finestra.setInterval?.(disegna, 60) ?? null; }
  };

  svg.setAttribute('data-motore', 'smil');
  /*
   * ⛔⛔⛔ LE DUE LETTURE VANNO FATTE ENTRAMBE A ELEMENTO INSERITO, e la prima versione di questa
   *   funzione sbagliava proprio qui: leggeva `primo` SUBITO, cioè mentre l'SVG è ancora fuori dal
   *   documento (`animaSegnavia` gira dentro `creaAttesa`, prima che `nellaChat` lo appenda), e
   *   `getComputedStyle` su un elemento non connesso torna stringa vuota. Confronto: `''` contro
   *   `'88px'` — sempre diversi ⇒ «SMIL lavora» sempre ⇒ **il ripiego non partiva mai**, nemmeno con
   *   SMIL tolto di mezzo. Trovato dalla prova AL CONTRARIO dal vivo
   *   (`scratchpad/prove/segnavia-quanto-dura/ripiego.mjs`): con gli `<animate>` rimossi, `sweep`
   *   dava 1 solo valore distinto su 30 campioni e `data-motore` restava `smil`. Un ripiego che non
   *   si accende è peggio di nessun ripiego: fa credere che ci sia una rete.
   * ⇒ Due letture, tutte e due dopo l'attesa, separate da un intervallo breve.
   */
  finestra.setTimeout?.(() => {
    if (fermato || !svg.isConnected) return;
    const primo = finestra.getComputedStyle?.(sweep)?.strokeDashoffset ?? null;
    finestra.setTimeout?.(() => decidi(primo), INTERVALLO_CONFRONTO_MS);
  }, ATTESA_VERIFICA_MS);

  function decidi(primo) {
    if (fermato || !svg.isConnected) return;
    const ora = finestra.getComputedStyle?.(sweep)?.strokeDashoffset ?? null;
    if (primo !== null && ora !== null && primo !== ora) return; // ⭐ SMIL lavora: nessun secondo motore
    /* ⛔ SMIL è fermo su questa macchina: si toglie di mezzo (altrimenti litiga con noi sull'attributo). */
    try { svg.pauseAnimations?.(); } catch { /* niente SMIL qui: meglio così */ }
    svg.setAttribute('data-motore', 'js');
    giro();
    /* ⛔ E se nemmeno rAF avanza — misurato in questo progetto su Chrome pilotato in background —
       dopo mezzo secondo si passa all'intervallo, che lì continua a scattare. */
    finestra.setTimeout?.(() => {
      if (fermato || !svg.isConnected || frameVisti > 4) return;
      if (handle != null) finestra.cancelAnimationFrame?.(handle);
      handle = null;
      svg.setAttribute('data-motore', 'js-intervallo');
      intervallo = finestra.setInterval?.(disegna, 60) ?? null;
    }, 500);
  }

  return ferma;
}

/**
 * L'attesa della risposta: lo scheletro del mockup (tre barre) preceduto dalla
 * riga animata del marchio — la STESSA immagine del mobile (owner 02/9:
 * TalosLineLoader, viewBox 96×16, tre nodi che si riempiono) — con l'etichetta
 * che il monolite aggiorna (`run-activity-label`) e i secondi trascorsi.
 */
export function creaAttesa({ etichetta = 'Sto pensando…' } = {}, opzioni = {}) {
  const documentObj = opzioni.document || globalThis.document;
  /*
   * ⛔⛔⛔ 10/09 — TROVATO DALLA PROVA AL VERSO CONTRARIO, e c'era da prima di oggi. Con
   *   `prefers-reduced-motion: reduce` il segnavia fermo mostrava `fill-opacity [0, 1, 1]`: il PRIMO
   *   nodo spento e gli altri due accesi. Causa: si costruivano gli `<animate>`, si scrivevano a mano
   *   i valori «fermi» sugli attributi e poi si chiamava `pauseAnimations()`. Ma appena l'SVG entra
   *   nel documento SMIL parte, e a t=0 solo l'animazione con `begin="0s"` è già cominciata: quella
   *   sovrascrive l'attributo del primo nodo col suo valore iniziale (spento), mentre le altre due,
   *   non ancora avviate, lasciano in piedi il valore scritto da noi. Tre pallini di cui uno solo
   *   spento non sono uno stato: sembrano un errore di disegno.
   * ⇒ Quando si chiede meno movimento gli `<animate>` NON SI CREANO. Niente da mettere in pausa,
   *   niente che possa sovrascrivere: il disegno fermo è quello che vogliamo, e basta.
   *   (SMIL non guarda `prefers-reduced-motion` da sé — CSS-Tricks «A Guide to SVG Animations (SMIL)»
   *   ed elijahmanor.com «prefers-reduced-motion», letti il 10/09/2026: «SMIL animations are not
   *   affected by prefers-reduced-motion … you will need to use JavaScript». Questa è quella
   *   JavaScript, presa nel punto in cui costa meno: prima di crearle.)
   */
  let menoMovimento = false;
  try {
    menoMovimento = Boolean(opzioni.window?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
      ?? globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
  } catch { menoMovimento = false; /* niente matchMedia (prove, ambienti senza finestra): resta il movimento */ }
  const blocco = el(documentObj, 'div', 'talos-stack talos-waiting');
  blocco.setAttribute('role', 'status');
  blocco.setAttribute('aria-live', 'polite');
  blocco.setAttribute('aria-atomic', 'true');
  const riga = el(documentObj, 'div', 'talos-waiting__row');
  const svg = documentObj.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'talos-line-loader');
  svg.setAttribute('viewBox', '0 0 96 16');
  svg.setAttribute('width', '48'); // 10/09, owner: «ancora troppo grande» — si vede per il movimento dei nodi, non per la taglia
  svg.setAttribute('height', '8');
  svg.setAttribute('aria-hidden', 'true');
  for (const classe of ['talos-line-loader-track', 'talos-line-loader-sweep']) {
    const linea = documentObj.createElementNS(SVG_NS, 'line');
    linea.setAttribute('class', classe);
    linea.setAttribute('x1', '4'); linea.setAttribute('y1', '8'); linea.setAttribute('x2', '92'); linea.setAttribute('y2', '8');
    /*
     * ⛔⛔⛔ 10/09, owner, terza volta e spazientito: «su 4174 non riesco a vedere sto maledetto
     *   segnavia animato sul MIO Chrome, voglio una soluzione adesso».
     *
     * Misurato: l'animazione CSS gira in un Chrome pulito (12 valori distinti di `stroke-dashoffset`
     * su 12 letture) e si SPEGNE in due condizioni che il browser dell'owner puo' avere addosso —
     * «riduci animazioni» di Windows, e l'interruttore «Riduci animazioni» dell'app, che in
     * `index.css` diventa `body.reduce-motion * { animation: none !important }`. Una regola con
     * `!important` a valle non si batte da dentro il CSS.
     *
     * ⇒ Il movimento non passa piu' dal motore delle animazioni CSS: e' SMIL, dentro l'SVG.
     *   Ricerca 10/09/2026 — CSS-Tricks «A Guide to SVG Animations (SMIL)» ed elijahmanor.com
     *   «prefers-reduced-motion»: le animazioni SMIL «are not affected by prefers-reduced-motion»
     *   e nessuna regola CSS le ferma; per fermarle serve JavaScript (`pauseAnimations()`).
     *   E' esattamente la proprieta' che serve qui: un indicatore di stato non e' una decorazione,
     *   e spento senza ripiego mente su cosa sta succedendo.
     * ⛔ Chi ha chiesto meno movimento AL SISTEMA lo ottiene lo stesso, poche righe piu' sotto:
     *   li' l'SVG viene messo in pausa da JS e la linea resta piena e ferma, che si vede.
     */
    if (classe === 'talos-line-loader-sweep' && menoMovimento) linea.setAttribute('stroke-dashoffset', '0'); // la linea piena e ferma: si vede che c'è
    else if (classe === 'talos-line-loader-sweep') {
      const moto = documentObj.createElementNS(SVG_NS, 'animate');
      moto.setAttribute('attributeName', 'stroke-dashoffset');
      moto.setAttribute('values', '88;-88');
      moto.setAttribute('dur', '1.6s');
      moto.setAttribute('repeatCount', 'indefinite');
      linea.append(moto);
    }
    svg.append(linea);
  }
  /*
   * ⛔⛔⛔ 10/09, owner, quarta volta: «mi stai prendendo per il culo, è statico e ancora troppo
   *   grande». Il bundle servito dal 4174 CONTIENE gia' l'SMIL sullo sweep (verificato con curl:
   *   `"animate"`, `repeatCount`, `88;-88`) — ma una linea sottile che scorre e' un movimento che si
   *   puo' non vedere, soprattutto su un tema scuro e con un rendering software.
   * ⇒ Il movimento sta dove si guarda: i TRE NODI si accendono a turno. Tre cerchi che pulsano in
   *   sequenza sono leggibili a colpo d'occhio dove una linea da 2,5 px non lo e'.
   * ⛔ `fill-opacity` e non `fill`: SMIL non conosce `var(--talos-accent)`, mentre `currentColor` sul
   *   riempimento eredita il colore che il CSS ha gia' dato al segnavia — un valore solo, un posto solo.
   * ⛔ E il CSS non deve dichiarare ne' `fill` ne' `fill-opacity` sui nodi: una dichiarazione CSS
   *   vince sull'attributo di presentazione che SMIL anima, e lo inchioderebbe.
   */
  for (const [i, cx] of [16, 48, 80].entries()) {
    const nodo = documentObj.createElementNS(SVG_NS, 'circle');
    nodo.setAttribute('class', 'talos-line-loader-node');
    /* ⛔ Il viewBox e' 96x16 e lo rendiamo a 48x8: TUTTO e' disegnato a meta' scala, e un nodo
       r=4 arriva a schermo come un cerchio di 4 px in tutto. Il mobile rende lo stesso viewBox a
       96x16, cioe' il doppio. L'owner vuole la riga piccola: allora crescono i NODI dentro il
       disegno (r 4 → 5), non la riga. */
    nodo.setAttribute('cx', String(cx)); nodo.setAttribute('cy', '8'); nodo.setAttribute('r', String(menoMovimento ? RAGGIO_ACCESO : RAGGIO_SPENTO));
    nodo.setAttribute('fill', 'currentColor');
    nodo.setAttribute('fill-opacity', menoMovimento ? '1' : '0');
    /*
     * ⛔⛔⛔ 10/09, owner: «guarda come ha fatto il mobile, forse trovi qualcosa di utile». Trovato,
     *   e sono DUE cose che il nostro sbagliava — `mobile/src/components/brand/TalosLineLoader.vue`
     *   e `mobile/src/style.css`, letti oggi:
     *
     *   1. IL PROFILO. Il mobile tiene il nodo pieno dal **22% all'82%** del ciclo
     *      (`@keyframes talosLineNodeFill`): pieno per il 60% del tempo, cioè un nodo ACCESO che a
     *      un certo punto si spegne. Il nostro toccava l'opacità 1 per un istante solo e poi
     *      decadeva: a schermo non e' un'onda, e' uno sfarfallio debole. Qui si copia il profilo suo.
     *   2. IL TEMPO. Sweep e nodi condividono lo stesso ciclo di **1,6 s**, e i tre `begin`
     *      (0 · 0,36 · 0,73) sono calcolati perche' ogni nodo si accenda QUANDO LA LINEA LO
     *      RAGGIUNGE sui suoi 88 px — non tre ritardi scelti a occhio come i miei 0,28.
     *
     * ⛔ E il difetto peggiore stava nel CSS che abbiamo tolto: i ritardi erano su
     *   `.talos-line-loader-node:nth-of-type(3)` e `(4)`, ma `nth-of-type` conta PER TIPO — i
     *   `<circle>` sono 1, 2 e 3, non 3, 4 e 5. Il primo e il secondo nodo pulsavano quindi
     *   IN SINCRONO (ritardo 0 entrambi) e il `(4)` non esisteva. Tre pallini che lampeggiano
     *   insieme non si leggono come movimento: si leggono come uno sfarfallio. Il mobile usa
     *   `nth-of-type(1)/(2)/(3)` e non ha mai avuto questo difetto.
     */
    if (menoMovimento) { svg.append(nodo); continue; } // fermo, acceso e cresciuto: nessun `<animate>` da sovrascrivere
    const acceso = documentObj.createElementNS(SVG_NS, 'animate');
    acceso.setAttribute('attributeName', 'fill-opacity');
    acceso.setAttribute('values', '0;0;1;1;0');
    acceso.setAttribute('keyTimes', '0;0.12;0.22;0.82;1');
    acceso.setAttribute('dur', '1.6s');
    acceso.setAttribute('begin', `${[0, 0.36, 0.73][i]}s`);
    acceso.setAttribute('repeatCount', 'indefinite');
    nodo.append(acceso);
    /*
     * ⛔ Stesso profilo, stessi `keyTimes`, stesso `begin`: il nodo si accende E cresce nello stesso
     *   istante, altrimenti sarebbero due movimenti che si disturbano invece di uno solo che si legge.
     * ⛔ `r` come attributo animato da SMIL, non come dichiarazione CSS: `r` È una proprietà CSS dal
     *   2018, e se il foglio la dichiarasse vincerebbe sull'attributo e inchioderebbe il nodo —
     *   esattamente il difetto già pagato il 10/09 con `stroke-dashoffset`. In `index.css` e
     *   `diff-in-chat.css` non c'è nessuna `r` sui nodi, ed è una condizione da non violare.
     */
    const cresciuto = documentObj.createElementNS(SVG_NS, 'animate');
    cresciuto.setAttribute('attributeName', 'r');
    cresciuto.setAttribute('values', `${RAGGIO_SPENTO};${RAGGIO_SPENTO};${RAGGIO_ACCESO};${RAGGIO_ACCESO};${RAGGIO_SPENTO}`);
    cresciuto.setAttribute('keyTimes', '0;0.12;0.22;0.82;1');
    cresciuto.setAttribute('dur', '1.6s');
    cresciuto.setAttribute('begin', `${[0, 0.36, 0.73][i]}s`);
    cresciuto.setAttribute('repeatCount', 'indefinite');
    nodo.append(cresciuto);
    svg.append(nodo);
  }
  /*
   * ⛔ Il rispetto di «meno movimento» e' nostro, perche' SMIL non lo prende dal CSS — ma ormai e'
   *   gia' stato onorato COSTRUENDO il disegno fermo (nessun `<animate>`, nodi accesi e cresciuti,
   *   linea piena). Qui resta solo la scelta del motore: se il movimento c'e', il segnavia si
   *   sorveglia da solo. ⛔ Niente `pauseAnimations()`: non c'e' piu' niente da mettere in pausa, e
   *   chiamarlo darebbe l'impressione che serva ancora.
   */
  let fermaMotore = () => {};
  if (!menoMovimento) fermaMotore = animaSegnavia(svg, { window: opzioni.window ?? globalThis });
  const label = el(documentObj, 'span', 'talos-waiting__label run-activity-label', etichetta);
  const elapsed = el(documentObj, 'span', 'talos-mono talos-muted run-activity-elapsed', '0s');
  elapsed.setAttribute('aria-hidden', 'true');
  riga.append(svg, label, elapsed);
  /*
   * ⛔ 06/9, owner: «skeleton loader non ci deve essere». Le tre barre grigie promettevano una forma
   * (tre righe di testo) che la risposta vera non ha, e con «riduci le animazioni» acceso non luccicavano
   * nemmeno: erano tre rettangoli fermi. Resta la riga onesta: segnavia, cosa sta facendo, da quanto.
   */
  blocco.append(riga);
  /* ⛔ `fermaMotore` viaggia con la bolla: chi la rimuove ferma anche il disegno. Il motore si
     autospegne comunque su `isConnected`, ma un chiamante che PUO' dirlo non deve aspettare. */
  return { blocco, label, elapsed, fermaMotore: () => fermaMotore() };
}

/* ------------------------------------------------------- PO-11: il diff in chat */

/**
 * ⭐⭐⭐ PO-11 — il diff del file modificato, sotto la riga della scrittura.
 *
 * Owner, 09/09: «quando un file viene modificato non c'è il diff direttamente nella chat: bisogna
 * farlo come Claude e il resto dei competitor». Prima, aprendo quella riga, si leggeva il testo
 * grezzo dell'argomento dell'attrezzo — `percorso: … / contenuto: … / Esito: written: …`.
 *
 * ⛔ Il calcolo NON è qui e non è nuovo: `calcolaDiffRighe` (LCS) esiste da prima e alimenta la
 *   Review; `raggruppaInHunk` (10/09) lo taglia nei pezzi che si leggono. Questa funzione fa solo la
 *   resa, e riusa `.talos-diff` così com'è — stesso fondo, stessi colori, stesso scorrimento della
 *   carta di approvazione. Nessun colore nuovo per una funzione nuova.
 *
 * @param {ReturnType<import('./diff-hunk.js').raggruppaInHunk>} gruppi
 * @param {{percorso?: string, apertoSeSotto?: number, document?: Document}} [opzioni]
 */
export function creaDiffInChat(gruppi, { percorso = '', apertoSeSotto = 40, document: doc } = {}) {
  const documentObj = doc || globalThis.document;
  if (!gruppi || !Array.isArray(gruppi.pezzi) || gruppi.pezzi.length === 0) return null;

  const blocco = el(documentObj, 'div', 'talos-diff-chat');
  blocco.setAttribute('data-c', 'DiffInChat');

  const righeTotali = gruppi.pezzi.reduce((n, p) => n + p.righe.length, 0);
  /*
   * ⛔ Aperto o chiuso lo decide la LUNGHEZZA, non un default: un diff di tre righe chiuso costringe
   *   a un clic per niente, uno di trecento aperto sommerge la conversazione. La soglia è dichiarata
   *   e passabile, non nascosta in un `if`.
   */
  const dettaglio = el(documentObj, 'details', '');
  if (righeTotali <= apertoSeSotto) dettaglio.open = true;

  const riassunto = el(documentObj, 'summary', '');
  const quanti = gruppi.pezzi.length;
  riassunto.textContent = quanti === 1
    ? `Differenza${percorso ? ` in ${percorso}` : ''} · ${righeTotali} righe`
    : `Differenza${percorso ? ` in ${percorso}` : ''} · ${quanti} punti del file, ${righeTotali} righe`;
  dettaglio.append(riassunto);

  for (const pezzo of gruppi.pezzi) {
    const testa = el(documentObj, 'div', 'talos-diff-chat__pezzo');
    /* A parole: chi legge vuole sapere a quale riga del file si trova. */
    const dove = pezzo.daRiga === null
      ? 'righe tolte'
      : (pezzo.daRiga === pezzo.aRiga ? `riga ${pezzo.daRiga}` : `righe ${pezzo.daRiga}-${pezzo.aRiga}`);
    testa.append(el(documentObj, 'span', 'talos-diff-chat__righe', dove));
    dettaglio.append(testa);

    const corpo = el(documentObj, 'div', 'talos-diff');
    corpo.setAttribute('data-c', 'DiffView');
    for (const r of pezzo.righe) {
      const riga = el(documentObj, 'div', `talos-diff__line talos-diff__line--${r.tipo}`);
      /* Il numero e il segno non si selezionano: copiando il diff si porta via il codice, non le colonne. */
      riga.append(el(documentObj, 'span', 'talos-diff-chat__num', r.numero === null ? '' : String(r.numero)));
      riga.append(el(documentObj, 'span', 'talos-diff-chat__segno', r.tipo === 'add' ? '+' : r.tipo === 'del' ? '−' : ' '));
      riga.append(documentObj.createTextNode(r.testo));
      corpo.append(riga);
    }
    dettaglio.append(corpo);
  }

  /* ⛔ Il taglio si dichiara coi numeri: un taglio silenzioso fa credere che il file sia cambiato meno. */
  if (gruppi.tagliato) {
    const resto = el(documentObj, 'div', 'talos-diff-chat__resto');
    resto.textContent = `Altri ${gruppi.pezziNascosti} punti del file non sono mostrati qui (${gruppi.righeNascoste} righe). Il totale +${gruppi.aggiunte} −${gruppi.rimozioni} li conta tutti.`;
    dettaglio.append(resto);
  }

  blocco.append(dettaglio);
  return blocco;
}
