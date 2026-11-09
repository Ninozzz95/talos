/*
 * Fase 8, cura 2 (forma `FORMA-FASE-8-TRE-CURE-2026-11-01.md` §2, domanda 3 del Frontend) — CHI HA CONFERMATO un cambio di impostazioni.
 *   Prima la ricevuta diceva solo `origine {tipo:'modello', sessionId, dispositivoId}`, e `dispositivoId` è il dispositivo del GIRO, non
 *   quello che ha detto sì. Ora un campo `confermatoDa`, nella ricevuta e nell'evento `talos.impostazioni-sessione`:
 *   · `{tipo:'finestra-pc'}` lo stampa la ROTTA `POST …/approve` quando la richiesta viene dalla finestra (nessuna origine remota);
 *   · `{tipo:'dispositivo', dispositivoId}` quando viene dal ponte (in processo, `req[ORIGINE_REMOTA]`);
 *   · `{tipo:'nessuno', motivo:'accesso-pieno'}` quando la carta non c'era.
 * Condizioni delle sessioni, tutte qui come prove:
 *   · CLI (a): facoltativo nelle opzioni oggetto di `rispondiApprovazione`; la forma col quarto argomento stringa o `{motivo}` resta valida;
 *   · CLI (b): assente = `null`, MAI dedotto «finestra-pc» (chiamata diretta al registro senza il campo ⇒ `null`);
 *   · Performance (2): MAI nel testo letto dal modello;
 *   · Mobile: identico nella rigiocata dell'evento quando il telefono riapre la sessione (anche dal disco); un sì dal telefono a una
 *     carta già risolta sul PC non scrive una seconda ricevuta né cambia `confermatoDa` (vince il primo sì).
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { talosLavora } from '../src/kernel/talosHarness.mjs'
import { createSessionRegistry } from '../src/session-registry.mjs'
import { createHttpApp } from '../src/http-app.mjs'
import { avviaSessione } from '../src/agent-service.mjs'
import { creaServizioImpostazioni } from '../src/impostazioni/servizio-impostazioni.mjs'
import { creaCopiaFinestra } from '../src/impostazioni/copia-finestra.mjs'
import { creaFonteSessione } from '../src/impostazioni/fonti-impostazioni.mjs'
import { creaChiamataInterna } from '../src/remoto/chiamata-interna.mjs'
import { rimuoviCartellaDiProvaAttesa } from './aiuto/rimuovi-cartella-di-prova.mjs'

const enc = new TextEncoder()
const flusso = (fotogrammi) => new Response(new ReadableStream({ start(ctl) { for (const x of fotogrammi) ctl.enqueue(enc.encode(`data: ${JSON.stringify(x)}\n\n`)); ctl.enqueue(enc.encode('data: [DONE]\n\n')); ctl.close() } }))
const chiamata = (id, argomenti) => flusso([{ choices: [{ delta: { tool_calls: [{ index: 0, id, function: { name: 'app_settings', arguments: JSON.stringify(argomenti) } }] } }] }])
const attendi = async (cond, ms = 10_000) => { const fine = Date.now() + ms; while (!cond() && Date.now() < fine) await new Promise((r) => setTimeout(r, 15)); return cond() }

/**
 * Un giro vero (rotta → registro → agent-service → kernel vero con un fornitore finto): il modello legge la sezione «conversation» e
 * chiede di abbassare lo sforzo (gruppo «costo»: carta fuori da Accesso pieno). `rispondi({ registro, sessionId, requestId, base, app })`
 * risponde alla carta come vuole la prova.
 */
