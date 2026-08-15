import { z } from 'zod'
import { defineTalosTool, type TalosToolDefinition } from '@/lib/tools/registry'
import {
    TALOS_SCHERMATE_DI_SISTEMA,
    talosSchermataDiSistema,
} from '@/lib/device/capabilities'

/**
 * I tool che toccano il TELEFONO, non i dati.
 *
 * ## ⛔ Perché ognuno dice cosa è successo DAVVERO
 *
 * MISURATO sul Pad dell'owner il 2026-08-08: **non ha il motore della
 * vibrazione**. La chiamata non fallisce — semplicemente non succede niente — e
 * un tool che rispondesse «fatto» avrebbe raccontato la bugia più facile da
 * dire e più difficile da scoprire. Insegnerebbe a non fidarsi di **tutti** gli
 * altri tool, non solo di questo.
 *
 * ⇒ Ogni tool qui riporta l'esito vero, e quando è no dice **perché in una
 * lingua che il modello può usare per fare qualcosa di utile** invece di
 * riprovare all'infinito.
 *
 * ## ⭐ E il ripiego che rende ogni «non posso» ancora utile
 *
 * `device_open_settings` esiste per questo: quando una capacità non c'è —
 * perché serve un permesso, perché il produttore blocca, perché Android non la
 * espone alle app — la risposta giusta non è «non posso», è **aprire la
 * schermata esatta**. Gemini dice «non posso farlo» e ti lascia lì; qui il
 * modello ha sempre una mossa.
 *
 * Provato sul Pad: apre le impostazioni Wi-Fi vere di ColorOS.
 *
 * ## Il regime, che è ciò che ci tiene fuori dal 43%
 *
 * Tutto qui **chiede** (un intent, un'API pubblica) o **legge**. Niente
 * indovina. Il 43% è la riuscita di chi deduce dai pixel dove sia un pulsante:
 * è la misura di un metodo, non un limite, e non è il nostro.
 */

interface Esito { done: boolean, reason?: string }

export interface TalosDeviceToolSources {
    vibrate(milliseconds: number): Promise<Esito & { appliedMs: number }>
    torch(on: boolean): Promise<Esito>
    volume(stream: string, percent?: number): Promise<Esito & { percent: number }>
    alarm(input: { hour?: number, minute?: number, seconds?: number, label?: string }): Promise<Esito>
    /** ⛔ Il contrario di `alarm`: senza, il modello richiama `alarm` e ne crea una seconda. */
    alarmDismiss(input: { hour?: number, minute?: number, all?: boolean }): Promise<Esito>
    openApp(packageName: string): Promise<Esito>
    openSettings(action: string, forThisApp: boolean): Promise<Esito & { scope?: string }>
    compose(kind: string, value: string, text?: string): Promise<Esito>
    status(): Promise<Record<string, unknown>>
    /**
     * ⭐ DOVE SEI — vedi `src/lib/device/posizione.ts` per il difetto che l'ha
     * resa necessaria: senza, il modello inventava città.
     */
    location(): Promise<{
        stato: string
        latitudine?: number
        longitudine?: number
        precisioneMetri?: number
        etaSecondi?: number
    }>
    wallpaper(imageBase64: string, where: string): Promise<Esito & { appliedTo: string }>
    keepAwake(on: boolean): Promise<Esito & { on: boolean }>
    /**
     * ⭐ Lo screenshot di SISTEMA — quello che finisce in galleria.
     *
     * ⛔ Non è `takeScreenshot()`, che cattura in silenzio e consegna il bitmap
     * a noi: quella immagine finirebbe dentro TALOS invece che dove la persona
     * la cerca, e una cattura muta dello schermo è ciò che un assistente non
     * deve saper fare di nascosto. Vedi `TalosOcchio.scattaSchermata`.
     */
    screenshot(): Promise<Esito>
    /**
     * ⭐ Quante email non lette, dal content provider di Gmail.
     *
     * ⛔ Conteggi, mai testo: il contenuto di una email da questa strada non è
     * raggiungibile — e l'alternativa, l'API con scope ristretto, costa una
     * verifica Google più un assessment annuale e un token che scade ogni
     * settimana.
     */
    postaNonLetta(): Promise<{
        letto: boolean
        motivo?: string
        caselle: Array<{
            conto: string
            nonLette: number
            /** Le sezioni della posta in arrivo, coi nomi che usa Gmail. */
            sezioni?: Array<{ nome: string, nonLette: number }>
        }>
    }>
    media(action: string): Promise<Esito & { playing: boolean }>
    /**
     * ⛔ La risoluzione del nome e' del CONTROLLER, non di qui: e' la stessa che
     * usa la modifica delle immagini, e due copie vorrebbero dire che un giorno
     * «Foto.PNG» si trova da una parte e non dall'altra.
     */
    findImage(reference: string): Promise<{ base64: string, mediaType: string, name: string } | null>
    availableImages(): string[]
    speak(text: string): Promise<{ spoken: boolean, reason?: string }>
}

/**
 * Le frasi dei motivi.
 *
 * ⛔ Dicono al modello **cosa fare**, non solo cosa è andato storto. «Nessun
 * vibratore» è un'informazione; «diglielo e non riprovare» è un'istruzione — e
 * senza la seconda un modello riprova, perché riprovare è quasi sempre la mossa
 * giusta e qui non lo è.
 */
const MOTIVO: Record<string, string> = {
    'no-vibrator': 'This device has no vibration motor. Tell the user; do not retry.',
    'no-torch': 'This device has no torch. Tell the user; do not retry.',
    'no-camera-service': 'The torch is not reachable on this device. Do not retry.',
    'not-installed': 'That app is not installed on this phone. Tell the user, or suggest another app.',
    /*
     * ⛔ NON «questo telefono non offre quella schermata»: era una BUGIA.
     *
     * Owner 2026-08-10, dal telefono: TALOS ha detto «Il telefono non offre
     * questa schermata, quindi non posso abilitare l'accesso alle notifiche da
     * qui». MISURATO subito dopo, sullo stesso telefono: la schermata si apre
     * (`com.android.settings/.Settings$NotificationAccessSettingsActivity`).
     * Android risponde `ActivityNotFoundException` anche quando è il NOME
     * dell'azione a essere sbagliato — e questa riga trasformava un nostro
     * errore di battitura in un difetto del telefono di chi legge.
     */
    'not-available-here': 'No screen answered that action name. The screen probably exists — the action string was wrong. Try the exact action from this tool\'s description, or say you could not open it.',
    'needs-dnd-access': 'Changing that volume needs Do Not Disturb access, which only the user can grant. Offer to open it with device_open_settings.',
    'unknown-kind': 'Unsupported kind. Use call, sms, share, search or url.',
    'not-a-number': 'That is not a phone number — there is not a single digit in it. If you meant a contact by name, say you cannot look up contacts yet.',
    silenced: 'The phone is silenced, so nothing was said aloud. The answer is still on screen.',
    unavailable: 'Speech is not available on this device. Tell the user; do not retry.',
    'no-image': 'No image was given. Name one from the Library.',
    'not-an-image': 'That file is not a readable image. Pick another.',
    'wallpaper-not-allowed': 'This phone does not let apps change the wallpaper. Offer to open the wallpaper settings with device_open_settings.',
    'no-window': 'TALOS is not on screen, so the screen cannot be held awake. Do not retry.',
}

