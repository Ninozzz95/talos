export type TalosShortcutActionId =
    | 'search_conversations'
    | 'toggle_sidebar'
    | 'focus_chat_input'
    | 'toggle_active_window'
    | 'new_session'
    | 'cancel_close'
    | 'open_calendar'
    | 'open_compare'
    | 'open_cookbook'
    | 'open_deep_research'
    | 'open_gallery'
    | 'open_library'
    | 'open_memory'
    | 'open_notes'
    | 'open_tasks'
    | 'open_theme'

export type TalosShortcutDefinition = {
    id: TalosShortcutActionId
    group: string
    label: string
    defaultBinding: string
}

export const TALOS_SHORTCUTS: TalosShortcutDefinition[] = [
    { id: 'search_conversations', group: 'Navigation', label: 'Search commands', defaultBinding: 'Ctrl+K' },
    { id: 'toggle_sidebar', group: 'Navigation', label: 'Toggle sidebar', defaultBinding: 'Ctrl+B' },
    { id: 'focus_chat_input', group: 'Navigation', label: 'Focus chat input', defaultBinding: 'Ctrl+/' },
    { id: 'toggle_active_window', group: 'Navigation', label: 'Toggle active window', defaultBinding: 'Ctrl+,' },
    { id: 'new_session', group: 'Sessions', label: 'New session', defaultBinding: 'Ctrl+Alt+N' },
    { id: 'cancel_close', group: 'Tools', label: 'Cancel or close', defaultBinding: 'Esc' },
    { id: 'open_calendar', group: 'Open Tools', label: 'Open Calendar', defaultBinding: 'Ctrl+Alt+C' },
    { id: 'open_compare', group: 'Open Tools', label: 'Open Compare', defaultBinding: '' },
    { id: 'open_cookbook', group: 'Open Tools', label: 'Open Cookbook', defaultBinding: '' },
    { id: 'open_deep_research', group: 'Open Tools', label: 'Open Deep Research', defaultBinding: '' },
    { id: 'open_gallery', group: 'Open Tools', label: 'Open Gallery', defaultBinding: '' },
    { id: 'open_library', group: 'Open Tools', label: 'Open Library', defaultBinding: '' },
    { id: 'open_memory', group: 'Open Tools', label: 'Open Memory', defaultBinding: '' },
    { id: 'open_notes', group: 'Open Tools', label: 'Open Notes', defaultBinding: '' },
    { id: 'open_tasks', group: 'Open Tools', label: 'Open Tasks', defaultBinding: '' },
    { id: 'open_theme', group: 'Open Tools', label: 'Open Theme', defaultBinding: '' },
]

const SHORTCUT_BY_ID = new Map(TALOS_SHORTCUTS.map((shortcut) => [shortcut.id, shortcut]))

export function defaultTalosShortcuts(): Record<TalosShortcutActionId, string> {
    return Object.fromEntries(TALOS_SHORTCUTS.map((shortcut) => [shortcut.id, shortcut.defaultBinding])) as Record<TalosShortcutActionId, string>
}

export function resolveTalosShortcuts(value: unknown): Record<TalosShortcutActionId, string> {
    const resolved = defaultTalosShortcuts()
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return resolved
    }

    for (const [id, binding] of Object.entries(value)) {
        if (!SHORTCUT_BY_ID.has(id as TalosShortcutActionId) || typeof binding !== 'string') {
            continue
        }

        const normalized = normalizeShortcutBinding(binding)
        if (normalized !== null) {
            resolved[id as TalosShortcutActionId] = normalized
        }
    }

    return resolved
}

export function normalizeShortcutBinding(binding: string): string | null {
    const trimmed = binding.trim()
    if (!trimmed) {
        return ''
    }

    if (/[<>{};]/.test(trimmed) || trimmed.length > 48) {
        return null
    }

    const parts = trimmed.split('+').map((part) => part.trim()).filter(Boolean)
    if (!parts.length || parts.length > 4) {
        return null
    }

    const modifiers = new Set<string>()
    let key = ''
    for (const part of parts) {
        const lower = part.toLowerCase()
        if (lower === 'ctrl' || lower === 'control') {
            modifiers.add('Ctrl')
        } else if (lower === 'alt' || lower === 'option') {
            modifiers.add('Alt')
        } else if (lower === 'shift') {
            modifiers.add('Shift')
        } else if (lower === 'meta' || lower === 'cmd' || lower === 'command') {
            modifiers.add('Meta')
        } else if (!key) {
            key = part.length === 1 ? part.toUpperCase() : part === 'Escape' ? 'Esc' : part
        } else {
            return null
        }
    }

    if (!key) {
        return null
    }

    return [...['Ctrl', 'Alt', 'Shift', 'Meta'].filter((modifier) => modifiers.has(modifier)), key].join('+')
}

export function shortcutFromKeyboardEvent(event: KeyboardEvent): string | null {
    if (event.getModifierState?.('AltGraph')) {
        return null
    }

    const key = event.key === 'Escape'
        ? 'Esc'
        : event.key === ' '
            ? 'Space'
            : event.key.length === 1
                ? event.key.toUpperCase()
                : event.key

    if (['Control', 'Alt', 'Shift', 'Meta'].includes(key)) {
        return null
    }

    const parts = [
        event.ctrlKey ? 'Ctrl' : '',
        event.altKey ? 'Alt' : '',
        event.shiftKey ? 'Shift' : '',
        event.metaKey ? 'Meta' : '',
        key,
    ].filter(Boolean)

    return normalizeShortcutBinding(parts.join('+'))
}

export function shortcutConflict(
    shortcuts: Record<string, string>,
    actionId: string,
    binding: string,
): string | null {
    if (!binding) {
        return null
    }

    const normalized = binding.toLowerCase()
    for (const shortcut of TALOS_SHORTCUTS) {
        if (shortcut.id === actionId) {
            continue
        }

        if ((shortcuts[shortcut.id] ?? '').toLowerCase() === normalized) {
            return shortcut.label
        }
    }

    return null
}

export function isTypingTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) {
        return false
    }

    return target.isContentEditable
        || target.tagName === 'INPUT'
        || target.tagName === 'TEXTAREA'
        || target.tagName === 'SELECT'
}
