<script setup lang="ts">
/**
 * ⛔⛔ SI È FERMATA A METÀ, e va detto — rilievo #16b (owner, 12/08) e CONT (25/09/2026).
 *
 * Una risposta tagliata dalla lunghezza sembra identica a una finita o a una tagliata dal rendering. Il fatto lo sa solo
 * il fornitore (`finishReason` di lunghezza, `talosFermataDallaLunghezza`), viaggia coi metadati e finisce qui, sotto la
 * frase che si interrompe. Non riscrive il modello: aggiunge ciò che il modello non poteva sapere.
 *
 * «Continua» (owner 25/09: «Nuovo messaggio «Continua»», «Solo col pulsante») manda la stessa parola come messaggio
 * nuovo, solo sull'ultima risposta e a giro fermo (lo decide chi monta: `mostraContinua`).
 *
 * Caricato a richiesta dalla lista (come `TalosMobileMessageActions`): una risposta tagliata è rara, e il pezzo d'avvio
 * non deve portarla (regola dell'owner del 14/08 in `scripts/verify-initial-chunk.mjs`, passo 2).
 */
import { Button } from '@/components/ui/button'
import { CircleAlert } from '@lucide/vue'
import { useTalosI18n } from '@/i18n'

defineProps<{ mostraContinua: boolean }>()
const emit = defineEmits<{ continua: [] }>()
const { t } = useTalosI18n()
</script>

<template>
    <div class="mt-1.5 flex max-w-full flex-wrap items-center gap-2">
        <div
            data-testid="talos-risposta-troncata"
            role="status"
            class="inline-flex max-w-full flex-wrap items-center gap-1.5 rounded-md border border-current/25 bg-black/5 px-2 py-1 text-2xs leading-4"
        >
            <CircleAlert class="size-3.5 shrink-0" aria-hidden="true" />
            <span>{{ t('chat.stoppedAtLimit') }}</span>
        </div>
        <Button
            v-if="mostraContinua"
            type="button"
            variant="outline"
            size="sm"
            data-testid="talos-continua-dopo-limite"
            class="talos-pressable talos-continua"
            @click="emit('continua')"
        >
            {{ t('chat.continueAfterLimit') }}
        </Button>
    </div>
</template>

<style scoped>
/* Piccolo accanto alla riga, ma si tocca come un comando intero (48dp, Material 3 «touch target»). */
.talos-continua { position: relative; }
.talos-continua::after {
    content: '';
    position: absolute;
    inset-block: calc((var(--talos-touch-target) - 2rem) / -2);
    inset-inline: -0.25rem;
}
</style>
