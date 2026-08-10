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

/**
 * ⭐ QUALI RISPOSTE SONO STATE LETTE AD ALTA VOCE, su richiesta.
 *
 * Owner 2026-08-10: «l'icona prima del testo è solo un segnalino per far capire
 * che la chat ha parlato ad alta voce su richiesta dell'utente… non deve
 * apparire se non si chiede alla chat di parlare».
 *
 * ⛔ È un SEGNALINO, non un comando: il comando resta sotto, accanto a «copia»,
 * ed è sempre presente. Due cose diverse che si somigliavano — per questo il
 * segnalino usa un'icona diversa, come ha chiesto l'owner.
 *
 * ⛔ Vive quanto la SESSIONE, non quanto la chat: riaprendo l'app il segnalino
 * sparisce. È una scelta, non una dimenticanza — «questa risposta l'ho appena
 * sentita» è un fatto del momento, e persisterlo vorrebbe dire scrivere nel
 * database una riga per ogni ascolto.
 */
const lette = ref<ReadonlySet<string>>(new Set())

/**
 * Quanti caratteri di ogni risposta sono gia' stati mandati al motore.
 *
 * ⛔ Senza questo, a ogni pezzo che arriva si rileggerebbe tutto dall'inizio —
 * la voce ricomincerebbe da capo a ogni parola.
 */
const quantoDetto = new Map<string, number>()

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
        // ⛔ Si segna PRIMA di parlare, non a fine lettura: il segnalino deve
        // comparire quando la persona chiede, non quando il motore finisce.
        lette.value = new Set([...lette.value, id])
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

    /**
     * ⭐⭐ LEGGE MENTRE LA RISPOSTA SI SCRIVE — owner 2026-08-10: «il TTS deve
     * partire di pari passo con il rendering della risposta».
     *
     * Si chiama a ogni pezzo che arriva, col testo accumulato dall'inizio. Dice
     * solo le FRASI COMPLETE nuove, e le accoda: cosi' la voce insegue il testo
     * invece di partire alla fine, quando la risposta e' gia' stata letta con
     * gli occhi.
     *
     * ⛔ Non fa niente se quella risposta non e' stata chiesta ad alta voce: la
     * lettura resta una cosa che si chiede, non una che parte da sola.
     */
    async function seguiIlTesto(id: string, testo: string, finito: boolean): Promise<void> {
        if (speakingId.value !== id) return
        const detto = quantoDetto.get(id) ?? 0
        const { talosFrasiDaLeggere } = await import('@/lib/voice/frasiDaLeggere')
        const { pronte, resto } = talosFrasiDaLeggere(testo, detto, finito)
        if (!pronte.length) return
        quantoDetto.set(id, testo.length - resto.length)
        const { useTalosSpeechService } = await import('@/services/speech')
        const servizio = useTalosSpeechService()
        for (const frase of pronte) {
            await servizio.speak(frase, {
                voiceURI: settings.state.voice.voice_uri ?? undefined,
                rate: settings.state.voice.rate,
                pitch: settings.state.voice.pitch,
                // ⛔ In coda: se no ogni frase ammazza la precedente a meta'.
                queue: 'add',
                onend: finito && frase === pronte[pronte.length - 1]
                    ? () => { if (speakingId.value === id) speakingId.value = null }
                    : undefined,
            })
        }
    }

    return {
        speakingId: readonly(speakingId),
        seguiIlTesto,
        /** Le risposte che sono state chieste ad alta voce in questa sessione. */
        lette: readonly(lette),
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
