/*
 * C3b (owner 09/10/2026 sera, decisioni `decisioni-owner-c3b-avvio-automatico-09-10`) — con la Coordinazione ACCESA il Workflow
 * proposto dal modello è approvato e avviato DA SOLO: nessun clic, la stessa porta della persona (approva, poi avvia), e la
 * ricevuta della proposta lo dice al modello col runId. Ogni passo conta 1 nel tetto dei 20 avvii da soli (C2b). Spenta ⇒ resta
 * la carta (Approva, poi Avvia); in Piano ⇒ mai (F3 decisione 7). Come Hermes: un task creato da un agente nasce `ready` e parte
 * (`hermes_cli/kanban_db.py:1272`), la revisione umana c'è solo con `triage` (`tools/kanban_tools_schemas.py:431`).
 * Qui il registro col server FINTO (`workflowAvvioDaSoloFn`): il registro decide SE, il server FA (prova sua in
 * `c3b-avvio-da-solo-server.test.mjs`).
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSessionRegistry } from '../src/session-registry.mjs'
import { attendiScritture } from '../src/session-store.mjs'
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs'

const CON_TEMPO = { timeout: 30_000 }
const ricevuta = () => ({ schema: 'talos.workflow-proposal-receipt.v1', workflowId: randomUUID(), version: 1,
  definitionHash: `sha256:${'a'.repeat(64)}`, status: 'proposed', preflight: { errors: [], warnings: [] } })

async function scena(t, { passi = 3, modalita = 'normale', coordinazione = true, fallisceDopo = false, lanciaDopo = false, erroriPreflight = [] } = {}) {
  const cartellaStore = mkdtempSync(join(tmpdir(), 'talos-c3b-reg-'))
  const runs = []
  const avvii = []
  const registry = createSessionRegistry({ cartellaStore,
    avviaSessioneFn(input) {
      runs.push({ input })
      input.onEvento({ type: 'RunStarted', threadId: `t${runs.length}`, runId: `r${runs.length}` })
      return new Promise(() => {})
    },
    preparaEsecuzioneFn: () => ({ cartella: '/tmp/x', comandoProva: 'npm test', task: { id: 'task', consegna: 'proponi' } }),
    modello: 'm', chiave: 'k', cartellaEsisteFn: () => true, coordinazione,
    workflowPlanProposeFn: async () => ({ ...ricevuta(), preflight: { errors: erroriPreflight, warnings: [] } }),
    workflowAvvioDaSoloFn: async ({ sessionId, workflowId, version, definitionHash, prenota }) => {
      avvii.push({ sessionId, workflowId, version, definitionHash })
      if (!prenota(passi)) return { avviato: false, motivo: 'tetto', passi }
      if (fallisceDopo) return { avviato: false, motivo: 'runtime' } // il server non riesce DOPO la prenotazione
      if (lanciaDopo) throw Object.assign(new Error('store write failed'), { code: 'WORKFLOW_STORE_WRITE_FAILED' }) // e qui LANCIA (review Y1)
      return { avviato: true, runId: randomUUID(), passi }
    },
  })
  t.after(async () => {
    await registry.chiudi?.()
    try { await attendiScritture({ cartellaStore }) } catch { /* pulizia comunque */ }
    rimuoviCartellaDiProva(cartellaStore)
  })
  const { sessionId } = registry.avvia('task', { permessiScelto: 'Workspace write', modalitaOperativaScelta: modalita })
  const input = runs[0].input
  const proponi = () => input.onWorkflowPlanPropose({ draft: { title: 'x' }, toolCallId: `call_${randomUUID()}` })
  const accendi = () => registry.aggiornaImpostazioni(sessionId, { unisciPermessiPerAttrezzo: { delega_sottotask: 'sempre' }, rispettaNega: true })
  return { registry, sessionId, input, avvii, proponi, accendi }
}

test('C3B-R-01 — Coordinazione spenta (di serie): la proposta resta una proposta, nessun avvio da solo', CON_TEMPO, async (t) => {
  const s = await scena(t)
  const esito = await s.proponi()
  assert.equal(esito.status, 'proposed')
  assert.equal(esito.startedOnItsOwn, undefined)
  assert.deepEqual(s.avvii, [])
})

