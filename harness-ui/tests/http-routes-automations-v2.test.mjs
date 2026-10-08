/**
 * Automazioni a due porte (owner 08/10/2026 notte) — il livello HTTP delle voci v2: forma dei corpi, codici d'errore, rotte
 * nuove (modifica, esegui, ferma, storico, «Da guardare», letta). Negozio VERO su una cartella temporanea; lo scheduler è un
 * doppio, provato a parte in `automation-scheduler-v2.test.mjs`.
 */
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { createAutomationStore } from '../src/automation-store.mjs'
import { createHttpApp } from '../src/http-app.mjs'
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs'

async function listen(t) {
  const dati = mkdtempSync(join(tmpdir(), 'talos-http-auto-v2-'))
  const lavoro = mkdtempSync(join(tmpdir(), 'talos-http-auto-lavoro-'))
  t.after(() => { rimuoviCartellaDiProva(dati); rimuoviCartellaDiProva(lavoro) })
  const store = createAutomationStore({ cartella: dati, clock: () => new Date('2026-10-08T21:30:00.000Z') })
  const chiamate = []
  const scheduler = {
    stato: 'libero',
    async eseguiOra(id, opzioni) { chiamate.push(['esegui', id, opzioni]); return this.stato === 'occupato' ? { ok: false, code: 'AUTOMATION_RUN_IN_PROGRESS' } : { ok: true, runId: 'r1', sessionId: 's1' } },
    async fermaGiro(id) { chiamate.push(['ferma', id]); return { ok: true, sessionId: 's1' } },
  }
  const server = createServer(createHttpApp({ staticHandler: async () => null, automationStore: store, automationScheduler: scheduler }))
  await new Promise((ok, ko) => { server.once('error', ko); server.listen(0, '127.0.0.1', ok) })
  t.after(() => new Promise((ok) => server.close(ok)))
  const base = `http://127.0.0.1:${server.address().port}`
  // Y3 (08/10 sera): le scritture sulle automazioni vogliono la finestra di TALOS (o il gettone) — la prova si presenta come lei
  const finestra = { origin: base, 'sec-fetch-site': 'same-origin' }
  const post = async (percorso, corpo, intestazioni = finestra) => {
    const r = await fetch(`${base}${percorso}`, { method: 'POST', headers: { 'content-type': 'application/json', ...intestazioni }, body: JSON.stringify(corpo) })
    return { status: r.status, corpo: await r.json() }
  }
  const get = async (percorso) => { const r = await fetch(`${base}${percorso}`); return { status: r.status, corpo: await r.json() } }
  return { store, scheduler, chiamate, lavoro, post, get }
}
const voce = (lavoro, extra = {}) => ({ nome: 'Dipendenze', istruzioni: 'Controlla le dipendenze.', cartella: lavoro,
  pianificazione: { tipo: 'giornaliera', ora: '09:00' }, fusoOrario: 'Europe/Rome', ...extra })

test('HTTP2-01 — crea v2: 200 accesa con origine «interfaccia»; ogni rifiuto col suo codice', async (t) => {
  const { post, lavoro } = await listen(t)
  const ok = await post('/api/v1/automations', voce(lavoro))
  assert.equal(ok.status, 200)
  assert.equal(ok.corpo.data.versione, 2)
  assert.equal(ok.corpo.data.attiva, true)
  assert.deepEqual(ok.corpo.data.origine, { tipo: 'interfaccia' })
  assert.equal(ok.corpo.data.prossimaEsecuzione, '2026-10-09T07:00:00.000Z')
  const casi = [
    [voce(join(lavoro, 'non-esiste')), 422, 'AUTOMATION_FOLDER_UNAVAILABLE'],
    [voce(lavoro, { pianificazione: { tipo: 'ogni-n-minuti', minuti: 1 } }), 422, 'AUTOMATION_SCHEDULE_TOO_FREQUENT'],
    [voce(lavoro, { pianificazione: { tipo: 'cron', espressione: '0 0 9 * * *' } }), 422, 'AUTOMATION_CRON_FIELDS'],
    [voce(lavoro, { pianificazione: { tipo: 'una-volta', quando: '2026-01-01T09:00' } }), 422, 'AUTOMATION_SCHEDULE_PAST'],
    [voce(lavoro, { fusoOrario: 'Marte/Olimpo' }), 422, 'AUTOMATION_TIMEZONE_INVALID'],
    [voce(lavoro, { origine: { tipo: 'chat' } }), 400, 'QUERY_INVALID'], // l'origine la mette il server, mai il client
    [voce(lavoro, { taskId: 'x' }), 400, 'QUERY_INVALID'],
    [{ ...voce(lavoro), nome: undefined }, 400, 'QUERY_INVALID'],
  ]
  for (const [corpo, status, codice] of casi) {
    const r = await post('/api/v1/automations', corpo)
    assert.equal(r.status, status, `${codice}: ${JSON.stringify(r.corpo)}`)
    assert.equal(r.corpo.error?.code, codice)
  }
})

