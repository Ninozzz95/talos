<script setup lang="ts">
import { computed } from 'vue'
import { CircleHelp, Laptop } from '@lucide/vue'
// AVVIO (25/09/2026): i tre loghi più grossi escono dal pezzo d'avvio (`?no-inline`); i minuscoli restano incorporati.
import anthropicLogo from '@/assets/providers/anthropic.svg?no-inline'
import deepseekLogo from '@/assets/providers/deepseek.svg?no-inline'
import geminiLogo from '@/assets/providers/gemini.svg'
import localLogo from '@/assets/providers/local.svg'
import ollamaLogo from '@/assets/providers/ollama.svg'
import openaiLogo from '@/assets/providers/openai.svg?no-inline'
import openrouterLogo from '@/assets/providers/openrouter.svg'
import type { TalosMobileProviderId } from '@/components/chat/mobileChatTypes'
import { talosMobileProviderById, talosMobileProviderLabel } from '@/lib/mobileProviders'
import { useTalosI18n } from '@/i18n'

const props = defineProps<{
    provider: TalosMobileProviderId | string
    /**
     * A3-84 seconda parte (25/09/2026): la forma per una riga di testo (l'elenco Chat) — alta quanto la riga, senza
     * riquadro. La forma normale (36 px, bordo e fondo del tono) sul Pad alzava ogni riga dell'elenco.
     */
    compatto?: boolean
}>()

const provider = computed(() => talosMobileProviderById(props.provider))
const { t } = useTalosI18n()
/** Il nome a schermo e per i lettori di schermo, nella lingua dell'app (22/10/2026). */
const nome = computed(() => talosMobileProviderLabel(props.provider, t))
const providerLogos: Record<TalosMobileProviderId, string> = {
    anthropic: anthropicLogo,
    deepseek: deepseekLogo,
    gemini: geminiLogo,
    local: localLogo,
    ollama: ollamaLogo,
    openai: openaiLogo,
    openrouter: openrouterLogo,
    // N15: il piano ChatGPT porta il segno di OpenAI, come nel mockup approvato.
    chatgpt: openaiLogo,
}
const logo = computed(() => (
    provider.value.id === 'unknown' ? null : providerLogos[provider.value.id]
))
</script>

<template>
    <span
        role="img"
        :aria-label="nome"
        :title="nome"
        :data-tone="provider.tone"
        :data-compatto="props.compatto ? 'true' : undefined"
        class="talos-mobile-provider-icon inline-flex shrink-0 items-center justify-center text-xs font-semibold"
        :class="props.compatto ? 'size-4' : 'size-9 rounded-md border'"
    >
        <img
            v-if="logo"
            :src="logo"
            alt=""
            aria-hidden="true"
            class="rounded-sm bg-white object-contain"
            :class="props.compatto ? 'size-3.5 p-px' : 'size-5 p-0.5'"
        >
        <!-- anomalia 3 di Marco (24/10/2026): i modelli del PC hanno il portatile, non il punto di domanda dello sconosciuto -->
        <Laptop
            v-else-if="props.provider === 'computer'"
            data-provider-computer
            aria-hidden="true"
            :class="props.compatto ? 'size-3.5' : 'size-5'"
        />
        <CircleHelp
            v-else
            data-provider-fallback
            aria-hidden="true"
            :class="props.compatto ? 'size-3.5' : 'size-5'"
        />
    </span>
</template>

<style scoped>
.talos-mobile-provider-icon {
    border-color: var(--talos-border-strong, var(--border));
    background: var(--talos-panel-soft, var(--muted));
    color: var(--talos-muted, var(--muted-foreground));
}

.talos-mobile-provider-icon[data-tone="green"] {
    border-color: var(--talos-success-border, var(--border));
    background: var(--talos-success-soft, var(--secondary));
    color: var(--talos-success, var(--secondary-foreground));
}

.talos-mobile-provider-icon[data-tone="blue"],
.talos-mobile-provider-icon[data-tone="cyan"] {
    border-color: var(--talos-accent-border, var(--border));
    background: var(--talos-accent-soft, var(--secondary));
    color: var(--talos-accent-text, var(--primary));
}

.talos-mobile-provider-icon[data-tone="purple"] {
    border-color: var(--talos-secondary, var(--border));
    background: color-mix(in srgb, var(--talos-secondary, var(--secondary)) 12%, transparent);
    color: var(--talos-secondary, var(--secondary-foreground));
}

.talos-mobile-provider-icon[data-tone="amber"] {
    border-color: var(--talos-warning-border, var(--border));
    background: var(--talos-warning-soft, var(--secondary));
    color: var(--talos-warning, var(--secondary-foreground));
}

/* La forma compatta non ha riquadro: vince sui toni qui sopra, che colorano bordo e fondo. */
.talos-mobile-provider-icon[data-compatto] {
    border-color: transparent;
    background: transparent;
}
</style>
