#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
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

export function buildInstrumentationArgs({ className, packageName = 'ai.talos' }) {
    const selected = validateInstrumentationClass(className)
    if (!/^ai\.talos(?:\.[a-z][a-z0-9_]*)*$/.test(packageName)) {
        throw new Error(`invalid Android package name: ${packageName}`)
    }
    return [
        'shell', 'am', 'instrument', '-w', '-r',
        '-e', 'class', selected,
        `${packageName}.test/${INSTRUMENTATION_RUNNER}`,
    ]
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

function installPreservingData(adb, apk, label) {
    const output = selectedExec(adb, ['install', '-r', apk])
    if (!/Success/.test(output)) throw new Error(`${label} install did not report Success: ${output.trim()}`)
}

async function main() {
    const className = validateInstrumentationClass(
        process.argv[2] ?? 'ai.talos.voice.TalosVoiceProductionDoorInstrumentedTest',
    )
    const packageName = process.env.TALOS_PACKAGE ?? 'ai.talos'
    const paths = campaignPaths(packageName)
    requireApk(paths.appApk, 'app APK')
    requireApk(paths.testApk, 'test APK')

    const adb = resolveAdb()
    const identity = probeAuthorizedPadUsb({ adb })
    const lock = acquirePadLock(paths.lock, { runId: `voice-e2e-${Date.now()}` })
    try {
        process.stdout.write(`USB Pad       ${identity.serial} · ${identity.model} · ${identity.devPath}\n`)
        installPreservingData(adb, paths.appApk, 'app APK')
        installPreservingData(adb, paths.testApk, 'test APK')
        const output = selectedExec(adb, buildInstrumentationArgs({ className, packageName }))
        process.stdout.write(output)
        if (/FAILURES!!!|Process crashed|INSTRUMENTATION_FAILED|shortMsg=/.test(output)) {
            throw new Error(`instrumentation failed for ${className}`)
        }
    } finally {
        if (!lock.release()) {
            process.stderr.write(`⛔ lock ${paths.lock} was not removed because ownership changed\n`)
        }
    }
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : ''
if (invokedPath === import.meta.url) {
    main().catch((error) => {
        process.stderr.write(`⛔ ${error.message}\n`)
        process.exitCode = 1
    })
}

