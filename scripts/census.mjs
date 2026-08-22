/**
 * Il censimento delle due meta' di TALOS, generato invece che scritto.
 *
 * Owner 2026-08-04: «un doc super ultra mega comprensivo di tutta la app, e
 * allineare tutto quello che c'e'; le funzioni che sono superiori del desktop
 * vanno valutate assieme prima di allineare».
 *
 * ## Perche' generato
 *
 * Un documento «di tutta la app» scritto a mano e' vecchio il giorno dopo e
 * nessuno puo' verificarlo: 350 file per parte, e chi legge deve fidarsi. Qui
 * ogni riga viene dal codice, si rigenera con un comando, e chiunque puo'
 * controllarla aprendo il file che la riga nomina.
 *
 * ## Perche' non serve passarsi niente fra le macchine
 *
 * Il desktop NON e' su un'altra macchina: e' lo stesso repository, ramo `main`.
 * «Un'altra macchina» e' la postazione dove ci si lavora. Quindi questo script
 * legge entrambi i lati da git — `origin/main` per il desktop, l'albero
 * corrente per il mobile — e lo scambio fra le due corsie e' git, non un file
 * copiato a mano che invecchia in una cartella.
 *
 * ## Cosa NON fa, di proposito
 *
 * Non appaia le capacita' fra i due lati. I nomi non corrispondono — sul
 * desktop `research-jobs` e' una rotta HTTP, sul mobile e' una stazione con un
 * database locale — e appaiarle a forza di stringhe produrrebbe corrispondenze
 * inventate. Questo emette l'INVENTARIO; l'appaiamento e' un giudizio, e va
 * fatto leggendo.
 *
 * Uso:  node scripts/census.mjs            → scrive docs/alignment/census.json
 *       node scripts/census.mjs --stdout   → lo stampa e basta
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const MOBILE = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const ROOT = resolve(MOBILE, '..')
const DESKTOP_REF = process.env.TALOS_DESKTOP_REF ?? 'origin/main'

function git(...args) {
    return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
}

/** Un file del ramo desktop, senza toccare l'albero di lavoro. */
function desktopFile(path) {
    try {
        return git('show', `${DESKTOP_REF}:${path}`)
    } catch {
        return null
    }
}

