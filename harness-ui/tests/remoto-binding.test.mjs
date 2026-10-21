import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';
import { improntaAttesa, trovaBindingIroh } from '../src/remoto/binding.mjs';

/*
 * 18/10/2026 — controllo remoto: il binding nativo di iroh si carica SOLO se la sua impronta è quella fissata nel repo; l'app
 * installata non legge la strada di sviluppo. Ogni prova ha il suo verso contrario.
 */
function banco(t, contenuto = 'BINARIO-FINTO') {
  const dir = mkdtempSync(join(tmpdir(), 'talos-binding-'));
  t.after(() => rimuoviCartellaDiProva(dir));
  const binding = join(dir, 'iroh.win32-x64-msvc.node');
  const impronta = `${binding}.sha256`;
  writeFileSync(binding, contenuto);
  const caricati = [];
  const carica = (percorso) => { caricati.push(percorso); return { Endpoint: {} }; };
  return { binding, impronta, caricati, carica };
}
const sha = (testo) => createHash('sha256').update(testo).digest('hex');

test('BIN-01 impronta giusta: caricato dal pacchetto', (t) => {
  const b = banco(t);
  writeFileSync(b.impronta, `${sha('BINARIO-FINTO')}  iroh.win32-x64-msvc.node\n`);
  const r = trovaBindingIroh({ env: {}, binding: b.binding, impronta: b.impronta, carica: b.carica });
  assert.equal(r.da, 'pacchetto'); assert.deepEqual(b.caricati, [b.binding]);
});

test('BIN-02 impronta diversa o assente: NON caricato', (t) => {
  const b = banco(t);
  writeFileSync(b.impronta, `${sha('UN-ALTRO')}  iroh.win32-x64-msvc.node\n`);
  assert.deepEqual(trovaBindingIroh({ env: {}, binding: b.binding, impronta: b.impronta, carica: b.carica }), { modulo: null, motivo: 'impronta-diversa' });
  writeFileSync(b.impronta, 'non è un\'impronta');
  assert.equal(trovaBindingIroh({ env: {}, binding: b.binding, impronta: b.impronta, carica: b.carica }).modulo, null);
  assert.deepEqual(trovaBindingIroh({ env: {}, binding: b.binding, impronta: `${b.impronta}.manca`, carica: b.carica }), { modulo: null, motivo: 'assente' });
  assert.deepEqual(b.caricati, [], 'niente codice nativo caricato');
});

test('BIN-03 la strada di sviluppo vale da sorgente, ma l\'app installata la ignora', (t) => {
  const b = banco(t);
  const dev = trovaBindingIroh({ env: { TALOS_IROH_BINDING: 'C:/sviluppo/iroh' }, binding: b.binding, impronta: `${b.impronta}.manca`, carica: b.carica });
  assert.equal(dev.da, 'sviluppo'); assert.deepEqual(b.caricati, ['C:/sviluppo/iroh']);
  const app = trovaBindingIroh({ env: { TALOS_IROH_BINDING: 'C:/sviluppo/iroh', TALOS_DESKTOP_DATA_DIR: 'C:/dati' }, binding: b.binding, impronta: `${b.impronta}.manca`, carica: b.carica });
  assert.equal(app.modulo, null); assert.equal(b.caricati.length, 1);
});

test('BIN-04 il formato di sha256sum', () => {
  assert.equal(improntaAttesa(`${'A'.repeat(64)}  file\n`), 'a'.repeat(64));
  assert.equal(improntaAttesa('abc'), null);
});
