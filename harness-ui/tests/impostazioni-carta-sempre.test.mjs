/*
 * Revisione avversaria della fase 8, REV8-01 (S2, nucleo condiviso; OK di CLI, Mobile e Performance con le loro condizioni). Un modello
 *   LOCALE che scrive come TESTO una chiamata con la carta SEMPRE (`app_settings` di sicurezza o aggiornamenti, D3 e D7;
 *   `remote_phone_pair`; `chatgpt_account`): dopo il sì alla carta «chiamata-dal-testo», `chiediConUnSiSolo` rispondeva sì da sé anche
 *   alla carta sempre, perché la sua azione non portava nessun segno di carta forzata. La persona non vedeva mai l'avvertenza né le righe
 *   prima → dopo, e la ricevuta scriveva `confermatoDa: null`.
 * Cura: un segno INTERNO sull'azione (`CARTA_SEMPRE`, un simbolo: non viaggia negli eventi né nel `pending` — JSON.stringify e
 *   structuredClone saltano le chiavi simbolo, ricerca del 01/11/2026 — quindi nessun campo nuovo nel contratto) messo in
 *   `SEGNI_DI_CARTA_FORZATA`. Le condizioni delle sessioni, ognuna con la sua prova:
 *   · Performance — dopo il sì alla carta del testo, una carta NORMALE riceve ancora il sì da sola (CS-02);
 *   · Mobile — il «sì solo» non copre mai una carta sempre, nemmeno col sì del telefono attraverso il ponte (CS-R3);
 *   · Mobile — con una carta mostrata `confermatoDa` non è mai null nella ricevuta (CS-R3, CS-R4);
 *   · CLI — un sì AUTOMATICO (una regola, la modalità, il classificatore: `kernel-runs.ts:98`) su una carta sempre il registro lo
 *     rifiuta: la carta resta «nessuno a cui chiedere» e il giro prosegue col no (CS-R1); al contrario, una regola allow su
 *     `remote_phone_pair` non apre nessun abbinamento (CS-R2).
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as nucleo from '../src/kernel/talosHarness.mjs'
import { createSessionRegistry } from '../src/session-registry.mjs'
import { attendiScritture } from '../src/session-store.mjs'
import { createHttpApp } from '../src/http-app.mjs'
import { creaServizioImpostazioni } from '../src/impostazioni/servizio-impostazioni.mjs'
import { creaFonteSessione } from '../src/impostazioni/fonti-impostazioni.mjs'
import { creaChiamataInterna } from '../src/remoto/chiamata-interna.mjs'
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs'

const { talosLavora, chiediConUnSiSolo } = nucleo
/* letto dal modulo e col nome globale del simbolo: la prova si carica anche sul nucleo di PRIMA della cura, e si vede rossa */
const CARTA_SEMPRE = nucleo.CARTA_SEMPRE ?? Symbol.for('talos.cartaSempre')
const LOCALE = 'ollama:llama3'
const enc = new TextEncoder()
const testoInFlusso = (testo) => new Response(new ReadableStream({
  start(c) {
    for (let i = 0; i < testo.length; i += 7) c.enqueue(enc.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: testo.slice(i, i + 7) } }] })}\n\n`))
    c.enqueue(enc.encode(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }] })}\n\n`))
    c.enqueue(enc.encode('data: [DONE]\n\n'))
    c.close()
  },
}))
const chiamataInFlusso = (id, nome, argomenti) => new Response(new ReadableStream({
  start(c) {
    c.enqueue(enc.encode(`data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, id, function: { name: nome, arguments: JSON.stringify(argomenti) } }] } }] })}\n\n`))
    c.enqueue(enc.encode('data: [DONE]\n\n'))
    c.close()
  },
}))
const codaDiTesto = (nome, argomenti) => `Lo faccio:<tool_call>${JSON.stringify({ name: nome, arguments: argomenti })}</tool_call>`
const pausa = (ms = 10) => new Promise((r) => setTimeout(r, ms))

