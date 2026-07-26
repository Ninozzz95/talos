import { describe, expect, it, vi } from 'vitest'
import {
    TALOS_TOOL_ICONS,
    TALOS_TOOL_LABELS,
    talosToolIconName,
    talosToolActivityDetail,
    talosToolActivityLabel,
} from '@/lib/tools/toolLabels'
import { createTalosReadTools } from '@/lib/tools/readTools'
import { createTalosWebTools } from '@/lib/search/webTools'
import { createTalosDocumentTools } from '@/lib/documents/documentTools'

/**
 * Owner testing 2026-07-26, the first real run of the web tools: the chat showed
 * four identical rows reading `web_read...` — the wire name, repeated, with no
 * hint of which page. Two failures at once: the label map still only knew the
 * original six tools, and the activity carried no detail at all.
 *
 * The first test is the one that matters. It fails when a tool is ADDED without
 * a label, rather than when somebody happens to look at the screen — which is
 * how this shipped in the first place.
 */
function everyToolName(): string[] {
    const read = createTalosReadTools({
        listLibraryDocs: vi.fn(async () => []),
        readLibraryDoc: vi.fn(async () => null),
        listNotes: vi.fn(async () => []),
        listTasks: vi.fn(async () => []),
        searchMemories: vi.fn(async () => []),
        now: () => '2026-07-26T00:00:00.000Z',
    })
    const web = createTalosWebTools({
        search: vi.fn(async () => []),
        read: vi.fn(async () => null),
        remember: vi.fn(async () => {}),
    })
    // The DOCUMENT tools were missing from this list, which made the guards
    // above vacuous for exactly the tool whose icon was wrong. A guard that does
    // not cover the case that failed is not a guard.
    const documents = createTalosDocumentTools({
        generate: vi.fn(),
        verify: vi.fn(),
        save: vi.fn(),
        diagnostics: () => false,
    } as never)
    return [...read, ...web, ...documents].map((tool) => tool.name)
}

describe('tool activity labels', () => {
    it('EVERY tool the app can run has a human label', () => {
        const missing = everyToolName().filter((name) => !(name in TALOS_TOOL_LABELS))
        expect(missing, `no label for: ${missing.join(', ')}`).toEqual([])
    })

    it('EVERY tool has its OWN icon', () => {
        // Owner 2026-07-26: making a document showed the web-search globe,
        // because the view hardcoded one icon for every row. A tool wearing
        // another tool's mark is worse than a generic one — it says something
        // false about what is happening.
        const missing = everyToolName().filter((name) => !(name in TALOS_TOOL_ICONS))
        expect(missing, `no icon for: ${missing.join(', ')}`).toEqual([])
    })

    it('two different tools never share the web mark by accident', () => {
        expect(talosToolIconName('document_create')).toBe('document')
        expect(talosToolIconName('web_search')).toBe('web')
        expect(talosToolIconName('document_create')).not.toBe(talosToolIconName('web_search'))
    })

    it('an unknown tool gets the generic mark, not the last one used', () => {
        expect(talosToolIconName('future_tool')).toBe('tool')
    })

    it('an unknown tool falls back to its name, not to nothing', () => {
        // A mystery row is worse than a technical one.
        expect(talosToolActivityLabel({ name: 'future_tool', detail: null })).toBe('future_tool')
    })

    it('says WHICH page is being read, which is the whole point', () => {
        expect(talosToolActivityLabel({
            name: 'web_read',
            detail: talosToolActivityDetail('web_read', '{"url":"https://www.agenziaentrate.gov.it/portale/x"}'),
        })).toBe('Reading a web page: agenziaentrate.gov.it')
    })

    it('says WHAT is being searched', () => {
        expect(talosToolActivityLabel({
            name: 'web_search',
            detail: talosToolActivityDetail('web_search', '{"query":"fatturazione elettronica 2026"}'),
        })).toBe('Searching the web: fatturazione elettronica 2026')
    })

    it('keeps the detail short — this sits on screen while the model works', () => {
        const detail = talosToolActivityDetail('web_search', JSON.stringify({ query: 'x'.repeat(200) }))
        expect(detail!.length).toBeLessThanOrEqual(50)
        expect(detail).toMatch(/…$/)
    })

    it('never spills the whole argument object onto the screen', () => {
        // It would be noise, and for a document read it could show more of the
        // content than the row intends.
        const detail = talosToolActivityDetail('library_read', '{"id":"vault-1","secret":"do-not-show"}')
        expect(detail).not.toContain('do-not-show')
    })

    it('survives arguments that are not valid JSON', () => {
        expect(talosToolActivityDetail('web_read', '{ broken')).toBeNull()
        expect(talosToolActivityLabel({ name: 'web_read', detail: null })).toBe('Reading a web page')
    })

    it('falls back to the raw value when a url cannot be parsed', () => {
        expect(talosToolActivityDetail('web_read', '{"url":"not a url"}')).toBe('not a url')
    })
})
