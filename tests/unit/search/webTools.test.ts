import { describe, expect, it, vi } from 'vitest'
import {
    talosWebFailureCode, createTalosWebTools } from '@/lib/search/webTools'
import { TALOS_DEFAULT_TOOL_PERMISSIONS, executeTalosTool } from '@/lib/tools/executor'
import { createTalosToolset } from '@/lib/tools/toolset'
import { TALOS_DEFAULT_AGENT_TOOL_ENABLED } from '@/lib/tools/toolControls'

/**
 * F1 — `web_search` and `web_read`, driven through the real executor because
 * that is the path the model takes, and it is where the permission gate, the
 * audit row and the untrusted boundary live.
 */
function sources(overrides: Record<string, unknown> = {}) {
    return {
        search: vi.fn(async () => [
            {
                url: 'https://example.org/a',
                title: 'Fattura elettronica 2026',
                snippet: 'Le regole cambiano…',
                publishedAt: '2026-03-04',
            },
            { url: 'https://example.org/b', title: 'Senza data', snippet: '…', publishedAt: null },
        ]),
        read: vi.fn(async () => ({
            url: 'https://example.org/a',
            title: 'Fattura elettronica 2026',
            text: 'Il totale dovuto è di 2196 euro.',
            byline: 'Redazione',
            siteName: 'Example',
            publishedAt: '2026-03-04',
        })),
        rememberSearch: vi.fn(async (_query, results: unknown[]) => ({
            policy: 'stored' as const,
            saved: results.length,
            skipped: 0,
            failed: 0,
        })),
        remember: vi.fn(async () => {}),
        ...overrides,
    }
}

function deps(overrides: Record<string, unknown> = {}) {
    return {
        permissions: {
            ...TALOS_DEFAULT_TOOL_PERMISSIONS,
            write: 'allow' as const,
            outbound: 'allow' as const,
        },
        isToolEnabled: () => true,
        requestConsent: vi.fn(async () => { throw new Error('an allowed outbound tool must never ask') }),
        audit: vi.fn(async () => {}),
        context: { sessionId: 'session-1' },
        ...overrides,
    }
}

function byName(tools: ReturnType<typeof createTalosWebTools>, name: string) {
    const tool = tools.find((entry) => entry.name === name)
    if (!tool) throw new Error(`missing tool ${name}`)
    return tool
}

