/*
 * ⛔⛔ C2-Q (08/10/2026, owner 07/10 sera, contratto C2 §5: «`domandeDeiFigli` acceso sul desktop subito dopo C2, stesso canale
 *   della carta») — LA DOMANDA DI UNA FIGLIA ALLA PERSONA SI RISPONDE DAL PADRE, come il suo permesso (C2 R4).
 * - Il padre sa che la figlia aspetta dallo snapshot `talos.agenti` (operazione `question`, col `requestId`), legge la domanda
 *   con `GET /sessions/<figlia>/pending` (`tipo:'domanda'`) e risponde con `POST /sessions/<figlia>/question` dichiarando
 *   `rispostoDa: <padre>`. Il campo è controllato per COERENZA sulla catena, come per i permessi: solo la sessione stessa o un
 *   suo antenato, mai una figlia, una sorella o un estraneo (403 `QUESTION_ANSWER_FORBIDDEN`), e la domanda resta aperta.
 * - Senza `rispostoDa` (la figlia aperta da sola, CLI, mobile) tutto è come prima.
 * - Concorrenti, nel codice: OpenCode permette, con una coda unica nel padre (`cli/cmd/run/stream.transport.ts:304-308`);
 *   Hermes (`tools/delegate_tool_toolsets.py:17`) e Codex (`core/src/tools/handlers/request_user_input.rs:69`) rifiutano.
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
      const index = runs.length
      runs.push({ input, resolve })
      input.onEvento({ type: 'RunStarted', threadId: `t${index}`, runId: `r${index}` })
      return promise
    },
  }
}

const nuovoRegistro = (cartellaStore, runtime, opzioniRegistro = {}) => createSessionRegistry({ cartellaStore, avviaSessioneFn: runtime.avviaSessioneFn,
  preparaEsecuzioneFn: () => ({ cartella: '/tmp/x', comandoProva: 'npm test', task: { id: 'task', consegna: 'delega un lavoro' } }),
  modello: 'm', chiave: 'k', cartellaEsisteFn: () => true, domandeDeiFigli: true, ...opzioniRegistro })

async function scena(t, { opzioniRegistro = {}, senzaInterfaccia = false } = {}) {
  const cartellaStore = mkdtempSync(join(tmpdir(), 'talos-c2q-'))
  const runtime = runtimeControllabile()
  const registry = nuovoRegistro(cartellaStore, runtime, opzioniRegistro)
  t.after(async () => {
    await registry.chiudi?.()
    try { await attendiScritture({ cartellaStore }) } catch { /* pulizia comunque */ }
    rimuoviCartellaDiProva(cartellaStore)
  })
  const { sessionId } = registry.avvia('task', { permessiScelto: 'Workspace write', modalitaOperativaScelta: 'normale', ...(senzaInterfaccia ? { senzaInterfaccia: true } : {}) })
  const delega = await runtime.runs[0].input.onDelega('figlia: scegli il fornitore', '/tmp/x')
  const figliaId = delega?.childId ?? registry.elenca().find((s) => s.padreId === sessionId)?.sessionId
  assert.ok(figliaId, 'premessa: la figlia esiste')
  return { cartellaStore, registry, runtime, sessionId, figliaId, inputFiglia: runtime.runs[1].input }
}
/** Una promessa che non si risolve in `ms` è «appesa»: chi aspetta una persona che non c'è non torna mai. */
const entro = (promessa, ms = 800) => Promise.race([
  promessa.then((r) => ({ r }), (e) => ({ errore: e?.code ?? String(e) })),
  new Promise((ok) => setTimeout(() => ok({ appesa: true }), ms)),
])

