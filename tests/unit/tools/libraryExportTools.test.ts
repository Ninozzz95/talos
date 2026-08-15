import { describe, expect, it, vi } from 'vitest'
import {
    createTalosLibraryExportTools,
    talosLibraryExportInstruction,
    type TalosLibraryExportCandidate,
    type TalosLibraryExportSources,
} from '@/lib/tools/libraryExportTools'
import { createTalosToolset } from '@/lib/tools/toolset'
import { executeTalosTool } from '@/lib/tools/executor'
import { TALOS_DEFAULT_AGENT_TOOL_ENABLED } from '@/lib/tools/toolControls'

const CANDIDATES: TalosLibraryExportCandidate[] = [
    {
        id: 'vault-report',
        displayName: 'Quarterly Report.pdf',
        mediaType: 'application/pdf',
    },
    {
        id: 'vault-photo',
        displayName: 'Photo.JPG',
        mediaType: 'image/jpeg',
    },
]

function sources(
    overrides: Partial<TalosLibraryExportSources> = {},
): TalosLibraryExportSources {
    return {
        listCandidates: vi.fn(async () => CANDIDATES),
        exportById: vi.fn(async () => ({
            status: 'saved',
            delivery: 'android-saf',
            bytesWritten: 3,
            displayName: 'Quarterly Report.pdf',
        })),
        ...overrides,
    }
}

describe('library_export tool', () => {
    it('P0-CAP-EXPORT-01 declares read plus write', () => {
        const [tool] = createTalosLibraryExportTools(sources())

        expect(tool.action).toBe('write')
        expect(tool.requiredActions).toEqual(['read', 'write'])
    })

    it('blocks before candidate or decrypted-byte access when read is denied', async () => {
        const deps = sources()
        const [tool] = createTalosLibraryExportTools(deps)

        const result = await executeTalosTool(tool, { reference: 'vault-report' }, {
            permissions: { read: 'deny', write: 'allow', outbound: 'deny' },
            isToolEnabled: () => true,
            requestConsent: vi.fn(async () => true),
            audit: vi.fn(async () => {}),
            context: { sessionId: 'session-1' },
        })

        expect(result).toMatchObject({
            ok: false,
            code: 'TALOS_TOOL_DENIED_BY_POLICY',
        })
        expect(deps.listCandidates).not.toHaveBeenCalled()
        expect(deps.exportById).not.toHaveBeenCalled()
    })

    it('exports by exact Library id and records verified evidence', async () => {
        const deps = sources()
        const [tool] = createTalosLibraryExportTools(deps)

        const result = await tool.run(
            { reference: 'vault-report' },
            { sessionId: 'session-1' },
        )

        expect(deps.exportById).toHaveBeenCalledWith('vault-report')
        expect(result).toMatchObject({
            ok: true,
            evidence: {
                library_file_id: 'vault-report',
                file_name: 'Quarterly Report.pdf',
                bytes: 3,
                delivery: 'android-saf',
            },
        })
        expect(result.content).toMatch(/saved/i)
        expect(result.content).toContain('Quarterly Report.pdf')
    })

    it('resolves a unique case-insensitive exact filename', async () => {
        const deps = sources({
            exportById: vi.fn(async () => ({
                status: 'saved',
                delivery: 'android-saf',
                bytesWritten: 8,
                displayName: 'Photo.JPG',
            })),
        })
        const [tool] = createTalosLibraryExportTools(deps)

        const result = await tool.run(
            { reference: 'photo.jpg' },
            { sessionId: 'session-1' },
        )

        expect(deps.exportById).toHaveBeenCalledWith('vault-photo')
        expect(result.ok).toBe(true)
    })

    it('refuses missing and ambiguous references without exporting bytes', async () => {
        const duplicate = sources({
            listCandidates: vi.fn(async () => [
                ...CANDIDATES,
                {
                    id: 'vault-report-copy',
                    displayName: 'Quarterly Report.pdf',
                    mediaType: 'application/pdf',
                },
            ]),
        })
        const [tool] = createTalosLibraryExportTools(duplicate)

        await expect(tool.run(
            { reference: 'missing.pdf' },
            { sessionId: 'session-1' },
        )).resolves.toMatchObject({
            ok: false,
            code: 'TALOS_LIBRARY_EXPORT_NOT_FOUND',
        })
        await expect(tool.run(
            { reference: 'Quarterly Report.pdf' },
            { sessionId: 'session-1' },
        )).resolves.toMatchObject({
            ok: false,
            code: 'TALOS_LIBRARY_EXPORT_AMBIGUOUS',
        })
        expect(duplicate.exportById).not.toHaveBeenCalled()
    })

    it('reports picker cancellation as a non-success and forbids automatic retry', async () => {
        const deps = sources({
            exportById: vi.fn(async () => ({
                status: 'cancelled',
                delivery: 'android-saf',
            })),
        })
        const [tool] = createTalosLibraryExportTools(deps)

        const result = await tool.run(
            { reference: 'vault-report' },
            { sessionId: 'session-1' },
        )

        expect(result).toMatchObject({
            ok: false,
            code: 'TALOS_FILE_EXPORT_CANCELLED',
        })
        expect(result.content).toContain('No copy was saved')
        expect(result.content).toContain('Do not retry')
    })

    it('distinguishes private Library retention from a user-visible device copy', () => {
        const instruction = talosLibraryExportInstruction()
        expect(instruction).toContain('private Library')
        expect(instruction).toContain('library_export')
        expect(instruction).toContain('never open')
        expect(instruction).toContain('later tool round')
    })
})

