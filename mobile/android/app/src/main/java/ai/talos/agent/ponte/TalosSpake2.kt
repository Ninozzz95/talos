package ai.talos.agent.ponte

import java.io.ByteArrayOutputStream
import java.math.BigInteger
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.security.MessageDigest
import java.security.SecureRandom

/**
 * ⭐⭐⭐ SPAKE2 — le sei cifre dell'accoppiamento diventano una chiave.
 *
 * ## Cosa fa, in una frase
 *
 * Due parti che conoscono la stessa password debole — sei cifre lette sullo
 * schermo — ne ricavano una chiave forte, e chi ascolta il filo non può
 * indovinare la password provandone tante offline: ogni tentativo costa un
 * giro di protocollo con l'altra parte.
 *
 * ## ⛔ Questo file non è «una implementazione di SPAKE2»
 *
 * È **l'implementazione di BoringSSL**, tradotta. Deve tornare byte per byte
 * con `crypto/curve25519/spake25519.cc` di AOSP, perché dall'altra parte del
 * filo c'è quella e non un'altra. Ogni scelta qui sotto viene da lì, anche
 * quelle che sembrano arbitrarie — soprattutto quelle.
 *
 * ## Le quattro cose che si sbagliano, e nessuna dà un errore
 *
 * 1. **Lo scalare della password non si riduce mod L.** BoringSSL lo riduce e
 *    poi gli aggiunge `L`, `2L`, `4L` secondo i suoi tre bit bassi, per
 *    renderlo un multiplo di otto. `M` e `N` nascono da un hash e hanno una
 *    componente di ordine piccolo: su quella, aggiungere `L` cambia il
 *    risultato, ed è proprio lì che il cofattore si cancella. Ridurre di nuovo
 *    annulla tutto.
 * 2. **Lo scalare privato è moltiplicato per otto.** Stessa ragione, dall'altro
 *    lato: serve a ripulire il cofattore del punto che arriva dal peer.
 * 3. **Nella trascrizione i nomi vanno in ordine di RUOLO, non di mittente.**
 *    Prima sempre Alice, poi Bob, comunque la si guardi. Chi mette «io» prima
 *    di «lui» ottiene due trascrizioni diverse ai due capi.
 * 4. **Ogni pezzo della trascrizione ha davanti la sua lunghezza in otto byte
 *    little-endian.** Senza, due campi adiacenti si possono confondere fra loro.
 *
 * E c'è una quinta cosa, che è il commento più onesto di tutto BoringSSL: il
 * `left_shift_3` sullo scalare della password **fu dimenticato per un errore di
 * copia-incolla**, e invece di correggerlo — rompendo la compatibilità con
 * tutti i dispositivi già usciti — l'hanno aggirato aggiungendo multipli
 * dell'ordine. Quel difetto è ormai parte del protocollo, e va riprodotto.
 */
internal object TalosSpake2 {

    /** Chi comincia. Nel Debug wireless il telefono è Bob e chi si accoppia è Alice. */
    enum class Ruolo { ALICE, BOB }

    /** I due punti fissi del protocollo, generati da un seme e pubblicati in AOSP. */
    private const val M_ESA = "5ada7e4bf6ddd9adb6626d32131c6b5c51a1e347a3478f53cfcf441b88eed12e"
    private const val N_ESA = "10e3df0ae37d8e7a99b5fe74b44672103dbddcbd06af680d71329a11693bc778"

    val M: TalosEd25519.Punto by lazy { TalosEd25519.leggi(daEsa(M_ESA))!! }
    val N: TalosEd25519.Punto by lazy { TalosEd25519.leggi(daEsa(N_ESA))!! }

    /** Il messaggio che si scambia è un punto: 32 byte. */
    const val MESSAGGIO = 32

    /** La chiave che ne esce è uno SHA-512 intero: 64 byte. */
    const val CHIAVE = 64

