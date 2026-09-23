import { inject, onBeforeUnmount, watchEffect, type InjectionKey } from 'vue'

/**
 * Il titolo della pagina, detto al foglio che la contiene.
 *
 * Owner 2026-09-13/14: nelle stazioni la barra in alto sparisce e il titolo grande resta nella
 * pagina; scorrendo, il titolo «si fonde» con una barra che compare — «movimento molto
 * semplice e smooth», che segue il dito. E nelle sottopagine (una nota aperta, una memoria,
 * un rapporto di ricerca) la barra deve dire il LORO titolo, non il nome della stazione:
 * `sheetTitle` in App.vue conosce solo la stazione, quindi il titolo lo dice la pagina.
 *
 * ⛔ Chiave SEPARATA da `TALOS_SHEET_CONTEXT_KEY`, che e' un booleano letto da altre schermate
 * («sono dentro il foglio»): cambiarne il tipo le romperebbe in silenzio.
 *
 * Forma presa dalla pratica raccomandata per Vue 3: chiave `InjectionKey` creata con `Symbol`
 * (niente collisioni, tipi completi a `inject`) e `inject` racchiuso in un composable, cosi'
 * il caso «fuori dal foglio» si gestisce in un posto solo —
 * https://antfu.me/posts/typed-provide-and-inject-in-vue e
 * https://doc.vueframework.com/api/composition-api.html (letti il 2026-09-14).
 */
export interface TalosSheetTitleRegistry {
    set(id: symbol, title: string): void
    clear(id: symbol): void
}

export const TALOS_SHEET_TITLE_KEY: InjectionKey<TalosSheetTitleRegistry> = Symbol('talos-sheet-title')

/** Registra il titolo della pagina finche' la pagina e' montata. Fuori da un foglio non fa nulla. */
export function useTalosSheetTitle(title: () => string | null | undefined): void {
    const registry = inject(TALOS_SHEET_TITLE_KEY, null)
    if (!registry) return
    const id = Symbol('titolo-pagina')
    watchEffect(() => {
        const value = title()?.trim()
        if (value) registry.set(id, value)
        else registry.clear(id)
    })
    onBeforeUnmount(() => registry.clear(id))
}
