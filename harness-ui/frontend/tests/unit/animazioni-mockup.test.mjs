import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { movimentoSpento, millisecondiDelToken, easeDelTema } from '../../src/components/motion-mockup.js';

/*
 * L'INVENTARIO DELLE ANIMAZIONI DEL MOCKUP — il cancello che si accorge se una sparisce.
 *
 * Ordine dell'owner dell'11/09/2026: «fai in modo che le animazioni del mockup siano riportate alla
 * perfezione nella app». Questo file è l'elenco di ciò che è stato portato, con la forma esatta, e
 * fallisce se una di quelle forme non arriva più al pacchetto costruito.
 *
 * ⛔ PERCHÉ SI GUARDA IL BUNDLE E NON SOLO IL SORGENTE. Un'animazione può esserci nel sorgente e
 *   non arrivare a schermo: basta che nessuno importi il foglio (`main.css`) o che nessuno monti il
 *   componente (`main.js`). È lo stesso buco che il repo ha già pagato — «funzione coi test e
 *   nessun chiamante» — e una prova che legge solo il file di partenza non lo vede.
 *   ⇒ Si controllano TUTTE E DUE le cose: la forma nel sorgente (che dice anche COSA deve essere,
 *     leggibile da chi passa di qui) e la sua presenza in `dist/`, quando un `dist/` c'è.
 * ⛔ Il `dist/` può mancare (un `git clone` pulito non l'ha): in quel caso quella metà si salta
 *   dichiarandolo, invece di passare in silenzio fingendo di aver guardato.
 *
 * ⛔ E SI GUARDA ANCHE IL MOCKUP: se il file dell'owner cambia e una di queste forme non c'è più,
 *   la fonte e la copia hanno smesso di parlarsi, e il posto dove accorgersene è qui.
 */

const QUI = dirname(fileURLToPath(import.meta.url));
const RADICE = dirname(dirname(QUI));
const REPO = dirname(dirname(RADICE));
const leggi = (p) => readFileSync(p, 'utf8');

/*
 * ⛔ IL CONFRONTO SI NORMALIZZA, e non è pigrizia: esbuild riscrive gli apici singoli in doppi e
 *   riformatta gli spazi del CSS. Un confronto alla lettera sul pacchetto costruito sarebbe rosso
 *   per una virgoletta, cioè un cancello che grida al lupo — e un cancello che grida sempre viene
 *   spento. Restano significativi i caratteri che descrivono l'animazione: nomi, numeri, unità.
 */
