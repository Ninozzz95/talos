import assert from 'node:assert/strict';
import test from 'node:test';
import { TIPO_BLOCCO, creaPcSveglio } from '../pc-sveglio.mjs';

function finto() {
  const vivi = new Set();
  let prossimo = 1;
  const conti = { prese: 0, rilasci: 0, tipi: [] };
  return { conti, vivi, blocker: { start(tipo) { conti.prese += 1; conti.tipi.push(tipo); const id = prossimo++; vivi.add(id); return id; }, stop(id) { conti.rilasci += 1; vivi.delete(id); }, isStarted: (id) => vivi.has(id) } };
}
const FIGLIO = { pid: 1 };

test('PCS-1 one blocker of the right type: taken at the first «acceso», never twice, released at «spento»', () => {
  const f = finto();
  const s = creaPcSveglio({ blocker: f.blocker });
  s.nuovoFiglio(FIGLIO);
  assert.equal(s.messaggio(FIGLIO, { tipo: 'sveglio', acceso: true }), true);
  s.messaggio(FIGLIO, { tipo: 'sveglio', acceso: true });
  assert.deepEqual([f.conti.prese, f.vivi.size, f.conti.tipi[0]], [1, 1, TIPO_BLOCCO]);
  assert.equal(TIPO_BLOCCO, 'prevent-app-suspension', 'the screen still turns off, like Hermes');
  s.messaggio(FIGLIO, { tipo: 'sveglio', acceso: false });
  s.messaggio(FIGLIO, { tipo: 'sveglio', acceso: false });
  assert.deepEqual([f.conti.rilasci, f.vivi.size, s.attivo()], [1, 0, false]);
});

test('PCS-2 the server falls with the blocker taken: released at its exit; a late message of the dead child counts no more', () => {
  const f = finto();
  const s = creaPcSveglio({ blocker: f.blocker });
  s.nuovoFiglio(FIGLIO);
  s.messaggio(FIGLIO, { tipo: 'sveglio', acceso: true });
  s.figlioUscito(FIGLIO);
  assert.deepEqual([f.conti.prese, f.conti.rilasci, f.vivi.size], [1, 1, 0]);
  assert.equal(s.messaggio(FIGLIO, { tipo: 'sveglio', acceso: true }), false);
  assert.equal(f.vivi.size, 0);
});

test('PCS-3 the other way: messages not from the current child, or not in the shape, are ignored', () => {
  const f = finto();
  const s = creaPcSveglio({ blocker: f.blocker });
  s.nuovoFiglio(FIGLIO);
  for (const [da, m] of [[{ pid: 2 }, { tipo: 'sveglio', acceso: true }], [null, { tipo: 'sveglio', acceso: true }], [FIGLIO, { tipo: 'altro', acceso: true }],
    [FIGLIO, { tipo: 'sveglio', acceso: 'si' }], [FIGLIO, null]]) assert.equal(s.messaggio(da, m), false);
  assert.equal(f.conti.prese, 0);
});

test('PCS-4 a new child replaces the old one: the old blocker goes, only the new child is heard; an old child exiting later changes nothing', () => {
  const f = finto();
  const s = creaPcSveglio({ blocker: f.blocker });
  const nuovo = { pid: 3 };
  s.nuovoFiglio(FIGLIO);
  s.messaggio(FIGLIO, { tipo: 'sveglio', acceso: true });
  s.nuovoFiglio(nuovo);
  assert.equal(f.vivi.size, 0, 'released when the child changed');
  s.messaggio(nuovo, { tipo: 'sveglio', acceso: true });
  s.figlioUscito(FIGLIO);
  assert.equal(f.vivi.size, 1, 'the old child exiting does not release the new one');
});

test('PCS-5 the app quits with the blocker taken: released; a blocker that fails to start never throws', () => {
  const f = finto();
  const s = creaPcSveglio({ blocker: f.blocker });
  s.nuovoFiglio(FIGLIO);
  s.messaggio(FIGLIO, { tipo: 'sveglio', acceso: true });
  s.chiudi();
  assert.deepEqual([f.conti.rilasci, f.vivi.size], [1, 0]);
  const rotta = creaPcSveglio({ blocker: { start() { throw new Error('no'); }, stop() {}, isStarted: () => false } });
  rotta.nuovoFiglio(FIGLIO);
  assert.doesNotThrow(() => rotta.messaggio(FIGLIO, { tipo: 'sveglio', acceso: true }));
  assert.equal(rotta.attivo(), false);
});