const DOMANDE = [{
  id: 'fornitore', question: 'Sandbox o finto?', why: 'Decide se il test va in rete.',
  options: [{ label: 'Finto', description: 'Veloce', recommended: true }, { label: 'Sandbox', description: 'Reale' }],
}]
const RISPOSTA = (requestId) => ({ requestId, status: 'answered', answers: { fornitore: 'Finto' } })
const agentiPer = (visti, figliaId) => visti.filter((e) => e.type === 'CUSTOM' && e.name === 'talos.agenti' && e.value?.childId === figliaId)
const pausa = () => new Promise((r) => setTimeout(r, 10))

test('C2Q-01 ANNUNCIO: il padre sa QUALE domanda aspetta (requestId), con etichette in inglese, e la chiude con l\'esito', async (t) => {
  const { registry, sessionId: padreId, figliaId, inputFiglia } = await scena(t)
  const dalPadre = []
  const disiscrivi = registry.iscriviti(padreId, (e) => dalPadre.push(e))
  t.after(() => disiscrivi?.())
  const risposta = inputFiglia.chiediDomandaFn(DOMANDE, { toolCallId: 'c1', messaggi: [] })
  await pausa()
  const requestId = registry.domandaInAttesa(figliaId)?.requestId
  assert.equal(typeof requestId, 'string', 'premessa: la domanda è in attesa e /pending la rende')
  const attesa = agentiPer(dalPadre, figliaId).map((e) => e.value.operation).find((o) => o?.kind === 'question' && o.status === 'waiting')
  assert.deepEqual(attesa, { kind: 'question', status: 'waiting', label: 'Waiting for your answer', toolName: null, requestId })
  assert.deepEqual(await registry.rispondiDomanda(figliaId, requestId, RISPOSTA(requestId)), { ok: true })
  await risposta
  const chiusa = agentiPer(dalPadre, figliaId).map((e) => e.value.operation).filter((o) => o?.kind === 'question').at(-1)
  assert.deepEqual(chiusa, { kind: 'question', status: 'resolved', label: 'Question resolved', toolName: null, requestId, esito: 'answered' })
  assert.equal(JSON.stringify(chiusa).includes('Finto'), false, 'le risposte non viaggiano verso gli antenati')
})

test('C2Q-02 DAL PADRE: la risposta con `rispostoDa: <padre>` passa, torna al modello della figlia, e la traccia lo dice', async (t) => {
  const { registry, sessionId: padreId, figliaId, inputFiglia } = await scena(t)
  const visti = []
  const disiscrivi = registry.iscriviti(figliaId, (e) => visti.push(e))
  t.after(() => disiscrivi?.())
  const risposta = inputFiglia.chiediDomandaFn(DOMANDE, { toolCallId: 'c1', messaggi: [] })
  await pausa()
  const { requestId } = registry.domandaInAttesa(figliaId)
  assert.deepEqual(await registry.rispondiDomanda(figliaId, requestId, RISPOSTA(requestId), { rispostoDa: padreId }), { ok: true })
  assert.deepEqual(await risposta, { status: 'answered', answers: { fornitore: 'Finto' } })
  const risolta = visti.find((e) => e.type === 'UserQuestionResolved' && e.requestId === requestId)
  assert.equal(risolta?.rispostoDa, padreId, 'la traccia dice da dove si è risposto')
  assert.equal(registry.domandaInAttesa(figliaId), null, 'nessuna carta orfana')
})