const SFORZO_BASSO = [{ key: 'conversation.reasoningEffort', value: 'low' }]
async function giro(t, { permessi = 'Workspace write', rispondi = null, cartellaStore = null, cambi = SFORZO_BASSO, poiAnnulla = false } = {}) {
  const radice = await mkdtemp(join(tmpdir(), 'talos-imp-conferma-'))
  t.after(() => rimuoviCartellaDiProvaAttesa(radice))
  const progetto = join(radice, 'progetto')
  await mkdir(progetto, { recursive: true })
  const store = cartellaStore === true ? join(radice, 'store') : null
  if (store) await mkdir(store, { recursive: true })
  const f = { corpi: [], chiamate: 0 }
  let registro = null
  const servizio = creaServizioImpostazioni({ fonti: { sessione: creaFonteSessione(() => registro) }, copiaFinestra: creaCopiaFinestra(), fileRicevute: join(radice, 'ricevute.json') })
  const fetchDiRete = async (_url, init) => {
    const corpo = init?.body ?? '{}'
    f.corpi.push(corpo)
    const n = f.chiamate++
    if (n === 0) return chiamata('call-list', { action: 'list', section: 'conversation' })
    if (n === 1) return chiamata('call-set', { action: 'set', expected_revision: Number(/Revision (\d+)/u.exec(corpo)?.[1]), changes: cambi })
    if (n === 2 && poiAnnulla) return chiamata('call-undo', { action: 'undo', receipt_id: /Receipt (set-\w+)/u.exec(corpo)?.[1] })
    return flusso([{ choices: [{ delta: { content: 'Fatto.' } }] }])
  }
  const opzioniRegistro = {
    modello: 'm', chiave: 'k', guardaWorkspaceFn: () => () => {}, impostazioniApp: servizio, ...(store ? { cartellaStore: store } : {}),
    preparaEsecuzioneFn: (taskId) => ({ cartella: progetto, comandoProva: 'npm test', task: { id: taskId, consegna: 'metti lo sforzo basso' } }),
    avviaSessioneFn: (input) => avviaSessione({ ...input, talosLavoraFn: (k) => talosLavora({ ...k, fetchDiRete }) }),
  }
  registro = createSessionRegistry(opzioniRegistro)
  const app = createHttpApp({ senzaGettone: 'prove', staticHandler: async () => null, sessionRegistry: registro, impostazioniApp: servizio,
    listaTaskDisponibili: () => [{ id: 'sconto-a-scaglioni', progetto: 'p', difficolta: 1, consegnaCorta: 'x' }] })
  const server = createServer(app)
  await new Promise((ok, ko) => { server.once('error', ko); server.listen(0, '127.0.0.1', ok) })
  t.after(() => new Promise((ok) => { server.closeAllConnections?.(); server.close(() => ok()) }))
  const base = `http://127.0.0.1:${server.address().port}`
  const r = await fetch(`${base}/api/v1/sessions`, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ taskId: 'sconto-a-scaglioni', permessi, reasoning: { effort: 'high' } }) })
  assert.equal(r.status, 200)
  const { sessionId } = (await r.json()).data
  const eventi = []
  t.after(registro.iscriviti(sessionId, (e) => eventi.push(e)))
  const finito = () => eventi.some((e) => e.type === 'RunFinished' || e.type === 'RunError')
  const risposte = new Set()
  while (rispondi && !finito()) {
    const nuova = () => { const d = registro.domandaInAttesa(sessionId); return d?.tipo === 'approvazione' && !risposte.has(d.requestId) ? d : null }
    await attendi(() => finito() || nuova())
    const d = nuova()
    if (!d) break
    risposte.add(d.requestId)
    await rispondi({ registro, sessionId, requestId: d.requestId, base, app })
  }
  if (rispondi) assert.ok(risposte.size >= 1, `nessuna carta: ${JSON.stringify(eventi.map((e) => e.name ?? e.type))}`)
  await attendi(() => eventi.some((e) => e.type === 'RunFinished' || e.type === 'RunError'))
  const diagnosi = JSON.stringify(eventi.map((e) => (e.type === 'RunError' ? `${e.code}: ${e.message}` : e.name ?? e.type)))
  const esito = eventi.find((e) => e.type === 'ToolCallResult' && e.toolCallId === 'call-set')
  const cambio = eventi.find((e) => e.name === 'talos.impostazioni-sessione' && e.value?.origine?.tipo === 'modello')
  return { registro, servizio, sessionId, eventi, esito, cambio, diagnosi, base, app, store, opzioniRegistro, corpi: f.corpi }
}
const finestra = (base) => ({ 'content-type': 'application/json', origin: base, 'sec-fetch-site': 'same-origin' })

