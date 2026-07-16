import {
    createPrivateKey,
    createPublicKey,
    generateKeyPairSync,
    randomUUID,
    timingSafeEqual,
} from 'node:crypto'
import { chmod, readFile, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const PRIVATE_KEY_ENV = 'TALOS_BROWSER_ACTION_PRIVATE_KEY_B64'
const PUBLIC_KEY_ENV = 'TALOS_BROWSER_ACTION_PUBLIC_KEY_B64'
const KEY_ID_ENV = 'TALOS_BROWSER_ACTION_KEY_ID'
const ACTION_KEY_ENV_NAMES = [PRIVATE_KEY_ENV, PUBLIC_KEY_ENV, KEY_ID_ENV]
const KEY_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u

export function generateBrowserActionKeypair() {
    const { privateKey, publicKey } = generateKeyPairSync('ec', {
        namedCurve: 'P-256',
        privateKeyEncoding: { format: 'pem', type: 'pkcs8' },
        publicKeyEncoding: { format: 'pem', type: 'spki' },
    })
    const keypair = {
        keyId: `talos-browser-action-${randomUUID()}`,
        privateKeyBase64: Buffer.from(privateKey, 'utf8').toString('base64'),
        publicKeyBase64: Buffer.from(publicKey, 'utf8').toString('base64'),
    }

    assertValidBrowserActionKeypair(keypair)

    return keypair
}

export async function ensureBrowserActionKeypairEnvFile(envFile) {
    const absolutePath = path.resolve(envFile)
    const contents = await readFile(absolutePath, 'utf8').catch((error) => {
        if (error?.code === 'ENOENT') return ''
        throw error
    })
    const parsed = parseEnv(contents)
    const configured = {
        keyId: parsed.get(KEY_ID_ENV)?.trim() ?? '',
        privateKeyBase64: parsed.get(PRIVATE_KEY_ENV)?.trim() ?? '',
        publicKeyBase64: parsed.get(PUBLIC_KEY_ENV)?.trim() ?? '',
    }
    const presentCount = Object.values(configured).filter((value) => value !== '').length

    if (presentCount > 0 && presentCount < 3) {
        throw new Error('Refusing partial TALOS browser action keypair configuration.')
    }
    if (presentCount === 3) {
        assertValidBrowserActionKeypair(configured)
        await chmod(absolutePath, 0o600).catch((error) => {
            if (process.platform !== 'win32') throw error
        })

        return { created: false, keypair: configured }
    }

    const keypair = generateBrowserActionKeypair()
    const updated = setEnvValues(contents, new Map([
        [PRIVATE_KEY_ENV, keypair.privateKeyBase64],
        [PUBLIC_KEY_ENV, keypair.publicKeyBase64],
        [KEY_ID_ENV, keypair.keyId],
    ]))
    const temporaryPath = `${absolutePath}.tmp-${process.pid}-${randomUUID()}`

    try {
        await writeFile(temporaryPath, updated, { encoding: 'utf8', flag: 'wx', mode: 0o600 })
        await rename(temporaryPath, absolutePath)
        await chmod(absolutePath, 0o600).catch((error) => {
            if (process.platform !== 'win32') throw error
        })
    } catch (error) {
        await rm(temporaryPath, { force: true }).catch(() => {})
        throw error
    }

    return { created: true, keypair }
}

function assertValidBrowserActionKeypair(keypair) {
    if (!KEY_ID_PATTERN.test(keypair.keyId)) throw configurationError()

    const privatePem = decodeCanonicalBase64(keypair.privateKeyBase64)
    const publicPem = decodeCanonicalBase64(keypair.publicKeyBase64)
    if (!privatePem.startsWith('-----BEGIN PRIVATE KEY-----\n')
        || !privatePem.trimEnd().endsWith('-----END PRIVATE KEY-----')
        || !publicPem.startsWith('-----BEGIN PUBLIC KEY-----\n')
        || !publicPem.trimEnd().endsWith('-----END PUBLIC KEY-----')) {
        throw configurationError()
    }

    try {
        const privateKey = createPrivateKey(privatePem)
        const publicKey = createPublicKey(publicPem)
        if (privateKey.asymmetricKeyType !== 'ec'
            || publicKey.asymmetricKeyType !== 'ec'
            || privateKey.asymmetricKeyDetails?.namedCurve !== 'prime256v1'
            || publicKey.asymmetricKeyDetails?.namedCurve !== 'prime256v1') {
            throw configurationError()
        }

        const expectedPublic = createPublicKey(privateKey).export({ format: 'der', type: 'spki' })
        const suppliedPublic = publicKey.export({ format: 'der', type: 'spki' })
        if (expectedPublic.length !== suppliedPublic.length
            || !timingSafeEqual(expectedPublic, suppliedPublic)) {
            throw configurationError()
        }
    } catch {
        throw configurationError()
    }
}

function decodeCanonicalBase64(value) {
    if (typeof value !== 'string'
        || value === ''
        || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(value)) {
        throw configurationError()
    }
    const decoded = Buffer.from(value, 'base64')
    if (decoded.toString('base64') !== value) throw configurationError()

    return decoded.toString('utf8')
}

function parseEnv(contents) {
    const values = new Map()
    const occurrences = new Map()
    for (const line of contents.split(/\r?\n/u)) {
        const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/u.exec(line)
        if (!match) continue
        const [, name, value] = match
        occurrences.set(name, (occurrences.get(name) ?? 0) + 1)
        values.set(name, value)
    }
    for (const name of ACTION_KEY_ENV_NAMES) {
        if ((occurrences.get(name) ?? 0) > 1) {
            throw new Error(`Refusing duplicate ${name} entries in the environment file.`)
        }
    }

    return values
}

function setEnvValues(contents, values) {
    const eol = contents.includes('\r\n') ? '\r\n' : '\n'
    const lines = contents === '' ? [] : contents.split(/\r?\n/u)
    if (lines.at(-1) === '') lines.pop()

    for (const [name, value] of values) {
        const index = lines.findIndex((line) => line.startsWith(`${name}=`))
        const replacement = `${name}=${value}`
        if (index >= 0) lines[index] = replacement
        else lines.push(replacement)
    }

    return `${lines.join(eol)}${eol}`
}

function configurationError() {
    return new Error('TALOS browser action keypair must be a matching P-256 PKCS8/SPKI pair with a valid key id.')
}

async function runCli() {
    const [, , flag, target, ...rest] = process.argv
    if (flag !== '--env-file' || typeof target !== 'string' || target.trim() === '' || rest.length > 0) {
        throw new Error('Usage: node scripts/browser-action-keypair.mjs --env-file <path>')
    }

    const result = await ensureBrowserActionKeypairEnvFile(target)
    process.stdout.write(`Browser action keypair is ready (${result.created ? 'created' : 'existing'}).\n`)
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : ''
if (invokedPath === fileURLToPath(import.meta.url)) {
    runCli().catch((error) => {
        process.stderr.write(`${error instanceof Error ? error.message : 'Browser action keypair provisioning failed.'}\n`)
        process.exitCode = 1
    })
}
