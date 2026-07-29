/**
 * F2-T4 streaming primitives — lives in the LAZY provider-adapter graph (never
 * the initial bundle). SSE parsing is pure and fail-closed; the accumulator
 * survives chunk boundaries mid-line. The fetch helper streams via native
 * `fetch` + ReadableStream (Android WebView Chromium supports both); any
 * pre-first-byte failure is thrown so callers fall back to the buffered
 * CapacitorHttp path (attempt-and-fallback architecture, see F2 dossier).
 */

/** Parse one COMPLETE SSE text block into its `data:` payloads. */
export function parseTalosSseChunk(block: string): string[] {
    const payloads: string[] = []
    for (const rawLine of block.split('\n')) {
        const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine
        if (!line.startsWith('data:')) continue
        const payload = line.slice(5).trim()
        if (payload === '' || payload === '[DONE]') continue
        payloads.push(payload)
    }
    return payloads
}

export interface TalosSseAccumulator {
    push(chunk: string): string[]
    flush(): string[]
}

/** Accumulate stream chunks and emit payloads only for COMPLETE events. */
export function createTalosSseAccumulator(): TalosSseAccumulator {
    let buffer = ''
    return {
        push(chunk: string): string[] {
            buffer += chunk
            const events: string[] = []
            let boundary = buffer.indexOf('\n\n')
            while (boundary !== -1) {
                const block = buffer.slice(0, boundary)
                buffer = buffer.slice(boundary + 2)
                events.push(...parseTalosSseChunk(block))
                boundary = buffer.indexOf('\n\n')
            }
            return events
        },
        flush(): string[] {
            // Incomplete trailing data is dropped fail-closed: a truncated JSON
            // payload must never be parsed as if it were complete.
            const events = buffer.includes('\n\n') ? parseTalosSseChunk(buffer) : []
            buffer = ''
            return events
        },
    }
}

/** Accumulate NDJSON chunks and emit only COMPLETE lines (Ollama). */
export function createTalosLineAccumulator(): TalosSseAccumulator {
    let buffer = ''
    return {
        push(chunk: string): string[] {
            buffer += chunk
            const lines: string[] = []
            let boundary = buffer.indexOf('\n')
            while (boundary !== -1) {
                const line = buffer.slice(0, boundary).replace(/\r$/, '').trim()
                buffer = buffer.slice(boundary + 1)
                if (line) lines.push(line)
                boundary = buffer.indexOf('\n')
            }
            return lines
        },
        flush(): string[] {
            // A complete NDJSON line always ends with \n — trailing data without
            // one is truncated and must not be parsed (fail-closed).
            buffer = ''
            return []
        },
    }
}

export interface TalosStreamRequest {
    url: string
    headers: Record<string, string>
    body: unknown
    signal?: AbortSignal
    /** Called for each raw text chunk read from the response body. */
    onText: (chunk: string) => void
    /**
     * R1-2 — inactivity fence: abort when NO chunk arrives for this long.
     * Resets on every chunk, so slow-but-alive streams are never killed.
     */
    stallMs?: number
    /**
     * R1-SF-M3 — separate FIRST-byte budget: cold model loads (local Ollama)
     * legitimately stream nothing for minutes before the first byte. Distinct
     * error message so callers never silently re-request a stalled stream.
     */
    firstByteMs?: number
}

// Web-research correction (ledger R1-R3 §ricerca 1): 60s matches the
// established inter-chunk budget (Copilot hardcodes 60s and still sees
// congestion complaints — 45s was tighter than the industry floor).
const DEFAULT_STREAM_STALL_MS = 60_000
const DEFAULT_STREAM_FIRST_BYTE_MS = 180_000

/**
 * POST and stream the response body as decoded text. Throws BEFORE any chunk
 * is delivered when the request cannot start (CORS/network/HTTP error) so the
 * caller can transparently retry via the buffered transport.
 */
