/*
 * A13 (owner 10/10/2026, «Sì, come nella CLI»): la guardia dei GIRI IN TONDO anche sul desktop. Visto dal vivo: gpt-5-nano, 82 `leggi`
 *   identiche di fila. Il kernel ha la guardia da quando la CLI 0.5.x è entrata (opzione `guardiaGiriInTondo`, `giri-in-tondo.test.mjs`);
 *   qui si prova la parte del DESKTOP: chi la accende (agent-service) e la domanda che arriva alla persona (registro), compreso il
 *   caso in cui nessuno può rispondere (automazioni, passi dei Workflow): il giro si ferma col suo motivo.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync } from 'node:fs'
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
  }
}
async function scena(t, avvio = {}) {
  const cartellaStore = mkdtempSync(join(tmpdir(), 'talos-a13-'))
  const runtime = runtimeControllabile()
  const registry = createSessionRegistry({ cartellaStore, avviaSessioneFn: runtime.avviaSessioneFn,
    preparaEsecuzioneFn: () => ({ cartella: '/tmp/x', comandoProva: 'npm test', task: { id: 'task', consegna: 'leggi' } }),
    modello: 'm', chiave: 'k', cartellaEsisteFn: () => true })
  t.after(async () => {
    await registry.chiudi?.()
    try { await attendiScritture({ cartellaStore }) } catch { /* pulizia comunque */ }
    rimuoviCartellaDiProva(cartellaStore)
  })
  const { sessionId } = registry.avvia('task', { permessiScelto: 'Workspace write', modalitaOperativaScelta: 'normale', ...avvio })
  return { registry, sessionId, input: runtime.runs[0].input }
}
const CON_TEMPO = { timeout: 30_000 }
const DOMANDA = { tipo: 'giri-in-tondo', strumento: 'leggi', volte: 5, toolCallId: 'c5' }

test('A13-01 — il desktop ACCENDE la guardia: agent-service passa guardiaGiriInTondo al kernel', () => {
  const sorgente = readFileSync(new URL('../src/agent-service.mjs', import.meta.url), 'utf8')
  assert.match(sorgente, /\n\s+guardiaGiriInTondo: true,\n/u)
})

test('A13-02 — con qualcuno davanti la 5ª ripetizione è una carta che aspetta la persona, senza «Per questa sessione»; il sì passa', CON_TEMPO, async (t) => {
  const { registry, sessionId, input } = await scena(t)
  const risposta = input.chiediApprovazioneFn({ ...DOMANDA })
  await new Promise((ok) => setTimeout(ok, 10))
  const carta = registry.domandaInAttesa(sessionId)
  assert.equal(carta?.azione?.tipo, 'giri-in-tondo')
  assert.equal(carta.azione.strumento, 'leggi')
  assert.equal(carta.azione.sempreNonBasta, true, 'un «sempre» non avrebbe dove valere: la carta offre Consenti una volta e Nega')
  await registry.rispondiApprovazione(sessionId, carta.requestId, true)
  assert.equal(await risposta, true)
})

test('A13-03 — nessuno può rispondere (automazione): no SUBITO, col motivo per il modello, e nessuna carta appesa', CON_TEMPO, async (t) => {
  const { registry, sessionId, input } = await scena(t, { senzaInterfaccia: true })
  const t0 = Date.now()
  const risposta = await input.chiediApprovazioneFn({ ...DOMANDA })
  assert.ok(Date.now() - t0 < 1000)
  assert.equal(risposta?.approvato, false)
  assert.match(risposta.motivo, /no one can answer here .* "leggi" returned the same result 5 times in a row .* the run stops here/u)
  assert.equal(registry.domandaInAttesa(sessionId), null)
})

test('A13-04, al contrario — senza interfaccia le ALTRE domande restano come prima (qui: attendono)', CON_TEMPO, async (t) => {
  const { registry, sessionId, input } = await scena(t, { senzaInterfaccia: true })
  void input.chiediApprovazioneFn({ tipo: 'shell', comando: 'ls', toolCallId: 'c1' })
  await new Promise((ok) => setTimeout(ok, 10))
  assert.equal(registry.domandaInAttesa(sessionId)?.azione?.tipo, 'shell', 'la regola nuova vale solo per i giri in tondo')
  await registry.rispondiApprovazione(sessionId, registry.domandaInAttesa(sessionId).requestId, false)
})
