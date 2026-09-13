import type { TalosSupportedLocale } from '@/i18n/contracts'
import { loadTalosWelcomeCatalog } from '@/lib/welcome/catalog'
import {
    resolveTalosWelcome,
    type TalosWelcomeResolverInput,
    type TalosWelcomeSelection,
} from '@/lib/welcome/resolver'

/**
 * Dynamic AVM boundary: parser, resolver and locale JSON stay outside boot.
 */
export async function loadTalosWelcomeSelection(
    locale: TalosSupportedLocale,
    input: TalosWelcomeResolverInput,
): Promise<TalosWelcomeSelection | null> {
    const catalog = await loadTalosWelcomeCatalog(locale)
    return resolveTalosWelcome(catalog, input)
}
