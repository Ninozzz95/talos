/*
 * Decisione 173 (owner 04/11/2026 18:23): in una cartella NON fidata l'Accesso pieno vale «On request» nel MODO della sessione, in un
 * punto solo del registro (`permessiNellaCartella`): all'avvio, quando lo si sceglie, al ripristino. Come la CLI (`modeInUntrustedFolder`,
 * commit 42e0e56b6) e Codex (`core/src/config/mod.rs:3955-3973`). La sessione resta aperta. Niente server con chiavi, niente dati veri:
 * il giro è finto (`avviaSessioneFn`) e lo store è una cartella temporanea.
 */
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { createSessionRegistry } from '../src/session-registry.mjs'

const finito = { esito: 'completato', motivo: 'fine' }
function banco(t, { fiduciaDellaCartellaFn, senzaIstruzioniDelProgettoFn, store = mkdtempSync(join(tmpdir(), 'talos-173-store-')) } = {}) {
  const radice = mkdtempSync(join(tmpdir(), 'talos-173-banco-'))
  const corse = []
  const lette = []
  const registro = createSessionRegistry({ cartellaStore: store, modello: 'fixture', chiave: 'fixture', guardaWorkspaceFn: () => () => {}, cartellaEsisteFn: () => true,
    ...(fiduciaDellaCartellaFn ? { fiduciaDellaCartellaFn: (c) => { lette.push(c); return fiduciaDellaCartellaFn(c) } } : {}),
    ...(senzaIstruzioniDelProgettoFn ? { senzaIstruzioniDelProgettoFn } : {}),
    preparaEsecuzioneFn: (id) => ({ ok: true, cartella: radice, task: { id, consegna: 'Verifica.' }, comandoProva: null }),
    avviaSessioneFn: async (input) => { corse.push(input); input.onEvento({ type: 'RunStarted' }); input.onEvento({ type: 'RunFinished' })
      return { ok: true, esito: { ...finito, messaggiFinali: [{ role: 'user', content: 'Verifica.' }, { role: 'assistant', content: 'ok' }] } } } })
  t.after(() => registro.chiudi())
  return { registro, corse, lette, radice, store }
}
const pausa = () => new Promise((r) => { setTimeout(r, 60) })

test('173 ROSSA→VERDE — «No» alla cartella: l\'Accesso pieno scelto all\'avvio parte come «On request», la sessione resta aperta', async (t) => {
  const b = banco(t, { fiduciaDellaCartellaFn: () => false })
  const { sessionId } = b.registro.avvia('a', { permessiScelto: 'Full access' })
  await pausa()
  assert.ok(sessionId)
  assert.equal(b.corse.length, 1, 'il giro parte: la sessione non si chiude')
  assert.equal(b.corse[0].livelloAccesso, 'su-richiesta')
  /* Revisione permessi 2, reperto F, e decisione 196: la fiducia si rilegge a ogni giro e a ogni chiamata (è memoria: il file lo conta
     `fiducia-cartelle-store`), sempre e solo per la cartella della sessione. Prima qui c'era «una volta, all'avvio». */
  assert.ok(b.lette.length > 0 && b.lette.every((c) => c === b.radice), JSON.stringify(b.lette))
})

test('173 — quando lo si sceglie dopo: «Full access» in una cartella non fidata diventa «On request»; gli altri modi restano', async (t) => {
  const b = banco(t, { fiduciaDellaCartellaFn: () => false })
  const { sessionId } = b.registro.avvia('b', { permessiScelto: 'Workspace write' })
  await pausa()
  assert.equal(b.corse[0].livelloAccesso, 'scrittura-progetto', 'scendere non serve: un modo che non è il pieno resta il suo')
  await b.registro.aggiornaImpostazioni(sessionId, { permessi: 'Full access' })
  await b.registro.resume(sessionId, 'ancora')
  await pausa()
  assert.equal(b.corse.at(-1).livelloAccesso, 'su-richiesta')
})

test('173 AL CONTRARIO — cartella fidata o non ancora chiesta, o nessuna fonte: l\'Accesso pieno resta pieno (golden)', async (t) => {
  for (const fiducia of [() => true, () => null, null]) {
    const b = banco(t, fiducia ? { fiduciaDellaCartellaFn: fiducia } : {})
    b.registro.avvia('c', { permessiScelto: 'Full access' })
    await pausa()
    assert.equal(b.corse[0].livelloAccesso, 'accesso-pieno', String(fiducia))
  }
})

test('173 — una fonte che fallisce vale «non fidata»; le istruzioni spente (CLI) tengono il pieno come «On request», come la CLI', async (t) => {
  const a = banco(t, { fiduciaDellaCartellaFn: () => { throw new Error('non so') } })
  a.registro.avvia('d', { permessiScelto: 'Full access' })
  await pausa()
  assert.equal(a.corse[0].livelloAccesso, 'su-richiesta')
  const c = banco(t, { senzaIstruzioniDelProgettoFn: () => true })
  c.registro.avvia('e', { permessiScelto: 'Full access' })
  await pausa()
  assert.equal(c.corse[0].livelloAccesso, 'su-richiesta')
  assert.equal(c.corse[0].senzaIstruzioniDelProgetto, true, 'le istruzioni restano spente come prima')
})

test('173 — al ripristino: una sessione salvata in «Full access» la cui cartella ora non è fidata riparte come «On request»; fidata dopo, il pieno torna scegliendolo', async (t) => {
  const store = mkdtempSync(join(tmpdir(), 'talos-173-store-'))
  const a = banco(t, { store })
  const { sessionId } = a.registro.avvia('f', { permessiScelto: 'Full access' })
  await pausa()
  assert.equal(a.corse[0].livelloAccesso, 'accesso-pieno')
  await a.registro.chiudi()
  let fidata = false
  const b = banco(t, { store, fiduciaDellaCartellaFn: () => fidata })
  await b.registro.ripristina()
  await b.registro.resume(sessionId, 'ancora')
  await pausa()
  assert.equal(b.corse.at(-1).livelloAccesso, 'su-richiesta')
  fidata = true // la persona dà la fiducia (dalla pillola, o dal modello dietro la carta: la porta è dell'ospite)
  await b.registro.aggiornaImpostazioni(sessionId, { permessi: 'Full access' })
  await b.registro.resume(sessionId, 'e ora')
  await pausa()
  assert.equal(b.corse.at(-1).livelloAccesso, 'accesso-pieno')
})
