import { describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'
import {
    TALOS_MOBILE_INTRO_VERSION,
    useTalosMobileIntroState,
} from '@/composables/useTalosMobileIntroState'
import type { TalosMobileOnboardingState } from '@/stores/settings'

// F2-T6 — intro gating (mobile mirror of the desktop versioned contract):
// opens once per intro version AFTER hydration, closes with a session latch,
// persists idempotently, replays on demand, never loops on failure.
function harness(overrides: {
    hydrated?: boolean
    onboarding?: Partial<TalosMobileOnboardingState>
    blocked?: boolean
    setOnboarding?: (patch: Partial<TalosMobileOnboardingState>) => Promise<void>
} = {}) {
    const hydrated = ref(overrides.hydrated ?? true)
    const blocked = ref(overrides.blocked ?? false)
    const onboarding = ref<TalosMobileOnboardingState>({
        intro_version: 0, intro_outcome: null, setup_dismissed: false,
        ...overrides.onboarding,
    })
    const setOnboarding = vi.fn(overrides.setOnboarding ?? (async (patch: Partial<TalosMobileOnboardingState>) => {
        onboarding.value = { ...onboarding.value, ...patch } as TalosMobileOnboardingState
    }))
    const intro = useTalosMobileIntroState({
        hydrated: () => hydrated.value,
        blocked: () => blocked.value,
        onboarding: () => onboarding.value,
        setOnboarding,
    })
    return { intro, hydrated, blocked, onboarding, setOnboarding }
}

describe('useTalosMobileIntroState (F2-T6)', () => {
    it('never opens before hydration, then opens for a never-seen version', async () => {
        const { intro, hydrated } = harness({ hydrated: false })
        expect(intro.introOpen.value).toBe(false)
        hydrated.value = true
        await nextTick()
        expect(intro.introOpen.value).toBe(true)
    })

    it('stays closed when the saved version is current', () => {
        const { intro } = harness({
            onboarding: { intro_version: TALOS_MOBILE_INTRO_VERSION, intro_outcome: 'completed' },
        })
        expect(intro.introOpen.value).toBe(false)
    })

    it('stays closed while blocked and opens after the block clears', async () => {
        const { intro, blocked } = harness({ blocked: true })
        expect(intro.introOpen.value).toBe(false)
        blocked.value = false
        await nextTick()
        expect(intro.introOpen.value).toBe(true)
    })

    it('closeIntro latches immediately and persists the versioned outcome once', async () => {
        const { intro, setOnboarding } = harness()
        expect(intro.introOpen.value).toBe(true)
        const first = intro.closeIntro('completed')
        expect(intro.introOpen.value).toBe(false) // latch BEFORE the write resolves
        await first
        await intro.closeIntro('completed')
        expect(setOnboarding).toHaveBeenCalledTimes(1)
        expect(setOnboarding).toHaveBeenCalledWith({
            intro_version: TALOS_MOBILE_INTRO_VERSION,
            intro_outcome: 'completed',
        })
    })

    it('a failed persist keeps the session latch — no reopen loop this session', async () => {
        const { intro } = harness({
            setOnboarding: async () => { throw new Error('disk full') },
        })
        expect(intro.introOpen.value).toBe(true)
        await intro.closeIntro('skipped')
        expect(intro.introOpen.value).toBe(false)
    })

    it('replayIntro reopens even after the version was saved', async () => {
        const { intro } = harness({
            onboarding: { intro_version: TALOS_MOBILE_INTRO_VERSION, intro_outcome: 'completed' },
        })
        expect(intro.introOpen.value).toBe(false)
        intro.replayIntro()
        await nextTick()
        expect(intro.introOpen.value).toBe(true)
        expect(intro.replaying.value).toBe(true)
    })

    it('routes hardware Back through the active unified setup handler', () => {
        const { intro } = harness()
        const back = vi.fn()

        intro.setBack(back)
        intro.handleBack()
        expect(back).toHaveBeenCalledOnce()

        intro.setBack(null)
        intro.handleBack()
        expect(back).toHaveBeenCalledOnce()
    })
})
