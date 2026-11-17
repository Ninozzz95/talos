/*
 * Fiducia della cartella, giro 2 (Desktop 11/11/2026; ROSSO del giudice v1461 su 338df4b6b; owner 13:08-13:30 «Avviso con Mi fido», anche
 *   dal telefono). Le prove usano risposte di fiducia DIVERSE per cartelle diverse: lo store vero (`creaFiduciaCartelle`) su un file
 *   temporaneo, con la regola vera della cartella madre che vale per le figlie.
 *   · D1: una chat aperta da una cartella dell'elenco in Accesso pieno lavora nella radice del disco; la sua figlia delegata senza
 *     cartella nasce lì. La fiducia della figlia segue la cartella di partenza della madre, mai la radice.
 *   · D5: con la chat trattenuta, «Procedi accettando le modifiche» non salta la domanda e non cambia il livello trattenuto.
 *   · la via del piano con una cartella mai chiesta, e la via della giunzione (una cartella raggiunta attraverso un collegamento).
 *   · D4 / (b): lo stato vero detto alla persona (ricevuta di `/settings`) e al modello (risposta dell'attrezzo e nota col messaggio).
 *   · (2): un'automazione in Accesso pieno su una cartella mai chiesta: un avviso UNA volta per cartella; dopo il Sì il giro dopo è in
 *     Accesso pieno; un No resta un No.
 *   · D2: il telefono collegato vede la trattenuta e risponde.
 * Niente chiavi, niente dati veri: il giro è finto e ogni store sta in una cartella temporanea.
 */
import assert from 'node:assert/strict'
import { mkdtempSync, realpathSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, parse as parsePath } from 'node:path'
import test from 'node:test'

import { creaFiduciaCartelle, opzioniFiduciaPerIlRegistro } from '../src/fiducia-cartelle.mjs'
import { createSessionRegistry } from '../src/session-registry.mjs'
import { creaRegistroNotifiche } from '../src/notifiche-registro.mjs'
import { creaScrittoriNotifiche } from '../src/notifiche-scrittori.mjs'
import { creaServizioImpostazioni } from '../src/impostazioni/servizio-impostazioni.mjs'
import { creaCopiaFinestra } from '../src/impostazioni/copia-finestra.mjs'
import { creaFonteSessione } from '../src/impostazioni/fonti-impostazioni.mjs'
import { createHttpApp } from '../src/http-app.mjs'
import { creaChiamataInterna } from '../src/remoto/chiamata-interna.mjs'
import { creaOperazioni } from '../src/remoto/operazioni.mjs'
import { iscriviConRigiocata } from '../src/iscrizione-sessione.mjs'

const cartellaTemp = (prefisso) => realpathSync(mkdtempSync(join(tmpdir(), prefisso)))
const pausa = (ms = 60) => new Promise((r) => { setTimeout(r, ms) })
const finito = { esito: 'completato', motivo: 'fine' }

/** Lo store vero della fiducia, su un file temporaneo: `imposta(cartella, true|false|null)` come la rotta. */
function fiduciaVera() {
  return creaFiduciaCartelle({ file: join(cartellaTemp('talos-giro2-fiducia-'), 'fiducia-cartelle.json'), avvisa: () => {} })
}

/** Il modello finto che tiene in mano `onDelega` (come `delega-parallelo-sequenza-cartella.test.mjs`). */
function modelloFinto() {
  const avvii = []
  return {
    avvii,
    async avviaSessioneFn(input) {
      const indice = avvii.length + 1
      let concludi
      const attesa = new Promise((r) => { concludi = r })
      avvii.push({ cartella: input.cartella, permessi: input.permessi, livelloAccesso: input.livelloAccesso, onDelega: input.onDelega, input,
        concludi: () => { input.onEvento({ type: 'RunFinished', threadId: `t${indice}`, runId: `r${indice}`, outcome: { type: 'success' } }); concludi({ ok: true, esito: { detto: 'Fatto.', comeFinita: 'concluso' } }) } })
      input.onEvento({ type: 'RunStarted', threadId: `t${indice}`, runId: `r${indice}` })
      return attesa
    },
  }
}

function registroConElenco(t, { progetto, store, finto }) {
  const registro = createSessionRegistry({
    avviaSessioneFn: finto.avviaSessioneFn, guardaWorkspaceFn: () => () => {}, cartellaEsisteFn: () => true,
    ...opzioniFiduciaPerIlRegistro(store),
    preparaEsecuzioneLiberaFn: (cartelle, { cartellaId, cartellaLibera, consegna }) => ({
      cartella: cartellaLibera ?? cartelle.find((c) => c.id === cartellaId).percorso, comandoProva: null, task: { consegna, consegnaCorta: consegna } }),
    cartelleProgetto: [{ id: '0', percorso: progetto, nome: 'progetto' }],
    modello: 'z-ai/glm-5.3-flash', chiave: 'chiave-finta',
  })
  t.after(() => registro.chiudi())
  return registro
}

