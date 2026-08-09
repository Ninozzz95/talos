package ai.talos.agent.ponte

import java.nio.ByteBuffer
import java.nio.ByteOrder

/**
 * ⭐⭐⭐ IL PROTOCOLLO ADB, DETTO DA NOI — la prima pietra del ponte definitivo.
 *
 * ## Perché esiste, e cosa manda in pensione
 *
 * Oggi il ponte **spedisce il binario `adb` dentro l'APK** e lo esegue. Misurato
 * sull'APK di stamattina: **9,12 MiB su 50 file** fra `adb`, cinquanta librerie
 * Abseil, BoringSSL, protobuf e i compressori. Da quella forma discendono, tutti
 * insieme, i difetti che abbiamo pagato uno per uno:
 *
 * - `adb` **forka un server** che eredita `stdout` e non muore. Misurato sul Pad:
 *   `27489 u0_a386 adb`, vivo da un tentativo precedente. La pipe non arrivava
 *   mai a fine file e il girello dell'accoppiamento girava all'infinito.
 * - `adb pair` senza un codice valido **chiede il codice da tastiera**, e una
 *   tastiera lì non c'è: un'altra attesa senza fine.
 * - I collegamenti alle librerie si rompono a **ogni aggiornamento dell'app**,
 *   perché `nativeLibraryDir` cambia nome.
 * - E resta il debito #47: quel binario non l'abbiamo costruito noi.
 *
 * ⇒ Nessuno di questi è un caso isolato: sono la **forma**. Un processo figlio
 * con delle pipe è la cosa sbagliata da avere in mezzo. Il protocollo vero è
 * questo file: **sei parole da 32 bit** di intestazione e un carico utile.
 *
 * ## Il formato, per intero
 *
 * ```
 *   0  command      un identificativo di 4 lettere ASCII, letto al contrario
 *   4  arg0         primo argomento, dipende dal comando
 *   8  arg1         secondo argomento
 *  12  data_length  quanti byte di carico seguono
 *  16  data_crc32   la SOMMA dei byte del carico (il nome mente: non è un CRC)
 *  20  magic        command XOR 0xFFFFFFFF
 * ```
 *
 * Tutto a 32 bit, little-endian. `magic` non è sicurezza: è un modo per
 * accorgersi di essere fuori sincrono nel flusso, e va controllato SEMPRE —
 * altrimenti un byte perso trasforma il resto della conversazione in rumore
 * interpretato come comandi.
 *
 * ⛔ `data_crc32` si chiama così in AOSP ma **è la somma dei byte**, non un
 * CRC-32. Chi legge il nome e implementa un CRC ottiene un ponte che non si
 * collega, con un errore che non assomiglia alla causa. È il primo scoglio di
 * ogni implementazione, ed è scritto qui perché non si ripeta.
 */
internal object TalosAdbMessaggio {

    /** «CNXN» — la stretta di mano di apertura. */
    const val CNXN = 0x4E584E43

    /** «AUTH» — la sfida a chiave pubblica, sul percorso vecchio. */
    const val AUTH = 0x48545541

    /** «STLS» — «passiamo a TLS», il percorso del Debug wireless. */
    const val STLS = 0x534C5453

    /** «OPEN» — apri un servizio (una shell, un trasferimento). */
    const val OPEN = 0x4E45504F

    /** «OKAY» — ricevuto, puoi continuare. */
    const val OKAY = 0x59414B4F

    /** «WRTE» — dati su un flusso già aperto. */
    const val WRTE = 0x45545257

    /** «CLSE» — chiudi il flusso. */
    const val CLSE = 0x45534C43

    /** «SYNC» — non lo usiamo, ma va riconosciuto per non scambiarlo per rumore. */
    const val SYNC = 0x434E5953

    /** L'intestazione è sempre lunga uguale: sei parole da quattro byte. */
    const val INTESTAZIONE = 24

    /**
     * La versione che dichiariamo nel `CNXN`.
     *
     * `0x01000001` è quella che porta il carico utile grande; i telefoni più
     * vecchi rispondono `0x01000000` e allora si scende a 256 KiB. Si dichiara
     * la nostra e si **ubbidisce alla loro**: chi impone la propria versione
     * parla da solo.
     */
    const val VERSIONE = 0x0100_0001

