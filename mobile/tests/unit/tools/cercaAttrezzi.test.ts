import { beforeAll, describe, expect, it, vi } from 'vitest'
import { createTalosToolset } from '@/lib/tools/toolset'
import { talosToolsForLocalEngine, type TalosToolDefinition } from '@/lib/tools/registry'
import { TALOS_AGENT_TOOL_IDS } from '@/lib/tools/toolControls'
import { TALOS_IT_MESSAGES } from '@/i18n/locales/it'
import {
    TALOS_CERCA_ATTREZZI,
    TALOS_CERCA_MAX_CARATTERI,
    talosCercaNelCatalogo,
    talosFamigliaDi,
    talosMappaFamiglie,
    talosStrumentoCercaAttrezzi,
} from '@/lib/tools/cercaAttrezzi'

/**
 * ⭐ Punto 4 (owner 01/10/2026: «Pochi + cerca», «Parole + mappa», MiniSearch 7.2.0).
 *
 * Al modello locale arrivava un indice di 65 righe (~2.008 token, l'88% del prompt con gli schemi sempre visibili).
 * Al suo posto un attrezzo che cerca: il modello scrive cosa gli serve e riceve i 5 attrezzi più adatti con lo
 * schema. Le prove usano gli attrezzi VERI offerti oggi, con lo stesso allestimento di `pesoDegliSchemi.test.ts`:
 * una ricerca provata su attrezzi finti proverebbe la ricerca, non la scelta che il modello dovrà fare.
 */
const OGNI_TOOL_ACCESO = Object.freeze(
    Object.fromEntries(TALOS_AGENT_TOOL_IDS.map((id) => [id, true])),
) as Record<string, boolean>

let offerti: TalosToolDefinition<never>[] = []

beforeAll(async () => {
    const toolset = await createTalosToolset({
        repository: {} as never,
        readVaultFileText: vi.fn(async () => null),
        readVaultFileBytes: vi.fn(async () => null),
        requestConsent: vi.fn(async () => true),
        sessionTitles: vi.fn(async () => new Map<string, string>()),
        libraryEnabled: () => true,
        libraryAccess: () => 'allow',
        memoryWriteAccess: () => 'allow',
        memoryWrite: () => ({}) as never,
        device: () => ({}) as never,
        privileged: () => ({}) as never,
        notifications: () => ({}) as never,
        libraryWrite: () => ({}) as never,
        notesWrite: () => ({}) as never,
        tasksWrite: () => ({}) as never,
        web: () => ({}) as never,
        research: () => ({}) as never,
        documents: () => ({}) as never,
        images: () => ({}) as never,
        saveVaultFileToDevice: vi.fn(async () => ({}) as never),
        libraryContextPolicy: {} as never,
    })
    offerti = toolset.offer(
        { read: 'allow', write: 'allow', outbound: 'allow' },
        OGNI_TOOL_ACCESO as never,
    ) as TalosToolDefinition<never>[]
})

const schemaDi = (tool: TalosToolDefinition<never>) => talosToolsForLocalEngine([tool] as never)[0]

describe('cerca attrezzi — la scelta', () => {
    it('CA-01 «turn on the torch» mette device_torch per primo', () => {
        expect(talosCercaNelCatalogo(offerti, 'turn on the torch')[0]).toBe('device_torch')
    })

    it('CA-02 «note» trova la famiglia delle note (prefisso: note → notes)', () => {
        const trovati = talosCercaNelCatalogo(offerti, 'save a note')
        expect(trovati).toContain('notes_create')
    })

    it('CA-03 un errore di battitura («batery level») trova device_status', () => {
        expect(talosCercaNelCatalogo(offerti, 'batery level')).toContain('device_status')
    })

    it('CA-04 non restituisce mai più di 5 attrezzi', () => {
        expect(talosCercaNelCatalogo(offerti, 'list read search create delete update').length).toBeLessThanOrEqual(5)
    })

    it('CA-09 le frasi del banco trovano l\'attrezzo atteso fra i primi 5', () => {
        const casi: Array<[string, string]> = [
            ['add a task to my to-do list', 'tasks_create'],
            ['what appointments do I have tomorrow in my calendar', 'calendar_read'],
            ['search the web for the weather', 'web_search'],
            ['remember my favourite colour', 'memory_write'],
            ['read my latest notifications', 'device_notifications_list'],
            ['what did I write in my notes', 'notes_list'],
            // «check» vale anche «search» (CA-13): non deve portare la batteria verso una ricerca
            ['check battery level', 'device_status'],
            ['check my calendar for tomorrow', 'calendar_read'],
        ]
        for (const [query, atteso] of casi) {
            expect({ query, trovati: talosCercaNelCatalogo(offerti, query) })
                .toEqual({ query, trovati: expect.arrayContaining([atteso]) })
        }
    })
})

