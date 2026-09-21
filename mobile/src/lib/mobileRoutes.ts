import type { Component } from 'vue'

export type TalosMobileRouteName =
    | 'chat' | 'chats' | 'memory' | 'tasks' | 'notes' | 'doctor'
    // Le pagine di dettaglio: voce → pagina → dettaglio, come la Ricerca.
    | 'memory-item' | 'memory-new' | 'task-item' | 'task-new' | 'note-item' | 'note-new'
    | 'settings-privilege'
    | 'research' | 'research-new' | 'research-report' | 'research-claim' | 'research-source'
    | 'context' | 'settings'
    | 'settings-models' | 'settings-models-providers'
    | 'settings-models-catalog' | 'settings-models-local' | 'settings-models-local-repo'
    | 'harness' | 'harness-session'
    | 'toolforge'

export interface TalosMobileRoute {
    name: TalosMobileRouteName
    path: string
    desktop_station_id: string
    component: () => Promise<Component>
    /**
     * The page one level up, for routes that live INSIDE a station rather than
     * being one.
     *
     * Declared here, next to the path, because the alternative was discovered
     * the hard way: System Back asked only "is this a station?", every research
     * sub-page answered yes, and Back from a report threw the person out to the
     * chat with the main menu open instead of returning to the list. A route
     * that is nested in its path and silent about its parent is exactly the
     * shape of that bug, so the drift test refuses one.
     */
    parent?: TalosMobileRouteName
}

const loadChatScreen = () => import('@/screens/ChatScreen.vue').then((module) => module.default)
const loadChatsScreen = () => import('@/screens/ChatsScreen.vue').then((module) => module.default)
const loadMemoryScreen = () => import('@/screens/MemoryScreen.vue').then((module) => module.default)
const loadTasksScreen = () => import('@/screens/TasksScreen.vue').then((module) => module.default)
const loadNotesScreen = () => import('@/screens/NotesScreen.vue').then((module) => module.default)
const loadDoctorScreen = () => import('@/screens/DoctorScreen.vue').then((module) => module.default)
const loadResearchScreen = () => import('@/screens/ResearchScreen.vue').then((module) => module.default)
const loadResearchNewScreen = () => import('@/screens/ResearchNewScreen.vue').then((module) => module.default)
const loadResearchReportScreen = () => import('@/screens/ResearchReportScreen.vue').then((module) => module.default)
const loadResearchClaimScreen = () => import('@/screens/ResearchClaimScreen.vue').then((module) => module.default)
const loadResearchSourceScreen = () => import('@/screens/ResearchSourceScreen.vue').then((module) => module.default)
const loadContextScreen = () => import('@/screens/ContextScreen.vue').then((module) => module.default)
// Harness UI (24/8): debug-only coding-harness mockup — a native list plus a
// thin trampoline that reuses the top-level navigation already decided
// against the CSP (`frame-src 'none'`) when the Settings link first shipped.
const loadHarnessScreen = () => import('@/screens/HarnessScreen.vue').then((module) => module.default)
const loadHarnessSessionScreen = () => import('@/screens/HarnessSessionScreen.vue').then((module) => module.default)
// Tool Forge (27/8): tool creati da manifest dichiarativi, non da codice
// generato dal modello — vedi ADR-001 nel pacchetto d'origine.
const loadToolForgeScreen = () => import('@/screens/ToolForgeScreen.vue').then((module) => module.default)
const loadSettingsScreen = () => import('@/screens/SettingsScreen.vue').then((module) => module.default)
const loadSettingsModelsScreen = () => import('@/screens/SettingsModelsScreen.vue').then((module) => module.default)
const loadSettingsModelsProvidersScreen = () => import('@/screens/SettingsModelsProvidersScreen.vue').then((module) => module.default)
const loadSettingsModelsCatalogScreen = () => import('@/screens/SettingsModelsCatalogScreen.vue').then((module) => module.default)
const loadSettingsModelsLocalScreen = () => import('@/screens/SettingsModelsLocalScreen.vue').then((module) => module.default)
/**
 * ⭐ La pagina del controllo del telefono, e sta sotto le IMPOSTAZIONI.
 *
 * Non e' una stazione: non ci si va per fare qualcosa, ci si va per capire se
 * si puo'. Metterla fra le stazioni la offrirebbe come una funzione, e finche'
 * il produttore blocca non e' una funzione — e' una spiegazione.
 */
const loadPrivilegeScreen = () => import('@/screens/PrivilegeScreen.vue').then((module) => module.default)
// Vue Router accepts an ES-module lazy result and unwraps its default export.
// Keeping this new route in that native form avoids charging the initial entry
// for a redundant `.then(default)` adapter.
const loadSettingsModelsLocalRepoScreen = () => import('@/screens/SettingsModelsLocalRepoScreen.vue') as unknown as Promise<Component>
/*
 * Le pagine di dettaglio delle tre stazioni-elenco.
 *
 * Owner 2026-08-04, con quattro schermate di riferimento: «ogni voce apre una
 * pagina, ogni scheda apre una pagina dedicata, Indietro va alla precedente».
 * La Ricerca aveva gia' questa catena; Memoria, Note e Attivita' no — le loro
 * schede non si aprivano affatto, avevano solo i bottoni d'azione.
 *
 * E non e' solo coerenza: la riga mostrava il contenuto INTERO, senza taglio,
 * quindi una nota lunga rendeva la lista impossibile da scorrere. La pagina
 * esiste perche' il testo lungo abbia dove stare.
 */