test('C2Q-03 AL CONTRARIO: una sorella o un estraneo prendono QUESTION_ANSWER_FORBIDDEN, e la domanda resta aperta', async (t) => {
  const { registry, runtime, figliaId, inputFiglia } = await scena(t)
  const sorella = await runtime.runs[0].input.onDelega('sorella: un altro lavoro', '/tmp/x')
  const sorellaId = sorella?.childId ?? registry.elenca().find((s) => s.padreId && s.sessionId !== figliaId)?.sessionId
  assert.ok(sorellaId && sorellaId !== figliaId, 'premessa: c\'è una sorella')
  const risposta = inputFiglia.chiediDomandaFn(DOMANDE, { toolCallId: 'c1', messaggi: [] })
  await pausa()
  const { requestId } = registry.domandaInAttesa(figliaId)
  for (const rispostoDa of [sorellaId, 'sessione-estranea']) {
    const esito = await registry.rispondiDomanda(figliaId, requestId, RISPOSTA(requestId), { rispostoDa })
    assert.equal(esito?.code, 'QUESTION_ANSWER_FORBIDDEN', `da ${rispostoDa}: ${JSON.stringify(esito)}`)
    assert.equal(registry.domandaInAttesa(figliaId)?.requestId, requestId, 'la domanda resta aperta')
  }
  // e chi sta nella catena può ancora rispondere
  assert.deepEqual(await registry.rispondiDomanda(figliaId, requestId, RISPOSTA(requestId)), { ok: true })
  await risposta
})

test('C2Q-04 COME PRIMA: senza `rispostoDa`, o con la figlia stessa, la risoluzione non porta il campo', async (t) => {
  const { registry, figliaId, inputFiglia } = await scena(t)
  const visti = []
  const disiscrivi = registry.iscriviti(figliaId, (e) => visti.push(e))
  t.after(() => disiscrivi?.())
  for (const opzioni of [undefined, { rispostoDa: figliaId }]) {
    const risposta = inputFiglia.chiediDomandaFn(DOMANDE, { toolCallId: 'c1', messaggi: [] })
    await pausa()
    const { requestId } = registry.domandaInAttesa(figliaId)
    assert.deepEqual(await registry.rispondiDomanda(figliaId, requestId, RISPOSTA(requestId), opzioni), { ok: true })
    await risposta
    const risolta = visti.find((e) => e.type === 'UserQuestionResolved' && e.requestId === requestId)
    assert.equal('rispostoDa' in (risolta ?? {}), false, JSON.stringify(opzioni))
  }
})

test('C2Q-05 HTTP: pending rende la domanda, il padre risponde con rispostoDa, un estraneo prende 403 e un rispostoDa rotto 400', async (t) => {
  const { createServer } = await import('node:http')
  const { createHttpApp } = await import('../src/http-app.mjs')
  const { registry, sessionId: padreId, figliaId, inputFiglia } = await scena(t)
  const server = createServer(createHttpApp({ staticHandler: async () => null, sessionRegistry: registry }))
  await new Promise((ok, ko) => { server.once('error', ko); server.listen(0, '127.0.0.1', ok) })
  /* Il server si chiude nella prova stessa, connessioni comprese. ⛔ Misurato l'08/10: con `--test-force-exit` (che il progetto
     NON usa) questo file cade all'uscita su Windows con `!(handle->flags & UV_HANDLE_CLOSING)` (libuv async.c:94), come i file
     `http-routes-*` sulla base (A18); senza, esce 0. La chiusura qui non lo cura e non è stata scritta per curarlo. */
  let chiuso = null
  const chiudiServer = () => (chiuso ??= new Promise((ok) => { server.closeAllConnections(); server.close(() => ok()) }))
  t.after(chiudiServer)
  const base = `http://127.0.0.1:${server.address().port}/api/v1/sessions/${encodeURIComponent(figliaId)}`
  const risposta = inputFiglia.chiediDomandaFn(DOMANDE, { toolCallId: 'c1', messaggi: [] })
  await pausa()
  const letta = await (await fetch(`${base}/pending`)).json()
  assert.equal(letta.data.pending?.tipo, 'domanda')
  assert.deepEqual(letta.data.pending?.questions?.map((q) => q.id), ['fornitore'])
  const { requestId } = letta.data.pending
  const rispondi = (corpo) => fetch(`${base}/question`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) })

  for (const rotto of [7, '', 'x'.repeat(201)]) {
    const r = await rispondi({ ...RISPOSTA(requestId), rispostoDa: rotto })
    assert.equal(r.status, 400, `rispostoDa ${JSON.stringify(rotto).slice(0, 20)}`)
    assert.equal((await r.json()).error.code, 'QUERY_INVALID')
  }
  const estraneo = await rispondi({ ...RISPOSTA(requestId), rispostoDa: 'sessione-estranea' })
  assert.equal(estraneo.status, 403)
  assert.equal((await estraneo.json()).error.code, 'QUESTION_ANSWER_FORBIDDEN')
  assert.equal(registry.domandaInAttesa(figliaId)?.requestId, requestId)

  const dalPadre = await rispondi({ ...RISPOSTA(requestId), rispostoDa: padreId })
  assert.equal(dalPadre.status, 200)
  assert.equal((await dalPadre.json()).data.ok, true)
  assert.deepEqual(await risposta, { status: 'answered', answers: { fornitore: 'Finto' } })
  assert.equal((await (await fetch(`${base}/pending`)).json()).data.pending, null)
  await chiudiServer()
})

