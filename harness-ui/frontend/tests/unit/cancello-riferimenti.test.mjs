import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LIMITI,
  alternative,
  analizzaRiferimentiMorti,
  attributoDaNomeDataset,
  classiSenzaRegola,
  datiSenzaGestore,
  nomeDatasetDaAttributo,
  regoleSenzaBersaglio,
  selettoriCss,
  senzaCommentiJs,
  simboliMancanti,
} from '../../scripts/cancello/riferimenti-morti.mjs';

/*
 * ⛔ Queste prove nascono da due difetti veri del 06/9, e ognuna si gioca DUE volte: una perché il
 * cancello trovi il difetto, e una perché NON lo trovi dove non c'è. Un cancello che accusa a vuoto
 * muore di falsi positivi — nessuno lo legge più — e allora è come non averlo (è la lezione del
 * cancello semantico, spento da sempre senza che una sola prova se ne accorgesse: ognuna dimostrava
 * che una scrittura LEGITTIMA passava, e un cancello inerte supera quella prova come uno vero).
 */

const CLASSI = (nomi) => nomi.map((n) => `.${n}`);

// ───────────────────────────────── 1 · simboli chiamati e mai disegnati ──────────────────────────

const SPRITE_COMPLETO = [
  '<svg class="talos-sprite">',
  '<symbol id="i-file" viewBox="0 0 24 24"><path d="M1 1"/></symbol>',
  '<symbol id="i-folder-open" viewBox="0 0 24 24"><path d="M2 2"/></symbol>',
  '<symbol id="i-chevron" viewBox="0 0 24 24"><path d="M3 3"/></symbol>',
  '<symbol id="i-chevron-right" viewBox="0 0 24 24"><path d="M4 4"/></symbol>',
  '</svg>',
].join('\n');

test('simboli — le QUATTRO forme di scrittura vengono viste, non solo icon(\'i-x\')', () => {
  /*
   * ⛔ È la trappola dichiarata dal contratto: cercare solo `icon('i-x')` ha fatto contare 7 simboli
   *    mancanti su 12 veri. Qui lo stesso nome mancante è scritto in quattro modi diversi, e nessuno
   *    di loro deve poter sfuggire.
   */
  const sorgenti = {
    'app.js': [
      "const a = icon('i-manca-uno');",
      "const menu = { icona: 'i-manca-due' };",
      "const b = icon(aperto ? 'i-chevron' : 'i-manca-tre');",
      'schermo.innerHTML = `<svg><use href="#i-manca-quattro"></use></svg>`;',
    ].join('\n'),
  };
  const trovati = simboliMancanti({ html: SPRITE_COMPLETO, sorgenti }).map((r) => r.cosa).sort();
  assert.deepEqual(trovati, ['#i-manca-due', '#i-manca-quattro', '#i-manca-tre', '#i-manca-uno']);
});

test('simboli — AL CONTRARIO: se lo sprite li disegna tutti, il rapporto è vuoto', () => {
  const sorgenti = {
    'app.js': "icon('i-file'); const m = { icona: 'i-folder-open' }; icon(x ? 'i-chevron' : 'i-chevron-right');",
  };
  assert.deepEqual(simboliMancanti({ html: SPRITE_COMPLETO, sorgenti }), []);
});

test('simboli — un\'ancora <a href="#sezione"> NON è un simbolo mancante', () => {
  // Il primo falso positivo possibile: nel markup si guarda solo dentro `<use>`.
  const html = `${SPRITE_COMPLETO}\n<a href="#impostazioni">Vai</a>`;
  assert.deepEqual(simboliMancanti({ html, sorgenti: {} }), []);
});

test('simboli — un nome citato in un COMMENTO non è una chiamata', () => {
  // Senza lo spegnimento dei commenti, ogni nota tecnica del codice diventerebbe un\'accusa.
  const sorgenti = { 'app.js': "// prima si chiamava 'i-vecchio-nome'\nicon('i-file');" };
  assert.deepEqual(simboliMancanti({ html: SPRITE_COMPLETO, sorgenti }), []);
});

