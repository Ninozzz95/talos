<script setup lang="ts">
/**
 * «Ferma tutto» (owner 29/10/2026): il foglio del telefono che lo Stop apre con agenti al lavoro. PEZZO VERO per l'app:
 * `src/components/codice/TalosCodiceR4FermaTuttoSheet.vue`, montato da `CodiceR4Screen.vue` accanto agli altri fogli (`:1320-1395`; il tipo di `foglio` è a `:243`,
 * `foglio === 'ferma-tutto'`). Il guscio è il foglio di tutti i fogli del Codice (`TalosMobileComposerSheet`, come
 * `TalosCodiceR4ModoSheet.vue:96` e `TalosCodiceR4ComandiSheet.vue:65`): sale con la molla, si trascina, ✕ e Indietro chiudono.
 * Il mockup NON monta questo file (il foglio vero si teletrasporta nel `body`, fuori dalla cornice del telefono): monta il corpo,
 * `TalosCodiceR4FermaTuttoScelte.vue`, nella copia del guscio (`../FoglioCopia.vue`).
 */
import TalosMobileComposerSheet from '@/components/chat/TalosMobileComposerSheet.vue'
import { useTalosI18n } from '@/i18n'
import TalosCodiceR4FermaTuttoScelte from './TalosCodiceR4FermaTuttoScelte.vue'
import { testoFermaTuttoR4, type SceltaStopR4 } from '@/lib/harness/r4/fermaTuttoR4'

const props = defineProps<{ quante: number; occupato?: boolean }>()
const emit = defineEmits<{ scegli: [scelta: SceltaStopR4, ricorda: boolean]; close: [] }>()
const { locale } = useTalosI18n()
</script>

<template>
    <TalosMobileComposerSheet
        :title="testoFermaTuttoR4('foglio.titolo', locale, props.quante)"
        testid="talos-codice-r4-ferma-tutto-foglio"
        @close="emit('close')"
    >
        <TalosCodiceR4FermaTuttoScelte :quante="props.quante" :occupato="props.occupato" @scegli="(s, r) => emit('scegli', s, r)" />
    </TalosMobileComposerSheet>
</template>
