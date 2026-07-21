export type TalosMobileProviderId =
    | 'anthropic'
    | 'deepseek'
    | 'gemini'
    | 'ollama'
    | 'openai'
    | 'openrouter'

export type TalosMobileModelStatus =
    | 'untested'
    | 'healthy'
    | 'degraded'
    | 'failed'
    | 'disabled'

export interface TalosMobileModelProfileView {
    id: string
    provider: TalosMobileProviderId
    model: string
    display_name: string
    status: TalosMobileModelStatus
    has_secret: boolean
    effort_levels: string[]
    supports_thinking: boolean
    show_in_composer: boolean
    capabilities: Record<string, unknown> | null
    probe_ok: boolean | null
}

export type TalosMobileRoutingProfileStatus = 'enabled' | 'disabled' | 'degraded'

export interface TalosMobileRoutingProfileView {
    id: string
    name: string
    status: TalosMobileRoutingProfileStatus
    lane_count: number
}

export type TalosMobileMessageRole = 'user' | 'assistant' | 'system'
export type TalosMobileMessageState = 'persisted' | 'pending' | 'failed'

export interface TalosMobileMessageView {
    id: string
    role: TalosMobileMessageRole
    content: string
    created_at: string
    state: TalosMobileMessageState
}
