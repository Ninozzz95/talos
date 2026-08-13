<script setup lang="ts">
/**
 * F5 station — Doctor: honest, offline device readiness report. Every row is
 * a REAL probe (no invented tiers): platform, storage engine + persistence
 * state, speech recognizer, biometrics, share bridge, network reachability.
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useTalosI18n } from '@/i18n'
import { TabsContent } from 'reka-ui'
import TalosThemedSwitch from '@/components/talos/ui/TalosThemedSwitch.vue'
import TalosThemedTabs from '@/components/talos/ui/TalosThemedTabs.vue'
import {
    Activity, ChevronDown, CircleCheck, CircleX, ClipboardCopy, Stethoscope, Timer,
} from '@lucide/vue'
import { Capacitor } from '@capacitor/core'
import { talosLocalEngineDoctorRows } from '@/services/localEngineDoctor'
import { useChatController } from '@/stores/chatController'
import { useSettingsStore } from '@/stores/settings'
import { talosDictationDiagnostics } from '@/services/dictationDiagnostica'
import { talosDatabaseLockFailure, talosDatabaseLockState } from '@/services/databaseProtection'
import { talosDeviceIssues, talosWithTimeout, type TalosDeviceIssue } from '@/lib/talosDeviceLog'
import { biometricUnlockAvailable } from '@/services/appLock'
import { writeTalosClipboardText } from '@/services/clipboard'
import {
    splitTalosDoctorRows,
    talosDoctorFoldLabel,
    talosLockDoctorRow,
    talosStorageDoctorRow,
} from '@/lib/diagnostics/doctorSections'
import { talosRememberView, talosRememberedView } from '@/lib/navigation/rememberedView'
import { buildTalosDiagnosticsReport } from '@/lib/diagnostics/diagnosticsReport'

interface DoctorRow {
    id: string
    label: string
    value: string
    ok: boolean
}

const controller = useChatController()
const settings = useSettingsStore()
const { t } = useTalosI18n()

/**
 * Owner 2026-07-26: technical codes belong to whoever is debugging, not to
 * whoever is using the app. Off is what ships; on adds the code that names the
 * step that failed, right beside the plain sentence.
 *
 * It lives in Doctor rather than Appearance because this is the diagnostics
 * station — someone looking for it is already here, and someone who is not will
 * never trip over it by accident.
 */
function toggleDiagnostics(on: boolean): void {
    void settings.setShell({ debug_diagnostics: on })
    // Turning it off discards what was measured: otherwise the report says
    // `timingsRecorded: false` beside a list of sends, which contradicts itself.
    if (!on) controller.clearTraces()
}

const rows = ref<DoctorRow[]>([])
const scanning = ref(true)
const issues = ref<readonly TalosDeviceIssue[]>([])

/**
 * Three FIXED segments, sections collapsed inside them, one verdict on top.
 *
 * Owner 2026-07-26: "non voglio che sia troppo affollata". The research settled
 * the shape: a tab row that scrolls hides the very thing someone came here to
 * find, and NN/g document that expanding the FIRST item by default makes people
 * think the screen is only about that. So what stays open is what is
 * actionable — the failures — and everything that passed folds into one row.
 */
const activeSection = ref<string>(talosRememberedView('doctor') ?? 'status')

function chooseSection(section: string): void {
    activeSection.value = section
    talosRememberView('doctor', section)
}
const showPassing = ref(false)
const copied = ref(false)
let copyTimer: ReturnType<typeof setTimeout> | null = null
const copyError = ref<string | null>(null)

const verdict = computed(() => {
    if (rows.value.length === 0) return { ok: true, message: '' }
    const problems = rows.value.filter((row) => !row.ok).length
    if (problems === 0) {
        return {
            ok: true,
            message: t(rows.value.length === 1 ? 'doctor.checksPassedOne' : 'doctor.checksPassedMany', {
                count: rows.value.length,
            }),
        }
    }
    return {
        ok: false,
        message: t(problems === 1 ? 'doctor.problemsFoundOne' : 'doctor.problemsFoundMany', {
            count: problems,
        }),
    }
})
const split = computed(() => splitTalosDoctorRows(rows.value))

