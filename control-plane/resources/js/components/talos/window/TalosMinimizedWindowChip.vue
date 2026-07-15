<script setup lang="ts">
import { RotateCcw, X } from '@lucide/vue'
import Button from '../../ui/Button.vue'
import type { TalosWindowActionFault } from '../../../composables/useTalosWindowMotion'

defineProps<{
    id: string
    title: string
    closeFault: TalosWindowActionFault | null
}>()

const emit = defineEmits<{
    restore: [event: MouseEvent]
    close: []
    retryClose: []
}>()
</script>

<template>
    <div
        role="group"
        :aria-label="`${title} minimized window controls`"
        class="pointer-events-auto flex min-w-0 flex-col items-start gap-1"
    >
        <div class="inline-flex overflow-hidden rounded-md border border-[var(--talos-border)] bg-[var(--talos-card)] shadow">
            <button
                type="button"
                class="min-h-8 px-3 py-2 text-xs font-medium text-[var(--talos-text)] hover:bg-[var(--talos-panel-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--talos-ring)]"
                :aria-label="`Restore ${title}`"
                :data-testid="`talos-restore-window-${id}`"
                @click="emit('restore', $event)"
            >
                {{ title }}
            </button>
            <Button
                type="button"
                variant="ghost"
                size="icon"
                class="h-auto min-h-8 w-9 rounded-none border-l border-[var(--talos-border)] text-[var(--talos-muted)] hover:text-[var(--talos-text)]"
                :aria-label="`Close minimized ${title}`"
                :data-testid="`talos-close-minimized-window-${id}`"
                @click.stop="emit('close')"
            >
                <X class="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
        </div>
        <div
            v-if="closeFault"
            role="alert"
            :data-window-action-fault="closeFault.code"
            class="flex max-w-72 items-center gap-2 rounded-md border border-[var(--talos-danger-border)] bg-[var(--talos-danger-soft)] px-2 py-1.5 text-xs text-[var(--talos-text)] shadow"
        >
            <span class="min-w-0 flex-1">{{ closeFault.message }}</span>
            <Button
                type="button"
                variant="outline"
                size="sm"
                class="shrink-0"
                :aria-label="`Retry closing ${title}`"
                :data-testid="`talos-retry-close-minimized-window-${id}`"
                @click.stop="emit('retryClose')"
            >
                <RotateCcw class="h-3.5 w-3.5" aria-hidden="true" />
                Retry
            </Button>
        </div>
    </div>
</template>
