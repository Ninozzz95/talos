import { describe, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'
import {
    createTalosReadTools,
} from '@/lib/tools/readTools'
import { createTalosWebTools } from '@/lib/search/webTools'
import { createTalosDocumentTools } from '@/lib/documents/documentTools'
import { createTalosImageTools } from '@/lib/images/imageTools'
import { createTalosLibraryExportTools } from '@/lib/tools/libraryExportTools'
import { createTalosLibraryContextPolicyTools } from '@/lib/tools/libraryContextPolicyTools'
import {
    talosToolRequiredActions,
    talosToolsForAnthropic,
    talosToolsForGemini,
    talosToolsForOpenAi,
} from '@/lib/tools/registry'
import {
    TALOS_DEFAULT_AGENT_TOOL_ENABLED,
    isTalosAgentToolId,
    isTalosAgentToolEnabled,
    parseTalosAgentToolEnabled,
} from '@/lib/tools/toolControls'
import { TALOS_AGENT_TOOL_CONTROLS } from '@/lib/tools/toolControlCatalog'

function everyExecutableTool() {
    return [
        ...createTalosReadTools({
            listLibraryEntries: vi.fn(async () => []),
            listLibraryDocs: vi.fn(async () => []),
            readLibraryDoc: vi.fn(async () => null),
            listNotes: vi.fn(async () => []),
            listTasks: vi.fn(async () => []),
            searchMemories: vi.fn(async () => []),
            now: () => '2026-07-28T00:00:00.000Z',
        }),
        ...createTalosWebTools({
            search: vi.fn(async () => []),
            read: vi.fn(async () => null),
            rememberSearch: vi.fn(async () => ({
                policy: 'stored' as const,
                saved: 0,
                skipped: 0,
                failed: 0,
            })),
            remember: vi.fn(async () => {}),
        }),
        ...createTalosDocumentTools({
            generate: vi.fn(),
            verify: vi.fn(),
            save: vi.fn(),
            diagnostics: () => false,
        } as never),
        ...createTalosImageTools({
            provider: vi.fn(() => 'gemini'),
            generate: vi.fn(),
            save: vi.fn(),
        }),
        ...createTalosLibraryExportTools({
            listCandidates: vi.fn(async () => []),
            exportById: vi.fn(),
        } as never),
        ...createTalosLibraryContextPolicyTools({
            read: vi.fn(),
            replace: vi.fn(),
        } as never),
    ]
}

describe('Agent Tools control registry', () => {
    it('AGENT-TOOLS-01 exactly matches every executable factory and action set', () => {
        const executable = everyExecutableTool()
        const ids = TALOS_AGENT_TOOL_CONTROLS.map((control) => control.id)

        expect(new Set(ids).size).toBe(ids.length)
        expect(ids).toEqual(executable.map((tool) => tool.name))
        for (const tool of executable) {
            const control = TALOS_AGENT_TOOL_CONTROLS.find((entry) => entry.id === tool.name)
            expect(control?.actions, tool.name).toEqual(talosToolRequiredActions(tool))
            expect(isTalosAgentToolId(tool.name), tool.name).toBe(true)
            if (isTalosAgentToolId(tool.name)) {
                expect(typeof TALOS_DEFAULT_AGENT_TOOL_ENABLED[tool.name], tool.name).toBe('boolean')
            }
        }
    })

    it('AGENT-TOOLS-02 preserves current flows, sanitizes values, and fails unknown tools closed', () => {
        expect(TALOS_DEFAULT_AGENT_TOOL_ENABLED.library_context_policy_update).toBe(false)
        expect(Object.entries(TALOS_DEFAULT_AGENT_TOOL_ENABLED)
            .filter(([id]) => id !== 'library_context_policy_update')
            .every(([, value]) => value)).toBe(true)

        const parsed = parseTalosAgentToolEnabled({
            library_search: false,
            web_search: 'yes',
            future_shell: true,
        })

        expect(parsed.library_search).toBe(false)
        expect(parsed.web_search).toBe(true)
        expect(parsed).not.toHaveProperty('future_shell')
        expect(parsed.library_context_policy_update).toBe(false)
        expect(Object.keys(parsed)).toHaveLength(14)
        expect(isTalosAgentToolEnabled('library_search', parsed)).toBe(false)
        expect(isTalosAgentToolEnabled('future_shell', parsed)).toBe(false)
    })

    it('P1-CTX-COMPAT-09 keeps every pre-existing public tool contract byte-compatible', () => {
        const tools = everyExecutableTool()
            .filter((tool) => tool.name !== 'library_context_policy_update')
        /**
         * Pinned per surface rather than as one hash over all four.
         *
         * A single digest made every provider dialect share one number, so
         * repairing the schema for ONE provider forced an update to a value
         * that also stood for the other three — and the reviewer of that commit
         * could not tell from the diff whether Anthropic had moved too. Which
         * is precisely what happened on 2026-07-30: Gemini refused
         * `enum: [1]` (its enum is string-only), the fix changed the Gemini
         * dialect alone, and the combined hash could not say so.
         *
         * Split, the guard answers the question it exists to answer.
         */
        const digestOf = (value: unknown): string =>
            createHash('sha256').update(JSON.stringify(value)).digest('hex')

        const controlPlane = tools.map((tool) => ({
            name: tool.name,
            title: tool.title,
            actions: talosToolRequiredActions(tool),
        }))

        /**
         * Re-pinned 2026-07-31 for ONE addition: `library_file_origin`.
         *
         * Proven, not assumed. Excluding the new tool reproduced all four
         * previous digests byte for byte, so nothing about the pre-existing
         * contracts moved — which is the only question this guard exists to
         * answer, and the reason the four are pinned separately.
         */
        expect(digestOf(controlPlane))
            .toBe('e6fc45a4d31527e4a0ef668d2be76c0368fff7c63514b67677ceabfab5141ce3')
        expect(digestOf(talosToolsForAnthropic(tools as never)))
            .toBe('ea66cad2d68cd38a1f63e1d9f4cdfe9e1df3715c949047976c1b8bb98121908e')
        expect(digestOf(talosToolsForOpenAi(tools as never)))
            .toBe('45411ccdbb0ce19497c534e9644de27d7c5307f7c47a6b45f1127c7cfc2af3b1')
        expect(digestOf(talosToolsForGemini(tools as never)))
            .toBe('e4d1b8f4dd8d7237c2f7414ed98b01b144a2e3f2cfce3d5c7d038a64bcc2e872')
    })
})
