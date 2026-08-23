<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useTalosI18n, useTalosLocalization } from '@/i18n'
import { ArrowLeft, Check, Mic, Pause, Play, RefreshCw, Volume1, Volume2, VolumeX } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import TalosMicWaveform from '@/components/brand/TalosMicWaveform.vue'
import {
    talosBuildVoiceEnrollmentProfile,
    talosCaptureVoiceEnrollmentPhrase,
    talosCommitVoiceEnrollmentProfile,
    talosDiscardVoiceEnrollmentSession,
    talosOnPersonalVoiceDone,
    talosOnPersonalVoiceError,
    talosOnVoiceEnrollmentLevel,
    talosPlayCapturedEnrollmentPhrase,
    talosPreviewVoiceEnrollmentProfile,
    talosStartMicLevelPeek,
    talosStartVoiceEnrollment,
    talosStopMicLevelPeek,
    talosStopVoiceEnrollmentCapture,
    type TalosVoiceEnrollmentPhraseVerdict,
} from '@/services/personalVoice'
import type { TalosPersonalVoiceProfileSummary } from '@/lib/voice/personalVoiceContracts'

/**
 * Blueprint §11.1's guided enrollment, the mockup owner approved 21/8
 * (artifact, see memory `blocco4-mockup-ui-voce-personale`) turned into real
 * components. Same full-screen shell as `TalosMobileSetupIntro.vue` -
 * `fixed inset-0`, a step progress row, one back/next footer - because this
 * IS a first-run-shaped wizard for an existing user, not a new screen
 * pattern to invent.
 *
 * ⛔ One deliberate deviation from the mockup's screen order: the mockup
 * asked for the voice's name on the LAST screen (after preview). The real
 * native call, `buildEnrollmentProfile`, needs `displayName`/`language`
 * BEFORE encoding can start - there is no "encode now, name it later" door
 * on the backend. So naming happens here one screen earlier, on the review
 * screen, right before "Encode the voice". The preview screen keeps its
 * play/save job, just without a name field it no longer needs.
 *
 * ⛔ The mockup's live mic-check meter is NOT reproduced with real data here:
 * there is no native "peek the microphone level" call, only full guided
 * captures. Rather than animate a meter with numbers that are not real
 * input (the same dishonesty `TalosVoiceQuality`'s own class of gate exists
 * to catch on the audio side), the mic-check screen stays instructional
 * only. A future pass could add a real peek-level bridge call.
 */

const props = withDefaults(defineProps<{ existingProfileCount: number }>(), { existingProfileCount: 0 })
const emit = defineEmits<{ close: [], committed: [profile: TalosPersonalVoiceProfileSummary] }>()
const { t } = useTalosI18n()
/**
 * ⛔⛔ Owner 22/8: «la voce codificata deve seguire la lingua di SISTEMA».
 * MISURATO nel codice, non dedotto: `useTalosI18n().locale` (usato prima
 * qui) è la lingua dell'INTERFACCIA, che una persona può impostare
 * esplicitamente diversa dal sistema (`Impostazioni > Lingua`) — a quel
 * punto smette di essere il sistema. `useTalosLocalization` porta invece
 * `state.systemLocale`, calcolato una sola volta all'avvio dai tag di
 * lingua VERI del dispositivo (`hydrateTalosLocaleEnvironment`, non da
 * `mode`), indipendente da qualunque scelta fatta sull'interfaccia. Le
 * frasi mostrate/lette nel wizard (`PHRASES` sotto, via `t()`) restano
 * nella lingua dell'interfaccia — è quella in cui la persona sta
 * leggendo, davvero — solo l'etichetta REGISTRATA sul profilo usa il
 * sistema.
 */
const localization = useTalosLocalization()

type Tier = 'whisper' | 'normal' | 'loud'
interface Phrase { tier: Tier, text: string }

