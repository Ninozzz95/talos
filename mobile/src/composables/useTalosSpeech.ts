import { readonly, ref } from 'vue'
import { talosDettaturaAnnota } from '@/services/dictation'
import { useSettingsStore } from '@/stores/settings'
import { useTalosMobileToasts } from '@/stores/toasts'
import { useTalosI18n } from '@/i18n'
import type { TalosVoiceReadingSource, VoiceReadingRoute } from '@/lib/voice/personalVoiceContracts'

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

interface VoiceReadingState {
    id: string
    readonly route: Readonly<VoiceReadingRoute>
    spokenCharacters: number
    fixedSystemVoice?: string
    personalJobs: number
    pendingJobs: number
    inputFinished: boolean
    personalAccepted: boolean
    fallbackToSystem: boolean
}

/** One state object per logical reading; rename moves the object, never the route snapshot. */
const lettureInCorso = new Map<string, VoiceReadingState>()

/**
 * ⛔⛔ LA VOCE CAMBIAVA TONO A META' LETTURA.
 *
 * Owner 2026-08-10: «si sente una voce e poi dopo un po' cambia tono». MISURATO
 * in logcat, non dedotto:
 *
 *     Synthesis request for locale ita-ITA and name it-it-x-itb-network
 *     TTS dispatch: it-it-x-itb-server, local fallback: it-it-x-itb-seanet-embedded
 *
 * Due cause, una sopra l'altra:
 *
 * **1. Nessuno fissava la voce.** Senza una scelta esplicita passavamo
 * `undefined`, e ogni frase e' una `speak()` a se': il motore risolveva la
 * «predefinita» da capo ogni volta, e poteva risolverla DIVERSA. In una lettura
 * di ieri il dispaccio era della famiglia `kda`, in una di oggi `itb`.
 *
 * **2. La voce di rete ha un ripiego LOCALE, col timbro di un'altra voce.** Lo
 * dice il log stesso: `it-it-x-itb-server` con `local fallback:
 * it-it-x-itb-seanet-embedded`. Basta un'esitazione della rete a meta' lettura e
 * il timbro cambia da solo — e fissare il NOME non lo impedisce, perche' il
 * salto lo fa il motore dentro di se'.
 *
 * ⇒ La voce si risolve UNA volta per lettura e si passa a ogni frase; e senza
 * una scelta esplicita si preferisce una voce che NON dipende dalla rete. Costa
 * pochissimo (le `seanet` incorporate sono neurali) e in cambio il timbro non
 * cambia mai — nemmeno in ascensore.
 */
