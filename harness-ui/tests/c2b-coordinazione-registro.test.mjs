/*
 * ⛔⛔ C2b «Coordinazione» nel REGISTRO (owner 08/10/2026 sera; contratto `C2B-CONTRATTO-2026-10-08.md`, §A, §B, §D) — chi crea il
 *   registro con `coordinazione: true` (il desktop) passa al kernel `coordinazioneFn`: spenta di serie (anche per le sessioni di
 *   prima), «Per questa sessione» la accende, la figlia eredita dalla radice e non le sta mai sopra, tetto di 20 avvii DA SOLI
 *   per albero (rigiocato dopo un riavvio), automazioni negate subito, modello chiesto solo fra i disponibili. Senza l'opzione
 *   (la CLI) nessun cambiamento.
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

async function scena(t, { extra = { coordinazione: true }, avvio = {} } = {}) {
  const cartellaStore = mkdtempSync(join(tmpdir(), 'talos-c2b-reg-'))
  const runtime = runtimeControllabile()
  const registry = nuovoRegistro(cartellaStore, runtime, extra)
  t.after(async () => {
    await registry.chiudi?.()
    try { await attendiScritture({ cartellaStore }) } catch { /* pulizia comunque */ }
    rimuoviCartellaDiProva(cartellaStore)
  })
  const { sessionId } = registry.avvia('task', { permessiScelto: 'Workspace write', modalitaOperativaScelta: 'normale', ...avvio })
  return { cartellaStore, registry, runtime, sessionId, input: runtime.runs[0].input }
}
const SPENTA = { modo: 'chiedi', motivo: 'spenta' }
/* un difetto che lascia appesa una promessa deve dare un rosso, non una corsa che non finisce */
const CON_TEMPO = { timeout: 30_000 }
const accendi = (registry, id) => registry.aggiornaImpostazioni(id, { unisciPermessiPerAttrezzo: { delega_sottotask: 'sempre' }, rispettaNega: true })

test('C2B-R-01 — senza l\'opzione (la CLI) il giro non riceve coordinazioneFn: la delega va come prima', CON_TEMPO, async (t) => {
  const { input } = await scena(t, { extra: {} })
  assert.equal(input.coordinazioneFn, undefined)
})

test('C2B-R-02 — spenta di serie; «Per questa sessione» la accende; spegnerla la rispegne (letta a ogni chiamata)', CON_TEMPO, async (t) => {
  const { registry, sessionId, input } = await scena(t)
  assert.equal(typeof input.coordinazioneFn, 'function')
  assert.deepEqual(await input.coordinazioneFn(), SPENTA)
  assert.deepEqual(await accendi(registry, sessionId), { ok: true })
  assert.deepEqual(await input.coordinazioneFn(), { modo: 'sempre' })
  await registry.aggiornaImpostazioni(sessionId, { unisciPermessiPerAttrezzo: { delega_sottotask: 'chiedi' } })
  assert.deepEqual(await input.coordinazioneFn(), SPENTA)
})

test('C2B-R-03 — la figlia eredita dalla radice, e spegnere la radice spegne anche lei (revoca)', CON_TEMPO, async (t) => {
  const { registry, runtime, sessionId, input } = await scena(t)
  await accendi(registry, sessionId)
  await input.onDelega('figlia: lavora', '/tmp/x', { avvio: 'da-solo' })
  const figlia = runtime.runs[1].input
  assert.deepEqual(await figlia.coordinazioneFn(), { modo: 'sempre' })
  await registry.aggiornaImpostazioni(sessionId, { unisciPermessiPerAttrezzo: { delega_sottotask: 'chiedi' } })
  assert.deepEqual(await figlia.coordinazioneFn(), SPENTA, 'la radice spenta spegne l\'albero')
})

