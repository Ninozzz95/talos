/*
 * Decisione dell'owner 162 (04/11/2026, variante A di `variante-scheda-permessi.html`, riga 3 della revisione d'uso della candidata):
 * la stessa scelta si chiamava in due modi — «Chiede prima» era «Controllato» nella Nuova sessione e «rischio medio» nei Permessi.
 * Ora ovunque le parole della pagina Permessi: la pillola del rischio («rischio basso», «rischio medio», «rischio molto alto», nei
 * toni success/warning/danger) e «Consigliato» come pillola a parte su «Scrive nel progetto». La serie «Minimo rischio / Controllato /
 * Alto rischio» sparisce dal dizionario. «sai già» con l'accento (anche questo dalla decisione) è già vero sul PC: lo tiene UXE-02.
 * Ogni prova anche al contrario.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { impostaLingua } from '../../src/components/lingua.js';
import { POLITICHE, pillolePolitica, pillolePoliticaHtml, notaPolitica } from '../../src/components/politiche.js';
import { AREE } from '../../src/i18n/testi/index.js';

const leggi = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

test('UXD162-01 — le pillole di ogni livello sono quelle della pagina Permessi, con «Consigliato» a parte', () => {
  try {
    impostaLingua('it');
    assert.deepEqual(POLITICHE.map((p) => pillolePolitica(p.valore)), [
      [{ testo: 'rischio basso', tono: 'success' }],
      [{ testo: 'rischio medio', tono: 'warning' }, { testo: 'Consigliato', tono: 'accent' }],
      [{ testo: 'rischio medio', tono: 'warning' }],
      [{ testo: 'rischio molto alto', tono: 'danger' }],
    ]);
    assert.equal(notaPolitica('On request'), 'rischio medio', 'la nota di «Chiede prima» è la parola dei Permessi');
    assert.notEqual(notaPolitica('On request'), 'Controllato', 'AL CONTRARIO: la seconda serie di parole');
    assert.deepEqual(pillolePolitica('Qualcosa altro'), [], 'un valore sconosciuto non porta un rischio inventato');
    impostaLingua('en');
    assert.deepEqual(pillolePolitica('Workspace write'), [{ testo: 'medium risk', tono: 'warning' }, { testo: 'Recommended', tono: 'accent' }]);
    assert.deepEqual(pillolePolitica('Full access'), [{ testo: 'very high risk', tono: 'danger' }]);
  } finally { impostaLingua('it'); }
});

test('UXD162-02 — le pillole sono i badge del sistema di disegno, piccoli, nel tono del rischio', () => {
  impostaLingua('it');
  assert.equal(pillolePoliticaHtml('Workspace write'),
    '<span class="talos-badge talos-badge--warning talos-badge--sm">rischio medio</span> <span class="talos-badge talos-badge--accent talos-badge--sm">Consigliato</span>');
  assert.equal(pillolePoliticaHtml('Read only'), '<span class="talos-badge talos-badge--success talos-badge--sm">rischio basso</span>');
  assert.equal(pillolePoliticaHtml('boh'), '');
});

test('UXD162-03 — AL CONTRARIO: la serie «Minimo rischio / Controllato / Alto rischio» non c è più, in nessuna lingua', () => {
  for (const lingua of ['it', 'en']) {
    for (const chiave of ['readOnly', 'workspaceWrite', 'onRequest', 'fullAccess']) assert.equal(AREE.varie[lingua][`policy.${chiave}.note`], undefined, `${lingua} policy.${chiave}.note`);
  }
  const italiano = Object.values(AREE).flatMap((a) => Object.values(a.it ?? {})).filter((v) => typeof v === 'string');
  assert.deepEqual(italiano.filter((v) => /^(Minimo rischio|Controllato|Alto rischio)$/u.test(v)), []);
});

test('UXD162-04 — i tre posti che mostrano il livello usano le stesse pillole: Nuova sessione, foglio dei permessi, velo Permessi', () => {
  const app = leggi('../../src/legacy/app.js');
  assert.match(app, /<strong>\$\{nomeUmanoPolitica\(permission\)\}<\/strong><small class="workspace-chooser-permission__rischio">\$\{pillolePoliticaHtml\(permission\)\}<\/small>/u);
  assert.doesNotMatch(app, /<small>\$\{notaPolitica\(permission\)\}<\/small>/u, 'AL CONTRARIO: la Nuova sessione con la sua nota');
  assert.match(app, /<span>\$\{pillolePoliticaHtml\(p\.valore\)\}<\/span>/u);
  assert.doesNotMatch(app, /<span>\$\{p\.nota\}<\/span>/u);
  const pagina = leggi('../../index.template.html');
  const velo = pagina.slice(pagina.indexOf('id="veloPermessiScelte"'), pagina.indexOf('id="veloPermessiScelte"') + 3500);
  // «Consigliato» non sta più dentro la frase: è una pillola accanto a quella del rischio, nella stessa fila
  assert.doesNotMatch(velo, /talos-choice__hint/u);
  assert.match(velo, /<span class="talos-choice__pillole"><span data-t="modello\.permissions\.mediumRisk" class="talos-badge talos-badge--warning talos-badge--sm">rischio medio<\/span> <span data-t="modello\.permissions\.recommended" class="talos-badge talos-badge--accent talos-badge--sm">Consigliato<\/span><\/span>/u);
  assert.equal((velo.match(/class="talos-choice__pillole"/gu) ?? []).length, 4, 'tutte e quattro le carte, stessa forma');
  const stile = leggi('../../src/styles/index.css');
  assert.match(stile, /\.talos-choice__pillole\{[^}]*display:flex[^}]*gap:6px/u);
});