// Owner 21/8's own spec: 12 phrases across three volumes, each phrase distinct enough to exercise the quality gate honestly, none of them lorem.
const PHRASES: Phrase[] = [
    { tier: 'whisper', text: t('personalVoiceContent.whisper1') },
    { tier: 'whisper', text: t('personalVoiceContent.whisper2') },
    { tier: 'whisper', text: t('personalVoiceContent.whisper3') },
    { tier: 'whisper', text: t('personalVoiceContent.whisper4') },
    { tier: 'normal', text: t('personalVoiceContent.normal1') },
    { tier: 'normal', text: t('personalVoiceContent.normal2') },
    { tier: 'normal', text: t('personalVoiceContent.normal3') },
    { tier: 'normal', text: t('personalVoiceContent.normal4') },
    { tier: 'loud', text: t('personalVoiceContent.loud1') },
    { tier: 'loud', text: t('personalVoiceContent.loud2') },
    { tier: 'loud', text: t('personalVoiceContent.loud3') },
    { tier: 'loud', text: t('personalVoiceContent.loud4') },
]

const stage = ref<'consent' | 'check' | 'wizard' | 'review' | 'process' | 'preview'>('consent')
const consentIdentity = ref(false)
const consentStorage = ref(false)
const consentMic = ref(false)
const canConsent = computed(() => consentIdentity.value && consentStorage.value && consentMic.value)

const phraseIndex = ref(0)
const currentPhrase = computed(() => PHRASES[phraseIndex.value]!)
const recording = ref(false)
const lastVerdict = ref<TalosVoiceEnrollmentPhraseVerdict | null>(null)
const playingBack = ref(false)
const playbackError = ref(false)
/** ⭐⭐⭐ Owner 22/8: il livello VERO del blocco PCM appena letto durante una cattura - vedi `talosOnVoiceEnrollmentLevel`. */
const micLevel = ref(0)

const displayName = ref('')
const buildError = ref<string | null>(null)
const building = ref(false)
const committing = ref(false)
const previewing = ref(false)
const savedSummary = ref<TalosPersonalVoiceProfileSummary | null>(null)

let doneSubscription: { remove(): Promise<void> } | null = null
let errorSubscription: { remove(): Promise<void> } | null = null
let levelSubscription: { remove(): Promise<void> } | null = null
let previewReadingId: string | null = null

/**
 * ⭐⭐⭐ Owner 22/8, live sul Pad: «la waveform si deve vedere anche nella
 * prima schermata, quella del controllo microfono». Nessuna frase si
 * cattura lì - `talosStartMicLevelPeek`/`Stop` accendono e spengono SOLO il
 * misuratore, sullo stesso canale evento (`talosOnVoiceEnrollmentLevel`)
 * già armato per il wizard. Un `watch`, non un `onMounted` in più: la
 * schermata 'check' si entra e si esce più volte nella stessa sessione
 * (freccia indietro dal wizard), e il microfono non deve restare ceduto
 * oltre quella finestra.
 */
watch(stage, (next, previous) => {
    if (next === 'check') void talosStartMicLevelPeek()
    else if (previous === 'check') void talosStopMicLevelPeek()
})

