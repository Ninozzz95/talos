import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const resourcesRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const appCssPath = join(resourcesRoot, '..', 'css', 'app.css')
const appCss = readFileSync(appCssPath, 'utf8')
const simpleMotionCss = readFileSync(join(resourcesRoot, '..', 'css', 'talos-motion-v6-simple.css'), 'utf8')
const complexMotionCss = readFileSync(join(resourcesRoot, '..', 'css', 'talos-motion-v6-complex.css'), 'utf8')
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

function cssKeyframeSteps(name: string): string[] {
    const marker = `@keyframes ${name}`
    const start = appCss.indexOf(marker)
    if (start < 0) return []

    const open = appCss.indexOf('{', start + marker.length)
    let depth = 0
    let close = -1
    for (let index = open; index < appCss.length; index += 1) {
        if (appCss[index] === '{') depth += 1
        if (appCss[index] === '}') depth -= 1
        if (depth === 0) {
            close = index
            break
        }
    }
    if (open < 0 || close < 0) return []

    return [...appCss.slice(open + 1, close).matchAll(/(?:from|to|\d+%)\s*\{([^}]+)\}/g)]
        .map((match) => match[1])
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
        const forbiddenMotionProperty = /\b(?:all|color|border-color|background-color|box-shadow|filter|width|height|top|right|bottom|left|margin(?:-[a-z-]+)?|padding(?:-[a-z-]+)?)\b/
        const transitions = [...appCss.matchAll(/transition(?:-property)?\s*:\s*([^;]+);/g)].map((match) => match[1])
        const willChangeDeclarations = [...appCss.matchAll(/will-change\s*:\s*([^;]+);/g)].map((match) => match[1])

        expect(transitions.length).toBeGreaterThan(0)
        for (const transition of transitions) {
            expect(transition).not.toMatch(forbiddenMotionProperty)
        }
        for (const willChange of willChangeDeclarations) {
            expect(willChange).not.toMatch(forbiddenMotionProperty)
        }

        const feedbackStart = appCss.indexOf('@keyframes talos-feedback-pulse')
        const feedbackEnd = appCss.indexOf('@keyframes talos-feedback-trace')
        expect(appCss.slice(feedbackStart, feedbackEnd)).not.toMatch(/\b(?:box-shadow|border-color|background|filter)\b/)
    })

    it('keeps every rail and composer popover keyframe exact-target paintable', () => {
        for (const name of [
            'talos-sidebar-expand',
            'talos-sidebar-collapse',
            'talos-composer-popover-in',
            'talos-composer-popover-out',
        ]) {
            const steps = cssKeyframeSteps(name)
            expect(steps.length, name).toBeGreaterThanOrEqual(2)
            for (const step of steps) {
                expect(step, `${name} opacity`).toMatch(/\bopacity\s*:/)
                expect(step, `${name} transform`).toMatch(/\btransform\s*:/)
            }
        }
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

        expect(appCss).toContain('.talos-motion-paused .talos-procedural-canvas')
        expect(simpleMotionCss).toContain('[data-talos-motion-stage] .talos-v6-simple-layer')
        expect(simpleMotionCss).toContain('@media (prefers-reduced-motion: reduce)')
        expect(complexMotionCss).toContain('[data-talos-motion-stage] .talos-v6-complex-canvas')
        expect(complexMotionCss).toContain('@media (prefers-reduced-motion: reduce)')

        const reducedMotionCss = appCss.slice(
            appCss.indexOf('@media (prefers-reduced-motion: reduce)'),
            appCss.indexOf('@media (prefers-reduced-data: reduce)'),
        )
        const reducedDataStart = appCss.indexOf('@media (prefers-reduced-data: reduce)')
        const reducedDataCss = appCss.slice(
            reducedDataStart,
            appCss.indexOf('.talos-window-resize-handle', reducedDataStart),
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

        expect(workspace).toContain(':effective-mode="workspaceMotionV6Decision.effectiveMode"')
        expect(workspace).toContain(':input="workspaceMotionV6SceneInput"')
        expect(background).toContain('TalosMotionStage')
        expect(background).not.toContain('useTalosProceduralCanvas')
    })

    it('does not dim the canonical motion surface with a chat-only background wash', () => {
        const chatThreadRules = [...appCss.matchAll(/\.talos-chat-thread\s*\{([^}]*)\}/g)]
            .map((match) => match[1])

        expect(chatThreadRules.length).toBeGreaterThan(0)
        for (const rule of chatThreadRules) {
            expect(rule).not.toMatch(/\bbackground(?:-image)?\s*:/)
        }
    })

    it('keeps legacy motion keys as migration input instead of active UI or runtime authority', () => {
        const appearance = readFileSync(join(resourcesRoot, 'components', 'talos', 'settings', 'TalosSettingsAppearancePanel.vue'), 'utf8')
        const settings = readFileSync(join(resourcesRoot, 'components', 'talos', 'settings', 'TalosSettingsCenter.vue'), 'utf8')
        const customize = readFileSync(join(resourcesRoot, 'components', 'talos', 'settings', 'theme-engine', 'TalosThemeCustomize.vue'), 'utf8')
        const editorState = readFileSync(join(resourcesRoot, 'composables', 'useTalosThemeEditorState.ts'), 'utf8')
        const namedLibrary = readFileSync(join(resourcesRoot, 'composables', 'useTalosNamedThemeLibrary.ts'), 'utf8')
        const persistence = readFileSync(join(resourcesRoot, 'composables', 'useTalosThemeEditorPersistence.ts'), 'utf8')
        const workspaceTheme = readFileSync(join(resourcesRoot, 'composables', 'useTalosWorkspaceTheme.ts'), 'utf8')
        const proceduralBackground = readFileSync(join(resourcesRoot, 'components', 'talos', 'workspace', 'TalosProceduralBackground.vue'), 'utf8')

        for (const source of [appearance, settings, persistence]) {
            expect(source).not.toMatch(/persistMotionMode|persistMotionDisabled|persistSimpleAnimation|persistBackgroundDisabled/)
        }
        expect(appearance).not.toMatch(/updateThemeMotion|themeMotionDisabled|themeSimpleAnimation|themeBackgroundDisabled/)
        expect(settings).not.toMatch(/preferences\.theme_(?:motion|motion_disabled|simple_animation|background_disabled)/)
        expect(customize).not.toMatch(/uiAnimationProfile|uiAnimationForm|motionPreviewStyle|Animation profile|Open\/close style/)
        expect(customize).not.toMatch(/Background effect|Effect intensity/)
        expect(editorState).not.toMatch(/preferences\.theme_(?:motion|motion_disabled|simple_animation|background_disabled)/)
        expect(editorState).not.toMatch(/preferences\.ui_animation_(?:profile|customization)/)
        expect(namedLibrary).not.toMatch(/(?:motion|ui_animation_profile|ui_animation_customization):\s*options\.editor/)
        expect(workspaceTheme).not.toContain("from './useTalosMotion'")
        expect(workspaceTheme).not.toMatch(/preferences\?\.theme_(?:motion|motion_disabled|simple_animation|background_disabled)/)
        expect(workspaceTheme).not.toContain('talosThemeMotionStyle')
        expect(workspaceTheme).not.toContain('talosUiAnimationStyle')
        expect(workspaceTheme).not.toContain('talosBackgroundEffectFromCustomization')
        expect(workspaceTheme).not.toContain('talos-effect-')
        expect(proceduralBackground).not.toMatch(/talos-background-effect|data-effect=/)
        expect(proceduralBackground).toContain('data-testid="talos-motion-background"')
        expect(proceduralBackground).toContain(':data-scene-id="sceneId"')
    })

    it('does not retain the superseded window keyframes or duration token', () => {
        const themeSource = readFileSync(join(resourcesRoot, 'lib', 'talosThemes.ts'), 'utf8')

        expect(appCss).not.toMatch(/@keyframes talos-window-(?:open-from-sidebar|restore-from-dock|minimize-to-dock|expand)/)
        expect(appCss).not.toContain('--talos-window-minimize-duration')
        expect(themeSource).not.toContain('--talos-window-minimize-duration')
        expect(themeSource).not.toContain('talosThemeMotionStyle')
        expect(themeSource).not.toContain('talosUiAnimationStyle')
        expect(appCss).not.toMatch(/\.talos-(?:dag-grid|dag-line|dag-node|effect-layer|trace-stream)/)
        expect(appCss).not.toMatch(/@keyframes talos-(?:dag-pulse|grid-drift|dag-ribbon|node-alert|trace-rain|signal-mesh|node-route)/)
    })

    it('removes the superseded procedural canvas runtime after the V6 stage cutover', () => {
        for (const path of [
            ['composables', 'useTalosProceduralCanvas.ts'],
            ['composables', 'useTalosProceduralCanvas.test.ts'],
            ['composables', 'useTalosMotion.ts'],
            ['composables', 'useTalosMotion.test.ts'],
            ['lib', 'talosMotion.ts'],
            ['lib', 'talosMotion.test.ts'],
        ]) {
            expect(existsSync(join(resourcesRoot, ...path))).toBe(false)
        }
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
