import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { defineTalosTool } from '@/lib/tools/registry'
import {
    TALOS_DETTAGLI_STRUMENTO,
    talosIndiceCompatto,
    talosIstruzioneCatalogo,
    talosIstruzioneRispostaDiretta,
} from '@/lib/tools/catalogoCompatto'

/**
 * ⛔⛔ IL MODELLO LOCALE ELENCAVA GLI STRUMENTI E POI DICEVA DI NON AVERLI.
 *
 * MISURATO sul Pad il 2026-08-10, Qwen3-1.7B.Q4_K_M:
 *
 * ```
 *   «Accendi la torcia»   → «There is no tool available to turn on the torch»
 *   «Che strumenti hai?»  → elenca device_torch fra gli altri
 *   logcat                → tool: 2, grammatica: pigra
 * ```
 *
 * ⇒ L'indice arriva e viene letto; manca il primo passo (`tool_details`). Con
 * la chiave la stessa frase accende la torcia: è la violazione di «locali e api
 * allineati al 100%».
 *
 * L'istruzione era **descrittiva** e lasciava dedurre la mossa. Questi casi
 * fissano le tre proprietà che l'hanno resa eseguibile da un modello piccolo, e
 * ognuno morde: toglierne una fa fallire il suo caso.
 */

const finto = (nome: string, descrizione: string) => defineTalosTool({
    name: nome,
    title: nome,
    description: descrizione,
    action: 'read',
    input: z.object({ x: z.string().optional() }),
    async run() { return { ok: true, content: '' } },
}) as never

const TOOLS = [
    finto('device_torch', 'Turn the torch on or off. Works on any phone.'),
    finto('device_volume', 'Read or set a volume stream.'),
] as never[]

describe('LOCAL-PARITY-DIRECT-FORM-12', () => {
    it('vieta aggiunte alla resa richiesta', () => {
        const t = talosIstruzioneRispostaDiretta()
        expect(t).toMatch(/No tools this turn/i)
        expect(t).toMatch(/only what the user requested/i)
        expect(t).toMatch(/labels/i)
        expect(t).toMatch(/quotes/i)
        expect(t).toMatch(/lead-ins/i)
    })
})