test('CONF-01: dalla finestra del PC la ROTTA stampa «finestra-pc», nella ricevuta e nell\'evento; il modello non lo legge (Performance 2)', async (t) => {
  const g = await giro(t, {
    rispondi: async ({ base, sessionId, requestId }) => {
      const r = await fetch(`${base}/api/v1/sessions/${sessionId}/approve`, { method: 'POST', headers: finestra(base), body: JSON.stringify({ requestId, approvato: true }) })
      assert.equal(r.status, 200, await r.text())
    },
  })
  assert.ok(g.esito, g.diagnosi)
  assert.match(g.esito.content, /^conversation\.reasoningEffort: "high" → "low"/u)
  const [ricevuta] = await g.servizio.ricevute()
  assert.deepEqual(ricevuta.confermatoDa, { tipo: 'finestra-pc' })
  assert.ok(g.cambio, g.diagnosi)
  assert.deepEqual(g.cambio.value.confermatoDa, { tipo: 'finestra-pc' })
  assert.deepEqual(g.cambio.value.origine, { tipo: 'modello', sessionId: g.sessionId, dispositivoId: null }, 'l\'origine di prima non cambia forma (contratto Mobile 5)')
  /* Performance 2: il testo che il modello legge resta la riga d'esito di oggi */
  assert.doesNotMatch(g.esito.content, /confermatoDa|finestra-pc|confirmed by/iu)
  assert.ok(g.corpi.length >= 3, 'il giro ha richiamato il modello dopo l\'esito')
  for (const corpo of g.corpi) assert.doesNotMatch(corpo, /finestra-pc|confermatoDa/u)
})

test('CONF-02: dal ponte (origine remota in processo, senza una richiesta HTTP vera) ⇒ «dispositivo» col SUO id, non quello del giro', async (t) => {
  const g = await giro(t, {
    rispondi: async ({ app, sessionId, requestId }) => {
      const chiama = creaChiamataInterna({ httpApp: app, porta: 1 })
      await chiama({ metodo: 'POST', percorso: `/api/v1/sessions/${sessionId}/approve`, corpo: { requestId, approvato: true }, origineRemota: { dispositivoId: 'pad-di-nino' } })
    },
  })
  assert.ok(g.esito, g.diagnosi)
  const [ricevuta] = await g.servizio.ricevute()
  assert.deepEqual(ricevuta.confermatoDa, { tipo: 'dispositivo', dispositivoId: 'pad-di-nino' })
  assert.equal(ricevuta.origine.dispositivoId, null, 'il giro è partito dal PC: il dispositivo del giro resta null')
  assert.deepEqual(g.cambio.value.confermatoDa, { tipo: 'dispositivo', dispositivoId: 'pad-di-nino' })
  assert.doesNotMatch(g.esito.content, /pad-di-nino|dispositivo/u)
})

test('CONF-03 (CLI b): chiamata diretta al registro senza il campo ⇒ null, mai dedotto; e il quarto argomento stringa o {motivo} resta valido (CLI a)', async (t) => {
  const g = await giro(t, { rispondi: async ({ registro, sessionId, requestId }) => { assert.deepEqual(registro.rispondiApprovazione(sessionId, requestId, true), { ok: true }) } })
  assert.ok(g.esito, g.diagnosi)
  const [ricevuta] = await g.servizio.ricevute()
  assert.ok(Object.hasOwn(ricevuta, 'confermatoDa'), 'il campo c\'è sempre')
  assert.equal(ricevuta.confermatoDa, null)
  assert.ok(Object.hasOwn(g.cambio.value, 'confermatoDa'))
  assert.equal(g.cambio.value.confermatoDa, null)
  /* un no con la forma della CLI: stringa, poi oggetto con il motivo */
  const no = await giro(t, { rispondi: async ({ registro, sessionId, requestId }) => { assert.deepEqual(registro.rispondiApprovazione(sessionId, requestId, false, 'Denied: not interactive.'), { ok: true }) } })
  assert.match(no.esito.content, /REFUSED\. Denied: not interactive\./u)
  assert.deepEqual(await no.servizio.ricevute(), [], 'un no non scrive ricevute')
  const noOggetto = await giro(t, { rispondi: async ({ registro, sessionId, requestId }) => { assert.deepEqual(registro.rispondiApprovazione(sessionId, requestId, false, { motivo: 'not now' }), { ok: true }) } })
  assert.match(noOggetto.esito.content, /REFUSED\. not now/u)
})

