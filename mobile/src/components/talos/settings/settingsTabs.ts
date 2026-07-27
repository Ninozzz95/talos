export type TalosMobileSettingsTabId =
    | 'models'
    | 'ai_defaults'
    | 'search'
    | 'browser'
    | 'integrations'
    | 'email'
    | 'reminders'
    | 'appearance'
    | 'privacy'
    | 'account'
    | 'agent_tools'
    | 'system'

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
    { id: 'search', label: 'Search', description: 'Search provider and research extraction budgets.', availability: 'gated', gateReason: 'The local search worker is not installed in this mobile milestone.' },
    { id: 'browser', label: 'Browser', description: 'Manual browsing, interaction policy and trusted-node evidence controls.', availability: 'available' },
    { id: 'integrations', label: 'Integrations', description: 'External connectors and provider integrations.', availability: 'gated', gateReason: 'Mobile connector services are not installed yet.' },
    { id: 'email', label: 'Email', description: 'Email triage, drafts and policy-gated sending.', availability: 'gated', gateReason: 'No authorized mobile email connector is configured.' },
    { id: 'reminders', label: 'Reminders', description: 'Local reminders and delivery channels.', availability: 'gated', gateReason: 'The mobile reminder delivery worker is not installed yet.' },
    { id: 'appearance', label: 'Appearance', description: '', availability: 'available' },
    { id: 'privacy', label: 'Privacy and permissions', description: 'What TALOS can ask the device for, and what leaves it.', availability: 'available' },
    { id: 'account', label: 'Account', description: 'Local workspace identity, app lock and introduction replay.', availability: 'available' },
    { id: 'agent_tools', label: 'Agent Tools', description: 'Capability grants and agent execution limits.', availability: 'gated', group: 'Admin', gateReason: 'The sovereign mobile tool runtime is not installed yet.' },
    { id: 'system', label: 'System', description: 'Doctor, policy, audit and backup readiness.', availability: 'gated', group: 'Admin', gateReason: 'Mobile Doctor and backup services are not installed yet.' },
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

export const TALOS_MOBILE_SETTINGS_GROUPS: readonly TalosMobileSettingsGroup[] = Object.freeze([
    { label: 'Intelligence', tabIds: ['models', 'ai_defaults', 'agent_tools'] },
    { label: 'Connections', tabIds: ['search', 'browser', 'integrations', 'email', 'reminders'] },
    { label: 'Interface', tabIds: ['appearance', 'system'] },
    // Its own group: a privacy claim is TALOS's central promise, and burying it
    // under Interface would say the opposite.
    { label: 'Privacy', tabIds: ['privacy'] },
])
