import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import { createDevStackConfig, runDevStack } from './dev-stack.mjs'
import {
    assertBrowserWorkerCanStart,
    evaluateBrowserWorkerOwnership,
    formatBrowserWorkerDoctor,
    isBrowserWorkerOwnershipHealthy,
    probeBrowserWorkerEndpoint,
} from './browser-worker-ownership.mjs'

test('development stack config starts the browser worker with shared ephemeral credentials', () => {
    const token = 'a'.repeat(64)
    const config = createDevStackConfig({ token, inheritedEnv: { APP_ENV: 'local' } })

    assert.deepEqual(config.commands.map((command) => command.name), [
        'validator',
        'server',
        'queue',
        'vite',
        'browser',
    ])
    assert.equal(config.sharedEnv.AVM_VALIDATOR_URL, 'http://127.0.0.1:3000')
    assert.equal(config.sharedEnv.TALOS_VALIDATOR_HEALTH_URL, 'http://127.0.0.1:3000/health')
    assert.equal(config.sharedEnv.TALOS_BROWSER_WORKER_URL, 'http://127.0.0.1:3100')
    assert.equal(config.sharedEnv.TALOS_BROWSER_WORKER_TOKEN, token)

    const server = config.commands.find((command) => command.name === 'server')
    const queue = config.commands.find((command) => command.name === 'queue')
    const vite = config.commands.find((command) => command.name === 'vite')
    assert.equal(server.env.TALOS_BROWSER_WORKER_TOKEN, token)
    assert.equal(queue.env.TALOS_BROWSER_WORKER_TOKEN, token)
    assert.equal(vite.env.TALOS_BROWSER_WORKER_TOKEN, undefined)

    const browser = config.commands.find((command) => command.name === 'browser')
    assert.equal(browser.env.TALOS_BROWSER_WORKER_TOKEN, token)
    assert.equal(browser.env.HOST, '127.0.0.1')
    assert.equal(browser.env.PORT, '3100')
    assert.match(browser.command, /browser-worker/)

    const validator = config.commands.find((command) => command.name === 'validator')
    assert.match(validator.command, /validator/)
    assert.match(validator.command, /run build/)
    assert.match(validator.command, /run start/)
    assert.equal(validator.env.PHP_BIN, path.resolve('..', '.tools', 'php', 'php.exe'))
    assert.equal(validator.env.TALOS_PHP_ROOT, path.resolve('..', '.tools', 'php'))
    assert.equal(validator.env.CURL_CA_BUNDLE, path.resolve('..', '.tools', 'php', 'extras', 'ssl', 'cacert.pem'))
    assert.equal(validator.env.SSL_CERT_FILE, path.resolve('..', '.tools', 'php', 'extras', 'ssl', 'cacert.pem'))
})

test('development stack falls back to PATH runtimes when repo-local tools are absent', () => {
    const config = createDevStackConfig({
        token: 'b'.repeat(64),
        inheritedEnv: {},
        platform: 'win32',
        workspaceRoot: 'C:\\fresh clone\\agent-virtual-machine',
        fileExists: () => false,
    })

    const server = config.commands.find((command) => command.name === 'server')
    const vite = config.commands.find((command) => command.name === 'vite')
    const validator = config.commands.find((command) => command.name === 'validator')

    assert.match(server.command, /^"php" artisan serve/)
    assert.match(vite.command, /^"npm\.cmd" run dev/)
    assert.doesNotMatch(server.command, /\.tools/)
    assert.doesNotMatch(vite.command, /\.tools/)
    assert.equal(validator.env.PHP_BIN, 'php')
    assert.equal(validator.env.TALOS_PHP_ROOT, undefined)
    assert.equal(validator.env.CURL_CA_BUNDLE, undefined)
})

test('browser worker ownership distinguishes managed, stale, orphaned, and conflicting endpoints', () => {
    const expectedUrl = 'http://127.0.0.1:3100'
    const managed = evaluateBrowserWorkerOwnership({
        expectedUrl,
        lease: { pid: 42, alive: true, browserWorkerUrl: expectedUrl },
        probes: [{ url: expectedUrl, state: 'talos' }],
    })
    const stale = evaluateBrowserWorkerOwnership({
        expectedUrl,
        lease: { pid: 43, alive: false, browserWorkerUrl: expectedUrl },
        probes: [{ url: expectedUrl, state: 'closed' }],
    })
    const orphaned = evaluateBrowserWorkerOwnership({
        expectedUrl,
        lease: null,
        probes: [
            { url: expectedUrl, state: 'closed' },
            { url: 'http://127.0.0.1:3101', state: 'talos' },
        ],
    })
    const conflicting = evaluateBrowserWorkerOwnership({
        expectedUrl,
        lease: null,
        probes: [{ url: expectedUrl, state: 'conflict' }],
    })

    assert.equal(managed.expectedState, 'managed')
    assert.equal(managed.canStart, false)
    assert.equal(stale.expectedState, 'available')
    assert.equal(stale.canStart, true)
    assert.deepEqual(stale.issues.map((issue) => issue.code), ['TALOS_BROWSER_WORKER_STALE_LEASE'])
    assert.deepEqual(orphaned.issues.map((issue) => issue.code), ['TALOS_BROWSER_WORKER_ORPHANED'])
    assert.deepEqual(conflicting.issues.map((issue) => issue.code), ['TALOS_BROWSER_WORKER_PORT_CONFLICT'])
})

