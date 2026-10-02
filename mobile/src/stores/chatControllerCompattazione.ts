import type { TalosMobileCompletionInput, TalosMobileProviderModel } from '@/lib/chat/providerContracts'
import type { TalosMobileProviderId } from '@/components/chat/mobileChatTypes'
import type { TalosMobileHttpTransport } from '@/lib/chat/httpTransport'
import type { ChatTurn, TalosFinestraCompattazione, TalosMisuraRichiesta, TalosRiassumiInput, TalosRiassuntoEsito } from '@/stores/chat'
import { providerAdapterFor } from '@/lib/chat/providerRegistry'
import { richiestaDiRiassunto, stimaRichiesta, type TalosUltimoGiroChat } from '@/lib/chat/compattazioneChat'
import { valutaRispostaDiRiassunto } from '@/lib/kernel/compattazione'

/*
 * ⭐⭐ P4-ter passo 2 (02/10/2026) — la parte della compattazione che tocca il MODELLO: finestra e chiamata del riassunto.
 * Caricata solo quando serve (il cancello `verify-initial-chunk.mjs` pesa l'avvio al byte); il controller tiene le due
 * memorie per chat (ultimo giro, token dell'ultimo giro) e gli involucri. Quando e dove salvare lo decide lo store.
 */
export interface TalosDipendenzeCompattazioneController {
    /** Il fornitore e il modello del profilo di una chat, o `null` se non si risolve. */
    modelloDelProfilo(modelProfileId: string | null): { provider: TalosMobileProviderId, model: TalosMobileProviderModel } | null
    ultimoGiro(sessionId: string): TalosUltimoGiroChat | null
    tokenUltimoGiro(sessionId: string): number | null
    /** Il rapporto «token veri del fornitore / stima» dell'ultima richiesta di quella chat, se il fornitore l'ha detto. */
    taratura(sessionId: string): number | null
    getKey(provider: TalosMobileProviderId): Promise<string | null>
    getEndpoint(provider: TalosMobileProviderId): Promise<string | null>
    transport: TalosMobileHttpTransport
    locale(): string
}