/* Un ospite finto per gli attrezzi del ramo «anteprima, carta, esegui»: annota le fasi e dà la carta che darebbe quello vero. */
function ospite(azioneDellaCarta) {
  const fasi = []
  const fn = async (nome, argomenti, opzioni) => {
    fasi.push({ nome, azione: argomenti?.action, fase: opzioni?.fase })
    if (opzioni?.fase === 'anteprima') return { ok: true, carta: true, azione: azioneDellaCarta }
    return { ok: true, testo: `${nome} done.` }
  }
  return { fn, fasi }
}
const cartaImpostazioni = (gruppo) => ({ tipo: 'app_settings', azione: 'set', dove: 'pc', cambi: [{ chiave: 'x', prima: 'a', dopo: 'b', gruppo }] })

/* Il giro del nucleo con un modello locale che scrive UNA chiamata come testo; la persona dice sì a ogni carta. */
async function giroDalTesto({ nome, argomenti, livello = 'scrittura-progetto', opzioniOspite }) {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-carta-sempre-'))
  const chieste = []
  let i = 0
  try {
    await talosLavora({
      cartella, task: { consegna: 'x' }, modello: LOCALE, chiave: 'finta', livelloAccesso: livello, strumentiEstesi: [nome],
      personaPresenteFn: () => true, promuoviDalTesto: true, onDelta: () => {}, ...opzioniOspite,
      chiediApprovazioneFn: async (a) => { chieste.push(a); return true },
      fetchDiRete: async () => testoInFlusso(i++ === 0 ? codaDiTesto(nome, argomenti) : 'Fatto.'),
    })
  } finally { rimuoviCartellaDiProva(cartella) }
  return chieste
}

for (const livello of ['accesso-pieno', 'scrittura-progetto']) {
  test(`CS-01 [${livello}] app_settings di SICUREZZA scritta come testo: dopo la carta del testo arriva alla persona anche la carta sempre`, async () => {
    const o = ospite(cartaImpostazioni('sicurezza'))
    const chieste = await giroDalTesto({ nome: 'app_settings', livello, opzioniOspite: { onImpostazioniFn: o.fn },
      argomenti: { action: 'set', changes: [{ key: 'conversation.permissions', value: 'fullAccess' }], expected_revision: 10000 } })
    assert.deepEqual(chieste.map((a) => a.tipo), ['chiamata-dal-testo', 'app_settings'], `carte mostrate: ${JSON.stringify(chieste.map((a) => a.tipo))}`)
    assert.equal(chieste[1][CARTA_SEMPRE], true, 'la carta sempre porta il suo segno')
    assert.ok(o.fasi.some((f) => f.fase === 'esegui'), 'col sì della persona il cambio parte')
  })
}

test('CS-01b app_settings degli AGGIORNAMENTI (D7) scritta come testo: anche lei arriva alla persona', async () => {
  const o = ospite(cartaImpostazioni('aggiornamenti'))
  const chieste = await giroDalTesto({ nome: 'app_settings', livello: 'accesso-pieno', opzioniOspite: { onImpostazioniFn: o.fn },
    argomenti: { action: 'set', changes: [{ key: 'updates.automatic', value: false }], expected_revision: 10000 } })
  assert.deepEqual(chieste.map((a) => a.tipo), ['chiamata-dal-testo', 'app_settings'])
})

test('CS-02 (Performance) dopo il sì alla carta del testo una carta NORMALE riceve ancora il sì da sola: una carta sola alla persona', async () => {
  const o = ospite(cartaImpostazioni('costo'))
  const chieste = await giroDalTesto({ nome: 'app_settings', livello: 'scrittura-progetto', opzioniOspite: { onImpostazioniFn: o.fn },
    argomenti: { action: 'set', changes: [{ key: 'conversation.reasoningEffort', value: 'low' }], expected_revision: 10000 } })
  assert.deepEqual(chieste.map((a) => a.tipo), ['chiamata-dal-testo'], `carte mostrate: ${JSON.stringify(chieste.map((a) => a.tipo))}`)
  assert.ok(o.fasi.some((f) => f.fase === 'esegui'), 'il cambio parte col sì solo')
})