export async function talosFetchStream(request: TalosStreamRequest): Promise<void> {
    const response = await fetch(request.url, {
        method: 'POST',
        headers: request.headers,
        body: JSON.stringify(request.body),
        signal: request.signal,
    })
    if (!response.ok) {
        let detail = ''
        try { detail = (await response.text()).slice(0, 512) } catch { /* unreadable */ }
        throw new Error(`stream HTTP ${response.status}${detail ? `: ${detail}` : ''}`)
    }
    if (!response.body) throw new Error('stream unsupported: response has no body')
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    // R1-2 — the unfenced reader.read() was the last never-settles await in the
    // product (review finding #2): a mid-stream network stall left `sending`
    // stuck until an app kill. reader.cancel() resolves the pending read with
    // done:true, where the stalled flag turns completion into a visible error.
    const stallMs = request.stallMs ?? DEFAULT_STREAM_STALL_MS
    const firstByteMs = request.firstByteMs ?? DEFAULT_STREAM_FIRST_BYTE_MS
    let stalledAfter: number | null = null
    let sawFirstByte = false
    let fence: ReturnType<typeof setTimeout> | null = null
    const armFence = (ms: number): void => {
        if (fence !== null) clearTimeout(fence)
        fence = setTimeout(() => {
            stalledAfter = ms
            void reader.cancel().catch(() => undefined)
        }, ms)
    }
    try {
        armFence(firstByteMs)
        for (;;) {
            const { done, value } = await reader.read()
            if (done) {
                if (stalledAfter !== null) {
                    throw new Error(sawFirstByte
                        ? `stream stalled: no data received for ${stalledAfter}ms`
                        : `stream first byte timeout after ${stalledAfter}ms`)
                }
                break
            }
            // m5 note: once the fence FIRED the reader is already cancelled —
            // a value that raced in must NOT clear the verdict, or the killed
            // stream would end as a silent truncation instead of an honest
            // error. The verdict is sticky; armFence only replaces the timer.
            sawFirstByte = true
            if (stalledAfter === null) armFence(stallMs)
            request.onText(decoder.decode(value, { stream: true }))
        }
    } finally {
        if (fence !== null) clearTimeout(fence)
    }
    const tail = decoder.decode()
    if (tail) request.onText(tail)
}

export interface TalosStreamTextOptions {
    url: string
    headers: Record<string, string>
    body: unknown
    signal?: AbortSignal
    accumulator: TalosSseAccumulator
    /** Extract the text piece from ONE payload; malformed payloads are skipped. */
    extract: (payload: string) => string
    onChunk: (text: string) => void
    /**
     * Owner 2026-07-25 (defect #5): models stream their reasoning next to the
     * answer and TALOS threw it away. Each family carries it on a different
     * field, so the adapter supplies the extractor and the transport keeps the
     * two streams apart — reasoning must never leak into the answer text.
     */
    extractReasoning?: (payload: string) => string
    onReasoning?: (text: string) => void
}

export interface TalosStreamTextResult {
    text: string
    reasoning: string
}

/**
 * Drive a full streaming completion: fetch-stream the request, feed chunks
 * through the accumulator, extract text pieces and forward them live.
 * Returns the concatenated text (may be empty when the stream carried none).
 */
export async function talosStreamText(options: TalosStreamTextOptions): Promise<TalosStreamTextResult> {
    let text = ''
    let reasoning = ''
    const consume = (payloads: string[]): void => {
        for (const payload of payloads) {
            let piece = ''
            try {
                piece = options.extract(payload)
            } catch {
                // Malformed payload (bad JSON) — skip fail-closed, never crash the stream.
                piece = ''
            }
            if (piece) {
                text += piece
                options.onChunk(piece)
            }
            if (!options.extractReasoning) continue
            let thought = ''
            try {
                thought = options.extractReasoning(payload)
            } catch {
                thought = ''
            }
            if (thought) {
                reasoning += thought
                options.onReasoning?.(thought)
            }
        }
    }
    await talosFetchStream({
        url: options.url,
        headers: options.headers,
        body: options.body,
        signal: options.signal,
        onText: (chunk) => consume(options.accumulator.push(chunk)),
    })
    consume(options.accumulator.flush())
    return { text, reasoning }
}
