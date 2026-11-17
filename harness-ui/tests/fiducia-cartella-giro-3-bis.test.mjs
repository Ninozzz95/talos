/*
 * Fiducia della cartella, giro 3-bis (decisione dell'owner 11/11/2026 16:35, `DECISIONE-OWNER-2026-11-11-1635-FIDUCIA-DISCO-E-CASA-SOLO-PER-
 *   QUESTA-CHAT.md`; giudice v1491): su un disco intero o sulla cartella utente la carta offre «Mi fido solo per questa conversazione». Il sì:
 *   vale finché la conversazione è aperta; non si scrive MAI nel file della fiducia; non vale per le altre conversazioni, per le figlie in
 *   altre cartelle, per le automazioni né per il telefono, salvo che rispondano per la stessa conversazione. Come Claude Code
 *   (`CHANGELOG.md:8474`: nella cartella utente il sì vale per la sessione; `:4739`: lì la fiducia non si salva mai).
 *   Resta il giro 3: la fiducia SALVATA su radice e casa è rifiutata (`FOLDER_TRUST_TOO_WIDE`).
 * Niente chiavi, niente dati veri: la «casa» è una cartella temporanea passata allo store (`casaFn`), lo store sta in una cartella temporanea.
 */
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { creaFiduciaCartelle, opzioniFiduciaPerIlRegistro } from '../src/fiducia-cartelle.mjs'
import { createSessionRegistry } from '../src/session-registry.mjs'
import { createHttpApp } from '../src/http-app.mjs'
import { creaChiamataInterna } from '../src/remoto/chiamata-interna.mjs'
import { creaOperazioni } from '../src/remoto/operazioni.mjs'
import { iscriviConRigiocata } from '../src/iscrizione-sessione.mjs'

const temp = (p) => realpathSync(mkdtempSync(join(tmpdir(), p)))
const pausa = (ms = 80) => new Promise((r) => { setTimeout(r, ms) })
const finito = { esito: 'completato', motivo: 'fine' }
const SOLO_QUI = { soloPerLaConversazione: true }

/** Una «casa» finta, lo store vero con quella casa, il registro vero, la rotta vera e il telefono finto collegato. */
function banco(t, { casa = null, file = null, cartellaStore = null, tieniAperti = false } = {}) {
  const dati = casa ? null : temp('talos-giro3bis-')
  const laCasa = casa ?? join(dati, 'nino')
  mkdirSync(laCasa, { recursive: true })
  const ilFile = file ?? join(temp('talos-giro3bis-fid-'), 'fiducia-cartelle.json')
  const store = creaFiduciaCartelle({ file: ilFile, avvisa: () => {}, casaFn: () => laCasa })
  const corse = []
  const registro = createSessionRegistry({ cartellaStore: cartellaStore ?? temp('talos-giro3bis-store-'), modello: 'm', chiave: 'k', guardaWorkspaceFn: () => () => {}, cartellaEsisteFn: () => true,
    ...opzioniFiduciaPerIlRegistro(store),
    preparaEsecuzioneLiberaFn: (_c, { cartellaLibera, consegna }) => ({ cartella: cartellaLibera, comandoProva: null, task: { consegna, consegnaCorta: consegna } }),
    avviaSessioneFn: async (input) => {
      corse.push(input)
      input.onEvento({ type: 'RunStarted', threadId: `t${corse.length}`, runId: `r${corse.length}` })
      if (tieniAperti) return new Promise(() => {})
      input.onEvento({ type: 'RunFinished' })
      return { ok: true, esito: { ...finito, messaggiFinali: [{ role: 'user', content: 'x' }, { role: 'assistant', content: 'ok' }] } }
    } })
  t.after(() => registro.chiudi())
  const cartelle = { consentita: async () => true, descrivi: async () => ({ cartellaId: 'x', nome: 'casa' }), elenco: async () => [], chat: async () => null,
    chiedi: async () => null, attendi: async () => null, trova: async () => null, segnaSessioneChat: async () => {}, dispositivoDellaSessioneChat: async () => null }
  const httpApp = createHttpApp({ senzaGettone: 'prove', staticHandler: async () => null, sessionRegistry: registro, fiduciaCartelle: store })
  const chiama = creaChiamataInterna({ httpApp, porta: 4996 })
  const operazioni = creaOperazioni({ chiama, sessionRegistry: registro, iscriviConRigiocata, cartelle })
  const contesto = { dispositivo: { id: 'disp-finto', nome: 'Telefono finto' }, iscrizioni: new Map(), iscrivi: () => async () => {} }
  const rotta = (corpo) => chiama({ metodo: 'POST', percorso: '/api/v1/folder-trust', corpo }).then((r) => r.dati)
  const leggi = (sessionId) => chiama({ metodo: 'GET', percorso: `/api/v1/folder-trust?${new URLSearchParams({ sessionId })}` }).then((r) => r.dati)
  const telefono = (args) => operazioni.esegui('session.folder-trust', args, contesto)
  /** Una conversazione nella cartella data, passata ad Accesso pieno: trattenuta finché la persona risponde. */
  const trattenuta = async (cartella = laCasa) => {
    const { sessionId } = registro.avviaLibero({ cartellaLibera: cartella, consegna: 'ciao', permessi: 'Workspace write' })
    await pausa()
    await registro.aggiornaImpostazioni(sessionId, { permessi: 'Full access' })
    return sessionId
  }
  const fileScritto = () => (existsSync(ilFile) ? readFileSync(ilFile, 'utf8') : '')
  return { casa: laCasa, file: ilFile, store, registro, corse, rotta, leggi, telefono, trattenuta, fileScritto }
}

