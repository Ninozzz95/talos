<script setup lang="ts">
import { ShieldCheck, ShieldX } from '@lucide/vue'
import { useTalosI18n } from '@/i18n'
import { talosToolConsentCopy } from '@/lib/tools/toolLabels'

/**
 * ⭐ GESTITA-01 (owner 25/09/2026, «riga compatta»): «Permesso concesso/negato: <strumento>», una riga per strumento.
 *
 * ⛔ Owner 20/10/2026 (righe perse dopo le approvazioni): la stessa riga la disegnano DUE posti — il messaggio salvato
 * (`TalosMobileMessageList`) e la risposta in volo che continua dopo «Consenti» (`TalosMobileStreamingReply`) —, quindi vive qui
 * una volta sola. `data-testid` e classi sono quelli di prima.
 */
defineProps<{ esiti: readonly { tool: string, concesso: boolean }[] }>()

const { t } = useTalosI18n()
function titoloStrumento(tool: string): string {
    return talosToolConsentCopy({ name: tool, title: tool, description: '' }, t).title
}
</script>

<template>
    <p
        v-for="(esito, posizione) in esiti"
        :key="`${esito.tool}-${posizione}`"
        data-testid="talos-authorization-outcome"
        :data-esito="esito.concesso ? 'concesso' : 'negato'"
        class="mb-1.5 flex min-w-0 items-center gap-1.5 text-xs leading-5 text-[var(--talos-muted)]"
    >
        <ShieldCheck v-if="esito.concesso" class="size-3.5 shrink-0" aria-hidden="true" />
        <ShieldX v-else class="size-3.5 shrink-0" aria-hidden="true" />
        <span class="min-w-0 truncate">{{ esito.concesso ? $t('chat.permissionGranted') : $t('chat.permissionDenied') }} {{ titoloStrumento(esito.tool) }}</span>
    </p>
</template>
