<script setup lang="ts">
import { ArrowDown } from '@lucide/vue'
import Button from '../../ui/Button.vue'

defineProps<{ unseenUpdates: number; composerHeight: number }>()

const emit = defineEmits<{ returnToLatest: [] }>()
</script>

<template>
    <Button
        type="button"
        size="sm"
        data-testid="talos-live-edge-control"
        class="fixed bottom-[calc(var(--talos-composer-height,168px)+2rem)] left-1/2 z-[80] -translate-x-1/2 shadow-lg"
        :style="{ '--talos-composer-height': `${composerHeight}px` }"
        aria-label="Return to latest"
        @click="emit('returnToLatest')"
    >
        <ArrowDown class="h-4 w-4" />
        Return to latest
        <span class="rounded bg-black/15 px-1.5 py-0.5 text-[10px]">{{ unseenUpdates }}</span>
    </Button>
</template>
