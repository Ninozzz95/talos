/**
 * Automazioni a due porte (owner 08/10/2026 notte) — il calcolo PURO della pianificazione: che cosa si può chiedere, e quando
 * cade il prossimo giro. Niente orologio vero, niente disco: `dopo` e il fuso si passano.
 * Fonti: Claude Desktop (preset Manual/Hourly/Daily/Weekdays/Weekly, una tantum), Hermes `cron/jobs.py:787-860` (intervallo,
 * frasi, cron, ISO) e `:937-963` (grazia = metà periodo fra 120 s e 2 h; oltre, un solo giro di recupero), croner 10.0.1.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  INTERVALLO_MINIMO_MINUTI, PianificazioneNonValida, classificaRitardo, graziaSecondi, normalizzaPianificazione, prossimoGiro,
} from '../src/automation-pianificazione.mjs'

const ROMA = 'Europe/Rome'
const iso = (d) => d?.toISOString() ?? null
const errore = (fn, codice) => assert.throws(fn, (e) => e instanceof PianificazioneNonValida && e.code === codice, `atteso ${codice}`)

test('PIAN-01 — i preset: il prossimo giro nell\'ora LOCALE del fuso, non in quella del server', () => {
  const dopo = new Date('2026-10-08T21:30:00Z') // 23:30 a Roma (ora legale, +2)
  assert.equal(iso(prossimoGiro(normalizzaPianificazione({ tipo: 'ogni-ora', minuto: 7 }), { dopo, fusoOrario: ROMA })), '2026-10-08T22:07:00.000Z')
  assert.equal(iso(prossimoGiro(normalizzaPianificazione({ tipo: 'giornaliera', ora: '09:00' }), { dopo, fusoOrario: ROMA })), '2026-10-09T07:00:00.000Z')
  // venerdì 9/10 alle 23:30 locali ⇒ il prossimo feriale è lunedì 12
  const venerdiSera = new Date('2026-10-09T21:30:00Z')
  assert.equal(iso(prossimoGiro(normalizzaPianificazione({ tipo: 'feriali', ora: '09:00' }), { dopo: venerdiSera, fusoOrario: ROMA })), '2026-10-12T07:00:00.000Z')
  // settimanale: domenica (0) alle 18:30
  assert.equal(iso(prossimoGiro(normalizzaPianificazione({ tipo: 'settimanale', ora: '18:30', giorno: 0 }), { dopo, fusoOrario: ROMA })), '2026-10-11T16:30:00.000Z')
  assert.equal(prossimoGiro(normalizzaPianificazione({ tipo: 'manuale' }), { dopo, fusoOrario: ROMA }), null, 'a mano: nessun giro da solo')
})

test('PIAN-02 — l\'ora legale: lo stesso «ogni giorno alle 9» è 07:00Z d\'estate e 08:00Z dopo il 25/10', () => {
  const p = normalizzaPianificazione({ tipo: 'giornaliera', ora: '09:00' })
  assert.equal(iso(prossimoGiro(p, { dopo: new Date('2026-10-24T10:00:00Z'), fusoOrario: ROMA })), '2026-10-25T08:00:00.000Z')
  assert.equal(iso(prossimoGiro(p, { dopo: new Date('2026-10-23T10:00:00Z'), fusoOrario: ROMA })), '2026-10-24T07:00:00.000Z')
})

test('PIAN-03 — ogni N minuti: dall\'ultimo giro (o da adesso), mai sotto il minimo', () => {
  const p = normalizzaPianificazione({ tipo: 'ogni-n-minuti', minuti: 30 })
  const dopo = new Date('2026-10-08T21:30:00Z')
  assert.equal(iso(prossimoGiro(p, { dopo, fusoOrario: ROMA })), '2026-10-08T22:00:00.000Z', 'senza giri: fra N minuti')
  assert.equal(iso(prossimoGiro(p, { dopo, fusoOrario: ROMA, ultimoGiro: new Date('2026-10-08T21:20:00Z') })), '2026-10-08T21:50:00.000Z')
  assert.equal(INTERVALLO_MINIMO_MINUTI, 5)
  errore(() => normalizzaPianificazione({ tipo: 'ogni-n-minuti', minuti: 4 }), 'AUTOMATION_SCHEDULE_TOO_FREQUENT')
  assert.equal(normalizzaPianificazione({ tipo: 'ogni-n-minuti', minuti: 5 }).minuti, 5, 'al contrario: 5 è ammesso')
})

test('PIAN-04 — cron: solo 5 campi; una frequenza sotto i 5 minuti si rifiuta, anche nascosta in una lista', () => {
  const p = normalizzaPianificazione({ tipo: 'cron', espressione: ' 0  9 1 * * ' })
  assert.equal(p.espressione, '0 9 1 * *', 'spazi normalizzati')
  assert.equal(iso(prossimoGiro(p, { dopo: new Date('2026-10-08T21:30:00Z'), fusoOrario: ROMA })), '2026-11-01T08:00:00.000Z')
  errore(() => normalizzaPianificazione({ tipo: 'cron', espressione: '0 0 9 * * *' }), 'AUTOMATION_CRON_FIELDS') // secondi
  errore(() => normalizzaPianificazione({ tipo: 'cron', espressione: '0 9 * * * 2027' }), 'AUTOMATION_CRON_FIELDS') // anno
  errore(() => normalizzaPianificazione({ tipo: 'cron', espressione: '* * * * *' }), 'AUTOMATION_SCHEDULE_TOO_FREQUENT')
  errore(() => normalizzaPianificazione({ tipo: 'cron', espressione: '0,2 9 * * *' }), 'AUTOMATION_SCHEDULE_TOO_FREQUENT')
  errore(() => normalizzaPianificazione({ tipo: 'cron', espressione: '61 9 * * *' }), 'AUTOMATION_CRON_INVALID')
  assert.equal(normalizzaPianificazione({ tipo: 'cron', espressione: '*/5 * * * *' }).espressione, '*/5 * * * *', 'al contrario: ogni 5 minuti è ammesso')
})

