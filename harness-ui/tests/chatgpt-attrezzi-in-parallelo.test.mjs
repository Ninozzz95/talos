/*
 * PERF R-35, P1 (owner 30/10/2026 «Tutti e tre»; forma approvata da Desktop, CLI e Mobile). Misura che l'ha chiesto: campagna
 * pubblica-luna-ebb04d2c1, con gpt-6-luna sul piano TALOS fa 100–111 passi del modello su G e H contro 17–23 di Codex, e 85 risposte
 * su 96 chiedono UN attrezzo solo. TALOS non mandava `parallel_tool_calls` (l'SDK `ai` lo mette solo con `providerOptions`); Codex lo
 * manda `true` per i modelli del piano (`codex-rs/models-manager/models.json:539` «supports_parallel_tool_calls: true» per gpt-6-luna,
 * `codex-rs/core/src/client.rs:1083`). ⇒ Sul filo del piano, una richiesta CON attrezzi porta `parallel_tool_calls: true`.
 *   - PAR-01: il corpo del piano: con attrezzi ⇒ true; senza ⇒ assente; la scelta di chi chiama resta sua.
 *   - PAR-02: attraverso l'adattatore e l'SDK veri, fino al filo.
 *   - PAR-03 (CLI 1): il flusso Responses INTRECCIA gli argomenti di due chiamate: ogni delta arriva col SUO toolCallId e le due
 *     chiamate finali hanno gli argomenti giusti.
 *   - PAR-04 (CLI 2): due chiamate IDENTICHE nella stessa risposta: ognuna ha il suo esito, nessuna riga resta senza risultato.
 *   - PAR-05 (CLI 3): Stop con quattro letture in parallelo in corso: tutte e quattro si chiudono.
 *   - PAR-06 (Mobile): tre chiamate in parallelo che chiedono il consenso: tre domande, un giro di consensi, tre esiti.
 */
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import { adattaCorpoAlPiano, creaFetchDelPiano } from '../src/chatgpt-richiesta.mjs';
import { nativeProviderResponse } from '../src/native-provider-adapter.mjs';
import { consumaFlussoSSE, talosLavora } from '../src/kernel/talosHarness.mjs';
import { cartellaDiProva } from './aiuto/cartelle-di-prova.mjs';
import { corpoSenzaMarcatori } from './aiuto/corpo-senza-marcatori.mjs';

const ATTREZZO = (nome) => ({ type: 'function', function: { name: nome, description: nome, parameters: { type: 'object', properties: { percorso: { type: 'string' } } } } });
const sse = (eventi) => `${eventi.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('')}data: [DONE]\n\n`;

test('PAR-01 il corpo del piano: con attrezzi parallel_tool_calls true; senza attrezzi assente; la scelta di chi chiama resta sua', () => {
  const conAttrezzi = { model: 'gpt-6-luna', input: [{ role: 'user', content: 'x' }], tools: [{ type: 'function', name: 'leggi', parameters: {} }] }
  assert.equal(adattaCorpoAlPiano(conAttrezzi).corpo.parallel_tool_calls, true)
  assert.equal(Object.hasOwn(adattaCorpoAlPiano({ model: 'gpt-6-luna', input: [] }).corpo, 'parallel_tool_calls'), false)
  assert.equal(Object.hasOwn(adattaCorpoAlPiano({ model: 'gpt-6-luna', input: [], tools: [] }).corpo, 'parallel_tool_calls'), false)
  assert.equal(adattaCorpoAlPiano({ ...conAttrezzi, parallel_tool_calls: false }).corpo.parallel_tool_calls, false, 'chi chiama lo spegne: resta spento')
})

