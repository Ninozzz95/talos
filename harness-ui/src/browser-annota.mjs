/**
 * browser-annota.mjs — M4 (07/09/2026): la stessa annotazione che TALOS fa già dentro la pagina
 * proxata, portata DENTRO il browser pilotato via CDP (il ripiego B: Chromium di sistema, profilo
 * separato, schermo trasmesso). Lì non possiamo iniettare uno script con un tag `<script>` — il
 * documento non passa più dalle nostre mani — quindi l'overlay entra con i comandi del protocollo.
 *
 * ⛔ CONTENUTO NON AFFIDABILE. Tutto ciò che torna da qui (selettore, HTML, testo, stili, indizi sul
 * sorgente, righe di console) è scritto dalla pagina di terzi. NON diventa MAI un'istruzione per il
 * modello: è un DATO dentro il pacchetto dei commenti (`annotazioni.js` → `impacchetta()`), sotto le
 * etichette fisse di quel pacchetto, e le istruzioni restano quelle nostre. Brave ha dimostrato la
 * prompt injection indiretta su Comet: una pagina che scrive «ignora le istruzioni precedenti» qui
 * arriva come testo di un elemento, non come voce del turno.
 *
 * ── Le fonti lette il 07/09/2026, e cosa hanno cambiato ────────────────────────────────────────
 * · CDP, dominio Page (chromedevtools.github.io/devtools-protocol/tot/Page/):
 *   `Page.addScriptToEvaluateOnNewDocument` «evaluates given script in every frame upon creation
 *   (before loading frame's scripts)» — è QUESTO che fa sopravvivere l'overlay alle navigazioni
 *   successive, e solo quello: sulla pagina GIÀ APERTA non gira, perché il documento è già creato.
 *   Il parametro `runImmediately` («runs the script immediately on existing execution contexts»)
 *   coprirebbe anche quel caso in una chiamata sola, ma è dichiarato **Experimental** e manca nei
 *   Chromium più vecchi ⇒ non ci si appoggia: per il documento aperto facciamo il giro esplicito
 *   `Page.createIsolatedWorld` + `Runtime.evaluate`, che sta nella 1-3 stabile.
 *   Anche `worldName` è Experimental, ma è l'unica via per nominare il mondo, e se un giorno
 *   sparisse il peggio è che l'overlay finisca nel mondo principale: funziona, e si vede.
 * · CDP, dominio Runtime (…/tot/Runtime/): `Runtime.evaluate` accetta `contextId` — «If the
 *   parameter is omitted the evaluation will be performed in the context of the inspected page»
 *   ⇒ omesso = MONDO PRINCIPALE. Ci serve nei due versi: con `contextId` per l'overlay isolato,
 *   senza per leggere le proprietà che solo il mondo principale vede (vedi sotto).
 * · MDN «Content scripts»: un mondo isolato «has access to the DOM of the page … but not to any
 *   JavaScript variables or functions created by the page».
 *
 * ── ⛔ COSA NON SI VEDE DA UN MONDO ISOLATO (il limite, scritto perché è quello che ci costa) ───
 * Il DOM è condiviso, il mucchio JavaScript no. Quindi da qui NON si vedono:
 *   1. le variabili globali della pagina — `window.__NEXT_DATA__`, `window.__NUXT__`,
 *      `window.__vite_plugin_react_preamble_installed__`: il riconoscimento del framework che
 *      l'overlay in pagina fa guardando `window` qui torna vuoto, e resta solo la parte che si
 *      legge dal DOM (`<script src="/@vite/client">`, le classi `svelte-*`);
 *   2. ⛔ le proprietà appese ai nodi dal codice della pagina — `el.__reactFiber$…`,
 *      `el.__vueParentComponent`: lo stesso nodo esiste in tutti e due i mondi, ma gli espandi che
 *      ciascun mondo gli appende sono invisibili all'altro. Sono ESATTAMENTE gli indizi sul
 *      sorgente più preziosi (file e nome del componente) ⇒ per averli serve una seconda lettura
 *      nel mondo principale, che qui facciamo per selettore (`arricchisciDalMondoPrincipale`),
 *      di sola LETTURA e solo su richiesta.
 * Al contrario, il DOM condiviso vuol dire anche che l'isolamento protegge il nostro JAVASCRIPT,
 * non i nostri NODI: l'evidenza e gli spilli che appendiamo stanno nel DOM della pagina e un suo
 * script potrebbe vederli. Per questo portano `data-talos-annota` e vengono saltati nel puntamento.
 *
 * ── Gli errori: perché UN evento solo non basta ─────────────────────────────────────────────────
 * `Runtime.consoleAPICalled` scatta «when JS code calls console API»: prende `console.error` della
 * pagina e nient'altro. `Log.entryAdded` è il registro del BROWSER — richieste di rete fallite
 * (il 404 che appare in console senza che nessuno abbia chiamato `console.*`), avvisi di sicurezza,
 * deprecazioni, interventi. `Runtime.exceptionThrown` è un terzo insieme ancora: le eccezioni non
 * catturate, che non passano da nessuno dei due. Chi ne ascolta uno solo consegna all'agente una
 * console mutilata proprio dove serviva — un 404 su un asset non è un `console.error`. Li prendiamo
 * tutti e tre e li marchiamo per origine (`console` · `browser` · `eccezione` · `promessa`).
 *
 * ── Il selettore: uguale a quello in pagina, con UNA differenza dichiarata ──────────────────────
 * Stessa forma di `frontend/src/assets/talos/browser-annota.js`: stessa fuga CSS, stessa prova di
 * unicità, stesso filtro sulle classi generate, stesso `nth-of-type`, stessa profondità massima 12
 * e — la cosa che NON si può cambiare — lo stesso separatore ` > `, perché `annotazioni.js`
 * (`percorsoContenitore`, `raggruppa`) taglia il selettore su quello per raggruppare gli spilli per
 * zona: un separatore diverso spegnerebbe il raggruppamento senza un errore.
 * ⛔ La differenza voluta: qui `data-testid` viene PRIMA dell'`id`, mentre l'overlay in pagina prova
 * l'`id` per primo. Motivo: un `data-testid` lo scrive una persona e sopravvive a un refactor, un
 * `id` oggi è spesso generato — React `useId` produce identificatori nella forma `:r0:`, che come
 * selettore CSS non è nemmeno valido senza `CSS.escape` (react/react#32001, «Use valid CSS selectors
 * in useId format»; Stefan Judis, «How to escape CSS selectors in JavaScript», letti il 07/09/2026).
 * Debito registrato: l'overlay in pagina andrebbe allineato a questo ordine, ma quel file non è di
 * questo giro.
 *
 * ── Misurato dal vivo il 07/09/2026 (Edge di sistema headless, profilo separato, porta 4321) ────
 * Non solo compilato: pilotato davvero. Il pulsante con `id="salva"` E `data-testid="salva-tutto"`
 * ha dato `button[data-testid="salva-tutto"]` — la preferenza vale anche fuori dai test. Un `<p>`
 * da 1.853 caratteri è tornato tagliato a 800 con la misura dichiarata in coda. Un elemento dentro
 * uno shadow root aperto ha dato il selettore dell'OSPITE (`div[data-testid="scheda-ombra"]`, che
 * `document.querySelector` ritrova) più `dentroShadow:"span"` e il testo di dentro. Un punto fuori
 * dalla pagina ha dato `trovato:false` con tutti e 13 i campi. E le due cose che qui contano di più:
 *   · il limite del mondo isolato, misurato invece che raccontato — scritta `window.__prova = 42`
 *     nel mondo principale, dal mondo isolato resta `undefined`;
 *   · dopo un `Page.navigate` l'overlay è tornato DA SOLO (`h1[data-testid="titolo"]`), che è
 *     esattamente il lavoro di `Page.addScriptToEvaluateOnNewDocument`.
 * Sul registro del browser: una richiesta fallita ha prodotto `Log.entryAdded` «Failed to load
 * resource: net::ERR_UNSAFE_PORT» SENZA nessuna riga di console — la prova che un evento solo non
 * basta non è un ragionamento, è quella riga.
 *
 * ⛔ NOTA PER CHI TOCCA QUESTO FILE: le funzioni pure qui sotto viaggiano nel browser serializzate
 * con `Function.prototype.toString()` (così la stessa identica logica si prova in Node e gira nella
 * pagina, invece di esistere in due copie che divergono). Perciò dentro di esse NON si può nominare
 * nessuna variabile del modulo: le costanti vengono riscritte come letterali in testa all'IIFE da
 * `sorgenteOverlay()`. E questo modulo non passa da nessun bundler: se un giorno ci passasse, la
 * minificazione romperebbe la serializzazione.
 */

