/*
 * Falla della fiducia della cartella (revisione 10/11/2026, reperto 1, provato dal vivo; owner 11/11 12:18, giudice v1450-v1451).
 *   Una conversazione nata nel modo di serie e passata DOPO ad Accesso pieno (pillola, `/settings`, l'attrezzo del modello, il telefono
 *   collegato) non riceveva mai la domanda: la fiducia restava `null` («mai chiesta») e il registro la trattava come fidata.
 *   Contratto nuovo: con la fonte della fiducia (il server del PC) `null` NON concede l'Accesso pieno. Lo TRATTIENE come «On request»
 *   finché la persona non risponde, e lo dice nell'istantanea e nella riga dell'elenco (`fiduciaDaChiedere`, `pienoTrattenuto`): la
 *   finestra fa la domanda una volta sola. Le istruzioni, i ganci e gli strumenti di una cartella mai chiesta restano come oggi.
 *   Senza fonte (CLI, il server del telefono) niente cambia.
 * Niente server con chiavi, niente dati veri: il giro è finto (`avviaSessioneFn`) e lo store è una cartella temporanea.
 */
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { opzioniFiduciaPerIlRegistro } from '../src/fiducia-cartelle.mjs'
import { createSessionRegistry } from '../src/session-registry.mjs'

const finito = { esito: 'completato', motivo: 'fine' }
function banco(t, { fiducia = { stato: null }, conFonte = true, store = mkdtempSync(join(tmpdir(), 'talos-mai-chiesta-store-')) } = {}) {
  const radice = mkdtempSync(join(tmpdir(), 'talos-mai-chiesta-banco-'))
  const corse = []
  const registro = createSessionRegistry({ cartellaStore: store, modello: 'fixture', chiave: 'fixture', guardaWorkspaceFn: () => () => {}, cartellaEsisteFn: () => true,
    /* le due funzioni come le passa il server del PC (`opzioniFiduciaPerIlRegistro`): `stato` è la risposta della persona */
    ...(conFonte ? opzioniFiduciaPerIlRegistro({ stato: () => fiducia.stato }) : {}),
    preparaEsecuzioneFn: (id) => ({ ok: true, cartella: radice, task: { id, consegna: 'Verifica.' }, comandoProva: null }),
    avviaSessioneFn: async (input) => { corse.push(input); input.onEvento({ type: 'RunStarted' }); input.onEvento({ type: 'RunFinished' })
      return { ok: true, esito: { ...finito, messaggiFinali: [{ role: 'user', content: 'Verifica.' }, { role: 'assistant', content: 'ok' }] } } } })
  t.after(() => registro.chiudi())
  return { registro, corse, radice, store, fiducia }
}
const pausa = () => new Promise((r) => { setTimeout(r, 60) })
const rigaDi = (registro, sessionId) => registro.elenca().find((r) => r.sessionId === sessionId)

for (const daModo of ['Workspace write', 'On request', 'Read only']) {
  test(`MAI CHIESTA ROSSA — nata in «${daModo}», passata dopo ad Accesso pieno: il primo giro NON parte in Accesso pieno e la domanda è annunciata`, async (t) => {
    const b = banco(t)
    const { sessionId } = b.registro.avvia('a', { permessiScelto: daModo })
    await pausa()
    await b.registro.aggiornaImpostazioni(sessionId, { permessi: 'Full access' })
    const ist = b.registro.impostazioniCorrenti(sessionId)
    assert.equal(ist.permessi, 'On request', 'trattenuto, finché la persona non risponde')
    assert.equal(ist.fiduciaDaChiedere, true, 'la finestra deve fare la domanda')
    assert.equal(ist.pienoTrattenuto, true)
    assert.equal(Object.hasOwn(ist, 'cartellaNonFidata'), false, 'non è un «No»: istruzioni e strumenti restano come oggi')
    const riga = rigaDi(b.registro, sessionId)
    assert.equal(riga.fiduciaDaChiedere, true, 'anche chi RIAPRE la conversazione dall\'elenco lo sa')
    await b.registro.resume(sessionId, 'scrivi qualcosa')
    await pausa()
    assert.equal(b.corse.at(-1).livelloAccesso, 'su-richiesta', 'il primo giro dopo il cambio non è in Accesso pieno')
  })
}