/* il filo del piano: un flusso Responses con DUE chiamate i cui argomenti arrivano intrecciati */
const USO = { input_tokens: 10, output_tokens: 5, input_tokens_details: { cached_tokens: 0 }, output_tokens_details: { reasoning_tokens: 0 } }
const voce = (k, nome) => ({ type: 'function_call', id: `fc_${k}`, call_id: `call_${k}`, name: nome, arguments: '', status: 'in_progress' })
const DUE_CHIAMATE = [
  { type: 'response.created', response: { id: 'r1', created_at: 1, model: 'gpt-6-luna', status: 'in_progress', output: [] } },
  { type: 'response.output_item.added', output_index: 0, item: voce('a', 'leggi') },
  { type: 'response.output_item.added', output_index: 1, item: voce('b', 'cerca') },
  { type: 'response.function_call_arguments.delta', output_index: 0, item_id: 'fc_a', delta: '{"percorso":' },
  { type: 'response.function_call_arguments.delta', output_index: 1, item_id: 'fc_b', delta: '{"percorso":' },
  { type: 'response.function_call_arguments.delta', output_index: 0, item_id: 'fc_a', delta: '"a.mjs"}' },
  { type: 'response.function_call_arguments.delta', output_index: 1, item_id: 'fc_b', delta: '"b.mjs"}' },
  { type: 'response.output_item.done', output_index: 0, item: { ...voce('a', 'leggi'), arguments: '{"percorso":"a.mjs"}', status: 'completed' } },
  { type: 'response.output_item.done', output_index: 1, item: { ...voce('b', 'cerca'), arguments: '{"percorso":"b.mjs"}', status: 'completed' } },
  { type: 'response.completed', response: { id: 'r1', created_at: 1, model: 'gpt-6-luna', status: 'completed', output: [{ ...voce('a', 'leggi'), arguments: '{"percorso":"a.mjs"}', status: 'completed' }, { ...voce('b', 'cerca'), arguments: '{"percorso":"b.mjs"}', status: 'completed' }], usage: USO } },
].map((e, i) => ({ ...e, sequence_number: i }))
async function dalPiano(eventi) {
  let filo = null
  const rete = async (_url, opzioni) => { filo = corpoSenzaMarcatori(opzioni.body); return new Response(sse(eventi), { status: 200, headers: { 'content-type': 'text/event-stream' } }) }
  const risposta = await nativeProviderResponse({ provider: 'chatgpt', model: 'gpt-6-luna', apiKey: 'T', baseURL: 'https://api.openai.com/v1', fetchFn: creaFetchDelPiano(rete),
    body: { model: 'gpt-6-luna', stream: true, messages: [{ role: 'system', content: 'S' }, { role: 'user', content: 'leggi a e cerca b' }], tools: [ATTREZZO('leggi'), ATTREZZO('cerca')], tool_choice: 'auto' } })
  return { risposta, filo: () => filo }
}

test('PAR-02 attraverso l\'adattatore e l\'SDK veri: sul filo del piano parte parallel_tool_calls true', async () => {
  const { risposta, filo } = await dalPiano(DUE_CHIAMATE)
  await risposta.text()
  assert.equal(filo().parallel_tool_calls, true, JSON.stringify(Object.keys(filo())))
})

test('PAR-03 (CLI 1) argomenti INTRECCIATI di due chiamate: ogni delta col suo toolCallId, le due chiamate con gli argomenti giusti', async () => {
  const { risposta } = await dalPiano(DUE_CHIAMATE)
  const delta = []
  const { scelta } = await consumaFlussoSSE(risposta, (d) => delta.push(d), { inattivitaDatiMs: 0, nomiAttrezzi: ['leggi', 'cerca'] })
  const chiamate = (scelta.tool_calls ?? []).map((c) => ({ id: c.id, nome: c.function.name, argomenti: JSON.parse(c.function.arguments) }))
  assert.deepEqual(chiamate, [{ id: 'call_a', nome: 'leggi', argomenti: { percorso: 'a.mjs' } }, { id: 'call_b', nome: 'cerca', argomenti: { percorso: 'b.mjs' } }])
  const perId = new Map()
  for (const d of delta.filter((x) => x.tipo === 'tool-args' || x.tipo === 'tool-inizio')) {
    assert.ok(d.toolCallId === 'call_a' || d.toolCallId === 'call_b', `un delta senza il suo toolCallId: ${JSON.stringify(d)}`)
    if (d.tipo === 'tool-args') perId.set(d.toolCallId, (perId.get(d.toolCallId) ?? '') + (d.delta ?? ''))
  }
  for (const [id, testo] of perId) assert.equal(testo, id === 'call_a' ? '{"percorso":"a.mjs"}' : '{"percorso":"b.mjs"}', `gli argomenti ricostruiti per ${id}`)
})

/* il giro vero del kernel, con una rete finta nella forma chat (la stessa che esce dall'adattatore) */
const chunk = (o) => `data: ${JSON.stringify(o)}\n\n`
function rispostaConChiamate(chiamate) {
  return new Response([
    ...chiamate.map((c, i) => chunk({ choices: [{ index: 0, delta: { tool_calls: [{ index: i, id: c.id, type: 'function', function: { name: c.nome, arguments: JSON.stringify(c.argomenti) } }] } }] })),
    chunk({ choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }], usage: { prompt_tokens: 10, completion_tokens: 5 } }),
    'data: [DONE]\n\n',
  ].join(''), { status: 200, headers: { 'content-type': 'text/event-stream' } })
}
const rispostaTesto = (testo) => new Response(`${chunk({ choices: [{ index: 0, delta: { content: testo } }] })}${chunk({ choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })}data: [DONE]\n\n`, { status: 200, headers: { 'content-type': 'text/event-stream' } })

