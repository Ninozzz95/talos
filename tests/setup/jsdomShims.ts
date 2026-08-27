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

// Reka UI's slider measures its track through ResizeObserver. jsdom has no
// layout engine, so keep the observer inert while preserving the production
// code path (the real browser supplies measurements).
if (typeof ResizeObserver === 'undefined') {
    class JsdomResizeObserver {
        observe() {}
        unobserve() {}
        disconnect() {}
    }
    globalThis.ResizeObserver = JsdomResizeObserver as unknown as typeof ResizeObserver
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
/*
 * ⛔⛔⛔ LA CURA STRUTTURALE L'HO PROVATA, E HA PEGGIORATO TUTTO.
 *
 * L'elenco qui sotto non convergeva — tre corse, tre moduli diversi — e la
 * regola che avevo scritto io diceva: «se diventa lungo, smetti di caricare le
 * rotte pigramente nei test». Sembrava ovvia. L'ho fatta, chiamando
 * `preloadTalosMobileRoutes()` per i file jsdom.
 *
 * MISURATO, e non c'e' stato bisogno di discuterne:
 *
 *     prima   5.173 passati, 0 falliti, setup  12,6 s
 *     dopo      250 FALLITI,            setup 122,8 s
 *     e l'errore del teardown era comunque tornato
 *
 * ⇒ Tirare dentro venticinque schermi nel setup non e' un precarico: e'
 * ESEGUIRE meta' dell'app prima di ogni file di test. Gli schermi hanno effetti
 * al montaggio — store, plugin, cose globali — e i test trovavano un mondo gia'
 * sporco.
 *
 * ⛔ La lezione, che vale piu' della cura mancata: una regola scritta in un
 * commento resta un'IPOTESI finche' non la si misura. L'avevo scritta come se
 * fosse una conclusione, e mi ci sono fidato per non pensarci una seconda
 * volta.
 *
 * ⇒ L'elenco resta, sapendo che e' un tampone. La cura vera va CERCATA, non
 * dedotta: probabilmente sta nel modo in cui vitest smonta l'ambiente mentre un
 * import e' in volo, non in cosa si precarica.
 */
const TIRATI_DENTRO_SUBITO = [
    // 2026-08-15, corsa locale: markdown-it dietro il renderer dei messaggi
    () => import('@/lib/talosMessageMarkdown'),
    // 2026-08-16, corsa 31941140063: la catena del browser dentro ChatScreen
    () => import('@/lib/browser/browserEvidence'),
    /*
     * ⛔ E QUI HO PROVATO AD AGGIUNGERE `@/components/ui/button`, per la corsa
     * 31945732536 che nominava `class-variance-authority`. Ha rotto DIECI test
     * in un file — misurato, non temuto.
     *
     * ⇒ Nemmeno il tampone si allunga a piacere: precaricare un modulo lo
     * ESEGUE, e un modulo con effetti al caricamento cambia il mondo che i
     * test si aspettano. Il tampone funziona solo per moduli inerti, e non c'e'
     * modo di saperlo se non provando.
     */
]

for (const tira of TIRATI_DENTRO_SUBITO) void tira()

/**
 * ⭐⭐⭐ THE TEARDOWN RACE — exit 1 with ZERO failing tests, and the third cure
 * is the one the tool itself documents.
 *
 * The release of v0.1.3 died here, after 3m52s of CI:
 *
 *     EnvironmentTeardownError: Cannot load
 *     '/node_modules/class-variance-authority/dist/index.mjs' imported from
 *     src/components/ui/button/index.ts after the environment was torn down.
 *
 * Zero tests red. A gate that is red while everything passes is a gate nobody
 * reads — the same sentence is already written above this one, about scrollTo.
 *
 * ## ⛔ Two cures were burned before this one, and both were LOCAL
 *
 * The pattern is always the same and it is not a bug in our code: a component
 * starts a lazy `import()` while mounting, the test finishes, Vitest tears the
 * environment down, and the import resolves into a world that no longer exists.
 * Every component in this app imports lazily on purpose — that is how the
 * startup graph stays under its ceiling — so the race is available to any test
 * that mounts anything.
 *
 * ⇒ Which is exactly why the fix belongs HERE and not in a test file: patching
 * the file that happened to be red leaves the race armed in the other ~90.
 *
 * ## The remedy, from Vitest's own API
 *
 * `vi.dynamicImportSettled()` waits for every pending dynamic import —
 * including imports started by those imports — plus one `setTimeout` tick, so
 * the synchronous work that follows them has run too. Reported against Vitest
 * 4.1 (ours is 4.1.10) precisely for "mounting a component with dynamic
 * imports".
 *
 * ⛔ It runs only where a DOM exists: the ~220 files that test a pure function
 * mount nothing, and making them all await something would be paying 220 times
 * for a race they cannot have.
 */
if (typeof document !== 'undefined') {
    const { afterEach, vi } = await import('vitest')
    afterEach(async () => {
        await vi.dynamicImportSettled()
    })
}
