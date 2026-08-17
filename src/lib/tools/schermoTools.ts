import { z } from 'zod'
import { defineTalosTool, type TalosToolDefinition } from '@/lib/tools/registry'
import {
    TALOS_LIMITI_PREDEFINITI,
    talosFraseDiFine,
    type TalosCorsaDelPilota,
} from '@/lib/agent/pilotaDelloSchermo'

/**
 * ⭐⭐ IL TOOL CHE FA GUIDARE TALOS: «apri Chrome e cerca il meteo di Catania».
 *
 * ## ⛔ Uno solo, e non due
 *
 * La strada facile sarebbe offrire «guarda» e «tocca» e lasciare che a pilotare
 * sia il ciclo della chat. Non si fa, per due ragioni misurate:
 *
 * 1. **Il costo.** Ogni passo si porterebbe dietro l'intera conversazione, il
 *    prompt di sistema e il catalogo dei tool. Il passo del pilota è una
 *    conversazione di due righe — 458 token contro 3.767 del formato M3A — e
 *    attaccarci sopra una chat vera vanificherebbe il taglio.
 * 2. **Il consenso.** Con due tool la persona autorizza «un tocco», e poi ne
 *    arrivano venti. Con uno solo autorizza **la corsa**, che è la cosa vera
 *    che sta succedendo: TALOS prende in mano il telefono finché non ha finito.
 *
 * ## ⛔ `confirmation: 'always'`, e non è pignoleria
 *
 * Qui non si cambia un'impostazione: si muove il dito su app di ALTRI, dentro
 * cose che possono comprare, mandare, cancellare. Un consenso ricordato
 * varrebbe per un obiettivo che nessuno ha ancora scritto — è l'unica riga del
 * catalogo dove «consenti sempre» sarebbe una firma in bianco.
 */
export interface TalosSchermoToolSources {
    /**
     * Guida fino alla fine o al primo tetto. Torna il racconto della corsa.
     *
     * Le porte — ponte, modello, voce, orologio — le monta il controller: qui
     * non si sa né chi guarda né chi decide, e va bene così.
     */
    guida(obiettivo: string): Promise<TalosCorsaDelPilota>
    /** Se l'occhio è aperto ADESSO, non se lo era prima. */
    occhioAperto(): Promise<boolean>
}

/**
 * Come si racconta al MODELLO una corsa finita.
 *
 * ⛔ Il racconto contiene la storia dei passi, e non è verbosità: senza, il
 * modello che ha chiesto la corsa non sa cosa è successo e ricomincerebbe da
 * capo. Con la storia può dire alla persona dov'è arrivato.
 */
