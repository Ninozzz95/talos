<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useTalosI18n } from '@/i18n'
import { Volume2 } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import TalosThemedSelect from '@/components/talos/ui/TalosThemedSelect.vue'
import { useSettingsStore } from '@/stores/settings'
import { useTalosSpeechService, type TalosSpeechVoice } from '@/services/speech'
import { TALOS_LINGUA_AUTOMATICA, parseTalosDictationLanguageMode } from '@/lib/dictationPolicy'
import { talosVociOrdinate, type TalosVoceDispositivo } from '@/lib/voice/sceltaVoce'

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

/*
 * ⛔ Si rilegge finché non arrivano: il motore nativo risponde su un altro
 * thread e la prima lettura può essere vuota. Un solo tentativo dopo 300 ms era
 * una scommessa — e quando perdeva, il pannello mostrava «nessuna voce» su un
 * telefono che ne ha 473.
 */
onMounted(() => {
    let tentativi = 0
    const leggi = () => {
        voices.value = service.voices()
        if (voices.value.length > 0 || ++tentativi >= 10) return
        window.setTimeout(leggi, 300)
    }
    leggi()
})

/** Mostra anche le lingue che non sono quella dell'interfaccia. */
const tutteLeLingue = ref(false)

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
/**
 * ⛔⛔ L'ELENCO NON LO SCRIVIAMO PIÙ NOI.
 *
 * Owner 2026-08-10: parlava italiano con la dettatura su inglese, e non è mai
 * stato sentito. Prima qui c'erano TRE righe fisse — «segui il dispositivo»,
 * «inglese», «italiano» — su un telefono che sa ascoltarne decine.
 *
 * Adesso la prima voce è **Automatica** ed è il default: sotto, il nativo
 * accende il rilevamento e il cambio lingua a metà frase. Le altre le dichiara
 * il dispositivo (`ACTION_GET_LANGUAGE_DETAILS`), col loro nome scritto nella
 * lingua stessa — `Intl.DisplayNames`, non una tabella nostra da tenere
 * aggiornata a mano.
 */
const lingueDelDispositivo = ref<string[]>([])
void import('@/services/dictationCasa')
    .then(({ talosLingueDichiarate }) => talosLingueDichiarate())
    .then((esito) => { lingueDelDispositivo.value = esito.languages })
    .catch(() => { lingueDelDispositivo.value = [] })

const nomeDellaLingua = (tag: string): string => {
    try {
        const nomi = new Intl.DisplayNames([tag], { type: 'language' })
        const nome = nomi.of(tag) ?? tag
        return nome.charAt(0).toLocaleUpperCase(tag) + nome.slice(1)
    } catch {
        // Un tag che l'ambiente non sa nominare resta se stesso: meglio
        // `sw-KE` di una riga vuota che non si può scegliere.
        return tag
    }
}

/**
 * ⛔ MISURATO sul Pad il 2026-08-10: `ACTION_GET_LANGUAGE_DETAILS` torna un
 * elenco VUOTO — la broadcast ordinata non riceve risposta e scatta la rete da
 * 1,5 s. Senza un ripiego il menù avrebbe una voce sola, «Automatica», e chi
 * volesse inchiodare una lingua non potrebbe. Le lingue di sistema sono un
 * fatto vero e disponibile: si usano quelle.
 */
const lingueOfferte = computed(() => (
    lingueDelDispositivo.value.length
        ? lingueDelDispositivo.value
        : [...new Set(typeof navigator === 'undefined' ? [] : (navigator.languages ?? []))]
))

const dictationLanguageItems = computed(() => [
    { value: TALOS_LINGUA_AUTOMATICA, label: t('voice.dictationAuto') },
    ...lingueOfferte.value.map((tag) => ({ value: tag, label: nomeDellaLingua(tag) })),
    // ⛔ Una scelta salvata che il dispositivo non dichiara più (pacchetto
    // disinstallato) resterebbe invisibile nel menù, e il selettore mostrerebbe
    // il vuoto al posto di ciò che è davvero impostato.
    ...(dictationLanguage.value !== TALOS_LINGUA_AUTOMATICA
        && !lingueOfferte.value.includes(dictationLanguage.value)
        ? [{ value: dictationLanguage.value, label: nomeDellaLingua(dictationLanguage.value) }]
        : []),
])
/**
 * ⛔⛔ LE VOCI DELLA TUA LINGUA, IN ORDINE — non 473 lingue mescolate.
 *
 * MISURATO sul Pad il 2026-08-10, appena il selettore ha smesso di essere
 * vuoto: offriva **474 righe**, e le prime erano `sfb (es-US)`,
 * `ur-PK-language`, `htm · rete (ja-JP)`. Un elenco così non è una scelta: è
 * un archivio. Chi cerca «una voce meno robotica» si arrende alla terza riga.
 *
 * ⇒ Prima quelle della lingua in cui TALOS sta parlando, ordinate dalla
 * migliore (`talosVociOrdinate`: mai la generica in testa, la neurale prima di
 * quella sul telefono). Le altre lingue restano raggiungibili con un
 * interruttore, perché chi è bilingue esiste — ma non le paga chi non lo è.
 */
