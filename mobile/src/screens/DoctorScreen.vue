<script setup lang="ts">
/**
 * F5 station — Doctor: honest, offline device readiness report. Every row is
 * a REAL probe (no invented tiers): platform, storage engine + persistence
 * state, speech recognizer, biometrics, share bridge, network reachability.
 */
import { onMounted, ref } from 'vue'
import { Activity, CircleCheck, CircleX, Stethoscope } from '@lucide/vue'
import { Capacitor } from '@capacitor/core'
import { useChatController } from '@/stores/chatController'
import { useSettingsStore } from '@/stores/settings'
import { talosDictationDiagnostics } from '@/services/dictation'
import { talosDeviceIssues, talosWithTimeout, type TalosDeviceIssue } from '@/lib/talosDeviceLog'
import { biometricUnlockAvailable } from '@/services/appLock'

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
    void settings.setShell({ debug_diagnostics: (event.target as HTMLInputElement).checked })
}

const rows = ref<DoctorRow[]>([])
const scanning = ref(true)
const issues = ref<readonly TalosDeviceIssue[]>([])

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
    scanning.value = false
}

onMounted(scan)
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

        <ul v-else class="flex flex-col gap-2">
            <li
                v-for="row in rows"
                :key="row.id"
                data-testid="talos-doctor-row"
                :data-doctor-id="row.id"
                class="flex items-start gap-2 rounded-2xl border border-[var(--talos-border)] bg-[var(--talos-panel)]/70 p-3"
            >
                <CircleCheck v-if="row.ok" class="mt-0.5 size-4 shrink-0 text-[var(--talos-success,#3f9d6b)]" aria-hidden="true" />
                <CircleX v-else class="mt-0.5 size-4 shrink-0 text-[var(--talos-danger,#dc5b5b)]" aria-hidden="true" />
                <div class="min-w-0">
                    <div class="text-sm font-semibold text-[var(--talos-text)]">{{ row.label }}</div>
                    <p class="mt-0.5 text-xs leading-5 text-[var(--talos-muted)]">{{ row.value }}</p>
                </div>
            </li>
        </ul>

        <!-- F5.1: recent device issues (fenced timeouts, swallowed native
             errors) — the evidence channel for device-only failures. -->
        <section v-if="issues.length" class="mt-2">
            <h3 class="px-1 pb-1 text-xs font-semibold uppercase tracking-wide text-[var(--talos-muted)]">Recent issues</h3>
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

        <section class="mt-4">
            <label class="flex items-start justify-between gap-3 rounded-xl border border-[var(--talos-border)] px-3 py-2.5">
                <span class="min-w-0">
                    <span class="block text-sm text-[var(--talos-text)]">Show technical detail in errors</span>
                    <span class="mt-1 block text-2xs leading-4 text-[var(--talos-muted)]">
                        Adds the internal code beside the message when something fails — useful when
                        reporting a problem, noise otherwise. What TALOS tells you happened does not
                        change either way.
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
        </section>
    </div>
</template>