test('CONF-04: in Accesso pieno la carta non c\'è ⇒ «nessuno», motivo «accesso-pieno»', async (t) => {
  const g = await giro(t, { permessi: 'Full access' })
  assert.ok(g.esito, g.diagnosi)
  const [ricevuta] = await g.servizio.ricevute()
  assert.deepEqual(ricevuta.confermatoDa, { tipo: 'nessuno', motivo: 'accesso-pieno' })
  assert.deepEqual(g.cambio.value.confermatoDa, { tipo: 'nessuno', motivo: 'accesso-pieno' })
  assert.doesNotMatch(g.esito.content, /accesso-pieno|nessuno/u)
})

/* 02/11/2026 notte (Desktop per l'owner, domanda 3 delle cure REV8): in Accesso pieno, una chiamata scritta come testo che la persona ha
   approvato sulla carta del testo ⇒ la ricevuta dice chi l'ha approvata; senza quel sì resta «nessuno, accesso pieno» (CONF-04). */
test('CONF-10: Accesso pieno + sì alla carta del testo ⇒ la ricevuta dice chi ha detto sì; senza quel sì ⇒ «nessuno»', async () => {
  const cartella = await mkdtemp(join(tmpdir(), 'talos-conf-10-'))
  try {
    const stato = { motore: 'legacy', modelloDelRiassunto: null, riservaDelRiassunto: null }
    const fonti = { contesto: { leggi: async () => ({ ...stato }), scrivi: async (p) => { Object.assign(stato, p) } } }
    const servizio = creaServizioImpostazioni({ fonti, fileRicevute: join(cartella, 'ricevute.json') })
    const conferme = new Map([['daTesto-1', { tipo: 'finestra-pc' }]])
    const fn = servizio.perLaSessione({ sessionId: 's1', confermatoDaFn: (id) => conferme.get(id) ?? null })
    const rev = async () => Number(/Revision (\d+)/u.exec((await fn('app_settings', { action: 'list', section: 'context' })).testo)[1])
    const primo = await fn('app_settings', { action: 'set', changes: [{ key: 'context.engine', value: 'engine' }], expected_revision: await rev() }, { fase: 'esegui', senzaCarta: true, toolCallId: 'daTesto-1' })
    assert.equal(primo.ok, true, JSON.stringify(primo))
    const secondo = await fn('app_settings', { action: 'set', changes: [{ key: 'context.engine', value: 'legacy' }], expected_revision: await rev() }, { fase: 'esegui', senzaCarta: true, toolCallId: 'call-nativa' })
    assert.equal(secondo.ok, true, JSON.stringify(secondo))
    const ricevute = await servizio.ricevute()
    const di = (valore) => ricevute.find((r) => JSON.stringify(r).includes(`"${valore}"`) && r.cambi?.some?.((c) => c.dopo === valore))
    assert.deepEqual(di('engine')?.confermatoDa, { tipo: 'finestra-pc' }, `chi ha detto sì al testo: ${JSON.stringify(ricevute)}`)
    assert.deepEqual(di('legacy')?.confermatoDa, { tipo: 'nessuno', motivo: 'accesso-pieno' }, 'una chiamata senza il sì del testo resta «nessuno»')
  } finally { await rimuoviCartellaDiProvaAttesa(cartella) }
})

