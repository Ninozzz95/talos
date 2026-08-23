import assert from 'node:assert/strict'
import test from 'node:test'

import {
    INSTRUMENTATION_RUNNER,
    buildInstrumentationArgs,
    encodeUsbTransportProof,
    runUsbInstrumentationCampaign,
    validateInstrumentationClass,
} from './voice-production-e2e-usb.mjs'

test('VOICE-E2E-USB-01 a selected class is passed to am instrument without a broad connectedAndroidTest run', () => {
    const className = 'ai.talos.voice.TalosVoiceProductionDoorInstrumentedTest'
    assert.deepEqual(buildInstrumentationArgs({ className, packageName: 'ai.talos' }), [
        'shell', 'am', 'instrument', '-w', '-r',
        '-e', 'class', className,
        `ai.talos.test/${INSTRUMENTATION_RUNNER}`,
    ])
})

test('VOICE-E2E-USB-02 arbitrary shell fragments cannot enter the instrumentation class argument', () => {
    assert.throws(
        () => validateInstrumentationClass('ai.talos.Test; rm -rf /'),
        /class/i,
    )
})

test('VOICE-E2E-USB-03 only the voice package can be selected by this campaign', () => {
    assert.throws(
        () => validateInstrumentationClass('ai.talos.TalosBackendQualificationDeviceTest'),
        /voice/i,
    )
})

test('VOICE-E2E-USB-04 lock precedes every adb probe install and instrument operation', () => {
    const order = []
    const result = runUsbInstrumentationCampaign({
        className: 'ai.talos.voice.TalosPocketLongReadInstrumentedTest',
        packageName: 'ai.talos.dev',
        paths: {
            appApk: 'app-debug.apk',
            testApk: 'app-debug-androidTest.apk',
            lock: 'PAD-OCCUPATO.json',
        },
        instrumentationArgs: {
            talosApkSha256: 'a'.repeat(64),
            talosAppCommit: 'b'.repeat(40),
            talosTestApkSha256: 'c'.repeat(64),
        },
        dependencies: {
            requireApk: () => {},
            resolveAdb: () => 'adb',
            acquirePadLock: () => {
                order.push('lock')
                return {
                    release: () => {
                        order.push('release')
                        return true
                    },
                }
            },
            probeAuthorizedPadUsb: () => {
                order.push('probe')
                return {
                    serial: 'deadbeef',
                    model: 'OPD2415',
                    devPath: 'usb:1-1',
                    hostUsbInstance: 'USB\\VID_22D9&PID_2769\\deadbeef',
                }
            },
            installPreservingData: (_adb, _apk, label) => order.push(`install-${label}`),
            selectedExec: () => {
                order.push('instrument')
                return 'OK (1 test)\n'
            },
        },
    })

    assert.deepEqual(order, ['lock', 'probe', 'install-app', 'install-test', 'instrument', 'release'])
    assert.equal(result.output, 'OK (1 test)\n')
})

test('VOICE-E2E-USB-05 instrumentation failure still releases the exact acquired lock', () => {
    const order = []
    assert.throws(
        () => runUsbInstrumentationCampaign({
            className: 'ai.talos.voice.TalosPocketLongReadInstrumentedTest',
            packageName: 'ai.talos.dev',
            paths: {
                appApk: 'app-debug.apk',
                testApk: 'app-debug-androidTest.apk',
                lock: 'PAD-OCCUPATO.json',
            },
            instrumentationArgs: {
                talosApkSha256: 'a'.repeat(64),
                talosAppCommit: 'b'.repeat(40),
                talosTestApkSha256: 'c'.repeat(64),
            },
            dependencies: {
                requireApk: () => {},
                resolveAdb: () => 'adb',
                acquirePadLock: () => ({
                    release: () => {
                        order.push('release')
                        return true
                    },
                }),
                probeAuthorizedPadUsb: () => ({
                    serial: 'deadbeef',
                    model: 'OPD2415',
                    devPath: 'usb:1-1',
                    hostUsbInstance: 'USB\\VID_22D9&PID_2769\\deadbeef',
                }),
                installPreservingData: () => {},
                selectedExec: () => {
                    order.push('instrument')
                    throw new Error('instrument failed')
                },
            },
        }),
        /instrument failed/,
    )
    assert.deepEqual(order, ['instrument', 'release'])
})