    /**
     * Un lato dell'accoppiamento. Si crea, si genera il proprio messaggio, si
     * riceve quello dell'altro, e ne esce la chiave.
     *
     * ⛔ Un'istanza serve **una volta sola**. Riusarla con un altro peer
     * significa riusare lo scalare privato, che è il modo di buttare via la
     * garanzia per cui questo protocollo esiste.
     */
    class Lato(
        private val ruolo: Ruolo,
        private val mioNome: ByteArray,
        private val suoNome: ByteArray,
        /** Iniettabile per poter provare con valori noti invece che a caso. */
        private val caso: (Int) -> ByteArray = { quanti ->
            ByteArray(quanti).also { SecureRandom().nextBytes(it) }
        },
    ) {
        private var scalarePrivato: BigInteger? = null
        private var scalarePassword: BigInteger? = null
        private var improntaPassword: ByteArray? = null
        private var mioMessaggio: ByteArray? = null

        /**
         * Il nostro messaggio: `x·B + h(password)·M` (oppure `N`, se siamo Bob).
         */
        fun generaMessaggio(password: ByteArray): ByteArray {
            check(mioMessaggio == null) { "un lato SPAKE2 si usa una volta sola" }

            // 64 byte a caso, ridotti mod L, poi per otto: il ×8 servira' a
            // ripulire il cofattore del punto che arrivera' dal peer.
            val privato = riduci(caso(64)).multiply(BigInteger.valueOf(8))
            scalarePrivato = privato

            val impronta = MessageDigest.getInstance("SHA-512").digest(password)
            improntaPassword = impronta
            scalarePassword = correggiCofattore(riduci(impronta))

            val punto = TalosEd25519.somma(
                TalosEd25519.perGrezzo(privato, TalosEd25519.BASE),
                TalosEd25519.perGrezzo(scalarePassword!!, if (ruolo == Ruolo.ALICE) M else N),
            )
            val messaggio = TalosEd25519.scrivi(punto)
            mioMessaggio = messaggio
            return messaggio
        }

        /**
         * La chiave condivisa, o `null` se il messaggio dell'altro non è un punto.
         *
         * ⛔ `null` non è un dettaglio: 32 byte qualunque non stanno sulla
         * curva, e proseguire lo stesso significherebbe fare conti su un valore
         * che non appartiene al gruppo.
         */
        fun elaboraMessaggio(suoMessaggio: ByteArray): ByteArray? {
            val mio = mioMessaggio ?: error("prima si genera il proprio messaggio")
            if (suoMessaggio.size != MESSAGGIO) return null
            val suoPunto = TalosEd25519.leggi(suoMessaggio) ?: return null

            // Si toglie la maschera dell'altro: lui ha usato l'altro punto fisso.
            val suaMaschera = TalosEd25519.perGrezzo(
                scalarePassword!!,
                if (ruolo == Ruolo.ALICE) N else M,
            )
            val condiviso = TalosEd25519.perGrezzo(
                scalarePrivato!!,
                TalosEd25519.somma(suoPunto, TalosEd25519.opposto(suaMaschera)),
            )

            val sha = MessageDigest.getInstance("SHA-512")
            // ⛔ In ordine di RUOLO, non di mittente: prima sempre Alice.
            if (ruolo == Ruolo.ALICE) {
                conLunghezza(sha, mioNome)
                conLunghezza(sha, suoNome)
                conLunghezza(sha, mio)
                conLunghezza(sha, suoMessaggio)
            } else {
                conLunghezza(sha, suoNome)
                conLunghezza(sha, mioNome)
                conLunghezza(sha, suoMessaggio)
                conLunghezza(sha, mio)
            }
            conLunghezza(sha, TalosEd25519.scrivi(condiviso))
            conLunghezza(sha, improntaPassword!!)
            return sha.digest()
        }
    }

    /**
     * Il numero little-endian ridotto modulo l'ordine del sottogruppo.
     *
     * ⛔ Little-endian: `BigInteger` è big-endian, e leggere questi byte nel
     * verso naturale dà un numero completamente diverso — plausibile, e
     * sbagliato.
     */
    fun riduci(byteLittleEndian: ByteArray): BigInteger =
        BigInteger(1, ByteArray(byteLittleEndian.size) { byteLittleEndian[byteLittleEndian.size - 1 - it] })
            .mod(TalosEd25519.L)

    /**
     * Rende lo scalare un multiplo di otto aggiungendo `L`, `2L`, `4L`.
     *
     * ⛔ NON riducendo dopo. Il punto è proprio che il valore esca dall'intervallo
     * `[0, L)`: su `M` e `N`, che hanno una componente di ordine piccolo,
     * aggiungere `L` **cambia il risultato**, ed è lì che il cofattore si
     * cancella. In BoringSSL nasce da un `left_shift_3` dimenticato per un
     * errore di copia-incolla, aggirato invece che corretto per non rompere i
     * dispositivi già usciti.
     */
    fun correggiCofattore(scalare: BigInteger): BigInteger {
        var risultato = scalare
        if (risultato.testBit(0)) risultato = risultato.add(TalosEd25519.L)
        if (risultato.testBit(1)) risultato = risultato.add(TalosEd25519.L.shiftLeft(1))
        if (risultato.testBit(2)) risultato = risultato.add(TalosEd25519.L.shiftLeft(2))
        return risultato
    }

    /**
     * Un pezzo di trascrizione: otto byte di lunghezza, little-endian, poi i dati.
     *
     * ⛔ Senza la lunghezza davanti, due campi adiacenti si possono confondere:
     * un nome che finisce dove ne comincia un altro produce la stessa
     * trascrizione di una coppia diversa di nomi.
     */
    fun conLunghezza(sha: MessageDigest, dati: ByteArray) {
        sha.update(
            ByteBuffer.allocate(8).order(ByteOrder.LITTLE_ENDIAN)
                .putLong(dati.size.toLong()).array(),
        )
        sha.update(dati)
    }

    /** Solo per le costanti scritte in esadecimale qui dentro. */
    private fun daEsa(testo: String): ByteArray {
        val fuori = ByteArrayOutputStream()
        for (i in testo.indices step 2) {
            fuori.write(testo.substring(i, i + 2).toInt(16))
        }
        return fuori.toByteArray()
    }
}
