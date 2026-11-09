/*
 * L'attrezzo `computer_use` nel nucleo (passo 5, forma FORMA-ATTREZZO-COLLEGAMENTO §1): offerto SOLO alla radice, SOLO con l'ospite
 * `onComputerUseFn` e SOLO se il modello del giro vede le immagini; smistato all'ospite col suo toolCallId e il segnale di Stop, senza
 * la carta generica (la carta è quella del compito, dentro il ciclo). Fuori dal Piano.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { talosLavora, NOME_COMPUTER_USE, ATTREZZI_ESTESI_OPENAI, TESTO_DEL_NO } from '../src/kernel/talosHarness.mjs'
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs'

function cartella(t) {
  const c = mkdtempSync(join(tmpdir(), 'talos-cu-k-'))
  t.after(() => rimuoviCartellaDiProva(c))
  return c
}
const chiama = (id, nome, argomenti) => ({ id, type: 'function', function: { name: nome, arguments: JSON.stringify(argomenti) } })
const ospiteFinto = (registro, risposta = { ok: true, testo: 'Computer use finished: succeeded in 2 steps.' }) =>
  async (nome, argomenti, opzioni) => { registro.push({ nome, argomenti, opzioni }); return risposta }

async function giro(c, risposte, { ospite, vede = true, extra = {}, approvazioni = [] } = {}) {
  let n = 0
  const offerti = []
  const r = await talosLavora({
    cartella: c, task: { consegna: 'apri il blocco note e scrivi ciao' }, modello: 'x', chiave: 'y', strumentiEstesi: [NOME_COMPUTER_USE],
    fetchDiRete: async (_url, init) => {
      const corpo = JSON.parse(init?.body ?? '{}')
      offerti.push((corpo.tools ?? []).map((a) => a.function?.name).filter(Boolean))
      const prossima = risposte[n++]
      const message = prossima ? { role: 'assistant', content: null, tool_calls: [prossima] } : { role: 'assistant', content: 'fatto' }
      return { ok: true, status: 200, text: async () => '', json: async () => ({ choices: [{ message }], usage: { prompt_tokens: 10, completion_tokens: 5 } }) }
    },
    ...(ospite ? { onComputerUseFn: ospite } : {}),
    vedeImmaginiFn: async () => vede,
    chiediApprovazioneFn: async (azione) => { approvazioni.push(azione); return 'si' },
    ...extra,
  })
  return { esito: (id) => r.messaggiFinali.find((m) => m.tool_call_id === id)?.content ?? '', offerti }
}
const conCu = (elenco) => elenco.filter((n) => n === NOME_COMPUTER_USE)

test('CU-K-01: offerto con l\'ospite, alla radice, a un modello che vede; schema col solo «task»', async (t) => {
  const c = cartella(t)
  assert.deepEqual(conCu((await giro(c, [], { ospite: ospiteFinto([]) })).offerti[0]), [NOME_COMPUTER_USE])
  const schema = ATTREZZI_ESTESI_OPENAI.find((a) => a.function?.name === NOME_COMPUTER_USE)
  assert.deepEqual(schema.function.parameters.required, ['task'])
  assert.deepEqual(Object.keys(schema.function.parameters.properties), ['task'])
})

test('CU-K-02: assente senza ospite, a una figlia, se il modello non vede le immagini (o non si sa), in Piano', async (t) => {
  const c = cartella(t)
  assert.deepEqual(conCu((await giro(c, [])).offerti[0]), [], 'senza ospite (CLI, telefono, interruttore spento)')
  assert.deepEqual(conCu((await giro(c, [], { ospite: ospiteFinto([]), extra: { agentRole: 'child' } })).offerti[0]), [], 'figlia')
  assert.deepEqual(conCu((await giro(c, [], { ospite: ospiteFinto([]), vede: false })).offerti[0]), [], 'modello senza immagini')
  assert.deepEqual(conCu((await giro(c, [], { ospite: ospiteFinto([]), extra: { vedeImmaginiFn: async () => { throw new Error('x') } } })).offerti[0]), [], 'non si sa')
  assert.deepEqual(conCu((await giro(c, [], { ospite: ospiteFinto([]), extra: { modalitaOperativa: 'piano' } })).offerti[0]), [], 'Piano')
})

test('CU-K-03: la chiamata va all\'ospite col toolCallId, il segnale e il livello; nessuna carta generica; il testo torna al modello', async (t) => {
  const c = cartella(t)
  for (const livello of ['su-richiesta', 'scrittura-progetto', 'accesso-pieno']) {
    const registro = []; const approvazioni = []
    const ctl = new AbortController()
    const r = await giro(c, [chiama('cu1', NOME_COMPUTER_USE, { task: 'type hello in Notepad', extra: 'ignored' })],
      { ospite: ospiteFinto(registro), approvazioni, extra: { livelloAccesso: livello, segnaleStop: ctl.signal } })
    assert.equal(registro.length, 1, livello)
    assert.equal(registro[0].nome, NOME_COMPUTER_USE)
    assert.deepEqual(registro[0].argomenti, { task: 'type hello in Notepad' }, 'solo il task arriva all\'ospite')
    assert.equal(registro[0].opzioni.toolCallId, 'cu1')
    assert.equal(registro[0].opzioni.fase, 'esegui')
    assert.equal(registro[0].opzioni.segnale, ctl.signal)
    assert.equal(registro[0].opzioni.livelloAccesso, livello)
    assert.deepEqual(approvazioni, [], `nessuna carta generica in ${livello}`)
    assert.equal(r.esito('cu1'), 'Computer use finished: succeeded in 2 steps.')
  }
})

test('CU-K-04: chiamato a forza senza i requisiti (figlia, senza ospite) o senza task ⇒ non parte, e l\'ospite non è chiamato', async (t) => {
  const c = cartella(t)
  const registro = []
  const figlia = await giro(c, [chiama('f1', NOME_COMPUTER_USE, { task: 'x' })], { ospite: ospiteFinto(registro), extra: { agentRole: 'child' } })
  assert.doesNotMatch(figlia.esito('f1'), /succeeded/u)
  const vuoto = await giro(c, [chiama('v1', NOME_COMPUTER_USE, { task: '  ' })], { ospite: ospiteFinto(registro) })
  assert.match(vuoto.esito('v1'), /^REFUSED\./u)
  assert.equal(registro.length, 0)
  const rotto = await giro(c, [chiama('r1', NOME_COMPUTER_USE, { task: 'x' })], { ospite: async () => { throw new Error('boom') } })
  assert.match(rotto.esito('r1'), /computer_use failed: boom/u)
})

test('CU-K-05 (candidata, regola DECLINED): «Ferma» della persona sulla carta del compito ⇒ il modello legge DECLINED; un rifiuto di sicurezza resta REFUSED', async (t) => {
  const c = cartella(t)
  const coda = ' Computer use stopped after 0 steps; nothing more was done on the screen.'
  const no = await giro(c, [chiama('c1', NOME_COMPUTER_USE, { task: 'type hello in Notepad' })],
    { ospite: ospiteFinto([], { ok: false, testo: `REFUSED. the person did not approve it.${coda}` }) })
  assert.equal(no.esito('c1'), `${TESTO_DEL_NO}${coda}`)
  const sicurezza = await giro(c, [chiama('c2', NOME_COMPUTER_USE, { task: 'type hello in Notepad' })],
    { ospite: ospiteFinto([], { ok: false, testo: 'REFUSED. computer_use runs only for a request the person wrote in this turn. Nothing was done.' }) })
  assert.match(sicurezza.esito('c2'), /^REFUSED\. computer_use runs only/u)
})
