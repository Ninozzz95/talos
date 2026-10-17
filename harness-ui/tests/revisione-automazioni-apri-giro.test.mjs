/*
 * ⛔ REVISIONE AVVERSARIA (bugfixer, 15/10/2026) — `fix/automazioni-apri-giro` 4bbc8314c (S3/S4 della CLI in `avviaGiroV2`).
 *  - AUTO-APRI-REV-01 (S3): quando `apriGiro` lancia, lo scheduler ferma la sessione e rilancia l'errore SENZA attaccare niente a
 *    `avvio.fine`. Se poi `fine` si rifiuta (il registro vero la rifiuta quando non riesce a rileggere il file della sessione: lo stesso
 *    disco malato che ha fatto fallire `apriGiro`), il rifiuto non ha nessun gestore: nel server (nessun `unhandledRejection` globale)
 *    Node chiude il processo.
 *  - AUTO-APRI-REV-02 (S4): nel tick AUTOMATICO il guasto si inghiotte (`eseguiTick`, «il prossimo tick riprova») e, col posto ora
 *    liberato, OGNI tick fa partire una sessione nuova e la ferma: con un negozio che non apre, un giro ogni 30 s, per sempre, senza
 *    una riga nello storico. Prima della cura `inVolo` restava pieno e non ripartiva niente.
 * Rapporto: `handoff-talos-2026-09-27/bugfixer/RAPPORTO-REVISIONE-TRE-CURE-2026-10-15.md`.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createAutomationStore } from '../src/automation-store.mjs'
import { createAutomationScheduler } from '../src/automation-scheduler.mjs'
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs'

const CARTELLA = process.platform === 'win32' ? 'C:\\progetti\\demo' : '/progetti/demo'
const v2 = (extra = {}) => ({ nome: 'Dipendenze', istruzioni: 'Controlla le dipendenze.', cartella: CARTELLA, fusoOrario: 'Europe/Rome',
  pianificazione: { tipo: 'ogni-n-minuti', minuti: 30 }, ...extra })
const eio = () => Object.assign(new Error('EIO: i/o error, read'), { code: 'AUTOMATION_STORE_READ_FAILED' })

function registroFinto() {
  const r = {
    giri: [], fermate: [],
    avviaGiroAutomazione(arg) {
      let risolvi; let rifiuta
      const fine = new Promise((ok, ko) => { risolvi = ok; rifiuta = ko })
      const sessionId = `s${r.giri.length + 1}`
      r.giri.push({ arg, sessionId, risolvi, rifiuta })
      return { sessionId, fine }
    },
    statoGiroAutomazione: () => null,
    leggiEsitoSessioneDiPasso: async () => null,
    ferma: (id, opzioni) => { r.fermate.push([id, opzioni]) },
  }
  return r
}
function scena(t, { adesso = '2026-10-08T21:30:00.000Z' } = {}) {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-apri-rev-'))
  t.after(() => rimuoviCartellaDiProva(cartella))
  const orologio = { ora: new Date(adesso) }
  const clock = () => new Date(orologio.ora)
  const vero = createAutomationStore({ cartella, clock })
  const store = { ...vero, apriGiro: () => Promise.reject(eio()) } // il negozio che non apre
  const registro = registroFinto()
  const scheduler = createAutomationScheduler({ store, sessionRegistry: registro, clock, onGiroFinito: () => {} })
  return { vero, registro, scheduler, orologio }
}

test('AUTO-APRI-REV-01 (S3) — `apriGiro` lancia e poi la `fine` della sessione fermata si rifiuta: nessun rifiuto resta senza gestore', async (t) => {
  const orfani = []
  const spia = (motivo) => { orfani.push(motivo) }
  process.on('unhandledRejection', spia)
  t.after(() => process.off('unhandledRejection', spia))
  const { vero, registro, scheduler } = scena(t)
  const voce = await vero.crea(v2({ pianificazione: { tipo: 'manuale' } }))
  await assert.rejects(scheduler.eseguiOra(voce.id), /EIO/u, 'premessa: il guasto arriva a chi chiede')
  assert.equal(registro.fermate.length, 1, 'premessa: la sessione si ferma')
  registro.giri[0].rifiuta(Object.assign(new Error('The automation run file cannot be read'), { code: 'SESSION_STORE_READ_FAILED' }))
  await new Promise((r) => setTimeout(r, 50))
  assert.deepEqual(orfani.map((e) => e?.message ?? String(e)), [], 'the end of the stopped session rejected with no handler: in the server this kills the process')
})

test('AUTO-APRI-REV-02 (S4) — tick AUTOMATICO con un negozio che non apre: non riparte una sessione nuova a ogni tick', async (t) => {
  const { vero, registro, scheduler, orologio } = scena(t)
  await vero.crea(v2()) // ogni 30 minuti
  orologio.ora = new Date('2026-10-08T22:00:05.000Z') // il giro è dovuto
  for (let i = 0; i < 4; i += 1) await scheduler.unTick()
  for (const g of registro.giri) g.risolvi({ sessionId: g.sessionId, esito: 'stopped' })
  assert.ok(registro.giri.length >= 1, 'premessa: il primo tick prova a partire')
  assert.equal(registro.giri.length, 1, `${registro.giri.length} sessions started and stopped in 4 ticks of the same due run: with a store that cannot open, one every 30 s forever`)
})

test('AUTO-APRI-REV-03 (S5) — la `fine` che SI RIFIUTA tiene il ripiego vecchio: il messaggio grezzo del disco (con un percorso) diventa il riassunto', async (t) => {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-apri-rev3-'))
  t.after(() => rimuoviCartellaDiProva(cartella))
  const clock = () => new Date('2026-10-08T21:30:00.000Z')
  const store = createAutomationStore({ cartella, clock })
  const registro = registroFinto()
  const scheduler = createAutomationScheduler({ store, sessionRegistry: registro, clock, onGiroFinito: () => {} })
  const voce = await store.crea(v2({ pianificazione: { tipo: 'manuale' } }))
  assert.equal((await scheduler.eseguiOra(voce.id)).ok, true, 'premessa: il giro parte e si apre')
  registro.giri[0].rifiuta(new Error("EPERM: operation not permitted, open 'C:/Users/persona/AppData/Local/TALOS/sessions/s1.jsonl'"))
  const limite = Date.now() + 3000
  let fine = null
  while (Date.now() < limite && !fine) { fine = (await store.giri(voce.id)).find((g) => g.finitaAlle) ?? null; await new Promise((r) => setTimeout(r, 5)) }
  assert.ok(fine, 'premessa: la fine si scrive')
  assert.doesNotMatch(String(fine.riassunto ?? ''), /AppData|EPERM/u, `the raw disk message with a path is the run summary: ${JSON.stringify(fine.riassunto)}`)
})

test('AUTO-APRI-RAFFREDDAMENTO (cura di REV-02) — passato il minuto il tick riprova UNA volta, poi aspetta di più (l azzeramento lo prova SCHED2-APRI-03)', async (t) => {
  const { vero, registro, scheduler, orologio } = scena(t)
  await vero.crea(v2())
  orologio.ora = new Date('2026-10-08T22:00:05.000Z')
  await scheduler.unTick()
  assert.equal(registro.giri.length, 1, 'premise: the first try')
  orologio.ora = new Date('2026-10-08T22:00:50.000Z'); await scheduler.unTick()
  assert.equal(registro.giri.length, 1, 'inside the first minute: no new session')
  orologio.ora = new Date('2026-10-08T22:01:10.000Z'); await scheduler.unTick()
  assert.equal(registro.giri.length, 2, 'after a minute: one more try')
  orologio.ora = new Date('2026-10-08T22:03:10.000Z'); await scheduler.unTick()
  assert.equal(registro.giri.length, 2, 'the second wait is longer (5 minutes)')
  orologio.ora = new Date('2026-10-08T22:06:20.000Z'); await scheduler.unTick()
  assert.equal(registro.giri.length, 3, 'after 5 minutes: one more try')
  for (const g of registro.giri) g.risolvi({ sessionId: g.sessionId, esito: 'stopped' })
})
