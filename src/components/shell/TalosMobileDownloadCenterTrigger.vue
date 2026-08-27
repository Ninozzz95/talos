<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { AlertTriangle, Download, Pause, Play, Trash2, X } from '@lucide/vue'
import {
    PopoverContent,
    PopoverPortal,
    PopoverRoot,
    PopoverTrigger,
} from 'reka-ui'
import { useTalosI18n } from '@/i18n'
import { talosFormatBytes, talosTransferCanPause, talosTransferCanResume } from '@/lib/models/presentation'
import type { TalosTransferItem } from '@/services/modelTransfer'
import {
    talosCancelManagedModelTransfer,
    talosModelTransfers,
    talosPauseManagedModelTransfer,
    talosResumeManagedModelTransfer,
    talosRetainModelTransferObserver,
} from '@/stores/modelTransfers'

const { t } = useTalosI18n()
const open = ref(false)
const confirmingCancelId = ref<string | null>(null)
const actingIds = ref(new Set<string>())

const items = computed(() => talosModelTransfers.items)
const visible = computed(() => items.value.length > 0)
const triggerLabel = computed(() => {
    const only = items.value.length === 1 ? items.value[0] : undefined
    if (only) {
        return t('localModels.downloadCenter.openOne', {
            model: modelName(only),
            percent: percent(only),
        })
    }
    return t('localModels.downloadCenter.openMany', { count: items.value.length })
})
const countLabel = computed(() => t(
    items.value.length === 1
        ? 'localModels.downloadCenter.countOne'
        : 'localModels.downloadCenter.countMany',
    { count: items.value.length },
))

let releaseObserver: (() => void) | null = null
onMounted(() => { releaseObserver = talosRetainModelTransferObserver() })
onBeforeUnmount(() => { releaseObserver?.(); releaseObserver = null })

watch(visible, (next) => {
    if (next) return
    open.value = false
    confirmingCancelId.value = null
})

watch(open, (next) => {
    if (!next) confirmingCancelId.value = null
})

function modelName(item: TalosTransferItem): string {
    return item.modelName ?? t('localModels.downloadCenter.unknownModel')
}

function percent(item: TalosTransferItem): number {
    if (item.totalBytes <= 0) return 0
    return Math.max(0, Math.min(100, Math.round(item.haveBytes / item.totalBytes * 100)))
}

function phaseLabel(item: TalosTransferItem): string {
    return t(`localModels.downloadCenter.phases.${item.phase}`)
}

function progressLabel(item: TalosTransferItem): string {
    return `${talosFormatBytes(item.haveBytes)} / ${talosFormatBytes(item.totalBytes)}`
}

function acting(id: string): boolean {
    return actingIds.value.has(id)
}

async function act(id: string, action: () => Promise<{ ok: boolean }>): Promise<void> {
    if (acting(id)) return
    actingIds.value = new Set(actingIds.value).add(id)
    try {
        await action()
    } finally {
        const next = new Set(actingIds.value)
        next.delete(id)
        actingIds.value = next
    }
}

async function pause(id: string): Promise<void> {
    await act(id, () => talosPauseManagedModelTransfer(id))
}

async function resume(id: string): Promise<void> {
    await act(id, () => talosResumeManagedModelTransfer(id))
}

async function cancel(id: string): Promise<void> {
    await act(id, () => talosCancelManagedModelTransfer(id))
    if (confirmingCancelId.value === id) confirmingCancelId.value = null
}
</script>

