package ai.talos.agent.ponte

import java.io.EOFException
import java.io.InputStream
import java.io.InterruptedIOException
import java.io.OutputStream

/**
 * ⭐⭐ IL CANALE — messaggi interi dentro e fuori, con un orologio sempre acceso.
 *
 * ## Il difetto che questa classe esiste per rendere impossibile
 *
 * Il ponte vecchio si è piantato in un girello senza fine perché aspettava una
 * lettura **senza orologio**: il timeout stava scritto una riga più sotto, e
 * quella riga non veniva mai raggiunta. Qui non esiste una lettura senza
 * scadenza — non c'è nessun metodo che la permetta.
 *
 * ## E il secondo, che sembra teorico finché non capita
 *
 * `InputStream.read(buffer)` **può tornare con meno byte di quelli chiesti**, e
 * su una presa di rete succede sempre: i pacchetti arrivano come arrivano.
 * Chiedere 24 byte e usare quello che torna significa leggere mezza
 * intestazione, credere che il messaggio dopo cominci a metà, e trasformare il
 * resto della conversazione in rumore letto come comandi. Si legge **in ciclo,
 * fino al numero esatto**, sempre.
 *
 * ⇒ Le due regole sono qui e solo qui: chi usa il canale non può dimenticarle
 * perché non gli è dato il modo di scriverle sbagliate.
 */
internal class TalosAdbCanale(
    private val entrata: InputStream,
    private val uscita: OutputStream,
    /** Il tetto sul carico dichiarato dall'altro capo. Si abbassa dopo il `CNXN`. */
    var caricoMassimo: Int = TalosAdbMessaggio.CARICO_MASSIMO,
    /** Quanto tempo si concede a un messaggio intero. */
    private val orologio: () -> Long = System::nanoTime,
) {

    /** Un messaggio completo: intestazione già validata e carico già verificato. */
    data class Messaggio(
        val comando: Int,
        val arg0: Int,
        val arg1: Int,
        val carico: ByteArray,
    ) {
        // `ByteArray` in una data class confronta i riferimenti: qui servono i
        // contenuti, o due messaggi identici risulterebbero diversi.
        override fun equals(other: Any?): Boolean = other is Messaggio
            && comando == other.comando
            && arg0 == other.arg0
            && arg1 == other.arg1
            && carico.contentEquals(other.carico)

        override fun hashCode(): Int =
            (((comando * 31 + arg0) * 31 + arg1) * 31) + carico.contentHashCode()
    }

    /** Perché una lettura è finita male. Codici corti: finiscono nella diagnostica. */
    enum class Guasto { SCADUTO, CHIUSO, INTESTAZIONE, CARICO_CORROTTO }

    class Rotto(val guasto: Guasto, causa: Throwable? = null) : Exception(guasto.name, causa)

    /**
     * Spedisce un messaggio: intestazione e carico, e poi si svuota davvero.
     *
     * ⛔ Il `flush()` non è pignoleria. `adbd` risponde solo a un messaggio
     * **intero**; un'intestazione ferma in un buffer di uscita è un'altra attesa
     * senza fine, e assomiglia in tutto a un telefono che non risponde.
     */
    fun spedisci(comando: Int, arg0: Int, arg1: Int, carico: ByteArray = VUOTO) {
        uscita.write(TalosAdbMessaggio.intestazione(comando, arg0, arg1, carico))
        if (carico.isNotEmpty()) uscita.write(carico)
        uscita.flush()
    }

    /**
     * Riceve un messaggio intero, o fallisce entro `attesaMs`.
     *
     * La scadenza vale per **tutto** il messaggio, non per ogni singola lettura:
     * un mittente che manda un byte ogni tanto, per sempre, non deve poter
     * tenere in ostaggio il ponte rinnovando il timeout a ogni byte.
     */
    fun ricevi(attesaMs: Long): Messaggio {
        val scadenza = orologio() + attesaMs * 1_000_000
        val testa = leggiEsatto(TalosAdbMessaggio.INTESTAZIONE, scadenza)
        val letto = TalosAdbMessaggio.leggi(testa, caricoMassimo)
            .getOrElse { throw Rotto(Guasto.INTESTAZIONE, it) }

        if (letto.lunghezza == 0) {
            return Messaggio(letto.comando, letto.arg0, letto.arg1, VUOTO)
        }
        val carico = leggiEsatto(letto.lunghezza, scadenza)
        if (!TalosAdbMessaggio.caricoIntegro(letto, carico)) throw Rotto(Guasto.CARICO_CORROTTO)
        return Messaggio(letto.comando, letto.arg0, letto.arg1, carico)
    }

    /**
     * Esattamente `quanti` byte, o un guasto. Mai «quelli che sono arrivati».
     *
     * ⛔ `read` che torna `-1` è **fine del flusso**: l'altro capo ha chiuso. È
     * un esito diverso dallo scadere del tempo e va detto diverso, perché porta
     * a due rimedi diversi — riagganciarsi contro riprovare.
     */
    private fun leggiEsatto(quanti: Int, scadenza: Long): ByteArray {
        val dati = ByteArray(quanti)
        var presi = 0
        while (presi < quanti) {
            if (orologio() >= scadenza) throw Rotto(Guasto.SCADUTO)
            val n = try {
                entrata.read(dati, presi, quanti - presi)
            } catch (interrotta: InterruptedIOException) {
                // La presa ha il suo timeout, più corto della nostra scadenza:
                // scattato quello si riprova, finché la scadenza vera regge.
                if (orologio() >= scadenza) throw Rotto(Guasto.SCADUTO, interrotta)
                continue
            }
            if (n < 0) throw Rotto(Guasto.CHIUSO, EOFException())
            presi += n
        }
        return dati
    }

    private companion object {
        val VUOTO = ByteArray(0)
    }
}
