<script setup lang="ts">
/**
 * K3-RISDEL, K3-AP1 e K3-AP2: le righe di sistema che solo il Codice su r4 produce, dietro un solo componente pigro della lista della chat
 * (che parte all'avvio: un caricatore in meno nel pacchetto d'avvio). Il risultato di un sotto-agente, la carta d'approvazione, quella delle domande o la nota dello Stop;
 * la carta del piano (K3 piano); una voce storta resta la riga di stato della chat, com'era prima.
 */
import { computed } from 'vue'
import type { TalosMobileMessageView } from '@/components/chat/mobileChatTypes'
import TalosMobileStatusMessage from '@/components/chat/TalosMobileStatusMessage.vue'
import TalosCodiceR4RisultatoDelega from '@/components/codice/TalosCodiceR4RisultatoDelega.vue'
import TalosCodiceR4Approvazione from '@/components/codice/TalosCodiceR4Approvazione.vue'
import TalosCodiceR4Domanda from '@/components/codice/TalosCodiceR4Domanda.vue'
import TalosCodiceR4Fermato from '@/components/codice/TalosCodiceR4Fermato.vue'
import TalosCodiceR4Piano from '@/components/codice/TalosCodiceR4Piano.vue'
import TalosCodiceR4CartaAutomazione from '@/components/codice/TalosCodiceR4CartaAutomazione.vue'
import { eCartaAutomazioneR4, eCartaFornitoriR4 } from '@/lib/harness/r4/automazioniR4'
import { TALOS_METADATA_RISULTATO_DELEGA, type VoceRisultatoDelegaR4 } from '@/lib/harness/r4/risultatoDelegaChiave'
import { TALOS_METADATA_APPROVAZIONE, type VoceApprovazioneR4 } from '@/lib/harness/r4/approvazioneChiave'
import { TALOS_METADATA_DOMANDA, type VoceDomandaR4 } from '@/lib/harness/r4/domandaChiave'
import { TALOS_METADATA_FERMATO, type VoceFermatoR4 } from '@/lib/harness/r4/fermatoChiave'
import { TALOS_METADATA_PIANO, type VocePianoR4 } from '@/lib/harness/r4/pianoChiave'

const props = defineProps<{ message: TalosMobileMessageView }>()
const risultato = computed(() => {
    const voce = props.message.metadata?.[TALOS_METADATA_RISULTATO_DELEGA] as VoceRisultatoDelegaR4 | undefined
    return voce && typeof voce === 'object' && typeof voce.testo === 'string' ? voce : null
})
const approvazione = computed(() => {
    const voce = props.message.metadata?.[TALOS_METADATA_APPROVAZIONE] as VoceApprovazioneR4 | undefined
    return voce && typeof voce === 'object' && typeof voce.requestId === 'string' && voce.azione && typeof voce.azione === 'object' ? voce : null
})
const domanda = computed(() => {
    const voce = props.message.metadata?.[TALOS_METADATA_DOMANDA] as VoceDomandaR4 | undefined
    return voce && typeof voce === 'object' && typeof voce.requestId === 'string' && Array.isArray(voce.questions) && voce.questions.length ? voce : null
})
// K3 Stop come il desktop (owner 16/10): la nota d'accento «Hai fermato il giro.»
const fermato = computed(() => {
    const voce = props.message.metadata?.[TALOS_METADATA_FERMATO] as VoceFermatoR4 | undefined
    return voce && typeof voce === 'object' && typeof voce.tecnico === 'string' ? voce : null
})
// K3 automazioni e fornitori: la carta della bozza al posto di quella generica (come `legacy/app.js:15382-15384`); mai per una figlia
const cartaAutomazione = computed(() => Boolean(approvazione.value && !approvazione.value.figlia
    && (eCartaAutomazioneR4(approvazione.value.azione) || eCartaFornitoriR4(approvazione.value.azione))))
// K3 piano: la carta del piano (una per piano, aggiornata sul posto)
const piano = computed(() => {
    const voce = props.message.metadata?.[TALOS_METADATA_PIANO] as VocePianoR4 | undefined
    return voce && typeof voce === 'object' && voce.proposta && typeof voce.proposta.planId === 'string' ? voce : null
})
</script>

<template>
    <TalosCodiceR4RisultatoDelega v-if="risultato" :voce="risultato" />
    <TalosCodiceR4CartaAutomazione v-else-if="approvazione && cartaAutomazione" :voce="approvazione" />
    <TalosCodiceR4Approvazione v-else-if="approvazione" :voce="approvazione" />
    <TalosCodiceR4Domanda v-else-if="domanda" :voce="domanda" />
    <TalosCodiceR4Fermato v-else-if="fermato" :voce="fermato" />
    <TalosCodiceR4Piano v-else-if="piano" :voce="piano" />
    <TalosMobileStatusMessage v-else :message="message" />
</template>
