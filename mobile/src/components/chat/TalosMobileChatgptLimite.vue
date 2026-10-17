<script setup lang="ts">
import { computed } from 'vue'
import { ExternalLink } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { useTalosI18n } from '@/i18n'
import type { TalosAttesaDelPiano } from '@/lib/chatgpt/attesaLimite'
import { INDIRIZZO_CONSUMI_CHATGPT } from '@/services/chatgptCustodia'
import { openTalosLinkOnce } from '@/services/inAppBrowserService'

/**
 * N15 — la carta del limite d'uso del piano ChatGPT, come nel mockup approvato dall'owner (`mobile/mockup/n15`, scena
 * `limite`), con le parole ufficiali. Il giro NON è fallito: sta aspettando e riprende da solo all'ora scritta (owner
 * 13/10/2026: «come il desktop, con notifica»). ⛔ Azioni una sotto l'altra, mai affiancate. ⛔ Nessun altro fornitore viene
 * proposto o usato: «Ferma l'attesa» ferma il giro, e basta.
 */
const props = withDefaults(defineProps<{ attesa: TalosAttesaDelPiano, apri?: (indirizzo: string) => Promise<unknown> }>(), { apri: undefined })
const emit = defineEmits<{ ferma: [] }>()
const { t, locale } = useTalosI18n()

const ora = computed(() => new Intl.DateTimeFormat(locale.value, { hour: '2-digit', minute: '2-digit' }).format(new Date(props.attesa.riprendeAlle)))
function gestisci(): void {
    void (props.apri ?? ((u: string) => openTalosLinkOnce(u, 'system_browser')))(INDIRIZZO_CONSUMI_CHATGPT)
}
</script>

<template>
    <article
        data-testid="talos-chatgpt-limit" role="status"
        class="mx-3 mb-2 flex flex-col gap-2 rounded-[var(--talos-radius-card)] border border-[var(--talos-border)] border-l-4 border-l-[var(--talos-accent)] bg-[var(--talos-panel)] p-[var(--talos-space-card)] text-[var(--talos-text)]"
    >
        <p class="font-semibold">{{ t('chatgptPlan.limitTitle') }}</p>
        <p class="text-sm text-[var(--talos-muted)]">{{ t('chatgptPlan.limitBody') }}</p>
        <p data-testid="talos-chatgpt-limit-when" class="text-sm">{{ t('chatgptPlan.limitResumes', { time: ora, attempt: attesa.tentativo, total: attesa.totale }) }}</p>
        <Button data-testid="talos-chatgpt-limit-manage" class="mt-1 min-h-touch w-full justify-center gap-2" @click="gestisci">
            {{ t('chatgptPlan.manageUsage') }} <ExternalLink class="size-4" aria-hidden="true" />
        </Button>
        <Button data-testid="talos-chatgpt-limit-stop" variant="outline" class="min-h-touch w-full" @click="emit('ferma')">{{ t('chatgptPlan.limitStop') }}</Button>
    </article>
</template>