test('CS-03 remote_phone_pair e chatgpt_account scritti come testo: la loro carta sempre arriva alla persona dopo quella del testo', async () => {
  const qr = ospite({ tipo: 'remote_phone_pair', azione: 'pair' })
  const accoppia = await giroDalTesto({ nome: 'remote_phone_pair', livello: 'accesso-pieno', opzioniOspite: { onTelefoniFn: qr.fn }, argomenti: {} })
  assert.deepEqual(accoppia.map((a) => a.tipo), ['chiamata-dal-testo', 'remote_phone_pair'])
  assert.equal(accoppia[1][CARTA_SEMPRE], true)
  const esci = ospite({ tipo: 'chatgpt_account', azione: 'disconnect' })
  const disconnetti = await giroDalTesto({ nome: 'chatgpt_account', livello: 'accesso-pieno', opzioniOspite: { onFornitoriFn: esci.fn }, argomenti: { action: 'disconnect' } })
  assert.deepEqual(disconnetti.map((a) => a.tipo), ['chiamata-dal-testo', 'chatgpt_account'])
  assert.equal(disconnetti[1][CARTA_SEMPRE], true)
})

test('CS-04 il segno: sta fra i segni forzati, non viaggia in JSON, e chiediConUnSiSolo lo manda sempre alla persona; senza segno no', async () => {
  assert.ok(nucleo.SEGNI_DI_CARTA_FORZATA.includes(CARTA_SEMPRE))
  assert.equal(typeof CARTA_SEMPRE, 'symbol')
  const marcata = { tipo: 'remote_phone_pair', toolCallId: 'daTesto-x-1', [CARTA_SEMPRE]: true }
  assert.equal(JSON.stringify(marcata), JSON.stringify({ tipo: 'remote_phone_pair', toolCallId: 'daTesto-x-1' }), 'nessun campo nuovo negli eventi')
  assert.equal(structuredClone(marcata)[CARTA_SEMPRE], undefined)
  assert.equal({ ...marcata }[CARTA_SEMPRE], true, 'una copia in processo (il registro) lo tiene')
  const arrivate = []
  const chiedi = chiediConUnSiSolo(async (a) => { arrivate.push(a); return 'dalla persona' }, new Set(['daTesto-x-1']))
  assert.equal(await chiedi(marcata), 'dalla persona')
  assert.equal(await chiedi({ tipo: 'remote_phone_pair', toolCallId: 'daTesto-x-1' }), true, 'la stessa carta senza il segno: sì da sé')
  assert.equal(arrivate.length, 1)
})

test('CS-05 il segno solo dove la carta è sempre: una chiamata di app_settings fuori dai due gruppi non lo porta', async () => {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-carta-sempre-'))
  const chieste = []
  let i = 0
  const o = ospite(cartaImpostazioni('costo'))
  try {
    await talosLavora({
      cartella, task: { consegna: 'x' }, modello: 'openrouter:z-ai/glm-5.3-flash', chiave: 'finta', livelloAccesso: 'scrittura-progetto', strumentiEstesi: ['app_settings'],
      onImpostazioniFn: o.fn, onDelta: () => {}, chiediApprovazioneFn: async (a) => { chieste.push(a); return true },
      fetchDiRete: async () => (i++ === 0 ? chiamataInFlusso('call-1', 'app_settings', { action: 'set', changes: [{ key: 'conversation.reasoningEffort', value: 'low' }], expected_revision: 10000 })
        : testoInFlusso('Fatto.')),
    })
  } finally { rimuoviCartellaDiProva(cartella) }
  assert.deepEqual(chieste.map((a) => a.tipo), ['app_settings'])
  assert.equal(chieste[0][CARTA_SEMPRE], undefined)
})

