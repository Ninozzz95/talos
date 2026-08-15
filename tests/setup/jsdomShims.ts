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

/**
 * La cattura del puntatore: jsdom non la implementa, e senza di essa NESSUN
 * selettore di questa app si e' mai potuto aprire in un test.
 *
 * reka-ui chiama `hasPointerCapture` sul primo `pointerdown` del grilletto: se
 * manca, l'apertura muore li' e le voci non nascono mai. Il costo non era
 * teorico — le voci di un selettore vivono solo da aperto, quindi un difetto
 * dentro una voce era invisibile a chiunque non aprisse il selettore. E' cosi'
 * che una voce con valore vuoto ha attraversato il cancello: i test la
 * leggevano sul grilletto, dove il testo appare comunque.
 *
 * Restano protesi inerti, come quelle sopra: dicono «nessuna cattura», che e'
 * la verita' in un ambiente senza puntatore. Non simulano un comportamento su
 * cui un test possa poi appoggiare un'affermazione.
 */
if (typeof Element !== 'undefined' && typeof Element.prototype.hasPointerCapture !== 'function') {
    Element.prototype.hasPointerCapture = () => false
    Element.prototype.setPointerCapture = () => {}
    Element.prototype.releasePointerCapture = () => {}
}
