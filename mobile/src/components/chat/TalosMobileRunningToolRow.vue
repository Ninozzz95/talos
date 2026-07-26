<script setup lang="ts">
import { computed } from 'vue'
import TalosMobileTraceRow from '@/components/chat/TalosMobileTraceRow.vue'
import { talosElapsedLabel, useTalosElapsed } from '@/composables/useTalosElapsed'

/**
 * One running tool, with how long it has been running.
 *
 * Owner 2026-07-26: "metti il tempo che è passato in secondi … dei tool". Its
 * own component precisely so it has its OWN clock — a shared timer started when
 * the round began would report the same number for a search that finished
 * instantly and a page fetch still hanging thirty seconds later, which is the
 * one distinction worth making.
 *
 * The clock counts from mount, and the row is keyed by tool and argument, so
 * mount is when that call started.
 */
defineProps<{
    label: string
}>()

const elapsed = useTalosElapsed()
const elapsedLabel = computed(() => talosElapsedLabel(elapsed.value))
</script>

<template>
    <TalosMobileTraceRow
        :label="`${label}…`"
        :detail="elapsedLabel"
        live
        :interactive="false"
    >
        <template #icon>
            <slot name="icon" />
        </template>
    </TalosMobileTraceRow>
</template>