export function creaCompattazioneDelController(d: TalosDipendenzeCompattazioneController) {
    /** La finestra per la soglia: quella dichiarata dal fornitore, o il tetto vero del motore locale. */
    async function finestraPerCompattazione(modelProfileId: string | null): Promise<TalosFinestraCompattazione | null> {
        const scelto = d.modelloDelProfilo(modelProfileId)
        if (!scelto) return null
        if (scelto.provider === 'local') {
            const { talosLocalFinestraPerCompattazione } = await import('@/lib/chat/providers/localAdapter')
            const misurata = talosLocalFinestraPerCompattazione(scelto.model.id)
            // ⛔ LOCAL-COMP-02: senza un tetto misurato niente compattazione automatica; resta quella su «contesto pieno».
            return misurata && misurata.finestraToken !== null
                ? { finestraToken: misurata.finestraToken, riservaUscita: misurata.riservaUscita, tettoToken: null, promptTokens: misurata.promptTokens }
                : null
        }
        return {
            finestraToken: scelto.model.contextLength ?? null,
            riservaUscita: scelto.model.maxOutputTokens ?? null,
            tettoToken: null,
            promptTokens: null,
        }
    }

    /** La finestra di una CHAT: quella del suo modello, col numero vero del suo ultimo giro quando il fornitore l'ha detto. */
    async function finestraDellaChat(sessionId: string, modelProfileId: string | null): Promise<TalosFinestraCompattazione | null> {
        const finestra = await finestraPerCompattazione(modelProfileId)
        if (!finestra) return null
        return { ...finestra, promptTokens: d.tokenUltimoGiro(sessionId) ?? finestra.promptTokens }
    }

    /**
     * La sola chiamata al modello per il riassunto.
     * ⛔ Come la chiamata della ricerca non si ferma a metà: lo Stop ferma la chat, non un riassunto già partito (il
     * contratto `complete` degli adattatori non porta un segnale).
     */
    async function riassumiConversazione(input: TalosRiassumiInput): Promise<TalosRiassuntoEsito> {
        const scelto = d.modelloDelProfilo(input.modelProfileId)
        if (!scelto) return { ok: false, motivo: 'senza-modello' }
        const ultimoGiro = d.ultimoGiro(input.sessionId)
        const finestra = scelto.provider === 'local' ? await finestraPerCompattazione(input.modelProfileId) : null
        const tokenRimasti = finestra && finestra.finestraToken !== null && finestra.promptTokens !== null
            ? finestra.finestraToken - finestra.promptTokens - (finestra.riservaUscita ?? 0)
            : undefined
        const base = { provider: scelto.provider, turni: input.turni, parti: input.parti, ultimoGiro, tokenRimasti }
        const richiesta = scelto.provider === 'local' && finestra && finestra.finestraToken !== null
            ? await richiestaLocaleNelTetto(scelto.model, base, finestra.finestraToken - (finestra.riservaUscita ?? 0) - 1, finestra.riservaUscita)
            : richiestaDiRiassunto(base)
        const [apiKey, endpoint] = await Promise.all([d.getKey(scelto.provider), d.getEndpoint(scelto.provider)])
        const inCoda = richiesta.modo === 'in-coda' && ultimoGiro !== null
        const risposta = await providerAdapterFor(scelto.provider).complete({
            model: scelto.model,
            turns: richiesta.turns,
            ...(richiesta.system !== undefined ? { system: richiesta.system } : {}),
            ...(richiesta.tools ? { tools: richiesta.tools as TalosMobileCompletionInput['tools'] } : {}),
            effort: inCoda ? ultimoGiro.effort : 'off',
            thinking: inCoda ? ultimoGiro.thinking : false,
            locale: d.locale(),
        }, { apiKey, endpoint }, d.transport)
        const valutata = valutaRispostaDiRiassunto({
            scelta: { content: risposta.text, tool_calls: risposta.toolCalls ?? [] },
            finishReason: risposta.finishReason ?? 'stop',
        })
        return valutata.ok ? { ok: true, testo: valutata.riassunto } : { ok: false, motivo: valutata.motivo ?? 'vuoto' }
    }

    /**
     * ⭐⭐ REG-COMP-10 — owner 02/10 «A parte, se non ci sta». Prova del Pad: dopo il quarto turno di Spark il riassunto
     * IN CODA chiedeva tutta la conversazione più la domanda, oltre il tetto che aveva fatto scattare la compattazione,
     * e il motore lo rifiutava. Qui si MISURA col tokenizzatore del motore (senza generare) prima di inviare:
     * - la coda sta in `limite` (tetto − riserva d'uscita − 1, la stessa aritmetica del rifiuto del motore) ⇒ in coda;
     * - se no ⇒ richiesta a parte senza attrezzi, col mezzo campionato: si parte da 3,5 caratteri a token e si stringe
     *   in proporzione finché la misura sta nel limite (al più quattro misure, come per la coda letterale del nucleo).
     *   Il riassunto deve stare nella riserva d'uscita: metà dei suoi token in parole, perché l'italiano costa più di un
     *   token a parola e una risposta tagliata vale «troncato».
     * Se il motore non sa contare (`null`) si invia la richiesta com'è e decide lui: mai un rifiuto inventato qui.
     */
    async function richiestaLocaleNelTetto(
        model: TalosMobileProviderModel,
        base: Parameters<typeof richiestaDiRiassunto>[0],
        limite: number,
        riservaUscita: number | null,
    ) {
        const { talosLocalTokenDellaRichiesta } = await import('@/lib/chat/providers/localAdapter')
        const conta = (r: ReturnType<typeof richiestaDiRiassunto>) => talosLocalTokenDellaRichiesta({
            model,
            turns: r.turns,
            ...(r.system !== undefined ? { system: r.system } : {}),
            ...(r.tools ? { tools: r.tools as TalosMobileCompletionInput['tools'] } : {}),
            effort: r.modo === 'in-coda' ? base.ultimoGiro?.effort ?? 'off' : 'off',
            thinking: r.modo === 'in-coda' ? base.ultimoGiro?.thinking ?? false : false,
            locale: d.locale(),
        })
        const inCoda = richiestaDiRiassunto(base)
        if (inCoda.modo === 'in-coda') {
            const token = await conta(inCoda)
            if (token === null || token <= limite) return inCoda
        }
        const paroleMassime = riservaUscita ? Math.max(50, Math.floor(riservaUscita / 2)) : undefined
        let budgetCaratteri = Math.max(1, Math.floor(limite * 3.5))
        let aParte = richiestaDiRiassunto({ ...base, inCoda: false, budgetCaratteri, ...(paroleMassime ? { paroleMassime } : {}) })
        for (let misure = 0; misure < 4; misure += 1) {
            const token = await conta(aParte)
            if (token === null || token <= limite) break
            budgetCaratteri = Math.max(1, Math.floor(budgetCaratteri * (limite / token) * 0.95))
            aParte = richiestaDiRiassunto({ ...base, inCoda: false, budgetCaratteri, ...(paroleMassime ? { paroleMassime } : {}) })
        }
        return aParte
    }

    /**
     * ⭐⭐ Owner 02/10 «Token veri»: la richiesta INTERA che partirebbe con questi turni (sistema e attrezzi dell'ultimo
     * giro). Locale: contata dal tokenizzatore del motore senza generare. Remoti: la stima tarata sul numero vero
     * dell'ultima richiesta. `null` se non si sa misurare: lo store ripiega sulla stima e lo dichiara.
     */
    async function misuraRichiesta(input: { sessionId: string, modelProfileId: string | null, turni: readonly ChatTurn[] }): Promise<TalosMisuraRichiesta | null> {
        const scelto = d.modelloDelProfilo(input.modelProfileId)
        if (!scelto) return null
        const giro = d.ultimoGiro(input.sessionId)
        if (scelto.provider === 'local') {
            const { talosLocalTokenDellaRichiesta } = await import('@/lib/chat/providers/localAdapter')
            const token = await talosLocalTokenDellaRichiesta({
                model: scelto.model,
                turns: [...input.turni],
                ...(giro?.system !== undefined ? { system: giro.system } : {}),
                ...(giro?.tools ? { tools: giro.tools as TalosMobileCompletionInput['tools'] } : {}),
                effort: giro?.effort ?? 'off',
                thinking: giro?.thinking ?? false,
                locale: d.locale(),
            })
            return token !== null ? { token, misura: 'motore' } : null
        }
        const rapporto = d.taratura(input.sessionId)
        if (rapporto === null) return null
        return { token: Math.round(rapporto * stimaRichiesta({ turni: input.turni, system: giro?.system, tools: giro?.tools })), misura: 'fornitore' }
    }

    return { finestraDellaChat, riassumiConversazione, misuraRichiesta }
}
