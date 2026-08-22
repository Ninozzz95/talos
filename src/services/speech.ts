/**
 * Owner 2026-07-24 — text-to-speech for assistant replies. Local-first: the
 * DEVICE speech synthesizer (Web Speech API, present in the Android WebView),
 * no backend, offline. Selectable voices ("models") + rate/pitch ("tones").
 * Provider-backed neural TTS (OpenAI/ElevenLabs) is a future extension gated on
 * keys + network; this is the honest on-device path.
 */
import { Capacitor, registerPlugin } from '@capacitor/core'
import {
    talosSiglaVoce,
    talosVoceDaUsare,
    type TalosVoceDispositivo,
} from '@/lib/voice/sceltaVoce'

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
    /** `add` mette in coda dietro cio' che sta suonando; assente = zittisce. */
    queue?: 'flush' | 'add'
    onend?: () => void
    /**
     * ⛔ Il motivo arriva DENTRO l'errore, e non è un ornamento.
     *
     * Il motore nativo si rifiuta di parlare col telefono in silenzioso e lo
     * dice: `{spoken:false, reason:"silenced"}`. Senza portare quel motivo fin
     * qui, il pulsante tornerebbe da solo allo stato di partenza e la persona
     * vedrebbe **niente** — cioè la stessa esperienza di un pulsante rotto.
     */
    onerror?: (reason?: string) => void
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
    /** `add` per leggere una frase alla volta mentre la risposta si scrive. */
    queue?: 'flush' | 'add'
    onend?: () => void
    onerror?: (reason?: string) => void
}

export interface TalosSpeechService {
    supported(): boolean
    voices(): TalosSpeechVoice[]
    speak(text: string, options?: TalosSpeakOptions): Promise<void>
    stop(): void
}

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value))

/**
 * Il testo COME SI LEGGE, non come si scrive.
 *
 * ⛔ MISURATO sul Pad il 2026-08-10, spiando cosa arriva al motore:
 *
 * ```
 *   TalosSpeech.speak {"text":"Invio a mamma: **“ok”**.\n\nRisposto a mamma: **“ok”**."}
 * ```
 *
 * Gli asterischi finiscono nella voce. `TextToSpeech` non conosce il Markdown:
 * legge quello che gli dai, e «asterisco asterisco ok asterisco asterisco» è
 * esattamente ciò che una persona sente.
 *
 * ⇒ Si toglie la punteggiatura di STRUTTURA e si tiene il testo. Non è un
 * parser: è la lista corta di segni che il modello usa davvero — grassetto,
 * corsivo, codice, titoli, elenchi, collegamenti — e ognuno lascia dietro il
 * suo contenuto.
 */
