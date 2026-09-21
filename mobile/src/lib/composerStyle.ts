/**
 * The composer, as TWO settings — because there are two questions.
 *
 * It began as three independent switches (bottom drawer, immersive collapse,
 * "+" as a dropdown) and owner 2026-08-02: "si influenzano e si possono
 * accendere combinazioni senza senso". They did. With the drawer off and the
 * dropdown off, the "+" announced `aria-expanded=true` and opened nothing.
 *
 * The first repair fused all three into one list of named shapes, and the owner
 * caught the mistake immediately: "hai mischiato le impostazioni della forma
 * del compositore e del tipo della sezione + (allega libreria etc). devono
 * essere separati". Right — those are orthogonal. Fusing a matrix is only worth
 * doing where the axes genuinely interact; where they do not, fusing them takes
 * a choice away and hides it inside another one's name.
 *
 * So:
 *
 *   SHAPE — what the bar looks like
 *     classic  — every control in a row under the field: attach, context,
 *                Browse, model, effort. Nothing hidden, nothing to open.
 *     standard — a minimal bar; the tools live behind the "+".
 *     compact  — the same minimal bar, collapsed to one line while idle.
 *
 *   PLUS SURFACE — where the "+" opens, and so where attach / Library / Browse
 *     live when they are not inline
 *     drawer — a sheet along the bottom
 *     menu   — a menu anchored to the button
 *
 * The two only meet in one place, and it is not an interaction so much as an
 * absence: the classic bar has no "+" at all, because everything it would hold
 * is already on the bar. The setting is offered but inert there, and the screen
 * says so rather than leaving a control that does nothing.
 *
 * This lives away from the settings store on purpose: it is arithmetic with no
 * side effects, and a test that wants the mapping should not have to stand up a
 * Preferences bridge — nor re-type the mapping into a mock, where it would go
 * on agreeing with itself long after the real one changed.
 */

/** What the bar looks like. */
export type TalosComposerShape = 'classic' | 'standard' | 'compact'

/** Where the "+" opens — and so where attach, Library and Browse live. */
export type TalosComposerPlusSurface = 'drawer' | 'menu'

export const TALOS_COMPOSER_SHAPES: readonly TalosComposerShape[] = ['classic', 'standard', 'compact']
export const TALOS_COMPOSER_PLUS_SURFACES: readonly TalosComposerPlusSurface[] = ['drawer', 'menu']

// Owner 2026-08-17, looking at the app: "la forma del compositore a compatto".
export const TALOS_DEFAULT_COMPOSER_SHAPE: TalosComposerShape = 'compact'
export const TALOS_DEFAULT_COMPOSER_PLUS: TalosComposerPlusSurface = 'drawer'

export function talosComposerShapeExists(value: unknown): value is TalosComposerShape {
    return typeof value === 'string' && TALOS_COMPOSER_SHAPES.includes(value as TalosComposerShape)
}

export function talosComposerPlusExists(value: unknown): value is TalosComposerPlusSurface {
    return typeof value === 'string' && TALOS_COMPOSER_PLUS_SURFACES.includes(value as TalosComposerPlusSurface)
}

/**
 * Whether the "+" exists at all. False for the classic bar, which carries its
 * own controls — so the surface setting has nothing to decide and the screen
 * should say that instead of offering a live-looking control that is inert.
 */
export function talosComposerHasPlus(shape: TalosComposerShape): boolean {
    return shape !== 'classic'
}

/**
 * What the composer is actually handed. The three flags stay as the composer's
 * own vocabulary — this is the one place that decides which arrangements exist,
 * so the component never has to defend itself against a nonsense one again.
 */
export function talosComposerFlags(
    shape: TalosComposerShape,
    plus: TalosComposerPlusSurface,
): { drawerMode: boolean; plusDropdown: boolean; immersiveComposer: boolean } {
    return {
        drawerMode: shape !== 'classic',
        immersiveComposer: shape === 'compact',
        // Never true for the classic bar: `plusDropdown && !drawerMode` is what
        // draws a leading "+" inside the field, and there it would only
        // duplicate the row already under it.
        plusDropdown: talosComposerHasPlus(shape) && plus === 'menu',
    }
}

/**
 * The one-shot migration, for installs holding either of the two older shapes
 * of this setting.
 *
 * Two generations to carry across, and they are read in order of how recent
 * they are:
 *
 *   1. `composer_style`, the single fused list that shipped on 2026-08-02 and
 *      lived for one build. Each of its names splits cleanly in two.
 *   2. the original three booleans. Immersive wins — it is the most visible of
 *      the three, so whoever had it on chose the shape they were looking at.
 *      Then the drawer, because off means the classic inline row and that is a
 *      different composer. `plus_dropdown` comes last: it only ever decided
 *      WHERE the "+" opened, which is precisely the second setting.
 *
 * Nothing coherent is lost on the way across.
 */
export function talosComposerFromLegacy(legacy: Record<string, unknown>): {
    shape: TalosComposerShape
    plus: TalosComposerPlusSurface
} {
    if (talosComposerShapeExists(legacy.composer_shape)) {
        return {
            shape: legacy.composer_shape,
            plus: talosComposerPlusExists(legacy.composer_plus) ? legacy.composer_plus : TALOS_DEFAULT_COMPOSER_PLUS,
        }
    }
    switch (legacy.composer_style) {
        case 'classic': return { shape: 'classic', plus: TALOS_DEFAULT_COMPOSER_PLUS }
        case 'drawer': return { shape: 'standard', plus: 'drawer' }
        case 'menu': return { shape: 'standard', plus: 'menu' }
        case 'compact': return { shape: 'compact', plus: 'menu' }
        default: break
    }
    if (legacy.immersive_composer === true) return { shape: 'compact', plus: 'menu' }
    if (legacy.composer_drawer === false) return { shape: 'classic', plus: TALOS_DEFAULT_COMPOSER_PLUS }
    if (legacy.plus_dropdown === true) return { shape: 'standard', plus: 'menu' }
    /*
     * ⛔⛔ QUESTA RIGA È SCRITTA, NON DEDOTTA DAL PREDEFINITO — e la differenza
     * l'ha trovata un test, non una rilettura.
     *
     * Il 2026-08-17 il predefinito del compositore passa a `compact` (owner:
     * «la forma del compositore a compatto»), e ha detto anche per chi vale:
     * «stavo parlando delle installazioni NUOVE, non default per i già
     * installati».
     *
     * Qui però non siamo su un'installazione nuova: siamo sulla traduzione di
     * una scelta VECCHIA. `composer_drawer: true` vuol dire che quella persona
     * aveva acceso il cassetto, cioè la barra standard — e finché questa riga
     * leggeva il predefinito, cambiarlo le riscriveva la scelta sotto il naso.
     * Un cambio di predefinito che si trasforma in migrazione è esattamente
     * quello che l'owner ha escluso.
     *
     * ⇒ `standard` sta scritto. Il prossimo che cambia il predefinito non tocca
     * chi ha già scelto, e non deve accorgersene da solo.
     */
    return { shape: 'standard', plus: TALOS_DEFAULT_COMPOSER_PLUS }
}
