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

// R1-2 — stream stall watchdog: a provider that hangs MID-stream (network
// handoff, server stall) previously left `sending` stuck forever — the exact
// never-settles class F5.1 fenced on the bridge path, now on the network path.
// The fence resets on every chunk: slow-but-alive streams are never killed.
import { vi } from 'vitest'
import { talosFetchStream } from '@/lib/chat/providers/streamShared'

function fakeStreamResponse(): { controller: ReadableStreamDefaultController<Uint8Array> } {
    const holder = {} as { controller: ReadableStreamDefaultController<Uint8Array> }
    const body = new ReadableStream<Uint8Array>({
        start(controller) { holder.controller = controller },
    })
    vi.stubGlobal('fetch', vi.fn(async () => new Response(body, { status: 200 })))
    return holder
}

describe('talosFetchStream stall watchdog (R1-2)', () => {
    it('rejects when the stream goes silent past the stall window, keeping delivered text', async () => {
        vi.useFakeTimers()
        try {
            const stream = fakeStreamResponse()
            const chunks: string[] = []
            const run = talosFetchStream({
                url: 'https://api.example/stream',
                headers: {},
                body: {},
                stallMs: 10_000,
                onText: (chunk) => chunks.push(chunk),
            })
            const settled = run.then(() => 'resolved', (error: Error) => error.message)
            await vi.advanceTimersByTimeAsync(1)
            stream.controller.enqueue(new TextEncoder().encode('hello '))
            await vi.advanceTimersByTimeAsync(9_000)
            // Silence from here: the watchdog must fire at +10s.
            await vi.advanceTimersByTimeAsync(10_100)
            const outcome = await settled
            expect(outcome).toMatch(/stalled/i)
            expect(chunks).toEqual(['hello '])
        } finally {
            vi.useRealTimers()
            vi.unstubAllGlobals()
        }
    })

    it('never kills a slow-but-alive stream (each chunk resets the fence)', async () => {
        vi.useFakeTimers()
        try {
            const stream = fakeStreamResponse()
            const chunks: string[] = []
            const run = talosFetchStream({
                url: 'https://api.example/stream',
                headers: {},
                body: {},
                stallMs: 10_000,
                onText: (chunk) => chunks.push(chunk),
            })
            await vi.advanceTimersByTimeAsync(1)
            for (let index = 0; index < 3; index += 1) {
                stream.controller.enqueue(new TextEncoder().encode(`c${index} `))
                await vi.advanceTimersByTimeAsync(8_000)
            }
            stream.controller.close()
            await vi.advanceTimersByTimeAsync(1)
            await expect(run).resolves.toBeUndefined()
            expect(chunks.join('')).toBe('c0 c1 c2 ')
        } finally {
            vi.useRealTimers()
            vi.unstubAllGlobals()
        }
    })
})

// R1-SF-M3 — distinct FIRST-byte budget: cold local models legitimately take
// minutes before the first byte; the verdict message differs so callers never
// silently re-request (double inference/billing) a stream the server accepted.
describe('talosFetchStream first-byte budget (R1-SF-M3)', () => {
    it('a stream that never produces a byte rejects with the first-byte verdict', async () => {
        vi.useFakeTimers()
        try {
            fakeStreamResponse()
            const run = talosFetchStream({
                url: 'https://api.example/stream',
                headers: {},
                body: {},
                stallMs: 10_000,
                firstByteMs: 30_000,
                onText: () => {},
            })
            const settled = run.then(() => 'resolved', (error: Error) => error.message)
            await vi.advanceTimersByTimeAsync(30_100)
            expect(await settled).toMatch(/first byte/i)
        } finally {
            vi.useRealTimers()
            vi.unstubAllGlobals()
        }
    })
})
