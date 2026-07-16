import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { createTalosPlaywrightWebServer } from '../tests/e2e/helpers/talosPlaywrightServer.ts'

test('Playwright serializes stateful E2E projects that share one Laravel database', () => {
    const config = readFileSync(new URL('../playwright.config.ts', import.meta.url), 'utf8')

    assert.match(config, /^\s{4}workers:\s*1,\s*$/mu)
})

test('Playwright web server uses the selected PHP runtime and disables OPcache for the built-in test server', () => {
    const previous = {
        php: process.env.TALOS_E2E_PHP_BIN,
        privateKey: process.env.TALOS_BROWSER_ACTION_PRIVATE_KEY_B64,
        publicKey: process.env.TALOS_BROWSER_ACTION_PUBLIC_KEY_B64,
        keyId: process.env.TALOS_BROWSER_ACTION_KEY_ID,
    }
    process.env.TALOS_E2E_PHP_BIN = 'C:\\Program Files\\TALOS PHP\\php.exe'
    process.env.TALOS_BROWSER_ACTION_PRIVATE_KEY_B64 = 'private-key-material'
    process.env.TALOS_BROWSER_ACTION_PUBLIC_KEY_B64 = 'public-key-material'
    process.env.TALOS_BROWSER_ACTION_KEY_ID = 'browser-action-key'

    try {
        const config = createTalosPlaywrightWebServer('http://127.0.0.1:8014', false)

        assert.match(config.command, /^"C:\\Program Files\\TALOS PHP\\php\.exe" artisan migrate:fresh/u)
        assert.match(config.command, /"C:\\Program Files\\TALOS PHP\\php\.exe" -d opcache\.enable=0 -S 127\.0\.0\.1:8014/u)
        assert.equal(config.env.TALOS_BROWSER_ACTION_PRIVATE_KEY_B64, 'private-key-material')
        assert.equal(config.env.TALOS_BROWSER_ACTION_KEY_ID, 'browser-action-key')
        assert.equal(config.env.TALOS_BROWSER_ACTION_PUBLIC_KEY_B64, '')
    } finally {
        for (const [name, value] of Object.entries({
            TALOS_E2E_PHP_BIN: previous.php,
            TALOS_BROWSER_ACTION_PRIVATE_KEY_B64: previous.privateKey,
            TALOS_BROWSER_ACTION_PUBLIC_KEY_B64: previous.publicKey,
            TALOS_BROWSER_ACTION_KEY_ID: previous.keyId,
        })) {
            if (value === undefined) delete process.env[name]
            else process.env[name] = value
        }
    }
})
