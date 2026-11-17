/*
 * Fiducia della cartella, giro 3 (Desktop 11/11/2026 15:47; controllore ROSSO 15:44, G2-d; giudice v1483 «sì al giro 3 piccolo»).
 *   · G2-d: una chat aperta dall'elenco dei progetti in Accesso pieno lavora nella radice del disco; la sua figlia delegata nasce lì. Una
 *     risposta di fiducia per la FIGLIA (dal telefono o dalla rotta del PC) va alla cartella di fiducia della madre, mai alla radice.
 *   · Radici dei dischi, cartella di casa e le cartelle sopra la casa non sono MAI un bersaglio della fiducia, da nessuna via (rotta,
 *     telefono, `/settings`, store), come Claude Code (`CHANGELOG.md:4739`: nella cartella di casa «trust there is never saved») e Hermes
 *     (`agent/lsp/workspace.py:158-161`: «A repo at or above $HOME never counts»).
 *   · Difesa sul disco: una voce già scritta su una radice o sulla casa, al caricamento, vale «mai chiesta».
 *   · G2-c (mutante N1 del controllore): senza il consenso della cartella il telefono non risponde; N4: niente `null` dal telefono.
 *   · `cambiate` al telefono: solo la conversazione chiesta.
 * Niente chiavi, niente dati veri: ogni store e ogni file sta in una cartella temporanea (sotto il profilo finto).
 */
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, parse as parsePath } from 'node:path'
import test from 'node:test'

import { creaFiduciaCartelle, opzioniFiduciaPerIlRegistro } from '../src/fiducia-cartelle.mjs'
import { createSessionRegistry } from '../src/session-registry.mjs'
import { createHttpApp } from '../src/http-app.mjs'
import { creaChiamataInterna } from '../src/remoto/chiamata-interna.mjs'
import { creaOperazioni } from '../src/remoto/operazioni.mjs'
import { iscriviConRigiocata } from '../src/iscrizione-sessione.mjs'
import { creaFonteFiducia } from '../src/impostazioni/fonti-impostazioni.mjs'

const temp = (p) => realpathSync(mkdtempSync(join(tmpdir(), p)))
const pausa = (ms = 80) => new Promise((r) => { setTimeout(r, ms) })
const finito = { esito: 'completato', motivo: 'fine' }
const TROPPO_LARGA = (e) => e?.code === 'FOLDER_TRUST_TOO_WIDE'

/** Il telefono finto collegato al PC: consenso della cartella a scelta, chiamate vere alla rotta vera. */
function telefono(t, registro, store, { consentita = () => true } = {}) {
  const chiesteDi = []
  const cartelle = {
    consentita: async (_d, c) => { chiesteDi.push(c); return consentita(c) },
    descrivi: async () => ({ cartellaId: 'x', nome: 'progetto' }),
    elenco: async () => [], chat: async () => null, chiedi: async () => null, attendi: async () => null, trova: async () => null,
    segnaSessioneChat: async () => {}, dispositivoDellaSessioneChat: async () => null,
  }
  const httpApp = createHttpApp({ senzaGettone: 'prove', staticHandler: async () => null, sessionRegistry: registro, fiduciaCartelle: store })
  const chiama = creaChiamataInterna({ httpApp, porta: 4997 })
  const operazioni = creaOperazioni({ chiama, sessionRegistry: registro, iscriviConRigiocata, cartelle })
  const contesto = { dispositivo: { id: 'disp-finto', nome: 'Telefono finto' }, iscrizioni: new Map(), iscrivi: () => async () => {} }
  const esegui = (op, args) => operazioni.esegui(op, args, contesto)
  const rotta = (corpo) => chiama({ metodo: 'POST', percorso: '/api/v1/folder-trust', corpo }).then((r) => r.dati)
  const leggi = (chiave, valore) => chiama({ metodo: 'GET', percorso: `/api/v1/folder-trust?${new URLSearchParams({ [chiave]: valore })}` }).then((r) => r.dati)
  return { esegui, rotta, leggi, chiesteDi }
}

