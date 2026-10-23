<script setup lang="ts">
/**
 * Il segnale dell'aggiornamento nell'intestazione (owner 22/10/2026, 1: chiuso il cassetto, resta il segnale per riaprirlo).
 * Come il campanello (`TalosMobileNotificationBell.vue`) sparisce quando non c'è niente da dire, e il pallino sta sull'ICONA, non
 * sull'angolo del bersaglio tattile (lì l'intestazione lo ritaglia, foto del 2026-08-20).
 *
 * Dipende solo da `segnaleAggiornamento.ts`: sta nel grafo d'avvio, il resto dell'aggiornamento si carica dopo.
 */
import { computed } from 'vue'
import { CircleAlert, Download } from '@lucide/vue'
import { useTalosI18n } from '@/i18n'
import { talosApriCassettoAggiornamento, talosSegnaleAggiornamento } from '@/lib/updates/segnaleAggiornamento'

const { t } = useTalosI18n()
const etichetta = computed(() => t(talosSegnaleAggiornamento.fallita ? 'updates.signalFailed' : 'updates.signalReady'))
</script>

<template>
    <button
        v-if="talosSegnaleAggiornamento.visibile && !talosSegnaleAggiornamento.aperto"
        type="button"
        data-testid="talos-update-signal"
        :data-update-failed="talosSegnaleAggiornamento.fallita || undefined"
        :aria-label="etichetta"
        :title="etichetta"
        class="talos-pressable pointer-events-auto relative inline-flex min-h-touch min-w-touch shrink-0 items-center justify-center rounded-[var(--talos-radius-control)] text-[var(--talos-muted)] hover:bg-[var(--talos-active)] hover:text-[var(--talos-text)]"
        @click="talosApriCassettoAggiornamento()"
    >
        <span class="relative grid place-items-center">
            <CircleAlert v-if="talosSegnaleAggiornamento.fallita" class="size-[var(--talos-icon-size)] text-[var(--talos-danger)]" aria-hidden="true" />
            <Download v-else class="size-[var(--talos-icon-size)]" aria-hidden="true" />
            <span
                v-if="!talosSegnaleAggiornamento.fallita"
                class="absolute -right-1 -top-1 size-2 rounded-full bg-[var(--talos-accent)]"
                aria-hidden="true"
            />
        </span>
    </button>
</template>
