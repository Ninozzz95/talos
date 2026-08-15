import { effectScope, nextTick, ref } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { TalosSupportedLocale } from '@/i18n/contracts'
import { parseTalosWelcomeCatalog } from '@/lib/welcome/catalog'
import { resolveTalosWelcome, type TalosWelcomeSelection } from '@/lib/welcome/resolver'
import { useTalosWelcome, type TalosWelcomeState } from '@/composables/useTalosWelcome'
import englishRaw from '@/lib/welcome/catalogs/en.json'
import italianRaw from '@/lib/welcome/catalogs/it.json'

const english = parseTalosWelcomeCatalog(englishRaw, 'en')
const italian = parseTalosWelcomeCatalog(italianRaw, 'it')
const scopes: ReturnType<typeof effectScope>[] = []

function deferred<T>() {
    let resolve!: (value: T) => void
    let reject!: (reason?: unknown) => void
    const promise = new Promise<T>((accept, fail) => {
        resolve = accept
        reject = fail
    })
    return { promise, resolve, reject }
}

async function settle(): Promise<void> {
    await Promise.resolve()
    await nextTick()
    await Promise.resolve()
}

function mountWelcome(
    options: Parameters<typeof useTalosWelcome>[0],
): TalosWelcomeState {
    const scope = effectScope()
    scopes.push(scope)
    return scope.run(() => useTalosWelcome(options))!
}

afterEach(() => {
    for (const scope of scopes.splice(0)) scope.stop()
})

describe('useTalosWelcome', () => {
    it('WELCOME-REACTIVE-01 renders the localized fallback before the catalog resolves', async () => {
        const pending = deferred<TalosWelcomeSelection | null>()
        const locale = ref<TalosSupportedLocale>('en')
        const state = mountWelcome({
            locale,
            sessionId: ref('session-a'),
            fallbackTitle: () => 'Fallback EN',
            loadSelection: () => pending.promise,
            now: () => new Date(2026, 6, 29, 9),
            seedFactory: () => 'ephemeral',
        })

        expect(state.title.value).toBe('Fallback EN')
        expect(state.easterEgg.value).toBeNull()
        pending.resolve(resolveTalosWelcome(english, {
            at: new Date(2026, 6, 29, 9),
            seed: 'session-a',
        }))
        await settle()
        expect(state.title.value).toBe(
            resolveTalosWelcome(english, {
                at: new Date(2026, 6, 29, 9),
                seed: 'session-a',
            })?.title,
        )
    })

    it('WELCOME-REACTIVE-02 changes locale at the same captured instant and semantic index', async () => {
        const locale = ref<TalosSupportedLocale>('en')
        const at = new Date(2026, 6, 29, 9)
        const state = mountWelcome({
            locale,
            sessionId: ref('stable-session'),
            fallbackTitle: () => locale.value === 'it' ? 'Fallback IT' : 'Fallback EN',
            loadSelection: async (selected, input) => resolveTalosWelcome(
                selected === 'it' ? italian : english,
                input,
            ),
            now: () => at,
            seedFactory: () => 'ephemeral',
        })
        await settle()
        const englishIndex = state.index.value

        locale.value = 'it'
        await settle()

        expect(state.index.value).toBe(englishIndex)
        expect(state.title.value).toBe(italian.dayPeriods.morning.titles[englishIndex!])
    })

    it('WELCOME-REACTIVE-03 captures a new date context only when the session changes', async () => {
        const sessionId = ref<string | null>('session-a')
        const now = vi.fn()
            .mockReturnValueOnce(new Date(2026, 6, 29, 9))
            .mockReturnValueOnce(new Date(2026, 11, 25, 9))
        const state = mountWelcome({
            locale: ref<TalosSupportedLocale>('en'),
            sessionId,
            fallbackTitle: () => 'Fallback',
            loadSelection: async (_selected, input) => resolveTalosWelcome(english, input),
            now,
            seedFactory: () => 'ephemeral',
        })
        await settle()
        expect(state.condition.value).toBe('morning')
        expect(now).toHaveBeenCalledTimes(1)

        sessionId.value = 'session-b'
        await settle()
        expect(state.condition.value).toBe('christmas_day')
        expect(state.easterEgg.value).toBe('gift')
        expect(now).toHaveBeenCalledTimes(2)
    })

    it('WELCOME-REACTIVE-04 rejects failed and out-of-order loads without blanking or stale overwrite', async () => {
        const englishPending = deferred<TalosWelcomeSelection | null>()
        const italianPending = deferred<TalosWelcomeSelection | null>()
        const locale = ref<TalosSupportedLocale>('en')
        const state = mountWelcome({
            locale,
            sessionId: ref('stable-session'),
            fallbackTitle: () => locale.value === 'it' ? 'Fallback IT' : 'Fallback EN',
            loadSelection: selected => selected === 'it'
                ? italianPending.promise
                : englishPending.promise,
            now: () => new Date(2026, 11, 25, 10),
            seedFactory: () => 'ephemeral',
        })

        locale.value = 'it'
        await settle()
        italianPending.resolve(resolveTalosWelcome(italian, {
            at: new Date(2026, 11, 25, 10),
            seed: 'stable-session',
        }))
        await settle()
        const italianTitle = state.title.value
        expect(italianTitle).toBe(italian.specialDates.christmas_day.titles[state.index.value!])

        englishPending.resolve(resolveTalosWelcome(english, {
            at: new Date(2026, 11, 25, 10),
            seed: 'stable-session',
        }))
        await settle()
        expect(state.title.value).toBe(italianTitle)

        const failed = mountWelcome({
            locale: ref<TalosSupportedLocale>('en'),
            sessionId: ref(null),
            fallbackTitle: () => 'Safe fallback',
            loadSelection: async () => {
                throw new Error('catalog unavailable')
            },
            now: () => new Date(2026, 11, 25, 10),
            seedFactory: () => 'ephemeral',
        })
        await settle()
        expect(failed.title.value).toBe('Safe fallback')
        expect(failed.easterEgg.value).toBeNull()
    })
})
