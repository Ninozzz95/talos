<script setup lang="ts">
/**
 * ⭐ B3 «Riprendi» (D-B3-03): rifà la risposta al tuo ultimo messaggio. Il parziale interrotto resta a schermo, non va al
 * modello; nessun messaggio tuo nuovo. Un esito negativo del giro lo racconta già la risposta (errore del fornitore):
 * qui si dice solo ciò che nessun altro dice, un'eccezione.
 *
 * Stava dentro `ChatScreen.vue`; è qui, caricato a richiesta, per il tetto del pacchetto d'avvio
 * (`scripts/verify-initial-chunk.mjs`): compare solo su una chat interrotta. Collegamento e parole identici a prima.
 */
import { ref } from 'vue'
import { RotateCcw } from '@lucide/vue'
import { useTalosI18n } from '@/i18n'
import { useChatController } from '@/stores/chatController'
import { useTalosMobileToasts } from '@/stores/toasts'

const emit = defineEmits<{
    /** Il giro riparte: la schermata torna in fondo alla conversazione. */
    rejoin: []
}>()

const controller = useChatController()
const { t } = useTalosI18n()
const toasts = useTalosMobileToasts()

const ripresaInCorso = ref(false)
async function onResumeTurn(): Promise<void> {
    if (ripresaInCorso.value) return
    ripresaInCorso.value = true
    emit('rejoin')
    try {
        await controller.resumeSession()
    } catch {
        toasts.push({ message: t('chat.resumeTurnFailed'), durationMs: 6000 })
    } finally {
        ripresaInCorso.value = false
    }
}
</script>

<template>
    <!--
        ⭐ B3 «Riprendi» (D-B3-03): in fondo alla conversazione, SOLO quando l'ultimo tuo messaggio non ha una
        risposta completa (interrotta, fallita, o l'app si è chiusa a metà). Non un pulsante sempre acceso:
        compare dove serve e dice cosa fa, perché «riprendi» da solo non dice se rifà, continua o riscrive.
    -->
    <div
        data-testid="talos-resume-turn-row"
        class="mx-auto flex w-full max-w-[820px] flex-wrap items-center gap-x-3 gap-y-1 px-3 pt-2"
    >
        <button
            type="button"
            data-testid="talos-resume-turn"
            aria-describedby="talos-resume-turn-hint"
            class="talos-pressable inline-flex min-h-touch items-center gap-2 rounded-full border border-[var(--talos-border-strong,var(--talos-border))] px-4 text-sm font-medium text-[var(--talos-text)] disabled:opacity-50"
            :disabled="ripresaInCorso"
            @click="onResumeTurn"
        >
            <RotateCcw class="size-4 text-[var(--talos-accent)]" aria-hidden="true" />
            {{ t('chat.resumeTurn') }}
        </button>
        <p
            id="talos-resume-turn-hint"
            data-testid="talos-resume-turn-hint"
            class="min-w-0 flex-1 basis-48 text-2xs leading-4 text-[var(--talos-muted)]"
        >{{ t('chat.resumeTurnHint') }}</p>
    </div>
</template>