export function talosTestoDaLeggere(markdown: string): string {
    return markdown
        /*
         * ⛔⛔ IL RAGIONAMENTO NON SI LEGGE — owner 2026-08-10: «il tts legge
         * anche il blocco di ragionamento, deve solo leggere la risposta».
         *
         * Non è un dettaglio estetico: il ragionamento è lungo quanto la
         * risposta o di più, è scritto per la macchina, e spesso è in inglese
         * mentre la risposta è in italiano. Chi preme «leggi» si sente leggere
         * il processo invece del risultato, e la funzione diventa inservibile.
         *
         * ⛔ Si tolgono le ETICHETTE ESPLICITE, non «tutto ciò che sembra un
         * ragionamento»: `message.reasoning` è già un campo separato, quindi
         * questa riga serve per i modelli che lo scrivono IN LINEA nel testo —
         * i locali lo fanno. Un filtro più largo mangerebbe la risposta.
         */
        .replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, ' ')
        .replace(/<\|?(?:begin_of_thought|thought)\|?>[\s\S]*?<\|?(?:end_of_thought|\/thought)\|?>/gi, ' ')
        // Un blocco aperto e mai chiuso: una risposta interrotta a metà del
        // ragionamento non deve farsi leggere per intero.
        .replace(/<think(?:ing)?>[\s\S]*$/i, ' ')
        /*
         * ⛔⛔ GLI EMOJI NON SI LEGGONO — owner 2026-08-10, sentito sul Pad:
         * «il tts dice ciao mano che saluta».
         *
         * Ogni emoji ha un NOME nel database Unicode, e `TextToSpeech` legge
         * quello: «Ciao 👋» diventa «Ciao mano che saluta». Un modello che
         * chiude ogni risposta con un'emoji — cioè quasi tutti — trasforma ogni
         * lettura in una filastrocca di didascalie.
         *
         * ⛔ Si usa `Extended_Pictographic` e NON `Emoji`: la seconda comprende
         * le CIFRE (0-9 hanno la proprietà Emoji per via dei tasti numerici), e
         * cancellerebbe i numeri dalle risposte. Un filtro che toglie «2026»
         * dalla lettura sarebbe peggio dell'emoji che voleva togliere.
         *
         * Si tolgono anche i pezzi che compongono un'emoji e non stanno da
         * soli: selettore di variante, giuntore a larghezza zero, tonalità
         * della pelle, indicatori regionali (le bandiere) e il quadratino dei
         * tasti — se no restano segni orfani che il motore prova a dire.
         */
        .replace(
            /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{1F3FB}-\u{1F3FF}️‍⃣]/gu,
            ' ',
        )
        // I blocchi di codice si annunciano invece di essere sillabati.
        .replace(/```[\s\S]*?```/g, ' ')
        // `codice in linea` → codice in linea
        .replace(/`([^`]+)`/g, '$1')
        // [testo](indirizzo) → testo: l'indirizzo letto ad alta voce è rumore.
        .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
        // **grassetto**, *corsivo*, __sottolineato__, _corsivo_
        .replace(/(\*\*|__)(.*?)\1/g, '$2')
        .replace(/(\*|_)(.*?)\1/g, '$2')
        // I titoli perdono i cancelletti, non il titolo.
        .replace(/^#{1,6}\s+/gm, '')
        // I trattini di elenco a inizio riga.
        .replace(/^\s*[-*+]\s+/gm, '')
        // Le citazioni.
        .replace(/^\s*>\s?/gm, '')
        .replace(/[ \t]+/g, ' ')
        .trim()
}

export function createTalosSpeechService(synth: TalosSpeechSynth | null): TalosSpeechService {
    return {
        supported() {
            return synth !== null
        },
        voices() {
            return synth ? synth.getVoices() : []
        },
        async speak(text, options = {}) {
            if (!synth) {
                // ⛔ Nessun motore non è «niente da fare»: chi ha premuto deve
                // sapere perché non ha sentito nulla.
                options.onerror?.('unavailable')
                return
            }
            const trimmed = talosTestoDaLeggere(text)
            if (!trimmed) { options.onerror?.('empty'); return }
            /*
             * ⛔ Si zittisce PRIMA — tranne quando si accoda.
             *
             * «Sempre annullare» era giusto finche' si leggeva una risposta
             * intera alla volta. Leggendo mentre la risposta si scrive, ogni
             * frase nuova ammazzerebbe la precedente a meta': si sentirebbe una
             * sillaba per frase.
             */
            if (options.queue !== 'add') synth.cancel()
            synth.speak({
                text: trimmed,
                voiceURI: options.voiceURI,
                rate: clamp(options.rate ?? 1, 0.5, 2),
                pitch: clamp(options.pitch ?? 1, 0, 2),
                queue: options.queue,
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

/* -------------------------------------------------------------------------- *
 * ⭐⭐ IL MOTORE NATIVO — e perché su Android è l'UNICO che esiste
 * -------------------------------------------------------------------------- */

/**
 * L'adattatore sul plugin `TalosSpeech`, cioè su `android.speech.tts`.
 *
 * ## ⛔ IL DIFETTO CHE HA CREATO QUESTA FUNZIONE
 *
 * Owner 2026-08-10: «ogni messaggio di risposta deve avere icona sound per
 * tts». Il pulsante c'era già — icona `Volume2`, che diventa `Square` mentre
 * parla, con tanto di etichette tradotte e test — ma **non è mai comparso su
 * nessun messaggio, su nessun telefono**.
 *
 * MISURATO nella WebView del Pad:
 *
 * ```
 *   'speechSynthesis' in window        false
 *   typeof SpeechSynthesisUtterance    undefined
 *   Capacitor.Plugins.TalosSpeech.speak  function     ← il motore vero
 * ```
 *
 * La WebView di Android **non ha la Web Speech API**. `supported()` era quindi
 * sempre falso, e il `v-if` sul pulsante lo cancellava. Nel frattempo il motore
 * nativo funzionava: provato lo stesso giorno, `{spoken:true}` e `speaking` da
 * falso a vero.
 *
 * ⇒ Due motori, e l'interfaccia era appesa a quello che sul dispositivo non
 * esiste. È la stessa forma del compito #33 — codice giusto, sintomo invisibile
 * — e si vede solo provando sul telefono.
 *
 * ## Le due cose che il nativo fa e il web no
 *
 * - **si rifiuta di parlare col telefono in silenzioso**, e dice perché: quel
 *   motivo arriva fino al pulsante invece di sparire;
 * - **dice quando ha finito** (`talosSpeechDone`), che è ciò che riporta l'icona
 *   da «ferma» a «ascolta». Senza, resterebbe «ferma» per sempre.
 */
export function talosNativeSpeechSynth(): TalosSpeechSynth | null {
    if (!Capacitor.isNativePlatform() || !Capacitor.isPluginAvailable('TalosSpeech')) return null
    const plugin = registerPlugin<{
        speak(options: { text: string, rate?: number, pitch?: number, queue?: 'flush' | 'add' }): Promise<{ spoken: boolean, reason?: string }>
        stop(): Promise<unknown>
        voices(): Promise<{ available: boolean, voices?: TalosVoceDispositivo[], current?: string | null }>
        setVoice(options: { name: string }): Promise<{ done: boolean, reason?: string }>
        addListener(evento: string, cb: () => void): Promise<unknown>
    }>('TalosSpeech')

    /*
     * ⛔⛔ L'ELENCO VERO, e prima qui c'era `() => []`.
     *
     * MISURATO sul Pad il 2026-08-10, i due elenchi nello stesso istante:
     *
     * ```
     *   Web Speech API (quello che la schermata mostrava)     0 voci
     *   plugin nativo  (quello che parla davvero)           473 voci
     *   voce in uso                                    it-IT-language
     * ```
     *
     * Il selettore era vuoto e il motore restava sulla generica: owner, «la
     * voce è troppo robotica». Non c'era una scelta sbagliata — non c'era
     * nessuna scelta.
     *
     * ⛔ `getVoices()` è SINCRONO per contratto (lo è nel Web Speech API), e il
     * nativo risponde su un thread. Si tiene una copia e si riempie appena si
     * può: la prima chiamata può tornare vuota, e il pannello rilegge — come
     * faceva già per i motori lenti del browser.
     */
    let elenco: TalosVoceDispositivo[] = []
    const aggiorna = () => plugin.voices()
        .then((r) => { if (r?.available && Array.isArray(r.voices)) elenco = r.voices })
        .catch(() => { /* il pannello mostrerà l'elenco vuoto, che è la verità */ })
    void aggiorna()

    /*
     * ⛔ UNA sola frase alla volta, e il richiamo è quello dell'ULTIMA.
     *
     * L'evento `talosSpeechDone` non porta l'identità della frase, e non serve
     * che lo faccia: il servizio annulla sempre prima di parlare, quindi in aria
     * non ce n'è mai più di una. Tenere una mappa di richiami darebbe l'idea
     * sbagliata che ne possano convivere due.
     */
    let finita: (() => void) | null = null
    /**
     * ⛔ La CODA delle letture: garantisce che «applica la voce» e «parla»
     * restino nell'ordine giusto anche quando le frasi arrivano una dietro
     * l'altra. Vedi il commento dentro `speak`.
     */
    let catena: Promise<unknown> = Promise.resolve()
    void plugin.addListener('talosSpeechDone', () => {
        const chiudi = finita
        finita = null
        chiudi?.()
    })

    return {
        /*
         * Le voci del motore che parla davvero, tradotte nella forma che il
         * pannello conosce. `voiceURI` è il nome nativo: è quello che
         * `setVoice` vuole indietro, quindi non si inventa un id nostro che poi
         * andrebbe rimappato.
         */
        getVoices: () => elenco.map((v) => ({
            voiceURI: v.name,
            name: talosSiglaVoce(v) + (v.network ? ' · rete' : ''),
            lang: v.locale,
        })),
        speak(utterance) {
            finita = utterance.onend ?? null
            /*
             * ⛔ La voce si applica PRIMA di ogni frase, non una volta all'avvio.
             * Il motore torna alla generica quando il servizio si riavvia — e si
             * riavvia da solo, per un aggiornamento o un cambio di lingua. Una
             * preferenza applicata una volta sola è una preferenza che un giorno
             * sparisce senza che nessuno se ne accorga.
             */
            const scelta = talosVoceDaUsare(elenco, {
                // La lingua dell'interfaccia: è quella in cui TALOS sta
                // parlando, e può divergere da quella del telefono.
                lingua: document.documentElement.lang || navigator.language || 'it',
                rete: navigator.onLine !== false,
                scelta: utterance.voiceURI ?? null,
            })
            /*
             * ⛔⛔ SI ASPETTA CHE LA VOCE SIA APPLICATA — e prima non si
             * aspettava. Owner 2026-08-11: «quando TALOS parla, per i primi
             * secondi si sente la voce predefinita e poi cambia con la voce che
             * ho scelto».
             *
             * La riga era `void plugin.setVoice(...)` seguita subito da
             * `plugin.speak(...)`: due chiamate al ponte lanciate nello stesso
             * istante, e il ponte le consegna nell'ordine in cui arrivano al suo
             * thread — non nell'ordine in cui servono. Il motore cominciava a
             * parlare con la voce che aveva, e cambiava quando `setVoice`
             * finalmente atterrava. Non era «la voce ci mette un po'»: era che
             * non l'avevamo ancora messa.
             *
             * ⛔ E si SERIALIZZA con una catena, invece di aspettare qui: leggendo
             * mentre la risposta si scrive le frasi arrivano una dietro l'altra, e
             * due `speak` che aspettano ciascuna la propria `setVoice` potrebbero
             * scavalcarsi — cioè leggere la seconda frase prima della prima. La
             * catena garantisce l'ordine senza far aspettare chi chiama.
             */
            catena = catena
                .then(async () => {
                    if (scelta.voce) await plugin.setVoice({ name: scelta.voce.name })
                    const esito = await plugin.speak({
                        text: utterance.text,
                        rate: utterance.rate,
                        pitch: utterance.pitch,
                        // ⛔ Accodare, quando si legge mentre la risposta arriva:
                        // con «flush» ogni frase nuova ammazza quella che suona.
                        queue: utterance.queue,
                    })
                    if (esito?.spoken) return
                    finita = null
                    utterance.onerror?.(esito?.reason)
                })
                .catch(() => { finita = null; utterance.onerror?.(undefined) })
        },
        cancel() {
            finita = null
            void plugin.stop().catch(() => undefined)
        },
    }
}

let singleton: TalosSpeechService | null = null

/**
 * Il motore vero se c'è, la Web Speech API se non c'è.
 *
 * ⛔ L'ordine non è negoziabile: su Android il primo esiste e il secondo no.
 */
export function useTalosSpeechService(): TalosSpeechService {
    if (!singleton) {
        singleton = createTalosSpeechService(talosNativeSpeechSynth() ?? talosPlatformSpeechSynth())
    }
    return singleton
}

/** ⛔ Solo per i test: il singleton nasconderebbe il motore iniettato. */
export function __resetTalosSpeechServiceForTests(): void {
    singleton = null
}