test('C2B-R-04 — tetto di 20 avvii DA SOLI per albero: il ventunesimo chiede, e quelli consentiti non contano', CON_TEMPO, async (t) => {
  const { registry, runtime, sessionId, input } = await scena(t)
  await accendi(registry, sessionId)
  await input.onDelega('consentita', '/tmp/x', { avvio: 'consentito' })
  runtime.fine(runtime.runs.length - 1)
  for (let i = 0; i < 20; i += 1) {
    assert.deepEqual(await input.coordinazioneFn(), { modo: 'sempre' }, `avvio ${i + 1}`)
    const esito = await input.onDelega(`figlia ${i}`, '/tmp/x', { avvio: 'da-solo' })
    assert.equal(esito?.esito, 'avviato', JSON.stringify(esito))
    runtime.fine(runtime.runs.length - 1)
  }
  assert.deepEqual(await input.coordinazioneFn(), { modo: 'chiedi', motivo: 'tetto' })
  // una figlia dello stesso albero vede lo stesso conteggio
  const figlia = runtime.runs[runtime.runs.length - 1].input
  assert.deepEqual(await figlia.coordinazioneFn(), { modo: 'chiedi', motivo: 'tetto' })
  assert.equal(registry.elenca().filter((s) => s.avvioDelega === 'da-solo').length, 20, 'il segno è sulle righe dell\'elenco')
})

test('C2B-R-05 — il tetto sopravvive al riavvio: il segno sta nell\'intestazione della figlia', CON_TEMPO, async (t) => {
  const { cartellaStore, registry, runtime, sessionId, input } = await scena(t)
  await accendi(registry, sessionId)
  for (let i = 0; i < 20; i += 1) {
    await input.onDelega(`figlia ${i}`, '/tmp/x', { avvio: 'da-solo' })
    runtime.fine(runtime.runs.length - 1)
  }
  runtime.fine(0)
  for (const s of registry.elenca()) await registry.attendiAssestamento?.(s.sessionId)
  await registry.chiudi?.()
  await attendiScritture({ cartellaStore })
  const runtime2 = runtimeControllabile()
  const registry2 = nuovoRegistro(cartellaStore, runtime2, { coordinazione: true })
  t.after(async () => { await registry2.chiudi?.(); try { await attendiScritture({ cartellaStore }) } catch { /* pulizia comunque */ } })
  await registry2.ripristina()
  const ripresa = registry2.resume(sessionId, 'continua', [])
  assert.ok(!ripresa?.erroreAvvio, JSON.stringify(ripresa))
  assert.deepEqual(await runtime2.runs[0].input.coordinazioneFn(), { modo: 'chiedi', motivo: 'tetto' })
})

test('C2B-R-12 — R2, nota 1: il tetto è un TOTALE — eliminare figlie non ridà posti, nemmeno dopo un riavvio', CON_TEMPO, async (t) => {
  const { cartellaStore, registry, runtime, sessionId, input } = await scena(t)
  await accendi(registry, sessionId)
  for (let i = 0; i < 20; i += 1) {
    await input.onDelega(`figlia ${i}`, '/tmp/x', { avvio: 'da-solo' })
    runtime.fine(runtime.runs.length - 1)
  }
  const figlie = registry.elenca().filter((s) => s.avvioDelega === 'da-solo').map((s) => s.sessionId)
  assert.equal(figlie.length, 20)
  for (const id of figlie) await registry.attendiAssestamento?.(id)
  for (const id of figlie.slice(0, 5)) assert.equal((await registry.elimina(id))?.ok, true, `elimina ${id}`)
  assert.equal(registry.elenca().filter((s) => s.avvioDelega === 'da-solo').length, 15, 'cinque figlie eliminate')
  assert.deepEqual(await input.coordinazioneFn(), { modo: 'chiedi', motivo: 'tetto' }, 'le figlie eliminate contano ancora')
  // e dopo un riavvio: il totale sta sul diario della radice, non nelle figlie che restano
  runtime.fine(0)
  await registry.attendiAssestamento?.(sessionId)
  await registry.chiudi?.()
  await attendiScritture({ cartellaStore })
  const runtime2 = runtimeControllabile()
  const registry2 = nuovoRegistro(cartellaStore, runtime2, { coordinazione: true })
  t.after(async () => { await registry2.chiudi?.(); try { await attendiScritture({ cartellaStore }) } catch { /* pulizia comunque */ } })
  await registry2.ripristina()
  assert.equal(registry2.elenca().filter((s) => s.avvioDelega === 'da-solo').length, 15)
  const ripresa = registry2.resume(sessionId, 'continua', [])
  assert.ok(!ripresa?.erroreAvvio, JSON.stringify(ripresa))
  assert.deepEqual(await runtime2.runs[0].input.coordinazioneFn(), { modo: 'chiedi', motivo: 'tetto' })
})

