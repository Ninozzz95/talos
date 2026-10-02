<script setup lang="ts">
/**
 * ⭐⭐ P4-quinquies — l'azione dichiarata ma non eseguita (owner 02/10/2026: «Riprova, poi avviso»).
 *
 * La risposta ha detto «fatto» (es. «Salvato la nota ✅»), nel turno non è partito nessuno strumento, e nemmeno dopo il
 * sollecito automatico del ciclo (`agentLoop.ts`). Il testo del modello resta com'è — la persona l'ha già letto — e qui
 * sotto si dice il fatto che il modello non poteva sapere: niente è stato fatto. È il rovescio del «Verificato sul
 * telefono» delle schede (`TalosMobileSchedaAzione.vue`), che compare quando lo strumento è partito davvero.
 *
 * Caricato a richiesta dalla lista, come `TalosMobileFermataAlLimite`: è raro, e il pezzo d'avvio non deve portarlo.
 */
import { CircleAlert } from '@lucide/vue'
import { useTalosI18n } from '@/i18n'

const { t } = useTalosI18n()
</script>

<template>
    <div
        data-testid="talos-azione-non-eseguita"
        role="note"
        class="mt-1.5 inline-flex max-w-full flex-wrap items-center gap-1.5 rounded-md border border-current/25 bg-black/5 px-2 py-1 text-2xs leading-4"
    >
        <CircleAlert class="size-3.5 shrink-0" aria-hidden="true" />
        <span>{{ t('chat.actionNotRun') }}</span>
    </div>
</template>