/** Il banco del controllore (G2-d): progetto fidato dall'elenco, madre in Accesso pieno nella radice, figlia delegata senza cartella. */
async function figliaNellaRadice(t, { cartellaFiglio } = {}) {
  const progetto = temp('talos-giro3-figlia-')
  const store = creaFiduciaCartelle({ file: join(temp('talos-giro3-fid-'), 'f.json'), avvisa: () => {} })
  await store.imposta(progetto, true)
  const avvii = []
  const registro = createSessionRegistry({ cartellaStore: temp('talos-giro3-store-'), modello: 'm', chiave: 'k', guardaWorkspaceFn: () => () => {}, cartellaEsisteFn: () => true,
    ...opzioniFiduciaPerIlRegistro(store),
    preparaEsecuzioneLiberaFn: (_c, { consegna }) => ({ cartella: progetto, comandoProva: null, task: { consegna, consegnaCorta: consegna } }),
    avviaSessioneFn: (input) => { avvii.push(input); input.onEvento({ type: 'RunStarted', threadId: `t${avvii.length}`, runId: `r${avvii.length}` }); return new Promise(() => {}) } })
  t.after(() => registro.chiudi())
  const madre = registro.avviaLibero({ cartellaId: 'p', consegna: 'delega', permessi: 'Full access' })
  await pausa()
  const ricevuta = await avvii[0].onDelega('scrivi', cartellaFiglio, { modalita: 'modifica' })
  await pausa()
  return { progetto, store, registro, madre: madre.sessionId, figlia: ricevuta.childId, radice: parsePath(progetto).root }
}

test('G2-d ROSSA (telefono) — la risposta per una FIGLIA nella radice va alla cartella di fiducia della madre, mai al disco intero', async (t) => {
  const b = await figliaNellaRadice(t)
  assert.ok(b.figlia, 'premessa: la figlia è nata')
  assert.equal(b.registro.cartellaPerLaFiducia({ sessionId: b.figlia }).cartella, b.progetto, 'la cartella della fiducia della figlia è quella della madre')
  const tel = telefono(t, b.registro, b.store)
  const r = await tel.esegui('session.folder-trust', { sessionId: b.figlia, fidata: true })
  const altrove = temp('talos-giro3-mai-')
  assert.notEqual(b.store.stato(altrove), true, 'una risposta per una conversazione non rende fidato tutto il disco')
  assert.equal(b.store.stato(b.radice), null, 'la radice resta mai chiesta')
  assert.equal(r.fidata, true, 'il progetto della madre era già fidato')
  assert.ok(b.store.elenco().every((v) => parsePath(v.cartella).root !== v.cartella), 'nessuna voce sulla radice nel file')
})

test('G2-d ROSSA (rotta del PC) — GET e POST per la figlia leggono e scrivono la cartella della madre; un «No» non tocca la radice', async (t) => {
  const b = await figliaNellaRadice(t)
  const pc = telefono(t, b.registro, b.store)
  const letta = await pc.leggi('sessionId', b.figlia)
  assert.equal(letta.cartella, b.progetto)
  assert.equal(letta.fidata, true)
  const no = await pc.rotta({ sessionId: b.figlia, fidata: false })
  assert.equal(no.cartella, b.progetto, 'la risposta va alla cartella di fiducia della madre')
  assert.equal(b.store.stato(b.progetto), false)
  assert.equal(b.store.stato(b.radice), null, 'la radice resta mai chiesta')
  assert.equal(b.store.stato(temp('talos-giro3-mai-')), null)
})

test('G2-d — una figlia delegata in un\'ALTRA cartella non è un bersaglio della fiducia dalla rotta (né dal telefono): rifiutata, niente scritto', async (t) => {
  const altra = temp('talos-giro3-altra-')
  const b = await figliaNellaRadice(t, { cartellaFiglio: altra })
  assert.ok(b.figlia, 'premessa: la figlia è nata')
  const pc = telefono(t, b.registro, b.store)
  await assert.rejects(pc.rotta({ sessionId: b.figlia, fidata: true }), (e) => e.code === 'QUERY_INVALID')
  await assert.rejects(pc.leggi('sessionId', b.figlia), (e) => e.code === 'QUERY_INVALID')
  await assert.rejects(pc.esegui('session.folder-trust', { sessionId: b.figlia, fidata: true }), (e) => e.code === 'QUERY_INVALID')
  assert.equal(b.store.stato(altra), null, 'niente scritto')
  assert.equal(b.store.stato(b.radice), null)
})