test('simboli — il posto è nominato: file e riga, non «da qualche parte»', () => {
  const sorgenti = { 'src/legacy/app.js': "riga uno\nriga due\nicon('i-assente');" };
  const [riferimento] = simboliMancanti({ html: SPRITE_COMPLETO, sorgenti });
  assert.equal(riferimento.dove, 'src/legacy/app.js:3');
  assert.match(riferimento.perche, /buco muto/);
});

// ─────────────────────────────── 2 · le classi che nessuna regola dipinge ────────────────────────

test('classi — una classe che nessuna regola nomina viene detta, col posto', () => {
  const html = '<div class="talos-card refuso-tipografico">ciao</div>';
  const css = '.talos-card{ padding: 8px; }';
  const trovate = classiSenzaRegola({ html, css, sorgenti: {} });
  assert.deepEqual(trovate.map((r) => r.cosa), ['.refuso-tipografico']);
  assert.equal(trovate[0].dove, 'index.template.html:1');
});

test('classi — IL DIFETTO DEL 06/9: .sheet-option esiste solo come .sheet-option.active', () => {
  /*
   * ⛔ Questa è la prova che un controllo ingenuo NON supera: `.sheet-option` nel CSS c'era, quindi
   *    chiedersi «la classe è nominata da qualche parte?» avrebbe risposto sì mentre un foglio
   *    intero era illeggibile col testo tutto attaccato. La domanda giusta è un\'altra: su QUESTO
   *    elemento, esiste una regola che possa mordere?
   */
  const html = [
    '<button class="sheet-option">Nuova sessione</button>',
    '<button class="sheet-option active">Modello</button>',
  ].join('\n');
  const css = '.sheet-option.active{ background: gold; }';
  const trovate = classiSenzaRegola({ html, css, sorgenti: {} });
  const riga = trovate.find((r) => r.cosa === '.sheet-option');
  assert.ok(riga, 'la classe senza regola di base deve essere segnalata');
  assert.equal(riga.dove, 'index.template.html:1', 'solo l\'elemento nudo, non quello che ha .active');
  assert.match(riga.perche, /manca la regola di base/);
});

test('classi — AL CONTRARIO: con la regola di base al suo posto, nessuno viene accusato', () => {
  const html = [
    '<button class="sheet-option">Nuova sessione</button>',
    '<button class="sheet-option active">Modello</button>',
  ].join('\n');
  const css = '.sheet-option{ display: grid; gap: 8px; }\n.sheet-option.active{ background: gold; }';
  assert.deepEqual(classiSenzaRegola({ html, css, sorgenti: {} }), []);
});

test('classi — una classe viva SOLO in :hover conta come dipinta (lettura prudente, dichiarata)', () => {
  // Perde semmai un difetto, non ne inventa uno: è la direzione in cui vogliamo sbagliare.
  const html = '<button class="ghost">x</button>';
  const css = '.ghost:hover{ background: #222; }';
  assert.deepEqual(classiSenzaRegola({ html, css, sorgenti: {} }), []);
});

test('classi — quelle costruite a runtime non si vedono e NON si segnalano (limite dichiarato)', () => {
  const sorgenti = { 'app.js': 'el.className = `talos-stato--${stato}`;' };
  const trovate = classiSenzaRegola({ html: '', css: '.talos-stato--vivo{color:red}', sorgenti });
  assert.deepEqual(trovate, [], 'un token con ${} non è un nome: né accusato né contato come vivo');
  assert.ok(LIMITI.some((l) => /runtime/i.test(l)), 'e il limite è scritto, non taciuto');
});

