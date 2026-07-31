import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Android 15 gives a `dataSync` foreground service SIX HOURS a day and calls
 * `onTimeout` when the budget is gone. An app that does not stop itself within
 * a few seconds is killed with `ForegroundServiceDidNotStopInTimeException` —
 * a crash, not a warning.
 *
 * TALOS declares exactly that service type, targets SDK 36, and had no
 * override at all. Found 2026-07-31 by a review that was looking at Hugging
 * Face downloads and noticed the budget is SHARED: a future download on this
 * path would spend it and take the app down on the way out.
 *
 * A source guard rather than an instrumented test, because the repo's gate
 * cannot run Android code — stated plainly, since the alternative was no guard
 * at all. It fails the moment someone declares a new foreground service type
 * without answering for its budget.
 */
const SERVICE = 'android/app/src/main/java/ai/talos/TalosRunService.java'
const MANIFEST = 'android/app/src/main/AndroidManifest.xml'

function read(path: string): string {
    return readFileSync(resolve(process.cwd(), path), 'utf8')
}

describe('every timed foreground service answers for its budget', () => {
    it('declares dataSync and handles the timeout Android 15 sends with it', () => {
        expect(read(MANIFEST)).toContain('android:foregroundServiceType="dataSync"')

        const source = read(SERVICE)
        expect(source).toContain('public void onTimeout(int startId, int fgsType)')
        expect(source).toContain('public void onTimeout(int startId)')
        expect(source).toContain('stopSelf()')
    })

    /**
     * The whole point is stopping. A handler that merely logs still crashes,
     * so this asserts the service actually leaves the foreground.
     */
    it('leaves the foreground rather than just noting the timeout', () => {
        expect(read(SERVICE)).toContain('stopForeground(STOP_FOREGROUND_REMOVE)')
    })

    /** A second declared type would have its own budget and its own timeout. */
    it('declares no foreground service type without a handler for it', () => {
        const declared = [...read(MANIFEST).matchAll(/android:foregroundServiceType="([^"]+)"/g)]
            .flatMap(([, value]) => value!.split('|'))

        expect(declared).toEqual(['dataSync'])
    })
})