onMounted(async () => {
    try {
        const { resumedSlotIndexes } = await talosStartVoiceEnrollment()
        // ⭐⭐⭐ Owner 22/8: "riprendere da dove si lascia" - ogni indice qui
        // è già cifrato su disco lato nativo, non solo un numero. Si salta
        // dritti al wizard sulla prima frase MANCANTE (consenso e controllo
        // microfono non si rifanno: una frase vera già registrata in questa
        // sessione È la prova che erano già stati dati). Se le 12 sono
        // già tutte lì, si salta anche il wizard - si va alla verifica.
        if (resumedSlotIndexes.length > 0) {
            const resumed = new Set(resumedSlotIndexes)
            let resumeIndex = 0
            while (resumed.has(resumeIndex) && resumeIndex < PHRASES.length) resumeIndex += 1
            if (resumeIndex >= PHRASES.length) {
                stage.value = 'review'
            } else {
                stage.value = 'wizard'
                phraseIndex.value = resumeIndex
            }
        }
        doneSubscription = await talosOnPersonalVoiceDone((readingId) => {
            if (readingId === previewReadingId) previewing.value = false
        })
        errorSubscription = await talosOnPersonalVoiceError((readingId) => {
            if (readingId === previewReadingId) previewing.value = false
        })
        // ⛔ Un solo ascolto per tutta la sessione, non uno per frase: il
        // nativo emette SOLO durante una cattura in corso (per costruzione,
        // dentro il ciclo di lettura di TalosVoiceRecorder), quindi non
        // serve armare/disarmare a ogni pointerdown/pointerup - un evento
        // che arrivasse fuori da una cattura non potrebbe comunque esistere.
        levelSubscription = await talosOnVoiceEnrollmentLevel((level) => { micLevel.value = level })
    } catch (cause) {
        // The settings screen already hides the entry point to this wizard
        // when the plugin reports unsupported - reaching here regardless
        // (a plugin call failing after that check passed, a race with a
        // just-revoked capability) still must not leave an unhandled
        // rejection sitting in onMounted forever.
        buildError.value = cause instanceof Error ? cause.message : String(cause)
    }
})

onBeforeUnmount(() => {
    void doneSubscription?.remove()
    void errorSubscription?.remove()
    void levelSubscription?.remove()
    // ⛔ Se il dialog si chiude (Annulla) mentre si è ancora su 'check', il
    // `watch` sopra non vede più un `previous` da confrontare - senza
    // questo il peek resterebbe acceso oltre la vita del componente.
    if (stage.value === 'check') void talosStopMicLevelPeek()
})

async function discardAndClose(): Promise<void> {
    await talosDiscardVoiceEnrollmentSession()
    emit('close')
}

function rejectionMessage(verdict: TalosVoiceEnrollmentPhraseVerdict): string {
    const reasons = verdict.rejectionReasons
    if (reasons.some((r) => r.startsWith('nearZeroSignal'))) return t('personalVoice.rejectNearZero')
    if (reasons.some((r) => r.startsWith('grossClipping'))) return t('personalVoice.rejectClipping')
    if (reasons.some((r) => r.startsWith('excessiveSilence'))) return t('personalVoice.rejectSilence')
    if (reasons.some((r) => r.startsWith('durationBelowMinimum'))) return t('personalVoice.rejectDuration')
    if (reasons.includes('clientSilencedObserved')) return t('personalVoice.rejectSilenced')
    return t('personalVoice.rejectGeneric')
}

async function startRecording(): Promise<void> {
    if (recording.value) return
    recording.value = true
    lastVerdict.value = null
    try {
        const verdict = await talosCaptureVoiceEnrollmentPhrase(phraseIndex.value, MAX_PHRASE_DURATION_MS)
        lastVerdict.value = verdict
    } finally {
        recording.value = false
        // Il nativo smette di emettere non appena la cattura finisce - la
        // barra deve tornare a riposo con lei, non restare ferma sull'ultimo
        // blocco letto.
        micLevel.value = 0
    }
}

async function stopRecording(): Promise<void> {
    if (!recording.value) return
    await talosStopVoiceEnrollmentCapture()
}

function retryPhrase(): void {
    lastVerdict.value = null
    playbackError.value = false
}

function nextPhrase(): void {
    lastVerdict.value = null
    playbackError.value = false
    if (phraseIndex.value < PHRASES.length - 1) {
        phraseIndex.value += 1
    } else {
        stage.value = 'review'
    }
}

/**
 * ⭐⭐⭐ Owner 22/8, live sul Pad, mentre provava la registrazione vera:
 * riascoltare la frase appena accettata prima ancora di arrivare
 * all'anteprima finale (che esiste già, ma solo dopo TUTTE e 12 le frasi e
 * la codifica). Il PCM è già in memoria nativa (`enrollmentSlots`) - questo
 * non richiama `captureVoiceEnrollmentPhrase`, solo la riproduzione.
 */