describe('library_export toolset boundary', () => {
    const summary = (
        id: string,
        displayName: string,
        metadata: Record<string, unknown>,
    ) => ({
        id,
        display_name: displayName,
        media_type: 'application/pdf',
        size_bytes: 3,
        private_uri: `talos-vault/files/${id}`,
        status: 'available',
        trust: 'untrusted',
        sha256: 'a'.repeat(64),
        failure_code: null,
        metadata,
        created_at: '2026-07-28T00:00:00.000Z',
        updated_at: '2026-07-28T00:00:00.000Z',
        text_preview: '',
    })

    it('hides export when Library context or write policy is off', async () => {
        let enabled = false
        const toolset = await createTalosToolset({
            repository: {
                listVaultFileSummaries: vi.fn(async () => [
                    summary('generated-1', 'generated.pdf', { origin: 'generated' }),
                ]),
            } as never,
            readVaultFileText: vi.fn(async () => null),
            readVaultFileBytes: vi.fn(async () => ({
                bytes: new Uint8Array([1, 2, 3]),
                mediaType: 'application/pdf',
            })),
            saveVaultFileToDevice: vi.fn(async () => ({
                status: 'saved' as const,
                delivery: 'android-saf' as const,
                bytesWritten: 3,
                displayName: 'generated.pdf',
            })),
            libraryAccess: () => (enabled ? 'allow' as const : 'deny' as const),
        })

        expect(toolset.offer({ write: 'allow' }, TALOS_DEFAULT_AGENT_TOOL_ENABLED)
            .some((tool) => tool.name === 'library_export')).toBe(false)
        enabled = true
        expect(toolset.offer({ write: 'deny' }, TALOS_DEFAULT_AGENT_TOOL_ENABLED)
            .some((tool) => tool.name === 'library_export')).toBe(false)
        expect(toolset.offer(
            { read: 'deny', write: 'allow' },
            TALOS_DEFAULT_AGENT_TOOL_ENABLED,
        ).some((tool) => tool.name === 'library_export')).toBe(false)
        expect(toolset.offer({ write: 'allow' }, TALOS_DEFAULT_AGENT_TOOL_ENABLED)
            .some((tool) => tool.name === 'library_export')).toBe(true)
    })

    it('LIB-SHARE-03 excludes withdrawn files of either origin and rechecks before reading', async () => {
        const read = vi.fn(async () => ({
            bytes: new Uint8Array([1, 2, 3]),
            mediaType: 'application/pdf',
        }))
        const save = vi.fn(async () => ({
            status: 'saved' as const,
            delivery: 'android-saf' as const,
            bytesWritten: 3,
            displayName: 'generated.pdf',
        }))
        const repository = {
            listVaultFileSummaries: vi.fn(async () => [
                summary('withdrawn-1', 'private.pdf', {
                    origin: 'uploaded',
                    library_shared: false,
                }),
                summary('generated-withdrawn', 'generated-private.pdf', {
                    origin: 'generated',
                    library_shared: false,
                }),
                summary('generated-1', 'generated.pdf', { origin: 'generated' }),
            ]),
        }
        const toolset = await createTalosToolset({
            repository: repository as never,
            readVaultFileText: vi.fn(async () => null),
            readVaultFileBytes: read,
            saveVaultFileToDevice: save,
            libraryEnabled: () => true,
        })
        const tool = toolset.offer({ write: 'allow' }, TALOS_DEFAULT_AGENT_TOOL_ENABLED)
            .find((candidate) => candidate.name === 'library_export')!

        await expect(tool.run(
            { reference: 'private.pdf' },
            { sessionId: 'session-1' },
        )).resolves.toMatchObject({
            ok: false,
            code: 'TALOS_LIBRARY_EXPORT_NOT_FOUND',
        })
        expect(read).not.toHaveBeenCalled()

        await expect(tool.run(
            { reference: 'generated-withdrawn' },
            { sessionId: 'session-1' },
        )).resolves.toMatchObject({
            ok: false,
            code: 'TALOS_LIBRARY_EXPORT_NOT_FOUND',
        })
        expect(read).not.toHaveBeenCalled()
        expect(save).not.toHaveBeenCalled()

        await expect(tool.run(
            { reference: 'generated-1' },
            { sessionId: 'session-1' },
        )).resolves.toMatchObject({ ok: true })
        expect(repository.listVaultFileSummaries).toHaveBeenCalledTimes(4)
        expect(read).toHaveBeenCalledWith('generated-1')
        expect(save).toHaveBeenCalledWith({
            displayName: 'generated.pdf',
            mediaType: 'application/pdf',
            bytes: new Uint8Array([1, 2, 3]),
        })
    })
})
