import type { InjectionKey } from 'vue'
import type { TalosMobileWizardState } from '@/composables/useTalosMobileWizardState'

/**
 * N1 — provide/inject key for the account-wizard gate (mirrors
 * TALOS_MOBILE_INTRO_KEY). App.vue provides the App-scoped wizard state; the
 * wizard shell consumes it to persist its outcome + register hardware-Back, and
 * the Settings → Account replay row consumes it to re-open the wizard.
 */
export const TALOS_MOBILE_WIZARD_KEY: InjectionKey<TalosMobileWizardState> = Symbol('talos-mobile-wizard')
