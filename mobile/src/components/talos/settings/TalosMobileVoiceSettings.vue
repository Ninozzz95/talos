<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Volume2 } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import TalosThemedSelect from '@/components/talos/ui/TalosThemedSelect.vue'
import { useSettingsStore } from '@/stores/settings'
import { useTalosSpeechService, type TalosSpeechVoice } from '@/services/speech'

/**
 * Owner 2026-07-24 — Voice (text-to-speech) settings: pick the device voice
 * ("model") and rate/pitch ("tone"), with a live preview. Local-first: the
 * device synthesizer, no backend. Honestly hidden when unsupported.
 */
const settings = useSettingsStore()
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
    void service.speak('This is how TALOS will read replies aloud.', {
        voiceURI: settings.state.voice.voice_uri ?? undefined,
        rate: settings.state.voice.rate,
        pitch: settings.state.voice.pitch,
    })
}
</script>

<template>
    <section v-if="supported" data-testid="talos-voice-settings" class="border-t border-[var(--talos-border)] pt-3">
        <h4 class="flex items-center gap-2 text-sm font-semibold text-[var(--talos-text)]">
            <Volume2 class="size-4 text-[var(--talos-accent)]" aria-hidden="true" /> Voice
        </h4>
        <p class="mt-1 text-xs leading-5 text-[var(--talos-muted)]">
            Read assistant replies aloud with a device voice. Tap the speaker on any reply.
        </p>

        <label class="mt-3 block">
            <span class="mb-1 block text-xs font-medium text-[var(--talos-muted)]">Voice</span>
            <!-- Cleanup 2026-07-24: the shared themed select (not a raw native
                 <select>) so the voice picker matches every other Settings
                 dropdown — same portal, keyboard nav and dark/accent surface. -->
            <TalosThemedSelect
                v-model="selectedVoice"
                :items="voiceItems"
                aria-label="Voice"
                none-label="Device default"
            />
        </label>

        <label class="mt-3 block">
            <span class="mb-1 flex items-center justify-between text-xs font-medium text-[var(--talos-muted)]">
                <span>Rate</span><span>{{ settings.state.voice.rate.toFixed(1) }}×</span>
            </span>
            <input type="range" min="0.5" max="2" step="0.1" :value="settings.state.voice.rate" aria-label="Speech rate" class="w-full accent-[var(--talos-accent)]" @input="setRate">
        </label>

        <label class="mt-3 block">
            <span class="mb-1 flex items-center justify-between text-xs font-medium text-[var(--talos-muted)]">
                <span>Pitch</span><span>{{ settings.state.voice.pitch.toFixed(1) }}</span>
            </span>
            <input type="range" min="0" max="2" step="0.1" :value="settings.state.voice.pitch" aria-label="Speech pitch" class="w-full accent-[var(--talos-accent)]" @input="setPitch">
        </label>

        <Button type="button" variant="outline" data-testid="talos-voice-preview" class="talos-pressable mt-3 min-h-11 gap-2 rounded-xl" @click="preview">
            <Volume2 class="size-4" aria-hidden="true" /> Preview voice
        </Button>
    </section>
</template>
