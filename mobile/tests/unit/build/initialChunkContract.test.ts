import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { afterEach, describe, expect, it } from 'vitest'

const SCRIPT = resolve(process.cwd(), 'scripts/verify-initial-chunk.mjs')
const temporaryDirectories: string[] = []

interface FixtureOptions {
    initialBytes?: number
    sqliteIsDynamic?: boolean
    eagerRoute?: string
    eagerMessageRenderer?: boolean
    eagerMessageOverflowMenu?: boolean
    eagerPromptEnhancer?: boolean
    eagerSlashCommandMenu?: boolean
    eagerModelCatalog?: boolean
    eagerModelAdvanced?: boolean
    eagerToolset?: boolean
    syntheticSettingsEntry?: boolean
}

function createFixture(options: FixtureOptions = {}): string {
    const root = mkdtempSync(join(tmpdir(), 'talos-initial-chunk-'))
    temporaryDirectories.push(root)
    mkdirSync(join(root, '.vite'), { recursive: true })
    mkdirSync(join(root, 'assets'), { recursive: true })
    const sqliteKey = 'src/repositories/productionChatRepository.ts'
    const messageRendererKey = 'src/components/chat/TalosMobileMessageContent.vue'
    const messageOverflowMenuKey = 'src/components/chat/TalosMobileMessageOverflowMenu.vue'
    const promptEnhancerKey = 'src/components/chat/TalosMobilePromptEnhancerPopover.vue'
    const slashCommandMenuKey = 'src/components/chat/TalosMobileSlashCommandMenu.vue'
    const modelCatalogKey = 'src/components/talos/models/TalosMobileModelCatalog.vue'
    const modelAdvancedKey = 'src/components/talos/models/TalosMobileModelAdvancedOptions.vue'
    // The tool suite: loaded on the first send, never at boot.
    const toolsetKey = 'src/lib/tools/toolset.ts'
    const agentLoopKey = 'src/lib/tools/agentLoop.ts'
    const toolConsentKey = 'src/components/chat/TalosMobileToolConsentSheet.vue'
    const chatMediaKey = 'src/components/chat/TalosMobileChatMediaPanel.vue'
    const toolsetIsDynamic = options.eagerToolset !== true
    const sqliteIsDynamic = options.sqliteIsDynamic ?? true
    const messageRendererIsDynamic = options.eagerMessageRenderer !== true
    const messageOverflowMenuIsDynamic = options.eagerMessageOverflowMenu !== true
    const promptEnhancerIsDynamic = options.eagerPromptEnhancer !== true
    const slashCommandMenuIsDynamic = options.eagerSlashCommandMenu !== true
    const modelCatalogIsDynamic = options.eagerModelCatalog !== true
    const modelAdvancedIsDynamic = options.eagerModelAdvanced !== true
    const routeKeys = [
        'src/screens/ResearchScreen.vue',
        'src/screens/RunsScreen.vue',
        'src/screens/ContextScreen.vue',
        'src/screens/SettingsScreen.vue',
    ]
    const settingsSourceKey = 'src/screens/SettingsScreen.vue'
    const settingsManifestKey = options.syntheticSettingsEntry === true
        ? '_SettingsScreen-fixture.js'
        : settingsSourceKey
    const manifestKeyForRoute = (key: string) => key === settingsSourceKey ? settingsManifestKey : key
    const dynamicRouteKeys = routeKeys
        .filter((key) => key !== options.eagerRoute)
        .map(manifestKeyForRoute)
    const staticRouteKeys = routeKeys
        .filter((key) => key === options.eagerRoute)
        .map(manifestKeyForRoute)
    const manifest: Record<string, Record<string, unknown>> = {
        'index.html': {
            file: 'assets/index.js',
            isEntry: true,
            imports: [
                ...(sqliteIsDynamic ? [] : [sqliteKey]),
                ...(messageRendererIsDynamic ? [] : [messageRendererKey]),
                ...(messageOverflowMenuIsDynamic ? [] : [messageOverflowMenuKey]),
                ...(promptEnhancerIsDynamic ? [] : [promptEnhancerKey]),
                ...(slashCommandMenuIsDynamic ? [] : [slashCommandMenuKey]),
                ...(toolsetIsDynamic ? [] : [toolsetKey]),
                ...staticRouteKeys,
            ],
            dynamicImports: [
                ...(sqliteIsDynamic ? [sqliteKey] : []),
                ...(messageRendererIsDynamic ? [messageRendererKey] : []),
                ...(messageOverflowMenuIsDynamic ? [messageOverflowMenuKey] : []),
                ...(promptEnhancerIsDynamic ? [promptEnhancerKey] : []),
                ...(slashCommandMenuIsDynamic ? [slashCommandMenuKey] : []),
                ...(toolsetIsDynamic ? [toolsetKey] : []),
                agentLoopKey,
                toolConsentKey,
                chatMediaKey,
                ...dynamicRouteKeys,
            ],
        },
        [sqliteKey]: {
            file: 'assets/sqlite.js',
            isDynamicEntry: sqliteIsDynamic,
        },
        [messageRendererKey]: {
            file: 'assets/message-renderer.js',
            isDynamicEntry: messageRendererIsDynamic,
        },
        [messageOverflowMenuKey]: {
            file: 'assets/message-overflow-menu.js',
            isDynamicEntry: messageOverflowMenuIsDynamic,
        },
        [promptEnhancerKey]: {
            file: 'assets/prompt-enhancer.js',
            isDynamicEntry: promptEnhancerIsDynamic,
        },
        [slashCommandMenuKey]: {
            file: 'assets/slash-command-menu.js',
            isDynamicEntry: slashCommandMenuIsDynamic,
        },
        [modelCatalogKey]: {
            file: 'assets/model-catalog.js',
            isDynamicEntry: modelCatalogIsDynamic,
        },
        [modelAdvancedKey]: {
            file: 'assets/model-advanced.js',
            isDynamicEntry: modelAdvancedIsDynamic,
        },
        [toolsetKey]: {
            file: 'assets/toolset.js',
            isDynamicEntry: toolsetIsDynamic,
        },
        [agentLoopKey]: {
            file: 'assets/agent-loop.js',
            isDynamicEntry: true,
        },
        [toolConsentKey]: {
            file: 'assets/tool-consent.js',
            isDynamicEntry: true,
        },
        [chatMediaKey]: {
            file: 'assets/chat-media.js',
            isDynamicEntry: true,
        },
    }
    for (const [index, sourceKey] of routeKeys.entries()) {
        const key = manifestKeyForRoute(sourceKey)
        const file = sourceKey === settingsSourceKey && options.syntheticSettingsEntry === true
            ? 'assets/SettingsScreen-fixture.js'
            : `assets/route-${index}.js`
        manifest[key] = {
            file,
            isDynamicEntry: sourceKey !== options.eagerRoute,
            ...(key === sourceKey ? { src: sourceKey } : {}),
            ...(sourceKey === settingsSourceKey ? {
                imports: [
                    ...(modelCatalogIsDynamic ? [] : [modelCatalogKey]),
                    ...(modelAdvancedIsDynamic ? [] : [modelAdvancedKey]),
                ],
                dynamicImports: [
                    ...(modelCatalogIsDynamic ? [modelCatalogKey] : []),
                    ...(modelAdvancedIsDynamic ? [modelAdvancedKey] : []),
                ],
            } : {}),
        }
        writeFileSync(join(root, file), 'r'.repeat(16))
    }
    writeFileSync(join(root, '.vite', 'manifest.json'), JSON.stringify(manifest))
    writeFileSync(join(root, 'assets', 'index.js'), 'x'.repeat(options.initialBytes ?? 32))
    writeFileSync(join(root, 'assets', 'sqlite.js'), 's'.repeat(64))
    writeFileSync(join(root, 'assets', 'message-renderer.js'), 'm'.repeat(64))
    writeFileSync(join(root, 'assets', 'message-overflow-menu.js'), 'o'.repeat(64))
    writeFileSync(join(root, 'assets', 'prompt-enhancer.js'), 'p'.repeat(64))
    writeFileSync(join(root, 'assets', 'slash-command-menu.js'), 'c'.repeat(64))
    writeFileSync(join(root, 'assets', 'model-catalog.js'), 'l'.repeat(64))
    writeFileSync(join(root, 'assets', 'model-advanced.js'), 'a'.repeat(64))
    return root
}

