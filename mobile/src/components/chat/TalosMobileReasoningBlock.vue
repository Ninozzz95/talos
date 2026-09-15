<script setup lang="ts">
import { computed } from 'vue'
import { Brain } from '@lucide/vue'
import { talosElapsedLabel, useTalosElapsed } from '@/composables/useTalosElapsed'
const props = defineProps<{ reasoning: string; live?: boolean }>()
const trimmed = computed(() => /\S/.test(props.reasoning))
const elapsed = useTalosElapsed()
const elapsedLabel = computed(() => props.live ? talosElapsedLabel(elapsed.value) : '')
</script>

<template>
    <!-- Fase 4: il vecchio foglio conteneva solo questo testo e questo tempo. -->
    <details v-if="trimmed" class="advanced reasoning" data-testid="talos-reasoning-block">
        <summary data-testid="talos-reasoning-toggle" class="min-h-touch">
            <span aria-hidden="true"><Brain class="size-3.5" /></span>
            <span>{{ live ? $t('chat.reasoningLive') : $t('chat.reasoning') }}</span>
            <small v-if="elapsedLabel" data-testid="talos-reasoning-elapsed">{{ elapsedLabel }}</small>
        </summary>
        <p data-testid="talos-reasoning-text" class="help whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{{ reasoning }}</p>
    </details>
</template>
