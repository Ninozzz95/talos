import { computed, getCurrentScope, onScopeDispose, ref, type Ref } from 'vue'
import { TalosApiError } from '../lib/api'
import type { TalosSettingsLoadState, TalosWorkspaceSettings, UpdateTalosSettingsPayload } from './useTalosSettings'

export const TALOS_INTRO_VERSION = 1

export type TalosIntroOutcome = 'completed' | 'skipped'

export interface TalosIntroStateDependencies {
    authenticated: Readonly<Ref<boolean>>
    workspaceRuntimeReady: Readonly<Ref<boolean>>
    settings: Readonly<Ref<TalosWorkspaceSettings | null>>
    settingsLoadState: Readonly<Ref<TalosSettingsLoadState>>
    blockingOverlayOpen: Readonly<Ref<boolean>>
    updateSettings: (patch: UpdateTalosSettingsPayload) => Promise<TalosWorkspaceSettings>
    notify: (message: string, retry?: () => void) => void
}

function savedIntroVersion(settings: TalosWorkspaceSettings | null): number {
    const onboarding = settings?.preferences?.onboarding
    if (!onboarding || typeof onboarding !== 'object' || Array.isArray(onboarding)) return 0
    const version = (onboarding as { intro_version?: unknown }).intro_version
    return typeof version === 'number' && Number.isSafeInteger(version) && version > 0 ? version : 0
}

export function useTalosIntroState(deps: TalosIntroStateDependencies) {
    const sessionLatch = ref(false)
    const replayRequested = ref(false)
    const disposed = ref(false)
    let inFlight: Promise<void> | null = null

    if (getCurrentScope()) {
        onScopeDispose(() => {
            disposed.value = true
        })
    }

    const baseGatesOpen = computed(() => deps.authenticated.value
        && deps.workspaceRuntimeReady.value
        && deps.settingsLoadState.value === 'loaded'
        && deps.settings.value !== null
        && !deps.blockingOverlayOpen.value)

    const introOpen = computed(() => {
        if (!baseGatesOpen.value) return false
        if (replayRequested.value) return true
        if (sessionLatch.value) return false
        return savedIntroVersion(deps.settings.value) < TALOS_INTRO_VERSION
    })

    function persistOutcome(outcome: TalosIntroOutcome): Promise<void> {
        const ownerId = deps.settings.value?.id ?? null
        const patch: UpdateTalosSettingsPayload = {
            preferences: {
                onboarding: { intro_version: TALOS_INTRO_VERSION, intro_outcome: outcome },
            },
        }

        const ownerStillCurrent = () => !disposed.value
            && deps.authenticated.value
            && ownerId !== null
            && deps.settings.value?.id === ownerId

        async function attempt(reconciledOnce: boolean): Promise<void> {
            if (!ownerStillCurrent()) return

            try {
                await deps.updateSettings(patch)
            } catch (error) {
                if (!ownerStillCurrent()) return

                const isConflict = error instanceof TalosApiError && error.status === 409
                if (isConflict && !reconciledOnce) {
                    await attempt(true)
                    return
                }

                deps.notify('TALOS could not save your intro preference.', () => {
                    void persistOutcome(outcome)
                })
            }
        }

        return attempt(false)
    }

    function closeIntro(outcome: TalosIntroOutcome): Promise<void> {
        sessionLatch.value = true
        replayRequested.value = false

        if (inFlight) return inFlight

        inFlight = persistOutcome(outcome).finally(() => {
            inFlight = null
        })
        return inFlight
    }

    function replayIntro() {
        sessionLatch.value = false
        replayRequested.value = true
    }

    return {
        introOpen,
        closeIntro,
        replayIntro,
    }
}
