/*
 * Cache del piano (CLI, 15/10/2026): un aggiornamento delle impostazioni che non cambia NIENTE non scrive una riga (R7-04-bis in
 * c2r7). Qui il verso contrario della guardia, su sessioni RIPRISTINATE dal disco: quando la riga nuova serve davvero anche se i
 * valori chiesti sono quelli di adesso, si scrive.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSessionRegistry, SCHEMA_SESSIONE } from '../src/session-registry.mjs';
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs';

async function ripristinata(t, { impostazioni, intestazione = {} }) {
  const cartellaStore = mkdtempSync(join(tmpdir(), 'talos-impostazioni-invariate-'));
  t.after(() => rimuoviCartellaDiProva(cartellaStore));
  const sessionId = 'sess-storica';
  const file = join(cartellaStore, `${sessionId}.jsonl`);
  const righe = [
    { tipo: 'intestazione', schema: SCHEMA_SESSIONE, sessionId, taskId: 'libero:x', cartella: cartellaStore, task: { consegna: 'vecchia', consegnaCorta: 'vecchia' },
      avviataAlle: '2026-09-20T10:00:00.000Z', modello: 'm', permessi: 'Workspace write', modalitaOperativa: 'normale', ...intestazione },
    { tipo: 'impostazioni-sessione', modello: 'm', modelloPlanner: null, reasoning: null, permessi: 'Workspace write', modalitaOperativa: 'normale', permessiPerAttrezzo: null, modelId: 'm', ...impostazioni },
    { type: 'RunStarted', threadId: 't1', runId: 'r1', _sequenza: 1 },
    { type: 'RunFinished', threadId: 't1', runId: 'r1', _sequenza: 2 },
  ];
  writeFileSync(file, righe.map((r) => JSON.stringify(r)).join('\n') + '\n');
  const registro = createSessionRegistry({ cartellaStore, modello: 'm', chiave: 'k', guardaWorkspaceFn: () => () => {}, cartellaEsisteFn: () => true,
    avviaSessioneFn: async () => new Promise(() => {}) });
  await registro.ripristina();
  const righeImpostazioni = () => readFileSync(file, 'utf8').split('\n').filter(Boolean).map((r) => JSON.parse(r)).filter((r) => r.tipo === 'impostazioni-sessione');
  return { registro, sessionId, righeImpostazioni };
}

test('IMPOSTAZIONI-INVARIATE-01 — con la fascia «usava Workflow» accesa, gli stessi valori scrivono la riga che la spegne', async (t) => {
  const { registro, sessionId, righeImpostazioni } = await ripristinata(t, { impostazioni: { modalitaOperativa: 'workflow' }, intestazione: { modalitaOperativa: 'workflow' } });
  assert.equal(registro.elenca().find((s) => s.sessionId === sessionId).usavaModalitaWorkflow, true, 'premise: the banner is on');
  assert.deepEqual(await registro.aggiornaImpostazioni(sessionId, { modello: 'm' }), { ok: true });
  assert.equal(righeImpostazioni().length, 2, 'the row that turns the banner off is written');
  assert.equal(registro.elenca().find((s) => s.sessionId === sessionId).usavaModalitaWorkflow, false);
});

test('IMPOSTAZIONI-INVARIATE-02 — un modelId rimasto vecchio sul disco si riallinea anche se il modello chiesto è lo stesso', async (t) => {
  const { registro, sessionId, righeImpostazioni } = await ripristinata(t, { impostazioni: { modelId: 'vecchio/modello' } });
  assert.deepEqual(await registro.aggiornaImpostazioni(sessionId, { modello: 'm' }), { ok: true });
  const righe = righeImpostazioni();
  assert.equal(righe.length, 2, 'a stale modelId is a change: the row is written');
  assert.equal(righe.at(-1).modelId, 'm');
});

test('IMPOSTAZIONI-INVARIATE-03 AL CONTRARIO — sulla stessa sessione ripristinata, senza niente da cambiare, nessuna riga', async (t) => {
  const { registro, sessionId, righeImpostazioni } = await ripristinata(t, { impostazioni: {} });
  assert.deepEqual(await registro.aggiornaImpostazioni(sessionId, { modello: 'm', permessi: 'Workspace write' }), { ok: true });
  assert.equal(righeImpostazioni().length, 1, 'nothing changed, nothing written');
});
