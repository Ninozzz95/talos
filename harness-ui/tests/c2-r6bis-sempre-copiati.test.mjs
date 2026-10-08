/*
 * ⛔⛔ C2 R6-bis (owner 08/10/2026, AskUserQuestion: «Segnalo anche») — IL «SEMPRE» COPIATO ALLA NASCITA È EREDITATO.
 *   Un padre che ha già «Consenti sempre» su un attrezzo quando delega lo passa alla figlia per COPIA
 *   (`subagent-orchestrator.mjs`, `permessiPerAttrezzoRichiesti: { ...padre.permessiPerAttrezzo }`), e R6 lo trattava come suo:
 *   nel caso più comune la riga non diceva «Permesso ereditato». Trovato dal bugfixer dal vivo nella review di R6.
 * ⇒ Alla nascita si annota DA CHI arriva ogni «sempre» copiato (`origineSempre`): il padre, o chi l'aveva dato a lui (una copia
 *   di una copia risale all'origine). Vale finché quel «sempre» resta tale: se la figlia lo cambia, da lì in poi è una scelta
 *   sua. Sopravvive al riavvio (intestazione e righe delle impostazioni).
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSessionRegistry } from '../src/session-registry.mjs'
import { attendiScritture } from '../src/session-store.mjs'
import { talosLavora } from '../src/kernel/talosHarness.mjs'
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
    fine(index) {
      const run = runs[index]
      run.input.onEvento({ type: 'RunFinished', threadId: `t${index}`, runId: `r${index}` })
      run.resolve({ ok: true, esito: { detto: 'ok', comeFinita: 'concluso', messaggiFinali: [{ role: 'user', content: 'x' }, { role: 'assistant', content: 'ok' }] } })
    },
  }
}
const nuovoRegistro = (cartellaStore, runtime) => createSessionRegistry({ cartellaStore, avviaSessioneFn: runtime.avviaSessioneFn,
  preparaEsecuzioneFn: () => ({ cartella: '/tmp/x', comandoProva: 'npm test', task: { id: 'task', consegna: 'delega' } }),
  modello: 'm', chiave: 'k', cartellaEsisteFn: () => true })

/** La radice nasce «Chiede prima» con `scrivi: sempre`, e POI delega: il caso comune che R6 non attribuiva. */
async function scena(t, { perAttrezzo = { scrivi: 'sempre' } } = {}) {
  const cartellaStore = mkdtempSync(join(tmpdir(), 'talos-r6bis-'))
  const runtime = runtimeControllabile()
  const registry = nuovoRegistro(cartellaStore, runtime)
  t.after(async () => {
    await registry.chiudi?.()
    try { await attendiScritture({ cartellaStore }) } catch { /* pulizia comunque */ }
    rimuoviCartellaDiProva(cartellaStore)
  })
  const { sessionId } = registry.avvia('task', { permessiScelto: 'On request', permessiPerAttrezzoScelto: perAttrezzo, modalitaOperativaScelta: 'normale' })
  await runtime.runs[0].input.onDelega('figlia: scrivi un file', '/tmp/x')
  const figliaId = registry.elenca().find((s) => s.padreId === sessionId)?.sessionId
  assert.ok(figliaId, 'premessa: la figlia esiste')
  assert.deepEqual(runtime.runs[1].input.permessiCorrentiFn().permessiPerAttrezzo, perAttrezzo, 'premessa: la figlia nasce con la COPIA')
  return { cartellaStore, registry, runtime, sessionId, figliaId, inputFiglia: runtime.runs[1].input }
}

test('R6B-01 IL CASO COMUNE: il «sempre» che il padre aveva GIÀ quando ha delegato si attribuisce al padre', async (t) => {
  const { sessionId, inputFiglia } = await scena(t)
  assert.deepEqual(inputFiglia.permessiCorrentiFn(),
    { livelloAccesso: 'su-richiesta', permessiPerAttrezzo: { scrivi: 'sempre' }, origini: { scrivi: sessionId } })
})

test('R6B-02 UNA COPIA DI UNA COPIA risale all\'origine: la nipote attribuisce alla NONNA, non alla madre che l\'ha solo passato', async (t) => {
  const { registry, runtime, sessionId: nonnaId, figliaId: madreId } = await scena(t)
  await runtime.runs[1].input.onDelega('nipote: scrivi un file', '/tmp/x')
  assert.ok(registry.elenca().find((s) => s.padreId === madreId) && runtime.runs[2], 'premessa: la nipote esiste')
  assert.deepEqual(runtime.runs[2].input.permessiCorrentiFn().origini, { scrivi: nonnaId })
})