test('MAI CHIESTA ROSSA — «Sì»: l\'Accesso pieno torna dal giro dopo, la domanda sparisce e non torna cambiando modo due volte', async (t) => {
  const b = banco(t)
  const { sessionId } = b.registro.avvia('b', { permessiScelto: 'Workspace write' })
  await pausa()
  await b.registro.aggiornaImpostazioni(sessionId, { permessi: 'Full access' })
  assert.equal(b.registro.impostazioniCorrenti(sessionId).fiduciaDaChiedere, true, 'prima della risposta: trattenuto e domanda annunciata')
  b.fiducia.stato = true // la persona risponde «Sì» (la rotta scrive e poi riapplica)
  b.registro.riapplicaFiducia()
  const ist = b.registro.impostazioniCorrenti(sessionId)
  assert.equal(ist.permessi, 'Full access')
  assert.equal(Object.hasOwn(ist, 'fiduciaDaChiedere'), false)
  await b.registro.resume(sessionId, 'vai')
  await pausa()
  assert.equal(b.corse.at(-1).livelloAccesso, 'accesso-pieno')
  for (const permessi of ['Workspace write', 'Full access', 'Workspace write', 'Full access']) {
    await b.registro.aggiornaImpostazioni(sessionId, { permessi })
    assert.equal(Object.hasOwn(b.registro.impostazioniCorrenti(sessionId), 'fiduciaDaChiedere'), false, `nessuna seconda domanda (${permessi})`)
    assert.equal(b.registro.impostazioniCorrenti(sessionId).permessi, permessi)
  }
})

test('MAI CHIESTA ROSSA — «No»: la cartella resta non fidata, l\'Accesso pieno non lavora lì e la riga dice perché', async (t) => {
  const b = banco(t)
  const { sessionId } = b.registro.avvia('c', { permessiScelto: 'Workspace write' })
  await pausa()
  await b.registro.aggiornaImpostazioni(sessionId, { permessi: 'Full access' })
  assert.equal(b.registro.impostazioniCorrenti(sessionId).fiduciaDaChiedere, true, 'prima della risposta: trattenuto e domanda annunciata')
  b.fiducia.stato = false
  b.registro.riapplicaFiducia()
  const ist = b.registro.impostazioniCorrenti(sessionId)
  assert.equal(ist.permessi, 'On request')
  assert.equal(ist.cartellaNonFidata, true)
  assert.equal(ist.pienoTrattenuto, true, 'la riga fissa dice «l\'Accesso pieno chiede prima di modificare»')
  assert.equal(Object.hasOwn(ist, 'fiduciaDaChiedere'), false, 'la domanda ha avuto la sua risposta')
  await b.registro.resume(sessionId, 'vai')
  await pausa()
  assert.equal(b.corse.at(-1).livelloAccesso, 'su-richiesta')
})

test('MAI CHIESTA ROSSA — una richiesta che NASCE in Accesso pieno su una cartella mai chiesta (una via che la finestra non vede) parte trattenuta', async (t) => {
  const b = banco(t)
  const { sessionId } = b.registro.avvia('d', { permessiScelto: 'Full access' })
  await pausa()
  assert.equal(b.corse[0].livelloAccesso, 'su-richiesta')
  assert.equal(b.registro.impostazioniCorrenti(sessionId).fiduciaDaChiedere, true)
})

test('MAI CHIESTA ROSSA (u) — una chat VECCHIA, salvata in Accesso pieno quando «mai chiesta» valeva fidata: dopo l\'aggiornamento la domanda arriva una volta, prima del primo giro nuovo', async (t) => {
  const store = mkdtempSync(join(tmpdir(), 'talos-mai-chiesta-store-'))
  const prima = banco(t, { store, conFonte: false }) // la versione di ieri: nessuna differenza fra null e fidata
  const { sessionId } = prima.registro.avvia('e', { permessiScelto: 'Full access' })
  await pausa()
  assert.equal(prima.corse[0].livelloAccesso, 'accesso-pieno')
  await prima.registro.chiudi()
  const dopo = banco(t, { store })
  await dopo.registro.ripristina()
  assert.equal(dopo.registro.impostazioniCorrenti(sessionId).fiduciaDaChiedere, true, 'la domanda è annunciata alla riapertura')
  assert.equal(rigaDi(dopo.registro, sessionId).fiduciaDaChiedere, true)
  await dopo.registro.resume(sessionId, 'primo giro nuovo')
  await pausa()
  assert.equal(dopo.corse.at(-1).livelloAccesso, 'su-richiesta')
  dopo.fiducia.stato = true
  dopo.registro.riapplicaFiducia()
  assert.equal(Object.hasOwn(dopo.registro.impostazioniCorrenti(sessionId), 'fiduciaDaChiedere'), false, 'una volta sola')
  await dopo.registro.resume(sessionId, 'ancora')
  await pausa()
  assert.equal(dopo.corse.at(-1).livelloAccesso, 'accesso-pieno')
})

test('MAI CHIESTA ROSSA — il «Sì» dato dopo il cambio sopravvive al riavvio: la riga salvata ricorda che la persona aveva scelto l\'Accesso pieno', async (t) => {
  const store = mkdtempSync(join(tmpdir(), 'talos-mai-chiesta-store-'))
  const a = banco(t, { store })
  const { sessionId } = a.registro.avvia('f', { permessiScelto: 'Workspace write' })
  await pausa()
  await a.registro.aggiornaImpostazioni(sessionId, { permessi: 'Full access' })
  assert.equal(a.registro.impostazioniCorrenti(sessionId).permessi, 'On request', 'trattenuto prima della risposta')
  await a.registro.chiudi()
  const b = banco(t, { store, fiducia: { stato: true } })
  await b.registro.ripristina()
  assert.equal(b.registro.impostazioniCorrenti(sessionId).permessi, 'Full access')
})

