/*
 * ⭐ 0.1.25 (owner 09/10/2026) nel KERNEL — gli attrezzi dei fornitori esclusi: si OFFRONO solo con `onFornitoriFn` e mai alle
 *   figlie; in Piano solo l'elenco; anteprima dall'ospite, carta se la chiede (sì ⇒ esegue; no ⇒ «REFUSED. <motivo>»), esecuzione.
 *   Stesso banco di `automation-kernel.test.mjs`.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { talosLavora, ATTREZZI_FORNITORI } from '../src/kernel/talosHarness.mjs'
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs'

function cartella(t) {
  const c = mkdtempSync(join(tmpdir(), 'talos-forn-k-'))
  t.after(() => rimuoviCartellaDiProva(c))
  return c
}
const chiama = (id, nome, argomenti) => ({ id, type: 'function', function: { name: nome, arguments: JSON.stringify(argomenti) } })
async function giro(c, risposte, opzioni = {}) {
  let n = 0
  const offerti = []
  const domande = []
  const ospite = []
  const r = await talosLavora({
    cartella: c, task: { consegna: 'lavora' }, modello: 'x', chiave: 'y', strumentiEstesi: [...ATTREZZI_FORNITORI],
    fetchDiRete: async (_url, init) => {
      const corpo = JSON.parse(init?.body ?? '{}')
      offerti.push((corpo.tools ?? []).map((a) => a.function?.name).filter(Boolean))
      const prossima = risposte[n++]
      const message = prossima ? { role: 'assistant', content: null, tool_calls: [prossima] } : { role: 'assistant', content: 'fatto' }
      return { ok: true, status: 200, text: async () => '', json: async () => ({ choices: [{ message }], usage: { prompt_tokens: 10, completion_tokens: 5 } }) }
    },
    ...(opzioni.ospite ? { onFornitoriFn: async (nome, argomenti, fase) => { ospite.push([nome, argomenti, fase.fase]); return opzioni.ospite(nome, argomenti, fase) } } : {}),
    ...(opzioni.extra ?? {}),
    chiediApprovazioneFn: opzioni.risposta === undefined ? undefined : async (azione) => { domande.push(azione); return opzioni.risposta },
  })
  return { esito: (id) => r.messaggiFinali.find((m) => m.tool_call_id === id)?.content ?? '', offerti, domande, ospite }
}
const OSPITE = (nome, argomenti, { fase }) => {
  if (fase === 'anteprima') {
    if (argomenti.provider === 'boh!') return { ok: false, messaggio: '"boh!" is not a provider short name' }
    return nome === 'provider_exclusions_list' ? { ok: true, carta: false }
      : { ok: true, carta: true, azione: { fornitore: argomenti.provider, modello: null, campo: 'persona', prima: [], dopo: [argomenti.provider] } }
  }
  return { ok: true, testo: `${nome} done` }
}

test('FORN-K-01 — si offrono SOLO con l\'ospite: tutti e tre; senza, nessuno (la CLI); a una figlia no', async (t) => {
  const c = cartella(t)
  const con = await giro(c, [], { ospite: OSPITE })
  assert.deepEqual(con.offerti[0].filter((n) => ATTREZZI_FORNITORI.has(n)).sort(), [...ATTREZZI_FORNITORI].sort())
  const senza = await giro(c, [])
  assert.deepEqual(senza.offerti[0].filter((n) => ATTREZZI_FORNITORI.has(n)), [])
  const figlia = await giro(c, [], { ospite: OSPITE, extra: { agentRole: 'child' } })
  assert.deepEqual(figlia.offerti[0].filter((n) => ATTREZZI_FORNITORI.has(n)), [])
})

test('FORN-K-02 — escludere: anteprima, carta col prima → dopo, sì ⇒ esegue; no ⇒ REFUSED col motivo e niente esecuzione', async (t) => {
  const c = cartella(t)
  const si = await giro(c, [chiama('a', 'provider_exclude', { provider: 'deepinfra' })], { ospite: OSPITE, risposta: true })
  assert.deepEqual(si.domande, [{ fornitore: 'deepinfra', modello: null, campo: 'persona', prima: [], dopo: ['deepinfra'], tipo: 'provider_exclude', toolCallId: 'a' }])
  assert.deepEqual(si.ospite.map(([nome, , fase]) => `${nome}:${fase}`), ['provider_exclude:anteprima', 'provider_exclude:esegui'])
  assert.equal(si.esito('a'), 'provider_exclude done')
  const no = await giro(c, [chiama('b', 'provider_exclude', { provider: 'deepinfra' })], { ospite: OSPITE, risposta: { approvato: false, motivo: 'The person said no.' } })
  assert.equal(no.esito('b'), 'REFUSED. The person said no.')
  assert.deepEqual(no.ospite.map(([, , fase]) => fase), ['anteprima'])
})

test('FORN-K-03 — l\'elenco non chiede la carta; un errore dell\'anteprima torna subito; in Piano si offre solo l\'elenco', async (t) => {
  const c = cartella(t)
  const elenco = await giro(c, [chiama('a', 'provider_exclusions_list', {})], { ospite: OSPITE, risposta: true })
  assert.deepEqual(elenco.domande, [])
  assert.equal(elenco.esito('a'), 'provider_exclusions_list done')
  const sbagliato = await giro(c, [chiama('b', 'provider_exclude', { provider: 'boh!' })], { ospite: OSPITE, risposta: true })
  assert.equal(sbagliato.esito('b'), 'REFUSED. "boh!" is not a provider short name')
  assert.deepEqual(sbagliato.domande, [])
  const piano = await giro(c, [], { ospite: OSPITE, extra: { modalitaOperativa: 'piano' } })
  assert.deepEqual(piano.offerti[0].filter((n) => ATTREZZI_FORNITORI.has(n)), ['provider_exclusions_list'])
})

test('FORN-K-05 — chatgpt_account (11/10/2026): passa dall\'ospite; scollegare chiede la carta col nome dell\'attrezzo; a una figlia no', async (t) => {
  const c = cartella(t)
  const estesi = { strumentiEstesi: ['chatgpt_account'] } // nominato a mano: la prova non deve dipendere dall'insieme che verifica
  const ospite = (nome, argomenti, { fase }) => fase === 'anteprima'
    ? (argomenti.action === 'disconnect' ? { ok: true, carta: true, azione: { fornitore: 'chatgpt', email: 'nino@example.com' } } : { ok: true, carta: false })
    : { ok: true, testo: `${nome} ${argomenti.action} ok` }
  const stato = await giro(c, [chiama('a', 'chatgpt_account', { action: 'status' })], { ospite, risposta: true, extra: estesi })
  assert.ok(stato.offerti[0].includes('chatgpt_account'))
  assert.equal(stato.esito('a'), 'chatgpt_account status ok')
  assert.deepEqual(stato.domande, [])
  const esci = await giro(c, [chiama('b', 'chatgpt_account', { action: 'disconnect' })], { ospite, risposta: true, extra: estesi })
  assert.deepEqual(esci.domande, [{ fornitore: 'chatgpt', email: 'nino@example.com', tipo: 'chatgpt_account', toolCallId: 'b' }])
  assert.equal(esci.esito('b'), 'chatgpt_account disconnect ok')
  const figlia = await giro(c, [], { ospite, extra: { ...estesi, agentRole: 'child' } })
  assert.equal(figlia.offerti[0].includes('chatgpt_account'), false)
  const senzaOspite = await giro(c, [], { extra: estesi })
  assert.equal(senzaOspite.offerti[0].includes('chatgpt_account'), false, 'la CLI, senza ospite, non lo vede')
})
