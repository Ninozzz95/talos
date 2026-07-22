import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import * as playwrightServer from '../tests/e2e/helpers/talosPlaywrightServer.ts'

const { createTalosPlaywrightWebServer } = playwrightServer

test('Playwright serializes stateful E2E projects that share one Laravel database', () => {
    const config = readFileSync(new URL('../playwright.config.ts', import.meta.url), 'utf8')

    assert.match(config, /^\s{4}workers:\s*1,\s*$/mu)
})

test('Playwright web server uses the selected PHP runtime and disables OPcache for the built-in test server', () => {
    const previous = {
        appKey: process.env.APP_KEY,
        php: process.env.TALOS_E2E_PHP_BIN,
        privateKey: process.env.TALOS_BROWSER_ACTION_PRIVATE_KEY_B64,
        publicKey: process.env.TALOS_BROWSER_ACTION_PUBLIC_KEY_B64,
        keyId: process.env.TALOS_BROWSER_ACTION_KEY_ID,
    }
    process.env.APP_KEY = 'base64:QkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkI='
    process.env.TALOS_E2E_PHP_BIN = 'C:\\Program Files\\TALOS PHP\\php.exe'
    process.env.TALOS_BROWSER_ACTION_PRIVATE_KEY_B64 = 'private-key-material'
    process.env.TALOS_BROWSER_ACTION_PUBLIC_KEY_B64 = 'public-key-material'
    process.env.TALOS_BROWSER_ACTION_KEY_ID = 'browser-action-key'

    try {
        const config = createTalosPlaywrightWebServer('http://127.0.0.1:8014', false)

        assert.match(config.command, /^"C:\\Program Files\\TALOS PHP\\php\.exe" artisan migrate:fresh/u)
        assert.match(config.command, /"C:\\Program Files\\TALOS PHP\\php\.exe" -d opcache\.enable=0 -S 127\.0\.0\.1:8014/u)
        assert.equal(config.env.APP_KEY, process.env.APP_KEY)
        assert.equal(config.env.TALOS_BROWSER_ACTION_PRIVATE_KEY_B64, 'private-key-material')
        assert.equal(config.env.TALOS_BROWSER_ACTION_KEY_ID, 'browser-action-key')
        assert.equal(config.env.TALOS_BROWSER_ACTION_PUBLIC_KEY_B64, '')
    } finally {
        for (const [name, value] of Object.entries({
            APP_KEY: previous.appKey,
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

test('Playwright PHP resolver falls back from a missing worktree toolchain to the primary git-common-dir toolchain', () => {
    assert.equal(typeof playwrightServer.resolveTalosPlaywrightPhpBin, 'function')

    const primaryPhp = 'C:\\primary\\.tools\\bin\\php.cmd'
    const resolved = playwrightServer.resolveTalosPlaywrightPhpBin({
        configuredPhp: '',
        platform: 'win32',
        controlPlaneDirectory: 'C:\\worktrees\\fable\\control-plane',
        pathExists: (candidate) => candidate === primaryPhp,
        readGitCommonDirectory: () => 'C:\\primary\\.git',
    })

    assert.equal(resolved, primaryPhp)
})

test('Playwright PHP resolver rejects shell metacharacters in explicit and derived runtime paths', () => {
    assert.equal(typeof playwrightServer.resolveTalosPlaywrightPhpBin, 'function')

    for (const configuredPhp of ['C:\\php\\php.exe & calc.exe', '$(malicious-command)']) {
        assert.throws(
            () => playwrightServer.resolveTalosPlaywrightPhpBin({ configuredPhp }),
            /unsupported shell characters/u,
        )
    }

    assert.throws(
        () => playwrightServer.resolveTalosPlaywrightPhpBin({
            configuredPhp: '',
            platform: 'win32',
            controlPlaneDirectory: 'C:\\unsafe&worktree\\control-plane',
            pathExists: () => true,
            readGitCommonDirectory: () => null,
        }),
        /unsupported shell characters/u,
    )
})

test('Playwright web server provides a deterministic testing APP_KEY when the caller has none', () => {
    const previousAppKey = process.env.APP_KEY
    const previousPhp = process.env.TALOS_E2E_PHP_BIN
    delete process.env.APP_KEY
    process.env.TALOS_E2E_PHP_BIN = 'C:\\TALOS\\php.exe'

    try {
        const first = createTalosPlaywrightWebServer('http://127.0.0.1:8014', false)
        const second = createTalosPlaywrightWebServer('http://127.0.0.1:8014', false)

        assert.match(first.env.APP_KEY, /^base64:[A-Za-z0-9+/]+={0,2}$/u)
        assert.equal(Buffer.from(first.env.APP_KEY.slice('base64:'.length), 'base64').byteLength, 32)
        assert.equal(second.env.APP_KEY, first.env.APP_KEY)
        assert.equal(first.env.APP_ENV, 'testing')
    } finally {
        if (previousAppKey === undefined) delete process.env.APP_KEY
        else process.env.APP_KEY = previousAppKey
        if (previousPhp === undefined) delete process.env.TALOS_E2E_PHP_BIN
        else process.env.TALOS_E2E_PHP_BIN = previousPhp
    }
})

test('Playwright web server keeps Laravel redirects on the configured E2E origin and bypasses stale config', () => {
    const previousAppUrl = process.env.APP_URL
    const configCacheUrl = new URL('../storage/framework/testing/talos-playwright-config.php', import.meta.url)
    const configCachePath = fileURLToPath(configCacheUrl)
    mkdirSync(new URL('../storage/framework/testing/', import.meta.url), { recursive: true })
    writeFileSync(configCacheUrl, '<?php return [];\n')
    process.env.APP_URL = 'http://localhost'

    try {
        const baseURL = 'http://127.0.0.1:8014'
        const config = createTalosPlaywrightWebServer(baseURL, false)

        assert.equal(config.env.APP_URL, baseURL)
        assert.equal(config.env.APP_CONFIG_CACHE, configCachePath)
        assert.equal(existsSync(configCacheUrl), false)
    } finally {
        rmSync(configCacheUrl, { force: true })
        if (previousAppUrl === undefined) delete process.env.APP_URL
        else process.env.APP_URL = previousAppUrl
    }
})
