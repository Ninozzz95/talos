/**
 * FORGE-DESCR-01..02 — owner 28/10/2026, rapporto «Diagnostica test tool TALOS» generato sul dispositivo: `tool_create` rifiutato con
 * «$.inputSchema.properties.text: Invalid input (FORGE_MANIFEST_STRUCTURE)». Causa: `tool_create` ACCETTA (e chiede) una `description`
 * per ogni campo d'ingresso (`forgeCreateTool.ts:84-89`), ma il validatore del manifest (`jsonSchemaSubsetSchema`,
 * `manifestZodSchema.ts:126`) è rigido e non la conosce. `description` è una parola di JSON Schema: il manifest la deve accettare.
 */
import { describe, expect, it } from 'vitest'
import { validateTalosLocalTool } from '@/lib/tools/dynamic/validator'
import type { TalosLocalToolManifestV1 } from '@/lib/tools/dynamic/contracts'

function manifestCon(inputSchema: unknown): TalosLocalToolManifestV1 {
    return {
        schema: 'talos.local-tool.v1', id: 'salva_nota_breve', version: 1, title: 'Salva una nota breve',
        description: 'Salva il testo in una nota', createdAt: new Date().toISOString(), parentVersion: null,
        execution: 'declarative-flow', installScope: 'device',
        network: { mode: 'forbidden', domains: [] }, credentialRequirements: [],
        inputSchema: inputSchema as TalosLocalToolManifestV1['inputSchema'],
        flow: {
            entry: 'fine', maxTransitions: 4,
            nodes: [{ id: 'fine', type: 'return', value: { $ref: '$.input.text' } }],
        },
    }
}

describe('FORGE-DESCR il campo descritto di tool_create passa il validatore del manifest', () => {
    it('FORGE-DESCR-01 un campo con «description», come lo scrive tool_create, è valido', () => {
        const esito = validateTalosLocalTool(manifestCon({
            type: 'object', properties: { text: { type: 'string', description: 'Il testo da salvare' } }, required: ['text'],
        }))
        const errori = esito.diagnostics.filter((d) => d.level === 'error')
        expect(errori).toEqual([])
    })

    it('FORGE-DESCR-02 AL CONTRARIO: una parola sconosciuta resta un errore (lo schema non diventa permissivo)', () => {
        const esito = validateTalosLocalTool(manifestCon({
            type: 'object', properties: { text: { type: 'string', formatoInventato: true } },
        }))
        expect(esito.diagnostics.some((d) => d.level === 'error' && d.code === 'FORGE_MANIFEST_STRUCTURE')).toBe(true)
    })
})
