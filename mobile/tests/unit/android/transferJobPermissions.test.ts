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
const transferSession = readFileSync(
    resolve(process.cwd(), 'android/app/src/main/java/ai/talos/TalosTransferSession.java'),
    'utf8',
)
const transferJob = readFileSync(
    resolve(process.cwd(), 'android/app/src/main/java/ai/talos/TalosModelTransferJob.java'),
    'utf8',
)
const transferService = readFileSync(
    resolve(process.cwd(), 'android/app/src/main/java/ai/talos/TalosModelTransferService.java'),
    'utf8',
)
const transferControl = readFileSync(
    resolve(process.cwd(), 'android/app/src/main/java/ai/talos/TalosTransferControl.java'),
    'utf8',
)
const transferNotification = readFileSync(
    resolve(process.cwd(), 'android/app/src/main/java/ai/talos/TalosTransferNotification.java'),
    'utf8',
)
const transferJournal = readFileSync(
    resolve(process.cwd(), 'android/app/src/main/java/ai/talos/TalosTransferJournal.java'),
    'utf8',
)
const transferDispatcher = readFileSync(
    resolve(process.cwd(), 'android/app/src/main/java/ai/talos/TalosTransferDispatcher.java'),
    'utf8',
)
const storageReservation = readFileSync(
    resolve(process.cwd(), 'android/app/src/main/java/ai/talos/TalosStorageReservation.java'),
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
        expect(transferDispatcher).toContain('setRequiredNetwork(')

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

    it('C45-RED-05/06 exposes pause, resume and cancel over the durable journal', () => {
        for (const method of ['pause', 'resume', 'cancel', 'status']) {
            expect(transferPlugin).toMatch(new RegExp(`@PluginMethod\\s+public void ${method}\\(`))
        }
        // The old bridge symbol remains a pause alias for installed WebViews.
        expect(transferPlugin).toMatch(/@PluginMethod\s+public void stop\([^]*?pause\(call\)/)
        expect(transferPlugin).toContain('TalosTransferSession.begin(')
        expect(transferPlugin).toContain('TalosTransferPlan.Runner.DEFERRED_JOB')
        expect(transferPlugin).toContain('TalosTransferDispatcher.dispatch(')
        expect(transferPlugin).toContain('TalosTransferSession.restoreAll(getContext())')
        for (const field of [
            'phase', 'repo', 'revision', 'paths', 'modelName', 'runner',
            'networkBound', 'failure', 'resumable', 'haveBytes', 'totalBytes',
        ]) {
            expect(transferPlugin).toContain(`item.put("${field}"`)
        }
    })

    it('C45-RED-06 reconnects both Android hosts after process recreation', () => {
        expect(transferJob).toContain('TalosTransferSession.restoreAll(')
        expect(transferService).toContain('TalosTransferSession.restore(this, id)')
        expect(transferSession).toContain('TalosTransferJournal.Phase.RUNNING')
        expect(transferJob).toContain('TalosTransferSession.finish(')
        expect(transferService).toContain('TalosTransferSession.finish(')
        expect(transferJob).toContain('StopCause.SYSTEM_STOP')
        expect(transferService).toContain('StopCause.SYSTEM_STOP')
    })

    it('C45-RED-05 gives the notification a real Pause action and local-model destination', () => {
        expect(transferNotification).toContain('ACTION_PAUSE')
        expect(transferNotification).toContain('.addAction(0, "Pause"')
        expect(transferNotification).toContain('"/settings/models/local"')
        expect(transferControl).toContain('ACTION_PAUSE')
        expect(transferControl).toContain('StopCause.USER_PAUSE')
    })

    it('C45-RED-08A/08E persists unique job ids and routes controls by transfer id', () => {
        expect(transferJournal).toContain('SCHEMA_VERSION = 2')
        expect(transferJournal).toContain('public final int jobId')
        expect(transferPlugin).not.toContain('private static final int JOB_ID = 4712')
        expect(transferPlugin).toContain('result.put("items"')
        expect(transferNotification).toContain('EXTRA_TRANSFER_ID')
        expect(transferNotification).toContain('pause.putExtra(EXTRA_TRANSFER_ID')
        expect(transferControl).toContain('getStringExtra(TalosTransferNotification.EXTRA_TRANSFER_ID)')
        expect(transferJob).toContain('params.getJobId()')
    })

    it('C45-RED-08B admits only two hosts and leaves extra records waiting', () => {
        expect(transferDispatcher).toContain('MAX_ACTIVE_TRANSFERS = 2')
        expect(transferDispatcher).toContain('Phase.WAITING')
        expect(transferSession).toContain('ConcurrentHashMap<String, State>')
        expect(transferService).toContain('ConcurrentHashMap<String, Thread>')
    })

    it('C45-RED-08J reconciles a moving record with the Android host that owns it', () => {
        expect(transferDispatcher).toContain('getPendingJob(snapshot.jobId)')
        expect(transferDispatcher).toContain('recoveredPhase(')
        expect(transferSession).toContain('TalosTransferDispatcher.hasHost(')
        expect(transferSession).toContain('completionForHost(')
    })

    it('C45-RED-08D reserves a whole set behind one storage critical section', () => {
        expect(storageReservation).toContain('RESERVATION_LOCK')
        expect(storageReservation).toContain('reserveAll(')
        expect(transferSession).toContain('TalosStorageReservation.reserveAll(')
    })
})
