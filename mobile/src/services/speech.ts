/**
 * Owner 2026-07-24 — text-to-speech for assistant replies. Local-first: the
 * DEVICE speech synthesizer (Web Speech API, present in the Android WebView),
 * no backend, offline. Selectable voices ("models") + rate/pitch ("tones").
 * Provider-backed neural TTS (OpenAI/ElevenLabs) is a future extension gated on
 * keys + network; this is the honest on-device path.
 */
export interface TalosSpeechVoice {
    voiceURI: string
    name: string
    lang: string
}

export interface TalosSpeechUtterance {
    text: string
    voiceURI?: string
    rate: number
    pitch: number
    onend?: () => void
    onerror?: () => void
}

/** The subset of the platform synthesizer we use; injectable for tests. */
export interface TalosSpeechSynth {
    getVoices(): TalosSpeechVoice[]
    speak(utterance: TalosSpeechUtterance): void
    cancel(): void
}

export interface TalosSpeakOptions {
    voiceURI?: string
    rate?: number
    pitch?: number
    onend?: () => void
    onerror?: () => void
}

export interface TalosSpeechService {
    supported(): boolean
    voices(): TalosSpeechVoice[]
    speak(text: string, options?: TalosSpeakOptions): Promise<void>
    stop(): void
}

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value))

export function createTalosSpeechService(synth: TalosSpeechSynth | null): TalosSpeechService {
    return {
        supported() {
            return synth !== null
        },
        voices() {
            return synth ? synth.getVoices() : []
        },
        async speak(text, options = {}) {
            if (!synth) return
            const trimmed = text.trim()
            if (!trimmed) return
            // Always cancel first so two replies never talk over each other.
            synth.cancel()
            synth.speak({
                text: trimmed,
                voiceURI: options.voiceURI,
                rate: clamp(options.rate ?? 1, 0.5, 2),
                pitch: clamp(options.pitch ?? 1, 0, 2),
                onend: options.onend,
                onerror: options.onerror,
            })
        },
        stop() {
            synth?.cancel()
        },
    }
}

/**
 * The production adapter over the real `window.speechSynthesis`. Returns null
 * when the platform has no synthesizer (honest unsupported).
 */
export function talosPlatformSpeechSynth(): TalosSpeechSynth | null {
    if (typeof window === 'undefined' || !('speechSynthesis' in window) || typeof window.SpeechSynthesisUtterance !== 'function') {
        return null
    }
    const platform = window.speechSynthesis
    return {
        getVoices() {
            return platform.getVoices().map((v) => ({ voiceURI: v.voiceURI, name: v.name, lang: v.lang }))
        },
        speak(utterance) {
            const u = new SpeechSynthesisUtterance(utterance.text)
            u.rate = utterance.rate
            u.pitch = utterance.pitch
            if (utterance.voiceURI) {
                const voice = platform.getVoices().find((v) => v.voiceURI === utterance.voiceURI)
                if (voice) u.voice = voice
            }
            if (utterance.onend) u.onend = () => utterance.onend?.()
            if (utterance.onerror) u.onerror = () => utterance.onerror?.()
            platform.speak(u)
        },
        cancel() {
            platform.cancel()
        },
    }
}

let singleton: TalosSpeechService | null = null

export function useTalosSpeechService(): TalosSpeechService {
    if (!singleton) singleton = createTalosSpeechService(talosPlatformSpeechSynth())
    return singleton
}
