import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * ⛔⛔⛔ L'ASSISTENTE NON DEVE MORIRE QUANDO GIRI IL TELEFONO.
 *
 * ## Cosa si vedeva sul Pad, il 2026-08-14
 *
 * Assistente aperto con «hey TALOS», domanda fatta, risposta sullo schermo con
 * la scheda della torcia e il suo interruttore. Ruotato il Pad in orizzontale:
 *
 *   · la **carta sparisce** — risposta, scheda, comandi, tutto;
 *   · la pillola resta **schiacciata dentro il dock** del launcher, col campo
 *     di testo ridotto a una fila di puntini.
 *
 * ## La causa, in una riga che non c'era
 *
 * `MainActivity` dichiara `configChanges` con dieci chiavi; `TalosBarraActivity`
 * **non ne dichiarava nessuna**. Senza, Android distrugge e ricrea l'activity a
 * ogni rotazione — e questa è `singleTask` con una WebView che si monta una
 * volta sola, quindi la barra ricreata torna vuota.
 *
 * ⇒ Era l'unica superficie dell'app a farlo, perché era l'unica a cui mancava
 * la riga. Nessun test guardava questa activity.
 *
 * ⛔ E si pretende lo STESSO elenco, non un sottoinsieme: due elenchi diversi
 * per la stessa WebView vogliono dire due comportamenti a seconda di dove la
 * apri, che è il difetto già pagato coi tempi della dettatura — «stesso
 * microfono, due comportamenti, a seconda di dove lo premevi».
 */

const RADICE = resolve(__dirname, '../../..')
const MANIFEST = 'android/app/src/main/AndroidManifest.xml'
const manifest = readFileSync(resolve(RADICE, MANIFEST), 'utf8')

/** Le chiavi dichiarate dall'activity col nome dato, come insieme ordinato. */
function chiaviDi(nomeActivity: string): string[] {
    const blocco = new RegExp(
        `<activity[^>]*android:name="\\${nomeActivity}"[^>]*>|<activity[^>]*>(?=[^]*?android:name="\\${nomeActivity}")`,
    )
    // Si prende il blocco <activity …> che contiene quel nome, attributi compresi.
    const tutti = manifest.match(/<activity\b[^>]*>/g) ?? []
    const mio = tutti.find((a) => a.includes(`android:name="${nomeActivity}"`))
    expect(mio, `activity ${nomeActivity} non trovata nel manifest`).toBeTruthy()
    void blocco
    const chiavi = /android:configChanges="([^"]+)"/.exec(mio!)?.[1]
    return chiavi ? chiavi.split('|').map((c) => c.trim()).sort() : []
}

describe('⛔ l\'assistente sopravvive alla rotazione', () => {
    it('la barra dichiara configChanges', () => {
        const barra = chiaviDi('.TalosBarraActivity')
        expect(barra.length).toBeGreaterThan(0)
        /*
         * ⛔ `orientation` da sola non basta su targetSdk moderni: senza
         * `screenSize` Android ricrea comunque, perché ruotando cambiano anche
         * le dimensioni. È la coppia che conta, ed è il modo in cui questa riga
         * viene scritta sbagliata più spesso.
         */
        expect(barra).toContain('orientation')
        expect(barra).toContain('screenSize')
        expect(barra).toContain('smallestScreenSize')
        expect(barra).toContain('screenLayout')
    })

    /**
     * ⛔⛔⛔ E IL «INDIETRO» LA CHIUDE — ci sono voluti TRE tentativi.
     *
     * MISURATO sul Pad il 2026-08-14: barra aperta con la parola, premuto
     * `KEYCODE_BACK`, e `dumpsys window` la mostrava ancora in primo piano.
     * Nessuna riga di registro da nessuna parte: il tasto veniva inghiottito.
     *
     *   1. `onBackPressed()` — compilato, installato, **mai chiamato**: con
     *      `targetSdk 36` Android usa il back predittivo e quella richiamata è
     *      deprecata e morta.
     *   2. `OnBackInvokedCallback` a `PRIORITY_DEFAULT` — registrata, **mai
     *      chiamata**: Capacitor ne registra una per la WebView, e a parità di
     *      priorità il dispatcher chiama l'ultima registrata.
     *   3. `PRIORITY_OVERLAY` — funziona. Esiste esattamente per una superficie
     *      disegnata SOPRA il contenuto, che sul «indietro» deve andarsene per
     *      prima. È ciò che la barra è.
     *
     * ⇒ Due volte il codice era corretto e non serviva a niente. E finché la
     * barra non si chiude tiene il microfono — ogni sua sessione di ascolto
     * chiama `TalosParola.cedi()` — quindi «hey TALOS» resta sordo. Il difetto
     * che la persona sente è «funziona una volta sola».
     */
    it('⛔⛔ il «indietro» chiude la barra, e con la priorità che vince', () => {
        const barra = readFileSync(
            resolve(RADICE, 'android/app/src/main/java/ai/talos/TalosBarraActivity.java'),
            'utf8',
        )
        expect(barra).toContain('registerOnBackInvokedCallback')
        /*
         * ⛔ È LA PRIORITÀ il punto, non la registrazione: con `DEFAULT` la
         * richiamata c'è, è corretta, e non viene mai chiamata. Un presidio che
         * guardasse solo `registerOnBackInvokedCallback` sarebbe passato verde
         * sulla versione rotta.
         */
        expect(barra).toContain('OnBackInvokedDispatcher.PRIORITY_OVERLAY')
        expect(barra).not.toContain('OnBackInvokedDispatcher.PRIORITY_DEFAULT')
        // E la strada vecchia resta per i telefoni sotto Android 13, dove il
        // dispatcher non esiste: `minSdk` è 26, quel parco è dentro.
        expect(barra).toMatch(/public void onBackPressed\(\)[\s\S]{0,200}?finish\(\)/)
        /*
         * ⛔ `finish()` e non `moveTaskToBack`: è `onDestroy` a restituire il
         * microfono. Mandarla dietro la lascerebbe viva a tenersi la presa.
         */
        // ⛔ La CHIAMATA, non la parola: il commento accanto alla cura cita
        // `moveTaskToBack` per spiegare perché NON si usa, ed è giusto che ci
        // sia. È la terza volta in questa sessione che un `not.toContain`
        // inciampa nel commento che spiega il difetto.
        expect(barra).not.toMatch(/moveTaskToBack\s*\(/)
    })

    it('⭐ e le chiavi sono le STESSE della schermata intera', () => {
        /*
         * La WebView è la stessa e il contenuto è lo stesso: se le due activity
         * dichiarassero elenchi diversi, la stessa app si comporterebbe in due
         * modi a seconda di dove la apri. È esattamente la forma del difetto dei
         * tempi della dettatura — «stesso microfono, due comportamenti».
         */
        expect(chiaviDi('.TalosBarraActivity')).toEqual(chiaviDi('.MainActivity'))
    })
})
