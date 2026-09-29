import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSessionRegistry } from '../src/session-registry.mjs';
import { attendiScritture, registraRigaSync } from '../src/session-store.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

function runtimeControllabile() {
  const runs = [];
  return {
    runs,
    avviaSessioneFn(input) {
      let resolve;
      const promise = new Promise((r) => { resolve = r; });
      const index = runs.length;
      runs.push({ input, resolve });
      input.onEvento({ type: 'RunStarted', threadId: `t${index}`, runId: `r${index}` });
      return promise;
    },
    fine(index, esito = 'concluso') {
      const run = runs[index];
      run.input.onEvento({ type: esito === 'concluso' ? 'RunFinished' : 'RunError', threadId: `t${index}`, runId: `r${index}` });
      run.resolve({ ok: esito === 'concluso', esito: { detto: `risposta ${index}`, comeFinita: esito,
        messaggiFinali: index === 0 ? [{ role: 'user', content: 'avvia le figlie' }, { role: 'assistant', content: 'in attesa' }] : [] } });
    },
  };
}

test('F-010-TWO-CHILDREN-ONE-WAKE: two durable child completions start one synthetic parent turn', async () => {
  const cartellaStore = mkdtempSync(join(tmpdir(), 'talos-agent-result-wake-'));
  const runtime = runtimeControllabile();
  try {
    const registry = createSessionRegistry({ cartellaStore, avviaSessioneFn: runtime.avviaSessioneFn,
      preparaEsecuzioneFn: () => ({ cartella: '/tmp/x', comandoProva: 'npm test', task: { id: 'task', consegna: 'avvia le figlie' } }),
      modello: 'm', chiave: 'k', cartellaEsisteFn: () => true });
    const { sessionId } = registry.avvia('task');
    assert.equal((await runtime.runs[0].input.onDelega('figlia uno', '/tmp/uno')).esito, 'avviato');
    assert.equal((await runtime.runs[0].input.onDelega('figlia due', '/tmp/due')).esito, 'avviato');
    runtime.fine(0);
    await registry.attendiAssestamento(sessionId);
    runtime.fine(1);
    runtime.fine(2);
    await new Promise((r) => setTimeout(r, 100));
    assert.equal(runtime.runs.length, 4, 'one parent wake after both children, not zero or two');
    const input = runtime.runs[3].input;
    assert.equal(input.messaggiIniziali.at(-1).role, 'user');
    assert.equal(input.messaggiIniziali.at(-1).talosOrigin, 'delegation-notice');
    assert.equal(input.task.origine, 'delega');
    assert.equal(input.task.codaIds.length, 2);
    assert.equal(new Set(input.task.childIds).size, 2);
    runtime.fine(3);
    await registry.attendiAssestamento(sessionId);
    assert.deepEqual(registry.statoCoda(sessionId).voci, []);
    await registry.chiudi?.();
  } finally {
    try { await attendiScritture({ cartellaStore }); } catch { /* cleanup still required */ }
    rimuoviCartellaDiProva(cartellaStore);
  }
});

test('F-010-LIVE-PARENT: a child result waits for the parent to settle before waking it', async () => {
  const cartellaStore = mkdtempSync(join(tmpdir(), 'talos-agent-result-wake-'));
  const runtime = runtimeControllabile();
  try {
    const registry = createSessionRegistry({ cartellaStore, avviaSessioneFn: runtime.avviaSessioneFn,
      preparaEsecuzioneFn: () => ({ cartella: '/tmp/x', comandoProva: 'npm test', task: { id: 'task', consegna: 'avvia' } }),
      modello: 'm', chiave: 'k', cartellaEsisteFn: () => true });
    const { sessionId } = registry.avvia('task');
    await runtime.runs[0].input.onDelega('figlia', '/tmp/uno');
    runtime.fine(1);
    await new Promise((r) => setTimeout(r, 70));
    assert.equal(runtime.runs.length, 2);
    assert.equal(registry.statoCoda(sessionId).voci.length, 1);
    runtime.fine(0);
    await registry.attendiAssestamento(sessionId);
    await new Promise((r) => setTimeout(r, 70));
    assert.equal(runtime.runs.length, 3);
    runtime.fine(2);
    await registry.attendiAssestamento(sessionId);
    await registry.chiudi?.();
  } finally {
    try { await attendiScritture({ cartellaStore }); } catch { /* cleanup still required */ }
    rimuoviCartellaDiProva(cartellaStore);
  }
});

test('F-010-FAILED-PARENT: a failed turn leaves child results queued for explicit recovery', async () => {
  const cartellaStore = mkdtempSync(join(tmpdir(), 'talos-agent-result-wake-'));
  const runtime = runtimeControllabile();
  try {
    const registry = createSessionRegistry({ cartellaStore, avviaSessioneFn: runtime.avviaSessioneFn,
      preparaEsecuzioneFn: () => ({ cartella: '/tmp/x', comandoProva: 'npm test', task: { id: 'task', consegna: 'avvia' } }),
      modello: 'm', chiave: 'k', cartellaEsisteFn: () => true });
    const { sessionId } = registry.avvia('task');
    await runtime.runs[0].input.onDelega('figlia', '/tmp/uno');
    runtime.fine(0, 'errore');
    await registry.attendiAssestamento(sessionId);
    runtime.fine(1);
    await new Promise((r) => setTimeout(r, 70));
    assert.equal(runtime.runs.length, 2);
    assert.equal(registry.statoCoda(sessionId).voci.length, 1);
    await registry.chiudi?.();
  } finally {
    try { await attendiScritture({ cartellaStore }); } catch { /* cleanup still required */ }
    rimuoviCartellaDiProva(cartellaStore);
  }
});

