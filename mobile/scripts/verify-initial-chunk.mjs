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
// Owner 2026-08-01: the CSS ceiling moves from 150,000 to 220,000, and it moves
// only after looking inside — which is the condition the owner set the last
// time, and the reason this comment is longer than the number.
//
// What is in there, measured rather than guessed: 199,104 bytes, of which
// `@layer utilities` is 144,235 — 72% — spread over 1,760 distinct utility
// classes. Sampling them finds `md:grid-cols-4`,
// `data-[state=closed]:slide-out-to-bottom`, `hover:bg-muted-foreground/10`:
// ours, and used. @font-face costs 7 KB and every keyframe together 2 KB. There
// is no dead weight to remove; the ceiling was set when the sheet was ~131 KB
// and six screens have shipped since.
//
// And the number means less here than the same number would on the web. TALOS
// is served from the device, so this file is never downloaded — the 30 KB it
// gzips to travels nowhere. What it actually costs is the time to parse it,
// which on the phones this app targets is tens of milliseconds. The budget is
// worth keeping because unnoticed growth is worth catching; the specific figure
// was borrowed from a delivery model this app does not use.
//
// 220,000 leaves about 10% of room — a few more screens — and still fails loudly
// if somebody imports an entire framework, which is the accident this exists to
// catch. The real reduction is fewer one-off utility values, and that is a
// design-system pass on the FE backlog, not a build-gate change.
// Owner 2026-08-01: 560,000 → 600,000, and again only after opening it. The gate
// had 1,333 bytes of room, which is not a budget — it is a tripwire under the
// next feature, whatever that feature happens to be.
//
// Asked the bundler rather than guessing (Rollup's per-module `renderedLength`;
// attributing bytes by reading the sourcemap line-by-line was tried first and
// was wrong, giving 101 KB to a 12 KB file). The entry graph is, pre-minify:
// @vue/runtime-core 152 KB, chatController 117 KB, tailwind-merge 102 KB,
// TalosMobileComposer 50 KB, @vue/reactivity 46 KB, vue-router 41 KB,
// ChatScreen 41 KB. It is the chat, the framework, and the class merger.
//
// Two things were checked before concluding there was nothing free left:
//
// - Vue's production flags were never defined, so the runtime carried Options
//   API support this app never uses — 115 components, 106 `<script setup>`,
//   zero `export default {}`. Defining them saved 4,700 bytes for no risk, and
//   that saving is already inside the number below.
// - `tailwind-merge` looked like 47 KB of removable weight until the call sites
//   were read. All fifteen are `cn('base classes', props.class)` — the pattern
//   that lets a caller OVERRIDE a component's defaults. Resolving `p-4` against
//   a caller's `p-6` is precisely what it is for; drop it and both survive and
//   CSS source order decides. It stays.
//
// So the honest reduction left is not a build flag: it is debt A2, the 1,412-line
// `chatController.ts`, which the debt register already names. Splitting it is a
// refactor with its own risk and its own review, not something to smuggle into a
// budget change.
//
// 600,000 leaves ~7.7%. If a single feature ever eats that, it is not a budget
// problem — it is a feature that belongs behind a dynamic import.
/*
 * ⛔ 600.100 e non 600.000 — DECISIONE dell'owner, 2026-08-10: «rompo
 * ufficialmente la regola e alziamo di cento byte. Per adesso la regola non è
 * scritta sulla pietra, però comunque è da considerare».
 *
 * Il caso: dare a chi solo LEGGE il «consenti sempre» costava 29 byte, e il
 * margine era 27. Alzare resta l'ultima carta — la prima è sempre togliere
 * peso — ma cento byte comprati una volta valgono più di due ore passate a
 * limare codice che non c'entra con la funzione in corso.
 *
 * ⛔ E poi 600.600 — owner, 2026-08-11: «alza il tetto di 500, i 100 di prima
 * erano pochi e te l'avrei dovuto dire».
 *
 * Il caso: spostare il microfono dalla risposta LETTA al messaggio DETTATO
 * costava 15 byte oltre il tetto, dopo averne già recuperati 71 — tolto il
 * modulo nuovo, tolta la funzione esportata, tolto l'import della costante
 * (600.186 → 600.115). I quindici rimasti ERANO la funzione: il ternario che
 * scrive il metadato e la condizione nel template.
 *
 * ⛔ La lezione non è «alzare quando serve»: è che un margine da 100 byte non è
 * un margine, è un allarme che suona a ogni riga. Con 500 il tetto torna a fare
 * il suo mestiere — accorgersi di una LIBRERIA entrata per sbaglio nell'avvio,
 * non di una condizione in un template. La prima carta resta togliere peso, e
 * qui è stata giocata fino in fondo prima di chiedere.
 *
 * ⛔ E poi 601.200 — LA BARRA (compito #90), 2026-08-11. Qui la prima carta è
 * stata giocata per davvero, e il numero lo dice:
 *
 *     tutta la barra dentro `main.ts`   601.765   ⛔ +1.643
 *     spostata in `lib/barra/avvia`     600.625   ⛔ +503
 *     senza la barra (misurato)         600.122
 *
 * Cioè 1.140 byte sono usciti dall'avvio, e i 503 rimasti NON si possono
 * togliere: sono la riga che decide CHI ci sta mostrando prima di disegnare
 * qualcosa. Se quella decisione la prendesse un modulo caricato dopo, la
 * schermata intera sarebbe già a schermo — e la barra esiste esattamente per
 * non farla comparire.
 *
 * ⛔ Il tetto NON copre un difetto: copre una funzione nuova che si è pagata da
 * sola tranne l'ultimo mezzo kilobyte. Se un domani il numero risale senza che
 * nessuno abbia aggiunto niente all'avvio, quel mezzo kilobyte è il primo posto
 * dove NON guardare.
 */