export function useTalosSpeech() {
    const settings = useSettingsStore()
    const toasts = useTalosMobileToasts()
    const { t, locale } = useTalosI18n()

    /**
     * La voce da usare per TUTTE le frasi di questa lettura.
     *
     * ⛔ Si risolve una volta sola e si ricorda: risolverla a ogni frase e' il
     * difetto, non la cura.
     */
    async function voceFissa(reading: VoiceReadingState): Promise<string | undefined> {
        const scelta = reading.route.voiceUri
        if (scelta) return scelta
        const gia = reading.fixedSystemVoice
        if (gia) return gia
        try {
            const [{ useTalosSpeechService }, { talosVoceDaUsare }] = await Promise.all([
                import('@/services/speech'),
                import('@/lib/voice/sceltaVoce'),
            ])
            const voci = await useTalosSpeechService().voices()
            const { voce } = talosVoceDaUsare(voci as never, {
                lingua: reading.route.locale,
                // ⛔ `rete: false` — non e' avarizia di dati: e' l'unica scelta
                // che garantisce lo STESSO timbro dall'inizio alla fine.
                rete: false,
                scelta: null,
            })
            if (voce) reading.fixedSystemVoice = voce.name
            return voce?.name
        } catch {
            // Se non si riesce a scegliere, si lascia decidere al motore: e' il
            // comportamento di prima, non un guasto nuovo.
            return undefined
        }
    }

    function snapshotRoute(id: string, source: TalosVoiceReadingSource): Readonly<VoiceReadingRoute> {
        const voice = settings.state.voice
        return Object.freeze({
            readingId: id,
            engine: voice.engine,
            personalProfileId: voice.personal_profile_id,
            locale: locale.value,
            source,
            voiceUri: voice.voice_uri,
            systemRate: voice.rate,
            systemPitch: voice.pitch,
            personalRate: voice.personal_rate,
            personalPitch: voice.personal_pitch,
        })
    }

    function nuovaLettura(id: string, source: TalosVoiceReadingSource): VoiceReadingState {
        return {
            id,
            route: snapshotRoute(id, source),
            spokenCharacters: 0,
            personalJobs: 0,
            pendingJobs: 0,
            inputFinished: false,
            personalAccepted: false,
            fallbackToSystem: false,
        }
    }

    function terminaLettura(reading: VoiceReadingState): void {
        if (lettureInCorso.get(reading.id) !== reading) return
        lettureInCorso.delete(reading.id)
        if (speakingId.value === reading.id) speakingId.value = null
    }

    function completaJob(reading: VoiceReadingState): void {
        reading.pendingJobs = Math.max(0, reading.pendingJobs - 1)
        if (reading.inputFinished && reading.pendingJobs === 0) terminaLettura(reading)
    }

    /**
     * ⛔⛔ CHI FERMA TALOS DEVE DIRE IL PROPRIO NOME.
     *
     * Owner 2026-08-12, tre volte di fila: «il discorso si tronca a metà». Da
     * fuori quel sintomo ha almeno quattro cause identiche fra loro — il testo
     * arriva già tagliato, la coda del motore perde frasi, qualcuno chiama
     * `stop()`, il motore sbaglia e tace — e nessuna delle quattro lasciava una
     * riga.
     *
     * ⇒ `stop` non è più anonimo. Il motivo finisce nella stessa riga temporale
     * di tutto il resto della voce, e la domanda «chi ha zittito TALOS?» smette
     * di essere una deduzione.
     */
    async function stop(motivo = 'non dichiarato'): Promise<void> {
        talosDettaturaAnnota(`voce: STOP (${motivo}) mentre leggeva=${speakingId.value ?? '-'}`)
        const stavaLeggendo = speakingId.value
        const reading = stavaLeggendo ? lettureInCorso.get(stavaLeggendo) : undefined
        speakingId.value = null
        if (stavaLeggendo) lettureInCorso.delete(stavaLeggendo)
        if (reading?.route.engine === 'personal' && !reading.fallbackToSystem) {
            const { talosStopPersonalVoice } = await import('@/services/personalVoice')
            await talosStopPersonalVoice()
            return
        }
        const { useTalosSpeechService } = await import('@/services/speech')
        useTalosSpeechService().stop()
    }

    /**
     * ⭐⭐ Apre la lettura di una risposta che sta ANCORA arrivando.
     *
     * Owner 2026-08-10: se il turno l'hai dettato, la risposta parte a voce da
     * sola. Qui non si parla: si dichiara «questa la sto leggendo», e poi
     * `seguiIlTesto` manda al motore una frase alla volta man mano che si
     * scrive — che è la differenza fra sentire subito e aspettare la fine.
     *
     * ⛔ Non ruba la voce a una lettura in corso: se qualcosa si sta già
     * leggendo, chi ha chiesto quella viene prima.
     */
    /**
     * Il segnalino sul messaggio VERO.
     *
     * ⛔ Serve perche' durante lo streaming l'id definitivo non esiste ancora:
     * la lettura si apre su un id del turno, e il segnalino si posa qui quando
     * il messaggio nasce. Senza, la voce si sentirebbe e l'icona non
     * comparirebbe su niente.
     */
    /**
     * ⛔⛔ La lettura CAMBIA NOME quando il messaggio vero nasce.
     *
     * Owner 2026-08-10: «se il TTS è ancora attivo l'icona sound in basso
     * dovrebbe essere stop, perché il TTS è in corso e posso fermarlo in
     * qualunque momento». Aveva ragione, ed era un difetto MIO: la lettura di un
     * turno nato dalla voce si apre su un id del TURNO — durante lo streaming il
     * messaggio non esiste ancora — e cosi' nessuna riga di comandi si
     * riconosceva «in lettura». Il pulsante restava altoparlante mentre la voce
     * parlava, e non c'era modo di fermarla se non dalle impostazioni.
     */
    function rinominaLettura(da: string, a: string): void {
        if (speakingId.value !== da) return
        const reading = lettureInCorso.get(da)
        if (reading) {
            lettureInCorso.delete(da)
            reading.id = a
            lettureInCorso.set(a, reading)
        }
        speakingId.value = a
    }

    function segnaLetta(id: string): void {
        lette.value = new Set([...lette.value, id])
    }

    function apriLetturaDiVoce(id: string, source: TalosVoiceReadingSource = 'assistant'): boolean {
        if (speakingId.value !== null) return false
        speakingId.value = id
        lette.value = new Set([...lette.value, id])
        lettureInCorso.set(id, nuovaLettura(id, source))
        return true
    }

    /**
     * Blueprint §37.1 "Router": chi legge questa risposta si decide QUI, una
     * volta, prima di dire una sola parola - mai richiesto di nuovo mentre
     * `speak()` è in volo. `engine === 'system'` prende la scorciatoia che
     * esisteva già ieri (non chiama mai il plugin personale, la prima delle
     * cinque regole del router); solo `'personal'` con uno stato pronto
     * paga il giro in più.
     */
    async function toggle(id: string, text: string): Promise<void> {
        if (speakingId.value === id) {
            await stop('la persona ha premuto Interrompi')
            return
        }
        const precedente = speakingId.value
        if (precedente) lettureInCorso.delete(precedente)
        speakingId.value = id
        const reading = nuovaLettura(id, 'manual')
        lettureInCorso.set(id, reading)
        // ⛔ Si segna PRIMA di parlare, non a fine lettura: il segnalino deve
        // comparire quando la persona chiede, non quando il motore finisce.
        lette.value = new Set([...lette.value, id])

        const onend = (): void => terminaLettura(reading)
        const onerror = (reason?: string): void => {
            terminaLettura(reading)
            toasts.push({ message: t(frasePerIlMotivo(reason)) })
        }

        // ⭐⭐⭐ Owner 22/8: «documento_complesso» detto con l'underscore -
        // il testo per il motore non è mai il markdown grezzo del messaggio.
        const { talosTestoPerVoce } = await import('@/lib/voice/testoPerVoce')
        const daDire = talosTestoPerVoce(text)

        // Fallback silenzioso al sistema quando `talosSpeakForReading` torna
        // falso (§37.1: "fallback does not rewrite user choice") - la
        // preferenza salvata resta 'personal', solo QUESTA lettura usa il
        // sistema.
        if (reading.route.engine === 'personal') {
            const { talosSpeakForReading } = await import('@/services/personalVoice')
            if (await talosSpeakForReading(reading.route.engine, reading.route.personalProfileId, daDire, {
                rate: reading.route.personalRate,
                pitch: reading.route.personalPitch,
                readingId: reading.route.readingId,
                queue: 'flush',
                locale: reading.route.locale,
                source: reading.route.source,
                onend,
                onerror,
            })) {
                reading.personalAccepted = true
                return
            }
            reading.fallbackToSystem = true
        }

        const voce = await voceFissa(reading)
        const { useTalosSpeechService } = await import('@/services/speech')
        await useTalosSpeechService().speak(daDire, {
            voiceURI: voce,
            rate: reading.route.systemRate,
            pitch: reading.route.systemPitch,
            onend,
            onerror,
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
     *
     * La rotta (engine, profilo, locale, rate/pitch e origine) è lo snapshot
     * creato da `apriLetturaDiVoce`: non viene più riletta dallo store a ogni
     * chunk. Ogni frase completa è un job bounded; la prima usa `flush`, le
     * successive `add`, che il gate atomico nativo fa partire in FIFO senza
     * invalidare la generazione già udibile.
     */
    async function seguiIlTesto(id: string, testo: string, finito: boolean): Promise<void> {
        if (speakingId.value !== id) return
        const reading = lettureInCorso.get(id)
        if (!reading) return
        const [{ talosTestoPerVoce }, { talosFrasiDaLeggere }] = await Promise.all([
            import('@/lib/voice/testoPerVoce'),
            import('@/lib/voice/frasiDaLeggere'),
        ])
        const detto = reading.spokenCharacters
        const { pronte, resto } = talosFrasiDaLeggere(testo, detto, finito)
        reading.inputFinished = reading.inputFinished || finito
        if (!pronte.length) {
            if (reading.inputFinished && reading.pendingJobs === 0) terminaLettura(reading)
            return
        }
        reading.spokenCharacters = testo.length - resto.length
        talosDettaturaAnnota(
            `voce: ${pronte.length} frasi da dire, finito=${finito}, testo=${testo.length} car, detto=${detto}, resto=${resto.length}`,
        )

        if (reading.route.engine === 'personal' && !reading.fallbackToSystem) {
            const { talosSpeakForReading, talosStopPersonalVoice } = await import('@/services/personalVoice')
            for (let index = 0; index < pronte.length; index += 1) {
                const frase = pronte[index]!
                const numero = index + 1
                reading.pendingJobs += 1
                let settled = false
                const onend = (): void => {
                    if (settled) return
                    settled = true
                    talosDettaturaAnnota(`voce: detta ${numero}/${pronte.length}`)
                    completaJob(reading)
                }
                const onerror = (reason?: string): void => {
                    if (!settled) {
                        settled = true
                        reading.pendingJobs = Math.max(0, reading.pendingJobs - 1)
                    }
                    terminaLettura(reading)
                    toasts.push({ message: t(frasePerIlMotivo(reason)) })
                    void talosStopPersonalVoice()
                }
                const accepted = await talosSpeakForReading(
                    reading.route.engine,
                    reading.route.personalProfileId,
                    talosTestoPerVoce(frase),
                    {
                        rate: reading.route.personalRate,
                        pitch: reading.route.personalPitch,
                        readingId: reading.route.readingId,
                        queue: reading.personalJobs === 0 ? 'flush' : 'add',
                        locale: reading.route.locale,
                        source: reading.route.source,
                        onend,
                        onerror,
                    },
                )
                if (!accepted) {
                    if (!settled) {
                        settled = true
                        reading.pendingJobs = Math.max(0, reading.pendingJobs - 1)
                    }
                    if (reading.personalAccepted) {
                        onerror('unavailable')
                        return
                    }
                    reading.fallbackToSystem = true
                    break
                }
                reading.personalAccepted = true
                reading.personalJobs += 1
            }
            if (!reading.fallbackToSystem) return
        }

        const voce = await voceFissa(reading)
        if (lettureInCorso.get(reading.id) !== reading) return
        const { useTalosSpeechService } = await import('@/services/speech')
        const servizio = useTalosSpeechService()
        for (let index = 0; index < pronte.length; index += 1) {
            const frase = pronte[index]!
            const numero = index + 1
            talosDettaturaAnnota(`voce: accodo ${numero}/${pronte.length} «${frase.slice(0, 28)}»`)
            reading.pendingJobs += 1
            let settled = false
            const settle = (): void => {
                if (settled) return
                settled = true
                talosDettaturaAnnota(`voce: detta ${numero}/${pronte.length}`)
                completaJob(reading)
            }
            try {
                await servizio.speak(talosTestoPerVoce(frase), {
                    voiceURI: voce,
                    rate: reading.route.systemRate,
                    pitch: reading.route.systemPitch,
                    queue: 'add',
                    onend: settle,
                    onerror: (reason?: string) => {
                        settle()
                        terminaLettura(reading)
                        toasts.push({ message: t(frasePerIlMotivo(reason)) })
                    },
                })
            } catch {
                settle()
                terminaLettura(reading)
                toasts.push({ message: t(frasePerIlMotivo(undefined)) })
                return
            }
        }
    }

    return {
        speakingId: readonly(speakingId),
        seguiIlTesto,
        apriLetturaDiVoce,
        rinominaLettura,
        segnaLetta,
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
    lettureInCorso.clear()
}
