/*
 * R5.13, seconda metà (24/10/2026 notte) — MANDARE UN FILE A UN DISPOSITIVO DALLA CHAT: l'attrezzo del modello
 *   `remote_device_send_file {path, device?}` (due porte, owner: «ogni funzione anche al modello») e la porta della finestra (il menu
 *   del file), che registrano la STESSA offerta (`remoto.file.registraOfferta`, la funzione della prima corsa).
 *   Decisioni dell'owner D1-D8 (memoria `decisioni-owner-scambio-file-r513-24-10`): la carta come gli altri attrezzi, niente carta in
 *   Accesso pieno; tetto 25 MiB; D3 con più dispositivi il modello sceglie e la carta lo nomina; D2 un dispositivo fuori linea riceve
 *   l'offerta quando si ricollega.
 *   Tre piani: il kernel (offerta, carta, Accesso pieno, gancio), il registro (l'ospite vero col modulo vero dei file) e le rotte della
 *   finestra (elenco e invio dalle offerte).
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, realpathSync, writeFileSync, truncateSync } from 'node:fs'
import { mkdtemp, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { talosLavora, ATTREZZI_TELEFONI, SENZA_CARTA_IN_ACCESSO_PIENO, ATTREZZI_ESTESI_OPENAI } from '../src/kernel/talosHarness.mjs'
import { ATTREZZI_DIFFERIBILI } from '../src/kernel/ponte-attrezzi.mjs'
import { createSessionRegistry, STRUMENTI_ESTESI_PREDEFINITI } from '../src/session-registry.mjs'
import { creaFileDeiDispositivi } from '../src/remoto/file-dispositivi.mjs'
import { creaRotteRemoto, ROTTE_REMOTO } from '../src/remoto/rotte.mjs'
import { MAX_CHAT_FILE_BYTES } from '../src/chat-file-upload.mjs'
import { rimuoviCartellaDiProva, rimuoviCartellaDiProvaAttesa } from './aiuto/rimuovi-cartella-di-prova.mjs'

const NOME = 'remote_device_send_file'

function cartella(t) {
  const c = mkdtempSync(join(tmpdir(), 'talos-invio-k-'))
  t.after(() => rimuoviCartellaDiProva(c))
  return c
}
const chiama = (id, nome, argomenti) => ({ id, type: 'function', function: { name: nome, arguments: JSON.stringify(argomenti) } })
async function giro(c, risposte, opzioni = {}) {
  let n = 0
  const offerti = []
  const domande = []
  const ospite = []
  const r = await talosLavora({
    cartella: c, task: { consegna: 'lavora' }, modello: 'x', chiave: 'y', strumentiEstesi: ['remote_phones', NOME],
    fetchDiRete: async (_url, init) => {
      const corpo = JSON.parse(init?.body ?? '{}')
      offerti.push((corpo.tools ?? []).map((a) => a.function?.name).filter(Boolean))
      const prossima = risposte[n++]
      const message = prossima ? { role: 'assistant', content: null, tool_calls: [prossima] } : { role: 'assistant', content: 'fatto' }
      return { ok: true, status: 200, text: async () => '', json: async () => ({ choices: [{ message }], usage: { prompt_tokens: 10, completion_tokens: 5 } }) }
    },
    ...(opzioni.ospite ? { onTelefoniFn: async (nome, argomenti, fase) => { ospite.push([nome, argomenti, fase.fase]); return opzioni.ospite(nome, argomenti, fase) } } : {}),
    ...(opzioni.extra ?? {}),
    chiediApprovazioneFn: opzioni.risposta === undefined ? undefined : async (azione) => { domande.push(azione); return opzioni.risposta },
  })
  return { esito: (id) => r.messaggiFinali.find((m) => m.tool_call_id === id)?.content ?? '', offerti, domande, ospite }
}
const OSPITE = (nome, _a, { fase }) => {
  if (nome === 'remote_phones') return fase === 'anteprima' ? { ok: true, carta: false } : { ok: true, testo: 'Remote control is on.' }
  if (fase === 'anteprima') return { ok: true, carta: true, azione: { tipo: nome } }
  return { ok: true, testo: `${nome} done.` }
}
const pieno = { livelloAccesso: 'accesso-pieno' }

/* ——— il kernel ——— */

