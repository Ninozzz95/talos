/*
 * Fiducia della cartella, giro 3-ter (giudice v1501, 11/11/2026 17:18; controllore GIALLO, `RAPPORTO-CONTROLLORE-FIDUCIA-GIRO-2-2026-11-11.md`):
 *   1. il «No» della madre, dato «solo per questa conversazione» su un disco intero o sulla casa, abbassa SUBITO le figlie che avevano
 *      ereditato il suo sì: quelle in cammino e quelle ferme, tutte, anche le nipoti. Prima restavano in Accesso pieno sul disco intero
 *      (`riapplicaFiducia` salta le figlie). Ci si arriva dalla rotta.
 *   2. K3: una figlia non risponde per sé, nemmeno chiamando il nucleo direttamente (la rotta la ferma prima).
 *   3. L1 (controllore del 3-ter): la figlia abbassata perde il sì anche in memoria; rialzata a mano resta «Chiede prima».
 *   4. L2 (controllore del 3-ter): una conversazione aperta dall'elenco dei progetti in Accesso pieno lavora sulla radice del disco, e la
 *      figlia nata lì prende la radice come cartella; dopo il «No» la figlia torna stretta come la madre, mai il disco intero in «Chiede prima».
 * Come Claude Code (documentazione dei sub-agenti, 11/2026: la figlia prende il modo della madre e non può scavalcarlo) e Hermes
 *   (`tools/delegate_tool_child_run.py:885-899`: la figlia riceve la politica delle approvazioni dalla madre, mai una sua).
 * Niente chiavi, niente dati veri: la «casa» è una cartella temporanea passata allo store (`casaFn`).
 */
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, parse } from 'node:path'
import test from 'node:test'

import { creaFiduciaCartelle, opzioniFiduciaPerIlRegistro } from '../src/fiducia-cartelle.mjs'
import { createSessionRegistry } from '../src/session-registry.mjs'
import { createHttpApp } from '../src/http-app.mjs'
import { creaChiamataInterna } from '../src/remoto/chiamata-interna.mjs'

const temp = (p) => realpathSync(mkdtempSync(join(tmpdir(), p)))
const pausa = (ms = 80) => new Promise((r) => { setTimeout(r, ms) })
const SOLO_QUI = { soloPerLaConversazione: true }
const PIENO = ['accesso-pieno', 'Full access']

/** Lo store vero con una «casa» finta, il registro vero, la rotta vera. `aperta(n)`: il giro n (da 1) resta in cammino, gli altri finiscono. */
function banco(t, { aperta = () => true, casa = join(temp('talos-giro3ter-'), 'nino'), cartellaStore = temp('talos-giro3ter-store-'),
  fileFiducia = join(temp('talos-giro3ter-fid-'), 'fiducia-cartelle.json') } = {}) { // L2 RIAVVIO: lo stesso negozio e la stessa casa dopo `chiudi`
  mkdirSync(casa, { recursive: true })
  const store = creaFiduciaCartelle({ file: fileFiducia, avvisa: () => {}, casaFn: () => casa })
  const corse = []
  const registro = createSessionRegistry({ cartellaStore, modello: 'm', chiave: 'k', guardaWorkspaceFn: () => () => {}, cartellaEsisteFn: () => true,
    ...opzioniFiduciaPerIlRegistro(store),
    /* L2: `cartellaId: 'casa'` è la casa scelta dall'elenco dei progetti (senza `cartellaGiaScelta`: l'Accesso pieno la allarga alla radice) */
    preparaEsecuzioneLiberaFn: (_c, { cartellaId, cartellaLibera, consegna }) => ({ cartella: cartellaLibera ?? (cartellaId === 'casa' ? casa : cartellaId === 'progetto' ? join(casa, 'progetto') : null), comandoProva: null, task: { consegna, consegnaCorta: consegna } }),
    avviaSessioneFn: async (input) => {
      corse.push(input)
      const n = corse.length
      input.onEvento({ type: 'RunStarted', threadId: `t${n}`, runId: `r${n}` })
      if (aperta(n)) return new Promise(() => {})
      input.onEvento({ type: 'RunFinished' })
      return { ok: true, esito: { esito: 'completato', motivo: 'fine', messaggiFinali: [{ role: 'user', content: 'x' }, { role: 'assistant', content: 'ok' }] } }
    } })
  t.after(() => registro.chiudi())
  const httpApp = createHttpApp({ senzaGettone: 'prove', staticHandler: async () => null, sessionRegistry: registro, fiduciaCartelle: store })
  const chiama = creaChiamataInterna({ httpApp, porta: 4997 })
  const rotta = (corpo) => chiama({ metodo: 'POST', percorso: '/api/v1/folder-trust', corpo }).then((r) => r.dati)
  /** Il modo della sessione (quello che vedono il PC e il telefono) e, se è in cammino, quello che il nucleo usa alla prossima chiamata. */
  const modo = (id) => registro.impostazioniCorrenti(id)?.permessi
  const livelloVivo = (id) => corse.find((c) => c.checkpointSessionId === id)?.permessiCorrentiFn?.().livelloAccesso
  return { casa, cartellaStore, fileFiducia, store, registro, corse, rotta, modo, livelloVivo }
}

