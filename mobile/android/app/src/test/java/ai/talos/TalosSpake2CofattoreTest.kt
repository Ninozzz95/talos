package ai.talos

import ai.talos.agent.ponte.TalosEd25519
import ai.talos.agent.ponte.TalosSpake2
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.math.BigInteger

/**
 * ⛔⛔⭐ IL LIMITE DELLE PROVE DI ANDATA E RITORNO, misurato invece che supposto.
 *
 * ## Come me ne sono accorto
 *
 * Ho iniettato di proposito la regressione peggiore che conoscessi — ridurre lo
 * scalare della password modulo `L` **dopo** la correzione del cofattore, che è
 * esattamente ciò che BoringSSL evita di fare — e **nessuna prova è diventata
 * rossa**.
 *
 * ## Perché, ed è una lezione generale
 *
 * Una prova di andata e ritorno mette in comunicazione due lati che eseguono
 * **lo stesso codice**. Un errore commesso identicamente da tutti e due **si
 * cancella**: le due chiavi restano uguali, e la prova resta verde. Quella prova
 * dimostra la coerenza interna, non la compatibilità con l'altro capo.
 *
 * ⇒ Vale per tutto SPAKE2: la sola prova che significhi «BoringSSL ci
 * capirebbe» è il telefono vero, oppure un valore noto calcolato da BoringSSL.
 * Finché non c'è nessuno dei due, quel pezzo NON è verificato, e va detto.
 *
 * ## Cosa invece si può misurare qui
 *
 * Se la correzione del cofattore cambi davvero qualcosa su QUESTI due punti:
 * dipende dal fatto che `M` e `N` abbiano o no una componente di ordine piccolo,
 * e quello è un fatto della curva, non del nostro codice.
 */
class TalosSpake2CofattoreTest {

    private val OTTO = BigInteger.valueOf(8)

    /**
     * `L·M` e `L·N`: se vengono il neutro, i due punti stanno nel sottogruppo
     * primo e la correzione del cofattore è ininfluente su di loro. Se non
     * vengono il neutro, la correzione conta e sbagliarla romperebbe tutto.
     *
     * Questa prova non impone un esito: **registra quale dei due mondi è il
     * nostro**, così che chi legge sappia quanto valgono le altre prove.
     */
    @Test
    fun `registra se M e N stanno nel sottogruppo primo`() {
        val lm = TalosEd25519.perGrezzo(TalosEd25519.L, TalosSpake2.M)
        val ln = TalosEd25519.perGrezzo(TalosEd25519.L, TalosSpake2.N)

        println("L*M neutro? ${lm.neutro()}   L*N neutro? ${ln.neutro()}")
        println("L*M = $lm")
        println("L*N = $ln")

        // Qualunque sia l'esito, restano punti della curva: se qui fallisse,
        // sarebbe la nostra aritmetica a essere rotta, non un fatto su M e N.
        assertTrue(TalosEd25519.sullaCurva(lm))
        assertTrue(TalosEd25519.sullaCurva(ln))
    }

    /**
     * ⭐⭐ LA PROVA CHE IL ROUND-TRIP NON POTEVA FARE.
     *
     * Non confronta i due lati fra loro — quelli si cancellano gli errori a
     * vicenda. Confronta il messaggio prodotto con quello **ricalcolato a mano**
     * nei due modi possibili, e pretende che sia quello con lo scalare NON
     * ridotto.
     *
     * ⛔ È l'unica forma che avrebbe preso la regressione che avevo iniettato e
     * che era passata verde: qui la prenderebbe.
     */
    @Test
    fun `il messaggio usa lo scalare NON ridotto, e si vede`() {
        // Serve una password su cui i due scalari diano punti diversi: non tutte
        // lo fanno, perche' la differenza e' un multiplo di L e conta solo
        // quando quel multiplo e' dispari sul pezzo di ordine due.
        var password: String? = null
        for (n in 0 until 400) {
            val pw = "%06d".format(n)
            val grezzo = TalosSpake2.riduci(
                java.security.MessageDigest.getInstance("SHA-512").digest(pw.toByteArray()),
            )
            val corretto = TalosSpake2.correggiCofattore(grezzo)
            if (TalosEd25519.perGrezzo(corretto, TalosSpake2.M)
                != TalosEd25519.perGrezzo(corretto.mod(TalosEd25519.L), TalosSpake2.M)
            ) {
                password = pw
                break
            }
        }
        assertTrue("serve una password dove la correzione si vede", password != null)
        println("password che rende osservabile la correzione: $password")

        val seme: (Int) -> ByteArray = { quanti -> ByteArray(quanti) { 5 } }
        val messaggio = TalosSpake2.Lato(
            TalosSpake2.Ruolo.ALICE,
            "a".toByteArray(), "b".toByteArray(), seme,
        ).generaMessaggio(password!!.toByteArray())

        val privato = TalosSpake2.riduci(seme(64)).multiply(BigInteger.valueOf(8))
        val grezzo = TalosSpake2.riduci(
            java.security.MessageDigest.getInstance("SHA-512").digest(password.toByteArray()),
        )
        val corretto = TalosSpake2.correggiCofattore(grezzo)

        fun atteso(scalare: BigInteger) = TalosEd25519.scrivi(
            TalosEd25519.somma(
                TalosEd25519.perGrezzo(privato, TalosEd25519.BASE),
                TalosEd25519.perGrezzo(scalare, TalosSpake2.M),
            ),
        )

        assertTrue(
            "il messaggio deve usare lo scalare NON ridotto",
            messaggio.contentEquals(atteso(corretto)),
        )
        assertFalse(
            "e NON quello ridotto",
            messaggio.contentEquals(atteso(corretto.mod(TalosEd25519.L))),
        )
    }

    /**
     * ⛔ La differenza fra scalare corretto e scalare ridotto, sul punto `M`.
     *
     * Se i due danno lo STESSO punto, allora la correzione non fa niente qui, e
     * la prova di andata e ritorno non poteva accorgersene. Se danno punti
     * diversi, il difetto è osservabile e va coperto da una prova sua.
     */
    @Test
    fun `misura se la correzione del cofattore cambia il punto mascherato`() {
        val impronta = java.security.MessageDigest.getInstance("SHA-512")
            .digest("123456".toByteArray())
        val grezzo = TalosSpake2.riduci(impronta)
        val corretto = TalosSpake2.correggiCofattore(grezzo)

        val conCorrezione = TalosEd25519.perGrezzo(corretto, TalosSpake2.M)
        val senzaCorrezione = TalosEd25519.perGrezzo(corretto.mod(TalosEd25519.L), TalosSpake2.M)

        println("scalare grezzo multiplo di 8? ${grezzo.mod(OTTO).signum() == 0}")
        println("corretto == grezzo? ${corretto == grezzo}")
        println("il punto cambia? ${conCorrezione != senzaCorrezione}")

        // Il fatto certo, che non dipende dai punti: la correzione produce
        // sempre un multiplo di otto, e ridurre mod L lo distrugge quando i tre
        // bit bassi non erano gia' a zero.
        assertTrue(corretto.mod(OTTO).signum() == 0)
        if (grezzo.mod(OTTO).signum() != 0) {
            assertFalse(corretto.mod(TalosEd25519.L).mod(OTTO).signum() == 0)
        }
    }
}
