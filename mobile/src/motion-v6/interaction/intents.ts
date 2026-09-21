import type { TalosInterfaceMotionCategories } from '../contracts'

export const TALOS_INTERACTION_INTENTS = Object.freeze([
    'window-open', 'window-close', 'window-minimize', 'window-restore', 'window-focus',
    'sidebar-open', 'sidebar-close', 'disclosure-open', 'disclosure-close', 'tab-change',
    'menu-open', 'menu-close', 'popover-open', 'popover-close', 'dropdown-open', 'dropdown-close',
    'composer-expand', 'composer-collapse', 'message-insert', 'activity', 'success', 'warning', 'error',
    'theme-transition',
] as const)

export type TalosInteractionIntent = typeof TALOS_INTERACTION_INTENTS[number]
export type TalosInteractionCategory = keyof TalosInterfaceMotionCategories

export const TALOS_INTERACTION_INTENT_CATEGORIES: Readonly<Record<TalosInteractionIntent, TalosInteractionCategory>> = Object.freeze({
    'window-open': 'windows',
    'window-close': 'windows',
    'window-minimize': 'windows',
    'window-restore': 'windows',
    'window-focus': 'windows',
    'sidebar-open': 'navigation',
    'sidebar-close': 'navigation',
    'disclosure-open': 'navigation',
    'disclosure-close': 'navigation',
    'tab-change': 'navigation',
    'menu-open': 'surfaces',
    'menu-close': 'surfaces',
    'popover-open': 'surfaces',
    'popover-close': 'surfaces',
    'dropdown-open': 'surfaces',
    'dropdown-close': 'surfaces',
    'composer-expand': 'composer',
    'composer-collapse': 'composer',
    'message-insert': 'messages',
    activity: 'feedback',
    success: 'feedback',
    warning: 'feedback',
    error: 'feedback',
    'theme-transition': 'surfaces',
})
