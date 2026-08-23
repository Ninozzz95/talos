/**
 * The register of choice surfaces.
 *
 * Every screen that splits itself into views — Model Lab, Appearance, Doctor —
 * has so far declared that split three separate times: once as markup, once as
 * a persistence key when someone remembered, and never as something the model
 * could reach. The three drifted, which is why a route query knows about
 * categories the tab component has never heard of, and why asking TALOS to
 * "take me to where the search key is set" lands on a screen and stops at the
 * door.
 *
 * This file is the single declaration the other three read from. A surface
 * registered here yields, from one entry:
 *
 *   - the views a tab strip renders, in order, with a stable id each;
 *   - the key its remembered choice is stored under;
 *   - the entry a model needs to open one of those views by name.
 *
 * The rule that makes it worth having is the one in `talosViewSurfaceOf`: a
 * view that is not declared cannot be opened, and a declared view is reachable
 * by all three routes or by none. There is a test that walks the register and
 * fails if a surface declares a view the catalogue cannot name — the gate the
 * research asked for, phrased as "no section reachable only by hand".
 *
 * This is not a new idea in this codebase, it is a generalised one: Doctor has
 * had `TALOS_DOCTOR_SECTIONS` for a while, with ids, order and message keys in
 * one place. It worked, and nothing else copied it. The same thing happened
 * with the shared select — the good pattern existed and stayed in one screen.
 *
 * Deliberately not here: labels. Those live in the message catalogues, because
 * a register that carries English strings is a register that has to be edited
 * to add a language.
 */

/** What kind of control the surface should draw — decided by semantics, not taste. */
export type TalosViewGrammar =
    /** Panels share the screen with their list: an ARIA tablist. */
    | 'tabs'
    /** The panel replaces the screen: a nav with links and aria-current. */
    | 'navigation'
    /** The choice narrows a list without changing view: a radiogroup. */
    | 'filter'

export type TalosView = {
    /** Stable across renames and translations: this is what gets persisted and spoken. */
    id: string
    /** Message key for the visible name. Never a literal string. */
    labelKey: string
}

export type TalosViewSurface = {
    id: string
    grammar: TalosViewGrammar
    views: readonly TalosView[]
    /**
     * Whether moving the selection should show the panel immediately.
     *
     * The APG allows automatic activation only when panels can be displayed
     * instantly. A panel that fetches on mount cannot, so those surfaces are
     * manual — the choice moves with the arrow keys and commits on Enter.
     */
    activation: 'automatic' | 'manual'
}

const SURFACES = [
    {
        /**
         * Owner 2026-08-06: «dividere la sezione modelli locali con due tab,
         * questo dispositivo e Hugging Face; organizza meglio visivamente, due
         * tab pane semplici e compatte».
         *
         * Sono due mestieri diversi che dividevano una pagina sola: **quello
         * che hai** — con i gigabyte sul disco, la rinomina, l'eliminazione — e
         * **quello che potresti prendere**, con la ricerca, i filtri e lo
         * scorrimento infinito. Chi entra per liberare spazio scorreva l'intero
         * catalogo del Hub per arrivarci.
         *
         * Due, non tre: sono i due lati veri della domanda «che modelli ho».
         */
        id: 'local-models',
        grammar: 'tabs',
        activation: 'automatic',
        views: [
            { id: 'installed', labelKey: 'localModels.tabInstalled' },
            { id: 'hub', labelKey: 'localModels.tabHub' },
        ],
    },
    {
        id: 'appearance',
        grammar: 'tabs',
        activation: 'automatic',
        views: [
            { id: 'design', labelKey: 'appearance.design' },
            { id: 'motion', labelKey: 'appearance.motion' },
        ],
    },
    {
        /**
         * The report, at two distances: what it claims, and what it read.
         *
         * Registered rather than hand-drawn for the ordinary reason — it then
         * has the same strip, the same swipe and the same memory as everything
         * else, and the drift gate watches it too.
         */
        id: 'research-report',
        grammar: 'tabs',
        activation: 'automatic',
        views: [
            { id: 'claims', labelKey: 'research.claimsTab' },
            { id: 'sources', labelKey: 'research.sourcesTab' },
        ],
    },
    {
        /**
         * Owner 2026-07-26: "non voglio che sia troppo affollata … fai in modo
         * che ci siano dei settaggi e delle tab. Insomma strutturalo in modo
         * coerente."
         *
         * The research settled the shape, and it is the reason this surface is
         * capped at three: Apple caps segments at about five on a phone, and
         * NN/g find that once a tab row scrolls "the hidden tabs become less
         * discoverable" — an overflow carousel in a diagnostics screen hides
         * exactly the thing someone came to find. Three also leaves every
         * target well above 48dp on a 360dp screen.
         */
        id: 'doctor',
        grammar: 'tabs',
        activation: 'automatic',
        views: [
            // status: device checks and problems.
            { id: 'status', labelKey: 'doctor.sections.status' },
            // data: where time and space go.
            { id: 'data', labelKey: 'doctor.sections.data' },
            // advanced: debug switches and build.
            { id: 'advanced', labelKey: 'doctor.sections.advanced' },
        ],
    },
] as const satisfies readonly TalosViewSurface[]

export const TALOS_VIEW_SURFACES: readonly TalosViewSurface[] = SURFACES

export function talosViewSurfaceOf(surfaceId: string): TalosViewSurface | undefined {
    return SURFACES.find((surface) => surface.id === surfaceId)
}

export function talosViewExists(surfaceId: string, viewId: string): boolean {
    return talosViewSurfaceOf(surfaceId)?.views.some((view) => view.id === viewId) ?? false
}

/**
 * The default view of a surface: the first one declared.
 *
 * Written down rather than assumed, because "the remembered choice, or the
 * default" appears in the component, in the route restore and in the tool, and
 * three copies of `views[0]` is how they start disagreeing.
 */
export function talosDefaultViewOf(surfaceId: string): string | undefined {
    return talosViewSurfaceOf(surfaceId)?.views[0]?.id
}

/**
 * Where a surface's remembered choice is stored.
 *
 * One shape for every surface, so persistence is a property of being
 * registered rather than something each screen remembers to do. The precedent
 * is `library_view`, which was added only after someone noticed the Library
 * "just never survived a reopen".
 */
export function talosViewStorageKey(surfaceId: string): string {
    return `talos.view.${surfaceId}`
}

/**
 * The view a surface should open with: the remembered one if it is still real,
 * otherwise the default.
 *
 * A remembered id is validated rather than trusted — a view can be removed by a
 * release while a device still holds its name, and a tab strip pointed at a
 * view that no longer exists renders nothing at all.
 */
export function talosResolveView(surfaceId: string, remembered: string | null | undefined): string | undefined {
    if (remembered && talosViewExists(surfaceId, remembered)) return remembered
    return talosDefaultViewOf(surfaceId)
}