/** L'etichetta della piega. La regola, col perché, sta su `talosDoctorFoldLabel`. */
const etichettaPiega = computed(() => talosDoctorFoldLabel({
    problems: split.value.problems.length,
    passing: split.value.passing.length,
    open: showPassing.value,
}))
const traces = computed(() => controller.traces())
const buildId = computed(() => rows.value.find((row) => row.id === 'build')?.value ?? t('doctor.unknown'))

/**
 * Always the WHOLE report, never just the open tab.
 *
 * A copy button that captures only the visible panel is exactly the
 * "content behind tabs gets missed" failure, promoted into a support pipeline.
 * The payload is built BEFORE the clipboard call and nothing is awaited in
 * between: on Android the web path needs the transient activation from the tap,
 * and an await can consume it. The native plugin, tried first, has no such
 * dependency.
 */
/**
 * ⭐ 8B-2 — il comando che misura i thread e RICORDA la scelta.
 *
 * Owner 2026-08-07: «metti il comando che misura 8b-2».
 *
 * Sta nel Doctor e non fra le impostazioni perché è una misura, non una
 * preferenza: produce numeri, e i numeri di questo dispositivo stanno qui.
 *
 * ⛔ Ed è un comando, non un avvio automatico: misurare **azzera la
 * conversazione in memoria** e costa qualche secondo per candidato. Chi lo
 * tocca sa cosa sta comprando; chi voleva solo scrivere un messaggio non deve
 * pagarlo a sua insaputa.
 */
const tuning = ref<{ running: boolean, summary: string | null, ok: boolean }>({
    running: false,
    summary: null,
    ok: false,
})

async function measureThreads(): Promise<void> {
    if (tuning.value.running) return
    tuning.value = { running: true, summary: null, ok: false }
    try {
        const [{ talosRunThreadTuning }, { talosLocalEngineStatus, talosLocalInstalledModels },
            { talosMeasureDevice }, { TALOS_APP_BUILD }] = await Promise.all([
            import('@/services/threadTuningRun'),
            import('@/services/localEngine'),
            import('@/services/deviceCapacity'),
            import('@/lib/appBuild'),
        ])
        const [stato, device, installati] = await Promise.all([
            talosLocalEngineStatus(),
            talosMeasureDevice(),
            talosLocalInstalledModels().catch(() => ({ models: [] })),
        ])
        /*
         * Serve un modello APERTO: la sonda misura questo modello su questo
         * dispositivo, e senza non c'è niente da misurare. Dirlo è meglio che
         * aprirne uno d'ufficio — sarebbero gigabyte caricati da un pulsante
         * che prometteva una misura.
         */
        const file = installati.models.find((candidate) => candidate.path === stato.loadedPath)
        if (!stato.loadedPath || !device?.cpuCores || !file) {
            tuning.value = {
                running: false,
                ok: false,
                summary: t('doctor.threadTuningNeedsModel'),
            }
            return
        }
        const esito = await talosRunThreadTuning({
            modelPath: file.path,
            modelBytes: file.bytes,
            modelModifiedAt: file.modifiedAt ?? 0,
            deviceModel: device.deviceModel,
            cpuCores: device.cpuCores,
            appBuild: TALOS_APP_BUILD,
        })
        tuning.value = { running: false, ok: esito.ok, summary: esito.summary }
        // La misura cambia le righe del motore: si rilegge, invece di lasciare
        // a schermo numeri che la misura ha appena smentito.
        await runScan()
    } catch (failure) {
        tuning.value = {
            running: false,
            ok: false,
            summary: failure instanceof Error ? failure.message : String(failure),
        }
    }
}

async function copyReport(): Promise<void> {
    copyError.value = null
    const report = buildTalosDiagnosticsReport({
        buildId: buildId.value,
        platform: Capacitor.isNativePlatform() ? Capacitor.getPlatform() : 'web',
        rows: rows.value,
        issues: issues.value,
        traces: traces.value,
        diagnosticsEnabled: settings.state.shell.debug_diagnostics === true,
    })
    const payload = JSON.stringify(report, null, 2)
    // Android's clipboard has no size limit of its own, but it crosses Binder,
    // whose transaction buffer is ~1MB SHARED across the process — an oversized
    // clip is an uncaught crash, not a graceful failure. A properly bounded
    // report lands in single-digit KB, so this ceiling should never be met; if
    // it is, that is the bug worth knowing about.
    if (payload.length > 64_000) {
        copyError.value = t('doctor.reportTooLarge')
        return
    }
    try {
        await writeTalosClipboardText(payload)
        copied.value = true
        // No toast of our own: from Android 13 the system shows its own
        // clipboard confirmation, and Android's docs ask apps not to double it.
        if (copyTimer !== null) clearTimeout(copyTimer)
        copyTimer = setTimeout(() => { copied.value = false }, 2_000)
    } catch {
        copyError.value = t('doctor.clipboardFailed')
    }
}