/* ── lato registro ── */
function runtimeControllabile() {
  const runs = []
  return { runs, avviaSessioneFn(input) { let resolve; const promise = new Promise((r) => { resolve = r }); runs.push({ input, resolve }); input.onEvento({ type: 'RunStarted', threadId: 't', runId: `r${runs.length}` }); return promise } }
}
async function scena(t, { conImpostazioni = false, ...opzioniRegistro } = {}) {
  const cartellaStore = mkdtempSync(join(tmpdir(), 'talos-carta-sempre-reg-'))
  const progetto = mkdtempSync(join(tmpdir(), 'talos-carta-sempre-prog-'))
  const runtime = runtimeControllabile()
  let registry = null
  const servizio = conImpostazioni ? creaServizioImpostazioni({ fonti: { sessione: creaFonteSessione(() => registry) }, fileRicevute: join(cartellaStore, 'ricevute.json') }) : null
  registry = createSessionRegistry({ promuoviDalTesto: true, cartellaStore, avviaSessioneFn: runtime.avviaSessioneFn,
    preparaEsecuzioneFn: () => ({ cartella: progetto, comandoProva: 'npm test', task: { id: 'task', consegna: 'lavora' } }),
    modello: 'm', chiave: 'k', cartellaEsisteFn: () => true, guardaWorkspaceFn: () => () => {}, ...(servizio ? { impostazioniApp: servizio } : {}), ...opzioniRegistro })
  t.after(async () => {
    await registry.chiudi?.()
    try { await attendiScritture({ cartellaStore }) } catch { /* pulizia comunque */ }
    rimuoviCartellaDiProva(cartellaStore)
    rimuoviCartellaDiProva(progetto)
  })
  const { sessionId } = registry.avvia('task', { permessiScelto: 'Workspace write', modalitaOperativaScelta: 'normale' })
  return { registry, servizio, sessionId, input: runtime.runs[0].input, progetto }
}

for (const motivo of ['regola', 'modalita', 'classificatore']) {
  test(`CS-R1 (CLI) un sì AUTOMATICO («${motivo}») su una carta sempre: il registro lo rifiuta, «nessuno a cui chiedere», col perché per il modello`, { timeout: 5_000 }, async (t) => {
    const { registry, sessionId, input } = await scena(t)
    const eventi = []
    t.after(registry.iscriviti(sessionId, (e) => eventi.push(e)))
    const domanda = input.chiediApprovazioneFn({ tipo: 'remote_phone_pair', toolCallId: 'call-1', [CARTA_SEMPRE]: true })
    await pausa()
    const { requestId } = registry.domandaInAttesa(sessionId)
    assert.deepEqual(registry.rispondiApprovazione(sessionId, requestId, true, { motivo }), { ok: true })
    const risposta = await domanda
    assert.equal(risposta?.approvato, false, `il nucleo riceve un no: ${JSON.stringify(risposta)}`)
    assert.match(String(risposta?.motivo), /person/u)
    const chiusa = eventi.find((e) => e.type === 'ApprovalResolved' && e.requestId === requestId)
    assert.equal(chiusa?.approvato, false)
    assert.equal(chiusa?.motivo, 'nessuna-interfaccia')
    assert.equal(registry.domandaInAttesa(sessionId), null)
  })
}

test('CS-R1b (CLI, controlli positivi) il sì di una persona senza motivo su una carta sempre resta un sì; un sì automatico su una carta normale resta un sì', { timeout: 5_000 }, async (t) => {
  const { registry, sessionId, input } = await scena(t)
  const persona = input.chiediApprovazioneFn({ tipo: 'remote_phone_pair', toolCallId: 'call-1', [CARTA_SEMPRE]: true })
  await pausa()
  registry.rispondiApprovazione(sessionId, registry.domandaInAttesa(sessionId).requestId, true)
  assert.equal(await persona, true, 'la persona nel terminale della CLI risponde senza motivo')
  const regola = input.chiediApprovazioneFn({ tipo: 'shell', comando: 'npm test', toolCallId: 'call-2' })
  await pausa()
  registry.rispondiApprovazione(sessionId, registry.domandaInAttesa(sessionId).requestId, true, { motivo: 'regola' })
  assert.equal(await regola, true, 'una regola dice sì a una carta normale come prima')
})

