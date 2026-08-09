package ai.talos.agent.ponte

import java.io.ByteArrayOutputStream
import java.math.BigInteger

/**
 * ⭐ DER, scritto da noi — il minimo indispensabile, e niente di più.
 *
 * ## Perché non una libreria
 *
 * Serve per costruire **un** certificato X.509: quello che TALOS presenta ad
 * `adbd` quando il Debug wireless chiede TLS. Le strade alternative erano tutte
 * peggiori:
 *
 * - **BouncyCastle** pesa qualche megabyte per usarne una funzione, ed è
 *   esattamente il tipo di dipendenza che stiamo togliendo.
 * - **`sun.security.x509`** su Android è API nascosta: funziona finché Google
 *   non la chiude, e allora il ponte si rompe senza che abbiamo toccato niente.
 *
 * DER è una codifica **a lunghezza esplicita**: ogni cosa è una terna
 * `tipo, lunghezza, valore`. Tutto quello che serve sta in questo file, ed è
 * poco perché lo usiamo per una cosa sola.
 *
 * ## ⛔ Le due regole che, sbagliate, danno byte plausibili e inservibili
 *
 * 1. **La lunghezza lunga.** Fino a 127 byte la lunghezza è un byte e basta. Da
 *    128 in su bisogna dire prima **quanti byte** servono per scriverla, col bit
 *    alto acceso: `0x82, 0x01, 0x2A` per 298. Un certificato RSA da 2048 bit sta
 *    sempre oltre quella soglia, quindi chi implementa solo il caso corto ottiene
 *    un certificato che nessun analizzatore accetta.
 * 2. **L'intero con segno.** In DER un INTEGER è in complemento a due: se il
 *    primo byte ha il bit alto acceso, va messo uno **zero davanti**, o il
 *    numero diventa negativo. Un numero di serie negativo è rifiutato da metà
 *    del mondo e accettato dall'altra metà — cioè il difetto peggiore, quello
 *    che si manifesta solo su alcuni dispositivi.
 */
internal object TalosDer {

    const val SEQUENZA = 0x30
    const val INSIEME = 0x31
    const val INTERO = 0x02
    const val STRINGA_BIT = 0x03
    const val OTTETTI = 0x04
    const val NULLO = 0x05
    const val OID = 0x06
    const val UTF8 = 0x0C
    const val ORA_GENERALE = 0x18
    const val BOOLEANO = 0x01

    /** Una terna `tipo, lunghezza, valore` completa. */
    fun blocco(tipo: Int, valore: ByteArray): ByteArray {
        val fuori = ByteArrayOutputStream()
        fuori.write(tipo)
        fuori.write(lunghezza(valore.size))
        fuori.write(valore)
        return fuori.toByteArray()
    }

    /** Un contenitore esplicito `[n]`, come li usa X.509 per versione ed estensioni. */
    fun contesto(numero: Int, valore: ByteArray): ByteArray =
        blocco(0xA0 or numero, valore)

    /**
     * La lunghezza, corta o lunga secondo il valore.
     *
     * ⛔ La forma lunga è obbligatoria da 128 in su, e un certificato RSA ci
     * finisce sempre: senza, i byte sono plausibili e nessuno li accetta.
     */
    fun lunghezza(quanto: Int): ByteArray {
        if (quanto < 0x80) return byteArrayOf(quanto.toByte())
        var resto = quanto
        val cifre = ArrayList<Byte>(4)
        while (resto > 0) {
            cifre.add(0, (resto and 0xFF).toByte())
            resto = resto ushr 8
        }
        return byteArrayOf((0x80 or cifre.size).toByte()) + cifre.toByteArray()
    }

    /**
     * Un intero DER.
     *
     * ⛔ Complemento a due: col bit alto acceso ci vuole uno zero davanti, o il
     * numero è negativo. `BigInteger.toByteArray()` lo fa già da sé — ed è
     * proprio per questo che si usa quello invece di impacchettare a mano.
     */
    fun intero(valore: BigInteger): ByteArray = blocco(INTERO, valore.toByteArray())

    fun intero(valore: Int): ByteArray = intero(BigInteger.valueOf(valore.toLong()))

    /**
     * Una stringa di bit, col byte dei «bit inutilizzati» davanti.
     *
     * ⛔ Quello zero iniziale non è riempimento: dice quanti bit dell'ultimo
     * byte non contano. Dimenticarlo sposta tutto il contenuto di un byte, e la
     * firma dentro non verrà mai verificata.
     */
    fun stringaBit(dati: ByteArray): ByteArray = blocco(STRINGA_BIT, byteArrayOf(0) + dati)

    /**
     * Un identificativo di oggetto, dalla forma a punti.
     *
     * Le prime due cifre stanno in un byte solo (`40*a + b`); le altre in base
     * 128 col bit alto acceso su tutte tranne l'ultima.
     */
    fun oid(punti: String): ByteArray {
        val pezzi = punti.split(".").map { it.toLong() }
        require(pezzi.size >= 2) { "un OID ha almeno due cifre" }
        val fuori = ByteArrayOutputStream()
        fuori.write((pezzi[0] * 40 + pezzi[1]).toInt())
        for (n in pezzi.drop(2)) {
            val gruppi = ArrayList<Int>(8)
            var resto = n
            do {
                gruppi.add(0, (resto and 0x7F).toInt())
                resto = resto ushr 7
            } while (resto > 0)
            for (i in gruppi.indices) {
                fuori.write(if (i == gruppi.size - 1) gruppi[i] else gruppi[i] or 0x80)
            }
        }
        return blocco(OID, fuori.toByteArray())
    }

    fun utf8(testo: String): ByteArray = blocco(UTF8, testo.toByteArray(Charsets.UTF_8))

    fun sequenza(vararg pezzi: ByteArray): ByteArray = blocco(SEQUENZA, unisci(*pezzi))

    fun insieme(vararg pezzi: ByteArray): ByteArray = blocco(INSIEME, unisci(*pezzi))

    fun ottetti(dati: ByteArray): ByteArray = blocco(OTTETTI, dati)

    fun nullo(): ByteArray = byteArrayOf(NULLO.toByte(), 0)

    fun booleano(valore: Boolean): ByteArray =
        blocco(BOOLEANO, byteArrayOf(if (valore) 0xFF.toByte() else 0))

    /**
     * Un istante nel formato `AAAAMMGGhhmmssZ`.
     *
     * ⛔ Si usa `GeneralizedTime` e non `UTCTime`: quest'ultimo scrive l'anno con
     * due cifre e vive dentro una finestra che scade. Un certificato che vale
     * dieci anni non ha motivo di portarsi dietro un problema dell'anno 2050.
     */
    fun oraGenerale(testo: String): ByteArray {
        require(testo.length == 15 && testo.endsWith("Z")) { "formato AAAAMMGGhhmmssZ" }
        return blocco(ORA_GENERALE, testo.toByteArray(Charsets.US_ASCII))
    }

    fun unisci(vararg pezzi: ByteArray): ByteArray {
        val fuori = ByteArrayOutputStream()
        for (p in pezzi) fuori.write(p)
        return fuori.toByteArray()
    }
}
