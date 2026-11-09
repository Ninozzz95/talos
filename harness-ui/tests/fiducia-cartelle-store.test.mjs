/*
 * Decisioni 173, 189 e 196 sul PC: dove il server tiene la fiducia delle cartelle (`src/fiducia-cartelle.mjs`). Tre stati (true, false,
 * null = «non ancora chiesta»), la cartella più vicina vince, file letto una volta e riscritto atomico. Condizione di Performance
 * (04/11/2026): la fonte che il registro chiede a ogni attrezzo legge solo la memoria, ZERO letture del file in un giro di 20 attrezzi.
 * Solo cartelle temporanee, nessuna chiave, nessun dato vero.
 */
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { creaFiduciaCartelle, opzioniFiduciaPerIlRegistro } from '../src/fiducia-cartelle.mjs'
import { createSessionRegistry } from '../src/session-registry.mjs'

const cartellaProva = () => mkdtempSync(join(tmpdir(), 'talos-fiducia-store-'))
const silenzio = () => {}

test('tre stati; la cartella più vicina vince; resta dopo un riavvio', async () => {
  const dati = cartellaProva()
  const file = join(dati, 'fiducia-cartelle.json')
  const progetto = join(dati, 'lavoro', 'progetto')
  const s = creaFiduciaCartelle({ file, avvisa: silenzio })
  assert.equal(s.stato(progetto), null, 'mai chiesta')
  await s.imposta(progetto, false)
  assert.equal(s.stato(progetto), false)
  assert.equal(s.stato(join(progetto, 'src', 'dentro')), false, 'una sottocartella segue il progetto')
  assert.equal(s.stato(join(dati, 'lavoro')), null, 'la cartella sopra no')
  await s.imposta(join(progetto, 'src'), true)
  assert.equal(s.stato(join(progetto, 'src', 'dentro')), true, 'la più vicina vince')
  assert.equal(s.stato(progetto), false)
  const dopo = creaFiduciaCartelle({ file, avvisa: silenzio })
  assert.equal(dopo.stato(progetto), false, 'dopo un riavvio')
  assert.equal(dopo.stato(join(progetto, 'src')), true)
  await dopo.imposta(progetto, null)
  assert.equal(dopo.stato(progetto), null, 'null la toglie: si richiede')
  assert.equal(JSON.parse(readFileSync(file, 'utf8')).schema, 'talos.folder-trust.v1')
})

test('Windows: maiuscole e barre finali non fanno una cartella diversa', async () => {
  const s = creaFiduciaCartelle({ file: join(cartellaProva(), 'f.json'), piattaforma: 'win32', avvisa: silenzio })
  await s.imposta('C:\\Users\\Nino\\Progetto\\', false)
  assert.equal(s.stato('c:\\users\\nino\\progetto'), false)
  assert.equal(s.stato('C:/Users/Nino/Progetto/src'), false)
  assert.equal(s.stato('C:\\Users\\Nino\\Progetto2'), null, 'un nome che comincia uguale non è una sottocartella')
})

test('valori fuori dai tre stati rifiutati; un file illeggibile vale «non fidata» (come l\'errore della fonte nel registro) e si riscrive', async () => {
  const dati = cartellaProva()
  const file = join(dati, 'f.json')
  writeFileSync(file, '{ rotto')
  const avvisi = []
  const s = creaFiduciaCartelle({ file, avvisa: (m) => avvisi.push(m) })
  assert.equal(s.stato(join(dati, 'p')), false)
  assert.equal(avvisi.length, 1)
  await assert.rejects(s.imposta(join(dati, 'p'), 'forse'), /true, false or null/)
  await assert.rejects(s.imposta('relativa', true), /absolute/)
  await s.imposta(join(dati, 'p'), true)
  assert.equal(s.stato(join(dati, 'p')), true)
  assert.equal(creaFiduciaCartelle({ file, avvisa: silenzio }).stato(join(dati, 'p')), true, 'il file torna leggibile')
})

test('le due funzioni del registro: «No» spegne le istruzioni; «Sì» e «non ancora chiesta» no; sul telefono nessuna (contratto del 29/10)', async () => {
  const dati = cartellaProva()
  const s = creaFiduciaCartelle({ file: join(dati, 'f.json'), avvisa: silenzio })
  const o = opzioniFiduciaPerIlRegistro(s, { telefono: false })
  await s.imposta(join(dati, 'no'), false)
  await s.imposta(join(dati, 'si'), true)
  assert.equal(o.fiduciaDellaCartellaFn(join(dati, 'no')), false)
  assert.equal(o.senzaIstruzioniDelProgettoFn(join(dati, 'no')), true)
  assert.equal(o.senzaIstruzioniDelProgettoFn(join(dati, 'si')), false)
  assert.equal(o.senzaIstruzioniDelProgettoFn(join(dati, 'mai')), false)
  assert.deepEqual(opzioniFiduciaPerIlRegistro(s, { telefono: true }), {})
  assert.deepEqual(opzioniFiduciaPerIlRegistro(null, { telefono: false }), {})
})

test('PERFORMANCE — un giro di 20 attrezzi in Accesso pieno: ZERO letture del file (solo all\'avvio e quando la persona risponde)', async (t) => {
  const dati = cartellaProva()
  const file = join(dati, 'f.json')
  let letture = 0
  const s = creaFiduciaCartelle({ file, avvisa: silenzio, leggiFileFn: (...a) => { letture++; return readFileSync(...a) } })
  const radice = mkdtempSync(join(tmpdir(), 'talos-fiducia-banco-'))
  await s.imposta(radice, true)
  const lettureAllAvvio = letture
  const livelli = []
  const registro = createSessionRegistry({ cartellaStore: cartellaProva(), modello: 'fixture', chiave: 'fixture', guardaWorkspaceFn: () => () => {},
    cartellaEsisteFn: () => true, ...opzioniFiduciaPerIlRegistro(s, { telefono: false }),
    preparaEsecuzioneFn: (id) => ({ ok: true, cartella: radice, task: { id, consegna: 'Verifica.' }, comandoProva: null }),
    avviaSessioneFn: async (input) => {
      input.onEvento({ type: 'RunStarted' })
      for (let i = 0; i < 20; i++) livelli.push(input.permessiCorrentiFn().livelloAccesso)
      input.onEvento({ type: 'RunFinished' })
      return { ok: true, esito: { esito: 'completato', motivo: 'fine', messaggiFinali: [{ role: 'user', content: 'Verifica.' }, { role: 'assistant', content: 'ok' }] } }
    } })
  t.after(() => registro.chiudi())
  registro.avvia('a', { permessiScelto: 'Full access' })
  await new Promise((r) => { setTimeout(r, 80) })
  assert.equal(livelli.length, 20)
  assert.ok(livelli.every((l) => l === 'accesso-pieno'))
  assert.equal(letture - lettureAllAvvio, 0, 'nessuna lettura del file durante il giro')
  assert.ok(lettureAllAvvio <= 1, 'una sola all\'avvio')
})
