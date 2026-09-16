import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/*
 * ⭐⭐⭐ P0/A punto 1 — 16/09/2026. «Il terminale aperto dal composer è largo quanto il composer.»
 *
 * Root cause MISURATA nel foglio, non dedotta: `#pannelloTerminale` è figlio diretto di
 * `.talos-chat-foot`, e `index.css` dà a OGNI figlio del piede la misura del composer
 * (`.talos-chat-foot > * { width: var(--talos-larghezza-piede) }`, riga scritta il 07/09 per
 * allineare il compositore alla colonna del testo). Il pannello non ha mai dichiarato una
 * larghezza sua, quindi eredita quella: 768 px su uno schermo da 1440.
 *
 * ⛔ La sezione dedicata (`#schermoTerminale .talos-terminal`) non ha il problema perché è figlia
 *   di `.talos-screen`: prende tutta l'area principale. Il pannello in basso è lo STESSO oggetto,
 *   quindi deve avere la STESSA larghezza — un pannello agganciato in basso, alla VS Code, non è
 *   largo quanto la casella di testo che gli sta sopra.
 *
 * Cura, dal pattern documentato (CSS-Tricks, «Hassle-free Full Bleed with *:not()», riletto il
 * 16/09/2026): il padding del contenitore vale per tutti TRANNE l'elemento a piena larghezza, e
 * l'elemento escluso annulla il respiro con un margine negativo pari allo stesso token.
 * ⇒ Qui: `:not(#pannelloTerminale)` sulla regola che impone la misura del composer, e il pannello
 *   dichiara la sua larghezza in `terminale-basso.css`.
 *
 * ⛔ Questo è un cancello a buon mercato: dice che la regola c'è. La PROVA in pixel sta in
 *   `tests/browser/terminale-p0.spec.mjs`, che misura il pannello a 1024 e 1440 contro l'area
 *   principale vera. Un test che legge il CSS non può dire quanto è largo qualcosa.
 */

const qui = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const INDEX = qui('../../src/styles/index.css');
const TERMINALE = qui('../../src/styles/terminale-basso.css');

/** Le regole di un foglio come coppie {selettore, corpo}, commenti tolti. */
function regole(css) {
  const senzaCommenti = css.replace(/\/\*[\s\S]*?\*\//gu, '');
  return [...senzaCommenti.matchAll(/([^{}]+)\{([^{}]*)\}/gu)].map((m) => ({
    selettore: m[1].trim().replace(/\s+/gu, ' '),
    corpo: m[2].trim(),
  }));
}

test('P0A1-IL-PIEDE-NON-IMPONE-LA-SUA-MISURA-AL-TERMINALE: ogni regola che dà la larghezza ai figli del piede esclude il pannello', () => {
  const colpevoli = regole(INDEX)
    .filter((r) => /\.talos-chat-foot\s*>\s*\*/u.test(r.selettore) && /(^|;)\s*width\s*:/u.test(`;${r.corpo}`))
    .filter((r) => !r.selettore.includes(':not(#pannelloTerminale)'));
  assert.deepEqual(
    colpevoli.map((r) => r.selettore),
    [],
    'una regola dà ancora al pannello del terminale la larghezza del composer',
  );
});

test('P0A1-IL-PANNELLO-DICHIARA-LA-SUA-LARGHEZZA: annulla il respiro della chat invece di ereditarlo', () => {
  const sue = regole(TERMINALE).filter((r) => /#pannelloTerminale|\.talos-terminale-basso(?![_-])/u.test(r.selettore));
  const conLarghezza = sue.filter((r) => /(^|;)\s*width\s*:/u.test(`;${r.corpo}`));
  assert.ok(conLarghezza.length > 0, 'il pannello non dichiara nessuna larghezza propria');
  const conMargine = sue.filter((r) => /margin-(inline|left|right)\s*:[^;]*--talos-chat-gutter/u.test(r.corpo));
  assert.ok(conMargine.length > 0, 'il pannello non annulla il respiro della chat con lo stesso token che lo definisce');
});

test('P0A1-A-TUTTA-LARGHEZZA-SI-SPECCHIA-IL-PADDING-DEL-PIEDE: la variante `chat-full-width` recupera ingombro, coda e respiro', () => {
  /*
   * ⛔⛔ 16/09, SECONDO GIRO — la prima versione di questo cancello chiedeva `margin-inline: 0`,
   *   e con quella regola il pannello a «tutta larghezza» restava 726 px contro 824 di area
   *   principale. Il difetto non era il codice: era il commento sopra la regola, che DICHIARAVA
   *   «di fatto tutta l'area principale» senza che nessuno l'avesse misurato.
   *
   * In quella modalità il piede ha `padding-left: ingombro + coda + respiro` e
   * `padding-right: respiro` (index.css, regola del 12/09): il pannello li specchia tutti e tre,
   * ed è largo esattamente l'area principale — 824 px a 1440, 748 a 1024, misurati.
   *
   * ⛔ Questo cancello guarda i TOKEN, non i pixel: i pixel (e la banda di larghezze in cui lo
   *   specchio della percentuale lascia il pannello rientrato) stanno in
   *   `tests/browser/terminale-p0.spec.mjs`, prove P0A-LARGHEZZA-PIENA-*.
   */
  const variante = regole(TERMINALE).filter((r) => r.selettore.includes('chat-full-width'));
  assert.ok(variante.length > 0, 'manca la regola del pannello per la modalità a tutta larghezza');
  const margini = variante.filter((r) => /margin-(inline|left|inline-start)\s*:/u.test(r.corpo));
  assert.ok(margini.length > 0, 'la variante non dichiara nessun margine: il pannello resterebbe dentro il padding del piede');
  const corpo = margini.map((r) => r.corpo).join(' ');
  for (const token of ['--talos-cronologia-ingombro', '--talos-turno-coda', '--talos-respiro-pieno']) {
    assert.ok(corpo.includes(token), `la variante non specchia \`${token}\`: il pannello resta rientrato di quel tanto`);
  }
  /* al contrario: azzerare il margine — la vecchia regola, quella misurata a 726 px — deve far
     cadere questo cancello, altrimenti non sta guardando niente. */
  assert.ok(!margini.every((r) => /margin-inline\s*:\s*0\s*(;|$)/u.test(r.corpo)), 'la variante azzera il margine: il pannello torna largo quanto il contenuto del piede');
});
