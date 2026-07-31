/**
 * Setup runs for EVERY test file, so what it does unconditionally is paid 310
 * times. Importing `@vue/test-utils` and building the full i18n bundle is worth
 * it for the ~90 files that mount a component and worthless for the ~220 that
 * test a pure function — and it was the second-largest fixed cost in the gate,
 * after the DOM itself.
 *
 * Guarded on the environment rather than on a list: a file that declares
 * `@vitest-environment jsdom` gets the whole setup, and one that does not pays
 * nothing. Nothing to keep in sync, and no way to be wrong.
 */
if (typeof document !== 'undefined') {
    const { config } = await import('@vue/test-utils')
    const { createTalosI18n } = await import('@/i18n')
    config.global.plugins = [await createTalosI18n()]
}

/**
 * jsdom implements no scrolling API, so any component that calls
 * `element.scrollTo(...)` rejects asynchronously — which made `vitest run` exit
 * 1 with 0 failed tests (Settings Center, three unhandled rejections). A gate
 * that is red while everything passes is a gate nobody reads.
 *
 * No-op shims for layout APIs jsdom does not implement. They must never be used
 * to fake behaviour a test asserts on.
 */
if (typeof Element !== 'undefined' && typeof Element.prototype.scrollTo !== 'function') {
    Element.prototype.scrollTo = () => {}
}
if (typeof Element !== 'undefined' && typeof Element.prototype.scrollIntoView !== 'function') {
    Element.prototype.scrollIntoView = () => {}
}