test('HTTP2-02 — modifica: solo i campi ammessi, la cartella verificata; una v1 dice «vecchio formato»; un id ignoto 404', async (t) => {
  const { post, lavoro, store } = await listen(t)
  const { corpo: { data: v } } = await post('/api/v1/automations', voce(lavoro))
  const m = await post(`/api/v1/automations/${v.id}/modifica`, { istruzioni: 'Solo il ramo main.', pianificazione: { tipo: 'manuale' } })
  assert.equal(m.status, 200)
  assert.equal(m.corpo.data.istruzioni, 'Solo il ramo main.')
  assert.equal(m.corpo.data.prossimaEsecuzione, null)
  assert.equal((await post(`/api/v1/automations/${v.id}/modifica`, { attiva: false })).status, 400)
  assert.equal((await post(`/api/v1/automations/${v.id}/modifica`, { cartella: join(lavoro, 'no') })).corpo.error.code, 'AUTOMATION_FOLDER_UNAVAILABLE')
  assert.equal((await post('/api/v1/automations/nessuna/modifica', { nome: 'x' })).status, 404)
  const v1 = await store.crea({ taskId: 'verifica-catalogo', intervalloMinuti: 30 })
  const vecchia = await post(`/api/v1/automations/${v1.id}/modifica`, { nome: 'x' })
  assert.equal(vecchia.status, 409)
  assert.equal(vecchia.corpo.error.code, 'AUTOMATION_LEGACY')
})

test('HTTP2-03 — esegui ora (col contesto) e ferma passano dallo scheduler; un giro vivo è 409', async (t) => {
  const { post, lavoro, scheduler, chiamate } = await listen(t)
  const { corpo: { data: v } } = await post('/api/v1/automations', voce(lavoro))
  const e = await post(`/api/v1/automations/${v.id}/esegui`, { contesto: 'Solo main.' })
  assert.equal(e.status, 200)
  assert.deepEqual(chiamate[0], ['esegui', v.id, { contesto: 'Solo main.' }])
  scheduler.stato = 'occupato'
  const occupato = await post(`/api/v1/automations/${v.id}/esegui`, {})
  assert.equal(occupato.status, 409)
  assert.equal(occupato.corpo.error.code, 'AUTOMATION_RUN_IN_PROGRESS')
  assert.equal((await post(`/api/v1/automations/${v.id}/esegui`, { contesto: 'x'.repeat(4001) })).status, 400)
  assert.equal((await post(`/api/v1/automations/${v.id}/ferma`, {})).status, 200)
  assert.deepEqual(chiamate.at(-1), ['ferma', v.id])
})

test('HTTP2-04 — lo storico, «Da guardare» e «letto»', async (t) => {
  const { post, get, lavoro, store } = await listen(t)
  const { corpo: { data: v } } = await post('/api/v1/automations', voce(lavoro))
  await store.apriGiro(v.id, { runId: 'g1', previstaAlle: null, sessionId: 's1' })
  await store.chiudiGiro(v.id, 'g1', { esito: 'finita', riassunto: 'Due pacchetti vecchi.', daGuardare: true })
  const giri = await get(`/api/v1/automations/${v.id}/runs`)
  assert.equal(giri.status, 200)
  assert.equal(giri.corpo.data.items[0].riassunto, 'Due pacchetti vecchi.')
  assert.equal((await get('/api/v1/automations/nessuna/runs')).status, 404)
  const inbox = await get('/api/v1/automations/inbox')
  assert.deepEqual(inbox.corpo.data.items.map((g) => [g.automazioneId, g.runId, g.nome]), [[v.id, 'g1', 'Dipendenze']])
  assert.equal((await post(`/api/v1/automations/${v.id}/runs/g1/letta`, {})).status, 200)
  assert.deepEqual((await get('/api/v1/automations/inbox')).corpo.data.items, [])
  assert.equal((await post(`/api/v1/automations/${v.id}/runs/nessuno/letta`, {})).status, 404)
  // la rotta della proposta (decisione 13) è nell'inventario: un metodo sbagliato è 405, non «non esiste» (review del GUARDIANO)
  assert.equal((await get(`/api/v1/automations/${v.id}/runs/g1/proposta`)).status, 405)
  assert.equal((await get(`/api/v1/automations/${v.id}/runs/g1/letta`)).status, 405)
})

test('HTTP2-05 — eliminare un\'automazione col giro in corso FERMA il giro; senza giro non chiama lo scheduler', async (t) => {
  const { post, lavoro, store, chiamate } = await listen(t)
  const { corpo: { data: ferma } } = await post('/api/v1/automations', voce(lavoro))
  await store.apriGiro(ferma.id, { runId: 'r-vivo', sessionId: 's-vivo' })
  assert.equal((await post(`/api/v1/automations/${ferma.id}/elimina`, {})).status, 200)
  assert.deepEqual(chiamate, [['ferma', ferma.id]], 'il giro vivo si ferma prima di eliminare')
  assert.equal(await store.leggi(ferma.id), null)
  // al contrario: nessun giro in corso, nessuna chiamata
  const { corpo: { data: ferma2 } } = await post('/api/v1/automations', voce(lavoro))
  assert.equal((await post(`/api/v1/automations/${ferma2.id}/elimina`, {})).status, 200)
  assert.deepEqual(chiamate, [['ferma', ferma.id]], 'senza giro lo scheduler non si tocca')
})
