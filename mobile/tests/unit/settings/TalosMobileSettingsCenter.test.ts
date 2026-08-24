// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'

/**
 * Harness UI (Codex, 24/8) — solo il link, non un mock dell'intero
 * plugin: `harnessUiAvailable` legge `Capacitor.isPluginAvailable` una
 * volta per istanza montata (const, non computed — vedi il componente),
 * quindi basta cambiare `nativo.disponibile` PRIMA di ogni `mount()`.
 * Default `false`, come il comportamento reale di oggi senza il plugin
 * nativo: ogni test già esistente in questo file vede lo stesso link
 * assente di sempre, a meno che non lo alzi esplicitamente.
 */
const nativo = vi.hoisted(() => ({ disponibile: false }))
vi.mock('@capacitor/core', () => ({
    Capacitor: { isPluginAvailable: () => nativo.disponibile, isNativePlatform: () => false },
    registerPlugin: () => ({}),
}))

import TalosMobileSettingsCenter from '@/components/talos/settings/TalosMobileSettingsCenter.vue'

if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => undefined
}

const panelStubs = {
    RouterLink: { props: ['to'], template: '<a data-router-link-stub><slot /></a>' },
    TalosMobileSettingsAiDefaultsPanel: { template: '<div data-panel="ai_defaults">AI defaults panel</div>' },
    TalosMobileSettingsAppearancePanel: { template: '<div data-panel="appearance">Appearance panel</div>' },
    TalosMobileSettingsLanguagePanel: { template: '<div data-testid="talos-settings-language">Language panel</div>' },
    TalosMobileSettingsAccountPanel: { template: '<div data-panel="account">Account panel</div>' },
    TalosMobileSettingsAgentToolsPanel: { template: '<div data-testid="talos-settings-agent-tools">Agent Tools panel</div>' },
}

function mountCenter() {
    return mount(TalosMobileSettingsCenter, { attachTo: document.body, global: { stubs: panelStubs } })
}

/**
 * jsdom answers every media query with `matches: false`, so a plain mount is
 * the PHONE. Widths are not a detail here: this screen is two different ARIA
 * patterns at two widths, and a test that does not say which one it is standing
 * at is asserting nothing in particular.
 */
function widenToTablet(): void {
    vi.stubGlobal('matchMedia', vi.fn((query: string) => ({
        matches: query.includes('768'),
        addEventListener: () => {},
        removeEventListener: () => {},
    })))
}

async function activateTab(wrapper: ReturnType<typeof mountCenter>, id: string): Promise<void> {
    const tab = wrapper.get(`[data-settings-tab="${id}"]`)
    ;(tab.element as HTMLElement).focus()
    tab.element.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 }))
    tab.element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }))
    await nextTick()
    await new Promise((resolve) => setTimeout(resolve, 0))
    await nextTick()
}

afterEach(() => {
    document.body.replaceChildren()
    vi.unstubAllGlobals()
})

/**
 * Settings destinations are navigation at every width. The tablet keeps the
 * detail visible beside the list, but that layout change must not silently
 * turn routed and inline destinations into two incompatible keyboard models.
 */
