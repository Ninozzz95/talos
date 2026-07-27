<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { CircleAlert, CircleCheck, CircleDashed, ShieldCheck } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import {
    talosPermissionAction,
    talosPermissionLabel,
    visibleTalosPermissionRows,
    type TalosPermissionRow,
    type TalosPermissionState,
} from '@/lib/permissions/permissionRows'
import {
    openTalosAppSettings,
    readTalosDeviceState,
    requestTalosMicrophone,
    requestTalosNotifications,
    type TalosDeviceState,
} from '@/services/devicePermissions'

/**
 * What TALOS can ask this device for, why, and where it stands.
 *
 * NOT a copy of the Android permission page. Google's own settings guidance is
 * "avoid replicating preferences available at the device settings level", and
 * of twelve open-source apps surveyed not one ships a management clone — the OS
 * is always the final word, and a second set of switches pretending otherwise
 * is a lie waiting to happen. This screen explains and diagnoses: why each
 * permission exists, the boundary of what TALOS does with it, and a way out to
 * the setting that governs it once asking is no longer possible.
 */
const device = ref<TalosDeviceState>({
    microphone: 'prompt',
    notifications: 'prompt',
    notificationsRuntime: false,
    biometricHardware: false,
})
const busy = ref<string | null>(null)

const rows = computed(() => visibleTalosPermissionRows({
    // Below Android 13 there is no notification permission to show at all.
    notifications: device.value.notificationsRuntime,
    biometricHardware: device.value.biometricHardware,
}))

function stateOf(row: TalosPermissionRow): TalosPermissionState | null {
    if (row.id === 'microphone') return device.value.microphone
    if (row.id === 'notifications') return device.value.notifications
    return null
}

/**
 * Re-read on every return to the app.
 *
 * Android resets permissions for apps left unused for a few months, and the
 * user can revoke one in system settings at any moment. A remembered value
 * would confidently say "Allowed" for something taken away last week.
 */
async function refresh(): Promise<void> {
    device.value = await readTalosDeviceState()
}

function onVisible(): void {
    if (document.visibilityState === 'visible') void refresh()
}

async function act(row: TalosPermissionRow): Promise<void> {
    const state = stateOf(row)
    if (state === null) return
    busy.value = row.id
    try {
        if (talosPermissionAction(state) === 'settings') {
            await openTalosAppSettings(row.id === 'notifications' ? 'notifications' : 'app')
            return
        }
        if (row.id === 'microphone') await requestTalosMicrophone()
        if (row.id === 'notifications') await requestTalosNotifications()
        await refresh()
    } finally {
        busy.value = null
    }
}

onMounted(() => {
    void refresh()
    document.addEventListener('visibilitychange', onVisible)
})
onBeforeUnmount(() => document.removeEventListener('visibilitychange', onVisible))
</script>

<template>
    <section data-testid="talos-settings-privacy" class="flex flex-col gap-3">
        <p class="flex items-start gap-2 text-xs leading-5 text-[var(--talos-muted)]">
            <ShieldCheck class="mt-0.5 size-4 shrink-0 text-[var(--talos-accent)]" aria-hidden="true" />
            TALOS asks for something only when a feature needs it, at the moment you use that
            feature. Android always has the final word — you can change any of these in the
            system settings.
        </p>

        <div
            v-for="row in rows"
            :key="row.id"
            :data-permission-row="row.id"
            class="rounded-2xl border border-[var(--talos-border)] bg-[var(--talos-panel)]/70 p-3"
            role="group"
            :aria-label="stateOf(row) ? `${row.title}, ${talosPermissionLabel(stateOf(row)!)}` : row.title"
        >
            <div class="flex items-center gap-2">
                <CircleCheck
                    v-if="stateOf(row) === 'granted'"
                    class="size-4 shrink-0 text-[var(--talos-success,#3f9d6b)]"
                    aria-hidden="true"
                />
                <CircleAlert
                    v-else-if="stateOf(row) === 'denied'"
                    class="size-4 shrink-0 text-[var(--talos-danger,#dc5b5b)]"
                    aria-hidden="true"
                />
                <CircleDashed v-else class="size-4 shrink-0 text-[var(--talos-muted)]" aria-hidden="true" />
                <span class="text-sm font-semibold text-[var(--talos-text)]">{{ row.title }}</span>
                <!-- The state is TEXT, not colour alone: a badge nobody can read
                     is not a state, and a screen reader gets it from the group's
                     own label. -->
                <span
                    v-if="stateOf(row)"
                    class="ml-auto text-2xs uppercase tracking-wide text-[var(--talos-muted)]"
                    aria-live="polite"
                >{{ talosPermissionLabel(stateOf(row)!) }}</span>
                <span
                    v-else-if="row.kind === 'install'"
                    class="ml-auto text-2xs uppercase tracking-wide text-[var(--talos-muted)]"
                >Granted at install</span>
            </div>

            <p class="mt-1.5 text-xs leading-5 text-[var(--talos-muted)]">{{ row.purpose }}</p>

            <!-- Past a permanent denial the system dialog never opens again, so
                 the only honest button is the one that goes to the setting — with
                 the steps, because no API can deep-link a single toggle. -->
            <template v-if="stateOf(row) === 'denied'">
                <p class="mt-2 text-2xs leading-4 text-[var(--talos-muted)]">
                    To allow it: open the system settings, tap <strong>Permissions</strong>,
                    then turn on <strong>{{ row.title }}</strong>.
                </p>
                <Button
                    type="button"
                    variant="outline"
                    data-testid="talos-permission-settings"
                    class="mt-2 min-h-11 w-full rounded-xl text-sm"
                    :disabled="busy === row.id"
                    @click="act(row)"
                >Open system settings</Button>
            </template>
            <Button
                v-else-if="stateOf(row) && talosPermissionAction(stateOf(row)!) === 'request'"
                type="button"
                variant="outline"
                data-testid="talos-permission-allow"
                class="mt-2 min-h-11 w-full rounded-xl text-sm"
                :disabled="busy === row.id"
                @click="act(row)"
            >Allow</Button>
        </div>
    </section>
</template>