describe('⛔ l\'istruzione del catalogo deve far fare il PRIMO PASSO', () => {
    it('è IMPERATIVA: dice prima questo, poi quello — non descrive uno stato', () => {
        const t = talosIstruzioneCatalogo(TOOLS)
        expect(t).toMatch(/FIRST call/)
        expect(t).toMatch(/THEN call/)
    })

    it('⛔ VIETA ALLA LETTERA la frase sbagliata che il modello produceva', () => {
        const t = talosIstruzioneCatalogo(TOOLS)
        // La frase misurata era «There is no tool available to …»: il divieto
        // deve nominarla, non alludervi.
        expect(t).toMatch(/is not available/)
        expect(t).toMatch(/Never reply/)
    })

    /**
     * ⛔ IL DIFETTO CHE HO INTRODOTTO IO, E CHE QUESTO CASO IMPEDISCE.
     *
     * La prima versione portava un esempio svolto: «call tool_details with
     * {"names": ["device_torch"]}». Misurato subito dopo sul Pad: il modello ha
     * smesso di rifiutare — e ha cominciato a **scrivere la chiamata in un
     * blocco di codice** invece di emetterla, ripetendo l'esempio parola per
     * parola. Un modello piccolo imita ciò che gli sta davanti.
     */
    it('⛔ NON contiene una chiamata in forma di JSON: sarebbe roba da copiare', () => {
        const t = talosIstruzioneCatalogo(TOOLS)
        expect(t, 'un esempio con {"names": …} torna indietro come testo').not.toMatch(/\{\s*"names"/)
        expect(t).not.toContain('```')
    })

    it('vieta ESPLICITAMENTE di scrivere la chiamata invece di farla', () => {
        const t = talosIstruzioneCatalogo(TOOLS)
        expect(t).toMatch(/Never write a tool call as text/)
        expect(t).toMatch(/code block/)
    })

    /**
     * ⛔ E l'esempio C'È, IN PROSA — perché toglierlo ha peggiorato le cose.
     *
     * Misurato sul Pad, tre versioni della stessa istruzione, stessa domanda
     * «Accendi la torcia», letto in `dumpsys media.camera`:
     *
     * ```
     *   descrittiva, senza esempio    «There is no tool available…»     torcia OFF
     *   con esempio in JSON           chiamata + blocco di codice        torcia ON
     *   senza esempio, con divieti    si ferma dopo tool_details         torcia OFF
     * ```
     *
     * ⇒ L'esempio è ciò che fa fare il primo passo; il blocco di codice era
     * rumore ATTORNO a una chiamata vera, non al posto suo. Resta in prosa, con
     * i nomi veri e senza JSON da copiare, più il divieto esplicito.
     */
    /**
     * ⛔ E DOPO che il tool è tornato, il racconto deve essere una frase.
     *
     * MISURATO sul Pad, chat nuova, torcia accesa da Claude, poi il locale:
     *
     * ```
     *   dumpsys   07:17:44 : Torch … turned off for client PID 20955   ✅ agisce
     *   in chat   «Checking the available tools, the device_torch tool is
     *              available. Calling the tool to turn off the torch:»
     *              + blocco di codice «tool_call: device_torch, toggle, off»
     * ```
     *
     * Cioè: fa la cosa giusta e la racconta malissimo — in inglese a una
     * domanda in italiano, pensando ad alta voce, e chiudendo con una finta
     * chiamata in un blocco di codice. Con la chiave la stessa azione dice
     * «Fatto, torcia spenta! 🔦». La parità non è solo «il tool parte»: è anche
     * cosa legge la persona.
     */
    it('dice cosa fare DOPO il tool: una frase, nella lingua di chi ha scritto', () => {
        const t = talosIstruzioneCatalogo(TOOLS)
        expect(t).toMatch(/ONE short sentence/)
        expect(t).toMatch(/language they wrote in/)
        expect(t, 'e vieta il pensiero ad alta voce che si vedeva a schermo')
            .toMatch(/do not explain which tools you considered/)
    })

    it('LOCAL-PARITY-NO-SPURIOUS-TOOL-09 dice quando NON chiamare strumenti', () => {
        const t = talosIstruzioneCatalogo(TOOLS)
        expect(t).toMatch(/Do not call any tool for plain conversation/i)
        expect(t).toMatch(/exact text/i)
        expect(t).toMatch(/greetings/i)
    })

    it('porta l\'esempio in PROSA, col primo tool vero e senza JSON', () => {
        const t = talosIstruzioneCatalogo(TOOLS)
        expect(t).toContain('So for device_torch:')
        expect(t, 'in prosa, non in forma di chiamata').not.toMatch(/\{\s*"names"/)
        const altro = talosIstruzioneCatalogo([TOOLS[1]!] as never)
        expect(altro, 'l\'esempio segue il catalogo, non è scritto a mano').toContain('So for device_volume:')
    })

    it('nomina lo strumento che svela, con la chiave giusta', () => {
        const t = talosIstruzioneCatalogo(TOOLS)
        expect(t).toContain(TALOS_DETTAGLI_STRUMENTO)
    })

    it('contiene ancora l\'INDICE, che è il motivo per cui esiste', () => {
        const t = talosIstruzioneCatalogo(TOOLS)
        expect(t).toContain(talosIndiceCompatto(TOOLS))
        expect(t).toContain('device_torch: Turn the torch on or off.')
    })

    it('senza strumenti non dice niente: un catalogo vuoto non si annuncia', () => {
        expect(talosIstruzioneCatalogo([] as never)).toBe('')
    })
})