/** La madre nella casa in Accesso pieno, il sì «solo qui» dalla rotta, poi due figlie nella sua cartella (giri 2 e 3). */
async function madreConFiglie(b) {
  const { sessionId: madre } = b.registro.avviaLibero({ cartellaLibera: b.casa, consegna: 'delega', permessi: 'Full access' })
  await pausa()
  assert.equal(b.modo(madre), 'On request', 'premessa: nella casa la madre è trattenuta')
  await b.rotta({ sessionId: madre, fidata: true, ...SOLO_QUI })
  assert.equal(b.modo(madre), 'Full access', 'premessa: col sì solo qui la madre torna in Accesso pieno')
  const prima = await b.corse[0].onDelega('scrivi uno', undefined, { modalita: 'modifica' })
  const seconda = await b.corse[0].onDelega('scrivi due', undefined, { modalita: 'modifica' })
  await pausa()
  assert.ok(prima.childId && seconda.childId, 'premessa: le figlie sono nate')
  return { madre, prima: prima.childId, seconda: seconda.childId }
}

test('3-TER ROSSA — il «No» della madre dalla rotta abbassa SUBITO la figlia in cammino e quella ferma', async (t) => {
  const b = banco(t, { aperta: (n) => n !== 3 }) // il giro 3 è la seconda figlia: finisce subito
  const { madre, prima: inCammino, seconda: ferma } = await madreConFiglie(b)
  for (const id of [inCammino, ferma]) assert.equal(b.modo(id), 'Full access', `premessa: la figlia ${id} ha ereditato il sì della madre`)
  assert.ok(PIENO.includes(b.livelloVivo(inCammino)), 'premessa: la figlia in cammino scrive senza chiedere')
  assert.equal(b.corse.length, 3, 'premessa: due figlie, nessun giro in più')
  const conclusa = (id) => b.registro.elenca().find((v) => v.sessionId === id)?.conclusa
  assert.equal(conclusa(ferma), true, 'premessa: la seconda figlia ha finito il suo giro (ferma)')
  assert.notEqual(conclusa(inCammino), true, 'premessa: la prima è ancora in cammino')

  const r = await b.rotta({ sessionId: madre, fidata: false, ...SOLO_QUI })
  assert.equal(r.fidata, false)
  assert.equal(b.modo(madre), 'On request', 'la madre chiede prima')
  assert.equal(b.modo(inCammino), 'On request', 'la figlia in cammino non resta in Accesso pieno sul disco intero')
  assert.ok(!PIENO.includes(b.livelloVivo(inCammino)), 'la prossima scrittura della figlia in cammino chiede (il nucleo rilegge a ogni chiamata)')
  assert.equal(b.modo(ferma), 'On request', 'la figlia ferma non riparte in Accesso pieno')

  /* L1: il «No» le ha tolto il sì anche in memoria. Rialzata a mano, resta «Chiede prima» a schermo e nel nucleo. */
  for (const id of [inCammino, ferma]) {
    await b.registro.aggiornaImpostazioni(id, { permessi: 'Full access' })
    await pausa(20)
    assert.equal(b.modo(id), 'On request', `la figlia ${id} rialzata a mano non mostra Accesso pieno: il sì della madre non c'è più`)
  }
  assert.ok(!PIENO.includes(b.livelloVivo(inCammino)), 'e la prossima scrittura della figlia rialzata chiede ancora')
})

