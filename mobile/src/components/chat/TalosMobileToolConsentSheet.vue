<script setup lang="ts">
import { computed } from 'vue'
import { ShieldAlert } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { useTalosModalSurface } from '@/composables/useTalosModalSurface'
import { ref } from 'vue'

/**
 * The consent surface for a tool that changes something.
 *
 * Owner decision 2026-07-25: writes ask, every time. The research is explicit
 * about why the confirmation has to show the ARGUMENTS and not just the tool
 * name: prompt injection is unsolved at the model layer, so the human is the
 * last check — and a human asked "allow notes_create?" without seeing what
 * would be written is not checking anything, they are clicking.
 *
 * Refusing is the default outcome: dismissing this sheet denies the call.
 */
const props = defineProps<{
    title: string
    description: string
    input: unknown
}>()

const emit = defineEmits<{ allow: []; deny: [] }>()

const root = ref<HTMLElement | null>(null)
const { trapTab } = useTalosModalSurface(root)

const rendered = computed(() => {
    try {
        return JSON.stringify(props.input, null, 2)
    } catch {
        return String(props.input)
    }
})
</script>

<template>
    <Teleport to="body">
        <div
            ref="root"
            data-testid="talos-tool-consent"
            role="dialog"
            aria-modal="true"
            :aria-label="`Allow ${title}?`"
            tabindex="-1"
            class="pointer-events-auto fixed inset-0 z-[95] flex items-end justify-center bg-black/50 px-3 pb-[max(1rem,env(safe-area-inset-bottom))]"
            @keydown="trapTab"
            @keydown.esc="emit('deny')"
        >
            <div class="w-full max-w-[520px] rounded-2xl border border-[var(--talos-border)] bg-[var(--talos-panel)] p-4">
                <div class="flex items-start gap-3">
                    <ShieldAlert class="size-5 shrink-0 text-[var(--talos-accent)]" aria-hidden="true" />
                    <div class="min-w-0 flex-1">
                        <h2 class="text-md font-semibold text-[var(--talos-text)]">{{ title }}</h2>
                        <p class="mt-0.5 text-xs leading-5 text-[var(--talos-muted)]">{{ description }}</p>
                    </div>
                </div>

                <!-- The arguments, verbatim. Consent without them is a click,
                     not a decision. -->
                <pre
                    data-testid="talos-tool-consent-input"
                    class="mt-3 max-h-40 overflow-auto rounded-xl border border-[var(--talos-border)] bg-[var(--talos-panel-soft)] p-2 text-2xs leading-4 text-[var(--talos-muted)]"
                >{{ rendered }}</pre>

                <div class="mt-4 flex gap-2">
                    <Button
                        type="button"
                        data-testid="talos-tool-consent-deny"
                        class="talos-pressable min-h-11 flex-1 rounded-full border border-[var(--talos-border)] bg-transparent text-sm text-[var(--talos-text)]"
                        @click="emit('deny')"
                    >Don't allow</Button>
                    <Button
                        type="button"
                        data-testid="talos-tool-consent-allow"
                        class="talos-pressable min-h-11 flex-1 rounded-full bg-[var(--talos-accent)] text-sm font-medium text-[var(--talos-accent-contrast,var(--primary-foreground))]"
                        @click="emit('allow')"
                    >Allow once</Button>
                </div>
            </div>
        </div>
    </Teleport>
</template>
