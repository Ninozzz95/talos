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
    eagerEnhancerDrawer?: boolean
    eagerModelCatalog?: boolean
    eagerModelAdvanced?: boolean
    eagerModelLocal?: boolean
    eagerDownloadCenter?: boolean
    eagerChatOptionsMenu?: boolean
    eagerToolset?: boolean
    eagerDocuments?: boolean
    eagerLauncherIconDialog?: boolean
    eagerWelcomeEnglish?: boolean
    eagerWelcomeItalian?: boolean
    eagerWelcomeRuntime?: boolean
    eagerWelcomeEasterEgg?: boolean
    eagerWelcomeTitle?: boolean
    eagerWorkspaceBackground?: boolean
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
    // Il pannello «quanto riscrivere, con quale modello»: statico si porta
    // dietro il Select di reka-ui, misurato 80.223 byte nel grafo d'avvio.
    const enhancerDrawerKey = 'src/components/chat/TalosMobileEnhancerDrawer.vue'
    const modelCatalogKey = 'src/components/talos/models/TalosMobileModelCatalog.vue'
    const modelAdvancedKey = 'src/components/talos/models/TalosMobileModelAdvancedOptions.vue'
    const modelLocalKey = 'src/components/talos/models/TalosMobileLocalModels.vue'
    const downloadCenterKey = 'src/components/shell/TalosMobileDownloadCenterTrigger.vue'
    const chatOptionsMenuKey = 'src/components/shell/TalosMobileChatOptionsMenu.vue'
    // The tool suite: loaded on the first send, never at boot.
    const toolsetKey = 'src/lib/tools/toolset.ts'
    const agentLoopKey = 'src/lib/tools/agentLoop.ts'
    const toolConsentKey = 'src/components/chat/TalosMobileToolConsentSheet.vue'
    const chatMediaKey = 'src/components/chat/TalosMobileChatMediaPanel.vue'
    // ⭐ Il motore vocale entra al primo TOCCO, non al primo disegno: è la
    // riga che ha portato il grafo d'avvio da 600.982 byte a 599.943.
    const speechKey = 'src/services/speech.ts'
    const documentGeneratorKey = 'src/lib/documents/documentGenerator.ts'
    const launcherIconDialogKey = 'src/components/talos/settings/TalosLauncherIconDialog.vue'
    const chatScreenKey = 'src/screens/ChatScreen.vue'
    const welcomeEnglishKey = 'src/lib/welcome/catalogs/en.json'
    const welcomeItalianKey = 'src/lib/welcome/catalogs/it.json'
    const welcomeRuntimeKey = 'src/lib/welcome/runtime.ts'
    const welcomeEasterEggKey = 'src/components/chat/TalosWelcomeEasterEgg.vue'
    const welcomeTitleKey = 'src/components/chat/TalosWelcomeTitle.vue'
    const workspaceBackgroundKey = 'src/components/talos/workspace/TalosMobileBackground.vue'
    const documentsAreDynamic = options.eagerDocuments !== true
    const launcherIconDialogIsDynamic = options.eagerLauncherIconDialog !== true
    const welcomeEnglishIsDynamic = options.eagerWelcomeEnglish !== true
    const welcomeItalianIsDynamic = options.eagerWelcomeItalian !== true
    const welcomeRuntimeIsDynamic = options.eagerWelcomeRuntime !== true
    const welcomeEasterEggIsDynamic = options.eagerWelcomeEasterEgg !== true
    const welcomeTitleIsDynamic = options.eagerWelcomeTitle !== true
    const workspaceBackgroundIsDynamic = options.eagerWorkspaceBackground !== true
    const toolsetIsDynamic = options.eagerToolset !== true
    const sqliteIsDynamic = options.sqliteIsDynamic ?? true
    const messageRendererIsDynamic = options.eagerMessageRenderer !== true
    const messageOverflowMenuIsDynamic = options.eagerMessageOverflowMenu !== true
    const promptEnhancerIsDynamic = options.eagerPromptEnhancer !== true
    const slashCommandMenuIsDynamic = options.eagerSlashCommandMenu !== true
    const enhancerDrawerIsDynamic = options.eagerEnhancerDrawer !== true
    const modelCatalogIsDynamic = options.eagerModelCatalog !== true
    const modelAdvancedIsDynamic = options.eagerModelAdvanced !== true
    const modelLocalIsDynamic = options.eagerModelLocal !== true
    const downloadCenterIsDynamic = options.eagerDownloadCenter !== true
    const chatOptionsMenuIsDynamic = options.eagerChatOptionsMenu !== true
    const routeKeys = [
        'src/screens/ResearchScreen.vue',
        // `RunsScreen.vue` (il Cockpit) è stato tolto il 2026-08-09: qui e nel
        // guardiano restava elencato, e il build falliva chiedendo un file che
        // non esiste più.
        'src/screens/ContextScreen.vue',
        'src/screens/SettingsScreen.vue',
        'src/screens/SettingsModelsScreen.vue',
        'src/screens/SettingsModelsProvidersScreen.vue',
        'src/screens/SettingsModelsCatalogScreen.vue',
        'src/screens/SettingsModelsLocalScreen.vue',
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
                ...(enhancerDrawerIsDynamic ? [] : [enhancerDrawerKey]),
                ...(downloadCenterIsDynamic ? [] : [downloadCenterKey]),
                ...(chatOptionsMenuIsDynamic ? [] : [chatOptionsMenuKey]),
                ...(toolsetIsDynamic ? [] : [toolsetKey]),
                ...(documentsAreDynamic ? [] : [documentGeneratorKey]),
                ...(launcherIconDialogIsDynamic ? [] : [launcherIconDialogKey]),
                ...(welcomeEnglishIsDynamic ? [] : [welcomeEnglishKey]),
                ...(welcomeItalianIsDynamic ? [] : [welcomeItalianKey]),
                ...(welcomeRuntimeIsDynamic ? [] : [welcomeRuntimeKey]),
                ...(welcomeEasterEggIsDynamic ? [] : [welcomeEasterEggKey]),
                ...(welcomeTitleIsDynamic ? [] : [welcomeTitleKey]),
                ...(workspaceBackgroundIsDynamic ? [] : [workspaceBackgroundKey]),
                ...staticRouteKeys,
            ],
            dynamicImports: [
                ...(sqliteIsDynamic ? [sqliteKey] : []),
                ...(messageRendererIsDynamic ? [messageRendererKey] : []),
                ...(messageOverflowMenuIsDynamic ? [messageOverflowMenuKey] : []),
                ...(promptEnhancerIsDynamic ? [promptEnhancerKey] : []),
                ...(slashCommandMenuIsDynamic ? [slashCommandMenuKey] : []),
                ...(enhancerDrawerIsDynamic ? [enhancerDrawerKey] : []),
                ...(downloadCenterIsDynamic ? [downloadCenterKey] : []),
                ...(chatOptionsMenuIsDynamic ? [chatOptionsMenuKey] : []),
                ...(toolsetIsDynamic ? [toolsetKey] : []),
                agentLoopKey,
                toolConsentKey,
                chatMediaKey,
                speechKey,
                ...(documentsAreDynamic ? [documentGeneratorKey] : []),
                ...(launcherIconDialogIsDynamic ? [launcherIconDialogKey] : []),
                chatScreenKey,
                ...(welcomeRuntimeIsDynamic ? [welcomeRuntimeKey] : []),
                ...(welcomeEasterEggIsDynamic ? [welcomeEasterEggKey] : []),
                ...(welcomeTitleIsDynamic ? [welcomeTitleKey] : []),
                ...(workspaceBackgroundIsDynamic ? [workspaceBackgroundKey] : []),
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
        [enhancerDrawerKey]: {
            file: 'assets/enhancer-drawer.js',
            isDynamicEntry: enhancerDrawerIsDynamic,
        },
        [modelCatalogKey]: {
            file: 'assets/model-catalog.js',
            isDynamicEntry: modelCatalogIsDynamic,
        },
        [modelAdvancedKey]: {
            file: 'assets/model-advanced.js',
            isDynamicEntry: modelAdvancedIsDynamic,
        },
        [modelLocalKey]: {
            file: 'assets/model-local.js',
            isDynamicEntry: modelLocalIsDynamic,
        },
        [downloadCenterKey]: {
            file: 'assets/download-center.js',
            isDynamicEntry: downloadCenterIsDynamic,
        },
        [chatOptionsMenuKey]: {
            file: 'assets/chat-options-menu.js',
            isDynamicEntry: chatOptionsMenuIsDynamic,
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
        [speechKey]: {
            file: 'assets/speech.js',
            isDynamicEntry: true,
        },
        [documentGeneratorKey]: {
            file: 'assets/document-generator.js',
            isDynamicEntry: documentsAreDynamic,
        },
        [launcherIconDialogKey]: {
            file: 'assets/launcher-icon-dialog.js',
            isDynamicEntry: launcherIconDialogIsDynamic,
        },
        [chatScreenKey]: {
            file: 'assets/chat-screen.js',
            isDynamicEntry: true,
            imports: [
                ...(welcomeEnglishIsDynamic ? [] : [welcomeEnglishKey]),
                ...(welcomeItalianIsDynamic ? [] : [welcomeItalianKey]),
            ],
            dynamicImports: [
                ...(welcomeEnglishIsDynamic ? [welcomeEnglishKey] : []),
                ...(welcomeItalianIsDynamic ? [welcomeItalianKey] : []),
            ],
        },
        [welcomeEnglishKey]: {
            file: 'assets/welcome-en.js',
            isDynamicEntry: welcomeEnglishIsDynamic,
        },
        [welcomeItalianKey]: {
            file: 'assets/welcome-it.js',
            isDynamicEntry: welcomeItalianIsDynamic,
        },
        [welcomeRuntimeKey]: {
            file: 'assets/welcome-runtime.js',
            isDynamicEntry: welcomeRuntimeIsDynamic,
            imports: [
                ...(welcomeEnglishIsDynamic ? [] : [welcomeEnglishKey]),
                ...(welcomeItalianIsDynamic ? [] : [welcomeItalianKey]),
            ],
            dynamicImports: [
                ...(welcomeEnglishIsDynamic ? [welcomeEnglishKey] : []),
                ...(welcomeItalianIsDynamic ? [welcomeItalianKey] : []),
            ],
        },
        [welcomeEasterEggKey]: {
            file: 'assets/welcome-easter-egg.js',
            isDynamicEntry: welcomeEasterEggIsDynamic,
        },
        [welcomeTitleKey]: {
            file: 'assets/welcome-title.js',
            isDynamicEntry: welcomeTitleIsDynamic,
            imports: [
                ...(welcomeRuntimeIsDynamic ? [] : [welcomeRuntimeKey]),
                ...(welcomeEasterEggIsDynamic ? [] : [welcomeEasterEggKey]),
            ],
            dynamicImports: [
                ...(welcomeRuntimeIsDynamic ? [welcomeRuntimeKey] : []),
                ...(welcomeEasterEggIsDynamic ? [welcomeEasterEggKey] : []),
            ],
        },
        [workspaceBackgroundKey]: {
            file: 'assets/workspace-background.js',
            isDynamicEntry: workspaceBackgroundIsDynamic,
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
            ...(sourceKey === 'src/screens/SettingsModelsCatalogScreen.vue' ? {
                imports: [
                    ...(modelCatalogIsDynamic ? [] : [modelCatalogKey]),
                ],
                dynamicImports: [
                    ...(modelCatalogIsDynamic ? [modelCatalogKey] : []),
                ],
            } : {}),
            ...(sourceKey === 'src/screens/SettingsModelsProvidersScreen.vue' ? {
                imports: [
                    ...(modelAdvancedIsDynamic ? [] : [modelAdvancedKey]),
                ],
                dynamicImports: [
                    ...(modelAdvancedIsDynamic ? [modelAdvancedKey] : []),
                ],
            } : {}),
            ...(sourceKey === 'src/screens/SettingsModelsLocalScreen.vue' ? {
                imports: [
                    ...(modelLocalIsDynamic ? [] : [modelLocalKey]),
                ],
                dynamicImports: [
                    ...(modelLocalIsDynamic ? [modelLocalKey] : []),
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
    writeFileSync(join(root, 'assets', 'model-local.js'), 'q'.repeat(64))
    writeFileSync(join(root, 'assets', 'download-center.js'), 'd'.repeat(64))
    writeFileSync(join(root, 'assets', 'chat-options-menu.js'), 'u'.repeat(64))
    writeFileSync(join(root, 'assets', 'launcher-icon-dialog.js'), 'i'.repeat(64))
    writeFileSync(join(root, 'assets', 'chat-screen.js'), 'h'.repeat(64))
    writeFileSync(join(root, 'assets', 'welcome-en.js'), 'e'.repeat(64))
    writeFileSync(join(root, 'assets', 'welcome-it.js'), 't'.repeat(64))
    writeFileSync(join(root, 'assets', 'welcome-runtime.js'), 'w'.repeat(64))
    writeFileSync(join(root, 'assets', 'welcome-easter-egg.js'), 'g'.repeat(64))
    writeFileSync(join(root, 'assets', 'welcome-title.js'), 'v'.repeat(64))
    writeFileSync(join(root, 'assets', 'workspace-background.js'), 'b'.repeat(64))
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
        /**
         * Il rapporto elenca i confini PER PERCORSO, e ogni riga deve
         * corrispondere alla propria chiave.
         *
         * Prima erano indici scritti a mano — `dynamicEntries[16]` — e bastava
         * aggiungere un confine in mezzo alla lista perché ogni etichetta dopo
         * quel punto finisse sul valore sbagliato. È successo il 2026-08-04
         * aggiungendo il drawer dell'enhancer: il rapporto continuava a dire
         * `"ok": true` mentre chiamava il pannello media «icona del
         * lanciatore». Questo test è ciò che non lo lascia succedere di nuovo.
         */
        const report = JSON.parse(result.stdout) as {
            dynamic_entries: Record<string, string>
        }
        const righe = Object.entries(report.dynamic_entries)
        expect(righe.length).toBeGreaterThanOrEqual(20)
        for (const [percorso, chiave] of righe) {
            // O la chiave del manifesto È il percorso, o è il nome sintetico
            // che Vite genera per quel file: mai quello di un altro.
            const nucleo = percorso.split('/').at(-1)!.replace(/\.(vue|ts|json)$/, '')
            expect(
                chiave === percorso || chiave.includes(nucleo),
                `la riga «${percorso}» punta a «${chiave}», che non è sua`,
            ).toBe(true)
        }
        expect(report.dynamic_entries['src/repositories/productionChatRepository.ts'])
            .toBeDefined()
        expect(report.dynamic_entries['src/components/chat/TalosMobileEnhancerDrawer.vue'])
            .toBeDefined()
        for (const route of [
            'src/screens/SettingsModelsScreen.vue',
            'src/screens/SettingsModelsProvidersScreen.vue',
            'src/screens/SettingsModelsCatalogScreen.vue',
            'src/screens/SettingsModelsLocalScreen.vue',
        ]) expect(report.dynamic_entries[route]).toBeDefined()
        expect(report.dynamic_entries['src/components/talos/models/TalosMobileLocalModels.vue'])
            .toBeDefined()
        expect(report.dynamic_entries['src/components/shell/TalosMobileDownloadCenterTrigger.vue'])
            .toBeDefined()
        expect(report.dynamic_entries['src/components/shell/TalosMobileChatOptionsMenu.vue'])
            .toBeDefined()
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

    it('rejects the document generators when they enter the static initial graph', () => {
        // docx + xlsx + pptxgenjs + pdf-lib are megabytes: several times the
        // whole startup budget, for a feature many users never touch.
        const result = verify(createFixture({ eagerDocuments: true }))

        expect(result.status).toBe(1)
        expect(result.stderr).toContain('TALOS_DOCUMENT_GENERATOR_NOT_LAZY')
    })

    it('rejects the optional launcher-icon dialog when it enters the static initial graph', () => {
        const result = verify(createFixture({ eagerLauncherIconDialog: true }), 256)

        expect(result.status).toBe(1)
        expect(result.stderr).toContain('TALOS_LAUNCHER_ICON_DIALOG_NOT_LAZY')
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

    it('rejects a dedicated Model Lab screen that re-enters the static initial graph', () => {
        const result = verify(createFixture({ eagerRoute: 'src/screens/SettingsModelsLocalScreen.vue' }))

        expect(result.status).toBe(1)
        expect(result.stderr).toContain('TALOS_MODEL_LAB_ROUTE_NOT_LAZY')
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

    it('rejects Model Lab heavy descendants when they are folded into their route chunks', () => {
        const catalog = verify(createFixture({ eagerModelCatalog: true }), 256)
        const advanced = verify(createFixture({ eagerModelAdvanced: true }), 256)
        const local = verify(createFixture({ eagerModelLocal: true }), 256)

        expect(catalog.status).toBe(1)
        expect(catalog.stderr).toContain('TALOS_MODEL_CATALOG_NOT_LAZY')
        expect(advanced.status).toBe(1)
        expect(advanced.stderr).toContain('TALOS_MODEL_ADVANCED_NOT_LAZY')
        expect(local.status).toBe(1)
        expect(local.stderr).toContain('TALOS_MODEL_LOCAL_NOT_LAZY')
    })

    it('rejects the global Download Center when it enters the static initial graph', () => {
        const result = verify(createFixture({ eagerDownloadCenter: true }), 256)

        expect(result.status).toBe(1)
        expect(result.stderr).toContain('TALOS_DOWNLOAD_CENTER_NOT_LAZY')
    })

    it('rejects the chat options menu when it enters the static initial graph', () => {
        const result = verify(createFixture({ eagerChatOptionsMenu: true }), 256)

        expect(result.status).toBe(1)
        expect(result.stderr).toContain('TALOS_CHAT_OPTIONS_NOT_LAZY')
    })

    it('accepts a reachable Vite synthetic key for a nested dynamic Settings entry', () => {
        const result = verify(createFixture({ syntheticSettingsEntry: true }))

        expect(result.status).toBe(0)
        expect(result.stdout).toContain('_SettingsScreen-fixture.js')
        // Il nome sintetico di Vite per una voce annidata resta legato alla
        // SUA riga: è il caso che il formato posizionale sbagliava.
        expect(JSON.parse(result.stdout).dynamic_entries['src/screens/SettingsScreen.vue'])
            .toContain('SettingsScreen')
        expect(JSON.parse(result.stdout)
            .dynamic_entries['src/components/talos/models/TalosMobileModelAdvancedOptions.vue'])
            .toBeDefined()
    })

    it('WELCOME-CHUNK-02 rejects either welcome locale catalog in the initial static graph', () => {
        const english = verify(createFixture({ eagerWelcomeEnglish: true }), 256)
        expect(english.status).toBe(1)
        expect(english.stderr).toContain('TALOS_WELCOME_CATALOG_NOT_LAZY')

        const italian = verify(createFixture({ eagerWelcomeItalian: true }), 256)
        expect(italian.status).toBe(1)
        expect(italian.stderr).toContain('TALOS_WELCOME_CATALOG_NOT_LAZY')
    })

    it('WELCOME-CHUNK-03 rejects the welcome runtime or icon renderer when either loses its lazy boundary', () => {
        const runtime = verify(createFixture({ eagerWelcomeRuntime: true }), 256)
        expect(runtime.status).toBe(1)
        expect(runtime.stderr).toContain('TALOS_WELCOME_RUNTIME_NOT_LAZY')

        const icon = verify(createFixture({ eagerWelcomeEasterEgg: true }), 256)
        expect(icon.status).toBe(1)
        expect(icon.stderr).toContain('TALOS_WELCOME_EASTER_EGG_NOT_LAZY')
    })

    it('WELCOME-CHUNK-04 rejects the welcome title controller when it enters the initial graph', () => {
        const result = verify(createFixture({ eagerWelcomeTitle: true }), 256)

        expect(result.status).toBe(1)
        expect(result.stderr).toContain('TALOS_WELCOME_TITLE_NOT_LAZY')
    })

    it('TOOL-AUTH-26 rejects the optional procedural background in the initial graph', () => {
        const result = verify(createFixture({ eagerWorkspaceBackground: true }), 256)

        expect(result.status).toBe(1)
        expect(result.stderr).toContain('TALOS_WORKSPACE_BACKGROUND_NOT_LAZY')
    })
})