const linguaInterfaccia = computed(() => document.documentElement.lang || navigator.language || 'it')
const voiceItems = computed(() => {
    const dispositivo: TalosVoceDispositivo[] = voices.value.map((v) => ({
        name: v.voiceURI,
        locale: v.lang,
        // Il servizio non porta questi campi: l'ordinamento userà i criteri che
        // restano — nominata contro generica, e la rete — che sono quelli che
        // distinguono davvero (sul Pad la qualità è 400 per tutte).
        quality: 400,
        latency: 200,
        network: / · rete$/.test(v.name),
        notInstalled: false,
    }))
    /*
     * ⛔ SOLO LE PRIME TRE — owner 2026-08-10, dopo averle ascoltate tutte:
     * «vorrei solo le prime tre disponibili, le altre non mi piacciono, sono
     * troppo robotiche».
     *
     * È una scelta fatta a ORECCHIO, e per questo vale: Android dichiara
     * `quality: 400` per tutte e nove le italiane, quindi nessun numero avrebbe
     * potuto separarle. Le prime tre sono quelle che l'ordinamento porta in
     * testa — le neurali di rete — e sono anche le uniche che una persona ha
     * detto di sopportare.
     *
     * ⛔ Il limite NON si applica a «tutte le lingue»: chi accende quello ha
     * chiesto esplicitamente l'archivio, e nascondergliene i due terzi sarebbe
     * rispondere a una domanda diversa da quella che ha fatto.
     */
    const QUANTE_VOCI = 3
    const miaLingua = talosVociOrdinate(dispositivo, {
        lingua: linguaInterfaccia.value,
        rete: navigator.onLine !== false,
    }).slice(0, QUANTE_VOCI)
    const restanti = tutteLeLingue.value
        ? dispositivo.filter((v) => !miaLingua.some((m) => m.name === v.name))
        : []
    const etichetta = (v: TalosVoceDispositivo) => {
        const originale = voices.value.find((o) => o.voiceURI === v.name)
        return `${originale?.name ?? v.name} (${v.locale})`
    }
    return [...miaLingua, ...restanti].map((v) => ({ value: v.name, label: etichetta(v) }))
})
/**
 * ⭐⭐ SI SENTE SUBITO — owner 2026-08-10: «quando cambio un parametro della
 * voce, la voce si deve aggiornare automaticamente, in tempo reale».
 *
 * ⛔ E prima non poteva succedere per una ragione più grave della mancanza di
 * questa funzione: velocità e tonalità **non arrivavano al motore**. `speak`
 * riceveva solo `{ text }`, e nel plugin non comparivano né `setSpeechRate` né
 * `setPitch` — i due cursori erano inerti su Android. Prima si è aperta la
 * strada, poi si è messo l'ascolto.
 *
 * ⛔ Con un RITARDO, e non è pigrizia: un cursore trascinato emette una
 * cinquantina di eventi, e rifar partire la voce a ognuno significa cinquanta
 * frasi tagliate a metà. Si aspetta che la mano si fermi.
 */
const ATTESA_ANTEPRIMA_MS = 420
let attesa: number | null = null
function anteprimaFraPoco(): void {
    if (attesa !== null) window.clearTimeout(attesa)
    attesa = window.setTimeout(() => { attesa = null; preview() }, ATTESA_ANTEPRIMA_MS)
}
onBeforeUnmount(() => { if (attesa !== null) window.clearTimeout(attesa) })

function setRate(event: Event): void {
    void settings.setVoicePreferences({ rate: Number((event.target as HTMLInputElement).value) })
    anteprimaFraPoco()
}
function setPitch(event: Event): void {
    void settings.setVoicePreferences({ pitch: Number((event.target as HTMLInputElement).value) })
    anteprimaFraPoco()
}
function preview(): void {
    void service.speak(t('voice.previewPhrase'), {
        voiceURI: settings.state.voice.voice_uri ?? undefined,
        rate: settings.state.voice.rate,
        pitch: settings.state.voice.pitch,
    })
}

/*
 * Anche cambiando VOCE si sente subito: è la scelta che più di tutte si fa a
 * orecchio, e chiedere «scegli, poi tocca Anteprima» è un passo che nessuno fa
 * — si sceglie a caso e si tiene la prima.
 */
watch(selectedVoice, () => { anteprimaFraPoco() })
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

            <!-- ⛔ Le altre lingue esistono ma non le paga chi non le usa:
                 senza questo interruttore il selettore offriva 474 righe di
                 473 lingue mescolate, misurato sul Pad. -->
            <!-- ⛔ Il testid sta sulla LABEL, non sull'input: un <input> non ha
                 testo, quindi un comando cercato per etichetta risultava
                 «assente» su uno schermo dove si legge benissimo. Misurato. -->
            <label
                data-testid="talos-voice-all-languages"
                class="mt-2 flex min-h-touch items-center gap-2 text-xs text-[var(--talos-muted)]"
            >
                <input
                    v-model="tutteLeLingue"
                    type="checkbox"
                    class="size-4 accent-[var(--talos-accent)]"
                >
                <span>{{ t('voice.allLanguages') }}</span>
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