test('D1 ROSSA — progetto fidato, chat in Accesso pieno aperta dall\'elenco (lavora nella radice), delega senza cartella: la figlia resta in Accesso pieno', async (t) => {
  const progetto = cartellaTemp('talos-giro2-d1-')
  const store = fiduciaVera()
  await store.imposta(progetto, true)
  assert.equal(store.stato(parsePath(progetto).root), null, 'premessa: la radice del disco non è mai stata chiesta')
  const finto = modelloFinto()
  const registro = registroConElenco(t, { progetto, store, finto })
  const madre = registro.avviaLibero({ cartellaId: '0', consegna: 'dividi e delega', permessi: 'Full access' })
  assert.ok(madre.sessionId, madre.erroreAvvio)
  assert.equal(finto.avvii[0].cartella, parsePath(progetto).root, 'premessa: dall\'elenco l\'Accesso pieno lavora nella radice')
  assert.equal(finto.avvii[0].livelloAccesso, 'accesso-pieno', 'premessa: la madre è in Accesso pieno (progetto fidato)')
  void finto.avvii[0].onDelega('scrivi la parte 1', undefined, { modalita: 'modifica' })
  await pausa()
  assert.equal(finto.avvii.length, 2, 'la figlia è partita')
  assert.equal(finto.avvii[1].livelloAccesso, 'accesso-pieno', 'D1: la figlia segue la fiducia della cartella di partenza della madre, mai la radice')
  assert.equal(finto.avvii[1].permessi, 'Full access')
})

test('D1 LA NIPOTE (mutante M6) — la figlia nella cartella della madre delega a sua volta senza cartella: anche la nipote segue la cartella di partenza, mai la radice', async (t) => {
  const progetto = cartellaTemp('talos-giro2-d1n-')
  const store = fiduciaVera()
  await store.imposta(progetto, true)
  const finto = modelloFinto()
  const registro = registroConElenco(t, { progetto, store, finto })
  const madre = registro.avviaLibero({ cartellaId: '0', consegna: 'dividi e delega', permessi: 'Full access' })
  assert.ok(madre.sessionId, madre.erroreAvvio)
  void finto.avvii[0].onDelega('scrivi la parte 1', undefined, { modalita: 'modifica' })
  await pausa()
  assert.equal(typeof finto.avvii[1]?.onDelega, 'function', 'premessa: la figlia può delegare')
  void finto.avvii[1].onDelega('scrivi la parte 1a', undefined, { modalita: 'modifica' })
  await pausa()
  assert.equal(finto.avvii.length, 3, 'la nipote è partita')
  assert.equal(finto.avvii[2].cartella, parsePath(progetto).root, 'premessa: la nipote lavora dove lavora la madre')
  assert.equal(finto.avvii[2].livelloAccesso, 'accesso-pieno', 'la fiducia della nipote segue la cartella di partenza della madre')
})

test('D1 AL CONTRARIO — progetto MAI chiesto: la madre è trattenuta e la figlia non sale sopra di lei; una figlia mandata in una cartella mai chiesta fuori dal progetto resta trattenuta', async (t) => {
  const progetto = cartellaTemp('talos-giro2-d1b-')
  const fuori = cartellaTemp('talos-giro2-d1b-fuori-')
  const store = fiduciaVera()
  {
    const finto = modelloFinto()
    const registro = registroConElenco(t, { progetto, store, finto })
    registro.avviaLibero({ cartellaId: '0', consegna: 'delega', permessi: 'Full access' })
    assert.equal(finto.avvii[0].livelloAccesso, 'su-richiesta', 'premessa: madre trattenuta')
    void finto.avvii[0].onDelega('parte 1', undefined, { modalita: 'modifica' })
    await pausa()
    assert.notEqual(finto.avvii[1].livelloAccesso, 'accesso-pieno', 'la figlia non è più libera della madre')
  }
  await store.imposta(progetto, true)
  {
    const finto = modelloFinto()
    const registro = registroConElenco(t, { progetto, store, finto })
    registro.avviaLibero({ cartellaId: '0', consegna: 'delega', permessi: 'Full access' })
    void finto.avvii[0].onDelega('parte fuori', fuori, { modalita: 'modifica' })
    await pausa()
    assert.equal(finto.avvii[1].cartella, fuori)
    assert.equal(finto.avvii[1].livelloAccesso, 'su-richiesta', 'una cartella mai chiesta fuori dal progetto non eredita il Sì del progetto')
  }
})

