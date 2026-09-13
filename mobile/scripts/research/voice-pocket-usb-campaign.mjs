#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import {
    closeSync,
    existsSync,
    openSync,
    readFileSync,
    unlinkSync,
    writeFileSync,
} from 'node:fs'
import { randomUUID } from 'node:crypto'
import { pathToFileURL } from 'node:url'

/**
 * Owner constraint for the whole 0.1.19 voice campaign: which physical Pad
 * this script is allowed to drive. Declared by the environment and read at
 * call time, never hardcoded — a specific device's identifier must never
 * sit in committed, published source. No fallback exists: an unset
 * `TALOS_RESEARCH_PAD_USB_SERIAL` refuses the campaign instead of running
 * against whichever device happens to be attached.
 */
export function authorizedPadUsbSerial() {
    const serial = process.env.TALOS_RESEARCH_PAD_USB_SERIAL
    if (!serial) {
        throw new Error(
            'TALOS_RESEARCH_PAD_USB_SERIAL is not set: the voice campaign refuses to run '
            + 'without a declared authorized device',
        )
    }
    return serial
}

export function buildSelectedAdbArgs(args) {
    if (!Array.isArray(args) || args.length === 0) throw new Error('adb subcommand is required')
    return ['-s', authorizedPadUsbSerial(), ...args]
}

export function assertAuthorizedUsbIdentity(identity) {
    const authorized = authorizedPadUsbSerial()
    if (identity.serial !== authorized) {
        throw new Error(`voice campaign is locked to Pad ${authorized}; got ${identity.serial || '<empty>'}`)
    }
    if (identity.state !== 'device') {
        throw new Error(`Pad ${authorized} is ${identity.state || 'unavailable'}, not device`)
    }
    const selectedDevPathIsUsb = String(identity.devPath ?? '').startsWith('usb:')
    const hostUsbInstance = String(identity.hostUsbInstance ?? '')
    const hostProvesExactUsbInstance = new RegExp(
        `^USB\\\\[^\\r\\n]*\\\\${authorized}$`,
        'i',
    ).test(hostUsbInstance)
    if (!selectedDevPathIsUsb && !hostProvesExactUsbInstance) {
        throw new Error(
            `Pad ${authorized} is not on a proven USB adb transport `
            + `(get-devpath=${identity.devPath || '<empty>'}, host-pnp=${hostUsbInstance || '<empty>'}); `
            + 'wireless debug is forbidden',
        )
    }
    if (!String(identity.model ?? '').trim()) {
        throw new Error(`Pad ${authorized} returned an empty model identity`)
    }
    return Object.freeze({
        serial: identity.serial,
        state: identity.state,
        devPath: identity.devPath,
        model: String(identity.model).trim(),
        ...(hostUsbInstance ? { hostUsbInstance } : {}),
    })
}

export function resolveAdb(env = process.env, platform = process.platform) {
    if (env.TALOS_ADB) return env.TALOS_ADB
    const executable = platform === 'win32' ? 'adb.exe' : 'adb'
    const sdk = env.ANDROID_HOME ?? env.ANDROID_SDK_ROOT
    const candidates = []
    if (sdk) candidates.push(`${sdk}/platform-tools/${executable}`)
    const userRoot = env.LOCALAPPDATA ?? env.HOME ?? ''
    if (userRoot) {
        candidates.push(`${userRoot}/Android/Sdk/platform-tools/${executable}`)
        candidates.push(`${userRoot}/Library/Android/sdk/platform-tools/${executable}`)
    }
    return candidates.find((candidate) => existsSync(candidate)) ?? executable
}

export function runSelectedAdb(args, options = {}) {
    const adb = options.adb ?? resolveAdb()
    const exec = options.execFileSyncImpl ?? execFileSync
    return exec(adb, buildSelectedAdbArgs(args), {
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
        ...options.execOptions,
    })
}

/**
 * Read-only proof performed before any install, shell mutation or campaign.
 * Even these calls carry `-s`: there is no ambient/default adb target.
 */
export function probeAuthorizedPadUsb(options = {}) {
    const run = (args) => String(runSelectedAdb(args, options)).trim()
    const platform = options.platform ?? process.platform
    let hostUsbInstance = ''
    if (platform === 'win32') {
        const exec = options.execFileSyncImpl ?? execFileSync
        const pnpOutput = String(exec(options.pnputil ?? 'pnputil', [
            '/enum-devices', '/connected', '/deviceids',
        ], {
            encoding: 'utf8',
            maxBuffer: 64 * 1024 * 1024,
        }))
        hostUsbInstance = pnpOutput.match(
            new RegExp(`USB\\\\[^\\r\\n]*\\\\${authorizedPadUsbSerial()}`, 'i'),
        )?.[0] ?? ''
    }
    const identity = {
        serial: run(['get-serialno']),
        state: run(['get-state']),
        devPath: run(['get-devpath']),
        model: run(['shell', 'getprop', 'ro.product.model']),
        hostUsbInstance,
    }
    return assertAuthorizedUsbIdentity(identity)
}

export function acquirePadLock(path, metadata = {}) {
    const nonce = metadata.nonce ?? randomUUID()
    const payload = {
        owner: 'codex/lane/voce-fluida',
        purpose: 'TALOS 0.1.19 voice instrumentation',
        serial: authorizedPadUsbSerial(),
        runId: metadata.runId ?? `voice-${Date.now()}`,
        pid: metadata.pid ?? process.pid,
        createdAt: metadata.now ?? new Date().toISOString(),
        nonce,
    }
    let descriptor
    try {
        descriptor = openSync(path, 'wx')
        writeFileSync(descriptor, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
    } catch (error) {
        if (descriptor !== undefined) closeSync(descriptor)
        const current = existsSync(path) ? readFileSync(path, 'utf8').trim() : '<unreadable>'
        throw new Error(`Pad occupato: lock già presente in ${path}: ${current}`, { cause: error })
    }
    closeSync(descriptor)

    let released = false
    return {
        payload: Object.freeze(payload),
        release() {
            if (released) return false
            released = true
            if (!existsSync(path)) return false
            let current
            try {
                current = JSON.parse(readFileSync(path, 'utf8'))
            } catch {
                return false
            }
            if (current.nonce !== nonce) return false
            unlinkSync(path)
            return true
        },
    }
}

async function main() {
    const identity = probeAuthorizedPadUsb()
    process.stdout.write(`${JSON.stringify({ authorizedUsbPad: identity }, null, 2)}\n`)
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : ''
if (invokedPath === import.meta.url) {
    main().catch((error) => {
        process.stderr.write(`⛔ ${error.message}\n`)
        process.exitCode = 1
    })
}
