/**
 * Automazioni a due porte (owner 08/10/2026 notte) — lo scheduler delle voci v2, col NEGOZIO VERO su una cartella temporanea
 * e un registro finto che risponde come quello vero (`avviaGiroAutomazione`, `statoGiroAutomazione`,
 * `leggiEsitoSessioneDiPasso`, `ferma`). Le voci v1 restano provate in `automation-scheduler.test.mjs`.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createAutomationStore } from '../src/automation-store.mjs'
import { createAutomationScheduler } from '../src/automation-scheduler.mjs'
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs'

const ROMA = 'Europe/Rome'
const CARTELLA = process.platform === 'win32' ? 'C:\\progetti\\demo' : '/progetti/demo'

function registroFinto() {
  const r = {
    giri: [], stati: new Map(), fermate: [], esitiFile: {}, rifiuto: null,
    avviaGiroAutomazione(arg) {
      if (r.rifiuto) return r.rifiuto
      let risolvi
      const fine = new Promise((ok) => { risolvi = ok })
      const sessionId = `s${r.giri.length + 1}`
      r.stati.set(sessionId, 'in-corso')
      r.giri.push({ arg, sessionId, chiudi: (esito) => { r.stati.set(sessionId, 'finita'); risolvi({ sessionId, ...esito }) } })
      return { sessionId, fine }
    },
    statoGiroAutomazione: (id) => r.stati.get(id) ?? null,
    leggiEsitoSessioneDiPasso: async ({ sessionId }) => r.esitiFile[sessionId] ?? null,
    ferma: (id, opzioni) => { r.fermate.push([id, opzioni]) },
  }
  return r
}

function scena(t, { adesso = '2026-10-08T21:30:00.000Z' } = {}) {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-sched-v2-'))
  t.after(() => rimuoviCartellaDiProva(cartella))
  const orologio = { ora: new Date(adesso) }
  const clock = () => new Date(orologio.ora)
  const store = createAutomationStore({ cartella, clock })
  const registro = registroFinto()
  const finiti = []
  const scheduler = createAutomationScheduler({ store, sessionRegistry: registro, clock, onGiroFinito: (g) => finiti.push(g) })
  return { store, registro, scheduler, orologio, finiti }
}
const v2 = (extra = {}) => ({ nome: 'Dipendenze', istruzioni: 'Controlla le dipendenze.', cartella: CARTELLA, fusoOrario: ROMA,
  pianificazione: { tipo: 'ogni-n-minuti', minuti: 30 }, ...extra })
/* le scritture vere su disco non stanno in un numero fisso di giri del ciclo: si aspetta a tempo, fino a 3 s */
async function attendi(condizione, messaggio = 'condizione') {
  const limite = Date.now() + 3000
  while (Date.now() < limite) {
    if (await condizione()) return
    await new Promise((ok) => setTimeout(ok, 5))
  }
  assert.fail(`mai vera: ${messaggio}`)
}

test('SCHED2-01 — all\'ora giusta parte UN giro: istruzioni avvolte, cartella, permessi, modello, Coordinazione; il rapporto va in «Da guardare»', async (t) => {
  const { store, registro, scheduler, orologio, finiti } = scena(t)
  const voce = await store.crea(v2({ modello: 'z-ai/glm-5.3-flash', coordinazione: true }))
  await scheduler.unTick()
  assert.equal(registro.giri.length, 0, 'prima dell\'ora non parte')
  orologio.ora = new Date('2026-10-08T22:00:05.000Z')
  await scheduler.unTick()
  await scheduler.unTick()
  assert.equal(registro.giri.length, 1, 'un giro solo anche con due tick')
  const { arg } = registro.giri[0]
  assert.equal(arg.cartella, CARTELLA)
  assert.equal(arg.permessi, 'Workspace write')
  assert.equal(arg.modello, 'z-ai/glm-5.3-flash')
  assert.deepEqual(arg.permessiPerAttrezzo, { delega_sottotask: 'sempre' })
  assert.ok(arg.consegna.startsWith('[IMPORTANT: You are running as a scheduled TALOS automation ("Dipendenze", run 1).'))
  assert.ok(arg.consegna.endsWith('Controlla le dipendenze.'))
  registro.giri[0].chiudi({ esito: 'succeeded', testoFinale: 'Due pacchetti vecchi: lodash, chalk.' })
  await attendi(async () => finiti.length === 1, 'giro chiuso')
  const [giro] = await store.giri(voce.id)
  assert.equal(giro.esito, 'finita')
  assert.equal(giro.ritardo, 'in-orario')
  assert.equal(giro.riassunto, 'Due pacchetti vecchi: lodash, chalk.')
  assert.deepEqual((await store.daGuardare()).map((g) => g.runId), [giro.runId])
  assert.equal((await store.leggi(voce.id)).giroInCorso, null)
})

