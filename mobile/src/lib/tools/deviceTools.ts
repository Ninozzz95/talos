import { z } from 'zod'
import { defineTalosTool, type TalosToolDefinition } from '@/lib/tools/registry'

/**
 * ⭐ Il primo tool che tocca il TELEFONO, non i dati.
 *
 * ## Perché la vibrazione, e perché adesso
 *
 * Owner 2026-08-08, elencando cosa vuole da TALOS: «modificare i permessi del
 * telefono, vibrazioni, collegare a reti WiFi». Di quelle tre, due passano da
 * Shizuku — e su ColorOS Shizuku non riesce nemmeno ad autorizzarci, misurato
 * sul Pad. La terza no: `VIBRATE` è un permesso normale.
 *
 * ⇒ È la prima cosa della lista che TALOS può fare **oggi**, su ogni telefono,
 * senza cancelli che deve aprire qualcun altro.
 *
 * ## E perché non è «solo una vibrazione»
 *
 * Perché è il primo attraversamento completo della macchina costruita in A e B:
 * il modello chiede, il catalogo dei permessi decide, la scheda mostra una
 * frase invece di un nome sul filo, la postcondizione verifica, l'audit
 * registra. Il prossimo tool privilegiato entrerà nella stessa fessura, e
 * a quel punto sarà una fessura già battuta.
 *
 * ## ⛔ La postcondizione, che qui vale doppio
 *
 * Un tablet può non avere il motore, e un telefono in silenzioso può ignorare
 * la richiesta. Rispondere «fatto» quando non è successo niente è la bugia più
 * facile da raccontare e la più difficile da scoprire — e insegnerebbe a non
 * fidarsi di **tutti** gli altri tool. Per questo il lato nativo risponde
 * `vibrated: false` con il motivo, e il tool lo riporta invece di nasconderlo.
 */

export interface TalosDeviceToolSources {
    vibrate(milliseconds: number): Promise<{
        vibrated: boolean
        requestedMs: number
        appliedMs: number
        reason?: string
    }>
}

export function createTalosDeviceTools(
    sources: TalosDeviceToolSources,
): TalosToolDefinition<never>[] {
    return [
        defineTalosTool({
            name: 'device_vibrate',
            /*
             * ⛔ `write` e non `read`: cambia il mondo, anche se il mondo qui
             * e' un motorino. La classificazione decide il cartellino di
             * consenso e la contaminazione della catena, e sbagliarla in
             * difetto e' il modo in cui un tool sfugge alla difesa.
             */
            action: 'write',
            title: 'Vibrate the phone',
            description: [
                'Make the phone vibrate briefly, as a physical signal to the user.',
                'Use it when the user asks for a buzz, or to mark that something they',
                'were waiting for has finished while they are not looking at the screen.',
                'Do NOT use it to get attention for your own answers: the notification',
                'system already does that, and a buzz per reply is how a person turns',
                'everything off.',
            ].join(' '),
            input: z.object({
                /**
                 * ⛔ Il tetto è dichiarato al modello, non solo applicato: un
                 * limite che si scopre solo dopo averlo sfondato fa scrivere
                 * richieste che non verranno mai rispettate.
                 */
                milliseconds: z.number().int().min(1).max(2000).optional(),
            }),
            async run(input) {
                const esito = await sources.vibrate(input.milliseconds ?? 200)
                if (!esito.vibrated) {
                    /*
                     * ⛔ `ok: false` con una FRASE che il modello può usare, e
                     * un codice per la diagnostica. Un tablet senza motore non
                     * è un guasto da riprovare: è un fatto sul dispositivo, e
                     * dirlo così evita il ciclo «riprovo, riprovo, riprovo».
                     */
                    return {
                        ok: false,
                        content: esito.reason === 'no-vibrator'
                            ? 'This device has no vibration motor. Do not retry; tell the user instead.'
                            : 'The system refused the vibration. It may be silenced. Do not retry.',
                        code: esito.reason === 'no-vibrator'
                            ? 'TALOS_DEVICE_NO_VIBRATOR'
                            : 'TALOS_DEVICE_VIBRATE_REFUSED',
                    }
                }
                // La durata APPLICATA, non quella chiesta: se il tetto ha
                // tagliato, il modello deve saperlo per non prometterne dieci
                // secondi alla persona.
                return {
                    ok: true,
                    content: `Vibrated for ${esito.appliedMs} ms`
                        + (esito.appliedMs === esito.requestedMs
                            ? '.'
                            : ` (asked for ${esito.requestedMs} ms; capped).`),
                }
            },
        }) as TalosToolDefinition<never>,
    ]
}