const loadNoteItemScreen = () => import('@/screens/NoteItemScreen.vue').then((module) => module.default)
const loadNoteNewScreen = () => import('@/screens/NoteNewScreen.vue').then((module) => module.default)
const loadMemoryNewScreen = () => import('@/screens/MemoryNewScreen.vue').then((module) => module.default)
const loadTaskNewScreen = () => import('@/screens/TaskNewScreen.vue').then((module) => module.default)
const loadMemoryItemScreen = () => import('@/screens/MemoryItemScreen.vue').then((module) => module.default)
const loadTaskItemScreen = () => import('@/screens/TaskItemScreen.vue').then((module) => module.default)

// Route chunks remain packaged local assets in the Capacitor application. Chat is
// also mounted eagerly by App as the persistent base behind every station sheet.
// `desktop_station_id` values are canonical feature ids from the M0 parity ledger.
export const TALOS_MOBILE_ROUTES: readonly TalosMobileRoute[] = Object.freeze([
    { name: 'chat', path: '/', desktop_station_id: 'chat', component: loadChatScreen },
    // F3-T3 (owner #12, Claude pattern): dedicated chat-list page on mobile.
    { name: 'chats', path: '/chats', desktop_station_id: 'chat', component: loadChatsScreen },
    // F4 Memory station — desktop `memory` feature, local registry.
    { name: 'memory', path: '/memory', desktop_station_id: 'memory', component: loadMemoryScreen },
    // Prima di `/memory/:id`, o il parametro si mangia «new».
    { name: 'memory-new', path: '/memory/new', desktop_station_id: 'memory', component: loadMemoryNewScreen, parent: 'memory' },
    { name: 'memory-item', path: '/memory/:id', desktop_station_id: 'memory', component: loadMemoryItemScreen, parent: 'memory' },
    // F5 stations — local-first Tasks / Notes / Doctor.
    { name: 'tasks', path: '/tasks', desktop_station_id: 'tasks', component: loadTasksScreen },
    { name: 'task-new', path: '/tasks/new', desktop_station_id: 'tasks', component: loadTaskNewScreen, parent: 'tasks' },
    { name: 'task-item', path: '/tasks/:id', desktop_station_id: 'tasks', component: loadTaskItemScreen, parent: 'tasks' },
    { name: 'notes', path: '/notes', desktop_station_id: 'notes', component: loadNotesScreen },
    // Prima di `/notes/:id`, altrimenti il parametro si mangia «new» e la
    // creazione aprirebbe una nota che non esiste.
    { name: 'note-new', path: '/notes/new', desktop_station_id: 'notes', component: loadNoteNewScreen, parent: 'notes' },
    { name: 'note-item', path: '/notes/:id', desktop_station_id: 'notes', component: loadNoteItemScreen, parent: 'notes' },
    { name: 'doctor', path: '/doctor', desktop_station_id: 'doctor', component: loadDoctorScreen },
    /**
     * The research surfaces, from the list inwards.
     *
     * `/research/new` is declared BEFORE `/research/:id` on purpose. Vue Router
     * ranks a static segment above a parameter, so the order is not what saves
     * it — but a reader should not have to know that to be sure "new" is not a
     * research called new.
     *
     * Each is a real address rather than a sheet, because a research is the
     * thing a person most wants to reopen, keep and send — and the morning's
     * work on `?tab=` showed what an address that tells the truth is worth.
     */
    { name: 'research', path: '/research', desktop_station_id: 'research', component: loadResearchScreen },
    { name: 'research-new', path: '/research/new', desktop_station_id: 'research', component: loadResearchNewScreen, parent: 'research' },
    { name: 'research-report', path: '/research/:id', desktop_station_id: 'research', component: loadResearchReportScreen, parent: 'research' },
    { name: 'research-claim', path: '/research/:id/claim/:index', desktop_station_id: 'research', component: loadResearchClaimScreen, parent: 'research-report' },
    { name: 'research-source', path: '/research/:id/source/:index', desktop_station_id: 'research', component: loadResearchSourceScreen, parent: 'research-report' },
    { name: 'context', path: '/context', desktop_station_id: 'context_vault', component: loadContextScreen },
    { name: 'harness', path: '/harness', desktop_station_id: 'harness', component: loadHarnessScreen },
    { name: 'harness-session', path: '/harness/:id', desktop_station_id: 'harness', component: loadHarnessSessionScreen, parent: 'harness' },
    // Tool Forge — mobile-first, non è ancora nel ledger di parità desktop
    // (il pacchetto d'origine lo dichiara esplicitamente: "architecture-
    // compatible, not implemented in v1"). Stesso schema di 'harness', che
    // non è nella lista `expected_desktop_feature_ids` per lo stesso motivo.
    { name: 'toolforge', path: '/toolforge', desktop_station_id: 'tool_forge', component: loadToolForgeScreen },
    { name: 'settings', path: '/settings', desktop_station_id: 'settings', component: loadSettingsScreen },
    { name: 'settings-models', path: '/settings/models', desktop_station_id: 'settings', component: loadSettingsModelsScreen, parent: 'settings' },
    { name: 'settings-models-providers', path: '/settings/models/providers', desktop_station_id: 'settings', component: loadSettingsModelsProvidersScreen, parent: 'settings-models' },
    { name: 'settings-models-catalog', path: '/settings/models/catalog', desktop_station_id: 'settings', component: loadSettingsModelsCatalogScreen, parent: 'settings-models' },
    { name: 'settings-models-local', path: '/settings/models/local', desktop_station_id: 'settings', component: loadSettingsModelsLocalScreen, parent: 'settings-models' },
    { name: 'settings-models-local-repo', path: '/settings/models/local/:owner/:repo', desktop_station_id: 'settings', component: loadSettingsModelsLocalRepoScreen, parent: 'settings-models-local' },
    { name: 'settings-privilege', path: '/settings/privilege', desktop_station_id: 'settings', component: loadPrivilegeScreen, parent: 'settings' },
])

