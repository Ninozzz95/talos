// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest'
import { createApp, defineComponent, h, nextTick } from 'vue'
import TalosLeftRail from './TalosLeftRail.vue'
import type { TalosThemeId } from '../../../lib/talosThemes'

// reka dialogs/menus inside the rail touch these APIs jsdom omits.
if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => undefined
}

let app: ReturnType<typeof createApp> | undefined

afterEach(() => {
    app?.unmount()
    app = undefined
    document.body.replaceChildren()
})

// The rail mounts async children (session menu/dialog); drain micro- and
// macro-tasks so the render is settled even when the suite runs under load.
async function settle() {
    await nextTick()
    await new Promise((resolve) => setTimeout(resolve, 0))
    await nextTick()
}

function mountRail(developmentMode: boolean) {
    const shell = document.createElement('div')
    shell.className = 'talos-shell talos-ui-motion-disabled'
    const mountPoint = document.createElement('div')
    shell.append(mountPoint)
    document.body.append(shell)

    app = createApp(defineComponent({
        setup() {
            return () => h(TalosLeftRail, {
                activeIds: [],
                theme: 'ember' as TalosThemeId,
                width: 280,
                visibility: {},
                sessions: [],
                developmentMode,
            })
        },
    }))
    app.mount(mountPoint)
}

describe('TalosLeftRail station acronyms', () => {
    it('hides the station code chips when not in development mode (production)', async () => {
        mountRail(false)
        await settle()

        expect(document.querySelectorAll('.talos-chip-code')).toHaveLength(0)
    })

    it('shows the station code chips in development mode', async () => {
        mountRail(true)
        await settle()

        const codes = Array.from(document.querySelectorAll('.talos-chip-code')).map((node) => node.textContent)
        expect(codes.length).toBeGreaterThan(0)
        expect(codes).toContain('BRW')
        expect(codes).toContain('LAB')
    })
})
