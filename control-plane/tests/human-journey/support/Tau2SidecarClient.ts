import {
    Tau2CreateTrialRequestSchema,
    Tau2CreateTrialResponseSchema,
    Tau2ErrorResponseSchema,
    Tau2NextTurnRequestSchema,
    Tau2TerminalTurnResponseSchema,
    Tau2TurnResponseSchema,
    type Tau2CreateTrialRequest,
    type Tau2NextTurnRequest,
    type Tau2TerminalTurnResponse,
    type Tau2TurnResponse,
} from '../contracts'

const DEFAULT_REQUEST_TIMEOUT_MS = 30_000
const DEFAULT_MAX_RESPONSE_BYTES = 256 * 1_024

interface WireParser<T> {
    safeParse(value: unknown): { success: true, data: T } | { success: false }
}

interface TrialState {
    token: string
    state: 'ready' | 'running' | 'terminal'
}

export interface Tau2TrialHandle {
    readonly trialId: string
    readonly maxTurns: number
}

export interface Tau2SidecarClientOptions {
    baseUrl: string
    bearerToken: string
    requestTimeoutMs?: number
    maxResponseBytes?: number
    fetchImpl?: typeof fetch
}

export interface Tau2SidecarTransport {
    createTrial(request: Tau2CreateTrialRequest, signal?: AbortSignal): Promise<Tau2TrialHandle>
    nextTurn(handle: Tau2TrialHandle, request: Tau2NextTurnRequest, signal?: AbortSignal): Promise<Tau2TurnResponse>
    cancel(handle: Tau2TrialHandle): Promise<Tau2TerminalTurnResponse | undefined>
    delete(handle: Tau2TrialHandle): Promise<void>
    close(): Promise<void>
}

export class Tau2SidecarFault extends Error {
    readonly code: string
    readonly status?: number

    constructor(code: string, message: string, options: { status?: number, cause?: unknown } = {}) {
        super(message, options.cause === undefined ? undefined : { cause: options.cause })
        this.name = 'Tau2SidecarFault'
        this.code = code
        this.status = options.status
    }
}

export class Tau2SidecarClient implements Tau2SidecarTransport {
    readonly #baseUrl: string
    readonly #bearerToken: string
    readonly #requestTimeoutMs: number
    readonly #maxResponseBytes: number
    readonly #fetch: typeof fetch
    readonly #trials = new WeakMap<Tau2TrialHandle, TrialState>()
    readonly #activeHandles = new Set<Tau2TrialHandle>()

