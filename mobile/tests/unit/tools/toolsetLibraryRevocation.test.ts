import { describe, expect, it, vi } from 'vitest'
import { createTalosToolset } from '@/lib/tools/toolset'
import {
    executeTalosTool,
    TALOS_DEFAULT_TOOL_PERMISSIONS,
} from '@/lib/tools/executor'
import { TALOS_DEFAULT_AGENT_TOOL_ENABLED } from '@/lib/tools/toolControls'

function summary(
    id = 'vault-private',
    mediaType = 'text/markdown',
) {
    return {
        id,
        display_name: mediaType.startsWith('image/') ? 'private.png' : 'private.md',
        media_type: mediaType,
        size_bytes: 3,
        private_uri: `talos-vault/files/${id}`,
        status: 'available',
        trust: 'untrusted',
        sha256: 'a'.repeat(64),
        failure_code: null,
        metadata: { origin: 'uploaded' },
        created_at: '2026-07-29T09:00:00.000Z',
        updated_at: '2026-07-29T09:00:00.000Z',
        text_preview: 'PRIVATE_REVOKED_PAYLOAD',
    }
}

function executionDeps() {
    return {
        permissions: TALOS_DEFAULT_TOOL_PERMISSIONS,
        isToolEnabled: () => true,
        requestConsent: vi.fn(async () => true),
        audit: vi.fn(async () => {}),
        context: { sessionId: 'revocation-session' },
    }
}

function offered(
    toolset: Awaited<ReturnType<typeof createTalosToolset>>,
    name: string,
) {
    const tool = toolset.offer(
        TALOS_DEFAULT_TOOL_PERMISSIONS,
        TALOS_DEFAULT_AGENT_TOOL_ENABLED,
    ).find((candidate) => candidate.name === name)
    if (!tool) throw new Error(`missing offered tool ${name}`)
    return tool
}

describe('live Library revocation', () => {
    it('P1-CTX-AGENT-06 offers only the dedicated policy tool while the Library master is off', async () => {
        const toolset = await createTalosToolset({
            repository: {
                listVaultFileSummaries: vi.fn(async () => [summary()]),
            } as never,
            readVaultFileText: vi.fn(async () => 'PRIVATE_REVOKED_PAYLOAD'),
            libraryEnabled: () => false,
            libraryContextPolicy: {
                read: vi.fn(async () => ({
                    scope: 'global' as const,
                    session_id: null,
                    revision: 0,
                    enabled: false,
                    mode: 'broad_compat_v1' as const,
                    included_file_ids: [],
                    excluded_file_ids: [],
                })),
                replace: vi.fn(),
            },
        })
        const enabled = {
            ...TALOS_DEFAULT_AGENT_TOOL_ENABLED,
            library_context_policy_update: true,
        }

        expect(toolset.offer(
            TALOS_DEFAULT_TOOL_PERMISSIONS,
            enabled,
        ).map((tool) => tool.name).filter((name) => name.startsWith('library_')))
            .toEqual(['library_context_policy_update'])
    })

    it('LIB-REVOKE-01 a throwing global policy source hides every Library tool', async () => {
        const toolset = await createTalosToolset({
            repository: {
                listVaultFileSummaries: vi.fn(async () => [summary()]),
            } as never,
            readVaultFileText: vi.fn(async () => 'PRIVATE_REVOKED_PAYLOAD'),
            libraryEnabled: () => {
                throw new Error('settings unavailable')
            },
        })

        expect(() => toolset.offer(
            TALOS_DEFAULT_TOOL_PERMISSIONS,
            TALOS_DEFAULT_AGENT_TOOL_ENABLED,
        )).not.toThrow()
        expect(toolset.offer(
            TALOS_DEFAULT_TOOL_PERMISSIONS,
            TALOS_DEFAULT_AGENT_TOOL_ENABLED,
        ).map((tool) => tool.name).filter((name) => name.startsWith('library_')))
            .toEqual([])
    })

    it('LIB-REVOKE-02 discards summaries when access is withdrawn during metadata read', async () => {
        let enabled = true
        const listVaultFileSummaries = vi.fn(async () => {
            enabled = false
            return [summary()]
        })
        const toolset = await createTalosToolset({
            repository: { listVaultFileSummaries } as never,
            readVaultFileText: vi.fn(async () => 'PRIVATE_REVOKED_PAYLOAD'),
            libraryEnabled: () => enabled,
        })
        const tool = offered(toolset, 'library_list')

        const result = await executeTalosTool(
            tool,
            { origin: 'all', file_type: 'all', page_size: 20 },
            executionDeps(),
        )

        expect(listVaultFileSummaries).toHaveBeenCalledOnce()
        expect(result).toMatchObject({ ok: false, code: 'TALOS_LIBRARY_DISABLED' })
        expect(result.content).not.toContain('PRIVATE_REVOKED_PAYLOAD')
    })

    it('LIB-REVOKE-03 discards image bytes when access is withdrawn during Vault read', async () => {
        let enabled = true
        const readVaultFileBytes = vi.fn(async () => {
            enabled = false
            return {
                bytes: new Uint8Array([1, 2, 3]),
                mediaType: 'image/png',
            }
        })
        const toolset = await createTalosToolset({
            repository: {
                listVaultFileSummaries: vi.fn(async () => [summary('vault-image', 'image/png')]),
            } as never,
            readVaultFileText: vi.fn(async () => null),
            readVaultFileBytes,
            libraryEnabled: () => enabled,
        })
        const tool = offered(toolset, 'library_read')

        const result = await executeTalosTool(
            tool,
            { id: 'vault-image' },
            executionDeps(),
        )

        expect(readVaultFileBytes).toHaveBeenCalledWith('vault-image')
        expect(result).toMatchObject({ ok: false, code: 'TALOS_LIBRARY_DISABLED' })
        expect(result.images).toBeUndefined()
    })

    it('LIB-REVOKE-04 never starts Save-As when access is withdrawn during export byte read', async () => {
        let enabled = true
        const readVaultFileBytes = vi.fn(async () => {
            enabled = false
            return {
                bytes: new Uint8Array([1, 2, 3]),
                mediaType: 'application/pdf',
            }
        })
        const saveVaultFileToDevice = vi.fn(async () => ({
            status: 'saved' as const,
            delivery: 'android-saf' as const,
            bytesWritten: 3,
            displayName: 'private.md',
        }))
        const toolset = await createTalosToolset({
            repository: {
                listVaultFileSummaries: vi.fn(async () => [summary()]),
            } as never,
            readVaultFileText: vi.fn(async () => 'PRIVATE_REVOKED_PAYLOAD'),
            readVaultFileBytes,
            saveVaultFileToDevice,
            libraryEnabled: () => enabled,
        })
        const tool = offered(toolset, 'library_export')

        const result = await executeTalosTool(
            tool,
            { reference: 'vault-private' },
            {
                ...executionDeps(),
                permissions: { read: 'allow', write: 'allow', outbound: 'deny' },
            },
        )

        expect(readVaultFileBytes).toHaveBeenCalledWith('vault-private')
        expect(saveVaultFileToDevice).not.toHaveBeenCalled()
        expect(result).toMatchObject({ ok: false, code: 'TALOS_LIBRARY_DISABLED' })
    })
})