<template>
    <PopoverRoot v-if="visible" v-model:open="open">
        <PopoverTrigger as-child>
            <button
                type="button"
                data-testid="talos-download-center-trigger"
                :aria-label="triggerLabel"
                class="talos-pressable pointer-events-auto relative inline-flex min-h-touch min-w-touch shrink-0 items-center justify-center rounded-[var(--talos-radius-control)] text-[var(--talos-muted)] hover:bg-[var(--talos-active)] hover:text-[var(--talos-text)]"
            >
                <Download class="size-[var(--talos-icon-size)]" aria-hidden="true" />
                <span
                    class="absolute right-0 top-0 grid min-h-[var(--talos-space-section)] min-w-[var(--talos-space-section)] place-items-center rounded-full bg-[var(--talos-accent)] px-[calc(var(--talos-space-inline)/2)] font-mono text-3xs font-semibold text-[var(--talos-accent-contrast)]"
                    :class="talosModelTransfers.active ? 'motion-safe:animate-pulse' : ''"
                    aria-hidden="true"
                >{{ items.length }}</span>
            </button>
        </PopoverTrigger>

        <PopoverPortal>
            <PopoverContent
                data-testid="talos-download-center-content"
                align="end"
                :side-offset="8"
                :collision-padding="12"
                data-talos-motion-intent="menu-open"
                class="isolate z-[var(--talos-z-app-overlay)] w-[min(24rem,calc(100vw-(var(--talos-space-page)*2)))] overflow-hidden rounded-[var(--talos-radius-card)] border border-[var(--talos-border)] bg-[var(--talos-window-bg)] text-[var(--talos-text)] outline-none"
            >
                <header class="flex min-w-0 items-center gap-[var(--talos-space-inline)] p-[var(--talos-space-card)]">
                    <span class="grid size-[var(--talos-touch-target)] shrink-0 place-items-center rounded-[var(--talos-radius-control)] bg-[var(--talos-active)] text-[var(--talos-accent)]">
                        <Download class="size-[var(--talos-icon-size)]" aria-hidden="true" />
                    </span>
                    <div class="min-w-0 flex-1">
                        <h2 class="talos-title text-sm font-semibold">{{ t('localModels.downloadCenter.title') }}</h2>
                        <p class="text-2xs text-[var(--talos-muted)]">
                            {{ countLabel }}
                        </p>
                    </div>
                    <button
                        type="button"
                        :aria-label="t('common.close')"
                        class="talos-pressable grid min-h-touch min-w-touch place-items-center rounded-[var(--talos-radius-control)] text-[var(--talos-muted)] hover:bg-[var(--talos-active)]"
                        @click="open = false"
                    >
                        <X class="size-[var(--talos-icon-size)]" aria-hidden="true" />
                    </button>
                </header>

                <ul
                    class="max-h-[min(70vh,32rem)] overflow-y-auto overscroll-contain border-t border-[var(--talos-border)]"
                    :aria-label="t('localModels.downloadCenter.title')"
                >
                    <li
                        v-for="item in items"
                        :key="item.id"
                        data-testid="talos-download-center-item"
                        :data-transfer-id="item.id"
                        class="min-w-0 border-b border-[var(--talos-border)] p-[var(--talos-space-card)] last:border-b-0"
                    >
                        <div class="flex min-w-0 items-start gap-[var(--talos-space-inline)]">
                            <div class="min-w-0 flex-1 pt-[calc(var(--talos-space-inline)/2)]">
                                <p class="truncate text-xs font-semibold">{{ modelName(item) }}</p>
                                <p role="status" aria-live="polite" class="mt-[calc(var(--talos-space-inline)/4)] text-2xs text-[var(--talos-muted)]">
                                    {{ phaseLabel(item) }}
                                </p>
                            </div>
                            <div class="flex shrink-0 items-center gap-[calc(var(--talos-space-inline)/2)]">
                                <button
                                    v-if="talosTransferCanPause(item)"
                                    type="button"
                                    data-testid="talos-download-center-pause"
                                    :aria-label="t('localModels.downloadCenter.pauseModel', { model: modelName(item) })"
                                    :disabled="acting(item.id)"
                                    class="talos-pressable grid min-h-touch min-w-touch place-items-center rounded-[var(--talos-radius-control)] bg-[var(--talos-accent)] text-[var(--talos-accent-contrast)] disabled:opacity-50"
                                    @click="pause(item.id)"
                                >
                                    <Pause class="size-[var(--talos-icon-size)]" aria-hidden="true" />
                                </button>
                                <button
                                    v-else-if="talosTransferCanResume(item)"
                                    type="button"
                                    data-testid="talos-download-center-resume"
                                    :aria-label="t('localModels.downloadCenter.resumeModel', { model: modelName(item) })"
                                    :disabled="acting(item.id)"
                                    class="talos-pressable grid min-h-touch min-w-touch place-items-center rounded-[var(--talos-radius-control)] bg-[var(--talos-accent)] text-[var(--talos-accent-contrast)] disabled:opacity-50"
                                    @click="resume(item.id)"
                                >
                                    <Play class="size-[var(--talos-icon-size)]" aria-hidden="true" />
                                </button>
                                <button
                                    type="button"
                                    data-testid="talos-download-center-cancel"
                                    :aria-label="t('localModels.downloadCenter.cancelModel', { model: modelName(item) })"
                                    :disabled="acting(item.id)"
                                    class="talos-pressable grid min-h-touch min-w-touch place-items-center rounded-[var(--talos-radius-control)] border border-[var(--talos-border)] text-[var(--talos-danger)] disabled:opacity-50"
                                    @click="confirmingCancelId = item.id"
                                >
                                    <Trash2 class="size-[var(--talos-icon-size)]" aria-hidden="true" />
                                </button>
                            </div>
                        </div>

                        <div
                            v-if="item.totalBytes > 0"
                            data-testid="talos-download-center-progress"
                            role="progressbar"
                            :aria-label="`${modelName(item)}: ${phaseLabel(item)}`"
                            :aria-valuenow="percent(item)"
                            aria-valuemin="0"
                            aria-valuemax="100"
                            class="mt-[var(--talos-space-inline)] h-[calc(var(--talos-space-inline)/2)] overflow-hidden rounded-full bg-[var(--talos-active)]"
                        >
                            <div
                                class="h-full rounded-full bg-[var(--talos-accent)] transition-[width] duration-[var(--talos-motion-duration-activity-progress)] motion-reduce:transition-none"
                                :style="{ width: `${percent(item)}%` }"
                            />
                        </div>
                        <div class="mt-[var(--talos-space-inline)] flex items-center justify-between gap-[var(--talos-space-inline)] font-mono text-3xs text-[var(--talos-muted)]">
                            <span class="truncate">{{ progressLabel(item) }}</span>
                            <span class="shrink-0">{{ percent(item) }}%</span>
                        </div>

                        <p
                            v-if="!item.networkBound"
                            class="mt-[var(--talos-space-inline)] flex items-start gap-[var(--talos-space-inline)] text-2xs leading-4 text-[var(--talos-muted)]"
                        >
                            <AlertTriangle class="mt-[calc(var(--talos-space-inline)/4)] size-[var(--talos-icon-size)] shrink-0 text-[var(--talos-accent)]" aria-hidden="true" />
                            {{ t('localModels.notNetworkBound') }}
                        </p>
                        <p
                            v-if="item.failure"
                            role="alert"
                            class="mt-[var(--talos-space-inline)] text-2xs text-[var(--talos-danger)]"
                        >
                            {{ t('localModels.downloadCenter.failed') }}: {{ item.failure }}
                        </p>

                        <div
                            v-if="confirmingCancelId === item.id"
                            class="mt-[var(--talos-space-section)] rounded-[var(--talos-radius-control)] border border-[var(--talos-border)] p-[var(--talos-space-control)]"
                        >
                            <p class="text-2xs leading-4 text-[var(--talos-muted)]">
                                {{ t('localModels.downloadCenter.cancelWarning') }}
                            </p>
                            <div class="mt-[var(--talos-space-inline)] grid grid-cols-2 gap-[var(--talos-space-inline)]">
                                <button
                                    type="button"
                                    :aria-label="t('localModels.downloadCenter.keepModel', { model: modelName(item) })"
                                    class="talos-pressable min-h-touch rounded-[var(--talos-radius-control)] border border-[var(--talos-border)] px-[var(--talos-space-control)] text-xs"
                                    @click="confirmingCancelId = null"
                                >{{ t('localModels.downloadCenter.keep') }}</button>
                                <button
                                    type="button"
                                    data-testid="talos-download-center-cancel-confirm"
                                    :aria-label="t('localModels.downloadCenter.confirmCancelModel', { model: modelName(item) })"
                                    :disabled="acting(item.id)"
                                    class="talos-pressable min-h-touch rounded-[var(--talos-radius-control)] border border-[var(--talos-danger-border)] bg-[var(--talos-danger-soft)] px-[var(--talos-space-control)] text-xs font-semibold text-[var(--talos-danger)] disabled:opacity-50"
                                    @click="cancel(item.id)"
                                >{{ t('localModels.downloadCenter.confirmCancel') }}</button>
                            </div>
                        </div>
                    </li>
                </ul>
            </PopoverContent>
        </PopoverPortal>
    </PopoverRoot>
</template>
