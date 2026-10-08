/*
 * ⛔⛔ Automazioni a due porte (owner 08/10/2026 notte) nel REGISTRO — chi riceve la porta del modello (`onAutomazioneFn`):
 *   una chat normale sì, legata a sé (cartella, modello, sessione); senza `collegaAutomazioni` (la CLI) nessuno; il GIRO di
 *   un'automazione sì ma ristretto a sé stesso (D5), e parte senza interfaccia nella cartella scelta, coi permessi scelti.
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
    /* a fine prova ogni giro si chiude: un registro con giri appesi non si chiude mai, e la prova resterebbe ferma */
    fineTutti() {
      runs.forEach((run, i) => {
        run.input.onEvento({ type: 'RunFinished', threadId: `t${i}`, runId: `r${i}` })
        run.resolve({ ok: true, esito: { detto: 'ok', comeFinita: 'concluso', messaggiFinali: [{ role: 'user', content: 'x' }, { role: 'assistant', content: 'ok' }] } })
      })
    },
  }
}
/* un difetto che lascia appesa una promessa deve dare un rosso, non una corsa che non finisce */
const CON_TEMPO = { timeout: 30_000 }
async function scena(t, { collega = true } = {}) {
  const cartellaStore = mkdtempSync(join(tmpdir(), 'talos-auto-reg-'))
  const lavoro = mkdtempSync(join(tmpdir(), 'talos-auto-reg-lavoro-'))
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
  if (collega) {
    registry.collegaAutomazioni((contesto) => { contesti.push(contesto); return async (nome) => ({ ok: true, testo: `${nome} per ${contesto.sessionId}` }) })
  }
  return { registry, runtime, contesti, lavoro }
}

test('AUTO-REG-01 — una chat normale riceve la porta, legata a sé: sessione, cartella, modello; nessun giro', CON_TEMPO, async (t) => {
  const { registry, runtime, contesti } = await scena(t)
  const { sessionId } = registry.avvia('task', { permessiScelto: 'Workspace write' })
  const input = runtime.runs[0].input
  assert.equal(typeof input.onAutomazioneFn, 'function')
  assert.equal(await input.onAutomazioneFn('automation_list', {}, { fase: 'esegui' }).then((r) => r.testo), `automation_list per ${sessionId}`)
  assert.equal(contesti[0].sessionId, sessionId)
  assert.equal(contesti[0].modello, 'vendor/m')
  assert.equal(contesti[0].automazioneDelGiro, null)
  assert.equal(typeof contesti[0].verificaModelloFn, 'function')
})

// decisione 12 (08/10/2026 sera): la carta dice dove la bozza va oltre la chat; il contesto lo dà il registro, letto ADESSO
test('AUTO-REG-05 — il contesto della chat per la carta: i permessi della sessione, Coordinazione, le cartelle già aperte in TALOS', CON_TEMPO, async (t) => {
  const { registry, contesti, lavoro } = await scena(t)
  registry.avvia('task', { permessiScelto: 'Read only' })
  const chat = contesti[0].contestoChatFn()
  assert.equal(chat.permessi, 'Read only')
  assert.equal(chat.coordinazioneAccesa, false, 'Coordinazione spenta di serie')
  assert.equal(chat.cartellaNota(lavoro), true, 'la cartella di questa sessione è nota')
  assert.equal(chat.cartellaNota(join(lavoro, 'sotto')), true, 'e anche una sua sottocartella')
  assert.equal(chat.cartellaNota(join(tmpdir(), 'mai-vista-in-talos')), false)
})

test('AUTO-REG-02 — senza collegamento (la CLI) nessuna porta; una sessione senza interfaccia che non è un giro nemmeno', CON_TEMPO, async (t) => {
  const cli = await scena(t, { collega: false })
  cli.registry.avvia('task', {})
  assert.equal(cli.runtime.runs[0].input.onAutomazioneFn, undefined)
  const desktop = await scena(t)
  desktop.registry.avvia('task', { senzaInterfaccia: true }) // un'automazione v1: nessuno potrebbe rispondere a una carta
  assert.equal(desktop.runtime.runs[0].input.onAutomazioneFn, undefined)
})