const normale = (t) => String(t).replace(/'/g, '"').replace(/\s+/g, ' ');
const contiene = (dove, cosa) => normale(dove).includes(normale(cosa));

const SORGENTI = {
  motore: leggi(join(RADICE, 'src/components/motion-mockup.js')),
  regia: leggi(join(RADICE, 'src/components/animazioni-mockup.js')),
  sezione: leggi(join(RADICE, 'src/components/sezione-elenco-dettaglio.js')),
  modale: leggi(join(RADICE, 'src/components/modale-td.js')),
  foglio: leggi(join(RADICE, 'src/styles/mockup-animazioni.css')),
  mainCss: leggi(join(RADICE, 'src/styles/main.css')),
  mainJs: leggi(join(RADICE, 'src/main.js')),
};

const DIST_JS = join(RADICE, 'dist/app.js');
const DIST_CSS = join(RADICE, 'dist/styles.css');
const MOCKUP = join(REPO, '.claude/refactor-ui-owner-2026-09-11/Talos_Desktop_Final_Mockup_Interattivo.html');

/**
 * L'inventario. Per ogni riga:
 *   `superficie`  — dove si vede;
 *   `mockup`      — la forma nel file dell'owner (la fonte, verbatim o quasi);
 *   `nostra`      — la forma nel nostro sorgente;
 *   `dove`        — quale sorgente la contiene;
 *   `bundle`      — 'js' o 'css', cioè in quale pacchetto deve arrivare;
 *   `durata`      — il token e il fattore, cioè quanto dura (misurato, non dedotto).
 */
const INVENTARIO = [
  {
    superficie: 'pressione di un pulsante',
    mockup: "[{scale:'1'},{scale:'.985'},{scale:'1'}]",
    nostra: "[{ scale: '1' }, { scale: '.985' }, { scale: '1' }]",
    dove: 'regia', bundle: 'js', durata: 'control ×1 = 160 ms',
  },
  {
    superficie: 'gruppo della barra che si apre',
    mockup: "[{opacity:.3,transform:'translateY(-4px)'},{opacity:1,transform:'none'}]",
    nostra: "[{ opacity: 0.3, transform: 'translateY(-4px)' }, { opacity: 1, transform: 'none' }]",
    dove: 'regia', bundle: 'js', durata: 'surface-enter ×1 = 180 ms',
  },
  {
    superficie: 'pannello delle impostazioni',
    mockup: "[{opacity:.3,transform:'translateX(5px)'},{opacity:1,transform:'none'}]",
    nostra: "[{ opacity: 0.3, transform: 'translateX(5px)' }, { opacity: 1, transform: 'none' }]",
    dove: 'regia', bundle: 'js', durata: 'tab-change ×1 = 180 ms',
  },
  {
    superficie: 'pannello di una scheda (tab)',
    mockup: "[{opacity:.4,transform:'translateY(4px)'},{opacity:1,transform:'none'}]",
    nostra: "[{ opacity: 0.4, transform: 'translateY(4px)' }, { opacity: 1, transform: 'none' }]",
    dove: 'regia', bundle: 'js', durata: 'tab-change ×1 = 180 ms',
  },
  {
    superficie: 'pannello che si apre (disclosure)',
    mockup: "[{opacity:0,transform:'translateY(-3px)'},{opacity:1,transform:'none'}]",
    nostra: "[{ opacity: 0, transform: 'translateY(-3px)' }, { opacity: 1, transform: 'none' }]",
    dove: 'regia', bundle: 'js', durata: 'disclosure ×1 = 180 ms',
  },
  {
    superficie: 'collasso della barra (le colonne della shell)',
    mockup: '[{gridTemplateColumns:start},{gridTemplateColumns:end}]',
    nostra: '[{ gridTemplateColumns: valore }, { gridTemplateColumns: dopo }]',
    dove: 'regia', bundle: 'js', durata: 'disclosure ×1,2 = 216 ms',
  },
  {
    superficie: 'schede che si riordinano (FLIP, chi si sposta)',
    mockup: "[{transform:`translate(${dx}px,${dy}px)`},{transform:'none'}]",
    nostra: '[{ transform: `translate(${dx}px,${dy}px)` }, { transform: \'none\' }]',
    dove: 'sezione', bundle: 'js', durata: 'surface-enter ×1,35 = 243 ms',
  },
  {
    superficie: 'schede che si riordinano (FLIP, chi è nuovo)',
    mockup: "[{opacity:0,transform:'translateY(5px)'},{opacity:1,transform:'none'}]",
    nostra: "[{ opacity: 0, transform: 'translateY(5px)' }, { opacity: 1, transform: 'none' }]",
    dove: 'sezione', bundle: 'js', durata: 'surface-enter ×1 = 180 ms',
  },
  {
    superficie: 'dettaglio che entra da destra',
    mockup: "[{opacity:0,transform:'translateX(14px)'},{opacity:1,transform:'none'}]",
    nostra: "[{ opacity: 0, transform: 'translateX(14px)' }, { opacity: 1, transform: 'none' }]",
    dove: 'sezione', bundle: 'js', durata: 'surface-enter ×1,25 = 225 ms',
  },
  {
    superficie: 'dettaglio che esce verso destra',
    mockup: "{opacity:0,transform:'translateX(10px)'}",
    nostra: "{ opacity: 0, transform: 'translateX(10px)' }",
    dove: 'sezione', bundle: 'js', durata: 'surface-exit ×1 = 150 ms',
  },
  {
    superficie: 'dettaglio che si espande',
    mockup: '[{opacity:.65},{opacity:1}]',
    nostra: '[{ opacity: 0.65 }, { opacity: 1 }]',
    dove: 'sezione', bundle: 'js', durata: 'surface-enter ×1 = 180 ms',
  },
  {
    superficie: 'modale che entra',
    mockup: "[{opacity:0,transform:'translateY(12px) scale(.99)'},{opacity:1,transform:'none'}]",
    nostra: "[{ opacity: 0, transform: 'translateY(12px) scale(.99)' }, { opacity: 1, transform: 'none' }]",
    dove: 'modale', bundle: 'js', durata: 'surface-enter ×1 = 180 ms',
  },
  {
    superficie: 'modale che esce',
    mockup: "[{opacity:1,transform:'none'},{opacity:0,transform:'translateY(6px)'}]",
    nostra: "[{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(6px)' }]",
    dove: 'modale', bundle: 'js', durata: 'surface-exit ×1 = 150 ms',
  },
  {
    superficie: 'toast che arriva',
    mockup: "[{opacity:0,transform:'translateY(8px)'},{opacity:1,transform:'none'}]",
    nostra: 'tam-toast-entra',
    dove: 'foglio', bundle: 'css', durata: 'surface-enter ×1 = 180 ms',
  },
  {
    superficie: 'barra di avanzamento di una scheda',
    mockup: 'transition:width var(--talos-motion-duration-surface-enter)',
    nostra: 'transition: width var(--tam-entrata)',
    dove: 'foglio', bundle: 'css', durata: 'surface-enter ×1 = 180 ms',
  },
  {
    superficie: 'riga che carica (`td-track`)',
    mockup: '@keyframes td-track',
    nostra: '@keyframes td-track',
    dove: 'foglio', bundle: 'css', durata: '1,2 s, infinita',
  },
  {
    superficie: 'niente si anima mentre si trascina il divisorio',
    mockup: ':root.td-dragging *',
    nostra: ':root.td-dragging *',
    dove: 'foglio', bundle: 'css', durata: '0 (spegnimento)',
  },
];

test('inventario: ogni animazione del mockup ha la sua forma nel nostro sorgente', () => {
  for (const riga of INVENTARIO) {
    const sorgente = SORGENTI[riga.dove];
    assert.ok(sorgente, `sorgente sconosciuta: ${riga.dove}`);
    assert.ok(
      contiene(sorgente, riga.nostra),
      `SPARITA l'animazione «${riga.superficie}» (${riga.durata}): «${riga.nostra}» non è più in ${riga.dove}`,
    );
  }
});

test('inventario: ogni animazione arriva al pacchetto costruito', (t) => {
  if (!existsSync(DIST_JS) || !existsSync(DIST_CSS)) {
    t.skip('nessun dist/: questa metà della prova si salta, e lo dice invece di passare in silenzio');
    return;
  }
  const js = leggi(DIST_JS);
  const css = leggi(DIST_CSS);
  for (const riga of INVENTARIO) {
    const pacchetto = riga.bundle === 'css' ? css : js;
    assert.ok(
      contiene(pacchetto, riga.nostra),
      `«${riga.superficie}» non arriva a dist/${riga.bundle === 'css' ? 'styles.css' : 'app.js'}: il codice c'è ma nessuno lo importa`,
    );
  }
});

test('inventario: la fonte è ancora il mockup dell\'owner', (t) => {
  if (!existsSync(MOCKUP)) { t.skip('mockup non presente in questo albero'); return; }
  const m = leggi(MOCKUP);
  for (const riga of INVENTARIO) {
    assert.ok(
      contiene(m, riga.mockup),
      `«${riga.superficie}»: la forma «${riga.mockup}» non è più nel mockup — fonte e copia hanno smesso di parlarsi`,
    );
  }
});

test('la catena di montaggio c\'è: il foglio è importato e la regia è montata', () => {
  assert.match(SORGENTI.mainCss, /@import '\.\/mockup-animazioni\.css';/);
  /* ⛔ IN CODA: due regole di questo foglio (`.td-progress > i`, `:root.td-dragging *`) devono
     battere per ORDINE le omonime di `mockup-td.css`. Spostarlo più in alto lo disattiva in
     silenzio — è la stessa trappola già scritta nella testata di `main.css`. */
  const posizioneMia = SORGENTI.mainCss.indexOf("@import './mockup-animazioni.css';");
  const posizioneTd = SORGENTI.mainCss.indexOf("@import './mockup-td.css';");
  assert.ok(posizioneTd >= 0 && posizioneMia > posizioneTd, 'mockup-animazioni.css deve venire DOPO mockup-td.css');
  assert.match(SORGENTI.mainJs, /montaAnimazioniMockup\(document\)/);
});

/* ───────────────────────────── I CANCELLI, provati al VERSO CONTRARIO ───────────────────────── */

/** Un documento finto quanto basta: `motion-mockup.js` guarda solo classi e variabili calcolate. */
function documentoFinto({ classiRadice = [], classiBody = [], variabili = {}, ridotto = false } = {}) {
  const insieme = (lista) => {
    const s = new Set(lista);
    return { contains: (c) => s.has(c), add: (c) => s.add(c), remove: (c) => s.delete(c) };
  };
  const html = { classList: insieme(classiRadice) };
  const body = { classList: insieme(classiBody) };
  const vista = {
    getComputedStyle: () => ({ getPropertyValue: (n) => variabili[n] ?? '' }),
    matchMedia: () => ({ matches: ridotto }),
  };
  return { documentElement: html, body, defaultView: vista, __finestra: vista };
}

test('cancello 1 — `prefers-reduced-motion` di sistema spegne', () => {
  const doc = documentoFinto({ ridotto: true });
  assert.equal(movimentoSpento({ document: doc, finestra: doc.__finestra }), true);
});

test('cancello 2 — `interface-motion-off` sulla radice spegne', () => {
  const doc = documentoFinto({ classiRadice: ['interface-motion-off'] });
  assert.equal(movimentoSpento({ document: doc, finestra: doc.__finestra }), true);
});

test('cancello 3 — `reduce-motion` spegne, sia sulla radice sia sul body', () => {
  const a = documentoFinto({ classiRadice: ['reduce-motion'] });
  const b = documentoFinto({ classiBody: ['reduce-motion'] });
  assert.equal(movimentoSpento({ document: a, finestra: a.__finestra }), true);
  assert.equal(movimentoSpento({ document: b, finestra: b.__finestra }), true);
});

test('cancello 4 — la leva fine spegne SOLO la sua famiglia', () => {
  const doc = documentoFinto({ classiRadice: ['motion-surfaces-off'] });
  assert.equal(movimentoSpento({ document: doc, leva: 'motion-surfaces-off', finestra: doc.__finestra }), true);
  /* ⛔ La prova che MORDE è questa: chi ha spento le superfici deve continuare a vedere i
     riscontri. Una leva che spegne tutto non è una leva fine, è l'interruttore grosso con un
     altro nome — ed è esattamente l'errore che le due regole universali del 10/09 facevano. */
  assert.equal(movimentoSpento({ document: doc, leva: 'motion-feedback-off', finestra: doc.__finestra }), false);
  assert.equal(movimentoSpento({ document: doc, finestra: doc.__finestra }), false);
});

test('a movimento acceso NON si spegne niente', () => {
  const doc = documentoFinto();
  assert.equal(movimentoSpento({ document: doc, finestra: doc.__finestra }), false);
  assert.equal(movimentoSpento({ document: doc, leva: 'motion-navigation-off', finestra: doc.__finestra }), false);
});

test('la durata è un TOKEN: millisecondi e secondi, e il ripiego quando il token non c\'è', () => {
  const doc = documentoFinto({ variabili: { '--talos-motion-duration-surface-enter': '180ms', '--talos-motion-duration-control': '0.16s' } });
  assert.equal(millisecondiDelToken('surface-enter', 999, doc), 180);
  assert.equal(Math.round(millisecondiDelToken('control', 999, doc)), 160);
  assert.equal(millisecondiDelToken('popover', 42, doc), 42);
  /* ⛔ Il caso che conta davvero: «movimento spento» nella app si esprime azzerando i token
     (`legacy/app.js`, `applicaMovimento`). Zero deve tornare ZERO, non il ripiego — altrimenti la
     scelta della persona verrebbe scavalcata da un numero scritto nel codice. */
  const fermo = documentoFinto({ variabili: { '--talos-motion-duration-surface-enter': '0s' } });
  assert.equal(millisecondiDelToken('surface-enter', 180, fermo), 0);
});

test('l\'easing è quello del tema, con il ripiego del mockup', () => {
  const doc = documentoFinto({ variabili: { '--talos-motion-ease': 'cubic-bezier(.22,1,.36,1)' } });
  assert.equal(easeDelTema(doc), 'cubic-bezier(.22,1,.36,1)');
  assert.equal(easeDelTema(documentoFinto()), 'cubic-bezier(.2,.7,.2,1)');
});