test('IF-K-01 — l\'attrezzo esiste nel kernel, sta fra i dispositivi, dietro il ponte, nella lista del registro; mai senza l\'ospite, mai in Piano', async (t) => {
  const schema = ATTREZZI_ESTESI_OPENAI.map((a) => ({ name: a.function.name, description: a.function.description, input_schema: a.function.parameters })).find((a) => a.name === NOME)
  assert.ok(schema, 'lo schema c\'è')
  assert.deepEqual(schema.input_schema.required, ['path'])
  assert.deepEqual(Object.keys(schema.input_schema.properties).sort(), ['device', 'path'])
  assert.doesNotMatch(schema.description, /\bphones?\b/iu, '«device», mai «phone» (owner)')
  assert.match(schema.description, /25 MiB/u)
  assert.equal(ATTREZZI_TELEFONI.has(NOME), true)
  assert.equal(SENZA_CARTA_IN_ACCESSO_PIENO.has(NOME), true, 'in Accesso pieno niente carta (owner 24/10)')
  assert.equal(ATTREZZI_DIFFERIBILI.has(NOME), true, 'dietro il ponte C5, come gli altri attrezzi del remoto')
  assert.equal(STRUMENTI_ESTESI_PREDEFINITI.includes(NOME), true)
  const c = cartella(t)
  assert.equal((await giro(c, [], { ospite: OSPITE })).offerti[0].includes(NOME), true)
  assert.equal((await giro(c, [])).offerti[0].includes(NOME), false, 'senza ospite (la CLI) non si offre')
  assert.equal((await giro(c, [], { ospite: OSPITE, extra: { modalitaOperativa: 'piano' } })).offerti[0].includes(NOME), false, 'in Piano non si manda niente')
})

test('IF-K-02 — la carta si chiede; «Non inviare» ⇒ REFUSED senza esecuzione; in Accesso pieno niente carta e la nota', async (t) => {
  const c = cartella(t)
  const no = await giro(c, [chiama('a', NOME, { path: 'report.pdf' })], { ospite: OSPITE, risposta: false })
  assert.equal(no.domande.length, 1)
  assert.equal(no.domande[0].tipo, NOME)
  assert.deepEqual(no.ospite.map(([, , f]) => f), ['anteprima'])
  assert.match(no.esito('a'), /^REFUSED\./u)
  const si = await giro(c, [chiama('a', NOME, { path: 'report.pdf' })], { ospite: OSPITE, risposta: true })
  assert.deepEqual(si.ospite.map(([, , f]) => f), ['anteprima', 'esegui'])
  assert.equal(si.esito('a'), `${NOME} done.`)
  const fa = await giro(c, [chiama('a', NOME, { path: 'report.pdf' })], { ospite: OSPITE, risposta: false, extra: pieno })
  assert.deepEqual(fa.domande, [], 'Accesso pieno: nessuna carta')
  assert.equal(fa.esito('a'), `${NOME} done. Full access: done without asking the person.`)
})

test('IF-K-03 — un gancio pre_tool_call che rifiuta blocca l\'invio (azione mutante)', async (t) => {
  const c = cartella(t)
  const hookFn = async (e) => (e?.tipo === 'pre_tool_call' ? { consentito: false, motivo: 'blocked by the test hook.' } : undefined)
  const r = await giro(c, [chiama('a', NOME, { path: 'report.pdf' })], { ospite: OSPITE, risposta: true, extra: { hookFn } })
  assert.equal(r.esito('a'), 'REFUSED. blocked by the test hook. Nothing was done.')
  assert.deepEqual(r.ospite, [], 'non arriva all\'ospite')
})

/* ——— il registro: l'ospite vero col modulo vero dei file ——— */

const PAD = { id: 'padnino0001aaaa', nome: 'Pad di Nino', piattaforma: 'Android', inLinea: true, ultimaVoltaAlle: Date.UTC(2026, 9, 24, 20, 0), revocatoAlle: null }
const PIXEL = { id: 'pixel9000bbbb22', nome: 'Pixel 9', inLinea: true, revocatoAlle: null }
const TAB = { id: 'galaxytab3ccc33', nome: 'Galaxy Tab', inLinea: false, ultimaVoltaAlle: Date.UTC(2026, 9, 23, 20, 0), revocatoAlle: null }
const VECCHIO = { id: 'padvecchio44dd4', nome: 'Vecchio', revocatoAlle: 1 }

async function banco(t, { telefoni = [PAD], senzaFile = false } = {}) {
  const radice = await mkdtemp(join(tmpdir(), 'talos-invio-r-'))
  t.after(() => rimuoviCartellaDiProvaAttesa(radice))
  const progetto = join(radice, 'progetto')
  await mkdir(progetto, { recursive: true })
  const fuori = join(radice, 'fuori')
  await mkdir(fuori, { recursive: true })
  const giri = []
  const box = {}
  const remoto = {
    stato: async () => ({ disponibile: true, acceso: true, sceltaFatta: true, relay: { modo: 'n0' }, telefoni: box.telefoni }),
    revoca: async () => { throw new Error('non si revoca') },
    get file() { return senzaFile ? null : box.file },
  }
  box.telefoni = telefoni
  const registro = createSessionRegistry({
    avviaSessioneFn: async (input) => {
      let risolvi
      const fine = new Promise((ok) => { risolvi = ok })
      giri.push({ input, risolvi })
      input.onEvento({ type: 'RunStarted', threadId: 't1', runId: `r${giri.length}` })
      return fine
    },
    modello: 'm', chiave: 'k',
    preparaEsecuzioneFn: (taskId) => ({ cartella: progetto, comandoProva: 'npm test', task: { id: taskId, consegna: 'c' } }),
    remotoFn: () => remoto,
  })
  box.file = creaFileDeiDispositivi({ cartella: join(radice, 'dati', 'file-dispositivi'), sessionRegistry: registro })
  const avvio = registro.avvia('task-vero')
  const sessionId = avvio.sessionId
  assert.ok(sessionId, JSON.stringify(avvio))
  const scrivi = (rel, contenuto) => { const p = join(progetto, rel); mkdirSync(join(p, '..'), { recursive: true }); writeFileSync(p, contenuto); return p }
  return {
    radice, progetto: realpathSync(progetto), fuori, sessionId, scrivi, box, registro,
    ospite: giri[0].input.onTelefoniFn,
    via: async () => { giri.forEach((g, k) => { g.input.onEvento({ type: 'RunFinished', threadId: 't1', runId: `r${k + 1}` }); g.risolvi({ ok: true }) }) },
  }
}

