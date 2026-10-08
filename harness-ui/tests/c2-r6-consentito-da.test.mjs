/*
 * ⛔⛔ C2 R6 (08/10/2026, contratto C2 §R6 + disegno rivisto dal bugfixer) — CHI HA DATO IL SÌ.
 *   Quando una regola di un ANTENATO copre la chiamata di una figlia non c'è domanda, quindi nessun `ApprovalResolved`: la ricevuta
 *   dell'operazione (e da lì la riga dell'attrezzo) porta `consentitoDa: { sessionId, tipo }`.
 *   - `tipo`: 'cartella' (scrittura fuori dal progetto), 'percorso' (segreto), 'rete' (cartella di rete), 'attrezzo' (il «sempre»
 *     per attrezzo di un antenato, quando è stato DECISIVO). Il sì di root in WSL NON si attribuisce (dichiarato nel kernel).
 *   - Mai sulle vie dove la persona ha risposto; mai per un sì proprio; mai per una radice (oggetto nudo): banco, CLI, mobile identici.
 * Le prove usano la vista VERA del registro (`inputFiglia.consensiSessione`, `permessiCorrentiFn`) e il kernel VERO (`talosLavora`).
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSessionRegistry } from '../src/session-registry.mjs'
import { attendiScritture } from '../src/session-store.mjs'
import { talosLavora, verificaPermessoScrittura, creaRicevutaOperazione, generaChiaviFirmaRicevute, verificaFirmaRicevuta } from '../src/kernel/talosHarness.mjs'
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs'

const ORIGINE = Symbol.for('talos.consensi.origine')

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
async function scena(t, { permessi = 'Workspace write' } = {}) {
  const cartellaStore = mkdtempSync(join(tmpdir(), 'talos-r6-'))
  const runtime = runtimeControllabile()
  const registry = createSessionRegistry({ cartellaStore, avviaSessioneFn: runtime.avviaSessioneFn,
    preparaEsecuzioneFn: () => ({ cartella: '/tmp/x', comandoProva: 'npm test', task: { id: 'task', consegna: 'delega' } }),
    modello: 'm', chiave: 'k', cartellaEsisteFn: () => true })
  t.after(async () => {
    await registry.chiudi?.()
    try { await attendiScritture({ cartellaStore }) } catch { /* pulizia comunque */ }
    rimuoviCartellaDiProva(cartellaStore)
  })
  const { sessionId } = registry.avvia('task', { permessiScelto: permessi, modalitaOperativaScelta: 'normale' })
  await runtime.runs[0].input.onDelega('figlia: scrivi un file', '/tmp/x')
  const figliaId = registry.elenca().find((s) => s.padreId === sessionId)?.sessionId
  assert.ok(figliaId, 'premessa: la figlia esiste')
  return { registry, runtime, sessionId, figliaId, inputPadre: runtime.runs[0].input, inputFiglia: runtime.runs[1].input }
}
/** Un sì «cartella per la sessione» dato dalla persona alla sessione `id`, sulla domanda vera del suo giro. */
async function siDiCartella(registry, id, input, chiave) {
  const domanda = input.chiediApprovazioneFn({ tipo: 'scrivi', percorso: 'a.txt', fuoriDalProgetto: { chiave } })
  await new Promise((r) => setTimeout(r, 10))
  const requestId = registry.domandaInAttesa(id)?.requestId
  assert.ok(requestId, `premessa: ${id} ha una domanda aperta`)
  assert.deepEqual(registry.rispondiApprovazione(id, requestId, true, { ambito: 'cartella' }), { ok: true })
  await domanda
}
function cartelle(t) {
  const progetto = realpathSync.native(mkdtempSync(join(tmpdir(), 'talos-r6-progetto-')))
  const fuori = realpathSync.native(mkdtempSync(join(tmpdir(), 'talos-r6-fuori-')))
  t.after(() => { rimuoviCartellaDiProva(progetto); rimuoviCartellaDiProva(fuori) })
  return { progetto, fuori }
}
/** Un giro vero del kernel: il modello chiede UNA scrittura, poi chiude. Restituisce le ricevute. */
async function unaScrittura(opzioni) {
  const risposte = [
    { role: 'assistant', content: '', tool_calls: [{ id: 'call_w', type: 'function', function: { name: 'scrivi', arguments: JSON.stringify({ percorso: opzioni.percorso, contenuto: 'ciao' }) } }] },
    { role: 'assistant', content: 'fatto' },
  ]
  let chiamate = 0
  const ricevute = []
  await talosLavora({
    task: { consegna: 'prova' }, modello: 'x', chiave: 'y', _giriMassimiInterno: 3,
    messaggiIniziali: [{ role: 'system', content: 'prova' }, { role: 'user', content: 'prova' }],
    fetchDiRete: async () => {
      const message = risposte[Math.min(chiamate++, risposte.length - 1)]
      return Response.json({ choices: [{ message, finish_reason: message.tool_calls ? 'tool_calls' : 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1 } })
    },
    onGiro: (e) => { if (e?.tipo === 'ricevuta') ricevute.push(e.ricevuta) },
    ...opzioni,
  })
  return ricevute.filter((r) => r.azione === 'scrivi')
}

// ── la vista del registro risponde al simbolo ─────────────────────────────────────────────────────────────

test('R6-01 LA VISTA DICE CHI: il sì del padre ⇒ il padre; il sì proprio ⇒ nessuno; la radice non ha il simbolo', async (t) => {
  const { registry, sessionId, figliaId, inputPadre, inputFiglia } = await scena(t)
  await siDiCartella(registry, sessionId, inputPadre, 'locale|C:/del-padre')
  await siDiCartella(registry, figliaId, inputFiglia, 'locale|C:/della-figlia')
  const origine = inputFiglia.consensiSessione[ORIGINE]
  assert.equal(typeof origine, 'function', 'la vista risponde al simbolo in modo esplicito')
  assert.deepEqual(origine('cartelleFuori', 'locale|C:/del-padre'), { sessionId })
  assert.equal(origine('cartelleFuori', 'locale|C:/della-figlia'), null, 'un sì proprio non si attribuisce')
  assert.equal(origine('cartelleFuori', 'locale|C:/di-nessuno'), null)
  assert.equal(inputPadre.consensiSessione[ORIGINE], undefined, 'la radice riceve il suo oggetto nudo: niente simbolo')
})

test('R6-02 IL PIÙ VICINO: se il sì ce l\'hanno la radice e la figlia, per la nipote l\'ha dato la figlia', async (t) => {
  const { registry, runtime, sessionId, figliaId, inputPadre, inputFiglia } = await scena(t)
  await inputFiglia.onDelega('nipote: lavoro piccolo', '/tmp/x')
  const inputNipote = runtime.runs[2].input
  await siDiCartella(registry, sessionId, inputPadre, 'locale|C:/condivisa')
  await siDiCartella(registry, figliaId, inputFiglia, 'locale|C:/condivisa')
  assert.deepEqual(inputNipote.consensiSessione[ORIGINE]('cartelleFuori', 'locale|C:/condivisa'), { sessionId: figliaId })
})

test('R6-03 «SEMPRE» DECISIVO: il padre «Chiede prima» con scrivi «sempre» ⇒ `origini` lo nomina; se il livello bastava da solo, no', async (t) => {
  const decisivo = await scena(t)
  decisivo.runtime.fine(0)
  await decisivo.registry.attendiAssestamento?.(decisivo.sessionId)
  await decisivo.registry.aggiornaImpostazioni(decisivo.sessionId, { permessi: 'On request', permessiPerAttrezzo: { scrivi: 'sempre' } })
  assert.deepEqual(decisivo.inputFiglia.permessiCorrentiFn(),
    { livelloAccesso: 'su-richiesta', permessiPerAttrezzo: { scrivi: 'sempre' }, origini: { scrivi: decisivo.sessionId } })

  const nonDecisivo = await scena(t)
  nonDecisivo.runtime.fine(0)
  await nonDecisivo.registry.attendiAssestamento?.(nonDecisivo.sessionId)
  await nonDecisivo.registry.aggiornaImpostazioni(nonDecisivo.sessionId, { permessiPerAttrezzo: { scrivi: 'sempre' } })
  assert.deepEqual(nonDecisivo.inputFiglia.permessiCorrentiFn(), { livelloAccesso: 'scrittura-progetto', permessiPerAttrezzo: { scrivi: 'sempre' } },
    'con «Scrive nel progetto» la scrittura passava comunque: niente da attribuire, e la forma di C2-a resta quella')
})

/* Review del bugfixer (08/10, mutanti BMD e BME sopravvissuti): il «sempre» su TRE livelli, e il «sempre» PROPRIO della figlia.
   I «sempre» si danno DOPO la delega: quelli che il padre ha già quando delega si COPIANO nella figlia alla nascita
   (`subagent-orchestrator.mjs`), diventano suoi e non si attribuiscono (dichiarato nel ledger, decisione dell'owner aperta). */
test('R6-03b IL PIÙ VICINO anche per il «sempre»: nonna e madre a «sempre», la nipote no ⇒ l\'origine è la MADRE', async (t) => {
  const { registry, runtime, sessionId: nonnaId, figliaId: madreId } = await scena(t)
  await runtime.runs[1].input.onDelega('nipote: scrivi un file', '/tmp/x')
  const nipoteId = registry.elenca().find((s) => s.padreId === madreId)?.sessionId
  assert.ok(nipoteId && runtime.runs[2], 'premessa: la nipote esiste e gira')
  runtime.fine(0)
  await registry.attendiAssestamento?.(nonnaId)
  assert.notEqual((await registry.aggiornaImpostazioni(nonnaId, { permessi: 'On request', permessiPerAttrezzo: { scrivi: 'sempre' } }))?.ok, false)
  assert.notEqual((await registry.aggiornaImpostazioni(madreId, { permessiPerAttrezzo: { scrivi: 'sempre' } }))?.ok, false, 'premessa: la madre accetta il suo «sempre»')
  assert.deepEqual(runtime.runs[2].input.permessiCorrentiFn(),
    { livelloAccesso: 'su-richiesta', permessiPerAttrezzo: { scrivi: 'sempre' }, origini: { scrivi: madreId } })
})

test('R6-03c AL CONTRARIO: un «sempre» PROPRIO della figlia non si attribuisce, anche se il padre ha lo stesso', async (t) => {
  const { registry, runtime, sessionId, figliaId, inputFiglia } = await scena(t)
  runtime.fine(0)
  await registry.attendiAssestamento?.(sessionId)
  assert.notEqual((await registry.aggiornaImpostazioni(sessionId, { permessi: 'On request', permessiPerAttrezzo: { scrivi: 'sempre' } }))?.ok, false)
  assert.notEqual((await registry.aggiornaImpostazioni(figliaId, { permessiPerAttrezzo: { scrivi: 'sempre' } }))?.ok, false, 'premessa: la figlia accetta il suo «sempre»')
  assert.deepEqual(inputFiglia.permessiCorrentiFn(), { livelloAccesso: 'su-richiesta', permessiPerAttrezzo: { scrivi: 'sempre' } },
    'il sì è della figlia: `origini` non c\'è')
})

// ── il kernel vero: la ricevuta ──────────────────────────────────────────────────────────────────────────

test('R6-04 CARTELLA (capo a capo): col sì del PADRE la scrittura fuori dal progetto della figlia porta `consentitoDa` nella ricevuta', async (t) => {
  const { progetto, fuori } = cartelle(t)
  const { registry, sessionId, inputPadre, inputFiglia } = await scena(t)
  await siDiCartella(registry, sessionId, inputPadre, `locale|${fuori}`)
  const [ricevuta] = await unaScrittura({ cartella: progetto, percorso: join(fuori, 'a.txt'), livelloAccesso: 'scrittura-progetto',
    consensiSessione: inputFiglia.consensiSessione, permessiCorrentiFn: inputFiglia.permessiCorrentiFn })
  assert.equal(ricevuta?.consentito, true, `premessa: la scrittura è passata (${ricevuta?.motivo})`)
  assert.equal(ricevuta.via, 'nessun-vincolo')
  assert.deepEqual(ricevuta.consentitoDa, { sessionId, tipo: 'cartella' })
})

test('R6-05 AL CONTRARIO: il sì PROPRIO della figlia, o una radice con l\'oggetto nudo, non portano `consentitoDa`', async (t) => {
  const { progetto, fuori } = cartelle(t)
  const { registry, figliaId, inputFiglia } = await scena(t)
  await siDiCartella(registry, figliaId, inputFiglia, `locale|${fuori}`)
  const [propria] = await unaScrittura({ cartella: progetto, percorso: join(fuori, 'a.txt'), livelloAccesso: 'scrittura-progetto',
    consensiSessione: inputFiglia.consensiSessione, permessiCorrentiFn: inputFiglia.permessiCorrentiFn })
  assert.equal(propria?.consentito, true, 'premessa: passata')
  assert.equal('consentitoDa' in propria, false, 'un sì proprio non si attribuisce')
  const [radice] = await unaScrittura({ cartella: progetto, percorso: join(fuori, 'b.txt'), livelloAccesso: 'scrittura-progetto',
    consensiSessione: { cartelleFuori: [`locale|${fuori}`] } })
  assert.equal(radice?.consentito, true, 'premessa: passata')
  assert.equal('consentitoDa' in radice, false, 'una radice (banco, CLI, mobile): niente')
})

test('R6-06 «SEMPRE» DEL PADRE (capo a capo): la ricevuta della figlia lo attribuisce con tipo «attrezzo»', async (t) => {
  const { progetto } = cartelle(t)
  const { registry, runtime, sessionId, inputFiglia } = await scena(t)
  runtime.fine(0)
  await registry.attendiAssestamento?.(sessionId)
  await registry.aggiornaImpostazioni(sessionId, { permessi: 'On request', permessiPerAttrezzo: { scrivi: 'sempre' } })
  const [ricevuta] = await unaScrittura({ cartella: progetto, percorso: 'dentro.txt', livelloAccesso: 'scrittura-progetto',
    consensiSessione: inputFiglia.consensiSessione, permessiCorrentiFn: inputFiglia.permessiCorrentiFn })
  assert.equal(ricevuta?.via, 'permesso-per-attrezzo-sempre', `premessa: passata per il «sempre» (${ricevuta?.motivo})`)
  assert.deepEqual(ricevuta.consentitoDa, { sessionId, tipo: 'attrezzo' })
})

test('R6-07 HA RISPOSTO LA PERSONA: anche se il sì del padre copre la cartella, una domanda fatta comunque non si attribuisce', async (t) => {
  const { progetto, fuori } = cartelle(t)
  const { registry, sessionId, inputPadre, inputFiglia } = await scena(t)
  await siDiCartella(registry, sessionId, inputPadre, `locale|${fuori}`)
  let chiesto = 0
  const [ricevuta] = await unaScrittura({ cartella: progetto, percorso: join(fuori, 'a.txt'), livelloAccesso: 'scrittura-progetto',
    consensiSessione: inputFiglia.consensiSessione, permessiPerAttrezzo: { scrivi: 'chiedi' },
    chiediApprovazioneFn: async () => { chiesto += 1; return true } })
  assert.equal(chiesto, 1, 'premessa: il «chiedi» sull\'attrezzo ha fatto la domanda')
  assert.equal(ricevuta?.consentito, true)
  assert.equal('consentitoDa' in ricevuta, false, 'il sì l\'ha dato la persona, non il padre')
})

// ── il segreto, al cancello ──────────────────────────────────────────────────────────────────────────────

test('R6-08 SEGRETO: «questo percorso per la sessione» del padre copre `cat .env` della figlia ⇒ traccia «percorso»; con l\'Accesso pieno sulla shell no', async (t) => {
  const { progetto } = cartelle(t)
  const { sessionId, inputPadre, inputFiglia } = await scena(t)
  inputPadre.consensiSessione.segretiConsentiti = ['.env'] // lo stesso stato che scrive `rispondiApprovazione` con `ambito: 'percorso'`
  const traccia = { consentitoDa: null }
  const esito = await verificaPermessoScrittura({ tipo: 'shell', comando: 'cat .env' }, {
    livelloAccesso: 'scrittura-progetto', cartella: progetto, consensiSessione: inputFiglia.consensiSessione, tracciaConsenso: traccia })
  assert.equal(esito.consentito, true, `premessa: passata senza domanda (${esito.motivo})`)
  assert.deepEqual(traccia.consentitoDa, { sessionId, tipo: 'percorso' })
  const pieno = { consentitoDa: null }
  await verificaPermessoScrittura({ tipo: 'shell', comando: 'cat .env' }, {
    livelloAccesso: 'accesso-pieno', cartella: progetto, consensiSessione: inputFiglia.consensiSessione, tracciaConsenso: pieno })
  assert.equal(pieno.consentitoDa, null, 'con l\'Accesso pieno il segreto sulla shell non chiede comunque: il sì non è servito')
})

// ── la ricevuta senza il campo resta quella di prima ─────────────────────────────────────────────────────

test('R6-09 SOLO-SE-PRESENTE: una ricevuta senza `consentitoDa` è byte per byte quella di prima; col campo, il campo c\'è', () => {
  const base = { azione: { tipo: 'scrivi', percorso: 'a.txt' }, toolCallId: 'c1', contenutoScritto: 'x' }
  const senza = creaRicevutaOperazione({ ...base, esitoPermesso: { consentito: true, via: 'nessun-vincolo' } })
  const nullo = creaRicevutaOperazione({ ...base, esitoPermesso: { consentito: true, via: 'nessun-vincolo', consentitoDa: null } })
  const con = creaRicevutaOperazione({ ...base, esitoPermesso: { consentito: true, via: 'nessun-vincolo', consentitoDa: { sessionId: 'padre', tipo: 'cartella' } } })
  assert.equal('consentitoDa' in senza, false)
  assert.equal(JSON.stringify(nullo), JSON.stringify(senza), 'null e assente danno la stessa ricevuta')
  assert.deepEqual(con.consentitoDa, { sessionId: 'padre', tipo: 'cartella' })
})

test('R6-10 DENTRO LA FIRMA: chi ha consentito è firmato con il resto — toglierlo o cambiarlo rompe la verifica', () => {
  const chiavi = generaChiaviFirmaRicevute()
  const firma = { chiavePrivata: chiavi.chiavePrivata, keyId: chiavi.keyId }
  const base = { azione: { tipo: 'scrivi', percorso: 'a.txt' }, toolCallId: 'c1', contenutoScritto: 'x', firma }
  const con = creaRicevutaOperazione({ ...base, esitoPermesso: { consentito: true, via: 'nessun-vincolo', consentitoDa: { sessionId: 'padre', tipo: 'cartella' } } })
  assert.equal(typeof con.signature, 'string')
  assert.equal(verificaFirmaRicevuta(con, chiavi.chiavePubblica), true)
  const { consentitoDa: _tolto, ...senzaIlCampo } = con
  assert.equal(verificaFirmaRicevuta(senzaIlCampo, chiavi.chiavePubblica), false, 'chi toglie la provenienza invalida la ricevuta')
  assert.equal(verificaFirmaRicevuta({ ...con, consentitoDa: { sessionId: 'altra', tipo: 'cartella' } }, chiavi.chiavePubblica), false, 'chi la cambia, anche')
  const senza = creaRicevutaOperazione({ ...base, esitoPermesso: { consentito: true, via: 'nessun-vincolo' } })
  assert.equal(verificaFirmaRicevuta(senza, chiavi.chiavePubblica), true, 'e la ricevuta senza il campo si verifica come prima')
})
