import { readonly, ref } from 'vue'
import { useTalosSpeechService } from '@/services/speech'
import { useSettingsStore } from '@/stores/settings'

/**
 * Owner 2026-07-24 — per-message TTS state. One reply speaks at a time; the
 * action button reflects "speaking this message" so it can toggle to Stop.
 * Uses the persisted voice/rate/pitch ("model"/"tone") preferences.
 */
const speakingId = ref<string | null>(null)

export function useTalosSpeech() {
    const service = useTalosSpeechService()
    const settings = useSettingsStore()

    function stop(): void {
        service.stop()
        speakingId.value = null
    }

    async function toggle(id: string, text: string): Promise<void> {
        if (speakingId.value === id) {
            stop()
            return
        }
        speakingId.value = id
        await service.speak(text, {
            voiceURI: settings.state.voice.voice_uri ?? undefined,
            rate: settings.state.voice.rate,
            pitch: settings.state.voice.pitch,
            onend: () => { if (speakingId.value === id) speakingId.value = null },
            onerror: () => { if (speakingId.value === id) speakingId.value = null },
        })
    }

    return {
        supported: service.supported(),
        speakingId: readonly(speakingId),
        toggle,
        stop,
    }
}

export function __resetTalosSpeechForTests(): void {
    speakingId.value = null
}