/* ── radici e casa: mai un bersaglio ─────────────────────────────────────────────────────────────────────── */
test('RADICE E CASA ROSSA (store) — un disco intero, la casa e le cartelle sopra la casa non si impostano mai (né Sì né No); una sottocartella della casa sì', async () => {
  const dati = temp('talos-giro3-casa-')
  const casa = join(dati, 'utenti', 'nino')
  mkdirSync(join(casa, 'progetto'), { recursive: true })
  const store = creaFiduciaCartelle({ file: join(temp('talos-giro3-fid-'), 'f.json'), avvisa: () => {}, casaFn: () => casa })
  for (const [cartella, fidata] of [[parsePath(dati).root, true], [parsePath(dati).root, false], [casa, true], [`${casa}\\`, false], [dirname(casa), true]]) {
    await assert.rejects(store.imposta(cartella, fidata), TROPPO_LARGA, `${cartella} = ${fidata}`)
  }
  assert.equal(store.stato(join(casa, 'progetto')), null, 'niente scritto')
  assert.equal(await store.imposta(join(casa, 'progetto'), true), true, 'una cartella di progetto nella casa sì')
  /* POSIX: «/» e la casa */
  const posix = creaFiduciaCartelle({ file: join(temp('talos-giro3-fid-'), 'g.json'), avvisa: () => {}, piattaforma: 'linux', casaFn: () => '/home/nino', percorsoVeroFn: (c) => c })
  await assert.rejects(posix.imposta('/', true), TROPPO_LARGA)
  await assert.rejects(posix.imposta('/home', true), TROPPO_LARGA)
  await assert.rejects(posix.imposta('/home/nino/', true), TROPPO_LARGA)
  assert.equal(await posix.imposta('/home/nino/lavoro', true), true)
  /* Windows: una radice di rete e il prefisso lungo davanti al disco */
  const win = creaFiduciaCartelle({ file: join(temp('talos-giro3-fid-'), 'h.json'), avvisa: () => {}, piattaforma: 'win32', casaFn: () => 'C:\\Users\\Nino', percorsoVeroFn: (c) => c })
  for (const c of ['C:\\', 'd:/', '\\\\?\\C:\\', '\\\\server\\quota\\', 'C:\\Users', 'c:\\users\\nino']) await assert.rejects(win.imposta(c, true), TROPPO_LARGA, c)
  assert.equal(await win.imposta('C:\\Users\\Nino\\Progetto', true), true)
  assert.equal(await win.imposta('C:\\Users\\Nina', true), true, 'una casa vicina non è sopra la casa')
  assert.equal(await win.imposta('C:\\Users\\Nin', true), true, 'una cartella il cui nome è l\'inizio del nome della casa non è sopra la casa')
  /* togliere (null) resta permesso: pulisce, non concede */
  assert.equal(await win.imposta('C:\\', null), null)
})

