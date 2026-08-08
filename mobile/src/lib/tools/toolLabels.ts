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
    notes_create: 'Writing a note',
    notes_update: 'Editing a note',
    notes_delete: 'Deleting a note',
    tasks_create: 'Adding a task',
    tasks_complete: 'Updating a task',
    tasks_update: 'Editing a task',
    tasks_delete: 'Deleting a task',
    tasks_list: 'Looking at your tasks',
    memory_write: 'Saving something to memory',
    memory_update: 'Correcting a memory',
    memory_delete: 'Forgetting something',
    library_rename: 'Renaming a Library file',
    library_delete: 'Deleting a Library file',
    memory_search: 'Checking what it remembers',
    time_now: 'Checking the time',
    web_search: 'Searching the web',
    web_read: 'Reading a web page',
    document_create: 'Making a document',
    generate_image: 'Generating an image',
    library_export: 'Saving a file to your device',
    library_context_policy_update: 'Changing Library context policy',
    research_list: 'Looking at your researches',
    research_start: 'Starting a deep research',
    research_read: 'Reading a research report',
    research_rename: 'Renaming a research',
    research_pause: 'Pausing a research',
    research_resume: 'Resuming a research',
    research_cancel: 'Stopping a research',
    research_delete: 'Deleting a research',
    device_status: 'Checking the phone',
    device_torch: 'Using the torch',
    device_vibrate: 'Buzzing the phone',
    device_volume: 'Changing the volume',
    device_alarm: 'Setting an alarm',
    device_open_app: 'Opening an app',
    device_open_settings: 'Opening a settings screen',
    device_compose: 'Preparing a message',
    device_speak: 'Speaking out loud',
    device_wallpaper: 'Setting the wallpaper',
    device_keep_awake: 'Holding the screen awake',
    device_wifi: 'Switching Wi-Fi',
    device_bluetooth: 'Switching Bluetooth',
    device_do_not_disturb: 'Setting Do Not Disturb',
    device_system_setting: 'Changing a phone setting',
    device_app_usage: 'Looking at phone usage',
    device_list_apps: 'Looking at your apps',
    local_models_search: 'Looking for models this phone can run',
    local_model_inspect: 'Checking whether a model fits this phone',
    local_model_download: 'Downloading a model to this phone',
    local_models_status: 'Checking on a model download',
}

