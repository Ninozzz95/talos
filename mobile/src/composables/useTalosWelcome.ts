import { readonly, ref, watch, type Ref } from 'vue'
import type { TalosSupportedLocale } from '@/i18n/contracts'
import { newTalosMobileId } from '@/lib/mobileIds'
import type { TalosWelcomeEasterEggKind } from '@/lib/welcome/catalog'
import type {
    TalosWelcomeResolverInput,
    TalosWelcomeSelection,
} from '@/lib/welcome/resolver'

export interface UseTalosWelcomeOptions {
    readonly locale: Readonly<Ref<string>>
    readonly sessionId: Readonly<Ref<string | null>>
    readonly fallbackTitle: () => string
    readonly loadSelection?: (
        locale: TalosSupportedLocale,
        input: TalosWelcomeResolverInput,
    ) => Promise<TalosWelcomeSelection | null>
    readonly now?: () => Date
    readonly seedFactory?: () => string
}

export interface TalosWelcomeState {
    readonly title: Readonly<Ref<string>>
    readonly easterEgg: Readonly<Ref<TalosWelcomeEasterEggKind | null>>
    readonly condition: Readonly<Ref<string | null>>
    readonly index: Readonly<Ref<number | null>>
}

function supportedLocale(value: string): TalosSupportedLocale {
    return value === 'it' ? 'it' : 'en'
}

export function useTalosWelcome(options: UseTalosWelcomeOptions): TalosWelcomeState {
    const loadSelection = options.loadSelection ?? (async (locale, input) => {
        const runtime = await import('@/lib/welcome/runtime')
        return runtime.loadTalosWelcomeSelection(locale, input)
    })
    const now = options.now ?? (() => new Date())
    const seedFactory = options.seedFactory ?? newTalosMobileId
    const title = ref(options.fallbackTitle())
    const easterEgg = ref<TalosWelcomeEasterEggKind | null>(null)
    const condition = ref<string | null>(null)
    const index = ref<number | null>(null)
    let revision = 0
    let captured = capture(options.sessionId.value)

    function capture(sessionId: string | null): TalosWelcomeResolverInput {
        return {
            at: new Date(now().getTime()),
            seed: sessionId ?? seedFactory(),
        }
    }

    function resetToFallback(): void {
        title.value = options.fallbackTitle()
        easterEgg.value = null
        condition.value = null
        index.value = null
    }

    async function refresh(): Promise<void> {
        const requestedRevision = ++revision
        const locale = supportedLocale(options.locale.value)
        resetToFallback()
        try {
            const selection = await loadSelection(locale, captured)
            if (requestedRevision !== revision) return
            if (!selection) return
            title.value = selection.title
            easterEgg.value = selection.easterEgg
            condition.value = selection.condition
            index.value = selection.index
        } catch {
            if (requestedRevision === revision) resetToFallback()
        }
    }

    watch(options.sessionId, (sessionId, previous) => {
        if (sessionId === previous) return
        captured = capture(sessionId)
        void refresh()
    }, { flush: 'sync' })

    watch(options.locale, (locale, previous) => {
        if (locale === previous) return
        void refresh()
    }, { flush: 'sync' })

    void refresh()

    return {
        title: readonly(title),
        easterEgg: readonly(easterEgg),
        condition: readonly(condition),
        index: readonly(index),
    }
}
