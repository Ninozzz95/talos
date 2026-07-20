import { randomBytes, timingSafeEqual } from 'node:crypto'
import { createServer, request as nodeRequest } from 'node:http'
import {
    DeterministicProviderProtocol,
    MAX_PROVIDER_REQUEST_BYTES,
} from './deterministicProviderProtocol.mjs'

const LOOPBACK_HOST = '127.0.0.1'
const DEFAULT_STARTUP_TIMEOUT_MS = 5_000
const DEFAULT_CLOSE_TIMEOUT_MS = 3_000

export async function startDeterministicProviderServer(options = {}) {
    const startupTimeoutMs = positiveTimeout(options.startupTimeoutMs, DEFAULT_STARTUP_TIMEOUT_MS)
    const closeTimeoutMs = positiveTimeout(options.closeTimeoutMs, DEFAULT_CLOSE_TIMEOUT_MS)
    const protocol = new DeterministicProviderProtocol()
    const controlToken = randomBytes(32).toString('hex')
    const capturedRequests = []
    const sockets = new Set()

    const server = createServer(async (request, response) => {
        response.setHeader('cache-control', 'no-store')
        response.setHeader('x-content-type-options', 'nosniff')

        try {
            const url = new URL(request.url ?? '/', `http://${LOOPBACK_HOST}`)
            if (url.pathname === '/health' && request.method === 'GET') {
                if (request.headers.authorization !== undefined) return sendError(response, 401, 'TALOS_HJ_PROVIDER_AUTH_FORBIDDEN')
                return sendJson(response, 200, {
                    contract: 'talos.human_journey.provider_fixture',
                    status: 'ok',
                    version: 1,
                })
            }

            if (url.pathname.startsWith('/__control/')) {
                if (request.method !== 'POST') return sendError(response, 405, 'TALOS_HJ_PROVIDER_METHOD_NOT_ALLOWED')
                if (!tokenMatches(request.headers['x-talos-hj-fixture-token'], controlToken)) {
                    return sendError(response, 401, 'TALOS_HJ_PROVIDER_CONTROL_UNAUTHORIZED')
                }
                const body = await readJsonObject(request, MAX_PROVIDER_REQUEST_BYTES)
                if (url.pathname === '/__control/fault') {
                    protocol.armFault(body.name)
                    return sendJson(response, 200, { armed: body.name })
                }
                if (url.pathname === '/__control/reset') {
                    protocol.reset()
                    capturedRequests.length = 0
                    return sendJson(response, 200, { reset: true })
                }
                return sendError(response, 404, 'TALOS_HJ_PROVIDER_ROUTE_NOT_FOUND')
            }

            if (url.pathname !== '/v1/chat/completions') {
                return sendError(response, 404, 'TALOS_HJ_PROVIDER_ROUTE_NOT_FOUND')
            }
            if (request.method !== 'POST') return sendError(response, 405, 'TALOS_HJ_PROVIDER_METHOD_NOT_ALLOWED')
            if (request.headers.authorization !== undefined) return sendError(response, 401, 'TALOS_HJ_PROVIDER_AUTH_FORBIDDEN')

            const body = await readJsonObject(request, MAX_PROVIDER_REQUEST_BYTES)
            const outcome = protocol.respond(body)
            if (outcome.kind === 'fixture_fault') {
                if (outcome.name === 'http_503_once') {
                    return sendError(response, 503, 'TALOS_HJ_PROVIDER_FAULT_503')
                }
                response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
                response.end('{"fixture_fault":')
                return
            }

            capturedRequests.push(structuredClone(outcome.request))
            return sendJson(response, 200, outcome.response)
        } catch (error) {
            const status = Number.isInteger(error?.status) ? error.status : 500
            const code = typeof error?.code === 'string' ? error.code : 'TALOS_HJ_PROVIDER_INTERNAL_ERROR'
            return sendError(response, status, code)
        }
    })

    server.on('connection', (socket) => {
        sockets.add(socket)
        socket.once('close', () => sockets.delete(socket))
    })

    await listenWithTimeout(server, startupTimeoutMs)
    const address = server.address()
    if (address === null || typeof address === 'string') {
        await closeServer(server, sockets, closeTimeoutMs)
        throw new Error('Provider fixture did not bind a TCP port.')
    }
    const baseUrl = `http://${LOOPBACK_HOST}:${address.port}`

    const control = async (path, body) => {
        const status = await postControlRequest(`${baseUrl}${path}`, controlToken, body, closeTimeoutMs)
        if (status < 200 || status >= 300) throw new Error(`Provider fixture control request failed with HTTP ${status}.`)
    }

    return Object.freeze({
        baseUrl,
        chatCompletionsUrl: `${baseUrl}/v1/chat/completions`,
        healthUrl: `${baseUrl}/health`,
        controlToken,
        get requests() {
            return Object.freeze(capturedRequests.map((request) => structuredClone(request)))
        },
        async armFault(name) {
            await control('/__control/fault', { name })
        },
        async reset() {
            await control('/__control/reset', {})
        },
        async close() {
            await closeServer(server, sockets, closeTimeoutMs)
        },
    })
}

