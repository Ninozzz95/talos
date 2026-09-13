import type { TalosThemeId } from '../../lib/talosThemes'
import type { TalosMotionV6Preferences } from '../contracts'
import type { TalosInteractionIntent } from './intents'
import { getTalosInteractionProfileV6 } from './profiles'
import {
    createDefaultInteractionProfile,
    resolveTalosInteractionMotion,
    type TalosInteractionMotionPlan,
} from './resolver'

export type TalosInteractionMotionStyleRequest = Readonly<{
    themeId: TalosThemeId
    preferences: TalosMotionV6Preferences
    reducedMotion: boolean
    paused: boolean
}>

type TalosInteractionPresentation = Readonly<{
    open: string
    surface: string
    feedback: string
    hover: string
}>

const TALOS_INTERACTION_PRESENTATION_V6: Readonly<Record<TalosThemeId, TalosInteractionPresentation>> = Object.freeze({
    forge: Object.freeze({ open: 'standard', surface: 'slide-fade', feedback: 'status-lock', hover: 'edge-glow' }),
    paper: Object.freeze({ open: 'soft-fade', surface: 'fade', feedback: 'none', hover: 'underline' }),
    terminal: Object.freeze({ open: 'terminal-snap', surface: 'scanline', feedback: 'trace', hover: 'underline' }),
    aurora: Object.freeze({ open: 'depth', surface: 'scale-fade', feedback: 'pulse', hover: 'node-glow' }),
    glacier: Object.freeze({ open: 'standard', surface: 'slide-fade', feedback: 'edge-flash', hover: 'edge-glow' }),
    // F1 calm refactor: soft fades, subtle pulse feedback, gentle lift hover.
    calm: Object.freeze({ open: 'soft-fade', surface: 'fade', feedback: 'pulse', hover: 'lift' }),
    ember: Object.freeze({ open: 'standard', surface: 'scale-fade', feedback: 'edge-flash', hover: 'edge-glow' }),
    atlas: Object.freeze({ open: 'standard', surface: 'axis-shift', feedback: 'trace', hover: 'node-glow' }),
    noir: Object.freeze({ open: 'soft-fade', surface: 'fade', feedback: 'status-lock', hover: 'underline' }),
    signal: Object.freeze({ open: 'depth', surface: 'slide-fade', feedback: 'trace', hover: 'node-glow' }),
    violet: Object.freeze({ open: 'depth', surface: 'scale-fade', feedback: 'pulse', hover: 'edge-glow' }),
    claudius: Object.freeze({ open: 'soft-fade', surface: 'fade', feedback: 'none', hover: 'underline' }),
    basicus: Object.freeze({ open: 'standard', surface: 'fade', feedback: 'edge-flash', hover: 'lift' }),
    telemetry: Object.freeze({ open: 'standard', surface: 'slide-fade', feedback: 'trace', hover: 'underline' }),
})

function duration(plan: TalosInteractionMotionPlan): string {
    return `${plan.durationMs}ms`
}

export function talosInteractionMotionStyleV6(request: TalosInteractionMotionStyleRequest): Record<string, string> {
    const profile = getTalosInteractionProfileV6(request.themeId) ?? createDefaultInteractionProfile()
    const resolve = (intent: TalosInteractionIntent) => resolveTalosInteractionMotion({
        intent,
        profile,
        interfaceEnabled: request.preferences.interface_enabled && !request.paused,
        reducedMotion: request.reducedMotion,
        preferences: request.preferences.interface,
    })
    const plans = {
        control: resolve('window-focus'),
        windowOpen: resolve('window-open'),
        windowClose: resolve('window-close'),
        windowRestore: resolve('window-restore'),
        windowMinimize: resolve('window-minimize'),
        disclosure: resolve('disclosure-open'),
        menuOpen: resolve('menu-open'),
        menuClose: resolve('menu-close'),
        popover: resolve('popover-open'),
        tab: resolve('tab-change'),
        composerExpand: resolve('composer-expand'),
        composerCollapse: resolve('composer-collapse'),
        message: resolve('message-insert'),
        activity: resolve('activity'),
        success: resolve('success'),
        error: resolve('error'),
        theme: resolve('theme-transition'),
    }
    const enabled = !request.paused
        && !request.reducedMotion
        && request.preferences.interface_enabled
        && request.preferences.interface.profile !== 'off'
    const presentation = TALOS_INTERACTION_PRESENTATION_V6[request.themeId]

    return {
        '--talos-motion-duration-control': duration(plans.control),
        '--talos-motion-duration-surface-enter': duration(plans.menuOpen),
        '--talos-motion-duration-surface-exit': duration(plans.menuClose),
        '--talos-motion-duration-window-open': duration(plans.windowOpen),
        '--talos-motion-duration-window-close': duration(plans.windowClose),
        '--talos-motion-duration-window-restore': duration(plans.windowRestore),
        '--talos-motion-duration-window-minimize': duration(plans.windowMinimize),
        '--talos-motion-duration-window-focus': duration(plans.control),
        '--talos-motion-duration-disclosure': duration(plans.disclosure),
        '--talos-motion-duration-popover': duration(plans.popover),
        '--talos-motion-duration-menu': duration(plans.menuOpen),
        '--talos-motion-duration-tab-change': duration(plans.tab),
        '--talos-motion-duration-composer-expand': duration(plans.composerExpand),
        '--talos-motion-duration-composer-collapse': duration(plans.composerCollapse),
        '--talos-motion-duration-message-insert': duration(plans.message),
        '--talos-motion-duration-activity-progress': duration(plans.activity),
        '--talos-motion-duration-error-attention': duration(plans.error),
        '--talos-motion-duration-success-confirm': duration(plans.success),
        '--talos-motion-duration-theme-transition': duration(plans.theme),
        '--talos-motion-open-duration': duration(plans.menuOpen),
        '--talos-motion-close-duration': duration(plans.menuClose),
        '--talos-motion-surface-duration': duration(plans.disclosure),
        '--talos-motion-feedback-duration': duration(plans.success),
        '--talos-motion-stagger': `${plans.message.delayMs}ms`,
        '--talos-motion-intensity': enabled ? String(request.preferences.interface.intensity / 100) : '0',
        '--talos-motion-ease': plans.menuOpen.easing,
        '--talos-motion-ease-exit': plans.menuClose.easing,
        '--talos-motion-ease-tab-change': plans.tab.easing,
        '--talos-motion-ease-composer-expand': plans.composerExpand.easing,
        '--talos-motion-ease-composer-collapse': plans.composerCollapse.easing,
        '--talos-motion-open-transform': plans.menuOpen.keyframes[0]?.transform ?? 'none',
        '--talos-motion-surface-transform': plans.disclosure.keyframes[0]?.transform ?? 'none',
        '--talos-motion-tab-change-transform': plans.tab.keyframes[0]?.transform ?? 'none',
        // The offset alone, so the keyframes can point it the other way when a
        // tab is reached by going BACK. A composed transform string cannot have
        // one of its components negated in CSS.
        '--talos-motion-tab-change-x': `${plans.tab.enterX}px`,
        '--talos-motion-tab-change-opacity': `${plans.tab.keyframes[0]?.opacity ?? 1}`,
        '--talos-motion-open-style': plans.menuOpen.enabled ? presentation.open : 'off',
        '--talos-motion-surface-style': plans.menuOpen.enabled ? presentation.surface : 'off',
        '--talos-motion-feedback-style': plans.success.enabled ? presentation.feedback : 'none',
        '--talos-motion-hover-style': enabled ? presentation.hover : 'none',
    }
}