describe('web tools', () => {
    it('P0-WEB-01 classifies both network tools as outbound plus write', () => {
        const tools = createTalosWebTools(sources())
        expect(tools.map((tool) => tool.name)).toEqual(['web_search', 'web_read'])
        expect(tools.every((tool) => tool.action === 'outbound')).toBe(true)
        expect(tools.every((tool) => (
            JSON.stringify(tool.requiredActions) === JSON.stringify(['outbound', 'write'])
        ))).toBe(true)
    })

    it.each(['web_search', 'web_read'] as const)(
        'WEB-OUTBOUND-02/03 denies %s before its network source when read is allowed',
        async (name) => {
            const source = sources()
            const tool = byName(createTalosWebTools(source), name)
            const result = await executeTalosTool(
                tool,
                name === 'web_search' ? { query: 'private words' } : { url: 'https://example.org/a' },
                deps({
                    permissions: { read: 'allow', write: 'ask', outbound: 'deny' },
                }),
            )

            expect(result.ok).toBe(false)
            expect(result.code).toBe('TALOS_TOOL_DENIED_BY_POLICY')
            expect(source.search).not.toHaveBeenCalled()
            expect(source.read).not.toHaveBeenCalled()
        },
    )

    it('WEB-OUTBOUND-04 asks before any query leaves the device', async () => {
        const source = sources()
        const requestConsent = vi.fn(async () => false)
        const result = await executeTalosTool(
            byName(createTalosWebTools(source), 'web_search'),
            { query: 'private words' },
            deps({
                permissions: { read: 'allow', write: 'ask', outbound: 'ask' },
                requestConsent,
            }),
        )

        expect(requestConsent).toHaveBeenCalledTimes(1)
        expect(result.ok).toBe(false)
        expect(source.search).not.toHaveBeenCalled()
    })

    it('WEB-OUTBOUND-05 does not advertise denied web schemas', async () => {
        const toolset = await createTalosToolset({
            repository: {} as never,
            readVaultFileText: vi.fn(async () => null),
            web: () => sources(),
        })

        const denied = toolset.offer(
            { read: 'allow', write: 'ask', outbound: 'deny' },
            TALOS_DEFAULT_AGENT_TOOL_ENABLED,
        )
        const allowed = toolset.offer(
            { read: 'allow', write: 'ask', outbound: 'allow' },
            TALOS_DEFAULT_AGENT_TOOL_ENABLED,
        )
        expect(denied.map((tool) => tool.name)).not.toEqual(expect.arrayContaining(['web_search', 'web_read']))
        expect(allowed.map((tool) => tool.name)).toEqual(expect.arrayContaining(['web_search', 'web_read']))
    })

    it('P0-WEB-02 does not advertise web schemas when persistent writes are denied', async () => {
        const toolset = await createTalosToolset({
            repository: {} as never,
            readVaultFileText: vi.fn(async () => null),
            web: () => sources(),
        })

        const denied = toolset.offer(
            { read: 'allow', write: 'deny', outbound: 'allow' },
            TALOS_DEFAULT_AGENT_TOOL_ENABLED,
        )
        expect(denied.map((tool) => tool.name))
            .not.toEqual(expect.arrayContaining(['web_search', 'web_read']))
    })

    it.each(['web_search', 'web_read'] as const)(
        'P0-WEB-03 denies %s before network and persistence when write is denied',
        async (name) => {
            const source = sources()
            const result = await executeTalosTool(
                byName(createTalosWebTools(source), name),
                name === 'web_search'
                    ? { query: 'private acquisition' }
                    : { url: 'https://example.org/a' },
                deps({
                    permissions: { read: 'allow', write: 'deny', outbound: 'allow' },
                }),
            )

            expect(result).toMatchObject({
                ok: false,
                code: 'TALOS_TOOL_DENIED_BY_POLICY',
            })
            expect(source.search).not.toHaveBeenCalled()
            expect(source.read).not.toHaveBeenCalled()
            expect(source.rememberSearch).not.toHaveBeenCalled()
            expect(source.remember).not.toHaveBeenCalled()
        },
    )

    it('search returns urls the model can then read, and states the date it has', async () => {
        const tools = createTalosWebTools(sources())
        const result = await executeTalosTool(byName(tools, 'web_search'), '{"query":"fattura"}', deps())
        expect(result.ok).toBe(true)
        expect(result.content).toContain('https://example.org/a')
        expect(result.content).toContain('2026-03-04')
    })

    it('WEB-LIB-01 archives non-empty search results before reporting success', async () => {
        const rememberSearch = vi.fn(async (_query, results: unknown[]) => ({
            policy: 'stored' as const,
            saved: results.length,
            skipped: 0,
            failed: 0,
        }))
        const tools = createTalosWebTools(sources({ rememberSearch }))

        const result = await executeTalosTool(
            byName(tools, 'web_search'),
            { query: 'aziende lusso in Italia' },
            deps(),
        )

        expect(rememberSearch).toHaveBeenCalledWith(
            'aziende lusso in Italia',
            expect.arrayContaining([expect.objectContaining({ url: 'https://example.org/a' })]),
        )
        expect(result.content).toMatch(/2 source links saved to the Library/i)
    })

    it('WEB-LIB-04 exposes an archive failure without discarding valid search results', async () => {
        const tools = createTalosWebTools(sources({
            rememberSearch: vi.fn(async () => { throw new Error('SQLCipher unavailable') }),
        }))

        const result = await executeTalosTool(
            byName(tools, 'web_search'),
            { query: 'aziende lusso' },
            deps(),
        )

        expect(result.ok).toBe(true)
        expect(result.content).toContain('https://example.org/a')
        expect(result.content).toMatch(/could not be saved to the Library/i)
        expect(result.content).not.toContain('SQLCipher unavailable')
    })

    it('WEB-LIB-05 tells the model to web_read under a retention-restricted provider', async () => {
        const tools = createTalosWebTools(sources({
            rememberSearch: vi.fn(async (_query, results: unknown[]) => ({
                policy: 'provider_retention_restricted' as const,
                saved: 0,
                skipped: results.length,
                failed: 0,
            })),
        }))

        const result = await executeTalosTool(
            byName(tools, 'web_search'),
            { query: 'aziende lusso' },
            deps(),
        )

        expect(result.ok).toBe(true)
        expect(result.content).toMatch(/provider.*retention/i)
        expect(result.content).toMatch(/web_read/i)
    })

    it('says "date unknown" out loud instead of leaving a silent gap (D7)', async () => {
        const tools = createTalosWebTools(sources())
        const result = await executeTalosTool(byName(tools, 'web_search'), '{"query":"fattura"}', deps())
        // A missing date the model cannot see is a missing date the model will
        // fill in. Saying it explicitly is what stops old news reading as new.
        expect(result.content).toMatch(/date unknown/i)
    })

    it('read returns the article text with its provenance', async () => {
        const tools = createTalosWebTools(sources())
        const result = await executeTalosTool(byName(tools, 'web_read'), { url: 'https://example.org/a' }, deps())
        expect(result.ok).toBe(true)
        expect(result.content).toContain('2196 euro')
        expect(result.content).toContain('Example')
    })

    it('every page read is remembered as a source for the dossier (D5)', async () => {
        const remember = vi.fn(async () => {})
        const tools = createTalosWebTools(sources({ remember }))
        await executeTalosTool(byName(tools, 'web_read'), { url: 'https://example.org/a' }, deps())
        expect(remember).toHaveBeenCalledWith(expect.objectContaining({
            url: 'https://example.org/a',
            title: 'Fattura elettronica 2026',
        }))
    })

    it('WEB-LIB-04 makes a full-page save failure visible without losing the page', async () => {
        const tools = createTalosWebTools(sources({
            remember: vi.fn(async () => { throw new Error('storage down') }),
        }))
        const result = await executeTalosTool(
            byName(tools, 'web_read'),
            { url: 'https://example.org/a' },
            deps(),
        )
        expect(result.ok).toBe(true)
        expect(result.content).toContain('2196 euro')
        expect(result.content).toMatch(/could not be saved to the Library/i)
        expect(result.content).not.toContain('storage down')
    })

    it('refuses a url that is not http(s), instead of handing it to the fetcher', async () => {
        const read = vi.fn()
        const tools = createTalosWebTools(sources({ read }))
        const result = await executeTalosTool(
            byName(tools, 'web_read'), { url: 'file:///etc/passwd' }, deps(),
        )
        expect(result.ok).toBe(false)
        expect(read).not.toHaveBeenCalled()
    })

    it('a page with no readable article says so, rather than inventing content', async () => {
        const tools = createTalosWebTools(sources({ read: vi.fn(async () => null) }))
        const result = await executeTalosTool(
            byName(tools, 'web_read'), { url: 'https://example.org/app' }, deps(),
        )
        expect(result.ok).toBe(false)
        expect(result.content).toMatch(/could not be read|no readable/i)
    })

    it('being offline is reported as being offline, not as an empty web (D8)', async () => {
        const tools = createTalosWebTools(sources({
            search: vi.fn(async () => { throw new Error('TALOS_NETWORK_UNAVAILABLE') }),
        }))
        const result = await executeTalosTool(byName(tools, 'web_search'), '{"query":"x"}', deps())
        expect(result.ok).toBe(false)
        expect(result.content).toMatch(/no network|offline/i)
        // The model must be able to say "I would look this up if I had a
        // connection" — an empty result set would make it say "I found nothing".
        expect(result.content).not.toMatch(/no results/i)
    })

    it('a search that genuinely finds nothing is DIFFERENT from a failure', async () => {
        const rememberSearch = vi.fn()
        const tools = createTalosWebTools(sources({
            search: vi.fn(async () => []),
            rememberSearch,
        }))
        const result = await executeTalosTool(byName(tools, 'web_search'), '{"query":"x"}', deps())
        expect(result.ok).toBe(true)
        expect(result.content).toMatch(/no results/i)
        expect(rememberSearch).not.toHaveBeenCalled()
    })
})


