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

/**
 * ⛔⛔ LA SUITE ERA VERDE E USCIVA CON CODICE 1 — e la CI l'avrebbe letto rosso.
 *
 * MISURATO il 2026-08-15, un'ora dopo la pubblicazione del repo:
 *
 *     Test Files  569 passed | 3 skipped (572)
 *     Tests       5156 passed | 10 skipped (5166)
 *     exit code   1
 *
 * Nessun test fallito, e comunque `npx vitest run` esce con 1:
 *
 *     Vitest caught 4 unhandled errors during the test run.
 *     EnvironmentTeardownError: Cannot load '/node_modules/markdown-it/index.mjs'
 *     imported from src/lib/talosMessageMarkdown.ts after the environment was
 *     torn down.
 *
 * ⇒ `markdown-it` è pesante e viene risolto pigramente: quando il file di test
 * che lo innesca finisce, vitest smonta l'ambiente — e l'import arriva dopo,
 * su un ambiente che non c'è più. Non è un difetto dell'app: nessuno di quegli
 * errori corrisponde a un comportamento sbagliato in produzione.
 *
 * ⛔ Ma conta lo stesso: `.github/workflows/ci.yml` esegue `npx vitest run`, e
 * una CI **rossa a build sano** dal primo giorno è peggio di una CI assente —
 * si impara a ignorarla, e la prima volta che diventa rossa per un motivo vero
 * non se ne accorge nessuno.
 *
 * ⇒ La cura è tirarlo dentro SUBITO, nel setup: l'import si risolve mentre
 * l'ambiente è vivo, e non resta niente in sospeso da consegnare dopo.
 * ⛔ E non è un mock: è il modulo VERO, caricato prima invece che dopo. I test
 * continuano a esercitare il renderer di produzione.
 */
/*
 * ⛔⛔ E IL 2026-08-16 HA INSEGNATO CHE È UN ELENCO, NON UN CASO SINGOLO.
 *
 * Avevo dichiarato il difetto risolto perché una corsa verde non lo mostrava.
 * Sbagliato: è **intermittente**. Dipende da quanto ci mette il runner a
 * smontare l'ambiente rispetto a quanto ci mette un import a risolversi, e su
 * Linux quel margine cambia da corsa a corsa.
 *
 *     corsa 10:14 UTC   exit 1, ZERO test falliti
 *     EnvironmentTeardownError: Cannot load
 *       '/src/lib/browser/browserContracts.ts'
 *       imported from src/lib/browser/browserEvidence.ts
 *
 * ⇒ Una corsa pulita non prova l'assenza di un guasto intermittente. Il primo
 * modulo qui sotto è arrivato da una corsa, il secondo da un'altra, e non c'è
 * ragione di credere che siano finiti.
 *
 * ## La regola, per chi ne trova un terzo
 *
 * Non è una lista di moduli «problematici»: è la lista dei moduli che una
 * ROTTA PIGRA tira dentro. `mobileRoutes.ts` carica gli schermi con
 * `() => import(...)`, e un test che monta qualcosa di quella catena lascia
 * l'import in volo. Quando la CI ne nomina uno nuovo, va aggiunto qui — con la
 * data e la corsa, così si vede se l'elenco cresce o si è fermato.
 *
 * ⛔ Se un giorno diventasse lungo, la cura non è allungarlo ancora: è smettere
 * di caricare le rotte pigramente NEI TEST, dove il guadagno non esiste.
 */
const TIRATI_DENTRO_SUBITO = [
    // 2026-08-15, corsa locale: markdown-it dietro il renderer dei messaggi
    () => import('@/lib/talosMessageMarkdown'),
    // 2026-08-16, corsa 31941140063: la catena del browser dentro ChatScreen
    () => import('@/lib/browser/browserEvidence'),
]

for (const tira of TIRATI_DENTRO_SUBITO) void tira()
