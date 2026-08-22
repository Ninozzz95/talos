/**
 * ⛔ Un «sì» deve bastare anche quando il tool chiede DUE azioni.
 *
 * ## Il difetto, riprodotto sul Pad il 2026-08-08
 *
 * `device_wallpaper` chiede `write` **e** `read`: per applicare uno sfondo
 * bisogna leggere un file della Libreria. Sul dispositivo, con Claude Sonnet 5:
 * la scheda compare, mostra i due bollini «Scrittura» e «Lettura», si tocca
 * **Consenti** — e il modello riceve «Declined by the user», il plugin nativo
 * non viene chiamato **nemmeno una volta** (`logcat | grep -c TalosDevice` → 0)
 * e lo sfondo non cambia (`dumpsys wallpaper` fermo su `id: 37`).
 *
 * Con `device_torch`, che chiede solo `write`, lo stesso gesto funziona. La
 * differenza è il numero di azioni.
 *
 * ## Perché è grave oltre allo sfondo
 *
 * Un «sì» che non vale è peggio di un «no»: la persona ha autorizzato, la cosa
 * non è successa, e il modello racconta di aver annullato — cioè attribuisce a
 * lei una decisione che non ha preso. Riguarda `device_wallpaper`,
 * `device_compose`, `device_speak`, `web_search`, `web_read`, `library_export`,
 * `generate_image`, `research_start`, `research_resume`: tutti i tool a due
 * azioni.
 *
 * ## Cosa afferma questa prova
 *
 * Che una richiesta risolta con `allow_turn` — esattamente ciò che scrive il
 * pulsante «Consenti» — faccia **girare** il tool, per ogni combinazione di
 * azioni e in ogni ordine. L'ordine è la parte che conta: il confronto fra le
 * azioni chieste e quelle concesse è posizionale, e due liste con gli stessi
 * elementi in ordine diverso sono lo stesso permesso per chi legge la scheda.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { defineTalosTool } from '@/lib/tools/registry'
import { executeTalosTool } from '@/lib/tools/executor'
import {
    TALOS_EMPTY_TOOL_AUTHORIZATIONS,
    digestTalosToolAuthorizationInput,
    type TalosToolAuthorizationRequestV1,
} from '@/lib/tools/toolAuthorizations'
import type { TalosToolAction } from '@/lib/tools/permissionTypes'

/**
 * ⛔ `false`, ed è la verità del percorso della chat.
 *
 * Nel controller la dipendenza è scritta `requestConsent: async () => false`:
 * la vecchia Promise di consenso non esiste più, la domanda la fa la scheda.
 * Quindi ogni volta che l'esecutore ricade sul «chiedi» invece di riconoscere
 * la richiesta già decisa, l'esito NON è una seconda domanda — è un rifiuto,
 * silenzioso, attribuito alla persona.
 *
 * Un test che qui mettesse `true` passerebbe sempre e non vedrebbe niente.
 */
const consent = vi.fn(async () => false)
const audit = vi.fn(async () => {})

/** Lo stesso tool dello sfondo: scrive E legge. */
const sfondo = defineTalosTool({
    name: 'device_wallpaper',
    title: 'Set the wallpaper',
    description: 'Set a Library image as the wallpaper.',
    action: 'write',
    requiredActions: ['read'],
    input: z.object({ image: z.string().min(1) }),
    async run(input) {
        return { ok: true, content: `wallpaper: ${input.image}` }
    },
})

function deps(overrides: Record<string, unknown>) {
    return {
        permissions: { read: 'ask' as const, write: 'ask' as const, outbound: 'ask' as const },
        isToolEnabled: () => true,
        requestConsent: consent,
        audit,
        authorizations: TALOS_EMPTY_TOOL_AUTHORIZATIONS,
        context: { sessionId: 'session-1' },
        ...overrides,
    }
}

async function richiesta(
    azioni: readonly TalosToolAction[],
    input: unknown,
): Promise<TalosToolAuthorizationRequestV1> {
    return {
        schema_version: 1,
        id: 'richiesta-1',
        checkpoint_id: 'checkpoint-1',
        session_id: 'session-1',
        send_id: 'send-1',
        model_profile_id: 'anthropic:claude-sonnet-5',
        call_id: 'call-1',
        tool: 'device_wallpaper',
        actions: azioni,
        input,
        input_digest: await digestTalosToolAuthorizationInput(input),
        allow_persistent: true,
        decision: 'allow_turn',
        created_at: '2026-08-08T07:33:00.000Z',
        decided_at: '2026-08-08T07:33:20.000Z',
    }
}

beforeEach(() => {
    audit.mockClear()
    consent.mockClear().mockResolvedValue(false)
})