test('IF-R-01 — un dispositivo: la carta col file e il dispositivo, l\'anteprima non registra; eseguito, l\'offerta c\'è e il modello lo sa', async (t) => {
  const b = await banco(t)
  try {
    const p = b.scrivi('report-q3.pdf', Buffer.from('%PDF-1.7\nciao'))
    const anteprima = await b.ospite(NOME, { path: 'report-q3.pdf' }, { fase: 'anteprima', toolCallId: 'call-1' })
    assert.equal(anteprima.ok, true, JSON.stringify(anteprima))
    assert.equal(anteprima.carta, true)
    assert.deepEqual(anteprima.azione, {
      tipo: NOME,
      file: { nome: 'report-q3.pdf', dimensione: 13, percorso: realpathSync.native(p) },
      telefono: { idCorto: 'padnino0', nome: 'Pad di Nino', piattaforma: 'Android', inLinea: true, ultimaVoltaAlle: PAD.ultimaVoltaAlle },
      dispositivi: 1,
    })
    assert.deepEqual(b.box.file.offerte(b.sessionId), [], 'l\'anteprima non registra niente')
    const fatto = await b.ospite(NOME, { path: 'report-q3.pdf' }, { fase: 'esegui', toolCallId: 'call-1' })
    assert.equal(fatto.ok, true, JSON.stringify(fatto))
    const [o] = b.box.file.offerte(b.sessionId)
    assert.equal(o.dispositivoId, PAD.id)
    assert.equal(o.stato, 'inviato')
    assert.equal(fatto.testo, `Sent "report-q3.pdf" (13 bytes) to "Pad di Nino" (id padnino0): it appears in this conversation on the device, ready to download (offer ${o.offertaId}, path "report-q3.pdf").`) // REV6-F3: il percorso dentro la cartella
    /* il percorso assoluto vale uguale; un nome con caratteri di controllo arriva pulito */
    const strano = b.scrivi('note\u202e.md', 'x')
    const r2 = await b.ospite(NOME, { path: strano }, { fase: 'esegui', toolCallId: 'call-2' })
    assert.equal(r2.ok, false, 'senza anteprima per QUESTA chiamata non si manda niente')
    assert.match(r2.messaggio, /No card was shown to the person for this call/u)
    const a2 = await b.ospite(NOME, { path: strano }, { fase: 'anteprima', toolCallId: 'call-2' })
    assert.equal(a2.ok, true)
    const f2 = await b.ospite(NOME, { path: strano }, { fase: 'esegui', toolCallId: 'call-2' })
    assert.match(f2.testo, /^Sent "note .md" \(1 byte\)/u)
  } finally { await b.via() }
})

test('IF-R-02 — D3: più dispositivi e nessuno indicato ⇒ rifiuto con l\'elenco; indicato ⇒ la carta lo nomina e dice quanti sono', async (t) => {
  const b = await banco(t, { telefoni: [PAD, PIXEL, TAB, VECCHIO] })
  try {
    b.scrivi('report-q3.pdf', '%PDF-1.7')
    const senza = await b.ospite(NOME, { path: 'report-q3.pdf' }, { fase: 'anteprima', toolCallId: 'c' })
    assert.equal(senza.ok, false)
    assert.equal(senza.messaggio, 'There are 3 paired devices: say which one in "device" — "Pad di Nino" (id padnino0, online), "Pixel 9" (id pixel900, online), "Galaxy Tab" (id galaxyta, offline). Nothing was sent.')
    const con = await b.ospite(NOME, { path: 'report-q3.pdf', device: 'pixel900' }, { fase: 'anteprima', toolCallId: 'c' })
    assert.equal(con.ok, true, JSON.stringify(con))
    assert.equal(con.azione.telefono.nome, 'Pixel 9')
    assert.equal(con.azione.dispositivi, 3)
    for (const device of ['zzzz9999', 'padvecch', 'a b', 'ab']) {
      const r = await b.ospite(NOME, { path: 'report-q3.pdf', device }, { fase: 'anteprima', toolCallId: 'c' })
      assert.equal(r.ok, false, device)
      assert.match(r.messaggio, /call remote_phones first|short id from remote_phones/u, device)
    }
    /* D2: fuori linea si manda lo stesso, e il modello sa che lo riceve quando si collega */
    await b.ospite(NOME, { path: 'report-q3.pdf', device: 'galaxyta' }, { fase: 'anteprima', toolCallId: 'tab' })
    const tab = await b.ospite(NOME, { path: 'report-q3.pdf', device: 'galaxyta' }, { fase: 'esegui', toolCallId: 'tab' })
    assert.match(tab.testo, /^Sent "report-q3.pdf" \(8 bytes\) to "Galaxy Tab" \(id galaxyta\): it is offline now and gets the file in this conversation when it connects again \(offer [A-Za-z0-9_-]+, path "report-q3\.pdf"\)\.$/u) // REV6-F3
  } finally { await b.via() }
})

