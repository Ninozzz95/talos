import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * ⛔⛔ DUE DIFETTI DELLA PAROLA DI ATTIVAZIONE — owner 2026-08-14, a voce.
 *
 * > «Quando dico *hey jarvis* e parlo subito dopo che compare la barra, non
 * > prende bene le mie parole: è come se passasse un leggero delay prima che io
 * > possa iniziare a parlare. L'ascolto DEVE iniziare appena la barra è
 * > visibile, se no rischia di mangiarsi parole. Inoltre *hey jarvis* non
 * > funziona quando la barra è già aperta: se TALOS non è in listening, non fa
 * > ripartire l'ascolto come se premessi il pulsante microfono.»
 *
 * Sono due difetti diversi con tre cause, e ognuna è una riga:
 *
 * | cosa vedeva l'owner | la causa, letta nel codice |
 * |---|---|
 * | parole mangiate all'apertura | l'ascolto partiva DOPO `controller.init()` |
 * | parola sorda a barra aperta | `cancel()` non restituiva il microfono |
 * | parola sentita e nessun effetto | `showSession` su una sessione già mostrata |
 *
 * ## ⛔ Perché si legge il SORGENTE
 *
 * Tutte e tre vivono in un ORDINE o in una riga nativa, e nessuna delle due si
 * osserva da un test di unità: montare la barra in jsdom non dice niente su
 * quando Android consegna un intent, e un mock del controller proverebbe il
 * mock. La prova vera è sul dispositivo ed è stata fatta; questi test servono a
 * impedire che qualcuno rimetta le righe dov'erano senza accorgersene.
 *
 * ⛔ E i commenti si TOLGONO prima di guardare: su questo progetto tre
 * asserzioni sono già passate contro le mie stesse spiegazioni invece che
 * contro il codice. Un commento che cita `riprendi()` non è `riprendi()`.
 */

const RADICE = resolve(__dirname, '../../..')

/** Il codice senza i commenti: una spiegazione non è un comportamento. */
function codice(percorso: string): string {
    return readFileSync(resolve(RADICE, percorso), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '')
        .replace(/<!--[\s\S]*?-->/g, '')
}

/** Il corpo di una funzione Kotlin, dalla firma alla prossima a inizio riga. */
function corpo(sorgente: string, firma: string): string {
    const dentro = sorgente.indexOf(firma)
    expect(dentro, `firma non trovata: ${firma}`).toBeGreaterThan(-1)
    const resto = sorgente.slice(dentro + firma.length)
    const fine = resto.search(/\n {4}(?:@|(?:private |internal |public )?fun |override fun )/)
    return fine === -1 ? resto : resto.slice(0, fine)
}

describe('⛔ l\'ascolto parte appena la barra si VEDE', () => {
    /*
     * ⛔⛔ IL TEST CHE MORDE DI PIÙ, ed è un ORDINE.
     *
     * La barra è a schermo dopo due giri di disegno (`avvia.ts` suona il
     * campanello lì); `controller.init()` apre SQLite e carica la sessione.
     * Con l'ascolto dietro quell'`await`, fra la barra visibile e il microfono
     * aperto c'era tutto il database — e chi parla guarda lo schermo.
     */
    it('⛔ il microfono si apre PRIMA del database, non dopo', () => {
        const barra = codice('src/components/barra/TalosBarraRoot.vue')
        const dentro = barra.slice(barra.indexOf('onMounted(async ()'))
        const microfono = dentro.indexOf('vogliAscoltare(\'apertura della barra\')')
        const database = dentro.indexOf('controller.init()')

        expect(microfono).toBeGreaterThan(-1)
        expect(database).toBeGreaterThan(-1)
        expect(microfono).toBeLessThan(database)
    })

    /*
     * ⛔ E l'invio aspetta ciò che l'ascolto non aspetta più. Spostare l'ascolto
     * davanti all'init apre una finestra in cui esiste una frase e non esiste
     * ancora una sessione dove metterla: stretta, ma «stretta» dice quanto
     * raramente capita, non quanto fa male quando capita.
     */
    it('⛔ l\'INVIO aspetta la chat pronta, visto che l\'ascolto non lo fa più', () => {
        const barra = codice('src/components/barra/TalosBarraRoot.vue')
        const invio = barra.slice(barra.indexOf('async function invia()'))
        const attesa = invio.indexOf('await pronta')
        const manda = invio.indexOf('chat.send(')

        expect(attesa).toBeGreaterThan(-1)
        expect(manda).toBeGreaterThan(-1)
        expect(attesa).toBeLessThan(manda)
    })
})