/* ── il piano ─────────────────────────────────────────────────────────────────────────────────────────────── */
const PIANO = '## Piano\n1. Leggo `a.txt`.\n2. Scrivo `b.txt`.'
const STORIA = [{ role: 'user', content: 'pianifica' },
  { role: 'assistant', content: '', tool_calls: [{ id: 'call_piano', type: 'function', function: { name: 'present_plan', arguments: JSON.stringify({ plan: PIANO }) } }] }]
function bancoPiano(t, store, cartella) {
  const giri = []
  const registro = createSessionRegistry({ cartellaStore: cartellaTemp('talos-giro2-piano-store-'), modello: 'm', chiave: 'k',
    guardaWorkspaceFn: () => () => {}, cartellaEsisteFn: () => true, ...opzioniFiduciaPerIlRegistro(store),
    preparaEsecuzioneFn: (id) => ({ cartella, comandoProva: null, task: { id, consegna: 'pianifica' } }),
    avviaSessioneFn: (input) => { giri.push(input); input.onEvento({ type: 'RunStarted', threadId: 't', runId: 'r' }); return new Promise(() => {}) } })
  t.after(() => registro.chiudi())
  return { registro, giri }
}
async function approva(registro, giri, sessionId, decisione = 'procedi-accetta-modifiche') {
  const attesa = giri.at(-1).presentaPianoFn({ plan: PIANO, toolCallId: 'call_piano', messaggi: STORIA })
  const proposta = registro.esporta(sessionId).eventi.filter((e) => e.name === 'talos.plan').at(-1).value
  assert.deepEqual(await registro.rispondiPiano(sessionId, { requestId: proposta.requestId, decisione, hash: proposta.hash }), { ok: true })
  return attesa
}

test('D5 ROSSA — chat trattenuta in attesa della fiducia: «Procedi accettando le modifiche» non fa sparire la domanda e il livello resta quello trattenuto finché la persona risponde', async (t) => {
  const cartella = cartellaTemp('talos-giro2-d5-')
  const store = fiduciaVera()
  const { registro, giri } = bancoPiano(t, store, cartella)
  const { sessionId } = registro.avvia('a', { modalitaOperativaScelta: 'piano', permessiScelto: 'Full access' })
  assert.equal(registro.impostazioniCorrenti(sessionId).fiduciaDaChiedere, true, 'premessa: trattenuta, in attesa della risposta')
  const scelta = await approva(registro, giri, sessionId)
  const ist = registro.impostazioniCorrenti(sessionId)
  assert.equal(ist.permessi, 'On request', 'il livello trattenuto, non «Workspace write»')
  assert.equal(scelta.livelloAccesso, 'su-richiesta')
  assert.equal(ist.fiduciaDaChiedere, true, 'la domanda resta')
  await store.imposta(cartella, true)
  assert.deepEqual(registro.riapplicaFiducia().cambiate, [sessionId])
  assert.equal(registro.impostazioniCorrenti(sessionId).permessi, 'Full access', 'il Sì dato dopo rimette l\'Accesso pieno scelto (decisione del 27/10)')
})

test('LA VIA DEL PIANO — la fiducia tolta mentre il piano aspetta (cartella tornata «mai chiesta»): il piano approvato non porta l\'Accesso pieno e la domanda arriva', async (t) => {
  const cartella = cartellaTemp('talos-giro2-piano-')
  const store = fiduciaVera()
  await store.imposta(cartella, true)
  const { registro, giri } = bancoPiano(t, store, cartella)
  const { sessionId } = registro.avvia('a', { modalitaOperativaScelta: 'piano', permessiScelto: 'Full access' })
  assert.equal(registro.impostazioniCorrenti(sessionId).permessi, 'Full access', 'premessa: fidata')
  await store.imposta(cartella, null)
  const scelta = await approva(registro, giri, sessionId)
  assert.equal(scelta.livelloAccesso, 'su-richiesta')
  assert.equal(registro.impostazioniCorrenti(sessionId).fiduciaDaChiedere, true)
})

