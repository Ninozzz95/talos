<script setup lang="ts">
import { computed, defineAsyncComponent } from 'vue'
import TalosMobileEnhancerSetup from '@/components/chat/TalosMobileEnhancerSetup.vue'
import type { TalosPromptEnhancerDepth } from '@/lib/chat/promptEnhancerDepth'
import TalosLineLoader from '@/components/brand/TalosLineLoader.vue'
import TalosMobileComposerSheet from '@/components/chat/TalosMobileComposerSheet.vue'
import type { TalosMobilePromptEnhancementResult } from '@/lib/chat/promptEnhancement'

const TalosMobilePromptEnhancerPopover = defineAsyncComponent(
    () => import('@/components/chat/TalosMobilePromptEnhancerPopover.vue'),
)

/**
 * F4-#26 — dedicated "Improve prompt" bottom drawer: the whole enhancement
 * journey (progress → error → reviewable result with Insert/Replace/Cancel)
 * in one organized sheet. The decision buttons only EMIT — the parent's state
 * transition is what dismisses the drawer, exactly like the old popover.
 */
const props = defineProps<{
    enhancing: boolean
    error: string
    result: TalosMobilePromptEnhancementResult | null
    modelTitle: string
    /**
     * Le scelte da fare PRIMA di partire — owner 2026-08-04.
     *
     * Il drawer apriva e partiva: nessuno poteva dire con quale modello, con
     * quanto ragionamento, o quanto riscrivere. Ora la prima cosa che si vede
     * e' la domanda, e il lavoro comincia quando si risponde.
     */
    depth: TalosPromptEnhancerDepth
    model: string | null
    effort: string
    models: readonly { id: string, label: string, provider: string, efforts: readonly string[] }[]
}>()

const emit = defineEmits<{
    close: []
    cancel: []
    insert: []
    replace: []
    start: []
    'update:depth': [value: TalosPromptEnhancerDepth]
    'update:model': [value: string | null]
    'update:effort': [value: string]
}>()

/**
 * Si torna alla domanda quando non c'e' niente da guardare.
 *
 * Un pannello di scelte che resta sotto un risultato invita a rifare la stessa
 * cosa; uno che sparisce mentre si lavora smette di essere rumore.
 */
const setup = computed(() => !props.enhancing && !props.error && !props.result)
</script>

<template>
    <TalosMobileComposerSheet :title="$t('chat.promptEnhancement')" testid="talos-enhancer-drawer" @close="emit('close')">
        <TalosMobileEnhancerSetup
            v-if="setup"
            :depth="depth"
            :model="model"
            :effort="effort"
            :models="models"
            @update:depth="(value) => emit('update:depth', value)"
            @update:model="(value) => emit('update:model', value)"
            @update:effort="(value) => emit('update:effort', value)"
            @start="emit('start')"
        />
        <div v-else aria-live="polite" class="pb-2">
            <!-- F5-#30 (owner): modern TALOS loading — the boot-logo line
                 loader carries the wait, the text stays as the caption. -->
            <div
                v-if="enhancing"
                data-testid="talos-mobile-enhancer-status"
                role="status"
                class="flex flex-col items-center gap-3 rounded-xl border border-[var(--talos-border,var(--border))] bg-[var(--talos-card,var(--popover))] px-3 py-6 text-sm text-[var(--talos-muted,var(--muted-foreground))]"
            >
                <TalosLineLoader :width="72" />
                {{ $t('chat.improvingWithModel', { model: modelTitle }) }}
            </div>
            <div
                v-else-if="error"
                data-testid="talos-mobile-enhancer-error"
                role="alert"
                class="rounded-md border border-[var(--talos-danger,#dc5b5b)] bg-[var(--talos-card,var(--popover))] px-3 py-3 text-sm text-[var(--talos-danger,#dc5b5b)]"
            >
                {{ error }}
            </div>
            <TalosMobilePromptEnhancerPopover
                v-else-if="result"
                :result="result"
                @cancel="emit('cancel')"
                @insert="emit('insert')"
                @replace="emit('replace')"
            />
        </div>
    </TalosMobileComposerSheet>
</template>