test('doctor treats a compatible managed worker as healthy without allowing a duplicate start', () => {
    const expectedUrl = 'http://127.0.0.1:3100'
    const managed = evaluateBrowserWorkerOwnership({
        expectedUrl,
        lease: { pid: 42, alive: true, browserWorkerUrl: expectedUrl },
        probes: [{ url: expectedUrl, state: 'talos' }],
    })
    const orphaned = evaluateBrowserWorkerOwnership({
        expectedUrl,
        lease: null,
        probes: [{ url: expectedUrl, state: 'talos' }],
    })
    const incompatible = evaluateBrowserWorkerOwnership({
        expectedUrl,
        lease: { pid: 42, alive: true, browserWorkerUrl: expectedUrl },
        probes: [{ url: expectedUrl, state: 'incompatible' }],
    })

    assert.equal(managed.canStart, false)
    assert.equal(isBrowserWorkerOwnershipHealthy(managed), true)
    assert.equal(isBrowserWorkerOwnershipHealthy(orphaned), false)
    assert.equal(isBrowserWorkerOwnershipHealthy(incompatible), false)
})

test('browser worker ownership blocks ambiguous startup and never renders credentials', () => {
    const report = evaluateBrowserWorkerOwnership({
        expectedUrl: 'http://127.0.0.1:3100',
        lease: null,
        probes: [
            { url: 'http://127.0.0.1:3100', state: 'talos' },
            { url: 'http://127.0.0.1:3101', state: 'talos' },
        ],
    })

    assert.throws(
        () => assertBrowserWorkerCanStart(report),
        /TALOS_BROWSER_WORKER_ORPHANED/,
    )
    const output = formatBrowserWorkerDoctor(report)
    assert.match(output, /orphaned/i)
    assert.doesNotMatch(output, /token|secret|credential/i)
})

test('browser worker probe distinguishes the required HMI runtime from a stale TALOS worker', async () => {
    const compatible = await probeBrowserWorkerEndpoint('http://127.0.0.1:3100', {
        portOpen: async () => true,
        fetchImpl: async () => new Response(JSON.stringify({
            data: {
                service: 'talos-browser-worker',
                protocols: { hmi: 'talos_browser_hmi_runtime_v2.1.0' },
            },
        }), { status: 200, headers: { 'content-type': 'application/json' } }),
    })
    const stale = await probeBrowserWorkerEndpoint('http://127.0.0.1:3100', {
        portOpen: async () => true,
        fetchImpl: async () => new Response(JSON.stringify({
            data: { service: 'talos-browser-worker' },
        }), { status: 200, headers: { 'content-type': 'application/json' } }),
    })

    assert.equal(compatible, 'talos')
    assert.equal(stale, 'incompatible')
})

test('browser worker ownership reports a managed endpoint with a stale protocol explicitly', () => {
    const expectedUrl = 'http://127.0.0.1:3100'
    const report = evaluateBrowserWorkerOwnership({
        expectedUrl,
        lease: { pid: 42, alive: true, browserWorkerUrl: expectedUrl },
        probes: [{ url: expectedUrl, state: 'incompatible' }],
    })

    assert.equal(report.expectedState, 'incompatible')
    assert.deepEqual(report.issues.map((issue) => issue.code), [
        'TALOS_BROWSER_WORKER_PROTOCOL_MISMATCH',
    ])
    assert.match(formatBrowserWorkerDoctor(report), /protocol mismatch/i)
})

test('browser worker ownership blocks an incompatible TALOS worker on a secondary candidate port', () => {
    const expectedUrl = 'http://127.0.0.1:3100'
    const secondaryUrl = 'http://127.0.0.1:3101'
    const report = evaluateBrowserWorkerOwnership({
        expectedUrl,
        lease: null,
        probes: [
            { url: expectedUrl, state: 'closed' },
            { url: secondaryUrl, state: 'incompatible' },
        ],
    })

    assert.equal(report.canStart, false)
    assert.deepEqual(report.issues, [{
        code: 'TALOS_BROWSER_WORKER_PROTOCOL_MISMATCH',
        url: secondaryUrl,
        blocking: true,
    }])
    assert.match(formatBrowserWorkerDoctor(report), /protocol mismatch.*3101/i)
})

test('development stack acquires and always releases browser worker ownership', async () => {
    const calls = []
    const result = Promise.resolve()

    await runDevStack({
        config: createDevStackConfig({ token: 'c'.repeat(64), inheritedEnv: {} }),
        inspectOwnership: async () => {
            calls.push('inspect')
            return { canStart: true, issues: [] }
        },
        assertCanStart: () => calls.push('assert'),
        acquireLease: () => {
            calls.push('acquire')
            return { pid: 99, path: 'lease' }
        },
        releaseLease: () => calls.push('release'),
        runCommands: () => {
            calls.push('run')
            return { result }
        },
    })

    assert.deepEqual(calls, ['inspect', 'assert', 'acquire', 'run', 'release'])
})
