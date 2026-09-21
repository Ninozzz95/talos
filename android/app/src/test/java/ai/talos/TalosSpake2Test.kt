package ai.talos

import ai.talos.agent.ponte.TalosEd25519
import ai.talos.agent.ponte.TalosSpake2
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.math.BigInteger
import java.security.MessageDigest

/**
 * ⭐⭐⭐ SPAKE2, provato contro le proprietà che DEVONO valere e contro le
 * costanti pubblicate in AOSP.
 *
 * ⛔ Questo non è «una implementazione di SPAKE2»: è quella di BoringSSL,
 * tradotta, e deve tornare byte per byte perché dall'altra parte del filo c'è
 * quella. Le prove qui sotto sono l'unico modo di accorgersi di uno scostamento
 * prima del telefono — dove l'unico sintomo sarebbe «due chiavi diverse», senza
 * un errore, senza un indizio.
 */
class TalosSpake2Test {

    private fun caso(seme: Byte): (Int) -> ByteArray = { quanti -> ByteArray(quanti) { seme } }

    private fun lato(ruolo: TalosSpake2.Ruolo, io: String, lui: String, seme: Byte) =
        TalosSpake2.Lato(
            ruolo,
            io.toByteArray(Charsets.UTF_8),
            lui.toByteArray(Charsets.UTF_8),
            caso(seme),
        )

    /**
     * ⭐ LA PROPRIETÀ CENTRALE: chi conosce la stessa password arriva alla stessa
     * chiave. Se una qualunque delle quattro trappole fosse sbagliata — lo
     * scalare ridotto, il ×8 mancante, l'ordine dei nomi, la lunghezza davanti —
     * questa uguaglianza cadrebbe.
     */
    @Test
    fun `stessa password, stessa chiave dai due lati`() {
        val alice = lato(TalosSpake2.Ruolo.ALICE, "adb pair client", "adb pair server", 7)
        val bob = lato(TalosSpake2.Ruolo.BOB, "adb pair server", "adb pair client", 42)
        val password = "123456".toByteArray()

        val daAlice = alice.generaMessaggio(password)
        val daBob = bob.generaMessaggio(password)

        val chiaveA = alice.elaboraMessaggio(daBob)!!
        val chiaveB = bob.elaboraMessaggio(daAlice)!!

        assertEquals(TalosSpake2.CHIAVE, chiaveA.size)
        assertArrayEquals(chiaveA, chiaveB)
    }

    /** Password diverse: chiavi diverse, e nessuno dei due se ne accorge da solo. */
    @Test
    fun `password diverse danno chiavi diverse`() {
        val alice = lato(TalosSpake2.Ruolo.ALICE, "a", "b", 7)
        val bob = lato(TalosSpake2.Ruolo.BOB, "b", "a", 42)

        val daAlice = alice.generaMessaggio("123456".toByteArray())
        val daBob = bob.generaMessaggio("654321".toByteArray())

        assertFalse(
            alice.elaboraMessaggio(daBob)!!.contentEquals(bob.elaboraMessaggio(daAlice)!!),
        )
    }

    /** Anche i NOMI entrano nella chiave: due coppie diverse non collidono. */
    @Test
    fun `nomi diversi danno chiavi diverse, a parita di password`() {
        fun giro(nomeA: String, nomeB: String): ByteArray {
            val a = lato(TalosSpake2.Ruolo.ALICE, nomeA, nomeB, 7)
            val b = lato(TalosSpake2.Ruolo.BOB, nomeB, nomeA, 42)
            val ma = a.generaMessaggio("123456".toByteArray())
            val mb = b.generaMessaggio("123456".toByteArray())
            b.elaboraMessaggio(ma)
            return a.elaboraMessaggio(mb)!!
        }

        assertFalse(giro("uno", "due").contentEquals(giro("tre", "quattro")))
    }

    /**
     * ⛔ I due punti fissi sono quelli pubblicati in AOSP, per coordinata.
     * Sbagliarli darebbe un protocollo che funziona benissimo — con sé stesso.
     */
    @Test
    fun `M e N sono i punti pubblicati in AOSP`() {
        assertEquals(
            BigInteger("31406539342727633121250288103050113562375374900226415211311216773867585644232"),
            TalosSpake2.M.x,
        )
        assertEquals(
            BigInteger("21177308356423958466833845032658859666296341766942662650232962324899758529114"),
            TalosSpake2.M.y,
        )
        assertEquals(
            BigInteger("49918732221787544735331783592030787422991506689877079631459872391322455579424"),
            TalosSpake2.N.x,
        )
        assertEquals(
            BigInteger("54629554431565467720832445949441049581317094546788069926228343916274969994000"),
            TalosSpake2.N.y,
        )
        assertTrue(TalosEd25519.sullaCurva(TalosSpake2.M))
        assertTrue(TalosEd25519.sullaCurva(TalosSpake2.N))
        assertNotEquals(TalosSpake2.M, TalosSpake2.N)
    }

    /**
     * ⛔ LA TRAPPOLA NUMERO UNO. Lo scalare della password deve uscire multiplo
     * di otto, e per farlo si aggiungono `L`, `2L`, `4L` — **senza ridurre
     * dopo**. Ridurre annullerebbe la correzione, e `M` e `N` hanno una
     * componente di ordine piccolo dove quella differenza conta.
     */
    @Test
    fun `lo scalare della password esce multiplo di OTTO`() {
        val otto = BigInteger.valueOf(8)
        for (pw in listOf("000000", "123456", "999999", "482913", "700001")) {
            val impronta = MessageDigest.getInstance("SHA-512").digest(pw.toByteArray())
            val corretto = TalosSpake2.correggiCofattore(TalosSpake2.riduci(impronta))
            assertEquals("password $pw", BigInteger.ZERO, corretto.mod(otto))
        }
    }

