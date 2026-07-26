<script setup lang="ts">
/**
 * F5 station — Doctor: honest, offline device readiness report. Every row is
 * a REAL probe (no invented tiers): platform, storage engine + persistence
 * state, speech recognizer, biometrics, share bridge, network reachability.
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { TabsContent, TabsList, TabsRoot, TabsTrigger } from 'reka-ui'
import {
    Activity, ChevronDown, CircleCheck, CircleX, ClipboardCopy, Stethoscope, Timer,
} from '@lucide/vue'
import { Capacitor } from '@capacitor/core'
import { useChatController } from '@/stores/chatController'
import { useSettingsStore } from '@/stores/settings'
import { talosDictationDiagnostics } from '@/services/dictation'
import { talosDeviceIssues, talosWithTimeout, type TalosDeviceIssue } from '@/lib/talosDeviceLog'
import { biometricUnlockAvailable } from '@/services/appLock'
import { writeTalosClipboardText } from '@/services/clipboard'
import {
    TALOS_DOCTOR_SECTIONS,
    splitTalosDoctorRows,
    talosDoctorVerdict,
} from '@/lib/diagnostics/doctorSections'
import { buildTalosDiagnosticsReport } from '@/lib/diagnostics/diagnosticsReport'

interface DoctorRow {
    id: string
    label: string
    value: string
    ok: boolean
}

const controller = useChatController()
const settings = useSettingsStore()

/**
 * Owner 2026-07-26: technical codes belong to whoever is debugging, not to
 * whoever is using the app. Off is what ships; on adds the code that names the
 * step that failed, right beside the plain sentence.
 *
 * It lives in Doctor rather than Appearance because this is the diagnostics
 * station — someone looking for it is already here, and someone who is not will
 * never trip over it by accident.
 */