test('IF-R-03 — fuori dalla cartella, inesistente, cartella, oltre i 25 MiB, senza dispositivi o senza il modulo ⇒ rifiuto, niente registrato', async (t) => {
  const b = await banco(t)
  try {
    const fuori = join(b.fuori, 'segreto.txt'); writeFileSync(fuori, 'x')
    const casi = [
      [{ path: fuori }, /^That file is not in this conversation's folder\. Nothing was sent\.$/u],
      [{ path: '../fuori/segreto.txt' }, /^That file is not in this conversation's folder\. Nothing was sent\.$/u],
      [{ path: 'manca.pdf' }, /^There is no file at "manca\.pdf" in this conversation's folder\. Nothing was sent\.$/u],
      [{ path: '' }, /^"path" must be the path of a file/u],
      [{}, /^"path" must be the path of a file/u],
    ]
    mkdirSync(join(b.progetto, 'cartella'))
    casi.push([{ path: 'cartella' }, /^"cartella" is a folder, not a file\. Nothing was sent\.$/u])
    const grande = b.scrivi('demo-video.mp4', ''); truncateSync(grande, MAX_CHAT_FILE_BYTES + 1)
    casi.push([{ path: 'demo-video.mp4' }, /^FILE_TOO_LARGE: "demo-video\.mp4" is 25\.0 MB \(26214401 bytes\) at "demo-video\.mp4" and a device takes files up to 25 MB\. Nothing was sent\.$/u]) // REV6-F3
    for (const [argomenti, atteso] of casi) {
      const r = await b.ospite(NOME, argomenti, { fase: 'anteprima', toolCallId: 'c' })
      assert.equal(r.ok, false, JSON.stringify(argomenti))
      assert.match(r.messaggio, atteso, JSON.stringify(argomenti))
    }
    assert.deepEqual(b.box.file.offerte(b.sessionId), [])
    b.box.telefoni = [VECCHIO]
    b.scrivi('a.txt', 'a')
    const nessuno = await b.ospite(NOME, { path: 'a.txt' }, { fase: 'anteprima', toolCallId: 'c' })
    assert.equal(nessuno.messaggio, 'No device is paired with this computer: the person pairs one first (remote_phone_pair). Nothing was sent.')
  } finally { await b.via() }
  const s = await banco(t, { senzaFile: true })
  try {
    s.scrivi('a.txt', 'a')
    const r = await s.ospite(NOME, { path: 'a.txt' }, { fase: 'anteprima', toolCallId: 'c' })
    assert.deepEqual(r, { ok: false, messaggio: 'Sending files to devices is not available on this computer.' })
  } finally { await s.via() }
})

test('IF-R-04 — fra la carta e il clic il file cambia (o il dispositivo sparisce) ⇒ niente offerta, e il modello sa perché', async (t) => {
  const b = await banco(t)
  try {
    const p = b.scrivi('report-q3.pdf', '%PDF-1.7 prima')
    await b.ospite(NOME, { path: 'report-q3.pdf' }, { fase: 'anteprima', toolCallId: 'x1' })
    writeFileSync(p, '%PDF-1.7 dopo, più lungo')
    const r = await b.ospite(NOME, { path: 'report-q3.pdf' }, { fase: 'esegui', toolCallId: 'x1' })
    assert.equal(r.ok, false)
    assert.equal(r.messaggio, '"report-q3.pdf" changed after the card was shown: call remote_device_send_file again to send the new version. Nothing was sent.')
    assert.deepEqual(b.box.file.offerte(b.sessionId), [])
    await b.ospite(NOME, { path: 'report-q3.pdf' }, { fase: 'anteprima', toolCallId: 'x2' })
    b.box.telefoni = []
    const via = await b.ospite(NOME, { path: 'report-q3.pdf' }, { fase: 'esegui', toolCallId: 'x2' })
    assert.equal(via.ok, false)
    assert.deepEqual(b.box.file.offerte(b.sessionId), [])
    /* una carta usata non vale due volte */
    b.box.telefoni = [PAD]
    await b.ospite(NOME, { path: 'report-q3.pdf' }, { fase: 'anteprima', toolCallId: 'x3' })
    assert.equal((await b.ospite(NOME, { path: 'report-q3.pdf' }, { fase: 'esegui', toolCallId: 'x3' })).ok, true)
    assert.equal((await b.ospite(NOME, { path: 'report-q3.pdf' }, { fase: 'esegui', toolCallId: 'x3' })).ok, false)
  } finally { await b.via() }
})

/* ——— la porta della finestra: le rotte delle offerte ——— */

test('IF-H-01 — rotte: elenco e invio dalla finestra con la stessa funzione; corpo e id controllati; senza modulo 503', async () => {
  const chiamate = []
  const file = {
    offerteAggiornate: async (sessionId) => { chiamate.push(['elenco', sessionId]); return [{ offertaId: 'o1', stato: 'inviato' }] },
    registraOfferta: async (a) => { chiamate.push(['registra', a]); return { offertaId: 'o2', fileId: 'f', nome: 'a.txt', dimensione: 1 } },
  }
  const remoto = { stato: async () => ({ telefoni: [PAD, VECCHIO] }), file }
  const rotta = creaRotteRemoto({ remoto })
  const sid = 'sessione-1234abcd'
  assert.ok(ROTTE_REMOTO.some((r) => typeof r.schema !== 'string' && r.schema.test(`/api/v1/remote/sessions/${sid}/offers`)))
  const elenco = await rotta({ method: 'GET', percorso: `/api/v1/remote/sessions/${sid}/offers` })
  assert.deepEqual(elenco, { stato: 200, dati: { offerte: [{ offertaId: 'o1', stato: 'inviato' }] } })
  const invio = await rotta({ method: 'POST', percorso: `/api/v1/remote/sessions/${sid}/offers`, corpo: { percorso: 'C:\\x\\a.txt', dispositivo: PAD.id } })
  assert.equal(invio.stato, 200)
  assert.equal(invio.dati.offertaId, 'o2')
  assert.deepEqual(chiamate.at(-1), ['registra', { sessionId: sid, dispositivoId: PAD.id, percorso: 'C:\\x\\a.txt' }])
  for (const corpo of [{}, { percorso: 'a' }, { percorso: 'a', dispositivo: PAD.id, extra: 1 }, { percorso: 3, dispositivo: PAD.id }, { percorso: 'a', dispositivo: 'nessuno-vivo-0000' }, { percorso: 'a', dispositivo: VECCHIO.id }]) {
    const r = await rotta({ method: 'POST', percorso: `/api/v1/remote/sessions/${sid}/offers`, corpo })
    assert.ok(r.stato >= 400 && r.stato < 500, JSON.stringify(corpo))
  }
  assert.equal(chiamate.filter(([k]) => k === 'registra').length, 1, 'nessun corpo cattivo arriva al modulo')
  assert.equal((await rotta({ method: 'GET', percorso: '/api/v1/remote/sessions/a b/offers' })).stato, 400)
  assert.equal((await rotta({ method: 'DELETE', percorso: `/api/v1/remote/sessions/${sid}/offers` })).stato, 405)
  const senza = await creaRotteRemoto({ remoto: { stato: async () => ({}), file: null } })({ method: 'GET', percorso: `/api/v1/remote/sessions/${sid}/offers` })
  assert.equal(senza.stato, 503)
  /* gli errori dichiarati del modulo diventano risposte */
  const errori = creaRotteRemoto({ remoto: { stato: async () => ({ telefoni: [PAD] }), file: { registraOfferta: async () => { throw Object.assign(new Error('big'), { code: 'FILE_TOO_LARGE' }) } } } })
  assert.equal((await errori({ method: 'POST', percorso: `/api/v1/remote/sessions/${sid}/offers`, corpo: { percorso: 'a', dispositivo: PAD.id } })).stato, 413)
})

test('IF-H-02 — il modulo: `offerteAggiornate` vede un file cambiato dopo l\'invio (D6: «Send again») e porta il percorso alla finestra', async (t) => {
  const b = await banco(t)
  try {
    const p = b.scrivi('report-q3.pdf', '%PDF-1.7')
    const visti = []
    b.box.file.ascoltaOfferte((o) => visti.push(o))
    await b.box.file.registraOfferta({ sessionId: b.sessionId, dispositivoId: PAD.id, percorso: p })
    const [prima] = await b.box.file.offerteAggiornate(b.sessionId)
    assert.equal(prima.stato, 'inviato')
    assert.equal(prima.percorso, realpathSync.native(p))
    assert.equal(visti.at(-1).percorso, realpathSync.native(p), 'anche sull\'evento della finestra')
    writeFileSync(p, '%PDF-1.7 cambiato')
    const [dopo] = await b.box.file.offerteAggiornate(b.sessionId)
    assert.equal(dopo.stato, 'cambiato')
    assert.equal(visti.at(-1).stato, 'cambiato', 'la finestra lo sa sull\'evento')
    /* reinviato: l'offerta nuova sostituisce quella morta */
    await b.box.file.registraOfferta({ sessionId: b.sessionId, dispositivoId: PAD.id, percorso: p })
    assert.deepEqual((await b.box.file.offerteAggiornate(b.sessionId)).map((o) => o.stato), ['inviato'])
  } finally { await b.via() }
})

/* ——— lo stream della finestra: lo stato di un'offerta arriva sull'evento; la POST solo dalla finestra ——— */
import { createServer, request } from 'node:http'
import { createHttpApp } from '../src/http-app.mjs'

async function chiamaHttp(porta, { metodo = 'GET', percorso, corpo = null, intestazioni = {} }) {
  return new Promise((ok, ko) => {
    const testo = corpo === null ? null : JSON.stringify(corpo)
    const req = request({ host: '127.0.0.1', port: porta, path: percorso, method: metodo, headers: { ...(testo ? { 'content-type': 'application/json' } : {}), ...intestazioni } }, (res) => {
      let d = ''; res.setEncoding('utf8'); res.on('data', (x) => { d += x }); res.on('end', () => ok({ stato: res.statusCode, corpo: d }))
    })
    req.on('error', ko); if (testo) req.write(testo); req.end()
  })
}

test('IF-H-03 — `file.offer` sullo stream della finestra quando un\'offerta cambia; la POST dell\'invio solo dalla finestra', async (t) => {
  let avvisa = null
  const registrate = []
  const file = {
    ascoltaOfferte: (fn) => { avvisa = fn; return () => { avvisa = null } },
    offerteAggiornate: async () => [],
    registraOfferta: async (a) => { registrate.push(a); return { offertaId: 'o9' } },
  }
  const remoto = { cartelle: { ascolta: () => () => {}, inAttesa: () => [] }, file, stato: async () => ({ telefoni: [PAD] }) }
  const httpApp = createHttpApp({ staticHandler: async () => null, sessionRegistry: { elenca: () => [], esiste: () => true }, remotoFn: () => remoto })
  const server = createServer((req, res) => { void httpApp(req, res) })
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok))
  t.after(() => new Promise((ok) => { server.closeAllConnections?.(); server.close(() => ok()) }))
  const porta = server.address().port
  const eventi = []
  const req = request({ host: '127.0.0.1', port: porta, path: '/api/v1/remote/events', headers: { accept: 'text/event-stream', 'sec-fetch-site': 'same-origin' } }, (res) => {
    let resto = ''; res.setEncoding('utf8')
    res.on('data', (x) => { resto += x; let i; while ((i = resto.indexOf('\n\n')) >= 0) { const b = resto.slice(0, i); resto = resto.slice(i + 2); const dati = b.split('\n').filter((l) => l.startsWith('data: ')).map((l) => l.slice(6)).join('\n'); if (dati) eventi.push(JSON.parse(dati)) } })
  })
  req.end()
  t.after(() => req.destroy())
  const aspetta = async (cond) => { const fine = Date.now() + 3000; while (!eventi.some(cond)) { if (Date.now() > fine) throw new Error(JSON.stringify(eventi)); await new Promise((x) => setTimeout(x, 5)) } return eventi.find(cond) }
  await aspetta((e) => e.type === 'remote.changed')
  assert.equal(typeof avvisa, 'function', 'lo stream ascolta le offerte')
  avvisa({ offertaId: 'o1', stato: 'in-scaricamento', percentuale: 62 })
  assert.deepEqual(await aspetta((e) => e.type === 'file.offer'), { type: 'file.offer', offerta: { offertaId: 'o1', stato: 'in-scaricamento', percentuale: 62 } })
  const percorso = '/api/v1/remote/sessions/sessione-1234abcd/offers'
  const corpo = { percorso: 'a.txt', dispositivo: PAD.id }
  assert.equal((await chiamaHttp(porta, { metodo: 'POST', percorso, corpo, intestazioni: { 'sec-fetch-site': 'cross-site' } })).stato, 403)
  assert.deepEqual(registrate, [], 'da fuori la finestra non si manda niente')
  const ok = await chiamaHttp(porta, { metodo: 'POST', percorso, corpo, intestazioni: { 'sec-fetch-site': 'same-origin' } })
  assert.equal(ok.stato, 200, ok.corpo)
  assert.equal(registrate.length, 1)
})

/* ——— revisione a blocco 6 (25/10/2026): le cure REV6-F1…F4, ognuna nel verso che prima falliva ——— */

test('REV6-F1 — un file il cui NOME comincia con «..» è DENTRO la cartella: l\'attrezzo e la finestra lo mandano', async (t) => {
  const b = await banco(t)
  try {
    b.scrivi('..appunti.md', 'x')
    const a = await b.ospite(NOME, { path: '..appunti.md' }, { fase: 'anteprima', toolCallId: 'f1' })
    assert.equal(a.ok, true, a.messaggio)
    const o = await b.box.file.registraOfferta({ sessionId: b.sessionId, dispositivoId: PAD.id, percorso: '..appunti.md' })
    assert.equal(o.nome, '..appunti.md')
    /* e la cartella di sopra resta fuori */
    const fuori = await b.ospite(NOME, { path: '../fuori/x.txt' }, { fase: 'anteprima', toolCallId: 'f1b' })
    assert.equal(fuori.ok, false)
  } finally { await b.via() }
})

test('REV6-F2 — stesso nome in due cartelle: ogni offerta porta il SUO percorso dentro la cartella, esatto', async (t) => {
  const b = await banco(t)
  try {
    b.scrivi('notes.txt', 'radice'); b.scrivi('sub/notes.txt', 'sotto')
    await b.box.file.registraOfferta({ sessionId: b.sessionId, dispositivoId: PAD.id, percorso: 'sub/notes.txt' })
    await b.box.file.registraOfferta({ sessionId: b.sessionId, dispositivoId: PAD.id, percorso: 'notes.txt' })
    const viste = await b.box.file.offerteAggiornate(b.sessionId)
    assert.deepEqual(viste.map((o) => o.relativo).sort(), ['notes.txt', 'sub/notes.txt'])
  } finally { await b.via() }
})

test('REV6-F3 — col percorso ASSOLUTO del modello l\'esito porta quello dentro la cartella, e il «Download» con quello funziona', async (t) => {
  const b = await banco(t)
  try {
    const p = b.scrivi('docs/report.pdf', '%PDF-1.7')
    const a = await b.ospite(NOME, { path: p }, { fase: 'anteprima', toolCallId: 'f3' })
    assert.equal(a.ok, true, a.messaggio)
    const f = await b.ospite(NOME, { path: p }, { fase: 'esegui', toolCallId: 'f3' })
    assert.equal(f.ok, true, f.messaggio)
    assert.match(f.testo, /, path "docs\/report\.pdf"\)\.$/u)
    const giu = await b.registro.scaricaFile(b.sessionId, 'docs/report.pdf')
    assert.equal(giu.ok, true, JSON.stringify(giu).slice(0, 200))
  } finally { await b.via() }
})

