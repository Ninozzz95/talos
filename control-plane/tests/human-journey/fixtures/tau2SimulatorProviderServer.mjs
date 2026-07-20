import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { createServer } from 'node:http'

const LOOPBACK_HOST = '127.0.0.1'
const MAX_REQUEST_BYTES = 256 * 1_024
const MAX_MESSAGES = 128
const STARTUP_TIMEOUT_MS = 5_000
const CLOSE_TIMEOUT_MS = 3_000

export async function startTau2SimulatorProviderServer(options = {}) {
    const apiKey = boundedSecret(options.apiKey) ?? randomBytes(32).toString('hex')
    const sockets = new Set()
    const server = createServer({ maxHeaderSize: 16 * 1_024, requireHostHeader: true }, async (request, response) => {
        response.setHeader('cache-control', 'no-store')
        response.setHeader('x-content-type-options', 'nosniff')

        try {
            const url = new URL(request.url ?? '/', `http://${LOOPBACK_HOST}`)
            if (url.pathname === '/health' && request.method === 'GET') {
                return sendJson(response, 200, {
                    contract: 'talos.human_journey.tau2_simulator_fixture',
                    status: 'ok',
                    version: 1,
                })
            }
            if (url.pathname !== '/v1/chat/completions') {
                return sendError(response, 404, 'TALOS_HJ_SIMULATOR_ROUTE_NOT_FOUND')
            }
            if (request.method !== 'POST') {
                return sendError(response, 405, 'TALOS_HJ_SIMULATOR_METHOD_NOT_ALLOWED')
            }
            if (!bearerMatches(request.headers.authorization, apiKey)) {
                return sendError(response, 401, 'TALOS_HJ_SIMULATOR_UNAUTHORIZED')
            }

            const body = await readCompletionRequest(request)
            const seedKey = String(body.seed ?? 'none')
            const turnIndex = simulatorTurnIndex(body.messages)
            const content = simulatorReply(body.messages, turnIndex)
            const responseId = createHash('sha256')
                .update(JSON.stringify({ seed: seedKey, turnIndex, content }))
                .digest('hex')
                .slice(0, 24)

            return sendJson(response, 200, {
                id: `chatcmpl-talos-${responseId}`,
                object: 'chat.completion',
                created: 1_784_515_200 + turnIndex,
                model: body.model,
                choices: [{
                    index: 0,
                    message: { role: 'assistant', content },
                    finish_reason: 'stop',
                }],
                usage: {
                    prompt_tokens: 64 + (turnIndex * 8),
                    completion_tokens: Math.max(1, Math.ceil(content.length / 4)),
                    total_tokens: 64 + (turnIndex * 8) + Math.max(1, Math.ceil(content.length / 4)),
                },
            })
        } catch (error) {
            return sendError(
                response,
                Number.isInteger(error?.status) ? error.status : 500,
                typeof error?.code === 'string' ? error.code : 'TALOS_HJ_SIMULATOR_INTERNAL_ERROR',
            )
        }
    })

    server.headersTimeout = 5_000
    server.requestTimeout = 10_000
    server.keepAliveTimeout = 1_000
    server.maxHeadersCount = 32
    server.setTimeout(10_000, (socket) => socket.destroy())
    server.on('connection', (socket) => {
        sockets.add(socket)
        socket.once('close', () => sockets.delete(socket))
    })

    await listenWithTimeout(server, STARTUP_TIMEOUT_MS)
    const address = server.address()
    if (address === null || typeof address === 'string') {
        await closeServer(server, sockets, CLOSE_TIMEOUT_MS)
        throw new Error('Tau2 simulator fixture did not bind a TCP port.')
    }
    const origin = `http://${LOOPBACK_HOST}:${address.port}`

    return Object.freeze({
        origin,
        baseUrl: `${origin}/v1`,
        healthUrl: `${origin}/health`,
        apiKey,
        async close() {
            await closeServer(server, sockets, CLOSE_TIMEOUT_MS)
        },
    })
}

