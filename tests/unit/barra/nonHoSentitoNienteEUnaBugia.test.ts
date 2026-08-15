import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * ⛔⛔⛔ «NON HO SENTITO NIENTE» DETTO SOPRA LA FRASE APPENA DETTA.
 *
 * ## Cosa si vedeva sul Pad, il 2026-08-14
 *
 * Chiamato l'assistente con «hey TALOS», detto «Raccontami in quattro frasi
 * come funziona la fotosintesi». Sullo schermo, **nello stesso istante**:
 *
 *   · la frase, scritta per intero nel campo;
 *   · sotto, «Non ho sentito niente. Tocca il microfono per riprovare.»
 *
 * E la domanda non è mai partita.
 *
 * ## Due danni da una causa sola
 *
 * Il conto dei dieci secondi risponde a «qualcuno ha detto la prima parola?»,
 * ma alla scadenza chiamava `fermaLAscolto` **senza guardare il campo**. E
 * `fermaLAscolto` mette `ascoltoVoluto` a falso — che è esattamente il flag che
 * la finestra di grazia controlla prima di spedire, concludendo «ha smesso lei,
 * non mando».
 *
 * ⇒ Non solo diceva una cosa falsa: **buttava via la frase che aveva in mano**.
 *
 * E il conto non ripartiva mai: era armato una volta all'apertura della barra.
 * Misurato — barra aperta alle 12:15:49, parlato dalle 12:15:55, motore chiuso
 * alle 12:15:58, conto scaduto alle 12:15:59. Chi ci pensa su sei secondi e poi
 * parla per quattro veniva tagliato.
 *
 * ⛔ Questo file guarda il SORGENTE, e non prova che sullo schermo succeda la
 * cosa giusta: quella prova sta nel giro sul dispositivo. Prova che le due
 * porte della scadenza non possano tornare a divergere — che è il modo in cui
 * il difetto era arrivato.
 */

const RADICE = resolve(__dirname, '../../..')
const BARRA = 'src/components/barra/TalosBarraRoot.vue'
const sorgente = readFileSync(resolve(RADICE, BARRA), 'utf8')