test('REV6-F4 — la GET delle offerte ha la guardia d\'origine come lo stream: da un\'altra origine 403, dalla finestra 200', async (t) => {
  const file = { offerteAggiornate: async () => [{ offertaId: 'o1', percorso: 'C:/segreto/a.txt' }], ascoltaOfferte: () => () => {} }
  const remoto = { cartelle: { ascolta: () => () => {}, inAttesa: () => [] }, file, stato: async () => ({ telefoni: [PAD] }) }
  const httpApp = createHttpApp({ staticHandler: async () => null, sessionRegistry: { elenca: () => [], esiste: () => true }, remotoFn: () => remoto })
  const server = createServer((req, res) => { void httpApp(req, res) })
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok))
  t.after(() => new Promise((ok) => { server.closeAllConnections?.(); server.close(() => ok()) }))
  const porta = server.address().port
  const percorso = '/api/v1/remote/sessions/sessione-1234abcd/offers'
  const estranea = await chiamaHttp(porta, { percorso, intestazioni: { 'sec-fetch-site': 'cross-site', origin: 'https://evil.example' } })
  assert.equal(estranea.stato, 403)
  assert.doesNotMatch(estranea.corpo, /segreto/u)
  assert.equal((await chiamaHttp(porta, { percorso })).stato, 403, 'senza intestazioni e senza gettone: come lo stream')
  const finestra = await chiamaHttp(porta, { percorso, intestazioni: { 'sec-fetch-site': 'same-origin' } })
  assert.equal(finestra.stato, 200, finestra.corpo)
})