test('CS-R2 (CLI, al contrario) una regola allow su remote_phone_pair, come in un\'automazione della CLI: nessun abbinamento aperto, il giro prosegue col no', { timeout: 15_000 }, async (t) => {
  const { registry, sessionId, input, progetto } = await scena(t)
  /* come `kernel-runs.ts:98`: ogni carta chiesta riceve il sì della regola */
  t.after(registry.iscriviti(sessionId, (e) => {
    if (e?.type === 'ApprovalRequested') setImmediate(() => registry.rispondiApprovazione(sessionId, e.requestId, true, { motivo: 'regola' }))
  }))
  const qr = ospite({ tipo: 'remote_phone_pair', azione: 'pair' })
  let i = 0
  await talosLavora({
    cartella: progetto, task: { consegna: 'collega il telefono' }, modello: 'openrouter:z-ai/glm-5.3-flash', chiave: 'finta',
    livelloAccesso: 'scrittura-progetto', strumentiEstesi: ['remote_phone_pair'], onTelefoniFn: qr.fn, chiediApprovazioneFn: input.chiediApprovazioneFn,
    onDelta: () => {},
    fetchDiRete: async () => (i++ === 0 ? chiamataInFlusso('call-qr', 'remote_phone_pair', {}) : testoInFlusso('Non posso.')),
  })
  assert.ok(qr.fasi.some((f) => f.fase === 'anteprima'), `premessa: la chiamata è arrivata all'ospite: ${JSON.stringify(qr.fasi)}`)
  assert.equal(qr.fasi.some((f) => f.fase === 'esegui'), false, `l'abbinamento non si apre: ${JSON.stringify(qr.fasi)}`)
  assert.ok(i >= 2, 'il giro è andato avanti dopo il no')
})

/* 02/11/2026 notte (OK di CLI, Mobile e Performance): le cartelle consentite e sbloccate e il controllo remoto entrano nella carta sempre. */
/* argomenti validi per lo schema di ciascuno (talosHarness.mjs, definizioni di remote_control e delle cartelle): con {} la chiamata
   scritta come testo non viene nemmeno riconosciuta, e la prova non direbbe niente */
const ARGOMENTI_VALIDI = {
  remote_phone_folder_allow: { phone: 'pad1', path: 'C:/Users/x/progetto' },
  remote_phone_folder_unblock: { phone: 'pad1', folder: 'c1' },
  remote_control: { on: true },
}
for (const nome of ['remote_phone_folder_allow', 'remote_phone_folder_unblock', 'remote_control']) {
  test(`CS-06 [${nome}] scritto come testo in Accesso pieno: la sua carta arriva alla persona dopo quella del testo, col segno`, async () => {
    const o = ospite({ tipo: nome, azione: 'x' })
    const chieste = await giroDalTesto({ nome, livello: 'accesso-pieno', opzioniOspite: { onTelefoniFn: o.fn }, argomenti: ARGOMENTI_VALIDI[nome] })
    assert.deepEqual(chieste.map((a) => a.tipo), ['chiamata-dal-testo', nome], `carte mostrate: ${JSON.stringify(chieste.map((a) => a.tipo))}`)
    assert.equal(chieste[1][CARTA_SEMPRE], true)
  })
  test(`CS-R2b (CLI, al contrario) [${nome}] una regola allow in un'automazione non lo apre: il giro prosegue col no`, { timeout: 15_000 }, async (t) => {
    const { registry, sessionId, input, progetto } = await scena(t)
    t.after(registry.iscriviti(sessionId, (e) => {
      if (e?.type === 'ApprovalRequested') setImmediate(() => registry.rispondiApprovazione(sessionId, e.requestId, true, { motivo: 'regola' }))
    }))
    const o = ospite({ tipo: nome, azione: 'x' })
    let i = 0
    await talosLavora({
      cartella: progetto, task: { consegna: 'x' }, modello: 'openrouter:z-ai/glm-5.3-flash', chiave: 'finta',
      livelloAccesso: 'scrittura-progetto', strumentiEstesi: [nome], onTelefoniFn: o.fn, chiediApprovazioneFn: input.chiediApprovazioneFn,
      onDelta: () => {},
      fetchDiRete: async () => (i++ === 0 ? chiamataInFlusso('call-r', nome, ARGOMENTI_VALIDI[nome]) : testoInFlusso('Non posso.')),
    })
    assert.ok(o.fasi.some((f) => f.fase === 'anteprima'), `premessa: la chiamata è arrivata all'ospite: ${JSON.stringify(o.fasi)}`)
    assert.equal(o.fasi.some((f) => f.fase === 'esegui'), false, `non si apre: ${JSON.stringify(o.fasi)}`)
  })
}

