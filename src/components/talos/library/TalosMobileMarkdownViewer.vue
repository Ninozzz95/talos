<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { X } from '@lucide/vue'
import { useTalosI18n } from '@/i18n'
import { useChatController } from '@/stores/chatController'
import TalosMobileMessageContent from '@/components/chat/TalosMobileMessageContent.vue'

/**
 * ⭐⭐⭐ GUARDARE UN MARKDOWN DENTRO TALOS, FORMATTATO.
 *
 * ## Il difetto, doppio, misurato dallo stesso screenshot owner del 22/8
 *
 * Rilievo 5: «i file MD non sono formattati» — dove un MD si legge già (il
 * pannello media della chat) arrivava come testo grezzo in un `<pre>`.
 * Rilievo 6: «non è possibile cliccare sul file MD appena creato dalla
 * scheda chat» — la scheda «Documento» non aveva NESSUN posto dove aprirlo,
 * lo stesso difetto del PDF prima della sua cura (2026-08-17).
 *
 * ⇒ Un solo visualizzatore per entrambi i punti di ingresso, non due cure
 * separate: la stessa `TalosMobileMessageContent` che già rende il
 * Markdown di ogni messaggio di chat, montata qui sopra un testo intero
 * invece che sopra una risposta in streaming. Stesso motore, stesso
 * risultato — un `##` è un titolo ovunque appaia in TALOS.
 *
 * ⛔ Pigro come il visualizzatore PDF, ma a un livello sopra: chi non apre
 * mai un documento non paga NEMMENO questo file, montato con `import()`
 * pigro da `TalosMobileSchedaAzione.vue` e dal pannello media della chat.
 * Dentro, `TalosMobileMessageContent` è importata diretta — è già oltre il
 * confine pigro, e nidificare un secondo `import()` qui non toglie un byte
 * al grafo d'avvio: aggiungerebbe solo un giro d'attesa inutile.
 */
const props = defineProps<{
    /** L'id in Libreria del file, per leggerne il testo con `hydrateText`. */
    fileId: string
    /** Il nome vero: entra nel titolo e in ogni nome accessibile. */
    nome: string
}>()

const emit = defineEmits<{ chiudi: [] }>()

const { t } = useTalosI18n()
const chatController = useChatController()

const testo = ref<string | null>(null)
const caricando = ref(false)
/** ⛔ Stesso motivo del PDF: «non si apre» e «file vuoto» sono due frasi
 * diverse, e un riquadro muto lascerebbe credere alla seconda. */
const fallito = ref(false)

async function carica(): Promise<void> {
    caricando.value = true
    fallito.value = false
    testo.value = null
    try {
        const esito = await chatController.attachments.hydrateText(props.fileId)
        if (esito === null) { fallito.value = true; return }
        testo.value = esito
    } catch {
        fallito.value = true
    } finally {
        caricando.value = false
    }
}

onMounted(() => { void carica() })
watch(() => props.fileId, () => { void carica() })
</script>

<template>
    <div
        class="fixed inset-0 z-[80] flex flex-col bg-[var(--talos-background)]"
        role="dialog"
        aria-modal="true"
        :aria-label="props.nome"
        data-testid="talos-markdown-viewer"
    >
        <header class="flex items-center gap-2 px-4 py-3">
            <p class="min-w-0 flex-1 truncate text-sm text-[var(--talos-text)]">{{ props.nome }}</p>
            <button
                type="button"
                class="talos-pressable min-h-touch rounded-full px-3"
                :aria-label="t('common.close')"
                data-testid="talos-markdown-viewer-close"
                @click="emit('chiudi')"
            >
                <X class="size-5" aria-hidden="true" />
            </button>
        </header>

        <div class="min-h-0 flex-1 overflow-auto px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <!--
                ⛔ Nessun `data-testid` qui: il componente porta già il
                proprio (`talos-mobile-message-content`) sulla radice, e Vue
                lo preferisce a un attributo passato dall'esterno con lo
                stesso nome.
            -->
            <TalosMobileMessageContent
                v-if="testo !== null"
                :content="testo"
            />
            <p
                v-else-if="fallito"
                class="px-6 py-8 text-center text-sm text-[var(--talos-muted)]"
                data-testid="talos-markdown-viewer-errore"
            >{{ t('library.mdNonSiApre') }}</p>
            <p
                v-else
                class="px-6 py-8 text-center text-sm text-[var(--talos-muted)]"
                data-testid="talos-markdown-viewer-attesa"
            >{{ t('common.loading') }}</p>
        </div>
    </div>
</template>
