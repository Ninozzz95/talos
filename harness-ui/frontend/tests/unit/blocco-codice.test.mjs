import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { creaBloccoCodice, aggiornaBloccoCodice, etichettaLinguaggio, chiaveLinguaggio, evidenziaInAttesa, vociBloccoCodice } from '../../src/components/conversazione.js';
import { t } from '../../src/components/lingua.js';

/*
 * 09/09/2026 — l'owner con lo screenshot: «i blocchi di codice appaiono frammentati in strisce
 * come codice inline, separati dalla barra lingua/Copia».
 *
 * Misurato in Chromium 151 sul CSS SPEDITO (sonda locale: una pagina file:// con i due fogli
 * concatenati nello stesso ordine di `scripts/cancello/statico.mjs`), PRIMA della cura:
 *   .code-block             background rgba(0,0,0,0) · border none · border-radius 0px
 *   .code-block pre > code  display inline · background rgb(43,44,48) · padding 1px 5px · radius 5px
 *   code.getClientRects()   5 rettangoli per 5 righe   ⇒ le «strisce»
 *   54 token Prism          1 SOLO colore              ⇒ evidenziazione invisibile
 *   pre.tabIndex            -1 con scrollWidth > clientWidth ⇒ tastiera esclusa
 *
 * Le cause sono due e vanno provate separate: il CSS (i primi tre test, sui fogli veri) e il
 * markup del renderer (il resto).
 */

const QUI = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND = path.join(QUI, '..', '..');
const leggi = (rel) => readFileSync(path.join(FRONTEND, rel), 'utf8');
/** Gli stessi due fogli, nello stesso ordine, che `scripts/cancello/statico.mjs` concatena per la app. */
const CSS_SPEDITO = [leggi('src/styles/index.css'), leggi('src/styles/foglio-monolite.css')].join('\n');

/** Le regole di un foglio il cui selettore nomina un pezzo, col loro corpo. */
function regoleCon(css, pezzoDelSelettore) {
  const fuori = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(css))) {
    const selettore = m[1].trim();
    if (selettore.includes(pezzoDelSelettore)) fuori.push({ selettore, corpo: m[2] });
  }
  return fuori;
}
const REGOLE_BLOCCO = () => regoleCon(CSS_SPEDITO, '.code-block');

/**
 * I nomi di variabile che una dichiarazione usa come valore PRIMARIO, cioè quelli da cui dipende
 * davvero. `var(--talos-border, var(--line))` dipende da `--talos-border`: la fallback non scatta
 * mai finché il primo è definito, e segnalarla sarebbe un falso allarme.
 */
