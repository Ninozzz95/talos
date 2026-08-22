import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { talosModoBarraDa } from '@/lib/barra/modoBarra'

/**
 * ⛔⛔ UNA APERTURA, UN ASCOLTO — il difetto del 12 agosto, a quattro livelli.
 *
 * ## Cosa vedeva l'owner
 *
 * «Col gesto mi dice *speech recognition failed* anche se mi rileva qualche
 * parola; ma da assistente aperto, se premo il pulsante, funziona bene.»
 *
 * ## Cosa diceva la macchina — la catena, con le righe vere
 *
 *     47.601  START … TalosBarraActivity … result code=0   ← il gesto la apre
 *     47.629  START … TalosBarraActivity … result code=3   ← e la riapre, 28 ms dopo
 *     48.205  web: avvio:casa                              ← due avvii...
 *     48.205  web: avvio:casa                              ← ...nello stesso ms
 *     48.207  anticipato: consegno il motore caldo
 *     48.211  errore=CLIENT (5) a +321388049 ms            ← di una sessione MAI aperta
 *     48.212  web: dett: onError recognitionFailed         ← il messaggio a schermo
 *     48.255  pronto epoca=2
 *     48.497  pronto epoca=2                               ← il motore parte DUE volte
 *
 * Il `+321388049 ms` è il tempo dall'accensione del dispositivo: quell'ascoltatore
 * non aveva mai ricevuto `onReadyForSpeech`, quindi la sua origine valeva zero.
 * L'errore veniva da un'altra sessione — quella annullata dalla consegna del
 * motore caldo.
 *
 * ## Perché quattro presidi e non uno
 *
 * Il difetto non ha un colpevole: ha una catena, e ogni anello da solo era
 * innocuo. Curarne uno solo lo farebbe tornare dalla prima porta nuova che
 * qualcuno aggiunge. Ogni prova qui sotto difende un anello, e dice quale.
 */

const RADICE = resolve(__dirname, '../../..')
const leggi = (f: string): string => readFileSync(resolve(RADICE, f), 'utf8')

