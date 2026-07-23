import { describe, expect, it } from 'vitest'
import { parseTalosSseChunk, createTalosSseAccumulator, createTalosLineAccumulator } from '@/lib/chat/providers/streamShared'

// F2-T4 — streaming primitives (lazy module): SSE line parsing is pure and
// fail-closed; the accumulator survives chunk boundaries mid-line.
describe('parseTalosSseChunk (F2-T4)', () => {
    it('extracts data payloads from complete SSE events', () => {
        const events = parseTalosSseChunk('data: {"a":1}\n\ndata: {"b":2}\n\n')
        expect(events).toEqual(['{"a":1}', '{"b":2}'])
    })

    it('ignores comments, event names and [DONE] sentinels', () => {
        const events = parseTalosSseChunk(': keepalive\nevent: message_delta\ndata: {"x":1}\n\ndata: [DONE]\n\n')
        expect(events).toEqual(['{"x":1}'])
    })
})

describe('createTalosSseAccumulator (F2-T4)', () => {
    it('buffers partial lines across chunk boundaries', () => {
        const acc = createTalosSseAccumulator()
        expect(acc.push('data: {"part"')).toEqual([])
        expect(acc.push(':1}\n\ndata: {"z":9}\n\n')).toEqual(['{"part":1}', '{"z":9}'])
    })

    it('flush returns nothing for incomplete trailing data (fail-closed)', () => {
        const acc = createTalosSseAccumulator()
        acc.push('data: {"incomplete"')
        expect(acc.flush()).toEqual([])
    })
})

describe('createTalosLineAccumulator (F2-T4, NDJSON)', () => {
    it('emits only complete lines across chunk boundaries', () => {
        const acc = createTalosLineAccumulator()
        expect(acc.push('{"a":1}\n{"b"')).toEqual(['{"a":1}'])
        expect(acc.push(':2}\n')).toEqual(['{"b":2}'])
    })

    it('flush drops an incomplete trailing line (fail-closed)', () => {
        const acc = createTalosLineAccumulator()
        acc.push('{"truncated"')
        expect(acc.flush()).toEqual([])
    })
})
