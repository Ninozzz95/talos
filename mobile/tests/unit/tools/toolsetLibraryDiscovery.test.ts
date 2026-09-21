import { describe, expect, it, vi } from 'vitest'
import { createMemoryChatRepository } from '@/repositories/memoryChatRepository'
import type {
    TalosChatRepository,
    TalosVaultFileStatus,
} from '@/repositories/chatRepository'
import { createTalosToolset } from '@/lib/tools/toolset'
import {
    executeTalosTool,
    TALOS_DEFAULT_TOOL_PERMISSIONS,
} from '@/lib/tools/executor'
import { TALOS_DEFAULT_AGENT_TOOL_ENABLED } from '@/lib/tools/toolControls'

async function storeFile(
    repository: TalosChatRepository,
    input: {
        id: string
        name: string
        text: string | null
        status?: TalosVaultFileStatus
        metadata: Record<string, unknown>
        createdAt: string
    },
): Promise<void> {
    await repository.createVaultFile({
        id: input.id,
        display_name: input.name,
        media_type: input.name.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg',
        size_bytes: input.text?.length ?? 3,
        private_uri: `talos-vault/files/${input.id}`,
        status: input.status ?? 'available',
        trust: 'untrusted',
        sha256: null,
        extracted_text: input.text,
        failure_code: input.status === 'failed' ? 'fixture-failure' : null,
        metadata: input.metadata,
        created_at: input.createdAt,
    })
}

function offeredTool(
    toolset: Awaited<ReturnType<typeof createTalosToolset>>,
    name: string,
) {
    const tool = toolset.offer(
        TALOS_DEFAULT_TOOL_PERMISSIONS,
        TALOS_DEFAULT_AGENT_TOOL_ENABLED,
    )
        .find((candidate) => candidate.name === name)
    if (!tool) throw new Error(`missing tool ${name}`)
    return tool
}

function executionDeps() {
    return {
        // Questo test esercita il CORPO dello strumento, non il cancello: i
        // permessi vanno detti, non ereditati da un predefinito che dal
        // 2026-08-01 chiede.
        permissions: { read: 'allow' as const, write: 'allow' as const, outbound: 'allow' as const },
        isToolEnabled: () => true,
        requestConsent: vi.fn(async () => {
            throw new Error('read tools must not ask for consent')
        }),
        audit: vi.fn(async () => {}),
        context: { sessionId: 'search-session' },
    }
}

