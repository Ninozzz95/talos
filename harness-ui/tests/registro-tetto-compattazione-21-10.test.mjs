/*
 * 21/10/2026 (richiesta della CLI, `context.compactAtTokens`): il tetto di compattazione scelto dall'ospite arriva al registro
 * (`tettoCompattazioneFn`), vince sulla variabile d'ambiente nelle soglie del registro (riassunto di fine giro, politica esposta) e
 * viaggia fino al giro come `tettoCompattazioneToken` — passando da `agent-service`, che inoltra i campi uno per uno (la lezione del
 * 17/10: un'opzione nuova si prova lungo tutto il filo). Il verso contrario: senza la funzione, o con un valore non valido, tutto com'era.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { createSessionRegistry as createSessionRegistryReale } from '../src/session-registry.mjs';
import { avviaSessione } from '../src/agent-service.mjs';
import { TaskCatalogError } from '../src/task-catalog.mjs';

const createSessionRegistry = (opzioni) => createSessionRegistryReale({ guardaWorkspaceFn: () => () => {}, ...opzioni });
function preparaEsecuzioneFinta(taskId) {
  if (taskId !== 'task-vero') throw new TaskCatalogError(`Task non ammesso: ${taskId}`);
  return { cartella: process.cwd(), comandoProva: null, task: { id: taskId, consegna: 'c' } };
}

/** Il registro VERO e `avviaSessione` VERO; al posto del kernel una spia che registra ciò che le arriva e chiude subito. */
async function giroSpiato(opzioni) {
  let alKernel = null;
  const registro = createSessionRegistry({
    avviaSessioneFn: (input) => avviaSessione({ ...input, talosLavoraFn: async (ri) => { alKernel = ri; return { comeFinita: 'concluso', messaggiFinali: [] }; } }),
    preparaEsecuzioneFn: preparaEsecuzioneFinta, modello: 'z-ai/glm-5.3-flash', chiave: 'k', ...opzioni,
  });
  const { sessionId } = registro.avvia('task-vero');
  const fine = Date.now() + 10_000;
  while (!alKernel && Date.now() < fine) await new Promise((r) => { setTimeout(r, 10); });
  const politica = registro.politicaCompattazione(sessionId);
  registro.ferma?.(sessionId);
  return { alKernel, politica };
}

test('TCF-01 il tetto dell\'ospite vince sull\'ambiente nelle soglie del registro e arriva al kernel attraverso agent-service', async () => {
  const chiestoPer = [];
  const prima = process.env.TALOS_COMPACTION_TOKEN_CAP;
  process.env.TALOS_COMPACTION_TOKEN_CAP = '80000'; // l'ambiente dice un altro tetto: deve perdere
  let r;
  try {
    r = await giroSpiato({ finestraTokenFn: () => 1_000_000, limiteUscitaFn: () => 16_384,
      tettoCompattazioneFn: (m) => { chiestoPer.push(m); return 50_000; } });
  } finally { if (prima === undefined) delete process.env.TALOS_COMPACTION_TOKEN_CAP; else process.env.TALOS_COMPACTION_TOKEN_CAP = prima; }
  const { alKernel, politica } = r;
  assert.ok(alKernel, 'il giro è arrivato al kernel');
  assert.equal(alKernel.tettoCompattazioneToken, 50_000);
  assert.equal(alKernel.limiteUscitaToken, 16_384, 'e il limite d\'uscita, sullo stesso filo');
  assert.equal(politica.triggerTokens, 50_000);
  assert.equal(politica.source, 'explicit-cap');
  assert.ok(chiestoPer.includes('z-ai/glm-5.3-flash'));
});

test('TCF-02 verso contrario: senza la funzione, o con un valore non valido o un\'eccezione, il tetto non viaggia e vale la finestra', async () => {
  for (const tettoCompattazioneFn of [undefined, () => null, () => 0, () => -5, () => 1.5, () => '50000', () => { throw new Error('rotto'); }]) {
    const { alKernel, politica } = await giroSpiato({ finestraTokenFn: () => 1_000_000, ...(tettoCompattazioneFn ? { tettoCompattazioneFn } : {}) });
    assert.ok(alKernel);
    assert.equal(Object.hasOwn(alKernel, 'tettoCompattazioneToken'), false, String(tettoCompattazioneFn));
    assert.equal(politica.triggerTokens, 750_000, String(tettoCompattazioneFn));
    assert.equal(politica.source, 'route-minimum');
  }
});