test('CS-07 (Mobile: la lista non si tiene a mano) ogni attrezzo del ramo «anteprima, carta, esegui» sta in UNA sola delle tre classi', () => {
  const ramo = new Set([...nucleo.ATTREZZI_AUTOMAZIONI, ...nucleo.ATTREZZI_FORNITORI, ...nucleo.ATTREZZI_OBIETTIVO, ...nucleo.ATTREZZI_ANNULLA,
    ...nucleo.ATTREZZI_TELEFONI, ...nucleo.ATTREZZI_LUOGHI, 'app_settings', // computer use 03/11: i luoghi passano dallo stesso ramo
    nucleo.NOME_COMPUTER_USE]) // passo 5 (04/11): la carta del compito la dà l'ospite (consensoDelCompito), tranne in Accesso pieno
  const classi = { senzaCarta: nucleo.SENZA_CARTA_IN_ACCESSO_PIENO, cartaSempre: nucleo.ATTREZZI_CARTA_SEMPRE, dallOspite: nucleo.ATTREZZI_SENZA_CARTA_DALL_OSPITE }
  assert.ok(classi.dallOspite instanceof Set, 'la terza classe esiste')
  const senzaClasse = [...ramo].filter((n) => !Object.values(classi).some((c) => c.has(n)))
  assert.deepEqual(senzaClasse, [], `attrezzi senza classe: un attrezzo nuovo va messo in una delle tre: ${senzaClasse.join(', ')}`)
  const doppi = [...ramo].filter((n) => Object.values(classi).filter((c) => c.has(n)).length > 1)
  assert.deepEqual(doppi, [], `attrezzi in due classi: ${doppi.join(', ')}`)
  for (const c of Object.values(classi)) for (const n of c) assert.ok(ramo.has(n), `«${n}» è in una classe ma non nel ramo`)
})

