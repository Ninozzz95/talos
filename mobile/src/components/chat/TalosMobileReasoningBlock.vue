<script setup lang="ts">
import { computed } from 'vue'
import { Brain } from '@lucide/vue'
import { talosElapsedLabel, useTalosElapsed } from '@/composables/useTalosElapsed'
import { useSettingsStore } from '@/stores/settings'
const props = defineProps<{ reasoning: string; live?: boolean }>()
const trimmed = computed(() => /\S/.test(props.reasoning))
const elapsed = useTalosElapsed()
const elapsedLabel = computed(() => props.live ? talosElapsedLabel(elapsed.value) : '')
/* J3-bis (owner «Come il desktop», A14): «Mostra ragionamento» spento ⇒ solo la riga, anche nelle chat vecchie; il testo non si apre */
const settings = useSettingsStore()
const mostra = computed(() => settings.state.shell.show_reasoning !== false)
</script>

<template>
    <!-- Fase 4: il vecchio foglio conteneva solo questo testo e questo tempo. -->
    <details v-if="trimmed && mostra" class="advanced reasoning" data-testid="talos-reasoning-block">
        <summary data-testid="talos-reasoning-toggle" class="min-h-touch">
            <span aria-hidden="true"><Brain class="size-3.5" /></span>
            <span>{{ live ? $t('chat.reasoningLive') : $t('chat.reasoning') }}</span>
            <small v-if="elapsedLabel" data-testid="talos-reasoning-elapsed">{{ elapsedLabel }}</small>
        </summary>
        <p data-testid="talos-reasoning-text" class="help whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{{ reasoning }}</p>
    </details>
    <div v-else-if="trimmed" class="advanced reasoning" data-testid="talos-reasoning-block" data-chiuso="true">
        <div class="min-h-touch flex items-center gap-2">
            <span aria-hidden="true"><Brain class="size-3.5" /></span>
            <span>{{ live ? $t('chat.reasoningLive') : $t('chat.reasoning') }}</span>
            <small v-if="elapsedLabel" data-testid="talos-reasoning-elapsed">{{ elapsedLabel }}</small>
        </div>
    </div>
</template>
