import { computed, reactive, readonly, type ComputedRef } from 'vue'
import { Preferences } from '@capacitor/preferences'
import { talosBridgeCall } from '@/lib/talosBridge'

/**
 * Owner 2026-07-24 (Claude-style Settings): a LOCAL account — a display name
 * and an avatar initial, persisted on device. OAuth (Google/Apple) is
 * PREDISPOSED but honestly gated: the app is local-first with no backend, so
 * the token exchange waits for the sovereign core (M2). No fake sign-in.
 */
export type TalosAccountProvider = 'local' | 'google' | 'apple'

export interface TalosAccountState {
    display_name: string
    auth_provider: TalosAccountProvider
}

export interface TalosOAuthProvider {
    id: 'google' | 'apple'
    label: string
    /** false until a backend token endpoint exists (local-first, M2). */
    available: boolean
    gateReason: string
}

export interface TalosAccountStore {
    readonly state: Readonly<TalosAccountState>
    readonly initial: ComputedRef<string>
    readonly oauthProviders: readonly TalosOAuthProvider[]
    hydrate(): Promise<void>
    setDisplayName(name: string): Promise<void>
}

const ACCOUNT_KEY = 'talos.mobile.account'

const OAUTH_PROVIDERS: readonly TalosOAuthProvider[] = Object.freeze([
    { id: 'google', label: 'Continue with Google', available: false, gateReason: 'Sign-in syncs with the sovereign core — arriving with local encrypted sync.' },
    { id: 'apple', label: 'Continue with Apple', available: false, gateReason: 'Sign-in syncs with the sovereign core — arriving with local encrypted sync.' },
])

function parseAccount(value: string | null): TalosAccountState {
    const base: TalosAccountState = { display_name: '', auth_provider: 'local' }
    if (!value) return base
    try {
        const record = JSON.parse(value) as Record<string, unknown>
        return {
            display_name: typeof record.display_name === 'string' ? record.display_name.slice(0, 60) : '',
            // Only 'local' is ever persisted today; OAuth is gated.
            auth_provider: record.auth_provider === 'google' || record.auth_provider === 'apple' ? record.auth_provider : 'local',
        }
    } catch {
        return base
    }
}

let singleton: TalosAccountStore | null = null

export function useTalosAccountStore(): TalosAccountStore {
    if (singleton) return singleton
    const state = reactive<TalosAccountState>({ display_name: '', auth_provider: 'local' })

    const initial = computed(() => {
        const name = state.display_name.trim()
        // SF-critic m4: [...name] splits by code POINT so an emoji/astral first
        // char yields a whole glyph, not a lone surrogate.
        return name ? [...name][0]!.toUpperCase() : 'T'
    })

    async function persist(): Promise<void> {
        await talosBridgeCall('TALOS_ACCOUNT_PERSIST', () => Preferences.set({
            key: ACCOUNT_KEY,
            value: JSON.stringify({ display_name: state.display_name, auth_provider: state.auth_provider }),
        }))
    }

    singleton = {
        state: readonly(state) as Readonly<TalosAccountState>,
        initial,
        oauthProviders: OAUTH_PROVIDERS,
        async hydrate() {
            const { value } = await talosBridgeCall('TALOS_ACCOUNT_HYDRATE', () => Preferences.get({ key: ACCOUNT_KEY }))
            const parsed = parseAccount(value ?? null)
            state.display_name = parsed.display_name
            state.auth_provider = parsed.auth_provider
        },
        async setDisplayName(name) {
            state.display_name = name.trim().slice(0, 60)
            await persist()
        },
    }
    return singleton
}

export function __resetAccountStoreForTests(): void {
    singleton = null
}
