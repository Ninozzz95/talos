import { readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'

const DEFAULT_MAXIMUM_BYTES = 512_000
const DYNAMIC_BOUNDARIES = [
    {
        suffix: 'src/repositories/productionChatRepository.ts',
        code: 'TALOS_SQLITE_NOT_LAZY',
    },
    {
        suffix: 'src/components/chat/TalosMobileMessageContent.vue',
        code: 'TALOS_MESSAGE_RENDERER_NOT_LAZY',
    },
    {
        suffix: 'src/components/chat/TalosMobileMessageOverflowMenu.vue',
        code: 'TALOS_MESSAGE_OVERFLOW_NOT_LAZY',
    },
    {
        suffix: 'src/components/chat/TalosMobilePromptEnhancerPopover.vue',
        code: 'TALOS_PROMPT_ENHANCER_NOT_LAZY',
    },
    {
        suffix: 'src/components/chat/TalosMobileSlashCommandMenu.vue',
        code: 'TALOS_SLASH_COMMAND_MENU_NOT_LAZY',
    },
    { suffix: 'src/screens/ResearchScreen.vue', code: 'TALOS_ROUTE_NOT_LAZY' },
    { suffix: 'src/screens/RunsScreen.vue', code: 'TALOS_ROUTE_NOT_LAZY' },
    { suffix: 'src/screens/ContextScreen.vue', code: 'TALOS_ROUTE_NOT_LAZY' },
    { suffix: 'src/screens/SettingsScreen.vue', code: 'TALOS_ROUTE_NOT_LAZY' },
    {
        suffix: 'src/components/talos/models/TalosMobileModelCatalog.vue',
        code: 'TALOS_MODEL_CATALOG_NOT_LAZY',
    },
    {
        suffix: 'src/components/talos/models/TalosMobileModelAdvancedOptions.vue',
        code: 'TALOS_MODEL_ADVANCED_NOT_LAZY',
    },
]

function argument(name, fallback) {
    const index = process.argv.indexOf(name)
    if (index < 0) return fallback
    const value = process.argv[index + 1]
    if (!value || value.startsWith('--')) throw new Error(`TALOS_BUILD_ARGUMENT_INVALID: ${name}`)
    return value
}

function fail(code, message) {
    process.stderr.write(`${code}: ${message}\n`)
    process.exitCode = 1
}

function manifestRow(value, key) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error(`TALOS_BUILD_MANIFEST_INVALID: ${key}`)
    }
    return value
}