test('B1-01 (revisione a blocco 7) l\'esito porta il percorso VERO: ZWNJ, emoji e percorsi lunghi tornano uguali, e «Download» li trova', async (t) => {
  const b = await banco(t)
  try {
    const lungo = ['cartella-lunga-'.repeat(6), 'altra-cartella-lunga-'.repeat(5), 'documento.txt'].join('/')
    for (const [id, rel] of [['z1', 'می\u200cخواهم.txt'], ['z2', 'famiglia \u{1F468}\u200d\u{1F469}\u200d\u{1F467}.txt'], ['z3', lungo]]) {
      b.scrivi(rel, 'x')
      const a = await b.ospite(NOME, { path: rel }, { fase: 'anteprima', toolCallId: id })
      assert.equal(a.ok, true, a.messaggio)
      const f = await b.ospite(NOME, { path: rel }, { fase: 'esegui', toolCallId: id })
      const m = /, path ("(?:[^"\\]|\\.)*")\)\.$/u.exec(f.testo)
      assert.ok(m, f.testo)
      assert.equal(JSON.parse(m[1]), rel)
      assert.equal((await b.registro.scaricaFile(b.sessionId, JSON.parse(m[1]))).ok, true, rel)
    }
  } finally { await b.via() }
})

test('B9-03 (A9-1, A9-2) il tetto del percorso nell\'esito si conta in JSON: 12.000 caratteri entrano, 12.001 no, anche con caratteri scappati', async () => {
  const { percorsoNellEsitoInvio, PERCORSO_ESITO_MASSIMO } = await import('../src/session-registry.mjs')
  assert.equal(PERCORSO_ESITO_MASSIMO, 12_000)
  /* JSON di N caratteri: le due virgolette + il testo; `"` e `\` valgono due caratteri in JSON, uno nel testo */
  const conLunghezzaJson = (n, pezzo = 'a') => {
    const larghezza = JSON.stringify(pezzo).length - 2
    const s = pezzo.repeat(Math.floor((n - 2) / larghezza))
    return s + 'a'.repeat(n - JSON.stringify(s).length)
  }
  for (const pezzo of ['a', '"', '\\', '\u0001']) {
    const giusto = conLunghezzaJson(12_000, pezzo)
    assert.equal(JSON.stringify(giusto).length, 12_000)
    assert.equal(percorsoNellEsitoInvio(giusto), JSON.stringify(giusto), `12.000 con ${JSON.stringify(pezzo)}`)
    const oltre = `${giusto}a`
    assert.equal(percorsoNellEsitoInvio(oltre), null, `12.001 con ${JSON.stringify(pezzo)}`)
  }
  /* un percorso col testo sotto il tetto ma il JSON sopra resta fuori */
  const scappati = '"'.repeat(6_500)
  assert.ok(scappati.length < 12_000 && JSON.stringify(scappati).length > 12_000)
  assert.equal(percorsoNellEsitoInvio(scappati), null)
  assert.equal(percorsoNellEsitoInvio(undefined), null)
})