async function postControlRequest(url, controlToken, value, timeoutMs) {
    const body = JSON.stringify(value)
    return await new Promise((resolve, reject) => {
        const request = nodeRequest(url, {
            method: 'POST',
            agent: false,
            headers: {
                connection: 'close',
                'content-length': Buffer.byteLength(body),
                'content-type': 'application/json',
                'x-talos-hj-fixture-token': controlToken,
            },
        }, (response) => {
            response.resume()
            response.once('end', () => resolve(response.statusCode ?? 500))
        })
        request.once('error', reject)
        request.setTimeout(timeoutMs, () => request.destroy(new Error('Provider fixture control request timed out.')))
        request.end(body)
    })
}

async function readJsonObject(request, maxBytes) {
    const contentType = String(request.headers['content-type'] ?? '').toLowerCase()
    if (!contentType.startsWith('application/json')) {
        throw requestError('JSON content type is required.', 415, 'TALOS_HJ_PROVIDER_CONTENT_TYPE_INVALID')
    }

    const chunks = []
    let bytes = 0
    for await (const chunk of request) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
        bytes += buffer.byteLength
        if (bytes > maxBytes) {
            throw requestError('Provider fixture request body is too large.', 413, 'TALOS_HJ_PROVIDER_BODY_TOO_LARGE')
        }
        chunks.push(buffer)
    }

    let value
    try {
        value = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    } catch {
        throw requestError('Provider fixture request body is malformed JSON.', 400, 'TALOS_HJ_PROVIDER_JSON_INVALID')
    }
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw requestError('Provider fixture request body must be an object.', 422, 'TALOS_HJ_PROVIDER_OBJECT_REQUIRED')
    }
    return value
}

function sendJson(response, status, value) {
    const body = JSON.stringify(value)
    response.writeHead(status, {
        'content-type': 'application/json; charset=utf-8',
        'content-length': Buffer.byteLength(body),
    })
    response.end(body)
}

function sendError(response, status, code) {
    sendJson(response, status, { error: { code, message: 'Deterministic provider fixture rejected the request.' } })
}

function requestError(message, status, code) {
    const error = new Error(message)
    error.status = status
    error.code = code
    return error
}

function tokenMatches(header, expected) {
    if (typeof header !== 'string') return false
    const actualBytes = Buffer.from(header)
    const expectedBytes = Buffer.from(expected)
    return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes)
}

function positiveTimeout(value, fallback) {
    return Number.isInteger(value) && value > 0 ? value : fallback
}

async function listenWithTimeout(server, timeoutMs) {
    await withTimeout(new Promise((resolve, reject) => {
        server.once('error', reject)
        server.listen(0, LOOPBACK_HOST, () => {
            server.off('error', reject)
            resolve()
        })
    }), timeoutMs, 'Provider fixture startup timed out.')
}

async function closeServer(server, sockets, timeoutMs) {
    if (!server.listening) return
    const closing = new Promise((resolve) => server.close(resolve))
    const timer = setTimeout(() => {
        for (const socket of sockets) socket.destroy()
        server.closeAllConnections?.()
    }, Math.max(1, Math.floor(timeoutMs / 2)))
    try {
        await withTimeout(closing, timeoutMs, 'Provider fixture shutdown timed out.')
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
