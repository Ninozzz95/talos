import type { Component } from 'vue'

export type TalosMobileRouteName = 'chat' | 'research' | 'runs' | 'context' | 'settings'

export interface TalosMobileRoute {
    name: TalosMobileRouteName
    path: string
    desktop_station_id: string
    component: () => Promise<Component>
}

const loadChatScreen = () => import('@/screens/ChatScreen.vue').then((module) => module.default)
const loadResearchScreen = () => import('@/screens/ResearchScreen.vue').then((module) => module.default)
const loadRunsScreen = () => import('@/screens/RunsScreen.vue').then((module) => module.default)
const loadContextScreen = () => import('@/screens/ContextScreen.vue').then((module) => module.default)
const loadSettingsScreen = () => import('@/screens/SettingsScreen.vue').then((module) => module.default)

// Route chunks remain packaged local assets in the Capacitor application. Chat is
// also mounted eagerly by App as the persistent base behind every station sheet.
// `desktop_station_id` values are canonical feature ids from the M0 parity ledger.
export const TALOS_MOBILE_ROUTES: readonly TalosMobileRoute[] = Object.freeze([
    { name: 'chat', path: '/', desktop_station_id: 'chat', component: loadChatScreen },
    { name: 'research', path: '/research', desktop_station_id: 'research', component: loadResearchScreen },
    { name: 'runs', path: '/runs', desktop_station_id: 'tasks', component: loadRunsScreen },
    { name: 'context', path: '/context', desktop_station_id: 'context_vault', component: loadContextScreen },
    { name: 'settings', path: '/settings', desktop_station_id: 'settings', component: loadSettingsScreen },
])

export const TALOS_MOBILE_ROUTE_NAMES: readonly TalosMobileRouteName[] = Object.freeze(
    TALOS_MOBILE_ROUTES.map((route) => route.name),
)

let routePreloadPromise: Promise<void> | null = null

// Preserve route-level code splitting while making every packaged station
// available before the offline-capable shell becomes interactive.
export function preloadTalosMobileRoutes(): Promise<void> {
    if (routePreloadPromise) return routePreloadPromise

    routePreloadPromise = Promise.all(TALOS_MOBILE_ROUTES.map((route) => route.component()))
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

// Compatibility symbol retained for test/consumer code that previously asked for
// an async route component. Vue Router owns loading and caching the returned loader.
export function asyncRouteComponent(route: TalosMobileRoute): TalosMobileRoute['component'] {
    return route.component
}
