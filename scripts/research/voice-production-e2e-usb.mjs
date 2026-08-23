#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import {
    acquirePadLock,
    buildSelectedAdbArgs,
    probeAuthorizedPadUsb,
    resolveAdb,
} from './voice-pocket-usb-campaign.mjs'

export const INSTRUMENTATION_RUNNER = 'androidx.test.runner.AndroidJUnitRunner'

export function validateInstrumentationClass(className) {
    if (typeof className !== 'string' || !/^ai\.talos\.voice\.[A-Za-z_$][A-Za-z0-9_$.]*Test$/.test(className)) {
        throw new Error(`instrumentation class must be one ai.talos.voice.*Test identifier; got ${className || '<empty>'}`)
    }
    return className
}

export function buildInstrumentationArgs({ className, packageName = 'ai.talos', instrumentationArgs = {} }) {
    const selected = validateInstrumentationClass(className)
    if (!/^ai\.talos(?:\.[a-z][a-z0-9_]*)*$/.test(packageName)) {
        throw new Error(`invalid Android package name: ${packageName}`)
    }
    const args = [
        'shell', 'am', 'instrument', '-w', '-r',
        '-e', 'class', selected,
    ]
    for (const [key, value] of Object.entries(instrumentationArgs).sort(([left], [right]) => left.localeCompare(right))) {
        if (!/^talos[A-Za-z0-9]{1,63}$/.test(key)) {
            throw new Error(`invalid instrumentation argument key: ${key}`)
        }
        if (typeof value !== 'string' || !/^[A-Za-z0-9_.:/=+-]{1,512}$/.test(value)) {
            throw new Error(`invalid instrumentation argument value for ${key}`)
        }
        args.push('-e', key, value)
    }
    args.push(`${packageName}.test/${INSTRUMENTATION_RUNNER}`)
    return args
}

const HERE = dirname(fileURLToPath(import.meta.url))
const MOBILE = resolve(HERE, '..', '..')
const PROJECTS = resolve(MOBILE, '..', '..')

export function campaignPaths(packageName = 'ai.talos') {
    return {
        appApk: resolve(MOBILE, 'android/app/build/outputs/apk/debug/app-debug.apk'),
        testApk: resolve(MOBILE, 'android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk'),
        lock: resolve(PROJECTS, 'PAD-OCCUPATO.json'),
        externalArtifacts: `/storage/emulated/0/Android/data/${packageName}/files/research/voice`,
    }
}

function selectedExec(adb, args) {
    return execFileSync(adb, buildSelectedAdbArgs(args), {
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'pipe'],
    })
}

function requireApk(path, label) {
    if (!existsSync(path)) {
        throw new Error(`${label} absent: ${path}; build :app:assembleDebug :app:assembleDebugAndroidTest first`)
    }
}

export function sha256File(path) {
    return createHash('sha256').update(readFileSync(path)).digest('hex')
}

export function encodeUsbTransportProof(value) {
    if (typeof value !== 'string' || !value.startsWith('USB\\') || value.length > 384) {
        throw new Error('USB transport proof is invalid')
    }
    return Buffer.from(value, 'utf8').toString('base64url')
}

function resolveAppCommit() {
    const commit = execFileSync('git', ['-C', MOBILE, 'rev-parse', 'HEAD'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
    }).trim()
    if (!/^[0-9a-f]{40,64}$/.test(commit)) throw new Error(`git returned an invalid app commit: ${commit}`)
    return commit
}

function installPreservingData(adb, apk, label) {
    const output = selectedExec(adb, ['install', '-r', apk])
    if (!/Success/.test(output)) throw new Error(`${label} install did not report Success: ${output.trim()}`)
}

export function runUsbInstrumentationCampaign({
    className,
    packageName = 'ai.talos',
    paths = campaignPaths(packageName),
    runId = `voice-e2e-${Date.now()}`,
    instrumentationArgs,
    dependencies = {},
}) {
    const requireApkForRun = dependencies.requireApk ?? requireApk
    const resolveAdbForRun = dependencies.resolveAdb ?? resolveAdb
    const acquirePadLockForRun = dependencies.acquirePadLock ?? acquirePadLock
    const probeAuthorizedPadUsbForRun = dependencies.probeAuthorizedPadUsb ?? probeAuthorizedPadUsb
    const installPreservingDataForRun = dependencies.installPreservingData ?? installPreservingData
    const selectedExecForRun = dependencies.selectedExec ?? selectedExec
    const sha256FileForRun = dependencies.sha256File ?? sha256File
    const resolveAppCommitForRun = dependencies.resolveAppCommit ?? resolveAppCommit

    const selectedClass = validateInstrumentationClass(className)
    requireApkForRun(paths.appApk, 'app APK')
    requireApkForRun(paths.testApk, 'test APK')
    const baseInstrumentationArgs = instrumentationArgs ?? {
        talosApkSha256: sha256FileForRun(paths.appApk),
        talosAppCommit: resolveAppCommitForRun(),
        talosTestApkSha256: sha256FileForRun(paths.testApk),
    }
    const adb = resolveAdbForRun()
    const lock = acquirePadLockForRun(paths.lock, { runId })
    try {
        const identity = probeAuthorizedPadUsbForRun({ adb })
        const usbTransportProof = identity.hostUsbInstance
        if (typeof usbTransportProof !== 'string' || !usbTransportProof.startsWith('USB\\')) {
            throw new Error('authorized Pad probe did not return a positive host USB instance')
        }
        installPreservingDataForRun(adb, paths.appApk, 'app')
        installPreservingDataForRun(adb, paths.testApk, 'test')
        const output = selectedExecForRun(
            adb,
            buildInstrumentationArgs({
                className: selectedClass,
                packageName,
                instrumentationArgs: {
                    ...baseInstrumentationArgs,
                    talosRunId: runId,
                    talosUsbTransportProofBase64: encodeUsbTransportProof(usbTransportProof),
                },
            }),
        )
        if (/FAILURES!!!|Process crashed|INSTRUMENTATION_FAILED|shortMsg=/.test(output)) {
            throw new Error(`instrumentation failed for ${selectedClass}\n${output}`)
        }
        return { identity, output }
    } finally {
        if (!lock.release()) {
            process.stderr.write(`⛔ lock ${paths.lock} was not removed because ownership changed\n`)
        }
    }
}

async function main() {
    const className = validateInstrumentationClass(
        process.argv[2] ?? 'ai.talos.voice.TalosVoiceProductionDoorInstrumentedTest',
    )
    const packageName = process.env.TALOS_PACKAGE ?? 'ai.talos'
    const result = runUsbInstrumentationCampaign({ className, packageName })
    process.stdout.write(`USB Pad       ${result.identity.serial} · ${result.identity.model} · ${result.identity.devPath}\n`)
    process.stdout.write(result.output)
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : ''
if (invokedPath === import.meta.url) {
    main().catch((error) => {
        process.stderr.write(`⛔ ${error.message}\n`)
        process.exitCode = 1
    })
}
