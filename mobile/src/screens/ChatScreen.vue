<script setup lang="ts">
import { ref } from 'vue'
import TalosMobileComposer from '@/components/composer/TalosMobileComposer.vue'
import TalosMobileToolSheet from '@/components/shell/TalosMobileToolSheet.vue'
import TalosModelCatalog from '@/components/composer/TalosModelCatalog.vue'

// Chat is the base surface: a centered brand hero over a docked composer. The
// welcome copy is the desktop default prompt (resolveTalosWelcomePrompt seed
// "talos" -> the "benchmark-proof" prompt), rendered statically in step-1. The
// CTAs set a prompt on desktop; here they are inert until sending lands (M3).
const welcome = {
    headline: 'What claim should we benchmark?',
    body: 'Turn a prompt into comparable AVM ON/OFF evidence with matching model, context, evaluator, and logs.',
}
const suggestions = ['Verify API', 'Analyze logs', 'Generate DAG']
const showModelLab = ref(false)
</script>

<template>
    <section
        data-testid="mobile-screen"
        aria-label="Chat"
        class="flex min-h-full flex-1 flex-col bg-[var(--talos-background)]"
    >
        <div class="flex flex-1 flex-col items-center justify-center px-4 py-10 text-center">
            <div class="flex flex-col items-center gap-2" data-testid="talos-empty-brand">
                <span class="talos-short-logo talos-short-logo-hero talos-chat-brand-logo" aria-hidden="true">
                    <span class="talos-short-logo-mark"></span>
                </span>
                <span class="talos-orbitron-brand text-4xl font-semibold text-[var(--talos-text)] sm:text-5xl">TALOS</span>
            </div>

            <h1 class="mt-6 text-2xl font-semibold text-[var(--talos-text)]">{{ welcome.headline }}</h1>
            <p class="mt-3 max-w-[560px] text-sm leading-6 text-[var(--talos-muted)]">{{ welcome.body }}</p>

            <div class="mt-6 flex flex-wrap justify-center gap-2">
                <button
                    v-for="suggestion in suggestions"
                    :key="suggestion"
                    type="button"
                    disabled
                    class="rounded-md border border-[var(--talos-border)] px-3 py-2 text-sm text-[var(--talos-muted)] opacity-70 transition hover:border-[var(--talos-accent)] hover:text-[var(--talos-accent)]"
                >{{ suggestion }}</button>
            </div>
        </div>

        <TalosMobileComposer @open-model-lab="showModelLab = true" />

        <TalosMobileToolSheet
            v-if="showModelLab"
            title="Model Lab"
            description="Provider catalog, effort and composer visibility."
            @close="showModelLab = false"
        >
            <div class="p-3">
                <TalosModelCatalog />
            </div>
        </TalosMobileToolSheet>
    </section>
</template>
