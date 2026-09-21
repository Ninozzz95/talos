import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
    TALOS_ATTREZZI_SEMPRE_IN_VISTA,
    talosConvieneAprireAGradi,
    talosVaDifferito,
} from '@/lib/tools/aperturaProgressiva'
import {
    TALOS_RICERCA_ATTREZZI_ANTHROPIC,
    talosAttrezziAnthropicAGradi,
    talosToolsForAnthropic,
} from '@/lib/tools/registry'
import { TALOS_AGENT_TOOL_IDS } from '@/lib/tools/toolControls'
import { withTalosAnthropicToolCache } from '@/lib/chat/promptCache'

/**
 * ⭐⭐⭐ L'APERTURA A GRADI — e le regole che l'API fa rispettare con un 400.
 *
 * Questi test non custodiscono un'idea nostra: custodiscono ciò che la
 * documentazione di Anthropic dichiara errore. Un 400 in produzione è una
 * risposta che non arriva alla persona, ed è la cosa peggiore che questo
 * meccanismo possa fare — vale più di tutto il risparmio che porta.
 */
/*
 * ⛔ Uno schema Zod VERO, non un finto: `talosAttrezziAnthropicAGradi` chiama
 * `z.toJSONSchema` su ognuno, e un doppio che non regge quella conversione
 * farebbe fallire il test per la ragione sbagliata — nascondendo se il
 * meccanismo funziona.
 */
function finto(nome: string) {
    return {
        name: nome,
        description: `Does ${nome}.`,
        input: z.object({ quando: z.string().optional() }),
    } as never
}