test('3-BIS ROSSA — nella cartella utente la carta offre «solo per questa conversazione»; il sì vale per lei, mai nel file', async (t) => {
  const b = banco(t)
  const id = await b.trattenuta()
  const ist = b.registro.impostazioniCorrenti(id)
  assert.equal(ist.permessi, 'On request', 'premessa: trattenuta')
  assert.equal(ist.fiduciaSoloConversazione, true, 'l\'istantanea (PC e telefono) dice che qui c\'è solo la scelta per la conversazione')
  const letta = await b.leggi(id)
  assert.equal(letta.fidata, null)
  assert.equal(letta.soloPerLaConversazione, true, 'la carta lo sa dalla rotta')
  /* la fiducia salvata resta rifiutata (giro 3) */
  await assert.rejects(b.rotta({ sessionId: id, fidata: true }), (e) => e.code === 'FOLDER_TRUST_TOO_WIDE')
  const r = await b.rotta({ sessionId: id, fidata: true, soloSeMaiChiesta: true, ...SOLO_QUI })
  assert.equal(r.fidata, true)
  assert.equal(r.soloPerLaConversazione, true)
  assert.deepEqual(r.cambiate, [id])
  assert.equal(b.registro.impostazioniCorrenti(id).permessi, 'Full access', 'l\'Accesso pieno torna per QUESTA conversazione')
  assert.equal(Object.hasOwn(b.registro.impostazioniCorrenti(id), 'fiduciaDaChiedere'), false, 'la domanda sparisce')
  assert.equal((await b.leggi(id)).fidata, true, 'la carta non torna: la rotta dice la risposta della conversazione')
  assert.equal(b.store.stato(b.casa), null, 'lo store non la sa')
  assert.ok(!b.fileScritto().includes('nino'), 'il file della fiducia non la porta')
  /* la seconda finestra con un «No» tardivo non rovescia */
  const tardi = await b.rotta({ sessionId: id, fidata: false, soloSeMaiChiesta: true, ...SOLO_QUI })
  assert.equal(tardi.fidata, true)
  assert.equal(b.registro.impostazioniCorrenti(id).permessi, 'Full access')
})

test('3-BIS ROSSA — il sì di una conversazione non vale per un\'altra nella stessa cartella, né per un giro d\'automazione', async (t) => {
  const b = banco(t)
  const a = await b.trattenuta()
  const altra = await b.trattenuta()
  await b.rotta({ sessionId: a, fidata: true, ...SOLO_QUI })
  assert.equal(b.registro.impostazioniCorrenti(a).permessi, 'Full access')
  assert.equal(b.registro.impostazioniCorrenti(altra).permessi, 'On request', 'un\'altra conversazione resta trattenuta')
  assert.equal(b.registro.impostazioniCorrenti(altra).fiduciaDaChiedere, true, 'e le si chiede')
  const giro = b.registro.avviaGiroAutomazione({ automazioneId: 'a1', runId: 'r1', cartella: b.casa, consegna: 'Riordina.', titolo: 'Riordino', permessi: 'Full access' })
  assert.ok(giro.sessionId, giro.erroreAvvio)
  await pausa()
  assert.equal(b.corse.at(-1).livelloAccesso, 'su-richiesta', 'il giro d\'automazione resta in Chiede prima')
  const fork = await b.registro.fork?.(a)
  if (fork?.sessionId) assert.notEqual(b.registro.impostazioniCorrenti(fork.sessionId)?.fiduciaSoloQui, true)
})

test('3-BIS ROSSA — il sì per la conversazione non sopravvive al riavvio', async (t) => {
  const cartellaStore = temp('talos-giro3bis-riavvio-')
  const dati = temp('talos-giro3bis-casa-')
  const casa = join(dati, 'nino')
  const file = join(temp('talos-giro3bis-fid-'), 'f.json')
  const a = banco(t, { casa, file, cartellaStore })
  const id = await a.trattenuta()
  await a.rotta({ sessionId: id, fidata: true, ...SOLO_QUI })
  assert.equal(a.registro.impostazioniCorrenti(id).permessi, 'Full access')
  await a.registro.chiudi()
  const b = banco(t, { casa, file, cartellaStore })
  await b.registro.ripristina()
  assert.equal(b.registro.impostazioniCorrenti(id).permessi, 'On request', 'dopo il riavvio la conversazione è di nuovo trattenuta')
  assert.equal(b.registro.impostazioniCorrenti(id).fiduciaDaChiedere, true, 'e la domanda torna')
})

