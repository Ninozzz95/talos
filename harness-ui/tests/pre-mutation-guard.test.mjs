import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { talosLavora } from '../src/kernel/talosHarness.mjs'

function workspace(t) {
  const root = mkdtempSync(join(tmpdir(), 'talos-pre-mutation-'))
  t.after(() => rimuoviCartellaDiProva(root))
  return root
}

function network(...replies) {
  const calls = []
  return {
    calls,
    fetch: async (url, options) => {
      const index = calls.length
      const body = JSON.parse(options.body)
      calls.push({ url, options, body })
      const message = replies[Math.min(index, replies.length - 1)]
      return {
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message }], usage: { prompt_tokens: 10, completion_tokens: 5 } }),
        text: async () => '',
      }
    },
  }
}

const TASK = { consegna: 'test' }
const DONE = { role: 'assistant', content: 'done', tool_calls: [] }
const WRITE = { role: 'assistant', content: null, tool_calls: [{ id: 'call_write', function: { name: 'scrivi', arguments: '{"percorso":"out.txt","contenuto":"hello"}' } }] }

test('text-only model turn never invokes the pre-mutation barrier', async (t) => {
  const root = workspace(t)
  const net = network(DONE)
  const actions = []
  const result = await talosLavora({ cartella: root, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: net.fetch, primaDiMutazioneFn: async (action) => actions.push(action) })
  assert.equal(result.comeFinita, 'concluso')
  assert.equal(net.calls.length, 1)
  assert.deepEqual(actions, [])
})

test('mutation barrier runs after provider tool-call response and before the filesystem effect', async (t) => {
  const root = workspace(t)
  const net = network(WRITE, DONE)
  const observations = []
  const result = await talosLavora({
    cartella: root, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: net.fetch,
    primaDiMutazioneFn: async (action) => observations.push({ providerCalls: net.calls.length, type: action.tipo, exists: existsSync(join(root, 'out.txt')) }),
  })
  assert.equal(result.comeFinita, 'concluso')
  assert.deepEqual(observations, [{ providerCalls: 1, type: 'scrivi', exists: false }])
  assert.equal(readFileSync(join(root, 'out.txt'), 'utf8'), 'hello')
  assert.equal(net.calls.length, 2)
})

test('failed mutation barrier refuses the effect after provider dispatch and preserves the checkpoint code', async (t) => {
  const root = workspace(t)
  const net = network(WRITE, DONE)
  let barriers = 0
  const result = await talosLavora({
    cartella: root, task: TASK, modello: 'x', chiave: 'y', fetchDiRete: net.fetch,
    primaDiMutazioneFn: async () => { barriers += 1; throw Object.assign(new Error('workspace exceeds checkpoint budget'), { code: 'CHECKPOINT_SNAPSHOT_TOO_LARGE' }) },
  })
  assert.equal(result.comeFinita, 'concluso')
  assert.equal(barriers, 1)
  assert.equal(existsSync(join(root, 'out.txt')), false)
  assert.equal(net.calls.length, 2, 'provider first emits tool call, then receives the refused tool result')
  const toolMessage = net.calls[1].body.messages.find((message) => message.role === 'tool')
  assert.match(toolMessage.content, /^REFUSED\./u)
  assert.match(toolMessage.content, /CHECKPOINT_SNAPSHOT_TOO_LARGE/u)
})
