import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * ⛔⛔ I DUE NUMERI CHE UCCIDONO LA PAROLA SENZA DIRE NIENTE.
 *
 * La catena della parola di attivazione è mel → embedding → classificatore, e
 * ha due dettagli che, sbagliati, non producono **nessun errore**: producono un
 * punteggio che non sale mai. È esattamente la forma del guasto da cui veniamo
 * — il 2026-08-14 il servizio era vivo, in primo piano, col microfono in mano, e
 * su cinque «hey TALOS» ha fatto zero.
 *
 *   1. I campioni entrano come **int16 scritti in float**, non normalizzati. Il
 *      modello mel è addestrato su valori ±32768. Dividere per 32768 è
 *      l'istinto di chiunque — ed è quello che faceva il codice precedente,
 *      nello stesso file.
 *   2. Il mel va trasformato con **`x/10 + 2`**, che allinea il modello ONNX
 *      all'originale TensorFlow su cui l'embedding è stato addestrato.
 *
 * ⛔ Questo è un controllo sul TESTO del sorgente, e non prova che la catena
 * dia il numero giusto: quella prova richiede il modello, il runtime e un
 * telefono, e sta nel giro sul dispositivo. Quello che prova è che nessuno
 * rimetta i due errori senza accorgersene — che è il modo in cui erano
 * arrivati la prima volta.
 */

const RADICE = resolve(__dirname, '../../..')
const leggi = (f: string): string => readFileSync(resolve(RADICE, f), 'utf8')

const ORECCHIO = 'android/app/src/main/java/ai/talos/parola/TalosOrecchio.kt'
const SERVIZIO = 'android/app/src/main/java/ai/talos/parola/TalosParola.kt'
const SCHEDA = 'android/app/src/main/jniLibs/PROVENIENZA-PAROLA.md'

describe('⛔ la catena della parola non torna agli errori muti', () => {
    /**
     * ⛔⛔ QUESTO CONTROLLO ASSERIVA L'ESATTO CONTRARIO, ed è stato ROVESCIATO
     * il 2026-08-15 con una misura, non con un'opinione.
     *
     * Diceva: «i campioni NON si normalizzano», e vietava `/ 32768` in
     * qualunque forma. Era giusto per `hey_jarvis` di openWakeWord — misurato
     * 0,9987 — perché quella pipeline legge i wav come int16.
     *
     * ⛔ Ma `talos.onnx` è addestrato con **livekit-wakeword**, e il suo lettore
     * (`data/features.py`, riga 56) fa `sf.read(...)`: **soundfile normalizza a
     * -1..1**. Il classificatore ha visto solo valori fra -1 e 1, e gli
     * passavamo numeri 32.768 volte più grandi.
     *
     * | clip | int16 grezzo | -1..1 |
     * | --- | --- | --- |
     * | clip_000034_r0 | 0,658 | **0,989** |
     * | clip_000102_r2 | 0,461 ✗ | **0,977** ✓ |
     * | clip_000171_r0 | 0,239 ✗ | **0,983** ✓ |
     *
     * Su sei clip **3/6 → 6/6**; sul telefono l'owner è passato da «risponde 2
     * volte su 10» a **10 su 10**, a voce bassa e alta, da vicino e da lontano.
     *
     * ⇒ La lezione che questo controllo protegge adesso: **la scala la decide
     * chi ha addestrato il modello**, non il formato audio. Se un giorno si
     * torna a un modello openWakeWord, questo test va rovesciato di nuovo — e
     * insieme al test va cambiato il modello, mai da solo.
     */
    it('i campioni si normalizzano a -1..1: è la scala su cui il modello è addestrato', () => {
        const orecchio = leggi(ORECCHIO)

        // La divisione DEVE esserci, e passare da una costante che si può
        // cercare: un `32768f` sparso nel ciclo è invisibile a chi legge.
        expect(orecchio).toMatch(/const val SCALA_PIENA = 32768f/)
        expect(orecchio).toContain('blocco[i] / SCALA_PIENA')

        // ⛔ E la vecchia conversione grezza NON deve essere tornata: è il modo
        // in cui questo difetto era arrivato la prima volta.
        expect(orecchio).not.toContain('blocco[i].toFloat()')
    })

    it('la trasformazione del mel c\'è, ed è /10 + 2', () => {
        const orecchio = leggi(ORECCHIO)
        expect(orecchio).toMatch(/fuori\[i\]\s*\/\s*10f\s*\+\s*2f/)
    })

    it('⛔ il blocco è di 1280 campioni, e il servizio NON se lo ricalcola', () => {
        const orecchio = leggi(ORECCHIO)
        const servizio = leggi(SERVIZIO)

        expect(orecchio).toMatch(/const val CAMPIONI_PER_BLOCCO = 1280/)
        // 80 ms è il passo su cui l'embedding è addestrato: con un blocco
        // diverso i fotogrammi non si allineano e il punteggio non sale mai.
        // Prima qui c'era `FREQUENZA / 10` — 100 ms, scelto perché tondo.
        expect(servizio).toContain('ShortArray(TalosOrecchio.CAMPIONI_PER_BLOCCO)')
        expect(servizio).not.toMatch(/ShortArray\(FREQUENZA\s*\/\s*10\)/)
    })

    it('⛔ una lettura PARZIALE non vale un blocco', () => {
        const servizio = leggi(SERVIZIO)
        // `read` può consegnare meno di quanto chiesto: trattarlo come un
        // blocco intero sposterebbe l'allineamento in avanti per sempre.
        expect(servizio).toContain('presa.read(blocco, dentro, blocco.size - dentro)')
        expect(servizio).toMatch(/dentro \+= letti\s*\n\s*if \(dentro < blocco\.size\) continue/)
    })

    it('⭐ il nome dell\'ingresso del classificatore si LEGGE, non si scrive', () => {
        const orecchio = leggi(ORECCHIO)
        /*
         * I modelli di openWakeWord chiamano l'ingresso `x.1`, quelli
         * addestrati con livekit-wakeword lo chiamano `embeddings`. Leggerlo
         * dalla sessione è ciò che permetterà di mettere «hey TALOS» al posto
         * di «hey jarvis» cambiando un file e una riga, invece che il codice.
         */
        expect(orecchio).toContain('classificatore.inputNames.first()')
        expect(orecchio).not.toContain('"x.1"')
        expect(orecchio).not.toContain('"embeddings"')
    })
})