test('F-010-STOP-PARENT: stop keeps the child result paused and starts no synthetic turn', async () => {
  const cartellaStore = mkdtempSync(join(tmpdir(), 'talos-agent-result-wake-'));
  const runtime = runtimeControllabile();
  try {
    const registry = createSessionRegistry({ cartellaStore, avviaSessioneFn: runtime.avviaSessioneFn,
      preparaEsecuzioneFn: () => ({ cartella: '/tmp/x', comandoProva: 'npm test', task: { id: 'task', consegna: 'avvia' } }),
      modello: 'm', chiave: 'k', cartellaEsisteFn: () => true });
    const { sessionId } = registry.avvia('task');
    await runtime.runs[0].input.onDelega('figlia', '/tmp/uno');
    runtime.fine(0);
    await registry.attendiAssestamento(sessionId);
    runtime.fine(1);
    assert.equal(registry.ferma(sessionId), true);
    await new Promise((r) => setTimeout(r, 70));
    assert.equal(runtime.runs.length, 2);
    assert.equal(registry.statoCoda(sessionId).voci.length, 1);
    assert.equal(registry.statoCoda(sessionId).inPausa, true);
    await registry.chiudi?.();
  } finally {
    try { await attendiScritture({ cartellaStore }); } catch { /* cleanup still required */ }
    rimuoviCartellaDiProva(cartellaStore);
  }
});

test('F-010-STORE-ERROR: a failed child queue write is visible and never triggers a parent wake', async () => {
  const cartellaStore = mkdtempSync(join(tmpdir(), 'talos-agent-result-wake-'));
  const runtime = runtimeControllabile();
  try {
    const registry = createSessionRegistry({ cartellaStore, avviaSessioneFn: runtime.avviaSessioneFn,
      preparaEsecuzioneFn: () => ({ cartella: '/tmp/x', comandoProva: 'npm test', task: { id: 'task', consegna: 'avvia' } }),
      modello: 'm', chiave: 'k', cartellaEsisteFn: () => true,
      registraRigaSyncFn: (input) => {
        if (input.record?.tipo === 'coda' && input.record.voci.some((item) => item.origine === 'delega')) {
          throw Object.assign(new Error('disco pieno'), { code: 'ENOSPC' });
        }
        return registraRigaSync(input);
      } });
    const { sessionId } = registry.avvia('task');
    const events = [];
    registry.iscriviti(sessionId, (event) => events.push(event));
    await runtime.runs[0].input.onDelega('figlia', '/tmp/uno');
    runtime.fine(0);
    await registry.attendiAssestamento(sessionId);
    runtime.fine(1);
    await new Promise((r) => setTimeout(r, 70));
    assert.equal(runtime.runs.length, 2);
    assert.equal(registry.statoCoda(sessionId).voci.length, 1);
    assert.equal(registry.statoCoda(sessionId).inPausa, true);
    assert.ok(events.some((event) => event.type === 'RunError' && event.code === 'SESSION_STORE_WRITE_FAILED'));
    await registry.chiudi?.();
  } finally {
    try { await attendiScritture({ cartellaStore }); } catch { /* cleanup still required */ }
    rimuoviCartellaDiProva(cartellaStore);
  }
});

test('F-010-NO-BUDGET: unavailable provider never admits a paid synthetic turn', async () => {
  const cartellaStore = mkdtempSync(join(tmpdir(), 'talos-agent-result-wake-'));
  const runtime = runtimeControllabile();
  let pronto = true;
  try {
    const registry = createSessionRegistry({ cartellaStore, avviaSessioneFn: runtime.avviaSessioneFn,
      preparaEsecuzioneFn: () => ({ cartella: '/tmp/x', comandoProva: 'npm test', task: { id: 'task', consegna: 'avvia' } }),
      modello: 'm', chiave: 'k', cartellaEsisteFn: () => true,
      prontoFn: () => ({ pronto, codice: 'BUDGET_UNAVAILABLE', fornitore: 'test' }) });
    const { sessionId } = registry.avvia('task');
    await runtime.runs[0].input.onDelega('figlia', '/tmp/uno');
    runtime.fine(0);
    await registry.attendiAssestamento(sessionId);
    pronto = false;
    runtime.fine(1);
    await new Promise((r) => setTimeout(r, 70));
    assert.equal(runtime.runs.length, 2);
    assert.equal(registry.statoCoda(sessionId).voci.length, 1);
    await registry.chiudi?.();
  } finally {
    try { await attendiScritture({ cartellaStore }); } catch { /* cleanup still required */ }
    rimuoviCartellaDiProva(cartellaStore);
  }
});

