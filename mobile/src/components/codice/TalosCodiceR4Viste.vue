<script setup lang="ts">
/**
 * ⛔ K3-TERM T4 = K3-C4 (ledger `LEDGER-K3-TERMINALE-2026-10-16.md`): «Chat · Terminale», le due viste vere del Codice su r4.
 * Owner 16/10, come il Codice vecchio: Codice stretto → barra in basso sotto il compositore (icona + parola, `.mobile-nav` di
 * `public/harness-ui/styles.css:1125`); Codice largo → schede nella testata. Le parole sono quelle del desktop (`chat.chat`,
 * `chat.terminal`). Il Browser non c'è finché il Codice su r4 non lo ha davvero (regola «No fake feature»).
 * ⛔ K3 Revisione (ledger `LEDGER-K3-REVISIONE-2026-10-17.md`): la terza vista, «Review», nell'ordine del desktop (Chat · Terminale ·
 * Review, `index.template.html:795`), col numero dei file scritti come la sua testata (`topbar.js:50-90`): niente numero a zero, e
 * niente mentre la storia si carica (`null`), dove il conto salirebbe fra numeri intermedi.
 */
import { computed } from 'vue'
import { FileDiff, MessageSquare, SquareTerminal } from '@lucide/vue'
import { useTalosI18n } from '@/i18n'
import { testoTerminaleR4 } from '@/lib/harness/r4/terminaleR4'
import { testoRevisioneR4 } from '@/lib/harness/r4/revisioneR4'

export type VistaCodiceR4 = 'chat' | 'terminale' | 'revisione'

const props = defineProps<{ vista: VistaCodiceR4; forma: 'barra' | 'schede'; fileRevisione?: number | null }>()
const emit = defineEmits<{ scegli: [VistaCodiceR4] }>()
const { locale } = useTalosI18n()

const viste = computed(() => [
    { id: 'chat' as const, nome: testoTerminaleR4('modello.chat.chat', locale.value), icona: MessageSquare, numero: null },
    { id: 'terminale' as const, nome: testoTerminaleR4('modello.chat.terminal', locale.value), icona: SquareTerminal, numero: null },
    {
        id: 'revisione' as const, nome: testoRevisioneR4('modello.review.review', locale.value), icona: FileDiff,
        numero: Number.isFinite(props.fileRevisione) && (props.fileRevisione as number) > 0 ? props.fileRevisione as number : null,
    },
])
</script>

<template>
    <div
        data-testid="talos-codice-r4-viste"
        :data-forma="props.forma"
        role="tablist"
        :aria-label="testoTerminaleR4('mobile.viste.label', locale)"
        :class="props.forma === 'barra' ? 'talos-codice-r4-viste-barra' : 'talos-codice-r4-viste-schede'"
    >
        <button
            v-for="v in viste"
            :key="v.id"
            type="button"
            role="tab"
            :data-testid="`talos-codice-r4-vista-${v.id}`"
            :aria-selected="props.vista === v.id"
            class="talos-codice-r4-vista"
            @click="emit('scegli', v.id)"
        >
            <component :is="v.icona" v-if="props.forma === 'barra'" class="size-[18px]" aria-hidden="true" />
            <span class="inline-flex items-center"><span>{{ v.nome }}</span><span
                v-if="v.numero !== null"
                :data-testid="`talos-codice-r4-vista-${v.id}-numero`"
                class="talos-codice-r4-scheda-numero"
            >{{ v.numero }}</span></span>
        </button>
    </div>
</template>