/**
 * ⭐⭐⭐ IL SILENZIO NON CHIUDE IL MICROFONO — la seconda metà di «mangia le parole».
 *
 * MISURATO sul Pad il 2026-08-14, con la frase detta subito dopo la parola:
 *
 *     16:50:20.806  anticipato: pronto a +140 ms
 *     16:50:22.304  anticipato: agganciato a +1639 ms
 *     16:50:22.490  anticipato: PARLA a +1825 ms     ← la persona sta parlando
 *     16:50:22.541  anticipato «errore» +1876ms NO_MATCH  ← e 51 ms dopo muore
 *     16:50:23.373  «pronto» PRESA +0ms              ← sessione nuova a +2,5 s
 *
 * Tre aperture diverse, tre morti a **+1836, +1864, +1876 ms**: il
 * riconoscitore di Google applica il silenzio di fine frase (1.600 ms) anche
 * PRIMA che qualcuno abbia parlato, e ignora `TALOS_ATTESA_INIZIO_MS` che
 * dichiara otto secondi di pazienza. Il buco fra la morte e la sessione nuova —
 * mezzo secondo di respiro più l'avvio — cade esattamente dove una persona che
 * vede comparire la barra comincia a parlare.
 *
 * Dopo la cura, MISURATO sullo stesso dispositivo: la riapertura costa
 * **~110 ms** invece di ~800, e il microfono non si chiude mai dentro i dieci
 * secondi dell'attesa.
 */
describe('⛔ un silenzio senza parole non chiude la sessione', () => {
    /*
     * ⛔ Vale in TUTTI E DUE i posti che aprono una sessione: l'orecchio
     * anticipato (che parte in `onCreate`, prima della WebView) e il plugin
     * (che parte quando il lato web lo chiede). Curarne uno solo lascerebbe il
     * buco nell'altro — ed è esattamente com'era: la prima misura veniva
     * dall'orecchio, la seconda dal plugin.
     */
    it('⛔ la regola sta in TUTTI E DUE i posti che aprono il microfono', () => {
        for (const file of [
            'android/app/src/main/java/ai/talos/agent/TalosOrecchioAnticipato.kt',
            'android/app/src/main/java/ai/talos/agent/TalosDictationPlugin.kt',
        ]) {
            const sorgente = codice(file)
            expect(sorgente, file).toContain('private fun ilSilenzioNonEUnEsito(errore: Int): Boolean')
            // ⛔ Chiamata PRIMA di chiudere il turno: dopo non servirebbe a niente.
            expect(sorgente, file).toMatch(
                /override fun onError\(error: Int\)[\s\S]{0,400}?if \(ilSilenzioNonEUnEsito\(error\)\) return/,
            )
        }
    })

    /*
     * ⛔⛔ SOLO se non è stato detto NIENTE, e «niente» vuol dire nessun TESTO.
     * `onBeginningOfSpeech` non basta: misurato, il motore ha annunciato PARLA e
     * 51 ms dopo ha risposto NO_MATCH senza una sola parola. Un rumore fa
     * scattare quell'annuncio; solo il testo prova che c'è una voce.
     */
    it('⛔ è il TESTO a dire «qualcuno ha parlato», non l\'annuncio del motore', () => {
        for (const file of [
            'android/app/src/main/java/ai/talos/agent/TalosOrecchioAnticipato.kt',
            'android/app/src/main/java/ai/talos/agent/TalosDictationPlugin.kt',
        ]) {
            const sorgente = codice(file)
            expect(sorgente, file).toContain('if (qualcosaDetto) return false')
            // Il segno si accende sul testo delle parziali, non su `onBeginningOfSpeech`.
            expect(sorgente, file).toMatch(
                /override fun onPartialResults[\s\S]{0,600}?qualcosaDetto = true/,
            )
            expect(sorgente, file).not.toMatch(
                /override fun onBeginningOfSpeech[\s\S]{0,200}?qualcosaDetto = true/,
            )
        }
    })

    /*
     * ⛔ E NON all'infinito: un microfono che si riapre da solo per sempre è la
     * cosa peggiore che questo codice possa fare. Ogni posto ha il suo tetto
     * dichiarato — la pazienza promessa dal plugin, la solitudine dell'orecchio.
     */
    it('⛔ la riapertura ha un TETTO, in tutti e due i posti', () => {
        const plugin = codice('android/app/src/main/java/ai/talos/agent/TalosDictationPlugin.kt')
        expect(plugin).toMatch(/aperto >= TALOS_ATTESA_INIZIO_MS\) return false/)

        const orecchio = codice('android/app/src/main/java/ai/talos/agent/TalosOrecchioAnticipato.kt')
        expect(orecchio).toMatch(/apertura >= SOLITUDINE_MS\) return false/)
    })

    /*
     * ⛔ Un errore DIVERSO dal silenzio sale intatto: il permesso negato, il
     * motore occupato, la rete. Inghiottirli sarebbe la sordità silenziosa che
     * questo progetto ha già pagato una volta.
     */
    it('⛔ solo il SILENZIO si riapre, gli altri errori salgono', () => {
        for (const file of [
            'android/app/src/main/java/ai/talos/agent/TalosOrecchioAnticipato.kt',
            'android/app/src/main/java/ai/talos/agent/TalosDictationPlugin.kt',
        ]) {
            expect(codice(file), file).toMatch(
                /errore != SpeechRecognizer\.ERROR_NO_MATCH[\s\S]{0,120}?ERROR_SPEECH_TIMEOUT[\s\S]{0,40}?return false/,
            )
        }
    })
})