test('PIAN-05 — una volta: l\'ora locale del fuso; nel passato non ha prossimo giro; dopo il giro neanche', () => {
  const p = normalizzaPianificazione({ tipo: 'una-volta', quando: '2026-10-09T15:00' })
  assert.equal(iso(prossimoGiro(p, { dopo: new Date('2026-10-08T21:30:00Z'), fusoOrario: ROMA })), '2026-10-09T13:00:00.000Z')
  assert.equal(prossimoGiro(p, { dopo: new Date('2026-10-10T00:00:00Z'), fusoOrario: ROMA }), null)
  assert.equal(prossimoGiro(p, { dopo: new Date('2026-10-08T21:30:00Z'), fusoOrario: ROMA, ultimoGiro: new Date('2026-10-08T21:00:00Z') }), null, 'già girata')
  errore(() => normalizzaPianificazione({ tipo: 'una-volta', quando: 'domani' }), 'AUTOMATION_SCHEDULE_INVALID')
})

test('PIAN-06 — valori storti: si rifiuta col suo codice, mai si corregge in silenzio', () => {
  errore(() => normalizzaPianificazione(null), 'AUTOMATION_SCHEDULE_INVALID')
  errore(() => normalizzaPianificazione({ tipo: 'ogni-giorno' }), 'AUTOMATION_SCHEDULE_INVALID')
  errore(() => normalizzaPianificazione({ tipo: 'giornaliera', ora: '9' }), 'AUTOMATION_SCHEDULE_INVALID')
  errore(() => normalizzaPianificazione({ tipo: 'giornaliera', ora: '24:00' }), 'AUTOMATION_SCHEDULE_INVALID')
  errore(() => normalizzaPianificazione({ tipo: 'settimanale', ora: '09:00', giorno: 7 }), 'AUTOMATION_SCHEDULE_INVALID')
  errore(() => normalizzaPianificazione({ tipo: 'ogni-ora', minuto: 60 }), 'AUTOMATION_SCHEDULE_INVALID')
  errore(() => normalizzaPianificazione({ tipo: 'giornaliera', ora: '09:00', extra: 1 }), 'AUTOMATION_SCHEDULE_INVALID')
  errore(() => prossimoGiro(normalizzaPianificazione({ tipo: 'manuale' }), { dopo: new Date(), fusoOrario: 'Marte/Olimpo' }), 'AUTOMATION_TIMEZONE_INVALID')
})

test('PIAN-07 — grazia e ritardo come Hermes: metà periodo fra 120 s e 2 h; oltre, un solo giro di recupero', () => {
  assert.equal(graziaSecondi(normalizzaPianificazione({ tipo: 'ogni-n-minuti', minuti: 5 }), { fusoOrario: ROMA }), 150)
  assert.equal(graziaSecondi(normalizzaPianificazione({ tipo: 'ogni-ora', minuto: 0 }), { fusoOrario: ROMA }), 1800)
  assert.equal(graziaSecondi(normalizzaPianificazione({ tipo: 'giornaliera', ora: '09:00' }), { fusoOrario: ROMA }), 7200)
  assert.equal(graziaSecondi(normalizzaPianificazione({ tipo: 'una-volta', quando: '2026-10-09T15:00' }), { fusoOrario: ROMA }), 120)
  assert.equal(classificaRitardo(60, 1800), 'in-orario')
  assert.equal(classificaRitardo(600, 1800), 'in-ritardo')
  assert.equal(classificaRitardo(1801, 1800), 'recupero')
})
