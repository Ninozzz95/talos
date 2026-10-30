<script setup lang="ts">
/**
 * ⛔ K3-C Accoda (ledger `LEDGER-K3-ACCODA-2026-10-16.md`; owner 16/10: la striscia della chat, «Modifica» riporta nel compositore).
 * La coda di r4 nella striscia della chat (`TalosMobileCodaDelGiro.vue`), come `TalosMobileCodaDellaChat.vue` la collega allo store
 * della chat: qui solo il collegamento, caricato a richiesta (la coda esiste solo quando qualcuno ha accodato). Lo stato lo dice r4
 * (`talos.coda`); le azioni escono per evento e la schermata le manda alle rotte della coda.
 *   · «Indirizza ora» a giro vivo, «Invia ora» a giro fermo, «Riprendi la coda» in pausa: tutte `POST /queue/invia {id}` (r4 la
 *     fa entrare come correzione a giro vivo, riprende la sessione a giro fermo, e scioglie la pausa);
 *   · le voci di sistema (risultato di un agente, comando in sottofondo…) hanno la frase del desktop e non si modificano.
 */
import { computed } from 'vue'
import TalosMobileCodaDelGiro from '@/components/chat/TalosMobileCodaDelGiro.vue'
import { useTalosI18n } from '@/i18n'
import { azioneCodaR4, partonoColProssimoR4, vociDellaStrisciaR4, type StatoCodaR4 } from '@/lib/harness/r4/codaR4'

const props = defineProps<{ coda: StatoCodaR4; giroVivo: boolean; sessioneId: string | null }>()
const emit = defineEmits<{ invia: [id: string]; togli: [id: string]; riporta: [id: string] }>()
const { locale } = useTalosI18n()

// la striscia vuole un'ora per voce; r4 non la manda e la striscia non la mostra: una costante, così le voci non cambiano a ogni disegno
const ORA = new Date(0).toISOString()
const voci = computed(() => vociDellaStrisciaR4(props.coda, { sessioneId: props.sessioneId, lingua: locale.value, ora: ORA }))
const azione = computed(() => azioneCodaR4(props.giroVivo))
const partonoColProssimo = computed(() => partonoColProssimoR4(props.coda, props.giroVivo))
// la modifica in linea non c'è (r4 non ha una rotta per modificare): la striscia usa `riporta`, mai questa funzione
const nessunaModifica = async () => ({ ok: false as const, rifiuto: 'nessuna-chat' })
</script>

<template>
    <TalosMobileCodaDelGiro
        v-if="voci.length > 0"
        :voci="voci"
        :in-pausa="coda.inPausa"
        :azione="azione"
        :altra-chat-in-corso="false"
        :partono-col-prossimo="partonoColProssimo"
        :salva-modifica="nessunaModifica"
        modifica="riporta"
        @principale="(id) => emit('invia', id)"
        @togli="(id) => emit('togli', id)"
        @riprendi="() => voci[0] && emit('invia', voci[0].id)"
        @riporta="(voce) => emit('riporta', voce.id)"
    />
</template>