export function talosRacconto(corsa: TalosCorsaDelPilota): string {
    const passi = corsa.storia.length > 0
        ? `\nWhat happened, step by step:\n${corsa.storia.join('\n')}`
        : ''
    const tempo = ` (${corsa.passi} steps, ${Math.round(corsa.millisecondi / 1000)}s)`
    /*
     * ⭐⭐⭐ «Done» SOLO SE L'HA DETTO — e prima lo diceva anche a chi si era
     * arreso.
     *
     * `fine` significava due cose opposte, «obiettivo raggiunto» e «obiettivo
     * impossibile», e questa riga le raccontava tutte e due come «Done». Il
     * modello leggeva «Done» dalla corsa che si era appena arresa, e lo
     * ripeteva alla persona.
     *
     * ⛔ E il ramo che conta di piu' e' il terzo: un `fine` SENZA esito non
     * diventa «Done». E' un modello che non ha risposto alla domanda, e dare
     * per riuscito cio' che non e' stato dichiarato e' il difetto di partenza
     * rimesso dentro dalla porta di servizio.
     */
    if (corsa.fine.motivo === 'fine') {
        const detto = corsa.fine.testo ?? ''
        if (corsa.fine.esito === 'fallito') {
            return `GAVE UP${tempo}. TALOS could not reach the goal and stopped by itself. ${detto} ⛔ Do NOT say it is done. Tell the user where it got to and what stopped it.${passi}`.trim()
        }
        if (corsa.fine.esito === 'riuscito') {
            return `Done${tempo}. ${detto}${passi}`.trim()
        }
        return `Stopped${tempo}, without saying whether it worked. ${detto} ⛔ Do NOT claim success: it was never claimed. Tell the user what the steps below show, and ask them to check.${passi}`.trim()
    }
    /*
     * ⛔ Il motivo si dice al modello in una forma che lo fa AGIRE, come ogni
     * altro esito di questo progetto: «si è fermato» non basta, serve sapere se
     * ha senso riprovare. La mano della persona è l'unico caso in cui la
     * risposta è no per sempre — chiedere «vuoi che continui?» dopo che
     * qualcuno ha ripreso in mano il telefono è insistere.
     */
    const cosaFare = corsa.fine.motivo === 'mano-sullo-schermo'
        ? 'The user touched the screen, so TALOS stopped. Do NOT offer to continue unless they ask.'
        : 'Tell the user where it got to, and ask whether to continue. Do not silently retry.'
    /*
     * ⛔⛔ IL MOTIVO INTERNO NON SI RIPETE ALLA PERSONA.
     *
     * Owner 2026-08-11: in chat è comparso «schermoCambiato». Non l'avevamo
     * scritto noi in italiano: l'ha copiato il modello da questo racconto, che
     * è fatto per LUI ed è pieno di parole che nessuno dice ad alta voce.
     *
     * ⇒ Gli si passa la frase già pronta, nella lingua della persona, e gli si
     * dice di usare quella. Vietare senza dare un'alternativa è il modo più
     * sicuro di farsi disobbedire: se non ha una frase, ne inventa una — o
     * ricopia la nostra.
     *
     * ⛔ E la frase resta comunque detta a voce da `corsaDelloSchermo`, che non
     * dipende dal modello: due strade per la stessa cosa, perché quella che
     * passa da un modello non è mai garantita.
     */
    const daDire = `Say this to the user, in their own words: "${talosFraseDiFine(corsa.fine)}" `
        + 'Never show them the internal reason above — it is a code for you, not a sentence.'
    return `Stopped: ${corsa.fine.motivo}${tempo}. ${cosaFare} ${daDire}${passi}`
}

export function createTalosSchermoTools(
    sources: TalosSchermoToolSources,
): TalosToolDefinition<never>[] {
    return [
        defineTalosTool({
            name: 'device_screen_drive',
            /*
             * ⛔ `write` E `outbound`. Guidare uno schermo può mandare un
             * messaggio, cercare sul web, comprare: trattarlo come una scrittura
             * locale vorrebbe dire far uscire roba dal telefono sotto un
             * permesso che parla d'altro. È la stessa scelta già fatta per la
             * risposta a una notifica.
             */
            action: 'write',
            requiredActions: ['write', 'outbound'],
            title: 'Use an app on the screen',
            description: [
                'Drive the phone screen to reach a goal, like "open Chrome and search for',
                'the weather in Catania". TALOS looks at what is on screen, taps, types and',
                'scrolls, and says out loud what it is about to do before each move.',
                `It stops on its own after ${TALOS_LIMITI_PREDEFINITI.passi} steps,`,
                `${Math.round(TALOS_LIMITI_PREDEFINITI.millisecondi / 1000)} seconds,`,
                'two failures in a row, or the moment the user touches the screen.',
                'Give ONE concrete goal, not a vague wish. Prefer a direct tool when one',
                'exists: this is for things TALOS cannot do any other way.',
            ].join(' '),
            input: z.object({
                obiettivo: z.string().min(3).max(300),
            }),
            confirmation: 'always',
            async run(input) {
                if (!(await sources.occhioAperto())) {
                    return {
                        ok: false,
                        content: 'TALOS cannot see the screen: the screen-reading permission is off. Offer to open its settings screen with device_open_settings; do not retry.',
                        code: 'TALOS_SCHERMO_OCCHIO_CHIUSO',
                    }
                }
                const corsa = await sources.guida(input.obiettivo)
                if (corsa.fine.motivo === 'fine') {
                    return { ok: true, content: talosRacconto(corsa) }
                }
                return {
                    ok: false,
                    content: talosRacconto(corsa),
                    code: `TALOS_SCHERMO_${corsa.fine.motivo.toUpperCase().replace(/-/g, '_')}`,
                }
            },
        }) as TalosToolDefinition<never>,
    ]
}

/** La frase per la PERSONA, che è un'altra cosa dal racconto al modello. */
export { talosFraseDiFine }
