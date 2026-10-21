/*
 * R5.11, la SECONDA PORTA di «Annulla le modifiche ai file» nel KERNEL (owner 18/10/2026: «sì, con la carta di conferma»; «in
 *   Accesso pieno senza carta, come la legge»). Stesso banco di `fornitori-kernel.test.mjs`. Le tre condizioni della CLI (18/10):
 *   senza `onAnnullaFileFn` nessuna traccia, nemmeno nel testo di sistema; nomi e descrizione in inglese; (la terza, nessuno davanti,
 *   sta nel registro: `punti-di-ripristino-registro.test.mjs`).
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { talosLavora, ATTREZZI_ANNULLA } from '../src/kernel/talosHarness.mjs'
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs'

function cartella(t) {
  const c = mkdtempSync(join(tmpdir(), 'talos-annulla-k-'))
  t.after(() => rimuoviCartellaDiProva(c))
  return c
}
const chiama = (id, nome, argomenti) => ({ id, type: 'function', function: { name: nome, arguments: JSON.stringify(argomenti) } })
async function giro(c, risposte, opzioni = {}) {
  let n = 0
  const offerti = []
  const sistemi = []
  const domande = []
  const ospite = []
  const r = await talosLavora({
    cartella: c, task: { consegna: 'lavora' }, modello: 'x', chiave: 'y', strumentiEstesi: [...ATTREZZI_ANNULLA],
    fetchDiRete: async (_url, init) => {
      const corpo = JSON.parse(init?.body ?? '{}')
      offerti.push((corpo.tools ?? []).map((a) => a.function?.name).filter(Boolean))
      sistemi.push(JSON.stringify(corpo.messages ?? []))
      const prossima = risposte[n++]
      const message = prossima ? { role: 'assistant', content: null, tool_calls: [prossima] } : { role: 'assistant', content: 'fatto' }
      return { ok: true, status: 200, text: async () => '', json: async () => ({ choices: [{ message }], usage: { prompt_tokens: 10, completion_tokens: 5 } }) }
    },
    ...(opzioni.ospite ? { onAnnullaFileFn: async (nome, argomenti, fase) => { ospite.push([nome, argomenti, fase.fase]); return opzioni.ospite(nome, argomenti, fase) } } : {}),
    ...(opzioni.extra ?? {}),
    chiediApprovazioneFn: opzioni.risposta === undefined ? undefined : async (azione) => { domande.push(azione); return opzioni.risposta },
  })
  return { esito: (id) => r.messaggiFinali.find((m) => m.tool_call_id === id)?.content ?? '', offerti, sistemi, domande, ospite }
}
const OSPITE = (_nome, argomenti, { fase }) => {
  if (fase === 'anteprima') {
    if (argomenti.turns_back === 9) return { ok: false, messaggio: 'TALOS did not change any file in the earlier messages of this conversation: there is nothing to undo.' }
    return { ok: true, carta: true, azione: { tipo: 'file_changes_undo', turno: 1, ripristina: [{ stato: 'M', percorso: 'a.txt' }], salta: [], inclusi: [], fuori: [], diff: '' } }
  }
  return { ok: true, testo: 'Put back as they were before that message: a.txt. The person can redo it from the app.' }
}

test('ATT-K-01 — si offre SOLO con l\'ospite; senza (la CLI) non c\'è, né fra gli attrezzi né nei messaggi; a una figlia no', async (t) => {
  const c = cartella(t)
  const con = await giro(c, [], { ospite: OSPITE })
  assert.deepEqual(con.offerti[0].filter((n) => ATTREZZI_ANNULLA.has(n)), ['file_changes_undo'])
  const senza = await giro(c, [])
  assert.deepEqual(senza.offerti[0].filter((n) => ATTREZZI_ANNULLA.has(n)), [])
  assert.doesNotMatch(senza.sistemi[0], /file_changes_undo/u, 'richiesta CLI 18/10: nessuna traccia nel testo che riceve il modello')
  const figlia = await giro(c, [], { ospite: OSPITE, extra: { agentRole: 'child' } })
  assert.deepEqual(figlia.offerti[0].filter((n) => ATTREZZI_ANNULLA.has(n)), [])
})

test('ATT-K-02 — al contrario: in sola lettura non si offre nemmeno con l\'ospite (rimettere i file è una scrittura)', async (t) => {
  const c = cartella(t)
  const lettura = await giro(c, [], { ospite: OSPITE, extra: { livelloAccesso: 'lettura' } })
  assert.deepEqual(lettura.offerti[0].filter((n) => ATTREZZI_ANNULLA.has(n)), [])
})

test('ATT-K-03 — anteprima, carta col suo tipo, sì ⇒ esegue; no ⇒ REFUSED e niente esecuzione', async (t) => {
  const c = cartella(t)
  const si = await giro(c, [chiama('a', 'file_changes_undo', {})], { ospite: OSPITE, risposta: true })
  assert.equal(si.domande[0].tipo, 'file_changes_undo')
  assert.deepEqual(si.ospite.map(([, , f]) => f), ['anteprima', 'esegui'])
  assert.match(si.esito('a'), /^Put back as they were/u)
  const no = await giro(c, [chiama('b', 'file_changes_undo', {})], { ospite: OSPITE, risposta: false })
  assert.deepEqual(no.ospite.map(([, , f]) => f), ['anteprima'])
  assert.match(no.esito('b'), /^REFUSED\./u)
})

test('ATT-K-04 — un rifiuto dell\'anteprima arriva al modello col motivo, senza carta', async (t) => {
  const c = cartella(t)
  const r = await giro(c, [chiama('a', 'file_changes_undo', { turns_back: 9 })], { ospite: OSPITE, risposta: true })
  assert.deepEqual(r.domande, [])
  assert.match(r.esito('a'), /^REFUSED\. TALOS did not change any file/u)
})

test('ATT-K-05 — in Accesso pieno niente carta (owner 18/10, «come la legge»): esegue e lo dice nell\'esito', async (t) => {
  const c = cartella(t)
  const r = await giro(c, [chiama('a', 'file_changes_undo', {})], { ospite: OSPITE, risposta: true, extra: { livelloAccesso: 'accesso-pieno' } })
  assert.deepEqual(r.domande, [])
  assert.deepEqual(r.ospite.map(([, , f]) => f), ['anteprima', 'esegui'])
  assert.match(r.esito('a'), /Full access: done without asking the person\./u)
})
