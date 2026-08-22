<script setup lang="ts">
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useTalosI18n } from '@/i18n'
import { Pencil, Trash2, User, Volume2 } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import TalosThemedSelect from '@/components/talos/ui/TalosThemedSelect.vue'
import { useSettingsStore } from '@/stores/settings'
import { useTalosSpeechService, type TalosSpeechVoice } from '@/services/speech'
import { TALOS_LINGUA_AUTOMATICA, parseTalosDictationLanguageMode } from '@/lib/dictationPolicy'
import { talosVoceDaUsare, talosVociOfferte, type TalosVoceDispositivo } from '@/lib/voice/sceltaVoce'
import {
    talosDeletePersonalVoiceProfile,
    talosPersonalVoiceProfiles,
    talosPersonalVoiceStatus,
    talosRenamePersonalVoiceProfile,
} from '@/services/personalVoice'
import type { TalosPersonalVoiceProfileSummary } from '@/lib/voice/personalVoiceContracts'
import type { TalosVoiceModelInstallProgress } from '@/services/voiceModelInstall'

// ⛔ Pigro come il pannello dei provider nell'intro (stesso motivo): il
// motore ONNX di ai.talos.voice non deve pesare sul grafo d'avvio di chi
// non arruola mai una voce personale.
const TalosMobilePersonalVoiceEnrollment = defineAsyncComponent(
    () => import('@/components/talos/settings/voice/TalosMobilePersonalVoiceEnrollment.vue'),
)

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

/**
 * ⛔⛔ SENZA «Automatica», il menù deve mostrare LA VOCE CHE PARLA — DAVVERO.
 *
 * Owner 2026-08-11: «togli la voce predefinita». Tolta la riga, chi non ha mai
 * scelto si ritroverebbe un menù **vuoto** — e non perché manchi una voce, ma
 * perché la preferenza salvata è `null`.
 *
 * ⛔⛔ Owner 2026-08-22 (Rilievo 3): «parte di default una voce predefinita
 * che non è nella lista voci nel impostazioni». MISURATO nel codice, non
 * dedotto: qui si mostrava `voiceItems.value[0]`, calcolato con `rete:
 * navigator.onLine !== false` (online, la neurale batte la locale — regola 2
 * di `talosVociOrdinate`). `voceFissa()` in `useTalosSpeech.ts`, che è quella
 * che DAVVERO parla quando si preme play su un messaggio, chiama la STESSA
 * `talosVoceDaUsare` ma con `rete: false` fisso — deliberato dall'8/10, per
 * non cambiare timbro a metà lettura se la rete esita. Online, con voci
 * nominate sia locali che di rete, le due chiamate potevano disaccordarsi: il
 * menù mostrava una voce di rete come «la prima», e il pulsante play ne
 * usava un'altra, spesso fuori dall'elenco offerto (`talosVociOfferte` è
 * anch'essa calcolata con `rete` online-dipendente).
 *
 * ⇒ Un solo ripiego, calcolato con la STESSA preferenza di `voceFissa()`
 * (`voceDiRipiego` sotto): il menù ora mostra esattamente la voce che il
 * motore userebbe da solo, non una voce di rete che il pulsante play non
 * sceglierebbe mai.
 */
