package ai.talos.agent.ponte

import java.io.ByteArrayOutputStream
import java.io.InputStream
import java.io.OutputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder

/**
 * ⭐ I PACCHETTI DELL'ACCOPPIAMENTO — sei byte di intestazione, e un carico.
 *
 * ## ⛔ È un protocollo DIVERSO da quello della connessione
 *
 * Il ponte parla due lingue, e confonderle è l'errore più naturale del mondo
 * perché il nome è lo stesso — «adb». Ma non si somigliano affatto:
 *
 * | | connessione (`TalosAdbMessaggio`) | accoppiamento (questo) |
 * |---|---|---|
 * | intestazione | 24 byte, sei parole | **6 byte** |
 * | numeri | **little**-endian | **big**-endian |
 * | somma di controllo | c'è | non c'è (sotto TLS) |
 * | magic | c'è | non c'è |
 *
 * ⇒ Scrivere la lunghezza little-endian qui, per abitudine presa dall'altro
 * file, produce un carico di dimensione assurda e una connessione che muore
 * senza spiegazioni. È la ragione per cui questi due formati stanno in due file
 * separati e non in uno solo «dei pacchetti adb».
 *
 * ## Il formato
 *
 * ```
 *   0  version   1 byte   — sempre 1
 *   1  type      1 byte   — 0 = SPAKE2_MSG, 1 = PEER_INFO
 *   2  payload   4 byte   — BIG-endian
 * ```
 */
internal object TalosAdbPacchetto {

    const val INTESTAZIONE = 6
    const val VERSIONE = 1

    /** Il messaggio di SPAKE2: il punto mascherato. */
    const val SPAKE2 = 0

    /** Chi siamo: il tipo e i dati, cifrati. */
    const val PEER_INFO = 1

    /** `kMaxPeerInfoSize` in AOSP: 8192, e il carico può valerne il doppio. */
    const val MAX_PEER_INFO = 8192
    const val MAX_CARICO = MAX_PEER_INFO * 2

    /** Chi siamo: `ADB_RSA_PUB_KEY`. L'altro valore è il GUID, che non usiamo. */
    const val TIPO_CHIAVE_RSA = 0

    /** Perché un pacchetto è stato rifiutato. */
    enum class Rifiuto { CORTO, VERSIONE, TIPO, CARICO }

    class Rotto(val motivo: Rifiuto) : Exception(motivo.name)

    /** L'intestazione da spedire. */
    fun intestazione(tipo: Int, quantoCarico: Int): ByteArray =
        ByteBuffer.allocate(INTESTAZIONE).order(ByteOrder.BIG_ENDIAN).apply {
            put(VERSIONE.toByte())
            put(tipo.toByte())
            putInt(quantoCarico)
        }.array()

    data class Letta(val versione: Int, val tipo: Int, val carico: Int)

    /**
     * Legge un'intestazione, o dice perché no.
     *
     * ⛔ Un carico di lunghezza **zero** è rifiutato, come in AOSP: un pacchetto
     * senza contenuto non significa niente in questo protocollo, e accettarlo
     * vorrebbe dire proseguire su un dialogo che non sta più andando da nessuna
     * parte.
     */
    fun leggiIntestazione(byte: ByteArray): Result<Letta> {
        if (byte.size < INTESTAZIONE) return Result.failure(Rotto(Rifiuto.CORTO))
        val b = ByteBuffer.wrap(byte, 0, INTESTAZIONE).order(ByteOrder.BIG_ENDIAN)
        val versione = b.get().toInt() and 0xFF
        val tipo = b.get().toInt() and 0xFF
        val carico = b.int
        if (versione != VERSIONE) return Result.failure(Rotto(Rifiuto.VERSIONE))
        if (tipo != SPAKE2 && tipo != PEER_INFO) return Result.failure(Rotto(Rifiuto.TIPO))
        if (carico <= 0 || carico > MAX_CARICO) return Result.failure(Rotto(Rifiuto.CARICO))
        return Result.success(Letta(versione, tipo, carico))
    }

    /** Spedisce intestazione e carico insieme, e svuota. */
    fun spedisci(uscita: OutputStream, tipo: Int, carico: ByteArray) {
        uscita.write(intestazione(tipo, carico.size))
        uscita.write(carico)
        uscita.flush()
    }

    /**
     * Riceve un pacchetto intero.
     *
     * ⛔ Come nel canale della connessione: si legge **in ciclo** fino al byte
     * esatto. Una presa di rete consegna come le pare, e usare quello che torna
     * significa leggere mezza intestazione e poi interpretare rumore.
     */
    fun ricevi(entrata: InputStream): Pair<Letta, ByteArray> {
        val testa = esatto(entrata, INTESTAZIONE)
        val letta = leggiIntestazione(testa).getOrThrow()
        return letta to esatto(entrata, letta.carico)
    }

    private fun esatto(entrata: InputStream, quanti: Int): ByteArray {
        val dati = ByteArray(quanti)
        var presi = 0
        while (presi < quanti) {
            val n = entrata.read(dati, presi, quanti - presi)
            if (n < 0) throw Rotto(Rifiuto.CORTO)
            presi += n
        }
        return dati
    }

    /**
     * Il nostro `PeerInfo`: un byte di tipo, e poi la chiave pubblica.
     *
     * ⛔ In AOSP la struttura è **fissa a 8192 byte** e imbottita di zeri:
     * `uint8_t type; uint8_t data[8191];`. Spedirne una più corta, con solo i
     * byte utili, è la cosa che verrebbe naturale — e l'altro capo la leggerebbe
     * come una struttura troncata.
     */
    fun peerInfo(chiavePubblicaAdb: ByteArray): ByteArray {
        require(chiavePubblicaAdb.size <= MAX_PEER_INFO - 1) { "chiave troppo lunga" }
        val fuori = ByteArrayOutputStream(MAX_PEER_INFO)
        fuori.write(TIPO_CHIAVE_RSA)
        fuori.write(chiavePubblicaAdb)
        fuori.write(ByteArray(MAX_PEER_INFO - 1 - chiavePubblicaAdb.size))
        return fuori.toByteArray()
    }
}