describe('cerca attrezzi — l\'attrezzo che vede il modello', () => {
    it('CA-05 svela i trovati, che restano chiamabili', async () => {
        const svela = vi.fn()
        const tool = talosStrumentoCercaAttrezzi(offerti, schemaDi, svela)
        expect(tool.name).toBe(TALOS_CERCA_ATTREZZI)
        const esito = await tool.run({ query: 'turn on the torch' }, {} as never)
        expect(esito.ok).toBe(true)
        expect(svela).toHaveBeenCalledWith(expect.arrayContaining(['device_torch']))
        expect(svela.mock.calls[0]![0].length).toBeLessThanOrEqual(5)
    })

    it('CA-06 nessun risultato: l\'elenco dei soli nomi, non un errore', async () => {
        const svela = vi.fn()
        const tool = talosStrumentoCercaAttrezzi(offerti, schemaDi, svela)
        const esito = await tool.run({ query: 'zzqx' }, {} as never)
        expect(esito.ok).toBe(true)
        expect(svela).not.toHaveBeenCalled()
        expect(esito.content).toContain('device_torch')
        expect(esito.content).toContain('notes_create')
    })

    it('CA-07 dice in fondo che sono SOLO schemi e che nulla è stato eseguito', async () => {
        const tool = talosStrumentoCercaAttrezzi(offerti, schemaDi, vi.fn())
        const esito = await tool.run({ query: 'turn on the torch' }, {} as never)
        const fine = esito.content.slice(-400)
        expect(fine).toMatch(/SCHEMAS ONLY/)
        expect(fine).toMatch(/Nothing has been executed/)
    })

    it('CA-08 la mappa nomina una volta ogni famiglia offerta, in una riga', () => {
        const mappa = talosMappaFamiglie(offerti)
        expect(mappa.split('\n')).toHaveLength(1)
        const famiglie = new Set(offerti.map((tool) => talosFamigliaDi(tool.name)))
        for (const famiglia of famiglie) expect(mappa).toContain(famiglia)
        expect(talosFamigliaDi('device_notifications_list')).toBe('notifications')
        expect(talosFamigliaDi('device_torch')).toBe('phone')
        expect(talosFamigliaDi('notes_create')).toBe('notes')
    })

    /*
     * CA-11 — regressione misurata sul Pad il 01/10 sera (Spark-X2.5-4B, «aggiungi alle mie attività»): la ricerca ha
     * restituito 5 schemi interi, fra cui attrezzi da 5-7 KB, e il prompt è salito a 10.714 token contro un tetto di
     * 4.608. Owner: «3 schemi e tetto di peso». Il primo passa sempre intero (senza schema non si chiama); gli altri
     * solo se il totale resta sotto il tetto, altrimenti sono nominati e si possono cercare per nome.
     */
    it('CA-11 al massimo 3 schemi entro il tetto di peso; gli altri trovati sono solo nominati', async () => {
        const svela = vi.fn()
        const tool = talosStrumentoCercaAttrezzi(offerti, schemaDi, svela)
        for (const query of ['create a document report', 'create a new tool', 'add a task', 'generate an image']) {
            svela.mockClear()
            const esito = await tool.run({ query }, {} as never)
            const schemi = JSON.parse(esito.content.slice(0, esito.content.indexOf('\n\n'))) as unknown[]
            expect(schemi.length).toBeLessThanOrEqual(3)
            const pesoAltri = schemi.slice(1).reduce((somma: number, s) => somma + JSON.stringify(s).length, 0)
            expect({ query, entro: JSON.stringify(schemi[0]).length + pesoAltri <= TALOS_CERCA_MAX_CARATTERI || pesoAltri === 0 })
                .toEqual({ query, entro: true })
            expect(svela.mock.calls[0]![0]).toHaveLength(schemi.length)
        }
        const esito = await tool.run({ query: 'create a document report' }, {} as never)
        expect(esito.content).toMatch(/Also matching, ask for them by name: /)
    })

    /*
     * CA-12 — misurato sul Pad il 02/10 (Qwen3-4B, banco «dopo»): il modello ha cercato «accendi la torcia» IN ITALIANO
     * nonostante l'istruzione chiedesse l'inglese, la ricerca conosceva solo nomi e descrizioni inglesi, e ha risposto
     * «non ho trovato alcuno strumento». Owner: «titoli nella lingua dell'app» — gli stessi della scheda di permesso
     * (`agentTools.tools.<nome>`), indicizzati accanto all'inglese.
     */
    it('CA-12 con i titoli nella lingua dell\'app le frasi del banco in italiano trovano l\'attrezzo', () => {
        const voci = TALOS_IT_MESSAGES.agentTools.tools as Record<string, { title?: string, description?: string }>
        const etichette = (nome: string) => [voci[nome]?.title, voci[nome]?.description].filter(Boolean).join(' ')
        const casi: Array<[string, string]> = [
            ['accendi la torcia', 'device_torch'],
            ['salvami una nota', 'notes_create'],
            ['aggiungi alle mie attività', 'tasks_create'],
            ['che appuntamenti ho domani', 'calendar_read'],
            ['quanta batteria mi resta', 'device_status'],
            ['ricordati il mio colore preferito', 'memory_write'],
            ['leggimi le ultime notifiche', 'device_notifications_list'],
        ]
        for (const [query, atteso] of casi) {
            expect({ query, trovati: talosCercaNelCatalogo(offerti, query, 3, etichette) })
                .toEqual({ query, trovati: expect.arrayContaining([atteso]) })
        }
    })

    /*
     * CA-13 — banco sul Pad del 02/10 (Qwen3-4B, «solo ora e web»): «nella mia libreria trovi un pdf sulle tasse?» →
     * la ricerca metteva per primo library_file_origin, il modello lo chiamava con un id inventato. Cercare un file è
     * library_search: deve venire prima.
     */
    it('CA-13 cercare un file nella libreria mette library_search per primo', () => {
        const voci = TALOS_IT_MESSAGES.agentTools.tools as Record<string, { title?: string, description?: string }>
        const etichette = (nome: string) => [voci[nome]?.title, voci[nome]?.description].filter(Boolean).join(' ')
        for (const query of [
            'nella mia libreria trovi un pdf sulle tasse', 'cerca un pdf sulle tasse nella libreria',
            'find a pdf about taxes in my library', 'search library pdf taxes',
            // le domande vere di Qwen3-4B sul Pad (02/10, registro «tool_search: …»)
            'find pdf on taxes in library', 'check if there is a PDF on taxes in the library',
        ]) {
            expect({ query, primo: talosCercaNelCatalogo(offerti, query, 3, etichette)[0] })
                .toEqual({ query, primo: 'library_search' })
        }
    })

    it('CA-10 la descrizione porta la mappa e chiede la ricerca in inglese', () => {
        const tool = talosStrumentoCercaAttrezzi(offerti, schemaDi, vi.fn())
        expect(tool.description).toContain(talosMappaFamiglie(offerti))
        expect(tool.description).toMatch(/in English/)
    })
})
