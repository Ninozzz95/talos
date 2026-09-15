import test from 'node:test';
import assert from 'node:assert/strict';
import { suApple, etichettaTasto, montaScorciatoie, normalizzaTastiScritti, riconosci, SCORCIATOIE } from '../../src/components/scorciatoie.js';

/** Radice finta: basta `querySelectorAll('kbd')` e `textContent` (le unit di questo repo non caricano un DOM). */
function radiceFinta(testi) {
  const nodi = testi.map((t) => ({ textContent: t }));
  return { nodi, querySelectorAll: (sel) => (sel === 'kbd' ? nodi : []) };
}

// 06/09 — audit delle decisioni: una scorciatoia scritta a schermo è una promessa.

test('SCORCIATOIE-PIATTAFORMA: ⌘ su Apple, Ctrl altrove, da userAgentData o da platform', () => {
  assert.equal(suApple({ userAgentData: { platform: 'macOS' } }), true);
  assert.equal(suApple({ platform: 'MacIntel' }), true);
  assert.equal(suApple({ userAgentData: { platform: 'Windows' }, platform: 'Win32' }), false);
  assert.equal(suApple({}), false); // nessuna informazione: si assume la piattaforma senza ⌘
  assert.equal(etichettaTasto('⌘N', { apple: false }), 'Ctrl N');
  assert.equal(etichettaTasto('⌘N', { apple: true }), '⌘N');
  assert.equal(etichettaTasto('Ctrl+Shift+M', { apple: true }), '⌘⇧M');
  assert.equal(etichettaTasto('mod /', { apple: false }), 'Ctrl /');
  assert.equal(etichettaTasto('', { apple: false }), '');
});

test('SCORCIATOIE-KBD: riscrive solo i tasti col modificatore, lascia Esc e le frecce', () => {
  const radice = radiceFinta(['⌘K', 'Esc', '↑ ↓', 'Ctrl B', 'Invio']);
  const cambiati = normalizzaTastiScritti(radice, { apple: false });
  assert.deepEqual(radice.nodi.map((n) => n.textContent), ['Ctrl K', 'Esc', '↑ ↓', 'Ctrl B', 'Invio']);
  assert.equal(cambiati, 1); // «Ctrl B» era già giusto
  // AL CONTRARIO: su Apple diventano ⌘
  const mac = radiceFinta(['Ctrl K']);
  normalizzaTastiScritti(mac, { apple: true });
  assert.equal(mac.nodi[0].textContent, '⌘K');
});

test('SCORCIATOIE-RICONOSCE: le sette combinazioni, e niente quando manca il modificatore', () => {
  const e = (extra) => ({ ctrlKey: true, metaKey: false, altKey: false, shiftKey: false, ...extra });
  assert.equal(riconosci(e({ key: 'k' }), { apple: false }), 'comandi');
  assert.equal(riconosci(e({ key: 'n' }), { apple: false }), 'nuova');
  assert.equal(riconosci(e({ key: 'M', shiftKey: true }), { apple: false }), 'modello');
  assert.equal(riconosci(e({ key: ',' }), { apple: false }), 'impostazioni');
  assert.equal(riconosci(e({ key: '/' }), { apple: false }), 'scorciatoie');
  assert.equal(riconosci(e({ key: '`' }), { apple: false }), 'terminale');
  assert.equal(riconosci(e({ key: '`', shiftKey: true }), { apple: false }), 'terminaleNuovo');
  // AL CONTRARIO: senza modificatore, con Alt, o con la sola lettera non scatta niente
  assert.equal(riconosci({ ctrlKey: false, key: 'k' }, { apple: false }), null);
  assert.equal(riconosci(e({ key: 'k', altKey: true }), { apple: false }), null);
  assert.equal(riconosci(e({ key: 'j' }), { apple: false }), null);
  // su Apple comanda metaKey, non ctrlKey
  assert.equal(riconosci({ metaKey: true, key: 'k' }, { apple: true }), 'comandi');
  assert.equal(riconosci({ ctrlKey: true, key: 'k' }, { apple: true }), null);
});

test('SCORCIATOIE-REGISTRO: ogni riga ha id, combinazione, area e nome, e nessuna ruba una combinazione del browser', () => {
  const proibite = ['mod T', 'mod W', 'mod S', 'mod P', 'mod O', 'mod L', 'mod D'];
  for (const s of SCORCIATOIE) {
    assert.ok(s.id && s.combo && s.area && s.nome, `riga incompleta: ${JSON.stringify(s)}`);
    assert.ok(!proibite.includes(s.combo), `${s.combo} è del browser`);
  }
  assert.equal(new Set(SCORCIATOIE.map((s) => s.combo)).size, SCORCIATOIE.length, 'due righe con la stessa combinazione');
});

test('SCORCIATOIE-PANNELLO: il registro diventa righe, la ricerca filtra, lo stato vuoto compare', () => {
  // radice finta: bastano querySelector e replaceChildren (le unit di questo repo non caricano un DOM)
  const creati = [];
  const nodo = (tag) => { const n = { tag, className: '', dataset: {}, figli: [], textContent: '', hidden: false, setAttribute() {}, append(...x) { this.figli.push(...x); }, replaceChildren(...x) { this.figli = x; }, addEventListener() {}, querySelectorAll: () => [] }; creati.push(n); return n; };
  const elenco = nodo('div'); const vuoto = nodo('p'); const cerca = { value: '', dataset: {}, addEventListener() {} };
  const velo = {
    ownerDocument: { createElement: nodo },
    querySelector: (s) => (s === '#elencoScorciatoie' ? elenco : s === '#scorciatoieVuote' ? vuoto : s === '#cercaScorciatoia' ? cerca : null),
  };
  assert.equal(montaScorciatoie(velo, { apple: false }), SCORCIATOIE.length);
  assert.equal(elenco.figli.length, SCORCIATOIE.length);
  assert.equal(vuoto.hidden, true);
  // filtro
  cerca.value = 'terminale';
  assert.equal(montaScorciatoie(velo, { apple: false }), 2);
  // AL CONTRARIO: una ricerca che non trova niente accende lo stato vuoto
  cerca.value = 'zzz';
  assert.equal(montaScorciatoie(velo, { apple: false }), 0);
  assert.equal(vuoto.hidden, false);
});
