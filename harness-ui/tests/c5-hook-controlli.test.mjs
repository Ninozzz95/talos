/*
 * C5, review N3 del bugfixer (10/10/2026) — un hook vede anche il nome che il modello ha CHIAMATO e, per i tre controlli accorpati
 *   (child_control, automation_control, research_control), l'azione. `azione` resta quella di sempre: per le ricerche il nome di
 *   prima (`research_pause`), che è ciò che un hook scritto prima della C5 confronta. Additivo.
 */
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { talosLavora } from '../src/kernel/talosHarness.mjs'
import { rimuoviCartellaDiProva } from './aiuto/rimuovi-cartella-di-prova.mjs'

async function giro(t, chiamate, extra = {}) {
    const cartella = mkdtempSync(join(tmpdir(), 'talos-c5-hook-'))
    t.after(() => rimuoviCartellaDiProva(cartella))
    writeFileSync(join(cartella, 'a.txt'), 'x\n')
    const eventi = []
    let n = 0
    await talosLavora({
        cartella, task: { consegna: 'prova' }, modello: 'f', chiave: 'k', giriMassimi: 3,
        strumentiEstesi: ['research_control', 'child_control', 'automation_control'],
        hookFn: async (e) => { if (e.tipo === 'pre_tool_call' || e.tipo === 'post_tool_call') eventi.push(e); return undefined },
        fetchDiRete: async () => {
            const message = n++ === 0
                ? { role: 'assistant', content: null, tool_calls: chiamate.map(([name, args], i) => ({ id: `c${i}`, type: 'function', function: { name, arguments: JSON.stringify(args) } })) }
                : { role: 'assistant', content: 'fatto' }
            return new Response(JSON.stringify({ choices: [{ message, finish_reason: n === 1 ? 'tool_calls' : 'stop' }] }), { headers: { 'Content-Type': 'application/json' } })
        },
        ...extra,
    })
    return eventi
}

test('C5-HOOK-01: research_control — azione is the old name as always, attrezzoChiamato and action say what the model called', async (t) => {
    const eventi = await giro(t, [['research_control', { id: 'r1', action: 'Pause' }]], { onRicercaPausa: async () => ({ ok: true, esito: 'paused' }) })
    const pre = eventi.find((e) => e.tipo === 'pre_tool_call')
    const post = eventi.find((e) => e.tipo === 'post_tool_call')
    for (const e of [pre, post]) {
        assert.equal(e.azione, 'research_pause')
        assert.equal(e.attrezzoChiamato, 'research_control')
        assert.equal(e.action, 'pause')
    }
    assert.deepEqual(pre.argomenti, { id: 'r1' }, 'the arguments of before: action is in the name')
})

test('C5-HOOK-02: child_control and automation_control carry their action; a plain tool carries only attrezzoChiamato', async (t) => {
    const eventi = await giro(t, [['child_control', { childId: 'f1', action: 'stop' }], ['automation_control', { id: 'a1', action: 'run' }], ['leggi', { percorso: 'a.txt' }]])
    const pre = eventi.filter((e) => e.tipo === 'pre_tool_call')
    assert.deepEqual(pre.map((e) => [e.azione, e.attrezzoChiamato, e.action]),
        [['child_control', 'child_control', 'stop'], ['automation_control', 'automation_control', 'run'], ['leggi', 'leggi', undefined]])
    assert.equal('action' in pre[2], false, 'no action field on a tool that has none')
})