test('F-010-READINESS-RACE: readiness is checked once before durable admission', async () => {
  const cartellaStore = mkdtempSync(join(tmpdir(), 'talos-agent-result-wake-'));
  const runtime = runtimeControllabile();
  let calls = 0;
  try {
    const options = { cartellaStore, avviaSessioneFn: runtime.avviaSessioneFn,
      preparaEsecuzioneFn: () => ({ cartella: '/tmp/x', comandoProva: 'npm test', task: { id: 'task', consegna: 'avvia' } }),
      modello: 'm', chiave: 'k', cartellaEsisteFn: () => true,
      prontoFn: () => ({ pronto: ++calls <= 3, codice: 'BUDGET_UNAVAILABLE' }) };
    const registry = createSessionRegistry(options);
    const { sessionId } = registry.avvia('task');
    await runtime.runs[0].input.onDelega('figlia', '/tmp/uno');
    runtime.fine(0);
    await registry.attendiAssestamento(sessionId);
    runtime.fine(1);
    await new Promise((r) => setTimeout(r, 70));
    assert.equal(runtime.runs.length, 3, 'the admitted parent wake uses the readiness already checked');
    assert.equal(calls, 3, 'no second readiness call after the checkpoint');
    await attendiScritture({ cartellaStore });
    const restored = createSessionRegistry(options);
    await restored.ripristina();
    assert.equal(restored.statoCoda(sessionId).voci.length, 0, 'started result is reconciled by its checkpoint IDs');
    runtime.fine(2);
    await registry.attendiAssestamento(sessionId);
    await registry.chiudi?.();
    await restored.chiudi?.();
  } finally {
    try { await attendiScritture({ cartellaStore }); } catch { /* cleanup still required */ }
    rimuoviCartellaDiProva(cartellaStore);
  }
});

test('F-010-RESTART-BEFORE-ADMISSION: a pending child result survives and returns paused', async () => {
  const cartellaStore = mkdtempSync(join(tmpdir(), 'talos-agent-result-wake-'));
  const runtime = runtimeControllabile();
  try {
    const options = { cartellaStore, avviaSessioneFn: runtime.avviaSessioneFn,
      preparaEsecuzioneFn: () => ({ cartella: '/tmp/x', comandoProva: 'npm test', task: { id: 'task', consegna: 'avvia' } }),
      modello: 'm', chiave: 'k', cartellaEsisteFn: () => true, prontoFn: () => ({ pronto: false }) };
    // The initial run must be admitted; disable the provider only for the wake.
    let ready = true;
    options.prontoFn = () => ({ pronto: ready });
    const registry = createSessionRegistry(options);
    const { sessionId } = registry.avvia('task');
    await runtime.runs[0].input.onDelega('figlia', '/tmp/uno');
    runtime.fine(0);
    await registry.attendiAssestamento(sessionId);
    ready = false;
    runtime.fine(1);
    await new Promise((r) => setTimeout(r, 70));
    await attendiScritture({ cartellaStore });
    const restored = createSessionRegistry(options);
    await restored.ripristina();
    assert.equal(restored.statoCoda(sessionId).voci.length, 1);
    assert.equal(restored.statoCoda(sessionId).inPausa, true);
    await registry.chiudi?.();
    await restored.chiudi?.();
  } finally {
    try { await attendiScritture({ cartellaStore }); } catch { /* cleanup still required */ }
    rimuoviCartellaDiProva(cartellaStore);
  }
});

test('F-010-RESTART-AFTER-ADMISSION: checkpoint IDs prevent a second delivery after a crash', async () => {
  const cartellaStore = mkdtempSync(join(tmpdir(), 'talos-agent-result-wake-'));
  const runtime = runtimeControllabile();
  try {
    const options = { cartellaStore, avviaSessioneFn: runtime.avviaSessioneFn,
      preparaEsecuzioneFn: () => ({ cartella: '/tmp/x', comandoProva: 'npm test', task: { id: 'task', consegna: 'avvia' } }),
      modello: 'm', chiave: 'k', cartellaEsisteFn: () => true };
    const registry = createSessionRegistry(options);
    const { sessionId } = registry.avvia('task');
    await runtime.runs[0].input.onDelega('figlia', '/tmp/uno');
    runtime.fine(0);
    await registry.attendiAssestamento(sessionId);
    runtime.fine(1);
    await new Promise((r) => setTimeout(r, 70));
    assert.equal(runtime.runs.length, 3);
    await attendiScritture({ cartellaStore });
    const restored = createSessionRegistry(options);
    await restored.ripristina();
    assert.deepEqual(restored.statoCoda(sessionId).voci, []);
    assert.equal(runtime.runs.length, 3);
    runtime.fine(2);
    await registry.attendiAssestamento(sessionId);
    await registry.chiudi?.();
    await restored.chiudi?.();
  } finally {
    try { await attendiScritture({ cartellaStore }); } catch { /* cleanup still required */ }
    rimuoviCartellaDiProva(cartellaStore);
  }
});