test('R6B-03 AL CONTRARIO: se la figlia CAMBIA il suo «sempre», da lì è una scelta sua e non si attribuisce più', async (t) => {
  const { registry, figliaId, inputFiglia } = await scena(t)
  assert.notEqual((await registry.aggiornaImpostazioni(figliaId, { permessiPerAttrezzo: { scrivi: 'chiedi' } }))?.ok, false)
  assert.notEqual((await registry.aggiornaImpostazioni(figliaId, { permessiPerAttrezzo: { scrivi: 'sempre' } }))?.ok, false)
  assert.deepEqual(inputFiglia.permessiCorrentiFn(), { livelloAccesso: 'su-richiesta', permessiPerAttrezzo: { scrivi: 'sempre' } },
    'il «sempre» rimesso dalla figlia è suo')
})

test('R6B-04 riscrivere la mappa con lo STESSO «sempre» (come «Per questa sessione» su un altro attrezzo) tiene l\'origine; il nuovo è della figlia', async (t) => {
  const { registry, sessionId, figliaId, inputFiglia } = await scena(t)
  assert.notEqual((await registry.aggiornaImpostazioni(figliaId, { permessiPerAttrezzo: { scrivi: 'sempre', shell: 'sempre' } }))?.ok, false)
  assert.deepEqual(inputFiglia.permessiCorrentiFn().origini, { scrivi: sessionId }, 'shell è un sì della figlia: non si attribuisce')
})

test('R6B-05 SOPRAVVIVE AL RIAVVIO: ripresa da disco, la figlia attribuisce ancora il «sempre» copiato alla madre', async (t) => {
  const { cartellaStore, registry, runtime, sessionId, figliaId } = await scena(t)
  runtime.fine(1)
  runtime.fine(0)
  await registry.attendiAssestamento?.(figliaId)
  await registry.attendiAssestamento?.(sessionId)
  await registry.chiudi?.()
  await attendiScritture({ cartellaStore })
  const runtime2 = runtimeControllabile()
  const registry2 = nuovoRegistro(cartellaStore, runtime2)
  t.after(async () => { await registry2.chiudi?.(); try { await attendiScritture({ cartellaStore }) } catch { /* pulizia comunque */ } })
  await registry2.ripristina()
  const ripresa = registry2.resume(figliaId, 'continua', [])
  assert.ok(!ripresa?.erroreAvvio, `premessa: la figlia riparte (${JSON.stringify(ripresa)})`)
  assert.ok(runtime2.runs[0], 'premessa: il giro della figlia è partito')
  assert.deepEqual(runtime2.runs[0].input.permessiCorrentiFn().origini, { scrivi: sessionId })
})

/* Review del bugfixer (08/10, RED; la sua REV-R6B-A): R6B-03 seguita dal riavvio di R6B-05. La riga che rimette «sempre» usciva
   SENZA la chiave, e al ripristino `{ ...intestazione, ...ultimaRiga }` faceva rivincere l'origine della nascita. */
test('R6B-07 RIAVVIO DOPO R6B-03: il «sempre» tolto e rimesso dalla figlia resta suo anche dopo il riavvio', async (t) => {
  const { cartellaStore, registry, runtime, sessionId, figliaId, inputFiglia } = await scena(t)
  assert.notEqual((await registry.aggiornaImpostazioni(figliaId, { permessiPerAttrezzo: { scrivi: 'chiedi' } }))?.ok, false)
  assert.notEqual((await registry.aggiornaImpostazioni(figliaId, { permessiPerAttrezzo: { scrivi: 'sempre' } }))?.ok, false)
  // e una riga ancora dopo, che non tocca i permessi (un cambio di modello): neanche lei deve far rivincere l'intestazione
  assert.notEqual((await registry.aggiornaImpostazioni(figliaId, { modello: 'altro/modello' }))?.ok, false)
  assert.equal(inputFiglia.permessiCorrentiFn().origini, undefined, 'premessa: prima del riavvio è suo')
  runtime.fine(1)
  runtime.fine(0)
  await registry.attendiAssestamento?.(figliaId)
  await registry.attendiAssestamento?.(sessionId)
  await registry.chiudi?.()
  await attendiScritture({ cartellaStore })
  const runtime2 = runtimeControllabile()
  const registry2 = nuovoRegistro(cartellaStore, runtime2)
  t.after(async () => { await registry2.chiudi?.(); try { await attendiScritture({ cartellaStore }) } catch { /* pulizia comunque */ } })
  await registry2.ripristina()
  const ripresa = registry2.resume(figliaId, 'continua', [])
  assert.ok(!ripresa?.erroreAvvio && runtime2.runs[0], JSON.stringify(ripresa))
  assert.equal(runtime2.runs[0].input.permessiCorrentiFn().origini, undefined, 'dopo il riavvio il «sempre» della figlia non torna alla madre')
})

