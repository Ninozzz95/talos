package ai.talos.agent.ponte

import android.net.ssl.SSLSockets
import android.os.Build
import java.math.BigInteger
import java.net.InetSocketAddress
import java.net.Socket
import java.security.KeyPair
import java.security.KeyStore
import java.security.cert.X509Certificate
import javax.net.ssl.KeyManagerFactory
import javax.net.ssl.SSLContext
import javax.net.ssl.SSLSocket
import javax.net.ssl.X509TrustManager

/**
 * ⭐⭐⭐ L'ACCOPPIAMENTO — le sei cifre, e nient'altro da fare.
 *
 * ## Il percorso, per intero
 *
 * 1. Ci si collega alla porta **temporanea** che il dialogo «Accoppia con
 *    codice» apre. Non è quella della connessione: vive quanto il dialogo.
 * 2. **TLS** col nostro certificato autofirmato. Il certificato dell'altro si
 *    accetta **senza verificarlo**, ed è giusto così: la fiducia non nasce da
 *    un'autorità, nasce dalle sei cifre che la persona legge sul proprio
 *    schermo. `adbd` fa esattamente lo stesso dalla sua parte.
 * 3. Si esportano **64 byte dal TLS** e si attaccano in coda alle sei cifre:
 *    quella è la password di SPAKE2. Serve a legare la stretta a *questa*
 *    connessione, così che nessuno possa rubarla a metà.
 * 4. Si scambia il messaggio SPAKE2, e ne esce una chiave condivisa.
 * 5. Con quella si cifra e si spedisce chi siamo — la nostra chiave pubblica.
 *    Da quel momento il telefono si fida di noi, per sempre.
 *
 * ## ⛔ Il confine, misurato
 *
 * `SSLSockets.exportKeyingMaterial` è API **pubblica da Android 12** (API 31 —
 * verificato su `api-versions.xml`). Sotto non c'è, e non c'è nemmeno di
 * nascosto in un modo su cui si possa contare.
 *
 * ⇒ Android 11 è l'unica versione dove il Debug wireless esiste ma questo non
 * si può fare. Si dice, invece di fallire in modo illeggibile: una persona che
 * non può fare una cosa ha diritto di sapere **perché**, e che non è colpa sua.
 */
internal object TalosAdbAccoppiamento {

    /**
     * ⛔ L'etichetta RFC 5705 dell'esportazione, **con lo ZERO finale**.
     *
     * Stessa trappola dei nomi SPAKE2, nello stesso protocollo, a due file di
     * distanza: in AOSP e' `kExportedKeyLabel[] = "adb-label"` e la lunghezza
     * passata a `SSL_export_keying_material` e' `sizeof(...)` — quindi **dieci
     * byte**, non nove. Un byte di differenza e i 64 byte esportati sono altri,
     * quindi la password di SPAKE2 e' altra, quindi l'accoppiamento fallisce
     * dicendo «codice sbagliato» su un codice giusto.
     *
     * Scritta come sequenza di fuga: un byte zero dentro una stringa e'
     * invisibile a chi rilegge.
     */
    private const val ETICHETTA = "adb-label\u0000"

    /** Quanti byte si esportano dal TLS e si attaccano alla password. */
    private const val ESPORTATI = 64

    /** Come è finita. Ogni valore porta a un rimedio diverso. */
    enum class Esito {
        /** Accoppiati: la nostra chiave è fra quelle di cui il telefono si fida. */
        FATTO,

        /** Il codice a sei cifre non è quello giusto. */
        CODICE_SBAGLIATO,

        /** Non ci si è arrivati: porta chiusa, dialogo già chiuso, rete assente. */
        NON_RAGGIUNGIBILE,

        /** Android troppo vecchio: sotto la 12 non si può, e non è colpa nostra. */
        ANDROID_TROPPO_VECCHIO,

        /** L'altro capo ha parlato in un modo che non riconosciamo. */
        DIALOGO_ROTTO,
    }