    /** E resta congruo all'originale modulo L: la correzione aggiunge solo multipli. */
    @Test
    fun `la correzione aggiunge solo multipli dell ordine`() {
        val grezzo = TalosSpake2.riduci(
            MessageDigest.getInstance("SHA-512").digest("123456".toByteArray()),
        )
        val corretto = TalosSpake2.correggiCofattore(grezzo)

        assertEquals(BigInteger.ZERO, corretto.subtract(grezzo).mod(TalosEd25519.L))
        // ⛔ E NON e' stato ridotto: se lo fosse, tornerebbe uguale al grezzo.
        if (grezzo.mod(BigInteger.valueOf(8)).signum() != 0) {
            assertNotEquals(grezzo, corretto)
            assertTrue(corretto > TalosEd25519.L)
        }
    }

    /**
     * ⛔ LA TRAPPOLA NUMERO QUATTRO: ogni pezzo della trascrizione porta davanti
     * la sua lunghezza in OTTO byte little-endian. Senza, due campi adiacenti si
     * possono confondere e coppie di nomi diverse producono la stessa chiave.
     */
    @Test
    fun `la lunghezza davanti e di otto byte little-endian`() {
        val sha = MessageDigest.getInstance("SHA-512")
        TalosSpake2.conLunghezza(sha, "ab".toByteArray())
        val conPrefisso = sha.digest()

        val atteso = MessageDigest.getInstance("SHA-512").digest(
            byteArrayOf(2, 0, 0, 0, 0, 0, 0, 0) + "ab".toByteArray(),
        )
        assertArrayEquals(atteso, conPrefisso)
    }

    /**
     * ⛔ Se la lunghezza NON ci fosse, «ab» + «c» e «a» + «bc» darebbero la
     * stessa trascrizione. Questa prova mostra che non è così.
     */
    @Test
    fun `senza il prefisso due spezzature diverse collidono, col prefisso no`() {
        fun conPrefisso(vararg pezzi: ByteArray): ByteArray {
            val sha = MessageDigest.getInstance("SHA-512")
            for (p in pezzi) TalosSpake2.conLunghezza(sha, p)
            return sha.digest()
        }

        assertFalse(
            conPrefisso("ab".toByteArray(), "c".toByteArray())
                .contentEquals(conPrefisso("a".toByteArray(), "bc".toByteArray())),
        )
    }

    /** Il messaggio è un punto vero: 32 byte, sulla curva. */
    @Test
    fun `il messaggio generato e un punto sulla curva`() {
        val messaggio = lato(TalosSpake2.Ruolo.ALICE, "a", "b", 3)
            .generaMessaggio("123456".toByteArray())

        assertEquals(TalosSpake2.MESSAGGIO, messaggio.size)
        val punto = TalosEd25519.leggi(messaggio)
        assertTrue(punto != null && TalosEd25519.sullaCurva(punto))
    }

    /** 32 byte che non sono un punto vanno rifiutati, non elaborati. */
    @Test
    fun `un messaggio che non e un punto viene RIFIUTATO`() {
        val alice = lato(TalosSpake2.Ruolo.ALICE, "a", "b", 3)
        alice.generaMessaggio("123456".toByteArray())

        // Cercato: 32 byte che non stanno sulla curva.
        var spazzatura: ByteArray? = null
        for (seme in 0 until 60) {
            val prova = ByteArray(32) { ((seme * 17 + it * 5) and 0xFF).toByte() }
            prova[31] = (prova[31].toInt() and 0x7F).toByte()
            if (TalosEd25519.leggi(prova) == null) { spazzatura = prova; break }
        }
        assertTrue("serve un valore fuori dalla curva", spazzatura != null)

        assertNull(alice.elaboraMessaggio(spazzatura!!))
        assertNull(alice.elaboraMessaggio(ByteArray(31)))
    }

    /** Un lato si usa una volta sola: riusarlo riuserebbe lo scalare privato. */
    @Test
    fun `un lato rifiuta di generare due volte`() {
        val alice = lato(TalosSpake2.Ruolo.ALICE, "a", "b", 3)
        alice.generaMessaggio("123456".toByteArray())
        assertTrue(
            runCatching { alice.generaMessaggio("123456".toByteArray()) }
                .exceptionOrNull() is IllegalStateException,
        )
    }

    /**
     * Con casualità diversa la chiave cambia — cioè lo scalare privato conta
     * davvero, e non stiamo derivando la chiave dalla sola password.
     */
    @Test
    fun `casualita diversa, chiave diversa`() {
        fun giro(semeA: Byte, semeB: Byte): ByteArray {
            val a = lato(TalosSpake2.Ruolo.ALICE, "a", "b", semeA)
            val b = lato(TalosSpake2.Ruolo.BOB, "b", "a", semeB)
            val ma = a.generaMessaggio("123456".toByteArray())
            val mb = b.generaMessaggio("123456".toByteArray())
            val chiaveB = b.elaboraMessaggio(ma)!!
            assertArrayEquals(a.elaboraMessaggio(mb)!!, chiaveB)
            return chiaveB
        }

        assertFalse(giro(7, 42).contentEquals(giro(9, 42)))
    }

    /** La riduzione legge little-endian: nel verso sbagliato darebbe un altro numero. */
    @Test
    fun `riduci legge little-endian`() {
        // 1 in little-endian su 8 byte.
        assertEquals(
            BigInteger.ONE,
            TalosSpake2.riduci(byteArrayOf(1, 0, 0, 0, 0, 0, 0, 0)),
        )
        assertEquals(
            BigInteger.valueOf(256),
            TalosSpake2.riduci(byteArrayOf(0, 1, 0, 0, 0, 0, 0, 0)),
        )
    }
}
