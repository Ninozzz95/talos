/**
 * Whether a person has agreed to let TALOS run a real generation against a
 * candidate GPU backend, to decide whether the shipped OpenCL path is worth
 * offering on this exact phone.
 *
 * ⛔ This is a DIFFERENT question from `TalosMobileModelLabPreferences.probe_results`
 * in `modelLabContracts.ts`: that file's `PROVIDERS` set is remote providers
 * only (`anthropic`, `deepseek`, `gemini`, `ollama`, `openai`, `openrouter`) —
 * it never included `local`, and its probe means "did this API answer". This
 * probe means "does this device's GPU driver produce a correct answer,
 * faster", and it costs a real generation — battery and heat, not a network
 * round trip. Conflating the two would blur what each number means.
 *
 * ⇒ Owner, 2026-08-21 (§1-bis of the 0.1.18 handoff): the probe never starts
 * on its own. It needs an explicit "sì" the first time a person picks a
 * local model, or a manual command in settings at any later time. `declined`
 * only suppresses the automatic prompt — it does not delete anything and
 * does not block the manual command. See `spegnere-non-e-dimenticare`: once
 * "disattiva" deleted a key it should only have hidden a switch, and that
 * cost a session to find. This tri-state exists so `declined` can never mean
 * that again.
 */
export type TalosLocalEngineProbeConsent = 'unset' | 'granted' | 'declined'

export interface TalosLocalEngineProbePreferences {
    consent: TalosLocalEngineProbeConsent
}

export const TALOS_DEFAULT_LOCAL_ENGINE_PROBE_PREFERENCES: TalosLocalEngineProbePreferences = Object.freeze({
    consent: 'unset',
})

const CONSENT_VALUES = new Set<TalosLocalEngineProbeConsent>(['unset', 'granted', 'declined'])

export function parseTalosLocalEngineProbePreferences(value: unknown): TalosLocalEngineProbePreferences {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return TALOS_DEFAULT_LOCAL_ENGINE_PROBE_PREFERENCES
    }
    const record = value as Record<string, unknown>
    const keys = Object.keys(record)
    if (keys.length !== 1 || keys[0] !== 'consent') return TALOS_DEFAULT_LOCAL_ENGINE_PROBE_PREFERENCES
    const consent = record.consent
    if (typeof consent !== 'string' || !CONSENT_VALUES.has(consent as TalosLocalEngineProbeConsent)) {
        return TALOS_DEFAULT_LOCAL_ENGINE_PROBE_PREFERENCES
    }
    return { consent: consent as TalosLocalEngineProbeConsent }
}
