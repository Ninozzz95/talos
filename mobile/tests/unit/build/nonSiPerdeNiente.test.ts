import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * ⭐⭐⭐ QUELLO CHE HAI ACCESO RESTA ACCESO — e ciò che hai spento resta spento.
 *
 * ## Il difetto
 *
 * Owner 2026-08-15: «di assoluta critica e vitale importanza è che, alla
 * chiusura e riapertura dell'applicazione, l'utente mantenga tutte le
 * impostazioni di controllo del telefono, **anche quelle di accessibilità
 * tutte**. D'ora in poi l'utente non deve perdere nulla».
 *
 * MISURATE le quattro chiusure, separatamente, perché non sono la stessa cosa:
 *
 * | come si chiude            | servizio in elenco | interruttore master |
 * | ---                       | ---                | ---                 |
 * | Home                      | ACCESO             | 1 ✓                 |
 * | **swipe via dai recenti** | ACCESO             | **0** ⛔            |
 * | ucciso dal sistema        | ACCESO             | 1 ✓                 |
 * | `force-stop`              | spento             | 0                   |
 *
 * ⇒ Il caso vero è il secondo, e lascia uno stato **incoerente**: l'elenco dice
 * «acceso», l'interruttore generale dice «spento», e l'occhio non vede più.
 *
 * ⛔ `force-stop` NON è un difetto da curare: Android disabilita per progetto i
 * servizi di accessibilità di un'app terminata a forza, ed è una sua difesa. È
 * anche il gesto di un debugger, non di una persona — la prima misura di questo
 * difetto usava proprio quello, e avrebbe fatto curare un caso che nessuno vive.
 *
 * ## ⛔ Ciò che questo file difende davvero
 *
 * Non che la riparazione esista: che sia **CONDIZIONATA**. Riaccendere un
 * servizio che legge tutto lo schermo, di propria iniziativa, è il potere più
 * grosso che questa app possa prendersi. La condizione «TALOS è ancora
 * nell'elenco» è ciò che separa il riparare una contraddizione dall'imporre una
 * scelta — e MISURATO sul Pad: tolto TALOS dall'elenco, dopo chiusura e
 * riapertura l'elenco resta vuoto.
 */

const RADICE = resolve(__dirname, '../../..')
const leggi = (f: string): string => readFileSync(resolve(RADICE, f), 'utf8')

const RIPARAZIONE = 'android/app/src/main/java/ai/talos/agent/TalosNonSiPerdeNiente.kt'
const MAIN = 'android/app/src/main/java/ai/talos/MainActivity.java'

describe('⛔ chiudere e riaprire non deve far perdere niente', () => {
    it('la riparazione esiste e guarda ENTRAMBE le righe', () => {
        const sorgente = leggi(RIPARAZIONE)
        // Due righe che devono dire la stessa cosa: l'elenco e l'interruttore.
        // Guardarne una sola è come il difetto era arrivato.
        expect(sorgente).toContain('ENABLED_ACCESSIBILITY_SERVICES')
        expect(sorgente).toContain('ACCESSIBILITY_ENABLED')
    })

    it('⛔⛔ NON accende niente se la persona ci ha tolti dall\'elenco', () => {
        /*
         * È IL controllo di questo file. Senza questa condizione, TALOS
         * riaccenderebbe da solo un servizio che legge tutto lo schermo — e
         * l'avrebbe fatto contro una scelta esplicita della persona.
         */
        const sorgente = leggi(RIPARAZIONE)
        expect(sorgente).toMatch(/if\s*\(!stato\.elencato\)/)
        // e la strada che esce senza fare nulla
        expect(sorgente).toContain('niente-da-fare')
    })

    it('la scrittura si RILEGGE: un exit code 0 non è una scrittura riuscita', () => {
        // Su queste ROM `settings put` può riuscire e il valore tornare
        // indietro. È la stessa regola che è costata tre giorni sul calendario.
        const sorgente = leggi(RIPARAZIONE)
        const dopoLaScrittura = sorgente.slice(sorgente.indexOf('accessibility_enabled'))
        expect(dopoLaScrittura).toContain('leggi(contesto)')
        expect(sorgente).toContain('non-ha-attecchito')
    })

    it('⛔ quando il ponte manca lo DICE, invece di tacere', () => {
        // `accessibility_enabled` è una Settings.Secure: senza ponte non si
        // scrive, e non è una scelta nostra. Un silenzio qui è indistinguibile
        // da «tutto a posto».
        expect(leggi(RIPARAZIONE)).toContain('serve-il-ponte')
    })

    it('gira alla RIAPERTURA, non solo alla creazione', () => {
        /*
         * ⛔ Il caso da curare è proprio il ritorno dell'app in primo piano, e
         * `onCreate` non scatta quando l'Activity è solo tornata davanti:
         * agganciarla lì avrebbe curato metà dei casi, in silenzio.
         */
        const main = leggi(MAIN)
        const onResume = main.slice(main.indexOf('public void onResume()'))
        expect(onResume.slice(0, 400)).toContain('riparaCioCheIlSistemaHaSpento')
    })

    it('⛔ e NON blocca l\'avvio: il ponte fa I/O', () => {
        // Un avvio che aspetta una shell è un avvio che sembra rotto.
        const main = leggi(MAIN)
        const funzione = main.slice(main.indexOf('private void riparaCioCheIlSistemaHaSpento'))
        expect(funzione.slice(0, 700)).toContain('new Thread')
        // e non deve poter far fallire l'avvio
        expect(funzione.slice(0, 700)).toMatch(/catch\s*\(\s*Throwable/)
    })
})