/** Il nome del mondo isolato: compare come `ExecutionContextDescription::name`, utile a chi guarda. */
export const MONDO_OVERLAY = 'talos-annota';
/** L'attributo che marca i nostri nodi nel DOM condiviso, così il puntamento li salta. */
export const TAG_NOSTRO = 'data-talos-annota';
/** Misure dichiarate — le stesse dell'overlay in pagina, così i due pacchetti si somigliano. */
export const MASSIMO_HTML = 800;
export const MASSIMO_TESTO = 200;
export const MASSIMI_ANTENATI = 8;
export const PROFONDITA_MASSIMA = 12;
export const MASSIMO_ERRORI = 20;
export const MASSIMO_TESTO_ERRORE = 300;

/** Prima i testid (li scrive una persona), poi l'id, poi i nomi accessibili. Vedi la testa del file. */
export const ATTRIBUTI_STABILI = ['data-testid', 'data-test-id', 'data-test', 'data-cy', 'data-qa'];
export const ATTRIBUTI_DEBOLI = ['name', 'aria-label'];
/** Indizi sul sorgente che stanno negli ATTRIBUTI: questi sì che un mondo isolato li vede. */
export const ATTRIBUTI_SORGENTE = ['data-v-inspector', 'data-source', 'data-loc', 'data-inspector-file'];
export const STILI = ['display', 'position', 'width', 'height', 'margin', 'padding', 'color', 'background-color', 'font-family', 'font-size', 'font-weight', 'line-height', 'border', 'border-radius', 'opacity', 'z-index'];

/** I campi che il pacchetto ha SEMPRE: una pagina vuota non deve produrre un pacchetto sbilenco. */
export const CAMPI_PACCHETTO = ['trovato', 'selettore', 'tag', 'testo', 'html', 'htmlCaratteri', 'htmlTroncato', 'stili', 'rect', 'antenati', 'indiziSorgente', 'dentroShadow'];

/** Il pacchetto vuoto — la forma, quando sotto quel punto non c'è niente. */
export function pacchettoVuoto() {
  return { trovato: false, selettore: '', tag: '', testo: '', html: '', htmlCaratteri: 0, htmlTroncato: false, stili: {}, rect: null, antenati: [], indiziSorgente: {}, dentroShadow: '' };
}

/* ══ Funzioni pure: girano in Node (i test le provano) e nel browser (serializzate) ══════════════ */

