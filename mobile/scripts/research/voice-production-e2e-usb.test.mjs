import assert from 'node:assert/strict'
import test from 'node:test'

import {
    INSTRUMENTATION_RUNNER,
    buildInstrumentationArgs,
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

