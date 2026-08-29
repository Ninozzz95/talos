import assert from 'node:assert/strict'
import { createPrivateKey, createPublicKey, sign, verify } from 'node:crypto'
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import {
    ensureHarnessReceiptKeypairEnvFile,
    generateHarnessReceiptKeypair,
} from '../src/harness-receipt-keypair.mjs'

/*
 * ⭐⭐⭐ 29/8 — stessa struttura di control-plane/scripts/browser-action-keypair.test.mjs
 * (AVM, letto prima di scrivere questo file), adattata a Ed25519: niente
 * digest esplicito per firmare/verificare (algorithm:null, obbligatorio
 * per Ed25519 — non un dimenticanza, è l'API di node:crypto).
 */

function envValues(contents) {
    return Object.fromEntries(contents
        .split(/\r?\n/u)
        .filter((line) => /^[A-Z0-9_]+=/u.test(line))
        .map((line) => {
            const separator = line.indexOf('=')
            return [line.slice(0, separator), line.slice(separator + 1)]
        }))
}

test('harness receipt keypair generator returns a matching Ed25519 PKCS8/SPKI pair', () => {
    const pair = generateHarnessReceiptKeypair()
    const privatePem = Buffer.from(pair.privateKeyBase64, 'base64').toString('utf8')
    const publicPem = Buffer.from(pair.publicKeyBase64, 'base64').toString('utf8')
    const privateKey = createPrivateKey(privatePem)
    const publicKey = createPublicKey(publicPem)
    const message = Buffer.from('talos-harness-receipt', 'utf8')
    const signature = sign(null, message, privateKey)

    assert.match(pair.keyId, /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u)
    assert.match(privatePem, /^-----BEGIN PRIVATE KEY-----/u)
    assert.match(publicPem, /^-----BEGIN PUBLIC KEY-----/u)
    assert.equal(privateKey.asymmetricKeyType, 'ed25519')
    assert.equal(verify(null, message, publicKey, signature), true)
})

test('⛔⛔⛔ AL CONTRARIO — due chiamate producono DUE coppie di chiavi diverse, mai la stessa firmata due volte', () => {
    const a = generateHarnessReceiptKeypair()
    const b = generateHarnessReceiptKeypair()
    assert.notEqual(a.keyId, b.keyId)
    assert.notEqual(a.privateKeyBase64, b.privateKeyBase64)
})

test('env provisioning is idempotent, preserves unrelated values, and never changes a complete pair', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'talos-harness-receipt-'))
    const envFile = path.join(directory, '.env')

    try {
        await writeFile(envFile, 'APP_ENV=production\n# keep this comment\n', { mode: 0o600 })
        const first = await ensureHarnessReceiptKeypairEnvFile(envFile)
        const firstContents = await readFile(envFile, 'utf8')
        const firstValues = envValues(firstContents)
        const second = await ensureHarnessReceiptKeypairEnvFile(envFile)
        const secondContents = await readFile(envFile, 'utf8')

        assert.equal(first.created, true)
        assert.equal(second.created, false)
        assert.equal(firstContents, secondContents)
        assert.match(firstContents, /^APP_ENV=production$/mu)
        assert.match(firstContents, /^# keep this comment$/mu)
        assert.equal(firstValues.TALOS_HARNESS_RECEIPT_KEY_ID, first.keypair.keyId)
        assert.equal(firstValues.TALOS_HARNESS_RECEIPT_PRIVATE_KEY_B64, first.keypair.privateKeyBase64)
        assert.equal(firstValues.TALOS_HARNESS_RECEIPT_PUBLIC_KEY_B64, first.keypair.publicKeyBase64)
        if (process.platform !== 'win32') {
            assert.equal((await stat(envFile)).mode & 0o777, 0o600)
        }
    } finally {
        await rm(directory, { recursive: true, force: true })
    }
})

test('env provisioning rejects partial receipt-key configuration without mutating the file', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'talos-harness-receipt-'))
    const envFile = path.join(directory, '.env')
    const original = 'APP_ENV=production\nTALOS_HARNESS_RECEIPT_KEY_ID=partial-key\n'

    try {
        await writeFile(envFile, original, { mode: 0o600 })
        await assert.rejects(
            ensureHarnessReceiptKeypairEnvFile(envFile),
            /partial.*harness receipt keypair/i,
        )
        assert.equal(await readFile(envFile, 'utf8'), original)
    } finally {
        await rm(directory, { recursive: true, force: true })
    }
})

test('env-file CLI provisions without rendering either key half', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'talos-harness-receipt-'))
    const envFile = path.join(directory, '.env')
    const script = path.resolve('src/harness-receipt-keypair.mjs')

    try {
        await writeFile(envFile, 'APP_ENV=production\n', { mode: 0o600 })
        const result = spawnSync(process.execPath, [script, '--env-file', envFile], {
            cwd: path.resolve('.'),
            encoding: 'utf8',
        })
        const values = envValues(await readFile(envFile, 'utf8'))

        assert.equal(result.status, 0, result.stderr)
        assert.match(result.stdout, /harness receipt keypair is ready/i)
        assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /BEGIN (?:PRIVATE|PUBLIC) KEY/u)
        assert.equal(result.stdout.includes(values.TALOS_HARNESS_RECEIPT_PRIVATE_KEY_B64), false)
        assert.equal(result.stdout.includes(values.TALOS_HARNESS_RECEIPT_PUBLIC_KEY_B64), false)
        assert.equal(result.stderr.includes(values.TALOS_HARNESS_RECEIPT_PRIVATE_KEY_B64), false)
        assert.equal(result.stderr.includes(values.TALOS_HARNESS_RECEIPT_PUBLIC_KEY_B64), false)
    } finally {
        await rm(directory, { recursive: true, force: true })
    }
})

/*
 * ⭐⭐⭐ 29/8 — AL CONTRARIO che browser-action-keypair.test.mjs non ha (la
 * sua chiave EC non serve a firmare RICEVUTE del kernel): la coppia
 * generata qui deve essere quella che talosHarness.mjs/generaChiaviFirmaRicevute()
 * si aspetta — un round-trip vero con creaRicevutaOperazione, non solo
 * con node:crypto isolato, prova che il FORMATO combacia davvero.
 */
test('⭐⭐⭐ la coppia generata qui e\' quella che talosHarness.mjs si aspetta: round-trip vero con creaRicevutaOperazione/verificaFirmaRicevuta', async () => {
    const { creaRicevutaOperazione, verificaFirmaRicevuta } = await import(
        '../../../AVM-harness/mobile/scripts/harness-talos/talosHarness.mjs'
    )
    const pair = generateHarnessReceiptKeypair()
    const chiavePrivata = Buffer.from(pair.privateKeyBase64, 'base64').toString('utf8')
    const chiavePubblica = Buffer.from(pair.publicKeyBase64, 'base64').toString('utf8')

    const ricevuta = creaRicevutaOperazione({
        azione: { tipo: 'scrivi', percorso: 'x.txt' },
        toolCallId: 'call_1',
        esitoPermesso: { consentito: true, via: 'nessun-vincolo' },
        contenutoScritto: 'ciao',
        firma: { chiavePrivata, keyId: pair.keyId },
    })

    assert.equal(ricevuta.keyId, pair.keyId)
    assert.equal(verificaFirmaRicevuta(ricevuta, chiavePubblica), true)
})