/** La fuga CSS: `CSS.escape` dove c'è, altrimenti la stessa rete di sicurezza dell'overlay in pagina. */
export function escapaCss(s) {
  return (typeof CSS !== 'undefined' && CSS && CSS.escape) ? CSS.escape(String(s)) : String(s).replace(/([^a-zA-Z0-9_-])/g, '\\$1');
}

/** Una classe è stabile se non sembra generata: niente cifre lunghe, niente esadecimali, niente prefissi dei CSS-in-JS. */
export function classeStabile(c) {
  return /^[a-zA-Z][a-zA-Z0-9_-]{2,40}$/.test(c) && !/\d{3,}|[a-f0-9]{6,}|^(css|sc|jsx|svelte|emotion)-/.test(c);
}

/**
 * Un segmento del selettore. `unico(sel, el)` dice se quel selettore trova SOLO quell'elemento:
 * nel browser interroga il documento, nei test è una funzione finta — così la scelta si prova.
 * `assoluto:true` vuol dire «da qui non serve risalire»: il segmento identifica già l'elemento.
 * ⛔ `forti` e `deboli` arrivano come argomenti e non come costanti del modulo perché questa
 * funzione viaggia nel browser serializzata (vedi la nota in testa al file).
 */
export function pezzoSelettore(el, unico, forti, deboli) {
  var tag = String(el.tagName || '').toLowerCase();
  var i, v, candidato;
  for (i = 0; i < forti.length; i += 1) {
    v = el.getAttribute ? el.getAttribute(forti[i]) : null;
    if (v) { candidato = tag + '[' + forti[i] + '="' + String(v).replace(/"/g, '\\"') + '"]'; if (unico(candidato, el)) return { sel: candidato, assoluto: true }; }
  }
  if (el.id && /^[a-zA-Z][\w-]*$/.test(el.id)) { candidato = '#' + escapaCss(el.id); if (unico(candidato, el)) return { sel: candidato, assoluto: true }; }
  for (i = 0; i < deboli.length; i += 1) {
    v = el.getAttribute ? el.getAttribute(deboli[i]) : null;
    if (v) { candidato = tag + '[' + deboli[i] + '="' + String(v).replace(/"/g, '\\"') + '"]'; if (unico(candidato, el)) return { sel: candidato, assoluto: true }; }
  }
  var classi = [];
  var lista = el.classList ? Array.prototype.slice.call(el.classList) : [];
  for (i = 0; i < lista.length && classi.length < 2; i += 1) if (classeStabile(lista[i])) classi.push(lista[i]);
  var base = tag;
  for (i = 0; i < classi.length; i += 1) base += '.' + escapaCss(classi[i]);
  var padre = el.parentElement;
  if (padre && padre.children) {
    var fratelli = Array.prototype.filter.call(padre.children, function (f) { return f.tagName === el.tagName; });
    if (fratelli.length > 1) base += ':nth-of-type(' + (fratelli.indexOf(el) + 1) + ')';
  }
  return { sel: base, assoluto: false };
}

/**
 * Il selettore stabile: si risale finché il percorso non è unico, al massimo 12 gradini.
 * ⛔ Il separatore è ` > ` e non si cambia: `annotazioni.js` ci taglia sopra per raggruppare.
 * ⛔ Un elemento senza NIENTE (né attributi, né id, né classi, né fratelli) produce il suo tag e la
 * sua catena, mai un attributo che non ha: se il percorso non è unico si consegna com'è, e chi legge
 * vede un selettore generico invece di uno inventato che sembra preciso e punta altrove.
 */
export function selettoreStabile(el, unico, forti, deboli) {
  var parti = []; var corrente = el; var profondita = 0;
  while (corrente && corrente.nodeType === 1 && corrente.tagName !== 'HTML' && profondita < 12) {
    var p = pezzoSelettore(corrente, unico, forti, deboli);
    parti.unshift(p.sel);
    var candidato = parti.join(' > ');
    if (p.assoluto || unico(candidato, el)) return candidato;
    corrente = corrente.parentElement; profondita += 1;
  }
  return parti.join(' > ');
}

/** Il taglio dell'HTML con la MISURA DICHIARATA: chi legge sa che è tagliato e quanto era intero. */
export function tagliaHtml(html, massimo) {
  var s = String(html || '');
  if (s.length <= massimo) return { testo: s, troncato: false, caratteri: s.length };
  return { testo: s.slice(0, massimo) + '… (troncato: ' + s.length + ' caratteri in tutto, mostrati i primi ' + massimo + ')', troncato: true, caratteri: s.length };
}

/** Il testo di un elemento, su una riga sola e corto. */
export function ripulisciTesto(testo, massimo) {
  return String(testo || '').replace(/\s+/g, ' ').trim().slice(0, massimo);
}

/* ══ La sorgente dell'overlay ═══════════════════════════════════════════════════════════════════ */

/* La parte che esiste solo nel browser: puntamento, stili calcolati, evidenza, spilli. Sta come
 * stringa perché parla con `document`, che in Node non c'è; le decisioni vere (selettore, tagli)
 * stanno nelle funzioni sopra, provate dai test. */
const COLLA = `
  function nostro(el) { return !!(el && el.getAttribute && el.getAttribute(TAG_NOSTRO)); }
  function sottoIlPunto(x, y) {
    var pila = document.elementsFromPoint ? document.elementsFromPoint(x, y) : [document.elementFromPoint(x, y)];
    for (var i = 0; i < pila.length; i += 1) { var e = pila[i]; if (e && e.nodeType === 1 && !nostro(e) && e !== document.documentElement) return e; }
    /* 07/9 - misurato su example.org: fuori dal contenuto elementsFromPoint torna SOLO ["HTML"], che
       il filtro qui sopra scarta di proposito (annotare l'intera pagina non serve a nessuno). Il
       risultato era un pacchetto vuoto identico a un guasto: chi guardava - io per primo - credeva
       che l'annotazione fosse rotta, e invece aveva cliccato sullo sfondo. Il corpo della pagina e'
       un elemento vero: si torna quello.
       ATTENZIONE: questo commento vive DENTRO una stringa template, quindi niente apici inversi. */
    if (pila.length && document.body) return document.body;
    return null;
  }
  /* Shadow DOM APERTO: si scende per prendere i FATTI veri (html, testo, stili), ma il SELETTORE
     resta quello dell'ospite — e' l'unico che document.querySelector puo' ritrovare. Il percorso
     dentro l'ombra viaggia a parte, in dentroShadow: niente selettore inventato. */
  function bersaglio(x, y) {
    var el = sottoIlPunto(x, y); var ospite = null; var dentro = [];
    while (el && el.shadowRoot && el.shadowRoot.elementFromPoint && dentro.length < 6) {
      var giu = el.shadowRoot.elementFromPoint(x, y);
      if (!giu || giu === el || giu.nodeType !== 1) break;
      if (!ospite) ospite = el;
      dentro.push(giu.tagName.toLowerCase());
      el = giu;
    }
    return { el: el, ospite: ospite, dentro: dentro };
  }
  function unico(sel, el) { try { var t = document.querySelectorAll(sel); return t.length === 1 && t[0] === el; } catch (e) { return false; } }
  function stiliCalcolati(el) {
    var out = {};
    try {
      var cs = getComputedStyle(el);
      for (var i = 0; i < STILI.length; i += 1) { var v = cs.getPropertyValue(STILI[i]); if (v && v !== 'none' && v !== 'normal' && v !== 'auto' && v !== '0px' && v !== 'static') out[STILI[i]] = v; }
    } catch (e) { /* un elemento staccato non ha stili: non e' un errore */ }
    return out;
  }
  function antenati(el) { var a = []; var e = el.parentElement; while (e && e.tagName !== 'HTML' && a.length < MASSIMI_ANTENATI) { a.unshift(e.tagName.toLowerCase() + (e.id ? '#' + e.id : '')); e = e.parentElement; } return a; }
  /* Da un mondo isolato gli indizi arrivano SOLO dagli attributi e dal DOM: le proprieta' appese ai
     nodi dal codice della pagina (__reactFiber$..., __vueParentComponent) e le globali (window.__NEXT_DATA__)
     qui non esistono. Le prende il mondo principale, da server, con una seconda lettura. */
  function indiziDagliAttributi(el) {
    var out = {}; var e = el;
    for (var g = 0; g < 6 && e; g += 1) {
      for (var i = 0; i < ATTRIBUTI_SORGENTE.length; i += 1) {
        var v = e.getAttribute ? e.getAttribute(ATTRIBUTI_SORGENTE[i]) : null;
        if (v && !out.file) out.file = String(v).slice(0, 300);
      }
      e = e.parentElement;
    }
    var framework = null;
    if (document.querySelector('script[src*="/@vite/client"]')) framework = 'Vite';
    if (!framework && document.querySelector('[class*="svelte-"]')) framework = 'Svelte';
    if (!framework && document.querySelector('script#__NEXT_DATA__')) framework = 'Next.js';
    if (!framework && document.querySelector('[data-v-app], [data-v-inspector]')) framework = 'Vue';
    if (framework) out.framework = framework;
    return out;
  }
  function descrivi(x, y) {
    var b = bersaglio(x, y);
    if (!b.el) return VUOTO();
    var perIlSelettore = b.ospite || b.el;
    var h = tagliaHtml(b.el.outerHTML || '', MASSIMO_HTML);
    var r = null;
    try { var q = b.el.getBoundingClientRect(); r = { x: Math.round(q.left + window.scrollX), y: Math.round(q.top + window.scrollY), larghezza: Math.round(q.width), altezza: Math.round(q.height) }; } catch (e) { r = null; }
    var p = VUOTO();
    p.trovato = true;
    p.selettore = selettoreStabile(perIlSelettore, unico, ATTRIBUTI_STABILI, ATTRIBUTI_DEBOLI);
    p.tag = String(b.el.tagName || '').toLowerCase();
    p.testo = ripulisciTesto(b.el.innerText || b.el.textContent || '', MASSIMO_TESTO);
    p.html = h.testo; p.htmlCaratteri = h.caratteri; p.htmlTroncato = h.troncato;
    p.stili = stiliCalcolati(b.el);
    p.rect = r;
    p.antenati = antenati(perIlSelettore);
    p.indiziSorgente = indiziDagliAttributi(b.el);
    p.dentroShadow = b.dentro.join(' > ');
    return p;
  }
  /* L'evidenza e gli spilli: sono nel DOM CONDIVISO, quindi marcati e senza eventi propri. */
  var evidenza = null; var spilli = []; var attivo = false; var ultimo = null;
  function creaEvidenza() {
    evidenza = document.createElement('div');
    evidenza.setAttribute(TAG_NOSTRO, 'evidenza');
    evidenza.style.cssText = 'position:absolute;pointer-events:none;z-index:2147483646;border:2px solid #c08b3c;background:rgba(192,139,60,.12);border-radius:4px;box-shadow:0 0 0 1px rgba(0,0,0,.35);display:none';
    document.documentElement.appendChild(evidenza);
  }
  function evidenzia(x, y) {
    var b = bersaglio(x, y); if (!b.el) return false;
    if (!evidenza || !evidenza.isConnected) creaEvidenza();
    var q = b.el.getBoundingClientRect();
    evidenza.style.display = 'block';
    evidenza.style.left = (q.left + window.scrollX) + 'px'; evidenza.style.top = (q.top + window.scrollY) + 'px';
    evidenza.style.width = q.width + 'px'; evidenza.style.height = q.height + 'px';
    return true;
  }
  function segna(numero, x, y) {
    var b = bersaglio(x, y); if (!b.el) return false;
    var q = b.el.getBoundingClientRect();
    var s = document.createElement('div');
    s.setAttribute(TAG_NOSTRO, 'spillo');
    s.textContent = String(numero);
    s.style.cssText = 'position:absolute;z-index:2147483647;left:' + (q.left + window.scrollX - 10) + 'px;top:' + (q.top + window.scrollY - 10) + 'px;min-width:20px;height:20px;padding:0 5px;border-radius:10px;background:#c08b3c;color:#fff;font:600 12px/20px system-ui,sans-serif;text-align:center;box-shadow:0 2px 6px rgba(0,0,0,.4);pointer-events:none';
    document.documentElement.appendChild(s);
    spilli.push(s);
    return true;
  }
  function suMossa(e) { if (attivo) evidenzia(e.clientX, e.clientY); }
  /* Il clic vero della persona (arriva come Input.dispatchMouseEvent dal server) si ferma qui:
     mentre si annota, la pagina non deve navigare. Le coordinate restano a disposizione. */
  function suClic(e) { if (!attivo) return; e.preventDefault(); e.stopPropagation(); ultimo = { x: e.clientX, y: e.clientY, quando: Date.now() }; }
  function accendi() { attivo = true; if (!evidenza || !evidenza.isConnected) creaEvidenza(); try { document.documentElement.style.cursor = 'crosshair'; } catch (e) {} return true; }
  function spegni() { attivo = false; try { document.documentElement.style.cursor = ''; } catch (e) {} if (evidenza) evidenza.style.display = 'none'; return true; }
  function svuotaSpilli() { for (var i = 0; i < spilli.length; i += 1) { try { spilli[i].remove(); } catch (e) {} } spilli = []; return true; }
  function smonta() {
    spegni(); svuotaSpilli();
    try { if (evidenza) evidenza.remove(); } catch (e) {}
    document.removeEventListener('mousemove', suMossa, true);
    document.removeEventListener('click', suClic, true);
    try { delete window.__talosAnnotaCdp; } catch (e) { window.__talosAnnotaCdp = undefined; }
    return true;
  }
  document.addEventListener('mousemove', suMossa, true);
  document.addEventListener('click', suClic, true);
  window.__talosAnnotaCdp = { versione: 1, mondo: MONDO, descrivi: descrivi, evidenzia: evidenzia, segna: segna, accendi: accendi, spegni: spegni, svuotaSpilli: svuotaSpilli, smonta: smonta, ultimoClic: function () { return ultimo; }, quantiSpilli: function () { return spilli.length; } };
`;

/**
 * Lo script dell'overlay, senza dipendenze esterne: una funzione che si autoinvoca, sicura da
 * rieseguire (se c'è già, esce). Le costanti sono letterali, le funzioni pure sono le stesse che i
 * test provano in Node — serializzate, non riscritte a mano.
 * @returns {string}
 */
export function sorgenteOverlay() {
  const costanti = [
    `var MONDO=${JSON.stringify(MONDO_OVERLAY)};`,
    `var TAG_NOSTRO=${JSON.stringify(TAG_NOSTRO)};`,
    /* una `var` per riga, non tre sulla stessa: il controllo delle costanti orfane (nel test) legge
       le dichiarazioni una per una, e con la forma a virgole le ultime due gli sfuggivano */
    `var MASSIMO_HTML=${MASSIMO_HTML};`,
    `var MASSIMO_TESTO=${MASSIMO_TESTO};`,
    `var MASSIMI_ANTENATI=${MASSIMI_ANTENATI};`,
    `var ATTRIBUTI_STABILI=${JSON.stringify(ATTRIBUTI_STABILI)};`,
    `var ATTRIBUTI_DEBOLI=${JSON.stringify(ATTRIBUTI_DEBOLI)};`,
    `var ATTRIBUTI_SORGENTE=${JSON.stringify(ATTRIBUTI_SORGENTE)};`,
    `var STILI=${JSON.stringify(STILI)};`,
    `var VUOTO=${pacchettoVuoto.toString()};`,
  ].join('\n  ');
  const pure = [escapaCss, classeStabile, pezzoSelettore, selettoreStabile, tagliaHtml, ripulisciTesto].map((f) => f.toString()).join('\n  ');
  return `(function(){"use strict";\n  if (window.__talosAnnotaCdp) return;\n  ${costanti}\n  ${pure}\n${COLLA}\n})();`;
}

/* ══ Il ponte col protocollo ════════════════════════════════════════════════════════════════════ */

/**
 * Il client CDP arriva da fuori (nessuna dipendenza nuova: chi lo costruisce parla `ws`). Qui si
 * accettano i due nomi che girano: `invia(metodo, parametri, sessionId)` o `send(...)`, `su`/`on`
 * per gli eventi. Un client che non sa inviare è un errore subito, non un guasto misterioso dopo.
 */
function porta(cdp) {
  const invia = typeof cdp?.invia === 'function' ? cdp.invia.bind(cdp) : (typeof cdp?.send === 'function' ? cdp.send.bind(cdp) : null);
  if (!invia) throw new TypeError('browser-annota: il client CDP deve avere «invia(metodo, parametri, sessionId)»');
  const ascolta = typeof cdp?.su === 'function' ? cdp.su.bind(cdp) : (typeof cdp?.on === 'function' ? cdp.on.bind(cdp) : null);
  const smettiDi = typeof cdp?.togli === 'function' ? cdp.togli.bind(cdp) : (typeof cdp?.off === 'function' ? cdp.off.bind(cdp) : null);
  return { invia, ascolta, smettiDi };
}

/** Una risposta CDP può portare l'errore nel corpo invece di lanciarlo: i due casi diventano uno. */
async function chiama(invia, metodo, parametri, sessionId) {
  const risposta = await invia(metodo, parametri || {}, sessionId);
  if (risposta && risposta.error) { const e = new Error(`${metodo}: ${risposta.error.message || 'errore CDP'}`); e.codiceCdp = risposta.error.code; throw e; }
  return risposta;
}

/** Il mondo isolato muore a ogni navigazione: lo si riconosce dal messaggio e si ricrea. */
function contestoPerduto(errore) {
  return /cannot find context|context (was destroyed|with specified id)|execution context/i.test(String(errore?.message || ''));
}

/* Un installato per sessione: l'identificatore dello script permanente e il contesto del documento
 * aperto. Chiave debole sul client, così due browser pilotati non si scambiano lo stato. */
const installati = new WeakMap();
function statoDi(cdp, sessionId) {
  if (!installati.has(cdp)) installati.set(cdp, new Map());
  const perSessione = installati.get(cdp);
  const chiave = sessionId || '(radice)';
  if (!perSessione.has(chiave)) perSessione.set(chiave, { identificatore: null, contesto: null, frameId: null });
  return perSessione.get(chiave);
}

/** Il contesto del mondo isolato per il documento APERTO ADESSO: creato, e lo script valutato dentro. */
async function apriMondo(invia, sessionId, stato) {
  const albero = await chiama(invia, 'Page.getFrameTree', {}, sessionId);
  const frameId = albero?.frameTree?.frame?.id || stato.frameId;
  if (!frameId) throw new Error('browser-annota: nessun frame principale da Page.getFrameTree');
  const mondo = await chiama(invia, 'Page.createIsolatedWorld', { frameId, worldName: MONDO_OVERLAY, grantUniveralAccess: false }, sessionId);
  const contesto = mondo?.executionContextId;
  if (contesto == null) throw new Error('browser-annota: Page.createIsolatedWorld non ha dato un executionContextId');
  await chiama(invia, 'Runtime.evaluate', { expression: sorgenteOverlay(), contextId: contesto, returnByValue: true, awaitPromise: false }, sessionId);
  stato.frameId = frameId; stato.contesto = contesto;
  return contesto;
}

/**
 * Installa l'overlay e lo fa sopravvivere alle navigazioni successive.
 * Due chiamate, non una, e servono tutte e due (vedi la testa del file):
 *  · `Page.addScriptToEvaluateOnNewDocument` con `worldName` → i documenti FUTURI, prima dei loro script;
 *  · `Page.createIsolatedWorld` + `Runtime.evaluate` → il documento GIÀ APERTO, che il primo non tocca.
 * @param {{invia?:Function, send?:Function}} cdp
 * @param {string|undefined} sessionId
 * @returns {Promise<{identificatore:string|null, contesto:number}>}
 */
export async function installaOverlay(cdp, sessionId, { sorgente = sorgenteOverlay() } = {}) {
  const { invia } = porta(cdp);
  const stato = statoDi(cdp, sessionId);
  await chiama(invia, 'Page.enable', {}, sessionId);
  if (!stato.identificatore) {
    const aggiunto = await chiama(invia, 'Page.addScriptToEvaluateOnNewDocument', { source: sorgente, worldName: MONDO_OVERLAY }, sessionId);
    stato.identificatore = aggiunto?.identifier || null;
  }
  const contesto = await apriMondo(invia, sessionId, stato);
  return { identificatore: stato.identificatore, contesto };
}

/**
 * Toglie l'overlay: prima lo script permanente (altrimenti torna alla prossima navigazione), poi i
 * nodi già appesi al documento aperto. Lo smontaggio nella pagina è «meglio se riesce»: se il
 * documento è cambiato sotto, quei nodi se ne sono già andati con lui.
 */
export async function togliOverlay(cdp, sessionId) {
  const { invia } = porta(cdp);
  const stato = statoDi(cdp, sessionId);
  let toltoScript = false;
  if (stato.identificatore) {
    await chiama(invia, 'Page.removeScriptToEvaluateOnNewDocument', { identifier: stato.identificatore }, sessionId);
    toltoScript = true; stato.identificatore = null;
  }
  let smontato = false;
  if (stato.contesto != null) {
    try {
      await chiama(invia, 'Runtime.evaluate', { expression: 'window.__talosAnnotaCdp ? window.__talosAnnotaCdp.smonta() : false', contextId: stato.contesto, returnByValue: true }, sessionId);
      smontato = true;
    } catch (errore) { if (!contestoPerduto(errore)) throw errore; }
    stato.contesto = null;
  }
  return { toltoScript, smontato };
}

/* Il mondo principale è l'UNICO che vede le proprietà appese ai nodi dalla pagina: `_debugSource` e
 * il nome del componente di React ≤18, `__vueParentComponent.type.__file` di Vue. Si entra per
 * SELETTORE (niente attributi aggiunti alla pagina, nessuna modifica) e in sola lettura. Il testo
 * che torna è della pagina: non affidabile, come tutto il resto. */
function sorgenteIndiziMondoPrincipale(selettore) {
  return `(function(){try{
    var el = document.querySelector(${JSON.stringify(selettore)});
    if (!el) return {};
    var out = {}; var e = el;
    for (var g = 0; g < 6 && e; g++) {
      var vue = e.__vueParentComponent;
      if (vue && vue.type) { if (!out.componente) out.componente = vue.type.name || vue.type.__name || null; if (!out.file && vue.type.__file) out.file = vue.type.__file; }
      for (var k in e) {
        if (k.indexOf('__reactFiber$') !== 0) continue;
        var fibra = e[k];
        for (var j = 0; j < 8 && fibra; j++) {
          if (fibra._debugSource && !out.file) out.file = fibra._debugSource.fileName + ':' + fibra._debugSource.lineNumber;
          if (fibra.type && typeof fibra.type === 'function' && !out.componente) out.componente = fibra.type.displayName || fibra.type.name || null;
          fibra = fibra._debugOwner || fibra.return;
        }
      }
      e = e.parentElement;
    }
    var f = null;
    if (window.__NEXT_DATA__) f = 'Next.js';
    else if (window.__NUXT__) f = 'Nuxt';
    else if (window.__vite_plugin_react_preamble_installed__) f = 'Vite';
    if (f) out.framework = f;
    if (out.componente) out.componente = String(out.componente).slice(0, 120);
    if (out.file) out.file = String(out.file).slice(0, 300);
    return out;
  }catch(err){return {};}})()`;
}

async function arricchisciDalMondoPrincipale(invia, sessionId, pacchetto) {
  if (!pacchetto.selettore) return pacchetto;
  try {
    /* niente `contextId`: omesso vuol dire mondo principale (CDP, Runtime.evaluate) */
    const r = await chiama(invia, 'Runtime.evaluate', { expression: sorgenteIndiziMondoPrincipale(pacchetto.selettore), returnByValue: true, awaitPromise: false }, sessionId);
    const indizi = r?.result?.value;
    if (indizi && typeof indizi === 'object') pacchetto.indiziSorgente = { ...pacchetto.indiziSorgente, ...indizi };
  } catch { /* il mondo principale è un di più: se non risponde, gli indizi restano quelli degli attributi */ }
  return pacchetto;
}

/**
 * Descrive l'elemento sotto un punto.
 * ⛔ `x` e `y` sono pixel CSS del VIEWPORT — le stesse coordinate di `Input.dispatchMouseEvent` e
 * quelle del fotogramma trasmesso una volta tolta la scala, NON coordinate di pagina: con la pagina
 * scrollata i due sistemi non coincidono, e `elementFromPoint` vuole il viewport.
 * @returns {Promise<{selettore:string, html:string, stili:object, antenati:string[], indiziSorgente:object, testo:string}>}
 */
export async function descriviElemento(cdp, sessionId, { x, y } = {}, { mondoPrincipale = true } = {}) {
  const { invia } = porta(cdp);
  const stato = statoDi(cdp, sessionId);
  const px = Number(x) || 0; const py = Number(y) || 0;
  const espressione = `(function(){ if (!window.__talosAnnotaCdp) return { assente: true }; return window.__talosAnnotaCdp.descrivi(${px}, ${py}); })()`;

  const unGiro = async (contesto) => chiama(invia, 'Runtime.evaluate', { expression: espressione, contextId: contesto, returnByValue: true, awaitPromise: false }, sessionId);

  let contesto = stato.contesto;
  if (contesto == null) contesto = await apriMondo(invia, sessionId, stato);
  let risposta;
  try { risposta = await unGiro(contesto); }
  catch (errore) {
    /* la pagina ha navigato: il mondo isolato di prima non esiste più. Una volta sola, poi si alza la mano. */
    if (!contestoPerduto(errore)) throw errore;
    contesto = await apriMondo(invia, sessionId, stato);
    risposta = await unGiro(contesto);
  }
  let valore = risposta?.result?.value;
  if (valore && valore.assente) {
    /* il contesto c'è ma l'overlay no: un documento nuovo nato senza lo script permanente */
    contesto = await apriMondo(invia, sessionId, stato);
    valore = (await unGiro(contesto))?.result?.value;
  }
  const pacchetto = { ...pacchettoVuoto(), ...(valore && typeof valore === 'object' && !valore.assente ? valore : {}) };
  delete pacchetto.assente;
  if (mondoPrincipale && pacchetto.trovato) await arricchisciDalMondoPrincipale(invia, sessionId, pacchetto);
  /* `sorgente` è il nome che `annotazioni.js` legge già nel pacchetto per il composer: lo stesso
     oggetto sotto tutti e due i nomi, così quel codice non va toccato. */
  pacchetto.sorgente = pacchetto.indiziSorgente;
  return pacchetto;
}

/* ══ Gli errori della pagina ════════════════════════════════════════════════════════════════════ */

/** Un `Runtime.RemoteObject` → una riga leggibile, senza mai chiedere altro al browser. */
export function testoRemoto(oggetto) {
  if (oggetto == null) return '';
  if (typeof oggetto !== 'object') return String(oggetto);
  if ('value' in oggetto && oggetto.value !== undefined) return typeof oggetto.value === 'string' ? oggetto.value : JSON.stringify(oggetto.value);
  if (oggetto.unserializableValue) return String(oggetto.unserializableValue);
  if (oggetto.description) return String(oggetto.description);
  if (oggetto.preview?.description) return String(oggetto.preview.description);
  return oggetto.className ? `[${oggetto.className}]` : `[${oggetto.type || 'oggetto'}]`;
}

/** I tipi di `console.*` che finiscono nel pacchetto: il resto (log, info, debug) è rumore. */
const CONSOLE_CHE_CONTANO = new Set(['error', 'warning', 'assert']);
/** I livelli del registro del browser che contano: `verbose` e `info` no. */
const LIVELLI_CHE_CONTANO = new Set(['error', 'warning']);

function riga(tipo, testo, origine) {
  return { tipo, testo: String(testo || '').replace(/\s+/g, ' ').trim().slice(0, MASSIMO_TESTO_ERRORE), origine, quando: new Date().toISOString() };
}

/**
 * Raccoglie gli errori della pagina. Torna SUBITO (sincrona) e si riempie mentre arrivano: gli
 * ascolti si registrano prima delle `enable`, così nessun evento cade nel buco fra le due cose.
 *
 * ⛔ Tre eventi, non uno (il perché è in testa al file): `Runtime.consoleAPICalled` per le chiamate
 * a `console.*`, `Runtime.exceptionThrown` per le eccezioni non catturate, `Log.entryAdded` per il
 * registro del browser — le richieste di rete fallite, la CSP, le deprecazioni: cose che nessuno
 * ha scritto con `console.error` e che senza questo evento non si vedrebbero mai.
 *
 * ⛔ SI CHIAMA PRIMA DI NAVIGARE. Misurato dal vivo il 07/09/2026: gli errori di una pagina GIÀ
 * caricata non tornano indietro — il protocollo non rigioca quello che è successo prima che ci
 * attaccassimo, e nella prima corsa il 404 dell'immagine era già passato quando abbiamo acceso i
 * domini. Chi integra apre la raccolta appena ha la sessione, non quando la persona clicca «annota».
 * @returns {{errori:Array<{tipo:string,testo:string,origine:string,quando:string}>, smetti:()=>void}}
 */
export function raccogliErrori(cdp, sessionId) {
  const { invia, ascolta, smettiDi } = porta(cdp);
  if (!ascolta) throw new TypeError('browser-annota: il client CDP deve avere «su(evento, gestore)» per raccogliere gli errori');
  const errori = [];
  const disdette = [];
  let vivo = true;

  const aggiungi = (voce) => { if (vivo && errori.length < MASSIMO_ERRORI) errori.push(voce); };
  /*
   * ⛔ Il secondo argomento di un ascolto NON ha una forma sola. Il client CDP di `browser-vivo.mjs`
   * (M2, letto il 07/09/2026) chiama `cb(params, { sessionId, metodo })` — un OGGETTO — mentre un
   * client scritto a mano passa spesso il `sessionId` nudo. Confrontando l'oggetto con la stringa
   * ogni evento risultava «di un'altra sessione» e veniva buttato: nessun errore, nessun avviso, e
   * un pacchetto senza console. Si accettano tutte e tre le forme.
   */
  const miaSessione = (parametri, secondo) => {
    if (!sessionId) return true;
    const arrivata = typeof secondo === 'string' ? secondo : (secondo?.sessionId ?? parametri?.sessionId ?? null);
    return !arrivata || arrivata === sessionId;
  };

  const gestori = {
    'Runtime.consoleAPICalled': (p, s) => {
      if (!miaSessione(p, s)) return;
      const tipo = String(p?.type || '');
      if (!CONSOLE_CHE_CONTANO.has(tipo)) return;
      const testo = (p?.args || []).map(testoRemoto).filter(Boolean).join(' ');
      aggiungi(riga('console', testo || `console.${tipo}`, `console.${tipo}`));
    },
    'Runtime.exceptionThrown': (p, s) => {
      if (!miaSessione(p, s)) return;
      const d = p?.exceptionDetails || {};
      const testo = [d.text, testoRemoto(d.exception)].filter(Boolean).join(' ') || 'eccezione senza testo';
      const dove = d.url ? ` — ${d.url}:${(d.lineNumber ?? 0) + 1}` : '';
      /* un rifiuto di promessa non gestito arriva QUI, non fra le chiamate a console */
      aggiungi(riga(/in promise/i.test(testo) ? 'promessa' : 'eccezione', testo + dove, 'Runtime.exceptionThrown'));
    },
    'Log.entryAdded': (p, s) => {
      if (!miaSessione(p, s)) return;
      const e = p?.entry || {};
      if (!LIVELLI_CHE_CONTANO.has(String(e.level || ''))) return;
      const dove = e.url ? ` — ${e.url}` : '';
      aggiungi(riga('browser', `${e.text || ''}${dove}`, `Log.${e.source || 'other'}`));
    },
  };

  for (const [evento, gestore] of Object.entries(gestori)) {
    const forse = ascolta(evento, gestore);
    if (typeof forse === 'function') disdette.push(forse);
    else if (smettiDi) disdette.push(() => smettiDi(evento, gestore));
  }
  /* le `enable` DOPO gli ascolti, e senza attendere: la funzione deve tornare sincrona (contratto) */
  const acceso = Promise.all([
    chiama(invia, 'Runtime.enable', {}, sessionId).catch(() => {}),
    chiama(invia, 'Log.enable', {}, sessionId).catch(() => {}),
  ]);

  return {
    errori,
    smetti() {
      if (!vivo) return;
      vivo = false;
      for (const d of disdette) { try { d(); } catch { /* un ascolto già chiuso non è un guasto */ } }
      acceso.then(() => Promise.all([
        chiama(invia, 'Log.disable', {}, sessionId).catch(() => {}),
        chiama(invia, 'Runtime.disable', {}, sessionId).catch(() => {}),
      ])).catch(() => {});
    },
  };
}
