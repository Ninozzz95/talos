import { readonly, ref } from 'vue'
import { useSettingsStore } from '@/stores/settings'
import { useTalosMobileToasts } from '@/stores/toasts'
import { useTalosI18n } from '@/i18n'

/**
 * Owner 2026-07-24 — la lettura ad alta voce di UNA risposta alla volta. Il
 * pulsante mostra «sta leggendo questo messaggio», così può diventare «ferma».
 *
 * ## ⛔ Perché il motore si carica solo quando si TOCCA
 *
 * Owner 2026-08-10: «ogni messaggio di risposta deve avere icona sound per
 * tts». L'icona quindi c'è sempre, e non dipende più da una domanda al motore.
 *
 * ⇒ Se non serve chiedergli niente per disegnare, non serve nemmeno averlo in
 * pagina: `@/services/speech` arriva con un import dinamico al primo tocco.
 * MISURATO: toglie il modulo dal grafo d'avvio, che è già oltre il tetto
 * (compito #51), e nessuno paga un motore vocale per aprire una chat.
 *
 * ⛔ E il motivo per cui NON si può sbagliare questa scelta: il pulsante prima
 * era dietro `speech.supported`, che sulla WebView di Android è **sempre
 * falso** — `speechSynthesis` non esiste lì. Risultato: l'icona non compariva
 * su nessun messaggio, su nessun telefono. Chiedere al motore il permesso di
 * disegnare era proprio la riga sbagliata.
 */
const speakingId = ref<string | null>(null)

export function useTalosSpeech() {
    const settings = useSettingsStore()
    const toasts = useTalosMobileToasts()
    const { t } = useTalosI18n()

    async function stop(): Promise<void> {
        speakingId.value = null
        const { useTalosSpeechService } = await import('@/services/speech')
        useTalosSpeechService().stop()
    }

    async function toggle(id: string, text: string): Promise<void> {
        if (speakingId.value === id) {
            await stop()
            return
        }
        speakingId.value = id
        const { useTalosSpeechService } = await import('@/services/speech')
        await useTalosSpeechService().speak(text, {
            voiceURI: settings.state.voice.voice_uri ?? undefined,
            rate: settings.state.voice.rate,
            pitch: settings.state.voice.pitch,
            onend: () => { if (speakingId.value === id) speakingId.value = null },
            onerror: (reason) => {
                if (speakingId.value === id) speakingId.value = null
                toasts.push({ message: t(frasePerIlMotivo(reason)) })
            },
        })
    }

    return {
        speakingId: readonly(speakingId),
        toggle,
        stop,
    }
}

/**
 * Perché non è partita la voce, detto a chi ha premuto.
 *
 * ⛔ MISURATO sul Pad il 2026-08-10: col telefono in silenzioso il motore
 * risponde `{spoken:false, reason:"silenced"}` — cioè si comporta bene. Ma
 * senza questa riga il pulsante tornava da solo com'era, e chi l'aveva toccato
 * vedeva **niente**: identico a un pulsante rotto.
 */
function frasePerIlMotivo(reason: string | undefined): string {
    switch (reason) {
        case 'silenced': return 'chat.speakSilenced'
        case 'unavailable': return 'chat.speakUnavailable'
        case 'empty': return 'chat.speakEmpty'
        default: return 'chat.speakFailed'
    }
}

export function __resetTalosSpeechForTests(): void {
    speakingId.value = null
}
