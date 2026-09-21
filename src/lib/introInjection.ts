import type { InjectionKey } from 'vue'
import type { TalosMobileIntroState } from '@/composables/useTalosMobileIntroState'

/**
 * F2-T6 — typed injection for the intro controller (owner: App.vue). The
 * Settings Account panel injects it for the "Replay introduction" row —
 * mobile mirror of the desktop replay chain (Settings → workspace → composable).
 */
export const TALOS_MOBILE_INTRO_KEY: InjectionKey<TalosMobileIntroState> = Symbol('talos-mobile-intro')