test('TELEFONO (v) — il server del telefono non ha la fonte della fiducia: niente cambia, l\'Accesso pieno resta pieno e nessuna domanda si annuncia', async (t) => {
  assert.deepEqual(opzioniFiduciaPerIlRegistro({ stato: () => null }, { telefono: true }), {}, 'sul telefono il registro non riceve le funzioni')
  const b = banco(t, { conFonte: false })
  const { sessionId } = b.registro.avvia('g', { permessiScelto: 'Workspace write' })
  await pausa()
  await b.registro.aggiornaImpostazioni(sessionId, { permessi: 'Full access' })
  const ist = b.registro.impostazioniCorrenti(sessionId)
  assert.equal(ist.permessi, 'Full access', 'il telefono vede l\'Accesso pieno che ha scelto: nessun abbassamento muto')
  assert.equal(Object.hasOwn(ist, 'fiduciaDaChiedere'), false)
  assert.equal(Object.hasOwn(ist, 'pienoTrattenuto'), false)
  await b.registro.resume(sessionId, 'vai')
  await pausa()
  assert.equal(b.corse.at(-1).livelloAccesso, 'accesso-pieno')
})

test('MAI CHIESTA — la fiducia tolta a conversazione aperta (la rotta accetta `null`): dal giro dopo l\'Accesso pieno è trattenuto e la domanda torna', async (t) => {
  const b = banco(t, { fiducia: { stato: true } })
  const { sessionId } = b.registro.avvia('h', { permessiScelto: 'Full access' })
  await pausa()
  assert.equal(b.corse[0].livelloAccesso, 'accesso-pieno')
  b.fiducia.stato = null // «non ancora chiesta» di nuovo
  await b.registro.resume(sessionId, 'ancora')
  await pausa()
  assert.equal(b.corse.at(-1).livelloAccesso, 'su-richiesta', 'il giro dopo non è in Accesso pieno')
  assert.equal(b.registro.impostazioniCorrenti(sessionId).fiduciaDaChiedere, true)
  b.fiducia.stato = true
  assert.deepEqual(b.registro.riapplicaFiducia().cambiate, [sessionId], 'il «Sì» lo rimette')
  assert.equal(b.registro.impostazioniCorrenti(sessionId).permessi, 'Full access')
})

test('MAI CHIESTA — il «Sì» a una cartella non rialza una conversazione trattenuta su UN\'ALTRA cartella ancora mai chiesta', async (t) => {
  const cartelle = { x: mkdtempSync(join(tmpdir(), 'talos-mai-chiesta-x-')), y: mkdtempSync(join(tmpdir(), 'talos-mai-chiesta-y-')) }
  const fiducia = new Map()
  const registro = createSessionRegistry({ cartellaStore: mkdtempSync(join(tmpdir(), 'talos-mai-chiesta-store-')), modello: 'fixture', chiave: 'fixture',
    guardaWorkspaceFn: () => () => {}, cartellaEsisteFn: () => true,
    ...opzioniFiduciaPerIlRegistro({ stato: (c) => (fiducia.has(c) ? fiducia.get(c) : null) }),
    preparaEsecuzioneFn: (id) => ({ ok: true, cartella: cartelle[id], task: { id, consegna: 'Verifica.' }, comandoProva: null }),
    avviaSessioneFn: async (input) => { input.onEvento({ type: 'RunStarted' }); input.onEvento({ type: 'RunFinished' })
      return { ok: true, esito: { ...finito, messaggiFinali: [{ role: 'user', content: 'Verifica.' }, { role: 'assistant', content: 'ok' }] } } } })
  t.after(() => registro.chiudi())
  const x = registro.avvia('x', { permessiScelto: 'Workspace write' }).sessionId
  const y = registro.avvia('y', { permessiScelto: 'Workspace write' }).sessionId
  await pausa()
  await registro.aggiornaImpostazioni(x, { permessi: 'Full access' })
  await registro.aggiornaImpostazioni(y, { permessi: 'Full access' })
  fiducia.set(cartelle.x, true)
  assert.deepEqual(registro.riapplicaFiducia().cambiate, [x])
  assert.equal(registro.impostazioniCorrenti(x).permessi, 'Full access')
  assert.equal(registro.impostazioniCorrenti(y).permessi, 'On request', 'la cartella y non ha ancora risposto')
  assert.equal(registro.impostazioniCorrenti(y).fiduciaDaChiedere, true)
})
