import type { TalosTranslate } from '@/i18n/contracts'

/**
 * What a running tool is called, in the user's words.
 *
 * Owner testing 2026-07-26 caught this the first time the web tools ran: the
 * chat showed four identical rows reading `web_read...`, the wire name, four
 * times over. Two failures in one — the label map only knew the original six
 * tools so the new ones fell through to the protocol name, and the activity
 * carried no detail, so there was no way to tell which page was being read.
 *
 * Both are fixed here, and a test asserts every tool the toolset can produce has
 * an entry — the guard has to fail when a tool is ADDED without a label, not
 * when someone remembers to look.
 */
export const TALOS_TOOL_LABELS: Record<string, string> = {
    library_list: 'Browsing your Library',
    library_search: 'Searching your Library',
    library_read: 'Reading a document',
    library_file_origin: 'Checking where a file came from',
    notes_list: 'Looking at your notes',
    tasks_list: 'Looking at your tasks',
    memory_search: 'Checking what it remembers',
    time_now: 'Checking the time',
    web_search: 'Searching the web',
    web_read: 'Reading a web page',
    document_create: 'Making a document',
    generate_image: 'Generating an image',
    library_export: 'Saving a file to your device',
    library_context_policy_update: 'Changing Library context policy',
}

export const TALOS_TOOL_LABEL_KEYS: Record<string, string> = {
    library_list: 'toolActivity.libraryList',
    library_search: 'toolActivity.librarySearch',
    library_read: 'toolActivity.libraryRead',
    library_file_origin: 'toolActivity.libraryFileOrigin',
    notes_list: 'toolActivity.notesList',
    tasks_list: 'toolActivity.tasksList',
    memory_search: 'toolActivity.memorySearch',
    time_now: 'toolActivity.timeNow',
    web_search: 'toolActivity.webSearch',
    web_read: 'toolActivity.webRead',
    document_create: 'toolActivity.documentCreate',
    generate_image: 'toolActivity.generateImage',
    library_export: 'toolActivity.libraryExport',
    library_context_policy_update: 'toolActivity.libraryContextPolicyUpdate',
}

export interface TalosToolConsentCopy {
    title: string
    description: string
}

export const TALOS_TOOL_CONSENT_KEYS: Record<string, TalosToolConsentCopy> = {
    library_list: {
        title: 'toolConsent.libraryList.title',
        description: 'toolConsent.libraryList.description',
    },
    library_search: {
        title: 'toolConsent.librarySearch.title',
        description: 'toolConsent.librarySearch.description',
    },
    library_read: {
        title: 'toolConsent.libraryRead.title',
        description: 'toolConsent.libraryRead.description',
    },
    library_file_origin: {
        title: 'toolConsent.libraryFileOrigin.title',
        description: 'toolConsent.libraryFileOrigin.description',
    },
    notes_list: {
        title: 'toolConsent.notesList.title',
        description: 'toolConsent.notesList.description',
    },
    tasks_list: {
        title: 'toolConsent.tasksList.title',
        description: 'toolConsent.tasksList.description',
    },
    memory_search: {
        title: 'toolConsent.memorySearch.title',
        description: 'toolConsent.memorySearch.description',
    },
    time_now: {
        title: 'toolConsent.timeNow.title',
        description: 'toolConsent.timeNow.description',
    },
    web_search: {
        title: 'toolConsent.webSearch.title',
        description: 'toolConsent.webSearch.description',
    },
    web_read: {
        title: 'toolConsent.webRead.title',
        description: 'toolConsent.webRead.description',
    },
    document_create: {
        title: 'toolConsent.documentCreate.title',
        description: 'toolConsent.documentCreate.description',
    },
    generate_image: {
        title: 'toolConsent.generateImage.title',
        description: 'toolConsent.generateImage.description',
    },
    library_export: {
        title: 'toolConsent.libraryExport.title',
        description: 'toolConsent.libraryExport.description',
    },
    library_context_policy_update: {
        title: 'toolConsent.libraryContextPolicyUpdate.title',
        description: 'toolConsent.libraryContextPolicyUpdate.description',
    },
}

