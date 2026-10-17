<script setup lang="ts">
/**
 * ⛔ K3-RISDEL (ledger `LEDGER-K3-CODICE-COME-LA-CHAT-2026-10-15.md`): il risultato di un sotto-agente nella conversazione del Codice,
 * come il riquadro del desktop r4 (`appendRisultatoDelega`, `legacy/app.js:11012` @ fc5):
 * - l'intestazione dice di che cosa si tratta (risultato, o sotto-agente non concluso);
 * - il compito è UNA riga, l'intero nel `title`;
 * - il risultato passa dal markdown della chat, accorciato; «Mostra tutto» c'è solo se il testo è tagliato davvero (lo misura un
 *   ResizeObserver: la riga può nascere in una lista ancora nascosta).
 * Il testo viene da un altro agente: è dato, non istruzioni, e passa dallo stesso renderer sicuro dei messaggi.
 * Caricato a richiesta dalla lista: la chat non produce mai questa riga.
 */
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Bot, CircleAlert } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { useTalosI18n } from '@/i18n'
import { senzaInganniSuPiuRigheR4 } from '@/lib/harness/r4/agentiR4'
import { descriviRisultatoDelegaR4, testoRisultatoDelegaR4, type VoceRisultatoDelegaR4 } from '@/lib/harness/r4/risultatiDelegaR4'

const props = defineProps<{ voce: VoceRisultatoDelegaR4 }>()
const TalosMobileMessageContent = defineAsyncComponent(() => import('@/components/chat/TalosMobileMessageContent.vue'))
const { locale } = useTalosI18n()
const tr = (chiave: string, valori?: Record<string, unknown>) => testoRisultatoDelegaR4(chiave, locale.value, valori)

const risultato = computed(() => descriviRisultatoDelegaR4(props.voce.testo, props.voce.childId, locale.value))
const errore = computed(() => risultato.value?.errore === true)
// le parole di `mostraRisultatoDelega`: «Notifica di sistema · …» per le voci del giro della madre, l'altra forma per la consegna
const intestazione = computed(() => (props.voce.daGiro
    ? tr(errore.value ? 'app.delegations.resultNoticeFailed' : 'app.delegations.resultNotice')
    : tr(errore.value ? 'app.delegations.resultMetaFailed' : 'app.delegations.resultMeta')))
const compito = computed(() => senzaInganniSuPiuRigheR4(String(risultato.value?.titolo ?? '')).trim())
const primaRiga = computed(() => compito.value.split('\n').find((r) => r.trim())?.trim() ?? compito.value)
const corpo = computed(() => senzaInganniSuPiuRigheR4(risultato.value?.testo ?? ''))
const consegnato = computed(() => (props.voce.daGiro && props.voce.childId
    ? tr('app.delegations.resultDeliveredNamed', { id: props.voce.childId })
    : tr('app.delegations.resultDelivered')))

const aperta = ref(false)
const tagliata = ref(false)
const contenitore = ref<HTMLElement | null>(null)
let osservatore: ResizeObserver | null = null
function misura() {
    const el = contenitore.value
    tagliata.value = Boolean(el && !aperta.value && el.scrollHeight > el.clientHeight + 1)
}
onMounted(() => {
    if (typeof ResizeObserver === 'function' && contenitore.value) {
        osservatore = new ResizeObserver(misura)
        osservatore.observe(contenitore.value)
    }
    misura()
})
onBeforeUnmount(() => osservatore?.disconnect())
watch(aperta, misura, { flush: 'post' })
</script>

<template>
    <section
        data-testid="talos-risultato-delega"
        :data-tono="errore ? 'avviso' : 'info'"
        :data-figlia="voce.childId ?? undefined"
        class="talos-risultato-delega w-full min-w-0 max-w-[72ch] rounded-md border px-3 py-2.5 text-[var(--talos-text)]"
        :class="errore ? 'border-[var(--talos-warning-border)] bg-[var(--talos-warning-soft)]' : 'border-[var(--talos-border)] bg-[var(--talos-panel)]'"
    >
        <p class="flex min-w-0 items-center gap-1.5 text-2xs leading-4" :class="errore ? 'text-[var(--talos-warning)]' : 'text-[var(--talos-muted)]'">
            <CircleAlert v-if="errore" class="size-3.5 shrink-0" aria-hidden="true" />
            <Bot v-else class="size-3.5 shrink-0" aria-hidden="true" />
            <span class="min-w-0 truncate">{{ intestazione }}</span>
        </p>
        <template v-if="risultato">
            <p v-if="primaRiga" data-parte="compito" class="mt-1 truncate text-sm font-medium leading-5" :title="compito">{{ primaRiga }}</p>
            <div
                ref="contenitore"
                data-parte="corpo"
                :data-tagliata="tagliata ? 'si' : 'no'"
                class="talos-risultato-delega__corpo mt-1 min-w-0 text-sm"
                :class="aperta ? '' : 'is-chiuso'"
            >
                <TalosMobileMessageContent :content="corpo" line-breaks />
            </div>
            <Button
                v-if="tagliata || aperta"
                type="button"
                variant="ghost"
                size="sm"
                data-parte="mostra"
                class="talos-risultato-delega__mostra mt-1 -ms-2"
                :aria-expanded="aperta ? 'true' : 'false'"
                @click="aperta = !aperta"
            >
                {{ tr(aperta ? 'app.common.showLess' : 'app.common.showAll') }}
            </Button>
        </template>
        <p v-else data-parte="consegnato" class="mt-1 text-sm leading-5">{{ consegnato }}</p>
    </section>
</template>

<style scoped>
/* Accorciato come sul desktop: una decina di righe, poi «Mostra tutto». La sfumatura dice che il testo continua. */
.talos-risultato-delega__corpo.is-chiuso {
    max-height: 12rem;
    overflow: hidden;
}
/* Misurato sul Pad: col corpo che taglia (`overflow: hidden`) i margini del primo e dell'ultimo paragrafo non si fondono più con quelli
   del riquadro e restavano dentro, 11 px sopra e sotto il testo. */
.talos-risultato-delega__corpo :deep(.talos-message-content > :first-child > :first-child) { margin-top: 0; }
.talos-risultato-delega__corpo :deep(.talos-message-content > :last-child > :last-child) { margin-bottom: 0; }
.talos-risultato-delega__corpo.is-chiuso[data-tagliata='si'] {
    mask-image: linear-gradient(to bottom, #000 75%, transparent);
}
/* Piccolo a vedersi, ma si tocca come un comando intero (48dp). */
.talos-risultato-delega__mostra { position: relative; }
.talos-risultato-delega__mostra::after {
    content: '';
    position: absolute;
    inset-block: calc((var(--talos-touch-target) - 2rem) / -2);
    inset-inline: -0.25rem;
}
</style>