test('CONF-05 (Mobile): vince il primo sì — un sì dal telefono a una carta già risolta sul PC non scrive una seconda ricevuta né cambia confermatoDa', async (t) => {
  let secondo = null
  const g = await giro(t, {
    rispondi: async ({ base, app, sessionId, requestId }) => {
      const r = await fetch(`${base}/api/v1/sessions/${sessionId}/approve`, { method: 'POST', headers: finestra(base), body: JSON.stringify({ requestId, approvato: true }) })
      assert.equal(r.status, 200)
      const chiama = creaChiamataInterna({ httpApp: app, porta: 1 })
      secondo = await chiama({ metodo: 'POST', percorso: `/api/v1/sessions/${sessionId}/approve`, corpo: { requestId, approvato: true }, origineRemota: { dispositivoId: 'pad' } }).then(() => 'ok', (e) => e.code)
    },
  })
  assert.ok(g.esito, g.diagnosi)
  assert.equal(secondo, 'APPROVAL_NOT_PENDING')
  await new Promise((r) => setTimeout(r, 50))
  const ricevute = await g.servizio.ricevute()
  assert.equal(ricevute.length, 1)
  assert.deepEqual(ricevute[0].confermatoDa, { tipo: 'finestra-pc' })
  assert.equal(g.eventi.filter((e) => e.name === 'talos.impostazioni-sessione' && e.value?.origine?.tipo === 'modello').length, 1)
})

test('CONF-05b (Mobile): la corsa stretta — due sì nello STESSO istante, prima che il giro riparta: il secondo non tocca niente', async (t) => {
  let secondo = null
  const g = await giro(t, {
    rispondi: async ({ registro, sessionId, requestId }) => {
      assert.deepEqual(registro.rispondiApprovazione(sessionId, requestId, true, { confermatoDa: { tipo: 'finestra-pc' } }), { ok: true })
      secondo = registro.rispondiApprovazione(sessionId, requestId, true, { confermatoDa: { tipo: 'dispositivo', dispositivoId: 'pad' } })
    },
  })
  assert.ok(g.esito, g.diagnosi)
  assert.equal(secondo?.code, 'APPROVAL_NOT_PENDING')
  const ricevute = await g.servizio.ricevute()
  assert.equal(ricevute.length, 1)
  assert.deepEqual(ricevute[0].confermatoDa, { tipo: 'finestra-pc' })
  assert.deepEqual(g.cambio.value.confermatoDa, { tipo: 'finestra-pc' })
})

test('CONF-06 (Mobile): la rigiocata dell\'evento quando il telefono riapre la sessione porta lo STESSO confermatoDa, anche dal disco', async (t) => {
  const g = await giro(t, {
    cartellaStore: true,
    rispondi: async ({ app, sessionId, requestId }) => {
      const chiama = creaChiamataInterna({ httpApp: app, porta: 1 })
      await chiama({ metodo: 'POST', percorso: `/api/v1/sessions/${sessionId}/approve`, corpo: { requestId, approvato: true }, origineRemota: { dispositivoId: 'pad' } })
    },
  })
  assert.ok(g.esito, g.diagnosi)
  const atteso = { tipo: 'dispositivo', dispositivoId: 'pad' }
  /* il telefono riapre: un iscritto nuovo riceve la rigiocata */
  const rigiocati = []
  g.registro.iscriviti(g.sessionId, (e) => rigiocati.push(e))()
  assert.deepEqual(rigiocati.find((e) => e.name === 'talos.impostazioni-sessione' && e.value?.origine?.tipo === 'modello')?.value?.confermatoDa, atteso)
  /* e dopo un riavvio, dal disco */
  await g.registro.chiudi()
  const riaperto = createSessionRegistry({ promuoviDalTesto: true, ...g.opzioniRegistro, impostazioniApp: null })
  await riaperto.ripristina()
  const dalDisco = []
  riaperto.iscriviti(g.sessionId, (e) => dalDisco.push(e))()
  assert.deepEqual(dalDisco.find((e) => e.name === 'talos.impostazioni-sessione' && e.value?.origine?.tipo === 'modello')?.value?.confermatoDa, atteso)
})

