// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import TalosMobileComposer from '@/components/chat/TalosMobileComposer.vue'
import type { TalosMobileModelProfileView } from '@/components/chat/mobileChatTypes'

// F3-T4bis (owner #13, Claude screenshots): drawer mode = minimal bar
// ("+" / model chip / mic) with the tool controls in an organized bottom
// drawer. Classic mode stays byte-identical when the toggle is off.
const profile: TalosMobileModelProfileView = {
    id: 'profile-claude', provider: 'anthropic', model: 'claude-opus', display_name: 'Claude Opus',
    status: 'healthy', has_secret: true, effort_levels: ['low', 'medium', 'high'], supports_thinking: true,
    show_in_composer: true, capabilities: null, probe_ok: true,
}

function mountComposer(overrides: Record<string, unknown> = {}) {
    return mount(TalosMobileComposer, {
        global: { stubs: { teleport: true } },
        props: {
            prompt: '', modelProfiles: [profile], routingProfiles: [],
            selectedModelProfileId: profile.id, selectedRoutingProfileId: null,
            selectedEffort: 'high', thinking: false, canSend: true, sending: false,
            sendDisabledReason: '', dictationSupported: true,
            ...overrides,
        },
    })
}

describe('composer drawer mode (F3-T4bis)', () => {
    it('renders the minimal bar: add-to-chat, model chip, mic — no inline tool row', async () => {
        const wrapper = mountComposer({ drawerMode: true })
        expect(wrapper.find('[aria-label="Add to chat"]').exists()).toBe(true)
        const chip = wrapper.get('[data-testid="talos-composer-model-chip"]')
        expect(chip.text()).toContain('Claude Opus')
        expect(chip.text()).toContain('High')
        expect(wrapper.find('[aria-label="Dictate"]').exists()).toBe(true)
        for (const gone of ['Choose reasoning effort', 'Attach a file', 'Improve prompt', 'Toggle extended thinking']) {
            expect(wrapper.find(`[aria-label="${gone}"]`).exists()).toBe(false)
        }
    })

    it('keeps the classic bar untouched when the toggle is off', async () => {
        const wrapper = mountComposer({ drawerMode: false })
        expect(wrapper.find('[aria-label="Add to chat"]').exists()).toBe(false)
        expect(wrapper.find('[aria-label="Attach a file"]').exists()).toBe(true)
        expect(wrapper.find('[aria-label="Choose reasoning effort"]').exists()).toBe(true)
    })

    it('opens the organized drawer from "+" and forwards the tool actions', async () => {
        const wrapper = mountComposer({ drawerMode: true })
        await wrapper.get('[aria-label="Add to chat"]').trigger('click')
        await vi.waitFor(() => expect(wrapper.find('[data-testid="talos-composer-drawer"]').exists()).toBe(true))
        const drawer = wrapper.get('[data-testid="talos-composer-drawer"]')
        expect(drawer.text()).toContain('Add to chat')
        await drawer.get('[data-testid="talos-drawer-attach"]').trigger('click')
        expect(wrapper.emitted('attach')).toHaveLength(1)
        // the attach tile closes the drawer (single-shot action)
        await vi.waitFor(() => expect(wrapper.find('[data-testid="talos-composer-drawer"]').exists()).toBe(false))
    })

    it('toggles browse mode from the drawer switch without closing it', async () => {
        const wrapper = mountComposer({ drawerMode: true })
        await wrapper.get('[aria-label="Add to chat"]').trigger('click')
        await vi.waitFor(() => expect(wrapper.find('[data-testid="talos-composer-drawer"]').exists()).toBe(true))
        await wrapper.get('[data-testid="talos-drawer-browse"]').trigger('click')
        expect(wrapper.emitted('toggleBrowse')).toEqual([[true]])
        expect(wrapper.find('[data-testid="talos-composer-drawer"]').exists()).toBe(true)
    })

    it('the model chip opens the dedicated model & reasoning drawer', async () => {
        const wrapper = mountComposer({ drawerMode: true })
        await wrapper.get('[data-testid="talos-composer-model-chip"]').trigger('click')
        await vi.waitFor(() => expect(wrapper.find('[data-testid="talos-model-drawer"]').exists()).toBe(true))
        expect(wrapper.find('[data-testid="talos-mobile-composer-model-picker"]').exists()).toBe(true)
        expect(wrapper.find('[data-testid="talos-mobile-effort-picker"]').exists()).toBe(true)
    })

    it('P1-CTX-UI-04 opens one-turn Library controls from a compact source chip', async () => {
        const wrapper = mountComposer({
            drawerMode: true,
            libraryContextEnabled: true,
            libraryContextMode: 'smart_relevant_v1',
            librarySourceCount: 1,
            libraryTurnOverride: null,
            libraryFiles: [{
                id: 'vault-brief',
                display_name: 'Brief.md',
                media_type: 'text/markdown',
                size_bytes: 128,
                private_uri: 'talos-vault/files/vault-brief',
                status: 'available',
                trust: 'untrusted',
                sha256: 'a'.repeat(64),
                extracted_text: 'brief',
                failure_code: null,
                metadata: { origin: 'uploaded', library_shared: true },
                created_at: '2026-07-29T12:00:00.000Z',
                updated_at: '2026-07-29T12:00:00.000Z',
            }],
        })

        const chip = wrapper.get('[data-testid="talos-composer-library-chip"]')
        expect(chip.text()).toMatch(/Relevant sources only.*1 source/i)
        /**
         * Owner 2026-07-29: "fai in modo che sia solo un icona nella pill, il
         * Testo solo per i display grandi tipo tablet."
         *
         * On a phone this row holds the plus, the model chip and this one, and
         * three labels compete for width that does not exist — the model name,
         * the thing you actually need to read, is what gets truncated. The icon
         * stays; the words wait for room.
         *
         * `md:` is 768px, which is exactly TALOS_TABLET_WIDTH_MEDIA_QUERY, so
         * the visual breakpoint and the app's own definition of a tablet cannot
         * drift apart.
         */
        const chipLabel = wrapper.get('[data-testid="talos-composer-library-chip-label"]')
        expect(chipLabel.classes()).toContain('hidden')
        expect(chipLabel.classes()).toContain('md:flex')
        // The icon is never hidden: on a phone it is all that remains.
        expect(chip.find('svg').exists()).toBe(true)
        // And the accessible name still carries the whole meaning.
        expect(chip.attributes('aria-label')).toBeTruthy()
        await chip.trigger('click')
        await vi.waitFor(() => {
            expect(wrapper.find('[data-testid="talos-library-context-sheet"]').exists()).toBe(true)
        })

        await wrapper.get('[data-testid="talos-library-turn-include-vault-brief"]').trigger('click')
        expect(wrapper.emitted('updateLibraryTurnOverride')?.at(-1)).toEqual([{
            included_file_ids: ['vault-brief'],
            excluded_file_ids: [],
        }])
    })
})

