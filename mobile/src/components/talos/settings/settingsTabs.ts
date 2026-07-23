export type TalosMobileSettingsTabId =
    | 'models'
    | 'ai_defaults'
    | 'search'
    | 'browser'
    | 'integrations'
    | 'email'
    | 'reminders'
    | 'appearance'
    | 'shortcuts'
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
    { id: 'appearance', label: 'Appearance', description: 'Theme, motion, layout and visible controls.', availability: 'available' },
    { id: 'shortcuts', label: 'Shortcuts', description: 'Hardware-keyboard command bindings.', availability: 'available' },
    { id: 'account', label: 'Account', description: 'Local workspace identity, app lock and introduction replay.', availability: 'available' },
    { id: 'agent_tools', label: 'Agent Tools', description: 'Capability grants and agent execution limits.', availability: 'gated', group: 'Admin', gateReason: 'The sovereign mobile tool runtime is not installed yet.' },
    { id: 'system', label: 'System', description: 'Doctor, policy, audit and backup readiness.', availability: 'gated', group: 'Admin', gateReason: 'Mobile Doctor and backup services are not installed yet.' },
])

export function talosMobileSettingsTab(id: TalosMobileSettingsTabId): TalosMobileSettingsTab {
    return TALOS_MOBILE_SETTINGS_TABS.find((tab) => tab.id === id) ?? TALOS_MOBILE_SETTINGS_TABS[0]
}