test('C2B-R-13 — R2, nota 2: due deleghe in parallelo al diciannovesimo avvio — ne parte UNA; un avvio rifiutato rende il posto', CON_TEMPO, async (t) => {
  const { registry, runtime, sessionId, input } = await scena(t)
  await accendi(registry, sessionId)
  for (let i = 0; i < 19; i += 1) {
    await input.onDelega(`figlia ${i}`, '/tmp/x', { avvio: 'da-solo' })
    runtime.fine(runtime.runs.length - 1)
  }
  // un avvio che non parte (modello che questa app non sa scegliere) non consuma il posto
  const rifiutato = await input.onDelega('col modello', '/tmp/x', { avvio: 'da-solo', modello: 'nessuno' })
  assert.equal(rifiutato?.esito, 'rifiutato')
  assert.deepEqual(await input.coordinazioneFn(), { modo: 'sempre' }, 'il posto è stato reso')
  // il kernel ha letto «sempre» due volte (stesso giro, due chiamate) prima che una delle due figlie esistesse
  assert.deepEqual(await input.coordinazioneFn(), { modo: 'sempre' })
  const [a, b] = await Promise.all([
    input.onDelega('parallela A', '/tmp/x', { avvio: 'da-solo' }),
    input.onDelega('parallela B', '/tmp/x', { avvio: 'da-solo' }),
  ])
  const esiti = [a?.esito, b?.esito].sort()
  assert.deepEqual(esiti, ['avviato', 'rifiutato'], JSON.stringify([a, b]))
  const no = a?.esito === 'rifiutato' ? a : b
  assert.match(no.motivo, /already started the most agents allowed on its own \(20\)/u)
  assert.equal(registry.elenca().filter((s) => s.avvioDelega === 'da-solo').length, 20)
  assert.deepEqual(await input.coordinazioneFn(), { modo: 'chiedi', motivo: 'tetto' })
})

test('C2B-R-06 — automazione (nessuno può rispondere): la carta d\'avvio si chiude SUBITO con un no che dice perché', CON_TEMPO, async (t) => {
  const { registry, sessionId, input } = await scena(t, { avvio: { senzaInterfaccia: true } })
  const t0 = Date.now()
  const risposta = await input.chiediApprovazioneFn({ tipo: 'delega_sottotask', toolCallId: 'c1', compito: 't', coordinazione: { motivo: 'spenta' } })
  assert.ok(Date.now() - t0 < 1000)
  assert.equal(risposta?.approvato, false)
  assert.match(risposta.motivo, /no one can answer/u)
  assert.equal(registry.domandaInAttesa(sessionId), null, 'nessuna carta appesa')
})

