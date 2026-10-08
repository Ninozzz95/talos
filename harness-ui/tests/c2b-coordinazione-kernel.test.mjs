/*
 * ⛔⛔ C2b «Coordinazione» nel KERNEL (owner 08/10/2026 sera; contratto `C2B-CONTRATTO-2026-10-08.md`, §C) — la porta della
 *   delega legge `coordinazioneFn` a OGNI chiamata: «sempre» parte da sola, «chiedi» chiede con la carta (gara con lo Stop,
 *   nessuno davanti ⇒ no), «nega» rifiuta senza chiedere. Senza `coordinazioneFn` (la CLI) la delega va ESATTAMENTE come prima.
 *   Lo schema guadagna `modello` (facoltativo): solo se la persona l'ha chiesto, e va al chiamante come terzo argomento.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { talosLavora, verificaAvvioAgente, ATTREZZI_ESTESI_OPENAI } from '../src/kernel/talosHarness.mjs'
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs'

function cartella(t) {
  const c = mkdtempSync(join(tmpdir(), 'talos-c2b-'))
  t.after(() => rimuoviCartellaDiProva(c))
  return c
}
const chiama = (id, argomenti) => ({ id, type: 'function', function: { name: 'delega_sottotask', arguments: JSON.stringify(argomenti) } })
/** Un giro col fornitore finto di F027: ogni risposta è una tool-call o il testo finale. */
async function giro(c, risposte, opzioni = {}) {
  let n = 0
  const deleghe = []
  const domande = []
  const r = await talosLavora({
    cartella: c, task: { consegna: 'lavora' }, modello: 'x', chiave: 'y',
    fetchDiRete: async () => {
      const prossima = risposte[n++]
      const message = prossima ? { role: 'assistant', content: null, tool_calls: [prossima] } : { role: 'assistant', content: 'fatto' }
      return { ok: true, status: 200, text: async () => '', json: async () => ({ choices: [{ message }], usage: { prompt_tokens: 10, completion_tokens: 5 } }) }
    },
    onDelega: async (task, dove, opzioniDelega) => { deleghe.push({ task, opzioni: opzioniDelega }); return { esito: 'avviato', riassunto: `avviato: ${task}` } },
    ...opzioni,
    chiediApprovazioneFn: opzioni.risposta === undefined ? undefined : async (azione) => { domande.push(azione); return opzioni.risposta },
  })
  return { esito: (id) => r.messaggiFinali.find((m) => m.tool_call_id === id)?.content ?? '', deleghe, domande }
}

test('C2B-K-01 — senza coordinazioneFn (la CLI) la delega va come prima: nessuna domanda, lo stesso terzo argomento', async (t) => {
  const { esito, deleghe, domande } = await giro(cartella(t), [chiama('a', { task: 'scrivi il README' })], { risposta: true })
  assert.equal(esito('a'), 'avviato: scrivi il README')
  assert.deepEqual(domande, [])
  assert.deepEqual(deleghe, [{ task: 'scrivi il README', opzioni: { modalita: undefined } }], 'byte per byte come prima di C2b')
})

test('C2B-K-02 — «sempre»: parte senza carta, e il chiamante sa che è partita da sola', async (t) => {
  const { esito, deleghe, domande } = await giro(cartella(t), [chiama('a', { task: 't' })], { risposta: true, coordinazioneFn: () => ({ modo: 'sempre' }) })
  assert.equal(esito('a'), 'avviato: t')
  assert.deepEqual(domande, [])
  assert.deepEqual(deleghe[0].opzioni, { modalita: undefined, avvio: 'da-solo' })
})

test('C2B-K-03 — «chiedi»: la carta porta compito, cartella, modello e il perché; sì ⇒ parte «consentita», no ⇒ niente figlia', async (t) => {
  const c = cartella(t)
  const si = await giro(c, [chiama('a', { task: 'rifai i test', modello: 'z-ai/glm-5.3-flash' })], { risposta: true, coordinazioneFn: () => ({ modo: 'chiedi', motivo: 'spenta' }) })
  assert.deepEqual(si.domande, [{ tipo: 'delega_sottotask', toolCallId: 'a', compito: 'rifai i test', modello: 'z-ai/glm-5.3-flash', coordinazione: { motivo: 'spenta' } }])
  assert.deepEqual(si.deleghe[0].opzioni, { modalita: undefined, modello: 'z-ai/glm-5.3-flash', avvio: 'consentito' })
  const no = await giro(c, [chiama('b', { task: 'rifai i test', cartella: c })], { risposta: false, coordinazioneFn: () => ({ modo: 'chiedi', motivo: 'tetto' }) })
  assert.deepEqual(no.domande, [{ tipo: 'delega_sottotask', toolCallId: 'b', compito: 'rifai i test', cartella: c, coordinazione: { motivo: 'tetto' } }])
  assert.deepEqual(no.deleghe, [], 'un no non fa nascere nessuna figlia')
  assert.match(no.esito('b'), /^REFUSED\. the person did not approve starting this agent\. No child was started\./u)
})

