/**
 * Automazioni a due porte (owner 08/10/2026 notte) — l'OSPITE degli attrezzi `automation_*`: anteprima senza scrivere, carta
 * dove l'owner l'ha voluta (crea, modifica, riprendi, esegui ora), un giro che cambia solo sé stesso (D5), nessun elimina.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createAutomationStore } from '../src/automation-store.mjs'
import { creaOspiteAutomazioni, descriviPianificazione, oraLocale } from '../src/automation-per-il-modello.mjs'
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs'

const CARTELLA = process.platform === 'win32' ? 'C:\\progetti\\demo' : '/progetti/demo'
function scena(t, { automazioneDelGiro = null, verificaModelloFn = null } = {}) {
  const dati = mkdtempSync(join(tmpdir(), 'talos-ospite-auto-'))
  t.after(() => rimuoviCartellaDiProva(dati))
  const clock = () => new Date('2026-10-08T21:30:00.000Z')
  const store = createAutomationStore({ cartella: dati, clock })
  const chiamate = []
  const scheduler = {
    occupato: false,
    async eseguiOra(id, o) { chiamate.push(['esegui', id, o]); return this.occupato ? { ok: false, code: 'AUTOMATION_RUN_IN_PROGRESS' } : { ok: true, runId: 'r', sessionId: 's' } },
    async fermaGiro(id) { chiamate.push(['ferma', id]); return { ok: true } },
  }
  const cartelleVerificate = []
  const fabbrica = creaOspiteAutomazioni({ store, scheduler, clock, verificaCartellaFn: (p) => {
    cartelleVerificate.push(p)
    if (p.endsWith('sparita')) throw Object.assign(new Error(`The path does not exist or cannot be reached: ${p}`), { code: 'PROJECT_NOT_ALLOWED' })
  } })
  const ospite = fabbrica({ sessionId: 'sess-chat', cartella: CARTELLA, modello: 'z-ai/glm-5.3-flash', automazioneDelGiro, verificaModelloFn })
  return { store, scheduler, chiamate, ospite, cartelleVerificate }
}
const CREA = { nome: 'Dipendenze', istruzioni: 'Controlla le dipendenze.', pianificazione: { tipo: 'giornaliera', ora: '09:00' } }

test('OSPITE-01 — crea: l\'anteprima normalizza SENZA scrivere e chiede la carta; esegui crea con origine chat, cartella e modello della conversazione', async (t) => {
  const { ospite, store, cartelleVerificate } = scena(t)
  const anteprima = await ospite('automation_create', CREA, { fase: 'anteprima' })
  assert.equal(anteprima.ok, true)
  assert.equal(anteprima.carta, true)
  assert.equal(anteprima.azione.bozza.cartella, CARTELLA)
  assert.equal(anteprima.azione.bozza.modello, 'z-ai/glm-5.3-flash')
  assert.equal(anteprima.azione.bozza.prossimaEsecuzione !== null, true)
  assert.deepEqual(await store.elenca(), [], 'l\'anteprima non scrive')
  assert.deepEqual(cartelleVerificate, [CARTELLA])
  const fatto = await ospite('automation_create', CREA, { fase: 'esegui' })
  assert.equal(fatto.ok, true)
  const [voce] = await store.elenca()
  assert.deepEqual(voce.origine, { tipo: 'chat', sessionId: 'sess-chat' })
  assert.match(fatto.testo, /^Automation "Dipendenze" created \(id [0-9a-f-]+\)\. It is on and runs every day at 09:00: next run \d{4}-\d{2}-\d{2} 09:00 \(/u)
})

test('OSPITE-02 — crea al contrario: un errore torna SUBITO, nell\'anteprima, senza carta e senza scrivere', async (t) => {
  const { ospite, store } = scena(t, { verificaModelloFn: async (m) => (m === 'vendor/buono' ? { ok: true, modello: m } : { ok: false, motivo: `${m} is not one of the models this app can use.` }) })
  for (const [argomenti, frase] of [
    [{ ...CREA, pianificazione: { tipo: 'ogni-n-minuti', minuti: 1 } }, /every 5 minutes/u],
    [{ ...CREA, cartella: 'C:\\sparita' }, /does not exist/u],
    [{ ...CREA, modello: 'inventato' }, /inventato is not one of the models/u],
    [{ ...CREA, istruzioni: '' }, /"istruzioni" must be non-empty/u],
  ]) {
    const r = await ospite('automation_create', argomenti, { fase: 'anteprima' })
    assert.equal(r.ok, false, JSON.stringify(argomenti))
    assert.match(r.messaggio, frase)
  }
  assert.equal((await ospite('automation_create', { ...CREA, modello: 'vendor/buono' }, { fase: 'anteprima' })).azione.bozza.modello, 'vendor/buono')
  assert.deepEqual(await store.elenca(), [])
})

test('OSPITE-03 — modifica (carta col prima e dopo), pausa (senza carta), riprendi (carta), esegui (carta), ferma (senza carta)', async (t) => {
  const { ospite, store, scheduler, chiamate } = scena(t)
  await ospite('automation_create', CREA, { fase: 'esegui' })
  const [{ id }] = await store.elenca()
  const m = await ospite('automation_update', { id, istruzioni: 'Solo main.' }, { fase: 'anteprima' })
  assert.equal(m.carta, true)
  assert.deepEqual(m.azione.prima, { istruzioni: 'Controlla le dipendenze.' })
  assert.deepEqual(m.azione.dopo, { istruzioni: 'Solo main.' })
  assert.match((await ospite('automation_update', { id, istruzioni: 'Solo main.' }, { fase: 'esegui' })).testo, /updated \(istruzioni\)/u)
  assert.equal((await ospite('automation_pause', { id }, { fase: 'anteprima' })).carta, false)
  assert.match((await ospite('automation_pause', { id }, { fase: 'esegui' })).testo, /is off/u)
  assert.equal((await store.leggi(id)).attiva, false)
  assert.equal((await ospite('automation_resume', { id }, { fase: 'anteprima' })).carta, true)
  assert.match((await ospite('automation_resume', { id }, { fase: 'esegui' })).testo, /is on and runs every day at 09:00/u)
  const run = await ospite('automation_run', { id, contesto: 'Solo il ramo main.' }, { fase: 'anteprima' })
  assert.equal(run.carta, true)
  assert.equal(run.azione.contesto, 'Solo il ramo main.')
  assert.match((await ospite('automation_run', { id, contesto: 'Solo il ramo main.' }, { fase: 'esegui' })).testo, /started in the background/u)
  assert.deepEqual(chiamate[0], ['esegui', id, { contesto: 'Solo il ramo main.' }])
  scheduler.occupato = true
  assert.match((await ospite('automation_run', { id }, { fase: 'esegui' })).messaggio, /still going: wait for it, or stop it/u)
  assert.equal((await ospite('automation_stop', { id }, { fase: 'anteprima' })).carta, false)
  assert.match((await ospite('automation_stop', { id }, { fase: 'esegui' })).testo, /was stopped/u)
})

test('OSPITE-04 — non si indovina un id; nessun attrezzo elimina; elenco e storico leggibili', async (t) => {
  const { ospite, store } = scena(t)
  assert.match((await ospite('automation_update', { id: 'boh', nome: 'x' }, { fase: 'anteprima' })).messaggio, /call automation_list/u)
  assert.equal((await ospite('automation_delete', { id: 'x' }, { fase: 'anteprima' })).ok, false)
  assert.equal((await ospite('automation_list', {}, { fase: 'esegui' })).testo, 'There are no automations yet.')
  await ospite('automation_create', CREA, { fase: 'esegui' })
  const [{ id }] = await store.elenca()
  await store.apriGiro(id, { runId: 'g', previstaAlle: null, sessionId: 's' })
  await store.chiudiGiro(id, 'g', { esito: 'finita', riassunto: 'Due pacchetti vecchi.', daGuardare: true })
  const elenco = (await ospite('automation_list', {}, { fase: 'esegui' })).testo
  assert.match(elenco, new RegExp(`^1 automation:\\n- ${id} · "Dipendenze" · on · runs every day at 09:00`, 'u'))
  assert.match(elenco, /last run finita · 1 unread$/u)
  assert.match((await ospite('automation_runs', { id }, { fase: 'esegui' })).testo, /· finita\n {2}Due pacchetti vecchi\.$/u)
})

test('OSPITE-05 — un GIRO di automazione (D5): legge, cambia SOLO sé stesso e solo istruzioni o prossimo giro, senza carta', async (t) => {
  const prima = scena(t)
  await prima.ospite('automation_create', CREA, { fase: 'esegui' })
  await prima.ospite('automation_create', { ...CREA, nome: 'Altra' }, { fase: 'esegui' })
  const [mia, altra] = await prima.store.elenca()
  const fabbrica = creaOspiteAutomazioni({ store: prima.store, scheduler: prima.scheduler, clock: () => new Date('2026-10-08T21:30:00.000Z') })
  const delGiro = fabbrica({ sessionId: 'giro', cartella: CARTELLA, automazioneDelGiro: mia.id })
  await prima.store.apriGiro(mia.id, { runId: 'g-vivo', sessionId: 'giro' }) // il giro che sta cambiando sé stesso
  assert.equal((await delGiro('automation_list', {}, { fase: 'anteprima' })).ok, true)
  const sposta = await delGiro('automation_update', { id: mia.id, prossimoGiroAlle: '2026-10-09T07:30' }, { fase: 'anteprima' })
  assert.equal(sposta.carta, false, 'senza carta: nessuno potrebbe rispondere')
  await delGiro('automation_update', { id: mia.id, prossimoGiroAlle: '2026-10-09T07:30' }, { fase: 'esegui' })
  assert.equal((await prima.store.leggi(mia.id)).prossimaEsecuzione, '2026-10-09T05:30:00.000Z')
  assert.equal((await prima.store.leggi(mia.id)).pianificazione.ora, '09:00', 'la pianificazione non cambia')
  // decisione 9: il cambio resta scritto sul giro, e il giro va in «Da guardare» anche se poi finisce senza niente da dire;
  // decisione 13 (08/10 sera): le istruzioni sono solo PROPOSTE (provato per intero in automation-sicurezza.test.mjs)
  await delGiro('automation_update', { id: mia.id, istruzioni: 'Controlla anche le PR.' }, { fase: 'esegui' })
  await prima.store.chiudiGiro(mia.id, 'g-vivo', { esito: 'finita', riassunto: null, daGuardare: false })
  const [giro] = await prima.store.giri(mia.id)
  assert.deepEqual(giro.cambi, ['prossimaEsecuzione'])
  assert.equal(giro.proposta.stato, 'in-attesa')
  assert.equal((await prima.store.leggi(mia.id)).istruzioni, 'Controlla le dipendenze.')
  assert.equal(giro.daGuardare, true)
  assert.deepEqual((await prima.store.daGuardare()).map((g) => g.runId), ['g-vivo'])
  assert.match((await delGiro('automation_update', { id: altra.id, istruzioni: 'x' }, { fase: 'anteprima' })).messaggio, /only itself/u)
  assert.match((await delGiro('automation_update', { id: mia.id, permessi: 'Full access' }, { fase: 'anteprima' })).messaggio, /not: permessi/u)
  for (const nome of ['automation_create', 'automation_pause', 'automation_resume', 'automation_run', 'automation_stop']) {
    assert.equal((await delGiro(nome, { ...CREA, id: mia.id }, { fase: 'anteprima' })).ok, false, nome)
  }
})

test('OSPITE-06 — parole e ore per il modello', () => {
  assert.equal(descriviPianificazione({ tipo: 'settimanale', ora: '18:30', giorno: 0 }), 'every Sunday at 18:30')
  assert.equal(descriviPianificazione({ tipo: 'ogni-ora', minuto: 7 }), 'every hour at :07')
  assert.equal(oraLocale('2026-10-09T13:00:00.000Z', 'Europe/Rome'), '2026-10-09 15:00')
})

// Dal vivo, 08/10/2026: glm-5.3-flash ha mandato `giorno: 0` con «feriali» (un campo dello schema che quel tipo non usa) e il
// rifiuto gli è costato un giro. Dalla porta del modello il campo in più si toglie; la carta mostra la bozza pulita.
test('OSPITE-07 — un campo che il tipo non usa si toglie (la bozza sulla carta è pulita), in creazione e in modifica', async (t) => {
  const { ospite, store } = scena(t)
  const anteprima = await ospite('automation_create', { ...CREA, pianificazione: { tipo: 'feriali', ora: '09:00', giorno: 0 } }, { fase: 'anteprima' })
  assert.equal(anteprima.ok, true, anteprima.messaggio)
  assert.deepEqual(anteprima.azione.bozza.pianificazione, { tipo: 'feriali', ora: '09:00' })
  await ospite('automation_create', CREA, { fase: 'esegui' })
  const [voce] = await store.elenca()
  const modifica = await ospite('automation_update', { id: voce.id, pianificazione: { tipo: 'giornaliera', ora: '10:00', minuti: 30 } }, { fase: 'anteprima' })
  assert.equal(modifica.ok, true, modifica.messaggio)
  assert.deepEqual(modifica.azione.dopo.pianificazione, { tipo: 'giornaliera', ora: '10:00' })
  // al contrario: un campo SBAGLIATO del tipo giusto resta un errore, e un tipo ignoto pure
  assert.equal((await ospite('automation_create', { ...CREA, pianificazione: { tipo: 'feriali', ora: '25:00' } }, { fase: 'anteprima' })).ok, false)
  assert.equal((await ospite('automation_create', { ...CREA, pianificazione: { tipo: 'ogni-luna-piena', giorno: 1 } }, { fase: 'anteprima' })).ok, false)
})
