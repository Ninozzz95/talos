import { readonly, ref } from 'vue'
import { talosDettaturaAnnota } from '@/services/dictation'
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
const voceDellaLettura = new Map<string, string>()

/**
 * Quale motore sta leggendo QUESTA lettura - `'personal'` se `toggle` ha
 * instradato lì (blueprint §37.1 "engine/profile snapshot fixed for one
 * reading": deciso una volta in `toggle`, mai richiesto di nuovo a metà).
 * Assente = sistema, lo stesso comportamento di sempre - così ogni lettura
 * che non passa mai da qui (tutte quelle di ieri, e `seguiIlTesto` anche
 * oggi, vedi la sua nota) resta esattamente quello che era.
 */
const motoreDellaLettura = new Map<string, 'personal'>()

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
    async function voceFissa(id: string): Promise<string | undefined> {
        const scelta = settings.state.voice.voice_uri
        if (scelta) return scelta
        const gia = voceDellaLettura.get(id)
        if (gia) return gia
        try {
            const [{ useTalosSpeechService }, { talosVoceDaUsare }] = await Promise.all([
                import('@/services/speech'),
                import('@/lib/voice/sceltaVoce'),
            ])
            const voci = await useTalosSpeechService().voices()
            const { voce } = talosVoceDaUsare(voci as never, {
                lingua: locale.value,
                // ⛔ `rete: false` — non e' avarizia di dati: e' l'unica scelta
                // che garantisce lo STESSO timbro dall'inizio alla fine.
                rete: false,
                scelta: null,
            })
            if (voce) voceDellaLettura.set(id, voce.name)
            return voce?.name
        } catch {
            // Se non si riesce a scegliere, si lascia decidere al motore: e' il
            // comportamento di prima, non un guasto nuovo.
            return undefined
        }
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
        speakingId.value = null
        if (stavaLeggendo && motoreDellaLettura.get(stavaLeggendo) === 'personal') {
            motoreDellaLettura.delete(stavaLeggendo)
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
        const quanto = quantoDetto.get(da)
        if (quanto !== undefined) quantoDetto.set(a, quanto)
        quantoDetto.delete(da)
        const voce = voceDellaLettura.get(da)
        if (voce) voceDellaLettura.set(a, voce)
        voceDellaLettura.delete(da)
        const motore = motoreDellaLettura.get(da)
        if (motore) motoreDellaLettura.set(a, motore)
        motoreDellaLettura.delete(da)
        speakingId.value = a
    }

    function segnaLetta(id: string): void {
        lette.value = new Set([...lette.value, id])
    }

    function apriLetturaDiVoce(id: string): boolean {
        if (speakingId.value !== null) return false
        speakingId.value = id
        lette.value = new Set([...lette.value, id])
        quantoDetto.delete(id)
        // Lettura nuova = voce da risolvere di nuovo: l'id del turno si riusa.
        voceDellaLettura.delete(id)
        // ⛔ Voce-iniziata = SEMPRE sistema (vedi la nota su `seguiIlTesto`) -
        // pulito comunque, per lo stesso motivo difensivo delle due righe sopra.
        motoreDellaLettura.delete(id)
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
        speakingId.value = id
        // ⛔ Si segna PRIMA di parlare, non a fine lettura: il segnalino deve
        // comparire quando la persona chiede, non quando il motore finisce.
        lette.value = new Set([...lette.value, id])

        const onend = (): void => { if (speakingId.value === id) speakingId.value = null }
        const onerror = (reason?: string): void => {
            if (speakingId.value === id) speakingId.value = null
            toasts.push({ message: t(frasePerIlMotivo(reason)) })
        }

        // Fallback silenzioso al sistema quando `talosSpeakForReading` torna
        // falso (§37.1: "fallback does not rewrite user choice") - la
        // preferenza salvata resta 'personal', solo QUESTA lettura usa il
        // sistema.
        if (settings.state.voice.engine === 'personal') {
            const v = settings.state.voice
            const { talosSpeakForReading } = await import('@/services/personalVoice')
            if (await talosSpeakForReading(v.engine, v.personal_profile_id, text, { rate: v.personal_rate, pitch: v.personal_pitch, onend, onerror })) {
                motoreDellaLettura.set(id, 'personal')
                return
            }
        }

        const voce = await voceFissa(id)
        const { useTalosSpeechService } = await import('@/services/speech')
        await useTalosSpeechService().speak(text, {
            voiceURI: voce,
            rate: settings.state.voice.rate,
            pitch: settings.state.voice.pitch,
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
     * ⛔ SEMPRE voce di sistema, anche con `engine: 'personal'` scelto -
     * deliberato, non dimenticato. `queue: 'add'` qui sotto conta su una
     * VERA coda: la frase 2 aspetta che la 1 finisca di suonare.
     * `TalosVoiceHost.submitSpeakStreamingWithReference` non ha una coda,
     * ha UNA generazione mutabile che la successiva invalida (§14) - una
     * frase 2 instradata lì interromperebbe la 1 a metà, non la seguirebbe.
     * `talosPersonalVoiceSpeechAdapter` lo dichiara nella sua stessa
     * documentazione. Restare sul sistema qui è la scelta onesta finché la
     * coda nativa non esiste davvero, non un'approssimazione silenziosa.
     */
    async function seguiIlTesto(id: string, testo: string, finito: boolean): Promise<void> {
        if (speakingId.value !== id) return
        const detto = quantoDetto.get(id) ?? 0
        const { talosFrasiDaLeggere } = await import('@/lib/voice/frasiDaLeggere')
        const { pronte, resto } = talosFrasiDaLeggere(testo, detto, finito)
        if (!pronte.length) return
        quantoDetto.set(id, testo.length - resto.length)
        const voce = await voceFissa(id)
        const { useTalosSpeechService } = await import('@/services/speech')
        const servizio = useTalosSpeechService()
        talosDettaturaAnnota(
            `voce: ${pronte.length} frasi da dire, finito=${finito}, testo=${testo.length} car, detto=${detto}, resto=${resto.length}`,
        )
        for (const frase of pronte) {
            const numero = pronte.indexOf(frase) + 1
            talosDettaturaAnnota(`voce: accodo ${numero}/${pronte.length} «${frase.slice(0, 28)}»`)
            await servizio.speak(frase, {
                voiceURI: voce,
                rate: settings.state.voice.rate,
                pitch: settings.state.voice.pitch,
                // ⛔ In coda: se no ogni frase ammazza la precedente a meta'.
                queue: 'add',
                // ⛔ L'ultima frase di un testo FINITO chiude la lettura senza
                // controllare l'id: fra l'accodamento e la fine la lettura puo'
                // aver cambiato nome (il messaggio vero e' nato), e un
                // confronto col nome vecchio lascerebbe il pulsante su «ferma»
                // per sempre — su una stanza silenziosa.
                onend: () => {
                    talosDettaturaAnnota(`voce: detta ${numero}/${pronte.length}`)
                    // ⛔ Solo l'ULTIMA frase di un testo FINITO chiude la
                    // lettura — le altre passano solo per lasciare la riga.
                    if (finito && frase === pronte[pronte.length - 1]) speakingId.value = null
                },
            })
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
}
