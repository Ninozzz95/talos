import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const manifest = readFileSync(
    resolve(process.cwd(), 'android/app/src/main/AndroidManifest.xml'),
    'utf8',
)
const transferPlugin = readFileSync(
    resolve(process.cwd(), 'android/app/src/main/java/ai/talos/TalosModelTransferPlugin.java'),
    'utf8',
)

/**
 * The permissions the SCHEDULER demands, not the ones we thought we needed.
 *
 * On 2026-08-02 the first real download ever attempted on a real device killed
 * the app on the first tap of Scarica. Everything about the transfer was
 * already right — the client, the arithmetic, the reservation, the resume, the
 * foreground service, forty commits of it — and `JobScheduler.schedule` threw
 * `SecurityException: android.permission.ACCESS_NETWORK_STATE required for jobs
 * with a connectivity constraint`, which crossed the Capacitor bridge as a
 * fatal exception.
 *
 * Nothing on the JVM could have seen it, and nothing did: the code compiles,
 * the tests pass, the manifest is valid, and the failure exists only in the
 * platform's own rule. So the rule is written down here instead, as a link
 * between two files that must agree — the job that asks for a network, and the
 * manifest that has to say we may ask.
 */
describe('the transfer job and the permissions its scheduler requires', () => {
    it('declares ACCESS_NETWORK_STATE, because the job constrains connectivity', () => {
        // The premise. If this ever stops being true the assertion below is
        // still harmless, but the test would be testing nothing — so it is
        // checked rather than assumed.
        expect(transferPlugin).toContain('setRequiredNetwork(')

        expect(manifest).toContain('android.permission.ACCESS_NETWORK_STATE')
    })

    /**
     * The neighbours of the same failure, checked together because they fail
     * the same way: a permission absent from the manifest is not a compile
     * error, not a lint error, and not a test failure — it is a crash on a
     * device, at the moment the user asks for the thing.
     */
    it('declares everything else the download path needs to exist at all', () => {
        for (const permission of [
            // The transfer itself.
            'android.permission.INTERNET',
            // What keeps it alive when the user leaves the app.
            'android.permission.FOREGROUND_SERVICE',
            'android.permission.FOREGROUND_SERVICE_DATA_SYNC',
            // On Android 13+ the notification IS the foreground service.
            'android.permission.POST_NOTIFICATIONS',
            // The user-initiated job, which is how a 4 GB download escapes the
            // six-hour daily cap on dataSync services.
            'android.permission.RUN_USER_INITIATED_JOBS',
        ]) {
            expect(manifest).toContain(permission)
        }
    })

    it('declares the services it starts, with the type Android 14+ checks twice', () => {
        // Declared here AND at start, and the platform refuses the service
        // outright if the two disagree.
        expect(manifest).toContain('ai.talos.TalosModelTransferService')
        expect(manifest).toContain('android:foregroundServiceType="dataSync"')
        expect(manifest).toContain('ai.talos.TalosModelTransferJob')
    })
})
