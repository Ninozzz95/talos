<script setup lang="ts">
import { useId } from 'vue'
import { ChevronRight } from '@lucide/vue'

/**
 * ⛔ Owner 20/10/2026 (difetto 2 delle righe degli attrezzi, foto dal Pad): tante righe di attrezzi una dopo l'altra occupavano
 * troppo spazio. Diventano UNA riga di riassunto, la stessa riga grigia di tutte le altre, che si apre al tocco.
 *
 * Il modello è Hermes (`apps/desktop/src/components/assistant-ui/tool/fallback.tsx:1012-1043`): riassunto che si apre, e
 * mentre il gruppo è vivo e chiuso resta visibile la riga corrente (`ToolRunTicker`), così chi guarda vede cosa sta succedendo
 * adesso. Le righe aperte stanno dietro un filetto a sinistra: dice a quale riassunto appartengono.
 *
 * Il pulsante è alto 44 px (bersaglio tattile), le righe sotto restano compatte (owner 15/10, «Compatte, tocco intatto»).
 * Niente animazione d'altezza: si apre e basta, e il chevron che ruota si ferma col movimento ridotto.
 */
defineProps<{
    riassunto: string
    /** «4 steps», già tradotto. */
    passi: string
    vivo: boolean
    aperto: boolean
}>()
defineEmits<{ cambia: [] }>()

const idRighe = `talos-tool-group-${useId()}`
</script>

<template>
    <div data-testid="talos-tool-group" :data-aperto="aperto ? 'true' : 'false'">
        <button
            type="button"
            class="group flex min-h-touch w-full items-center gap-2 rounded-lg pr-1 text-left text-[var(--talos-muted)] transition-colors duration-150 talos-pressable hover:text-[var(--talos-text)]"
            :aria-expanded="aperto ? 'true' : 'false'"
            :aria-controls="idRighe"
            @click="$emit('cambia')"
        >
            <span
                class="flex size-4 shrink-0 items-center justify-center"
                :class="vivo ? 'talos-trace-live' : ''"
                aria-hidden="true"
            >
                <slot name="icon" />
            </span>
            <span class="min-w-0 flex-1 truncate text-xs">{{ riassunto }}</span>
            <span class="shrink-0 text-2xs opacity-70 [font-variant-numeric:tabular-nums]">{{ passi }}</span>
            <ChevronRight
                class="size-3.5 shrink-0 opacity-70 transition-transform duration-150 motion-reduce:transition-none"
                :class="aperto ? 'rotate-90' : ''"
                aria-hidden="true"
            />
        </button>
        <div
            :id="idRighe"
            class="ml-[0.4375rem] border-l border-[var(--talos-border)] pl-2.5"
        >
            <slot />
        </div>
    </div>
</template>
