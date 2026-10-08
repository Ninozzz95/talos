/*
 * ⛔⛔ C2-R7 (owner 08/10/2026 sera, AskUserQuestion, tre opzioni consigliate) — contratto in
 *   `Downloads/handoff-talos-2026-09-27/C2R7-CONTRATTO-2026-10-08.md`.
 * - VINCE IL «NEGA»: con `rispettaNega: true` un'unione non scrive «sempre» (né altro) sopra un attrezzo che nella mappa PROPRIA
 *   della sessione vale `nega` nel momento dell'unione; la risposta lo dice (`nonUniti`). È il gesto della carta («Per questa
 *   sessione»): la scelta esplicita nelle Impostazioni resta libera. Claude Code, code.claude.com/docs/en/permissions (letta
 *   l'08/10/2026): «Rules are evaluated in order: deny, then ask, then allow … An allow rule can't carve an exception out of a
 *   deny rule».
 * - LA MADRE DICE «ASPETTA TE»: `inAttesaDiscendente` nella riga dell'elenco quando una discendente aspetta la persona (permesso o
 *   domanda). Codex, «Subagents» (letta l'08/10): le approvazioni delle figlie compaiono nel thread principale con l'etichetta
 *   della fonte; GitHub Copilot, «Dynamic workflows» (github/docs 1230337ad, 05/10/2026): «surfaces as a normal permission
 *   prompt in your interactive CLI session».
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
const nuovoRegistro = (cartellaStore, runtime, extra = {}) => createSessionRegistry({ cartellaStore, avviaSessioneFn: runtime.avviaSessioneFn,
  preparaEsecuzioneFn: () => ({ cartella: '/tmp/x', comandoProva: 'npm test', task: { id: 'task', consegna: 'delega' } }),
  modello: 'm', chiave: 'k', cartellaEsisteFn: () => true, domandeDeiFigli: true, ...extra })

/** Una radice «Chiede prima» delega una figlia; la figlia ha le SUE regole: `scrivi: chiedi`, `shell: nega`. */
async function scena(t) {
  const cartellaStore = mkdtempSync(join(tmpdir(), 'talos-c2r7-'))
  const runtime = runtimeControllabile()
  const registry = nuovoRegistro(cartellaStore, runtime)
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
const regoleDi = (input) => ({ ...input.permessiPerAttrezzo })
const righeImpostazioni = (cartellaStore, sessionId) => readFileSync(join(cartellaStore, `${sessionId}.jsonl`), 'utf8')
  .split('\n').filter(Boolean).map((r) => JSON.parse(r)).filter((r) => r.tipo === 'impostazioni-sessione').length

test('R7-01 VINCE IL «NEGA»: con rispettaNega un «sempre» non scavalca un «nega», e la risposta lo dice', async (t) => {
  const { registry, figliaId, inputFiglia } = await scena(t)
  const esito = await registry.aggiornaImpostazioni(figliaId, { unisciPermessiPerAttrezzo: { shell: 'sempre' }, rispettaNega: true })
  assert.deepEqual(esito, { ok: true, nonUniti: ['shell'] })
  assert.deepEqual(regoleDi(inputFiglia), { scrivi: 'chiedi', shell: 'nega' }, 'il «nega» resta')
})

test('R7-02 AL CONTRARIO, COME OGGI: senza rispettaNega la scelta esplicita mette «sempre» sopra il «nega»', async (t) => {
  const { registry, figliaId, inputFiglia } = await scena(t)
  assert.deepEqual(await registry.aggiornaImpostazioni(figliaId, { unisciPermessiPerAttrezzo: { shell: 'sempre' } }), { ok: true })
  assert.deepEqual(regoleDi(inputFiglia), { scrivi: 'chiedi', shell: 'sempre' })
})

test('R7-03 nella stessa richiesta un attrezzo NON negato si unisce, quello negato no', async (t) => {
  const { registry, figliaId, inputFiglia } = await scena(t)
  const esito = await registry.aggiornaImpostazioni(figliaId, { unisciPermessiPerAttrezzo: { shell: 'sempre', scrivi: 'sempre' }, rispettaNega: true })
  assert.deepEqual(esito, { ok: true, nonUniti: ['shell'] })
  assert.deepEqual(regoleDi(inputFiglia), { scrivi: 'sempre', shell: 'nega' })
  // e senza niente di negato la risposta è quella di sempre, senza `nonUniti`
  assert.deepEqual(await registry.aggiornaImpostazioni(figliaId, { unisciPermessiPerAttrezzo: { prova: 'sempre' }, rispettaNega: true }), { ok: true })
  // AL CONTRARIO: «nega» sopra «nega» non è un salto (non c'è un «sempre» perso da dire)
  assert.deepEqual(await registry.aggiornaImpostazioni(figliaId, { unisciPermessiPerAttrezzo: { shell: 'nega' }, rispettaNega: true }), { ok: true })
  assert.equal(regoleDi(inputFiglia).shell, 'nega')
})

test('R7-03b tutto saltato ma un\'altra impostazione nella stessa richiesta: quella si applica', async (t) => {
  const { registry, figliaId, inputFiglia } = await scena(t)
  assert.notEqual(registry.elenca().find((s) => s.sessionId === figliaId)?.reasoning, 'high', 'premessa')
  const esito = await registry.aggiornaImpostazioni(figliaId, { unisciPermessiPerAttrezzo: { shell: 'sempre' }, rispettaNega: true, reasoning: 'high' })
  assert.deepEqual(esito, { ok: true, nonUniti: ['shell'] })
  assert.equal(registry.elenca().find((s) => s.sessionId === figliaId)?.reasoning, 'high', 'il resto della richiesta non si perde')
  assert.deepEqual(regoleDi(inputFiglia), { scrivi: 'chiedi', shell: 'nega' })
})

test('R7-04 tutto saltato ⇒ nessuna riga nuova sul disco', async (t) => {
  const { cartellaStore, registry, figliaId } = await scena(t)
  await attendiScritture({ cartellaStore })
  const prima = righeImpostazioni(cartellaStore, figliaId)
  assert.deepEqual(await registry.aggiornaImpostazioni(figliaId, { unisciPermessiPerAttrezzo: { shell: 'sempre' }, rispettaNega: true }), { ok: true, nonUniti: ['shell'] })
  await attendiScritture({ cartellaStore })
  assert.equal(righeImpostazioni(cartellaStore, figliaId), prima, 'un\'unione che non cambia niente non scrive una riga')
})

test('R7-05 AL CONTRARIO: rispettaNega senza unione, non booleano, o con la mappa intera, si rifiuta', async (t) => {
  const { registry, figliaId, inputFiglia } = await scena(t)
  for (const storto of [{ rispettaNega: true }, { permessiPerAttrezzo: { shell: 'sempre' }, rispettaNega: true },
    { unisciPermessiPerAttrezzo: { shell: 'sempre' }, rispettaNega: 'si' }]) {
    const esito = await registry.aggiornaImpostazioni(figliaId, storto)
    assert.equal(esito?.code, 'PERMISSIONS_INVALID', JSON.stringify({ storto, esito }))
  }
  assert.deepEqual(regoleDi(inputFiglia), { scrivi: 'chiedi', shell: 'nega' }, 'nessun rifiuto ha toccato la mappa')
})

test('R7-06 HTTP: la rotta passa rispettaNega, restituisce nonUniti, e ferma le forme storte prima del registro', async (t) => {
  const { createServer } = await import('node:http')
  const { createHttpApp } = await import('../src/http-app.mjs')
  const { registry, figliaId, inputFiglia } = await scena(t)
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
  for (const storto of [{ rispettaNega: true }, { unisciPermessiPerAttrezzo: { shell: 'sempre' }, rispettaNega: 1 }]) {
    assert.equal((await manda(storto)).status, 400, JSON.stringify(storto))
  }
  assert.deepEqual(arrivateAlRegistro, [], 'le forme storte si fermano alla rotta')
  const saltato = await manda({ unisciPermessiPerAttrezzo: { shell: 'sempre' }, rispettaNega: true })
  assert.equal(saltato.status, 200, JSON.stringify(saltato.corpo))
  assert.deepEqual(saltato.corpo.data, { updated: true, nonUniti: ['shell'] })
  const unito = await manda({ unisciPermessiPerAttrezzo: { scrivi: 'sempre' }, rispettaNega: true })
  assert.deepEqual(unito.corpo.data, { updated: true }, 'senza salti la risposta è quella di sempre')
  assert.deepEqual(regoleDi(inputFiglia), { scrivi: 'sempre', shell: 'nega' })
})

test('R7-07 LA MADRE DICE «ASPETTA TE»: inAttesaDiscendente per una figlia e una nipote che aspettano, falso altrove', async (t) => {
  const { registry, runtime, sessionId: madreId, figliaId } = await scena(t)
  await runtime.runs[1].input.onDelega('nipote: controlla', '/tmp/x')
  const nipoteId = registry.elenca().find((s) => s.padreId === figliaId)?.sessionId
  assert.ok(nipoteId && runtime.runs[2], 'premessa: la nipote gira')
  const riga = (id) => registry.elenca().find((s) => s.sessionId === id)
  assert.equal(riga(madreId).inAttesaDiscendente, false, 'nessuno aspetta: il campo c\'è ed è falso')
  // la NIPOTE chiede un permesso: madre e figlia aspettano la persona per lei; la nipote stessa lo dice già col suo campo
  const risposta = runtime.runs[2].input.chiediApprovazioneFn({ tipo: 'shell', comando: 'npm install' })
  await new Promise((ok) => setTimeout(ok, 10))
  assert.equal(riga(nipoteId).inAttesaApprovazione, true, 'premessa: la nipote aspetta')
  assert.equal(riga(madreId).inAttesaDiscendente, true)
  assert.equal(riga(figliaId).inAttesaDiscendente, true)
  assert.equal(riga(nipoteId).inAttesaDiscendente, false, 'la sessione che chiede non è una sua discendente')
  // risolta: torna falso (`domandaInAttesa` rende anche il permesso in attesa, `tipo: 'approvazione'`, come `/pending`)
  const pendente = registry.domandaInAttesa(nipoteId)
  assert.equal(pendente?.tipo, 'approvazione', 'premessa: /pending della nipote è il suo permesso')
  assert.deepEqual(await registry.rispondiApprovazione(nipoteId, pendente.requestId, true), { ok: true })
  await risposta
  assert.equal(riga(madreId).inAttesaDiscendente, false)
  assert.equal(riga(figliaId).inAttesaDiscendente, false)
  // e una DOMANDA della figlia vale come un permesso
  const domanda = runtime.runs[1].input.chiediDomandaFn([{ id: 'q', question: 'Proseguo?', why: 'x', options: [{ label: 'Sì', description: 'a' }, { label: 'No', description: 'b' }] }], { toolCallId: 'c1', messaggi: [] })
  await new Promise((ok) => setTimeout(ok, 10))
  assert.equal(riga(madreId).inAttesaDiscendente, true)
  const { requestId: domandaId } = registry.domandaInAttesa(figliaId)
  await registry.rispondiDomanda(figliaId, domandaId, { requestId: domandaId, status: 'answered', answers: { q: 'Sì' } })
  await domanda
  assert.equal(riga(madreId).inAttesaDiscendente, false)
})