test('3-BIS — il «No» solo per questa conversazione: la cartella vale non fidata per lei sola, niente nel file', async (t) => {
  const b = banco(t)
  const a = await b.trattenuta()
  const altra = await b.trattenuta()
  const r = await b.rotta({ sessionId: a, fidata: false, soloSeMaiChiesta: true, ...SOLO_QUI })
  assert.equal(r.fidata, false)
  const ist = b.registro.impostazioniCorrenti(a)
  assert.equal(ist.permessi, 'On request')
  assert.equal(ist.cartellaNonFidata, true, 'la riga fissa del «No»')
  assert.equal(ist.fiduciaSoloConversazione, true, 'la voce del velo offre ancora la scelta per la conversazione')
  assert.equal(b.registro.impostazioniCorrenti(altra).fiduciaDaChiedere, true, 'l\'altra conversazione non ha risposto')
  assert.equal(b.store.stato(b.casa), null)
  assert.ok(!b.fileScritto().includes('nino'))
})

test('3-BIS — la scelta per la conversazione solo dove serve: una cartella normale, una figlia, null e un telefono senza la scelta sono rifiutati', async (t) => {
  const b = banco(t)
  const progetto = join(b.casa, 'progetto'); mkdirSync(progetto)
  const normale = await b.trattenuta(progetto)
  assert.equal(Object.hasOwn(b.registro.impostazioniCorrenti(normale), 'fiduciaSoloConversazione'), false, 'una cartella di progetto: si salva per la cartella')
  await assert.rejects(b.rotta({ sessionId: normale, fidata: true, ...SOLO_QUI }), (e) => e.code === 'QUERY_INVALID')
  const id = await b.trattenuta()
  await assert.rejects(b.rotta({ sessionId: id, fidata: null, ...SOLO_QUI }), (e) => e.code === 'QUERY_INVALID')
  await assert.rejects(b.rotta({ cartellaLibera: b.casa, fidata: true, ...SOLO_QUI }), (e) => e.code === 'QUERY_INVALID', 'solo per una conversazione')
  await assert.rejects(b.rotta({ sessionId: id, fidata: true, soloPerLaConversazione: false }), (e) => e.code === 'QUERY_INVALID')
  /* il telefono senza la terza scelta: la frase del rifiuto, niente cambia */
  await assert.rejects(b.telefono({ sessionId: id, fidata: true }), (e) => e.code === 'FOLDER_TRUST_TOO_WIDE')
  assert.equal(b.registro.impostazioniCorrenti(id).permessi, 'On request')
})

test('3-BIS ROSSA (telefono) — il telefono ha la terza scelta, per la stessa conversazione; non vale per le altre', async (t) => {
  const b = banco(t)
  const id = await b.trattenuta()
  const altra = await b.trattenuta()
  const r = await b.telefono({ sessionId: id, fidata: true, soloPerLaConversazione: true })
  assert.deepEqual(r, { fidata: true, cambiate: [id], soloPerLaConversazione: true })
  assert.equal(b.registro.impostazioniCorrenti(id).permessi, 'Full access')
  assert.equal(b.registro.impostazioniCorrenti(altra).permessi, 'On request')
  await assert.rejects(b.telefono({ sessionId: id, fidata: true, soloPerLaConversazione: 'si' }), (e) => e.code === 'BAD_MESSAGE')
  assert.equal(b.store.stato(b.casa), null)
  assert.ok(!b.fileScritto().includes('nino'))
})

test('3-BIS ROSSA — le figlie: nella cartella della madre prendono il sì della madre; in un\'altra cartella no', async (t) => {
  const b = banco(t, { tieniAperti: true })
  const altrove = join(b.casa, 'altrove'); mkdirSync(altrove)
  const { sessionId: madre } = b.registro.avviaLibero({ cartellaLibera: b.casa, consegna: 'delega', permessi: 'Full access' })
  await pausa()
  assert.equal(b.registro.impostazioniCorrenti(madre).permessi, 'On request', 'premessa: la madre nella casa è trattenuta')
  await b.rotta({ sessionId: madre, fidata: true, ...SOLO_QUI })
  assert.equal(b.registro.impostazioniCorrenti(madre).permessi, 'Full access')
  const conLei = await b.corse[0].onDelega('scrivi', undefined, { modalita: 'modifica' })
  const fuori = await b.corse[0].onDelega('scrivi', altrove, { modalita: 'modifica' })
  await pausa()
  assert.ok(conLei.childId && fuori.childId, 'premessa: le figlie sono nate')
  const livello = (childId) => b.corse.find((c) => c.sessionId === childId || c.input?.sessionId === childId)?.permessiCorrentiFn?.().livelloAccesso
    ?? b.registro.impostazioniCorrenti(childId)?.permessi
  assert.ok(['accesso-pieno', 'Full access'].includes(livello(conLei.childId)), 'la figlia nella cartella della madre è parte della sua conversazione')
  assert.ok(!['accesso-pieno', 'Full access'].includes(livello(fuori.childId)), 'la figlia in un\'altra cartella resta trattenuta')
  await assert.rejects(b.rotta({ sessionId: conLei.childId, fidata: true, ...SOLO_QUI }), (e) => e.code === 'QUERY_INVALID', 'una figlia non risponde per sé')
})