test('C3B-R-02 — Coordinazione accesa: approvato e avviato da solo, e la ricevuta lo dice al modello col runId', CON_TEMPO, async (t) => {
  const s = await scena(t)
  await s.accendi()
  const esito = await s.proponi()
  assert.equal(s.avvii.length, 1)
  assert.equal(s.avvii[0].sessionId, s.sessionId)
  assert.equal(esito.workflowId, s.avvii[0].workflowId, 'the same proposal')
  assert.match(esito.startedOnItsOwn?.runId ?? '', /^[0-9a-f-]{36}$/u)
  assert.equal(esito.startedOnItsOwn.steps, 3)
  assert.match(esito.note, /Coordination is on/u)
  // C3b punto 4 (owner 09/10 sera): niente attesa a vuoto — il turno si chiude e l'esito arriva come messaggio nuovo (Hermes, «END YOUR TURN»)
  assert.match(esito.note, /END YOUR TURN/u)
  assert.match(esito.note, /reaches you as a new message when the run ends or needs attention/u)
  assert.match(esito.note, /Do not poll/u)
})

test('C3B-R-03 — in Piano mai, anche con la Coordinazione accesa (F3 decisione 7)', CON_TEMPO, async (t) => {
  const s = await scena(t, { modalita: 'piano' })
  await s.accendi()
  const esito = await s.proponi()
  assert.deepEqual(s.avvii, [])
  assert.equal(esito.startedOnItsOwn, undefined)
})

test('C3B-R-04 — il tetto: ogni passo conta 1; quando i passi non ci stanno resta la carta, e la delega dopo lo sente', CON_TEMPO, async (t) => {
  const s = await scena(t, { passi: 6 })
  await s.accendi()
  for (let i = 0; i < 3; i += 1) assert.ok((await s.proponi()).startedOnItsOwn, `workflow ${i + 1}: 6 steps fit (${(i + 1) * 6} of 20)`)
  const quarto = await s.proponi()
  assert.equal(quarto.startedOnItsOwn, undefined, '18 + 6 > 20: the card stays')
  assert.equal(quarto.status, 'proposed')
  assert.deepEqual(await s.input.coordinazioneFn(), { modo: 'sempre' }, '18 of 20 used: a single delegation still fits')
  const s2 = await scena(t, { passi: 20 })
  await s2.accendi()
  assert.ok((await s2.proponi()).startedOnItsOwn)
  assert.deepEqual(await s2.input.coordinazioneFn(), { modo: 'chiedi', motivo: 'tetto' }, 'the steps filled the cap: the next delegation asks')
})

test('C3B-R-05 — senza l\'opzione `coordinazione` (CLI, mobile) niente avvio da solo, anche se il server lo saprebbe fare', CON_TEMPO, async (t) => {
  const s = await scena(t, { coordinazione: false })
  const esito = await s.proponi()
  assert.deepEqual(s.avvii, [])
  assert.equal(esito.startedOnItsOwn, undefined)
})

test('C3B-R-06 — un avvio che non riesce DOPO la prenotazione restituisce i passi: il tetto conta gli agenti partiti davvero', CON_TEMPO, async (t) => {
  const s = await scena(t, { passi: 20, fallisceDopo: true })
  await s.accendi()
  const esito = await s.proponi()
  assert.equal(esito.startedOnItsOwn, undefined, 'not started: the card stays')
  assert.deepEqual(await s.input.coordinazioneFn(), { modo: 'sempre' }, 'the 20 steps reserved were given back')
})

/* Review Y1 del bugfixer (09/10 sera): un avvio che LANCIA dopo la prenotazione (approva o avvia che falliscono nello store) teneva i
   passi prenotati per sempre, e l'eccezione arrivava a `workflow_plan_propose` con la proposta già creata (il modello l'avrebbe
   rifatta: un doppione). Ora è il ramo «non avviato», come R-06: passi restituiti, la ricevuta normale al modello. */
test('C3B-R-08 — un avvio che LANCIA dopo la prenotazione: passi restituiti, la ricevuta della proposta arriva lo stesso', CON_TEMPO, async (t) => {
  const s = await scena(t, { passi: 20, lanciaDopo: true }) // tutto il tetto: un posto non restituito lo spegne
  await s.accendi()
  const esito = await s.proponi()
  assert.equal(esito.schema, 'talos.workflow-proposal-receipt.v1', 'the proposal receipt, not an error')
  assert.equal(esito.startedOnItsOwn, undefined, 'not started: the card stays')
  assert.deepEqual(await s.input.coordinazioneFn(), { modo: 'sempre' }, 'the 20 steps reserved were given back')
})

test('C3B-R-07 — una proposta che il controllo preliminare boccia non parte da sola: resta da correggere (Approva è spento)', CON_TEMPO, async (t) => {
  const s = await scena(t, { erroriPreflight: [{ code: 'PREFLIGHT_CYCLE', message: 'cycle', subjects: ['uno'] }] })
  await s.accendi()
  const esito = await s.proponi()
  assert.deepEqual(s.avvii, [])
  assert.equal(esito.startedOnItsOwn, undefined)
})