    constructor(options: Tau2SidecarClientOptions) {
        this.#baseUrl = parseLoopbackOrigin(options.baseUrl)
        this.#bearerToken = parseSecret(options.bearerToken, 'process token')
        this.#requestTimeoutMs = boundedInteger(
            options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS,
            100,
            120_000,
            'request timeout',
        )
        this.#maxResponseBytes = boundedInteger(
            options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES,
            1_024,
            1_048_576,
            'maximum response bytes',
        )
        this.#fetch = options.fetchImpl ?? fetch
    }

    async createTrial(request: Tau2CreateTrialRequest, signal?: AbortSignal): Promise<Tau2TrialHandle> {
        const payload = Tau2CreateTrialRequestSchema.parse(request)
        const response = await this.#requestJson(
            '/v1/trials',
            {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(payload),
            },
            Tau2CreateTrialResponseSchema,
            [201],
            signal,
        )
        const handle: Tau2TrialHandle = Object.freeze({
            trialId: response.trial_id,
            maxTurns: response.max_turns,
        })
        this.#trials.set(handle, { token: response.trial_token, state: 'ready' })
        this.#activeHandles.add(handle)
        return handle
    }

    async nextTurn(
        handle: Tau2TrialHandle,
        request: Tau2NextTurnRequest,
        signal?: AbortSignal,
    ): Promise<Tau2TurnResponse> {
        const trial = this.#requireTrial(handle)
        if (trial.state === 'running') {
            throw new Tau2SidecarFault('SIDECAR_TRIAL_BUSY', 'The adaptive trial already has an active turn.')
        }
        if (trial.state === 'terminal') {
            throw new Tau2SidecarFault('SIDECAR_TRIAL_TERMINAL', 'The adaptive trial has already ended.')
        }

        trial.state = 'running'
        try {
            const response = await this.#requestJson(
                `/v1/trials/${encodeURIComponent(handle.trialId)}/turns`,
                {
                    method: 'POST',
                    headers: {
                        'content-type': 'application/json',
                        'x-talos-trial-token': trial.token,
                    },
                    body: JSON.stringify(Tau2NextTurnRequestSchema.parse(request)),
                },
                Tau2TurnResponseSchema,
                [200],
                signal,
            )
            trial.state = response.kind === 'terminal' ? 'terminal' : 'ready'
            return response
        } catch (error) {
            if (error instanceof Tau2SidecarFault && ['SIDECAR_ABORTED', 'SIDECAR_TIMEOUT'].includes(error.code)) {
                await this.#cancelInterruptedTurn(handle, trial)
            } else {
                trial.state = 'ready'
            }
            throw error
        }
    }

    async cancel(handle: Tau2TrialHandle): Promise<Tau2TerminalTurnResponse | undefined> {
        const trial = this.#requireTrial(handle)
        try {
            return await this.#cancelAndDelete(handle, trial)
        } finally {
            this.#invalidate(handle)
        }
    }

    async delete(handle: Tau2TrialHandle): Promise<void> {
        const trial = this.#requireTrial(handle)
        if (trial.state === 'running') {
            throw new Tau2SidecarFault('SIDECAR_TRIAL_BUSY', 'An active adaptive turn must be cancelled before deletion.')
        }
        try {
            await this.#requestWithoutBody(
                `/v1/trials/${encodeURIComponent(handle.trialId)}`,
                {
                    method: 'DELETE',
                    headers: { 'x-talos-trial-token': trial.token },
                },
                [204],
            )
        } finally {
            this.#invalidate(handle)
        }
    }

    async close(): Promise<void> {
        const handles = [...this.#activeHandles]
        const outcomes = await Promise.allSettled(handles.map(async (handle) => {
            const trial = this.#trials.get(handle)
            if (trial === undefined) return
            if (trial.state === 'terminal') {
                await this.delete(handle)
                return
            }
            await this.cancel(handle)
        }))
        for (const handle of handles) this.#invalidate(handle)
        const rejected = outcomes.find((outcome) => outcome.status === 'rejected')
        if (rejected?.status === 'rejected') {
            throw new Tau2SidecarFault('SIDECAR_CLOSE_FAILED', 'One or more adaptive trials could not be closed.', {
                cause: rejected.reason,
            })
        }
    }

    async #cancelInterruptedTurn(handle: Tau2TrialHandle, trial: TrialState): Promise<void> {
        try {
            await this.#cancelAndDelete(handle, trial)
        } catch {
            // The initiating abort remains the primary fault; server TTL is the final cleanup fence.
        } finally {
            this.#invalidate(handle)
        }
    }

    async #cancelAndDelete(handle: Tau2TrialHandle, trial: TrialState): Promise<Tau2TerminalTurnResponse> {
        const response = await this.#requestJson(
            `/v1/trials/${encodeURIComponent(handle.trialId)}/cancel`,
            {
                method: 'POST',
                headers: { 'x-talos-trial-token': trial.token },
            },
            Tau2TerminalTurnResponseSchema,
            [200],
        )
        await this.#requestWithoutBody(
            `/v1/trials/${encodeURIComponent(handle.trialId)}`,
            {
                method: 'DELETE',
                headers: { 'x-talos-trial-token': trial.token },
            },
            [204],
        )
        return response
    }

    #requireTrial(handle: Tau2TrialHandle): TrialState {
        const trial = this.#trials.get(handle)
        if (trial === undefined) {
            throw new Tau2SidecarFault('SIDECAR_TRIAL_CLOSED', 'The adaptive trial handle is closed or does not belong to this client.')
        }
        return trial
    }

    #invalidate(handle: Tau2TrialHandle): void {
        const trial = this.#trials.get(handle)
        if (trial !== undefined) trial.token = ''
        this.#trials.delete(handle)
        this.#activeHandles.delete(handle)
    }

    async #requestJson<T>(
        path: string,
        init: RequestInit,
        parser: WireParser<T>,
        acceptedStatuses: readonly number[],
        callerSignal?: AbortSignal,
    ): Promise<T> {
        const response = await this.#request(path, init, callerSignal)
        const body = await readBoundedJson(response, this.#maxResponseBytes)
        if (!acceptedStatuses.includes(response.status)) {
            throw responseFault(response.status, body)
        }
        const parsed = parser.safeParse(body)
        if (!parsed.success) {
            throw new Tau2SidecarFault('SIDECAR_RESPONSE_MALFORMED', 'The adaptive sidecar returned an invalid response contract.', {
                status: response.status,
            })
        }
        return parsed.data
    }

    async #requestWithoutBody(
        path: string,
        init: RequestInit,
        acceptedStatuses: readonly number[],
    ): Promise<void> {
        const response = await this.#request(path, init)
        if (!acceptedStatuses.includes(response.status)) {
            const body = await readBoundedJson(response, this.#maxResponseBytes)
            throw responseFault(response.status, body)
        }
        if (response.body !== null) {
            const bytes = await readBoundedBytes(response, this.#maxResponseBytes)
            if (bytes.byteLength !== 0) {
                throw new Tau2SidecarFault('SIDECAR_RESPONSE_MALFORMED', 'The adaptive sidecar returned an unexpected response body.')
            }
        }
    }

    async #request(path: string, init: RequestInit, callerSignal?: AbortSignal): Promise<Response> {
        const timeoutSignal = AbortSignal.timeout(this.#requestTimeoutMs)
        const signal = callerSignal === undefined
            ? timeoutSignal
            : AbortSignal.any([callerSignal, timeoutSignal])
        if (callerSignal?.aborted) {
            throw new Tau2SidecarFault('SIDECAR_ABORTED', 'The adaptive sidecar request was cancelled.')
        }

        const headers = new Headers(init.headers)
        headers.set('authorization', `Bearer ${this.#bearerToken}`)
        headers.set('accept', 'application/json')
        try {
            return await this.#fetch(`${this.#baseUrl}${path}`, {
                ...init,
                headers,
                redirect: 'error',
                signal,
            })
        } catch (error) {
            if (callerSignal?.aborted) {
                throw new Tau2SidecarFault('SIDECAR_ABORTED', 'The adaptive sidecar request was cancelled.', { cause: error })
            }
            if (timeoutSignal.aborted) {
                throw new Tau2SidecarFault('SIDECAR_TIMEOUT', 'The adaptive sidecar request exceeded its timeout.', { cause: error })
            }
            throw new Tau2SidecarFault('SIDECAR_NETWORK_FAILED', 'The adaptive sidecar request could not be completed.', { cause: error })
        }
    }
}

