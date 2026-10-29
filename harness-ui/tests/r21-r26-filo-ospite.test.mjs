/*
 * R-21 D3 e R-26 B lungo TUTTO il filo (lezione del 17/10: un'opzione nuova del kernel si prova dal registro al kernel, non a pezzi).
 *   · R-26: il registro dà `lavoroDellAgenteFn` (letta dal registro delle scritture di R5.11), `avviaSessione` la inoltra al kernel;
 *   · R-21 D3: un'uscita di sfondo che il kernel ha già detto al modello dentro il turno (`giaDettoAlModello`) chiude la riga dei
 *     Processi ma non entra in coda e non sveglia: sarebbe un secondo avviso.
 */
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { avviaSessione } from '../src/agent-service.mjs';
import { creaPuntiDiRipristino } from '../src/punti-di-ripristino.mjs';
import { createSessionRegistry } from '../src/session-registry.mjs';
import { rimuoviCartellaDiProvaAttesa } from './aiuto/rimuovi-cartella-di-prova.mjs';

function sessioneFinta() {
  let risolvi;
  let input = null;
  return {
    avviaSessioneFn: async (i) => {
      input = i;
      i.onEvento({ type: 'RunStarted', threadId: 't1', runId: 'r1' });
      return new Promise((ok) => { risolvi = ok; });
    },
    concludi() {
      if (!risolvi) return;
      input.onEvento({ type: 'RunFinished', threadId: 't1', runId: 'r1' });
      risolvi({ ok: true }); risolvi = null;
    },
    get input() { return input; },
  };
}
async function banco() {
  const radice = await mkdtemp(join(tmpdir(), 'talos-r26-filo-'));
  const progetto = join(radice, 'progetto');
  await mkdir(progetto, { recursive: true });
  await writeFile(join(progetto, 'a.txt'), 'prima\n');
  await writeFile(join(progetto, 'b.txt'), 'della persona\n');
  const finta = sessioneFinta();
  const punti = creaPuntiDiRipristino({ cartellaDelloStore: async () => join(radice, 'dati') });
  const registro = createSessionRegistry({
    avviaSessioneFn: finta.avviaSessioneFn, modello: 'm', chiave: 'k', puntiDiRipristino: punti, guardaWorkspaceFn: () => () => {},
    preparaEsecuzioneFn: (taskId) => ({ cartella: progetto, comandoProva: 'npm test', task: { id: taskId, consegna: 'c' } }),
  });
  const { sessionId } = registro.avvia('task-vero');
  return { radice, progetto, finta, punti, registro, sessionId, via: async () => {
    /* un'uscita in coda sveglia la conversazione appena il turno si assesta: si chiude anche il turno nato dal risveglio */
    finta.concludi(); await registro.attendiAssestamento?.(sessionId); await new Promise((r) => setTimeout(r, 200));
    finta.concludi(); await registro.attendiAssestamento?.(sessionId); await registro.chiudi?.(); await punti.fermo(); await rimuoviCartellaDiProvaAttesa(radice);
  } };
}

test('R26-FILO-01 il registro dà al kernel che cosa ha scritto l\'agente: il file scritto da un attrezzo sì, quello della persona no, quello cambiato dopo no', async () => {
  const b = await banco();
  try {
    const lavoro = b.finta.input.lavoroDellAgenteFn;
    assert.equal(typeof lavoro, 'function', 'premessa: il registro la passa');
    await b.finta.input.hookFn({ tipo: 'pre_tool_call', azione: 'scrivi', argomenti: { percorso: 'a.txt' }, giro: 1 });
    await writeFile(join(b.progetto, 'a.txt'), 'scritto dall\'agente\n');
    await b.finta.input.hookFn({ tipo: 'post_tool_call', azione: 'scrivi', esito: 'ok', giro: 1 });
    const a = join(b.progetto, 'a.txt'), p = join(b.progetto, 'b.txt');
    assert.deepEqual(await lavoro({ percorsi: [a, p] }), [a]);
    await writeFile(a, 'poi la persona\n');
    assert.deepEqual(await lavoro({ percorsi: [a, p] }), [], 'cambiato dopo: non è più dell\'agente');
  } finally { await b.via(); }
});

test('R26-FILO-02 avviaSessione inoltra lavoroDellAgenteFn al kernel; assente ⇒ assente', async () => {
  const visti = [];
  const talosLavoraFn = async (opzioni) => { visti.push(opzioni); return { comeFinita: 'concluso', detto: 'ok' }; };
  const fn = async () => [];
  await avviaSessione({ cartella: '/tmp/x', task: { consegna: 'x' }, modello: 'm', chiave: 'k', onEvento: () => {}, talosLavoraFn, lavoroDellAgenteFn: fn });
  await avviaSessione({ cartella: '/tmp/x', task: { consegna: 'x' }, modello: 'm', chiave: 'k', onEvento: () => {}, talosLavoraFn });
  assert.equal(visti[0].lavoroDellAgenteFn, fn);
  assert.equal(visti[1].lavoroDellAgenteFn, undefined);
});

test('R21-D3-FILO-01 un\'uscita già detta dentro il turno chiude la riga dei Processi ma non entra in coda e non sveglia', async () => {
  const b = await banco();
  try {
    const visti = [];
    b.registro.iscriviti(b.sessionId, (e) => { if (e?.name === 'talos.processo-sfondo') visti.push(e.value); });
    b.finta.input.segnalaUscitaSfondo({ toolCallId: 'c1', codice: 0, segnale: null, comando: 'npm run build', file: '/tmp/x.log', giaDettoAlModello: true });
    b.finta.input.segnalaUscitaSfondo({ toolCallId: 'c2', codice: 1, segnale: null, comando: 'npm test', file: '/tmp/y.log' });
    await new Promise((r) => setTimeout(r, 60));
    assert.deepEqual(visti.map((v) => [v.toolCallId, v.esito]), [['c1', 'riuscito'], ['c2', 'fallito']], 'tutte e due le righe si chiudono');
    assert.deepEqual(b.registro.statoCoda(b.sessionId).voci.map((v) => v.toolCallId), ['c2'], 'in coda solo quella non ancora detta');
  } finally { await b.via(); }
});