function millis(value: number): string {
    return value >= 1_000 ? `${(value / 1_000).toFixed(1)}s` : `${Math.round(value)}ms`
}

async function scan(): Promise<void> {
    scanning.value = true
    const collected: DoctorRow[] = []
    const native = Capacitor.isNativePlatform()
    collected.push({
        id: 'platform',
        label: t('doctor.platform'),
        value: native ? t('doctor.nativePlatform', { platform: Capacitor.getPlatform() }) : t('doctor.webPreview'),
        ok: true,
    })

    const storage = talosStorageDoctorRow({
        native,
        status: controller.chat.state.persistenceStatus,
        error: controller.chat.state.persistenceError,
    })
    // I-09: only shown when the lock did NOT fully engage. A healthy lock is
    // already implied by the rest of the screen, and this row exists to be
    // noticed — carrying it permanently would teach people to skip it.
    const lock = talosLockDoctorRow(talosDatabaseLockState(), talosDatabaseLockFailure())
    if (!lock.ok) collected.push({ ...lock, label: t('doctor.lock'), value: t('doctor.lockRecoveryRequired') })
    const storageStatus = controller.chat.state.persistenceStatus
    const storageError = controller.chat.state.persistenceError
    const storageHint = storageStatus !== 'error'
        ? ''
        : /No available connection for database/i.test(storageError ?? '')
            ? t('doctor.storageConnectionClosed')
            : /TALOS_(?:CHAT_)?DB_KEY_LOCKED/i.test(storageError ?? '')
                ? t('doctor.storageUnlockRequired')
                : t('doctor.storageRetry')
    collected.push({
        ...storage,
        label: t('doctor.storage'),
        value: t('doctor.storageValue', {
            engine: t(native ? 'doctor.storageNative' : 'doctor.storageWeb'),
            status: t(`doctor.storage${storageStatus.charAt(0).toUpperCase()}${storageStatus.slice(1)}`),
            hint: storageHint,
        }),
    })

    const dictation = await talosWithTimeout(talosDictationDiagnostics(), 12000, 'TALOS_DOCTOR_SPEECH').catch(() => null)
    // Owner deep-debug: the build stamp is its OWN row — the single fact that
    // tells us which APK is running (a stale build was the whole "bug in R2").
    collected.push({
        id: 'build',
        label: t('doctor.build'),
        value: dictation?.buildId ?? t('doctor.unknown'),
        ok: true,
    })
    collected.push({
        id: 'speech',
        label: t('doctor.speech'),
        value: dictation
            ? t('doctor.speechValue', {
                plugin: t(dictation.pluginLoaded ? 'doctor.loaded' : 'doctor.missing'),
                recognizer: t(dictation.available === null
                    ? 'doctor.unknown'
                    : dictation.available ? 'doctor.available' : 'doctor.unavailable'),
                error: dictation.error
                    ? ` · ${dictation.error}`
                    : settings.state.shell.debug_diagnostics ? ` · ${dictation.trace}` : '',
            })
            : t('doctor.probeFailed'),
        ok: Boolean(dictation?.pluginLoaded && dictation.available !== false && !dictation.error),
    })

    const biometric = await talosWithTimeout(biometricUnlockAvailable(), 5000, 'TALOS_DOCTOR_BIOMETRIC').catch(() => false)
    collected.push({
        id: 'biometrics',
        label: t('doctor.biometrics'),
        value: biometric ? t('doctor.available') : t('doctor.unavailableDevice'),
        ok: true,
    })

    let shareOk = false
    try {
        const { Share } = await talosWithTimeout(import('@capacitor/share'), 5000, 'TALOS_DOCTOR_SHARE')
        shareOk = (await talosWithTimeout(Share.canShare(), 5000, 'TALOS_DOCTOR_SHARE')).value
    } catch { shareOk = false }
    collected.push({
        id: 'share',
        label: t('doctor.share'),
        value: shareOk ? t('doctor.available') : t('doctor.unavailableShare'),
        ok: true,
    })

    collected.push({
        id: 'network',
        label: t('doctor.network'),
        value: navigator.onLine ? t('doctor.online') : t('doctor.offlineLocal'),
        ok: true,
    })

    /**
     * ⭐ Il motore locale, con tutto ciò che si misura da stamattina.
     *
     * Owner 2026-08-06: «dobbiamo espandere il doctor con funzioni diagnostiche
     * avanzate, soprattutto per i modelli locali». La prova che serviva era
     * arrivata poche ore prima dal suo registro: 111 secondi prima della prima
     * parola e 195 millisecondi ai giri successivi dello stesso invio. Tutti i
     * numeri per spiegarlo esistevano già e non erano leggibili da nessuna
     * parte — e una misura che nessuno può leggere è una misura non presa.
     *
     * In fondo e non in cima: chi apre il Doctor per un problema di rete o di
     * archivio non deve attraversare dodici righe sul motore. Chi lo apre per il
     * motore, invece, sa già cosa sta cercando.
     */
    for (const row of await talosLocalEngineDoctorRows().catch(() => [])) {
        collected.push({ id: row.id, label: t(row.labelKey), value: row.value, ok: row.ok })
    }

    /*
     * ⛔ L'agente: la catena, il piano, e il conto che ha fatto nascere A8.
     *
     * Owner 2026-08-07, direttiva permanente: ogni cosa nuova si aggancia al
     * Doctor. Qui serve piu' che altrove, perche' le regole del piano e della
     * trifecta sono INVISIBILI quando funzionano — si notano solo quando
     * sbagliano, e a quel punto non c'e' modo di sapere perche'.
     *
     * I valori possono essere chiavi di traduzione (`doctor.agent.*`) oppure
     * numeri gia' pronti: `t()` su una stringa che non e' una chiave
     * restituisce la stringa, quindi la stessa riga serve entrambi i casi.
     */
    const { talosAgentPlanDoctorRows } = await import('@/services/agentPlanDoctor')
    const agente = await talosAgentPlanDoctorRows({
        sessionId: controller.chat.activeSession.value?.id ?? null,
        scope: settings.state.shell?.plan_scope ?? 'turn',
    }).catch(() => [])
    for (const row of agente) {
        collected.push({ id: row.id, label: t(row.labelKey), value: t(row.value), ok: row.ok })
    }

    rows.value = collected
    issues.value = talosDeviceIssues()
}