/**
 * ⛔⛔ IL CODICE di un guasto del web, dal testo che arriva DAVVERO.
 *
 * La prima versione della cura cercava i codici TALOS_* dentro il messaggio, e
 * sul Pad non ha mai scattato: sotto il nostro client c'è Android, e i suoi
 * guasti arrivano nella sua lingua. Le righe qui sotto sono state MISURATE
 * sul dispositivo, non immaginate.
 */
describe('classificare un guasto del web', () => {
    it('⛔ il messaggio ANDROID misurato sul Pad diventa un codice', () => {
        // Copiato dallo schermo, 2026-08-20, leggendo un dominio inesistente.
        const vero = 'The page could not be read: Unable to resolve host "dominio-inesistente-77123.example": No address associated with hostname'
        expect(talosWebFailureCode(new Error(vero))).toBe('TALOS_WEB_ADDRESS_NOT_FOUND')
    })

    it('i nostri rifiuti si riconoscono per nome, interi', () => {
        expect(talosWebFailureCode(new Error('java.io.IOException: TALOS_WEB_REDIRECT_DOWNGRADE')))
            .toBe('TALOS_WEB_REDIRECT_DOWNGRADE')
    })

    it('⛔ e AL CONTRARIO: un messaggio che non riconosciamo NON inventa un codice', () => {
        // Un codice indovinato manda la persona a cercare la causa sbagliata,
        // ed è peggio del silenzio.
        expect(talosWebFailureCode(new Error('qualcosa di mai visto'))).toBeNull()
        expect(talosWebFailureCode(null)).toBeNull()
        expect(talosWebFailureCode(undefined)).toBeNull()
    })
})