describe('apertura a gradi degli attrezzi', () => {
    /*
     * ⛔⛔ IL 400 CHE LA DOCUMENTAZIONE NOMINA PER PRIMO: «At least one tool
     * must have defer_loading=false. All tools cannot be deferred.»
     *
     * Non è teorico per noi: i quattro sempre-in-vista dipendono dai permessi
     * — `web_search` sparisce senza un motore configurato — quindi esiste una
     * combinazione reale di impostazioni in cui NESSUNO di loro è offerto.
     */
    it('⛔ se nessuno resta in vista NON si differisce niente', () => {
        const soloDifferibili = ['device_torch', 'device_alarm'].map(finto)
        const spediti = talosAttrezziAnthropicAGradi(soloDifferibili, () => true)

        expect(spediti.some((t) => (t as { defer_loading?: boolean }).defer_loading)).toBe(false)
        expect(spediti).toHaveLength(2)
    })

    /*
     * ⛔ Il secondo errore elencato dalla documentazione: «Never set
     * defer_loading: true on the tool search tool itself.»
     */
    it('⛔ l’attrezzo di RICERCA non è mai differito', () => {
        const spediti = talosAttrezziAnthropicAGradi(
            ['time_now', 'device_torch'].map(finto),
            talosVaDifferito,
        )
        const ricerca = spediti[0] as Record<string, unknown>

        expect(ricerca.type).toBe('tool_search_tool_bm25_20251119')
        expect(ricerca.defer_loading).toBeUndefined()
    })

    /*
     * ⛔ «You still send every tool's full definition in the tools array on
     * every request, including the deferred ones» — l'API ne ha bisogno per
     * cercare. Differire e OMETTERE sono due cose diverse, e confonderle
     * darebbe «Tool reference not found in available tools».
     */
    it('⛔ gli schemi si spediscono TUTTI, differiti compresi', () => {
        const tools = ['time_now', 'device_torch', 'device_alarm'].map(finto)
        const spediti = talosAttrezziAnthropicAGradi(tools, talosVaDifferito)

        // I tre attrezzi più l'attrezzo di ricerca.
        expect(spediti).toHaveLength(4)
        for (const tool of tools) {
            const riga = spediti.find((t) => (t as { name?: string }).name === (tool as { name: string }).name)
            expect(riga).toBeDefined()
            expect((riga as { input_schema?: unknown }).input_schema).toBeDefined()
        }
    })

    it('i sempre-in-vista restano in vista, il resto è differito', () => {
        const spediti = talosAttrezziAnthropicAGradi(
            ['time_now', 'device_torch'].map(finto),
            talosVaDifferito,
        ) as Array<Record<string, unknown>>

        expect(spediti.find((t) => t.name === 'time_now')?.defer_loading).toBeUndefined()
        expect(spediti.find((t) => t.name === 'device_torch')?.defer_loading).toBe(true)
    })

    /*
     * ⛔ «Standard tool calling is a better fit when you have fewer than 10
     * tools» — accendere la ricerca su quattro attrezzi costerebbe più di
     * quanto risparmia.
     */
    it('⛔ sotto le soglie NON si apre a gradi', () => {
        expect(talosConvieneAprireAGradi(['a', 'b', 'c'].map(finto), 900)).toBe(false)
    })

    it('sopra i 10 attrezzi si apre, e anche sopra i 10k token di schemi', () => {
        expect(talosConvieneAprireAGradi(Array.from({ length: 12 }, (_, i) => finto(`t${i}`)), 100)).toBe(true)
        expect(talosConvieneAprireAGradi(['a'].map(finto), 40_000)).toBe(true)
    })

    /*
     * ⛔⛔ IL TEST CHE MORDE SULLA REALTÀ, non su attrezzi finti.
     *
     * I quattro sempre-in-vista sono NOMI scritti a mano: se un domani uno di
     * loro venisse rinominato, la lista continuerebbe a nominarlo e noi
     * differiremmo tutto tranne un attrezzo che non esiste — cioè, in pratica,
     * differiremmo tutto. Il difetto non si vedrebbe da nessuna parte: la
     * risposta arriverebbe, solo più lenta e meno precisa.
     */
    it('⛔ ogni sempre-in-vista è un tool che ESISTE davvero', () => {
        const esistenti = new Set<string>(TALOS_AGENT_TOOL_IDS)
        const fantasmi = TALOS_ATTREZZI_SEMPRE_IN_VISTA.filter((nome) => !esistenti.has(nome))

        expect(fantasmi).toEqual([])
    })

    /*
     * ⛔ La documentazione dice «3-5». Meno di tre e quasi ogni richiesta paga
     * una ricerca; più di cinque e il prefisso ricomincia a gonfiarsi.
     */
    it('⛔ i sempre-in-vista restano fra tre e cinque, come dice la doc', () => {
        expect(TALOS_ATTREZZI_SEMPRE_IN_VISTA.length).toBeGreaterThanOrEqual(3)
        expect(TALOS_ATTREZZI_SEMPRE_IN_VISTA.length).toBeLessThanOrEqual(5)
    })

    /*
     * ⛔⛔⛔ IL TEST CHE MANCAVA, E IL 400 CHE È COSTATO.
     *
     * La prima versione di questo test guardava il solo serializzatore e diceva
     * «nessuno schema porta `cache_control`» — vero, e **inutile**: il taglio
     * della cache lo mette `withTalosAnthropicToolCache`, DOPO. Il difetto
     * viveva esattamente nello spazio fra le due funzioni che i due test
     * guardavano separatamente.
     *
     * Visto sul Pad il 2026-08-13 alle 23:52, primo messaggio con Claude Haiku
     * 4.5: `PROVIDER_HTTP_400 — Tool 'generate_image' cannot have both
     * defer_loading=true and cache_control set`. Cioè **nessuna risposta**, su
     * ogni messaggio, per chiunque usi Anthropic.
     *
     * ⇒ Il test ora attraversa **i due passi insieme**, che è l'unica forma in
     * cui poteva mordere. È la stessa lezione già pagata altrove: un test sulla
     * funzione pura non basta, deve passare da chi la chiama.
     */
    it('⛔⛔ differito e cache_control non stanno MAI sullo stesso attrezzo', () => {
        const tools = ['time_now', 'device_torch', 'generate_image'].map(finto)
        const spediti = withTalosAnthropicToolCache(
            talosAttrezziAnthropicAGradi(tools, talosVaDifferito),
        ) as Array<Record<string, unknown>>

        for (const riga of spediti) {
            if (riga.defer_loading === true) expect(riga.cache_control).toBeUndefined()
        }
        // E il taglio esiste comunque: senza, si perde la cache su ogni turno.
        expect(spediti.filter((r) => r.cache_control !== undefined)).toHaveLength(1)
    })

    it('⛔ il taglio della cache cade sull’ultimo NON differito', () => {
        const tools = ['device_torch', 'time_now', 'generate_image'].map(finto)
        const spediti = withTalosAnthropicToolCache(
            talosAttrezziAnthropicAGradi(tools, talosVaDifferito),
        ) as Array<Record<string, unknown>>

        expect(spediti.find((r) => r.cache_control !== undefined)?.name).toBe('time_now')
    })

    /*
     * ⛔⛔ L'INVARIANTE, dove vive davvero: l'ULTIMO non è mai differito.
     *
     * È l'ordinamento di `talosAttrezziAnthropicAGradi` a garantirlo — i
     * differiti prima, i sempre-in-vista in fondo — perché il taglio della
     * cache va sull'ultimo e un differito non può portarlo (400).
     *
     * ⛔ Garantirlo con l'ordine invece che con una ricerca in `promptCache` è
     * una scelta MISURATA: cercare là costava 62 byte al grafo d'avvio, che ha
     * un tetto suo. Questo test è ciò che rende sicura quella scelta.
     */
    it('⛔⛔ l’ULTIMO attrezzo non è mai differito, comunque siano ordinati', () => {
        for (const ordine of [
            ['time_now', 'device_torch', 'generate_image'],
            ['device_torch', 'generate_image', 'time_now'],
            ['generate_image', 'time_now', 'device_torch'],
        ]) {
            const spediti = talosAttrezziAnthropicAGradi(
                ordine.map(finto),
                talosVaDifferito,
            ) as Array<Record<string, unknown>>

            expect(spediti[spediti.length - 1]?.defer_loading).toBeUndefined()
        }
    })
})