/* ── la giunzione ─────────────────────────────────────────────────────────────────────────────────────────── */
test('LA VIA DELLA GIUNZIONE ROSSA — una cartella mai chiesta raggiunta da un collegamento dentro una cartella fidata non eredita il Sì; il Sì alla cartella vera vale anche dal collegamento', async (t) => {
  const fidata = cartellaTemp('talos-giro2-fidata-')
  const vera = cartellaTemp('talos-giro2-vera-')
  const collegamento = join(fidata, 'collegamento')
  try { symlinkSync(vera, collegamento, 'junction') } catch (e) { t.skip(`collegamento non creato: ${e?.code}`); return }
  const store = fiduciaVera()
  await store.imposta(fidata, true)
  assert.equal(store.stato(collegamento), null, 'la cartella vera non è mai stata chiesta: il collegamento non le presta il Sì della cartella che lo contiene')
  const finto = modelloFinto()
  const registro = registroConElenco(t, { progetto: fidata, store, finto })
  const { sessionId } = registro.avviaLibero({ cartellaLibera: collegamento, consegna: 'lavora', permessi: 'Full access' })
  assert.equal(finto.avvii[0].livelloAccesso, 'su-richiesta')
  assert.equal(registro.impostazioniCorrenti(sessionId).fiduciaDaChiedere, true)
  await store.imposta(collegamento, true) // la persona risponde dalla chat aperta sul collegamento
  assert.equal(store.stato(vera), true, 'la risposta vale per la cartella vera')
  assert.deepEqual(registro.riapplicaFiducia().cambiate, [sessionId])
  await store.imposta(vera, false)
  assert.equal(store.stato(collegamento), false, 'e un No alla cartella vera vale anche dal collegamento')
})

/* ── lo stato vero detto alla persona e al modello ───────────────────────────────────────────────────────── */
function bancoImpostazioni(t, store, cartella) {
  const note = []
  const corse = []
  let registro = null
  const servizio = creaServizioImpostazioni({ fonti: { sessione: creaFonteSessione(() => registro) }, copiaFinestra: creaCopiaFinestra(), attesaFinestraMs: 20,
    annotaPerIlModelloFn: (id, testo) => { note.push(testo); registro.annotaCambioDellaPersona(id, testo) } })
  registro = createSessionRegistry({ cartellaStore: cartellaTemp('talos-giro2-imp-store-'), modello: 'm', chiave: 'k', guardaWorkspaceFn: () => () => {}, cartellaEsisteFn: () => true,
    ...opzioniFiduciaPerIlRegistro(store),
    preparaEsecuzioneFn: (id) => ({ cartella, comandoProva: null, task: { id, consegna: 'Verifica.' } }),
    avviaSessioneFn: async (input) => { corse.push(input); input.onEvento({ type: 'RunStarted' }); input.onEvento({ type: 'RunFinished' })
      return { ok: true, esito: { ...finito, messaggiFinali: [{ role: 'user', content: 'Verifica.' }, { role: 'assistant', content: 'ok' }] } } } })
  t.after(() => registro.chiudi())
  return { servizio, registro: () => registro, note, corse }
}
const notaAlModello = (input) => (input.messaggiIniziali ?? []).filter((m) => m.talosOrigin === 'settings-notice').map((m) => m.content).join('\n')

test('D4 ROSSA — `/settings` della persona su una cartella mai chiesta: la ricevuta e la nota al modello dicono lo stato vero (trattenuto, per ora Chiede prima)', async (t) => {
  const cartella = cartellaTemp('talos-giro2-d4-')
  const store = fiduciaVera()
  const b = bancoImpostazioni(t, store, cartella)
  const { sessionId } = b.registro().avvia('a', { permessiScelto: 'Workspace write' })
  await pausa()
  const esito = await b.servizio.applicaDallaPersona({ sessionId, changes: [{ key: 'conversation.permissions', value: 'fullAccess' }], origine: { tipo: 'persona' } })
  assert.equal(b.registro().impostazioniCorrenti(sessionId).permessi, 'On request', 'premessa: trattenuto')
  const cambio = esito.cambi.find((c) => c.chiave === 'conversation.permissions')
  assert.equal(cambio.dopo, 'fullAccess', 'la scelta della persona resta quella (l\'Annulla la rimette)')
  assert.deepEqual(cambio.trattenuto, { motivo: 'fiducia-da-chiedere', vale: 'onRequest' }, 'la ricevuta dice il modo vero')
  assert.match(b.note.at(-1), /fullAccess/u)
  assert.match(b.note.at(-1), /held/u, 'la nota al modello non dice più solo «→ fullAccess»')
  assert.match(b.note.at(-1), /onRequest/u)
})

test('D4 ROSSA — l\'attrezzo del modello (`app_settings set`) su una cartella mai chiesta: la risposta dice che l\'Accesso pieno è trattenuto', async (t) => {
  const cartella = cartellaTemp('talos-giro2-d4m-')
  const store = fiduciaVera()
  const b = bancoImpostazioni(t, store, cartella)
  const { sessionId } = b.registro().avvia('a', { permessiScelto: 'Workspace write' })
  await pausa()
  const attrezzo = b.servizio.perLaSessione({ sessionId })
  const lista = await attrezzo('app_settings', { action: 'list', section: 'conversation' })
  const revisione = Number(/Revision (\d+)/u.exec(lista.testo)?.[1])
  const r = await attrezzo('app_settings', { action: 'set', expected_revision: revisione, changes: [{ key: 'conversation.permissions', value: 'fullAccess' }] }, { fase: 'esegui' })
  assert.equal(r.ok, true, r.testo)
  assert.match(r.testo, /held/u, r.testo)
  assert.match(r.testo, /onRequest/u)
})

