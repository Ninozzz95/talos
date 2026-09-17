/* PO-30 (18/09/2026) — che cosa ha fatto una sessione sui file, letto dai suoi eventi. Funzione pura: prove pure. */
import assert from 'node:assert/strict';
import test from 'node:test';

import { riassuntoAttivitaSessione } from '../src/attivita-figlia.mjs';

const leggi = (id, percorso, { chiusa = true, pezzi = 2 } = {}) => {
  const testo = JSON.stringify({ percorso });
  const taglio = Math.ceil(testo.length / pezzi);
  const eventi = [{ type: 'ToolCallStart', toolCallId: id, toolCallName: 'leggi' }];
  for (let i = 0; i < testo.length; i += taglio) eventi.push({ type: 'ToolCallArgs', toolCallId: id, delta: testo.slice(i, i + taglio) });
  if (chiusa) eventi.push({ type: 'ToolCallResult', toolCallId: id, content: 'x' });
  return eventi;
};
const scrivi = (percorso, op = 'replace') => ({ type: 'StateDelta', delta: [{ op, path: `/file/${percorso}`, value: 'x' }] });

test('ATTIVITA-01 — letture e scritture escono distinte, e un file letto E scritto porta tutti e due i segni', () => {
  const r = riassuntoAttivitaSessione([...leggi('a', 'src/uno.mjs'), scrivi('src/uno.mjs'), scrivi('tests/nuovo.test.mjs', 'add'), ...leggi('b', '.\\docs\\nota.md')]);
  assert.deepEqual(r.file, [
    { percorso: 'docs/nota.md', letto: true, scritto: false, creato: false },
    { percorso: 'tests/nuovo.test.mjs', letto: false, scritto: true, creato: true },
    { percorso: 'src/uno.mjs', letto: true, scritto: true, creato: false },
  ]);
  assert.equal(r.fileTagliati, 0);
  assert.equal(r.attrezzoCorrente, null);
});

test('ATTIVITA-02 — l’attrezzo CORRENTE è quello senza esito; un giro chiuso non ne ha, nemmeno se l’esito non è mai arrivato', () => {
  assert.equal(riassuntoAttivitaSessione(leggi('a', 'x.mjs', { chiusa: false })).attrezzoCorrente, 'leggi');
  assert.equal(riassuntoAttivitaSessione([...leggi('a', 'x.mjs', { chiusa: false }), { type: 'RunError', code: 'fermato' }]).attrezzoCorrente, null);
  /* Una lettura senza esito NON è una lettura avvenuta: il file non compare. */
  assert.deepEqual(riassuntoAttivitaSessione(leggi('a', 'x.mjs', { chiusa: false })).file, []);
});

test('ATTIVITA-03 — argomenti a metà, non-JSON, percorsi vuoti o assurdi non diventano file', () => {
  const rotti = [
    { type: 'ToolCallStart', toolCallId: 'r', toolCallName: 'leggi' }, { type: 'ToolCallArgs', toolCallId: 'r', delta: '{"percorso":"src/me' }, { type: 'ToolCallResult', toolCallId: 'r' },
    ...leggi('v', '   '), ...leggi('n', `a\0b`), { type: 'StateDelta', delta: [{ op: 'replace', path: '/altro/x', value: 1 }, null, { op: 'add' }] }, null, 'testo', { type: 'ToolCallArgs', toolCallId: 'mai-partita', delta: '{}' },
  ];
  assert.deepEqual(riassuntoAttivitaSessione(rotti).file, []);
  assert.deepEqual(riassuntoAttivitaSessione(undefined).file, []);
});

test('ATTIVITA-04 — il TETTO tiene i più recenti e DICE quanti ne mancano', () => {
  const eventi = Array.from({ length: 10 }, (_, i) => scrivi(`f${i}.mjs`));
  const r = riassuntoAttivitaSessione(eventi, { massimoFile: 3 });
  assert.deepEqual(r.file.map((f) => f.percorso), ['f9.mjs', 'f8.mjs', 'f7.mjs']);
  assert.equal(r.fileTagliati, 7);
});

test('ATTIVITA-05 — solo l’attrezzo che LEGGE conta come lettura: un altro attrezzo con un `percorso` negli argomenti no', () => {
  const altro = [{ type: 'ToolCallStart', toolCallId: 'e', toolCallName: 'elenca' }, { type: 'ToolCallArgs', toolCallId: 'e', delta: '{"percorso":"src"}' }, { type: 'ToolCallResult', toolCallId: 'e' }];
  assert.deepEqual(riassuntoAttivitaSessione(altro).file, []);
  assert.equal(riassuntoAttivitaSessione(altro).chiamate, 1);
});

test('ATTIVITA-06 — dalla porta vera: `elencaFigli` porta modello, permessi e attività della figlia, e niente della sorella', async () => {
  const { creaSubagentOrchestrator } = await import('../src/subagent-orchestrator.mjs');
  const sessioni = new Map([
    ['madre', { padreId: null, eventi: [], collisioniDiScrittura: [] }],
    ['figlia-1', { padreId: 'madre', task: { consegna: 'Compito: leggi il registro' }, modello: 'local:mio.gguf', permessi: 'read-only', conclusa: false, avviataAlle: '2026-09-18T00:00:00.000Z',
      eventi: [...leggi('a', 'src/registro.mjs'), scrivi('src/registro.mjs')] }],
    ['figlia-2', { padreId: 'madre', task: { consegna: 'Compito: altro' }, modello: 'vendor/x', permessi: 'workspace-write', conclusa: true, eventi: [scrivi('README.md', 'add')] }],
    ['estranea', { padreId: 'altra-madre', task: { consegna: 'x' }, eventi: [scrivi('segreto.txt')] }],
  ]);
  const orchestratore = creaSubagentOrchestrator({ sessioni, avviaESeguiFn: async () => ({}) });
  const figli = orchestratore.elencaFigli('madre');
  assert.deepEqual(figli.map((f) => f.sessionId), ['figlia-1', 'figlia-2']);
  assert.equal(figli[0].modello, 'local:mio.gguf');
  assert.equal(figli[0].permessi, 'read-only');
  assert.deepEqual(figli[0].attivita.file, [{ percorso: 'src/registro.mjs', letto: true, scritto: true, creato: false }]);
  assert.deepEqual(figli[1].attivita.file, [{ percorso: 'README.md', letto: false, scritto: true, creato: true }]);
  assert.ok(!JSON.stringify(figli).includes('segreto.txt'), '⛔ la figlia di un’ALTRA madre non deve comparire');
});