describe('⛔ «non ho sentito niente» si dice solo se non c\'è niente', () => {
    it('la bugia esce da UNA porta sola, e quella porta guarda il campo', () => {
        /*
         * ⭐ È l'asserzione che vale il file. Le porte della scadenza sono due
         * — il timer dei dieci secondi e il controllo dentro `riapriSePossibile`
         * — e prima dicevano la stessa frase da due posti diversi. Due copie di
         * una decisione sono due decisioni che un giorno divergono: qui era
         * anche peggio, divergevano già dal campo di testo.
         */
        const quante = sorgente.match(/t\('barra\.nessunaVoce'\)/g)?.length ?? 0
        expect(quante).toBe(1)

        // E l'unica sta dentro `scadutaLAttesa`, dopo il controllo sulla bozza.
        const funzione = sorgente.match(
            /function scadutaLAttesa\(dove: string\): void \{[\s\S]*?\n\}/,
        )?.[0]
        expect(funzione).toBeTruthy()
        expect(funzione).toContain("if (!bozza.value.trim())")
        expect(funzione).toContain("t('barra.nessunaVoce')")
    })

    it('⛔ con la frase in mano NON si butta via: si manda', () => {
        const funzione = sorgente.match(
            /function scadutaLAttesa\(dove: string\): void \{[\s\S]*?\n\}/,
        )?.[0] ?? ''

        expect(funzione).toContain('void invia()')
        // Senza messaggio: la persona ha parlato, dirle il contrario è la bugia.
        expect(funzione).toContain('fermaLAscolto(null)')

        /*
         * ⛔⛔ E L'ORDINE È PARTE DELLA CURA, non uno stile.
         *
         * `fermaLAscolto` mette `ascoltoVoluto` a falso. Se la grazia fosse
         * ancora armata, scatterebbe dopo, troverebbe quel flag falso e
         * deciderebbe di non mandare — cioè lo stesso difetto, un attimo più
         * tardi e più difficile da vedere.
         */
        const dovAnnulla = funzione.indexOf('annullaLaGrazia')
        const dovFerma = funzione.indexOf('fermaLAscolto(null)')
        expect(dovAnnulla).toBeGreaterThan(-1)
        expect(dovAnnulla).toBeLessThan(dovFerma)
    })

    it('entrambe le porte della scadenza passano di lì', () => {
        // Il timer dei dieci secondi.
        expect(sorgente).toMatch(/timerAscolto = null\s*\n\s*scadutaLAttesa\('i dieci secondi'\)/)
        // E il controllo dentro la ripresa.
        expect(sorgente).toMatch(/if \(Date\.now\(\) >= scadenzaAscolto\) \{[\s\S]{0,900}?scadutaLAttesa\(motivo\)/)
    })

    it('⭐ la prima parola fa RIPARTIRE il conto, e non lo cancella', () => {
        const guardia = sorgente.match(
            /watch\(\s*\(\) => bozza\.value\.trim\(\)\.length > 0,[\s\S]*?\n\)/,
        )?.[0]
        expect(guardia).toBeTruthy()
        // Solo sul fronte di salita: mentre si parla la bozza cambia a ogni
        // parola, e riarmare a ogni parola sarebbe un microfono senza scadenza.
        expect(guardia).toContain('avevaParole === true')
        expect(guardia).toContain('scadenzaAscolto = Date.now() + ATTESA_MS')
        /*
         * ⛔ Riparte, NON sparisce. Un microfono senza scadenza resta aperto
         * finché non se ne accorge qualcuno, ed è la cosa che questa barra non
         * deve fare mai — vale più della comodità che toglierebbe.
         */
        expect(guardia).toContain('scadutaLAttesa(')
        expect(guardia).not.toMatch(/Infinity|Number\.MAX/)
    })
})

/**
 * ⛔⛔⛔ LE SCHEDE NELL'ASSISTENTE — dove non sono mai state.
 *
 * Owner 2026-08-14, con lo schermo: «Accendi la torcia» → «Fatto, Antonino! Ho
 * acceso la torcia del telefono. 🔦», e nient'altro. In chat sotto quella frase
 * c'è un interruttore con cui la spegni; nell'assistente c'era solo il testo.
 *
 * Non mancava «la scheda della torcia»: mancavano **tutte**, calendario
 * compreso, perché `TalosMobileSchedaAzione` non era mai stata montata in
 * questa superficie. ⇒ Chi usa TALOS a voce — cioè il modo per cui
 * l'assistente esiste — non ne ha mai vista una.
 *
 * La richiesta dell'owner del 13 agosto era «sia da chat che da assistente»:
 * era rimasta metà, e nessun test se ne accorgeva perché nessuno guardava
 * questa superficie.
 */
describe('⛔ l\'assistente mostra le schede, non solo il testo', () => {
    it("la barra MONTA la scheda d'azione", () => {
        expect(sorgente).toContain("import('@/components/chat/TalosMobileSchedaAzione.vue')")
        expect(sorgente).toContain('<TalosMobileSchedaAzione')
    })

    /*
     * ⛔ IL PONTE SI È SPOSTATO, e questo cancello l'ha seguito — 2026-08-14.
     *
     * Prima la barra passava `:commuta-comando` come `prop`, e lo stesso faceva
     * la lista dei messaggi: due copie della stessa funzione in due file che
     * vivono nel **grafo d'avvio**, cioè 311 byte pagati da chi apre TALOS senza
     * aver mai visto una scheda. Adesso li chiama la scheda, che è pigra.
     *
     * ⛔ Il fatto difeso non è cambiato di una virgola — «il tocco parla col
     * ponte, non fa un giro dal modello» — è cambiato DOVE vive. Un cancello che
     * resta puntato sul vecchio posto non difende più niente e diventa rosso per
     * il motivo sbagliato.
     */
    it('⛔ e il tocco chiama il PONTE, non fa un giro dal modello', () => {
        const scheda = readFileSync(
            resolve(RADICE, 'src/components/chat/TalosMobileSchedaAzione.vue'),
            'utf8',
        )
        expect(scheda).toContain("import('@/lib/tools/schedaComandi')")
        expect(scheda).toContain('talosCommutaDaScheda(tool, acceso)')
        // ⛔ E la barra NON se lo ricopia: due posti che fanno la stessa cosa
        // sono due posti che un giorno divergono.
        expect(sorgente).not.toContain('talosCommutaDaScheda')
    })

    /**
     * ⭐⭐ LA SCIA — le parole mentre le sente.
     *
     * Owner 2026-08-14: «stampare le parole mano mano che vengono sentite; in
     * chat lo facciamo già, basta trasportarla sull'assistente, sopra la barra,
     * animata in scorrimento orizzontale».
     *
     * ⛔ In chat le parole si vedono perché finiscono nel campo di testo. Qui il
     * campo è `v-show="!ascolta"` — **mentre ascolta è nascosto** — quindi chi
     * parlava non aveva nessun segno di essere capito, solo una pillola che
     * pulsa. Da fuori, «ti sto seguendo» e «non ho sentito niente» erano la
     * stessa immagine.
     */
    it('⭐ la scia mostra la BOZZA mentre ascolta, e non una copia', () => {
        expect(sorgente).toContain('const scia = computed(() => bozza.value.trim())')
        expect(sorgente).toMatch(/v-if="ascolta && scia"/)
        /*
         * ⛔ Una copia del testo vorrebbe dire due verità su cosa TALOS ha
         * capito, e quando divergono nessuno sa quale guardare. La scia LEGGE
         * la bozza, non la duplica.
         */
        expect(sorgente).not.toMatch(/const testoSentito = ref\(/)
    })

    it('⛔ scorre su UNA riga, e la coda resta sull’ultima parola', () => {
        /*
         * ⛔⛔ 2026-08-14: LA SCIA È DIVENTATA UN COMPONENTE, e questo presidio
         * l'ha seguita. Owner, guardando la chat: «un testo che non va sopra e
         * con la stessa animazione, allinearlo alla versione assistente, non ha
         * senso usare componenti diversi».
         *
         * Prima l'assistente aveva la sua riga scorrevole scritta a mano e la
         * chat un blocco che andava a capo. ⇒ Il disegno vive in
         * `TalosSciaParole`, e il presidio guarda lì.
         */
        const scia = readFileSync(
            resolve(RADICE, 'src/components/brand/TalosSciaParole.vue'), 'utf8',
        )
        // A capo, la scia crescerebbe verso l'alto e spingerebbe l'oggetto che
        // la persona sta guardando — la pillola, o i comandi della dettatura.
        expect(scia).toMatch(/\.talos-scia \{[\s\S]*?white-space: nowrap;/)
        /*
         * ⛔ Lo scorrimento lo fa il DOM sul testo VERO, non un'animazione a
         * durata fissa: quante parole arrivino non lo sa nessuno prima, e una
         * durata fissa andrebbe fuori sincrono alla seconda frase.
         */
        expect(scia).toContain('elemento.scrollLeft = elemento.scrollWidth')
        // `inline-block`, se no `scrollWidth` è quella del contenitore e la coda
        // non si aggancia mai.
        expect(scia).toMatch(/\.talos-scia-testo \{[\s\S]*?display: inline-block;/)
    })

    /**
     * ⛔⛔ E LE DUE SUPERFICI USANO LA STESSA, non una copia per uno.
     *
     * È la divergenza il difetto, non il disegno: la chat e l'assistente
     * mostravano le stesse parole in due modi, e nessuno se n'era accorto
     * finché l'owner non ha guardato la chat dopo aver visto l'assistente.
     */
    it('⭐ chat e assistente montano LO STESSO componente', () => {
        const chat = readFileSync(
            resolve(RADICE, 'src/components/chat/TalosMobileDictationBar.vue'), 'utf8',
        )
        for (const superficie of [sorgente, chat]) {
            expect(superficie).toContain("@/components/brand/TalosSciaParole.vue")
            expect(superficie).toContain('<TalosSciaParole')
        }
        // ⛔ E nessuna delle due si riscrive il testo a capo: era la forma
        // vecchia della chat, un blocco che cresceva verso l'alto.
        expect(chat).not.toMatch(/max-h-16 overflow-y-auto/)
    })

    /**
     * ⭐⭐ LE FONTI NELL'ASSISTENTE — e la cura sbagliata che ho tolto.
     *
     * MISURATO sul Pad il 2026-08-14: «cerca sul web quanto è alta la torre
     * Eiffel» dall'assistente ⇒ risposta completa e **nessuna fonte**. Nella
     * chat, sotto la stessa risposta, c'è il chip «Fonti» col suo pannello.
     *
     * ⛔ Per un attimo l'avevo curato facendo una scheda `fonti` NUOVA: sullo
     * schermo le fonti comparivano **due volte**, in due forme diverse. E il
     * chip esistente è anche migliore — legge le favicon **da disco**, mai
     * richieste alla rete (una promessa di privacy, non un'ottimizzazione) e
     * apre nel browser interno; la mia scheda apriva una scheda esterna.
     *
     * ⇒ Il difetto non era «manca una scheda»: era «il chip vive in una
     * superficie sola».
     */
    it('⭐ le fonti usano il CHIP della chat, non una seconda forma', () => {
        expect(sorgente).toContain("@/components/chat/TalosMobileSourcesChip.vue")
        expect(sorgente).toContain('<TalosMobileSourcesChip')
        /*
         * ⛔ E non deve rinascere una scheda `fonti`: due disegni per lo stesso
         * dato sono due decisioni che un giorno divergono — qui erano già
         * divergenti nell'ora in cui sono nate.
         */
        const tipi = readFileSync(
            resolve(RADICE, 'src/lib/tools/tracciaAzione.ts'), 'utf8',
        )
        expect(tipi).not.toMatch(/readonly tipo: 'fonti'/)
    })

    it('⭐ le schede sono quelle dell\'ULTIMA risposta, e si fermano al turno', () => {
        /*
         * ⛔ Il ciclo sta in `metadatiDellaRisposta`, non più in
         * `schedeDellaRisposta`: da lì leggono ORA due cose — le schede e le
         * fonti — e duplicarlo avrebbe voluto dire due modi di trovare
         * «l'ultima risposta» che un giorno rispondono diverso.
         */
        const calcolo = sorgente.match(
            /const metadatiDellaRisposta = computed[\s\S]*?\n\}\)/,
        )?.[0]
        expect(calcolo).toBeTruthy()
        /*
         * ⛔ Si scorre all'indietro e ci si FERMA sul messaggio dell'utente: le
         * schede di una domanda precedente sopra la risposta di adesso sarebbero
         * comandi che parlano di un altro momento.
         */
        expect(calcolo).toContain("messaggio?.role === 'user'")
        expect(calcolo).toContain('return null')
        // E niente durante lo streaming: una levetta a metà risposta è una
        // levetta su un fatto che potrebbe ancora cambiare.
        expect(calcolo).not.toContain('streamingText')
    })
})
