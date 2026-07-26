import { describe, expect, it, vi } from 'vitest'
import { createTalosWebTools } from '@/lib/search/webTools'
import { TALOS_DEFAULT_TOOL_PERMISSIONS, executeTalosTool } from '@/lib/tools/executor'

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
        remember: vi.fn(async () => {}),
        ...overrides,
    }
}

function deps() {
    return {
        permissions: TALOS_DEFAULT_TOOL_PERMISSIONS,
        requestConsent: vi.fn(async () => { throw new Error('a read tool must never ask') }),
        audit: vi.fn(async () => {}),
        context: { sessionId: 'session-1' },
    }
}

function byName(tools: ReturnType<typeof createTalosWebTools>, name: string) {
    const tool = tools.find((entry) => entry.name === name)
    if (!tool) throw new Error(`missing tool ${name}`)
    return tool
}

describe('web tools', () => {
    it('both are READS: searching and reading cannot damage anything', () => {
        const tools = createTalosWebTools(sources())
        expect(tools.map((tool) => tool.name)).toEqual(['web_search', 'web_read'])
        expect(tools.every((tool) => tool.action === 'read')).toBe(true)
    })

    it('search returns urls the model can then read, and states the date it has', async () => {
        const tools = createTalosWebTools(sources())
        const result = await executeTalosTool(byName(tools, 'web_search'), '{"query":"fattura"}', deps())
        expect(result.ok).toBe(true)
        expect(result.content).toContain('https://example.org/a')
        expect(result.content).toContain('2026-03-04')
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
        const tools = createTalosWebTools(sources({ search: vi.fn(async () => []) }))
        const result = await executeTalosTool(byName(tools, 'web_search'), '{"query":"x"}', deps())
        expect(result.ok).toBe(true)
        expect(result.content).toMatch(/no results/i)
    })
})