test('C2Q-06 IL DESKTOP LA ACCENDE: server.mjs passa `domandeDeiFigli: true` al registro (decisione owner 07/10)', () => {
  const sorgente = readFileSync(new URL('../server.mjs', import.meta.url), 'utf8')
  const inizio = sorgente.indexOf('createSessionRegistry(resumeDiagnostics.registryOptions({')
  assert.ok(inizio > 0, 'premessa: il registro del server si costruisce lì')
  const opzioni = sorgente.slice(inizio, inizio + 20_000)
  assert.match(opzioni, /^\s*domandeDeiFigli: true,/mu, 'il server desktop non accende le domande delle figlie')
})

/*
 * ⛔⛔ RED del bugfixer (08/10 sera, REV-C2Q-A/B) — LA FIGLIA DI UN'AUTOMAZIONE RESTAVA APPESA. Con `domandeDeiFigli` acceso, la
 *   domanda di una figlia andava in `richiediDomandaUtente`, che chiude subito solo se `voce.senzaInterfaccia`: e la figlia non
 *   lo ereditava. Prima di C2-Q il rifiuto per le figlie (`QUESTION_CHILD_FORBIDDEN`) copriva il buco. Lo stesso buco, più vecchio
 *   (C2/F4-03), per una scrittura FUORI dal progetto. Decisione 4 dell'owner su C2: «Le automazioni senza nessuno davanti
 *   continuano a negare subito, come oggi».
 * ⇒ La figlia NASCE `senzaInterfaccia` se il padre lo è (orchestratore → `avviaESegui`, intestazione: sopravvive al riavvio), e
 *   una figlia così non riceve l'attrezzo per chiedere alla persona (`figliaChiedeAllaPersona` falso: resta `ask_parent`, come
 *   prima di C2-Q). Concorrenti: GitHub Copilot, «Dynamic workflows» (github/docs 1230337ad, 05/10/2026): senza interfaccia
 *   «the command does not display permission approval prompts»; DeepSeek Harness (`subagent/src/child-agent.ts:230-235`): la
 *   figlia delegata ha l'approvazione fissata a `never`.
 */
test('C2Q-07 AUTOMAZIONE: la figlia di un padre senza interfaccia non aspetta nessuno — la domanda si chiude subito, «unanswerable»', async (t) => {
  const { registry, figliaId, inputFiglia } = await scena(t, { senzaInterfaccia: true })
  assert.equal(inputFiglia.figliaChiedeAllaPersona, false, 'al modello della figlia non si offre la domanda alla persona: resta ask_parent')
  const esito = await entro(inputFiglia.chiediDomandaFn(DOMANDE, { toolCallId: 'c1', messaggi: [] }))
  assert.equal(esito.appesa, undefined, 'la figlia di un\'automazione resta appesa alla domanda')
  assert.equal(esito.r?.status, 'unanswerable', JSON.stringify(esito))
  assert.equal(registry.domandaInAttesa(figliaId), null)
})

