// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import TalosThemeLibrary from './TalosThemeLibrary.vue'
import type { TalosNamedTheme } from '../../../../lib/talosThemes'

const apps: Array<ReturnType<typeof createApp>> = []

afterEach(() => {
    apps.splice(0).forEach((app) => app.unmount())
    document.body.replaceChildren()
})

const theme: TalosNamedTheme = {
    id: 'calm-library-theme',
    name: 'Calm library theme',
    base_theme: 'calm',
    theme_mode: 'dark',
    tokens: {},
    area_tokens: {},
    motion: 'cinematic',
    ui_animation_profile: 'preset',
    ui_animation_customization: {},
    chat_layout: {
        message_scale: 1.25,
        composer_mode: 'full',
        message_style: 'sections',
        advanced_rail_expanded: false,
        mobile_window_presentation: 'drawer',
    },
    created_at: '2026-07-10T12:00:00.000Z',
    updated_at: '2026-07-10T12:00:00.000Z',
}

describe('TalosThemeLibrary', () => {
    it('locks every mutating library action while a settings write is in flight', async () => {
        const host = document.createElement('div')
        document.body.append(host)
        const app = createApp({
            render: () => h(TalosThemeLibrary, {
                library: [theme],
                activeCustomThemeId: null,
                renamingThemeId: null,
                renameThemeName: '',
                exportJson: '',
                importJson: '',
                deleteThemeId: null,
                exportFeedback: '',
                disabled: false,
                saving: true,
            }),
        })
        apps.push(app)
        app.mount(host)
        await nextTick()

        for (const label of ['Apply', 'Rename', 'Duplicate', 'Delete']) {
            const button = Array.from(host.querySelectorAll<HTMLButtonElement>('button'))
                .find((candidate) => candidate.textContent?.trim() === label)
            expect(button, `${label} must be present`).toBeTruthy()
            expect(button?.disabled, `${label} must be locked while saving`).toBe(true)
        }
    })

    it('emits a Calm theme with its canonical numeric chat layout unchanged', async () => {
        const host = document.createElement('div')
        document.body.append(host)
        const applied: TalosNamedTheme[] = []
        const app = createApp({
            render: () => h(TalosThemeLibrary, {
                library: [theme],
                activeCustomThemeId: null,
                renamingThemeId: null,
                renameThemeName: '',
                exportJson: '',
                importJson: '',
                deleteThemeId: null,
                exportFeedback: '',
                disabled: false,
                saving: false,
                onApply: (value: TalosNamedTheme) => applied.push(value),
            }),
        })
        apps.push(app)
        app.mount(host)
        await nextTick()

        expect(host.textContent).toContain('calm')
        Array.from(host.querySelectorAll<HTMLButtonElement>('button'))
            .find((button) => button.textContent?.trim() === 'Apply')
            ?.click()
        await nextTick()

        expect(applied).toEqual([theme])
        expect(applied[0].chat_layout?.message_scale).toBe(1.25)
        expect(applied[0].chat_layout).not.toHaveProperty('bubble_scale')
    })
})
