/*
 * ⭐ 0.1.25 (owner 09/10/2026) nel REGISTRO — chi riceve la porta del modello sui fornitori esclusi (`onFornitoriFn`): una chat
 *   normale sì; senza `collegaFornitori` (la CLI) nessuno; il giro di un'automazione sì ma marcato (l'ospite gli nega i cambi).
 *   Stesso banco di `automation-registro.test.mjs`.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
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
      runs.push({ input, resolve })
      input.onEvento({ type: 'RunStarted', threadId: `t${runs.length}`, runId: `r${runs.length}` })
      return promise
    },
    fineTutti() {
      runs.forEach((run, i) => {
        run.input.onEvento({ type: 'RunFinished', threadId: `t${i}`, runId: `r${i}` })
        run.resolve({ ok: true, esito: { detto: 'ok', comeFinita: 'concluso', messaggiFinali: [{ role: 'user', content: 'x' }, { role: 'assistant', content: 'ok' }] } })
      })
    },
  }
}
const CON_TEMPO = { timeout: 30_000 }
async function scena(t, { collega = true } = {}) {
  const cartellaStore = mkdtempSync(join(tmpdir(), 'talos-forn-reg-'))
  const lavoro = mkdtempSync(join(tmpdir(), 'talos-forn-reg-lavoro-'))
  const runtime = runtimeControllabile()
  const registry = createSessionRegistry({ cartellaStore, avviaSessioneFn: runtime.avviaSessioneFn,
    preparaEsecuzioneFn: () => ({ cartella: lavoro, comandoProva: 'npm test', task: { id: 'task', consegna: 'lavora' } }),
    modello: 'vendor/m', chiave: 'k', cartellaEsisteFn: () => true })
  t.after(async () => {
    runtime.fineTutti()
    await registry.chiudi?.()
    try { await attendiScritture({ cartellaStore }) } catch { /* pulizia comunque */ }
    rimuoviCartellaDiProva(cartellaStore); rimuoviCartellaDiProva(lavoro)
  })
  const contesti = []
  if (collega) registry.collegaFornitori((contesto) => { contesti.push(contesto); return async (nome) => ({ ok: true, testo: `${nome} ok` }) })
  return { registry, runtime, contesti }
}

test('FORN-REG-01 — una chat normale riceve la porta, non come giro di automazione', CON_TEMPO, async (t) => {
  const { registry, runtime, contesti } = await scena(t)
  registry.avvia('task', { permessiScelto: 'Workspace write' })
  const input = runtime.runs[0].input
  assert.equal(typeof input.onFornitoriFn, 'function')
  assert.equal((await input.onFornitoriFn('provider_exclusions_list', {}, { fase: 'esegui' })).testo, 'provider_exclusions_list ok')
  assert.deepEqual(contesti, [{ automazioneDelGiro: null }])
})

test('FORN-REG-02 AL CONTRARIO — senza collegaFornitori (la CLI) nessuna porta', CON_TEMPO, async (t) => {
  const { registry, runtime } = await scena(t, { collega: false })
  registry.avvia('task', { permessiScelto: 'Workspace write' })
  assert.equal(runtime.runs[0].input.onFornitoriFn, undefined)
})
