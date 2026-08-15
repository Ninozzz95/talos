<script setup lang="ts">
import { Button } from '@/components/ui/button'
import type { TalosMobilePromptEnhancementResult } from '@/lib/chat/promptEnhancement'

defineProps<{
    result: TalosMobilePromptEnhancementResult
}>()

const emit = defineEmits<{
    cancel: []
    insert: []
    replace: []
}>()
</script>

<template>
    <section
        role="dialog"
        aria-labelledby="talos-mobile-enhancer-title"
        aria-describedby="talos-mobile-enhancer-description"
        data-testid="talos-mobile-prompt-enhancer-popover"
        class="w-full max-w-[calc(100vw-1.5rem)] rounded-md border border-[var(--talos-border-strong,var(--border))] bg-[var(--talos-card,var(--popover))] p-3 shadow-xl"
    >
        <div class="space-y-3">
            <header class="space-y-1">
                <h2
                    id="talos-mobile-enhancer-title"
                    class="text-sm font-semibold text-[var(--talos-text,var(--foreground))]"
                >
                    {{ $t('chat.enhancementPreview') }}
                </h2>
                <p
                    data-testid="talos-mobile-enhancement-provenance"
                    class="font-mono text-xs text-[var(--talos-muted,var(--muted-foreground))]"
                >
                    {{ $t('chat.enhancedWith', { provider: result.provider, model: result.model }) }}
                </p>
            </header>

            <div
                data-testid="talos-mobile-enhancement-output"
                class="max-h-72 overflow-auto rounded-md border border-[var(--talos-border,var(--border))] bg-[var(--talos-panel,var(--muted))] p-3 text-sm leading-6 text-[var(--talos-text,var(--foreground))]"
            >
                <pre class="whitespace-pre-wrap break-words font-sans">{{ result.enhanced_prompt }}</pre>
            </div>

            <!-- F5.1 (owner): aggressively compact — the summary clamps to two
                 lines and the principles are a single quiet inline row. -->
            <p
                id="talos-mobile-enhancer-description"
                class="line-clamp-2 text-2xs leading-4 text-[var(--talos-muted,var(--muted-foreground))]"
            >
                {{ result.summary || $t('chat.enhancementFallbackSummary') }}
            </p>

            <ul
                v-if="result.applied_principles.length"
                class="flex flex-wrap gap-1"
                :aria-label="$t('chat.appliedPrinciples')"
            >
                <li
                    v-for="principle in result.applied_principles"
                    :key="principle"
                    class="rounded-full bg-[var(--talos-active)] px-1.5 py-0.5 text-3xs leading-4 text-[var(--talos-muted,var(--muted-foreground))]"
                >
                    {{ principle }}
                </li>
            </ul>

            <footer class="flex flex-wrap justify-end gap-2">
                <Button
                    type="button"
                    variant="ghost"
                    data-enhancement-decision="cancel"
                    class="min-h-touch min-w-touch"
                    @click="emit('cancel')"
                >
                    {{ $t('common.cancel') }}
                </Button>
                <Button
                    type="button"
                    variant="outline"
                    data-enhancement-decision="insert"
                    class="min-h-touch min-w-touch"
                    @click="emit('insert')"
                >
                    {{ $t('chat.insertBelow') }}
                </Button>
                <Button
                    type="button"
                    data-enhancement-decision="replace"
                    class="min-h-touch min-w-touch bg-[var(--talos-accent,var(--primary))] text-[var(--talos-accent-contrast,var(--primary-foreground))]"
                    @click="emit('replace')"
                >
                    {{ $t('chat.replacePrompt') }}
                </Button>
            </footer>
        </div>
    </section>
</template>
