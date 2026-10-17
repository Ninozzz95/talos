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


async function chiudiGiro(registry, runtime, i, sessionId) {
  const run = runtime.runs[i]
  run.input.onEvento({ type: 'RunFinished', threadId: `t${i}`, runId: `r${i}` })
  run.resolve({ ok: true, esito: { detto: 'ok', comeFinita: 'concluso', messaggiFinali: [{ role: 'user', content: 'x' }, { role: 'assistant', content: 'ok' }] } })
  await registry.attendiAssestamento(sessionId)
}

test('FORN-RI-01 — giro `-p` in sola lettura, poi ripresa con la persona davanti: porta PIENA; poi ripresa interna: resta piena', CON_TEMPO, async (t) => {
  const { registry, runtime, contesti } = await scena(t)
  const { sessionId } = registry.avvia('task', { permessiScelto: 'Workspace write', senzaInterfacciaNelGiro: true })
  assert.deepEqual(contesti.at(-1), { automazioneDelGiro: null, soloLettura: true })
  await chiudiGiro(registry, runtime, 0, sessionId)
  const r1 = registry.resume(sessionId, 'adesso ci sono io', [], { senzaInterfacciaNelGiro: false })
  assert.ok(!r1?.erroreAvvio, JSON.stringify(r1))
  assert.equal(runtime.runs.length, 2, 'premessa: la ripresa ha avviato un giro')
  assert.deepEqual(contesti.at(-1), { automazioneDelGiro: null, soloLettura: false }, 'con la persona davanti la porta torna piena')
  await chiudiGiro(registry, runtime, 1, sessionId)
  const r2 = registry.resume(sessionId, 'ancora', [])
  assert.ok(!r2?.erroreAvvio, JSON.stringify(r2))
  assert.deepEqual(contesti.at(-1), { automazioneDelGiro: null, soloLettura: false }, 'una ripresa senza la parola del giro tiene quella di prima')
})

test('FORN-RI-02 — sessione nata senza interfaccia (intestazione), ripresa con la persona davanti: porta piena; senza parola: sola lettura', CON_TEMPO, async (t) => {
  const { registry, runtime, contesti } = await scena(t)
  const { sessionId } = registry.avvia('task', { permessiScelto: 'Workspace write', senzaInterfaccia: true })
  assert.deepEqual(contesti.at(-1), { automazioneDelGiro: null, soloLettura: true }, 'senza interfaccia salvata: sola lettura (prima: nessuna porta)')
  await chiudiGiro(registry, runtime, 0, sessionId)
  registry.resume(sessionId, 'senza parola', [])
  assert.deepEqual(contesti.at(-1), { automazioneDelGiro: null, soloLettura: true }, 'vale quella salvata')
  await chiudiGiro(registry, runtime, 1, sessionId)
  registry.resume(sessionId, 'ci sono', [], { senzaInterfacciaNelGiro: false })
  assert.deepEqual(contesti.at(-1), { automazioneDelGiro: null, soloLettura: false }, 'la parola del giro vince')
})