function variabiliPrimarie(corpo) {
  const nomi = [];
  const re = /var\(\s*(--[\w-]+)/g;
  let m;
  let profondita = 0;
  let ultimoIndice = 0;
  while ((m = re.exec(corpo))) {
    // quante var( aperte restano a questo punto: se ce n'è già una, questa è dentro una fallback
    for (let k = ultimoIndice; k < m.index; k += 1) {
      if (corpo[k] === '(') profondita += 1;
      else if (corpo[k] === ')') profondita = Math.max(0, profondita - 1);
    }
    ultimoIndice = m.index;
    if (profondita === 0) nomi.push(m[1]);
    profondita += 1; // la parentesi di questa var(
    ultimoIndice = m.index + m[0].length;
  }
  return nomi;
}

test('CODICE-CSS-VARIABILI: il blocco non si veste con variabili che nella chat NON esistono', () => {
  /*
   * ⛔ LA CAUSA VERA del contenitore sparito. `--line`, `--bg-deep`, `--radius-card`, `--font-mono`
   * sono dichiarate SOLO su `dialog.sheet-dialog, dialog.command-dialog, .ft-actions-menu,
   * .talos-dialog` (foglio-monolite.css riga 34). La conversazione non è nessuno dei quattro: dentro
   * `.assistant-copy` quelle var() non risolvono, la dichiarazione è invalida al tempo del valore
   * calcolato e CADE — bordo, angoli e fondo spariscono senza un errore da nessuna parte.
   * È lo stesso guasto che il foglio documenta in testa per il velo `.talos-dialog` (07/09).
   */
  const soloNeiVeli = ['--line', '--bg-deep', '--radius-card', '--font-mono', '--surface', '--text-2', '--muted', '--accent'];
  const colpevoli = [];
  for (const { selettore, corpo } of REGOLE_BLOCCO()) {
    if (/(^|,)\s*(dialog\.|\.ft-actions-menu|\.talos-dialog)/.test(selettore)) continue; // là dentro quelle var esistono
    for (const v of variabiliPrimarie(corpo)) if (soloNeiVeli.includes(v)) colpevoli.push(`${selettore} -> var(${v})`);
  }
  assert.deepEqual(colpevoli, [], `il blocco di codice si veste con variabili non definite nella chat:\n${colpevoli.join('\n')}`);
});

test('CODICE-CSS-STRISCE: dentro <pre> il chip del codice inline è spento e il codice è un blocco solo', () => {
  /*
   * `.talos-message code{background:var(--talos-panel-soft); padding:1px 5px; border-radius:5px}`
   * (index.css) prende ANCHE il <code> dentro <pre>: `code` è inline, ogni riga è un line box e ogni
   * line box si dipinge il suo rettangolo ⇒ le strisce. Cura di css-tricks.com («Styling Code In and
   * Out of Blocks»): `pre code{display:block; background:none; padding:0}`.
   */
  const reset = REGOLE_BLOCCO().filter(({ selettore, corpo }) => /pre\s*>?\s*code/.test(selettore)
    && /display\s*:\s*block/.test(corpo)
    && /background\s*:\s*(none|transparent)/.test(corpo)
    && /padding\s*:\s*0/.test(corpo));
  assert.ok(reset.length > 0, 'manca la regola che spegne il chip del codice inline dentro <pre>: le righe restano strisce');
});

test('CODICE-CSS-EVIDENZIAZIONE: i token di Prism hanno un colore, e il tema chiaro è tarato', () => {
  // Misurato: 54 token generati da Prism, 1 solo colore a schermo — gira, ma nessuna regola lo veste.
  for (const classe of ['comment', 'keyword', 'string', 'number', 'function', 'punctuation']) {
    assert.ok(REGOLE_BLOCCO().some(({ selettore, corpo }) => selettore.includes(`.token.${classe}`) && /color\s*:/.test(corpo)),
      `nessun colore per .token.${classe}: l'evidenziazione non si vede`);
  }
  assert.ok(REGOLE_BLOCCO().some(({ selettore }) => selettore.includes('[data-theme="light"]')),
    'nessuna taratura dei colori del codice per il tema chiaro');
});

/* ------------------------------------------------------------------ renderer */

/** Nodo finto: le unit di questo repo non caricano un DOM (stessa forma di `tests/unit/browser-vivo.test.mjs`). */
function nodoFinto(tag) {
  const attributi = new Map();
  const nodo = {
    tag,
    figli: [],
    ascolti: [],
    classi: new Set(),
    dataset: {},
    disabled: false,
    scrollLeft: 0,
    testoProprio: null,
    html: '',
    get className() { return [...nodo.classi].join(' '); },
    set className(v) { nodo.classi = new Set(String(v).split(/\s+/).filter(Boolean)); },
    classList: {
      add: (...c) => c.forEach((x) => nodo.classi.add(x)),
      remove: (...c) => c.forEach((x) => nodo.classi.delete(x)),
      toggle: (c, forza) => (forza ? nodo.classi.add(c) : nodo.classi.delete(c)),
      contains: (c) => nodo.classi.has(c),
    },
    get textContent() { return nodo.testoProprio !== null ? nodo.testoProprio : nodo.figli.map((f) => f.textContent ?? '').join(''); },
    set textContent(v) { nodo.testoProprio = String(v); nodo.figli = []; nodo.html = ''; },
    get innerHTML() { return nodo.html; },
    set innerHTML(v) { nodo.html = String(v); nodo.testoProprio = null; },
    setAttribute: (k, v) => attributi.set(k, String(v)),
    getAttribute: (k) => (attributi.has(k) ? attributi.get(k) : null),
    removeAttribute: (k) => attributi.delete(k),
    append: (...x) => nodo.figli.push(...x),
    addEventListener: (t, m) => nodo.ascolti.push({ t, m }),
    lancia: (t, e = {}) => nodo.ascolti.filter((a) => a.t === t).forEach((a) => a.m({ type: t, ...e })),
    /** Ricerca a mano: il finto non ha querySelector, e qui serve solo cercare per classe o per tag. */
    trova: (classe) => (nodo.classi.has(classe) ? nodo : nodo.figli.map((f) => f.trova?.(classe)).find(Boolean) || null),
    trovaTag: (t) => (nodo.tag === t ? nodo : nodo.figli.map((f) => f.trovaTag?.(t)).find(Boolean) || null),
  };
  return nodo;
}
const documentoFinto = () => ({ createElement: (tag) => nodoFinto(tag) });
const CODICE = "const a = 1;\n  const b = '  due  ';\n\tterza\n";

test('CODICE-MARKUP: un contenitore solo — intestazione e codice dentro lo stesso blocco', () => {
  const blocco = creaBloccoCodice({ testo: CODICE, linguaggio: 'js', chiuso: true }, { document: documentoFinto() });
  assert.ok(blocco.classList.contains('code-block'));
  assert.equal(blocco.figli.length, 2, 'due figli soli: la barra e il codice, dentro lo stesso contenitore');
  const [testa, pre] = blocco.figli;
  assert.ok(testa.classList.contains('code-block-head'));
  assert.equal(pre.tag, 'pre');
  assert.equal(testa.trova('code-block-lang').textContent, 'JavaScript'); // il nome dichiarato, scritto per le persone
  assert.equal(testa.trova('code-block-copy').textContent, 'Copia');
  assert.equal(blocco.dataset.lingua, 'javascript');
});

test('CODICE-FEDELTA: indentazione, spazi e tab arrivano interi al <code> e alla copia', () => {
  const copiati = [];
  const blocco = creaBloccoCodice(
    { testo: CODICE, linguaggio: 'nonesiste', chiuso: true },
    { document: documentoFinto(), evidenzia: () => null, copia: (t) => { copiati.push(t); return Promise.resolve(); } },
  );
  assert.equal(blocco.trovaTag('code').textContent, CODICE, 'il testo del modello non si tocca: né trim né normalizzazioni');
  blocco.trova('code-block-copy').lancia('click');
  assert.deepEqual(copiati, [CODICE], 'la copia dà il testo GREZZO, non quello evidenziato');
});

test('CODICE-TASTIERA: il <pre> che scorre è raggiungibile, e dice cosa contiene', () => {
  /*
   * Misurato prima: scrollWidth > clientWidth con tabIndex -1 ⇒ chi usa la tastiera non arriva a fine
   * riga. La regola axe `scrollable-region-focusable` (dequeuniversity, letta 09/09/2026) chiede il
   * solo `tabindex="0"`; il nome lo diamo con `role="group"` e NON con `role="region"`, che è un
   * landmark: in una chat piena di blocchi riempirebbe l'elenco dei punti di riferimento.
   */
  const blocco = creaBloccoCodice({ testo: CODICE, linguaggio: 'py', chiuso: true }, { document: documentoFinto() });
  const pre = blocco.trovaTag('pre');
  assert.equal(pre.getAttribute('tabindex'), '0');
  assert.equal(pre.getAttribute('role'), 'group');
  assert.equal(pre.getAttribute('aria-label'), 'Blocco di codice Python');
});

test('CODICE-LINGUA-IGNOTA: si scrive quello che ha dichiarato il modello, non si indovina', () => {
  const doc = documentoFinto();
  const ignota = creaBloccoCodice({ testo: 'x', linguaggio: 'brainfuck', chiuso: true }, { document: doc, evidenzia: () => null });
  assert.equal(ignota.trova('code-block-lang').textContent, 'brainfuck');
  assert.equal(ignota.trovaTag('code').className, '', 'nessuna classe language-* se la grammatica non c’è');
  const nessuna = creaBloccoCodice({ testo: 'x', chiuso: true }, { document: doc, evidenzia: () => null });
  assert.equal(nessuna.trova('code-block-lang').textContent, 'testo');
  assert.equal(nessuna.trovaTag('pre').getAttribute('aria-label'), 'Blocco di codice');
  assert.equal(chiaveLinguaggio('py'), 'python');
  assert.equal(etichettaLinguaggio('  '), '');
});

test('CODICE-IN-ARRIVO: mentre il fence è aperto niente evidenziazione e niente copia a metà', () => {
  // Streamdown (streamdown.ai/docs/code-blocks, letto 09/09/2026): il pulsante copia si disabilita
  // durante lo streaming, e il blocco si disegna comunque anche senza i backtick di chiusura.
  let evidenziato = 0;
  const blocco = creaBloccoCodice(
    { testo: 'const a =', linguaggio: 'js', chiuso: false },
    { document: documentoFinto(), evidenzia: () => { evidenziato += 1; return '<span>x</span>'; } },
  );
  assert.ok(blocco.classList.contains('code-block-in-arrivo'));
  assert.equal(evidenziato, 0, 'evidenziare un testo che cambia a ogni frame è sfarfallio e costo, non colore');
  const bottone = blocco.trova('code-block-copy');
  assert.equal(bottone.disabled, true);
  assert.equal(bottone.textContent, 'In arrivo…');
  assert.equal(blocco.trovaTag('code').textContent, 'const a =', 'il testo si legge già mentre arriva');
});

test('CODICE-STREAMING: il blocco si aggiorna SUL POSTO e non perde la posizione di scorrimento', () => {
  /*
   * `renderizzaMarkdownIncrementale` (app.js) tiene il fence aperto nella CODA, e la coda si
   * distrugge a ogni frame: oggi il blocco viene ricostruito da zero e con lui se ne vanno
   * scorrimento e selezione. Con l'aggiornamento sul posto i nodi restano gli stessi.
   */
  const blocco = creaBloccoCodice({ testo: 'riga 1\n', linguaggio: 'js', chiuso: false }, { document: documentoFinto(), evidenzia: (t) => `EVID(${t})` });
  const pre = blocco.trovaTag('pre');
  const code = blocco.trovaTag('code');
  pre.scrollLeft = 120;
  aggiornaBloccoCodice(blocco, { testo: 'riga 1\nriga 2\n', chiuso: false });
  assert.equal(blocco.trovaTag('code'), code, 'stesso nodo: niente ricostruzione');
  assert.equal(code.textContent, 'riga 1\nriga 2\n');
  assert.equal(pre.scrollLeft, 120, 'la posizione di scorrimento non si perde a metà lettura');
  aggiornaBloccoCodice(blocco, { testo: 'riga 1\nriga 2\n', chiuso: true });
  assert.equal(blocco.classList.contains('code-block-in-arrivo'), false);
  assert.equal(blocco.trova('code-block-copy').disabled, false);
  assert.equal(code.innerHTML, 'EVID(riga 1\nriga 2\n)', 'alla chiusura del fence, e solo lì, si evidenzia');
});

test('CODICE-AL-CONTRARIO: il testo del modello resta testo, mai markup eseguito', () => {
  const veleno = '<img src=x onerror="alert(1)">';
  const blocco = creaBloccoCodice({ testo: veleno, linguaggio: 'nonesiste', chiuso: true }, { document: documentoFinto(), evidenzia: () => null });
  const code = blocco.trovaTag('code');
  assert.equal(code.textContent, veleno);
  assert.equal(code.innerHTML, '', 'senza grammatica non si passa MAI da innerHTML');
});

test('CODICE-RINVIO: in rigiocata il blocco nasce in testo e si colora solo quando è montato; senza rinvio, come sempre', () => {
  /*
   * B1 (bugfixer, 09/10/2026 sera): il profilo del ritorno su una chat di 300 giri dava ~480 ms a Prism + `innerHTML` di blocchi
   * che la finestra della rigiocata stacca subito. Come Hermes (`shiki-block.tsx:8-26`): testo subito, colore quando si vede.
   */
  let evidenziato = 0;
  let inRigiocata = true;
  const copiati = [];
  const evidenzia = (testo) => { evidenziato += 1; return `<span class="token">${testo}</span>`; };
  const blocco = creaBloccoCodice(
    { testo: CODICE, linguaggio: 'js', chiuso: true },
    { document: documentoFinto(), evidenzia, rinvia: () => inRigiocata, copia: (t) => { copiati.push(t); return Promise.resolve(); } },
  );
  const code = blocco.trovaTag('code');
  assert.equal(evidenziato, 0, 'in rigiocata non si colora niente');
  assert.equal(blocco.dataset.evidenziazione, 'in-attesa');
  assert.equal(code.textContent, CODICE, 'il testo si legge già, intero');
  assert.equal(code.className, '', 'nessuna classe language-* finché non è colorato davvero');
  blocco.trova('code-block-copy').lancia('click');
  assert.deepEqual(copiati, [CODICE], 'la copia funziona anche in attesa');
  const radice = { querySelectorAll: () => [blocco] };
  assert.equal(evidenziaInAttesa(radice), 0, 'finché la rigiocata non è finita resta in attesa');
  assert.equal(blocco.dataset.evidenziazione, 'in-attesa');
  inRigiocata = false;
  assert.equal(evidenziaInAttesa(radice), 1);
  assert.equal(evidenziato, 1);
  assert.equal(code.className, 'language-javascript');
  assert.equal(blocco.dataset.evidenziazione, undefined, 'colorato: non è più in attesa');
  assert.equal(evidenziaInAttesa(radice), 0, 'e non si ricolora una seconda volta');
  // al contrario: senza `rinvia` (o con rinvia falso) il blocco si colora subito, come prima di B1
  let subito = 0;
  const vivo = creaBloccoCodice({ testo: CODICE, linguaggio: 'js', chiuso: true }, { document: documentoFinto(), evidenzia: (t) => { subito += 1; return t; } });
  assert.equal(subito, 1);
  assert.equal(vivo.dataset.evidenziazione, undefined);
  assert.equal(vivo.trovaTag('code').className, 'language-javascript');
});

/* ------------------------------------------------- 23/10/2026: barra ferma, «⋯», esporta */

test('BLOCCO-ALTRO-01 — la barra ha «Copia» e «⋯» (mai di più), il «⋯» dice di quale codice si parla ed è spento mentre il blocco arriva; si accende alla chiusura', () => {
  const blocco = creaBloccoCodice({ testo: 'riga 1\n', linguaggio: 'py', chiuso: false }, { document: documentoFinto(), evidenzia: () => null });
  const testa = blocco.trova('code-block-head');
  const pulsanti = testa.figli.filter((f) => f.tag === 'button');
  assert.deepEqual(pulsanti.map((b) => b.className), ['code-block-copy', 'code-block-more'], 'due pulsanti: Copia e ⋯');
  const altro = blocco.trova('code-block-more');
  assert.equal(altro.getAttribute('aria-haspopup'), 'menu');
  assert.equal(altro.getAttribute('aria-expanded'), 'false');
  assert.equal(altro.getAttribute('aria-label'), t('chat.code.more', { language: 'Python' }));
  assert.equal(altro.disabled, true, 'spento mentre arriva');
  assert.deepEqual(vociBloccoCodice(blocco), [], 'nessuna voce mentre arriva');
  aggiornaBloccoCodice(blocco, { testo: 'riga 1\nriga 2\n', chiuso: true });
  assert.equal(altro.disabled, false, 'acceso alla chiusura');
  assert.equal(vociBloccoCodice(blocco).length, 3);
});

test('BLOCCO-ALTRO-02 — le voci scaricano il testo GREZZO nei tre formati, col nome dalla riga d\'apertura; «Comprimi» solo sopra le 40 righe, e lo stesso comando riapre', () => {
  const grezzo = Array.from({ length: 45 }, (_, i) => `linea ${i}\t  fine`).join('\n');
  const blocco = creaBloccoCodice({ testo: grezzo, linguaggio: 'python', chiuso: true, info: 'python sync.py' }, { document: documentoFinto(), evidenzia: () => '<span>x</span>' });
  const scaricati = [];
  const voci = vociBloccoCodice(blocco, { scarica: (f) => scaricati.push(f), ora: () => new Date(2026, 9, 23, 22, 14) });
  assert.deepEqual(voci.map((v) => v.chiave), ['sorgente', 'md', 'txt', 'comprimi']);
  assert.equal(voci[0].testo, t('chat.code.downloadAs', { ext: 'py' }));
  for (const v of voci.slice(0, 3)) v.fai();
  assert.deepEqual(scaricati.map((f) => f.nome), ['sync.py', 'sync.md', 'sync.txt']);
  assert.equal(scaricati[0].testo, grezzo, 'il testo grezzo, non quello evidenziato');
  assert.ok(scaricati[1].testo.includes(grezzo));
  /* Comprimi: la classe e la riga «Mostra tutte le N righe»; la voce diventa «Espandi» e lo riapre */
  voci[3].fai();
  assert.ok(blocco.classList.contains('code-block--compresso'));
  assert.equal(blocco.trova('code-block-espandi__pulsante')?.textContent, t('chat.code.showAllMany', { count: 45 }));
  const dopo = vociBloccoCodice(blocco);
  assert.equal(dopo.at(-1).testo, t('chat.code.expand'));
  /* AL CONTRARIO: un blocco corto non offre «Comprimi» */
  const corto = creaBloccoCodice({ testo: 'a\nb\n', linguaggio: 'js', chiuso: true }, { document: documentoFinto(), evidenzia: () => null });
  assert.deepEqual(vociBloccoCodice(corto).map((v) => v.chiave), ['sorgente', 'md', 'txt']);
});

test('BLOCCO-ALTRO-03 — il CSS: il blocco taglia con `clip` (mai `hidden`, che fermerebbe la barra al blocco) e la barra è sticky; nella chat sale degli 8 px del margine', () => {
  /* il lettore delle regole tiene anche il commento che precede il selettore: si confronta la fine */
  const blocco = REGOLE_BLOCCO().find((r) => /(^|\n|\/)\s*\.code-block$/u.test(r.selettore) && r.corpo.includes('--codice-fondo'));
  assert.match(blocco.corpo, /overflow:clip/);
  assert.doesNotMatch(blocco.corpo, /overflow:hidden/, 'AL CONTRARIO: hidden fa del blocco un contenitore di scorrimento e lo sticky muore');
  const testa = REGOLE_BLOCCO().find((r) => /(^|\n|\/)\s*\.code-block \.code-block-head$/u.test(r.selettore));
  assert.match(testa.corpo, /position:sticky/);
  assert.match(testa.corpo, /top:0/);
  const nellaChat = REGOLE_BLOCCO().find((r) => r.selettore.endsWith('.talos-conversation .code-block .code-block-head'));
  assert.match(nellaChat?.corpo ?? '', /top:-8px/);
  /* revisione F14: nella pagina del modello la barra della pagina è ferma (z-index 5) e coprirebbe quella del blocco: lì non si ferma */
  const nellaPaginaModello = REGOLE_BLOCCO().find((r) => r.selettore.endsWith('.talos-pagina-modello .code-block .code-block-head'));
  assert.match(nellaPaginaModello?.corpo ?? '', /position:static/);
  assert.match(CSS_SPEDITO, /\.talos-conversation\{flex:1 1 auto; min-height:0; overflow-y:auto; padding:8px /, 'il margine sopra della chat è 8 px: se cambia, cambia anche il top della barra');
});

test('BLOCCO-ALTRO-04 — revisione F4: dove il `<pre>` ha già un tetto suo (la conversazione figlia) «Comprimi» non si offre; AL CONTRARIO senza tetto sì', () => {
  const grezzo = Array.from({ length: 60 }, (_, i) => `riga ${i}`).join('\n');
  const conTetto = { ...documentoFinto(), defaultView: { getComputedStyle: () => ({ maxHeight: '320px' }) } };
  const nellaFiglia = creaBloccoCodice({ testo: grezzo, linguaggio: 'js', chiuso: true }, { document: conTetto, evidenzia: () => null });
  assert.deepEqual(vociBloccoCodice(nellaFiglia).map((v) => v.chiave), ['sorgente', 'md', 'txt']);
  const senzaTetto = { ...documentoFinto(), defaultView: { getComputedStyle: () => ({ maxHeight: 'none' }) } };
  const nellaChat = creaBloccoCodice({ testo: grezzo, linguaggio: 'js', chiuso: true }, { document: senzaTetto, evidenzia: () => null });
  assert.deepEqual(vociBloccoCodice(nellaChat).map((v) => v.chiave), ['sorgente', 'md', 'txt', 'comprimi']);
});

test('BLOCCO-ALTRO-05 — un codice in testo semplice non offre «Download as .txt» accanto a «Download as text (.txt)»: una voce sola', () => {
  const testo = creaBloccoCodice({ testo: 'riga\n', linguaggio: 'text', chiuso: true }, { document: documentoFinto(), evidenzia: () => null });
  assert.deepEqual(vociBloccoCodice(testo).map((v) => v.chiave), ['md', 'txt']);
  /* AL CONTRARIO: con una lingua vera la voce del suo file c'è */
  const py = creaBloccoCodice({ testo: 'x = 1\n', linguaggio: 'python', chiuso: true }, { document: documentoFinto(), evidenzia: () => null });
  assert.deepEqual(vociBloccoCodice(py).map((v) => v.chiave), ['sorgente', 'md', 'txt']);
});

test('BLOCCO-ALTRO-06 — «text» non è una lingua: l\'etichetta è quella tradotta e il nome del «⋯» non dice «text code»; AL CONTRARIO python sì', () => {
  const testo = creaBloccoCodice({ testo: 'riga\n', linguaggio: 'text', chiuso: true }, { document: documentoFinto(), evidenzia: () => null });
  assert.equal(testo.trova('code-block-lang').textContent, t('chat.code.plainText'));
  assert.equal(testo.trova('code-block-more').getAttribute('aria-label'), t('chat.code.morePlain'));
  const py = creaBloccoCodice({ testo: 'x\n', linguaggio: 'python', chiuso: true }, { document: documentoFinto(), evidenzia: () => null });
  assert.equal(py.trova('code-block-more').getAttribute('aria-label'), t('chat.code.more', { language: 'Python' }));
});

/* revisione 24/10 (riserve S4 sui blocchi di codice): niente doppione .md, ed etichette col nome della lingua */
test('BLOCCO-REV-01 — un blocco che è già un .md: una sola voce .md, GREZZA (senza recinto); gli altri tengono le tre voci', () => {
  for (const [linguaggio, info, nome] of [['markdown', 'markdown', /^talos-markdown-.*\.md$/u], ['text', 'text notes.md', /^notes\.md$/u]]) {
    const blocco = creaBloccoCodice({ testo: '# Titolo\n\ntesto\n', linguaggio, chiuso: true, info }, { document: documentoFinto(), evidenzia: () => null });
    const scaricati = [];
    const voci = vociBloccoCodice(blocco, { scarica: (f) => scaricati.push(f), ora: () => new Date(2026, 9, 24, 12, 0) });
    assert.deepEqual(voci.map((v) => v.chiave), ['sorgente', 'txt'], linguaggio);
    voci[0].fai();
    assert.match(scaricati[0].nome, nome, linguaggio);
    assert.equal(scaricati[0].testo, '# Titolo\n\ntesto\n', `${linguaggio}: il Markdown com'è, senza recinto`);
  }
  /* AL CONTRARIO: il codice tiene la versione Markdown col recinto */
  const py = creaBloccoCodice({ testo: 'x = 1\n', linguaggio: 'python', chiuso: true }, { document: documentoFinto(), evidenzia: () => null });
  assert.deepEqual(vociBloccoCodice(py).map((v) => v.chiave), ['sorgente', 'md', 'txt']);
});

test('BLOCCO-REV-02 — le etichette: html5 → HTML, c99 → C, css3 → CSS, es6 → JavaScript; url e hta come testo; una lingua ignota resta com\'è', () => {
  assert.deepEqual(['html5', 'c99', 'css3', 'php8', 'es6', 'ES2015'].map(etichettaLinguaggio), ['HTML', 'C', 'CSS', 'PHP', 'JavaScript', 'JavaScript']);
  assert.deepEqual(['url', 'hta', 'URL'].map(etichettaLinguaggio), ['', '', '']);
  /* revisione a blocco 3 (24/10/2026, S4): quando l'estensione è capita, l'etichetta è il nome di quella lingua (prima «python3» restava
     grezzo); una lingua ignota, o un formato a sé come json5, resta com'è */
  assert.deepEqual(['brainfuck', 'python3', 'Python', 'c++17', 'lua5.4', 'golang', 'json5'].map(etichettaLinguaggio),
    ['brainfuck', 'Python', 'Python', 'C++', 'Lua', 'Go', 'json5']);
});

test('BLOCCO-ALTRO-A-CAPO — «A capo» solo se una riga sborda, e lo stesso comando torna a «Una riga»; il testo scaricato resta grezzo', () => {
  const lunga = `const x = ${'"a".repeat(1) + '.repeat(40)}1;`;
  const blocco = creaBloccoCodice({ testo: `${lunga}\nconst y = 2;\n`, linguaggio: 'js', chiuso: true }, { document: documentoFinto(), evidenzia: () => null });
  const pre = blocco.figli.find((f) => f.tag === 'pre');
  assert.ok(pre, 'il <pre> del blocco');
  /* AL CONTRARIO: nessuna riga oltre il bordo ⇒ la voce non c'è (non cambierebbe niente) */
  pre.scrollWidth = 400; pre.clientWidth = 400;
  assert.deepEqual(vociBloccoCodice(blocco).map((v) => v.chiave), ['sorgente', 'md', 'txt']);
  /* una riga più larga del blocco ⇒ «A capo»; dopo, la classe e la voce che torna indietro */
  pre.scrollWidth = 900;
  const voci = vociBloccoCodice(blocco);
  assert.deepEqual(voci.map((v) => v.chiave), ['sorgente', 'md', 'txt', 'a-capo']);
  assert.equal(voci.at(-1).testo, t('chat.code.wrap'));
  voci.at(-1).fai();
  assert.ok(blocco.classList.contains('code-block--a-capo'));
  pre.scrollWidth = 400; // ora va a capo: niente sborda più, ma la voce resta per tornare indietro
  const dopo = vociBloccoCodice(blocco);
  assert.equal(dopo.at(-1).chiave, 'a-capo');
  assert.equal(dopo.at(-1).testo, t('chat.code.noWrap'));
  dopo.at(-1).fai();
  assert.ok(!blocco.classList.contains('code-block--a-capo'));
  /* il CSS: va a capo solo col segno, e senza toccare il testo */
  const css = readFileSync(path.join(QUI, '../../src/styles/index.css'), 'utf8');
  assert.match(css, /\.code-block\.code-block--a-capo pre > code\{white-space:pre-wrap; overflow-wrap:anywhere\}/u);
});