test('CONF-08: le tre porte della conversazione (impostazioni, dove girano i comandi, comandi «!») portano tutte confermatoDa nel loro evento', async (t) => {
  const dalPad = async ({ app, sessionId, requestId }) => {
    await creaChiamataInterna({ httpApp: app, porta: 1 })({ metodo: 'POST', percorso: `/api/v1/sessions/${sessionId}/approve`, corpo: { requestId, approvato: true }, origineRemota: { dispositivoId: 'pad' } })
  }
  const g = await giro(t, { rispondi: dalPad, cambi: [...SFORZO_BASSO, { key: 'conversation.commandShell', value: 'windows' }, { key: 'conversation.bangCommandsInChat', value: true }] })
  assert.ok(g.esito, g.diagnosi)
  assert.equal(g.esito.content.split('\n').length, 3, g.esito.content)
  const dalModello = g.eventi.filter((e) => e.name === 'talos.impostazioni-sessione' && e.value?.origine?.tipo === 'modello')
  assert.equal(dalModello.length, 3, 'un evento per porta')
  for (const e of dalModello) assert.deepEqual(e.value.confermatoDa, { tipo: 'dispositivo', dispositivoId: 'pad' }, JSON.stringify(e.value.istantanea?.doveGiranoIComandi))
  const istantanea = dalModello.at(-1).value.istantanea
  assert.equal(istantanea.doveGiranoIComandi, 'windows')
  assert.equal(istantanea.comandiNellaConversazione, true)
})

test('CONF-09: anche l\'Annulla del modello dice chi l\'ha confermato, nella ricevuta nuova e nella vecchia segnata annullata', async (t) => {
  let n = 0
  const g = await giro(t, {
    poiAnnulla: true,
    rispondi: async ({ base, app, sessionId, requestId }) => {
      if (n++ === 0) {
        const r = await fetch(`${base}/api/v1/sessions/${sessionId}/approve`, { method: 'POST', headers: finestra(base), body: JSON.stringify({ requestId, approvato: true }) })
        assert.equal(r.status, 200)
      } else {
        await creaChiamataInterna({ httpApp: app, porta: 1 })({ metodo: 'POST', percorso: `/api/v1/sessions/${sessionId}/approve`, corpo: { requestId, approvato: true }, origineRemota: { dispositivoId: 'pad' } })
      }
    },
  })
  const annullo = g.eventi.find((e) => e.type === 'ToolCallResult' && e.toolCallId === 'call-undo')
  assert.ok(annullo, g.diagnosi)
  assert.match(annullo.content, /\(undone\)/u)
  const [nuova, vecchia] = await g.servizio.ricevute()
  assert.deepEqual(nuova.confermatoDa, { tipo: 'dispositivo', dispositivoId: 'pad' })
  assert.deepEqual(vecchia.confermatoDa, { tipo: 'finestra-pc' }, 'la prima resta di chi l\'ha confermata')
  assert.deepEqual(vecchia.annullata.confermatoDa, { tipo: 'dispositivo', dispositivoId: 'pad' })
  const eventi = g.eventi.filter((e) => e.name === 'talos.impostazioni-sessione' && e.value?.origine?.tipo === 'modello').map((e) => e.value.confermatoDa)
  assert.deepEqual(eventi, [{ tipo: 'finestra-pc' }, { tipo: 'dispositivo', dispositivoId: 'pad' }])
})

test('CONF-07 AL CONTRARIO: un client non può dichiararsi «dispositivo» col corpo della richiesta — lo dice solo l\'origine della richiesta', async (t) => {
  const g = await giro(t, {
    rispondi: async ({ base, sessionId, requestId }) => {
      const r = await fetch(`${base}/api/v1/sessions/${sessionId}/approve`, { method: 'POST', headers: finestra(base),
        body: JSON.stringify({ requestId, approvato: true, confermatoDa: { tipo: 'dispositivo', dispositivoId: 'finto' } }) })
      if (r.status !== 200) {
        /* corpo rifiutato: la domanda resta aperta e si risponde senza il campo */
        await fetch(`${base}/api/v1/sessions/${sessionId}/approve`, { method: 'POST', headers: finestra(base), body: JSON.stringify({ requestId, approvato: true }) })
      }
    },
  })
  assert.ok(g.esito, g.diagnosi)
  const [ricevuta] = await g.servizio.ricevute()
  assert.deepEqual(ricevuta.confermatoDa, { tipo: 'finestra-pc' })
})
