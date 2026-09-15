import { describe, expect, it, vi } from 'vitest'
import { createTalosToolset } from '@/lib/tools/toolset'
import { TALOS_DEFAULT_AGENT_TOOL_ENABLED } from '@/lib/tools/toolControls'

/**
 * `describe` — quello che serve sapere di un tool per metterlo in un piano.
 *
 * ⛔ Le tre risposte devono venire dalle STESSE fonti che decidono davvero:
 * l'interruttore del tool, i tre stati del permesso, il catalogo di sicurezza.
 * Una regola parallela qui vorrebbe dire un piano che mostra come approvabile
 * un passo poi rifiutato — cioe' una promessa che il codice non mantiene.
 */

async function toolset() {
    return createTalosToolset({
        repository: {} as never,
        readVaultFileText: vi.fn(async () => null),
        libraryAccess: () => 'allow',
    } as never)
}

describe('toolset.describe', () => {
    it('un nome che non esiste risponde null, e chi chiede sara prudente', async () => {
        const suite = await toolset()
        expect(suite.describe('non_esiste', {}, TALOS_DEFAULT_AGENT_TOOL_ENABLED)).toBeNull()
    })

    it('⛔ `asks` segue i TRE STATI, non una regola sua', async () => {
        const suite = await toolset()

        const chiedendo = suite.describe(
            'library_read',
            { read: 'ask', write: 'ask', outbound: 'ask' },
            TALOS_DEFAULT_AGENT_TOOL_ENABLED,
        )
        expect(chiedendo?.asks).toBe(true)

        const consentendo = suite.describe(
            'library_read',
            { read: 'allow', write: 'allow', outbound: 'allow' },
            TALOS_DEFAULT_AGENT_TOOL_ENABLED,
        )
        // Chi ha detto «consenti sempre» ha detto «non chiedermelo»: il piano
        // non deve contraddirlo.
        expect(consentendo?.asks).toBe(false)
    })

    it('`allowed` guarda ENTRAMBE le porte: permesso e interruttore', async () => {
        const suite = await toolset()

        expect(suite.describe(
            'library_read',
            { read: 'deny', write: 'allow', outbound: 'allow' },
            TALOS_DEFAULT_AGENT_TOOL_ENABLED,
        )?.allowed).toBe(false)

        expect(suite.describe(
            'library_read',
            { read: 'allow', write: 'allow', outbound: 'allow' },
            { ...TALOS_DEFAULT_AGENT_TOOL_ENABLED, library_read: false },
        )?.allowed).toBe(false)

        expect(suite.describe(
            'library_read',
            { read: 'allow', write: 'allow', outbound: 'allow' },
            TALOS_DEFAULT_AGENT_TOOL_ENABLED,
        )?.allowed).toBe(true)
    })

    it('la sicurezza viene dal catalogo, e un tool sconosciuto non risulta innocuo', async () => {
        const suite = await toolset()
        const letto = suite.describe(
            'library_read',
            { read: 'allow' },
            TALOS_DEFAULT_AGENT_TOOL_ENABLED,
        )
        expect(letto?.security.risk).toMatch(/^R[0-4]$/)
        expect(letto?.security.readsPrivateData).toBe(true)
    })
})