export const TALOS_MOBILE_ROUTE_NAMES: readonly TalosMobileRouteName[] = TALOS_MOBILE_ROUTES.map((route) => route.name)

let routePreloadPromise: Promise<void> | null = null

// Preserve route-level code splitting while making every packaged station
// available before the offline-capable shell becomes interactive.
// F3-T0/T6: lazily-split SHELL surfaces (sidebar, tool sheet, immersive
// chrome, composer drawer, lock, intro, toasts live in the entry) must also be
// warm before the shell claims offline readiness — on device everything is a
// local asset, but the offline contract is proven in the browser harness too.
const SHELL_CHUNKS: Array<() => Promise<unknown>> = [
    () => import('@/components/shell/TalosMobileSidebar.vue'),
    () => import('@/components/shell/TalosMobileToolSheet.vue'),
    () => import('@/components/shell/TalosMobileImmersiveChrome.vue'),
    () => import('@/components/chat/TalosMobileComposerDrawer.vue'),
    () => import('@/components/security/TalosMobileLockScreen.vue'),
    () => import('@/components/intro/TalosMobileSetupIntro.vue'),
]

export function preloadTalosMobileRoutes(): Promise<void> {
    if (routePreloadPromise) return routePreloadPromise

    routePreloadPromise = Promise.all([
        ...TALOS_MOBILE_ROUTES.map((route) => route.component()),
        ...SHELL_CHUNKS.map((load) => load()),
    ])
        .then(() => undefined)
        .catch((error: unknown) => {
            routePreloadPromise = null
            throw error
        })

    return routePreloadPromise
}

export function isTalosMobileRouteName(value: unknown): value is TalosMobileRouteName {
    return typeof value === 'string' && (TALOS_MOBILE_ROUTE_NAMES as readonly string[]).includes(value)
}

export interface TalosMobileRouteTarget {
    readonly name: TalosMobileRouteName
    readonly params: Readonly<Record<string, string>>
}

/**
 * Which station a route belongs to — the list, its report, its claims and its
 * sources are all one place as far as the person is concerned.
 *
 * Used to tell "I moved WITHIN Deep Research" from "I left it for somewhere
 * else", which is the difference between a move Back should undo with history
 * and one it should undo by leaving the station.
 */
export function talosMobileStationOf(name: string): string | null {
    return TALOS_MOBILE_ROUTES.find((entry) => entry.name === name)?.desktop_station_id ?? null
}

/**
 * Where "up" goes from a page inside a station, params and all.
 *
 * The parameters are read off the PARENT'S OWN path rather than copied wholesale
 * from the child: a claim knows `id` and `index`, its parent wants only `id`,
 * and handing a report an index it never declared is how a route quietly starts
 * matching something else. Deriving them from the path also means a future
 * nested route gets this right without anyone remembering to.
 *
 * Null for every station top and for the chat: those are not "inside" anything,
 * and Back has its own older answer for them (owner 2026-07-24 — a station top
 * returns to the main menu).
 */
export function talosMobileParentRoute(
    name: string,
    params: Readonly<Record<string, unknown>> = {},
): TalosMobileRouteTarget | null {
    const route = TALOS_MOBILE_ROUTES.find((entry) => entry.name === name)
    if (!route?.parent) return null
    const parent = TALOS_MOBILE_ROUTES.find((entry) => entry.name === route.parent)
    if (!parent) return null

    const wanted: Record<string, string> = {}
    for (const segment of parent.path.split('/')) {
        if (segment[0] !== ':') continue
        const key = segment.slice(1)
        const value = params[key]
        // A parent that needs a parameter we do not have is not a destination.
        // Better to fall through to the station rules than to push a broken URL.
        if (typeof value !== 'string' || !value) return null
        wanted[key] = value
    }
    return { name: route.parent, params: wanted }
}

// Compatibility symbol retained for test/consumer code that previously asked for
// an async route component. Vue Router owns loading and caching the returned loader.
