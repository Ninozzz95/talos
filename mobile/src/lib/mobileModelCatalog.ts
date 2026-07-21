/**
 * MVP model catalog. Anthropic models have a working device-side client
 * (`lib/chat/anthropicClient.ts`); additional providers land with their own
 * adapters. Static seeds are turned into `TalosMobileModelProfileView`s with a live
 * `has_secret` (from the keystore) so the composer can gate un-keyed models.
 */
import type {
    TalosMobileModelProfileView,
    TalosMobileProviderId,
} from '@/components/chat/mobileChatTypes'

export interface TalosMobileModelSeed {
    id: string
    provider: TalosMobileProviderId
    model: string
    display_name: string
    effort_levels: string[]
    supports_thinking: boolean
}

export const TALOS_MOBILE_MODEL_CATALOG: readonly TalosMobileModelSeed[] = Object.freeze([
    { id: 'claude-opus', provider: 'anthropic', model: 'claude-opus-4-8', display_name: 'Claude Opus 4.8', effort_levels: ['low', 'medium', 'high'], supports_thinking: true },
    { id: 'claude-sonnet', provider: 'anthropic', model: 'claude-sonnet-5', display_name: 'Claude Sonnet 5', effort_levels: ['low', 'medium', 'high'], supports_thinking: true },
    { id: 'claude-haiku', provider: 'anthropic', model: 'claude-haiku-4-5', display_name: 'Claude Haiku 4.5', effort_levels: ['low', 'high'], supports_thinking: false },
])

export function talosMobileModelProfiles(
    hasSecret: (provider: TalosMobileProviderId) => boolean,
): TalosMobileModelProfileView[] {
    return TALOS_MOBILE_MODEL_CATALOG.map((seed) => {
        const keyed = hasSecret(seed.provider)
        return {
            id: seed.id,
            provider: seed.provider,
            model: seed.model,
            display_name: seed.display_name,
            status: keyed ? 'healthy' : 'untested',
            has_secret: keyed,
            effort_levels: [...seed.effort_levels],
            supports_thinking: seed.supports_thinking,
            show_in_composer: true,
            capabilities: null,
            probe_ok: null,
        }
    })
}