async function playBackCapture(): Promise<void> {
    if (playingBack.value) return
    playingBack.value = true
    playbackError.value = false
    try {
        await talosPlayCapturedEnrollmentPhrase(phraseIndex.value)
    } catch {
        playbackError.value = true
    } finally {
        playingBack.value = false
    }
}

async function encodeVoice(): Promise<void> {
    const name = displayName.value.trim()
    if (!name) {
        buildError.value = t('personalVoice.nameLabel')
        return
    }
    buildError.value = null
    building.value = true
    stage.value = 'process'
    try {
        await talosBuildVoiceEnrollmentProfile({
            displayName: name,
            language: localization.state.systemLocale,
            style: 'neutral',
            consentVersion: CONSENT_VERSION,
        })
        stage.value = 'preview'
    } catch (cause) {
        buildError.value = cause instanceof Error ? cause.message : String(cause)
        stage.value = 'review'
    } finally {
        building.value = false
    }
}

async function playPreview(): Promise<void> {
    if (previewing.value) return
    previewing.value = true
    previewReadingId = `personal-voice-preview-${Date.now()}`
    try {
        // ⛔⛔ Trovato 22/8, testando l'anteprima sul dispositivo:
        // `personalVoice.previewPhrase` non esiste in NESSUN locale (grep
        // su it.ts/en.ts, zero occorrenze) - vue-i18n senza chiave torna la
        // chiave stessa come stringa, e il motore la sintetizzava alla
        // lettera. `voice.previewPhrase` esiste già, dice esattamente la
        // cosa giusta ("Ecco come TALOS leggerà le risposte ad alta voce"),
        // ed è la stessa frase che l'anteprima del selettore voci userà per
        // un profilo personale (vedi TalosMobileVoiceSettings.vue) - una
        // sola frase, non due da tenere allineate.
        const result = await talosPreviewVoiceEnrollmentProfile(t('voice.previewPhrase'), previewReadingId)
        if (!result.accepted) previewing.value = false
    } catch {
        previewing.value = false
    }
}

async function saveVoice(): Promise<void> {
    if (committing.value) return
    committing.value = true
    try {
        const profile = await talosCommitVoiceEnrollmentProfile()
        savedSummary.value = profile
        emit('committed', profile)
        emit('close')
    } catch (cause) {
        buildError.value = cause instanceof Error ? cause.message : String(cause)
    } finally {
        committing.value = false
    }
}

const MAX_PHRASE_DURATION_MS = 8000
const CONSENT_VERSION = 1

const tierIcon = computed(() => {
    if (currentPhrase.value.tier === 'whisper') return VolumeX
    if (currentPhrase.value.tier === 'loud') return Volume2
    return Volume1
})
const tierLabel = computed(() => {
    if (currentPhrase.value.tier === 'whisper') return t('personalVoice.tierWhisper')
    if (currentPhrase.value.tier === 'loud') return t('personalVoice.tierLoud')
    return t('personalVoice.tierNormal')
})
</script>

