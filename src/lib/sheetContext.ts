import type { InjectionKey } from 'vue'

/**
 * F3-T3 chrome dedup — provided (true) by TalosMobileToolSheet so screens
 * presented inside it drop their own duplicate header (one title per surface).
 */
export const TALOS_SHEET_CONTEXT_KEY: InjectionKey<boolean> = Symbol('talos-sheet-context')