function desktopTree(prefix) {
    try {
        return git('ls-tree', '-r', '--name-only', DESKTOP_REF, prefix).split('\n').filter(Boolean)
    } catch {
        return []
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// IL DESKTOP
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Le rotte HTTP sono la superficie di capacita' del desktop.
 *
 * Il desktop e' un server: cio' che sa fare passa da li'. Un componente `.vue`
 * dice come si vede una cosa, una rotta dice che la cosa esiste — ed e'
 * quest'ultima che va confrontata con un'app che quel server non ce l'ha.
 */
function desktopRoutes() {
    const source = desktopFile('control-plane/routes/api.php')
    if (!source) return []
    const routes = []
    const aggiungi = (method, path, controller, action) => routes.push({
        method: method.toUpperCase(),
        path,
        controller,
        action,
        area: path.split('/').filter(Boolean)[0] ?? '(radice)',
    })

    // La forma con l'azione: `[Controller::class, 'metodo']`.
    const conAzione = /Route::(get|post|patch|put|delete)\(\s*'([^']+)'\s*,\s*\[([A-Za-z]+)::class\s*,\s*'([^']+)'\]/g
    for (const m of source.matchAll(conAzione)) aggiungi(m[1], m[2], m[3], m[4])

    /*
     * La forma INVOCABILE: `Route::post('/x', Controller::class)`, senza
     * azione. Laravel chiama `__invoke`.
     *
     * Sono 15 su 180, e cercarle solo con la prima forma le perdeva TUTTE — fra
     * cui `/talos/chat/stream`, `/capabilities` e l'esportazione di una
     * sessione, cioe' il cuore dell'app. Un censimento che ne butta via
     * quindici in silenzio e' peggio di uno assente: chi legge crede di avere
     * la lista intera.
     */
    const invocabile = /Route::(get|post|patch|put|delete)\(\s*'([^']+)'\s*,\s*([A-Za-z]+)::class\s*\)/g
    for (const m of source.matchAll(invocabile)) aggiungi(m[1], m[2], m[3], '__invoke')

    return routes
}

/**
 * Quante rotte ci sono DAVVERO nel file, contate senza interpretarle.
 *
 * Serve a far fallire il censimento se il lettore ne perde una forma nuova,
 * invece di riportare un numero piu' piccolo con l'aria di essere completo.
 */
function desktopRouteCount() {
    const source = desktopFile('control-plane/routes/api.php')
    if (!source) return 0
    return [...source.matchAll(/Route::(?:get|post|patch|put|delete)\(/g)].length
}

/** Le superfici visibili: le cartelle sotto `components/talos`. */
function desktopSurfaces() {
    const files = desktopTree('control-plane/resources/js/components/')
    const byFolder = new Map()
    for (const file of files) {
        if (!file.endsWith('.vue')) continue
        const parts = file.split('/')
        // components/talos/<gruppo>/<file>.vue
        const group = parts.length > 6 ? parts[5] : (parts[4] ?? '(radice)')
        byFolder.set(group, (byFolder.get(group) ?? 0) + 1)
    }
    return [...byFolder.entries()]
        .map(([group, components]) => ({ group, components }))
        .sort((a, b) => b.components - a.components)
}

// ─────────────────────────────────────────────────────────────────────────────
// IL MOBILE
// ─────────────────────────────────────────────────────────────────────────────

function mobileFile(path) {
    try {
        return readFileSync(resolve(MOBILE, path), 'utf8')
    } catch {
        return null
    }
}

/** Le stazioni: una voce, una pagina, un indirizzo. */
function mobileRoutes() {
    const source = mobileFile('src/lib/mobileRoutes.ts')
    if (!source) return []
    const routes = []
    const pattern = /\{\s*name:\s*'([^']+)',\s*path:\s*'([^']+)'(?:[^}]*?parent:\s*'([^']+)')?/g
    let match
    while ((match = pattern.exec(source)) !== null) {
        routes.push({ name: match[1], path: match[2], parent: match[3] ?? null })
    }
    return routes
}

/**
 * I tool che il modello puo' chiamare.
 *
 * Si leggono dal registro, non dai nomi dei file: un file puo' definirne piu'
 * d'uno, e uno definito ma non registrato non esiste per il modello — che e'
 * proprio il difetto misurato il 2026-08-03 sulla Libreria.
 */
function mobileTools() {
    const names = new Set()
    for (const path of ['src/lib/tools/toolControls.ts', 'src/lib/tools/registry.ts']) {
        const source = mobileFile(path)
        if (!source) continue
        for (const match of source.matchAll(/^\s{4}([a-z][a-z0-9_]*):\s*(?:true|false)/gm)) {
            names.add(match[1])
        }
        for (const match of source.matchAll(/name:\s*'([a-z][a-z0-9_]*)'/g)) {
            names.add(match[1])
        }
    }
    return [...names].sort()
}

function countFiles(prefix, suffix) {
    try {
        return git('ls-files', `mobile/${prefix}`).split('\n')
            .filter((f) => f.endsWith(suffix)).length
    } catch {
        return 0
    }
}

// ─────────────────────────────────────────────────────────────────────────────

const desktopHead = git('rev-parse', '--short', DESKTOP_REF).trim()
const desktopDate = git('log', '-1', '--format=%ad', '--date=short', DESKTOP_REF).trim()
const mobileHead = git('rev-parse', '--short', 'HEAD').trim()
const base = git('merge-base', 'HEAD', DESKTOP_REF).trim()

const routes = desktopRoutes()
/*
 * Il censimento si rifiuta di essere incompleto in silenzio.
 *
 * Se `api.php` guadagna una forma di rotta che il lettore non conosce, questo
 * si accorge della differenza e si ferma, invece di consegnare una lista corta
 * che sembra intera. E' la sola cosa che rende fidata una riga generata.
 */
const dichiarate = desktopRouteCount()
if (routes.length !== dichiarate) {
    process.stderr.write(
        `TALOS_CENSUS_ROUTES_INCOMPLETE: lette ${routes.length} di ${dichiarate} rotte in `
        + 'control-plane/routes/api.php. C\'e\' una forma che il lettore non riconosce: '
        + 'aggiungerla a desktopRoutes() invece di abbassare il conto.\n',
    )
    process.exit(1)
}
const byArea = new Map()
for (const route of routes) byArea.set(route.area, (byArea.get(route.area) ?? 0) + 1)

const census = {
    schema: 'talos.alignment.census/1',
    generated_from: {
        desktop_ref: DESKTOP_REF,
        desktop_head: desktopHead,
        desktop_last_commit: desktopDate,
        mobile_head: mobileHead,
        common_base: git('rev-parse', '--short', base).trim(),
        desktop_commits_since_base: Number(git('rev-list', '--count', `${base}..${DESKTOP_REF}`).trim()),
        mobile_commits_since_base: Number(git('rev-list', '--count', `${base}..HEAD`).trim()),
    },
    desktop: {
        api_routes: routes.length,
        // L'area e' il primo segmento della rotta: e' il modo in cui il server
        // stesso raggruppa cio' che sa fare.
        areas: [...byArea.entries()]
            .map(([area, endpoints]) => ({ area, endpoints }))
            .sort((a, b) => b.endpoints - a.endpoints),
        ui_groups: desktopSurfaces(),
        routes,
    },
    mobile: {
        stations: mobileRoutes(),
        tools: mobileTools(),
        components: countFiles('src', '.vue'),
        screens: countFiles('src/screens', '.vue'),
        stores: countFiles('src/stores', '.ts'),
    },
}

const json = JSON.stringify(census, null, 2)
if (process.argv.includes('--stdout')) {
    process.stdout.write(`${json}\n`)
} else {
    const out = resolve(MOBILE, 'docs/alignment/census.json')
    mkdirSync(dirname(out), { recursive: true })
    writeFileSync(out, `${json}\n`, 'utf8')
    process.stdout.write(`${JSON.stringify({
        ok: true,
        written: 'docs/alignment/census.json',
        desktop_areas: census.desktop.areas.length,
        desktop_routes: census.desktop.api_routes,
        mobile_stations: census.mobile.stations.length,
        mobile_tools: census.mobile.tools.length,
    })}\n`)
}
