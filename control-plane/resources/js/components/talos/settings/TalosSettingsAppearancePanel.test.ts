// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest'
import { createApp, defineComponent, h, nextTick } from 'vue'
import { TALOS_DEFAULT_CHAT_LAYOUT } from '../../../lib/talosChatLayout'
import { TALOS_APPEARANCE_DEFAULTS, TALOS_APPEARANCE_GROUPS } from '../../../lib/talosAppearancePreferences'
import TalosSettingsAppearancePanel from './TalosSettingsAppearancePanel.vue'

// reka Select (themed dropdown) needs these APIs jsdom omits.
if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => undefined
}
if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false
    Element.prototype.setPointerCapture = () => undefined
    Element.prototype.releasePointerCapture = () => undefined
}

async function settle() {
    await nextTick()
    await new Promise((resolve) => setTimeout(resolve, 0))
    await nextTick()
}

function firePointer(element: Element, type: 'pointerdown' | 'pointerup') {
    const Ctor = typeof PointerEvent === 'function' ? PointerEvent : MouseEvent
    element.dispatchEvent(new Ctor(type, { bubbles: true, cancelable: true, button: 0 }))
}

const mounted: Array<ReturnType<typeof createApp>> = []

afterEach(() => {
    mounted.splice(0).forEach((app) => app.unmount())
    document.body.replaceChildren()
})

function mountAppearance(
    withVisibilityGroups = false,
    options: { themePolicyLocked?: boolean; uiScale?: number; messageScale?: number } = {},
) {
    const shell = document.createElement('div')
    shell.className = 'talos-shell'
    const portalRoot = document.createElement('div')
    portalRoot.id = 'talos-portal-root'
    const container = document.createElement('div')
    shell.append(portalRoot, container)
    document.body.append(shell)

    let themeEngineOpenCount = 0
    const mobilePresentationUpdates: string[] = []
    const uiScaleUpdates: number[] = []
    const messageScaleUpdates: number[] = []
    const app = createApp(defineComponent({
        setup() {
            return () => h(TalosSettingsAppearancePanel, {
                theme: 'forge',
                themeMode: 'dark',
                uiScale: options.uiScale ?? 1,
                chatLayout: {
                    ...TALOS_DEFAULT_CHAT_LAYOUT,
                    message_scale: options.messageScale ?? 1,
                },
                themePolicyLocked: options.themePolicyLocked ?? false,
                appearanceVisibility: structuredClone(TALOS_APPEARANCE_DEFAULTS),
                appearanceGroups: withVisibilityGroups ? TALOS_APPEARANCE_GROUPS : [],
                onOpenThemeEngine: () => {
                    themeEngineOpenCount += 1
                },
                onUpdateMobileWindowPresentation: (value: string) => mobilePresentationUpdates.push(value),
                onUpdateUiScale: (value: number) => uiScaleUpdates.push(value),
                onUpdateMessageScale: (value: number) => messageScaleUpdates.push(value),
            })
        },
    }))

    mounted.push(app)
    app.mount(container)

    return {
        container,
        portalRoot,
        themeEngineOpenCount: () => themeEngineOpenCount,
        mobilePresentationUpdates,
        uiScaleUpdates,
        messageScaleUpdates,
    }
}