function verify(root: string, maximum = 64) {
    return spawnSync(process.execPath, [SCRIPT, '--dist', root, '--max-initial-bytes', String(maximum)], {
        encoding: 'utf8',
    })
}

afterEach(() => {
    for (const directory of temporaryDirectories.splice(0)) {
        rmSync(directory, { recursive: true, force: true })
    }
})

describe('initial JavaScript chunk contract', () => {
    it('accepts a bounded initial graph with the SQLite repository as a dynamic entry', () => {
        const result = verify(createFixture())

        expect(result.status).toBe(0)
        expect(result.stdout).toContain('initial_javascript_bytes')
        expect(result.stdout).toContain('sqlite_dynamic_entry')
        expect(result.stdout).toContain('model_catalog_dynamic_entry')
        expect(result.stdout).toContain('model_advanced_dynamic_entry')
    })

    it('rejects SQLite when it enters the static initial graph', () => {
        const result = verify(createFixture({ sqliteIsDynamic: false }))

        expect(result.status).toBe(1)
        expect(result.stderr).toContain('TALOS_SQLITE_NOT_LAZY')
    })

    it('rejects the tool suite when it enters the static initial graph', () => {
        // zod plus six tool bodies at boot is the same mistake the permission
        // types made once already, and it cost 25KB of startup.
        const result = verify(createFixture({ eagerToolset: true }))

        expect(result.status).toBe(1)
        expect(result.stderr).toContain('TALOS_TOOLSET_NOT_LAZY')
    })

    it('rejects an initial JavaScript graph over its byte budget', () => {
        const result = verify(createFixture({ initialBytes: 65 }))

        expect(result.status).toBe(1)
        expect(result.stderr).toContain('TALOS_INITIAL_CHUNK_BUDGET_EXCEEDED')
    })

    it('rejects a station screen that re-enters the static initial graph', () => {
        const result = verify(createFixture({ eagerRoute: 'src/screens/SettingsScreen.vue' }))

        expect(result.status).toBe(1)
        expect(result.stderr).toContain('TALOS_ROUTE_NOT_LAZY')
    })

    it('rejects the rich message renderer when it enters the static initial graph', () => {
        const result = verify(createFixture({ eagerMessageRenderer: true }))

        expect(result.status).toBe(1)
        expect(result.stderr).toContain('TALOS_MESSAGE_RENDERER_NOT_LAZY')
    })

    it('rejects the message overflow menu when it enters the static initial graph', () => {
        const result = verify(createFixture({ eagerMessageOverflowMenu: true }), 256)

        expect(result.status).toBe(1)
        expect(result.stderr).toContain('TALOS_MESSAGE_OVERFLOW_NOT_LAZY')
    })

    it('rejects the prompt enhancer when it enters the static initial graph', () => {
        const result = verify(createFixture({ eagerPromptEnhancer: true }), 256)

        expect(result.status).toBe(1)
        expect(result.stderr).toContain('TALOS_PROMPT_ENHANCER_NOT_LAZY')
    })

    it('rejects the slash command menu when it enters the static initial graph', () => {
        const result = verify(createFixture({ eagerSlashCommandMenu: true }), 256)

        expect(result.status).toBe(1)
        expect(result.stderr).toContain('TALOS_SLASH_COMMAND_MENU_NOT_LAZY')
    })

    it('rejects Model Lab heavy descendants when they are folded into the Settings chunk', () => {
        const catalog = verify(createFixture({ eagerModelCatalog: true }), 256)
        const advanced = verify(createFixture({ eagerModelAdvanced: true }), 256)

        expect(catalog.status).toBe(1)
        expect(catalog.stderr).toContain('TALOS_MODEL_CATALOG_NOT_LAZY')
        expect(advanced.status).toBe(1)
        expect(advanced.stderr).toContain('TALOS_MODEL_ADVANCED_NOT_LAZY')
    })

    it('accepts a reachable Vite synthetic key for a nested dynamic Settings entry', () => {
        const result = verify(createFixture({ syntheticSettingsEntry: true }))

        expect(result.status).toBe(0)
        expect(result.stdout).toContain('_SettingsScreen-fixture.js')
        expect(result.stdout).toContain('model_catalog_dynamic_entry')
        expect(result.stdout).toContain('model_advanced_dynamic_entry')
    })
})