/* Review del bugfixer (08/10, la sua REV-R6B-B): il verso contrario di R6B-07. La chiave scritta in OGNI riga della figlia non deve
   spegnere l'eredità vera: copia mai toccata, una riga che non tocca i permessi, poi il riavvio ⇒ il «sempre» resta della madre. */
test('R6B-08 AL CONTRARIO DI R6B-07: copia intatta, poi un cambio di modello, poi il riavvio ⇒ il «sempre» resta della madre', async (t) => {
  const { cartellaStore, registry, runtime, sessionId, figliaId } = await scena(t)
  assert.notEqual((await registry.aggiornaImpostazioni(figliaId, { modello: 'altro/modello' }))?.ok, false)
  runtime.fine(1)
  runtime.fine(0)
  await registry.attendiAssestamento?.(figliaId)
  await registry.attendiAssestamento?.(sessionId)
  await registry.chiudi?.()
  await attendiScritture({ cartellaStore })
  const runtime2 = runtimeControllabile()
  const registry2 = nuovoRegistro(cartellaStore, runtime2)
  t.after(async () => { await registry2.chiudi?.(); try { await attendiScritture({ cartellaStore }) } catch { /* pulizia comunque */ } })
  await registry2.ripristina()
  const ripresa = registry2.resume(figliaId, 'continua', [])
  assert.ok(!ripresa?.erroreAvvio && runtime2.runs[0], JSON.stringify(ripresa))
  assert.deepEqual(runtime2.runs[0].input.permessiCorrentiFn().origini, { scrivi: sessionId })
})

test('R6B-06 CAPO A CAPO: la ricevuta della scrittura della figlia dice «consentito da» la madre, tipo «attrezzo»', async (t) => {
  const progetto = realpathSync.native(mkdtempSync(join(tmpdir(), 'talos-r6bis-progetto-')))
  t.after(() => rimuoviCartellaDiProva(progetto))
  const { sessionId, inputFiglia } = await scena(t)
  const risposte = [
    { role: 'assistant', content: '', tool_calls: [{ id: 'call_w', type: 'function', function: { name: 'scrivi', arguments: JSON.stringify({ percorso: 'dentro.txt', contenuto: 'ciao' }) } }] },
    { role: 'assistant', content: 'fatto' },
  ]
  let chiamate = 0
  const ricevute = []
  await talosLavora({
    task: { consegna: 'prova' }, modello: 'x', chiave: 'y', _giriMassimiInterno: 3, cartella: progetto, livelloAccesso: 'su-richiesta',
    messaggiIniziali: [{ role: 'system', content: 'prova' }, { role: 'user', content: 'prova' }],
    consensiSessione: inputFiglia.consensiSessione, permessiCorrentiFn: inputFiglia.permessiCorrentiFn,
    fetchDiRete: async () => {
      const message = risposte[Math.min(chiamate++, risposte.length - 1)]
      return Response.json({ choices: [{ message, finish_reason: message.tool_calls ? 'tool_calls' : 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1 } })
    },
    onGiro: (e) => { if (e?.tipo === 'ricevuta') ricevute.push(e.ricevuta) },
  })
  const ricevuta = ricevute.find((r) => r.azione === 'scrivi')
  assert.equal(ricevuta?.via, 'permesso-per-attrezzo-sempre', `premessa: passata per il «sempre» (${ricevuta?.motivo})`)
  assert.deepEqual(ricevuta.consentitoDa, { sessionId, tipo: 'attrezzo' })
})