test('SCHED2-02 — [SILENT]: finita, archiviata, nessun «Da guardare"; [AUTOMATION_FAILURE]: fallita, col perché', async (t) => {
  const { store, registro, scheduler, finiti } = scena(t)
  const a = await store.crea(v2({ pianificazione: { tipo: 'manuale' } }))
  await scheduler.eseguiOra(a.id)
  registro.giri[0].chiudi({ esito: 'succeeded', testoFinale: '[SILENT]' })
  await attendi(async () => finiti.length === 1)
  assert.equal(finiti[0].silenzio, true)
  assert.equal((await store.giri(a.id))[0].daGuardare, false)
  await scheduler.eseguiOra(a.id)
  registro.giri[1].chiudi({ esito: 'succeeded', testoFinale: '[AUTOMATION_FAILURE]\nLa cartella è vuota.' })
  await attendi(async () => finiti.length === 2)
  const [ultimo] = await store.giri(a.id)
  assert.equal(ultimo.esito, 'fallita')
  assert.equal(ultimo.motivo, 'dichiarato')
  assert.equal(ultimo.riassunto, 'La cartella è vuota.')
  assert.equal(ultimo.daGuardare, true)
})

test('SCHED2-03 — mai sovrapposti: con il giro precedente vivo, quello nuovo si scrive «saltato» e non parte', async (t) => {
  const { store, registro, scheduler, orologio } = scena(t)
  const voce = await store.crea(v2({ pianificazione: { tipo: 'ogni-n-minuti', minuti: 5 } }))
  orologio.ora = new Date('2026-10-08T21:35:00.000Z')
  await scheduler.unTick()
  assert.equal(registro.giri.length, 1)
  orologio.ora = new Date('2026-10-08T21:40:01.000Z')
  await scheduler.unTick()
  assert.equal(registro.giri.length, 1, 'il secondo non parte')
  const saltato = (await store.giri(voce.id)).find((g) => g.esito === 'saltata')
  assert.equal(saltato?.motivo, 'precedente-in-corso')
  assert.deepEqual(await scheduler.eseguiOra(voce.id), { ok: false, code: 'AUTOMATION_RUN_IN_PROGRESS' }, 'nemmeno a mano')
})

test('SCHED2-04 — ritardi come Hermes: oltre la grazia gira UNA volta («recupero»); oltre 7 giorni si salta; «una volta» persa si spegne', async (t) => {
  const { store, registro, scheduler, orologio } = scena(t)
  const ogniOra = await store.crea(v2({ pianificazione: { tipo: 'ogni-ora', minuto: 0 } }))
  orologio.ora = new Date('2026-10-09T03:10:00.000Z') // l'app era chiusa: persi diversi giri
  await scheduler.unTick()
  assert.equal(registro.giri.length, 1, 'uno solo, non uno per ogni giro perso')
  assert.equal((await store.giri(ogniOra.id))[0].ritardo, 'recupero')

  const s2 = scena(t)
  const vecchia = await s2.store.crea(v2({ pianificazione: { tipo: 'giornaliera', ora: '09:00' } }))
  s2.orologio.ora = new Date('2026-10-20T10:00:00.000Z')
  await s2.scheduler.unTick()
  assert.equal(s2.registro.giri.length, 0)
  assert.equal((await s2.store.giri(vecchia.id))[0].motivo, 'app-chiusa')

  const s3 = scena(t)
  const unaVolta = await s3.store.crea(v2({ pianificazione: { tipo: 'una-volta', quando: '2026-10-09T15:00' } }))
  s3.orologio.ora = new Date('2026-10-09T13:05:00.000Z') // cinque minuti oltre: la grazia di «una volta» è 120 s
  await s3.scheduler.unTick()
  assert.equal(s3.registro.giri.length, 0)
  const spenta = await s3.store.leggi(unaVolta.id)
  assert.equal(spenta.attiva, false)
  assert.equal(spenta.prossimaEsecuzione, null)
})