describe('⛔ la scheda di provenienza e il codice dicono la stessa cosa', () => {
    it('ogni modello che il codice apre è dichiarato, e viceversa', () => {
        const scheda = leggi(SCHEDA)
        const orecchio = leggi(ORECCHIO)
        const servizio = leggi(SERVIZIO)

        // Quelli che la scheda promette di scaricare e verificare.
        const scaricati = [...scheda.matchAll(/^\|\s*`parola\/([^`]+)`\s*\|\s*\d+\s*\|\s*`[0-9a-f]{64}`\s*\|$/gm)]
            .map((m) => m[1])
        expect(scaricati.length).toBeGreaterThan(0)
        /*
         * ⛔ E quelli NATI IN CASA — quattro colonne, perché portano anche il
         * percorso nel repo.
         *
         * `talos.onnx` l'abbiamo addestrato noi il 2026-08-15: non esiste
         * nessun URL da cui prenderlo, quindi sta nel repo. ⛔ Ma è dichiarato
         * nella stessa scheda e verificato dallo stesso cancello con peso e
         * impronta: cambia DA DOVE arriva, non SE si controlla. Un test che
         * guardasse solo gli scaricati direbbe «il codice apre un file non
         * dichiarato» proprio per il file più importante.
         */
        const inCasa = [...scheda.matchAll(
            /^\|\s*`parola\/([^`]+)`\s*\|\s*`[^`]+`\s*\|\s*\d+\s*\|\s*`[0-9a-f]{64}`\s*\|$/gm,
        )].map((m) => m[1])
        expect(inCasa, 'la parola in servizio è nostra: deve stare nella scheda').toContain('talos.onnx')
        const dichiarati = [...scaricati, ...inCasa]

        // Quelli che il codice apre davvero: i due fissi più la parola in corso.
        const fissi = [...orecchio.matchAll(/fabbrica\("([^"]+\.onnx)"\)/g)].map((m) => m[1])
        const parola = servizio.match(/const val PAROLA = "([^"]+)"/)?.[1]
        expect(parola).toBeTruthy()
        const aperti = [...fissi, parola as string]

        /*
         * ⛔ È QUI che si rompe il giro: chi cambia la parola senza toccare la
         * scheda ottiene un APK in cui `preparaOrecchioParola` non scarica il
         * file nuovo, e l'app parte e non sente niente. Un guasto muto in più,
         * dello stesso tipo di quelli che questo file esiste per fermare.
         */
        for (const f of aperti) {
            expect(dichiarati, `il codice apre ${f} e la scheda non lo dichiara`).toContain(f)
        }

        /*
         * ⛔ E il verso contrario, con UNA eccezione NOMINATA.
         *
         * Fino al 2026-08-15 valeva l'uguaglianza secca, e serviva a non
         * portarsi dietro pesi morti. Poi `talos.onnx` ha preso il posto di
         * `hey_jarvis.onnx`, che resta scaricato **apposta**: è il banco di
         * prova con cui si distingue «il montaggio è rotto» da «il nostro
         * modello non sente», e il giorno in cui la parola non scattasse sarebbe
         * l'unico confronto disponibile.
         *
         * ⛔ L'eccezione è UNA e si chiama per nome: un secondo file dichiarato
         * e mai aperto fa fallire questo test, che è il punto.
         */
        const dichiaratiMaiAperti = dichiarati.filter((f) => !aperti.includes(f))
        expect(
            dichiaratiMaiAperti,
            'un modello dichiarato e mai aperto è peso morto nell\'APK: '
            + 'l\'unico ammesso è hey_jarvis.onnx, il banco di prova',
        ).toEqual(['hey_jarvis.onnx'])
    })

    it('⛔ di sherpa non è rimasto niente da caricare', () => {
        expect(existsSync(resolve(RADICE, 'android/app/src/main/assets/kws'))).toBe(false)
        expect(existsSync(resolve(RADICE, 'android/app/src/main/jniLibs/PROVENIENZA-VOCE.md'))).toBe(false)

        const gradle = leggi('android/app/build.gradle')
        expect(gradle).not.toContain('preparaMotoreVoce')
        expect(gradle).toContain('preparaOrecchioParola')
        // Il compito deve restare AGGANCIATO: uno registrato e mai chiamato
        // darebbe un APK senza modelli, che si installa benissimo.
        expect(gradle).toMatch(/preBuild[\s\S]{0,80}?dependsOn[^\n]*preparaOrecchioParola/)
    })
})
