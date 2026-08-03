/**
 * How a destructive button is painted in TALOS.
 *
 * The shadcn `destructive` variant assumes `--destructive` is a saturated red
 * meant to be a solid fill: it draws `text-destructive` over `bg-destructive/20`.
 * In TALOS that token is the opposite kind of thing — a light red TEXT colour,
 * `#fee2e2`, guaranteed legible ON `--talos-danger-soft` and checked there by
 * `talosContrast.ts`. Put it over 20% of itself and you get pale pink on a pale
 * wash: seen on the tablet 2026-08-03, where "Delete permanently" was
 * indistinguishable from a secondary button.
 *
 * The upstream file is not forked — a conformance test guards those 24 files,
 * and rightly. This is passed as `class` instead, where tailwind-merge drops the
 * variant's conflicting utilities and keeps the theme's own danger triple.
 *
 * One constant rather than a copied string, so the four destructive buttons in
 * the app cannot drift into four different reds.
 *
 * The `dark:` twins are not padding. tailwind-merge only drops utilities that
 * share a variant prefix, so an unprefixed `bg-…` leaves `dark:bg-destructive/20`
 * standing — and `dark:` compiles to `.dark .foo`, which outranks it on
 * specificity. In a dark-first app that means the pale wash wins anyway. The
 * unit test caught this before the device did.
 */
export const TALOS_DANGER_ACTION_CLASS = [
    'border-[var(--talos-danger-border)]',
    'bg-[var(--talos-danger-soft)] dark:bg-[var(--talos-danger-soft)]',
    'text-[var(--talos-danger)]',
    // Feedback without a second colour to keep in step with the first.
    'hover:bg-[var(--talos-danger-soft)] dark:hover:bg-[var(--talos-danger-soft)] hover:brightness-125',
    'focus-visible:ring-[var(--talos-danger-border)] dark:focus-visible:ring-[var(--talos-danger-border)]',
].join(' ')