<template>
    <!--
        ⭐⭐⭐ Owner 22/8, ispezionato sul Pad reale (non forzando `wm size`):
        senza questo Teleport il dialog restava confinato dentro il pannello
        destro del "Centro impostazioni" tablet - sidebar delle categorie
        ancora visibile a sinistra, e un vuoto sotto il footer invece del
        fondo vero dello schermo. Causa MISURATA via CDP
        (`getComputedStyle`): `TalosMobileSettingsCenter.vue` anima il
        pannello con `.talos-motion-tab-panel[data-state="active"]`
        (`talos-interaction-motion-v6.css`), la cui `animation` risolve
        sempre a una `transform` (anche l'identità, a riposo) - e per la
        spec CSS un antenato con `transform` non-`none` diventa il
        containing block di ogni discendente `position: fixed`. `fixed
        inset-0` smette di significare "tutto lo schermo" e torna a
        significare "tutto il pannello". Confermato con una ricerca web
        (mtsknn.fi/blog/breaking-css-position-fixed, Vue.js Teleport docs):
        stesso identico pattern già in uso per lo stesso motivo in
        `TalosLauncherIconDialog.vue` (anch'esso montato dentro un pannello
        `talos-motion-tab-panel`, `TalosMobileSettingsAppearancePanel.vue`)
        - non un'invenzione nuova.
    -->
    <Teleport to="body">
    <div
        data-testid="talos-personal-voice-enrollment"
        role="dialog"
        aria-modal="true"
        class="fixed inset-0 z-[70] flex flex-col bg-[var(--talos-background)] pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] text-[var(--talos-text)]"
    >
        <header class="flex items-center justify-between px-5 pb-4">
            <p class="talos-orbitron-brand text-xs uppercase tracking-[0.3em] text-[var(--talos-accent)]">TALOS</p>
            <button
                type="button"
                data-testid="talos-personal-voice-cancel"
                class="talos-pressable -mr-2 min-h-touch rounded-full px-3 text-sm text-[var(--talos-muted)]"
                @click="discardAndClose"
            >{{ t('personalVoice.cancel') }}</button>
        </header>

        <ol v-if="stage === 'wizard'" class="mb-6 flex items-start gap-2 px-5" :aria-label="t('personalVoice.title')">
            <li v-for="(_phrase, position) in PHRASES" :key="position" class="flex-1">
                <span
                    class="block h-0.5 rounded-full transition-colors duration-300"
                    :class="position < phraseIndex ? 'bg-[var(--talos-accent)]' : position === phraseIndex ? 'bg-[var(--talos-text)]' : 'bg-[var(--talos-border)]'"
                />
            </li>
        </ol>

        <section class="flex min-h-0 flex-1 flex-col overflow-y-auto px-5">
            <template v-if="stage === 'consent'">
                <h1 class="talos-title text-2xl font-semibold leading-tight">{{ t('personalVoice.consentTitle') }}</h1>
                <p class="mt-3 text-md leading-7 text-[var(--talos-muted)]">{{ t('personalVoice.consentBody') }}</p>
                <div class="mt-6 flex flex-col gap-4 rounded-2xl border border-[var(--talos-border)] bg-[var(--talos-panel)] p-4">
                    <label class="flex items-start gap-3 text-sm leading-6">
                        <input v-model="consentIdentity" type="checkbox" class="mt-0.5 size-5 accent-[var(--talos-accent)]" data-testid="talos-personal-voice-consent-identity">
                        <span>{{ t('personalVoice.consentIdentity') }}</span>
                    </label>
                    <label class="flex items-start gap-3 text-sm leading-6">
                        <input v-model="consentStorage" type="checkbox" class="mt-0.5 size-5 accent-[var(--talos-accent)]" data-testid="talos-personal-voice-consent-storage">
                        <span>{{ t('personalVoice.consentStorage') }}</span>
                    </label>
                    <label class="flex items-start gap-3 text-sm leading-6">
                        <input v-model="consentMic" type="checkbox" class="mt-0.5 size-5 accent-[var(--talos-accent)]" data-testid="talos-personal-voice-consent-mic">
                        <span>{{ t('personalVoice.consentMic') }}</span>
                    </label>
                </div>
            </template>

            <template v-else-if="stage === 'check'">
                <h1 class="talos-title text-2xl font-semibold leading-tight">{{ t('personalVoice.checkTitle') }}</h1>
                <p class="mt-3 text-md leading-7 text-[var(--talos-muted)]">{{ t('personalVoice.checkBody') }}</p>
                <!-- ⭐⭐⭐ Owner 22/8: livello VERO da `talosStartMicLevelPeek`, non un finto respiro - stesso componente e stesso `micLevel` del wizard. -->
                <div class="mt-6 rounded-xl border border-[var(--talos-border)] px-4 py-3">
                    <TalosMicWaveform :level="micLevel" />
                </div>
            </template>

            <template v-else-if="stage === 'wizard'">
                <div class="text-center">
                    <span
                        class="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold"
                        :class="currentPhrase.tier === 'whisper' ? 'border-blue-400 text-blue-400' : currentPhrase.tier === 'loud' ? 'border-[var(--talos-warning-border)] text-[var(--talos-warning)]' : 'border-[var(--talos-accent-border)] text-[var(--talos-accent)]'"
                    >
                        <component :is="tierIcon" class="size-3.5" aria-hidden="true" />{{ tierLabel }}
                    </span>
                </div>
                <p class="mt-8 text-center text-2xl font-medium leading-snug" data-testid="talos-personal-voice-phrase">
                    &ldquo;{{ currentPhrase.text }}&rdquo;
                </p>
                <!--
                    ⭐⭐⭐ Owner 22/8, live sul Pad: «la waveform è assente nel
                    Wizard, ne abbiamo già una». `TalosMicWaveform` esiste già
                    (barra assistente + dettatura) - qui riceve `micLevel`,
                    che arriva DAVVERO dal blocco PCM che `TalosVoiceRecorder`
                    sta leggendo in questo momento, non un numero finto:
                    a riposo (fuori da una cattura) resta a 0 e la barra
                    mostra il filo minimo di 3px del componente, onesto sul
                    fatto che non sta ancora sentendo niente.
                -->
                <div class="mt-6 rounded-xl border border-[var(--talos-border)] px-4 py-3">
                    <TalosMicWaveform :level="micLevel" />
                </div>
                <div v-if="lastVerdict" class="mt-8 flex items-center gap-2 rounded-xl border px-4 py-3 text-sm"
                    :class="lastVerdict.accepted ? 'border-[var(--talos-success-border)] bg-[var(--talos-success-soft)] text-[var(--talos-success)]' : 'border-[var(--talos-warning-border)] bg-[var(--talos-warning-soft)] text-[var(--talos-warning)]'"
                >
                    <Check v-if="lastVerdict.accepted" class="size-4 shrink-0" aria-hidden="true" />
                    <span>{{ lastVerdict.accepted ? t('personalVoice.wizardGoodLevel') : rejectionMessage(lastVerdict) }}</span>
                </div>
                <button
                    v-if="lastVerdict?.accepted"
                    type="button"
                    data-testid="talos-personal-voice-playback"
                    :disabled="playingBack"
                    class="talos-pressable mt-3 flex min-h-touch w-full items-center justify-center gap-2 rounded-full border border-[var(--talos-border)] text-sm font-medium disabled:opacity-60"
                    @click="playBackCapture"
                >
                    <Play class="size-4" aria-hidden="true" />
                    {{ playingBack ? t('personalVoice.wizardPlaybackPlaying') : t('personalVoice.wizardPlayback') }}
                </button>
                <p v-if="playbackError" role="alert" class="mt-2 text-center text-sm text-[var(--talos-danger)]">{{ t('personalVoice.wizardPlaybackFailed') }}</p>
            </template>

            <template v-else-if="stage === 'review'">
                <h1 class="talos-title text-2xl font-semibold leading-tight">{{ t('personalVoice.reviewTitle') }}</h1>
                <p class="mt-3 text-md leading-7 text-[var(--talos-muted)]">{{ t('personalVoice.reviewBody') }}</p>
                <div class="mt-6 rounded-xl border border-[var(--talos-success-border)] bg-[var(--talos-success-soft)] px-4 py-3 text-sm text-[var(--talos-success)]">
                    <Check class="mr-2 inline size-4" aria-hidden="true" />{{ t('personalVoice.reviewPassed') }}
                </div>
                <label class="mt-7 block">
                    <span class="mb-1 block text-sm font-medium">{{ t('personalVoice.nameLabel') }}</span>
                    <input
                        v-model="displayName"
                        data-testid="talos-personal-voice-name"
                        type="text"
                        maxlength="60"
                        class="min-h-12 w-full rounded-xl border border-[var(--talos-border)] bg-[var(--talos-input,var(--talos-background))] px-3 text-base outline-none focus:border-[var(--talos-accent)]"
                    >
                </label>
                <p v-if="buildError" role="alert" class="mt-3 text-sm text-[var(--talos-danger)]">{{ buildError }}</p>
            </template>

            <template v-else-if="stage === 'process'">
                <div class="flex flex-1 flex-col items-center justify-center text-center">
                    <div class="size-10 animate-spin rounded-full border-[3px] border-[var(--talos-border)] border-t-[var(--talos-accent)]" />
                    <h2 class="mt-6 text-xl font-semibold">{{ t('personalVoice.processTitle') }}</h2>
                    <p class="mt-2 text-sm text-[var(--talos-muted)]">{{ t('personalVoice.processBody') }}</p>
                </div>
            </template>

            <template v-else-if="stage === 'preview'">
                <h1 class="talos-title text-2xl font-semibold leading-tight">{{ t('personalVoice.previewTitle') }}</h1>
                <p class="mt-3 text-md leading-7 text-[var(--talos-muted)]">{{ t('personalVoice.previewBody') }}</p>
                <button
                    type="button"
                    data-testid="talos-personal-voice-play-preview"
                    :disabled="previewing"
                    class="talos-pressable mt-6 flex min-h-12 w-full items-center justify-center gap-2 rounded-full border border-[var(--talos-border)] text-sm font-medium disabled:opacity-60"
                    @click="playPreview"
                >
                    <Pause v-if="previewing" class="size-4" aria-hidden="true" />
                    <Mic v-else class="size-4" aria-hidden="true" />
                    {{ previewing ? t('personalVoice.wizardStopRecording') : t('personalVoice.previewTitle') }}
                </button>
                <p v-if="buildError" role="alert" class="mt-3 text-sm text-[var(--talos-danger)]">{{ buildError }}</p>
            </template>
        </section>

        <!-- ⭐⭐⭐ Owner 22/8: `shrink-0` esplicito - il fratello di un
             `flex-1 overflow-y-auto` non ne avrebbe bisogno in teoria (la
             sezione assorbe già tutto lo scroll), ma un footer senza
             questa riga potrebbe comunque comprimersi in un caso limite
             (contenuto molto alto + `min-h-0` genitore), e verificarlo a
             occhio su ogni schermo è più lento che scriverlo. -->
        <footer class="flex shrink-0 items-center gap-2 px-5 pt-4">
            <template v-if="stage === 'consent'">
                <Button
                    type="button"
                    data-testid="talos-personal-voice-consent-continue"
                    :disabled="!canConsent"
                    class="talos-pressable min-h-12 flex-1 rounded-full bg-[var(--talos-accent)] text-sm font-medium text-[var(--talos-accent-text,var(--primary-foreground))] disabled:opacity-50"
                    @click="stage = 'check'"
                >{{ t('personalVoice.consentContinue') }}</Button>
            </template>
            <template v-else-if="stage === 'check'">
                <Button type="button" size="icon" variant="outline" class="talos-pressable min-h-12 min-w-12 rounded-full" :aria-label="t('common.back')" @click="stage = 'consent'">
                    <ArrowLeft class="size-4" aria-hidden="true" />
                </Button>
                <Button
                    type="button"
                    data-testid="talos-personal-voice-check-continue"
                    class="talos-pressable min-h-12 flex-1 rounded-full bg-[var(--talos-accent)] text-sm font-medium text-[var(--talos-accent-text,var(--primary-foreground))]"
                    @click="stage = 'wizard'"
                >{{ t('personalVoice.checkContinue') }}</Button>
            </template>
            <template v-else-if="stage === 'wizard'">
                <template v-if="!lastVerdict">
                    <!--
                        ⛔ ONE persistent button across idle→recording, not a
                        v-if swap to a second "stop" button. A first draft
                        used two separate `<Button>`s (one per state) and its
                        OWN component test caught the real bug: Vue's v-if
                        replaces the DOM node the instant `recording` flips
                        true, before the browser's `pointerup` can fire on
                        the element the finger is still touching - on a real
                        touchscreen that is exactly the kind of mid-gesture
                        element swap that can silently drop the release
                        event. Same element throughout, only its label/style
                        change, keeps the browser's own pointer capture
                        intact for the whole press-and-hold gesture.
                    -->
                    <Button
                        type="button"
                        data-testid="talos-personal-voice-record"
                        :variant="recording ? 'outline' : undefined"
                        :class="recording
                            ? 'talos-pressable min-h-12 flex-1 rounded-full border-[var(--talos-danger-border)] text-[var(--talos-danger)]'
                            : 'talos-pressable min-h-12 flex-1 rounded-full bg-[var(--talos-accent)] text-sm font-medium text-[var(--talos-accent-text,var(--primary-foreground))]'"
                        @pointerdown="startRecording"
                        @pointerup="stopRecording"
                        @pointercancel="stopRecording"
                    >
                        <Pause v-if="recording" class="mr-2 inline size-4" aria-hidden="true" />
                        <Mic v-else class="mr-2 inline size-4" aria-hidden="true" />
                        {{ recording ? t('personalVoice.wizardStopRecording') : t('personalVoice.wizardHoldToRecord') }}
                    </Button>
                </template>
                <template v-else>
                    <Button type="button" variant="outline" data-testid="talos-personal-voice-retry" class="talos-pressable min-h-12 flex-1 rounded-full" @click="retryPhrase">
                        <RefreshCw class="mr-2 inline size-4" aria-hidden="true" />{{ t('personalVoice.wizardRetry') }}
                    </Button>
                    <!-- ⛔ Only an ACCEPTED verdict may advance - a rejected recording offering "Continue" anyway would let a bad phrase into the profile just as easily as no gate at all. -->
                    <Button
                        v-if="lastVerdict.accepted"
                        type="button"
                        data-testid="talos-personal-voice-next"
                        class="talos-pressable min-h-12 flex-1 rounded-full bg-[var(--talos-accent)] text-sm font-medium text-[var(--talos-accent-text,var(--primary-foreground))]"
                        @click="nextPhrase"
                    >{{ t('personalVoice.wizardContinue') }}</Button>
                </template>
            </template>
            <template v-else-if="stage === 'review'">
                <Button type="button" size="icon" variant="outline" class="talos-pressable min-h-12 min-w-12 rounded-full" :aria-label="t('common.back')" @click="stage = 'wizard'">
                    <ArrowLeft class="size-4" aria-hidden="true" />
                </Button>
                <Button
                    type="button"
                    data-testid="talos-personal-voice-encode"
                    :disabled="building || !displayName.trim()"
                    class="talos-pressable min-h-12 flex-1 rounded-full bg-[var(--talos-accent)] text-sm font-medium text-[var(--talos-accent-text,var(--primary-foreground))] disabled:opacity-50"
                    @click="encodeVoice"
                >{{ t('personalVoice.reviewEncode') }}</Button>
            </template>
            <template v-else-if="stage === 'preview'">
                <Button type="button" variant="outline" data-testid="talos-personal-voice-redo" class="talos-pressable min-h-12 rounded-full px-4" @click="stage = 'wizard'; phraseIndex = 0">
                    <RefreshCw class="size-4" aria-hidden="true" />
                </Button>
                <Button
                    type="button"
                    data-testid="talos-personal-voice-save"
                    :disabled="committing || !!savedSummary"
                    class="talos-pressable min-h-12 flex-1 rounded-full bg-[var(--talos-accent)] text-sm font-medium text-[var(--talos-accent-text,var(--primary-foreground))] disabled:opacity-50"
                    @click="saveVoice"
                >{{ t('personalVoice.save') }}</Button>
            </template>
        </footer>
    </div>
    </Teleport>
</template>