describe('un «sì» su un tool a due azioni', () => {
    it('DUE-AZIONI-01 «Consenti» fa girare lo sfondo, non lo annulla', async () => {
        const input = { image: 'gatto nero' }
        const risultato = await executeTalosTool(sfondo, input, deps({
            callId: 'call-1',
            authorizationRequest: await richiesta(['write', 'read'], input),
        }))

        // ⛔ Il messaggio dell'errore vero, se cade: e' quello che ha visto
        // l'owner sul Pad, tradotto dal modello in «ho annullato».
        expect(risultato.code ?? '').not.toBe('TALOS_TOOL_DECLINED')
        expect(risultato.ok).toBe(true)
    })

    it('DUE-AZIONI-02 l’ORDINE delle azioni non cambia il significato di un «sì»', async () => {
        /*
         * Due liste con gli stessi elementi in ordine diverso sono lo STESSO
         * permesso per chi ha letto la scheda: ha visto due bollini, non una
         * sequenza. Se il confronto e' posizionale, il permesso vale o non vale
         * a seconda di come e' stato costruito l'elenco — e chi lo costruisce
         * sta in un altro file.
         */
        const input = { image: 'gatto nero' }
        const risultato = await executeTalosTool(sfondo, input, deps({
            callId: 'call-1',
            authorizationRequest: await richiesta(['read', 'write'], input),
        }))

        expect(risultato.code ?? '').not.toBe('TALOS_TOOL_DECLINED')
        expect(risultato.ok).toBe(true)
    })

    it('DUE-AZIONI-04 ⛔ IL CASO VERO: con «leggere» già consentito, il «sì» sulla scrittura deve bastare', async () => {
        /*
         * ⛔ QUESTA è la configurazione dell'owner sul Pad, ed è la sola in cui
         * il difetto si vede: «Leggi le tue cose» è su **consenti sempre**,
         * «Crea o modifica» su **chiedi**.
         *
         * Allora la scheda chiede una sola azione — la scrittura — perché la
         * lettura è già permessa. Ma la richiesta memorizzata porta con sé
         * TUTTE le azioni del tool, e il confronto fra le due liste è
         * posizionale: `['write','read']` contro `['write']` non combacia,
         * la richiesta decisa viene scartata come se non esistesse, e il gesto
         * successivo dell'esecutore è chiedere di nuovo — a un `requestConsent`
         * che nella chat vale `false`.
         *
         * Risultato per chi guarda: ha toccato **Consenti**, e il modello dice
         * «ho annullato». Un «sì» che si trasforma in «no» è peggio di un
         * rifiuto: attribuisce alla persona una decisione che non ha preso.
         */
        const input = { image: 'button_a.png' }
        const risultato = await executeTalosTool(sfondo, input, deps({
            permissions: { read: 'allow' as const, write: 'ask' as const, outbound: 'ask' as const },
            callId: 'call-1',
            // La richiesta come la scrive oggi il controller: TUTTE le azioni.
            authorizationRequest: await richiesta(['write', 'read'], input),
        }))

        expect(risultato.code ?? '').not.toBe('TALOS_TOOL_DECLINED')
        expect(risultato.ok).toBe(true)
    })

    it('DUE-AZIONI-03 morde: un «no» resta un no', async () => {
        // La prova che i due casi sopra non passano per costruzione.
        const input = { image: 'gatto nero' }
        const negata = { ...(await richiesta(['write', 'read'], input)), decision: 'deny' as const }
        const risultato = await executeTalosTool(sfondo, input, deps({
            callId: 'call-1',
            authorizationRequest: negata,
        }))

        expect(risultato.ok).toBe(false)
        expect(risultato.code).toBe('TALOS_TOOL_DECLINED')
    })
})

describe('un rifiuto non si inventa', () => {
    /**
     * ⛔ Fermarsi è giusto; attribuire alla persona un «no» che non ha detto,
     * no.
     *
     * Il percorso della chat non ha una superficie per chiedere: la domanda la
     * fa la scheda. Quando l'esecutore ci arriva lo stesso — perché una
     * richiesta decisa non è stata riconosciuta, o perché la scheda è ancora
     * aperta — l'esito dev'essere «in attesa», non «rifiutato».
     *
     * La differenza si vede fino in fondo: il modello che sente «rifiutato» si
     * arrende e lo racconta come una scelta dell'utente; quello che sente «in
     * attesa» dice com'è e offre di richiedere.
     */
    it('SENZA-RISPOSTA-01 «unanswered» non diventa «l’utente ha rifiutato»', async () => {
        const input = { image: 'button_a.png' }
        const risultato = await executeTalosTool(sfondo, input, deps({
            callId: 'call-1',
            requestConsent: async () => 'unanswered' as const,
            // Nessuna richiesta decisa: si finisce nel «chiedi».
            authorizationRequest: undefined,
        }))

        expect(risultato.ok).toBe(false)
        expect(risultato.code).toBe('TALOS_TOOL_AWAITING_AUTHORIZATION')
        // Il testo deve contenere l'istruzione, non solo la constatazione.
        expect(risultato.content).toContain('has NOT refused')
    })

    it('SENZA-RISPOSTA-02 un «no» vero resta distinguibile', async () => {
        const input = { image: 'button_a.png' }
        const risultato = await executeTalosTool(sfondo, input, deps({
            callId: 'call-1',
            requestConsent: async () => false,
            authorizationRequest: undefined,
        }))

        expect(risultato.ok).toBe(false)
        expect(risultato.code).toBe('TALOS_TOOL_DECLINED')
    })

    it('SENZA-RISPOSTA-03 si ferma comunque: in nessuno dei due casi il tool gira', async () => {
        // ⛔ La sicurezza non cambia. Cambia solo cosa si racconta.
        const run = vi.spyOn(sfondo, 'run')
        for (const risposta of ['unanswered' as const, false]) {
            await executeTalosTool(sfondo, { image: 'x.png' }, deps({
                callId: 'call-1',
                requestConsent: async () => risposta,
                authorizationRequest: undefined,
            }))
        }
        expect(run).not.toHaveBeenCalled()
        run.mockRestore()
    })
})