test('RADICE E CASA ROSSA (rotta, telefono, /settings) — una conversazione nella casa o una cartella scelta sul disco intero: rifiutate, niente scritto', async (t) => {
  const dati = temp('talos-giro3-casa2-')
  const casa = join(dati, 'nino')
  mkdirSync(casa)
  const store = creaFiduciaCartelle({ file: join(temp('talos-giro3-fid-'), 'f.json'), avvisa: () => {}, casaFn: () => casa })
  const registro = createSessionRegistry({ cartellaStore: temp('talos-giro3-store-'), modello: 'm', chiave: 'k', guardaWorkspaceFn: () => () => {}, cartellaEsisteFn: () => true,
    ...opzioniFiduciaPerIlRegistro(store),
    preparaEsecuzioneLiberaFn: (_c, { cartellaLibera, consegna }) => ({ cartella: cartellaLibera, comandoProva: null, task: { consegna, consegnaCorta: consegna } }),
    avviaSessioneFn: async (input) => { input.onEvento({ type: 'RunStarted' }); input.onEvento({ type: 'RunFinished' })
      return { ok: true, esito: { ...finito, messaggiFinali: [{ role: 'user', content: 'x' }, { role: 'assistant', content: 'ok' }] } } } })
  t.after(() => registro.chiudi())
  const pc = telefono(t, registro, store)
  /* la rotta del PC: una cartella scelta a mano sul disco intero o sulla casa */
  await assert.rejects(pc.rotta({ cartellaLibera: parsePath(dati).root, fidata: true }), TROPPO_LARGA)
  await assert.rejects(pc.rotta({ cartellaLibera: casa, fidata: true, soloSeMaiChiesta: true }), TROPPO_LARGA)
  await assert.rejects(pc.rotta({ cartellaLibera: dati, fidata: false }), TROPPO_LARGA, 'sopra la casa')
  /* una conversazione aperta nella casa, in Accesso pieno: trattenuta; la risposta dal telefono e da /settings è rifiutata */
  const { sessionId } = registro.avviaLibero({ cartellaLibera: casa, consegna: 'ciao', permessi: 'Workspace write' })
  await pausa()
  await registro.aggiornaImpostazioni(sessionId, { permessi: 'Full access' })
  assert.equal(registro.impostazioniCorrenti(sessionId).permessi, 'On request', 'premessa: trattenuta')
  await assert.rejects(pc.esegui('session.folder-trust', { sessionId, fidata: true }), TROPPO_LARGA)
  await assert.rejects(pc.rotta({ sessionId, fidata: true }), TROPPO_LARGA)
  await assert.rejects(creaFonteFiducia(store, () => registro).scrivi({ fidata: true }, { sessionId }), TROPPO_LARGA)
  assert.equal(store.stato(casa), null, 'niente scritto')
  assert.equal(store.stato(parsePath(dati).root), null)
  assert.equal(registro.impostazioniCorrenti(sessionId).permessi, 'On request', 'l\'Accesso pieno resta trattenuto')
})

test('DIFESA SUL DISCO ROSSA — un file finto con «sì» sulla radice, sulla casa e sopra la casa: al caricamento valgono «mai chiesta»; la risposta dopo le toglie dal file', async () => {
  const dati = temp('talos-giro3-disco-')
  const casa = join(dati, 'nino')
  const progetto = join(dati, 'altro', 'progetto')
  mkdirSync(casa); mkdirSync(progetto, { recursive: true })
  const file = join(temp('talos-giro3-fid-'), 'fiducia-cartelle.json')
  writeFileSync(file, JSON.stringify({ schema: 'talos.folder-trust.v1', cartelle: { [parsePath(dati).root]: true, [casa]: true, [dati]: true, [progetto]: false } }))
  const avvisi = []
  const store = creaFiduciaCartelle({ file, avvisa: (m) => avvisi.push(m), casaFn: () => casa })
  assert.equal(store.stato(temp('talos-giro3-altrove-')), null, 'la radice col «sì» non presta il suo «sì» a nessuno')
  assert.equal(store.stato(casa), null)
  assert.equal(store.stato(join(casa, 'dentro')), null)
  assert.equal(store.stato(dati), null, 'sopra la casa')
  assert.equal(store.stato(progetto), false, 'le altre voci restano')
  assert.ok(avvisi.length >= 1, 'si avvisa una riga nel registro del server')
  await store.imposta(join(casa, 'lavoro'), true)
  const scritto = Object.keys(JSON.parse(readFileSync(file, 'utf8')).cartelle)
  assert.deepEqual(scritto.sort(), [join(casa, 'lavoro'), progetto].sort(), 'il file riscritto non porta più le voci troppo larghe')
})