/**
 * ⛔⛔ L'ESITO RIUSCITO SI DICE PER INTERO, e non è cortesia: è la differenza
 * fra un turno che si legge e uno che sembra fallito.
 *
 * MISURATO sul Pad il 2026-08-10 con Qwen3-1.7B.Q4_K_M, torcia accesa, chat
 * nuova, «Spegni la torcia»:
 *
 * ```
 *   dumpsys   07:21:18 : Torch … turned off for client PID 31874   ✅ SPENTA
 *   in chat   «The tool results do not contain what the user asked for.»
 * ```
 *
 * E all'accensione, dove il racconto riusciva, il modello ha citato un esito
 * che **non esiste**: `{"status": "on"}`. Il nostro era «Torch on.» — due
 * parole, senza soggetto e senza verbo. Un modello piccolo davanti a un esito
 * telegrafico non lo riconosce come la risposta alla domanda, e o lo inventa o
 * dichiara che non c'è.
 *
 * ⇒ Un esito riuscito dice **che è stato fatto** e **com'è adesso**, in una
 * frase intera. Costa una decina di token per turno e vale per tutti i
 * provider: è ancoraggio, non decorazione.
 *
 * ⛔ Il prefisso «Done.» è aggiunto QUI e non in ogni tool: scriverlo in
 * quindici posti significa che il sedicesimo lo dimenticherà.
 *
 * ## ⛔ E NON HA CURATO IL SINTOMO. Va detto, se no questo commento mente.
 *
 * Rimisurato col testo nuovo, stessa build, chat nuove, Qwen3-1.7B:
 *
 * ```
 *   dumpsys   07:25:49 turned on · 07:26:12 turned off   ✅ agisce nei due versi
 *   in chat   «The tool_results do not contain what the user asked for.»  ⛔ x2
 * ```
 *
 * Quel modello produce quella frase comunque. ⇒ L'ipotesi «l'esito era troppo
 * telegrafico» è **respinta dalla misura**: questa resta una buona regola di
 * contratto — un esito che dice com'è adesso serve a ogni provider — ma la cura
 * del racconto è altrove, ed è un problema di prodotto, non di prompt:
 * **quando uno strumento che AGISCE riesce, la persona deve vederlo anche se il
 * modello lo racconta male.** Compito #65.
 */
function esitoDi(r: Esito, fatto: string) {
    if (r.done) return { ok: true, content: fatto.startsWith('Done') ? fatto : `Done. ${fatto}` }
    return {
        ok: false,
        content: MOTIVO[r.reason ?? ''] ?? 'It did not happen. Tell the user rather than retrying.',
        code: `TALOS_DEVICE_${(r.reason ?? 'failed').toUpperCase().replace(/-/g, '_')}`,
    }
}

