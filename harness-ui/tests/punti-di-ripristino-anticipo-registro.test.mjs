import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { createSessionRegistry } from '../src/session-registry.mjs';
import { creaPuntiDiRipristino } from '../src/punti-di-ripristino.mjs';
import { rimuoviCartellaDiProvaAttesa } from './aiuto/rimuovi-cartella-di-prova.mjs';

/*
 * PERF 29/10/2026 — la foto in anticipo dal registro: parte all'avvio del giro, sincrona (RunStarted resta la prima cosa nel
 * buffer, P-13), e solo dove il giro può scrivere. Il servizio è quello vero, con `anticipa` spiata.
 */
async function banco(opzioni) {
  const radice = await mkdtemp(join(tmpdir(), 'talos-anticipo-reg-'));
  const progetto = join(radice, 'progetto');
  await mkdir(progetto, { recursive: true });
  await writeFile(join(progetto, 'a.txt'), 'prima\n');
  let risolvi = null;
  let input = null;
  const vero = creaPuntiDiRipristino({ cartellaDelloStore: async () => join(radice, 'dati') });
  const chiamate = [];
  const punti = { ...vero, anticipa: (a) => { chiamate.push(a); return vero.anticipa(a); } };
  const registro = createSessionRegistry({
    avviaSessioneFn: async (i) => { input = i; i.onEvento({ type: 'RunStarted', threadId: 't1', runId: 'r1' }); return new Promise((ok) => { risolvi = ok; }); },
    modello: 'm', chiave: 'k', puntiDiRipristino: punti,
    preparaEsecuzioneFn: (taskId) => ({ cartella: progetto, comandoProva: 'npm test', task: { id: taskId, consegna: 'c' } }),
  });
  const avviata = registro.avvia('task-vero', opzioni);
  const concludi = () => { if (!risolvi) return; input.onEvento({ type: 'RunFinished', threadId: 't1', runId: 'r1' }); risolvi({ ok: true }); risolvi = null; };
  return { ...avviata, progetto, chiamate, vero, get input() { return input; }, via: async () => { concludi(); await vero.fermo(); await rimuoviCartellaDiProvaAttesa(radice); } };
}

test('ANR-01 all\'avvio del giro la foto parte da sola, col turno e il progetto del punto; la prima scrittura la trova fatta', async () => {
  const b = await banco({ permessiScelto: 'Workspace write', modalitaOperativaScelta: 'normale' });
  try {
    assert.equal(b.chiamate.length, 1, 'una foto in anticipo per giro');
    assert.deepEqual(b.chiamate[0], { sessionId: b.sessionId, turno: 1, progetto: b.progetto });
    await b.vero.fermo();
    await b.input.hookFn({ tipo: 'pre_tool_call', azione: 'scrivi', argomenti: { percorso: 'a.txt' }, giro: 1 });
    const el = await b.vero.elenco({ sessionId: b.sessionId, progetto: b.progetto });
    assert.deepEqual(el.map((p) => [p.turno, p.annullabile]), [[1, true]]);
  } finally { await b.via(); }
});

for (const [nome, opzioni] of [
  ['sola lettura', { permessiScelto: 'Read only', modalitaOperativaScelta: 'normale' }],
  ['ricerca', { permessiScelto: 'Research', modalitaOperativaScelta: 'normale' }],
  ['modalità piano', { permessiScelto: 'Workspace write', modalitaOperativaScelta: 'piano' }],
]) {
  test(`ANR-02 al contrario: in ${nome} il giro non scrive, e la foto in anticipo non parte`, async () => {
    const b = await banco(opzioni);
    try {
      assert.deepEqual(b.chiamate, []);
    } finally { await b.via(); }
  });
}