async function readCompletionRequest(request) {
    const contentType = String(request.headers['content-type'] ?? '').split(';', 1)[0].trim().toLowerCase()
    if (contentType !== 'application/json') {
        throw requestError(415, 'TALOS_HJ_SIMULATOR_CONTENT_TYPE_INVALID')
    }
    const declaredLength = String(request.headers['content-length'] ?? '')
    if (declaredLength !== '' && (!/^(?:0|[1-9][0-9]*)$/u.test(declaredLength) || Number(declaredLength) > MAX_REQUEST_BYTES)) {
        throw requestError(413, 'TALOS_HJ_SIMULATOR_BODY_TOO_LARGE')
    }

    const chunks = []
    let received = 0
    for await (const chunk of request) {
        const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
        received += bytes.byteLength
        if (received > MAX_REQUEST_BYTES) throw requestError(413, 'TALOS_HJ_SIMULATOR_BODY_TOO_LARGE')
        chunks.push(bytes)
    }

    let body
    try {
        body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    } catch {
        throw requestError(400, 'TALOS_HJ_SIMULATOR_JSON_INVALID')
    }
    if (body === null || typeof body !== 'object' || Array.isArray(body)) {
        throw requestError(422, 'TALOS_HJ_SIMULATOR_OBJECT_REQUIRED')
    }
    if (typeof body.model !== 'string' || body.model.length < 1 || body.model.length > 256) {
        throw requestError(422, 'TALOS_HJ_SIMULATOR_MODEL_INVALID')
    }
    if (!Array.isArray(body.messages) || body.messages.length < 1 || body.messages.length > MAX_MESSAGES) {
        throw requestError(422, 'TALOS_HJ_SIMULATOR_MESSAGES_INVALID')
    }
    for (const message of body.messages) {
        if (
            message === null
            || typeof message !== 'object'
            || Array.isArray(message)
            || !['system', 'user', 'assistant'].includes(message.role)
            || typeof message.content !== 'string'
            || message.content.length < 1
            || Buffer.byteLength(message.content, 'utf8') > 20_000
        ) {
            throw requestError(422, 'TALOS_HJ_SIMULATOR_MESSAGES_INVALID')
        }
    }
    if (body.seed !== undefined && (!Number.isSafeInteger(body.seed) || body.seed < 0 || body.seed > 0x7fff_ffff)) {
        throw requestError(422, 'TALOS_HJ_SIMULATOR_SEED_INVALID')
    }
    return body
}

function simulatorTurnIndex(messages) {
    return messages.reduce(
        (turnIndex, message) => turnIndex + (message.role === 'assistant' ? 1 : 0),
        0,
    )
}

function simulatorReply(messages, turnIndex) {
    const visibleText = messages.map((message) => message.content).join('\n')
    const target = [...visibleText.matchAll(/https?:\/\/[^\s<>"']+/gu)]
        .map((match) => match[0].replace(/[.,;!?]+$/u, ''))
        .find((candidate) => {
            try {
                const parsed = new URL(candidate)
                return parsed.username === '' && parsed.password === ''
            } catch {
                return false
            }
        })
    const sequence = [
        target ? `${target} aprilo e dimmi cosa vedi` : 'Apri il link visibile e dimmi cosa vedi',
        'Riprova usando il link di prima e dimmi cosa vedi.',
        'Riesci a catturare uno screenshot visibile nella chat?',
        'Adesso descrivi cosa e cambiato nella pagina.',
        'Continua da dove eri rimasto senza perdere il contesto.',
        'Perfetto, la prova richiesta e completa. ###STOP###',
    ]
    return sequence[Math.min(turnIndex, sequence.length - 1)]
}

function bearerMatches(header, expected) {
    if (typeof header !== 'string' || !header.startsWith('Bearer ')) return false
    const actual = Buffer.from(header.slice(7))
    const wanted = Buffer.from(expected)
    return actual.length === wanted.length && timingSafeEqual(actual, wanted)
}

function boundedSecret(value) {
    if (value === undefined) return undefined
    if (typeof value !== 'string' || value.length < 32 || value.length > 128 || value !== value.trim()) {
        throw new TypeError('Tau2 simulator API key must contain 32 to 128 non-space characters.')
    }
    return value
}

function requestError(status, code) {
    const error = new Error(code)
    error.status = status
    error.code = code
    return error
}

function sendJson(response, status, value) {
    if (response.headersSent) return
    const body = JSON.stringify(value)
    response.writeHead(status, {
        'content-type': 'application/json; charset=utf-8',
        'content-length': Buffer.byteLength(body),
    })
    response.end(body)
}

function sendError(response, status, code) {
    sendJson(response, status, { error: { code, message: 'The tau2 simulator fixture rejected the request.' } })
}

async function listenWithTimeout(server, timeoutMs) {
    await withTimeout(new Promise((resolve, reject) => {
        server.once('error', reject)
        server.listen(0, LOOPBACK_HOST, () => {
            server.off('error', reject)
            resolve()
        })
    }), timeoutMs, 'Tau2 simulator fixture startup timed out.')
}

async function closeServer(server, sockets, timeoutMs) {
    if (!server.listening) return
    const closing = new Promise((resolve) => server.close(resolve))
    const timer = setTimeout(() => {
        server.closeAllConnections()
        for (const socket of sockets) socket.destroy()
    }, Math.max(1, Math.floor(timeoutMs / 2)))
    try {
        await withTimeout(closing, timeoutMs, 'Tau2 simulator fixture shutdown timed out.')
    } finally {
        clearTimeout(timer)
    }
}

async function withTimeout(promise, timeoutMs, message) {
    let timer
    try {
        return await Promise.race([
            promise,
            new Promise((_, reject) => {
                timer = setTimeout(() => reject(new Error(message)), timeoutMs)
            }),
        ])
    } finally {
        clearTimeout(timer)
    }
}
