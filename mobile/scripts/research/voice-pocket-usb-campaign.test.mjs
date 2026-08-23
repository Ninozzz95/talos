import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import {
    AUTHORIZED_PAD_USB_SERIAL,
    acquirePadLock,
    assertAuthorizedUsbIdentity,
    buildSelectedAdbArgs,
} from './voice-pocket-usb-campaign.mjs'

test('VOICE-USB-01 every device command selects the authorized Pad before the adb subcommand', () => {
    assert.deepEqual(
        buildSelectedAdbArgs(['shell', 'getprop', 'ro.product.model']),
        ['-s', AUTHORIZED_PAD_USB_SERIAL, 'shell', 'getprop', 'ro.product.model'],
    )
})

test('VOICE-USB-02 the authorized serial is rejected when adb reports a wireless transport', () => {
    assert.throws(
        () => assertAuthorizedUsbIdentity({
            serial: AUTHORIZED_PAD_USB_SERIAL,
            state: 'device',
            devPath: '192.168.1.95:44921',
            model: 'OPD2415',
        }),
        /USB/i,
    )
})

test('VOICE-USB-02A Windows may report get-devpath=unknown only when connected PnP proves the exact USB instance', () => {
    assert.deepEqual(assertAuthorizedUsbIdentity({
        serial: AUTHORIZED_PAD_USB_SERIAL,
        state: 'device',
        devPath: 'unknown',
        model: 'OPD2415',
        hostUsbInstance: 'USB\\VID_22D9&PID_2769\\2ea6573c',
    }), {
        serial: AUTHORIZED_PAD_USB_SERIAL,
        state: 'device',
        devPath: 'unknown',
        model: 'OPD2415',
        hostUsbInstance: 'USB\\VID_22D9&PID_2769\\2ea6573c',
    })
})

test('VOICE-USB-02B PnP evidence for another device cannot bless get-devpath=unknown', () => {
    assert.throws(
        () => assertAuthorizedUsbIdentity({
            serial: AUTHORIZED_PAD_USB_SERIAL,
            state: 'device',
            devPath: 'unknown',
            model: 'OPD2415',
            hostUsbInstance: 'USB\\VID_22D9&PID_2769\\different-device',
        }),
        /USB/i,
    )
})

test('VOICE-USB-03 a USB device with a different serial is rejected before installation or instrumentation', () => {
    assert.throws(
        () => assertAuthorizedUsbIdentity({
            serial: 'oneplus-13',
            state: 'device',
            devPath: 'usb:1-2',
            model: 'CPH2653',
        }),
        /2ea6573c/,
    )
})

test('VOICE-USB-04 an offline authorized serial is not treated as a usable Pad', () => {
    assert.throws(
        () => assertAuthorizedUsbIdentity({
            serial: AUTHORIZED_PAD_USB_SERIAL,
            state: 'offline',
            devPath: 'usb:1-2',
            model: 'OPD2415',
        }),
        /offline/,
    )
})

test('VOICE-USB-05 the shared Pad lock is exclusive and a stale releaser cannot delete a foreign lock', () => {
    const root = mkdtempSync(join(tmpdir(), 'talos-voice-pad-lock-'))
    const path = join(root, 'PAD-OCCUPATO.json')
    try {
        const first = acquirePadLock(path, { runId: 'run-a', pid: 11, now: '2026-08-23T10:00:00.000Z' })
        assert.equal(JSON.parse(readFileSync(path, 'utf8')).runId, 'run-a')
        assert.throws(
            () => acquirePadLock(path, { runId: 'run-b', pid: 12, now: '2026-08-23T10:01:00.000Z' }),
            /occupato/i,
        )

        writeFileSync(path, JSON.stringify({ runId: 'foreign', nonce: 'not-ours' }))
        first.release()
        assert.equal(JSON.parse(readFileSync(path, 'utf8')).runId, 'foreign')
    } finally {
        rmSync(root, { recursive: true, force: true })
    }
})