test('classi — il markup dentro un template literal del JS viene letto come markup', () => {
  const sorgenti = { 'app.js': 'schermo.innerHTML = `<div class="pannello-fantasma">x</div>`;' };
  const trovate = classiSenzaRegola({ html: '', css: '.altro{color:red}', sorgenti });
  assert.deepEqual(trovate.map((r) => r.cosa), ['.pannello-fantasma']);
});

test('classi — className = "text-btn compact" con CSS «.primary-btn.compact»: il compatto non arriva', () => {
  // Difetto vero trovato dal cancello su app.js:12556 mentre lo si scriveva.
  const sorgenti = { 'app.js': "bottone.className = 'text-btn compact';" };
  const css = '.text-btn{ color: gold; }\n.primary-btn.compact{ height: 36px; }';
  const trovate = classiSenzaRegola({ html: '', css, sorgenti });
  assert.deepEqual(trovate.map((r) => r.cosa), ['.compact']);
});

test('classi — classList.add non dice le ALTRE classi: da lì non si deduce «elemento nudo»', () => {
  /*
   * ⛔ Al contrario del caso sopra: `classList.add('compact')` non dice cosa c'era già sull\'elemento,
   *    quindi affermare che la condizione manca sarebbe inventato. Il nome resta però «vivo».
   */
  const sorgenti = { 'app.js': "bottone.classList.add('compact');" };
  const css = '.primary-btn.compact{ height: 36px; }';
  assert.deepEqual(classiSenzaRegola({ html: '', css, sorgenti }), []);
});

test('classi — un «content: \'.finta\'» nel CSS non fa esistere una classe', () => {
  const html = '<div class="vera"></div>';
  const css = '.vera::after{ content: ".finta"; }';
  assert.deepEqual(classiSenzaRegola({ html, css, sorgenti: {} }), []);
});

// ────────────────────────────── 3 · i data-* che nessun gestore riconosce ────────────────────────

test('data-* — un attributo che nessuno legge viene detto; gli altri tre no', () => {
  const html = [
    '<div data-orfano="1">a</div>',
    '<div data-auto-refresh="1">b</div>',
    '<div data-apre-velo="veloModelli">c</div>',
    '<div data-tema="scuro">d</div>',
  ].join('\n');
  const css = '[data-tema="scuro"]{ color: white; }';
  const sorgenti = {
    'app.js': [
      'if (nodo.dataset.autoRefresh) aggiorna();',
      "const b = evento.target.closest('[data-apre-velo]');",
    ].join('\n'),
  };
  const trovati = datiSenzaGestore({ html, css, sorgenti });
  assert.deepEqual(trovati.map((r) => r.cosa), ['data-orfano']);
  assert.equal(trovati[0].dove, 'index.template.html:1');
});

test('data-* — AL CONTRARIO: appena un gestore lo nomina, l\'accusa sparisce', () => {
  const html = '<div data-orfano="1">a</div>';
  const senza = datiSenzaGestore({ html, css: '', sorgenti: {} });
  const con = datiSenzaGestore({ html, css: '', sorgenti: { 'app.js': 'if (nodo.dataset.orfano) fai();' } });
  assert.equal(senza.length, 1);
  assert.deepEqual(con, [], 'dataset.orfano È il gestore di data-orfano');
});

test('data-* — il CSS è un gestore a pieno titolo: [data-theme] non è un orfano', () => {
  const trovati = datiSenzaGestore({ html: '<html data-theme="scuro">', css: 'html[data-theme="scuro"]{ color: #fff; }', sorgenti: {} });
  assert.deepEqual(trovati, []);
});

test('data-* — la conversione segue lo standard: il trattino cade solo davanti a una lettera', () => {
  // MDN, «HTMLElement: dataset property» (letta il 06/09/2026): davanti a una cifra il trattino RESTA.
  assert.equal(nomeDatasetDaAttributo('data-auto-refresh'), 'autoRefresh');
  assert.equal(nomeDatasetDaAttributo('data-c'), 'c');
  assert.equal(nomeDatasetDaAttributo('data-col-2'), 'col-2');
  assert.equal(attributoDaNomeDataset('autoRefresh'), 'data-auto-refresh');
  assert.equal(attributoDaNomeDataset(nomeDatasetDaAttributo('data-apre-velo')), 'data-apre-velo');
});