test('C2B-R-07 — «Per questa sessione» sulla carta d\'avvio: solo se varrebbe (radice accesa) e mai per il tetto', CON_TEMPO, async (t) => {
  const { registry, runtime, sessionId, input } = await scena(t)
  // la radice spenta chiede per sé: il suo «sempre» varrebbe ⇒ il pulsante c'è
  void input.chiediApprovazioneFn({ tipo: 'delega_sottotask', toolCallId: 'c1', compito: 't', coordinazione: { motivo: 'spenta' } })
  await new Promise((ok) => setTimeout(ok, 10))
  assert.notEqual(registry.domandaInAttesa(sessionId)?.azione?.sempreNonBasta, true)
  await registry.rispondiApprovazione(sessionId, registry.domandaInAttesa(sessionId).requestId, true)
  // una figlia di una radice SPENTA: il suo «sempre» non varrebbe ⇒ niente pulsante
  await input.onDelega('figlia', '/tmp/x', { avvio: 'consentito' })
  const figliaId = registry.elenca().find((s) => s.padreId === sessionId).sessionId
  void runtime.runs[1].input.chiediApprovazioneFn({ tipo: 'delega_sottotask', toolCallId: 'c2', compito: 'n', coordinazione: { motivo: 'spenta' } })
  await new Promise((ok) => setTimeout(ok, 10))
  assert.equal(registry.domandaInAttesa(figliaId)?.azione?.sempreNonBasta, true)
  await registry.rispondiApprovazione(figliaId, registry.domandaInAttesa(figliaId).requestId, false)
  // il tetto: niente pulsante neanche sulla radice
  void input.chiediApprovazioneFn({ tipo: 'delega_sottotask', toolCallId: 'c3', compito: 't', coordinazione: { motivo: 'tetto' } })
  await new Promise((ok) => setTimeout(ok, 10))
  assert.equal(registry.domandaInAttesa(sessionId)?.azione?.sempreNonBasta, true)
})

test('C2B-R-08 — il modello chiesto: solo fra i disponibili; dal locale al cloud solo col consenso', CON_TEMPO, async (t) => {
  const disponibili = ['z-ai/glm-5.3-flash', 'local:qwen3-8b']
  const { registry, runtime, sessionId, input } = await scena(t, { extra: { coordinazione: true, modelliDisponibiliFn: async () => disponibili } })
  const ok = await input.onDelega('figlia', '/tmp/x', { modello: 'z-ai/glm-5.3-flash' })
  assert.equal(ok?.esito, 'avviato', JSON.stringify(ok))
  assert.equal(registry.elenca().find((s) => s.padreId === sessionId)?.modello, 'z-ai/glm-5.3-flash')
  const ignoto = await input.onDelega('figlia', '/tmp/x', { modello: 'vendor/inventato' })
  assert.equal(ignoto?.esito, 'rifiutato')
  assert.match(ignoto.motivo, /vendor\/inventato is not one of the models this app can use/u)
  assert.equal(runtime.runs.length, 2, 'un modello sconosciuto non fa nascere nessuna figlia')
  // senza l'elenco (la CLI), un modello chiesto si rifiuta con una frase: non si indovina
  const { input: inputCli } = await scena(t, { extra: {} })
  const cli = await inputCli.onDelega('figlia', '/tmp/x', { modello: 'z-ai/glm-5.3-flash' })
  assert.equal(cli?.esito, 'rifiutato')
  assert.match(cli.motivo, /cannot choose a model for a sub-task here/u)
})

