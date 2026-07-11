<script setup lang="ts">
import Button from '../../ui/Button.vue'
import Card from '../../ui/Card.vue'
import type { TalosPromptEnhancementResult } from '../../../composables/useTalosPromptEnhancement'

defineProps<{
    result: TalosPromptEnhancementResult
}>()

const emit = defineEmits<{
    replace: []
    insert: []
    cancel: []
}>()
</script>

<template>
    <Card class="w-full max-w-[560px] border-[var(--talos-border-strong)] bg-[var(--talos-card)]/98 p-3 shadow-[0_18px_60px_rgba(0,0,0,0.34)]" :padded="false">
        <div class="space-y-3">
            <div class="space-y-1">
                <h2 class="text-sm font-semibold text-[var(--talos-text)]">
                    Prompt enhancement preview
                </h2>
                <p class="text-xs text-[var(--talos-muted)]" data-testid="talos-enhancement-provenance">
                    Enhanced with {{ result.provider }} · {{ result.model }}
                </p>
            </div>

            <div class="max-h-72 overflow-auto rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] p-3 text-sm leading-6 text-[var(--talos-text)]">
                <pre class="whitespace-pre-wrap break-words font-sans">{{ result.enhanced_prompt }}</pre>
            </div>

            <p v-if="result.summary" class="text-xs leading-5 text-[var(--talos-muted)]">
                {{ result.summary }}
            </p>

            <div v-if="result.applied_principles.length" class="flex flex-wrap gap-1.5" aria-label="Applied prompt principles">
                <span
                    v-for="principle in result.applied_principles"
                    :key="principle"
                    class="rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)] px-2 py-1 text-[11px] text-[var(--talos-muted)]"
                >
                    {{ principle }}
                </span>
            </div>

            <div class="flex flex-wrap justify-end gap-2">
                <Button variant="ghost" size="sm" type="button" @click="emit('cancel')">
                    Cancel
                </Button>
                <Button variant="outline" size="sm" type="button" @click="emit('insert')">
                    Insert below
                </Button>
                <Button size="sm" type="button" @click="emit('replace')">
                    Replace prompt
                </Button>
            </div>
        </div>
    </Card>
</template>