function righeDegliAttrezzi(eventi) {
  const inizio = new Set(eventi.filter((e) => e.tipo === 'tool-inizio').map((e) => e.toolCallId))
  const chiusi = new Set(eventi.filter((e) => ['tool-esito', 'tool-annullato'].includes(e.tipo)).map((e) => e.toolCallId).filter(Boolean))
  return { inizio, chiusi, aperti: [...inizio].filter((id) => !chiusi.has(id)) }
}

test('PAR-04 (CLI 2) due chiamate IDENTICHE nella stessa risposta: ognuna ha il suo esito, nessuna resta senza risultato', async () => {
  const cartella = cartellaDiProva('talos-par-uguali-')
  writeFileSync(join(cartella, 'a.mjs'), 'export const a = 1\n')
  const eventi = [], delta = []
  let i = 0
  await talosLavora({
    cartella, task: { consegna: 'leggi a.mjs' }, modello: 'z-ai/glm-5.3-flash', chiave: 'finta',
    onDelta: (d) => delta.push(d), onGiro: (e) => eventi.push(e),
    fetchDiRete: async () => (i++ === 0 ? rispostaConChiamate([{ id: 'c1', nome: 'leggi', argomenti: { percorso: 'a.mjs' } }, { id: 'c2', nome: 'leggi', argomenti: { percorso: 'a.mjs' } }]) : rispostaTesto('Fatto.')),
  })
  const tutti = [...eventi, ...delta]
  const { inizio, aperti } = righeDegliAttrezzi(tutti)
  assert.ok(inizio.size >= 1, 'premessa: le chiamate sono partite')
  assert.deepEqual(aperti, [], `righe senza esito: ${JSON.stringify(aperti)}`)
})

test('PAR-05 (CLI 3) Stop con quattro letture in parallelo in corso: tutte e quattro si chiudono, nessuna resta aperta', async () => {
  const cartella = cartellaDiProva('talos-par-stop-')
  for (const n of ['a', 'b', 'c', 'd']) writeFileSquietto(join(cartella, `${n}.mjs`))
  const eventi = [], delta = []
  const ac = new AbortController()
  let i = 0
  await talosLavora({
    cartella, task: { consegna: 'leggi quattro file' }, modello: 'z-ai/glm-5.3-flash', chiave: 'finta', segnaleStop: ac.signal,
    onDelta: (d) => { delta.push(d); if (d.tipo === 'tool-inizio' && delta.filter((x) => x.tipo === 'tool-inizio').length === 4) ac.abort() },
    onGiro: (e) => eventi.push(e),
    fetchDiRete: async () => (i++ === 0 ? rispostaConChiamate(['a', 'b', 'c', 'd'].map((n, k) => ({ id: `c${k}`, nome: 'leggi', argomenti: { percorso: `${n}.mjs` } }))) : rispostaTesto('Fatto.')),
  }).catch(() => null)
  const { inizio, aperti } = righeDegliAttrezzi([...eventi, ...delta])
  assert.equal(inizio.size, 4, 'premessa: quattro chiamate annunciate')
  assert.deepEqual(aperti, [], `righe aperte dopo lo Stop: ${JSON.stringify(aperti)}`)
})
function writeFileSquietto(percorso) { writeFileSync(percorso, 'export const x = 1\n') }

test('PAR-06 (Mobile) tre chiamate in parallelo che chiedono il consenso: tre domande, ognuna col suo id, tre esiti', async () => {
  const cartella = cartellaDiProva('talos-par-consensi-')
  const eventi = [], delta = [], chieste = []
  let i = 0
  await talosLavora({
    cartella, task: { consegna: 'tre comandi' }, modello: 'z-ai/glm-5.3-flash', chiave: 'finta',
    livelloAccesso: 'scrittura-progetto', permessiPerAttrezzo: { shell: 'chiedi' },
    chiediApprovazioneFn: async (azione) => { chieste.push(azione); return true },
    onDelta: (d) => delta.push(d), onGiro: (e) => eventi.push(e),
    fetchDiRete: async () => (i++ === 0
      ? rispostaConChiamate([1, 2, 3].map((n) => ({ id: `s${n}`, nome: 'shell', argomenti: { comando: `echo uno${n}` } })))
      : rispostaTesto('Fatto.')),
  })
  assert.equal(chieste.length, 3, `tre domande di consenso: ${JSON.stringify(chieste.map((c) => c.toolCallId ?? c.comando))}`)
  const { inizio, aperti } = righeDegliAttrezzi([...eventi, ...delta])
  assert.equal(inizio.size, 3)
  assert.deepEqual(aperti, [], `righe senza esito: ${JSON.stringify(aperti)}`)
})