test('3-TER ROSSA — il «No» abbassa TUTTE le figlie ereditate, anche le nipoti; una figlia in un\'altra cartella non cambia', async (t) => {
  const b = banco(t)
  const { madre, prima, seconda } = await madreConFiglie(b)
  const nipote = (await b.corse[1].onDelega('scrivi tre', undefined, { modalita: 'modifica' })).childId
  await pausa()
  assert.ok(nipote, 'premessa: la nipote è nata')
  assert.equal(b.modo(nipote), 'Full access', 'premessa: la nipote ha ereditato il sì per catena')
  /* una figlia nata dalla madre in un progetto fidato: non ha ereditato niente, il «No» della madre non la tocca */
  const progetto = join(b.casa, 'progetto'); mkdirSync(progetto)
  await b.store.imposta(progetto, true)
  const altrove = (await b.corse[0].onDelega('scrivi altrove', progetto, { modalita: 'modifica' })).childId
  await pausa()
  assert.equal(b.modo(altrove), 'Full access', 'premessa: la figlia nel progetto fidato è in Accesso pieno per la sua cartella')

  await b.rotta({ sessionId: madre, fidata: false, ...SOLO_QUI })
  for (const id of [prima, seconda, nipote]) {
    assert.equal(b.modo(id), 'On request', `la figlia ${id} che aveva ereditato il sì scende`)
    assert.ok(!PIENO.includes(b.livelloVivo(id)), `e la sua prossima scrittura chiede (${id})`)
  }
  assert.equal(b.modo(altrove), 'Full access', 'la figlia nel progetto fidato non aveva ereditato il sì: resta com\'era')
})

test('3-TER K3 — una figlia non risponde per sé, nemmeno chiamando il nucleo: la sua risposta è quella della madre', async (t) => {
  const b = banco(t)
  const { madre, prima } = await madreConFiglie(b)
  await b.rotta({ sessionId: madre, fidata: false, ...SOLO_QUI })
  const r = b.registro.fiduciaSoloPerQuestaConversazione(prima, true)
  assert.equal(r.code, 'QUERY_INVALID', 'il nucleo rifiuta la risposta di una figlia')
  assert.equal(r.ok, undefined)
  const sottoLaRotta = await b.rotta({ sessionId: prima, fidata: true, ...SOLO_QUI }).then(() => null, (e) => e.code)
  assert.equal(sottoLaRotta, 'QUERY_INVALID', 'e la rotta pure')
  /* una nipote nata adesso eredita la risposta della madre, non un sì dato dalla figlia */
  const nipote = (await b.corse[1].onDelega('scrivi tre', undefined, { modalita: 'modifica' })).childId
  await pausa()
  assert.ok(nipote, 'premessa: la nipote è nata')
  assert.notEqual(b.modo(nipote), 'Full access', 'la nipote non prende un sì che la madre non ha dato')
  assert.equal(b.modo(madre), 'On request')
})

test("3-TER L2 ROSSA — dall'elenco dei progetti: dopo il «No» la cartella della figlia torna stretta, mai il disco intero", async (t) => {
  const b = banco(t)
  const radice = parse(b.casa).root
  const { sessionId: madre } = b.registro.avviaLibero({ cartellaId: 'casa', consegna: 'delega', permessi: 'Full access' })
  await pausa()
  assert.equal(b.modo(madre), 'On request', 'premessa: nella casa mai chiesta la madre è trattenuta')
  assert.equal(b.registro.cartellaDi(madre), b.casa, 'premessa: trattenuta, la madre lavora nella casa')
  await b.rotta({ sessionId: madre, fidata: true, ...SOLO_QUI })
  assert.equal(b.modo(madre), 'Full access', 'premessa: col sì solo qui la madre è in Accesso pieno')
  assert.equal(b.registro.cartellaDi(madre), radice, "premessa: dall'elenco dei progetti l'Accesso pieno allarga alla radice del disco")
  const figlia = (await b.corse[0].onDelega('scrivi', undefined, { modalita: 'modifica' })).childId
  await pausa()
  assert.ok(figlia, 'premessa: la figlia è nata')
  assert.equal(b.modo(figlia), 'Full access', 'premessa: la figlia ha ereditato il sì')
  assert.equal(b.registro.cartellaDi(figlia), radice, 'premessa: la figlia lavora dove lavora la madre, sulla radice')

  const r = await b.rotta({ sessionId: madre, fidata: false, ...SOLO_QUI })
  assert.ok(r.cambiate.includes(figlia), 'la figlia è fra le cambiate')
  assert.equal(b.registro.cartellaDi(madre), b.casa, 'la madre torna stretta nella casa')
  assert.equal(b.modo(figlia), 'On request')
  assert.equal(b.registro.cartellaDi(figlia), b.casa, 'la figlia torna stretta come la madre, mai il disco intero in «Chiede prima»')
  /* rialzata a mano resta stretta: il cambio di modo ricalcola la cartella, e non deve riportarla alla radice */
  await b.registro.aggiornaImpostazioni(figlia, { permessi: 'Full access' })
  await pausa(20)
  assert.equal(b.modo(figlia), 'On request')
  assert.equal(b.registro.cartellaDi(figlia), b.casa, 'rialzata a mano, la figlia resta nella casa')
  /* una nipote nata adesso nasce nella cartella stretta della figlia, e chiede */
  const nipote = (await b.corse[1].onDelega('scrivi tre', undefined, { modalita: 'modifica' })).childId
  await pausa()
  assert.ok(nipote, 'premessa: la nipote è nata')
  assert.equal(b.registro.cartellaDi(nipote), b.casa, 'la nipote nasce nella cartella stretta')
  assert.notEqual(b.modo(nipote), 'Full access')
})

