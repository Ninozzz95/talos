import { describe, expect, it, vi } from 'vitest'
import {
    canonicalTalosWebSourceUrl,
    createTalosWebSourceArchive,
} from '@/lib/search/webSourceArchive'
import type { TalosSearchResult } from '@/lib/search/searchSources'

const RESULTS: TalosSearchResult[] = [
    {
        url: 'https://www.example.com/alpha#team',
        title: 'Alpha / Luxury',
        snippet: 'Auto, yacht e ville.',
        publishedAt: '2026-07-20',
    },
    {
        url: 'https://example.org/beta',
        title: 'Beta Concierge',
        snippet: 'Jet ed elicotteri.',
        publishedAt: null,
    },
]

describe('the per-answer web-source archive', () => {
    it('WEB-LIB-01 saves one bounded dossier containing every search-only result', async () => {
        const save = vi.fn(async () => ({ id: 'search-dossier' }))
        const archive = createTalosWebSourceArchive({ source: 'tavily', save })

        const report = await archive.rememberSearch('aziende lusso in Italia', RESULTS)

        expect(report).toEqual({
            policy: 'stored',
            saved: 2,
            skipped: 0,
            failed: 0,
        })
        expect(save).toHaveBeenCalledTimes(1)
        expect(save).toHaveBeenCalledWith(expect.objectContaining({
            kind: 'web_source',
            mediaType: 'text/markdown',
            sourceUrl: null,
            sourceLinks: [
                { url: 'https://www.example.com/alpha', title: 'Alpha Luxury' },
                { url: 'https://example.org/beta', title: 'Beta Concierge' },
            ],
            text: expect.stringMatching(/Search-result snapshot[\s\S]*Auto, yacht e ville/),
        }))
        expect(archive.sources()).toEqual([
            {
                url: 'https://www.example.com/alpha',
                title: 'Alpha Luxury',
                site: 'example.com',
                publishedAt: '2026-07-20',
            },
            {
                url: 'https://example.org/beta',
                title: 'Beta Concierge',
                site: 'example.org',
                publishedAt: null,
            },
        ])
    })

    it('WEB-LIB-02 claims duplicate URLs before parallel saves can race', async () => {
        const save = vi.fn(async () => ({ id: crypto.randomUUID() }))
        const archive = createTalosWebSourceArchive({ source: 'tavily', save })

        const [first, second] = await Promise.all([
            archive.rememberSearch('prima query', RESULTS),
            archive.rememberSearch('seconda query', [
                { ...RESULTS[0]!, url: 'https://www.example.com/alpha#prices' },
                {
                    url: 'https://third.example/gamma',
                    title: 'Gamma',
                    snippet: 'Concierge.',
                    publishedAt: null,
                },
            ]),
        ])

        expect(first.saved + second.saved).toBe(3)
        expect(first.skipped + second.skipped).toBe(1)
        expect(archive.sources().map((source) => source.url)).toEqual([
            'https://www.example.com/alpha',
            'https://example.org/beta',
            'https://third.example/gamma',
        ])
        expect(save).toHaveBeenCalledTimes(2)
    })

    it('WEB-LIB-05 never retains Brave API result data without an agreement', async () => {
        const save = vi.fn()
        const archive = createTalosWebSourceArchive({ source: 'brave', save })

        await expect(archive.rememberSearch('x', RESULTS)).resolves.toEqual({
            policy: 'provider_retention_restricted',
            saved: 0,
            skipped: 2,
            failed: 0,
        })
        expect(save).not.toHaveBeenCalled()
        expect(archive.sources()).toEqual([])
    })

    it('keeps web_read separate and saves the full directly fetched page', async () => {
        const save = vi.fn(async () => ({ id: 'page-copy' }))
        const archive = createTalosWebSourceArchive({ source: 'brave', save })

        await archive.rememberPage({
            url: 'https://publisher.example/article',
            title: 'The full article',
            text: 'Full extracted text.',
            siteName: 'Publisher',
            byline: 'Reporter',
            publishedAt: '2026-07-21',
        })

        expect(save).toHaveBeenCalledWith(expect.objectContaining({
            kind: 'web_source',
            sourceUrl: 'https://publisher.example/article',
            sourceLinks: undefined,
            text: expect.stringContaining('Full extracted text.'),
        }))
        expect(archive.sources()).toEqual([
            {
                url: 'https://publisher.example/article',
                title: 'The full article',
                site: 'Publisher',
                publishedAt: '2026-07-21',
            },
        ])
    })

    it('WEB-LIB-08 canonicalizes identity and rejects credentialed or non-web URLs', () => {
        expect(canonicalTalosWebSourceUrl('HTTPS://Example.COM:443/a#one'))
            .toBe('https://example.com/a')
        expect(canonicalTalosWebSourceUrl('https://user:pass@example.com/private')).toBeNull()
        expect(canonicalTalosWebSourceUrl('javascript:alert(1)')).toBeNull()
        expect(canonicalTalosWebSourceUrl('file:///etc/passwd')).toBeNull()
    })

    it('bounds untrusted custom-provider content before it enters encrypted storage', async () => {
        const save = vi.fn(async () => ({ id: 'bounded' }))
        const archive = createTalosWebSourceArchive({ source: 'custom', save })

        await archive.rememberSearch('q'.repeat(2_000), [{
            url: 'https://example.com/large',
            title: `Bad\u202E title ${'t'.repeat(1_000)}`,
            snippet: 's'.repeat(100_000),
            publishedAt: 'd'.repeat(1_000),
        }])

        const input = save.mock.calls[0]![0]
        expect(input.name.length).toBeLessThanOrEqual(100)
        expect(input.name).not.toContain('\u202E')
        expect(input.sourceLinks[0].title.length).toBeLessThanOrEqual(200)
        expect(input.text.length).toBeLessThanOrEqual(32_000)
    })

    it('P2-FILENAME-05 keeps page and search dossier names well formed at their bounds', async () => {
        const save = vi.fn(async () => ({ id: crypto.randomUUID() }))
        const archive = createTalosWebSourceArchive({ source: 'tavily', save })

        await archive.rememberSearch(`${'q'.repeat(59)}😀tail`, RESULTS)
        await archive.rememberPage({
            url: 'https://publisher.example/emoji',
            title: `${'t'.repeat(199)}😀tail`,
            text: 'Full article.',
            siteName: 'Publisher',
            byline: null,
            publishedAt: null,
        })

        expect(save.mock.calls[0]![0].name).toBe(`Web search - ${'q'.repeat(59)}.md`)
        expect(save.mock.calls[1]![0].name).toBe(`${'t'.repeat(199)}.md`)
        expect(save.mock.calls.map(([input]) => input.name).join('')).not.toContain('\ud83d')
    })

    it('P2-FILENAME-09 gives the filename policy the original ZWJ page title', async () => {
        const save = vi.fn(async () => ({ id: 'zwj-page' }))
        const archive = createTalosWebSourceArchive({ source: 'tavily', save })

        await archive.rememberPage({
            url: 'https://publisher.example/family',
            title: 'Family 👨‍👩‍👧‍👦 report',
            text: 'Full article.',
            siteName: 'Publisher',
            byline: null,
            publishedAt: null,
        })

        expect(save.mock.calls[0]![0].name).toBe('Family 👨‍👩‍👧‍👦 report.md')
    })
})
