import { readFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { resolve } from 'node:path'

// Owner 2026-07-25 (defect #3): the ceiling was 512,000 and the app sat 1.3 KB
// under it, so every feature became a negotiation with the gate. Raised to a
// number with a reason rather than a round one: the security work (the lock
// decides before anything renders), reasoning capture and paging are all
// permanent entry-graph residents, and 560,000 leaves ~9% of room for the tool
// runtime's own entry-side glue while everything optional stays lazy.
//
// It also stopped measuring half the payload. The render-blocking CSS was never
// counted — 131 KB of it — so the gate could stay green while first paint got
// slower. Both are budgeted now, and gzip transfer is reported beside raw bytes
// because that is what a phone actually downloads.
const DEFAULT_MAXIMUM_BYTES = 560_000
const DEFAULT_MAXIMUM_CSS_BYTES = 150_000
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
    // The tool suite pulls zod and six tool bodies. It is loaded on the first
    // send, never at boot — and nothing was stopping it drifting into the entry
    // graph, which is exactly how the permission types ended up costing 25KB of
    // startup before they were split out.
    //
    // Only the true dynamic ENTRY points are listed: `readTools` and `registry`
    // are static imports of `toolset`, so Rollup folds them into its chunk and
    // they own no manifest row. Listing them would fail the gate on a correct
    // build — the boundary that matters is the one the app awaits.
    { suffix: 'src/lib/tools/toolset.ts', code: 'TALOS_TOOLSET_NOT_LAZY' },
    { suffix: 'src/lib/tools/agentLoop.ts', code: 'TALOS_AGENT_LOOP_NOT_LAZY' },
    {
        suffix: 'src/components/chat/TalosMobileToolConsentSheet.vue',
        code: 'TALOS_TOOL_CONSENT_NOT_LAZY',
    },
    // F2: docx, xlsx, pptx and pdf-lib together weigh megabytes — several times
    // the entire startup budget. They are loaded when a document is actually
    // made, and the build must fail loudly if that ever stops being true.
    {
        suffix: 'src/lib/documents/documentGenerator.ts',
        code: 'TALOS_DOCUMENT_GENERATOR_NOT_LAZY',
    },
    // The per-chat media gallery: a grid with thumbnails, opened occasionally.
    // The chat's first paint must never carry it.
    {
        suffix: 'src/components/chat/TalosMobileChatMediaPanel.vue',
        code: 'TALOS_CHAT_MEDIA_NOT_LAZY',
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
    const maximumCss = Number(argument('--max-initial-css-bytes', String(DEFAULT_MAXIMUM_CSS_BYTES)))
    // SF: the JS ceiling was validated and the CSS one was not, so
    // `--max-initial-css-bytes abc` made the gate pass with a null ceiling.
    if (!Number.isSafeInteger(maximumCss) || maximumCss <= 0) {
        // `fail` only sets process.exitCode; it does NOT stop the script. So
        // execution continued with a NaN ceiling and the report printed
        // `"ok": true` next to exit code 1 — a gate whose output contradicts
        // its own exit status. Throw, exactly like the sibling check below.
        throw new Error('TALOS_INITIAL_CSS_BUDGET_INVALID: --max-initial-css-bytes must be a positive integer')
    }
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
        let initialCssBytes = 0
        let initialGzipBytes = 0
        let initialCssGzipBytes = 0
        const seenCss = new Set()
        for (const key of staticClosure) {
            const row = manifestRow(manifest[key], key)
            if (typeof row.file !== 'string') throw new Error(`TALOS_BUILD_MANIFEST_INVALID: file for ${key}`)
            if (row.file.endsWith('.js')) {
                const contents = readFileSync(resolve(dist, row.file))
                initialBytes += contents.length
                initialGzipBytes += gzipSync(contents).length
            }
            // Defect #3: the CSS a chunk pulls in is render-blocking on first
            // paint. Budgeting only JS measured half the cost.
            for (const sheet of Array.isArray(row.css) ? row.css : []) {
                if (typeof sheet !== 'string' || seenCss.has(sheet)) continue
                seenCss.add(sheet)
                const contents = readFileSync(resolve(dist, sheet))
                initialCssBytes += contents.length
                initialCssGzipBytes += gzipSync(contents).length
            }
        }
        // SF: an `if/else if` meant a JS overrun hid the CSS verdict AND the
        // whole report. Both budgets are judged, then reported.
        let exceeded = false
        if (initialBytes > maximum) {
            fail(
                'TALOS_INITIAL_CHUNK_BUDGET_EXCEEDED',
                `${initialBytes} bytes exceeds ${maximum} bytes`,
            )
            exceeded = true
        }
        if (initialCssBytes > maximumCss) {
            fail(
                'TALOS_INITIAL_CSS_BUDGET_EXCEEDED',
                `${initialCssBytes} CSS bytes exceeds ${maximumCss} bytes`,
            )
            exceeded = true
        }
        if (!exceeded) {
            process.stdout.write(`${JSON.stringify({
                ok: true,
                initial_javascript_bytes: initialBytes,
                maximum_initial_javascript_bytes: maximum,
                initial_css_bytes: initialCssBytes,
                maximum_initial_css_bytes: maximumCss,
                initial_javascript_gzip_bytes: initialGzipBytes,
                initial_css_gzip_bytes: initialCssGzipBytes,
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