function parseLoopbackOrigin(value: string): string {
    if (!value.startsWith('http://127.0.0.1:')) {
        throw new TypeError('Tau2 sidecar base URL must use literal 127.0.0.1 over loopback HTTP.')
    }
    if (!/^http:\/\/127\.0\.0\.1:[1-9][0-9]{0,4}$/.test(value)) {
        throw new TypeError('Tau2 sidecar base URL must be an exact loopback origin without path, credentials, query or fragment.')
    }
    const parsed = new URL(value)
    const port = Number(parsed.port)
    if (!Number.isInteger(port) || port < 1 || port > 65_535 || parsed.origin !== value) {
        throw new TypeError('Tau2 sidecar base URL must be an exact loopback origin with a canonical port.')
    }
    return parsed.origin
}

function parseSecret(value: string, label: string): string {
    const bytes = Buffer.byteLength(value, 'utf8')
    if (
        bytes < 32
        || bytes > 4_096
        || value !== value.trim()
        || [...value].some((character) => (character.codePointAt(0) ?? 0) < 32 || character.codePointAt(0) === 127)
    ) {
        throw new TypeError(`Tau2 sidecar ${label} must contain 32 to 4096 non-control UTF-8 bytes.`)
    }
    return value
}

function boundedInteger(value: number, minimum: number, maximum: number, label: string): number {
    if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
        throw new TypeError(`Tau2 sidecar ${label} must be between ${minimum} and ${maximum}.`)
    }
    return value
}

async function readBoundedJson(response: Response, maximumBytes: number): Promise<unknown> {
    const contentType = response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase()
    if (contentType !== 'application/json' && !contentType?.endsWith('+json')) {
        throw new Tau2SidecarFault('SIDECAR_RESPONSE_MALFORMED', 'The adaptive sidecar returned a non-JSON response.', {
            status: response.status,
        })
    }
    const bytes = await readBoundedBytes(response, maximumBytes)
    try {
        const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
        return JSON.parse(text)
    } catch (error) {
        throw new Tau2SidecarFault('SIDECAR_RESPONSE_MALFORMED', 'The adaptive sidecar returned malformed JSON.', {
            status: response.status,
            cause: error,
        })
    }
}

async function readBoundedBytes(response: Response, maximumBytes: number): Promise<Uint8Array> {
    const declared = response.headers.get('content-length')
    if (declared !== null) {
        if (!/^(?:0|[1-9][0-9]*)$/.test(declared) || Number(declared) > maximumBytes) {
            await response.body?.cancel()
            throw new Tau2SidecarFault('SIDECAR_RESPONSE_TOO_LARGE', 'The adaptive sidecar response exceeded its byte limit.', {
                status: response.status,
            })
        }
    }
    if (response.body === null) return new Uint8Array()

    const reader = response.body.getReader()
    const chunks: Uint8Array[] = []
    let received = 0
    try {
        while (true) {
            const { done, value } = await reader.read()
            if (done) break
            received += value.byteLength
            if (received > maximumBytes) {
                await reader.cancel()
                throw new Tau2SidecarFault('SIDECAR_RESPONSE_TOO_LARGE', 'The adaptive sidecar response exceeded its byte limit.', {
                    status: response.status,
                })
            }
            chunks.push(value)
        }
    } finally {
        reader.releaseLock()
    }

    const combined = new Uint8Array(received)
    let offset = 0
    for (const chunk of chunks) {
        combined.set(chunk, offset)
        offset += chunk.byteLength
    }
    return combined
}

function responseFault(status: number, body: unknown): Tau2SidecarFault {
    const parsed = Tau2ErrorResponseSchema.safeParse(body)
    if (parsed.success) {
        return new Tau2SidecarFault(parsed.data.error.code, parsed.data.error.message, { status })
    }
    return new Tau2SidecarFault(`SIDECAR_HTTP_${status}`, 'The adaptive sidecar rejected the request.', { status })
}
