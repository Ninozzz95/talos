import { readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { createTalosToolset } from '@/lib/tools/toolset'
import { talosToolsForLocalEngine, type TalosToolDefinition } from '@/lib/tools/registry'
import { TALOS_AGENT_TOOL_IDS } from '@/lib/tools/toolControls'
import {
    TALOS_ATTREZZI_SEMPRE_IN_VISTA,
    TALOS_ATTREZZI_SEMPRE_IN_VISTA_LOCALI,
    TALOS_BYTE_PER_TOKEN,
} from '@/lib/tools/aperturaProgressiva'
import {
    talosIstruzioneCatalogo,
    talosIstruzioneCatalogoLocale,
    talosPreVelatiSempreVisibili,
    talosStrumentoCercaAttrezzi,
    talosToolDelCatalogoEseguibile,
} from '@/lib/tools/catalogoCompatto'
import { TALOS_CERCA_ATTREZZI, talosMappaFamiglie } from '@/lib/tools/cercaAttrezzi'

/**
 * ⭐ Punto 4 (owner 01/10/2026) — il profilo dei modelli LOCALI: pochi attrezzi in vista più `tool_search`, al posto
 * dell'indice di 65 righe. I fornitori a chiave restano col catalogo compatto di prima.
 */
const OGNI_TOOL_ACCESO = Object.freeze(
    Object.fromEntries(TALOS_AGENT_TOOL_IDS.map((id) => [id, true])),
) as Record<string, boolean>

let offerti: TalosToolDefinition<never>[] = []
const schemaDi = (tool: TalosToolDefinition<never>) => talosToolsForLocalEngine([tool] as never)[0]

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

describe('profilo locale degli attrezzi', () => {
    it('PL-01 istruzione + attrezzi in vista + tool_search stanno sotto i 1.200 token stimati (erano ~2.460)', () => {
        const istruzione = talosIstruzioneCatalogoLocale(offerti)
        const inVista = offerti.filter((tool) => talosPreVelatiSempreVisibili(offerti, true).includes(tool.name))
        const cerca = talosStrumentoCercaAttrezzi(offerti, schemaDi, vi.fn())
        const caratteri = istruzione.length
            + JSON.stringify(talosToolsForLocalEngine([...inVista, cerca] as never)).length
        expect(Math.round(caratteri / TALOS_BYTE_PER_TOKEN)).toBeLessThan(1_200)
    })

    it('PL-02 l\'istruzione locale non porta l\'indice: porta tool_search e la mappa', () => {
        const istruzione = talosIstruzioneCatalogoLocale(offerti)
        expect(istruzione).not.toMatch(/^device_torch:/m)
        expect(istruzione).toContain(TALOS_CERCA_ATTREZZI)
        expect(istruzione).toContain(talosMappaFamiglie(offerti))
    })

    it('PL-03 in vista: la lista locale per i locali, quella di prima per gli altri', () => {
        expect(talosPreVelatiSempreVisibili(offerti, true))
            .toEqual(TALOS_ATTREZZI_SEMPRE_IN_VISTA_LOCALI.filter((nome) => offerti.some((t) => t.name === nome)))
        expect(talosPreVelatiSempreVisibili(offerti))
            .toEqual(TALOS_ATTREZZI_SEMPRE_IN_VISTA.filter((nome) => offerti.some((t) => t.name === nome)))
    })

    /*
     * PL-07 — banco sul Pad del 02/10: con memory_search e library_search sempre visibili i modelli piccoli li usano al
     * posto dell'attrezzo giusto (note, batteria, «ricordati»). Owner: «Solo ora e web».
     */
    it('PL-07 ai locali restano visibili solo l\'ora e il web', () => {
        expect([...TALOS_ATTREZZI_SEMPRE_IN_VISTA_LOCALI]).toEqual(['time_now', 'web_search'])
    })

    it('PL-04 tool_search è sempre eseguibile, come tool_details', () => {
        expect(talosToolDelCatalogoEseguibile(TALOS_CERCA_ATTREZZI, new Set())).toBe(true)
    })

    it('PL-05 i fornitori a chiave ricevono ancora l\'indice compatto', () => {
        expect(talosIstruzioneCatalogo(offerti)).toMatch(/^device_torch:/m)
    })

    it('PL-06 il controller sceglie il profilo locale solo per provider local', () => {
        const sorgente = readFileSync('src/stores/chatController.ts', 'utf8')
        expect(sorgente).toContain("const profiloLocale = profile?.provider === 'local'")
        expect(sorgente).toContain('catalogo.talosIstruzioneCatalogoLocale(')
        expect(sorgente).toContain('(profiloLocale ? catalogo.talosStrumentoCercaAttrezzi : catalogo.talosStrumentoDettagli)(')
        expect(sorgente).toContain("'Give `query`: what you want to do, in English.'")
        // CA-12: le etichette nella lingua della persona arrivano alla ricerca
        expect(sorgente).toContain('`agentTools.tools.${nome}.title`')
        // tool_search è impianto del catalogo, non una capacità da spegnere (come tool_details)
        expect(sorgente).toMatch(/name === 'tool_details'\s*\|\| name === 'tool_search'/)
    })
})
