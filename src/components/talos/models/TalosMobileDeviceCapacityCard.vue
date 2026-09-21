<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Cpu, Gauge, HardDrive, MemoryStick, RefreshCw, ShieldCheck } from '@lucide/vue'
import { useTalosI18n } from '@/i18n'
import { TALOS_STORAGE_RESERVE_BYTES } from '@/lib/models/fit'
import { talosFormatBytes } from '@/lib/models/presentation'
import { talosLocalModels, talosRefreshDeviceCapacity } from '@/stores/localModels'
import { talosLocalEngineStatus, type TalosLocalEngineStatus } from '@/services/localEngine'

const { t } = useTalosI18n()
const measuring = ref(false)
const failed = ref(false)
const engine = ref<TalosLocalEngineStatus | null>(null)

function measuredBytes(value: unknown): string | null {
    return typeof value === 'number' && Number.isFinite(value) && value > 0
        ? talosFormatBytes(value)
        : null
}

const device = computed(() => talosLocalModels.device)
const ram = computed(() => measuredBytes(device.value?.availableRamBytes))
const storage = computed(() => measuredBytes(device.value?.freeStorageBytes))
const reserve = talosFormatBytes(TALOS_STORAGE_RESERVE_BYTES)
const deviceName = computed(() => device.value?.deviceModel?.trim() || t('models.deviceCapacityTitle'))
const engineLabel = computed(() => {
    if (!engine.value) return t('models.measurePending')
    if (!engine.value.available) return t('localModels.engineMissing')
    return t('localModels.engineReady', { backends: engine.value.backends || '—' })
})

async function measure(): Promise<void> {
    measuring.value = true
    failed.value = false
    try {
        await talosRefreshDeviceCapacity()
    } catch {
        failed.value = true
    } finally {
        measuring.value = false
    }
}

onMounted(async () => {
    await Promise.all([
        measure(),
        talosLocalEngineStatus().then((status) => { engine.value = status }).catch(() => undefined),
    ])
})
</script>

<template>
    <article
        data-testid="talos-model-lab-device"
        class="flex min-w-0 flex-col gap-[var(--talos-space-section)] rounded-[var(--talos-radius-card)] border border-[var(--talos-border)] bg-[var(--talos-panel)] p-[var(--talos-space-card)] text-[var(--talos-text)]"
    >
        <header class="flex min-w-0 items-center gap-[var(--talos-space-inline)]">
            <span class="grid size-[var(--talos-touch-target)] shrink-0 place-items-center rounded-[var(--talos-radius-control)] bg-[var(--talos-active)] text-[var(--talos-accent)]">
                <Cpu class="size-[var(--talos-icon-size)]" aria-hidden="true" />
            </span>
            <span class="min-w-0 flex-1">
                <span class="block text-2xs font-semibold uppercase tracking-wide text-[var(--talos-muted)]">{{ t('models.deviceCapacityTitle') }}</span>
                <strong class="block truncate text-sm">{{ deviceName }}</strong>
            </span>
            <button
                type="button"
                data-testid="talos-device-capacity-retry"
                class="talos-pressable inline-flex min-h-touch min-w-touch items-center justify-center rounded-[var(--talos-radius-control)] border border-[var(--talos-border)] text-[var(--talos-muted)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--talos-ring)] disabled:opacity-50"
                :disabled="measuring"
                :aria-label="t('models.measureAgain')"
                @click="measure"
            >
                <RefreshCw class="size-[var(--talos-icon-size)]" :class="{ 'animate-spin': measuring }" aria-hidden="true" />
            </button>
        </header>

        <dl class="grid grid-cols-3 gap-[var(--talos-space-inline)]">
            <div class="min-w-0">
                <dt class="flex items-center gap-[var(--talos-space-inline)] text-3xs text-[var(--talos-muted)]"><MemoryStick class="size-[var(--talos-icon-size)]" aria-hidden="true" />{{ t('models.usableRam') }}</dt>
                <dd class="font-mono text-sm font-semibold tabular-nums">{{ ram ?? t('models.measurePending') }}</dd>
            </div>
            <div class="min-w-0">
                <dt class="flex items-center gap-[var(--talos-space-inline)] text-3xs text-[var(--talos-muted)]"><HardDrive class="size-[var(--talos-icon-size)]" aria-hidden="true" />{{ t('models.allocatableStorage') }}</dt>
                <dd class="font-mono text-sm font-semibold tabular-nums">{{ storage ?? t('models.measurePending') }}</dd>
            </div>
            <div class="min-w-0">
                <dt class="flex items-center gap-[var(--talos-space-inline)] text-3xs text-[var(--talos-muted)]"><ShieldCheck class="size-[var(--talos-icon-size)]" aria-hidden="true" />{{ t('models.safetyReserve') }}</dt>
                <dd class="font-mono text-sm font-semibold tabular-nums">{{ reserve }}</dd>
            </div>
        </dl>

        <p class="flex items-start gap-[var(--talos-space-inline)] font-mono text-3xs text-[var(--talos-muted)]">
            <Gauge class="size-[var(--talos-icon-size)] shrink-0" aria-hidden="true" />
            <span>{{ engineLabel }}</span>
        </p>
        <p v-if="failed" role="alert" class="text-xs text-[var(--talos-danger)]">{{ t('models.measureFailed') }}</p>
    </article>
</template>
