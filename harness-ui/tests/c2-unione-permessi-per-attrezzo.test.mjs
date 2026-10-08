/*
 * ⛔⛔ C2 «Per questa sessione» SUL SERVER (owner 08/10/2026, AskUserQuestion: «Sì, anche sul server») — UN ATTREZZO SI UNISCE,
 *   NON SOSTITUISCE LA MAPPA.
 * - Prima: la carta della figlia mandava `permessiPerAttrezzo` INTERO, partendo da una copia letta alla nascita della carta, e
 *   `aggiornaImpostazioni` sostituiva la mappa: un «nega» messo altrove nel frattempo spariva (PERMESSI-SOSTITUITI, riprodotto
 *   dal vivo dal bugfixer). La cura del frontend (rilettura di `/pending`) riduce la finestra a un giro di rete; questa la chiude.
 * - Ora: `unisciPermessiPerAttrezzo: { <attrezzo>: <valore> }` si UNISCE alle scelte vere della sessione, e le chiamate di
 *   `aggiornaImpostazioni` passano in coda una per sessione, così due unioni insieme non si perdono a vicenda (fra il calcolo e
 *   l'assegnazione c'è la scrittura su disco).
 * - Concorrenti, nel codice: un «sempre» AGGIUNGE una chiave e non sostituisce l'insieme — OpenCode `approved.push(...)`
 *   (`packages/opencode/src/permission/index.ts:146`), Hermes `_session_approved…add(pattern_key)` sotto un lucchetto
 *   (`tools/approval.py:250-253`). RFC 7396 (JSON Merge Patch, IETF, ottobre 2014): un oggetto parziale si unisce al documento.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSessionRegistry } from '../src/session-registry.mjs'
import { attendiScritture, registraRiga } from '../src/session-store.mjs'
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
const nuovoRegistro = (cartellaStore, runtime, extra = {}) => createSessionRegistry({ cartellaStore, avviaSessioneFn: runtime.avviaSessioneFn,
  preparaEsecuzioneFn: () => ({ cartella: '/tmp/x', comandoProva: 'npm test', task: { id: 'task', consegna: 'delega' } }),
  modello: 'm', chiave: 'k', cartellaEsisteFn: () => true, ...extra })

/** La radice delega una figlia; poi la figlia riceve le SUE regole: `scrivi: chiedi`, `shell: nega`. */
async function scena(t, extra = {}) {
  const cartellaStore = mkdtempSync(join(tmpdir(), 'talos-unione-'))
  const runtime = runtimeControllabile()
  const registry = nuovoRegistro(cartellaStore, runtime, extra)
  t.after(async () => {
    await registry.chiudi?.()
    try { await attendiScritture({ cartellaStore }) } catch { /* pulizia comunque */ }
    rimuoviCartellaDiProva(cartellaStore)
  })
  const { sessionId } = registry.avvia('task', { permessiScelto: 'On request', modalitaOperativaScelta: 'normale' })
  await runtime.runs[0].input.onDelega('figlia: scrivi un file', '/tmp/x')
  const figliaId = registry.elenca().find((s) => s.padreId === sessionId)?.sessionId
  assert.ok(figliaId, 'premessa: la figlia esiste')
  assert.notEqual((await registry.aggiornaImpostazioni(figliaId, { permessiPerAttrezzo: { scrivi: 'chiedi', shell: 'nega' } }))?.ok, false)
  return { cartellaStore, registry, runtime, sessionId, figliaId, inputFiglia: runtime.runs[1].input }
}
/* Le regole PROPRIE della figlia: la mappa che il suo kernel tiene in mano (mutata in luogo, mai sostituita). ⛔ Non
   `permessiCorrentiFn()`: quella è l'INCONTRO con gli antenati (C2-a, mai sopra il padre), e un padre senza «sempre» lo toglie
   dalla vista — la prima stesura di queste prove lo leggeva lì, e UNIONE-03 era rossa per la ragione sbagliata. */
const regoleDellaFiglia = (input) => ({ ...input.permessiPerAttrezzo })

test('UNIONE-01 un attrezzo solo: «scrivi: sempre» si UNISCE, e il «nega» su shell resta', async (t) => {
  const { registry, figliaId, inputFiglia } = await scena(t)
  assert.deepEqual(await registry.aggiornaImpostazioni(figliaId, { unisciPermessiPerAttrezzo: { scrivi: 'sempre' } }), { ok: true })
  assert.deepEqual(regoleDellaFiglia(inputFiglia), { scrivi: 'sempre', shell: 'nega' })
})

