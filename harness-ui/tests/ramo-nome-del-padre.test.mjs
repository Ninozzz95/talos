/*
 * P2-C, riga 39, nota 11q (decisione 411; Tester 08/11, passo 10): «Duplica come ramo» di una chat rinominata dava al ramo il titolo VECCHIO
 * della chat (quello nato dal primo messaggio, «Rispondi solo con questo blocco… -3 · ramo») e non quello scelto dalla persona («Tester BG3 10»).
 * Il nome di nascita di un ramo è il nome ATTUALE della chat da cui nasce; senza un nome, quello di sempre (dal compito).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createSessionRegistry as createSessionRegistryReale } from '../src/session-registry.mjs';
import { TaskCatalogError } from '../src/task-catalog.mjs';

const createSessionRegistry = (opzioni) => createSessionRegistryReale({ guardaWorkspaceFn: () => () => {}, ...opzioni });
function preparaEsecuzioneFinta(taskId) {
  if (taskId !== 'task-vero') throw new TaskCatalogError(`Task non ammesso: ${taskId}`);
  return { cartella: '/tmp/x', comandoProva: 'npm test', task: { id: taskId, consegna: 'c' } };
}
const STORIA = [{ role: 'user', content: 'c' }, { role: 'assistant', content: 'fatto' }];

/** ogni giro parte e si conclude da sé, con una conversazione da ereditare */
function banco() {
  const registro = createSessionRegistry({
    avviaSessioneFn: async (input) => {
      input.onEvento({ type: 'RunStarted', threadId: 't', runId: 'r' });
      await new Promise((r) => setImmediate(r));
      input.onEvento({ type: 'RunFinished', threadId: 't', runId: 'r' });
      return { ok: true, esito: { comeFinita: 'concluso', messaggiFinali: STORIA } };
    },
    preparaEsecuzioneFn: preparaEsecuzioneFinta, modello: 'm', chiave: 'k', cartellaEsisteFn: () => true,
  });
  const nomeDi = (id) => registro.elenca().find((r) => r.sessionId === id)?.nome ?? null;
  return { registro, nomeDi };
}
const fermo = async (registro, id) => {
  for (let i = 0; i < 50 && !registro.elenca().find((r) => r.sessionId === id)?.conclusa; i += 1) await new Promise((r) => setTimeout(r, 5));
};

test('P2C-11q-A il ramo di una chat rinominata nasce col nome scelto dalla persona, non col titolo vecchio', async () => {
  const { registro, nomeDi } = banco();
  const { sessionId } = registro.avvia('task-vero');
  await fermo(registro, sessionId);
  assert.deepEqual(await registro.rinomina(sessionId, 'Tester BG3 10'), { ok: true });
  const ramo = registro.forka(sessionId);
  assert.ok(ramo?.sessionId, `il ramo nasce (${ramo?.erroreAvvio ?? ''})`);
  assert.match(String(nomeDi(ramo.sessionId)), /^Tester BG3 10(?: ?-\d+)?$/u, 'il nome della chat da cui nasce, col solo numero che la distingue');
  await fermo(registro, ramo.sessionId);
});

test('P2C-11q-B al contrario: il ramo di una chat MAI rinominata nasce come prima (nome dal compito, qui nessuno)', async () => {
  const { registro, nomeDi } = banco();
  const { sessionId } = registro.avvia('task-vero');
  await fermo(registro, sessionId);
  assert.equal(nomeDi(sessionId), null);
  const ramo = registro.forka(sessionId);
  assert.ok(ramo?.sessionId);
  assert.equal(nomeDi(ramo.sessionId), null, 'nessun nome inventato');
  await fermo(registro, ramo.sessionId);
});