const selectedVoice = computed({
    get: () => settings.state.voice.voice_uri ?? voceDiRipiego.value ?? '',
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
/**
 * Le voci del dispositivo nel formato che `sceltaVoce.ts` capisce — estratto
 * a parte perché sia `voiceItems` (l'elenco selezionabile, rete-consapevole)
 * sia `voceDiRipiego` (il default quando nessuno ha scelto, rete:false come
 * `voceFissa()`) devono partire dagli STESSI dati grezzi.
 */
const dispositivo = computed<TalosVoceDispositivo[]>(() => voices.value.map((v) => ({
    name: v.voiceURI,
    locale: v.lang,
    // Il servizio non porta questi campi: l'ordinamento userà i criteri che
    // restano — nominata contro generica, e la rete — che sono quelli che
    // distinguono davvero (sul Pad la qualità è 400 per tutte).
    quality: 400,
    latency: 200,
    network: / · rete$/.test(v.name),
    notInstalled: false,
})))
/**
 * ⛔⛔ LA VOCE CHE PARLA DAVVERO QUANDO NESSUNO HA SCELTO — Rilievo 3,
 * 2026-08-22. Stessa `preferenza` di `voceFissa()` in `useTalosSpeech.ts`
 * (`rete: false`, `scelta: null`): un solo posto decide «qual è la prima»,
 * non due calcoli che possono disaccordarsi. Vedi il commento su
 * `selectedVoice` per la storia del difetto.
 */
const voceDiRipiego = computed(() => (
    talosVoceDaUsare(dispositivo.value, {
        lingua: linguaInterfaccia.value,
        rete: false,
        scelta: null,
    }).voce?.name
))
const voiceItems = computed(() => {
    /*
     * ⛔ DUE VOCI, e la regola sta in `talosVociOfferte` — qui si applica, non
     * si decide.
     *
     * Owner 2026-08-10: «vorrei solo le prime tre, le altre sono troppo
     * robotiche». Owner 2026-08-11: «togli la voce predefinita e mantieni solo
     * la prima e l'ultima voce (rete)». Delle tre in testa cade la mediana.
     *
     * ⛔ Il limite NON si applica a «tutte le lingue»: chi accende quello ha
     * chiesto esplicitamente l'archivio, e nascondergliene i due terzi sarebbe
     * rispondere a una domanda diversa da quella che ha fatto.
     */
    const miaLingua = talosVociOfferte(dispositivo.value, {
        lingua: linguaInterfaccia.value,
        rete: navigator.onLine !== false,
    })
    const restanti = tutteLeLingue.value
        ? dispositivo.value.filter((v) => !miaLingua.some((m) => m.name === v.name))
        : []
    const etichetta = (v: TalosVoceDispositivo) => {
        const originale = voices.value.find((o) => o.voiceURI === v.name)
        return `${originale?.name ?? v.name} (${v.locale})`
    }
    const elenco = [...miaLingua, ...restanti]
    /*
     * ⛔⛔ "Select an option" con una voce di ripiego valida - trovato il
     * 22/8, ispezionando lo schermo reale, non il codice a memoria.
     *
     * `voceDiRipiego` (sotto) è calcolata con `rete: false` FISSO — sempre
     * una voce LOCALE, deliberato dall'8/10 per non cambiare timbro a metà
     * lettura. Ma questo elenco usa `rete: navigator.onLine !== false` — con
     * rete online, `talosVociOrdinate` mette le voci NEURALI in testa
     * (regola 2), e `talosVociOfferte` tiene solo le prime/ultime di quella
     * classifica — quasi sempre TUTTE di rete quando la rete è accesa. La
     * voce locale scelta come ripiego finiva quindi FUORI da un elenco
     * fatto solo di voci di rete: `TalosThemedSelect` mostra onestamente il
     * placeholder quando il valore selezionato non è fra le sue `items`
     * (comportamento suo corretto, confermato contro Radix upstream) — il
     * difetto era qui, non lì. Stesso pattern già in uso sotto per
     * `dictationLanguageItems`, non un'invenzione nuova.
     */
    const mancante = selectedVoice.value && !elenco.some((v) => v.name === selectedVoice.value)
        ? dispositivo.value.find((v) => v.name === selectedVoice.value)
        : undefined
    return [...elenco, ...(mancante ? [mancante] : [])].map((v) => ({ value: v.name, label: etichetta(v) }))
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
    // ⛔ Rilievo 3, 2026-08-22: qui c'era `?? undefined` — un TERZO calcolo del
    // «default», che lasciava decidere al motore nativo la sua predefinita
    // (che può essere la generica, o una voce diversa sia dal menù sia da
    // quella che leggerebbe un messaggio). Stesso ripiego di `selectedVoice`.
    void service.speak(t('voice.previewPhrase'), {
        voiceURI: settings.state.voice.voice_uri ?? voceDiRipiego.value,
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

// --- Voce personale (Fase 4, blueprint §11.1) ---------------------------

const personalProfiles = ref<TalosPersonalVoiceProfileSummary[]>([])
const personalProfilesLoaded = ref(false)
const showEnrollment = ref(false)
const renamingProfileId = ref<string | null>(null)
const renameDraft = ref('')
const confirmingDeleteId = ref<string | null>(null)
/**
 * ⛔ Honestly hidden when unsupported - the same rule `supported` already
 * applies to the read-aloud section below, for the same reason: a device
 * without the arm64-v8a model files (`TalosVoiceModelManager.isPresent`)
 * must never offer "Create your voice" only to have every real call inside
 * the wizard fail one screen later.
 */
const personalVoiceSupported = ref(false)

/**
 * ⭐⭐⭐ FASE 5, BLOCCO 3c — il bottone che scarica il motore, invece di
 * `adb push` a mano.
 *
 * ⛔ `import()` pigro apposta: `services/voiceModelInstall.ts` porta con sé
 * l'intero `stores/modelTransfers.ts` (poller, notifiche, toast) — un
 * grafo più pesante del semplice wrapper di `personalVoice.ts` già
 * importato sopra, e chi non tocca mai «Installa» non deve pagarne un
 * byte nel grafo di questo pannello.
 */
const installProgress = ref<TalosVoiceModelInstallProgress | null>(null)
const installing = computed(() => {
    const phase = installProgress.value?.phase
    return phase !== undefined && phase !== 'done' && phase !== 'failed'
})
const installPercent = computed(() => {
    const progress = installProgress.value
    if (!progress || progress.phase !== 'downloading' || progress.totalBytes === 0) return 0
    return Math.round((progress.haveBytes / progress.totalBytes) * 100)
})

async function beginModelInstall(): Promise<void> {
    if (installing.value) return
    installProgress.value = { phase: 'starting' }
    try {
        const { talosInstallPersonalVoiceModel } = await import('@/services/voiceModelInstall')
        const result = await talosInstallPersonalVoiceModel((progress) => { installProgress.value = progress })
        if (result.ok) {
            personalVoiceSupported.value = true
            installProgress.value = null
        } else {
            // ⛔ Non ci si fida che l'ultimo avviso di `onProgress` avesse già
            // scritto `{phase:'failed'}` prima che la promessa si risolvesse:
            // è vero per l'orchestratore reale, ma legarsi a un invariante
            // implicito di un altro modulo — invece di garantirlo qui — è
            // fragile, ed è esattamente il tipo di accoppiamento che un test
            // con un mock più semplice del vero avrebbe smascherato tardi,
            // sul dispositivo, invece che ora.
            installProgress.value = { phase: 'failed', reason: result.reason }
        }
    } catch (error) {
        // ⛔ Copre anche la piattaforma senza il plugin nativo (web): un
        // fallimento onesto, non un rifiuto di promessa che nessuno cattura.
        installProgress.value = { phase: 'failed', reason: error instanceof Error ? error.message : 'unavailable' }
    }
}

async function refreshPersonalProfiles(): Promise<void> {
    personalProfiles.value = await talosPersonalVoiceProfiles()
    personalProfilesLoaded.value = true
}
onMounted(() => {
    void talosPersonalVoiceStatus().then((status) => { personalVoiceSupported.value = status.supported })
    void refreshPersonalProfiles()
})

function beginRename(profile: TalosPersonalVoiceProfileSummary): void {
    renamingProfileId.value = profile.id
    renameDraft.value = profile.name
}
async function confirmRename(): Promise<void> {
    const profileId = renamingProfileId.value
    const name = renameDraft.value.trim()
    if (!profileId || !name) { renamingProfileId.value = null; return }
    await talosRenamePersonalVoiceProfile(profileId, name)
    renamingProfileId.value = null
    await refreshPersonalProfiles()
}
async function confirmDelete(profileId: string): Promise<void> {
    await talosDeletePersonalVoiceProfile(profileId)
    confirmingDeleteId.value = null
    await refreshPersonalProfiles()
}
function onEnrollmentCommitted(): void {
    void refreshPersonalProfiles()
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

        <div v-if="personalVoiceSupported" data-testid="talos-personal-voice" class="mt-4 border-t border-[var(--talos-border)] pt-3">
            <h5 class="flex items-center gap-2 text-xs font-semibold text-[var(--talos-text)]">
                <User class="size-4 text-[var(--talos-accent)]" aria-hidden="true" /> {{ t('personalVoice.title') }}
            </h5>
            <p class="mt-0.5 text-xs leading-5 text-[var(--talos-muted)]">{{ t('personalVoice.body') }}</p>

            <div v-if="personalProfilesLoaded && personalProfiles.length === 0" class="mt-3">
                <Button
                    type="button"
                    variant="outline"
                    data-testid="talos-personal-voice-create"
                    class="talos-pressable min-h-touch w-full gap-2 rounded-xl"
                    @click="showEnrollment = true"
                >{{ t('personalVoice.create') }}</Button>
            </div>

            <div v-else-if="personalProfiles.length > 0" class="mt-3 flex flex-col gap-2">
                <div
                    v-for="profile in personalProfiles"
                    :key="profile.id"
                    data-testid="talos-personal-voice-profile"
                    class="rounded-xl border border-[var(--talos-border)] p-3"
                >
                    <div v-if="renamingProfileId === profile.id" class="flex items-center gap-2">
                        <input
                            v-model="renameDraft"
                            type="text"
                            maxlength="60"
                            class="min-h-10 flex-1 rounded-lg border border-[var(--talos-border)] bg-[var(--talos-input,var(--talos-background))] px-2 text-sm outline-none focus:border-[var(--talos-accent)]"
                            @keydown.enter.prevent="confirmRename"
                        >
                        <Button type="button" size="sm" class="talos-pressable rounded-lg" @click="confirmRename">{{ t('common.continue') }}</Button>
                        <Button type="button" size="sm" variant="outline" class="talos-pressable rounded-lg" @click="renamingProfileId = null">{{ t('personalVoice.cancel') }}</Button>
                    </div>
                    <template v-else>
                        <div class="flex items-center justify-between gap-2">
                            <span class="text-sm font-semibold">{{ profile.name }}</span>
                            <span
                                class="rounded-full border px-2 py-0.5 text-3xs font-semibold uppercase tracking-wide"
                                :class="profile.compatible
                                    ? 'border-[var(--talos-accent-border)] bg-[var(--talos-accent-soft)] text-[var(--talos-accent)]'
                                    : 'border-[var(--talos-danger-border)] bg-[var(--talos-danger-soft)] text-[var(--talos-danger)]'"
                            >{{ profile.compatible ? t('personalVoice.active') : t('personalVoice.incompatible') }}</span>
                        </div>
                        <p v-if="!profile.compatible" class="mt-1 text-xs leading-5 text-[var(--talos-danger)]">{{ t('personalVoice.incompatibleBody') }}</p>
                        <div class="mt-2 flex gap-2">
                            <Button type="button" size="sm" variant="outline" class="talos-pressable gap-1.5 rounded-lg" @click="beginRename(profile)">
                                <Pencil class="size-3.5" aria-hidden="true" />{{ t('personalVoice.rename') }}
                            </Button>
                            <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                data-testid="talos-personal-voice-delete"
                                class="talos-pressable gap-1.5 rounded-lg border-[var(--talos-danger-border)] text-[var(--talos-danger)]"
                                @click="confirmingDeleteId = profile.id"
                            >
                                <Trash2 class="size-3.5" aria-hidden="true" />{{ t('personalVoice.delete') }}
                            </Button>
                        </div>
                        <div v-if="confirmingDeleteId === profile.id" class="mt-2 rounded-lg border border-[var(--talos-danger-border)] bg-[var(--talos-danger-soft)] p-2 text-xs leading-5">
                            <p>{{ t('personalVoice.deleteConfirmBody') }}</p>
                            <div class="mt-2 flex gap-2">
                                <Button type="button" size="sm" variant="outline" class="talos-pressable rounded-lg" @click="confirmingDeleteId = null">{{ t('personalVoice.cancel') }}</Button>
                                <Button
                                    type="button"
                                    size="sm"
                                    data-testid="talos-personal-voice-delete-confirm"
                                    class="talos-pressable rounded-lg bg-[var(--talos-danger)] text-white"
                                    @click="confirmDelete(profile.id)"
                                >{{ t('personalVoice.deleteForever') }}</Button>
                            </div>
                        </div>
                    </template>
                </div>
                <Button
                    type="button"
                    variant="outline"
                    data-testid="talos-personal-voice-add-another"
                    class="talos-pressable min-h-touch w-full gap-2 rounded-xl"
                    @click="showEnrollment = true"
                >{{ t('personalVoice.addAnother') }}</Button>
            </div>
        </div>

        <!--
            ⭐⭐⭐ Fase 5, Blocco 3c — prima questa sezione spariva e basta
            quando il modello non c'era (Blocco 4, quando non esisteva un
            installer). Ora offre di scaricarlo davvero.
        -->
        <div v-else data-testid="talos-personal-voice-install" class="mt-4 border-t border-[var(--talos-border)] pt-3">
            <h5 class="flex items-center gap-2 text-xs font-semibold text-[var(--talos-text)]">
                <User class="size-4 text-[var(--talos-accent)]" aria-hidden="true" /> {{ t('personalVoice.title') }}
            </h5>
            <p class="mt-0.5 text-xs leading-5 text-[var(--talos-muted)]">{{ t('personalVoice.installBody') }}</p>

            <Button
                type="button"
                variant="outline"
                data-testid="talos-personal-voice-install-start"
                class="talos-pressable mt-3 min-h-touch w-full gap-2 rounded-xl"
                :disabled="installing"
                @click="beginModelInstall"
            >{{ installing ? t('personalVoice.installing') : t('personalVoice.install') }}</Button>

            <p
                v-if="installProgress?.phase === 'downloading'"
                data-testid="talos-personal-voice-install-progress"
                class="mt-2 text-xs text-[var(--talos-muted)]"
            >{{ t('personalVoice.installProgress', { percent: installPercent }) }}</p>
            <p
                v-else-if="installProgress?.phase === 'activating'"
                class="mt-2 text-xs text-[var(--talos-muted)]"
            >{{ t('personalVoice.installActivating') }}</p>
            <p
                v-else-if="installProgress?.phase === 'failed'"
                data-testid="talos-personal-voice-install-error"
                class="mt-2 text-xs text-[var(--talos-danger)]"
            >{{ t('personalVoice.installFailed') }}</p>
        </div>

        <TalosMobilePersonalVoiceEnrollment
            v-if="showEnrollment"
            :existing-profile-count="personalProfiles.length"
            @close="showEnrollment = false"
            @committed="onEnrollmentCommitted"
        />

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