/**
 * The switch and the issue log now live inside the scanned area, so a scan that
 * never settles would take them with it. `finally`, always: a probe that throws
 * must cost its own row, not the whole station.
 */
async function runScan(): Promise<void> {
    try {
        await scan()
    }
    /*
     * ⛔⛔ IL `catch` MANCAVA, e il commento qui sopra prometteva già che ci
     * fosse: «una sonda che lancia deve costare la sua riga, non tutta la
     * stazione». `try/finally` senza `catch` NON ferma il lancio — spegne la
     * rotellina e rilancia.
     *
     * Conseguenza misurata: `scan()` cade a metà, `rows` non viene mai
     * assegnato, e la Diagnostica resta **vuota e muta**. La stazione il cui
     * mestiere è dirti cosa non va diventa l'unica che non lo dice.
     *
     * Trovato il 2026-08-10 dalle rejection della suite (compito #57): sei da
     * questo file, tutte `Cannot read properties of undefined (reading
     * 'value')` dentro `scan`, tutte cadute nel vuoto perché nessuno aspettava
     * la promessa di `onMounted`.
     *
     * ⇒ Il guasto diventa una RIGA, con il suo motivo dentro. Le righe già
     * raccolte restano: mezza diagnosi con un guasto dichiarato è più utile di
     * una schermata bianca.
     */
    catch (guasto: unknown) {
        const motivo = guasto instanceof Error && guasto.message ? guasto.message : String(guasto)
        rows.value = [
            ...rows.value,
            {
                id: 'doctor-scan-failed',
                label: t('doctor.scanFailedLabel'),
                value: motivo.slice(0, 160),
                ok: false,
            },
        ]
    }
    finally {
        scanning.value = false
    }
}