/* ── il telefono: consenso (N1), niente null (N4), `cambiate` della sola conversazione ─────────────────────── */
function bancoTelefono(t, { consentita }) {
  const progetto = temp('talos-giro3-tel-')
  const sotto = join(progetto, 'sotto'); mkdirSync(sotto)
  const store = creaFiduciaCartelle({ file: join(temp('talos-giro3-fid-'), 'f.json'), avvisa: () => {} })
  const registro = createSessionRegistry({ cartellaStore: temp('talos-giro3-store-'), modello: 'm', chiave: 'k', guardaWorkspaceFn: () => () => {}, cartellaEsisteFn: () => true,
    ...opzioniFiduciaPerIlRegistro(store),
    preparaEsecuzioneLiberaFn: (_c, { cartellaLibera, consegna }) => ({ cartella: cartellaLibera, comandoProva: null, task: { consegna, consegnaCorta: consegna } }),
    avviaSessioneFn: async (input) => { input.onEvento({ type: 'RunStarted' }); input.onEvento({ type: 'RunFinished' })
      return { ok: true, esito: { ...finito, messaggiFinali: [{ role: 'user', content: 'x' }, { role: 'assistant', content: 'ok' }] } } } })
  t.after(() => registro.chiudi())
  const tel = telefono(t, registro, store, { consentita })
  const trattenuta = async (cartella) => {
    const { sessionId } = registro.avviaLibero({ cartellaLibera: cartella, consegna: 'ciao', permessi: 'Workspace write' })
    await pausa()
    await registro.aggiornaImpostazioni(sessionId, { permessi: 'Full access' })
    return sessionId
  }
  return { progetto, sotto, store, registro, tel, trattenuta }
}

test('G2-c (mutante N1) — senza il consenso della cartella il telefono non risponde alla domanda; col consenso sì. N4: niente null', async (t) => {
  let si = false
  const b = bancoTelefono(t, { consentita: () => si })
  const id = await b.trattenuta(b.progetto)
  await assert.rejects(b.tel.esegui('session.folder-trust', { sessionId: id, fidata: true }), (e) => e.code === 'CONSENT_REQUIRED')
  assert.equal(b.store.stato(b.progetto), null, 'niente scritto')
  assert.ok(b.tel.chiesteDi.includes(b.progetto), 'il consenso chiesto è quello della cartella della conversazione')
  si = true
  await assert.rejects(b.tel.esegui('session.folder-trust', { sessionId: id, fidata: null }), (e) => e.code === 'BAD_MESSAGE', 'N4: il telefono non toglie la risposta')
  assert.equal(b.store.stato(b.progetto), null)
  const dopo = await b.tel.esegui('session.folder-trust', { sessionId: id, fidata: true })
  assert.equal(dopo.fidata, true)
  assert.equal(b.store.stato(b.progetto), true)
  assert.equal(b.registro.impostazioniCorrenti(id).permessi, 'Full access')
})

test('CAMBIATE ROSSA — al telefono `cambiate` porta solo la conversazione chiesta, mai le altre della stessa cartella', async (t) => {
  const b = bancoTelefono(t, { consentita: () => true })
  const a = await b.trattenuta(b.progetto)
  const stessa = await b.trattenuta(b.progetto)
  const figlia = await b.trattenuta(b.sotto)
  const r = await b.tel.esegui('session.folder-trust', { sessionId: a, fidata: true })
  assert.deepEqual(Object.keys(r).sort(), ['cambiate', 'fidata'])
  assert.deepEqual(r.cambiate, [a])
  /* le altre sono cambiate davvero (il PC lo sa): solo il telefono non le riceve */
  assert.equal(b.registro.impostazioniCorrenti(stessa).permessi, 'Full access')
  assert.equal(b.registro.impostazioniCorrenti(figlia).permessi, 'Full access')
  /* una seconda risposta su una cartella già decisa: niente cambia, lista vuota */
  const ancora = await b.tel.esegui('session.folder-trust', { sessionId: stessa, fidata: true })
  assert.deepEqual(ancora.cambiate, [])
})