function escapeRegularExpression(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function matchesBoundary(manifest, key, suffix) {
    const row = manifestRow(manifest[key], key)
    const normalizedKey = key.replaceAll('\\', '/')
    const normalizedSource = typeof row.src === 'string' ? row.src.replaceAll('\\', '/') : ''
    if (normalizedKey.endsWith(suffix) || normalizedSource.endsWith(suffix)) return true

    const sourceFile = suffix.split('/').at(-1)
    const sourceStem = sourceFile?.replace(/\.(?:vue|ts)$/, '')
    if (!sourceStem || typeof row.file !== 'string') return false
    const generatedFile = row.file.replaceAll('\\', '/').split('/').at(-1) ?? ''
    const stem = escapeRegularExpression(sourceStem)
    return new RegExp(`^_${stem}-[A-Za-z0-9_-]+\\.js$`).test(normalizedKey)
        && new RegExp(`^${stem}-[A-Za-z0-9_-]+\\.js$`).test(generatedFile)
}

try {
    const dist = resolve(argument('--dist', 'dist'))
    const maximum = Number(argument('--max-initial-bytes', String(DEFAULT_MAXIMUM_BYTES)))
    if (!Number.isSafeInteger(maximum) || maximum <= 0) {
        throw new Error('TALOS_BUILD_ARGUMENT_INVALID: --max-initial-bytes')
    }
    const manifestPath = resolve(dist, '.vite', 'manifest.json')
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
        throw new Error('TALOS_BUILD_MANIFEST_INVALID: root')
    }

    const entries = Object.entries(manifest).filter(([, value]) =>
        manifestRow(value, 'entry').isEntry === true,
    )
    if (entries.length !== 1) {
        throw new Error(`TALOS_BUILD_ENTRY_INVALID: expected 1, received ${entries.length}`)
    }
    const [entryKey] = entries[0]
    const staticClosure = new Set()
    const visit = (key) => {
        if (staticClosure.has(key)) return
        const row = manifestRow(manifest[key], key)
        staticClosure.add(key)
        const imports = row.imports ?? []
        if (!Array.isArray(imports) || imports.some((value) => typeof value !== 'string')) {
            throw new Error(`TALOS_BUILD_MANIFEST_INVALID: imports for ${key}`)
        }
        for (const imported of imports) visit(imported)
    }
    visit(entryKey)

    const reachableClosure = new Set()
    const visitReachable = (key) => {
        if (reachableClosure.has(key)) return
        const row = manifestRow(manifest[key], key)
        reachableClosure.add(key)
        const next = [...(row.imports ?? []), ...(row.dynamicImports ?? [])]
        if (next.some((value) => typeof value !== 'string')) {
            throw new Error(`TALOS_BUILD_MANIFEST_INVALID: reachability for ${key}`)
        }
        for (const imported of next) visitReachable(imported)
    }
    visitReachable(entryKey)

    let boundaryFailure = false
    const dynamicEntries = []
    for (const boundary of DYNAMIC_BOUNDARIES) {
        const matchingKeys = Object.keys(manifest).filter((key) =>
            matchesBoundary(manifest, key, boundary.suffix),
        )
        if (matchingKeys.length !== 1) {
            fail(boundary.code, `${boundary.suffix} expected 1 manifest entry, received ${matchingKeys.length}`)
            boundaryFailure = true
            continue
        }
        const key = matchingKeys[0]
        const row = manifestRow(manifest[key], key)
        const dynamicallyReachable = reachableClosure.has(key) && !staticClosure.has(key)
        if (row.isDynamicEntry !== true || staticClosure.has(key) || !dynamicallyReachable) {
            fail(boundary.code, `${key} must be a reachable dynamic entry outside the initial graph`)
            boundaryFailure = true
            continue
        }
        dynamicEntries.push(key)
    }

    if (!boundaryFailure) {
        let initialBytes = 0
        for (const key of staticClosure) {
            const row = manifestRow(manifest[key], key)
            if (typeof row.file !== 'string') throw new Error(`TALOS_BUILD_MANIFEST_INVALID: file for ${key}`)
            if (row.file.endsWith('.js')) initialBytes += statSync(resolve(dist, row.file)).size
        }
        if (initialBytes > maximum) {
            fail(
                'TALOS_INITIAL_CHUNK_BUDGET_EXCEEDED',
                `${initialBytes} bytes exceeds ${maximum} bytes`,
            )
        } else {
            process.stdout.write(`${JSON.stringify({
                ok: true,
                initial_javascript_bytes: initialBytes,
                maximum_initial_javascript_bytes: maximum,
                sqlite_dynamic_entry: dynamicEntries[0],
                message_renderer_dynamic_entry: dynamicEntries[1],
                message_overflow_dynamic_entry: dynamicEntries[2],
                prompt_enhancer_dynamic_entry: dynamicEntries[3],
                slash_command_menu_dynamic_entry: dynamicEntries[4],
                station_dynamic_entries: dynamicEntries.slice(5, 9),
                model_catalog_dynamic_entry: dynamicEntries[9],
                model_advanced_dynamic_entry: dynamicEntries[10],
            })}\n`)
        }
    }
} catch (error) {
    fail('TALOS_INITIAL_CHUNK_CONTRACT_FAILED', error instanceof Error ? error.message : String(error))
}
