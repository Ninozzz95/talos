import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const resourcesRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const appCssPath = join(resourcesRoot, '..', 'css', 'app.css')
const appCss = readFileSync(appCssPath, 'utf8')
const sourceRoots = [
    join(resourcesRoot, 'components', 'talos'),
    join(resourcesRoot, 'components', 'ui'),
    join(resourcesRoot, 'composables'),
    join(resourcesRoot, 'lib'),
]
const forbiddenStatusUtility = /(?:^|[\s"'`])(?:[a-z-]+:)*(?:text|bg|border|ring|outline|divide|decoration|fill|stroke|from|via|to)-(?:red|green|amber)-/i
const legacyAccentContrast = /--talos-accent-contrast/
const removedPresetFontAssignment = /font(?:Ui|Mono):\s*['"](?:Inter|Geist|DM Sans|IBM Plex Mono|Source Sans 3|Aptos|Cascadia Mono|Arial|Lora|Roboto(?: Mono)?)['"]/

function sourceFiles(root: string): string[] {
    return readdirSync(root).flatMap((entry) => {
        const path = join(root, entry)
        if (statSync(path).isDirectory()) return sourceFiles(path)
        if (!/\.(vue|ts|js)$/.test(path) || /\.test\.(ts|js)$/.test(path)) return []
        return [path]
    })
}

function contractSourceFiles() {
    return [...sourceRoots.flatMap((root) => sourceFiles(root)), appCssPath]
}

describe('TALOS source token contract', () => {
    it('does not use raw red, green, or amber status utilities', () => {
        const violations = contractSourceFiles().filter((path) => forbiddenStatusUtility.test(readFileSync(path, 'utf8')))

        expect(violations).toEqual([])
    })

    it('does not use the removed accent contrast token', () => {
        const violations = contractSourceFiles().filter((path) => legacyAccentContrast.test(readFileSync(path, 'utf8')))

        expect(violations).toEqual([])
    })

    it('covers TALOS components, UI primitives, composables, libraries, and app.css', () => {
        const normalized = contractSourceFiles().map((path) => path.replaceAll('\\', '/'))

        expect(normalized.some((path) => path.endsWith('/components/talos/models/TalosProviderIcon.vue'))).toBe(true)
        expect(normalized.some((path) => path.endsWith('/components/ui/Button.vue'))).toBe(true)
        expect(normalized.some((path) => path.endsWith('/composables/useTalosWorkspaceTheme.ts'))).toBe(true)
        expect(normalized.some((path) => path.endsWith('/lib/talosThemes.ts'))).toBe(true)
        expect(normalized.some((path) => path.endsWith('/css/app.css'))).toBe(true)
    })

    it('does not assign removed unbundled families in preset metadata', () => {
        const themeSource = readFileSync(join(resourcesRoot, 'lib', 'talosThemes.ts'), 'utf8')

        expect(themeSource).not.toMatch(removedPresetFontAssignment)
    })

    it('limits motion-owned transitions to transform and opacity', () => {
        const motionStart = appCss.indexOf('.talos-chat-composer-shell')
        const motionEnd = appCss.indexOf('.talos-window-resize-handle')
        const motionCss = appCss.slice(motionStart, motionEnd)
        const transitions = [...motionCss.matchAll(/transition(?:-property)?\s*:\s*([^;]+);/g)].map((match) => match[1])

        expect(transitions.length).toBeGreaterThan(0)
        for (const transition of transitions) {
            expect(transition).not.toMatch(/\b(?:all|color|border-color|background-color|box-shadow|filter)\b/)
        }

        const feedbackStart = appCss.indexOf('@keyframes talos-feedback-pulse')
        const feedbackEnd = appCss.indexOf('@keyframes talos-dag-pulse')
        expect(appCss.slice(feedbackStart, feedbackEnd)).not.toMatch(/\b(?:box-shadow|border-color|background|filter)\b/)
    })

    it('suppresses every owned UI and background motion surface', () => {
        for (const selector of [
            '.talos-chat-composer-shell',
            '.talos-action-composer',
            '.talos-composer-popover',
            '.talos-command-row',
            '.talos-theme-preset-card',
            '.talos-left-rail',
            '.talos-motion-control',
        ]) {
            expect(appCss).toContain(`.talos-ui-motion-disabled ${selector}`)
            expect(appCss).toContain(`.talos-motion-paused ${selector}`)
        }

        for (const selector of ['.talos-dag-grid', '.talos-effect-layer', '.talos-procedural-canvas']) {
            expect(appCss).toContain(`.talos-motion-paused ${selector}`)
        }

        const reducedMotionCss = appCss.slice(
            appCss.indexOf('@media (prefers-reduced-motion: reduce)'),
            appCss.indexOf('@media (prefers-reduced-data: reduce)'),
        )
        const reducedDataCss = appCss.slice(
            appCss.indexOf('@media (prefers-reduced-data: reduce)'),
            appCss.indexOf('.talos-window-resize-handle'),
        )
        expect(reducedMotionCss).toContain('.talos-shell .talos-motion-preview-surface')
        expect(reducedDataCss).toContain('.talos-shell .talos-motion-preview-surface')
    })

    it('suppresses primitive transitions for UI-off and operating-system reduced motion', () => {
        expect(appCss).toContain('.talos-ui-motion-disabled *')
        expect(appCss).toContain('.talos-ui-motion-disabled *::before')
        expect(appCss).toContain('.talos-ui-motion-disabled *::after')

        const reducedMotionCss = appCss.slice(
            appCss.indexOf('@media (prefers-reduced-motion: reduce)'),
            appCss.indexOf('@media (prefers-reduced-data: reduce)'),
        )
        expect(reducedMotionCss).toContain('.talos-shell *')
        expect(reducedMotionCss).toContain('.talos-shell *::before')
        expect(reducedMotionCss).toContain('.talos-shell *::after')
    })

    it('routes the workspace resolved background motion signal into the procedural canvas', () => {
        const workspace = readFileSync(join(resourcesRoot, 'components', 'talos', 'workspace', 'TalosWorkspace.vue'), 'utf8')
        const background = readFileSync(join(resourcesRoot, 'components', 'talos', 'workspace', 'TalosProceduralBackground.vue'), 'utf8')

        expect(workspace).toContain(':background-motion-enabled="workspaceBackgroundMotionEnabled"')
        expect(workspace).toContain(':palette-key="workspaceBackgroundPaletteKey"')
        expect(background).toContain("toRef(props, 'backgroundMotionEnabled')")
        expect(background).toContain("toRef(props, 'paletteKey')")
    })

    it('scopes every Advanced area contract to an owned product surface', () => {
        for (const [area, selector] of [
            ['sidebar', ':is(.talos-left-rail, .talos-mobile-rail)'],
            ['chat', '.talos-chat-scroll-root'],
            ['composer', '.talos-composer-area'],
            ['window', '.talos-tool-window'],
            ['header', '.talos-workspace-header'],
            ['button', '.talos-ui-button'],
            ['card', '.talos-ui-card'],
            ['code', '.talos-code-block'],
        ] as const) {
            expect(appCss).toContain(`.talos-area-${area}-customized ${selector}`)
            expect(appCss).toContain(`--talos-area-${area}-`)
        }

        const messageContent = readFileSync(join(resourcesRoot, 'components', 'talos', 'chat', 'TalosMessageContent.vue'), 'utf8')
        expect(messageContent).toContain('var(--talos-code-accent)')
        expect(messageContent).toContain('border-left: 2px solid var(--talos-code-accent)')
        expect(messageContent).not.toMatch(/(?:color|outline):\s*[^;]*var\(--talos-code-accent\)/)
    })
})
