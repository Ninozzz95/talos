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
}

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
    for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        request.onText(decoder.decode(value, { stream: true }))
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
}

/**
 * Drive a full streaming completion: fetch-stream the request, feed chunks
 * through the accumulator, extract text pieces and forward them live.
 * Returns the concatenated text (may be empty when the stream carried none).
 */
export async function talosStreamText(options: TalosStreamTextOptions): Promise<string> {
    let text = ''
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
    return text
}