test('AUTO-REG-04 — «Modifica» sulla carta: un no col perché scritto dal server; mai con un sì, mai su una carta che non è di automazione', CON_TEMPO, async (t) => {
  const { registry, runtime } = await scena(t)
  const { sessionId } = registry.avvia('task', {})
  const input = runtime.runs[0].input
  const ricevuti = []
  // ⛔ iscriversi accende il watcher della cartella della sessione: senza disiscriversi il processo dei test non esce
  t.after(registry.iscriviti(sessionId, (e) => ricevuti.push(e)))
  // un sì con «automazioneModificata» si rifiuta e la domanda resta in attesa
  const risposta = input.chiediApprovazioneFn({ tipo: 'automation_create', toolCallId: 'c1', bozza: { nome: 'Dipendenze' } })
  const { requestId } = registry.domandaInAttesa(sessionId)
  assert.equal(registry.rispondiApprovazione(sessionId, requestId, true, { automazioneModificata: 'auto-9' }).code, 'QUERY_INVALID')
  assert.equal(registry.domandaInAttesa(sessionId)?.requestId, requestId, 'ancora in attesa')
  assert.deepEqual(await registry.rispondiApprovazione(sessionId, requestId, false, { automazioneModificata: 'auto-9' }), { ok: true })
  const esito = await risposta
  assert.equal(esito.approvato, false)
  assert.match(esito.motivo, /^the person edited your draft and created the automation themselves \(id auto-9\): do not create it again/u)
  // la carta dice «modificata da te», non «negata»: l'evento lo porta come motivo (il perché per il modello resta al modello)
  const risolta = ricevuti.filter((e) => e.type === 'ApprovalResolved' && e.requestId === requestId)
  assert.equal(risolta.length, 1)
  assert.equal(risolta[0].motivo, 'modificata-dalla-persona')
  assert.doesNotMatch(JSON.stringify(risolta[0]), /edited your draft/u, 'il testo per il modello non va alla carta')
  // su una carta che non è di automazione: rifiutato
  const altra = input.chiediApprovazioneFn({ tipo: 'scrivi', toolCallId: 'c2', percorso: 'a.txt' })
  const seconda = registry.domandaInAttesa(sessionId).requestId
  assert.equal(registry.rispondiApprovazione(sessionId, seconda, false, { automazioneModificata: 'auto-9' }).code, 'QUERY_INVALID')
  await registry.rispondiApprovazione(sessionId, seconda, false)
  await altra
  assert.equal(ricevuti.find((e) => e.type === 'ApprovalResolved' && e.requestId === seconda)?.motivo, undefined, 'un no normale non dice «modificata»')
})

test('AUTO-REG-03 — il giro di un\'automazione: senza interfaccia, nella cartella scelta, coi permessi scelti, con la porta ristretta a sé', CON_TEMPO, async (t) => {
  const { registry, runtime, contesti, lavoro } = await scena(t)
  const avvio = registry.avviaGiroAutomazione({ automazioneId: 'auto-1', runId: 'g1', cartella: lavoro, consegna: '[IMPORTANT: …]\n\nfai', titolo: 'Dipendenze',
    permessi: 'Read only', permessiPerAttrezzo: { delega_sottotask: 'sempre' } })
  assert.equal(typeof avvio.sessionId, 'string', JSON.stringify(avvio))
  const input = runtime.runs[0].input
  // senza interfaccia: il registro non le dà le domande dei server MCP (nessuno risponderebbe)
  assert.equal(input.onElicitazioneMcp, undefined)
  assert.deepEqual(input.permessiPerAttrezzo, { delega_sottotask: 'sempre' })
  const riga = registry.elenca().find((s) => s.sessionId === avvio.sessionId)
  assert.equal(riga.taskId, 'automazione:auto-1')
  assert.equal(riga.permessi, 'Read only')
  // il nome della sessione è quello dell'automazione, mai l'id (dal vivo, 08/10: la barra diceva `automazione:072787c…`)
  // `rinomina` prima salva la riga `nome-sessione`, poi cambia il nome: si aspetta il salvataggio (al più 2 s)
  const nomeDopo = async () => registry.elenca().find((s) => s.sessionId === avvio.sessionId).nome
  for (let i = 0; i < 100 && (await nomeDopo()) !== 'Dipendenze'; i += 1) await new Promise((ok) => setTimeout(ok, 20))
  assert.equal(await nomeDopo(), 'Dipendenze')
  assert.equal(typeof input.onAutomazioneFn, 'function')
  await input.onAutomazioneFn('automation_list', {}, { fase: 'anteprima' })
  assert.equal(contesti[0].automazioneDelGiro, 'auto-1')
  assert.equal(registry.statoGiroAutomazione(avvio.sessionId), 'in-corso')
  const sbagliato = registry.avviaGiroAutomazione({ automazioneId: 'auto-1', runId: 'g2', cartella: join(lavoro, 'non-esiste'), consegna: 'x' })
  assert.equal(typeof sbagliato.erroreAvvio, 'string')
  assert.equal(sbagliato.code, 'PROJECT_NOT_ALLOWED')
})
