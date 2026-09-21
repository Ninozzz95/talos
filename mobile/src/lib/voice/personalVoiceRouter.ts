import type {
    TalosPersonalVoiceStatus,
    TalosSpeechEngine,
} from './personalVoiceContracts'

/**
 * Blueprint §37.1 "Router" - the five rules this module exists to make
 * true, each one a real test below:
 *
 *   - system selected -> never calls personal plugin
 *   - personal ready -> calls personal
 *   - personal unavailable -> system fallback
 *   - fallback does not rewrite user choice
 *   - engine/profile snapshot fixed for one reading
 *
 * This module never touches the settings store and never calls the native
 * plugin itself - it is pure decision logic over values the caller already
 * has, precisely so it stays trivially testable and so "does not rewrite
 * user choice" is true by construction: there is nothing here with write
 * access to settings to rewrite anything with.
 */

export interface TalosVoiceRoute {
    /** The engine THIS reading actually uses - may differ from the stored preference when it fell back. */
    engine: TalosSpeechEngine
    /** Only meaningful when `engine === 'personal'`. */
    profileId: string | null
    /** True when the stored preference was `'personal'` but this reading is using `'system'` instead - the UI can use this to say so, without ever touching the stored preference. */
    fellBack: boolean
    /** Present only when `fellBack` is true - why, for logging/UI, not for control flow (there is only ever one fallback destination: `'system'`). */
    fallbackReason?: 'notSupported' | 'notReady' | 'noProfileSelected' | 'profileIncompatible'
}

const SYSTEM_ROUTE: TalosVoiceRoute = Object.freeze({ engine: 'system', profileId: null, fellBack: false })

/**
 * Pure decision, given a status the caller already fetched. Never called at
 * all when the caller's preference is `'system'` - see [planTalosVoiceReading],
 * which is the one that actually enforces "never calls personal plugin" by
 * short-circuiting before it would need this.
 */
export function resolveTalosVoiceRoute(
    preferredEngine: TalosSpeechEngine,
    personalProfileId: string | null,
    status: TalosPersonalVoiceStatus,
): TalosVoiceRoute {
    if (preferredEngine === 'system') return SYSTEM_ROUTE

    if (!personalProfileId) {
        return { engine: 'system', profileId: null, fellBack: true, fallbackReason: 'noProfileSelected' }
    }
    if (!status.supported) {
        return { engine: 'system', profileId: null, fellBack: true, fallbackReason: 'notSupported' }
    }
    if (!status.ready) {
        return { engine: 'system', profileId: null, fellBack: true, fallbackReason: 'notReady' }
    }
    return { engine: 'personal', profileId: personalProfileId, fellBack: false }
}

/**
 * The real entry point for one reading. `fetchPersonalStatus` is a thunk,
 * not an already-resolved value, so that when `preferredEngine === 'system'`
 * it is provably never invoked - satisfying "system selected -> never calls
 * personal plugin" at the call-site the plugin actually lives behind
 * (`status()`/`profiles()` in `TalosNeuralVoicePlugin`), not just in this
 * module's own logic.
 *
 * ⛔ Call this ONCE per reading and reuse the result for every sentence in
 * it - "engine/profile snapshot fixed for one reading" is a calling
 * discipline this function enables (it is pure and returns a plain,
 * unchanging value) but cannot enforce from inside itself; re-calling it
 * mid-reading if settings changed underneath would be the caller's bug, the
 * same class of bug `useTalosSpeech.ts`'s own `voceFissa` already guards
 * against for the system voice.
 */
export async function planTalosVoiceReading(
    preferredEngine: TalosSpeechEngine,
    personalProfileId: string | null,
    fetchPersonalStatus: () => Promise<TalosPersonalVoiceStatus>,
): Promise<TalosVoiceRoute> {
    if (preferredEngine === 'system') return SYSTEM_ROUTE
    const status = await fetchPersonalStatus()
    return resolveTalosVoiceRoute(preferredEngine, personalProfileId, status)
}
