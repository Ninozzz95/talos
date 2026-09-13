import { describe, expect, it, vi } from 'vitest'
import { createTalosToolset } from '@/lib/tools/toolset'

/**
 * ⛔⛔ WEB-SENZA-MOTORE-01 — «chiedo una ricerca web e parte la Deep Research».
 *
 * ## Il difetto, come l'ha visto l'owner
 *
 * «quando chiedo fai una ricerca web il modello si confonde e fa una ricerca
 * Deep». Costa minuti e credito vero, e non era quello che aveva chiesto.
 *
 * ## La causa, MISURATA sul Pad il 2026-08-19
 *
 * Senza motore di ricerca configurato il ponte offriva **64** strumenti e
 * `web_search` non era fra questi; appena l'owner ha messo Tavily sono passati
 * a **67**, con `web_search` e `web_read` in testa all'elenco.
 *
 * In `toolset.ts` la sorgente web è condizionata — `web ? createTalosWebTools(web) : []`
 * — mentre quella delle ricerche non lo è. Da qui l'asimmetria:
 *
 *     senza motore →  web_search    SPARISCE
 *                     research_start RESTA
 *
 * Il modello, a cui è stato chiesto di cercare sul web, trova un solo
 * strumento che cerca: quello che costa minuti. Non è una confusione del
 * modello, è l'unica scelta che gli abbiamo lasciato.
 *
 * ⛔ E la Deep Research senza motore non può nemmeno riuscire: il suo errore
 * dedicato `TALOS_RESEARCH_NO_SEARCH_SOURCE` esiste proprio per questo. Offrire
 * uno strumento che non può funzionare è la definizione di funzione finta.
 *
 * ⇒ Contratto permanente: **ciò che avvia una ricerca vera sparisce insieme al
 * motore**; ciò che legge o gestisce i rapporti già fatti resta, perché è
 * lavoro locale che funziona lo stesso.
 */

const DEPS_BASE = {
    repository: {} as never,
    readVaultFileText: vi.fn(async () => null),
    readVaultFileBytes: vi.fn(async () => null),
    requestConsent: vi.fn(async () => true),
    sessionTitles: vi.fn(async () => new Map<string, string>()),
    libraryEnabled: () => true,
    documents: () => ({}) as never,
    images: () => ({}) as never,
    saveVaultFileToDevice: vi.fn(async () => ({}) as never),
    libraryContextPolicy: {} as never,
}

const TUTTO_ACCESO = new Proxy({}, { get: () => true })

async function nomiOfferti(conMotore: boolean): Promise<string[]> {
    const toolset = await createTalosToolset({
        ...DEPS_BASE,
        web: () => (conMotore ? ({} as never) : null),
        research: () => ({}) as never,
    } as never)
    return toolset.offer(
        { read: 'allow', write: 'allow', outbound: 'allow' },
        TUTTO_ACCESO as never,
    ).map((tool: { name: string }) => tool.name)
}

describe('WEB-SENZA-MOTORE-01 la deep research non sopravvive al motore mancante', () => {
    it('col motore: si può cercare sul web, e la ricerca approfondita c\'è', async () => {
        const nomi = await nomiOfferti(true)
        expect(nomi).toContain('web_search')
        expect(nomi).toContain('research_start')
    })

    it('senza motore: sparisce anche research_start, non solo web_search', async () => {
        const nomi = await nomiOfferti(false)
        expect(nomi).not.toContain('web_search')
        // ⛔ Il cuore del difetto: prima restava, ed era l'unica «ricerca»
        // rimasta in mano al modello.
        expect(nomi).not.toContain('research_start')
    })

    it('senza motore restano le operazioni locali sui rapporti già fatti', async () => {
        const nomi = await nomiOfferti(false)
        expect(nomi).toContain('research_list')
        expect(nomi).toContain('research_read')
        expect(nomi).toContain('research_delete')
    })
})
