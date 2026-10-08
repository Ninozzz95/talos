/**
 * Automazioni a due porte (owner 08/10/2026 notte) — il negozio v2: istruzioni libere, cartella, permessi, pianificazione,
 * fuso, ripetizioni, origine; lo storico dei giri; «Da guardare». Le voci v1 (task del corpus) restano com'erano: le loro
 * prove sono in `automation-store.test.mjs`, che non cambia.
 * Decisioni: nasce ACCESA (D3), permessi di serie «Workspace write» (D2), tetti come Hermes col minimo di 5 minuti (D1).
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AutomationStoreError, createAutomationStore } from '../src/automation-store.mjs'
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs'

const ROMA = 'Europe/Rome'
const CARTELLA_LAVORO = process.platform === 'win32' ? 'C:\\progetti\\demo' : '/progetti/demo'
function scena(t, { adesso = '2026-10-08T21:30:00.000Z' } = {}) {
  const cartella = mkdtempSync(join(tmpdir(), 'talos-auto-v2-'))
  t.after(() => rimuoviCartellaDiProva(cartella))
  const orologio = { ora: new Date(adesso) }
  const store = createAutomationStore({ cartella, clock: () => new Date(orologio.ora) })
  return { cartella, store, orologio }
}
const base = (extra = {}) => ({ nome: 'Dipendenze', istruzioni: 'Controlla le dipendenze del progetto.', cartella: CARTELLA_LAVORO,
  pianificazione: { tipo: 'giornaliera', ora: '09:00' }, fusoOrario: ROMA, ...extra })
const rifiuta = async (promessa, codice) => assert.rejects(promessa, (e) => e instanceof AutomationStoreError && e.code === codice, `atteso ${codice}`)

test('STORE2-01 — crea v2: nasce ACCESA col prossimo giro calcolato; di serie Workspace write, Coordinazione spenta, per sempre', async (t) => {
  const { store } = scena(t)
  const v = await store.crea(base({ origine: { tipo: 'chat', sessionId: 's-1' } }))
  assert.equal(v.versione, 2)
  assert.equal(v.attiva, true, 'owner D3: nasce accesa')
  assert.equal(v.prossimaEsecuzione, '2026-10-09T07:00:00.000Z', 'domani alle 9 di Roma')
  assert.equal(v.permessi, 'Workspace write', 'owner D2')
  assert.equal(v.coordinazione, false)
  assert.equal(v.modello, null)
  assert.equal(v.ripeti, null, 'per sempre')
  assert.equal(v.eseguite, 0)
  assert.deepEqual(v.origine, { tipo: 'chat', sessionId: 's-1' })
  assert.equal(v.taskId, undefined, 'una v2 non ha task del corpus')
  // persistita e riletta da un altro negozio sulla stessa cartella
  assert.deepEqual(await store.leggi(v.id), v)
})

test('STORE2-02 — crea v2 al contrario: ogni campo storto si rifiuta col suo codice, niente corretto in silenzio', async (t) => {
  const { store } = scena(t)
  await rifiuta(store.crea(base({ istruzioni: '   ' })), 'AUTOMATION_INVALID')
  await rifiuta(store.crea(base({ istruzioni: 'x'.repeat(20_001) })), 'AUTOMATION_INVALID')
  await rifiuta(store.crea(base({ nome: '' })), 'AUTOMATION_INVALID')
  await rifiuta(store.crea(base({ nome: 'n'.repeat(81) })), 'AUTOMATION_INVALID')
  await rifiuta(store.crea(base({ cartella: 'relativa/cartella' })), 'AUTOMATION_INVALID')
  await rifiuta(store.crea(base({ permessi: 'Tutto' })), 'AUTOMATION_INVALID')
  await rifiuta(store.crea(base({ coordinazione: 'sì' })), 'AUTOMATION_INVALID')
  await rifiuta(store.crea(base({ ripeti: 0 })), 'AUTOMATION_INVALID')
  await rifiuta(store.crea(base({ pianificazione: { tipo: 'ogni-n-minuti', minuti: 2 } })), 'AUTOMATION_SCHEDULE_TOO_FREQUENT')
  await rifiuta(store.crea(base({ fusoOrario: 'Marte/Olimpo' })), 'AUTOMATION_TIMEZONE_INVALID')
  await rifiuta(store.crea(base({ pianificazione: { tipo: 'una-volta', quando: '2026-10-08T20:00' } })), 'AUTOMATION_SCHEDULE_PAST')
  await rifiuta(store.crea(base({ origine: { tipo: 'altro' } })), 'AUTOMATION_INVALID')
  await rifiuta(store.crea(base({ campoInventato: 1 })), 'AUTOMATION_INVALID')
  assert.deepEqual(await store.elenca(), [], 'nessuna voce scritta')
})

test('STORE2-03 — «a mano» nasce accesa ma senza prossimo giro; «una volta» vale ripeti 1', async (t) => {
  const { store } = scena(t)
  const manuale = await store.crea(base({ pianificazione: { tipo: 'manuale' } }))
  assert.equal(manuale.prossimaEsecuzione, null)
  const unaVolta = await store.crea(base({ pianificazione: { tipo: 'una-volta', quando: '2026-10-09T15:00' } }))
  assert.equal(unaVolta.prossimaEsecuzione, '2026-10-09T13:00:00.000Z')
  assert.equal(unaVolta.ripeti, 1)
})

test('STORE2-04 — modifica: solo i campi ammessi; cambiare l\'orario ricalcola il prossimo giro; v1 non si modifica così', async (t) => {
  const { store } = scena(t)
  const v = await store.crea(base())
  const m = await store.modifica(v.id, { pianificazione: { tipo: 'ogni-ora', minuto: 15 }, istruzioni: 'Nuove istruzioni.' })
  assert.equal(m.istruzioni, 'Nuove istruzioni.')
  assert.equal(m.prossimaEsecuzione, '2026-10-08T22:15:00.000Z')
  await rifiuta(store.modifica(v.id, { eseguite: 99 }), 'AUTOMATION_INVALID')
  await rifiuta(store.modifica(v.id, { attiva: false }), 'AUTOMATION_INVALID') // accendere e spegnere passano da imposta()
  assert.equal(await store.modifica('nessuna', { nome: 'x' }), null)
  const v1 = await store.crea({ taskId: 'verifica-catalogo', intervalloMinuti: 30 })
  await rifiuta(store.modifica(v1.id, { nome: 'x' }), 'AUTOMATION_LEGACY')
})

test('STORE2-05 — imposta v2: in pausa niente prossimo giro; riaccesa lo ricalcola da ADESSO', async (t) => {
  const { store, orologio } = scena(t)
  const v = await store.crea(base({ pianificazione: { tipo: 'ogni-n-minuti', minuti: 30 } }))
  assert.equal(v.prossimaEsecuzione, '2026-10-08T22:00:00.000Z')
  assert.equal((await store.imposta(v.id, false)).prossimaEsecuzione, null)
  orologio.ora = new Date('2026-10-09T10:00:00.000Z')
  assert.equal((await store.imposta(v.id, true)).prossimaEsecuzione, '2026-10-09T10:30:00.000Z')
})

test('STORE2-06 — un giro: apre (conta, sposta il prossimo), chiude (esito e riassunto); lo storico li fonde per giro', async (t) => {
  const { store, orologio } = scena(t)
  const v = await store.crea(base({ pianificazione: { tipo: 'ogni-n-minuti', minuti: 30 } }))
  orologio.ora = new Date('2026-10-08T22:00:30.000Z')
  const aperta = await store.apriGiro(v.id, { runId: 'g1', previstaAlle: '2026-10-08T22:00:00.000Z', sessionId: 'sess-1', ritardo: 'in-orario' })
  assert.equal(aperta.eseguite, 1)
  assert.deepEqual(aperta.giroInCorso, { runId: 'g1', sessionId: 'sess-1', partitoAlle: '2026-10-08T22:00:30.000Z' })
  assert.equal(aperta.prossimaEsecuzione, '2026-10-08T22:30:30.000Z')
  orologio.ora = new Date('2026-10-08T22:04:00.000Z')
  const chiusa = await store.chiudiGiro(v.id, 'g1', { esito: 'finita', riassunto: 'Due pacchetti da aggiornare.', daGuardare: true })
  assert.equal(chiusa.giroInCorso, null)
  const [giro] = await store.giri(v.id)
  assert.deepEqual(giro, { runId: 'g1', previstaAlle: '2026-10-08T22:00:00.000Z', partitaAlle: '2026-10-08T22:00:30.000Z', sessionId: 'sess-1',
    ritardo: 'in-orario', esito: 'finita', finitaAlle: '2026-10-08T22:04:00.000Z', riassunto: 'Due pacchetti da aggiornare.', daGuardare: true, letta: false })
})

test('STORE2-07 — «Da guardare»: solo i giri con qualcosa da dire e non letti; segnaLetto li toglie; il silenzio non c\'è mai', async (t) => {
  const { store } = scena(t)
  const v = await store.crea(base({ pianificazione: { tipo: 'manuale' } }))
  await store.apriGiro(v.id, { runId: 'a', previstaAlle: null, sessionId: 's-a' })
  await store.chiudiGiro(v.id, 'a', { esito: 'finita', riassunto: 'Niente.', daGuardare: false })
  await store.apriGiro(v.id, { runId: 'b', previstaAlle: null, sessionId: 's-b' })
  await store.chiudiGiro(v.id, 'b', { esito: 'fallita', riassunto: 'La cartella non c\'è.', daGuardare: true })
  const inbox = await store.daGuardare()
  assert.deepEqual(inbox.map((g) => [g.automazioneId, g.runId]), [[v.id, 'b']])
  assert.equal(inbox[0].nome, 'Dipendenze')
  assert.equal((await store.segnaLetto(v.id, 'b')).letta, true)
  assert.deepEqual(await store.daGuardare(), [])
  assert.equal(await store.segnaLetto(v.id, 'non-esiste'), null)
})

test('STORE2-08 — un giro saltato si scrive col motivo e NON conta come eseguito; il prossimo si sposta avanti', async (t) => {
  const { store, orologio } = scena(t)
  const v = await store.crea(base({ pianificazione: { tipo: 'ogni-n-minuti', minuti: 30 } }))
  orologio.ora = new Date('2026-10-08T22:00:10.000Z')
  const dopo = await store.saltaGiro(v.id, { previstaAlle: '2026-10-08T22:00:00.000Z', motivo: 'precedente-in-corso' })
  assert.equal(dopo.eseguite, 0)
  assert.equal(dopo.prossimaEsecuzione, '2026-10-08T22:30:10.000Z')
  const [giro] = await store.giri(v.id)
  assert.equal(giro.esito, 'saltata')
  assert.equal(giro.motivo, 'precedente-in-corso')
  assert.equal(giro.daGuardare, false)
})

test('STORE2-09 — ripeti N: al giro N si spegne da sola; «una volta» si spegne dopo il suo giro', async (t) => {
  const { store } = scena(t)
  const v = await store.crea(base({ pianificazione: { tipo: 'ogni-n-minuti', minuti: 30 }, ripeti: 2 }))
  assert.equal((await store.apriGiro(v.id, { runId: '1', previstaAlle: null, sessionId: 's1' })).attiva, true)
  const seconda = await store.apriGiro(v.id, { runId: '2', previstaAlle: null, sessionId: 's2' })
  assert.equal(seconda.attiva, false)
  assert.equal(seconda.prossimaEsecuzione, null)
  const u = await store.crea(base({ pianificazione: { tipo: 'una-volta', quando: '2026-10-09T15:00' } }))
  const fatta = await store.apriGiro(u.id, { runId: 'x', previstaAlle: '2026-10-09T13:00:00.000Z', sessionId: 'sx' })
  assert.equal(fatta.attiva, false)
  assert.equal(fatta.prossimaEsecuzione, null)
})

test('STORE2-10 — in attesa del fornitore (429): il prossimo giro non cade prima della riapertura', async (t) => {
  const { store } = scena(t)
  const v = await store.crea(base({ pianificazione: { tipo: 'ogni-n-minuti', minuti: 30 } }))
  const ferma = await store.inAttesaFino(v.id, '2026-10-09T02:00:00.000Z')
  assert.equal(ferma.inAttesaFinoA, '2026-10-09T02:00:00.000Z')
  assert.ok(new Date(ferma.prossimaEsecuzione) >= new Date('2026-10-09T02:00:00.000Z'), ferma.prossimaEsecuzione)
  // un giro che parte davvero toglie l'attesa (Hermes: «any run that reaches the model clears the marker»)
  assert.equal((await store.apriGiro(v.id, { runId: 'r', previstaAlle: null, sessionId: 's' })).inAttesaFinoA, null)
})

test('STORE2-11 — scritture concorrenti sulla stessa voce non si perdono (coda per id); il file non resta mai a metà', async (t) => {
  const { store, cartella } = scena(t)
  const v = await store.crea(base({ pianificazione: { tipo: 'manuale' } }))
  await Promise.all([
    store.impostaCoordinazione(v.id, true),
    store.apriGiro(v.id, { runId: 'c1', previstaAlle: null, sessionId: 's1' }),
    store.modifica(v.id, { nome: 'Rinominata' }),
  ])
  const finale = await store.leggi(v.id)
  assert.equal(finale.coordinazione, true)
  assert.equal(finale.eseguite, 1)
  assert.equal(finale.nome, 'Rinominata')
  assert.deepEqual(readdirSync(cartella).filter((n) => n.endsWith('.tmp')), [], 'nessun temporaneo lasciato')
  JSON.parse(readFileSync(join(cartella, `${v.id}.json`), 'utf8'))
})

test('STORE2-12 — elimina porta via anche lo storico; elenca ignora i file dello storico', async (t) => {
  const { store, cartella } = scena(t)
  const v = await store.crea(base({ pianificazione: { tipo: 'manuale' } }))
  await store.apriGiro(v.id, { runId: 'z', previstaAlle: null, sessionId: 's' })
  assert.equal((await store.elenca()).length, 1, 'il file .runs.jsonl non è una voce')
  await store.elimina(v.id)
  assert.deepEqual(readdirSync(cartella), [])
})
