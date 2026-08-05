<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useTalosI18n } from '@/i18n'
import { Volume2 } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import TalosThemedSelect from '@/components/talos/ui/TalosThemedSelect.vue'
import { useSettingsStore } from '@/stores/settings'
import { useTalosSpeechService, type TalosSpeechVoice } from '@/services/speech'
import { parseTalosDictationLanguageMode } from '@/lib/dictationPolicy'

/**
 * Owner 2026-07-24 — Voice (text-to-speech) settings: pick the device voice
 * ("model") and rate/pitch ("tone"), with a live preview. Local-first: the
 * device synthesizer, no backend. Honestly hidden when unsupported.
 */
const settings = useSettingsStore()
const { t } = useTalosI18n()
const service = useTalosSpeechService()
const supported = service.supported()
const voices = ref<TalosSpeechVoice[]>([])

onMounted(() => {
    voices.value = service.voices()
    // Some engines populate voices asynchronously — re-read shortly after.
    if (voices.value.length === 0) window.setTimeout(() => { voices.value = service.voices() }, 300)
})

const selectedVoice = computed({
    get: () => settings.state.voice.voice_uri ?? '',
    set: (value: string) => { void settings.setVoicePreferences({ voice_uri: value || null }) },
})
const dictationLanguage = computed({
    get: () => settings.state.voice.dictation_language,
    set: (value: string) => {
        void settings.setVoicePreferences({
            dictation_language: parseTalosDictationLanguageMode(value),
        })
    },
})
const dictationLanguageItems = computed(() => [
    { value: 'system', label: t('voice.dictationSystem') },
    { value: 'en', label: t('voice.dictationEnglish') },
    { value: 'it', label: t('voice.dictationItalian') },
])
const voiceItems = computed(() => voices.value.map((voice) => ({
    value: voice.voiceURI,
    label: `${voice.name} (${voice.lang})`,
})))
function setRate(event: Event): void {
    void settings.setVoicePreferences({ rate: Number((event.target as HTMLInputElement).value) })
}
function setPitch(event: Event): void {
    void settings.setVoicePreferences({ pitch: Number((event.target as HTMLInputElement).value) })
}
function preview(): void {
    void service.speak(t('voice.previewPhrase'), {
        voiceURI: settings.state.voice.voice_uri ?? undefined,
        rate: settings.state.voice.rate,
        pitch: settings.state.voice.pitch,
    })
}
</script>

<template>
    <section data-testid="talos-voice-settings" class="border-t border-[var(--talos-border)] pt-3">
        <h4 class="flex items-center gap-2 text-sm font-semibold text-[var(--talos-text)]">
            <Volume2 class="size-4 text-[var(--talos-accent)]" aria-hidden="true" /> {{ t('voice.title') }}
        </h4>
        <p class="mt-1 text-xs leading-5 text-[var(--talos-muted)]">
            {{ t('voice.body') }}
        </p>

        <div data-testid="talos-dictation-language" class="mt-3">
            <span class="block text-xs font-medium text-[var(--talos-text)]">{{ t('voice.dictationTitle') }}</span>
            <p class="mt-0.5 text-xs leading-5 text-[var(--talos-muted)]">
                {{ t('voice.dictationBody') }}
            </p>
            <TalosThemedSelect
                v-model="dictationLanguage"
                class="mt-2"
                :items="dictationLanguageItems"
                :aria-label="t('voice.dictationTitle')"
            />
        </div>

        <div v-if="supported" data-testid="talos-tts-controls" class="mt-4 border-t border-[var(--talos-border)] pt-3">
            <h5 class="text-xs font-semibold text-[var(--talos-text)]">{{ t('voice.readAloudTitle') }}</h5>
            <p class="mt-0.5 text-xs leading-5 text-[var(--talos-muted)]">{{ t('voice.readAloudBody') }}</p>

            <label class="mt-3 block">
                <span class="mb-1 block text-xs font-medium text-[var(--talos-muted)]">{{ t('voice.readAloudVoice') }}</span>
                <!-- Cleanup 2026-07-24: the shared themed select (not a raw
                     native <select>) keeps every Settings picker coherent. -->
                <TalosThemedSelect
                    v-model="selectedVoice"
                    :items="voiceItems"
                    :aria-label="t('voice.readAloudVoice')"
                    :none-label="t('voice.deviceDefault')"
                />
            </label>

            <label class="mt-3 block">
                <span class="mb-1 flex items-center justify-between text-xs font-medium text-[var(--talos-muted)]">
                    <span>{{ t('voice.rate') }}</span><span>{{ settings.state.voice.rate.toFixed(1) }}×</span>
                </span>
                <input type="range" min="0.5" max="2" step="0.1" :value="settings.state.voice.rate" :aria-label="t('voice.rateAria')" class="w-full accent-[var(--talos-accent)]" @input="setRate">
            </label>

            <label class="mt-3 block">
                <span class="mb-1 flex items-center justify-between text-xs font-medium text-[var(--talos-muted)]">
                    <span>{{ t('voice.pitch') }}</span><span>{{ settings.state.voice.pitch.toFixed(1) }}</span>
                </span>
                <input type="range" min="0" max="2" step="0.1" :value="settings.state.voice.pitch" :aria-label="t('voice.pitchAria')" class="w-full accent-[var(--talos-accent)]" @input="setPitch">
            </label>

            <Button type="button" variant="outline" data-testid="talos-voice-preview" class="talos-pressable mt-3 min-h-touch gap-2 rounded-xl" @click="preview">
                <Volume2 class="size-4" aria-hidden="true" /> {{ t('voice.preview') }}
            </Button>
        </div>
    </section>
</template>