export function createTalosDeviceTools(
    sources: TalosDeviceToolSources,
): TalosToolDefinition<never>[] {
    return [
        defineTalosTool({
            name: 'device_status',
            action: 'read',
            title: 'Check the phone',
            description: [
                'Read how the phone is right now: battery, storage, memory, ringer mode and',
                'network type, plus which phone this is: make, model code, its name and',
                'the Android version. Use it when the user asks about their device, or',
                'before suggesting something that needs space, battery or a connection.',
                'It reads nothing about the PERSON — no accounts, no numbers, no location.',
            ].join(' '),
            input: z.object({}),
            async run() {
                const stato = await sources.status()
                /*
                 * ⛔⛔ LA SPINA SI DICE A PAROLE, non lasciata a tre chiavi.
                 *
                 * Owner, 2026-08-15, col cavo attaccato: TALOS ha risposto
                 * «l'89%, dispositivo **non in carica**». Il telefono nello
                 * stesso istante: `USB powered: true`, `status: 4`
                 * (NOT_CHARGING). Cioè il dato era vero — ColorOS a 89% smette
                 * di caricare — e la frase suonava come «non sei collegato».
                 *
                 * ⇒ Un JSON con `charging:false, plugged:true` è ancora un
                 * invito a dire la frase sbagliata. La frase giusta viaggia
                 * insieme al dato, e il terzo stato — collegato ma fermo —
                 * viene detto per quello che è, perché è anche l'unico che
                 * spiega perché la percentuale non sale.
                 */
                const SPINA: Record<string, string> = {
                    unplugged: 'The phone is NOT plugged in.',
                    charging: 'The phone is plugged in and charging.',
                    'plugged-full': 'The phone is plugged in and the battery is full.',
                    /*
                     * ⛔ La prima versione era un DIVIETO («non dire che è
                     * scollegato»), e il modello ha fatto la cosa prudente: ha
                     * taciuto del tutto. Vero, ma il fatto utile — «è
                     * collegato e NON sta caricando» — è anche l'unico che
                     * spiega perché la percentuale sta ferma. ⇒ Si chiede la
                     * frase, non si vieta l'altra.
                     *
                     * ⭐ E la causa vera, detta dall'owner dopo la cura: sul
                     * suo Pad il **limite di carica è al 90%**. A 89% il
                     * telefono ha già smesso, di proposito. Cioè questo terzo
                     * stato non è un caso di bordo: è la condizione NORMALE di
                     * chi protegge la batteria, e senza la frase intera
                     * l'assistente sembrava sbagliare ogni volta.
                     */
                    'plugged-not-charging': 'The phone IS plugged in, but the battery is not '
                        + 'charging right now — phones stop on purpose (battery protection, a weak '
                        + 'port, or a high level). SAY BOTH: that it is plugged in AND that it is '
                        + 'not charging. Never say it is unplugged: the user can see the cable.',
                }
                /*
                 * ⛔⛔ E LA STRADA PRIVILEGIATA, se è giù, si DICE.
                 *
                 * Misurato sul Pad il 2026-08-15 col ponte spento: la risposta
                 * elencava batteria, memoria, spazio, suoneria e perfino «due
                 * cose che non ho potuto controllare» (notifiche e Gmail) — e
                 * del ponte, niente. Senza ponte però non funzionano leggere lo
                 * schermo, pilotarlo, Wi-Fi, Bluetooth, aereo, risparmio,
                 * non disturbare e l'elenco delle app: metà delle capacità.
                 *
                 * ⇒ Chi ha letto «Ecco la situazione» ha creduto di aver visto
                 * tutto. Stessa forma della spina: la frase viaggia col dato,
                 * invece di lasciare al modello il compito di dedurla da un
                 * `false`.
                 *
                 * ⛔ Si dice SOLO quando è falso. Un «il ponte è collegato»
                 * detto a ogni domanda sulla batteria è rumore, e il rumore
                 * insegna a saltare le righe che contano.
                 *
                 * ⛔ E la chiave ASSENTE non è «giù»: quando non l'abbiamo
                 * potuta chiedere non si dice niente, come per la spina.
                 */
                /*
                 * ⛔ E LA SCHERMATA SI NOMINA, se no il modello ne sceglie una.
                 *
                 * La prima versione diceva «offer to open the TALOS privileges
                 * page». Provato sul Pad: TALOS l'ha offerto, la persona ha
                 * detto sì, e si è aperta **«Informazioni app» di TALOS** —
                 * dove il ponte non si riattiva. Il modello non aveva un
                 * attrezzo per aprire una pagina DENTRO TALOS, e nessuna azione
                 * gliela indicava, quindi ha preso la più vicina.
                 *
                 * ⇒ Un'offerta che non nomina la porta è un'offerta che il
                 * modello completa a modo suo. Adesso porta il nome esatto
                 * dell'azione, che è anche quella misurata come funzionante.
                 */
                const PONTE = 'TALOS\'s privileged access is NOT connected right now. Without it '
                    + 'these do not work: reading the screen, driving the screen, Wi-Fi, '
                    + 'Bluetooth, airplane mode, battery saver, do-not-disturb and listing '
                    + 'apps. Say so plainly as part of the answer — the user asked how their '
                    + 'phone is, and half of what you can do is down — and offer to open '
                    + 'android.settings.APPLICATION_DEVELOPMENT_SETTINGS, where wireless '
                    + 'debugging lives, so they can reconnect it.'
                const righe = [
                    SPINA[String(stato.power ?? '')] ?? '',
                    stato.bridge === false ? PONTE : '',
                ].filter((riga) => riga !== '')
                return { ok: true, content: [JSON.stringify(stato), ...righe].join('\n') }
            },
        }) as TalosToolDefinition<never>,

        /**
         * ⭐⭐⭐ DOVE SEI — il tool che impedisce al modello di inventare una città.
         *
         * Owner 2026-08-15: «ho chiesto che ristorante mi consigli per cenare
         * stasera e lui mi ha dato una posizione completamente diversa».
         * MISURATO: TALOS non leggeva la posizione da nessuna parte, quindi
         * quei nomi di locali erano inventati — una risposta sicura e falsa su
         * una cosa che la persona sta per andare a fare davvero.
         *
         * ⛔⛔ LA REGOLA CHE LEGA STA NELLA DESCRIZIONE, non nel prompt di
         * sistema. È una lezione già pagata (vedi «TRE GIORNI per una richiesta
         * sola»): un modello che sceglie fra quaranta attrezzi legge la riga
         * dell'attrezzo, non un paragrafo lontano. Quindi il QUANDO chiamarlo è
         * scritto qui dentro, con gli esempi.
         *
         * ⛔ E il contrario: dire «chiamalo sempre» lo farebbe scattare anche su
         * «che ore sono», accendendo il GPS per niente. La riga nomina i casi.
         */
        defineTalosTool({
            name: 'device_location',
            action: 'read',
            title: 'Where the user is',
            /*
             * ⛔ SGRASSATA, e va detto cosa è rimasto e cosa no.
             *
             * La prima stesura elencava anche gli stati di ritorno e ripeteva
             * «senza non conosci la città». 779 byte in uno schema col tetto
             * misurato, per dire due volte la stessa cosa: gli stati il modello
             * li riceve dal RISULTATO, con dentro già la frase da dire.
             *
             * ⛔ Ciò che NON si taglia è il QUANDO: è l'unica parte che cambia
             * la decisione del modello, ed è il difetto che questo tool cura.
             */
            description: [
                'Read where the phone is now, as latitude and longitude.',
                'CALL THIS FIRST for anything that depends on where the user is:',
                'recommending a restaurant, bar, shop or somewhere to go; "near me",',
                '"nearby", "around here"; travel time from here; the weather where they are.',
                'Naming places from a city the user is not in is worse than saying you do not know.',
                'Do not call it for questions that do not depend on the place.',
            ].join(' '),
            input: z.object({}),
            async run() {
                const dove = await sources.location()
                if (dove.stato !== 'letta') {
                    /*
                     * ⛔ Tre rifiuti diversi, tre frasi diverse — e nessuna è
                     * «qualcosa è andato storto». La persona può fare qualcosa
                     * in due casi su tre, e saperlo è la differenza fra una
                     * risposta utile e un vicolo cieco.
                     */
                    const SENZA_POSIZIONE = 'This device cannot report a location. Ask the user which area they mean.'
                    const MOTIVI: Record<string, string> = {
                        negato: 'The user has not granted location permission. Tell them you need it to answer about places near them, and that they can grant it in TALOS settings under permissions.',
                        spenta: 'Location services are switched off on the phone. Tell the user to turn them on, then ask again.',
                        scaduta: 'No location fix arrived in time — this happens indoors. Tell the user, and offer to answer if they name the area.',
                        'non-disponibile': SENZA_POSIZIONE,
                    }
                    return {
                        ok: false,
                        content: MOTIVI[dove.stato] ?? SENZA_POSIZIONE,
                        code: `TALOS_LOCATION_${dove.stato.toUpperCase().replace(/-/g, '_')}`,
                    }
                }
                /*
                 * ⛔ L'ETÀ si dice, non si nasconde: un fix di un minuto fa va
                 * benissimo per «ristoranti vicino» e va detto lo stesso, se no
                 * il modello non ha modo di sapere quando è il caso di rileggere.
                 */
                return {
                    ok: true,
                    content: [
                        `Latitude ${dove.latitudine}, longitude ${dove.longitudine}`,
                        `(accurate to about ${dove.precisioneMetri} m, measured ${dove.etaSecondi} s ago).`,
                        'Use these coordinates to work out the area, and say the place name you',
                        'derived so the user can correct you if it is wrong.',
                    ].join(' '),
                }
            },
            // ⛔ Lo stesso cast dell'ultimo tool del file: `z.object({})` inferisce
            // `Record<string, never>`, che non e' assegnabile all'array dichiarato
            // `TalosToolDefinition<never>[]`. E' il modo gia' in uso qui.
        }) as TalosToolDefinition<never>,
        defineTalosTool({
            name: 'device_torch',
            action: 'write',
            title: 'Turn the torch on or off',
            description: 'Turn the phone torch on or off. Send on:false to turn it off.',
            input: z.object({ on: z.boolean() }),
            async run(input) {
                // ⛔ Frase intera, soggetto e stato: «Torch off.» non veniva
                // riconosciuto come la risposta alla domanda — vedi `esitoDi`.
                const esito = esitoDi(
                    await sources.torch(input.on),
                    `The phone torch is now ${input.on ? 'ON' : 'OFF'}.`,
                )
                /*
                 * ⭐⭐⭐ LA SCHEDA — owner 2026-08-13, «scheda sempre».
                 *
                 * MISURATO sul Pad: a «accendi la torcia» Gemini risponde
                 * «Torcia accesa» **e lascia l'interruttore acceso dentro la
                 * chat**, che si può ribaltare lì. Noi dicevamo «fatto» e
                 * chiudevamo il discorso.
                 *
                 * ⛔ Solo se è RIUSCITO: un interruttore che mostra uno stato
                 * che non è stato raggiunto è una bugia con una levetta sopra.
                 */
                return esito.ok
                    ? { ...esito, scheda: { tipo: 'interruttore' as const, tool: 'device_torch', acceso: input.on } }
                    : esito
            },
        }) as TalosToolDefinition<never>,

        /**
         * ⭐⭐ L'UNICA RIGA DOVE GEMINI VINCEVA SENZA UN CANCELLO.
         *
         * Dal censimento del 2026-08-09 (compito #34): per accendere il Wi-Fi o
         * la torcia, Gemini pretende che l'app Google sia **l'assistente
         * predefinito del telefono**. Per il controllo media, no: quella la fa e
         * basta. Era l'unica casella dove perdevamo a parità di condizioni.
         *
         * ⇒ E si chiude a **costo zero**: `dispatchMediaKeyEvent` è la porta dei
         * telecomandi Bluetooth, non chiede permessi e non chiede nemmeno il
         * ponte. Non serviva la strada difficile.
         *
         * ⛔ La descrizione dice al modello di NON promettere quale brano parte:
         * il cambio traccia non è verificabile da qui, e una promessa che non si
         * può controllare è il primo passo verso «fatto» senza aver fatto niente.
         */
        defineTalosTool({
            name: 'device_media',
            action: 'write',
            title: 'Control what is playing',
            description: [
                'Control media playback on the phone: pause, resume, stop, or skip.',
                'It works with whatever app is currently playing — music, podcast, video.',
                'If nothing is playing, say so plainly instead of claiming it worked.',
                'IMPORTANT: after next or previous you cannot know which track started,',
                'so never name the new track — say the skip was sent and let the person look.',
            ].join(' '),
            input: z.object({
                action: z.enum(['play_pause', 'play', 'pause', 'next', 'previous', 'stop']),
            }),
            async run(input) {
                const esito = await sources.media(input.action)
                /*
                 * ⛔ Si riporta lo stato RILETTO, non l'azione chiesta. È la
                 * lezione del 2026-08-09: un'API muta che non fallisce produce
                 * un «fatto» falso, e la sola difesa è dire cosa si vede dopo.
                 */
                if (!esito.done) {
                    return {
                        ok: false,
                        content: esito.reason === 'nothing-playing'
                            ? 'Nothing is playing on the phone right now.'
                            : `Could not control playback: ${esito.reason ?? 'no media app took it'}.`,
                        code: `TALOS_MEDIA_${(esito.reason ?? 'failed').toUpperCase().replace(/-/g, '_')}`,
                    }
                }
                return {
                    ok: true,
                    content: esito.playing ? 'Playing.' : 'Paused.',
                }
            },
        }) as TalosToolDefinition<never>,

        defineTalosTool({
            name: 'device_vibrate',
            action: 'write',
            title: 'Vibrate the phone',
            description: [
                'Make the phone vibrate briefly, as a physical signal.',
                'Do NOT use it to announce your own answers: the notification system does',
                'that, and a buzz per reply is how a person turns everything off.',
            ].join(' '),
            input: z.object({ milliseconds: z.number().int().min(1).max(2000).optional() }),
            async run(input) {
                const r = await sources.vibrate(input.milliseconds ?? 200)
                return esitoDi(r, `Vibrated for ${r.appliedMs} ms.`)
            },
        }) as TalosToolDefinition<never>,

        defineTalosTool({
            name: 'device_volume',
            action: 'write',
            title: 'Read or set the volume',
            description: [
                'Read the volume of an audio stream, or set it. Send percent to set it,',
                'leave it out to read. Percent and not steps: the number of steps differs',
                'between phones, so a percentage is the only unit meaning the same thing.',
            ].join(' '),
            input: z.object({
                stream: z.enum(['music', 'ring', 'alarm', 'notification']).optional(),
                percent: z.number().int().min(0).max(100).optional(),
            }),
            async run(input) {
                const r = await sources.volume(input.stream ?? 'music', input.percent)
                return esitoDi(r, input.percent === undefined
                    ? `Volume is at ${r.percent}%.`
                    : `Volume set to ${r.percent}%.`)
            },
        }) as TalosToolDefinition<never>,

        /*
         * ⛔⛔⛔ METTERE **E SPEGNERE**, in un attrezzo solo — e il perché è
         * misurato due volte, non scelto per gusto.
         *
         * ## Il difetto, sul Pad il 2026-08-13
         *
         * A «annulla la sveglia delle 7 e 30» il modello aveva **un solo**
         * attrezzo per le sveglie — quello che le METTE — e l'ha richiamato.
         * Esito: sveglia ancora armata, una **seconda** alle 07:30, e l'app
         * Orologio aperta in faccia alla persona. Gemini, stessa frase, la
         * annullava davvero.
         *
         * ⇒ Un attrezzo senza il suo contrario non è metà funzione: al verso
         * opposto fa **danno**.
         *
         * ## ⛔ Perché un parametro e non un secondo attrezzo
         *
         * Un `device_alarm_dismiss` separato costava **309 byte** di superficie
         * e sfondava il tetto di 42.400 — quella che si spedisce al modello a
         * OGNI messaggio. Owner, 13/8: «alza il tetto SOLO se strettamente
         * necessario e come ultima possibilità».
         *
         * E la ricerca dice la stessa cosa da un'altra porta: sopra i 40-50
         * attrezzi la **scelta** diventa inaffidabile (13,62% di precisione su
         * un insieme grande contro 43% limitando l'esposizione), e noi siamo a
         * 64. Un attrezzo in più avrebbe pagato due volte: in byte e in
         * confusione. Qui il numero resta 63.
         *
         * ⛔ `off` **SI DICHIARA**, non si deduce dal verbo — è la stessa regola
         * già in vigore per `invia` su `invia_file`. Indovinare dal verbo se una
         * sveglia va messa o spenta è come indovinare se un messaggio va
         * spedito: la frase «togli quella delle 7» e «mettila alle 7» si
         * assomigliano troppo perché la differenza stia in una deduzione.
         */
        defineTalosTool({
            name: 'device_alarm',
            action: 'write',
            title: 'Set or turn off an alarm or timer',
            description: [
                'Set an alarm at a time, or a timer for a number of seconds.',
                'The phone clock app owns it, so it still rings if TALOS is closed.',
                'off=true cancels one instead: at that time, the next, or all.',
            ].join(' '),
            input: z.object({
                hour: z.number().int().min(0).max(23).optional(),
                minute: z.number().int().min(0).max(59).optional(),
                seconds: z.number().int().min(1).max(86_400).optional(),
                label: z.string().max(80).optional(),
                off: z.boolean().optional(),
                all: z.boolean().optional(),
            }),
            async run(input) {
                if (input.off === true) {
                    const quale = input.all === true
                        ? 'every alarm'
                        : input.hour === undefined
                            ? 'the next alarm'
                            : `the ${String(input.hour).padStart(2, '0')}:${String(input.minute ?? 0).padStart(2, '0')} alarm`
                    /*
                     * ⛔⛔ SI DICE CIÒ CHE È STATO CHIESTO, NON CIÒ CHE È
                     * SUCCESSO — e questa riga nasce da una bugia misurata.
                     *
                     * Sul Pad il 2026-08-13, 23:41: TALOS ha scritto «La
                     * sveglia delle 06:50 è stata annullata» col segno «Fatto»,
                     * e l'orologio mostrava la stessa sveglia **ancora armata**
                     * — «Prossima sveglia tra 7 ore 9 minuti».
                     *
                     * La causa non è il modello: è che `ACTION_DISMISS_ALARM`
                     * rende «intent consegnato», non «sveglia spenta». Su
                     * questa ColorOS l'orologio lo riceve e non fa niente. Noi
                     * riportavamo la CHIAMATA come se fosse l'EFFETTO, che è
                     * esattamente il difetto R-30 in un'altra forma.
                     *
                     * ⇒ Finché non possiamo LEGGERE le sveglie — e l'API di
                     * Android non lo permette a un'app qualunque — l'unica
                     * frase vera è quella che dice cosa abbiamo chiesto, e a
                     * chi. La persona può guardare. Una frase che promette meno
                     * ed è vera vale più di una che promette tutto e mente.
                     */
                    /*
                     * ⛔⛔⛔ NON PASSA DA `esitoDi`, e la ragione è una bugia
                     * VISTA sul Pad il 2026-08-14.
                     *
                     * `esitoDi` antepone «Done. » al successo, e il modello
                     * imita quella parola: ha scritto «Sveglia delle 07:00
                     * annullata» mentre l'orologio ne contava **quattro
                     * armate**, con «Prossima sveglia tra 22 ore 13 minuti».
                     *
                     * ## Cosa questo attrezzo può e non può, misurato
                     *
                     * `ACTION_DISMISS_ALARM` su questa ColorOS **non cancella
                     * niente**: provato per orario, per «la prossima» e per
                     * «tutte», con e senza `SKIP_UI`, sparando l'intent da adb.
                     * L'unica cosa che succede davvero è che l'Orologio apre
                     * l'elenco — cioè la persona finisce a **un tocco** dal
                     * risultato.
                     *
                     * ⇒ Allora è quello che si dichiara. `senzaEffetto` toglie
                     * anche il segno «✓ Fatto», che è la stessa cura di R-31:
                     * un segno di fatto su una cosa non fatta è la bugia
                     * scritta in un'altra lingua.
                     *
                     * ⛔ Gli stati sono TRE, non due: questo non è un successo
                     * e non è un errore — è **una richiesta consegnata a chi
                     * possiede le sveglie**.
                     */
                    await sources.alarmDismiss(input)
                    return {
                        ok: false,
                        senzaEffetto: true,
                        code: 'TALOS_DEVICE_ALARM_DISMISS_UNAVAILABLE',
                        content: `You did NOT turn off ${quale}: this phone's clock app does not act on `
                            + 'a cancel request. The clock is now showing the alarm list. '
                            + 'Tell the user you could not do it and that the switch is there, in one tap.',
                    }
                }
                const ora = `${String(input.hour ?? 7).padStart(2, '0')}:${String(input.minute ?? 0).padStart(2, '0')}`
                const esito = esitoDi(await sources.alarm(input), input.seconds !== undefined
                    ? `Timer set for ${input.seconds} s.`
                    : `Alarm set for ${ora}.`)
                /*
                 * ⭐⭐ LA SCHEDA, e serve a far vedere **l'ORA**.
                 *
                 * Owner 2026-08-14: le schede su tutte le capacità. La sveglia
                 * viene prima perché il suo dato è quello che sbaglia — lo
                 * stesso giorno, «metti in agenda domani» è finito due giorni
                 * più in là e nessuno se n'è accorto finché non ho interrogato
                 * il provider. Un'ora scritta grande si controlla in un colpo
                 * d'occhio, e una sveglia alle 7 invece che alle 19 costa una
                 * giornata.
                 *
                 * ⛔ Solo se è RIUSCITO, come la torcia: una scheda su un
                 * fallimento mostrerebbe uno stato mai raggiunto.
                 *
                 * ⛔ E niente comando «annulla»: su questa ColorOS
                 * `ACTION_DISMISS_ALARM` non cancella niente, misurato. Una
                 * levetta che non spegne è la bugia del «Fatto» con un dito
                 * sopra.
                 */
                if (!esito.ok) return esito
                return {
                    ...esito,
                    scheda: {
                        tipo: 'sveglia' as const,
                        quando: input.seconds !== undefined
                            ? `${Math.round(input.seconds / 60)} min`
                            : ora,
                        ...(input.label ? { etichetta: input.label } : {}),
                    },
                }
            },
        }) as TalosToolDefinition<never>,

        defineTalosTool({
            name: 'device_open_app',
            action: 'write',
            title: 'Open an app',
            description: 'Open an installed app by package name, for example com.android.chrome.',
            input: z.object({ package: z.string().min(1).max(200) }),
            async run(input) {
                /*
                 * ⛔⛔⛔ «APERTA» NON È «FATTA», e la riga deve dirlo.
                 *
                 * MISURATO sul Pad il 2026-08-14. Chiesto «scattami una foto»,
                 * questo attrezzo ha aperto la fotocamera e ha risposto
                 * `Opened com.oplus.camera.` — e TALOS ha scritto alla persona,
                 * nello STESSO messaggio:
                 *
                 * > «Non posso scattare la foto in autonomia perché il permesso
                 * >  di lettura dello schermo è disattivato…
                 * >  **Ho aperto la fotocamera e scattato la foto.**»
                 *
                 * Due frasi che si contraddicono, e la seconda falsa: sullo
                 * schermo c'era la fotocamera **col pulsante di scatto intatto**.
                 * È R-30 — «Fatto» su una cosa non fatta — nata da un esito che
                 * diceva solo cosa era riuscito e taceva su cosa non lo era.
                 *
                 * ⇒ Un successo nudo è un invito a completare la frase. Aprire
                 * un'app è aprire un'app: dentro non è stato premuto niente, e
                 * l'attrezzo lo dichiara invece di lasciarlo dedurre.
                 */
                return esitoDi(
                    await sources.openApp(input.package),
                    `Opened ${input.package}. ⛔ ONLY the app was opened: nothing inside it was`
                        + ' done and TALOS pressed nothing. Never say the task inside the app was'
                        + ' carried out — say the app is open and the user finishes it.',
                )
            },
        }) as TalosToolDefinition<never>,

        /**
         * ⭐⭐⭐ LO SCREENSHOT — l'unica lacuna trovata dal censimento del
         * 2026-08-14, e chiesta con la frase più semplice che c'è.
         *
         * ## ⛔ Perché quello di SISTEMA e non una cattura nostra
         *
         * `AccessibilityService.takeScreenshot()` (API 30) cattura in silenzio e
         * consegna il bitmap a noi: nessun segnale, niente salvato.
         * `GLOBAL_ACTION_TAKE_SCREENSHOT` (API 28) fa lo screenshot **di
         * sistema** — animazione, anteprima, file in galleria.
         *
         * Si usa il secondo, e le due ragioni vanno nella stessa direzione:
         * «fai uno screenshot» vuol dire *voglio quell'immagine*, e con la prima
         * finirebbe dentro TALOS invece che dove la persona la cerca; e una
         * cattura muta dello schermo è esattamente ciò che un assistente non
         * deve saper fare di nascosto.
         *
         * ⛔ L'esito dice DOV'È finita: senza, il modello dice «fatto» e la
         * persona non sa dove guardare.
         */
        defineTalosTool({
            name: 'device_screenshot',
            action: 'write',
            /*
             * ⛔ Anche `read`, ed è la parte che pesa: uno screenshot LEGGE
             * quello che c'è sullo schermo in quell'istante — che può essere la
             * chat di un'altra persona, un conto in banca, un documento. Chi ha
             * tolto al modello il permesso di leggere non deve scoprire che una
             * via traversa gli faceva fotografare lo schermo.
             */
            requiredActions: ['write', 'read'],
            title: 'Take a screenshot',
            description: 'Take a system screenshot of what is on screen right now. '
                + 'It is saved to the phone gallery exactly as if the user had pressed the '
                + 'hardware buttons — TALOS does not receive or keep the image.',
            input: z.object({}),
            async run() {
                const esito = await sources.screenshot()
                /*
                 * ⛔ «occhio-chiuso» si spiega, non si consegna nudo: un motivo
                 * tecnico senza traduzione manda il modello a inventare la
                 * causa — difetto già misurato qui più di una volta.
                 */
                if (!esito.done && esito.reason === 'occhio-chiuso') {
                    return {
                        ok: false,
                        content: 'TALOS cannot take a screenshot because its accessibility service '
                            + 'is off — that is the only way to do it without asking for a new '
                            + 'confirmation every single time. Tell the user exactly that, and offer '
                            + 'to open the accessibility settings with device_open_settings.',
                        code: 'TALOS_SCHERMATA_SENZA_OCCHIO',
                    }
                }
                return esitoDi(
                    esito,
                    'Done. The system screenshot was taken and saved to the phone gallery, '
                        + 'the same way the hardware buttons do it. TALOS did not receive the image.',
                )
            },
        }) as TalosToolDefinition<never>,

        defineTalosTool({
            name: 'device_open_settings',
            action: 'write',
            title: 'Open a settings screen',
            description: [
                /*
                 * ⛔ Qui c'erano due esempi — `WIFI_SETTINGS` e `SOUND_SETTINGS`
                 * — ed erano già **dentro** l'elenco completo due righe sotto.
                 * Sessantaquattro byte per dire due volte la stessa cosa, in uno
                 * schema che ha un tetto misurato. Tolti quando è servito posto
                 * per la schermata delle Opzioni sviluppatore (rilievo #10).
                 *
                 * ⇒ Non è azzoppare l'app per far passare un cancello: qui non
                 * si è perso nemmeno un fatto. Il giorno in cui il taglio onesto
                 * non c'è più, si alza il tetto.
                 */
                'Open a specific Android settings screen by its action.',
                'USE THIS WHENEVER YOU CANNOT DO SOMETHING YOURSELF: taking the user to the',
                'exact screen is far more useful than saying you cannot. Set forThisApp when',
                'the screen is about TALOS itself, such as one of its permissions.',
                `The screens TALOS needs most: ${TALOS_SCHERMATE_DI_SISTEMA.join(', ')}.`,
            ].join(' '),
            input: z.object({
                action: z.string().min(1).max(120),
                forThisApp: z.boolean().optional(),
            }),
            async run(input) {
                /*
                 * ⛔ L'azione si CORREGGE prima di provarla.
                 *
                 * MISURATO il 2026-08-10: `android.settings.ACTION_NOTIFICATION_
                 * LISTENER_SETTINGS` apre la schermata, la stessa senza `ACTION_`
                 * risponde «unable to resolve Intent» — e quel rifiuto arrivava
                 * alla persona come «questo telefono non offre quella schermata».
                 * Il telefono la offriva; sbagliava chi la nominava a memoria.
                 * L'elenco vero sta nel catalogo delle capacità, dove è già
                 * scritto per ognuna.
                 */
                const azione = talosSchermataDiSistema(input.action) ?? input.action
                const chiesta = input.forThisApp ?? false
                const esito = await sources.openSettings(azione, chiesta)
                /*
                 * ⛔ Se si e' aperto l'ELENCO invece della riga di TALOS, va
                 * DETTO. MISURATO il 2026-08-10: l'accesso alle notifiche non
                 * accetta il dato `package:`, quindi la richiesta «la riga di
                 * TALOS» ripiega sull'elenco di tutte le app. Un modello che
                 * non lo sapesse direbbe «guarda l'interruttore di TALOS» a chi
                 * ha davanti trenta righe — e la persona penserebbe di aver
                 * sbagliato lei.
                 */
                const ripiegato = esito.done && chiesta && esito.scope === 'general'
                return esitoDi(
                    esito,
                    ripiegato
                        ? 'Opened the general settings list, not TALOS\'s own row — this phone does not offer a per-app page here. Tell the user to find TALOS in the list.'
                        : 'Opened that settings screen.',
                )
            },
        }) as TalosToolDefinition<never>,

        defineTalosTool({
            name: 'device_compose',
            action: 'write',
            /*
             * ⛔ Anche `outbound`, e non e' zelo: il testo ESCE dal telefono
             * se la persona preme. Chi ha chiuso «mai in uscita» dev'essere
             * fermato qui — non davanti al pulsante di un'altra app, dove la
             * nostra regola non arriva piu'.
             */
            requiredActions: ['outbound'],
            title: 'Prepare a call, a message or a share',
            description: [
                'Prepare an action in the app that owns it, ready for the user to confirm.',
                'kind: call dials a number WITHOUT calling, sms opens a message, share opens',
                'the share sheet, search runs a web search, url opens a link.',
                'TALOS never sends or calls by itself: the person presses the button.',
            ].join(' '),
            input: z.object({
                kind: z.enum(['call', 'sms', 'share', 'search', 'url']),
                value: z.string().min(1).max(2000),
                text: z.string().max(2000).optional(),
            }),
            async run(input) {
                return esitoDi(
                    await sources.compose(input.kind, input.value, input.text),
                    'Ready for the user to confirm.',
                )
            },
        }) as TalosToolDefinition<never>,

        defineTalosTool({
            name: 'device_speak',
            action: 'write',
            /*
             * ⛔ PARLARE E' UN'USCITA. Un documento privato letto ad alta voce
             * e' uscito dal dispositivo senza toccare la rete, e chiunque sia
             * nella stanza l'ha sentito. Il canale non e' un cavo, ma il dato
             * e' fuori — e un «mai in uscita» che non lo fermasse sarebbe una
             * porta chiusa con la finestra aperta.
             */
            requiredActions: ['outbound'],
            title: 'Say something out loud',
            description: [
                'Read a short text aloud through the phone speaker.',
                'Use it when the user asked to be spoken to, or is not looking at the screen.',
                'A silenced phone is a person who asked for quiet: nothing is said, and you',
                'are told so — the answer stays on screen.',
            ].join(' '),
            input: z.object({ text: z.string().min(1).max(1000) }),
            async run(input) {
                const r = await sources.speak(input.text)
                if (r.spoken) return { ok: true, content: 'Said aloud.' }
                return {
                    ok: false,
                    content: MOTIVO[r.reason ?? ''] ?? 'Nothing was said aloud.',
                    code: `TALOS_SPEECH_${(r.reason ?? 'failed').toUpperCase()}`,
                }
            },
        }) as TalosToolDefinition<never>,
        defineTalosTool({
            name: 'device_wallpaper',
            action: 'write',
            /*
             * ⛔ Anche `read`, e conta: per applicare uno sfondo bisogna
             * LEGGERE un file della Libreria. Chi ha tolto al modello il
             * permesso di leggere le proprie cose dev'essere fermato qui, non
             * scoprire che una via traversa lo aggirava.
             */
            requiredActions: ['read'],
            title: 'Set the wallpaper',
            description: [
                'Set an image from the Library as the phone wallpaper.',
                'Name the image as the user knows it. where: home, lock or both.',
                'Draw an image first if the user asked for something new.',
            ].join(' '),
            input: z.object({
                image: z.string().min(1).max(300),
                where: z.enum(['home', 'lock', 'both']).optional(),
            }),
            async run(input) {
                const trovata = await sources.findImage(input.image)
                if (!trovata) {
                    /*
                     * ⛔ L'errore dice COSA c'e'. Misurato il 2026-08-04 sulla
                     * generazione immagini: un «non trovata» muto ha fatto
                     * riprovare cinque volte di fila e poi arrendersi. Un
                     * errore che non offre l'alternativa costringe a
                     * indovinare, e indovinare costa round veri.
                     */
                    const ci = sources.availableImages()
                    return {
                        ok: false,
                        code: 'TALOS_DEVICE_IMAGE_NOT_FOUND',
                        content: ci.length
                            ? `No Library image matches "${input.image}". These exist: ${ci.join(', ')}.`
                            : 'There are no images in the Library yet. Create one first.',
                    }
                }
                const dove = input.where ?? 'home'
                const r = await sources.wallpaper(trovata.base64, dove)
                return esitoDi(r, `Wallpaper set from ${trovata.name} (${r.appliedTo}).`)
            },
        }) as TalosToolDefinition<never>,

        defineTalosTool({
            name: 'device_keep_awake',
            action: 'write',
            title: 'Keep the screen awake',
            description: [
                'Stop the screen turning off while the user follows something on it —',
                'a recipe, directions, a procedure. Send on:false to let it sleep again.',
                'It only holds while TALOS is on screen, and ends by itself when it is not.',
            ].join(' '),
            input: z.object({ on: z.boolean() }),
            async run(input) {
                const r = await sources.keepAwake(input.on)
                return esitoDi(r, input.on
                    ? 'The screen will stay on while TALOS is open.'
                    : 'The screen can turn off again.')
            },
        }) as TalosToolDefinition<never>,

        /**
         * ⭐⭐⭐ QUANTE EMAIL NON LETTE — la seconda lacuna del censimento del
         * 2026-08-14, e quella che chiude il pareggio.
         *
         * ## ⛔ Perché il PROVIDER e non l'API di Google
         *
         * `gmail.readonly` è uno scope **ristretto**: verifica OAuth, assessment
         * CASA fino al penetration test di terza parte, revalidazione ogni anno;
         * e finché l'app resta in «Testing» il refresh token scade **ogni 7
         * giorni**, cioè TALOS smetterebbe di leggere la posta una volta a
         * settimana per sempre. Per un numero.
         *
         * Il content provider pubblico di Gmail
         * (`content://com.google.android.gm/<conto>/labels`) dà quel numero
         * subito, con un permesso normale che il telefono concede
         * all'installazione, e senza mandare niente fuori dal dispositivo.
         *
         * ## ⛔ E dà i CONTEGGI, mai il testo — che è la parte giusta
         *
         * Da questa strada il contenuto di una email non è raggiungibile. Non è
         * una rinuncia: mittente e oggetto TALOS li vede già dalle **notifiche**
         * — cioè da ciò che la persona ha visto comparire sul proprio schermo —
         * e la descrizione manda il modello là invece di lasciarlo promettere
         * una lettura che non può fare.
         *
         * ## ⛔ I TRE stati, che non si appiattiscono in due
         *
         * «zero non lette», «nessun account Google», «il provider non ha
         * risposto» sono fatti diversi. Un `ok:false` unico farebbe dire «non
         * hai posta» a chi ce l'ha — è il difetto già misurato su questo
         * progetto quando un elenco vero viaggiava dentro un fallimento.
         */
        defineTalosTool({
            name: 'device_unread_mail',
            action: 'read',
            title: 'Count unread emails',
            description: [
                'How many unread emails are in the Gmail inbox, per Google account on this phone.',
                // ⛔ Il limite dichiarato al modello, con la mossa successiva
                // già dentro: senza, promette di leggere una email e non può.
                'IMPORTANT: NUMBERS ONLY — the sender, the subject and the body cannot be',
                'reached this way at all. For who wrote and what about, use',
                'device_notifications_list. Never promise to read an email, never guess one.',
            ].join(' '),
            input: z.object({}),
            async run() {
                const esito = await sources.postaNonLetta()
                if (!esito.letto) {
                    /*
                     * ⛔ Le due cause portano a due cose diverse da dire, e
                     * nessuna delle due è «non hai posta».
                     */
                    const perche = esito.motivo === 'nessun-account'
                        ? 'There is no Google account on this phone, so there is no Gmail inbox to '
                            + 'count. Say that, and offer to open the accounts settings with '
                            + 'device_open_settings.'
                        : esito.motivo === 'permesso-mancante'
                            ? 'The user did not give TALOS permission to read Gmail\'s counter. Say so '
                                + 'plainly — do NOT say the inbox is empty — and offer to open the app '
                                + 'permissions with device_open_settings so they can change their mind.'
                            : esito.motivo === 'provider-muto'
                                ? 'Gmail did not answer on this phone — it may not be installed, or it may '
                                    + 'be a version without the public counter. Say TALOS could not read the '
                                    + 'count; do NOT say the inbox is empty, because that is not known.'
                                : 'TALOS is not running on a phone right now, so there is no Gmail to ask. '
                                    + 'Say that plainly and do not retry.'
                    return { ok: false, content: perche, code: `TALOS_POSTA_${(esito.motivo ?? 'muta').toUpperCase().replace(/-/g, '_')}` }
                }
                const totale = esito.caselle.reduce((somma, c) => somma + c.nonLette, 0)
                /*
                 * ⛔ Un conto solo quando il conto è uno: «0 su antonino@… e 3 su
                 * lavoro@…» è utile con due caselle e goffo con una.
                 */
                const dettaglio = esito.caselle.length > 1
                    ? ` — ${esito.caselle.map(c => `${c.conto}: ${c.nonLette}`).join(', ')}`
                    : esito.caselle.length === 1 ? ` (${esito.caselle[0]!.conto})` : ''
                /*
                 * ⭐⭐ LE SEZIONI, e non sono un dettaglio: MISURATO sul Pad il
                 * 2026-08-14, la posta in arrivo di questo account è divisa in
                 * quattro e il totale è 27.953 — di cui 21.951 di pubblicità.
                 * «Hai 27.953 email non lette» è vero e inutile; «3.804 in
                 * Principali» è la risposta che una persona cercava.
                 *
                 * I nomi arrivano da Gmail, già nella lingua della persona: qui
                 * si trascrivono, non si traducono.
                 */
                const sezioni = esito.caselle
                    .flatMap(c => (c.sezioni ?? []).map(s => `${s.nome}: ${s.nonLette}`))
                    .join(', ')
                return {
                    ok: true,
                    content: `Done. There ${totale === 1 ? 'is' : 'are'} ${totale} unread `
                        + `email${totale === 1 ? '' : 's'} in the Gmail inbox${dettaglio}. `
                        + (sezioni
                            ? `The inbox is split into sections — ${sezioni}. Give the user the `
                                + 'total AND the sections: a big total is mostly promotions, and the '
                                + 'number they care about is the first one. '
                            : '')
                        + 'This is the count only: TALOS cannot see who wrote or what about from here.',
                }
            },
        }) as TalosToolDefinition<never>,

    ]
}