/* L2 dopo il riavvio: il sì «solo qui» è in memoria e si perde, la figlia torna trattenuta; la sua intestazione dice la radice (dove è
   nata), e da lì il ripristino la rimetteva sul disco intero in «Chiede prima». Con e senza il «No» prima di chiudere. */
for (const conNo of [true, false]) {
  test(`3-TER L2 RIAVVIO ROSSA — ${conNo ? 'dopo il «No»' : 'col sì solo qui perso'}: la figlia ripristinata torna stretta, mai il disco intero`, async (t) => {
    const b = banco(t)
    const { sessionId: madre } = b.registro.avviaLibero({ cartellaId: 'casa', consegna: 'delega', permessi: 'Full access' })
    await pausa()
    await b.rotta({ sessionId: madre, fidata: true, ...SOLO_QUI })
    const figlia = (await b.corse[0].onDelega('scrivi', undefined, { modalita: 'modifica' })).childId
    await pausa()
    assert.equal(b.registro.cartellaDi(figlia), parse(b.casa).root, 'premessa: la figlia è nata sulla radice')
    if (conNo) await b.rotta({ sessionId: madre, fidata: false, ...SOLO_QUI })
    await b.registro.chiudi()
    const b2 = banco(t, { casa: b.casa, cartellaStore: b.cartellaStore, fileFiducia: b.fileFiducia })
    await b2.registro.ripristina()
    await pausa()
    assert.equal(b2.modo(madre), 'On request', 'premessa: la madre ripristinata è trattenuta')
    assert.equal(b2.registro.cartellaDi(madre), b.casa, 'premessa: e lavora nella casa')
    assert.equal(b2.modo(figlia), 'On request', 'la figlia ripristinata chiede prima')
    assert.equal(b2.registro.cartellaDi(figlia), b.casa, 'e lavora nella casa come la madre, mai sul disco intero')
    await b2.registro.aggiornaImpostazioni(figlia, { permessi: 'Full access' })
    await pausa(20)
    assert.equal(b2.registro.cartellaDi(figlia), b.casa, 'rialzata a mano, la figlia ripristinata resta nella casa')
  })
}

/* Guardia del contrario (mutante L2Rc): la figlia di un progetto fidato per sempre, aperto dall'elenco, è in Accesso pieno sulla radice
   come la madre; dopo il riavvio resta in Accesso pieno sulla radice: si stringe solo chi è trattenuto. */
test('3-TER L2 RIAVVIO — la figlia di un progetto fidato resta in Accesso pieno sulla radice', async (t) => {
  const b = banco(t)
  const progetto = join(b.casa, 'progetto'); mkdirSync(progetto)
  await b.store.imposta(progetto, true)
  const { sessionId: madre } = b.registro.avviaLibero({ cartellaId: 'progetto', consegna: 'delega', permessi: 'Full access' })
  await pausa()
  const radice = parse(progetto).root
  assert.equal(b.registro.cartellaDi(madre), radice, 'premessa: la madre del progetto fidato lavora sulla radice')
  const figlia = (await b.corse[0].onDelega('scrivi', undefined, { modalita: 'modifica' })).childId
  await pausa()
  assert.equal(b.modo(figlia), 'Full access', 'premessa: la figlia è in Accesso pieno')
  assert.equal(b.registro.cartellaDi(figlia), radice, 'premessa: sulla radice')
  await b.registro.chiudi()
  const b2 = banco(t, { casa: b.casa, cartellaStore: b.cartellaStore, fileFiducia: b.fileFiducia })
  await b2.registro.ripristina()
  await pausa()
  assert.equal(b2.modo(figlia), 'Full access', 'la figlia ripristinata resta in Accesso pieno')
  assert.equal(b2.registro.cartellaDi(figlia), radice, 'e resta sulla radice, come la madre')
})