// Owner 2026-07-24 — immersive composer (compact→expand) and the "+" dropdown.
describe('composer immersive + plus-dropdown (owner 2026-07-24)', () => {
    it('MOTION-COMPOSER-01/02 bridges focus geometry in both directions without losing focus', async () => {
        const wrapper = mountComposer({ drawerMode: true, immersiveComposer: true, prompt: '' })
        document.body.appendChild(wrapper.element)
        const surface = wrapper.get<HTMLElement>('[data-testid="talos-mobile-composer"]')
        const field = wrapper.get<HTMLTextAreaElement>('textarea')
        surface.element.style.setProperty('--talos-motion-duration-composer-expand', '180ms')
        surface.element.style.setProperty('--talos-motion-duration-composer-collapse', '150ms')
        vi.spyOn(surface.element, 'offsetHeight', 'get').mockImplementation(
            () => wrapper.find('[data-testid="talos-composer-model-chip"]').exists() ? 100 : 50,
        )

        field.element.focus()
        await flushPromises()
        expect(document.activeElement).toBe(field.element)
        expect(surface.attributes('data-talos-motion-intent')).toBe('composer-expand')
        expect(surface.element.style.getPropertyValue('--talos-composer-layout-shift')).toBe('50px')

        surface.element.dispatchEvent(new Event('animationend', { bubbles: true }))
        await nextTick()
        expect(surface.attributes('data-talos-motion-intent')).toBeUndefined()
        expect(surface.element.style.getPropertyValue('--talos-composer-layout-shift')).toBe('')

        field.element.blur()
        await flushPromises()
        expect(document.activeElement).not.toBe(field.element)
        expect(surface.attributes('data-talos-motion-intent')).toBe('composer-collapse')
        expect(surface.element.style.getPropertyValue('--talos-composer-layout-shift')).toBe('-50px')

        wrapper.unmount()
        document.body.replaceChildren()
    })

    it('MOTION-COMPOSER-03 suppresses a stale expansion during rapid focus reversal', async () => {
        const wrapper = mountComposer({ drawerMode: true, immersiveComposer: true, prompt: '' })
        document.body.appendChild(wrapper.element)
        const surface = wrapper.get<HTMLElement>('[data-testid="talos-mobile-composer"]')
        const field = wrapper.get<HTMLTextAreaElement>('textarea')
        surface.element.style.setProperty('--talos-motion-duration-composer-expand', '180ms')
        surface.element.style.setProperty('--talos-motion-duration-composer-collapse', '150ms')
        vi.spyOn(surface.element, 'offsetHeight', 'get').mockImplementation(
            () => wrapper.find('[data-testid="talos-composer-model-chip"]').exists() ? 100 : 50,
        )

        field.element.focus()
        await nextTick()
        field.element.blur()
        await flushPromises()

        expect(surface.attributes('data-talos-motion-intent')).not.toBe('composer-expand')
        expect(wrapper.find('[data-testid="talos-composer-model-chip"]').exists()).toBe(false)

        wrapper.unmount()
        document.body.replaceChildren()
    })

    it('immersive: the controls row is hidden when unfocused+empty, and returns on focus', async () => {
        const wrapper = mountComposer({ drawerMode: true, immersiveComposer: true, prompt: '' })
        // compact: no model chip row
        expect(wrapper.find('[data-testid="talos-composer-model-chip"]').exists()).toBe(false)
        await wrapper.get('textarea').trigger('focus')
        expect(wrapper.find('[data-testid="talos-composer-model-chip"]').exists()).toBe(true)
        await wrapper.get('textarea').trigger('blur')
        expect(wrapper.find('[data-testid="talos-composer-model-chip"]').exists()).toBe(false)
    })

    it('CODE-COMPOSER-LANDSCAPE-IME-SAFE-01 reflows the same component below the status bar without runtime branching', async () => {
        const source = (await import('@/components/chat/TalosMobileComposer.vue?raw')).default

        expect(source).toContain('@media (orientation: landscape) and (max-height: 180px)')
        expect(source).toMatch(/max-height:\s*calc\(100dvh - env\(safe-area-inset-top\)\)/)
        expect(source).toMatch(/textarea\s*\{[^}]*height:\s*48px !important[^}]*padding-left:\s*48px/s)
        expect(source).toMatch(/div:has\(> \[data-testid="talos-composer-model-chip"\]\)\s*\{[^}]*position:\s*absolute/s)
        expect(source).toMatch(/div:has\(> \[data-testid="talos-composer-model-chip"\]\)[\s\S]*> :not\(:first-child\)\s*\{[^}]*display:\s*none/s)
        expect(source).toMatch(/scrollbar-width:\s*none/)
        expect(source).not.toContain('useTalosMediaQuery')
    })

    it('immersive: stays expanded when there is content (never collapses over a draft)', async () => {
        const wrapper = mountComposer({ drawerMode: true, immersiveComposer: true, prompt: 'hello' })
        expect(wrapper.find('[data-testid="talos-composer-model-chip"]').exists()).toBe(true)
    })

    it('immersive OFF keeps the bar always visible', async () => {
        const wrapper = mountComposer({ drawerMode: true, immersiveComposer: false, prompt: '' })
        expect(wrapper.find('[data-testid="talos-composer-model-chip"]').exists()).toBe(true)
    })

    it('plus-dropdown: "+" opens the anchored menu (not the drawer) and an item forwards its action', async () => {
        const wrapper = mountComposer({ drawerMode: true, plusDropdown: true })
        await wrapper.get('[aria-label="Add to chat"]').trigger('click')
        expect(wrapper.find('[data-testid="talos-composer-plus-menu"]').exists()).toBe(true)
        expect(wrapper.find('[data-testid="talos-composer-drawer"]').exists()).toBe(false)
        await wrapper.get('[data-testid="talos-plus-menu-attach"]').trigger('click')
        expect(wrapper.emitted('attach')).toHaveLength(1)
        expect(wrapper.find('[data-testid="talos-composer-plus-menu"]').exists()).toBe(false)
    })

    it('plus-dropdown OFF: "+" opens the bottom drawer as before', async () => {
        const wrapper = mountComposer({ drawerMode: true, plusDropdown: false })
        await wrapper.get('[aria-label="Add to chat"]').trigger('click')
        expect(wrapper.find('[data-testid="talos-composer-plus-menu"]').exists()).toBe(false)
        await vi.waitFor(() => expect(wrapper.find('[data-testid="talos-composer-drawer"]').exists()).toBe(true))
    })

    // Owner device feedback: the compact immersive pill must be [+] input [mic]
    // [send] on one line — + and mic must NOT disappear in the compact state.
    it('immersive compact shows the inline + and mic (single-line pill), not the model chip', async () => {
        const wrapper = mountComposer({ drawerMode: true, immersiveComposer: true, prompt: '' })
        expect(wrapper.find('[aria-label="Add to chat"]').exists()).toBe(true)
        expect(wrapper.find('[aria-label="Dictate"]').exists()).toBe(true)
        // the model chip only appears once expanded (on focus/content)
        expect(wrapper.find('[data-testid="talos-composer-model-chip"]').exists()).toBe(false)
    })

    // Owner device bug: tapping "+" blurred the field and dismissed the keyboard.
    // The tap must cancel the pointerdown (Android WebView blurs on pointerdown,
    // before any mousedown handler could run).
    it('immersive compact: tapping "+" cancels the pointerdown so the field keeps focus', async () => {
        const wrapper = mountComposer({ drawerMode: true, immersiveComposer: true, prompt: '' })
        const ev = new Event('pointerdown', { bubbles: true, cancelable: true })
        wrapper.get('[aria-label="Add to chat"]').element.dispatchEvent(ev)
        expect(ev.defaultPrevented).toBe(true)
    })

    // SF-critic fix: aria must describe the surface the "+" actually opens.
    it('the "+" advertises a menu with plus-dropdown on and a dialog (the drawer) off', async () => {
        const on = mountComposer({ drawerMode: true, plusDropdown: true })
        expect(on.get('[aria-label="Add to chat"]').attributes('aria-haspopup')).toBe('menu')
        const off = mountComposer({ drawerMode: true, plusDropdown: false })
        expect(off.get('[aria-label="Add to chat"]').attributes('aria-haspopup')).toBe('dialog')
    })

    // Global review (test axis): duplicate mics with the SAME accessible name
    // shipped in R21 — the morphing right button plus a second one in each
    // control row. One control per label, in every mode.
    it.each([
        ['drawer', { drawerMode: true }],
        ['classic', { drawerMode: false }],
        ['immersive', { drawerMode: true, immersiveComposer: true }],
    ])('exposes exactly one dictation control in %s mode', (_mode, overrides) => {
        const wrapper = mountComposer({ ...overrides, dictationSupported: true, prompt: '' })
        expect(wrapper.findAll('[aria-label="Dictate"]')).toHaveLength(1)
    })

    // Re-review 2026-07-25: the previous version PERMITTED two controls sharing
    // the name ("right button + live pill"), rubber-stamping the duplication it
    // was meant to catch. Exactly one control may be named "Stop dictation";
    // the pill's own control is "Cancel dictation".
    it('exposes exactly one Stop-dictation control while listening', async () => {
        /*
         * ⛔ IL PUNTO DI QUESTO CASO ERA «UNO SOLO», non «esiste».
         *
         * Il difetto che difendeva: due comandi di stop contemporanei, uno
         * nella barra e uno nel compositore. Dal 2026-08-10 la barra e' un
         * componente caricato al bisogno, quindi il compositore non puo' piu'
         * averne uno suo — e la difesa diventa esattamente questa: mentre si
         * detta, il compositore non disegna NESSUN comando di dettatura, cosi'
         * il solo che esiste e' quello della barra (provato in
         * `barraDettatura.test.ts`).
         */
        const wrapper = mountComposer({ drawerMode: true, dictationSupported: true, dictationListening: true })
        await flushPromises()
        expect(wrapper.findAll('[aria-label="Stop dictation"]')).toHaveLength(0)
        expect(wrapper.findAll('textarea')).toHaveLength(0)
    })

    // Owner device 2026-07-25: the mic was "extremely hard" to start. Root cause:
    // in compact the right button is vertically centred; tapping it focused the
    // textarea, the pill EXPANDED, and the button moved away before the click
    // resolved. The press must not steal focus, and activating the mic must
    // actively blur so the keyboard gets out of the way for speech.
    it('the right button does not steal focus (no layout shift mid-tap)', async () => {
        const wrapper = mountComposer({ drawerMode: true, immersiveComposer: true, dictationSupported: true, prompt: '' })
        const ev = new Event('pointerdown', { bubbles: true, cancelable: true })
        wrapper.get('[aria-label="Dictate"]').element.dispatchEvent(ev)
        expect(ev.defaultPrevented).toBe(true)
    })

    it('starting dictation blurs the composer so the keyboard yields', async () => {
        const wrapper = mountComposer({ drawerMode: true, dictationSupported: true, prompt: '' })
        const field = wrapper.get('textarea').element as HTMLTextAreaElement
        field.focus()
        await wrapper.get('[aria-label="Dictate"]').trigger('click')
        expect(wrapper.emitted('toggleDictation')).toHaveLength(1)
        expect(document.activeElement).not.toBe(field)
    })

    it('plus-dropdown: Escape closes the menu', async () => {
        const wrapper = mountComposer({ drawerMode: true, plusDropdown: true })
        await wrapper.get('[aria-label="Add to chat"]').trigger('click')
        expect(wrapper.find('[data-testid="talos-composer-plus-menu"]').exists()).toBe(true)
        await wrapper.get('[data-testid="talos-composer-plus-menu"]').trigger('keydown.escape')
        await vi.waitFor(() => expect(wrapper.find('[data-testid="talos-composer-plus-menu"]').exists()).toBe(false))
    })
})

