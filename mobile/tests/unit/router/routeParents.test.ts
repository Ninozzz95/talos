import { describe, expect, it } from 'vitest'
import { TALOS_MOBILE_ROUTES, talosMobileParentRoute } from '@/lib/mobileRoutes'

/**
 * Where "up" goes from a page inside a station.
 *
 * This exists because System Back had only two ideas — "station" and "not the
 * chat" — and every research sub-page matched the first one, so Back from a
 * report threw the person out to the chat with the main menu open. The relation
 * is now declared beside each path; these hold it to it.
 */
describe('the parent of a page inside a station', () => {
    it('walks the research pages up one level at a time', () => {
        expect(talosMobileParentRoute('research-report', { id: 'run-1' }))
            .toEqual({ name: 'research', params: {} })
        expect(talosMobileParentRoute('research-new'))
            .toEqual({ name: 'research', params: {} })
        expect(talosMobileParentRoute('research-claim', { id: 'run-1', index: '2' }))
            .toEqual({ name: 'research-report', params: { id: 'run-1' } })
        expect(talosMobileParentRoute('research-source', { id: 'run-1', index: '2' }))
            .toEqual({ name: 'research-report', params: { id: 'run-1' } })
    })

    it('hands the parent only the parameters the parent declares', () => {
        // A claim knows `index`; a report never declared one. Passing it on is
        // how a route quietly starts matching something it was not written for.
        const parent = talosMobileParentRoute('research-claim', { id: 'run-1', index: '2' })
        expect(parent?.params).not.toHaveProperty('index')
    })

    it('is null for a station top and for the chat', () => {
        // Not an oversight: a station top has an older answer of its own —
        // owner 2026-07-24, Back there reopens the main menu it was launched
        // from — and this must not shadow it.
        expect(talosMobileParentRoute('research')).toBeNull()
        expect(talosMobileParentRoute('chat')).toBeNull()
        expect(talosMobileParentRoute('settings')).toBeNull()
        expect(talosMobileParentRoute('nonexistent-route')).toBeNull()
    })

    it('refuses a parent whose parameter it cannot supply', () => {
        // Reachable: a malformed link, or a route matched with a missing param.
        // Falling through to the station rules is recoverable; pushing
        // "/research/undefined" is a page that will never load.
        expect(talosMobileParentRoute('research-claim', { index: '2' })).toBeNull()
        expect(talosMobileParentRoute('research-claim', { id: '', index: '2' })).toBeNull()
    })

    /**
     * The guard. A nested path with no declared parent is precisely the shape of
     * the bug this fixed, so a future route cannot be born silent about it.
     */
    it('leaves no nested route without a parent', () => {
        const orphans = TALOS_MOBILE_ROUTES
            .filter((route) => route.path.split('/').filter(Boolean).length > 1)
            .filter((route) => !route.parent)
            .map((route) => route.name)

        expect(orphans).toEqual([])
    })

    it('names a parent that exists and is not itself', () => {
        for (const route of TALOS_MOBILE_ROUTES) {
            if (!route.parent) continue
            expect(route.parent).not.toBe(route.name)
            expect(TALOS_MOBILE_ROUTES.some((entry) => entry.name === route.parent)).toBe(true)
        }
    })

    it('has no cycle: every page reaches a top in finite steps', () => {
        for (const route of TALOS_MOBILE_ROUTES) {
            let at: string | null = route.name
            let steps = 0
            while (at) {
                const next: string | null = talosMobileParentRoute(at, { id: 'x', index: '0' })?.name ?? null
                at = next
                steps += 1
                expect(steps).toBeLessThanOrEqual(TALOS_MOBILE_ROUTES.length)
            }
        }
    })
})