test('B8-03 (revisione a blocco 8, tetto alzato in A9-1) oltre il tetto il percorso resta fuori dall\'esito, che resta intero; FILE_TOO_LARGE porta il percorso vero', async (t) => {
  const b = await banco(t)
  try {
    /* B8-3: un percorso lunghissimo (i percorsi lunghi sono accesi su Windows) — l'esito non deve più superare il taglio del kernel */
    const lunghissimo = [...Array.from({ length: 110 }, (_, i) => `c${i}-${'x'.repeat(110)}`), 'documento.txt'].join('/')
    assert.ok(JSON.stringify(lunghissimo).length > 12_000)
    b.scrivi(lunghissimo, 'x')
    assert.equal((await b.ospite(NOME, { path: lunghissimo }, { fase: 'anteprima', toolCallId: 'L1' })).ok, true)
    const f = await b.ospite(NOME, { path: lunghissimo }, { fase: 'esegui', toolCallId: 'L1' })
    assert.equal(f.ok, true, f.messaggio)
    assert.ok(f.testo.length < 1_000, `esito di ${f.testo.length} caratteri`)
    assert.doesNotMatch(f.testo, /, path "/u, 'senza percorso')
    assert.match(f.testo, /\(offer [A-Za-z0-9_-]+\)\.$/u, 'l\'offerta c\'è e l\'esito finisce come prima di REV6-F3')
    /* B8-4 (N1b): FILE_TOO_LARGE porta il percorso VERO in JSON, mai quello di `nomeFile` */
    const rel = 'sotto cartella/gr\u200cande.mp4'
    truncateSync(b.scrivi(rel, ''), MAX_CHAT_FILE_BYTES + 1)
    const r = await b.ospite(NOME, { path: rel }, { fase: 'anteprima', toolCallId: 'L2' })
    assert.equal(r.ok, false)
    const m = / at ("(?:[^"\\]|\\.)*") and a device takes files up to 25 MB\./u.exec(r.messaggio)
    assert.ok(m, r.messaggio)
    assert.equal(JSON.parse(m[1]), rel)
  } finally { await b.via() }
})