// F4-#20 — the enhancer must never present a mute disabled control on touch
// (title tooltips do not exist there): the control stays tappable and a tap
// with missing prerequisites emits the REASON for the UI to surface.
describe('enhancer visible reason (F4-#20)', () => {
    it('drawer row stays tappable with an empty prompt and explains itself', async () => {
        const wrapper = mountComposer({ drawerMode: true })
        await wrapper.get('[aria-label="Add to chat"]').trigger('click')
        await vi.waitFor(() => expect(wrapper.find('[data-testid="talos-drawer-enhance"]').exists()).toBe(true))
        const row = wrapper.get('[data-testid="talos-drawer-enhance"]')
        expect(row.attributes('disabled')).toBeUndefined()
        expect(row.text()).toContain('Write a prompt first')
        await row.trigger('click')
        expect(wrapper.emitted('enhancePrompt')).toBeUndefined()
        const blocked = wrapper.emitted('enhanceBlocked')
        expect(blocked).toHaveLength(1)
        expect(String(blocked![0][0])).toContain('Write a prompt')
    })

    it('la voce del cassetto APRE il pannello, e la spesa parte quando si risponde', async () => {
        /**
         * Decisione cambiata 2026-08-04. Owner: «prima che parta l'enhancing
         * bisogna selezionare modello e ragionamento ove previsto, e il tono».
         *
         * Prima il tocco faceva partire la chiamata: chi voleva un modello
         * diverso scopriva di non poterlo scegliere mentre il conto correva.
         */
        const wrapper = mountComposer({ drawerMode: true, prompt: 'Migliora questo testo' })
        await wrapper.get('[aria-label="Add to chat"]').trigger('click')
        await vi.waitFor(() => expect(wrapper.find('[data-testid="talos-drawer-enhance"]').exists()).toBe(true))
        await wrapper.get('[data-testid="talos-drawer-enhance"]').trigger('click')

        expect(wrapper.emitted('enhanceBlocked')).toBeUndefined()
        // Niente e' ancora partito.
        expect(wrapper.emitted('enhancePrompt')).toBeUndefined()

        await vi.waitFor(() => expect(wrapper.find('[data-testid="talos-enhancer-setup"]').exists()).toBe(true))
        await wrapper.get('[data-testid="talos-enhancer-start"]').trigger('click')
        expect(wrapper.emitted('enhancePrompt')).toHaveLength(1)
    })

    it('classic wand stays tappable with an empty prompt and reports the reason', async () => {
        const wrapper = mountComposer({ drawerMode: false })
        const wand = wrapper.get('[aria-label="Improve prompt"]')
        expect(wand.attributes('disabled')).toBeUndefined()
        await wand.trigger('click')
        expect(wrapper.emitted('enhancePrompt')).toBeUndefined()
        expect(wrapper.emitted('enhanceBlocked')).toHaveLength(1)
    })

    it('classic wand reports the model reason when no model is callable', async () => {
        const wrapper = mountComposer({
            drawerMode: false, prompt: 'Testo', modelProfiles: [], selectedModelProfileId: null,
        })
        await wrapper.get('[aria-label="Improve prompt"]').trigger('click')
        const blocked = wrapper.emitted('enhanceBlocked')
        expect(blocked).toHaveLength(1)
        expect(String(blocked![0][0]).toLowerCase()).toContain('model')
    })
})
