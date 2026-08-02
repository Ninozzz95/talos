/**
 * The shape of the composer, as one choice.
 *
 * It used to be three independent switches — bottom drawer, immersive collapse,
 * "+" as a dropdown — and owner 2026-08-02: "si influenzano e si possono
 * accendere combinazioni senza senso". They did. With the drawer off and the
 * dropdown off, the "+" announced `aria-expanded=true` and opened nothing; that
 * had already been patched inside the composer with a fallback, which is the
 * shape of a bug you cannot fix at the switch, because the switch should not
 * exist.
 *
 * Four named shapes instead of eight combinations:
 *   classic — every control in a row under the field, nothing hidden.
 *   drawer  — minimal bar; "+" opens the bottom drawer holding the tools.
 *   menu    — minimal bar; "+" opens an anchored menu instead.
 *   compact — one line at rest, expands as you type; "+" opens the menu.
 *
 * Four rather than three because `drawerMode: false` is not "the drawer is
 * missing", it is the CLASSIC row — Browse, effort and the Library chip inline.
 * A first pass at this collapsed it away, and the chat screen's tests caught
 * it: reducing a matrix is only worth doing if every coherent corner of it
 * survives under a name.
 *
 * This lives on its own, away from the settings store, for a plain reason: it
 * is arithmetic with no side effects, and a test that wants the mapping should
 * not have to stand up a Preferences bridge — nor re-type the mapping into a
 * mock, where it would go on agreeing with itself after the real one changed.
 */

export type TalosComposerStyle = 'classic' | 'drawer' | 'menu' | 'compact'

export const TALOS_COMPOSER_STYLES: readonly TalosComposerStyle[] = ['classic', 'drawer', 'menu', 'compact']

export const TALOS_DEFAULT_COMPOSER_STYLE: TalosComposerStyle = 'drawer'

export function talosComposerStyleExists(value: unknown): value is TalosComposerStyle {
    return typeof value === 'string' && TALOS_COMPOSER_STYLES.includes(value as TalosComposerStyle)
}

/**
 * What the composer is actually handed. The three flags stay as the composer's
 * own vocabulary — this is the one place that decides which combinations exist,
 * so the component never has to defend itself against a nonsense one again.
 */
export function talosComposerShape(style: TalosComposerStyle): {
    drawerMode: boolean
    plusDropdown: boolean
    immersiveComposer: boolean
} {
    return {
        drawerMode: style !== 'classic',
        plusDropdown: style === 'menu' || style === 'compact',
        immersiveComposer: style === 'compact',
    }
}

/**
 * The one-shot migration for installs that already hold the three booleans.
 *
 * Immersive wins: it is the most visible of the three, so whoever had it on
 * chose the shape they were looking at. Then the drawer, because off means the
 * classic inline row and that is a whole different composer. `plus_dropdown`
 * comes last: it only ever decided WHERE the "+" opened.
 *
 * Nothing coherent is lost on the way across — every arrangement someone could
 * have been sitting on maps onto a shape that still exists.
 */
export function talosComposerStyleFromLegacy(legacy: Record<string, unknown>): TalosComposerStyle {
    if (legacy.immersive_composer === true) return 'compact'
    if (legacy.composer_drawer === false) return 'classic'
    if (legacy.plus_dropdown === true) return 'menu'
    if (talosComposerStyleExists(legacy.composer_style)) return legacy.composer_style
    return TALOS_DEFAULT_COMPOSER_STYLE
}