onMounted(runScan)
onBeforeUnmount(() => { if (copyTimer !== null) clearTimeout(copyTimer) })
</script>

<template>
    <div class="flex min-h-full flex-col gap-3 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3" data-testid="talos-doctor-screen">
        <p class="flex items-center gap-2 text-xs leading-5 text-[var(--talos-muted)]">
            <Stethoscope class="size-4 text-[var(--talos-accent)]" aria-hidden="true" />
            {{ t('doctor.intro') }}
        </p>

        <p v-if="scanning" role="status" class="flex items-center gap-2 py-6 text-sm text-[var(--talos-muted)]">
            <Activity class="size-4 animate-pulse text-[var(--talos-accent)]" aria-hidden="true" />
            {{ t('doctor.scanning') }}
        </p>

        <!-- The one line that lets a healthy user leave without reading. -->
        <p
            v-if="!scanning && verdict.message"
            data-testid="talos-doctor-verdict"
            role="status"
            class="flex items-center gap-2 rounded-2xl border px-3 py-2.5 text-sm font-semibold"
            :class="verdict.ok
                ? 'border-[var(--talos-border)] text-[var(--talos-success,#3f9d6b)]'
                : 'border-[var(--talos-danger,#dc5b5b)] text-[var(--talos-danger,#dc5b5b)]'"
        >
            <CircleCheck v-if="verdict.ok" class="size-4 shrink-0" aria-hidden="true" />
            <CircleX v-else class="size-4 shrink-0" aria-hidden="true" />
            {{ verdict.message }}
        </p>

        <TalosThemedTabs
            v-if="!scanning"
            class="flex min-w-0 flex-col gap-3"
            surface="doctor"
            :model-value="activeSection"
            :aria-label="t('doctor.diagnosticsSections')"
            @update:model-value="chooseSection"
        >
            <!-- STATUS -->
            <TabsContent value="status" class="talos-motion-tab-panel flex flex-col gap-2 outline-none">
                <ul v-if="split.problems.length" class="flex flex-col gap-2">
                    <li
                        v-for="row in split.problems"
                        :key="row.id"
                        data-testid="talos-doctor-row"
                        :data-doctor-id="row.id"
                        class="flex items-start gap-2 rounded-2xl border border-[var(--talos-danger,#dc5b5b)] bg-[var(--talos-panel)]/70 p-3"
                    >
                        <CircleX class="mt-0.5 size-4 shrink-0 text-[var(--talos-danger,#dc5b5b)]" aria-hidden="true" />
                        <div class="min-w-0">
                            <div class="text-sm font-semibold text-[var(--talos-text)]">{{ row.label }}</div>
                            <p class="mt-0.5 text-xs leading-5 text-[var(--talos-muted)]">{{ row.value }}</p>
                        </div>
                    </li>
                </ul>

                <div v-if="split.passing.length" class="overflow-hidden rounded-2xl border border-[var(--talos-border)]">
                    <h3>
                        <button
                            type="button"
                            data-testid="talos-doctor-passing-toggle"
                            :aria-expanded="showPassing"
                            aria-controls="talos-doctor-passing"
                            class="talos-pressable flex min-h-touch w-full items-center gap-2 px-3 text-left text-sm text-[var(--talos-text)]"
                            @click="showPassing = !showPassing"
                        >
                            <CircleCheck class="size-4 shrink-0 text-[var(--talos-success,#3f9d6b)]" aria-hidden="true" />
                            {{ t(etichettaPiega.key, { count: etichettaPiega.count ?? 0 }) }}
                            <ChevronDown class="ml-auto size-4 transition-transform" :class="showPassing ? '' : '-rotate-90'" aria-hidden="true" />
                        </button>
                    </h3>
                    <ul v-show="showPassing" id="talos-doctor-passing" class="divide-y divide-[var(--talos-border)] border-t border-[var(--talos-border)]">
                        <li
                            v-for="row in split.passing"
                            :key="row.id"
                            data-testid="talos-doctor-row"
                            :data-doctor-id="row.id"
                            class="px-3 py-2"
                        >
                            <div class="text-sm text-[var(--talos-text)]">{{ row.label }}</div>
                            <p class="mt-0.5 text-xs leading-5 text-[var(--talos-muted)]">{{ row.value }}</p>
                        </li>
                    </ul>
                </div>

            </TabsContent>

            <!-- DATA -->
            <TabsContent value="data" class="talos-motion-tab-panel flex flex-col gap-2 outline-none">
                <p v-if="!settings.state.shell.debug_diagnostics" data-testid="talos-doctor-timings-off" class="rounded-2xl border border-dashed border-[var(--talos-border)] px-3 py-6 text-center text-sm text-[var(--talos-muted)]">
                    {{ t('doctor.timingsOff') }}
                </p>
                <p v-else-if="!traces.length" class="rounded-2xl border border-dashed border-[var(--talos-border)] px-3 py-6 text-center text-sm text-[var(--talos-muted)]">
                    {{ t('doctor.noSends') }}
                </p>
                <template v-else>
                    <div
                        v-for="(trace, index) in traces"
                        :key="index"
                        data-testid="talos-doctor-trace"
                        class="rounded-2xl border border-[var(--talos-border)] bg-[var(--talos-panel)]/70 p-3"
                    >
                        <div class="flex items-center gap-2">
                            <Timer class="size-4 shrink-0 text-[var(--talos-accent)]" aria-hidden="true" />
                            <span class="text-sm font-semibold text-[var(--talos-text)]">{{ millis(trace.clockSuspect && trace.wallDurationMs !== null ? trace.wallDurationMs : trace.durationMs) }}</span>
                            <span class="min-w-0 truncate text-xs text-[var(--talos-muted)]">{{ trace.provider }} · {{ trace.model }}</span>
                            <span v-if="trace.outcome !== 'ok'" class="ml-auto shrink-0 text-2xs uppercase text-[var(--talos-danger,#dc5b5b)]">{{ trace.outcome }}</span>
                        </div>
                        <!-- The device slept, or the clock was corrected: this
                             duration is not a measurement. Saying so beats a
                             confident wrong number. -->
                        <p v-if="trace.clockSuspect" class="mt-1 text-2xs leading-4 text-[var(--talos-muted)]">
                            {{ t('doctor.clocksDisagree') }}
                        </p>
                        <ul class="mt-2 flex flex-col gap-1">
                            <li v-for="(round, roundIndex) in trace.rounds" :key="roundIndex" class="rounded-xl bg-[var(--talos-active)] px-2 py-1.5">
                                <div class="flex flex-wrap items-center gap-x-2 text-xs text-[var(--talos-text)]">
                                    <span>{{ t('doctor.round', { count: roundIndex + 1, duration: millis(round.durationMs) }) }}</span>
                                    <span v-if="round.timeToFirstChunkMs !== null" class="text-[var(--talos-muted)]">
                                        {{ t('doctor.firstWord', { duration: millis(round.timeToFirstChunkMs) }) }}
                                    </span>
                                </div>
                                <div v-if="round.tools.length" class="mt-1 flex flex-col gap-0.5">
                                    <span
                                        v-for="(tool, toolIndex) in round.tools"
                                        :key="toolIndex"
                                        class="font-mono text-2xs text-[var(--talos-muted)]"
                                    >
                                        {{ tool.ok ? '+' : 'x' }} {{ tool.name }} · {{ millis(tool.durationMs) }}<template v-if="tool.waitedForConsentMs">{{ t('doctor.waitingForYou', { duration: millis(tool.waitedForConsentMs) }) }}</template><template v-if="tool.errorCode"> · {{ tool.errorCode }}</template>
                                    </span>
                                    <!-- The diagnosis the owner is after: "one
                                         after another" means his provider asked
                                         for one tool per turn, so the
                                         concurrency has nothing to work with. -->
                                    <span class="text-2xs" :class="round.parallel ? 'text-[var(--talos-success,#3f9d6b)]' : 'text-[var(--talos-muted)]'">
                                        {{ t(round.tools.length === 1 ? 'doctor.callCountOne' : 'doctor.callCountMany', { count: round.tools.length }) }}<template v-if="round.tools.length > 1">, {{ t(round.parallel ? 'doctor.runTogether' : 'doctor.oneAfterAnother') }}</template>
                                    </span>
                                </div>
                            </li>
                        </ul>
                    </div>
                    <button
                        type="button"
                        class="talos-pressable min-h-touch rounded-xl border border-[var(--talos-border)] px-3 text-sm text-[var(--talos-muted)]"
                        @click="controller.clearTraces()"
                    >
                        {{ t('doctor.clearTimings') }}
                    </button>
                </template>
            </TabsContent>

            <!-- ADVANCED -->
            <TabsContent value="advanced" class="talos-motion-tab-panel flex flex-col gap-2 outline-none">
                <div class="flex items-start justify-between gap-3 rounded-xl border border-[var(--talos-border)] px-3 py-2.5">
                    <span class="min-w-0">
                        <span class="block text-sm text-[var(--talos-text)]">{{ t('doctor.showTechnicalDetail') }}</span>
                        <span class="mt-1 block text-2xs leading-4 text-[var(--talos-muted)]">
                            {{ t('doctor.technicalDetailBody') }}
                        </span>
                    </span>
                    <TalosThemedSwitch
                        class="mt-1"
                        data-testid="talos-debug-diagnostics"
                        :aria-label="t('doctor.showTechnicalDetailAria')"
                        :model-value="settings.state.shell.debug_diagnostics"
                        @update:model-value="toggleDiagnostics"
                        @click.stop
                    />
                </div>

                <!-- F5.1: recent device issues (fenced timeouts, swallowed native
                     errors) — the evidence channel for device-only failures. -->
                <section v-if="issues.length">
                    <h3 class="px-1 pb-1 text-xs font-semibold text-[var(--talos-muted)]">{{ t('doctor.recentIssues') }}</h3>
                    <ul class="flex flex-col gap-1">
                        <li
                            v-for="(issue, index) in issues"
                            :key="index"
                            data-testid="talos-doctor-issue"
                            class="rounded-xl border border-[var(--talos-border)] bg-[var(--talos-panel)]/70 p-2 font-mono text-2xs leading-4 text-[var(--talos-muted)]"
                        >
                            <!-- The repeat count is the difference between "it
                                 happened" and "it is happening thirty times a
                                 minute", and that is usually the diagnosis. -->
                            {{ issue.at.slice(11, 19) }} · {{ issue.tag }}<template v-if="issue.count > 1"> · ×{{ issue.count }}</template> · {{ issue.detail }}
                        </li>
                    </ul>
                </section>

                <p class="px-1 font-mono text-2xs text-[var(--talos-muted)]">{{ t('doctor.buildLabel', { build: buildId }) }}</p>
            </TabsContent>
        </TalosThemedTabs>

        <p class="mt-1 text-2xs leading-4 text-[var(--talos-muted)]">
            {{ t('doctor.reportPrivacy') }}
        </p>
        <button
            type="button"
            data-testid="talos-doctor-copy"
            class="talos-pressable flex min-h-touch w-full items-center justify-center gap-2 rounded-xl bg-[var(--talos-accent)] px-3 text-sm font-semibold text-[var(--talos-accent-contrast,#000)]"
            @click="copyReport"
        >
            <ClipboardCopy class="size-4" aria-hidden="true" />
            {{ copied ? t('common.copied') : t('doctor.copyDiagnostics') }}
        </button>
        <button
            type="button"
            data-testid="talos-doctor-tune-threads"
            :disabled="tuning.running"
            class="talos-pressable mt-2 flex min-h-touch w-full items-center justify-center gap-2 rounded-xl border border-[var(--talos-border)] bg-[var(--talos-panel)] px-3 text-sm font-semibold text-[var(--talos-text)] disabled:opacity-60"
            @click="measureThreads"
        >
            {{ tuning.running ? t('doctor.threadTuningRunning') : t('doctor.threadTuning') }}
        </button>
        <p class="text-2xs leading-4 text-[var(--talos-muted)]">{{ t('doctor.threadTuningHint') }}</p>
        <p
            v-if="tuning.summary"
            data-testid="talos-doctor-tune-threads-result"
            aria-live="polite"
            class="text-xs"
            :class="tuning.ok ? 'text-[var(--talos-text)]' : 'text-[var(--talos-danger,#dc5b5b)]'"
        >{{ tuning.summary }}</p>
        <p aria-live="polite" class="sr-only">{{ copied ? t('doctor.diagnosticsCopied') : '' }}</p>
        <p v-if="copyError" role="alert" class="text-xs text-[var(--talos-danger,#dc5b5b)]">{{ copyError }}</p>


    </div>
</template>
