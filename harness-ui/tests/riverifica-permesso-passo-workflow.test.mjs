/*
 * ⭐ RIVERIFICA AVVERSARIA (bugfixer, 15/10/2026) — `feat/permesso-per-il-modello` 03a9d37fa, riserva S4.
 *  La cura esclude `voce.padreId` E `voce.legameWorkflow`. PERM-MOD-06 prova la figlia; il ramo del passo di Workflow (che NON ha
 *  `padreId`: `avviaSessioneDiPasso` non lo passa) restava senza prova — il mutante che toglie `|| voce.legameWorkflow` sopravviveva,
 *  e un passo «Read only» avrebbe letto «Full access» nella riga «Turn permission». Controllo: verde sulla cura, rosso sul mutante.
 * Rapporto: `handoff-talos-2026-09-27/bugfixer/RAPPORTO-RIVERIFICA-G5D-CODA-S4-2026-10-15.md`.
 */
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

const FULL = 'Full access (TALOS asks the person only before secret files)';

test('PERM-RIV-01 AL CONTRARIO — un passo di Workflow (senza padreId, con legameWorkflow) NON riceve il permesso detto alla conversazione', async (t) => {
  const { createSessionRegistry } = await import('../src/session-registry.mjs');
  const { attendiScritture } = await import('../src/session-store.mjs');
  const cartellaStore = mkdtempSync(join(tmpdir(), 'talos-perm-riv-passo-'));
  const visti = [];
  const chiusure = [];
  const registry = createSessionRegistry({ cartellaStore, permessoPerIlModello: FULL,
    avviaSessioneFn: (input) => { visti.push(input); const n = visti.length; input.onEvento({ type: 'RunStarted', threadId: 't', runId: `r${n}` });
      return new Promise((risolvi) => chiusure.push(() => { input.onEvento({ type: 'RunFinished', threadId: 't', runId: `r${n}` }); risolvi({ ok: true, esito: { detto: 'ok', comeFinita: 'concluso', messaggiFinali: [] } }); })); },
    preparaEsecuzioneFn: () => ({ cartella: cartellaStore, comandoProva: 'npm test', task: { id: 'task', consegna: 'ciao' } }),
    modello: 'm', chiave: 'k', cartellaEsisteFn: () => true });
  t.after(async () => {
    for (const c of chiusure) c();
    try { await registry.chiudi?.(); } catch { /* già chiuso */ }
    try { await attendiScritture({ cartellaStore }); } catch { /* pulizia comunque */ }
    rimuoviCartellaDiProva(cartellaStore);
  });
  registry.avvia('task', { permessiScelto: 'Full access', modalitaOperativaScelta: 'normale' });
  assert.equal(visti[0].permessoPerIlModello, FULL, 'premessa: la conversazione lo riceve');
  const rootSessionId = registry.elenca().find((s) => !s.padreId)?.sessionId;
  const legame = { runId: '11111111-1111-4111-8111-111111111111', nodeId: 'passo-1', activityExecutionId: '22222222-2222-4222-8222-222222222222', attempt: 1, leaseId: '33333333-3333-4333-8333-333333333333', leaseEpoch: 0 };
  const passo = registry.avviaSessioneDiPasso({ legame, rootSessionId, consegna: 'Read the files and summarise them.' });
  assert.ok(passo?.sessionId, `premessa: il passo parte (${JSON.stringify(passo)?.slice(0, 200)})`);
  passo.fine?.catch(() => {}); // il passo si chiude con il registro: il suo esito non è ciò che si prova qui
  await new Promise((r) => setTimeout(r, 20));
  const inputPasso = visti.find((v) => v !== visti[0]);
  assert.ok(inputPasso, 'premessa: il passo ha un suo giro');
  assert.equal(inputPasso.permessi, 'Read only', 'premessa: il passo è in sola lettura');
  assert.equal(inputPasso.permessoPerIlModello, undefined, 'a «Read only» Workflow step is told «Full access» in its Turn permission line');
});
