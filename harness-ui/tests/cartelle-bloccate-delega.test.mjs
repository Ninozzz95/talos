/*
 * Owner 27/10/2026 — CARTELLE BLOCCATE, tappa B: una DELEGA nata in un giro di un dispositivo ne eredita i blocchi (contratto
 * CONTRATTO-CARTELLE-BLOCCATE-2026-10-27, giro 2, revisione 1: «Children: a delegation … inherits the same device id, so its blocks»).
 * La figlia non ha un messaggio suo della persona: `dispositivoDelGiroDi` risale al padre. Al contrario: la figlia di un giro del PC no.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSessionRegistry } from '../src/session-registry.mjs'
import { attendiScritture } from '../src/session-store.mjs'
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs'

function runtimeControllabile() {
  const runs = []
  return {
    runs,
    avviaSessioneFn(input) {
      let resolve
      const promise = new Promise((r) => { resolve = r })
      const index = runs.length
      runs.push({ input, resolve })
      input.onEvento({ type: 'RunStarted', threadId: `t${index}`, runId: `r${index}` })
      return promise
    },
    fine(index) {
      const run = runs[index]
      run.input.onEvento({ type: 'RunFinished', threadId: `t${index}`, runId: `r${index}` })
      run.resolve({ ok: true, esito: { detto: `risposta ${index}`, comeFinita: 'concluso', messaggiFinali: [{ role: 'user', content: 'lavora' }, { role: 'assistant', content: `risposta ${index}` }] } })
    },
  }
}
async function scena(t) {
  const cartellaStore = mkdtempSync(join(tmpdir(), 'talos-bloccate-delega-'))
  const runtime = runtimeControllabile()
  const chiesti = []
  const registry = createSessionRegistry({ cartellaStore, avviaSessioneFn: runtime.avviaSessioneFn,
    preparaEsecuzioneFn: () => ({ cartella: '/tmp/x', comandoProva: 'npm test', task: { id: 'task', consegna: 'delega un lavoro' } }),
    modello: 'm', chiave: 'k', cartellaEsisteFn: () => true,
    bloccateDelDispositivoFn: async (id) => { chiesti.push(id); return id === 'pad-1' ? ['C:\\fuori\\Documenti'] : [] } })
  t.after(async () => {
    await registry.chiudi?.()
    try { await attendiScritture({ cartellaStore }) } catch { /* pulizia comunque */ }
    rimuoviCartellaDiProva(cartellaStore)
  })
  const { sessionId } = registry.avvia('task', { permessiScelto: 'Full access', modalitaOperativaScelta: 'normale' })
  return { registry, runtime, sessionId, chiesti }
}
const figliaDi = async (s, indicePadre) => {
  const delega = await s.runtime.runs[indicePadre].input.onDelega('figlia: leggi un file', '/tmp/x')
  const figliaId = delega?.childId ?? s.registry.elenca().find((x) => x.padreId === s.sessionId)?.sessionId
  assert.ok(figliaId, `premessa: la figlia esiste (${JSON.stringify(delega)})`)
  return s.runtime.runs.at(-1).input
}

test('BLOC-D-01 la figlia di un giro del dispositivo ne eredita i blocchi', async (t) => {
  const s = await scena(t)
  s.runtime.fine(0)
  await s.registry.attendiAssestamento?.(s.sessionId)
  const r = s.registry.resume(s.sessionId, 'dal tablet: delega', [], { dispositivoDelGiro: 'pad-1' })
  assert.equal(r?.erroreAvvio, undefined, JSON.stringify(r))
  const figlia = await figliaDi(s, 1)
  assert.equal(typeof figlia.percorsiBloccatiFn, 'function')
  assert.equal(figlia.percorsiBloccatiFn.attiva(), true)
  assert.deepEqual(await figlia.percorsiBloccatiFn(), ['C:\\fuori\\Documenti'])
})

test('BLOC-D-02 al contrario: la figlia di un giro del PC non è limitata e non legge il file', async (t) => {
  const s = await scena(t)
  const figlia = await figliaDi(s, 0)
  assert.equal(figlia.percorsiBloccatiFn.attiva(), false)
  assert.deepEqual(await figlia.percorsiBloccatiFn(), [])
  assert.deepEqual(s.chiesti, [])
})