describe('TalosMobileSettingsCenter — on the phone, it is navigation', () => {
    it('puts Account first, then Model Lab first inside Intelligence', () => {
        const wrapper = mountCenter()

        // No tablist, because tapping a row takes the list away.
        expect(wrapper.find('[role="tablist"]').exists()).toBe(false)
        expect(wrapper.findAll('[role="tab"]')).toHaveLength(0)

        const rail = wrapper.get('[data-testid="settings-category-pane"]')
        expect(rail.element.tagName).toBe('NAV')
        expect(rail.attributes('aria-label')).toBe('TALOS settings categories')
        // 2026-08-10: quattordici — la Voce e' uscita da «Aspetto» ed e' una
        // stazione sua. Vedi settingsTabs.test.ts per il perche'.
        expect(wrapper.findAll('[data-settings-tab]')).toHaveLength(14)
        expect(wrapper.findAll('[data-testid="settings-model-lab-link"]')).toHaveLength(1)
        expect(wrapper.get('[data-testid="settings-model-lab-link"]').text()).toContain('Model Lab')

        const destinations = Array.from(wrapper.get('[data-testid="settings-category-list"]').element
            .querySelectorAll<HTMLElement>('[data-settings-tab], [data-settings-route]'))
            .map((row) => row.dataset.settingsTab ?? row.dataset.settingsRoute)
        expect(destinations.slice(0, 4)).toEqual(['account', 'models', 'ai_defaults', 'agent_tools'])

        const intelligenceHeading = wrapper.findAll('[data-testid="settings-group-heading"]')
            .find((heading) => heading.text() === 'Intelligence')
        expect(intelligenceHeading).toBeDefined()
        expect(intelligenceHeading!.element.nextElementSibling
            ?.querySelector('[data-testid="settings-model-lab-link"]')).not.toBeNull()

        const modelLab = wrapper.get('[data-testid="settings-model-lab-link"]')
        expect(modelLab.classes()).toEqual(expect.arrayContaining([
            'min-h-touch',
            'gap-[var(--talos-space-inline)]',
            'px-[var(--talos-space-card)]',
        ]))
        expect(modelLab.element.parentElement?.classList)
            .toContain('rounded-[var(--talos-radius-card)]')
        expect(modelLab.findAll('svg').every((icon) => icon.classes()
            .includes('size-[var(--talos-icon-size)]'))).toBe(true)
    })

    it('marks where you are with aria-current, and gives every row its own tab stop', async () => {
        const wrapper = mountCenter()
        await activateTab(wrapper, 'appearance')

        const current = wrapper.get('[data-settings-tab="appearance"]')
        expect(current.attributes('aria-current')).toBe('page')
        expect(current.attributes('aria-selected')).toBeUndefined()
        // Roving tabindex belongs to the tabs pattern. Under navigation it would
        // take twelve stops away from a keyboard user for nothing.
        expect(wrapper.findAll('[data-settings-tab]').every((row) => row.attributes('tabindex') === undefined))
            .toBe(true)
    })

    it('names the panel a region, labelled by the row that opened it', async () => {
        const wrapper = mountCenter()
        await activateTab(wrapper, 'language')

        const panel = wrapper.get('[data-settings-panel="language"]')
        expect(panel.attributes('role')).toBe('region')
        expect(panel.attributes('aria-labelledby')).toBe('talos-settings-row-language')
        expect(panel.classes()).toContain('talos-motion-tab-panel')
    })

    it('does not answer the arrow keys, because Tab is how you move through a list of links', async () => {
        const wrapper = mountCenter()
        const first = wrapper.get('[data-settings-tab="account"]')
        ;(first.element as HTMLElement).focus()

        // End, not ArrowDown. ArrowDown from the first row lands on Models —
        // which is where the screen already was, so the roving walk running
        // when it should not was invisible. End would jump to the far end.
        for (const key of ['End', 'ArrowDown', 'ArrowUp', 'Home']) {
            first.element.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
            await nextTick()
        }

        const panels = wrapper.findAll('[data-settings-panel]')
        expect(panels).toHaveLength(1)
        expect(panels[0]!.attributes('data-settings-panel')).toBe('ai_defaults')
    })
})