function toggleDiagnostics(event: Event): void {
    const on = (event.target as HTMLInputElement).checked
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
const activeSection = ref<string>('status')
const showPassing = ref(false)
const copied = ref(false)
let copyTimer: ReturnType<typeof setTimeout> | null = null
const copyError = ref<string | null>(null)

const verdict = computed(() => talosDoctorVerdict(rows.value))
const split = computed(() => splitTalosDoctorRows(rows.value))
const traces = computed(() => controller.traces())
const buildId = computed(() => rows.value.find((row) => row.id === 'build')?.value ?? 'unknown')

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
        copyError.value = 'The report is too large to copy safely. Clear timings and try again.'
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
        copyError.value = 'TALOS could not reach the clipboard on this device.'
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
        label: 'Platform',
        value: native ? `native (${Capacitor.getPlatform()})` : 'web preview',
        ok: true,
    })

    const persistence = controller.chat.state.persistenceStatus
    collected.push({
        id: 'storage',
        label: 'Encrypted local storage',
        value: `${native ? 'SQLCipher native' : 'sql.js web store'} — ${persistence}`,
        ok: persistence === 'ready',
    })

    const dictation = await talosWithTimeout(talosDictationDiagnostics(), 12000, 'TALOS_DOCTOR_SPEECH').catch(() => null)
    // Owner deep-debug: the build stamp is its OWN row — the single fact that
    // tells us which APK is running (a stale build was the whole "bug in R2").
    collected.push({
        id: 'build',
        label: 'Build',
        value: dictation?.buildId ?? 'unknown',
        ok: true,
    })
    collected.push({
        id: 'speech',
        label: 'Speech recognizer',
        value: dictation
            ? `plugin ${dictation.pluginLoaded ? 'loaded' : 'MISSING'} · recognizer ${dictation.available === null ? 'unknown' : dictation.available ? 'available' : 'unavailable'}${dictation.error ? ` · ${dictation.error}` : ''}`
            : 'probe failed',
        ok: Boolean(dictation?.pluginLoaded && dictation.available !== false),
    })

    const biometric = await talosWithTimeout(biometricUnlockAvailable(), 5000, 'TALOS_DOCTOR_BIOMETRIC').catch(() => false)
    collected.push({
        id: 'biometrics',
        label: 'Biometric unlock',
        value: biometric ? 'available' : 'not available on this device',
        ok: true,
    })

    let shareOk = false
    try {
        const { Share } = await talosWithTimeout(import('@capacitor/share'), 5000, 'TALOS_DOCTOR_SHARE')
        shareOk = (await talosWithTimeout(Share.canShare(), 5000, 'TALOS_DOCTOR_SHARE')).value
    } catch { shareOk = false }
    collected.push({
        id: 'share',
        label: 'System share bridge',
        value: shareOk ? 'available' : 'not available (web download fallback)',
        ok: true,
    })

    collected.push({
        id: 'network',
        label: 'Network',
        value: navigator.onLine ? 'online' : 'offline — TALOS stays fully local',
        ok: true,
    })

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
    } finally {
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
            Honest readiness report — every row is a real probe, run on this device, offline.
        </p>

        <p v-if="scanning" role="status" class="flex items-center gap-2 py-6 text-sm text-[var(--talos-muted)]">
            <Activity class="size-4 animate-pulse text-[var(--talos-accent)]" aria-hidden="true" />
            Scanning device capabilities…
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

        <TabsRoot v-if="!scanning" v-model="activeSection" class="flex min-w-0 flex-col gap-3">
            <!-- Fixed, never scrollable; min-h-11 keeps every target over 48dp. -->
            <TabsList
                aria-label="Diagnostics sections"
                class="grid grid-cols-3 gap-1 rounded-xl border border-[var(--talos-border)] bg-[var(--talos-panel)] p-1"
            >
                <TabsTrigger
                    v-for="section in TALOS_DOCTOR_SECTIONS"
                    :key="section.id"
                    :value="section.id"
                    :data-doctor-tab="section.id"
                    class="talos-pressable min-h-11 rounded-lg px-2 text-sm text-[var(--talos-muted)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)] data-[state=active]:bg-[var(--talos-active)] data-[state=active]:font-semibold data-[state=active]:text-[var(--talos-text)]"
                >
                    {{ section.label }}
                </TabsTrigger>
            </TabsList>

            <!-- STATUS -->
            <TabsContent value="status" class="flex flex-col gap-2 outline-none">
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
                            class="talos-pressable flex min-h-11 w-full items-center gap-2 px-3 text-left text-sm text-[var(--talos-text)]"
                            @click="showPassing = !showPassing"
                        >
                            <CircleCheck class="size-4 shrink-0 text-[var(--talos-success,#3f9d6b)]" aria-hidden="true" />
                            {{ split.passing.length }} check{{ split.passing.length === 1 ? '' : 's' }} passed
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
            <TabsContent value="data" class="flex flex-col gap-2 outline-none">
                <p v-if="!settings.state.shell.debug_diagnostics" data-testid="talos-doctor-timings-off" class="rounded-2xl border border-dashed border-[var(--talos-border)] px-3 py-6 text-center text-sm text-[var(--talos-muted)]">
                    Timings are recorded only while <strong>Show technical detail</strong> is on, under
                    Advanced. Nothing is measured — and nothing is paid for — while it is off.
                </p>
                <p v-else-if="!traces.length" class="rounded-2xl border border-dashed border-[var(--talos-border)] px-3 py-6 text-center text-sm text-[var(--talos-muted)]">
                    No sends recorded yet. Ask TALOS something, then come back.
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
                            The two clocks disagree on this send, so the total shown is the wall
                            clock (the one that survives a device sleep). Per-round and per-tool
                            timings come from the monotonic clock and are unaffected.
                        </p>
                        <ul class="mt-2 flex flex-col gap-1">
                            <li v-for="(round, roundIndex) in trace.rounds" :key="roundIndex" class="rounded-xl bg-[var(--talos-active)] px-2 py-1.5">
                                <div class="flex flex-wrap items-center gap-x-2 text-xs text-[var(--talos-text)]">
                                    <span>Round {{ roundIndex + 1 }} · {{ millis(round.durationMs) }}</span>
                                    <span v-if="round.timeToFirstChunkMs !== null" class="text-[var(--talos-muted)]">
                                        first word {{ millis(round.timeToFirstChunkMs) }}
                                    </span>
                                </div>
                                <div v-if="round.tools.length" class="mt-1 flex flex-col gap-0.5">
                                    <span
                                        v-for="(tool, toolIndex) in round.tools"
                                        :key="toolIndex"
                                        class="font-mono text-2xs text-[var(--talos-muted)]"
                                    >
                                        {{ tool.ok ? '+' : 'x' }} {{ tool.name }} · {{ millis(tool.durationMs) }}<template v-if="tool.waitedForConsentMs"> (+{{ millis(tool.waitedForConsentMs) }} waiting for you)</template><template v-if="tool.errorCode"> · {{ tool.errorCode }}</template>
                                    </span>
                                    <!-- The diagnosis the owner is after: "one
                                         after another" means his provider asked
                                         for one tool per turn, so the
                                         concurrency has nothing to work with. -->
                                    <span class="text-2xs" :class="round.parallel ? 'text-[var(--talos-success,#3f9d6b)]' : 'text-[var(--talos-muted)]'">
                                        {{ round.tools.length }} call{{ round.tools.length === 1 ? '' : 's' }}<template v-if="round.tools.length > 1">, {{ round.parallel ? 'run together' : 'one after another' }}</template>
                                    </span>
                                </div>
                            </li>
                        </ul>
                    </div>
                    <button
                        type="button"
                        class="talos-pressable min-h-11 rounded-xl border border-[var(--talos-border)] px-3 text-sm text-[var(--talos-muted)]"
                        @click="controller.clearTraces()"
                    >
                        Clear timings
                    </button>
                </template>
            </TabsContent>

            <!-- ADVANCED -->
            <TabsContent value="advanced" class="flex flex-col gap-2 outline-none">
                <label class="flex items-start justify-between gap-3 rounded-xl border border-[var(--talos-border)] px-3 py-2.5">
                    <span class="min-w-0">
                        <span class="block text-sm text-[var(--talos-text)]">Show technical detail</span>
                        <span class="mt-1 block text-2xs leading-4 text-[var(--talos-muted)]">
                            Adds the internal code beside the message when something fails, and records
                            how long each send took. Useful when reporting a problem, noise otherwise.
                            What TALOS tells you happened does not change either way.
                        </span>
                    </span>
                    <input
                        type="checkbox"
                        role="switch"
                        data-testid="talos-debug-diagnostics"
                        aria-label="Show technical detail in errors"
                        :checked="settings.state.shell.debug_diagnostics"
                        class="mt-1 h-5 w-9 shrink-0 accent-[var(--talos-accent)]"
                        @change="toggleDiagnostics"
                    >
                </label>

                <!-- F5.1: recent device issues (fenced timeouts, swallowed native
                     errors) — the evidence channel for device-only failures. -->
                <section v-if="issues.length">
                    <h3 class="px-1 pb-1 text-xs font-semibold text-[var(--talos-muted)]">Recent issues</h3>
                    <ul class="flex flex-col gap-1">
                        <li
                            v-for="(issue, index) in issues"
                            :key="index"
                            data-testid="talos-doctor-issue"
                            class="rounded-xl border border-[var(--talos-border)] bg-[var(--talos-panel)]/70 p-2 font-mono text-2xs leading-4 text-[var(--talos-muted)]"
                        >
                            {{ issue.at.slice(11, 19) }} · {{ issue.tag }} · {{ issue.detail }}
                        </li>
                    </ul>
                </section>

                <p class="px-1 font-mono text-2xs text-[var(--talos-muted)]">build {{ buildId }}</p>
            </TabsContent>
        </TabsRoot>

        <p class="mt-1 text-2xs leading-4 text-[var(--talos-muted)]">
            The report carries timings, check results, provider and model names and the
            build stamp. It is never given your keys, your messages or your documents — and
            anything key-shaped that reached the device log is scrubbed on the way out.
        </p>
        <button
            type="button"
            data-testid="talos-doctor-copy"
            class="talos-pressable flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[var(--talos-accent)] px-3 text-sm font-semibold text-[var(--talos-accent-contrast,#000)]"
            @click="copyReport"
        >
            <ClipboardCopy class="size-4" aria-hidden="true" />
            {{ copied ? 'Copied' : 'Copy diagnostics' }}
        </button>
        <p aria-live="polite" class="sr-only">{{ copied ? 'Diagnostics copied to the clipboard' : '' }}</p>
        <p v-if="copyError" role="alert" class="text-xs text-[var(--talos-danger,#dc5b5b)]">{{ copyError }}</p>


    </div>
</template>