    /** Il tetto con cui si dialoga prima di sapere cosa risponde l'altro. */
    const val CARICO_MASSIMO_VECCHIO = 256 * 1024

    /** Il tetto della versione nuova. */
    const val CARICO_MASSIMO = 1024 * 1024

    /**
     * La somma dei byte del carico, come la vuole `adbd`.
     *
     * ⛔ Ogni byte va letto **senza segno**: in Kotlin un `Byte` va da -128 a
     * 127, e sommarli così darebbe un numero diverso su qualunque carico che
     * contenga un byte oltre 127 — cioè su qualunque dato binario. La `and 0xFF`
     * non è una raffinatezza.
     */
    fun somma(carico: ByteArray): Int {
        var totale = 0
        for (b in carico) totale += (b.toInt() and 0xFF)
        return totale
    }

    /** L'intestazione di un messaggio, pronta da spedire. */
    fun intestazione(comando: Int, arg0: Int, arg1: Int, carico: ByteArray): ByteArray =
        ByteBuffer.allocate(INTESTAZIONE).order(ByteOrder.LITTLE_ENDIAN).apply {
            putInt(comando)
            putInt(arg0)
            putInt(arg1)
            putInt(carico.size)
            putInt(somma(carico))
            putInt(comando xor -1)
        }.array()

    /**
     * Un messaggio letto dal filo.
     *
     * `carico` è vuoto finché non lo si legge: l'intestazione dice **quanto**
     * leggere, e leggere quel numero è responsabilità di chi possiede il flusso.
     */
    data class Letto(
        val comando: Int,
        val arg0: Int,
        val arg1: Int,
        val lunghezza: Int,
        val somma: Int,
    )

    /**
     * Perché un'intestazione è stata rifiutata. Un codice corto e chiuso: finisce
     * nella diagnostica, e un testo libero lì dentro non si può cercare.
     */
    enum class Rifiuto { CORTA, MAGIC, TROPPO_GRANDE, COMANDO_IGNOTO }

    /**
     * Legge un'intestazione, oppure dice perché no.
     *
     * ⛔ Il tetto sulla lunghezza si controlla QUI, prima di allocare. Il numero
     * arriva dall'altro capo del filo: crederci e chiedere un vettore di quella
     * misura significa far decidere a lui quanta memoria prendiamo.
     */
    fun leggi(byte: ByteArray, caricoMassimo: Int = CARICO_MASSIMO): Result<Letto> {
        if (byte.size < INTESTAZIONE) return Result.failure(TalosAdbRifiutato(Rifiuto.CORTA))
        val b = ByteBuffer.wrap(byte, 0, INTESTAZIONE).order(ByteOrder.LITTLE_ENDIAN)
        val comando = b.int
        val arg0 = b.int
        val arg1 = b.int
        val lunghezza = b.int
        val somma = b.int
        val magic = b.int
        if (magic != (comando xor -1)) return Result.failure(TalosAdbRifiutato(Rifiuto.MAGIC))
        if (lunghezza < 0 || lunghezza > caricoMassimo) {
            return Result.failure(TalosAdbRifiutato(Rifiuto.TROPPO_GRANDE))
        }
        if (comando !in CONOSCIUTI) return Result.failure(TalosAdbRifiutato(Rifiuto.COMANDO_IGNOTO))
        return Result.success(Letto(comando, arg0, arg1, lunghezza, somma))
    }

    /** Se il carico ricevuto è quello che l'intestazione prometteva. */
    fun caricoIntegro(letto: Letto, carico: ByteArray): Boolean =
        carico.size == letto.lunghezza && somma(carico) == letto.somma

    private val CONOSCIUTI = setOf(CNXN, AUTH, STLS, OPEN, OKAY, WRTE, CLSE, SYNC)
}

/** Un'intestazione rifiutata, col motivo attaccato. */
internal class TalosAdbRifiutato(
    val motivo: TalosAdbMessaggio.Rifiuto,
) : Exception(motivo.name)
