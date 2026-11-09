/*
 * Mutante M26 della revisione permessi 2 (sopravvissuto): la decisione 173 dopo l'approvazione del piano. Un piano approvato «accettando le
 * modifiche» in una conversazione in Accesso pieno porta l'Accesso pieno (`permessiDopoIlPiano`); in una cartella che nel frattempo ha avuto
 * il «No» deve portare «On request», e ricordare l'Accesso pieno trattenuto: il «Sì» dalla pillola lo rimette (`riapplicaFiducia`).
 * Registro vero, giro finto, nessuna chiave, nessun dato vero.
 */
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { createSessionRegistry } from '../src/session-registry.mjs'

const PIANO = '## Piano\n1. Leggo `a.txt`.\n2. Scrivo `b.txt`.'
const STORIA = [{ role: 'user', content: 'pianifica' },
  { role: 'assistant', content: '', tool_calls: [{ id: 'call_piano', type: 'function', function: { name: 'present_plan', arguments: JSON.stringify({ plan: PIANO }) } }] }]

function banco(t, fidataFn) {
  const giri = []
  const registro = createSessionRegistry({ cartellaStore: mkdtempSync(join(tmpdir(), 'talos-m26-store-')), modello: 'm', chiave: 'k',
    guardaWorkspaceFn: () => () => {}, cartellaEsisteFn: () => true, fiduciaDellaCartellaFn: fidataFn,
    preparaEsecuzioneFn: (id) => ({ cartella: mkdtempSync(join(tmpdir(), 'talos-m26-')), comandoProva: null, task: { id, consegna: 'pianifica' } }),
    avviaSessioneFn: (input) => { giri.push(input); input.onEvento({ type: 'RunStarted', threadId: 't', runId: 'r' }); return new Promise(() => {}) } })
  t.after(() => registro.chiudi())
  return { registro, giri }
}

test('M26 — piano approvato con passaggio all\'Accesso pieno, in una cartella che ha avuto il «No»: On request; il «Sì» rimette l\'Accesso pieno', async (t) => {
  let fidata = true
  const { registro, giri } = banco(t, () => fidata)
  const { sessionId } = registro.avvia('a', { modalitaOperativaScelta: 'piano', permessiScelto: 'Full access' })
  assert.equal(registro.impostazioniCorrenti(sessionId).permessi, 'Full access', 'premessa: fidata, nasce in Accesso pieno')
  const attesa = giri[0].presentaPianoFn({ plan: PIANO, toolCallId: 'call_piano', messaggi: STORIA })
  const proposta = registro.esporta(sessionId).eventi.filter((e) => e.name === 'talos.plan').at(-1).value
  fidata = false // il «No» arriva mentre il piano aspetta (senza `riapplicaFiducia`: la carta del piano decide da sé)
  assert.deepEqual(await registro.rispondiPiano(sessionId, { requestId: proposta.requestId, decisione: 'procedi-accetta-modifiche', hash: proposta.hash }), { ok: true })
  const scelta = await attesa
  assert.equal(registro.impostazioniCorrenti(sessionId).permessi, 'On request', '173: niente Accesso pieno in una cartella non fidata')
  assert.equal(scelta.livelloAccesso, 'su-richiesta', 'e il nucleo lo sa nello stesso giro')
  assert.equal(registro.impostazioniCorrenti(sessionId).pienoTrattenuto, true, 'la riga fissa dice che l\'Accesso pieno è trattenuto')
  fidata = true
  assert.deepEqual(registro.riapplicaFiducia().cambiate, [sessionId])
  assert.equal(registro.impostazioniCorrenti(sessionId).permessi, 'Full access', 'il «Sì» rimette ciò che la persona aveva scelto')
})

test('M26 AL CONTRARIO — cartella fidata: il piano approvato porta l\'Accesso pieno, come prima', async (t) => {
  const { registro, giri } = banco(t, () => true)
  const { sessionId } = registro.avvia('a', { modalitaOperativaScelta: 'piano', permessiScelto: 'Full access' })
  const attesa = giri[0].presentaPianoFn({ plan: PIANO, toolCallId: 'call_piano', messaggi: STORIA })
  const proposta = registro.esporta(sessionId).eventi.filter((e) => e.name === 'talos.plan').at(-1).value
  await registro.rispondiPiano(sessionId, { requestId: proposta.requestId, decisione: 'procedi-accetta-modifiche', hash: proposta.hash })
  assert.equal((await attesa).livelloAccesso, 'accesso-pieno')
  assert.equal(registro.impostazioniCorrenti(sessionId).permessi, 'Full access')
  assert.equal(registro.impostazioniCorrenti(sessionId).pienoTrattenuto, undefined)
})