    data class Risultato(val esito: Esito, val dettaglio: String = "")

    /** Se questo telefono può accoppiarsi da solo. Una risposta onesta, prima. */
    fun possibile(): Boolean = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S

    /**
     * Fa l'accoppiamento e basta.
     *
     * @param indirizzo la porta **dell'accoppiamento**, quella del dialogo.
     * @param codice le sei cifre.
     * @param coppia la nostra chiave, la stessa che poi useremo per collegarci.
     * @param nome quello che la persona vedrà nell'elenco dei dispositivi.
     */
    fun accoppia(
        indirizzo: String,
        porta: Int,
        codice: String,
        coppia: KeyPair,
        nome: String,
        attesaMs: Int = 15_000,
        adesso: Long = 0L,
    ): Risultato {
        if (!possibile()) return Risultato(Esito.ANDROID_TROPPO_VECCHIO)
        if (!codice.matches(Regex("""^\d{6}$"""))) {
            return Risultato(Esito.CODICE_SBAGLIATO, "il codice e' di sei cifre")
        }

        val certificato = TalosAdbCertificato.crea(
            coppia,
            nome,
            daMs = adesso,
            aMs = adesso + DIECI_ANNI,
            seriale = BigInteger.ONE,
        )

        var presa: SSLSocket? = null
        return try {
            presa = apri(indirizzo, porta, coppia, certificato, attesaMs)

            // ⛔ La password NON e' il codice: e' il codice PIU' i 64 byte
            // esportati dal TLS. Senza, la stretta si potrebbe rubare a meta'.
            val esportati = SSLSockets.exportKeyingMaterial(
                presa, ETICHETTA, null, ESPORTATI,
            ) ?: return Risultato(Esito.DIALOGO_ROTTO, "esportazione non riuscita")
            val password = codice.toByteArray(Charsets.UTF_8) + esportati

            // Noi siamo chi si accoppia: nel protocollo di adb, il CLIENT.
            val lato = TalosSpake2.Lato(TalosSpake2.Ruolo.ALICE, NOME_CLIENT, NOME_SERVER)
            TalosAdbPacchetto.spedisci(
                presa.outputStream, TalosAdbPacchetto.SPAKE2, lato.generaMessaggio(password),
            )

            val (testaLoro, loroSpake) = TalosAdbPacchetto.ricevi(presa.inputStream)
            if (testaLoro.tipo != TalosAdbPacchetto.SPAKE2) {
                return Risultato(Esito.DIALOGO_ROTTO, "atteso SPAKE2, arrivato ${testaLoro.tipo}")
            }
            val condivisa = lato.elaboraMessaggio(loroSpake)
                ?: return Risultato(Esito.DIALOGO_ROTTO, "il loro punto non sta sulla curva")

            val cifrario = TalosAdbCifrario(condivisa)
            TalosAdbPacchetto.spedisci(
                presa.outputStream,
                TalosAdbPacchetto.PEER_INFO,
                cifrario.cifra(
                    TalosAdbPacchetto.peerInfo(
                        TalosAdbChiave.pubblicaPerAdb(TalosAdbChiave.pubblicaDi(coppia), nome),
                    ),
                ),
            )

            // ⛔ La risposta e' la PROVA che il codice era giusto: con una
            // password diversa la chiave condivisa e' diversa, e questo non si
            // decifra. E' l'unico punto in cui si scopre di aver sbagliato le
            // sei cifre — prima di qui tutto sembra andare bene.
            val (testaInfo, loroInfo) = TalosAdbPacchetto.ricevi(presa.inputStream)
            if (testaInfo.tipo != TalosAdbPacchetto.PEER_INFO) {
                return Risultato(Esito.DIALOGO_ROTTO, "atteso PEER_INFO")
            }
            if (cifrario.decifra(loroInfo) == null) {
                return Risultato(Esito.CODICE_SBAGLIATO)
            }
            Risultato(Esito.FATTO)
        } catch (rotto: TalosAdbPacchetto.Rotto) {
            Risultato(Esito.DIALOGO_ROTTO, rotto.motivo.name)
        } catch (errore: Exception) {
            // Una connessione che non si apre e una che cade a meta' sono la
            // stessa cosa per chi guarda: «non ci siamo arrivati».
            Risultato(Esito.NON_RAGGIUNGIBILE, errore.javaClass.simpleName)
        } finally {
            runCatching { presa?.close() }
        }
    }

