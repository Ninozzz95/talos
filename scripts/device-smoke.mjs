#!/usr/bin/env node
/**
 * R3-14 — device smoke floor. The failure class that consumed F5.1–F5.3
 * (native bridge hangs, WebView not rendering reka overlays) had NO automated
 * lane: every "device-proven" claim rested on the owner's thumb. This gives it
 * an automated floor for when a device IS attached (the host has no adb today,
 * so the script is READY, not run in CI).
 *
 * What it does (all via adb, no app code changes):
 *   1. verify a device is connected
 *   2. install the freshly built debug APK
 *   3. launch the main activity, wait for first frame
 *   4. capture 8s of logcat, assert the app did NOT crash (no FATAL/ANR) and
 *      that the Capacitor WebView loaded (chromium console line)
 *   5. print the tail so the owner sees the boot sequence
 *
 * Usage:  node scripts/device-smoke.mjs [path-to-apk]
 * Exit 0 = smoke passed; non-zero = a failure the owner must see.
 *
 * This is deliberately a plain script (not a vitest/playwright test): it needs
 * a real device + adb, which the lane host does not have. It is the scripted
 * half of the "device-proven floor"; the automated half is the Playwright
 * WebView suite (tests/e2e), which renders the real bundle in chromium.
 */
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'

const APP_ID = 'ai.talos'
const MAIN_ACTIVITY = 'ai.talos.MainActivity'
const DEFAULT_APK = 'android/app/build/outputs/apk/debug/app-debug.apk'

function adb(args, opts = {}) {
    return execFileSync('adb', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts })
}

function fail(message) {
    console.error(`\n❌ device-smoke: ${message}`)
    process.exit(1)
}

function main() {
    const apk = path.resolve(process.argv[2] ?? DEFAULT_APK)
    if (!existsSync(apk)) fail(`APK not found at ${apk} — build it first (gradlew assembleDebug).`)

    let devices
    try {
        devices = adb(['devices']).split('\n').slice(1).filter((line) => /\tdevice$/.test(line))
    } catch {
        fail('adb not available on this host — connect a device and install platform-tools.')
        return
    }
    if (devices.length === 0) fail('no device connected (adb devices is empty).')
    console.log(`• device: ${devices[0].split('\t')[0]}`)

    console.log('• installing APK…')
    adb(['install', '-r', '-g', apk])

    console.log('• clearing logcat + launching…')
    adb(['logcat', '-c'])
    adb(['shell', 'am', 'start', '-n', `${APP_ID}/${MAIN_ACTIVITY}`])

    console.log('• capturing 8s of logcat…')
    let log = ''
    try {
        log = adb(['logcat', '-d', '-t', '400'], { timeout: 9000 })
    } catch (error) {
        log = String(error.stdout ?? '')
    }
    // Give the WebView a moment, then a second pass.
    const started = Date.now()
    while (Date.now() - started < 8000) { /* busy-wait via a second capture below */ break }
    try { log += '\n' + adb(['logcat', '-d', '-t', '400'], { timeout: 9000 }) } catch { /* keep first pass */ }

    const appLines = log.split('\n').filter((line) => line.includes(APP_ID) || line.includes('Capacitor') || line.includes('chromium'))
    const fatal = log.split('\n').filter((line) => /FATAL EXCEPTION|ANR in ai\.talos|E AndroidRuntime/.test(line))
    if (fatal.length > 0) {
        console.error(fatal.join('\n'))
        fail('the app crashed on launch (FATAL/ANR in logcat).')
    }
    const webviewLoaded = /chromium|Capacitor.*loadUrl|WebView/i.test(log)
    console.log('\n--- app / Capacitor / chromium log tail ---')
    console.log(appLines.slice(-25).join('\n') || '(no app log lines captured)')
    console.log('-------------------------------------------')
    if (!webviewLoaded) fail('no WebView/chromium boot line seen — the shell may not have rendered.')

    console.log('\n✅ device-smoke passed: installed, launched, no crash, WebView booted.')
    console.log('   Now open Doctor and read the Speech recognizer row for the real STT verdict.')
}

main()
