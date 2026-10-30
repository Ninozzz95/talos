<script setup lang="ts">
import { ref } from 'vue'
import { CornerUpLeft, EllipsisVertical, Info, RotateCcw, Share2, TextSelect, Trash2 } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import TalosMobileComposerSheet from '@/components/chat/TalosMobileComposerSheet.vue'
import { TALOS_AZIONI_MESSAGGIO_TUTTE, type TalosAzioneMessaggio, type TalosMobileMessageView } from '@/components/chat/mobileChatTypes'

/**
 * «Azioni messaggio» — owner 2026-09-13, decisioni prese una per una.
 *
 * ⛔ Prima era un menu a tendina che RIPETEVA le azioni gia' in riga (copia,
 * riprova, libreria), non ne aveva nessuna di gestione, e copriva il testo della
 * risposta. Le regole che lo sostituiscono:
 * - riga e foglio hanno INTERSEZIONE VUOTA: copia, ascolta, riprova, libreria e
 *   modifica restano solo in riga, e qui non compaiono;
 * - risposta: Condividi · Dettagli esecuzione · Elimina;
 * - persona: Invia di nuovo · Riutilizza prompt · Elimina;
 * - si apre come FOGLIO DAL BASSO, come «Azioni messaggio» del mockup, e la
 *   pressione lunga sul messaggio apre lo stesso foglio (clicca questo pulsante).
 *
 * Il foglio porta dialogo modale, trappola del fuoco, chiusura col gesto e col
 * pulsante visibile, e fuoco restituito all'apertura: la ricerca del 13/09 lo
 * chiede perche' il trascinamento da solo non e' accessibile a tutti.
 */
const props = withDefaults(defineProps<{
    message: TalosMobileMessageView
    busy?: boolean
    canRetry?: boolean
    /** K3-B2: solo le voci che chi monta la lista sa fare; di serie tutte (la chat). */
    azioni?: readonly TalosAzioneMessaggio[]
}>(), { azioni: () => TALOS_AZIONI_MESSAGGIO_TUTTE })
const puo = (azione: TalosAzioneMessaggio): boolean => props.azioni.includes(azione)
const emit = defineEmits<{
    /** Owner 24/10/2026 «Come Happy»: il testo del messaggio in un foglio dove si seleziona (sempre, come Copia e Ascolta). */
    selectText: [message: TalosMobileMessageView]
    reuse: [message: TalosMobileMessageView]
    resend: [message: TalosMobileMessageView]
    share: [message: TalosMobileMessageView]
    details: [message: TalosMobileMessageView]
    delete: [message: TalosMobileMessageView]
}>()

const open = ref(false)

function pickSelectText(message: TalosMobileMessageView): void { open.value = false; emit('selectText', message) }
function pickReuse(message: TalosMobileMessageView): void { open.value = false; emit('reuse', message) }
function pickResend(message: TalosMobileMessageView): void { open.value = false; emit('resend', message) }
function pickShare(message: TalosMobileMessageView): void { open.value = false; emit('share', message) }
function pickDetails(message: TalosMobileMessageView): void { open.value = false; emit('details', message) }
function pickDelete(message: TalosMobileMessageView): void { open.value = false; emit('delete', message) }
</script>