export const TALOS_TOOL_LABEL_KEYS: Record<string, string> = {
    library_list: 'toolActivity.libraryList',
    library_search: 'toolActivity.librarySearch',
    library_read: 'toolActivity.libraryRead',
    library_file_origin: 'toolActivity.libraryFileOrigin',
    notes_list: 'toolActivity.notesList',
    notes_create: 'toolActivity.notesCreate',
    notes_update: 'toolActivity.notesUpdate',
    notes_delete: 'toolActivity.notesDelete',
    tasks_create: 'toolActivity.tasksCreate',
    tasks_complete: 'toolActivity.tasksComplete',
    tasks_update: 'toolActivity.tasksUpdate',
    tasks_delete: 'toolActivity.tasksDelete',
    tasks_list: 'toolActivity.tasksList',
    memory_write: 'toolActivity.memoryWrite',
    memory_update: 'toolActivity.memoryUpdate',
    memory_delete: 'toolActivity.memoryDelete',
    library_rename: 'toolActivity.libraryRename',
    library_delete: 'toolActivity.libraryDelete',
    memory_search: 'toolActivity.memorySearch',
    time_now: 'toolActivity.timeNow',
    web_search: 'toolActivity.webSearch',
    web_read: 'toolActivity.webRead',
    document_create: 'toolActivity.documentCreate',
    generate_image: 'toolActivity.generateImage',
    library_export: 'toolActivity.libraryExport',
    library_context_policy_update: 'toolActivity.libraryContextPolicyUpdate',
    research_list: 'toolActivity.researchList',
    research_start: 'toolActivity.researchStart',
    research_read: 'toolActivity.researchRead',
    research_rename: 'toolActivity.researchRename',
    research_pause: 'toolActivity.researchPause',
    research_resume: 'toolActivity.researchResume',
    research_cancel: 'toolActivity.researchCancel',
    research_delete: 'toolActivity.researchDelete',
    device_status: 'toolActivity.deviceStatus',
    device_torch: 'toolActivity.deviceTorch',
    device_vibrate: 'toolActivity.deviceVibrate',
    device_volume: 'toolActivity.deviceVolume',
    device_alarm: 'toolActivity.deviceAlarm',
    device_open_app: 'toolActivity.deviceOpenApp',
    device_open_settings: 'toolActivity.deviceOpenSettings',
    device_compose: 'toolActivity.deviceCompose',
    device_speak: 'toolActivity.deviceSpeak',
    device_wallpaper: 'toolActivity.deviceWallpaper',
    device_keep_awake: 'toolActivity.deviceKeepAwake',
    device_wifi: 'toolActivity.deviceWifi',
    device_bluetooth: 'toolActivity.deviceBluetooth',
    device_do_not_disturb: 'toolActivity.deviceDnd',
    device_system_setting: 'toolActivity.deviceSystemSetting',
    device_app_usage: 'toolActivity.deviceAppUsage',
    device_list_apps: 'toolActivity.deviceListApps',
    local_models_search: 'toolActivity.localModelsSearch',
    local_model_inspect: 'toolActivity.localModelInspect',
    local_model_download: 'toolActivity.localModelDownload',
    local_models_status: 'toolActivity.localModelsStatus',
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
    notes_create: {
        title: 'toolConsent.notesCreate.title',
        description: 'toolConsent.notesCreate.description',
    },
    notes_update: {
        title: 'toolConsent.notesUpdate.title',
        description: 'toolConsent.notesUpdate.description',
    },
    notes_delete: {
        title: 'toolConsent.notesDelete.title',
        description: 'toolConsent.notesDelete.description',
    },
    tasks_create: {
        title: 'toolConsent.tasksCreate.title',
        description: 'toolConsent.tasksCreate.description',
    },
    tasks_complete: {
        title: 'toolConsent.tasksComplete.title',
        description: 'toolConsent.tasksComplete.description',
    },
    tasks_update: {
        title: 'toolConsent.tasksUpdate.title',
        description: 'toolConsent.tasksUpdate.description',
    },
    tasks_delete: {
        title: 'toolConsent.tasksDelete.title',
        description: 'toolConsent.tasksDelete.description',
    },
    tasks_list: {
        title: 'toolConsent.tasksList.title',
        description: 'toolConsent.tasksList.description',
    },
    memory_write: {
        title: 'toolConsent.memoryWrite.title',
        description: 'toolConsent.memoryWrite.description',
    },
    memory_update: {
        title: 'toolConsent.memoryUpdate.title',
        description: 'toolConsent.memoryUpdate.description',
    },
    memory_delete: {
        title: 'toolConsent.memoryDelete.title',
        description: 'toolConsent.memoryDelete.description',
    },
    library_rename: {
        title: 'toolConsent.libraryRename.title',
        description: 'toolConsent.libraryRename.description',
    },
    library_delete: {
        title: 'toolConsent.libraryDelete.title',
        description: 'toolConsent.libraryDelete.description',
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
    research_list: {
        title: 'toolConsent.researchList.title',
        description: 'toolConsent.researchList.description',
    },
    research_start: {
        title: 'toolConsent.researchStart.title',
        description: 'toolConsent.researchStart.description',
    },
    research_read: {
        title: 'toolConsent.researchRead.title',
        description: 'toolConsent.researchRead.description',
    },
    research_rename: {
        title: 'toolConsent.researchRename.title',
        description: 'toolConsent.researchRename.description',
    },
    research_pause: {
        title: 'toolConsent.researchPause.title',
        description: 'toolConsent.researchPause.description',
    },
    research_resume: {
        title: 'toolConsent.researchResume.title',
        description: 'toolConsent.researchResume.description',
    },
    research_cancel: {
        title: 'toolConsent.researchCancel.title',
        description: 'toolConsent.researchCancel.description',
    },
    research_delete: {
        title: 'toolConsent.researchDelete.title',
        description: 'toolConsent.researchDelete.description',
    },
    device_status: {
        title: 'toolConsent.deviceStatus.title',
        description: 'toolConsent.deviceStatus.description',
    },
    device_torch: {
        title: 'toolConsent.deviceTorch.title',
        description: 'toolConsent.deviceTorch.description',
    },
    device_vibrate: {
        title: 'toolConsent.deviceVibrate.title',
        description: 'toolConsent.deviceVibrate.description',
    },
    device_volume: {
        title: 'toolConsent.deviceVolume.title',
        description: 'toolConsent.deviceVolume.description',
    },
    device_alarm: {
        title: 'toolConsent.deviceAlarm.title',
        description: 'toolConsent.deviceAlarm.description',
    },
    device_open_app: {
        title: 'toolConsent.deviceOpenApp.title',
        description: 'toolConsent.deviceOpenApp.description',
    },
    device_open_settings: {
        title: 'toolConsent.deviceOpenSettings.title',
        description: 'toolConsent.deviceOpenSettings.description',
    },
    device_compose: {
        title: 'toolConsent.deviceCompose.title',
        description: 'toolConsent.deviceCompose.description',
    },
    device_speak: {
        title: 'toolConsent.deviceSpeak.title',
        description: 'toolConsent.deviceSpeak.description',
    },
    device_wallpaper: {
        title: 'toolConsent.deviceWallpaper.title',
        description: 'toolConsent.deviceWallpaper.description',
    },
    device_keep_awake: {
        title: 'toolConsent.deviceKeepAwake.title',
        description: 'toolConsent.deviceKeepAwake.description',
    },
    device_wifi: { title: 'toolConsent.deviceWifi.title', description: 'toolConsent.deviceWifi.description' },
    device_bluetooth: { title: 'toolConsent.deviceBluetooth.title', description: 'toolConsent.deviceBluetooth.description' },
    device_do_not_disturb: { title: 'toolConsent.deviceDnd.title', description: 'toolConsent.deviceDnd.description' },
    device_system_setting: { title: 'toolConsent.deviceSystemSetting.title', description: 'toolConsent.deviceSystemSetting.description' },
    device_app_usage: { title: 'toolConsent.deviceAppUsage.title', description: 'toolConsent.deviceAppUsage.description' },
    device_list_apps: { title: 'toolConsent.deviceListApps.title', description: 'toolConsent.deviceListApps.description' },
    local_models_search: {
        title: 'toolConsent.localModelsSearch.title',
        description: 'toolConsent.localModelsSearch.description',
    },
    local_model_inspect: {
        title: 'toolConsent.localModelInspect.title',
        description: 'toolConsent.localModelInspect.description',
    },
    local_model_download: {
        title: 'toolConsent.localModelDownload.title',
        description: 'toolConsent.localModelDownload.description',
    },
    local_models_status: {
        title: 'toolConsent.localModelsStatus.title',
        description: 'toolConsent.localModelsStatus.description',
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
    | 'research'
    | 'phone'
    | 'torch'
    | 'volume'
    | 'voice'
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
    notes_create: 'note',
    notes_update: 'note',
    notes_delete: 'note',
    tasks_create: 'task',
    tasks_complete: 'task',
    tasks_update: 'task',
    tasks_delete: 'task',
    tasks_list: 'task',
    memory_write: 'memory',
    memory_update: 'memory',
    memory_delete: 'memory',
    library_rename: 'library',
    library_delete: 'library',
    memory_search: 'memory',
    time_now: 'clock',
    web_search: 'web',
    web_read: 'web',
    document_create: 'document',
    generate_image: 'image',
    library_export: 'download',
    library_context_policy_update: 'library',
    // ⛔ Una ricerca approfondita raggiunge il web, ma NON è una ricerca web:
    // dura minuti, si mette in pausa, e finisce in un rapporto. Darle il globo
    // direbbe una cosa falsa su cosa sta succedendo — lo stesso difetto del
    // documento che mostrava il globo, al contrario.
    research_list: 'research',
    research_start: 'research',
    research_read: 'research',
    research_rename: 'research',
    research_pause: 'research',
    research_resume: 'research',
    research_cancel: 'research',
    research_delete: 'research',
    // Searching and inspecting reach the network; downloading is a download.
    /*
     * ⛔ Il telefono ha un segno SUO. Dargli quello dei modelli o del web
     * direbbe una cosa falsa su cosa sta succedendo — e' il difetto del
     * documento col globo, di nuovo.
     */
    device_status: 'phone',
    device_torch: 'torch',
    device_vibrate: 'phone',
    device_volume: 'volume',
    device_alarm: 'clock',
    device_open_app: 'phone',
    device_open_settings: 'phone',
    device_compose: 'phone',
    device_speak: 'voice',
    device_wallpaper: 'image',
    device_keep_awake: 'phone',
    device_wifi: 'web',
    device_bluetooth: 'phone',
    device_do_not_disturb: 'phone',
    device_system_setting: 'phone',
    device_app_usage: 'clock',
    device_list_apps: 'phone',
    local_models_search: 'web',
    local_model_inspect: 'web',
    local_model_download: 'download',
    local_models_status: 'tool',
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