test('SCHED2-05 — un avvio rifiutato (cartella sparita) è un giro saltato da guardare, col motivo vero', async (t) => {
  const { store, registro, scheduler, orologio } = scena(t)
  const voce = await store.crea(v2())
  registro.rifiuto = { erroreAvvio: 'The path does not exist or cannot be reached: C:\\progetti\\demo', code: 'PROJECT_NOT_ALLOWED' }
  orologio.ora = new Date('2026-10-08T22:00:05.000Z')
  await scheduler.unTick()
  const [giro] = await store.giri(voce.id)
  assert.equal(giro.esito, 'saltata')
  assert.equal(giro.motivo, 'PROJECT_NOT_ALLOWED')
  assert.match(giro.dettaglio, /does not exist/u)
  assert.deepEqual((await store.daGuardare()).map((g) => g.runId), [giro.runId])
  assert.equal((await store.leggi(voce.id)).eseguite, 0, 'un giro mai partito non conta')
})

test('SCHED2-06 — 429 con l\'attesa dichiarata: in attesa fino alla riapertura; prima di allora non riparte', async (t) => {
  const { store, registro, scheduler, orologio, finiti } = scena(t)
  const voce = await store.crea(v2({ pianificazione: { tipo: 'ogni-n-minuti', minuti: 5 } }))
  orologio.ora = new Date('2026-10-08T21:35:00.000Z')
  await scheduler.unTick()
  registro.giri[0].chiudi({ esito: 'failed', classeErrore: 'traffico', messaggioErrore: 'HTTP 429 Too Many Requests: retry after 3600 s' })
  await attendi(async () => finiti.length === 1)
  const ferma = await store.leggi(voce.id)
  assert.equal(ferma.inAttesaFinoA, '2026-10-08T22:35:00.000Z')
  orologio.ora = new Date('2026-10-08T22:00:00.000Z')
  await scheduler.unTick()
  assert.equal(registro.giri.length, 1, 'in attesa: non riparte')
  orologio.ora = new Date('2026-10-08T22:35:01.000Z')
  await scheduler.unTick()
  assert.equal(registro.giri.length, 2, 'riaperto: riparte')
})

test('SCHED2-07 — un giro rimasto aperto da un riavvio si chiude dal FILE della sua sessione', async (t) => {
  const { store, registro, orologio, finiti } = scena(t)
  const voce = await store.crea(v2({ pianificazione: { tipo: 'manuale' } }))
  await store.apriGiro(voce.id, { runId: 'vecchio', previstaAlle: null, sessionId: 's-vecchia' })
  registro.esitiFile['s-vecchia'] = { esito: 'succeeded', testoFinale: 'Fatto prima del riavvio.' }
  const dopoIlRiavvio = createAutomationScheduler({ store, sessionRegistry: registro, clock: () => new Date(orologio.ora), onGiroFinito: (g) => finiti.push(g) })
  await dopoIlRiavvio.unTick()
  const [giro] = await store.giri(voce.id)
  assert.equal(giro.esito, 'finita')
  assert.equal(giro.riassunto, 'Fatto prima del riavvio.')
  assert.equal((await store.leggi(voce.id)).giroInCorso, null)
})

test('SCHED2-08 — esegui ora: anche da spenta, col contesto marcato come dato; v1 no; ferma il giro e uno stop tuo non disturba', async (t) => {
  const { store, registro, scheduler, finiti } = scena(t)
  const voce = await store.crea(v2())
  await store.imposta(voce.id, false)
  const esito = await scheduler.eseguiOra(voce.id, { contesto: 'Guarda solo il ramo main.' })
  assert.equal(esito.ok, true)
  assert.match(registro.giri[0].arg.consegna, /<run-context>\nGuarda solo il ramo main\.\n<\/run-context>$/u)
  assert.equal((await store.giri(voce.id))[0].manuale, true)
  assert.deepEqual(await scheduler.fermaGiro(voce.id), { ok: true, sessionId: 's1' })
  assert.deepEqual(registro.fermate, [['s1', { daChi: 'persona' }]])
  registro.giri[0].chiudi({ esito: 'cancelled', testoFinale: '' })
  await attendi(async () => finiti.length === 1)
  const [giro] = await store.giri(voce.id)
  assert.equal(giro.esito, 'fermata')
  assert.equal(giro.daGuardare, false)
  assert.deepEqual(await scheduler.fermaGiro(voce.id), { ok: false, code: 'AUTOMATION_NO_RUN_IN_PROGRESS' })
  const v1 = await store.crea({ taskId: 'verifica-catalogo', intervalloMinuti: 30 })
  assert.deepEqual(await scheduler.eseguiOra(v1.id), { ok: false, code: 'AUTOMATION_LEGACY' })
  assert.equal(await scheduler.eseguiOra('nessuna'), null)
})