// ───────────────────────────── 4 · le regole CSS che non agganciano niente ───────────────────────

test('regole — un selettore che pretende una classe inesistente viene detto, con la riga', () => {
  const html = '<div class="viva"></div>';
  const css = { 'styles.css': '.viva{ color: gold; }\n.mai-nata{ color: red; }' };
  const trovate = regoleSenzaBersaglio({ html, css, sorgenti: {} });
  assert.deepEqual(trovate.map((r) => r.cosa), ['.mai-nata']);
  assert.equal(trovate[0].dove, 'styles.css:2');
});

test('regole — AL CONTRARIO: tutto ciò che il markup usa davvero resta intoccato', () => {
  const html = '<section class="pannello"><b class="etichetta"></b></section>';
  const css = '.pannello{ padding: 8px; }\n.pannello .etichetta{ font-weight: 700; }\n.pannello:hover{ opacity: .9; }';
  assert.deepEqual(regoleSenzaBersaglio({ html, css, sorgenti: {} }), []);
});

test('regole — TRAPPOLA: pseudo-classi e @keyframes non sono mai segnalati', () => {
  /*
   * ⛔ È la trappola dichiarata dalla fonte (Project Wallace, coverage CSS): `:hover`, `:focus`,
   *    `:popover-open` e i fotogrammi non compaiono mai nel markup PER COSTRUZIONE. Se finissero nel
   *    rapporto, sarebbe tutto rumore e alla seconda volta nessuno lo aprirebbe più.
   */
  const html = '<div class="bolla"></div>';
  const css = [
    '@keyframes talos-pulsa{ from{ opacity: 0; } 50%{ opacity: .5; } to{ opacity: 1; } }',
    '.bolla:hover{ opacity: .8; }',
    '.bolla:popover-open{ display: block; }',
    '.bolla::after{ content: ""; }',
    '.bolla:not(.mai-esistita){ color: gold; }',
  ].join('\n');
  assert.deepEqual(regoleSenzaBersaglio({ html, css, sorgenti: {} }), []);
});

test('regole — un selettore di soli tag o attributi non viene giudicato', () => {
  const css = 'body{ margin: 0; }\n:root{ --x: 1; }\ninput[type="text"]{ border: 0; }\n[hidden]{ display: none; }';
  assert.deepEqual(regoleSenzaBersaglio({ html: '<body></body>', css, sorgenti: {} }), []);
});

test('regole — una classe che vive solo dentro un querySelector del codice è viva', () => {
  // Il codice la cerca: la regola serve a qualcosa anche se il markup statico non la scrive.
  const sorgenti = { 'app.js': "document.querySelector('.menu-azioni')?.remove();" };
  assert.deepEqual(regoleSenzaBersaglio({ html: '', css: '.menu-azioni{ z-index: 4; }', sorgenti }), []);
});

test('regole — una lista di selettori muore solo se muoiono TUTTE le alternative', () => {
  const html = '<div class="viva"></div>';
  const viva = regoleSenzaBersaglio({ html, css: '.viva, .fantasma{ color: gold; }', sorgenti: {} });
  const morta = regoleSenzaBersaglio({ html, css: '.fantasma, .altro-fantasma{ color: gold; }', sorgenti: {} });
  assert.deepEqual(viva, [], 'basta un\'alternativa viva perché la regola dipinga qualcosa');
  assert.equal(morta.length, 1);
  assert.match(morta[0].perche, /«\.fantasma».*«\.altro-fantasma»/);
});

