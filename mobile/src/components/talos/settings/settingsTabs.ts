export type TalosMobileSettingsTabId =
    | 'models'
    | 'ai_defaults'
    | 'search'
    | 'browser'
    | 'integrations'
    | 'email'
    | 'reminders'
    | 'appearance'
    | 'voice'
    | 'language'
    | 'privacy'
    | 'backup'
    | 'account'
    | 'agent_tools'
    | 'system'

/** Compatibility id for `/settings?tab=models`; its visible row is routed. */
export const TALOS_MOBILE_SETTINGS_MODEL_LAB_TAB = 'models' as const

export type TalosMobileSettingsTab = {
    id: TalosMobileSettingsTabId
    label: string
    description: string
    availability: 'available' | 'gated'
    group?: 'Admin'
    gateReason?: string
}

export const TALOS_MOBILE_SETTINGS_TABS: readonly TalosMobileSettingsTab[] = Object.freeze([
    { id: 'models', label: 'Models', description: 'Provider keys, profiles and the default chat model.', availability: 'available' },
    { id: 'ai_defaults', label: 'AI Defaults', description: 'Utility, research and vision routing preferences.', availability: 'available' },
    // Was `gated`, with the reason "the local search worker is not installed".
    // That stopped being true the day web search shipped, and the entry went on
    // announcing its own absence while the working configuration lived under AI
    // Defaults — so the one place named Search was the one place that said no.
    // The description no longer promises research extraction budgets either:
    // those genuinely are not here, and a description is not the place to ship
    // an intention.
    { id: 'search', label: 'Search', description: 'Which service answers a web search, and its key.', availability: 'available' },
    { id: 'browser', label: 'Browser', description: 'Manual browsing, interaction policy and trusted-node evidence controls.', availability: 'available' },
    { id: 'integrations', label: 'Integrations', description: 'External connectors and provider integrations.', availability: 'gated', gateReason: 'Mobile connector services are not installed yet.' },
    { id: 'email', label: 'Email', description: 'Email triage, drafts and policy-gated sending.', availability: 'gated', gateReason: 'No authorized mobile email connector is configured.' },
    { id: 'reminders', label: 'Reminders', description: 'Local reminders and delivery channels.', availability: 'gated', gateReason: 'The mobile reminder delivery worker is not installed yet.' },
    { id: 'appearance', label: 'Appearance', description: '', availability: 'available' },
    /**
     * ⛔ LA VOCE ESCE DA «ASPETTO» — owner 2026-08-10, parole sue: «l'impostazione
     * della voce si trova su aspetto. Deve avere un'impostazione fuori».
     *
     * E ha ragione per un motivo che vale oltre questo caso: «Aspetto» è come
     * TALOS **appare**, la voce è come TALOS **si comporta**. Erano insieme
     * perché la voce era nata come un dettaglio; adesso è una capacità intera —
     * legge, ascolta, e un domani risponde quando la chiami (#29) — e una
     * capacità che vive dentro la pagina di un'altra non la trova nessuno.
     *
     * MISURATO lo stesso giorno, ed è la prova che stava nel posto sbagliato:
     * il selettore mostrava **0 voci** (leggeva il Web Speech API) mentre il
     * motore che parla ne aveva **473** ed era fermo sulla generica. Un
     * pannello nascosto in fondo a un'altra pagina è un pannello che nessuno
     * apre, e un difetto lì dentro può vivere per mesi.
     */
    { id: 'voice', label: 'Voice', description: 'Which voice reads aloud, how fast, and the dictation language.', availability: 'available' },
    { id: 'language', label: 'Language', description: 'The language used by TALOS menus, settings and controls.', availability: 'available' },
    { id: 'privacy', label: 'Privacy and permissions', description: 'What TALOS can ask the device for, and what leaves it.', availability: 'available' },
    { id: 'backup', label: 'Backup and restore', description: 'Take everything with you, and bring it back.', availability: 'available' },
    { id: 'account', label: 'Account', description: 'Local workspace identity, app lock and introduction replay.', availability: 'available' },
    { id: 'agent_tools', label: 'Agent Tools', description: 'Choose which capabilities the chat agent may use.', availability: 'available', group: 'Admin' },
    // The gate reason used to say "Doctor and backup services are not
    // installed" — and the Doctor ships, as a station of its own. Same defect
    // the Search entry had: an entry announcing the absence of something the
    // app does. What is genuinely missing here is policy, audit and backup, so
    // that is what it now says, and it points at the Doctor instead of denying it.
    { id: 'system', label: 'System', description: 'Policy, audit and backup readiness. Device checks live in Doctor.', availability: 'gated', group: 'Admin', gateReason: 'Mobile policy, audit and backup services are not installed yet. Device checks are in Doctor.' },
])

export function talosMobileSettingsTab(id: TalosMobileSettingsTabId): TalosMobileSettingsTab {
    return TALOS_MOBILE_SETTINGS_TABS.find((tab) => tab.id === id) ?? TALOS_MOBILE_SETTINGS_TABS[0]
}

// Owner 2026-07-24 (Claude-style Settings): the Account tab becomes the summary
// card at the top; the rest are organized into grouped rounded cards.
export const TALOS_MOBILE_SETTINGS_ACCOUNT_TAB: TalosMobileSettingsTabId = 'account'

export interface TalosMobileSettingsGroup {
    label: string
    tabIds: readonly TalosMobileSettingsTabId[]
}

/**
 * Owner 2026-08-02: the entries that say "not in this build" go into a declared
 * section, or they go away.
 *
 * They used to be salted through the live ones — three of the five under
 * Connections led nowhere, and someone scanning the list had to tap to find
 * out which. Grouping them is the "no fake controls" rule applied to
 * navigation: a section that announces itself as unavailable is honest, three
 * dead ends wearing the same chevron as the live ones are not.
 *
 * They stay tappable rather than being deleted, because the panel behind each
 * says WHY — and "why can't I do this" is a question the app should answer
 * rather than pretend nobody asked.
 */
export const TALOS_MOBILE_SETTINGS_GROUPS: readonly TalosMobileSettingsGroup[] = Object.freeze([
    { label: 'Intelligence', tabIds: ['models', 'ai_defaults', 'agent_tools'] },
    { label: 'Connections', tabIds: ['search', 'browser'] },
    { label: 'Interface', tabIds: ['appearance', 'voice', 'language'] },
    // Its own group: a privacy claim is TALOS's central promise, and burying it
    // under Interface would say the opposite.
    { label: 'Privacy', tabIds: ['privacy', 'backup'] },
    { label: 'Unavailable', tabIds: ['integrations', 'email', 'reminders', 'system'] },
])
