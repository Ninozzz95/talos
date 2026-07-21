import type { TalosContextSet, TalosModelProfile } from './talosTypes'
import type { TalosThemeCustomization, TalosThemeId } from './talosThemes'
import type { TalosWindowId } from './talosWindowRegistry'

export type TalosWindowModuleContext = {
    id: TalosWindowId
    activeSection: string
    runtimeRequestedTab: 'timeline' | 'dag' | 'replay' | 'recovery' | 'artifacts'
    runtimeRequestedTabRevision: number
    selectedBenchmarkGroupId: string | null
    selectedBenchmarkScenarioRef: string | null
    modelProfiles: TalosModelProfile[]
    contextSets: TalosContextSet[]
    selectedModelProfileId: string
    selectedContextSetId: string
    settingsRequestedTab: 'models' | 'account'
    settingsRequestedTabRevision: number
    authenticated: boolean
    authUserName: string
    logoutUrl: string
    csrfToken: string
    activeTalosSessionId: string | null
    theme: TalosThemeId
    openWindow: (id: TalosWindowId) => void
    openModule: (id: string, section?: string) => void
    openAuditLog: () => void
    contextSetCreated: (contextSet: TalosContextSet) => void
    benchmarkScenarioSelected: (scenarioRef: string) => void
    selectModel: (id: string) => void
    selectContext: (id: string) => void
    changeTheme: (theme: TalosThemeId, persist?: boolean) => void
    settingsSaved: () => void
    themeCustomizationChanged: (settings?: { preferences?: Record<string, unknown> }) => void
    themeDraftChanged: (customization: TalosThemeCustomization | null) => void
    replayIntro: () => void
}
