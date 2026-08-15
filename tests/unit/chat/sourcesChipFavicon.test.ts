// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import TalosMobileSourcesChip from '@/components/chat/TalosMobileSourcesChip.vue'

/**
 * Owner 2026-07-30: "stampandola anche nelle fonti che adesso mostrano solo
 * placeholder lettera" — the chip shows the sites' own favicons.
 *
 * The original objection to favicons here was never aesthetic: a favicon
 * fetched when a chat is OPENED is a request to every site that chat cites,
 * every time, which breaks the one promise web search makes — that only the
 * query leaves the device. Save-time capture is what removes the objection, so
 * the chip READS cards and never asks for one. That is the assertion below that
 * matters most: a future "let's be consistent with the Library" refactor that
 * turns the backfill on here would break a privacy promise silently, and this
 * test is what stops it.
 */
const backfill = vi.fn(async () => ({ attempted: [], settled: 0, deferred: 0, cancelled: false }))
const readImage = vi.fn(async (url: string) => (
    url === 'https://carded.example/a' ? new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }) : null
))

vi.mock('@/services/sourceCardService', () => ({
    readTalosSourceCardImage: (url: string) => readImage(url),
    backfillTalosSourceCards: (urls: readonly string[]) => backfill(urls as never),
}))

const SOURCES = [
    { url: 'https://carded.example/a', title: 'With a card', site: 'carded.example' },
    { url: 'https://bare.example/b', title: 'Without one', site: 'bare.example' },
]

function mountChip() {
    return mount(TalosMobileSourcesChip, {
        props: { sources: SOURCES },
        global: {
            stubs: { teleport: true, TalosMobileComposerSheet: true },
            mocks: { $t: (key: string) => key },
        },
    })
}

describe('the sources chip shows real site marks', () => {
    it('replaces the letter with the captured favicon, and keeps the letter without one', async () => {
        const chip = mountChip()
        await flushPromises()

        const marks = chip.get('[data-testid="talos-sources-chip"]')
        expect(marks.findAll('[data-testid="talos-source-favicon"]')).toHaveLength(1)
        // The second source has no card, and its letter is still its mark —
        // absence has to look deliberate rather than broken.
        expect(marks.text()).toContain('B')
    })

    it('never fetches anything to draw them', async () => {
        mountChip()
        await flushPromises()

        expect(backfill).not.toHaveBeenCalled()
    })
})
