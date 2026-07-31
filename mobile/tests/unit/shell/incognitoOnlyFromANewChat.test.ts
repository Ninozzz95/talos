// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import TalosMobileChatOptionsMenu from '@/components/shell/TalosMobileChatOptionsMenu.vue'
import { createTalosI18n } from '@/i18n'

/**
 * Owner 2026-07-31: «la possibilità di aprire una nuova chat in incognito
 * quando sei in una normale, dai puntini in alto a destra, deve sparire. La
 * lasciamo esclusivamente quando si inizia una nuova chat».
 *
 * The entry always opened a NEW chat, so it was never destructive — but it read
 * as an offer to make THIS conversation anonymous, and it sat one tap away in
 * every chat he had. Offered only where it means what it says: on a chat with
 * nothing in it yet.
 *
 * The way OUT is not conditioned on anything. A switch you can only flip one
 * way is a trap, and inside incognito there is always something to leave.
 */
async function menu(props: { incognito: boolean; canGoIncognito: boolean }) {
    return mount(TalosMobileChatOptionsMenu, {
        props: { activeTitle: 'Chat', busy: false, ...props },
        global: { plugins: [await createTalosI18n()] },
    })
}

async function openItems(props: { incognito: boolean; canGoIncognito: boolean }): Promise<string[]> {
    const wrapper = await menu(props)
    await wrapper.get('[aria-haspopup="menu"]').trigger('click')
    return wrapper.findAll('[role="menuitem"]').map((item) => item.text().toLowerCase())
}

describe('the incognito entry in the chat menu', () => {
    it('is offered on a chat that has nothing in it yet', async () => {
        const items = await openItems({ incognito: false, canGoIncognito: true })

        expect(items.some((item) => item.includes('incognito'))).toBe(true)
    })

    /** The report: he was chatting normally and it was still there. */
    it('is gone once the conversation has started', async () => {
        const items = await openItems({ incognito: false, canGoIncognito: false })

        expect(items.some((item) => item.includes('incognito'))).toBe(false)
        // and the menu still does everything else it did
        expect(items.length).toBeGreaterThan(3)
    })

    it('still offers the way out from inside incognito, whatever is in it', async () => {
        const items = await openItems({ incognito: true, canGoIncognito: false })

        expect(items.some((item) => item.includes('normale') || item.includes('normal'))).toBe(true)
    })
})

/**
 * The menu lives inside TWO shells, and an event of its own died in exactly
 * that gap once already. A prop that fails to arrive is the same defect facing
 * the other way: the entry would simply never disappear.
 */
describe('both shells carry the state down', () => {
    it.each([
        'src/components/shell/TalosMobileHeader.vue',
        'src/components/shell/TalosMobileImmersiveChrome.vue',
    ])('%s passes canGoIncognito through', (path) => {
        const source = readFileSync(resolve(process.cwd(), path), 'utf8')

        expect(source).toContain('canGoIncognito')
        expect(source).toContain(':can-go-incognito="canGoIncognito"')
    })
})