/**
 * Provider schemas stay stable and English; only the human authorization
 * surface receives localized presentation copy. Custom prompts, such as the
 * generated-file save marker, arrive localized already and keep their copy.
 */
export function talosToolConsentCopy(
    tool: { name?: string; title: string; description: string },
    translate: TalosTranslate,
): TalosToolConsentCopy {
    const keys = tool.name ? TALOS_TOOL_CONSENT_KEYS[tool.name] : undefined
    if (!keys) return { title: tool.title, description: tool.description }
    return {
        title: translate(keys.title),
        description: translate(keys.description),
    }
}

/**
 * Which icon a running tool shows.
 *
 * Owner 2026-07-26: creating a document displayed the WEB SEARCH globe, because
 * the streaming view hardcoded one icon for every tool row. Same failure as the
 * labels a day earlier — a new tool inherits whatever the last one happened to
 * use — so it gets the same guard: names live here beside the labels, and a test
 * fails when a tool arrives without one.
 *
 * Names, not components: this module is pure, and pulling icon components into
 * it would drag the view layer into every place that reads a tool label.
 */
export type TalosToolIconName =
    | 'library'
    | 'note'
    | 'task'
    | 'memory'
    | 'clock'
    | 'web'
    | 'document'
    | 'image'
    | 'download'
    | 'tool'

export const TALOS_TOOL_ICONS: Record<string, TalosToolIconName> = {
    library_list: 'library',
    library_search: 'library',
    library_read: 'library',
    library_file_origin: 'library',
    notes_list: 'note',
    tasks_list: 'task',
    memory_search: 'memory',
    time_now: 'clock',
    web_search: 'web',
    web_read: 'web',
    document_create: 'document',
    generate_image: 'image',
    library_export: 'download',
    library_context_policy_update: 'library',
}

/** An unknown tool gets the generic mark rather than another tool's. */
export function talosToolIconName(name: string): TalosToolIconName {
    return TALOS_TOOL_ICONS[name] ?? 'tool'
}

export interface TalosToolActivity {
    name: string
    /** Which page, which query — the part that makes four rows distinguishable. */
    detail: string | null
}

/**
 * The line shown to the user. An unknown tool falls back to its own name rather
 * than to nothing: a mystery row is worse than a technical one.
 */
export function talosToolActivityLabel(
    activity: TalosToolActivity,
    localizedLabel?: string,
): string {
    const label = localizedLabel ?? TALOS_TOOL_LABELS[activity.name] ?? activity.name
    return activity.detail ? `${label}: ${activity.detail}` : label
}

/**
 * A short, human detail pulled from the call's arguments.
 *
 * Deliberately narrow: a hostname or a query, never the whole argument object.
 * This ends up on screen while the model is working, and a wall of JSON there is
 * noise — and could leak more of a document's content than the row intends.
 */
export function talosToolActivityDetail(name: string, argumentsJson: string): string | null {
    let parsed: unknown
    try {
        parsed = JSON.parse(argumentsJson || '{}')
    } catch {
        return null
    }
    if (!parsed || typeof parsed !== 'object') return null
    const input = parsed as Record<string, unknown>

    if (name === 'library_export') {
        const reference = input.reference
        if (typeof reference !== 'string' || reference.trim() === '') return null
        const value = reference.trim()
        return value.length > 48 ? `${value.slice(0, 48)}…` : value
    }
    if (name === 'library_context_policy_update') {
        const action = typeof input.action === 'string' ? input.action : null
        const scope = typeof input.scope === 'string' ? input.scope : null
        return action && scope ? `${scope}: ${action}`.slice(0, 48) : null
    }
    if (name === 'web_read' || name === 'library_read') {
        const value = input.url ?? input.id
        if (typeof value !== 'string' || value === '') return null
        try {
            // The site is what a person recognises; the full url is noise.
            return new URL(value).hostname.replace(/^www\./, '')
        } catch {
            return value.slice(0, 40)
        }
    }
    const query = input.query
    if (typeof query === 'string' && query.trim() !== '') {
        return query.length > 48 ? `${query.slice(0, 48)}…` : query
    }
    return null
}