/*
 * ⛔ E poi 602.000 — IL MOTORE DEGLI INTENT, 2026-08-13, per decisione
 * esplicita dell'owner: «ALZA A 602.000 ADESSO E VAI AVANTI».
 *
 * Il tetto era arrivato a 601.344 con 25 capacità in un tool solo — WhatsApp,
 * Telegram, Signal, Messenger, SMS, email, chiamate, quattro modi di usare le
 * mappe, Uber, YouTube, Spotify, Netflix, calendario, traduzione, Drive,
 * Amazon, Play Store, Instagram, LinkedIn, web — contro le 23 dei built-in
 * intent di Google.
 *
 * ⛔ E prima di chiedere, il peso è stato inseguito davvero, in quattro forme
 * MISURATE una per una: gancio nel controller con cache 602.009, con
 * `import()` pigro 601.650, con `&&`/`||` 601.704, fonti dentro il ponte del
 * telefono 601.512. La forma finale — il tool chiama il ponte da sé, dietro il
 * chunk dinamico del toolset — è la più leggera delle quattro. Quello che
 * resta è il costo dei cataloghi (76 byte misurati) e delle etichette: la
 * parte che DEVE stare nel grafo perché il pannello dei permessi la mostri.
 */
const DEFAULT_MAXIMUM_BYTES = 602_000
const DEFAULT_MAXIMUM_CSS_BYTES = 220_000
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
    // Il pannello «quanto riscrivere, con quale modello». Importato
    // staticamente si porta dietro il Select di reka-ui: misurato il
    // 2026-08-04, 80.223 byte nel grafo d'avvio — da 594 KB a 674 KB, oltre il
    // tetto. Era passato typecheck e test perche' nessuno dei due pesa il
    // pacco; solo il build lo vede.
    {
        suffix: 'src/components/chat/TalosMobileEnhancerDrawer.vue',
        code: 'TALOS_ENHANCER_DRAWER_NOT_LAZY',
    },
    /*
     * ⭐ Il motore vocale entra in scena al primo TOCCO, non al primo disegno.
     *
     * Owner 2026-08-10: «ogni messaggio di risposta deve avere icona sound per
     * tts». L'icona c'è sempre — quindi non serve chiedere niente al motore per
     * disegnarla, quindi il motore non serve in pagina.
     *
     * MISURATO: spostandolo qui il grafo d'avvio è passato da 600.982 byte
     * (rosso) a 599.943 (verde). È il primo verde del compito #51, ottenuto
     * togliendo peso e non alzando il tetto — e senza questo confine
     * tornerebbe dentro alla prima riga distratta.
     */
    { suffix: 'src/services/speech.ts', code: 'TALOS_SPEECH_NOT_LAZY' },
    { suffix: 'src/screens/ResearchScreen.vue', code: 'TALOS_ROUTE_NOT_LAZY' },
    /*
     * ⛔ Qui c'era `src/screens/RunsScreen.vue`, il Cockpit, tolto il
     * 2026-08-09 su decisione dell'owner («leviamo cockpit»).
     *
     * Il file era sparito ma la riga no, e questo guardiano PRETENDE una voce
     * nel manifesto per ogni percorso elencato: `expected 1 manifest entry,
     * received 0` — cioè `npm run build` restava rosso, e il messaggio parlava
     * di pigrizia mentre il problema era un'assenza. Un elenco di file che
     * devono esistere è anche un elenco da potare quando un file se ne va.
     */
    { suffix: 'src/screens/ContextScreen.vue', code: 'TALOS_ROUTE_NOT_LAZY' },
    { suffix: 'src/screens/SettingsScreen.vue', code: 'TALOS_ROUTE_NOT_LAZY' },
    // Model Lab is four addressable mobile routes. Keeping only the old
    // Settings route lazy would still allow the hub or a child page to drift
    // into first paint as the navigation evolves.
    { suffix: 'src/screens/SettingsModelsScreen.vue', code: 'TALOS_MODEL_LAB_ROUTE_NOT_LAZY' },
    { suffix: 'src/screens/SettingsModelsProvidersScreen.vue', code: 'TALOS_MODEL_LAB_ROUTE_NOT_LAZY' },
    { suffix: 'src/screens/SettingsModelsCatalogScreen.vue', code: 'TALOS_MODEL_LAB_ROUTE_NOT_LAZY' },
    { suffix: 'src/screens/SettingsModelsLocalScreen.vue', code: 'TALOS_MODEL_LAB_ROUTE_NOT_LAZY' },
    {
        suffix: 'src/components/talos/models/TalosMobileModelCatalog.vue',
        code: 'TALOS_MODEL_CATALOG_NOT_LAZY',
    },
    {
        suffix: 'src/components/talos/models/TalosMobileModelAdvancedOptions.vue',
        code: 'TALOS_MODEL_ADVANCED_NOT_LAZY',
    },
    {
        suffix: 'src/components/talos/models/TalosMobileLocalModels.vue',
        code: 'TALOS_MODEL_LOCAL_NOT_LAZY',
    },
    // Every shell can expose this control, but the transfer UI and Reka
    // popover are needed only while a durable transfer exists. Keep that
    // global reachability without charging first chat paint for the panel.
    {
        suffix: 'src/components/shell/TalosMobileDownloadCenterTrigger.vue',
        code: 'TALOS_DOWNLOAD_CENTER_NOT_LAZY',
    },
    {
        suffix: 'src/components/shell/TalosMobileChatOptionsMenu.vue',
        code: 'TALOS_CHAT_OPTIONS_NOT_LAZY',
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
    // Theme-linked launcher icon confirmation is a post-boot modal. Its SVG
    // preview and dialog chrome must load only when a real choice is pending.
    {
        suffix: 'src/components/talos/settings/TalosLauncherIconDialog.vue',
        code: 'TALOS_LAUNCHER_ICON_DIALOG_NOT_LAZY',
    },
    {
        suffix: 'src/lib/welcome/catalogs/en.json',
        code: 'TALOS_WELCOME_CATALOG_NOT_LAZY',
    },
    {
        suffix: 'src/lib/welcome/catalogs/it.json',
        code: 'TALOS_WELCOME_CATALOG_NOT_LAZY',
    },
    {
        suffix: 'src/lib/welcome/runtime.ts',
        code: 'TALOS_WELCOME_RUNTIME_NOT_LAZY',
    },
    {
        suffix: 'src/components/chat/TalosWelcomeEasterEgg.vue',
        code: 'TALOS_WELCOME_EASTER_EGG_NOT_LAZY',
    },
    {
        suffix: 'src/components/chat/TalosWelcomeTitle.vue',
        code: 'TALOS_WELCOME_TITLE_NOT_LAZY',
    },
    // The procedural canvas and its scene registry are optional visual
    // enhancement. The static themed background paints immediately; loading
    // every renderer and scene before first chat paint is unnecessary.
    {
        suffix: 'src/components/talos/workspace/TalosMobileBackground.vue',
        code: 'TALOS_WORKSPACE_BACKGROUND_NOT_LAZY',
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
    const sourceStem = sourceFile?.replace(/\.(?:json|vue|ts)$/, '')
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
        dynamicEntries.push({ suffix: boundary.suffix, key })
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
            // The old message said only that a number was too big, which sent
            // the last reader on half an hour of digging to find out WHAT was
            // too big. It costs nothing to say where to look, so it says it.
            fail(
                'TALOS_INITIAL_CSS_BUDGET_EXCEEDED',
                `${initialCssBytes} CSS bytes exceeds ${maximumCss} bytes `
                + `(${initialCssGzipBytes} gzipped). Before raising the ceiling, look inside: `
                + 'almost all of it is `@layer utilities`, so the question is whether the new '
                + 'weight is utilities the app really uses or something imported whole. '
                + 'Open the initial sheet in dist/assets and measure the top-level blocks.',
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
                // Per NOME, non per posizione.
                //
                // Prima erano indici scritti a mano — `dynamicEntries[16]` — e
                // bastava aggiungere un confine in mezzo alla lista perche' ogni
                // etichetta dopo quel punto finisse sul valore sbagliato. E'
                // successo il 2026-08-04 aggiungendo il drawer dell'enhancer: il
                // rapporto ha continuato a dire `"ok": true` mentre chiamava il
                // pannello media «icona del lanciatore». Un rapporto che sbaglia
                // i nomi e' peggio di uno che tace, perche' lo si legge per
                // orientarsi.
                // La chiave e' il PERCORSO, non il codice d'errore: quattro
                // stazioni condividono `TALOS_ROUTE_NOT_LAZY` e due cataloghi
                // condividono il loro, quindi una mappa per codice ne
                // perderebbe quattro per strada senza dirlo. 24 confini devono
                // comparire come 24 righe.
                dynamic_entries: Object.fromEntries(
                    dynamicEntries.map(({ suffix, key }) => [suffix, key]),
                ),
            })}\n`)
        }
    }
} catch (error) {
    fail('TALOS_INITIAL_CHUNK_CONTRACT_FAILED', error instanceof Error ? error.message : String(error))
}
