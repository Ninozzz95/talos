import { z } from 'zod'
import { defineTalosTool, type TalosToolDefinition } from '@/lib/tools/registry'

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
    openApp(packageName: string): Promise<Esito>
    openSettings(action: string, forThisApp: boolean): Promise<Esito>
    compose(kind: string, value: string, text?: string): Promise<Esito>
    status(): Promise<Record<string, unknown>>
    wallpaper(imageBase64: string, where: string): Promise<Esito & { appliedTo: string }>
    keepAwake(on: boolean): Promise<Esito & { on: boolean }>
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
    'not-available-here': 'This phone does not offer that screen. Tell the user; do not retry.',
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

function esitoDi(r: Esito, fatto: string) {
    if (r.done) return { ok: true, content: fatto }
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
                'network type. Use it when the user asks about their device, or before',
                'suggesting something that needs space, battery or a connection.',
                'It reads nothing that identifies the device or the person.',
            ].join(' '),
            input: z.object({}),
            async run() {
                return { ok: true, content: JSON.stringify(await sources.status()) }
            },
        }) as TalosToolDefinition<never>,

        defineTalosTool({
            name: 'device_torch',
            action: 'write',
            title: 'Turn the torch on or off',
            description: 'Turn the phone torch on or off. Send on:false to turn it off.',
            input: z.object({ on: z.boolean() }),
            async run(input) {
                return esitoDi(await sources.torch(input.on), input.on ? 'Torch on.' : 'Torch off.')
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

        defineTalosTool({
            name: 'device_alarm',
            action: 'write',
            title: 'Set an alarm or a timer',
            description: [
                'Set an alarm at a time, or a timer for a number of seconds.',
                'The phone clock app owns it, so it still rings if TALOS is closed.',
            ].join(' '),
            input: z.object({
                hour: z.number().int().min(0).max(23).optional(),
                minute: z.number().int().min(0).max(59).optional(),
                seconds: z.number().int().min(1).max(86_400).optional(),
                label: z.string().max(80).optional(),
            }),
            async run(input) {
                return esitoDi(await sources.alarm(input), input.seconds !== undefined
                    ? `Timer set for ${input.seconds} s.`
                    : `Alarm set for ${String(input.hour ?? 7).padStart(2, '0')}:${String(input.minute ?? 0).padStart(2, '0')}.`)
            },
        }) as TalosToolDefinition<never>,

        defineTalosTool({
            name: 'device_open_app',
            action: 'write',
            title: 'Open an app',
            description: 'Open an installed app by package name, for example com.android.chrome.',
            input: z.object({ package: z.string().min(1).max(200) }),
            async run(input) {
                return esitoDi(await sources.openApp(input.package), `Opened ${input.package}.`)
            },
        }) as TalosToolDefinition<never>,

        defineTalosTool({
            name: 'device_open_settings',
            action: 'write',
            title: 'Open a settings screen',
            description: [
                'Open a specific Android settings screen by its action, for example',
                'android.settings.WIFI_SETTINGS or android.settings.SOUND_SETTINGS.',
                'USE THIS WHENEVER YOU CANNOT DO SOMETHING YOURSELF: taking the user to the',
                'exact screen is far more useful than saying you cannot. Set forThisApp when',
                'the screen is about TALOS itself, such as one of its permissions.',
            ].join(' '),
            input: z.object({
                action: z.string().min(1).max(120),
                forThisApp: z.boolean().optional(),
            }),
            async run(input) {
                return esitoDi(
                    await sources.openSettings(input.action, input.forThisApp ?? false),
                    'Opened that settings screen.',
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

    ]
}
