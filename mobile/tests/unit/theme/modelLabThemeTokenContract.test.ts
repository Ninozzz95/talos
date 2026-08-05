import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const SURFACES = [
    'src/components/talos/models/TalosMobileModelLabHub.vue',
    'src/components/talos/models/TalosMobileDeviceCapacityCard.vue',
    'src/components/talos/models/TalosMobileProviderRuntimePanel.vue',
    'src/components/talos/models/TalosMobileHuggingFaceAccessCard.vue',
    'src/components/talos/models/TalosMobileModelCatalog.vue',
    'src/components/talos/models/TalosMobileLocalModels.vue',
    'src/components/talos/models/TalosModelFitBar.vue',
    'src/components/talos/models/TalosMobileModelAdvancedOptions.vue',
    'src/components/shell/TalosMobileDownloadCenterTrigger.vue',
    'src/screens/SettingsModelsScreen.vue',
    'src/screens/SettingsModelsProvidersScreen.vue',
    'src/screens/SettingsModelsCatalogScreen.vue',
    'src/screens/SettingsModelsLocalScreen.vue',
] as const

const SETTINGS_MODEL_LAB_ROUTE = 'src/components/talos/settings/TalosMobileSettingsCenter.vue'

function withoutComments(source: string): string {
    const clean = source
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|\s)\/\/.*$/gm, '$1')

    // Exact structural exception: `min-w-0` is the Tailwind flex/grid
    // truncation primitive. Zero cannot vary by identity and the ledger
    // explicitly permits truncation dimensions; keeping this literal makes
    // overflow behavior auditable without inventing a visual token for zero.
    return clean.split('min-w-0').join('')
}

export function modelLabThemeViolations(source: string): string[] {
    const clean = withoutComments(source)
    const violations: string[] = []
    const checks: Array<[string, RegExp]> = [
        ['literal color', /#[0-9a-f]{3,8}\b|\brgba?\(/i],
        ['local var fallback', /var\(\s*--[\w-]+\s*,/],
        ['palette class', /\b(?:bg|text|border|ring)-(?:white|black|red|green|blue|amber|yellow|gray|slate|zinc|neutral|stone)(?:-|\b)/],
        ['local shadow', /\bshadow(?:-|\b)|box-shadow\s*:/],
        ['literal duration', /\bduration-\d+\b|transition-duration\s*:/],
        ['literal radius', /\brounded(?:-(?!full\b|\[var\()[^\s"']+)?(?=\s|["'])/],
        ['literal spacing', /\b(?:p[trblxy]?|m[trblxy]?|gap|space-[xy]|size|min-h|min-w|h|w)-(?:\d+(?:\.\d+)?)(?=\s|["'])/],
    ]
    for (const [label, pattern] of checks) {
        if (pattern.test(clean)) violations.push(label)
    }
    return violations
}

function settingsModelLabRouteSource(source: string): string {
    const marker = source.indexOf('data-testid="settings-model-lab-link"')
    const start = source.lastIndexOf('<RouterLink', marker)
    const close = source.indexOf('</RouterLink>', marker)
    if (marker < 0 || start < 0 || close < 0) return source
    return source.slice(start, close + '</RouterLink>'.length)
}

describe('Model Lab Theme Engine boundary', () => {
    it('rejects every forbidden shortcut in isolation', () => {
        expect(modelLabThemeViolations('<div class="p-4" />')).toContain('literal spacing')
        expect(modelLabThemeViolations('<div class="rounded-xl" />')).toContain('literal radius')
        expect(modelLabThemeViolations('<div class="bg-red-500" />')).toContain('palette class')
        expect(modelLabThemeViolations('<div style="color:#ffd21e" />')).toContain('literal color')
        expect(modelLabThemeViolations('<div class="bg-[var(--talos-panel,#000)]" />')).toContain('local var fallback')
        expect(modelLabThemeViolations('<div class="duration-300 shadow-lg" />'))
            .toEqual(expect.arrayContaining(['literal duration', 'local shadow']))
    })

    it('keeps every Model Lab surface token-only', () => {
        const failures = SURFACES.flatMap((file) => {
            const source = readFileSync(join(process.cwd(), file), 'utf8')
            return modelLabThemeViolations(source).map((violation) => `${file}: ${violation}`)
        })
        expect(failures).toEqual([])
    })

    it('C45-RED-12B names the touch-target token on all five local-model actions', () => {
        const source = readFileSync(
            join(process.cwd(), 'src/components/talos/models/TalosMobileLocalModels.vue'),
            'utf8',
        )
        const target = 'min-h-touch'

        for (const testId of [
            'talos-models-import',
            'talos-models-cancel-rename',
            'talos-models-rename-save',
            'talos-models-cancel-delete',
            'talos-models-delete-confirm',
        ]) {
            const start = source.indexOf(`data-testid="${testId}"`)
            expect(start, testId).toBeGreaterThanOrEqual(0)
            expect(source.slice(start, start + 260), testId).toContain(target)
        }
    })

    it('keeps the routed Model Lab entry in Settings on the same token boundary', () => {
        const source = readFileSync(join(process.cwd(), SETTINGS_MODEL_LAB_ROUTE), 'utf8')

        expect(modelLabThemeViolations(settingsModelLabRouteSource(source))).toEqual([])
    })
})
