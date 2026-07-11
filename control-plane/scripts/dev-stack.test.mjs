import assert from 'node:assert/strict'
import test from 'node:test'
import { createDevStackConfig } from './dev-stack.mjs'

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
})