test('regole — dentro un @media si giudica, dentro un @keyframes no', () => {
  const css = [
    '@media (max-width: 900px){',
    '  .fantasma-in-media{ display: none; }',
    '}',
    '@keyframes gira{ from{ transform: rotate(0); } to{ transform: rotate(1turn); } }',
  ].join('\n');
  const trovate = regoleSenzaBersaglio({ html: '', css, sorgenti: {} });
  assert.deepEqual(trovate.map((r) => r.cosa), ['.fantasma-in-media']);
  assert.equal(trovate[0].dove, 'styles.css:2');
});

test('regole — un #id messo dal codice (getElementById) non rende morta la sua regola', () => {
  const sorgenti = { 'app.js': "const t = document.getElementById('talosTip');" };
  assert.deepEqual(regoleSenzaBersaglio({ html: '', css: '#talosTip{ position: fixed; }', sorgenti }), []);
});

// ─────────────────────────────────── le fondamenta, provate a parte ──────────────────────────────

test('selettoriCss — conta le righe vere e salta i fotogrammi', () => {
  const css = ['/* nota', '   su due righe */', '.uno{ color: red; }', '@media print{', '  .due{ color: blue; }', '}'].join('\n');
  const trovati = selettoriCss({ css }).map((s) => `${s.selettore}@${s.riga}`);
  assert.deepEqual(trovati, ['.uno@3', '.due@5']);
});

test('senzaCommentiJs — una barra dentro una stringa non è un commento', () => {
  const codice = senzaCommentiJs("const u = 'https://esempio.it/x'; // via questa\nconst v = 1;");
  assert.match(codice, /https:\/\/esempio\.it\/x/, 'la stringa resta intera');
  assert.doesNotMatch(codice, /via questa/, 'il commento vero sparisce');
  assert.equal(codice.split('\n').length, 2, 'e le righe restano quelle che erano');
});

test('senzaCommentiJs — i template literal annidati non fanno perdere il filo', () => {
  const sorgente = 'const t = `<div class="a ${b ? `x` : \'y\'}">/* non un commento */</div>`;\nicon(\'i-dopo\');';
  const codice = senzaCommentiJs(sorgente);
  assert.match(codice, /i-dopo/, 'il codice dopo il template annidato è ancora leggibile');
  assert.match(codice, /non un commento/, 'ciò che sta in una stringa non è un commento');
});

test('alternative — le virgole dentro :is(...) non spezzano il selettore', () => {
  assert.deepEqual(alternative(':is(.a, .b) .c, .d'), [':is(.a, .b) .c', '.d']);
});

test('analizzaRiferimentiMorti — le quattro domande insieme, e i limiti dichiarati', () => {
  const risposta = analizzaRiferimentiMorti({ html: SPRITE_COMPLETO, css: '', sorgenti: {} });
  assert.deepEqual(Object.keys(risposta).sort(), ['classiSenzaRegola', 'datiSenzaGestore', 'regoleSenzaBersaglio', 'simboliMancanti']);
  for (const lista of Object.values(risposta)) assert.ok(Array.isArray(lista));
  assert.ok(LIMITI.length >= 5, 'ciò che il cancello non vede è scritto, non lasciato credere pulito');
});

test('ogni riga del rapporto porta cosa, dove e perché — o non è azionabile', () => {
  const risposta = analizzaRiferimentiMorti({
    html: '<div class="orfana" data-nessuno="1"></div>',
    css: '.mai-nata{ color: red; }',
    sorgenti: { 'app.js': "icon('i-assente');" },
  });
  const righe = Object.values(risposta).flat();
  assert.equal(righe.length, 4, 'un difetto per classe, tutti e quattro trovati nello stesso giro');
  for (const riga of righe) {
    assert.deepEqual(Object.keys(riga).sort(), ['cosa', 'dove', 'perche']);
    for (const valore of Object.values(riga)) assert.ok(valore && typeof valore === 'string');
  }
  assert.deepEqual(risposta.classiSenzaRegola.map((r) => r.cosa), CLASSI(['orfana']));
});
