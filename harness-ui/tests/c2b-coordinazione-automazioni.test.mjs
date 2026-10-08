/*
 * ⛔⛔ C2b «Coordinazione» nelle AUTOMAZIONI (owner 08/10/2026 notte, «Interruttore nella scheda, ora») — un'automazione non ha
 *   nessuno davanti: con Coordinazione spenta (di serie, anche per quelle di prima) la carta d'avvio di un agente si nega
 *   subito; accesa nella sua scheda, l'esecuzione nasce col «sempre» sulla chiave della delega e avvia agenti da sola, entro il
 *   tetto di 20. Fonte: Hermes dà a ogni lavoro pianificato i suoi attrezzi, scelti alla creazione (`cron/scheduler.py:489-505`).
 * Store VERO su una cartella di prova, rotte VERE, scheduler VERO e registro VERO: nessun doppio sul percorso che decide.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createAutomationStore, AutomationStoreError } from '../src/automation-store.mjs'
import { createAutomationScheduler } from '../src/automation-scheduler.mjs'
import { createHttpApp } from '../src/http-app.mjs'
import { createSessionRegistry } from '../src/session-registry.mjs'
import { attendiScritture } from '../src/session-store.mjs'
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs'

const CON_TEMPO = { timeout: 30_000 }
function cartella(t, prefisso) {
  const c = mkdtempSync(join(tmpdir(), prefisso))
  t.after(() => rimuoviCartellaDiProva(c))
  return c
}

test('C2B-A-01 — lo store: spenta di serie, accesa alla creazione, si cambia dopo; un valore storto si rifiuta', CON_TEMPO, async (t) => {
  const store = createAutomationStore({ cartella: cartella(t, 'talos-c2b-auto-') })
  const spenta = await store.crea({ taskId: 't1', intervalloMinuti: 5 })
  assert.equal(spenta.coordinazione, false, 'spenta di serie')
  const accesa = await store.crea({ taskId: 't2', intervalloMinuti: 5, coordinazione: true })
  assert.equal(accesa.coordinazione, true)
  assert.equal((await store.leggi(accesa.id)).coordinazione, true, 'scritta sul disco')
  assert.equal((await store.impostaCoordinazione(spenta.id, true)).coordinazione, true)
  assert.equal((await store.leggi(spenta.id)).coordinazione, true)
  assert.equal((await store.impostaCoordinazione(spenta.id, false)).coordinazione, false)
  assert.equal(await store.impostaCoordinazione('non-esiste', true), null)
  // AL CONTRARIO: niente valori «quasi booleani»
  await assert.rejects(store.crea({ taskId: 't3', intervalloMinuti: 5, coordinazione: 'si' }), (e) => e instanceof AutomationStoreError && /coordinazione must be true or false/u.test(e.message))
  await assert.rejects(store.impostaCoordinazione(spenta.id, 1), (e) => e instanceof AutomationStoreError && /coordinazione must be true or false/u.test(e.message))
})

test('C2B-A-02 — le rotte: la creazione porta Coordinazione, la scheda la cambia; forme storte 400, id sconosciuto 404', CON_TEMPO, async (t) => {
  const store = createAutomationStore({ cartella: cartella(t, 'talos-c2b-auto-http-') })
  const server = createServer(createHttpApp({ staticHandler: async () => null, automationStore: store }))
  await new Promise((ok, ko) => { server.once('error', ko); server.listen(0, '127.0.0.1', ok) })
  t.after(() => new Promise((ok) => { server.closeAllConnections(); server.close(() => ok()) }))
  const base = `http://127.0.0.1:${server.address().port}/api/v1/automations`
  const manda = async (percorso, corpo) => {
    // Y3 (08/10 sera): le scritture sulle automazioni vogliono la finestra di TALOS; la prova si presenta come lei
    const finestra = { Origin: `http://127.0.0.1:${server.address().port}`, 'Sec-Fetch-Site': 'same-origin' }
    const r = await fetch(`${base}${percorso}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...finestra }, body: JSON.stringify(corpo) })
    return { status: r.status, corpo: await r.json() }
  }
  const creata = await manda('', { taskId: 't1', intervalloMinuti: 5, coordinazione: true })
  assert.equal(creata.status, 200, JSON.stringify(creata.corpo))
  assert.equal(creata.corpo.data.coordinazione, true)
  const id = creata.corpo.data.id
  const spenta = await manda(`/${encodeURIComponent(id)}/coordinazione`, { coordinazione: false })
  assert.equal(spenta.status, 200)
  assert.equal((await store.leggi(id)).coordinazione, false)
  for (const storto of [{ coordinazione: 'no' }, {}, { coordinazione: true, attiva: true }]) {
    assert.equal((await manda(`/${encodeURIComponent(id)}/coordinazione`, storto)).status, 400, JSON.stringify(storto))
  }
  assert.equal((await manda('', { taskId: 't2', intervalloMinuti: 5, coordinazione: 'si' })).status, 400)
  assert.equal((await manda('/sconosciuta/coordinazione', { coordinazione: true })).status, 404)
  assert.equal((await store.leggi(id)).coordinazione, false, 'le forme storte non hanno cambiato niente')
})

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

test('C2B-A-03 — il percorso vero: lo scheduler fa partire l\'esecuzione accesa col «sempre», quella spenta senza; la carta nega subito', CON_TEMPO, async (t) => {
  const store = createAutomationStore({ cartella: cartella(t, 'talos-c2b-auto-sched-'), clock: () => new Date('2026-10-08T10:00:00.000Z') })
  const cartellaStore = cartella(t, 'talos-c2b-auto-reg-')
  const runtime = runtimeControllabile()
  const registry = createSessionRegistry({ cartellaStore, avviaSessioneFn: runtime.avviaSessioneFn, coordinazione: true,
    preparaEsecuzioneFn: (taskId) => ({ cartella: '/tmp/x', comandoProva: 'npm test', task: { id: taskId, consegna: 'lavoro pianificato ' + taskId } }),
    modello: 'm', chiave: 'k', cartellaEsisteFn: () => true })
  t.after(async () => { await registry.chiudi?.(); try { await attendiScritture({ cartellaStore }) } catch { /* pulizia comunque */ } })
  const accesa = await store.crea({ taskId: 'accesa', intervalloMinuti: 5, coordinazione: true })
  const spenta = await store.crea({ taskId: 'spenta', intervalloMinuti: 5 })
  await store.imposta(accesa.id, true)
  await store.imposta(spenta.id, true)
  const esiti = []
  const scheduler = createAutomationScheduler({ store, sessionRegistry: registry, clock: () => new Date('2026-10-08T10:06:00.000Z'), onEsecuzione: (e) => esiti.push(e) })
  await scheduler.unTick()
  assert.equal(runtime.runs.length, 2, 'le due esecuzioni sono partite')
  assert.equal(esiti.length, 2)
  /* le due esecuzioni hanno la stessa ora di creazione: l'ordine non è garantito, si riconoscono dal compito */
  const inputDi = (taskId) => { const r = runtime.runs.find((x) => x.input.task?.id === taskId); assert.ok(r, 'esecuzione di ' + taskId); return r.input }
  assert.deepEqual(await inputDi('accesa').coordinazioneFn(), { modo: 'sempre' }, 'accesa nella scheda: avvia agenti da sola')
  assert.deepEqual(await inputDi('spenta').coordinazioneFn(), { modo: 'chiedi', motivo: 'spenta' })
  // spenta: la carta si chiude SUBITO col motivo che dice di accenderla
  const no = await inputDi('spenta').chiediApprovazioneFn({ tipo: 'delega_sottotask', toolCallId: 'c1', compito: 'x', coordinazione: { motivo: 'spenta' } })
  assert.equal(no.approvato, false)
  assert.match(no.motivo, /Turn Coordination on for this automation/u)
  // accesa ma al tetto: lo stesso no immediato, e NON il consiglio di accenderla (lo è già)
  const tetto = await inputDi('accesa').chiediApprovazioneFn({ tipo: 'delega_sottotask', toolCallId: 'c2', compito: 'x', coordinazione: { motivo: 'tetto' } })
  assert.equal(tetto.approvato, false)
  assert.match(tetto.motivo, /already started the most agents allowed on its own/u)
  assert.doesNotMatch(tetto.motivo, /Turn Coordination on/u)
})
