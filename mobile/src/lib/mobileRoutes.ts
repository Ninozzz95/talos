import { defineAsyncComponent, type Component } from 'vue'
import ChatScreen from '@/screens/ChatScreen.vue'
import ResearchScreen from '@/screens/ResearchScreen.vue'
import RunsScreen from '@/screens/RunsScreen.vue'
import ContextScreen from '@/screens/ContextScreen.vue'
import SettingsScreen from '@/screens/SettingsScreen.vue'

export type TalosMobileRouteName = 'chat' | 'research' | 'runs' | 'context' | 'settings'

export interface TalosMobileRoute {
    name: TalosMobileRouteName
    path: string
    desktop_station_id: string
    component: () => Promise<Component>
}

// Each tab route resolves its real parity screen. Screens are bundled eagerly (not
// dynamic imports) so navigation works fully offline (local-first: no chunk fetch
// in airplane mode). `desktop_station_id` values are canonical feature ids from the
// M0 parity ledger (docs/feature-parity.json). Mission Path is intentionally absent.
export const TALOS_MOBILE_ROUTES: readonly TalosMobileRoute[] = Object.freeze([
    { name: 'chat', path: '/', desktop_station_id: 'chat', component: () => Promise.resolve(ChatScreen) },
    { name: 'research', path: '/research', desktop_station_id: 'research', component: () => Promise.resolve(ResearchScreen) },
    { name: 'runs', path: '/runs', desktop_station_id: 'tasks', component: () => Promise.resolve(RunsScreen) },
    { name: 'context', path: '/context', desktop_station_id: 'context_vault', component: () => Promise.resolve(ContextScreen) },
    { name: 'settings', path: '/settings', desktop_station_id: 'settings', component: () => Promise.resolve(SettingsScreen) },
])

export const TALOS_MOBILE_ROUTE_NAMES: readonly TalosMobileRouteName[] = Object.freeze(
    TALOS_MOBILE_ROUTES.map((route) => route.name),
)

export function isTalosMobileRouteName(value: unknown): value is TalosMobileRouteName {
    return typeof value === 'string' && (TALOS_MOBILE_ROUTE_NAMES as readonly string[]).includes(value)
}

// Async-component form for the router, keeping the frozen route contract above.
export function asyncRouteComponent(route: TalosMobileRoute): Component {
    return defineAsyncComponent(route.component)
}