<template>
    <Button
        type="button"
        variant="ghost"
        size="icon"
        data-message-overflow-trigger
        data-testid="talos-message-overflow"
        class="min-h-touch min-w-touch"
        aria-haspopup="dialog"
        :aria-expanded="open"
        :aria-label="$t('chat.moreMessageActions')"
        :title="$t('chat.moreMessageActions')"
        @click="open = true"
    >
        <EllipsisVertical class="size-4" aria-hidden="true" />
    </Button>
    <TalosMobileComposerSheet
        v-if="open"
        :title="$t('chat.messageActions')"
        testid="talos-message-actions-sheet"
        @close="open = false"
    >
        <ul class="talos-message-sheet-list" role="list">
            <!-- Owner 24/10/2026 «Come Happy» (`MarkdownView.tsx:38-63`): il tocco prolungato apre questo foglio e non più anche la
                 selezione di Android; il testo si seleziona qui, sempre, per l'utente e per l'assistente, in Chat e nel Codice -->
            <li>
                <button
                    type="button"
                    class="talos-message-sheet-row"
                    data-testid="talos-message-select-text"
                    :aria-label="$t('chat.selectText')"
                    @click="pickSelectText(message)"
                >
                    <TextSelect class="talos-message-sheet-icon" aria-hidden="true" />
                    <span>{{ $t('chat.selectText') }}</span>
                </button>
            </li>
            <template v-if="message.role === 'user'">
                <li v-if="puo('invia-di-nuovo')">
                    <button
                        type="button"
                        class="talos-message-sheet-row"
                        data-testid="talos-message-resend"
                        :disabled="busy"
                        :aria-label="$t('chat.resendMessage')"
                        @click="pickResend(message)"
                    >
                        <RotateCcw class="talos-message-sheet-icon" aria-hidden="true" />
                        <span>{{ $t('chat.resendMessage') }}</span>
                    </button>
                </li>
                <li v-if="puo('riutilizza')">
                    <button
                        type="button"
                        class="talos-message-sheet-row"
                        data-testid="talos-message-reuse"
                        :aria-label="$t('chat.reusePrompt')"
                        @click="pickReuse(message)"
                    >
                        <CornerUpLeft class="talos-message-sheet-icon" aria-hidden="true" />
                        <span>{{ $t('chat.reusePrompt') }}</span>
                    </button>
                </li>
            </template>
            <template v-else>
                <li v-if="puo('condividi')">
                    <button
                        type="button"
                        class="talos-message-sheet-row"
                        data-testid="talos-message-share"
                        :disabled="message.content.trim() === ''"
                        :aria-label="$t('common.share')"
                        @click="pickShare(message)"
                    >
                        <Share2 class="talos-message-sheet-icon" aria-hidden="true" />
                        <span>{{ $t('common.share') }}</span>
                    </button>
                </li>
                <li v-if="puo('dettagli')">
                    <button
                        type="button"
                        class="talos-message-sheet-row"
                        data-testid="talos-message-details"
                        :aria-label="$t('chat.runDetails')"
                        @click="pickDetails(message)"
                    >
                        <Info class="talos-message-sheet-icon" aria-hidden="true" />
                        <span>{{ $t('chat.runDetails') }}</span>
                    </button>
                </li>
            </template>
            <!-- «Seleziona testo» sta sempre sopra: la riga separa sempre «Elimina» -->
            <li v-if="puo('elimina')" class="talos-message-sheet-rule" aria-hidden="true" />
            <li v-if="puo('elimina')">
                <button
                    type="button"
                    class="talos-message-sheet-row talos-message-sheet-row--danger"
                    data-testid="talos-message-delete"
                    :disabled="busy"
                    :aria-label="$t('chat.deleteTurn')"
                    @click="pickDelete(message)"
                >
                    <Trash2 class="talos-message-sheet-icon talos-message-sheet-icon--danger" aria-hidden="true" />
                    <span>{{ $t('chat.deleteTurn') }}</span>
                </button>
            </li>
        </ul>
    </TalosMobileComposerSheet>
</template>

<style scoped>
.talos-message-sheet-list { display: flex; flex-direction: column; padding-bottom: var(--talos-space-inline, 0.5rem); }
/* Righe come «quick-row» del mockup: icona nuda ambra, una sola verticale sinistra. */
.talos-message-sheet-row {
    display: flex;
    align-items: center;
    gap: var(--talos-space-control, 0.75rem);
    width: 100%;
    min-height: var(--talos-touch-target, 3rem);
    padding-inline: 0.75rem;
    border-radius: var(--talos-radius-control);
    background: transparent;
    color: var(--talos-text);
    text-align: left;
    font-size: var(--text-md);
}
.talos-message-sheet-row:disabled { opacity: 0.5; }
.talos-message-sheet-row:focus-visible { outline: 2px solid var(--talos-ring); outline-offset: 2px; }
.talos-message-sheet-icon { width: 1.125rem; height: 1.125rem; flex: none; color: var(--talos-accent); }
/*
 * La coppia di pericolo, non il solo colore: talosContrast.ts garantisce --talos-danger
 * leggibile SOLO su --talos-danger-soft. Stessa scelta di TalosRowActions.vue.
 */
.talos-message-sheet-row.talos-message-sheet-row--danger { background: var(--talos-danger-soft); color: var(--talos-danger); }
.talos-message-sheet-icon.talos-message-sheet-icon--danger { color: currentColor; }
.talos-message-sheet-rule { height: 1px; margin-block: 0.25rem; background: var(--talos-border); }
@media (hover: hover) and (pointer: fine) {
    .talos-message-sheet-row:hover:not(:disabled) { background: var(--talos-panel-soft, var(--talos-panel)); }
}
</style>
