/*
 * ⭐ Owner 27/10/2026, server locali — il SORVEGLIANTE (`src/server-locali.mjs`, terza parte): incrocia uscita e porte in ascolto,
 *   annuncia «pronto» solo quando la porta risponde e «fermato» quando smette. Lettore delle porte e sonda finti, comandati dalla prova.
 *   Ogni regola ha il suo verso contrario.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { creaSorveglianteServerLocali } from '../src/server-locali.mjs';

function banco() {
  const porte = { perPid: new Map(), perMarcatore: new Map() };
  const rispondono = new Set();
  const annunci = [];
  const s = creaSorveglianteServerLocali({
    lettorePorte: { leggi: async () => ({ perPid: new Map(porte.perPid), perMarcatore: new Map(porte.perMarcatore) }) },
    sonda: async (porta) => (rispondono.has(porta) ? `http://127.0.0.1:${porta}` : null),
    onCambio: (sessionId, server) => annunci.push({ sessionId, ...server }),
    ora: () => 1000,
  });
  return { s, porte, rispondono, annunci };
}
const calma = () => new Promise((r) => setImmediate(r));

test('SL-SORV-01 dall\'uscita: annunciato SOLO quando la porta risponde, col nome del framework', async () => {
  const b = banco();
  b.s.dallUscita('A', { pid: 10 }, { indirizzi: [{ host: 'localhost', porta: 5173 }], framework: 'Vite' }, 'npm run dev');
  await calma();
  assert.deepEqual(b.annunci, [], 'non risponde ancora: niente rumore');
  assert.deepEqual(b.s.elenco('A'), []);
  b.rispondono.add(5173);
  b.porte.perPid.set(10, [5173]);
  await b.s.campiona('A', [{ pid: 10, comando: 'npm run dev' }]);
  await calma();
  assert.equal(b.annunci.length, 1);
  assert.deepEqual({ porta: b.annunci[0].porta, stato: b.annunci[0].stato, framework: b.annunci[0].framework, comando: b.annunci[0].comando, fonti: b.annunci[0].fonti },
    { porta: 5173, stato: 'pronto', framework: 'Vite', comando: 'npm run dev', fonti: ['uscita', 'porta'] });
  assert.equal(b.s.portaDellaSessione('A', 5173), true);
  assert.equal(b.s.portaDellaSessione('B', 5173), false, 'al contrario: è della conversazione A, non della B');
});

test('SL-SORV-02 Vite passa alla 5174: l\'indirizzo vecchio dell\'uscita sparisce in silenzio, la porta vera è il server', async () => {
  const b = banco();
  b.s.dallUscita('A', { pid: 10 }, { indirizzi: [{ host: 'localhost', porta: 5173 }], framework: 'Vite' }, 'npm run dev');
  b.porte.perPid.set(10, [5174]);
  b.rispondono.add(5174);
  await b.s.campiona('A', [{ pid: 10, comando: 'npm run dev' }]);
  await calma();
  assert.deepEqual(b.s.elenco('A').map((x) => [x.porta, x.stato]), [[5174, 'pronto']]);
  assert.deepEqual(b.annunci.map((a) => a.porta), [5174], 'la 5173 non è mai stata annunciata');
});

test('SL-SORV-03 un server che non stampa niente si trova dalle porte; il framework scoperto dopo si annuncia', async () => {
  const b = banco();
  b.porte.perPid.set(20, [8000]);
  b.rispondono.add(8000);
  await b.s.campiona('A', [{ pid: 20, comando: 'python app.py' }]);
  await calma();
  assert.deepEqual(b.s.elenco('A').map((x) => [x.porta, x.framework, x.fonti.join('+')]), [[8000, null, 'porta']]);
  b.s.dallUscita('A', { pid: 20 }, { indirizzi: [{ host: '127.0.0.1', porta: 8000 }], framework: 'Django' });
  await calma();
  assert.equal(b.annunci.at(-1).framework, 'Django');
  assert.equal(b.annunci.length, 2);
});

test('SL-SORV-04 il processo finisce: «fermato», annunciato una volta; una porta nuova dopo riparte da «in avvio»', async () => {
  const b = banco();
  b.porte.perPid.set(10, [3000]);
  b.rispondono.add(3000);
  await b.s.campiona('A', [{ pid: 10 }]);
  await calma();
  b.porte.perPid.set(10, null);
  b.rispondono.delete(3000);
  await b.s.campiona('A', [{ pid: 10 }]);
  await b.s.campiona('A', [{ pid: 10 }]);
  assert.deepEqual(b.annunci.map((a) => a.stato), ['pronto', 'fermato']);
  assert.deepEqual(b.s.elenco('A').map((x) => x.stato), ['fermato']);
  b.porte.perPid.set(11, [3000]);
  b.rispondono.add(3000);
  await b.s.campiona('A', [{ pid: 11 }]);
  await calma();
  assert.deepEqual(b.annunci.map((a) => a.stato), ['pronto', 'fermato', 'pronto'], 'lo stesso indirizzo, riaperto, torna pronto');
});

test('SL-SORV-05 AL CONTRARIO: una lettura delle porte che fallisce non ferma un server che risponde ancora', async () => {
  const b = banco();
  b.porte.perPid.set(10, [3000]);
  b.rispondono.add(3000);
  await b.s.campiona('A', [{ pid: 10 }]);
  await calma();
  b.porte.perPid.clear(); // il lettore non ha potuto dire niente di questo processo
  await b.s.campiona('A', [{ pid: 10 }]);
  assert.deepEqual(b.s.elenco('A').map((x) => x.stato), ['pronto']);
  assert.equal(b.annunci.length, 1);
});

test('SL-SORV-06 WSL: le porte per marcatore valgono come quelle per PID', async () => {
  const b = banco();
  b.porte.perMarcatore.set('Ubuntu:cmd-7', [4321]);
  b.rispondono.add(4321);
  await b.s.campiona('A', [{ wsl: { distro: 'Ubuntu', marcatore: 'cmd-7' }, comando: 'npm run dev' }]);
  await calma();
  assert.deepEqual(b.s.elenco('A').map((x) => [x.porta, x.stato]), [[4321, 'pronto']]);
});
