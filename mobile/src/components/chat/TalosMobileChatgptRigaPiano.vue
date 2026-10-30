<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ChevronDown, ExternalLink } from '@lucide/vue'
import { useTalosI18n } from '@/i18n'
import { Button } from '@/components/ui/button'
import { talosChatgpt } from '@/services/chatgptAccesso'
import { type TalosChatgptRiassunto, talosConsumiChatgpt } from '@/services/chatgptConsumi'
import { openTalosLinkOnce } from '@/services/inAppBrowserService'

/**
 * ⛔ D-0147-UI-2 (owner 27/10/2026, mockup `mobile/mockup/ui2` approvato): sul TELEFONO lo stato del piano ChatGPT sta qui, prima
 * riga del gruppo ChatGPT del selettore dei modelli, e non più nella pastiglia del compositore (a 360-393 dp lo mandava su tre
 * righe). Stesse fonti e stesse parole della pastiglia (`TalosMobileChatgptPastiglia.vue`), che resta sul tablet. Come t3code mobile
 * (`ChatGptSharingStatus.tsx:7-38`): «Using ChatGPT plan» con l'account e «Manage usage».
 *
 * Toccata si apre sul posto: le due finestre contate da TALOS su questo dispositivo, la nota onesta, «Gestisci l'utilizzo». Al limite
 * lo dice subito e «Gestisci l'utilizzo» è l'azione principale, senza aprire niente (linee guida SIWC di OpenAI).
 * Servizio, conto e apertura arrivano come proprietà solo per le prove.
 */
type Stato = { email: string | null, consumi: string }
const props = withDefaults(defineProps<{
    alLimite?: boolean
    servizio?: { stato(): Promise<Stato> }
    consumi?: { riassunto(): TalosChatgptRiassunto }
    apri?: (indirizzo: string, modo: 'system_browser') => Promise<unknown>
}>(), { alLimite: false, servizio: undefined, consumi: undefined, apri: undefined })
const { t, locale } = useTalosI18n()

const aperta = ref(false)
const stato = ref<Stato | null>(null)
const conto = ref<TalosChatgptRiassunto | null>(null)

const numeri = computed(() => new Intl.NumberFormat(locale.value, { notation: 'compact', maximumFractionDigits: 1 }))
function riga(finestra: { richieste: number, token: number } | undefined): string {
    const f = finestra ?? { richieste: 0, token: 0 }
    return t(f.richieste === 1 ? 'chatgptPlan.usageOne' : 'chatgptPlan.usageMany', { requests: f.richieste, tokens: numeri.value.format(f.token) })
}

onMounted(async () => {
    try { stato.value = await (props.servizio ?? talosChatgpt()).stato() } catch { stato.value = null }
})
function alterna(): void {
    if (props.alLimite) return
    if (!aperta.value) conto.value = (props.consumi ?? talosConsumiChatgpt()).riassunto()
    aperta.value = !aperta.value
}
function gestisci(): void {
    const indirizzo = stato.value?.consumi
    if (!indirizzo) return
    void (props.apri ?? openTalosLinkOnce)(indirizzo, 'system_browser')
}
</script>

<template>
    <div data-testid="talos-chatgpt-plan-row" class="mb-1 rounded-md border border-[var(--talos-border)] bg-[var(--talos-panel)]">
        <button
            type="button" data-testid="talos-chatgpt-plan-row-toggle"
            :aria-expanded="alLimite ? undefined : aperta"
            class="talos-pressable flex min-h-touch w-full items-center gap-2.5 px-2.5 py-2 text-left text-sm"
            @click="alterna"
        >
            <!-- I-R1 (revisione del blocco 9): i colori che reggono 3:1 in ogni tema (`puntinoDelPiano.ts`); F-R2 (blocco 10): al limite
                 un anello vuoto, non solo un'altra tinta, perché i due stati hanno la stessa luminosità -->
            <span
                data-testid="talos-chatgpt-plan-row-dot" class="size-2.5 shrink-0 rounded-full" aria-hidden="true"
                :style="alLimite ? { boxShadow: 'inset 0 0 0 2px var(--talos-plan-dot-limit)' } : { background: 'var(--talos-plan-dot)' }"
            />
            <span class="flex min-w-0 flex-1 flex-col">
                <span class="truncate font-medium text-[var(--talos-text)]">{{ alLimite ? t('chatgptPlan.limitTitle') : t('chatgptPlan.panelTitle') }}</span>
                <span v-if="stato?.email" class="truncate text-2xs text-[var(--talos-muted)]">{{ stato.email }}</span>
            </span>
            <ChevronDown v-if="!alLimite" class="size-4 shrink-0 transition-transform" :class="aperta ? '' : '-rotate-90'" aria-hidden="true" />
        </button>
        <div v-if="alLimite" class="px-2.5 pb-2.5">
            <Button data-testid="talos-chatgpt-plan-row-manage" data-primaria="true" class="min-h-touch w-full justify-center gap-2" @click="gestisci">
                {{ t('chatgptPlan.manageUsage') }} <ExternalLink class="size-4" aria-hidden="true" />
            </Button>
        </div>
        <div v-else-if="aperta" class="px-2.5 pb-2.5">
            <dl class="divide-y divide-[var(--talos-border)] text-sm">
                <div class="flex justify-between gap-3 py-2">
                    <dt class="text-[var(--talos-muted)]">{{ t('chatgptPlan.last5h') }}</dt>
                    <dd data-testid="talos-chatgpt-plan-row-usage-5h" class="text-right font-semibold tabular-nums">{{ riga(conto?.ore5) }}</dd>
                </div>
                <div class="flex justify-between gap-3 py-2">
                    <dt class="text-[var(--talos-muted)]">{{ t('chatgptPlan.last7d') }}</dt>
                    <dd data-testid="talos-chatgpt-plan-row-usage-7d" class="text-right font-semibold tabular-nums">{{ riga(conto?.giorni7) }}</dd>
                </div>
            </dl>
            <p data-testid="talos-chatgpt-plan-row-note" class="mt-1 text-xs text-[var(--talos-muted)]">{{ t('chatgptPlan.panelNote') }}</p>
            <button
                type="button" data-testid="talos-chatgpt-plan-row-manage"
                class="talos-pressable mt-1 inline-flex min-h-touch items-center gap-1.5 text-sm text-[var(--talos-accent)] underline underline-offset-2"
                @click="gestisci"
            >{{ t('chatgptPlan.manageUsage') }} <ExternalLink class="size-3.5" aria-hidden="true" /></button>
        </div>
    </div>
</template>