describe('⛔ chi smette di ascoltare RESTITUISCE il microfono', () => {
    /*
     * ⛔⛔ LA SIMMETRIA ROTTA, ed è tutto il secondo difetto.
     *
     * `stop()` restituiva il microfono alla parola di attivazione, `cancel()`
     * no. E la barra chiama SEMPRE `cancel()`: i dieci secondi che scadono,
     * l'invio, il pulsante del microfono. Quindi dopo ogni ascolto la parola
     * restava ceduta fino alla scadenza della cessione — **45 secondi** di
     * TALOS sordo, con la barra a schermo e la notifica che diceva di aspettare.
     */
    it('⛔ TUTTI E DUE i modi di smettere lo restituiscono, non solo `stop`', () => {
        const plugin = codice('android/app/src/main/java/ai/talos/agent/TalosDictationPlugin.kt')

        expect(corpo(plugin, 'fun stop(call: PluginCall)'))
            .toContain('TalosParola.riprendi()')
        expect(corpo(plugin, 'fun cancel(call: PluginCall)'))
            .toContain('TalosParola.riprendi()')
    })

    /*
     * ⛔ E la cessione ha ancora la sua scadenza: è la rete sotto, per le strade
     * che smettono di ascoltare senza passare da qui. Toglierla curerebbe questo
     * difetto e rimetterebbe quello del 12 agosto — «hey TALOS funziona una
     * volta sola».
     */
    it('⛔ la scadenza della cessione resta: è la rete sotto', () => {
        const parola = codice('android/app/src/main/java/ai/talos/parola/TalosParola.kt')
        expect(parola).toContain('CESSIONE_MASSIMA_MS')
        expect(parola).toContain('postDelayed(riprendiDaSolo, CESSIONE_MASSIMA_MS)')
    })
})

describe('⛔ la parola sentita a barra APERTA fa ripartire l\'ascolto', () => {
    /*
     * ⛔⛔ `showSession` su una sessione GIÀ MOSTRATA non produce niente: nessun
     * intent nuovo, nessuna chiamata nuova per il lato web, nessun ascolto che
     * riparte. Da fuori la parola veniva sentita — stava scritto in logcat — e
     * non succedeva niente.
     */
    it('⛔ con la barra davanti si manda una CHIAMATA, non si richiede la sessione', () => {
        const parola = codice('android/app/src/main/java/ai/talos/parola/TalosParola.kt')
        const sentita = corpo(parola, 'private fun sentita(punteggio: Float)')

        // Si guarda se la barra è davanti...
        expect(sentita).toContain('TalosBarraActivity.eDavanti()')
        // ...e in quel caso NON si chiede la sessione, si passa allo startActivity.
        expect(sentita).toMatch(/if \(davanti\)[\s\S]{0,200}?false/)
        expect(sentita).toContain('apriComeAssistente()')
        expect(sentita).toContain('startActivity(')
    })

    /*
     * ⛔ La domanda è «è DAVANTI», non «esiste»: una barra viva ma coperta non
     * deve saltare la strada dell'assistente, che è l'unica che porta il
     * contesto dello schermo (`SHOW_WITH_ASSIST`).
     */
    it('⛔ «davanti» si accende e si spegne col ciclo di vita, non alla nascita', () => {
        const activity = codice('android/app/src/main/java/ai/talos/TalosBarraActivity.java')

        expect(activity).toMatch(/public void onResume\(\)[\s\S]{0,200}?viva = true;/)
        expect(activity).toMatch(/public void onPause\(\)[\s\S]{0,200}?viva = false;/)
        expect(activity).toContain('public static boolean eDavanti()')
    })

    /*
     * ⛔ E l'intent deve poter diventare una chiamata nuova: senza il timbro
     * dell'apertura il lato web lo scarterebbe come «ti mando un dato che
     * mancava», che è il comportamento opposto a quello che serve qui.
     */
    it('⛔ l\'intent che arriva a barra aperta viene TIMBRATO come apertura nuova', () => {
        const activity = codice('android/app/src/main/java/ai/talos/TalosBarraActivity.java')
        expect(activity).toMatch(/protected void onNewIntent\(Intent intent\)[\s\S]{0,200}?timbraLApertura\(\);/)
    })
})

