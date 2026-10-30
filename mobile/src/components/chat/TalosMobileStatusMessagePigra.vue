<script setup lang="ts">
/**
 * La scheda d'errore e di stato della chat, caricata a richiesta (29/10, OK del Desktop: il pulsante di Ollama, ASS-148, sforava il
 * tetto d'avvio di 395 byte, e la scheda vera porta con sé `erroreLeggibile` e `talosMessageState`, circa 7 KB).
 *
 * ⛔ Condizione del Desktop: un errore non può sparire perché il caricamento di chi lo mostra è fallito (pezzo vecchio dopo un
 * aggiornamento, poca memoria, WebView ricaricata a metà). ⇒ Qui, sincrona e nel pezzo d'avvio, c'è una riga minima col testo che
 * arriva (senza la traduzione di `erroreLeggibile`) e il ruolo giusto: si vede subito, e resta se la scheda vera non arriva.
 * Non si usa `defineAsyncComponent`: ai suoi `loadingComponent`/`errorComponent` Vue non passa le props, e la riga non saprebbe il testo.
 */
import { computed, onMounted, shallowRef, type Component } from 'vue'
import type { TalosMobileMessageView } from '@/components/chat/mobileChatTypes'
import { caricaSchedaDiStato } from '@/components/chat/caricaSchedaDiStato'

const props = defineProps<{ message: TalosMobileMessageView }>()
const Vera = shallowRef<Component | null>(null)
const errore = computed(() => {
    const e = (props.message.metadata as Record<string, unknown> | undefined)?.chat_error as Record<string, unknown> | undefined
    return typeof e?.message === 'string' && e.message ? e.message : null
})

onMounted(() => {
    caricaSchedaDiStato().then((c) => { Vera.value = c }, () => { /* resta la riga minima: l'errore si legge lo stesso */ })
})
</script>

<template>
    <component :is="Vera" v-if="Vera" :message="message" />
    <p
        v-else
        data-testid="talos-mobile-status-minima"
        :role="errore ? 'alert' : 'status'"
        class="mx-auto min-w-0 max-w-full break-words px-3 py-1 text-center text-xs text-[var(--talos-muted)] [overflow-wrap:anywhere]"
    >{{ errore ?? message.content }}</p>
</template>