test('VOICE-E2E-USB-06 exact APK and source provenance reaches the selected test as typed arguments', () => {
    const encodedUsbProof = Buffer.from('USB\\VID_22D9&PID_2769\\deadbeef', 'utf8').toString('base64url')
    assert.deepEqual(
        buildInstrumentationArgs({
            className: 'ai.talos.voice.TalosPocketLongReadInstrumentedTest',
            packageName: 'ai.talos.dev',
            instrumentationArgs: {
                talosRunId: 'pocket-long-20260823T160000Z',
                talosAppCommit: 'a'.repeat(40),
                talosApkSha256: 'b'.repeat(64),
                talosTestApkSha256: 'c'.repeat(64),
                talosUsbTransportProofBase64: encodedUsbProof,
            },
        }),
        [
            'shell', 'am', 'instrument', '-w', '-r',
            '-e', 'class', 'ai.talos.voice.TalosPocketLongReadInstrumentedTest',
            '-e', 'talosApkSha256', 'b'.repeat(64),
            '-e', 'talosAppCommit', 'a'.repeat(40),
            '-e', 'talosRunId', 'pocket-long-20260823T160000Z',
            '-e', 'talosTestApkSha256', 'c'.repeat(64),
            '-e', 'talosUsbTransportProofBase64', encodedUsbProof,
            `ai.talos.dev.test/${INSTRUMENTATION_RUNNER}`,
        ],
    )
})

test('VOICE-E2E-USB-07 instrumentation provenance rejects unsafe keys and control characters', () => {
    assert.throws(
        () => buildInstrumentationArgs({
            className: 'ai.talos.voice.TalosPocketLongReadInstrumentedTest',
            instrumentationArgs: { 'talos;rm': 'value' },
        }),
        /argument key/i,
    )
    assert.throws(
        () => buildInstrumentationArgs({
            className: 'ai.talos.voice.TalosPocketLongReadInstrumentedTest',
            instrumentationArgs: { talosRunId: 'line-one\nline-two' },
        }),
        /argument value/i,
    )
    assert.throws(
        () => buildInstrumentationArgs({
            className: 'ai.talos.voice.TalosPocketLongReadInstrumentedTest',
            instrumentationArgs: { talosRunId: 'safe&touch' },
        }),
        /argument value/i,
    )
})

test('VOICE-E2E-USB-08 transport proof round trips without remote shell metacharacters', () => {
    const raw = 'USB\\VID_22D9&PID_2769\\deadbeef'
    const encoded = encodeUsbTransportProof(raw)
    assert.match(encoded, /^[A-Za-z0-9_-]+$/)
    assert.equal(Buffer.from(encoded, 'base64url').toString('utf8'), raw)
})

test('VOICE-E2E-USB-09 a JUnit failure preserves the complete instrumentation report', () => {
    const report = [
        'INSTRUMENTATION_STATUS: class=ai.talos.voice.TalosPocketLongReadInstrumentedTest',
        'There were 3 failures:',
        '1) shortPocketProductionClipPrimesAndDrainsTheRealAudioTrack',
        'java.lang.AssertionError: short playback did not drain',
        'FAILURES!!!',
        'Tests run: 3,  Failures: 3',
        '',
    ].join('\n')

    assert.throws(
        () => runUsbInstrumentationCampaign({
            className: 'ai.talos.voice.TalosPocketLongReadInstrumentedTest',
            packageName: 'ai.talos.dev',
            paths: {
                appApk: 'app-debug.apk',
                testApk: 'app-debug-androidTest.apk',
                lock: 'PAD-OCCUPATO.json',
            },
            instrumentationArgs: {
                talosApkSha256: 'a'.repeat(64),
                talosAppCommit: 'b'.repeat(40),
                talosTestApkSha256: 'c'.repeat(64),
            },
            dependencies: {
                requireApk: () => {},
                resolveAdb: () => 'adb',
                acquirePadLock: () => ({ release: () => true }),
                probeAuthorizedPadUsb: () => ({
                    serial: 'deadbeef',
                    model: 'OPD2415',
                    devPath: 'usb:1-1',
                    hostUsbInstance: 'USB\\VID_22D9&PID_2769\\deadbeef',
                }),
                installPreservingData: () => {},
                selectedExec: () => report,
            },
        }),
        (error) => {
            assert.match(error.message, /instrumentation failed/)
            assert.match(error.message, /short playback did not drain/)
            assert.match(error.message, /Tests run: 3,  Failures: 3/)
            return true
        },
    )
})
