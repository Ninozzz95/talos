import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const LOOPBACK_HOST = '127.0.0.1'
const FIXTURE_ROOT = join(dirname(fileURLToPath(import.meta.url)), 'site')
const DEFAULT_STARTUP_TIMEOUT_MS = 5_000
const DEFAULT_CLOSE_TIMEOUT_MS = 3_000

const routes = new Map([
    ['/', { file: 'index.html', contentType: 'text/html; charset=utf-8' }],
    ['/app.js', { file: 'app.js', contentType: 'text/javascript; charset=utf-8' }],
    ['/styles.css', { file: 'styles.css', contentType: 'text/css; charset=utf-8' }],
])

const destination = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Deterministic destination</title><link rel="stylesheet" href="/styles.css"></head>
<body data-page="destination"><main class="fixture-shell"><h1>Deterministic destination</h1><p>This destination is served by the same controlled TALOS fixture origin.</p><a href="/">Return to catalog</a></main></body>
</html>`

export async function startBrowserSiteServer(options = {}) {
    const startupTimeoutMs = positiveTimeout(options.startupTimeoutMs, DEFAULT_STARTUP_TIMEOUT_MS)
    const closeTimeoutMs = positiveTimeout(options.closeTimeoutMs, DEFAULT_CLOSE_TIMEOUT_MS)
    const sockets = new Set()

    const server = createServer(async (request, response) => {
        setSecurityHeaders(response)
        try {
            if (request.method !== 'GET' && request.method !== 'HEAD') {
                return send(response, 405, 'text/plain; charset=utf-8', 'Method not allowed.', request.method === 'HEAD')
            }
            const url = new URL(request.url ?? '/', `http://${LOOPBACK_HOST}`)
            if (url.pathname === '/favicon.ico') return send(response, 204, 'image/x-icon', Buffer.alloc(0), request.method === 'HEAD')
            if (url.pathname === '/destination') {
                return send(response, 200, 'text/html; charset=utf-8', destination, request.method === 'HEAD')
            }
            const route = routes.get(url.pathname)
            if (route === undefined) return send(response, 404, 'text/plain; charset=utf-8', 'Not found.', request.method === 'HEAD')
            const body = await readFile(join(FIXTURE_ROOT, route.file))
            return send(response, 200, route.contentType, body, request.method === 'HEAD')
        } catch {
            return send(response, 500, 'text/plain; charset=utf-8', 'Fixture server error.', request.method === 'HEAD')
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
        throw new Error('Browser site fixture did not bind a TCP port.')
    }
    const baseUrl = `http://${LOOPBACK_HOST}:${address.port}`

    return Object.freeze({
        baseUrl,
        homeUrl: `${baseUrl}/`,
        destinationUrl: `${baseUrl}/destination`,
        async close() {
            await closeServer(server, sockets, closeTimeoutMs)
        },
    })
}

function setSecurityHeaders(response) {
    response.setHeader('cache-control', 'no-store')
    response.setHeader('content-security-policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'none'; font-src 'none'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'")
    response.setHeader('cross-origin-resource-policy', 'same-origin')
    response.setHeader('referrer-policy', 'no-referrer')
    response.setHeader('x-content-type-options', 'nosniff')
    response.setHeader('x-frame-options', 'DENY')
}

function send(response, status, contentType, value, headOnly = false) {
    const body = Buffer.isBuffer(value) ? value : Buffer.from(value)
    response.writeHead(status, {
        'content-type': contentType,
        'content-length': body.byteLength,
    })
    response.end(headOnly ? undefined : body)
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
    }), timeoutMs, 'Browser site fixture startup timed out.')
}

async function closeServer(server, sockets, timeoutMs) {
    if (!server.listening) return
    const closing = new Promise((resolve) => server.close(resolve))
    const timer = setTimeout(() => {
        for (const socket of sockets) socket.destroy()
        server.closeAllConnections?.()
    }, Math.max(1, Math.floor(timeoutMs / 2)))
    try {
        await withTimeout(closing, timeoutMs, 'Browser site fixture shutdown timed out.')
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