    /** La presa TLS col nostro certificato, e la fiducia cieca sul loro. */
    private fun apri(
        indirizzo: String,
        porta: Int,
        coppia: KeyPair,
        certificato: X509Certificate,
        attesaMs: Int,
    ): SSLSocket {
        val deposito = KeyStore.getInstance(KeyStore.getDefaultType()).apply {
            load(null, null)
            setKeyEntry("talos", coppia.private, PASSWORD, arrayOf(certificato))
        }
        val chiavi = KeyManagerFactory.getInstance(KeyManagerFactory.getDefaultAlgorithm())
            .apply { init(deposito, PASSWORD) }

        val contesto = SSLContext.getInstance("TLSv1.3").apply {
            init(chiavi.keyManagers, arrayOf(FIDUCIA_CIECA), null)
        }

        val nuda = Socket()
        nuda.connect(InetSocketAddress(indirizzo, porta), attesaMs)
        nuda.soTimeout = attesaMs

        return (contesto.socketFactory.createSocket(nuda, indirizzo, porta, true) as SSLSocket)
            .apply {
                useClientMode = true
                startHandshake()
            }
    }

    /**
     * ⛔ Accetta QUALUNQUE certificato, di proposito.
     *
     * Non è una scorciatoia e non è un rischio nascosto: in questo protocollo
     * l'autenticazione **non la fa il TLS**, la fa SPAKE2 con le sei cifre. Il
     * TLS serve solo a legare la stretta a questa connessione. `adbd` fa la
     * stessa identica cosa — nel sorgente c'è scritto `// Allow any peer
     * certificate`.
     *
     * ⇒ Chi legge questa classe deve trovarci scritto il perché, o la
     * prossima persona la «riparerà» rendendola inutilizzabile.
     */
    private val FIDUCIA_CIECA = object : X509TrustManager {
        override fun checkClientTrusted(catena: Array<out X509Certificate>?, tipo: String?) {}
        override fun checkServerTrusted(catena: Array<out X509Certificate>?, tipo: String?) {}
        override fun getAcceptedIssuers(): Array<X509Certificate> = emptyArray()
    }

    /**
     * ⛔⛔ I nomi della trascrizione SPAKE2, **con lo ZERO finale**.
     *
     * In AOSP sono `static const uint8_t kClientName[] = "adb pair client"`, e
     * la lunghezza passata a `SPAKE2_CTX_new` è `sizeof(kClientName)` — NON
     * `strlen`. `sizeof` di un array inizializzato da una stringa conta anche
     * il terminatore: quindi sono **16 byte**, non 15.
     *
     * Un byte di differenza cambia la trascrizione, quindi cambia la chiave,
     * quindi l'accoppiamento fallisce — e fallisce come «codice sbagliato»,
     * mandando la persona a ricontrollare delle cifre che erano giuste.
     *
     * Scritto come concatenazione esplicita: un byte zero battuto dentro una
     * stringa è invisibile a chi rilegge, e cancellabile per sbaglio.
     */
    val NOME_CLIENT = "adb pair client".toByteArray(Charsets.UTF_8) + 0
    val NOME_SERVER = "adb pair server".toByteArray(Charsets.UTF_8) + 0

    private val PASSWORD = CharArray(0)
    private const val DIECI_ANNI = 10L * 365 * 24 * 60 * 60 * 1000
}