test('(b) ROSSA — il modello riceve lo stato vero col messaggio dopo: in attesa, poi Sì (Accesso pieno), e per un\'altra chat il No (resta Chiede prima)', async (t) => {
  const cartella = cartellaTemp('talos-giro2-b-')
  const store = fiduciaVera()
  const b = bancoImpostazioni(t, store, cartella)
  const r = b.registro()
  const { sessionId } = r.avvia('a', { permessiScelto: 'Workspace write' })
  await pausa()
  await r.aggiornaImpostazioni(sessionId, { permessi: 'Full access' }) // dalla pillola: nessuna ricevuta
  await r.resume(sessionId, 'vai')
  await pausa()
  assert.match(notaAlModello(b.corse.at(-1)), /waiting for the person's answer/u, 'in attesa: il modello lo sa')
  assert.match(notaAlModello(b.corse.at(-1)), /On request/u)
  await r.resume(sessionId, 'ancora')
  await pausa()
  assert.equal(notaAlModello(b.corse.at(-1)), '', 'detto una volta, non a ogni messaggio')
  await store.imposta(cartella, true)
  r.riapplicaFiducia()
  await r.resume(sessionId, 'e ora')
  await pausa()
  assert.equal(b.corse.at(-1).livelloAccesso, 'accesso-pieno')
  assert.match(notaAlModello(b.corse.at(-1)), /trusts this folder: Full access is on/u, 'dopo il Sì il modello sa che l\'Accesso pieno c\'è')

  const altra = cartellaTemp('talos-giro2-b-no-')
  const c = bancoImpostazioni(t, store, altra)
  const rc = c.registro()
  const s2 = rc.avvia('x', { permessiScelto: 'Full access' }).sessionId
  await pausa()
  await store.imposta(altra, false)
  rc.riapplicaFiducia()
  await rc.resume(s2, 'vai')
  await pausa()
  assert.equal(c.corse.at(-1).livelloAccesso, 'su-richiesta')
  assert.match(notaAlModello(c.corse.at(-1)), /does not trust this folder/u, 'dopo il No il modello sa che resta Chiede prima')
})

/* ── (2) le automazioni ──────────────────────────────────────────────────────────────────────────────────── */
function bancoAutomazioni(t, store) {
  const corse = []
  const notifiche = creaRegistroNotifiche({ file: join(cartellaTemp('talos-giro2-notifiche-'), 'notifiche.jsonl') })
  const registro = createSessionRegistry({ cartellaStore: cartellaTemp('talos-giro2-auto-store-'), modello: 'm', chiave: 'k', guardaWorkspaceFn: () => () => {},
    ...opzioniFiduciaPerIlRegistro(store), osservatoreNotifiche: creaScrittoriNotifiche({ registro: notifiche }),
    avviaSessioneFn: async (input) => { corse.push(input); input.onEvento({ type: 'RunStarted' }); return new Promise(() => {}) } })
  t.after(() => registro.chiudi())
  let n = 0
  const giro = (automazioneId, cartella) => registro.avviaGiroAutomazione({ automazioneId, runId: `r${++n}`, cartella, consegna: 'Riordina.', titolo: `Riordino ${automazioneId}`, permessi: 'Full access' })
  const avvisi = async () => (await notifiche.elenco({ dopo: 0 })).voci.filter((v) => v.fatto === 'fiducia-cartella')
  /* le scritture del registro delle notifiche vanno in coda sul disco: si aspetta che la condizione si avveri (al più 3 s), mai a tempo fisso */
  const finche = async (cond) => { for (let i = 0; i < 150; i += 1) { const v = await avvisi(); if (cond(v)) return v; await pausa(20) } return avvisi() }
  return { registro, corse, notifiche, giro, avvisi, finche }
}

test('(2) ROSSA — automazione in Accesso pieno su una cartella mai chiesta: gira in Chiede prima, UN avviso per cartella (mai uno per giro), il Sì porta il giro dopo in Accesso pieno', async (t) => {
  const cartella = cartellaTemp('talos-giro2-auto-')
  const store = fiduciaVera()
  const b = bancoAutomazioni(t, store)
  const primo = b.giro('a1', cartella)
  assert.ok(primo.sessionId, primo.erroreAvvio)
  await pausa()
  assert.equal(b.corse[0].livelloAccesso, 'su-richiesta', 'finché la persona non risponde, come oggi')
  let avvisi = await b.finche((v) => v.length > 0)
  assert.equal(avvisi.length, 1, 'l\'avviso c\'è: non in silenzio')
  assert.deepEqual(avvisi[0].porta, { tipo: 'sessione', id: primo.sessionId }, 'apre la conversazione del giro, dove c\'è la carta «Sì, mi fido di questa cartella»')
  assert.equal(avvisi[0].stato.risolto, false)
  assert.ok((await b.notifiche.elenco({ dopo: 0 })).totaleDaFare >= 1, 'aspetta la persona: sta in «Da fare»')
  const seq = avvisi[0].seq
  b.giro('a1', cartella); b.giro('a2', cartella) // un altro giro e un'altra automazione sulla stessa cartella
  await pausa(300)
  avvisi = await b.avvisi()
  assert.equal(avvisi.length, 1, 'UNA volta per cartella')
  assert.equal(avvisi[0].seq, seq, 'nemmeno riscritto: niente avviso nuovo sul telefono')
  await store.imposta(cartella, true) // «Mi fido di questa cartella»
  b.registro.riapplicaFiducia()
  assert.equal(b.registro.impostazioniCorrenti(primo.sessionId).permessi, 'Full access', 'anche il giro trattenuto, ancora aperto, torna in Accesso pieno')
  assert.equal((await b.finche((v) => v[0]?.stato.risolto))[0].stato.risolto, true, 'risposto: esce da «Da fare»')
  b.giro('a1', cartella)
  await pausa()
  assert.equal(b.corse.at(-1).livelloAccesso, 'accesso-pieno', 'dopo il Sì il giro dopo è in Accesso pieno')
  assert.equal((await b.avvisi()).length, 1)
})

test('(2) ROSSA — il No resta un No: niente avviso nuovo, i giri restano in Chiede prima', async (t) => {
  const cartella = cartellaTemp('talos-giro2-auto-no-')
  const store = fiduciaVera()
  const b = bancoAutomazioni(t, store)
  b.giro('a1', cartella)
  await pausa()
  assert.equal((await b.finche((v) => v.length > 0)).length, 1)
  await store.imposta(cartella, false)
  b.registro.riapplicaFiducia()
  assert.equal((await b.finche((v) => v[0]?.stato.risolto))[0].stato.risolto, true, 'risposto col No')
  b.giro('a1', cartella)
  await pausa(300)
  assert.equal(b.corse.at(-1).livelloAccesso, 'su-richiesta')
  const avvisi = await b.avvisi()
  assert.equal(avvisi.length, 1, 'nessun avviso nuovo dopo il No')
  assert.equal(avvisi[0].stato.risolto, true)
})

test('(2) AL CONTRARIO — cartella fidata, o automazione non in Accesso pieno: nessun avviso', async (t) => {
  const fidata = cartellaTemp('talos-giro2-auto-si-')
  const mai = cartellaTemp('talos-giro2-auto-ww-')
  const store = fiduciaVera()
  await store.imposta(fidata, true)
  const b = bancoAutomazioni(t, store)
  b.giro('a1', fidata)
  b.registro.avviaGiroAutomazione({ automazioneId: 'a3', runId: 'rx', cartella: mai, consegna: 'x', permessi: 'Workspace write' })
  await pausa(300)
  assert.equal(b.corse[0].livelloAccesso, 'accesso-pieno')
  assert.equal((await b.avvisi()).length, 0)
})

/* ── D2: il telefono collegato al PC ────────────────────────────────────────────────────────────────────── */
test('D2 ROSSA — il telefono collegato vede la trattenuta (istantanea e riga dell\'elenco) e risponde «Mi fido di questa cartella»: l\'Accesso pieno torna', async (t) => {
  const progetto = cartellaTemp('talos-giro2-tel-')
  const store = fiduciaVera()
  const registro = createSessionRegistry({ cartellaStore: cartellaTemp('talos-giro2-tel-store-'), modello: 'm', chiave: 'k', guardaWorkspaceFn: () => () => {}, cartellaEsisteFn: () => true,
    ...opzioniFiduciaPerIlRegistro(store),
    cartelleProgetto: [{ id: '0', percorso: progetto, nome: 'progetto' }],
    preparaEsecuzioneLiberaFn: (cartelle, { cartellaId, cartellaLibera, consegna }) => ({ cartella: cartellaLibera ?? cartelle.find((c) => c.id === cartellaId).percorso, comandoProva: null, task: { consegna, consegnaCorta: consegna } }),
    avviaSessioneFn: async (input) => { input.onEvento({ type: 'RunStarted' }); input.onEvento({ type: 'RunFinished' })
      return { ok: true, esito: { ...finito, messaggiFinali: [{ role: 'user', content: 'Verifica.' }, { role: 'assistant', content: 'ok' }] } } } })
  t.after(() => registro.chiudi())
  const httpApp = createHttpApp({ senzaGettone: 'prove', staticHandler: async () => null, sessionRegistry: registro, fiduciaCartelle: store })
  const operazioni = creaOperazioni({ chiama: creaChiamataInterna({ httpApp, porta: 4999 }), sessionRegistry: registro, iscriviConRigiocata })
  const contesto = { dispositivo: { id: 'disp-1', nome: 'Pad' }, iscrizioni: new Map(), iscrivi: () => async () => {} }
  /* la via del telefono: la chat nasce con `cartellaId` (`remoto/operazioni.mjs`, `session.start`) */
  const avvio = await operazioni.esegui('session.start', { corpo: { cartellaId: '0', consegna: 'ciao', permessi: 'Workspace write' } }, contesto)
  const sessionId = avvio.sessionId
  assert.ok(sessionId)
  await pausa()
  const cambio = await operazioni.esegui('session.settings', { sessionId, corpo: { permessi: 'Full access' } }, contesto)
  assert.equal(cambio.istantanea.permessi, 'On request', 'trattenuto anche dal telefono')
  assert.equal(cambio.istantanea.fiduciaDaChiedere, true, 'il telefono vede la trattenuta, non solo il PC')
  const elenco = await operazioni.esegui('sessions.list', {}, contesto)
  assert.equal((elenco.items ?? elenco).find((s) => s.sessionId === sessionId)?.fiduciaDaChiedere, true)
  const risposta = await operazioni.esegui('session.folder-trust', { sessionId, fidata: true }, contesto)
  assert.equal(risposta.fidata, true)
  assert.equal(store.stato(progetto), true, 'risponde per la cartella di quella conversazione')
  assert.equal(registro.impostazioniCorrenti(sessionId).permessi, 'Full access', 'dal telefono il Sì rimette l\'Accesso pieno')
  /* mai un percorso scelto dal telefono: solo la cartella della conversazione */
  await assert.rejects(operazioni.esegui('session.folder-trust', { sessionId, fidata: true, cartellaLibera: 'C:\\' }, contesto), (e) => e.code === 'BAD_MESSAGE')
  await assert.rejects(operazioni.esegui('session.folder-trust', { sessionId, fidata: 'si' }, contesto), (e) => e.code === 'BAD_MESSAGE')
  /* un «No» già dato lo cambia solo il PC (ELENCO-AZIONI §7.3: il «Sì» dopo un «No» riaccende ganci e strumenti) */
  await store.imposta(progetto, false)
  registro.riapplicaFiducia()
  const dopoIlNo = await operazioni.esegui('session.folder-trust', { sessionId, fidata: true }, contesto)
  assert.equal(dopoIlNo.fidata, false, 'il telefono riceve il No vero')
  assert.equal(store.stato(progetto), false, 'e non lo rovescia')
})

test('VIVA-01 ROSSA (controllore, a) — due finestre sulla stessa carta: il «Sì» di una, poi il «No» tardivo dell\'altra (la carta manda `soloSeMaiChiesta`): il «No» non rovescia il «Sì»', async (t) => {
  const progetto = cartellaTemp('talos-giro2-viva-')
  const store = fiduciaVera()
  const finto = modelloFinto()
  const registro = registroConElenco(t, { progetto, store, finto })
  const { sessionId } = registro.avviaLibero({ cartellaLibera: progetto, consegna: 'x', permessi: 'Full access' })
  await pausa()
  const httpApp = createHttpApp({ senzaGettone: 'prove', staticHandler: async () => null, sessionRegistry: registro, fiduciaCartelle: store })
  const chiama = creaChiamataInterna({ httpApp, porta: 4998 })
  const carta = (fidata) => chiama({ metodo: 'POST', percorso: '/api/v1/folder-trust', corpo: { sessionId, fidata, soloSeMaiChiesta: true } }).then((r) => r.dati)
  const primo = await carta(true)
  assert.equal(primo.fidata, true)
  const tardivo = await carta(false)
  assert.equal(tardivo.fidata, true, 'la risposta dice la decisione vera, già data')
  assert.equal(store.stato(progetto), true, 'il «Sì» resta')
  assert.equal(registro.impostazioniCorrenti(sessionId).permessi, 'Full access')
  /* la voce del velo («Fidati di questa cartella») resta un cambio voluto: senza la bandiera scrive sempre */
  await store.imposta(progetto, false)
  const voce = await chiama({ metodo: 'POST', percorso: '/api/v1/folder-trust', corpo: { sessionId, fidata: true } }).then((r) => r.dati)
  assert.equal(voce.fidata, true)
  /* la bandiera vuole `true` esatto: la via HTTP (`chiama`, non `operazioni.esegui`) rifiuta il corpo con 400 QUERY_INVALID, misurato dal vivo il 12/11 */
  await assert.rejects(chiama({ metodo: 'POST', percorso: '/api/v1/folder-trust', corpo: { sessionId, fidata: true, soloSeMaiChiesta: 'si' } }),
    (e) => e.code === 'QUERY_INVALID' && e.stato === 400)
})

test('PERCORSO LUNGO ROSSA (controllore, c) — una cartella fidata data col prefisso lungo di Windows non si richiede', { skip: process.platform !== 'win32' && 'solo Windows' }, async () => {
  const LUNGO = '\\\\?\\' // il prefisso dei percorsi lunghi
  const cartella = cartellaTemp('talos-giro2-lungo-')
  const store = creaFiduciaCartelle({ file: join(cartellaTemp('talos-giro2-lungo-f-'), 'f.json'), avvisa: () => {}, piattaforma: 'win32' })
  await store.imposta(cartella, true)
  assert.equal(store.stato(`${LUNGO}${cartella}`), true)
  assert.equal(store.stato(`${LUNGO}${cartella.toUpperCase()}`), true)
  await store.imposta(`${LUNGO}${cartella}`, false)
  assert.equal(store.stato(cartella), false, 'una cartella sola, non due voci')
  /* anche senza leggere il disco (cartella che non c'è più, o il percorso vero non leggibile): la chiave toglie il prefisso */
  const cieco = creaFiduciaCartelle({ file: join(cartellaTemp('talos-giro2-lungo-g-'), 'f.json'), avvisa: () => {}, piattaforma: 'win32',
    percorsoVeroFn: () => { throw Object.assign(new Error('no'), { code: 'ENOENT' }) } })
  await cieco.imposta('C:\\progetti\\via', true)
  assert.equal(cieco.stato(`${LUNGO}C:\\progetti\\via`), true)
  assert.equal(cieco.stato(`${LUNGO}UNC\\server\\quota\\x`), null)
  await cieco.imposta('\\\\server\\quota\\x', false)
  assert.equal(cieco.stato(`${LUNGO}UNC\\server\\quota\\x`), false, 'il prefisso lungo di una rete è la stessa cartella di rete')
})

test('LA CHIAMATA D\'ATTREZZO (mutanti C1 e C5 del controllore) — la risposta tolta a giro in corso (cartella tornata «mai chiesta»): dal comando dopo la radice lavora in Chiede prima', async (t) => {
  const progetto = cartellaTemp('talos-giro2-attrezzo-')
  const store = fiduciaVera()
  await store.imposta(progetto, true)
  const finto = modelloFinto()
  const registro = registroConElenco(t, { progetto, store, finto })
  const { sessionId } = registro.avviaLibero({ cartellaLibera: progetto, consegna: 'x', permessi: 'Full access' })
  assert.ok(sessionId)
  await pausa()
  const corrente = () => finto.avvii[0].input.permessiCorrentiFn().livelloAccesso
  assert.equal(corrente(), 'accesso-pieno', 'premessa: cartella fidata')
  await store.imposta(progetto, null) // tolta da fuori (un altro processo sullo stesso file): nessuno chiama riapplicaFiducia
  assert.equal(corrente(), 'su-richiesta', '«mai chiesta» non concede l\'Accesso pieno nemmeno alla chiamata d\'attrezzo')
  await store.imposta(progetto, true)
  assert.equal(corrente(), 'accesso-pieno', 'e nei due versi')
})

test('LA DOMANDA SOLO PER LA CARTELLA MAI CHIESTA (mutante C12 del controllore) — risposto da fuori, prima della riapplicazione: l\'istantanea non chiede più', async (t) => {
  const progetto = cartellaTemp('talos-giro2-c12-')
  const store = fiduciaVera()
  const finto = modelloFinto()
  const registro = registroConElenco(t, { progetto, store, finto })
  const { sessionId } = registro.avviaLibero({ cartellaLibera: progetto, consegna: 'x', permessi: 'Full access' })
  await pausa()
  assert.equal(registro.impostazioniCorrenti(sessionId).fiduciaDaChiedere, true, 'premessa: trattenuta, la domanda c\'è')
  for (const risposta of [true, false]) {
    await store.imposta(progetto, risposta) // da fuori: nessuno ha ancora chiamato riapplicaFiducia
    assert.notEqual(registro.impostazioniCorrenti(sessionId).fiduciaDaChiedere, true, `con la risposta ${risposta} la carta non si chiede più`)
  }
})