test('UNIONE-02 DUE UNIONI INSIEME non si perdono a vicenda, né in memoria né sul disco', async (t) => {
  const { cartellaStore, registry, runtime, sessionId, figliaId, inputFiglia } = await scena(t)
  const esiti = await Promise.all([
    registry.aggiornaImpostazioni(figliaId, { unisciPermessiPerAttrezzo: { scrivi: 'sempre' } }),
    registry.aggiornaImpostazioni(figliaId, { unisciPermessiPerAttrezzo: { prova: 'sempre' } }),
  ])
  assert.deepEqual(esiti, [{ ok: true }, { ok: true }])
  assert.deepEqual(regoleDellaFiglia(inputFiglia), { scrivi: 'sempre', shell: 'nega', prova: 'sempre' })
  // e dopo un riavvio la figlia riparte con tutte e tre: l'ultima riga sul disco non ha perso la prima unione
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
  assert.ok(!ripresa?.erroreAvvio && runtime2.runs[0], `premessa: la figlia riparte (${JSON.stringify(ripresa)})`)
  assert.deepEqual(regoleDellaFiglia(runtime2.runs[0].input), { scrivi: 'sempre', shell: 'nega', prova: 'sempre' })
})

test('UNIONE-03 COME PRIMA: `permessiPerAttrezzo` intero continua a SOSTITUIRE (il contratto vecchio non cambia)', async (t) => {
  const { registry, figliaId, inputFiglia } = await scena(t)
  assert.deepEqual(await registry.aggiornaImpostazioni(figliaId, { permessiPerAttrezzo: { scrivi: 'sempre' } }), { ok: true })
  assert.deepEqual(regoleDellaFiglia(inputFiglia), { scrivi: 'sempre' })
})

test('UNIONE-04 il kernel vede l\'unione SUBITO: la mappa è la stessa che ha in mano (mutata in luogo, lezione del 06/9)', async (t) => {
  const { registry, figliaId, runtime } = await scena(t)
  const prima = runtime.runs[1].input.permessiPerAttrezzo
  await registry.aggiornaImpostazioni(figliaId, { unisciPermessiPerAttrezzo: { scrivi: 'sempre' } })
  if (prima && typeof prima === 'object') assert.equal(prima.scrivi, 'sempre', 'il giro in corso legge la stessa mappa, già aggiornata')
})

test('UNIONE-05 AL CONTRARIO: le due chiavi insieme, un valore sconosciuto, o un\'unione vuota si rifiutano', async (t) => {
  const { registry, figliaId, inputFiglia } = await scena(t)
  for (const patch of [
    { permessiPerAttrezzo: { scrivi: 'sempre' }, unisciPermessiPerAttrezzo: { shell: 'sempre' } },
    { unisciPermessiPerAttrezzo: { scrivi: 'forse' } },
    { unisciPermessiPerAttrezzo: {} },
    { unisciPermessiPerAttrezzo: null },
  ]) {
    const esito = await registry.aggiornaImpostazioni(figliaId, patch)
    assert.ok(esito?.erroreAvvio, `${JSON.stringify(patch)} doveva essere rifiutato: ${JSON.stringify(esito)}`)
  }
  assert.deepEqual(regoleDellaFiglia(inputFiglia), { scrivi: 'chiedi', shell: 'nega' }, 'niente è cambiato')
})

test('UNIONE-07 AL CONTRARIO: una delega in SOLA LETTURA non diventa scrivente passando dall\'unione (solo «nega»)', async (t) => {
  const { registry, runtime, sessionId } = await scena(t)
  const lettrice = await runtime.runs[0].input.onDelega('leggi senza modificare', '/tmp/x', { modalita: 'lettura' })
  const lettriceId = lettrice?.childId ?? registry.elenca().find((s) => s.padreId === sessionId && s.sessionId !== registry.elenca().find((x) => x.padreId === sessionId)?.sessionId)?.sessionId
  assert.ok(lettriceId, `premessa: la delega in lettura esiste (${JSON.stringify(lettrice)})`)
  assert.equal((await registry.aggiornaImpostazioni(lettriceId, { unisciPermessiPerAttrezzo: { scrivi: 'sempre' } }))?.code, 'DELEGATION_READ_ONLY')
  assert.deepEqual(await registry.aggiornaImpostazioni(lettriceId, { unisciPermessiPerAttrezzo: { shell: 'nega' } }), { ok: true }, 'un «nega» resta ammesso')
})

