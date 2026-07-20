const DEFAULT_TIMEOUT_MS = 5_000
const MAX_TIMEOUT_MS = 30_000
const MAX_RESPONSE_BYTES = 4_096

export class DeterministicProviderFixtureClient {
    private readonly baseUrl: URL
    private readonly controlToken: string
    private readonly timeoutMs: number

    constructor(baseUrl: string, controlToken: string, timeoutMs = DEFAULT_TIMEOUT_MS) {
        this.baseUrl = parseExactLoopbackOrigin(baseUrl)
        if (!/^[0-9a-f]{64}$/.test(controlToken)) {
            throw new Error('Deterministic provider control token must be 64 lowercase hexadecimal characters.')
        }
        if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 250 || timeoutMs > MAX_TIMEOUT_MS) {
            throw new Error(`Deterministic provider timeout must be between 250 and ${MAX_TIMEOUT_MS} milliseconds.`)
        }

        this.controlToken = controlToken
        this.timeoutMs = timeoutMs
    }

    async reset(): Promise<void> {
        let response: Response
        try {
            response = await fetch(new URL('/__control/reset', this.baseUrl), {
                method: 'POST',
                headers: {
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                    'X-Talos-Hj-Fixture-Token': this.controlToken,
                },
                body: '{}',
                redirect: 'error',
                signal: AbortSignal.timeout(this.timeoutMs),
            })
        } catch (cause) {
            throw new Error('Deterministic provider fixture reset request failed.', { cause })
        }

        const body = await readBoundedResponseBody(response, MAX_RESPONSE_BYTES)
        if (!response.ok) {
            throw new Error(`Deterministic provider fixture reset failed with HTTP ${response.status}.`)
        }

        let payload: unknown
        try {
            payload = JSON.parse(body)
        } catch (cause) {
            throw new Error('Deterministic provider fixture reset returned invalid JSON.', { cause })
        }

        if (!isRecord(payload) || Object.keys(payload).length !== 1 || payload.reset !== true) {
            throw new Error('Deterministic provider fixture reset returned an invalid acknowledgement.')
        }
    }
}

function parseExactLoopbackOrigin(value: string): URL {
    let parsed: URL
    try {
        parsed = new URL(value)
    } catch (cause) {
        throw new Error('Deterministic provider base URL must be an exact loopback HTTP origin.', { cause })
    }

    const port = Number(parsed.port)
    if (
        parsed.protocol !== 'http:'
        || parsed.hostname !== '127.0.0.1'
        || !/^\d{1,5}$/.test(parsed.port)
        || !Number.isSafeInteger(port)
        || port < 1
        || port > 65_535
        || parsed.username !== ''
        || parsed.password !== ''
        || parsed.pathname !== '/'
        || parsed.search !== ''
        || parsed.hash !== ''
    ) {
        throw new Error('Deterministic provider base URL must be an exact loopback HTTP origin.')
    }

    return parsed
}

async function readBoundedResponseBody(response: Response, maximumBytes: number): Promise<string> {
    const declaredLength = response.headers.get('content-length')
    if (declaredLength !== null && /^\d+$/.test(declaredLength) && Number(declaredLength) > maximumBytes) {
        throw new Error('Deterministic provider fixture reset response exceeded its byte limit.')
    }
    if (response.body === null) return ''

    const chunks: Uint8Array[] = []
    let totalBytes = 0
    const reader = response.body.getReader()
    while (true) {
        const { done, value } = await reader.read()
        if (done) break
        totalBytes += value.byteLength
        if (totalBytes > maximumBytes) {
            await reader.cancel()
            throw new Error('Deterministic provider fixture reset response exceeded its byte limit.')
        }
        chunks.push(value)
    }

    const body = new Uint8Array(totalBytes)
    let offset = 0
    for (const chunk of chunks) {
        body.set(chunk, offset)
        offset += chunk.byteLength
    }

    return new TextDecoder('utf-8', { fatal: true }).decode(body)
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}
