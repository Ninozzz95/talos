import { beforeEach, describe, expect, it, vi } from 'vitest'
import { campionaPerIlTetto, type TalosUltimoGiroChat } from '@/lib/chat/compattazioneChat'
import { creaCompattazioneDelController } from '@/stores/chatControllerCompattazione'
import { dividiPerCompattazione } from '@/lib/kernel/compattazione'
import type { ChatTurn } from '@/stores/chat'

/*
 * ⭐⭐ REG-COMP-10 — il riassunto «in coda» oltre il tetto (P4-ter passo 2-bis, 02/10/2026, prova del Pad).
 *
 * Spark-X2.5-4B, parser CSV in sei turni: dopo il quarto la compattazione è partita, ma la richiesta di riassunto
 * NELLA conversazione viva chiede tutta la conversazione più la domanda — più del tetto che l'ha fatta scattare — e il
 * motore l'ha rifiutata (nessuna riga `prompt:` nel logcat). Il riuso della cache, motivo della scelta, lì vale zero
 * (D-45). Owner «A parte, se non ci sta»: in coda quando ci sta; se no richiesta a parte senza attrezzi, con la parte
 * da riassumere limitata al tetto per campioni (adattato da Hermes, `agent/context_compressor.py:3703-3730`), una
 * sola chiamata.
 */
const locale = vi.hoisted(() => ({
    talosLocalFinestraPerCompattazione: vi.fn(),
    talosLocalTokenDellaRichiesta: vi.fn(),
}))
vi.mock('@/lib/chat/providers/localAdapter', () => locale)
const fornitore = vi.hoisted(() => ({ complete: vi.fn() }))
vi.mock('@/lib/chat/providerRegistry', () => ({ providerAdapterFor: () => ({ complete: fornitore.complete }) }))

const RISPOSTA = 'una risposta lunga con codice, motivi e alternative scartate. '.repeat(40)
function conversazione(scambi: number): ChatTurn[] {
    const turni: ChatTurn[] = []
    for (let i = 0; i < scambi; i += 1) {
        turni.push({ role: 'user', content: `domanda ${i}: aggiungi il caso ${i} al parser` } as ChatTurn)
        turni.push({ role: 'assistant', content: `risposta ${i}. ${RISPOSTA}` } as ChatTurn)
    }
    return turni
}
const caratteri = (messaggi: ReadonlyArray<{ content?: unknown }>) => messaggi.reduce((n, m) => n + String(m.content ?? '').length, 0)
const ruoliAlternati = (messaggi: ReadonlyArray<{ role: string }>) => messaggi.every((m, i) => i === 0 || !(m.role === 'user' && messaggi[i - 1]!.role === 'user'))

describe('REG-COMP-10 — campionaPerIlTetto', () => {
    const mezzo = conversazione(12).map((t) => ({ role: t.role, content: t.content }))

    it('CHAT-COMP-09 sotto il budget la parte da riassumere resta identica', () => {
        expect(campionaPerIlTetto(mezzo, caratteri(mezzo) + 10)).toEqual(mezzo)
    })

    // Come Hermes (`_bound_oversized_record`): il primo e l'ultimo scambio non si perdono mai, ma uno scambio più grande
    // della sua fetta si accorcia nel mezzo — l'inizio resta quello vero.
    it('CHAT-COMP-10 sopra il budget: primo e ultimo scambio presenti, segnaposto, ruoli alternati, dentro il budget', () => {
        const budget = Math.floor(caratteri(mezzo) / 4)
        const campione = campionaPerIlTetto(mezzo, budget)
        expect(campione[0]!.content).toBe(mezzo[0]!.content)
        expect(String(campione.at(-1)!.content).startsWith('risposta 11. una risposta lunga')).toBe(true)
        expect(String(campione.at(-2)!.content)).toContain(String(mezzo.at(-2)!.content))
        expect(campione.some((m) => /scambi omessi/.test(String(m.content)))).toBe(true)
        expect(ruoliAlternati(campione)).toBe(true)
        expect(caratteri(campione)).toBeLessThanOrEqual(budget)
    })
})

describe('REG-COMP-10 — il controller sceglie la strada del riassunto locale', () => {
    const GIRO: TalosUltimoGiroChat = { system: 'SISTEMA', tools: [{ type: 'function', function: { name: 'note_add' } }], effort: 'off', thinking: false } as never
    function controller() {
        return creaCompattazioneDelController({
            modelloDelProfilo: () => ({ provider: 'local', model: { id: '/models/spark.gguf' } as never }),
            ultimoGiro: () => GIRO,
            tokenUltimoGiro: () => null,
            taratura: () => null,
            getKey: async () => null,
            getEndpoint: async () => null,
            transport: {} as never,
            locale: () => 'it',
        })
    }
    const turni = conversazione(6)
    const parti = dividiPerCompattazione(turni.map((t) => ({ role: t.role, content: t.content })))

    beforeEach(() => {
        locale.talosLocalFinestraPerCompattazione.mockReset().mockReturnValue({ finestraToken: 3584, promptTokens: 3000, riservaUscita: 1024 })
        fornitore.complete.mockReset().mockResolvedValue({ text: 'RIASSUNTO', finishReason: 'stop' })
    })

    it('CTRL-COMP-04 la coda ci sta: riassunto nella conversazione viva, con sistema e attrezzi dell\'ultimo giro', async () => {
        locale.talosLocalTokenDellaRichiesta.mockReset().mockResolvedValue(2000)
        const esito = await controller().riassumiConversazione({ sessionId: 's', modelProfileId: 'p', turni, parti } as never)
        expect(esito).toEqual({ ok: true, testo: 'RIASSUNTO' })
        const [richiesta] = fornitore.complete.mock.calls.map(([r]) => r)
        expect(richiesta.tools).toHaveLength(1)
        expect(richiesta.system).toBe('SISTEMA')
    })

    it('CTRL-COMP-05 la coda NON ci sta: una sola richiesta a parte, senza attrezzi, che sta nel tetto', async () => {
        // In coda: 6312 token (più del tetto 3584 − 1024). A parte, prima misura troppo alta, poi dentro.
        locale.talosLocalTokenDellaRichiesta.mockReset()
            .mockResolvedValueOnce(6312)
            .mockResolvedValueOnce(3100)
            .mockResolvedValueOnce(2400)
        const esito = await controller().riassumiConversazione({ sessionId: 's', modelProfileId: 'p', turni, parti } as never)
        expect(esito).toEqual({ ok: true, testo: 'RIASSUNTO' })
        expect(fornitore.complete).toHaveBeenCalledTimes(1)
        const [richiesta] = fornitore.complete.mock.calls.map(([r]) => r)
        expect(richiesta.tools ?? []).toHaveLength(0)
        expect(richiesta.system).toBeUndefined()
        expect(ruoliAlternati(richiesta.turns)).toBe(true)
        // La richiesta inviata è l'ultima misurata, quella che sta nel tetto: la prima a parte (3100 > 2559) è stata
        // STRETTA e rimisurata (2400), mai inviata così com'era.
        const misurate = locale.talosLocalTokenDellaRichiesta.mock.calls.map(([r]) => r.turns)
        expect(misurate).toHaveLength(3)
        expect(misurate.at(-1)).toEqual(richiesta.turns)
        expect(caratteri(misurate[2]!)).toBeLessThan(caratteri(misurate[1]!))
    })
})