test('B8-09 (debito del blocco 8) un nome che comincia con BOM o spazi si manda com\'è; uno spazio di troppo del modello si toglie', async (t) => {
  const b = await banco(t)
  try {
    b.scrivi('﻿inizio.txt', 'x')
    b.scrivi(' spazio.txt', 'y')
    b.scrivi('pulito.txt', 'z')
    for (const [id, chiesto, atteso] of [['k1', '﻿inizio.txt', '﻿inizio.txt'], ['k2', ' spazio.txt', ' spazio.txt'], ['k3', ' pulito.txt ', 'pulito.txt']]) {
      const a = await b.ospite(NOME, { path: chiesto }, { fase: 'anteprima', toolCallId: id })
      assert.equal(a.ok, true, `${JSON.stringify(chiesto)}: ${a.messaggio}`)
      const f = await b.ospite(NOME, { path: chiesto }, { fase: 'esegui', toolCallId: id })
      const m = /, path ("(?:[^"\\]|\\.)*")\)\.$/u.exec(f.testo)
      assert.ok(m, f.testo)
      assert.equal(JSON.parse(m[1]), atteso)
    }
    /* il verso contrario: nessun file col nome grezzo né con quello senza bordi ⇒ «non c'è», col nome senza bordi */
    const r = await b.ospite(NOME, { path: ' manca.txt ' }, { fase: 'anteprima', toolCallId: 'k4' })
    assert.match(r.messaggio, /^There is no file at "manca\.txt" in this conversation's folder\. Nothing was sent\.$/u)
    /* A10-8 R21 (revisione a blocco 10): il ripiego vale SOLO per «non c'è». Il grezzo « big.bin» da oltre 25 MB dice FILE_TOO_LARGE,
       mai sostituito dal «big.bin» piccolo accanto */
    truncateSync(b.scrivi(' big.bin', ''), MAX_CHAT_FILE_BYTES + 1)
    b.scrivi('big.bin', 'piccolo')
    const grande = await b.ospite(NOME, { path: ' big.bin' }, { fase: 'anteprima', toolCallId: 'k5' })
    assert.equal(grande.ok, false)
    assert.match(grande.messaggio, /^FILE_TOO_LARGE: /u)
  } finally { await b.via() }
})
