import { describe, expect, it } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * ⛔⛔⛔ IL PALLINO E IL PULSANTE FLOTTANTE NON TORNANO. MAI.
 *
 * Owner 2026-08-15, due messaggi di fila:
 *
 * > «voglio che rimuovi definitivamente il pulsante flottante e il pallino di
 * > TALOS d'ora in poi»
 * > «e assicurati che siano **obliterati per sempre**»
 *
 * «Per sempre» non è una cancellazione: una cancellazione dura fino al prossimo
 * che ha una buona idea. Questo file è la parte che dura — se qualcuno li
 * rimette, la suite diventa rossa e deve **cancellare questo test a mano**, cioè
 * deve leggere perché erano stati tolti prima di rimetterli.
 *
 * ## Che cos'erano, per chi legge fra un anno
 *
 * Erano **due** cose diverse con lo stesso aspetto:
 *
 * 1. **La bolla** (`ai.talos.bolla.TalosBolla`, solo nelle build di sviluppo):
 *    un pallino sopra le altre app, si tocca e si apre la barra.
 * 2. **Il pallino del rientro** (`ai.talos.agent.TalosPallino`, nato il
 *    2026-08-15): una finestra tenuta a schermo apposta perché su Android 15+
 *    un'app può tornare davanti solo se ne ha una visibile. ⛔ Non ha **mai**
 *    funzionato: il suo servizio non reggeva il primo piano e Android uccideva
 *    l'app con `ForegroundServiceDidNotStartInTimeException`.
 *
 * Entrambi costavano `SYSTEM_ALERT_WINDOW`, che è fra i permessi più pesanti che
 * un'app possa chiedere.
 *
 * ## ⛔ COSA NON È VIETATO, e perché la differenza conta
 *
 * `flagRequestAccessibilityButton` in `talos_occhio.xml` **resta**, e non è una
 * dimenticanza. MISURATO sul Pad il 2026-08-14: quel flag regge **due** cose,
 * il pulsante che galleggia *e la scorciatoia dei due tasti del volume*, e
 * senza di esso i due tasti **spegnerebbero l'occhio** invece di aprire TALOS.
 *
 * ⇒ Ciò che è obliterato è la nostra **offerta**: TALOS non propone, non
 * spiega e non accende più un pulsante flottante da nessuna schermata. La
 * casella nelle impostazioni di sistema la governa Android, e non è nostra da
 * togliere.
 */

const RADICE = resolve(__dirname, '../../..')
const c = (f: string): string => (existsSync(resolve(RADICE, f)) ? readFileSync(resolve(RADICE, f), 'utf8') : '')

describe('⛔ il pallino e il pulsante flottante sono obliterati', () => {
    it('i sorgenti nativi del pallino non esistono più', () => {
        for (const f of [
            'android/app/src/main/java/ai/talos/agent/TalosPallino.kt',
            'android/app/src/main/java/ai/talos/agent/TalosPallinoService.kt',
            'android/app/src/debug/java/ai/talos/bolla/TalosBolla.kt',
            'android/app/src/debug/java/ai/talos/bolla/TalosBollaPlugin.kt',
            'src/lib/device/bolla.ts',
        ]) {
            expect(existsSync(resolve(RADICE, f)), `${f} è tornato`).toBe(false)
        }
    })

    it('⛔ SYSTEM_ALERT_WINDOW non è dichiarato in NESSUN manifest', () => {
        // Il permesso esisteva solo per tenere quelle finestre a schermo. Senza
        // di loro è solo un permesso pesante da spiegare a chi installa.
        for (const m of [
            'android/app/src/main/AndroidManifest.xml',
            'android/app/src/debug/AndroidManifest.xml',
        ]) {
            const testo = c(m)
            expect(testo, `${m} non si legge`).not.toBe('')
            expect(
                testo.match(/<uses-permission[^>]*SYSTEM_ALERT_WINDOW/),
                `${m} chiede di nuovo SYSTEM_ALERT_WINDOW`,
            ).toBeNull()
        }
    })

    it('nessun servizio di finestra è dichiarato', () => {
        for (const m of [
            'android/app/src/main/AndroidManifest.xml',
            'android/app/src/debug/AndroidManifest.xml',
        ]) {
            expect(c(m)).not.toMatch(/android:name="ai\.talos\.(agent\.TalosPallinoService|bolla\.TalosBolla)"/)
        }
    })

    it('nessun codice li richiama più', () => {
        for (const f of [
            'android/app/src/main/java/ai/talos/agent/TalosDevicePlugin.kt',
            'android/app/src/main/java/ai/talos/TalosBarraActivity.java',
            'android/app/src/main/java/ai/talos/MainActivity.java',
        ]) {
            // ⛔ Solo le CHIAMATE: i commenti che raccontano perché sono stati
            // tolti devono restare, e un test che vieta anche quelli cancella
            // la memoria insieme al codice.
            expect(c(f)).not.toMatch(/TalosPallinoService\.(accendi|spegni)/)
            expect(c(f)).not.toMatch(/TalosBolla\w*\.(accendi|spegni|mostra)/)
        }
    })

    it('⛔ TALOS non OFFRE più il pulsante flottante in nessuna schermata', () => {
        const scorciatoie = c('src/lib/device/scorciatoie.ts')
        expect(scorciatoie).not.toMatch(/id:\s*'bottone'/)
        // Il tipo dei preset non lo contempla nemmeno.
        expect(scorciatoie).not.toMatch(/readonly id:[^\n]*'bottone'/)

        // E le parole con cui lo si proponeva non ci sono più.
        for (const l of ['src/i18n/locales/it.ts', 'src/i18n/locales/en.ts']) {
            const testo = c(l)
            expect(testo).not.toMatch(/bubble(Title|Body|On|Ask|Off):/)
            expect(testo).not.toMatch(/allowOverlay:/)
        }
    })

    it('⛔ ma la LETTURA di com\'è messo il telefono resta', () => {
        // Non è una svista: se la persona ha già puntato la scorciatoia di
        // sistema sul pulsante, TALOS deve saperlo per non dirle «da mettere».
        // Leggere un fatto non è offrire una funzione.
        expect(c('src/lib/device/scorciatoie.ts')).toMatch(/readonly bottone: boolean/)
    })

    it('⛔ e il flag dell\'accessibilità RESTA: regge i tasti del volume', () => {
        // MISURATO il 2026-08-14: senza, i due tasti spengono l'occhio invece
        // di chiamare TALOS. Toglierlo per «finire il lavoro» romperebbe una
        // scorciatoia che l'owner non ha mai chiesto di togliere.
        expect(c('android/app/src/main/res/xml/talos_occhio.xml'))
            .toMatch(/flagRequestAccessibilityButton/)
    })
})
