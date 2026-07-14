import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = (relativePath: string) => readFileSync(new URL(relativePath, import.meta.url), 'utf8')

describe('TALOS canonical guide surface contract', () => {
    it.each([
        ['Runtime', '../runs/TalosRunTimeline.vue', 'runtime.${item.id}'],
        ['Cookbook', '../cookbook/TalosCookbook.vue', 'cookbook.${item.id}'],
        ['Theme', '../settings/TalosThemeEngine.vue', 'theme.${item.id}'],
        ['Settings', '../settings/TalosSettingsCenter.vue', 'settings.${item.id}'],
    ])('%s internal tabs use canonical sibling information actions', (_name, path, guideExpression) => {
        const contents = source(path)

        expect(contents).toContain('TalosGuideInfoButton')
        expect(contents).toContain(guideExpression)
        expect(contents).toContain('#item-action')
    })

    it('binds every Appearance group to its canonical guide id', () => {
        const contents = source('../settings/TalosSettingsAppearancePanel.vue')

        expect(contents).toContain('TalosGuideInfoButton')
        expect(contents).toContain('settings.appearance.${group.id}')
    })
})