test('C2Q-08 AUTOMAZIONE (F4-03, già prima di C2-Q): una scrittura FUORI dal progetto della figlia è un no subito, come per il padre', async (t) => {
  const { runtime, inputFiglia } = await scena(t, { senzaInterfaccia: true })
  const padre = await entro(runtime.runs[0].input.chiediApprovazioneFn({ tipo: 'scrivi', percorso: 'C:/fuori/a.txt', fuoriDalProgetto: true }))
  assert.deepEqual(padre, { r: false }, 'premessa: il padre senza interfaccia prende già un no subito')
  const figlia = await entro(inputFiglia.chiediApprovazioneFn({ tipo: 'scrivi', percorso: 'C:/fuori/b.txt', fuoriDalProgetto: true }))
  assert.deepEqual(figlia, { r: false })
})

test('C2Q-09 AL CONTRARIO: la figlia di un padre CON interfaccia chiede davvero, e aspetta la persona', async (t) => {
  const { registry, sessionId: padreId, figliaId, inputFiglia } = await scena(t)
  assert.equal(inputFiglia.figliaChiedeAllaPersona, true)
  const risposta = inputFiglia.chiediDomandaFn(DOMANDE, { toolCallId: 'c1', messaggi: [] })
  assert.equal((await entro(risposta, 300)).appesa, true, 'la domanda della figlia di una persona deve aspettare la persona')
  const { requestId } = registry.domandaInAttesa(figliaId)
  assert.deepEqual(await registry.rispondiDomanda(figliaId, requestId, RISPOSTA(requestId), { rispostoDa: padreId }), { ok: true })
  assert.deepEqual(await risposta, { status: 'answered', answers: { fornitore: 'Finto' } })
})

test('C2Q-10 L\'EREDITÀ RESTA: una NIPOTE nasce senza interfaccia, e dopo il riavvio la figlia lo è ancora', async (t) => {
  const { cartellaStore, registry, runtime, figliaId, inputFiglia } = await scena(t, { senzaInterfaccia: true })
  await inputFiglia.onDelega('nipote: controlla', '/tmp/x')
  assert.ok(runtime.runs[2], 'premessa: la nipote gira')
  assert.equal(runtime.runs[2].input.figliaChiedeAllaPersona, false)
  assert.equal((await entro(runtime.runs[2].input.chiediDomandaFn(DOMANDE, { toolCallId: 'c2', messaggi: [] }))).r?.status, 'unanswerable')
  // riavvio: l'intestazione porta il segno, e la figlia ripresa non aspetta nessuno
  for (const giro of runtime.runs) {
    giro.input.onEvento({ type: 'RunFinished', threadId: 't', runId: 'r' })
    giro.resolve({ ok: true, esito: { detto: 'ok', comeFinita: 'concluso', messaggiFinali: [{ role: 'user', content: 'x' }, { role: 'assistant', content: 'ok' }] } })
  }
  await registry.attendiAssestamento?.(figliaId)
  await registry.chiudi?.()
  await attendiScritture({ cartellaStore })
  const runtime2 = runtimeControllabile()
  const registry2 = nuovoRegistro(cartellaStore, runtime2)
  t.after(async () => { await registry2.chiudi?.(); try { await attendiScritture({ cartellaStore }) } catch { /* pulizia comunque */ } })
  await registry2.ripristina()
  const ripresa = registry2.resume(figliaId, 'continua', [])
  assert.ok(!ripresa?.erroreAvvio && runtime2.runs[0], JSON.stringify(ripresa))
  assert.equal(runtime2.runs[0].input.figliaChiedeAllaPersona, false, 'dopo il riavvio la figlia ha perso il segno dell\'automazione')
  assert.equal((await entro(runtime2.runs[0].input.chiediDomandaFn(DOMANDE, { toolCallId: 'c3', messaggi: [] }))).r?.status, 'unanswerable')
})
