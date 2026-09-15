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
        // Questo test esercita il CORPO dello strumento, non il cancello: i
        // permessi vanno detti, non ereditati da un predefinito che dal
        // 2026-08-01 chiede.
        permissions: { read: 'allow' as const, write: 'allow' as const, outbound: 'allow' as const },
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
    it('P1-CTX-AGENT-06 offers only the dedicated policy tool when the Library is DENIED', async () => {
        /**
         * Owner 2026-08-03: l'accesso alla Libreria ha ora la stessa grammatica
         * di ogni altra autorizzazione — consenti / chiedi / nega.
         *
         * Il caso qui e' **nega**, e la regola vale: su nega i tool non vengono
         * nemmeno offerti, cosi' il modello non promette una ricerca che non
         * fara'. Prima sparivano anche su «chiedi», e da li' veniva il difetto
         * che l'owner ha fotografato: «posso solo CREARE documenti nella tua
         * Libreria, non navigarla».
         */
        const toolset = await createTalosToolset({
            repository: {
                listVaultFileSummaries: vi.fn(async () => [summary()]),
            } as never,
            readVaultFileText: vi.fn(async () => 'PRIVATE_REVOKED_PAYLOAD'),
            libraryAccess: () => 'deny' as const,
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
            libraryAccess: () => (enabled ? 'allow' as const : 'deny' as const),
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
            libraryAccess: () => (enabled ? 'allow' as const : 'deny' as const),
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
            libraryAccess: () => (enabled ? 'allow' as const : 'deny' as const),
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

describe('la Libreria ha la stessa grammatica di ogni altra autorizzazione', () => {
    /**
     * Owner 2026-08-03, con uno screenshot: «che cosa ho nella libreria» →
     * «non ho uno strumento per elencare il contenuto della tua Libreria,
     * posso solo CREARE documenti al suo interno».
     *
     * La causa: i tool `library_*` erano legati a `library_context_enabled`,
     * che vuol dire «attaccami la Libreria a OGNI messaggio» ed e' spento di
     * serie per scelta. Chi non voleva l'iniezione automatica perdeva anche il
     * modo di CHIEDERE.
     *
     * Owner: «facciamo come nelle altre autorizzazioni — consenti sempre,
     * chiedi ogni volta (default, col popup che cambia QUESTA setting), nega
     * (cioe' non chiede)».
     */
    it('su CHIEDI i tool ci sono: e il cartellino a decidere, non il silenzio', async () => {
        const toolset = await createTalosToolset({
            ...executionDeps(),
            libraryAccess: () => 'ask' as const,
        })
        const offerti = toolset
            .offer(TALOS_DEFAULT_TOOL_PERMISSIONS, TALOS_DEFAULT_AGENT_TOOL_ENABLED)
            .map((tool) => tool.name)
        expect(offerti).toContain('library_list')
        expect(offerti).toContain('library_search')
    })

    it('su NEGA spariscono, cosi il modello non promette cio che non fara', () => {
        // Stessa regola dei tool web: «assente qui vuol dire assente per il
        // modello». Offrire e poi rifiutare sarebbe peggio, perche' il modello
        // annuncerebbe una ricerca e poi fallirebbe.
        return createTalosToolset({ ...executionDeps(), libraryAccess: () => 'deny' as const })
            .then((toolset) => {
                const offerti = toolset
                    .offer(TALOS_DEFAULT_TOOL_PERMISSIONS, TALOS_DEFAULT_AGENT_TOOL_ENABLED)
                    .map((tool) => tool.name)
                expect(offerti).not.toContain('library_list')
                expect(offerti).not.toContain('library_search')
            })
    })

    it('il booleano vecchio spento diventa CHIEDI, non nega', () => {
        // Chi aveva spento l'interruttore aveva detto «non attaccarmela a ogni
        // messaggio», non «mai guardarla». Trattarlo come `deny` toglierebbe a
        // un utente esistente una capacita' che non ha mai rifiutato.
        return createTalosToolset({ ...executionDeps(), libraryEnabled: () => false })
            .then((toolset) => {
                const offerti = toolset
                    .offer(TALOS_DEFAULT_TOOL_PERMISSIONS, TALOS_DEFAULT_AGENT_TOOL_ENABLED)
                    .map((tool) => tool.name)
                expect(offerti).toContain('library_list')
            })
    })
})