test('UNIONE-06 HTTP: la rotta accetta l\'unione e rifiuta le forme storte con 400', async (t) => {
  const { createServer } = await import('node:http')
  const { createHttpApp } = await import('../src/http-app.mjs')
  const { registry, figliaId, inputFiglia } = await scena(t)
  /* La rotta rifiuta PRIMA del registro: lo stesso 400 verrebbe anche dal registro (stesso codice PERMISSIONS_INVALID), quindi
     lo status da solo non dice chi ha rifiutato. Si contano le chiamate che arrivano al registro (mutante N7, 08/10). */
  const arrivateAlRegistro = []
  const registroSpiato = { ...registry, aggiornaImpostazioni: (...argomenti) => { arrivateAlRegistro.push(argomenti[1]); return registry.aggiornaImpostazioni(...argomenti) } }
  const server = createServer(createHttpApp({ staticHandler: async () => null, sessionRegistry: registroSpiato }))
  await new Promise((ok, ko) => { server.once('error', ko); server.listen(0, '127.0.0.1', ok) })
  t.after(() => new Promise((ok) => { server.closeAllConnections(); server.close(() => ok()) }))
  const url = `http://127.0.0.1:${server.address().port}/api/v1/sessions/${encodeURIComponent(figliaId)}/settings`
  const manda = async (corpo) => {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) })
    return { status: r.status, corpo: await r.json() }
  }
  for (const storto of [{ unisciPermessiPerAttrezzo: { scrivi: 'forse' } }, { unisciPermessiPerAttrezzo: {} },
    { unisciPermessiPerAttrezzo: { scrivi: 'sempre' }, permessiPerAttrezzo: { shell: 'nega' } }]) {
    assert.equal((await manda(storto)).status, 400, JSON.stringify(storto))
  }
  assert.deepEqual(arrivateAlRegistro, [], 'le forme storte si fermano alla rotta, non arrivano al registro')
  const giusta = await manda({ unisciPermessiPerAttrezzo: { scrivi: 'sempre' } })
  assert.equal(giusta.status, 200, JSON.stringify(giusta.corpo))
  assert.deepEqual(arrivateAlRegistro, [{ unisciPermessiPerAttrezzo: { scrivi: 'sempre' } }], 'premessa al contrario: la spia vede le chiamate vere')
  assert.deepEqual(regoleDellaFiglia(inputFiglia), { scrivi: 'sempre', shell: 'nega' })
})

/* Mutante N8 (08/10 sera): con la coda nuova, «la coda trattiene gli errori di chi precede» restava VIVO, perché nessuna prova
   faceva fallire la scrittura su disco di una modifica. Il disco viene PRIMA della memoria: chi fallisce non cambia niente, e
   chi lo segue in coda passa lo stesso. */
test('UNIONE-08 UNA SCRITTURA CHE FALLISCE NON FERMA LA CODA: la modifica dopo passa, quella fallita non tocca la mappa', async (t) => {
  let daFarFallire = 0
  const registraRigaFn = (argomenti, ...resto) => {
    if (argomenti?.record?.tipo === 'impostazioni-sessione' && daFarFallire > 0) { daFarFallire -= 1; return Promise.reject(new Error('Disco pieno')) }
    return registraRiga(argomenti, ...resto)
  }
  const { registry, figliaId, inputFiglia } = await scena(t, { registraRigaFn })
  daFarFallire = 1
  const prima = registry.aggiornaImpostazioni(figliaId, { unisciPermessiPerAttrezzo: { scrivi: 'sempre' } })
  const dopo = registry.aggiornaImpostazioni(figliaId, { unisciPermessiPerAttrezzo: { prova: 'sempre' } })
  await assert.rejects(prima, /Disco pieno/u, 'premessa: la prima scrittura fallisce davvero')
  assert.deepEqual(await dopo, { ok: true }, 'la modifica in coda dietro a una fallita deve passare')
  assert.deepEqual(regoleDellaFiglia(inputFiglia), { scrivi: 'chiedi', shell: 'nega', prova: 'sempre' }, 'la fallita non ha toccato la mappa, la seconda sì')
})

/* Nota del bugfixer sulla R2 (08/10 sera, misurata copiando la coda riga per riga): «a coda vuota parte nello stesso turno» valeva
   solo dopo che la voce della mappa delle code era stata tolta, cosa che succede qualche microtask DOPO la fine del lavoro. Quindi
   `await a; b` faceva partire b in ritardo. Nel prodotto una richiesta HTTP arriva in un macrotask dopo e non si vede; la CLI nello
   stesso processo può concatenare due chiamate così. Senza archivio il corpo non ha nessuna `await`: si vede SUBITO se è partito. */
test('UNIONE-09 IL BORDO DELLA CODA: finita la modifica di prima (`await`), la successiva parte nello stesso turno', async (t) => {
  const runtime = runtimeControllabile()
  const registry = createSessionRegistry({ avviaSessioneFn: runtime.avviaSessioneFn, modello: 'm', chiave: 'k', cartellaEsisteFn: () => true,
    preparaEsecuzioneFn: () => ({ cartella: '/tmp/x', comandoProva: 'npm test', task: { id: 'task', consegna: 'x' } }) })
  t.after(async () => { await registry.chiudi?.() })
  const { sessionId } = registry.avvia('task', { permessiPerAttrezzoScelto: { shell: 'chiedi' } })
  const mappaDelKernel = runtime.runs[0].input.permessiPerAttrezzo
  assert.deepEqual(await registry.aggiornaImpostazioni(sessionId, { unisciPermessiPerAttrezzo: { scrivi: 'sempre' } }), { ok: true })
  const seconda = registry.aggiornaImpostazioni(sessionId, { unisciPermessiPerAttrezzo: { prova: 'sempre' } })
  assert.deepEqual({ ...mappaDelKernel }, { shell: 'chiedi', scrivi: 'sempre', prova: 'sempre' }, 'la seconda modifica non è partita nello stesso turno')
  assert.deepEqual(await seconda, { ok: true })
  runtime.fine(0)
})
