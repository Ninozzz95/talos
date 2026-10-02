/*
 * ⛔ 02/10/2026 — la rotta desktop delle richieste dei server MCP (owner: «faccio subito scheda e rotta»). Il kernel della
 * CLI (`3b6c864af`) fa dichiarare alla sessione con una persona che sa rispondere a `elicitation/create`; senza una rotta il
 * server MCP resterebbe appeso fino allo Stop. Registro e HTTP VERI; la richiesta entra dalla stessa porta del kernel
 * (`onElicitazioneMcp`, quella che `mcp-session.mjs` chiama col server che chiede).
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:http'
import { createSessionRegistry } from '../src/session-registry.mjs'
import { createHttpApp } from '../src/http-app.mjs'
import { registraRiga } from '../src/session-store.mjs'
import { rimuoviCartellaDiProvaAttesa } from './aiuto/rimuovi-cartella-di-prova.mjs'

const MODULO = { mode: 'form', message: 'Dettagli della pull request', requestedSchema: { type: 'object', required: ['titolo'], properties: {
  titolo: { type: 'string', title: 'Titolo' }, bozza: { type: 'boolean' }, revisori: { type: 'array', items: { type: 'string', enum: ['ana', 'bo'] } } } } }

async function impianto(t) {
  const cartellaStore = mkdtempSync(join(tmpdir(), 'talos-richiesta-mcp-'))
  const runs = []
  const registro = createSessionRegistry({
    cartellaStore, guardaWorkspaceFn: () => () => {}, cartellaEsisteFn: () => true, modello: 'm', chiave: 'test', registraRigaFn: registraRiga,
    preparaEsecuzioneFn: () => ({ cartella: cartellaStore, task: { id: 'task', consegna: 'Apri la PR' } }),
    avviaSessioneFn(input) { return new Promise((resolve) => { runs.push({ input, resolve }); input.onEvento({ type: 'RunStarted' }) }) },
  })
  const server = createServer(createHttpApp({ staticHandler: async () => null, sessionRegistry: registro }))
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  t.after(async () => {
    for (const r of runs) { r.input.onEvento({ type: 'RunFinished' }); r.resolve({ ok: true, esito: { messaggiFinali: [], detto: 'Fine', comeFinita: 'concluso' } }) }
    await new Promise((r) => server.close(r))
    await new Promise((r) => setTimeout(r, 50))
    await rimuoviCartellaDiProvaAttesa(cartellaStore)
  })
  const { sessionId } = registro.avvia('task')
  const base = `http://127.0.0.1:${server.address().port}/api/v1/sessions`
  const rispondi = (corpo, id = sessionId) => fetch(`${base}/${id}/mcp-elicitation`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) })
  const inAttesa = async () => ((await (await fetch(base)).json()).data.items.find((s) => s.sessionId === sessionId)).inAttesaRichiestaMcp
  return { registro, runs, sessionId, base, rispondi, inAttesa }
}

test('RICHIESTA-MCP-HTTP-01: la persona risponde al modulo dalla rotta; il server MCP riceve il contenuto validato, la cronologia no', async (t) => {
  const { registro, runs, sessionId, rispondi, inAttesa } = await impianto(t)
  const attesa = runs[0].input.onElicitazioneMcp({ server: 'github', parametri: MODULO })
  const richiesta = registro.esporta(sessionId).eventi.find((e) => e.type === 'McpElicitationRequested')
  assert.equal(await inAttesa(), true, 'la sessione «aspetta te» mentre il server aspetta')
  // la forma del corpo: chiavi in più, requestId mancante
  for (const corpo of [{ requestId: richiesta.requestId, action: 'accept', content: {}, extra: 1 }, { action: 'decline' }]) {
    const r = await rispondi(corpo)
    assert.equal(r.status, 400, JSON.stringify(corpo))
    assert.equal((await r.json()).error.code, 'QUERY_INVALID')
  }
  // il contenuto lo valida il contratto, contro la richiesta
  const fuoriSchema = await rispondi({ requestId: richiesta.requestId, action: 'accept', content: { bozza: true } })
  assert.equal(fuoriSchema.status, 400)
  assert.equal((await fuoriSchema.json()).error.code, 'ELICITATION_ANSWER_INVALID')
  const giusta = await rispondi({ requestId: richiesta.requestId, action: 'accept', content: { titolo: 'Fix login', revisori: ['ana'] } })
  assert.equal(giusta.status, 200)
  const corpoGiusto = await giusta.json()
  assert.deepEqual(corpoGiusto.data, { ok: true })
  assert.equal(JSON.stringify(corpoGiusto).includes('Fix login'), false, 'la risposta HTTP non riporta il contenuto')
  assert.deepEqual(await attesa, { action: 'accept', content: { titolo: 'Fix login', revisori: ['ana'] } })
  assert.equal(await inAttesa(), false)
  const chiusa = registro.esporta(sessionId).eventi.find((e) => e.type === 'McpElicitationResolved')
  assert.deepEqual([chiusa.action, chiusa.da], ['accept', 'persona'])
  assert.equal(JSON.stringify(registro.esporta(sessionId).eventi).includes('Fix login'), false, 'il contenuto non entra nella cronologia')
  // due volte: il server non aspetta più
  const seconda = await rispondi({ requestId: richiesta.requestId, action: 'decline' })
  assert.equal(seconda.status, 409)
  assert.equal((await seconda.json()).error.code, 'ELICITATION_NOT_PENDING')
})

test('RICHIESTA-MCP-HTTP-02: pagina, rifiuto e annullamento arrivano al server; sessione assente 404; solo POST', async (t) => {
  const { registro, runs, sessionId, base, rispondi } = await impianto(t)
  for (const [action, parametri] of [
    ['accept', { mode: 'url', message: 'Accedi a Linear', url: 'https://linear.app/oauth', elicitationId: 'e-1' }],
    ['decline', MODULO],
    ['cancel', MODULO],
  ]) {
    const attesa = runs[0].input.onElicitazioneMcp({ server: 'linear', parametri })
    const richiesta = registro.esporta(sessionId).eventi.findLast((e) => e.type === 'McpElicitationRequested')
    const r = await rispondi({ requestId: richiesta.requestId, action })
    assert.equal(r.status, 200, action)
    assert.deepEqual(await attesa, { action })
  }
  assert.equal((await rispondi({ requestId: 'x', action: 'decline' }, 'nessuna')).status, 404)
  assert.equal((await fetch(`${base}/${sessionId}/mcp-elicitation`, { method: 'GET' })).status, 405, 'solo POST')
})