/**
 * ⛔⛔ IL MICROFONO SI APRE PRIMA CHE L'ACTIVITY NASCA — owner 2026-08-15.
 *
 * > «possiamo anticipare ulteriormente (di poco) il delay tra apertura barra
 * > assistente e il punto da cui TALOS effettivamente ascolta e recepisce
 * > parole?»
 *
 * MISURATO sul Pad, t0 = `onShow`:
 *
 * ```
 *   PRIMA:  +99 ms microfono aperto   ...  +344 ms Soda start detection
 *   DOPO:   + 8 ms microfono aperto   ...  +175 ms Soda start detection
 * ```
 *
 * I 99 ms in testa non erano lavoro nostro: erano **il lancio dell'Activity**.
 * `accendi` stava in `TalosBarraActivity.onCreate` — il primo punto utile
 * DENTRO l'Activity, già prima di `super.onCreate` — ma l'Activity deve prima
 * nascere. La sessione vocale vive nello stesso processo, quindi da `onShow` si
 * arriva allo stesso microfono un lancio di Activity prima.
 *
 * ⛔ Le aperture misurate a 3-5 s NON sono questa strada: sono l'avvio a freddo
 * dopo un `force-stop`, dove il processo carica anche il modello della parola e
 * `TalosParola` deve cedere il microfono. Ad app viva sono 175 ms.
 */
describe("⛔ l'orecchio si apre PRIMA dell'Activity", () => {
    it("⛔ in onShow, `accendi` viene chiamato PRIMA di startActivity", () => {
        const assistente = codice("android/app/src/main/java/ai/talos/agent/TalosAssistente.kt")
        const dentro = assistente.slice(assistente.indexOf("override fun onShow("))
        const accendi = dentro.indexOf("TalosOrecchioAnticipato.accendi(")
        const lancia = dentro.indexOf("servizio.startActivity(apri)")

        expect(accendi, "onShow deve accendere l'orecchio").toBeGreaterThan(-1)
        expect(lancia).toBeGreaterThan(-1)
        expect(accendi, "accendere DOPO il lancio vale zero: il tempo e' proprio quello")
            .toBeLessThan(lancia)
    })

    /*
     * ⛔ Un microfono acceso perche' qualcuno ha aperto la barra per SCRIVERE e'
     * esattamente cio' che non si fa. La condizione e' la stessa che l'Activity
     * legge dall'indirizzo.
     */
    it("⛔ e SOLO quando quell'apertura vuole la voce", () => {
        const assistente = codice("android/app/src/main/java/ai/talos/agent/TalosAssistente.kt")
        const dentro = assistente.slice(assistente.indexOf("override fun onShow("))
        const riga = dentro.slice(0, dentro.indexOf("servizio.startActivity(apri)"))
        expect(riga).toContain('getQueryParameter("voce")')
    })

    /*
     * ⛔ NON si sposta: togliendola dall'Activity, l'anticipo sparirebbe per la
     * tendina e per il pallino, che non passano dalla sessione vocale.
     */
    it("⛔ e resta anche nell'Activity, per chi non passa dall'assistente", () => {
        const attivita = codice("android/app/src/main/java/ai/talos/TalosBarraActivity.java")
        expect(attivita).toContain("TalosOrecchioAnticipato.accendi(this)")
    })
})