describe('⛔ una apertura dell\'assistente apre UN solo ascolto', () => {
    it('1. chi apre DICHIARA l\'apertura, e i due intent del gesto la condividono', () => {
        const assistente = leggi(
            'android/app/src/main/java/ai/talos/agent/TalosAssistente.kt',
        )

        // Il timbro nasce una volta per sessione mostrata...
        expect(assistente).toContain('apertura = android.os.SystemClock.uptimeMillis()')
        // ...e finisce su OGNI intent costruito da quella sessione, compreso il
        // secondo — quello che esiste solo per consegnare il conteggio dei nodi.
        expect(assistente).toContain('"&apertura=$apertura"')
        /*
         * ⛔ La forma del difetto: se il timbro tornasse dentro `intentDellaBarra`
         * invece che nel campo della sessione, i due intent avrebbero di nuovo due
         * valori diversi e la catena ripartirebbe identica.
         */
        expect(assistente).not.toMatch(
            /fun intentDellaBarra[\s\S]{0,400}?uptimeMillis\(\)/,
        )
    })

    it('2. l\'imbuto non SOVRASCRIVE un\'apertura già dichiarata', () => {
        const activity = leggi('android/app/src/main/java/ai/talos/TalosBarraActivity.java')

        // Il timbro resta per le porte che non dichiarano niente — pallino,
        // tendina, cuffie, parola di attivazione...
        expect(activity).toContain('appendQueryParameter("apertura"')
        // ...ma chi ha già parlato ha ragione lui.
        expect(activity).toContain('if (vecchio.getQueryParameter("apertura") != null) return;')
    })

    it('3. il RESPIRO è del motore, non di chi lo chiede', () => {
        const plugin = leggi(
            'android/app/src/main/java/ai/talos/agent/TalosDictationPlugin.kt',
        )

        expect(plugin).toContain('private fun respiroDovuto(): Long')
        expect(plugin).toContain('sessioneInterrottaA = android.os.SystemClock.uptimeMillis()')
        expect(plugin).toContain('val respiro = respiroDovuto()')
        /*
         * ⛔⛔ La riga che il difetto aveva: il respiro legato alla CHIAMATA. Il
         * secondo avvio trovava `motore != null`, concludeva «a me non l'ha
         * consegnato nessuno» e partiva subito, dichiarandosi nato proprio
         * nell'istante in cui l'errore della sessione morente era in volo.
         */
        // ⛔ Si mira al CODICE, non alla prosa: il nome vecchio resta nel commento
        // qui sopra, che racconta la causa — e deve restarci.
        expect(plugin).not.toMatch(/var appenaConsegnato/)
        expect(plugin).not.toMatch(/if \(appenaConsegnato\)/)
        // E non si annulla due volte a un millisecondo di distanza.
        expect(plugin).toContain('if (respiro == 0L) runCatching { riconoscitore.cancel() }')
    })

    it('3-bis. una partenza rimandata si ANNULLA se ne arriva un\'altra', () => {
        const plugin = leggi(
            'android/app/src/main/java/ai/talos/agent/TalosDictationPlugin.kt',
        )

        // I due `pronto epoca=2` a 48.255 e 48.497: la partenza rimandata del
        // primo avvio scattava lo stesso e riapriva il motore del secondo.
        expect(plugin).toContain('partenzaInAttesa?.let { mano.removeCallbacks(it) }')
        // ⛔ E anche se scattasse lo stesso — `removeCallbacks` può perdere una
        // corsa — non deve far partire niente sotto l'epoca di un altro.
        expect(plugin).toMatch(/val parti = Runnable \{[\s\S]{0,400}?if \(mia != epoca\)/)
        // ⛔ E la promessa del lato web si scioglie: appesa, bloccherebbe
        // `engine.start()` fino al cane da guardia degli 8 secondi.
        expect(plugin).toContain('chiamataInAttesa?.resolve(')
    })

    it('2-bis. l\'indirizzo CONSEGNA il timbro, e il lancio lo semina', () => {
        // ⭐ La prova vera, non una grep: la funzione pura che legge l'indirizzo.
        expect(talosModoBarraDa('talos://barra?voce=1&nodi=3&apertura=999')?.apertura)
            .toBe('999')
        // Un indirizzo senza timbro non ne inventa uno: `null` significa
        // «nessuno ha dichiarato niente», ed è diverso da un timbro qualunque.
        expect(talosModoBarraDa('talos://barra?voce=1')?.apertura).toBeNull()
        // I due intent dello stesso gesto portano lo STESSO timbro anche se il
        // contesto è cambiato: è esattamente il caso che contava due chiamate.
        const primo = talosModoBarraDa('talos://barra?voce=1&nodi=0&apertura=42')
        const secondo = talosModoBarraDa('talos://barra?voce=1&nodi=403&apertura=42')
        expect(primo?.apertura).toBe(secondo?.apertura)
        expect(primo?.contesto.nodi).not.toBe(secondo?.contesto.nodi)

        /*
         * ⛔ E il seme: partendo da `null`, la PRIMA consegna di `appUrlOpen` non
         * aveva niente con cui confrontarsi e contava sempre una chiamata in più
         * — «chiamata nuova (2)» su una apertura sola, misurato il 12 agosto.
         */
        const avvia = leggi('src/lib/barra/avvia.ts')
        expect(avvia).toContain('let ultimaApertura: string | null = letto.apertura')
        // Un solo lettore dell'indirizzo: la vecchia copia locale non c'è più.
        expect(avvia).not.toContain('function timbroDi')
    })

    it('4. «voglio ascoltare» non si dice con un verbo che vuol dire anche «smetti»', () => {
        const barra = leggi('src/components/barra/TalosBarraRoot.vue')

        expect(barra).toContain('function vogliAscoltare(motivo: string): void')
        // Le due porte d'apertura passano di lì — e nessuna delle due chiama più
        // `toggle()` a mano, che sull'ascolto già partito SPEGNE.
        expect(barra).toContain("vogliAscoltare('apertura della barra')")
        expect(barra).toContain('const motivo = props.modo.bargeIn')
        expect(barra).toContain('`chiamata nuova (${props.modo.chiamata})`')
        expect(barra).toContain('vogliAscoltare(motivo)')
        expect(barra).not.toContain("annota('barra: toggle da onMounted')")
        expect(barra).not.toContain("annota('barra: toggle dalla CHIAMATA')")
    })

    it('5. un guasto ha un CODICE: «error» senza codice è una ripartenza', () => {
        const barra = leggi('src/components/barra/TalosBarraRoot.vue')

        /*
         * MISURATO il 12 agosto, a OGNI riapertura dopo una pausa:
         *
         *     barra: stato=error codice=- voluto=true
         *     barra: guasto vero (-), lo dico e smetto
         *     barra: stato=starting codice=- voluto=false   ← intenzione morta
         *
         * `start()` azzera il codice prima di mettere lo stato a `starting`, e in
         * mezzo ci sono due attese vere. Chi guarda lo stato senza il codice
         * legge un guasto dove c'è una ripartenza — e spegne la conversazione al
         * primo silenzio.
         */
        expect(barra).toContain('if (codice === null) {')
        expect(barra).toContain("barra: error senza codice = sto ripartendo, non è un guasto")
        // ⛔ E l'ordine conta: il controllo del codice nullo deve venire PRIMA
        // del ramo che dichiara il guasto, o non serve a niente.
        const nullo = barra.indexOf('if (codice === null)')
        const guasto = barra.indexOf("if (codice !== 'noSpeech')")
        expect(nullo).toBeGreaterThan(-1)
        expect(guasto).toBeGreaterThan(nullo)
    })
})

/**
 * ⭐⭐ L'ASCOLTO COMINCIA PRIMA, E FINISCE DICENDOLO — owner 2026-08-12.
 *
 * Due richieste nella stessa giornata, e sono i due capi dello stesso arco:
 * «vorrei che l'assistente ascoltasse da prima, adesso c'è un leggerissimo
 * delay» e «metti in ascolto TALOS per un massimo di 10 secondi come fa Gemini,
 * prima di dire che il messaggio non è arrivato».
 */
describe('⭐ l\'ascolto comincia prima e finisce dicendolo', () => {
    it('la sessione già aperta si ADOTTA invece di ucciderla', () => {
        const plugin = leggi(
            'android/app/src/main/java/ai/talos/agent/TalosDictationPlugin.kt',
        )

        /*
         * MISURATO il 12 agosto: il microfono era vivo a +507 ms, lo uccidevamo a
         * +764 e tornava a +1037. Mezzo secondo di sordità piazzato dove la
         * persona comincia a parlare.
         */
        expect(plugin).toContain('TalosOrecchioAnticipato.collega { evento -> inoltra(evento, mia) }')
        /*
         * ⛔ Ma solo se la richiesta è la STESSA, e il confronto passa da una
         * FIRMA e non da un elenco di campi scritto a mano: MISURATO il 12
         * agosto, l'adozione non scattava mai perché la barra chiede anche
         * `allowedLanguages` e l'orecchio partiva senza. Un confronto campo per
         * campo dimentica il campo aggiunto domani, e dimenticarlo vuol dire
         * adottare in silenzio una sessione che ascolta in un altro modo.
         */
        expect(plugin).toContain('internal fun talosFirmaRichiesta(')
        expect(plugin).toContain('TalosOrecchioAnticipato.firma == firma')

        const orecchio = leggi(
            'android/app/src/main/java/ai/talos/agent/TalosOrecchioAnticipato.kt',
        )
        // ⛔ E l'orecchio non INDOVINA la richiesta — nasce prima della WebView e
        // non può chiedere niente a nessuno. La RICORDA.
        expect(orecchio).toContain('.getString("firma", null)')
        // ⛔ E la ridichiara da ciò che usa davvero: copiare la firma letta
        // significherebbe dichiarare una cosa e ascoltarne un'altra se il ricordo
        // fosse malformato.
        expect(orecchio).toContain(
            'firma = talosFirmaRichiesta(lingua, automatica, consentite, parziali, offline, silenzio, minimo)',
        )
        /*
         * ⛔ E la conseguenza che si dimentica: adottando, `motore` resta null
         * proprio quando il microfono è aperto. Un `cancel` che annulla solo il
         * nostro motore lascerebbe il microfono acceso dopo che la persona ha
         * premuto per fermare — lo stesso difetto che `stop()` aveva già pagato.
         */
        expect(plugin).toMatch(
            /fun cancel\(call: PluginCall\)[\s\S]{0,1800}?TalosOrecchioAnticipato\.spegni\(\)/,
        )
    })

    it('dieci secondi, e allo scadere lo DICE', () => {
        const barra = leggi('src/components/barra/TalosBarraRoot.vue')
        const it = leggi('src/i18n/locales/it.ts')
        const en = leggi('src/i18n/locales/en.ts')

        expect(barra).toContain('const ATTESA_MS = 10_000')
        /*
         * ⛔⛔ E DEVE ESSERE UN TIMER. MISURATO sul Pad: aperto l'assistente e
         * stando zitto, il motore ha smesso di riferire QUALUNQUE cosa e il
         * diario si è fermato su `stato=listening` per diciassette secondi,
         * mentre lo schermo continuava a dire «Ti ascolto». La scadenza c'era già
         * e non serviva a niente: la leggeva solo chi reagiva a un evento del
         * motore — cioè proprio la cosa che aveva smesso di parlare.
         */
        expect(barra).toMatch(/timerAscolto = setTimeout\([\s\S]{0,320}?\}, ATTESA_MS\)/)
        expect(barra).toContain("fermaLAscolto(t('barra.nessunaVoce'))")
        // ⛔ E fermare vuol dire anche CHIUDERE il microfono, non solo smettere
        // di volerlo: è la metà che si dimentica ogni volta.
        expect(barra).toMatch(/function fermaLAscolto[\s\S]{0,400}?dettatura\.cancel\(\)/)
        // ⛔ Chi parla non si taglia a metà frase allo scadere.
        expect(barra).toMatch(/onTranscript: \(testo\) => \{[\s\S]{0,800}?clearTimeout\(timerAscolto\)/)
        expect(it).toContain('nessunaVoce:')
        expect(en).toContain('nessunaVoce:')
        // ⛔ E NON è la pausa di fine frase: quella vive nel nativo e vale 2.200 ms.
        expect(barra).not.toContain('const ATTESA_MS = 30_000')
    })
})

/**
 * ⭐⭐ LO STRUMENTO — «un difetto riproducibile si fa raccontare dalla macchina».
 *
 * Queste prove non difendono un comportamento: difendono la capacità di
 * DIAGNOSTICARE. Il 12 agosto la diagnosi è costata una corsa sola invece di una
 * giornata, e solo perché il log conteneva i pezzi giusti. Chi togliesse queste
 * righe per "pulizia" rimetterebbe il prossimo difetto di questa famiglia al
 * buio in cui è stato per giorni.
 */
describe('⭐ lo strumento: ogni evento scartato lascia una riga', () => {
    it('il plugin scrive PRIMA del guardiano, col verdetto e con «ORFANO»', () => {
        const plugin = leggi(
            'android/app/src/main/java/ai/talos/agent/TalosDictationPlugin.kt',
        )

        expect(plugin).toContain('private fun eco(')
        // Il verdetto del guardiano, esplicito: senza, uno scarto e una consegna
        // sono indistinguibili dal di fuori — ed è dove vive questa famiglia.
        expect(plugin).toContain('${if (viva()) "PRESA" else "SCARTATA"}')
        /*
         * ⛔ `ORFANO` nomina la firma del difetto: un evento arrivato a un
         * ascoltatore che non ha mai visto `onReadyForSpeech`. Prima quella firma
         * c'era già, travestita da numero assurdo (`+321388049 ms`), e per
         * leggerla bisognava accorgersi che il numero era troppo grande.
         */
        expect(plugin).toContain('"ORFANO"')
        // L'errore si annota prima di decidere se è nostro.
        expect(plugin).toMatch(/override fun onError\(error: Int\) \{\s*\n\s*eco\("errore"/)
    })

    it('l\'orecchio anticipato non è più muto sui suoi errori', () => {
        const orecchio = leggi(
            'android/app/src/main/java/ai/talos/agent/TalosOrecchioAnticipato.kt',
        )

        // Fino al 12 agosto registrava solo «pronto» e «PARLA»: l'errore che ha
        // morso quel giorno nasce QUI e usciva muto.
        expect(orecchio).toMatch(/override fun onError\(error: Int\) \{\s*\n\s*eco\("errore"/)
        expect(orecchio).toContain('${if (viva()) "PRESA" else "SCARTATA"}')
    })

    it('il diario del lato web porta la PROPRIA ora, non quella di consegna', () => {
        const dettatura = leggi('src/services/dictation.ts')
        /*
         * ⛔ La riga si è SPOSTATA, e la prova l'ha seguita — 2026-08-13.
         *
         * Il canale verso `logcat` viveva dentro il servizio della dettatura.
         * Da quando anche il pilota dello schermo deve raccontare dove si
         * ferma, ha due utenti e vive in `traccia.ts`: due copie sarebbero due
         * comportamenti che divergono alla prima modifica.
         *
         * ⇒ Il vincolo NON cambia — l'ora si prende dove il fatto succede e
         * viaggia con lui — cambia solo il file che lo deve rispettare. E si
         * controlla ANCHE che la dettatura la passi, perché un canale corretto
         * chiamato senza ora tornerebbe a stampare l'ora di consegna.
         */
        const traccia = leggi('src/lib/device/traccia.ts')

        /*
         * ⛔ Capacitor esegue tutti i plugin su un thread solo: l'ora che si legge
         * in `logcat` è quella in cui il ponte ha smaltito la coda. Misurato il 12
         * agosto: «toggle da onMounted» compariva 1,4 s DOPO righe che nel codice
         * le vengono dopo. Una traccia che riordina gli eventi fa dedurre le cause
         * a rovescio — è peggio di nessuna traccia.
         */
        expect(traccia).toContain('traccia?.({ testo: `[${ora}] ${evento}` })')
        expect(dettatura).toContain('talosTracciaFuori(evento, ora)')
    })
})

/**
 * ⭐⭐ L'ONDA È MISURATA, NON ANIMATA — owner 2026-08-12.
 *
 * «Quando parli con Gemini non fa vedere il testo scritto ma fa vedere solo una
 * wave che reagisce al suono», e poi la precisazione che è il punto: quella di
 * Gemini **reagisce in base al volume**.
 *
 * ⛔ Prima, da noi, erano tre barre con `animation: barra-livello 900ms
 * infinite` — cioè un disegno che si muoveva uguale in una stanza vuota e
 * mentre urli — e il `level` del composable era calcolato da quanto cresceva il
 * TESTO trascritto. Un assistente vocale che finge di sentirti è la bugia più
 * facile da raccontare e la più difficile da smentire guardando lo schermo.
 */
describe('⭐ la waveform viene dal VOLUME, non da un ciclo CSS', () => {
    it('il nativo manda il dB GREZZO, e non ne inventa la scala', () => {
        const plugin = leggi(
            'android/app/src/main/java/ai/talos/agent/TalosDictationPlugin.kt',
        )

        expect(plugin).toContain('notifyListeners("talosDictationLevel", JSObject().put("db", piccoPonte))')
        // ⛔ 80 ms, non 30 al secondo: il commento in `onRmsChanged` diceva già
        // perché non si manda tutto, e quel vincolo resta valido.
        expect(plugin).toContain('if (ora - ultimoPonte >= 80L)')
        // ⛔ E nessun fondo scala scritto qui: la scala di `onRmsChanged` non è
        // dichiarata da Android e cambia col dispositivo.
        expect(plugin).not.toMatch(/put\("db",\s*\(?piccoPonte\s*[+\-/*]/)
    })

    it('il ponte lo consegna e il composable lo normalizza su ciò che SENTE', () => {
        const casa = leggi('src/services/dictationCasa.ts')
        const composable = leggi('src/composables/useTalosMobileDictation.ts')

        expect(casa).toContain("addListener('talosDictationLevel'")
        expect(composable).toContain('function realLevel(db: number): void')
        // La finestra si adatta: minimo e massimo VISTI, non due numeri scelti.
        /*
         * ⛔ La scala parte dai bordi EMPIRICI di `Cleveroad/WaveInApp` e può solo
         * ALLARGARSI. Una finestra tutta adattiva si tara sul primo campione, e
         * il riconoscitore apre a 7 dB — misurato: la stanza muta finiva a 0,077,
         * cioè una linea punteggiata.
         */
        expect(composable).toContain('const DB_MUTO = -2.12')
        expect(composable).toContain('const DB_PIENO = 10')
        expect(composable).toContain('if (db < dbMin) dbMin = db')
        /*
         * ⛔ I due bordi rispondono a due domande diverse: il FONDO è il
         * silenzio della stanza (si allarga in giù e non risale mai), il TETTO
         * è quanto forte parli TU (scende piano verso i picchi veri, come il
         * guadagno automatico di un misuratore). Coi bordi fissi una voce
         * normale a 5-7 dB si fermava a 0,59: il fondo scala era quello di un
         * urlo — owner 2026-08-12, «la waveform non è alta come prima».
         */
        expect(composable).toContain('const sceso = dbMax - (dbMax - dbMin) * 0.006')
        expect(composable).toContain('dbMax = Math.max(sceso, dbMin + ESCURSIONE_MINIMA)')
        /*
         * ⛔ `ESCURSIONE_MINIMA` è tornata, ma con un MESTIERE DIVERSO: prima
         * puntellava una finestra tutta adattiva che si tarava sul primo
         * campione; adesso impedisce solo che il tetto, scendendo verso la tua
         * voce, arrivi a schiacciarsi sul silenzio — cioè che un respiro
         * diventi barra piena. Il fondo scala di partenza resta empirico.
         */
        expect(composable).toContain('const ESCURSIONE_MINIMA = 4')
        expect(composable).toContain('let dbMin = DB_MUTO')
        // ⛔ E non si eredita fra sessioni: stanza diversa, fondo diverso.
        expect(composable).toMatch(/function stopLevel[\s\S]{0,400}?dbMin = DB_MUTO/)
        // ⛔ Il ripiego dal testo resta solo dove il volume non esiste (web).
        expect(composable).toMatch(/function speechLevelSpike[\s\S]{0,320}?if \(volumeVero\) return/)
    })

    it('lo schermo: barre alte quanto il volume, e nessuna animazione a ciclo', () => {
        const barra = leggi('src/components/barra/TalosBarraRoot.vue')
        const onda = leggi('src/components/brand/TalosMicWaveform.vue')

        /*
         * ⛔⛔ 2026-08-14: LA CODA È USCITA DALLA BARRA, e questo presidio l'ha
         * seguita. Owner: «la versione chat ha la wave vecchia che non reagisce
         * al suono… non ha senso usare componenti diversi».
         *
         * Prima le ventotto barre erano disegnate dentro `TalosBarraRoot` e la
         * chat usava un `TalosMicWaveform` che spalmava UN livello su una
         * sagoma fissa — tutte le barre insieme, più un respiro CSS che pulsava
         * anche in silenzio. Due componenti per la stessa cosa, già divergenti
         * il giorno in cui sono nati.
         *
         * ⇒ La storia del volume vive nel componente condiviso, e il presidio
         * guarda LÌ. E in più pretende che nessuna delle due superfici se ne
         * riscriva una copia: è la divergenza, non il disegno, il difetto.
         */
        expect(onda).toContain('storia.value.slice(1)')
        expect(onda).toContain('const PASSO_MS = 80')
        // ⛔ La firma del difetto vecchio: un'animazione infinita sulle barre,
        // che si muoveva anche quando non stava sentendo niente.
        // ⛔ Si guarda l'USO, non la parola: il commento nel componente cita
        // l'animazione vecchia come esempio del difetto, ed è giusto che ci sia.
        expect(onda).not.toMatch(/@keyframes\s+talosMicBreath/)
        expect(onda).not.toMatch(/animation:\s*talosMicBreath/)
        expect(onda).not.toMatch(/animation:[^;]*infinite/)
        expect(barra).not.toContain('animation: barra-livello')
        expect(barra).not.toContain('@keyframes barra-livello')
        /*
         * ⛔ E la barra NON tiene più un campionatore suo: se lo rifacesse,
         * tornerebbero due code che possono divergere — e con esse il difetto
         * dell'onda piatta nell'assistente, che era costato due build cercate
         * nel nativo.
         */
        expect(barra).not.toMatch(/setInterval\([\s\S]{0,120}?80\)/)
        expect(barra).toContain('<TalosMicWaveform :level="dettatura.level.value" />')
        // Mentre parli si vede l'onda, non il testo che si riscrive da solo.
        expect(barra).toMatch(/<button\s+v-if="ascolta"[\s\S]{0,260}?class="onde"/)
        expect(barra).toContain('v-show="!ascolta"')
        // E il multi-riga prende la forma a carta, coi comandi sotto.
        expect(barra).toContain("'pillola--carta': campoAlto")
        expect(barra).toContain('.pillola--carta .campo')
        /*
         * ⛔ E la soglia toglie l'IMBOTTITURA: `scrollHeight` è contenuto PIÙ
         * riempimento verticale, quindi una riga sola lo superava e la carta
         * compariva subito. MISURATO sul Pad il 12 agosto, con lo screenshot:
         * «cosa vedi in questa immagine» — una riga — e i comandi erano già
         * scesi sotto.
         */
        expect(barra).toContain('(el.scrollHeight - imbottitura) > riga * 1.5')
    })
})

/**
 * ⛔⛔ DUE ASCOLTATORI, LO STESSO CONTRATTO — e mezzo contratto è un difetto muto.
 *
 * Owner 2026-08-12, provando la build: «nella chat la waveform funziona bene, ma
 * nell'assistente è piatta, non rileva il volume».
 *
 * Le due strade attaccano ascoltatori DIVERSI: nella chat quello del plugin,
 * nell'assistente quello di `TalosOrecchioAnticipato` (la sessione si adotta). Il
 * secondo aveva `override fun onRmsChanged(rms: Float) = Unit` — buttava via
 * l'unico dato che serviva.
 *
 * ⛔ È la SECONDA volta in un giorno che questa copia costa un difetto: la prima
 * fu `onResults` letto a metà in una sessione a segmenti. Questo presidio non
 * difende il volume — difende la REGOLA: nessuno dei due ascoltatori può
 * implementare a vuoto un metodo che l'altro usa.
 */
describe('⛔ i due ascoltatori del microfono dicono le stesse cose', () => {
    it('nessuno dei due butta via il volume', () => {
        const orecchio = leggi(
            'android/app/src/main/java/ai/talos/agent/TalosOrecchioAnticipato.kt',
        )
        const plugin = leggi(
            'android/app/src/main/java/ai/talos/agent/TalosDictationPlugin.kt',
        )

        // ⛔ La firma esatta del difetto, in tutti e due i file.
        expect(orecchio).not.toMatch(/override fun onRmsChanged\([^)]*\) = Unit/)
        expect(plugin).not.toMatch(/override fun onRmsChanged\([^)]*\) = Unit/)
        // E la strada per cui il volume dell'adottata arriva al lato web.
        expect(orecchio).toContain('destinatario(Evento("livello", numero = rms))')
        expect(plugin).toContain('notifyListeners("talosDictationLevel", JSObject().put("db", evento.numero))')
    })

    it('il volume NON si accoda: vale adesso, non mezzo secondo fa', () => {
        const orecchio = leggi(
            'android/app/src/main/java/ai/talos/agent/TalosOrecchioAnticipato.kt',
        )
        /*
         * Gli altri eventi si accodano — una parola sentita prima che la barra
         * esistesse non si può perdere. Il livello è il contrario: una coda di
         * livelli vecchi disegnerebbe, all'aggancio, un'onda del passato.
         */
        expect(orecchio).toMatch(
            /override fun onRmsChanged[\s\S]{0,500}?val destinatario = consegna \?: return/,
        )
        expect(orecchio).not.toMatch(/onRmsChanged[\s\S]{0,400}?manda\(Evento\("livello"/)
        /*
         * ⛔ Ma l'ULTIMO valore si tiene, e si consegna una volta all'aggancio.
         * MISURATO: senza, l'onda parte da zero e si accende due secondi dopo —
         * `onda campioni=24 picco=0.00` mentre il microfono stava già sentendo.
         * Non è la storia accodata: è il volume di adesso, dato a chi arriva.
         */
        expect(orecchio).toContain('ultimoVolume = rms')
        expect(orecchio).toMatch(
            /fun collega\([\s\S]{0,600}?ultimoVolume\?\.let \{ destinatario\(Evento\("livello", numero = it\)\) \}/,
        )
    })
})

/**
 * ⭐⭐ LA REGOLA «NO HANDS» — e i due tempi che la rendevano finta.
 *
 * Owner 2026-08-12: «in modalità assistente quando invio un messaggio e TALOS
 * finisce di parlare la conversazione non riparte, devo premere il pulsante
 * manualmente. **Questo viola la nostra regola no hands**».
 */
describe('⛔ a mani libere vuol dire per TUTTI i turni, non per il primo', () => {
    it('finito di parlare, TALOS riapre il microfono DA SOLO', () => {
        const barra = leggi('src/components/barra/TalosBarraRoot.vue')

        // I due segnali esistevano già: chi ha parlato, e quando la voce finisce.
        /*
         * ⛔⛔ «HA FINITO» È UNA CONGIUNZIONE. Owner 2026-08-12, provando la
         * build precedente: «il microfono riparte a metà strada, TALOS non
         * finisce la frase». `speakingId` dice CHI possiede la lettura, non se
         * il parlato è finito: si azzera quando finisce l'ultima frase del
         * PEZZO arrivato, mentre il modello sta ancora generando. E riaprire il
         * microfono chiama `zittisci()` → `lettura.stop()`, cioè **è la ripresa
         * a troncare TALOS**.
         */
        expect(barra).toContain(
            'const talosParla = computed(() => lettura.speakingId.value !== null || chat.state.sending)',
        )
        expect(barra).toMatch(/watch\(talosParla,[\s\S]{0,2400}?vogliAscoltare\('TALOS ha finito di parlare'\)/)
        // ⛔ E si ricontrolla dopo un assestamento: nell'istante in cui il
        // modello finisce, la lettura della CODA può non essere ancora partita.
        expect(barra).toContain('const ASSESTAMENTO_MS = 600')
        expect(barra).toMatch(/assestamento = setTimeout\([\s\S]{0,300}?if \(talosParla\.value\)/)
        // ⛔ Solo se il turno era di VOCE: chi ha scritto con la tastiera non
        // vuole il microfono aperto in mano perché TALOS ha letto ad alta voce.
        expect(barra).toContain('turnoNatoDiVoce = dettato')
        expect(barra).toMatch(/watch\(talosParla,[\s\S]{0,200}?if \(!turnoNatoDiVoce\) return/)
    })

    it('⛔ e il verso contrario: chi spegne a mano NON se lo ritrova acceso', () => {
        const barra = leggi('src/components/barra/TalosBarraRoot.vue')

        // Il verso che si dimentica di provare: premere il microfono per fermare
        // deve fermare anche la ripresa automatica, o «basta» non vale niente.
        expect(barra).toMatch(
            /const acceso = ascoltoVoluto[\s\S]{0,700}?turnoNatoDiVoce = false[\s\S]{0,200}?fermaLAscolto\(null\)/,
        )
    })

    it('l\'attesa prima dell\'invio scende da 3,8 s a 2,5 s', () => {
        const barra = leggi('src/components/barra/TalosBarraRoot.vue')
        const plugin = leggi('android/app/src/main/java/ai/talos/agent/TalosDictationPlugin.kt')

        /*
         * ⛔ I due tempi erano IN FILA e ridondanti: 2.200 ms di silenzio chiesti
         * al motore — più del doppio degli 800-1.200 che usano gli agenti vocali
         * — e poi altri 1.600 di grazia per rispondere alla STESSA domanda.
         *
         * Il primo taglio (12/8) è stato sulla grazia: 1.600 → 900, cioè il buco
         * sordo fra due sessioni più un margine. Il secondo (14/8, owner: «c'è un
         * po' troppo delay») è andato sulla pausa del motore: 2.200 → 1.600.
         *
         * ⛔ Il secondo taglio ha PROVATO 1.400 e un altro cancello l'ha
         * respinto — `dictationTempiCondivisi` pretende di stare sopra la moda
         * dei 1.500 ms delle pause di pensiero. Il cancello non è stato
         * allentato: si è spostato il numero. Sta scritto qui perché il
         * prossimo che vorrà limare trovi già la risposta.
         *
         * ⛔ Il numero che NON si tocca è la grazia, ed è il senso di questa
         * prova: sotto il respiro smette di coprire la finestra in cui siamo
         * fisicamente sordi, e il guadagno in reattività si paga in parole non
         * sentite. Delle due attese, quella si toglie e questa no, perché la
         * grazia GUARDA — annulla l'invio se arrivano altre parole — mentre
         * l'altra aspettava e basta.
         */
        expect(barra).toContain('const GRAZIA_MS = 900')
        expect(barra).toContain('const RESPIRO_MS = 500')
        expect(plugin).toContain('TALOS_PAUSA_FINE_FRASE_MS = 1_600')

        const grazia = Number(/const GRAZIA_MS = ([\d_]+)/.exec(barra)?.[1]?.replace(/_/g, ''))
        const respiro = Number(/const RESPIRO_MS = ([\d_]+)/.exec(barra)?.[1]?.replace(/_/g, ''))
        const pausa = Number(/TALOS_PAUSA_FINE_FRASE_MS = ([\d_]+)/.exec(plugin)?.[1]?.replace(/_/g, ''))

        // La grazia non può scendere sotto il buco, o si manderebbe la domanda
        // mentre TALOS è ancora fisicamente sordo.
        expect(grazia).toBeGreaterThan(respiro)
        /*
         * ⛔ E il totale ha un TETTO, che è la cosa che l'owner sente: oltre due
         * secondi e mezzo fra l'ultima parola e la partenza, il ritardo si nota
         * a ogni singolo turno. Un tetto sul totale morde anche se domani
         * qualcuno alza uno dei due pezzi «di poco».
         */
        expect(pausa + grazia).toBeLessThanOrEqual(2_500)
        /*
         * ⛔ E un PAVIMENTO. Il pavimento vero — sopra la moda dei 1.500 ms — lo
         * tiene `dictationTempiCondivisi`, ed è quello che ha respinto 1.400.
         * Qui si ripete più largo di proposito: due cancelli sullo stesso numero
         * si contraddicono, uno solo si dimentica. Questo dice «non scendere
         * sotto il secondo», quello dice esattamente dove sta il confine.
         */
        expect(pausa).toBeGreaterThan(1_000)
    })
})

/**
 * ⛔⛔ CHI PARLA TACE — e mancava la metà simmetrica.
 *
 * Owner 2026-08-12, quattro volte: «il discorso si tronca prima di finire, poco
 * dopo essere iniziato». Il diario della voce l'ha chiuso in una corsa:
 *
 *     53.033  errore:NO_MATCH                     ← il microfono chiude per SILENZIO
 *     53.034  barra: riapro fra un respiro (silenzio)
 *     53.534  barra: chiamo toggle
 *     53.534  voce: STOP (la barra apre il microfono) mentre leggeva=-
 *
 * Mentre TALOS parla il microfono resta aperto, non sente parole, il motore
 * chiude con `NO_MATCH`, e la barra lo RIAPRE — passando da `zittisci()`, che
 * ammutolisce TALOS. Ogni due secondi e mezzo.
 *
 * La regola «chi parla tace» era scritta in UN verso solo: si zittisce la voce
 * prima di ascoltare. Mancava l'altro: non si ascolta mentre si parla.
 */
describe('⛔ il microfono non si riapre mentre TALOS parla', () => {
    it('la ripresa per SILENZIO si ferma se la voce ha la parola', () => {
        const barra = leggi('src/components/barra/TalosBarraRoot.vue')

        expect(barra).toMatch(
            /function riapriSePossibile[\s\S]{0,2600}?if \(talosParla\.value\) \{[\s\S]{0,200}?return/,
        )
        // ⛔ E il controllo viene PRIMA della scadenza e del respiro: dopo,
        // avrebbe già chiamato `toggle()` e zittito TALOS.
        const guardia = barra.indexOf('if (talosParla.value) {')
        const respiro = barra.indexOf("annota('barra: chiamo toggle')")
        expect(guardia).toBeGreaterThan(-1)
        expect(respiro).toBeGreaterThan(guardia)
    })

    it('⛔ e chi zittisce TALOS deve DIRE il proprio nome', () => {
        const voce = leggi('src/composables/useTalosSpeech.ts')
        const barra = leggi('src/components/barra/TalosBarraRoot.vue')
        const chat = leggi('src/screens/ChatScreen.vue')

        /*
         * Senza il motivo, «si tronca a metà» aveva quattro cause identiche fra
         * loro: testo già tagliato, coda che perde frasi, qualcuno che chiama
         * stop, motore che sbaglia. È la riga che ha chiuso il caso.
         */
        expect(voce).toContain("async function stop(motivo = 'non dichiarato')")
        expect(voce).toMatch(/voce: STOP \(\$\{motivo\}\) mentre leggeva=/)
        expect(barra).toContain("lettura.stop('la barra apre il microfono')")
        expect(chat).toContain("parlaSubito().stop('la chat apre il microfono')")
        // E ogni frase accodata/detta lascia la sua riga.
        expect(voce).toContain('voce: accodo ${numero}/${pronte.length}')
        expect(voce).toContain('voce: detta ${numero}/${pronte.length}')
    })
})