describe('TalosMobileSettingsCenter — on the tablet, it remains navigation', () => {
    it('keeps the same Account-first grouped navigation beside a region', () => {
        widenToTablet()
        const wrapper = mountCenter()

        expect(wrapper.find('[role="tablist"]').exists()).toBe(false)
        expect(wrapper.findAll('[role="tab"]')).toHaveLength(0)
        expect(wrapper.get('[data-testid="settings-category-pane"]').element.tagName).toBe('NAV')
        expect(wrapper.get('[data-testid="settings-category-pane"]').attributes('aria-label'))
            .toBe('TALOS settings categories')
        expect(wrapper.get('[data-settings-tab="account"]').element
            .compareDocumentPosition(wrapper.get('[data-testid="settings-model-lab-link"]').element)
            & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
        expect(wrapper.get('[data-settings-panel="ai_defaults"]').attributes('role')).toBe('region')
        expect(wrapper.get('[data-settings-panel="ai_defaults"]').classes()).toContain('talos-motion-tab-panel')
        wrapper.unmount()
    })

    it('gives every inline destination its natural tab stop', () => {
        widenToTablet()
        const wrapper = mountCenter()

        // 2026-08-10: quattordici — la Voce e' uscita da «Aspetto» ed e' una
        // stazione sua. Vedi settingsTabs.test.ts per il perche'.
        expect(wrapper.findAll('[data-settings-tab]')).toHaveLength(14)
        expect(wrapper.findAll('[data-settings-tab]').every((row) => row.attributes('tabindex') === undefined))
            .toBe(true)
        wrapper.unmount()
    })

    it('does not move selection with tab-pattern arrow keys', async () => {
        widenToTablet()
        const wrapper = mountCenter()
        const first = wrapper.get('[data-settings-tab="account"]')
        ;(first.element as HTMLElement).focus()
        for (const key of ['ArrowDown', 'ArrowUp', 'Home', 'End']) {
            first.element.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
            await nextTick()
        }

        expect(wrapper.get('[data-settings-panel="ai_defaults"]').attributes('data-state')).toBe('active')
        expect(document.activeElement).toBe(first.element)
        wrapper.unmount()
    })
})

describe('TalosMobileSettingsCenter', () => {

    /**
     * Owner 2026-08-02: the entries that say "not in this build" go into a
     * declared section, or they go away. They used to be salted through the
     * live ones — three of the five under Connections led nowhere, and someone
     * scanning had to tap to find out which.
     */
    it('gathers everything unavailable under one declared heading, at the end', () => {
        const wrapper = mountCenter()
        // By test id rather than by sniffing classes: the heading reads as
        // uppercase because of CSS, not because the string is.
        const headings = wrapper.findAll('[data-testid="settings-group-heading"]').map((node) => node.text())

        expect(headings.at(-1)).toBe('Not in this build')
        // …and the live groups keep only live entries.
        const rows = wrapper.findAll('[data-settings-tab]').map((row) => row.attributes('data-settings-tab'))
        expect(rows.slice(-4)).toEqual(['integrations', 'email', 'reminders', 'system'])
        wrapper.unmount()
    })

    it('stops the System entry denying a Doctor that ships', async () => {
        // Exactly the defect the Search entry had: an entry announcing the
        // absence of something the app does. What is genuinely missing is
        // policy, audit and backup — so that is what it says.
        const wrapper = mountCenter()
        await activateTab(wrapper, 'system')

        const panel = wrapper.get('[data-capability="system"]')
        expect(panel.text()).toContain('Doctor')
        expect(panel.text()).not.toContain('Doctor and backup services are not installed')
        wrapper.unmount()
    })

    it('keeps every remaining runtime-dependent category visible and explicitly gated', async () => {
        const wrapper = mountCenter()
        // F2-T6: 'account' left this list — it is now a real local panel.
        // 'search' left this list on 2026-08-01. It had been announcing "not
        // installed in this build" for as long as web search had been working,
        // while the configuration that made it work lived under AI Defaults —
        // so the one entry named Search was the one that said no.
        const gated = ['integrations', 'email', 'reminders', 'system']

        for (const id of gated) {
            await activateTab(wrapper, id)
            const panel = wrapper.get(`[data-capability="${id}"]`)
            expect(panel.attributes('data-capability-state')).toBe('gated')
            expect(panel.text()).toContain('Not available yet')
            expect(panel.findAll('button:not([disabled])')).toHaveLength(0)
        }
    })

    /**
     * The repair for the defect above, asserted at the far end: the Search
     * entry now renders the real thing. If this ever goes back to a capability
     * placeholder, the app is once again denying the existence of a feature it
     * ships.
     */
    it('renders Search as a real settings surface, with the source picker inside it', async () => {
        const wrapper = mountCenter()

        await activateTab(wrapper, 'search')

        expect(wrapper.find('[data-capability="search"]').exists()).toBe(false)
        expect(wrapper.get('[data-testid="talos-settings-search"]').exists()).toBe(true)
        expect(wrapper.get('[data-testid="talos-search-source"]').exists()).toBe(true)
        expect(wrapper.get('[data-testid="talos-search-permission-pointer"]').exists()).toBe(true)
    })

    it('renders Browser as a real settings surface instead of a gated placeholder', async () => {
        const wrapper = mountCenter()

        await activateTab(wrapper, 'browser')

        expect(wrapper.find('[data-capability="browser"]').exists()).toBe(false)
        expect(wrapper.get('[aria-label="Browser interaction policy"]').exists()).toBe(true)
    })

    it('renders Language as a real local settings surface', async () => {
        const wrapper = mountCenter()

        await activateTab(wrapper, 'language')

        expect(wrapper.find('[data-capability="language"]').exists()).toBe(false)
        expect(wrapper.get('[data-testid="talos-settings-language"]').exists()).toBe(true)
    })

    it('AGENT-TOOLS-08 renders Agent Tools as a real local settings surface', async () => {
        const wrapper = mountCenter()

        await activateTab(wrapper, 'agent_tools')

        expect(wrapper.find('[data-capability="agent_tools"]').exists()).toBe(false)
        expect(wrapper.get('[data-testid="talos-settings-agent-tools"]').exists()).toBe(true)
    })

    it('uses a phone list-detail flow; the sheet header drives a single contextual Back', async () => {
        const { useTalosSheetNav } = await import('@/composables/useTalosSheetNav')
        const nav = useTalosSheetNav()
        const wrapper = mountCenter()
        const categories = wrapper.get<HTMLElement>('[data-testid="settings-category-pane"]')
        const detail = wrapper.get<HTMLElement>('[data-testid="settings-detail-pane"]')
        categories.element.style.setProperty('--talos-motion-duration-tab-change', '150ms')
        detail.element.style.setProperty('--talos-motion-duration-tab-change', '150ms')
        await activateTab(wrapper, 'appearance')

        expect(categories.classes()).toContain('hidden')
        expect(detail.classes()).not.toContain('hidden')
        expect(detail.attributes('tabindex')).toBe('-1')
        expect(detail.attributes('data-talos-motion-intent')).toBe('tab-change')
        expect(document.activeElement).toBe(detail.element)
        expect(wrapper.get('[data-settings-panel="appearance"]').attributes('data-state')).toBe('active')

        // Owner 2026-07-24: no in-body "Categories" back — the sheet header
        // shows the subsection title and owns the single Back.
        expect(wrapper.find('[aria-label="Back to settings categories"]').exists()).toBe(false)
        expect(nav.subView.value?.title).toBe('Appearance')

        nav.subView.value!.back()
        await nextTick()
        await new Promise((resolve) => setTimeout(resolve, 0))
        await nextTick()
        const selected = wrapper.get<HTMLElement>('[data-settings-tab="appearance"]')
        expect(categories.classes()).not.toContain('hidden')
        expect(detail.classes()).toContain('hidden')
        expect(categories.attributes('data-talos-motion-intent')).toBe('tab-change')
        // aria-current, not aria-selected: coming back to the list is coming
        // back to a list of destinations.
        expect(selected.attributes('aria-current')).toBe('page')
        expect(document.activeElement).toBe(selected.element)
        expect(nav.subView.value).toBeNull()
    })
})

// SF-critic M1: at the md breakpoint (side-by-side) opening a category must NOT
// push a sheet sub-view (no spurious contextual Back / wrong header on tablet).
describe('TalosMobileSettingsCenter md breakpoint', () => {
    it('TABLET-SETTINGS-SCROLL-01 makes the category rail a bounded structural flex column', () => {
        const wrapper = mountCenter()
        const categories = wrapper.get('[data-testid="settings-category-pane"]')

        expect(categories.classes()).toContain('md:flex')
        expect(categories.classes()).toContain('md:flex-col')
        expect(categories.classes()).toContain('md:overflow-hidden')
        expect(categories.classes()).not.toContain('md:block')
        wrapper.unmount()
    })

    it('TABLET-SETTINGS-SCROLL-02 gives exactly the inner tablist bounded vertical scrolling', () => {
        const wrapper = mountCenter()
        const categories = wrapper.get('[data-testid="settings-category-pane"]')
        // By test id, not by role: the role is now the phone/tablet question,
        // and the scrolling this pins is a layout fact at either width.
        const tablist = wrapper.get('[data-testid="settings-category-list"]')

        expect(categories.classes()).not.toContain('md:overflow-y-auto')
        expect(categories.classes()).not.toContain('md:overscroll-contain')
        expect(tablist.classes()).toContain('md:min-h-0')
        expect(tablist.classes()).toContain('md:flex-1')
        expect(tablist.classes()).toContain('md:overflow-y-auto')
        expect(tablist.classes()).toContain('md:overscroll-contain')
        wrapper.unmount()
    })

    it('TABLET-SETTINGS-04 owns the full list-detail height and reuses the shell rail width', () => {
        const wrapper = mountCenter()
        const scaffold = wrapper.get('[data-testid="settings-list-detail"]')
        const categories = wrapper.get('[data-testid="settings-category-pane"]')

        expect(scaffold.classes()).toContain('md:h-full')
        expect(scaffold.classes()).toContain('md:rounded-none')
        expect(categories.classes()).toContain('md:w-[var(--talos-tablet-sidebar-width)]')
        wrapper.unmount()
    })

    it('does not set a sheet sub-view when the md layout is side-by-side', async () => {
        const listeners: Array<(e: { matches: boolean }) => void> = []
        vi.stubGlobal('matchMedia', vi.fn((q: string) => ({
            matches: q.includes('768'),
            addEventListener: (_: string, l: (e: { matches: boolean }) => void) => listeners.push(l),
            removeEventListener: () => {},
        })))
        const { useTalosSheetNav } = await import('@/composables/useTalosSheetNav')
        const nav = useTalosSheetNav()
        nav.clear()
        const wrapper = mount(TalosMobileSettingsCenter, { attachTo: document.body, global: { stubs: panelStubs } })
        // `mobilePane` intentionally starts on categories. Both side-by-side
        // panes therefore need an md display override over the phone `hidden`.
        expect(wrapper.get('[data-testid="settings-category-pane"]').classes()).toContain('md:flex')
        expect(wrapper.get('[data-testid="settings-detail-pane"]').classes()).toContain('hidden')
        expect(wrapper.get('[data-testid="settings-detail-pane"]').classes()).toContain('md:block')
        await activateTab(wrapper, 'account')
        expect(nav.subView.value).toBeNull()
        wrapper.unmount()
        vi.unstubAllGlobals()
    })
})

/**
 * Owner 24/8: «harness ci deve essere sia su mobile che su desktop,
 * mockup visibile solo nella apk di debug». Il link stesso È il
 * cancello: nessun altro modo di arrivarci se non è montato.
 */
describe('TalosMobileSettingsCenter — Harness UI debug link', () => {
    afterEach(() => { nativo.disponibile = false })

    it('non esiste quando il plugin nativo non è disponibile (build di release, il caso di oggi)', () => {
        nativo.disponibile = false
        const wrapper = mountCenter()

        expect(wrapper.find('[data-testid="settings-harness-ui-link"]').exists()).toBe(false)
        wrapper.unmount()
    })

    it('appare e punta al mockup statico locale quando il plugin nativo è disponibile (build di debug)', () => {
        nativo.disponibile = true
        const wrapper = mountCenter()

        const link = wrapper.get('[data-testid="settings-harness-ui-link"]')
        expect(link.attributes('href')).toBe('/harness-ui/index.html')
        // Nessun target="_blank": è un documento locale nello stesso
        // WebView (frame-src 'none' blocca solo l'incorporamento, non la
        // navigazione — verificato via ricerca, non un iframe comunque).
        expect(link.attributes('target')).toBeUndefined()
        wrapper.unmount()
    })
})
