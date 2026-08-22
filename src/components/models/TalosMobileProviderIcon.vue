<script setup lang="ts">
import { computed } from 'vue'
import { CircleHelp } from '@lucide/vue'
import anthropicLogo from '@/assets/providers/anthropic.svg'
import deepseekLogo from '@/assets/providers/deepseek.svg'
import geminiLogo from '@/assets/providers/gemini.svg'
import localLogo from '@/assets/providers/local.svg'
import ollamaLogo from '@/assets/providers/ollama.svg'
import openaiLogo from '@/assets/providers/openai.svg'
import openrouterLogo from '@/assets/providers/openrouter.svg'
import type { TalosMobileProviderId } from '@/components/chat/mobileChatTypes'
import { talosMobileProviderById } from '@/lib/mobileProviders'

const props = defineProps<{
    provider: TalosMobileProviderId | string
}>()

const provider = computed(() => talosMobileProviderById(props.provider))
const providerLogos: Record<TalosMobileProviderId, string> = {
    anthropic: anthropicLogo,
    deepseek: deepseekLogo,
    gemini: geminiLogo,
    local: localLogo,
    ollama: ollamaLogo,
    openai: openaiLogo,
    openrouter: openrouterLogo,
}
const logo = computed(() => (
    provider.value.id === 'unknown' ? null : providerLogos[provider.value.id]
))
</script>

<template>
    <span
        role="img"
        :aria-label="provider.label"
        :title="provider.label"
        :data-tone="provider.tone"
        class="talos-mobile-provider-icon inline-flex size-9 shrink-0 items-center justify-center rounded-md border text-xs font-semibold"
    >
        <img
            v-if="logo"
            :src="logo"
            alt=""
            aria-hidden="true"
            class="size-5 rounded-sm bg-white p-0.5 object-contain"
        >
        <CircleHelp
            v-else
            data-provider-fallback
            aria-hidden="true"
            class="size-5"
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
</style>