test('CS-R3 (Mobile) la carta del testo approvata DAL TELEFONO attraverso il ponte non copre la carta sempre: arriva, e la ricevuta dice chi', { timeout: 20_000 }, async (t) => {
  const { registry, servizio, sessionId, input, progetto } = await scena(t, { conImpostazioni: true, personaPresenteFn: () => true })
  assert.equal(typeof input.onImpostazioniFn, 'function', 'premessa: il registro dà l\'attrezzo alla conversazione')
  const app = createHttpApp({ senzaGettone: 'prove', staticHandler: async () => null, sessionRegistry: registry, impostazioniApp: servizio })
  const dalPad = creaChiamataInterna({ httpApp: app, porta: 1 })
  const tipi = []
  t.after(registry.iscriviti(sessionId, (e) => {
    if (e?.type !== 'ApprovalRequested') return
    tipi.push(e.azione?.tipo)
    setImmediate(() => { void dalPad({ metodo: 'POST', percorso: `/api/v1/sessions/${sessionId}/approve`, corpo: { requestId: e.requestId, approvato: true }, origineRemota: { dispositivoId: 'pad-di-nino' } }) })
  }, 0, { capacita: 'chiamata-dal-testo' }))
  const lista = await input.onImpostazioniFn('app_settings', { action: 'list', query: 'conversation.permissions' }, { fase: 'esegui' })
  const rev = Number(/Revision (\d+)/u.exec(lista.testo)?.[1])
  let i = 0
  await talosLavora({
    cartella: progetto, task: { consegna: 'sola lettura' }, modello: LOCALE, chiave: 'finta', livelloAccesso: input.livelloAccesso, strumentiEstesi: ['app_settings'],
    onImpostazioniFn: input.onImpostazioniFn, chiediApprovazioneFn: input.chiediApprovazioneFn, personaPresenteFn: input.personaPresenteFn, promuoviDalTesto: input.promuoviDalTesto, onDelta: () => {},
    fetchDiRete: async () => testoInFlusso(i++ === 0 ? codaDiTesto('app_settings', { action: 'set', changes: [{ key: 'conversation.permissions', value: 'readOnly' }], expected_revision: rev }) : 'Fatto.'),
  })
  assert.deepEqual(tipi, ['chiamata-dal-testo', 'app_settings'], `carte arrivate al telefono: ${JSON.stringify(tipi)}`)
  const [ricevuta] = await servizio.ricevute()
  assert.ok(ricevuta, 'il cambio è avvenuto')
  assert.deepEqual(ricevuta.confermatoDa, { tipo: 'dispositivo', dispositivoId: 'pad-di-nino' })
})

test('CS-R4 (Mobile) una carta NORMALE coperta dal «sì solo»: la ricevuta dice chi ha detto sì alla carta del testo, mai null', { timeout: 20_000 }, async (t) => {
  const { registry, servizio, sessionId, input, progetto } = await scena(t, { conImpostazioni: true, personaPresenteFn: () => true })
  const tipi = []
  t.after(registry.iscriviti(sessionId, (e) => {
    if (e?.type !== 'ApprovalRequested') return
    tipi.push(e.azione?.tipo)
    /* la rotta della finestra del PC passa `confermatoDa: { tipo: 'finestra-pc' }` (http-app.mjs, cura 2) */
    setImmediate(() => registry.rispondiApprovazione(sessionId, e.requestId, true, { confermatoDa: { tipo: 'finestra-pc' } }))
  }, 0, { capacita: 'chiamata-dal-testo' }))
  const lista = await input.onImpostazioniFn('app_settings', { action: 'list', query: 'conversation.reasoningEffort' }, { fase: 'esegui' })
  const rev = Number(/Revision (\d+)/u.exec(lista.testo)?.[1])
  let i = 0
  await talosLavora({
    cartella: progetto, task: { consegna: 'sforzo basso' }, modello: LOCALE, chiave: 'finta', livelloAccesso: input.livelloAccesso, strumentiEstesi: ['app_settings'],
    onImpostazioniFn: input.onImpostazioniFn, chiediApprovazioneFn: input.chiediApprovazioneFn, personaPresenteFn: input.personaPresenteFn, promuoviDalTesto: input.promuoviDalTesto, onDelta: () => {},
    fetchDiRete: async () => testoInFlusso(i++ === 0 ? codaDiTesto('app_settings', { action: 'set', changes: [{ key: 'conversation.reasoningEffort', value: 'low' }], expected_revision: rev }) : 'Fatto.'),
  })
  assert.deepEqual(tipi, ['chiamata-dal-testo'], 'una carta sola (Performance)')
  const [ricevuta] = await servizio.ricevute()
  assert.ok(ricevuta, 'il cambio è avvenuto')
  assert.deepEqual(ricevuta.confermatoDa, { tipo: 'finestra-pc' }, `confermatoDa: ${JSON.stringify(ricevuta.confermatoDa)}`)
})
