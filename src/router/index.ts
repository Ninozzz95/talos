import { createRouter, createWebHistory, type Router, type RouteRecordRaw } from 'vue-router'
import { TALOS_MOBILE_ROUTES } from '@/lib/mobileRoutes'

const routes: RouteRecordRaw[] = TALOS_MOBILE_ROUTES.map((route) => ({
    path: route.path,
    name: route.name,
    component: route.component,
}))

export const router: Router = createRouter({
    history: createWebHistory(),
    routes,
})
