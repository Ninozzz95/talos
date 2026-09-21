import {
    computed,
    getCurrentInstance,
    reactive,
    readonly,
    type ComputedRef,
    type DeepReadonly,
    type Plugin,
} from 'vue'
import type {
    TalosLocalizationState,
    TalosLocaleMode,
    TalosMessageParameters,
    TalosMessageTree,
    TalosSupportedLocale,
} from '@/i18n/contracts'
import { resolveTalosLocale } from '@/lib/localizationPolicy'
import {
    hydrateTalosLocaleEnvironment,
    persistTalosLocaleMode,
    readRememberedTalosLocaleMode,
} from '@/services/nativeLocale'

interface TalosComposer {
    locale: { value: string }
    t(key: string, parameters?: TalosMessageParameters): string
    setLocaleMessage(locale: string, messages: TalosMessageTree): void
}

export type TalosI18nPlugin = Plugin & {
    global: TalosComposer
}

const initialMode = readRememberedTalosLocaleMode()
const initialTags = typeof navigator === 'undefined'
    ? []
    : (navigator.languages?.length ? navigator.languages : [navigator.language])
const initialLocale = resolveTalosLocale(initialMode, initialTags)

const state = reactive<TalosLocalizationState>({
    mode: initialMode,
    locale: initialLocale,
    systemLocale: resolveTalosLocale('system', initialTags),
    switching: false,
    ready: false,
    error: null,
})

let plugin: TalosI18nPlugin | null = null
let systemLanguageTags: readonly string[] = initialTags
const loaded = new Set<TalosSupportedLocale>()

async function loadMessages(locale: TalosSupportedLocale): Promise<TalosMessageTree> {
    if (locale === 'it') {
        const module = await import('@/i18n/locales/it')
        return module.TALOS_IT_MESSAGES
    }
    const module = await import('@/i18n/locales/en')
    return module.TALOS_EN_MESSAGES
}

function applyDocumentLocale(locale: TalosSupportedLocale): void {
    if (typeof document === 'undefined') return
    document.documentElement.lang = locale
    document.documentElement.dir = 'ltr'
}

async function ensureLocaleLoaded(locale: TalosSupportedLocale): Promise<void> {
    if (loaded.has(locale)) return
    const messages = await loadMessages(locale)
    plugin?.global.setLocaleMessage(locale, messages)
    loaded.add(locale)
}

export async function createTalosI18n(): Promise<TalosI18nPlugin> {
    if (plugin) return plugin

    const environment = await hydrateTalosLocaleEnvironment()
    systemLanguageTags = environment.systemLanguageTags
    const locale = resolveTalosLocale(environment.mode, systemLanguageTags)
    const systemLocale = resolveTalosLocale('system', systemLanguageTags)
    const [{ createI18n }, english, selected] = await Promise.all([
        import('vue-i18n'),
        loadMessages('en'),
        locale === 'en' ? Promise.resolve(null) : loadMessages(locale),
    ])

    plugin = createI18n({
        legacy: false,
        locale,
        fallbackLocale: 'en',
        messages: {
            en: english,
            ...(locale === 'it' && selected ? { it: selected } : {}),
        },
        escapeParameter: true,
        warnHtmlMessage: true,
        missingWarn: import.meta.env.DEV,
        fallbackWarn: import.meta.env.DEV,
    }) as unknown as TalosI18nPlugin
    loaded.add('en')
    if (locale === 'it') loaded.add('it')

    state.mode = environment.mode
    state.locale = locale
    state.systemLocale = systemLocale
    state.ready = true
    state.error = null
    applyDocumentLocale(locale)
    return plugin
}

export function talosT(key: string, parameters?: TalosMessageParameters): string {
    return plugin?.global.t(key, parameters) ?? key
}

export interface TalosI18nAdapter {
    t(key: string, parameters?: TalosMessageParameters): string
    locale: ComputedRef<string>
}

/**
 * AVM-owned composition boundary for the pinned upstream runtime.
 *
 * Product components must not import vue-i18n directly: doing so turns the
 * deliberately dynamic runtime into entry-graph code. The production path
 * uses the composer created above; the app-global fallback keeps isolated Vue
 * component tests compatible with their locally installed i18n plugin.
 */
export function useTalosI18n(): TalosI18nAdapter {
    const instance = getCurrentInstance()
    const globalProperties = instance?.appContext.config.globalProperties as {
        $i18n?: { locale?: unknown }
        $t?: (key: string, parameters?: TalosMessageParameters) => string
    } | undefined
    const locale = computed(() => {
        // Track the AVM state explicitly even though the upstream composer is
        // reactive internally. This keeps the adapter's contract independent
        // of upstream implementation details.
        const selected = state.locale
        const appLocale = globalProperties?.$i18n?.locale
        if (typeof appLocale === 'string') return appLocale
        if (
            appLocale
            && typeof appLocale === 'object'
            && 'value' in appLocale
            && typeof (appLocale as { value?: unknown }).value === 'string'
        ) {
            return (appLocale as { value: string }).value
        }
        return plugin?.global.locale.value ?? selected
    })

    return {
        locale,
        t(key, parameters) {
            void locale.value
            if (plugin) return plugin.global.t(key, parameters)
            return globalProperties?.$t?.(key, parameters) ?? key
        },
    }
}

export interface TalosLocalizationController {
    readonly state: DeepReadonly<TalosLocalizationState>
    setMode(mode: TalosLocaleMode): Promise<void>
}

const controller: TalosLocalizationController = {
    state: readonly(state) as DeepReadonly<TalosLocalizationState>,
    async setMode(mode) {
        if (!plugin || state.switching) return
        const locale = resolveTalosLocale(mode, systemLanguageTags)
        state.switching = true
        state.error = null
        try {
            await ensureLocaleLoaded(locale)
            plugin.global.locale.value = locale
            state.mode = mode
            state.locale = locale
            applyDocumentLocale(locale)
            await persistTalosLocaleMode(mode)
        } catch {
            // The language already changed in memory. Report only the failed
            // persistence/synchronization instead of reverting the visible UI.
            state.error = talosT('language.persistenceError')
        } finally {
            state.switching = false
        }
    },
}

export function useTalosLocalization(): TalosLocalizationController {
    return controller
}

export async function __resetTalosI18nForTests(): Promise<void> {
    plugin = null
    loaded.clear()
    state.mode = 'system'
    state.locale = 'en'
    state.systemLocale = 'en'
    state.switching = false
    state.ready = false
    state.error = null
    systemLanguageTags = ['en']
}
