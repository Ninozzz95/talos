/*
 * LINGUA-4 (08/10/2026, bugfixer) — il toast del cambio di permesso diceva il valore del CONTRATTO. Visto dal vivo sulla 4176:
 * interfaccia italiana, scelta «Solo lettura» nella finestra «Quanto può fare TALOS qui» ⇒ «Policy aggiornata · Read only».
 * Si prova la funzione VERA di `app.js` (estratta dal sorgente) con la `etichettaPermesso` vera, nelle due lingue.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { etichettaPermesso } from '../../src/components/chat-foot.js';
import { impostaLingua } from '../../src/components/lingua.js';

const APP = readFileSync(new URL('../../src/legacy/app.js', import.meta.url), 'utf8');
function estrai(nome) {
  const inizio = APP.indexOf(`  function ${nome}(`);
  assert.ok(inizio >= 0, `funzione ${nome} non trovata`);
  let i = APP.indexOf('{', APP.indexOf(')', inizio)); let profondita = 0;
  for (; i < APP.length; i += 1) {
    if (APP[i] === '{') profondita += 1;
    else if (APP[i] === '}') { profondita -= 1; if (profondita === 0) break; }
  }
  return APP.slice(inizio, i + 1);
}

function banco() {
  const toast = [];
  const contesto = vm.createContext({
    state: { permissions: 'Workspace write' },
    aggiornaPillolaPermessi() {}, sincronizzaImpostazioniSessione() {},
    toast: (titolo, corpo) => toast.push([titolo, corpo]),
    tr: (k) => k, etichettaPermesso,
  });
  vm.runInContext(`${estrai('impostaPermesso')}\nthis.impostaPermesso = impostaPermesso;`, contesto);
  return { impostaPermesso: contesto.impostaPermesso, toast, state: contesto.state };
}

test('LINGUA4-01 il toast dice il nome del permesso nella lingua dell interfaccia, il contratto resta il valore', () => {
  for (const [lingua, atteso] of [['it', 'Solo lettura'], ['en', 'Read only']]) {
    impostaLingua(lingua);
    const b = banco();
    b.impostaPermesso('Read only');
    assert.equal(b.state.permissions, 'Read only', 'lo stato e il server ricevono il valore del contratto');
    assert.equal(b.toast.at(-1)[1], atteso, `${lingua}: ${b.toast.at(-1)[1]}`);
  }
  impostaLingua('it');
  const b = banco();
  b.impostaPermesso('Workspace write');
  assert.notEqual(b.toast.at(-1)[1], 'Workspace write', 'al contrario: mai il valore grezzo in italiano');
  assert.equal(b.toast.at(-1)[1], etichettaPermesso('Workspace write'));
});

test('LINGUA4-02 un messaggio esplicito vince sul predefinito', () => {
  impostaLingua('it');
  const b = banco();
  b.impostaPermesso('Full access', 'Radice impostata');
  assert.equal(b.toast.at(-1)[1], 'Radice impostata');
});
