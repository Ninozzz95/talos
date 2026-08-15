/**
 * One pill, defined once.
 *
 * Owner 2026-08-03, on the Model Lab's local tab: «lo stile deve essere quello
 * della libreria della ricerca etc, rendilo coerente al massimo, chip filtri
 * etc, mi raccomando è critico».
 *
 * The chip control itself is already shared — every surface renders through
 * `TalosThemedFilter`. What was NOT shared is the one thing a reader actually
 * sees: which classes make a selected chip look selected. That existed as
 * `filterOptionClass` in the research station and as `sortOptionClass` in the
 * Model Lab, letter for letter the same and free to drift apart the first time
 * either one is touched. Two copies of a rule is one rule and one future bug.
 *
 * Coherence at this level is not decoration. A radiogroup whose selected option
 * looks like the others is a control that refuses to say what it is doing, and
 * the Model Lab's first render was exactly that — three words in a row, no
 * fill, no state.
 */
export function talosSortChipClass(selected: boolean): string {
    const base = 'talos-pressable min-h-11 shrink-0 rounded-full px-3 text-sm transition-colors'
    return selected
        ? `${base} bg-[var(--talos-accent)] text-[var(--talos-accent-contrast,var(--primary-foreground))]`
        : `${base} border border-[var(--talos-border)] text-[var(--talos-muted)]`
}