test('C2B-K-04 — «chiedi» senza nessuno davanti (automazione): il no porta il suo motivo; senza canale: rifiuto onesto', async (t) => {
  const c = cartella(t)
  const nessuno = await giro(c, [chiama('a', { task: 't' })], { risposta: { approvato: false, motivo: 'no one can answer here' }, coordinazioneFn: () => ({ modo: 'chiedi', motivo: 'spenta' }) })
  assert.match(nessuno.esito('a'), /^REFUSED\. no one can answer here No child was started\./u)
  assert.deepEqual(nessuno.deleghe, [])
  const senzaCanale = await giro(c, [chiama('b', { task: 't' })], { coordinazioneFn: () => ({ modo: 'chiedi', motivo: 'spenta' }) })
  assert.match(senzaCanale.esito('b'), /^REFUSED\. starting an agent needs the person's approval here, but this session has no approval channel\./u)
  assert.deepEqual(senzaCanale.deleghe, [])
})

test('C2B-K-05 — «nega»: rifiuto senza chiedere, nessuna figlia', async (t) => {
  const { esito, deleghe, domande } = await giro(cartella(t), [chiama('a', { task: 't' })], { risposta: true, coordinazioneFn: () => ({ modo: 'nega' }) })
  assert.deepEqual(domande, [])
  assert.deepEqual(deleghe, [])
  assert.match(esito('a'), /^REFUSED\. starting agents is turned off in this session\./u)
})

test('C2B-K-06 — coordinazioneFn si legge a OGNI delega: la persona la cambia a metà giro e vale subito', async (t) => {
  const modi = [{ modo: 'sempre' }, { modo: 'chiedi', motivo: 'spenta' }]
  let letture = 0
  const { deleghe, domande } = await giro(cartella(t), [chiama('a', { task: 'uno' }), chiama('b', { task: 'due' })], { risposta: true, coordinazioneFn: () => modi[letture++] })
  assert.equal(letture, 2)
  assert.deepEqual(deleghe.map((d) => d.opzioni.avvio), ['da-solo', 'consentito'])
  assert.deepEqual(domande.map((d) => d.toolCallId), ['b'])
})

test('C2B-K-07 — AL CONTRARIO: un modello storto è rifiutato prima di chiedere; lo schema lo offre solo su richiesta della persona', async (t) => {
  const { esito, deleghe, domande } = await giro(cartella(t), [chiama('a', { task: 't', modello: 7 }), chiama('b', { task: 't', modello: '   ' })], { risposta: true, coordinazioneFn: () => ({ modo: 'chiedi', motivo: 'spenta' }) })
  assert.match(esito('a'), /^INVALID\. modello must be a model name/u)
  assert.match(esito('b'), /^INVALID\. modello must be a model name/u, 'un nome fatto di soli spazi non è un nome')
  assert.deepEqual(domande, [], 'nessuna carta per una chiamata storta')
  assert.deepEqual(deleghe, [])
  const schema = ATTREZZI_ESTESI_OPENAI.find((a) => a.function.name === 'delega_sottotask').function.parameters
  assert.equal(schema.properties.modello?.type, 'string')
  assert.match(schema.properties.modello.description, /only when the person explicitly asked/u)
  assert.equal(schema.required.includes('modello'), false)
})

test('C2B-K-09 — AL CONTRARIO: se chi ospita non sa dire lo stato (coordinazioneFn lancia), si chiede alla persona, mai «da sola»', async (t) => {
  const { deleghe, domande } = await giro(cartella(t), [chiama('a', { task: 't' })], { risposta: true, coordinazioneFn: () => { throw new Error('registro illeggibile') } })
  assert.deepEqual(domande.map((d) => d.coordinazione), [{ motivo: 'spenta' }], 'la carta, col perché «spenta»')
  assert.deepEqual(deleghe.map((d) => d.opzioni.avvio), ['consentito'], 'partita solo col sì, e segnata come consentita')
})

test('C2B-K-08 — la carta corre in gara con lo Stop: fermare mentre chiede non è un «no» della persona', async () => {
  const stop = new AbortController()
  const appesa = new Promise(() => {})
  setTimeout(() => stop.abort(), 30)
  const t0 = Date.now()
  const esito = await verificaAvvioAgente({ tipo: 'delega_sottotask', toolCallId: 'a', compito: 't' },
    { coordinazione: { modo: 'chiedi', motivo: 'spenta' }, chiediApprovazioneFn: () => appesa, segnaleStop: stop.signal })
  assert.ok(Date.now() - t0 < 1000, 'non resta appesa alla carta')
  assert.deepEqual(esito, { consentito: false, via: 'fermato-su-richiesta', motivo: "stopped on request while waiting for the person's approval for \"delega_sottotask\"." })
  // e un cancello che lancia non autorizza in silenzio
  const rotto = await verificaAvvioAgente({ tipo: 'delega_sottotask', toolCallId: 'b', compito: 't' },
    { coordinazione: { modo: 'chiedi', motivo: 'spenta' }, chiediApprovazioneFn: () => { throw new Error('canale caduto') } })
  assert.equal(rotto.consentito, false)
})
