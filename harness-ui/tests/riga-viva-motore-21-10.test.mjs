/*
 * B1 sulla strada del MOTORE DEL CONTESTO (21/10/2026, revisione del Mobile): per le conversazioni nuove il motore è quello di serie,
 * e quando il giro aspettava un riassunto scritto dal motore non arrivava niente — né la riga viva con «Skip», né `riassuntoAtteso`
 * nel registro (lo Skip rispondeva `saltato:false`). Ora il motore dice quando il giro aspetta (`onInTurnWait`), l'adattatore lo
 * traduce nello stesso `compattazione-inizio` della compattazione semplice (`origine:'motore'`) e lo chiude muto (`motivo:'motore'`).
 * Registro VERO, `avviaSessione` VERO, adattatore VERO; finti solo il motore del contesto e la rete.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { createSessionRegistry as createSessionRegistryReale } from '../src/session-registry.mjs';
import { avviaSessione } from '../src/agent-service.mjs';
import { talosLavora } from '../src/kernel/talosHarness.desktop-hotfix.mjs';
import { TaskCatalogError } from '../src/task-catalog.mjs';

function preparaEsecuzioneFinta(taskId) {
  if (taskId !== 'task-vero') throw new TaskCatalogError(`Task non ammesso: ${taskId}`);
  return { cartella: process.cwd(), comandoProva: null, task: { id: taskId, consegna: 'Rispondi.' } };
}
const attendi = async (cond, ms = 10_000) => { const fine = Date.now() + ms; while (!cond() && Date.now() < fine) await new Promise((r) => { setTimeout(r, 10); }); return cond(); };
const rete = async () => Response.json({ choices: [{ index: 0, message: { role: 'assistant', content: 'fatto' }, finish_reason: 'stop' }], usage: { prompt_tokens: 100, completion_tokens: 2 } });

/** Il motore finto: alla prima richiesta, se `aspetta`, annuncia l'attesa e resta fermo finché il segnale della richiesta non scatta. */
function motoreFinto({ aspetta }) {
  const stato = { segnale: null, chiamate: 0, inAttesa: false };
  const hooks = {
    captureProviderResponse: async () => undefined,
    prepare: async ({ messages, signal, onInTurnWait }) => {
      stato.chiamate += 1;
      if (!aspetta || stato.chiamate > 1) return { messages };
      stato.segnale = signal ?? null;
      onInTurnWait?.({ state: 'waiting', jobId: 'job-1', ceilingMs: 600_000 });
      stato.inAttesa = true;
      try {
        await new Promise((_, rifiuta) => {
          const via = () => rifiuta(Object.assign(new Error('aborted'), { name: 'AbortError' }));
          if (signal?.aborted) via(); else signal?.addEventListener('abort', via, { once: true });
        });
      } finally {
        stato.inAttesa = false;
        onInTurnWait?.({ state: 'done', jobId: 'job-1', outcome: 'cancelled' });
      }
      return { messages };
    },
  };
  return { hooks, stato };
}

function registroColMotore(motore) {
  return createSessionRegistryReale({
    guardaWorkspaceFn: () => () => {},
    avviaSessioneFn: (input) => avviaSessione({ ...input, talosLavoraFn: (ri) => talosLavora({ ...ri, fetchDiRete: rete }) }),
    contextHooksFn: async () => motore.hooks,
    preparaEsecuzioneFn: preparaEsecuzioneFinta, modello: 'z-ai/glm-5.3-flash', chiave: 'k',
  });
}
const compattazioni = (registro, sessionId) => (registro.esporta(sessionId)?.eventi ?? []).filter((e) => e.type === 'CUSTOM' && e.name === 'talos.compattazione').map((e) => e.value);
const finito = (registro, sessionId) => (registro.esporta(sessionId)?.eventi ?? []).some((e) => e.type === 'RunFinished' || e.type === 'RunError');

test('MOT-01 il motore aspetta un riassunto: inizio nel giornale, il registro lo sa, Skip arriva al motore, chiusura muta', async () => {
  const motore = motoreFinto({ aspetta: true });
  const registro = registroColMotore(motore);
  const { sessionId } = registro.avvia('task-vero');
  assert.ok(await attendi(() => motore.stato.inAttesa), 'il motore è in attesa del riassunto');
  assert.ok(await attendi(() => compattazioni(registro, sessionId).some((v) => v.fase === 'inizio')), JSON.stringify(compattazioni(registro, sessionId)));
  const inizio = compattazioni(registro, sessionId).find((v) => v.fase === 'inizio');
  assert.equal(inizio.motivo, 'soglia', 'apre la riga viva come un riassunto atteso, non come lo sfondo');
  assert.ok(Number.isSafeInteger(inizio.giro), 'col suo giro');
  assert.deepEqual(registro.saltaRiassunto(sessionId), { saltato: true }, 'ora lo Skip c\'è');
  assert.ok(await attendi(() => motore.stato.segnale?.aborted === true), 'lo Skip arriva al motore dentro il segnale della richiesta');
  assert.ok(await attendi(() => finito(registro, sessionId)), 'il giro va avanti e finisce');
  const fine = compattazioni(registro, sessionId).find((v) => v.fase === 'fine' && v.motivo === 'motore');
  assert.ok(fine, `la chiusura muta della riga: ${JSON.stringify(compattazioni(registro, sessionId))}`);
  assert.equal(fine.compattato, false);
  assert.equal(fine.giro, inizio.giro);
  assert.deepEqual(registro.saltaRiassunto(sessionId), { saltato: false });
});

test('MOT-02 verso contrario: il motore che non aspetta non apre niente, e lo Skip non si arma', async () => {
  const motore = motoreFinto({ aspetta: false });
  const registro = registroColMotore(motore);
  const { sessionId } = registro.avvia('task-vero');
  assert.ok(await attendi(() => motore.stato.chiamate >= 1));
  assert.deepEqual(registro.saltaRiassunto(sessionId), { saltato: false });
  assert.ok(await attendi(() => finito(registro, sessionId)));
  assert.deepEqual(compattazioni(registro, sessionId), []);
});

test('MOT-03 (richiesta della CLI) uno Stop durante l\'attesa: la chiusura muta parte lo stesso, e mai una fine senza il suo inizio', async () => {
  const motore = motoreFinto({ aspetta: true });
  const registro = registroColMotore(motore);
  const { sessionId } = registro.avvia('task-vero');
  assert.ok(await attendi(() => motore.stato.inAttesa));
  registro.ferma(sessionId);
  assert.ok(await attendi(() => motore.stato.segnale?.aborted === true), 'lo Stop arriva al motore');
  assert.ok(await attendi(() => finito(registro, sessionId)));
  const v = compattazioni(registro, sessionId);
  const inizi = v.filter((x) => x.fase === 'inizio');
  const fini = v.filter((x) => x.fase === 'fine' && x.motivo === 'motore');
  assert.equal(inizi.length, 1, JSON.stringify(v));
  assert.equal(fini.length, 1, JSON.stringify(v));
  assert.equal(fini[0].giro, inizi[0].giro);
  assert.ok(v.indexOf(inizi[0]) < v.indexOf(fini[0]), 'prima l\'inizio, poi la fine');
});
