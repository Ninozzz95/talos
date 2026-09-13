<script setup lang="ts">
import { computed } from 'vue'
import { useTalosI18n } from '@/i18n'
import { CircleAlert, Info, ShieldAlert } from '@lucide/vue'
import type { TalosMobileMessageView } from '@/components/chat/mobileChatTypes'
import { talosMobileControlledFault, type TalosMobileControlledFaultLayer } from '@/lib/talosMessageState'
import { talosChatFaultText } from '@/lib/chat/erroreLeggibile'

const props = defineProps<{ message: TalosMobileMessageView }>()
const { t } = useTalosI18n()
const fault = computed(() => talosMobileControlledFault(props.message))
/**
 * ⛔ L'ultimo cancello prima dello schermo: qui la busta diventa una FRASE.
 *
 * §40, dal Pad dell'owner: al posto della risposta comparivano il codice
 * `TALOS_LLAMA_NO_CHAT_TEMPLATE` nello slot del messaggio e un consiglio sulla
 * CONNESSIONE dato a proposito di un modello locale, che la rete non la usa.
 *
 * La regola sta in `erroreLeggibile.ts`, pura e provata; qui si esegue e basta.
 * Il codice non si perde: scende nella riga della diagnostica, in piccolo —
 * «show them for technical diagnostic purposes only» (NN/g, 12/09/2026).
 */
const testo = computed(() => (fault.value
    ? talosChatFaultText(fault.value, t)
    : null))
const titleKeys: Record<TalosMobileControlledFaultLayer, string> = {
    validator: 'chat.validationFault', policy: 'chat.policyDenial', provider: 'chat.providerFailure',
    network: 'chat.networkFailure', worker: 'chat.workerFailure', system: 'chat.executionFailure',
}
const title = computed(() => t(fault.value ? titleKeys[fault.value.layer] : 'chat.systemNotice'))
/**
 * A LOCAL model's id is its file path on the device: on the Pad (12/09/2026)
 * the card closed with «local / /storage/emulated/0/…/talos-prova-gemma.gguf».
 * The person gets the same words as the model picker — where it lives and its
 * name — and the path stays out of sight.
 */
function localModelName(model: string): string {
    const base = model.split(/[\/]/).pop() ?? model
    return base.replace(/\.gguf$/i, '')
}

const providerLabel = computed(() => {
    if (!fault.value?.provider && !fault.value?.model) return null
    if (fault.value.provider === 'local') {
        return [t('chat.localModelLine'), fault.value.model ? localModelName(fault.value.model) : null].filter(Boolean).join(' / ')
    }
    return [fault.value.provider, fault.value.model].filter(Boolean).join(' / ')
})
</script>

<template>
    <section
        v-if="fault"
        role="alert"
        aria-live="assertive"
        data-testid="talos-mobile-controlled-fault"
        :data-fault-layer="fault.layer"
        :data-fault-code="fault.code"
        class="min-w-0 max-w-full rounded-md border border-[var(--talos-danger-border)] bg-[var(--talos-danger-soft)] p-3 text-[var(--talos-text)]"
    >
        <div class="flex min-w-0 items-start gap-2.5">
            <ShieldAlert v-if="fault.layer === 'policy'" class="mt-0.5 size-4 shrink-0 text-[var(--talos-danger)]" aria-hidden="true" />
            <CircleAlert v-else class="mt-0.5 size-4 shrink-0 text-[var(--talos-danger)]" aria-hidden="true" />
            <div class="min-w-0 flex-1">
                <div class="flex flex-wrap items-center gap-2">
                    <strong class="text-sm font-semibold">{{ title }}</strong>
                    <span class="rounded border border-[var(--talos-danger-border)] px-1.5 py-0.5 font-mono text-3xs text-[var(--talos-danger)]">{{ fault.code }}</span>
                </div>
                <p data-testid="talos-mobile-fault-message" class="mt-2 break-words text-sm leading-6 [overflow-wrap:anywhere]">{{ testo?.message }}</p>
                <div v-if="testo?.nextAction" class="mt-3 border-t border-[var(--talos-danger-border)] pt-2">
                    <div class="text-2xs font-semibold uppercase text-[var(--talos-danger)]">{{ $t('chat.nextAction') }}</div>
                    <p data-testid="talos-mobile-fault-next" class="mt-1 break-words text-xs leading-5 [overflow-wrap:anywhere]">{{ testo.nextAction }}</p>
                </div>
                <div class="mt-3 flex flex-wrap items-center gap-2 text-2xs text-[var(--talos-muted)]">
                    <span v-if="providerLabel">{{ providerLabel }}</span>
                    <span v-if="fault.status">HTTP {{ fault.status }}</span>
                    <!-- Il nome interno che è stato tolto dalla frase. Sta qui,
                         con gli altri dati da riprodurre, nel corpo più piccolo
                         della scheda e in monospazio: serve a chi deve
                         riprodurre il guasto, non a chi lo subisce. -->
                    <span
                        v-if="testo?.diagnostic"
                        data-testid="talos-mobile-fault-diagnostic"
                        class="break-all font-mono"
                    >{{ testo.diagnostic }}</span>
                    <span v-if="fault.retryable !== null" class="rounded border border-[var(--talos-border)] px-1.5 py-0.5">
                        {{ fault.retryable ? $t('chat.retryAvailable') : $t('chat.manualActionRequired') }}
                    </span>
                </div>
            </div>
        </div>
    </section>
    <div v-else role="status" aria-live="polite" class="mx-auto flex min-w-0 max-w-full items-center justify-center gap-1.5 px-3 py-1 text-center text-xs text-[var(--talos-muted)]">
        <Info class="size-3.5 shrink-0" aria-hidden="true" />
        <p class="min-w-0 break-words [overflow-wrap:anywhere]">{{ message.content }}</p>
    </div>
</template>