test('C2B-R-10 — la ricevuta dice come è partito l\'agente e su quale modello chiesto; senza segno, la frase di sempre', CON_TEMPO, async (t) => {
  const { input } = await scena(t, { extra: { coordinazione: true, modelliDisponibiliFn: async () => ['z-ai/glm-5.3-flash'] } })
  const daSolo = await input.onDelega('figlia', '/tmp/x', { avvio: 'da-solo' })
  assert.match(daSolo.riassunto, /\. It started on its own \(Coordination is on in this conversation\)\. Keep working:/u)
  assert.doesNotMatch(daSolo.riassunto, /It runs on/u, 'nessun modello chiesto: nessuna frase sul modello')
  const consentito = await input.onDelega('figlia', '/tmp/x', { avvio: 'consentito', modello: 'z-ai/glm-5.3-flash' })
  assert.match(consentito.riassunto, /\. The person approved starting it\. It runs on z-ai\/glm-5\.3-flash, as the person asked\. Keep working:/u)
  // AL CONTRARIO: senza `avvio` (la CLI) la ricevuta è quella di prima, parola per parola
  const { input: inputCli } = await scena(t, { extra: {} })
  const cli = await inputCli.onDelega('figlia', '/tmp/x', {})
  assert.match(cli.riassunto, /^Sub-agent \S+ started in the background \(with the parent's permissions\)\. Keep working: the final result will be delivered separately when it is available\.$/u)
})

test('C2B-R-11 — HTTP: la rotta delle impostazioni accetta la chiave di Coordinazione (unione e mappa), e rifiuta un valore storto', CON_TEMPO, async (t) => {
  const { createServer } = await import('node:http')
  const { createHttpApp } = await import('../src/http-app.mjs')
  const { registry, sessionId, input } = await scena(t)
  const server = createServer(createHttpApp({ staticHandler: async () => null, sessionRegistry: registry }))
  await new Promise((ok, ko) => { server.once('error', ko); server.listen(0, '127.0.0.1', ok) })
  t.after(() => new Promise((ok) => { server.closeAllConnections(); server.close(() => ok()) }))
  const url = `http://127.0.0.1:${server.address().port}/api/v1/sessions/${encodeURIComponent(sessionId)}/settings`
  const manda = async (corpo) => (await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) })).status
  assert.equal(await manda({ unisciPermessiPerAttrezzo: { delega_sottotask: 'sempre' } }), 200, 'l\'interruttore della modale')
  assert.deepEqual(await input.coordinazioneFn(), { modo: 'sempre' })
  assert.equal(await manda({ unisciPermessiPerAttrezzo: { delega_sottotask: 'sempre' }, rispettaNega: true }), 200, '«Per questa sessione» della carta')
  assert.equal(await manda({ unisciPermessiPerAttrezzo: { delega_sottotask: 'chiedi' } }), 200)
  assert.deepEqual(await input.coordinazioneFn(), SPENTA)
  assert.equal(await manda({ permessiPerAttrezzo: { delega_sottotask: 'sempre', shell: 'chiedi' } }), 200, 'una mappa intera la porta come le altre scelte')
  assert.deepEqual(await input.coordinazioneFn(), { modo: 'sempre' })
  // AL CONTRARIO: un valore storto si ferma alla rotta, e lo stato resta quello di prima
  assert.equal(await manda({ unisciPermessiPerAttrezzo: { delega_sottotask: 'forse' } }), 400)
  assert.equal(await manda({ unisciPermessiPerAttrezzo: { delega_sottotaskk: 'sempre' } }), 400, 'una chiave che non esiste')
  assert.deepEqual(await input.coordinazioneFn(), { modo: 'sempre' })
})

test('C2B-R-09 — dal motore locale al cloud: senza consenso no, col consenso sì', CON_TEMPO, async (t) => {
  const disponibili = ['z-ai/glm-5.3-flash', 'local:qwen3-8b']
  /* il motore di casa finto, nella forma di `bc76-figlie-di-madre-locale` (una madre locale non parte senza) */
  const extra = { coordinazione: true, modelliDisponibiliFn: async () => disponibili, prontoFn: () => ({ pronto: true }),
    localRuntimes: { 'llama.cpp': { detect: async () => ({}), load: async () => {} } } }
  const locale = await scena(t, { extra, avvio: { provider: 'local', runtimeId: 'llama.cpp', modelId: 'qwen3-8b' } })
  const senza = await locale.input.onDelega('figlia', '/tmp/x', { modello: 'z-ai/glm-5.3-flash' })
  assert.equal(senza?.esito, 'rifiutato')
  assert.match(senza.motivo, /runs on the local engine/u)
  // AL CONTRARIO: un modello locale per la figlia di una madre locale non ha bisogno di nessun consenso
  const localeLocale = await locale.input.onDelega('figlia', '/tmp/x', { modello: 'local:qwen3-8b' })
  assert.equal(localeLocale?.esito, 'avviato', JSON.stringify(localeLocale))
  const conConsenso = await scena(t, { extra, avvio: { provider: 'local', runtimeId: 'llama.cpp', modelId: 'qwen3-8b', fallbackConsent: true } })
  const si = await conConsenso.input.onDelega('figlia', '/tmp/x', { modello: 'z-ai/glm-5.3-flash' })
  assert.equal(si?.esito, 'avviato', JSON.stringify(si))
})
