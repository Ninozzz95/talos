/*
 * Decisioni 173, 189 e 196 (owner 04/11/2026), la RIGA FISSA alla riapertura. L'evento `talos.impostazioni-sessione` la porta dal vivo,
 *   ma chi riapre una conversazione (la sezione Sessioni, un riavvio della finestra, il telefono collegato) legge l'ELENCO: senza i due
 *   campi lì, una conversazione con la cartella non fidata si riapriva senza la riga «Non fidata…» e con la pillola in «Su richiesta» senza
 *   spiegazione. Stessi campi e stessa regola dell'istantanea (`cartellaNonFidata`, `pienoTrattenuto`), additivi: fidata o senza fonte la
 *   riga dell'elenco resta quella di ieri.
 */
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { createSessionRegistry } from '../src/session-registry.mjs'

function banco(t, fiduciaDellaCartellaFn) {
  const radice = mkdtempSync(join(tmpdir(), 'talos-riga-elenco-'))
  const registro = createSessionRegistry({ cartellaStore: mkdtempSync(join(tmpdir(), 'talos-riga-elenco-store-')), modello: 'fixture', chiave: 'fixture',
    guardaWorkspaceFn: () => () => {}, cartellaEsisteFn: () => true,
    ...(fiduciaDellaCartellaFn ? { fiduciaDellaCartellaFn, senzaIstruzioniDelProgettoFn: () => fiduciaDellaCartellaFn() === false } : {}),
    preparaEsecuzioneFn: (id) => ({ ok: true, cartella: radice, task: { id, consegna: 'Verifica.' }, comandoProva: null }),
    avviaSessioneFn: (input) => { input.onEvento({ type: 'RunStarted' }); return new Promise(() => {}) } })
  t.after(() => registro.chiudi())
  return registro
}
const rigaDi = (registro, sessionId) => registro.elenca().find((r) => r.sessionId === sessionId)

test('RIGA NELL\'ELENCO ROSSA — cartella col «No»: la riga porta cartellaNonFidata e pienoTrattenuto, come l\'istantanea', (t) => {
  let fidata = false
  const registro = banco(t, () => fidata)
  const { sessionId } = registro.avvia('a', { permessiScelto: 'Full access' })
  const riga = rigaDi(registro, sessionId)
  assert.equal(riga.permessi, 'On request')
  assert.equal(riga.cartellaNonFidata, true)
  assert.equal(riga.pienoTrattenuto, true)
  const { sessionId: altra } = registro.avvia('a', { permessiScelto: 'Workspace write' })
  assert.equal(rigaDi(registro, altra).cartellaNonFidata, true)
  assert.equal(Object.hasOwn(rigaDi(registro, altra), 'pienoTrattenuto'), false, 'chi non aveva scelto l\'Accesso pieno non ha niente di trattenuto')
  fidata = true
  registro.riapplicaFiducia()
  assert.equal(Object.hasOwn(rigaDi(registro, sessionId), 'cartellaNonFidata'), false, 'data la fiducia, la riga sparisce')
  assert.equal(rigaDi(registro, sessionId).permessi, 'Full access')
})

test('RIGA NELL\'ELENCO AL CONTRARIO — fidata, mai chiesta o senza fonte (CLI, telefono): nessun campo nuovo', (t) => {
  for (const fn of [() => true, () => null, null]) {
    const registro = banco(t, fn)
    const { sessionId } = registro.avvia('a', { permessiScelto: 'Full access' })
    const riga = rigaDi(registro, sessionId)
    assert.equal(Object.hasOwn(riga, 'cartellaNonFidata'), false)
    assert.equal(Object.hasOwn(riga, 'pienoTrattenuto'), false)
    assert.equal(riga.permessi, 'Full access')
  }
})
