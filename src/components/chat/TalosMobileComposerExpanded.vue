<script setup lang="ts">
import { nextTick, onMounted, ref } from 'vue'
import { Minimize2, Square, ArrowUp } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { useTalosModalSurface } from '@/composables/useTalosModalSurface'
import { useTalosOverlayBack } from '@/composables/useTalosOverlayBack'

/**
 * Owner 2026-08-27: "voglio inserire un pulsante che fa espandere il
 * composer a tutto schermo per i testi più grandi". Un editor grande e
 * niente altro — nessuna logica di invio duplicata: `canSubmit`/`sending`
 * arrivano già calcolati dal composer normale (`TalosMobileComposer.vue`),
 * qui si limita a mostrarli sullo stesso testo (`prompt` è lo stesso
 * `v-model`, non una copia).
 *
 * Ricerca primaria prima di scrivere questo file: un thread reale di
 * Discourse Meta sullo stesso identico pulsante mostra che la tastiera può
 * coprire la parte bassa del composer espanso, al punto che il team ha
 * REVERTITO la feature (https://meta.discourse.org/t/expand-composer-button-on-mobile/296469).
 * Qui il rischio è strutturalmente diverso: l'app usa
 * `Keyboard.setResizeMode({ mode: KeyboardResize.Native })`
 * (`mobile/src/services/nativeFraming.ts`), quindi la WebView si
 * ridimensiona DAVVERO quando la tastiera si apre. `fixed inset-0` risolve
 * contro quel viewport reale (non un `100vh` statico), e il pulsante
 * d'invio vive dentro un `flex flex-col` ancorato al fondo di QUEL
 * contenitore — sopra la tastiera per costruzione, non per un calcolo a
 * mano. Verificato fisicamente sul Pad con tastiera aperta prima di
 * dichiarare il debito chiuso (vedi il piano).
 *
 * Invio: SOLO dal bottone. In un editor "per i testi più grandi" un Invio
 * che manda per sbaglio un messaggio lungo a metà sarebbe peggio di un
 * tocco in più — qui Invio scrive una riga nuova, come in un editor di
 * testo normale, non come nel composer compatto.
 */
const props = defineProps<{
    prompt: string
    sending: boolean
    canSubmit: boolean
}>()

const emit = defineEmits<{
    'update:prompt': [prompt: string]
    send: []
    stop: []
    close: []
}>()

const root = ref<HTMLElement | null>(null)
const field = ref<HTMLTextAreaElement | null>(null)
const { trapTab } = useTalosModalSurface(root)

function close(): void {
    emit('close')
}
useTalosOverlayBack(close)

onMounted(() => {
    void nextTick(() => field.value?.focus())
})

function updatePrompt(event: Event): void {
    emit('update:prompt', (event.currentTarget as HTMLTextAreaElement).value)
}

function onAction(): void {
    if (props.sending) { emit('stop'); return }
    if (!props.canSubmit) return
    emit('send')
}
</script>

<template>
    <Teleport to="body">
        <div
            ref="root"
            role="dialog"
            aria-modal="true"
            :aria-label="$t('chat.expandComposer')"
            tabindex="-1"
            data-testid="talos-composer-expanded"
            class="fixed inset-0 z-[85] flex flex-col bg-[var(--talos-window-bg)] text-[var(--talos-text)]"
            @keydown.escape="close"
            @keydown="trapTab"
        >
            <header class="flex shrink-0 items-center gap-2 px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2">
                <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    data-testid="talos-composer-collapse"
                    :aria-label="$t('chat.collapseComposer')"
                    :title="$t('chat.collapseComposer')"
                    class="talos-pressable min-h-touch min-w-touch rounded-2xl"
                    @click="close"
                >
                    <Minimize2 class="size-5" aria-hidden="true" />
                </Button>
                <span class="flex-1" aria-hidden="true" />
            </header>

            <div class="min-h-0 flex-1 overflow-y-auto px-4">
                <textarea
                    ref="field"
                    :value="prompt"
                    :aria-label="$t('chat.messagePlaceholder')"
                    :placeholder="$t('chat.messagePlaceholderEllipsis')"
                    class="h-full min-h-[40dvh] w-full resize-none bg-transparent text-base leading-7 text-[var(--talos-text,var(--foreground))] outline-none placeholder:text-[var(--talos-muted,var(--muted-foreground))]"
                    @input="updatePrompt"
                />
            </div>

            <div class="flex shrink-0 items-center justify-end gap-2 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2">
                <Button
                    type="button"
                    size="icon"
                    data-testid="talos-composer-expanded-action"
                    :aria-label="sending ? $t('chat.stopResponse') : $t('chat.sendMessage')"
                    :disabled="!sending && !canSubmit"
                    class="talos-pressable min-h-touch min-w-touch rounded-2xl bg-[var(--talos-accent,var(--primary))] text-[var(--talos-accent-contrast,var(--primary-foreground))]"
                    @click="onAction"
                >
                    <Square v-if="sending" class="size-4" aria-hidden="true" />
                    <ArrowUp v-else class="size-5" aria-hidden="true" />
                </Button>
            </div>
        </div>
    </Teleport>
</template>