describe('toolset Library discovery boundary', () => {
    it('AGENT-TOOLS-04 omits a disabled tool while preserving enabled siblings', async () => {
        const repository = createMemoryChatRepository()
        await repository.initialize()
        const toolset = await createTalosToolset({
            repository,
            readVaultFileText: vi.fn(async () => null),
            libraryEnabled: () => true,
        })

        const names = toolset.offer(
            TALOS_DEFAULT_TOOL_PERMISSIONS,
            { ...TALOS_DEFAULT_AGENT_TOOL_ENABLED, library_search: false },
        ).map((tool) => tool.name)

        expect(names).toContain('library_list')
        expect(names).not.toContain('library_search')
    })

    it('P1-LIB-DEEP-01 lists from summaries but searches complete text past character 600', async () => {
        const repository = createMemoryChatRepository()
        await repository.initialize()
        await storeFile(repository, {
            id: 'deep-transcript',
            name: 'meeting-transcript.md',
            text: `${'ordinary preface '.repeat(50)}TALOS_DEEP_MARKER_742`,
            metadata: { origin: 'generated', origin_session_id: 'meeting-chat' },
            createdAt: '2026-07-28T15:00:00.000Z',
        })
        const listFull = vi.spyOn(repository, 'listVaultFiles')
        const listSummaries = vi.spyOn(repository, 'listVaultFileSummaries')
        const fullText = `${'ordinary preface '.repeat(50)}TALOS_DEEP_MARKER_742`
        const readVaultFileText = vi.fn(async (id: string) => (
            id === 'deep-transcript' ? fullText : null
        ))
        const toolset = await createTalosToolset({
            repository,
            readVaultFileText,
            libraryEnabled: () => true,
            sessionTitles: async () => new Map([['meeting-chat', 'Planning meeting']]),
        })

        const listed = await executeTalosTool(
            offeredTool(toolset, 'library_list'),
            { origin: 'all', file_type: 'all', page_size: 20 },
            executionDeps(),
        )
        expect(listed.ok).toBe(true)
        expect(listed.content).toContain('deep-transcript')
        expect(listed.content).not.toContain('TALOS_DEEP_MARKER_742')
        expect(listSummaries).toHaveBeenCalledTimes(1)
        expect(listFull).not.toHaveBeenCalled()

        const searched = await executeTalosTool(
            offeredTool(toolset, 'library_search'),
            { query: 'TALOS_DEEP_MARKER_742', limit: 5 },
            executionDeps(),
        )
        expect(searched.ok).toBe(true)
        expect(searched.content).toContain('deep-transcript')
        expect(listFull).toHaveBeenCalledTimes(1)

        const read = await executeTalosTool(
            offeredTool(toolset, 'library_read'),
            { id: 'deep-transcript' },
            executionDeps(),
        )
        expect(read.ok).toBe(true)
        expect(read.content).toContain('TALOS_DEEP_MARKER_742')
        expect(readVaultFileText).toHaveBeenCalledWith('deep-transcript')
    })

    it('LIB-FILTER-PARITY-04 lists a web source as a link even when its MIME looks like an image', async () => {
        const repository = createMemoryChatRepository()
        await repository.initialize()
        await storeFile(repository, {
            id: 'source-with-image-mime',
            name: 'retained-source.md',
            text: 'Source: https://example.com/evidence',
            metadata: {
                origin: 'generated',
                origin_session_id: 'research-chat',
                kind: 'web_source',
                source_url: 'https://example.com/evidence',
            },
            createdAt: '2026-07-29T05:00:00.000Z',
        })
        const toolset = await createTalosToolset({
            repository,
            readVaultFileText: vi.fn(async () => null),
            libraryEnabled: () => true,
        })

        const listed = await executeTalosTool(
            offeredTool(toolset, 'library_list'),
            { origin: 'all', file_type: 'all', page_size: 20 },
            executionDeps(),
        )

        expect(listed.ok).toBe(true)
        expect(listed.content).toContain('id: source-with-image-mime')
        expect(listed.content).toContain('type: link')
        expect(listed.content).not.toMatch(/^type: image$/m)
    })

    it('P1-CTX-COMPAT-06 keeps shared generated documents tool-discoverable while excluding withdrawn and unavailable rows', async () => {
        const repository = createMemoryChatRepository()
        await repository.initialize()
        await storeFile(repository, {
            id: 'uploaded-photo',
            name: 'IMG_20260728.jpg',
            text: null,
            metadata: { origin: 'uploaded', origin_session_id: 'photos-chat' },
            createdAt: '2026-07-28T14:00:00.000Z',
        })
        await storeFile(repository, {
            id: 'generated-ds4',
            name: 'ds4-inference-engine-antirez.pdf',
            text: 'DwarfStar 4 is an inference engine by Salvatore Sanfilippo.',
            metadata: { origin: 'generated', origin_session_id: 'research-chat' },
            createdAt: '2026-07-28T14:30:00.000Z',
        })
        await storeFile(repository, {
            id: 'generated-withdrawn',
            name: 'ds4-private.pdf',
            text: 'This row was explicitly withdrawn.',
            metadata: {
                origin: 'generated',
                origin_session_id: 'private-chat',
                library_shared: false,
            },
            createdAt: '2026-07-28T14:31:00.000Z',
        })
        await storeFile(repository, {
            id: 'generated-failed',
            name: 'ds4-failed.pdf',
            text: 'This extraction failed.',
            status: 'failed',
            metadata: { origin: 'generated', origin_session_id: 'failed-chat' },
            createdAt: '2026-07-28T14:32:00.000Z',
        })

        const readVaultFileText = vi.fn(async (id: string) => (
            id === 'generated-ds4'
                ? 'DwarfStar 4 is an inference engine by Salvatore Sanfilippo.'
                : null
        ))
        const toolset = await createTalosToolset({
            repository,
            readVaultFileText,
            libraryEnabled: () => true,
            sessionTitles: async () => new Map([
                ['photos-chat', 'Photos'],
                ['research-chat', 'Inference research'],
                ['private-chat', 'Private'],
                ['failed-chat', 'Failed'],
            ]),
        })

        const search = await executeTalosTool(
            offeredTool(toolset, 'library_search'),
            { query: 'ds4 inference engine antirez', limit: 10 },
            executionDeps(),
        )
        expect(search.ok).toBe(true)
        expect(search.content).toContain('generated-ds4')
        expect(search.content).toContain('ds4-inference-engine-antirez.pdf')
        expect(search.content).toContain('origin: generated')
        expect(search.content).not.toContain('uploaded-photo')
        expect(search.content).not.toContain('generated-withdrawn')
        expect(search.content).not.toContain('generated-failed')

        const read = await executeTalosTool(
            offeredTool(toolset, 'library_read'),
            { id: 'generated-ds4' },
            executionDeps(),
        )
        expect(read.ok).toBe(true)
        expect(read.content).toContain('DwarfStar 4 is an inference engine')
        expect(readVaultFileText).toHaveBeenCalledWith('generated-ds4')

        const withdrawn = await executeTalosTool(
            offeredTool(toolset, 'library_read'),
            { id: 'generated-withdrawn' },
            executionDeps(),
        )
        expect(withdrawn.ok).toBe(false)
        expect(readVaultFileText).not.toHaveBeenCalledWith('generated-withdrawn')
    })
})
