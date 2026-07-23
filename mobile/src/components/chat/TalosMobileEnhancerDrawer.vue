<script setup lang="ts">
import { defineAsyncComponent } from 'vue'
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
defineProps<{
    enhancing: boolean
    error: string
    result: TalosMobilePromptEnhancementResult | null
    modelTitle: string
}>()

const emit = defineEmits<{
    close: []
    cancel: []
    insert: []
    replace: []
}>()
</script>

<template>
    <TalosMobileComposerSheet title="Prompt enhancement" testid="talos-enhancer-drawer" @close="emit('close')">
        <div aria-live="polite" class="pb-2">
            <!-- F5-#30 (owner): modern TALOS loading — the boot-logo line
                 loader carries the wait, the text stays as the caption. -->
            <div
                v-if="enhancing"
                data-testid="talos-mobile-enhancer-status"
                role="status"
                class="flex flex-col items-center gap-3 rounded-xl border border-[var(--talos-border,var(--border))] bg-[var(--talos-card,var(--popover))] px-3 py-6 text-sm text-[var(--talos-muted,var(--muted-foreground))]"
            >
                <TalosLineLoader :width="72" />
                Improving prompt with {{ modelTitle }}…
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
