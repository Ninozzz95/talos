import assert from 'node:assert/strict'
import { createPrivateKey, createPublicKey, sign, verify } from 'node:crypto'
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import {
    ensureBrowserActionKeypairEnvFile,
    generateBrowserActionKeypair,
} from './browser-action-keypair.mjs'

function envValues(contents) {
    return Object.fromEntries(contents
        .split(/\r?\n/u)
        .filter((line) => /^[A-Z0-9_]+=/u.test(line))
        .map((line) => {
            const separator = line.indexOf('=')
            return [line.slice(0, separator), line.slice(separator + 1)]
        }))
}

test('browser action keypair generator returns a matching P-256 PKCS8/SPKI pair', () => {
    const pair = generateBrowserActionKeypair()
    const privatePem = Buffer.from(pair.privateKeyBase64, 'base64').toString('utf8')
    const publicPem = Buffer.from(pair.publicKeyBase64, 'base64').toString('utf8')
    const privateKey = createPrivateKey(privatePem)
    const publicKey = createPublicKey(publicPem)
    const message = Buffer.from('talos-browser-action-capability', 'utf8')
    const signature = sign('sha256', message, privateKey)

    assert.match(pair.keyId, /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u)
    assert.match(privatePem, /^-----BEGIN PRIVATE KEY-----/u)
    assert.match(publicPem, /^-----BEGIN PUBLIC KEY-----/u)
    assert.equal(privateKey.asymmetricKeyType, 'ec')
    assert.equal(privateKey.asymmetricKeyDetails?.namedCurve, 'prime256v1')
    assert.equal(verify('sha256', message, publicKey, signature), true)
})

test('env provisioning is idempotent, preserves unrelated values, and never changes a complete pair', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'talos-browser-action-'))
    const envFile = path.join(directory, '.env')

    try {
        await writeFile(envFile, 'APP_ENV=production\n# keep this comment\n', { mode: 0o600 })
        const first = await ensureBrowserActionKeypairEnvFile(envFile)
        const firstContents = await readFile(envFile, 'utf8')
        const firstValues = envValues(firstContents)
        const second = await ensureBrowserActionKeypairEnvFile(envFile)
        const secondContents = await readFile(envFile, 'utf8')

        assert.equal(first.created, true)
        assert.equal(second.created, false)
        assert.equal(firstContents, secondContents)
        assert.match(firstContents, /^APP_ENV=production$/mu)
        assert.match(firstContents, /^# keep this comment$/mu)
        assert.equal(firstValues.TALOS_BROWSER_ACTION_KEY_ID, first.keypair.keyId)
        assert.equal(firstValues.TALOS_BROWSER_ACTION_PRIVATE_KEY_B64, first.keypair.privateKeyBase64)
        assert.equal(firstValues.TALOS_BROWSER_ACTION_PUBLIC_KEY_B64, first.keypair.publicKeyBase64)
        if (process.platform !== 'win32') {
            assert.equal((await stat(envFile)).mode & 0o777, 0o600)
        }
    } finally {
        await rm(directory, { recursive: true, force: true })
    }
})

test('env provisioning rejects partial action-key configuration without mutating the file', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'talos-browser-action-'))
    const envFile = path.join(directory, '.env')
    const original = 'APP_ENV=production\nTALOS_BROWSER_ACTION_KEY_ID=partial-key\n'

    try {
        await writeFile(envFile, original, { mode: 0o600 })
        await assert.rejects(
            ensureBrowserActionKeypairEnvFile(envFile),
            /partial.*browser action keypair/i,
        )
        assert.equal(await readFile(envFile, 'utf8'), original)
    } finally {
        await rm(directory, { recursive: true, force: true })
    }
})

test('env-file CLI provisions without rendering either key half', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'talos-browser-action-'))
    const envFile = path.join(directory, '.env')
    const script = path.resolve('scripts/browser-action-keypair.mjs')

    try {
        await writeFile(envFile, 'APP_ENV=production\n', { mode: 0o600 })
        const result = spawnSync(process.execPath, [script, '--env-file', envFile], {
            cwd: path.resolve('.'),
            encoding: 'utf8',
        })
        const values = envValues(await readFile(envFile, 'utf8'))

        assert.equal(result.status, 0, result.stderr)
        assert.match(result.stdout, /browser action keypair is ready/i)
        assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /BEGIN (?:PRIVATE|PUBLIC) KEY/u)
        assert.equal(result.stdout.includes(values.TALOS_BROWSER_ACTION_PRIVATE_KEY_B64), false)
        assert.equal(result.stdout.includes(values.TALOS_BROWSER_ACTION_PUBLIC_KEY_B64), false)
        assert.equal(result.stderr.includes(values.TALOS_BROWSER_ACTION_PRIVATE_KEY_B64), false)
        assert.equal(result.stderr.includes(values.TALOS_BROWSER_ACTION_PUBLIC_KEY_B64), false)
    } finally {
        await rm(directory, { recursive: true, force: true })
    }
})
