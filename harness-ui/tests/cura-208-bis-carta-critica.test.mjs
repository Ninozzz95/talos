/*
 * Cure 208 bis, MEDIA-5 (decisions 155 and 216): the critical-delete card belongs to the person in every mode. An automatic yes (rule, mode,
 * classifier) never opens it, and no scope («this folder for the session», «this path», «just this once») is ever kept from it: the card
 * has no «always». Fake runtime, temporary store, no key.
 */
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { createSessionRegistry } from '../src/session-registry.mjs'

async function scena(t) {
  const runs = []
  const registry = createSessionRegistry({ cartellaStore: mkdtempSync(join(tmpdir(), 'talos-c208b-')), modello: 'm', chiave: 'k', cartellaEsisteFn: () => true,
    preparaEsecuzioneFn: () => ({ cartella: 'C:/progetto', comandoProva: null, task: { id: 'task', consegna: 'x' } }),
    avviaSessioneFn: (input) => { input.onEvento({ type: 'RunStarted', threadId: 't', runId: 'r' }); runs.push(input); return new Promise(() => {}) } })
  t.after(() => registry.chiudi?.())
  const { sessionId } = registry.avvia('task', { permessiScelto: 'Workspace write', modalitaOperativaScelta: 'normale' })
  const carta = { tipo: 'shell', comando: 'rd /s /q C:\\Users\\nino', fuoriDalProgetto: { chiave: 'C:/Users/nino' },
    cancellazioneCritica: { percorso: 'C:\\Users\\nino', perche: 'casa' } }
  const domanda = runs[0].chiediApprovazioneFn(carta)
  await new Promise((r) => setTimeout(r, 10))
  return { registry, sessionId, domanda, requestId: registry.domandaInAttesa(sessionId)?.requestId }
}

for (const motivo of ['regola', 'modalita', 'classificatore']) {
  test(`C208B-5 — an automatic yes («${motivo}») never opens the critical card`, async (t) => {
    const { registry, sessionId, domanda, requestId } = await scena(t)
    assert.ok(requestId, 'premise: the card is pending')
    registry.rispondiApprovazione(sessionId, requestId, true, { motivo })
    const esito = await domanda
    assert.notEqual(esito === true || esito?.approvato === true, true, 'only the person can open the critical card')
  })
}

test('C208B-6 — a scope answer on the critical card is refused and nothing is remembered', async (t) => {
  const { registry, sessionId, requestId } = await scena(t)
  const r = registry.rispondiApprovazione(sessionId, requestId, true, { ambito: 'cartella' })
  assert.equal(r.code, 'QUERY_INVALID', 'the critical card has no «for the session»')
  for (const ambito of ['percorso', 'volta']) assert.equal(registry.rispondiApprovazione(sessionId, requestId, true, { ambito }).code, 'QUERY_INVALID')
  assert.equal(registry.domandaInAttesa(sessionId)?.requestId, requestId, 'the card stays pending for the person')
})

test('C208B-7 — the person\'s plain yes still opens the critical card', async (t) => {
  const { registry, sessionId, domanda, requestId } = await scena(t)
  assert.deepEqual(registry.rispondiApprovazione(sessionId, requestId, true), { ok: true })
  const esito = await domanda
  assert.equal(esito === true || esito?.approvato === true, true)
})