describe('TalosSettingsAppearancePanel tabs', () => {
    it('renders canonical information for every Appearance visibility group', async () => {
        const { container, portalRoot } = mountAppearance(true)
        const visibilityTab = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="tab"]'))
            .find((tab) => tab.textContent?.includes('Visibility'))
        visibilityTab?.click()
        await nextTick()

        expect(container.querySelectorAll('[data-guide-id^="settings.appearance."]')).toHaveLength(3)
        expect(container.querySelector('button button')).toBeNull()

        container.querySelector<HTMLButtonElement>('[aria-label="Information about Chat Bar"]')?.click()
        await nextTick()
        await nextTick()
        expect(portalRoot.textContent).toContain('Choose which supported composer tools are visible.')
    })

    it('links the active tab to a labelled panel', () => {
        const { container } = mountAppearance()
        const designTab = container.querySelector<HTMLButtonElement>('[role="tab"]')
        const panel = container.querySelector<HTMLElement>('[role="tabpanel"]')

        expect(designTab?.id).toBe('talos-appearance-tab-design')
        expect(designTab?.getAttribute('aria-controls')).toBe('talos-appearance-panel-design')
        expect(panel?.id).toBe('talos-appearance-panel-design')
        expect(panel?.getAttribute('aria-labelledby')).toBe('talos-appearance-tab-design')
    })

    it('activates Motion with ArrowRight and preserves roving focus', async () => {
        const { container } = mountAppearance()
        let tabs = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="tab"]'))

        expect(tabs.map((tab) => tab.tabIndex)).toEqual([0, -1, -1])
        tabs[0].focus()
        tabs[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
        await nextTick()

        tabs = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="tab"]'))
        expect(tabs[1].getAttribute('aria-selected')).toBe('true')
        expect(document.activeElement?.id).toBe('talos-appearance-tab-motion')
        expect(container.querySelector('[role="tabpanel"]')?.id).toBe('talos-appearance-panel-motion')
    })

    it('routes Motion to the canonical Theme Engine without rendering legacy writers', async () => {
        const { container, themeEngineOpenCount } = mountAppearance()
        const motionTab = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="tab"]'))
            .find((tab) => tab.textContent?.includes('Motion'))

        motionTab?.click()
        await nextTick()

        expect(container.querySelector('[aria-label="Settings theme motion"]')).toBeNull()
        expect(container.querySelector('[aria-label="Settings use simple animation"]')).toBeNull()
        expect(container.querySelector('[aria-label="Settings disable background motion"]')).toBeNull()
        expect(container.querySelector('[aria-label="Settings disable procedural background"]')).toBeNull()

        const openButton = Array.from(container.querySelectorAll<HTMLButtonElement>('button'))
            .find((button) => button.textContent?.includes('Open Theme Engine'))
        expect(openButton).toBeTruthy()
        openButton?.click()
        await nextTick()
        expect(themeEngineOpenCount()).toBe(1)
    })

    it('offers the persisted Drawer/fullscreen choice in Appearance design settings', async () => {
        const { container, mobilePresentationUpdates } = mountAppearance()
        const trigger = container.querySelector<HTMLElement>('[aria-label="Mobile tool window presentation"]')
        expect(trigger?.tagName).toBe('BUTTON')

        if (trigger) firePointer(trigger, 'pointerdown')
        await settle()

        const values = Array.from(document.querySelectorAll<HTMLElement>('[data-testid="talos-themed-select-item"]'))
            .map((option) => option.getAttribute('data-value'))
        expect(values).toEqual(['drawer', 'fullscreen'])

        const fullscreen = document.querySelector<HTMLElement>('[data-value="fullscreen"]')
        fullscreen?.focus()
        fullscreen?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
        await settle()

        expect(mobilePresentationUpdates).toEqual(['fullscreen'])
    })

    it('renders independent numeric Interface and Message scale controls instead of the legacy size select', async () => {
        const { container, uiScaleUpdates, messageScaleUpdates } = mountAppearance(false, {
            uiScale: 1.15,
            messageScale: 1.25,
        })

        expect(container.querySelector('[aria-label="Chat message size"]')).toBeNull()
        const uiRange = container.querySelector<HTMLInputElement>('input[type="range"][aria-label="Interface scale"]')
        const messageRange = container.querySelector<HTMLInputElement>('input[type="range"][aria-label="Message scale"]')
        expect(uiRange?.value).toBe('1.15')
        expect(messageRange?.value).toBe('1.25')
        expect(container.textContent).toContain('115%')
        expect(container.textContent).toContain('125%')

        if (uiRange) {
            uiRange.value = '1.2'
            uiRange.dispatchEvent(new Event('input', { bubbles: true }))
        }
        if (messageRange) {
            messageRange.value = '1.3'
            messageRange.dispatchEvent(new Event('input', { bubbles: true }))
        }
        await nextTick()

        expect(uiScaleUpdates).toEqual([1.2])
        expect(messageScaleUpdates).toEqual([1.3])
    })

    it('locks both scale controls when workspace appearance policy is locked', () => {
        const { container } = mountAppearance(false, { themePolicyLocked: true })

        expect(container.querySelector<HTMLInputElement>('[aria-label="Interface scale"]')?.disabled).toBe(true)
        expect(container.querySelector<HTMLInputElement>('[aria-label="Message scale"]')?.disabled).toBe(true)
        expect(container.querySelector<HTMLButtonElement>('[aria-label="Reset Interface scale"]')?.disabled).toBe(true)
        expect(container.querySelector<HTMLButtonElement>('[aria-label="Reset Message scale"]')?.disabled).toBe(true)
    })
})
