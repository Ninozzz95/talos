// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
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
async function menu(props: { incognito: boolean; canGoIncognito: boolean; busy?: boolean }) {
    return mount(TalosMobileChatOptionsMenu, {
        props: { activeTitle: 'Chat', busy: false, ...props },
        global: { plugins: [await createTalosI18n()] },
    })
}

async function openMenu(props: { incognito: boolean; canGoIncognito: boolean; busy?: boolean }) {
    const wrapper = await menu(props)
    await wrapper.get('[aria-haspopup="menu"]').trigger('click')
    mounted.push(wrapper)
    return wrapper
}

/**
 * The confirm dialog TELEPORTS to <body> — it is the device-proven pattern,
 * because reka-ui dialogs never appeared on the owner's WebView. So it is not
 * inside the wrapper's tree and has to be looked for where it actually is.
 */
const mounted: Array<{ unmount(): void }> = []
afterEach(() => {
    while (mounted.length) mounted.pop()!.unmount()
})

function inBody(testId: string): HTMLElement | null {
    return document.body.querySelector(`[data-testid="${testId}"]`)
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
 * Owner 2026-07-31, reporting it as a defect: «se inizio una conversazione in
 * incognito e dopo vado alla modalità normale, tutta la conversazione
 * precedente si cancella».
 *
 * It is not a defect — it is the promise the chat was opened on. But being
 * right is not the same as being kind: it is irreversible, it is one tap away,
 * and nothing warned him. So it asks, and only when there is something to lose.
 */
describe('leaving incognito', () => {
    it('asks first when the incognito chat has something in it', async () => {
        const wrapper = await openMenu({ incognito: true, canGoIncognito: false })

        await wrapper.get('[data-testid="talos-chat-options-temporary"]').trigger('click')

        // Nothing has happened yet — the question is on screen instead.
        expect(wrapper.emitted('normalMode')).toBeUndefined()
        expect(inBody('talos-leave-incognito-confirm')).not.toBeNull()
    })

    it('leaves once the question is answered', async () => {
        const wrapper = await openMenu({ incognito: true, canGoIncognito: false })
        await wrapper.get('[data-testid="talos-chat-options-temporary"]').trigger('click')

        inBody('talos-leave-incognito-confirm')!.click()
        await nextTick()

        expect(wrapper.emitted('normalMode')).toHaveLength(1)
    })

    /** An empty incognito chat has nothing to lose, so it does not nag. */
    it('does not ask when there is nothing in it', async () => {
        const wrapper = await openMenu({ incognito: true, canGoIncognito: true })

        await wrapper.get('[data-testid="talos-chat-options-temporary"]').trigger('click')

        expect(wrapper.emitted('normalMode')).toHaveLength(1)
        expect(inBody('talos-leave-incognito-confirm')).toBeNull()
    })
})

/**
 * Owner 2026-07-31: a press that lands while another session action is still
 * running is DROPPED by the shell guard — silently, with no toast and no
 * spinner. That is indistinguishable from a broken button, and he has reported
 * "premo e non succede niente" three times about this area.
 */
describe('while a session action is running', () => {
    it('shows the entries as unavailable instead of swallowing the press', async () => {
        const wrapper = await openMenu({ incognito: false, canGoIncognito: true, busy: true })

        for (const id of ['talos-chat-options-new', 'talos-chat-options-temporary']) {
            expect(wrapper.get(`[data-testid="${id}"]`).attributes('disabled')).toBeDefined()
        }
    })

    it('leaves them usable when nothing is running', async () => {
        const wrapper = await openMenu({ incognito: false, canGoIncognito: true })

        for (const id of ['talos-chat-options-new', 'talos-chat-options-temporary']) {
            expect(wrapper.get(`[data-testid="${id}"]`).attributes('disabled')).toBeUndefined()
        }
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

/**
 * Found by an adversarial review, 2026-07-31: the question guarded ONE exit.
 * «Nuova chat», one row above in the same menu, threw the incognito
 * conversation away just as permanently and said nothing at all.
 */
describe('the other way out of incognito', () => {
    it('asks before New chat discards an incognito conversation', async () => {
        const wrapper = await openMenu({ incognito: true, canGoIncognito: false })

        await wrapper.get('[data-testid="talos-chat-options-new"]').trigger('click')

        expect(wrapper.emitted('newChat')).toBeUndefined()
        expect(inBody('talos-leave-incognito-confirm')).not.toBeNull()
    })

    it('starts the new chat once the question is answered', async () => {
        const wrapper = await openMenu({ incognito: true, canGoIncognito: false })
        await wrapper.get('[data-testid="talos-chat-options-new"]').trigger('click')

        inBody('talos-leave-incognito-confirm')!.click()
        await nextTick()

        expect(wrapper.emitted('newChat')).toHaveLength(1)
        expect(wrapper.emitted('normalMode')).toBeUndefined()
    })

    it('does not ask in an ordinary chat, where nothing is lost', async () => {
        const wrapper = await openMenu({ incognito: false, canGoIncognito: false })

        await wrapper.get('[data-testid="talos-chat-options-new"]').trigger('click')

        expect(wrapper.emitted('newChat')).toHaveLength(1)
        expect(inBody('talos-leave-incognito-confirm')).toBeNull()
    })
})
