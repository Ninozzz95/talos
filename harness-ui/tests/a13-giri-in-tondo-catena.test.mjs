/*
 * ⭐ «Full access non chiede» per i giri in tondo (owner 26/10, desktop), lungo la CATENA padre → figlia: decide il livello EFFETTIVO
 *   della figlia ADESSO (mai sopra il padre). Prove della revisione avversaria del blocco 2 (26/10/2026), portate nel ramo: RV-F2 e
 *   RV-F3 uccidono i mutanti «solo il livello della sessione» e «solo il livello d'avvio», che le prove A13-05/06 lasciavano vivi.
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
async function scena(t, permessi) {
  const cartellaStore = mkdtempSync(join(tmpdir(), 'talos-rev2-full-'))
  const runtime = runtimeControllabile()
  const registry = createSessionRegistry({ cartellaStore, avviaSessioneFn: runtime.avviaSessioneFn,
    preparaEsecuzioneFn: () => ({ cartella: '/tmp/x', comandoProva: 'npm test', task: { id: 'task', consegna: 'delega un lavoro' } }),
    modello: 'm', chiave: 'k', cartellaEsisteFn: () => true })
  t.after(async () => {
    await registry.chiudi?.()
    try { await attendiScritture({ cartellaStore }) } catch { /* pulizia comunque */ }
    rimuoviCartellaDiProva(cartellaStore)
  })
  const { sessionId } = registry.avvia('task', { permessiScelto: permessi, modalitaOperativaScelta: 'normale' })
  const delega = await runtime.runs[0].input.onDelega('figlia: scrivi un file', '/tmp/x')
  const figliaId = delega?.childId ?? registry.elenca().find((s) => s.padreId === sessionId)?.sessionId
  assert.ok(figliaId, `premessa: la figlia esiste (${JSON.stringify(delega)})`)
  return { registry, runtime, sessionId, figliaId, inputFiglia: runtime.runs[1].input }
}
const DOMANDA = { tipo: 'giri-in-tondo', strumento: 'leggi', volte: 5, toolCallId: 'c5' }
/* La carta della figlia può stare sulla figlia o sul padre («carta della figlia nel padre»): basta che ce ne sia una. */
const cartaAperta = (registry, ...ids) => ids.map((id) => registry.domandaInAttesa(id)).find((c) => c?.azione?.tipo === 'giri-in-tondo') ?? null
async function chiedi(registry, input, ids) {
  let risolta = null
  const p = Promise.resolve(input.chiediApprovazioneFn({ ...DOMANDA })).then((r) => { risolta = r; return r })
  await new Promise((ok) => setTimeout(ok, 30))
  return { risolta, carta: cartaAperta(registry, ...ids), p }
}

test('RV-F1 padre e figlia in Accesso completo: la figlia NON chiede, no subito col motivo', async (t) => {
  const { registry, sessionId, figliaId, inputFiglia } = await scena(t, 'Full access')
  const { risolta, carta } = await chiedi(registry, inputFiglia, [figliaId, sessionId])
  assert.equal(carta, null, 'nessuna carta')
  assert.equal(risolta?.approvato, false)
  assert.match(String(risolta?.motivo), /^Full access never asks/u)
})

test('RV-F2 il padre SCENDE a «Workspace write» dopo aver delegato: la figlia (nata in Accesso completo) torna a CHIEDERE', async (t) => {
  const { registry, runtime, sessionId, figliaId, inputFiglia } = await scena(t, 'Full access')
  runtime.fine(0)
  await registry.attendiAssestamento?.(sessionId)
  const esito = await registry.aggiornaImpostazioni(sessionId, { permessi: 'Workspace write' })
  assert.notEqual(esito?.ok, false, `premessa: cambio accettato (${JSON.stringify(esito)})`)
  const { risolta, carta } = await chiedi(registry, inputFiglia, [figliaId, sessionId])
  assert.ok(carta, `deve esserci una carta: la catena non è più in Accesso completo (risposta: ${JSON.stringify(risolta)})`)
  if (carta) await registry.rispondiApprovazione(registry.domandaInAttesa(figliaId)?.requestId ? figliaId : sessionId, carta.requestId, false)
})

test('RV-F3 padre in «Workspace write», figlia portata a mano in Accesso completo: la figlia CHIEDE (mai sopra il padre)', async (t) => {
  const { registry, runtime, sessionId, figliaId, inputFiglia } = await scena(t, 'Workspace write')
  runtime.fine(1)
  await registry.attendiAssestamento?.(figliaId)
  await registry.aggiornaImpostazioni(figliaId, { permessi: 'Full access' }).catch(() => null)
  const { risolta, carta } = await chiedi(registry, inputFiglia, [figliaId, sessionId])
  assert.ok(carta, `deve esserci una carta (risposta: ${JSON.stringify(risolta)})`)
  if (carta) await registry.rispondiApprovazione(registry.domandaInAttesa(figliaId)?.requestId ? figliaId : sessionId, carta.requestId, false)
})

test('RV-F4 radice in Accesso completo che la persona abbassa a giro vivo: la carta torna (il livello di ADESSO)', async (t) => {
  const { registry, runtime, sessionId } = await scena(t, 'Full access')
  const esito = await registry.aggiornaImpostazioni(sessionId, { permessi: 'Workspace write' })
  const { risolta, carta } = await chiedi(registry, runtime.runs[0].input, [sessionId])
  assert.ok(carta, `deve esserci una carta (cambio: ${JSON.stringify(esito)}, risposta: ${JSON.stringify(risolta)})`)
  if (carta) await registry.rispondiApprovazione(sessionId, carta.requestId, false)
})
