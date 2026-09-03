import { createRouter, createWebHistory, type Router, type RouteRecordRaw } from 'vue-router'
import { TALOS_MOBILE_ROUTES } from '@/lib/mobileRoutes'
import { talosHarnessUiAvailable } from '@/services/harnessUi'

const routes: RouteRecordRaw[] = TALOS_MOBILE_ROUTES.map((route) => ({
    path: route.path,
    name: route.name,
    component: route.component,
}))

export const router: Router = createRouter({
    history: createWebHistory(),
    routes,
})

/**
 * ⛔⛔⛔ 3/9 — owner, urgente: v0.1.23 pubblicata mostrava "Codice" come
 * presente — la barra laterale tablet apriva la sua variante "harness"
 * guardando SOLO il nome della rotta corrente (App.vue, tabletRailVariant)
 * — mentre il contenuto della sessione diceva onestamente "not available".
 * Un APK di release non ha MAI il plugin nativo che regge Codice
 * (talosHarnessUiAvailable(), commento alla sorgente: la classe Kotlin
 * "vive SOLO nel source set debug", non compila affatto in release).
 *
 * Causa vera: nessun punto controllava la disponibilità PRIMA di arrivare
 * sulla rotta — solo il nome. Un riavvio dell'app può restituire
 * QUALUNQUE rotta salvata (Vue Router ripristina l'ultima nota), inclusa
 * /harness/<id> se il dispositivo aveva mai avuto una build di debug
 * installata. `TalosMobileSidebar.vue` (telefono) già controllava
 * `talosHarnessUiAvailable()` prima di offrire la voce di navigazione;
 * la barra tablet e il redirect automatico "apri l'ultima sessione"
 * (App.vue, watch con `immediate:true`) non lo facevano affatto.
 *
 * Un guard qui, non un controllo ripetuto in ogni consumatore: intercetta
 * OGNI via d'ingresso alla rotta (URL diretto, rotta ripristinata al
 * boot, navigazione programmatica, telefono E tablet) in un punto solo.
 * `HarnessSessionScreen.vue` mantiene comunque il proprio "not available"
 * come rete di sicurezza — due livelli, non uno che sostituisce l'altro.
 */
router.beforeEach((to) => {
    if ((to.name === 'harness' || to.name === 'harness-session') && !talosHarnessUiAvailable()) {
        return { name: 'chat' }
    }
    return true
})
