package ai.talos.terminal

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * ⛔ Difetto 6 del ledger B3, trovato sul Pad il 24/09/2026: dopo reinstallazione e riavvio dell'app restavano DUE
 * `node …/harness-ui/server.mjs` (PPID 1). Il plugin mandava UN `kill` al solo pid del file e rilanciava subito: se il
 * vecchio non usciva (un flusso di eventi aperto lo teneva vivo) restava lì per sempre, e un server rimasto da prima non
 * era nemmeno nel file. Queste prove fissano lo schema «SIGTERM, grazia, poi SIGKILL» (`docker stop`,
 * https://docs.docker.com/reference/cli/docker/container/stop/, letto il 24/09/2026), la ricerca di TUTTI i server in
 * corso, e che non si tocca un pid che non è il nostro server (i pid si riciclano).
 */
class TalosArrestoServerTest {

    private val SERVER = "/data/local/tmp/talos/AVM/harness-ui/server.mjs"

    /** Un processo finto: vive finché non riceve un segnale che lo fa uscire, dopo `passiPerUscire` controlli. */
    private class Processo(
        var riga: String,
        val esceConTerm: Boolean,
        val esceConKill: Boolean = true,
        var passiPerUscire: Int = 0,
    ) {
        var vivo = true
        val segnali = mutableListOf<String>()
        var controlli = 0

        fun segnala(segnale: String?) {
            segnali += segnale ?: "TERM"
            if ((segnale == null && esceConTerm) || (segnale == "-9" && esceConKill)) {
                if (passiPerUscire == 0) vivo = false
            }
        }

        fun controlla(): Boolean {
            controlli += 1
            if (vivo && segnali.isNotEmpty() && passiPerUscire > 0) {
                passiPerUscire -= 1
                val ultimo = segnali.last()
                if (passiPerUscire == 0 && ((ultimo == "TERM" && esceConTerm) || (ultimo == "-9" && esceConKill))) vivo = false
            }
            return vivo
        }
    }

    private fun ferma(processo: Processo, dormito: MutableList<Long> = mutableListOf()) =
        TalosArrestoServer.ferma(
            pid = "28570",
            percorsoServer = SERVER,
            rigaDiComando = { if (processo.vivo) processo.riga else "" },
            vivo = { processo.controlla() },
            segnala = { _, segnale -> processo.segnala(segnale) },
            dormi = { ms -> dormito += ms },
            graziaMs = 3_000,
            passoMs = 200,
        )

    @Test
    fun `ARRESTO-01 un server che esce col SIGTERM non riceve SIGKILL`() {
        val processo = Processo("node\u0000$SERVER\u0000", esceConTerm = true, passiPerUscire = 2)

        assertEquals(TalosArrestoServer.Esito.USCITO, ferma(processo))
        assertEquals(listOf("TERM"), processo.segnali)
    }

    @Test
    fun `ARRESTO-02 un server che ignora il SIGTERM riceve SIGKILL solo dopo la grazia`() {
        val processo = Processo("node\u0000$SERVER\u0000", esceConTerm = false)
        val dormito = mutableListOf<Long>()

        assertEquals(TalosArrestoServer.Esito.FORZATO, ferma(processo, dormito))
        assertEquals(listOf("TERM", "-9"), processo.segnali)
        assertEquals(3_000L, dormito.sum())
    }

    @Test
    fun `ARRESTO-03 un pid che non è il nostro server non riceve nessun segnale`() {
        val altro = Processo("/system/bin/sh\u0000-c\u0000qualcos'altro\u0000", esceConTerm = true)
        assertEquals(TalosArrestoServer.Esito.NON_NOSTRO, ferma(altro))
        assertEquals(emptyList<String>(), altro.segnali)

        val sparito = Processo("node\u0000$SERVER\u0000", esceConTerm = true).apply { vivo = false }
        assertEquals(TalosArrestoServer.Esito.NON_NOSTRO, ferma(sparito))
        assertEquals(emptyList<String>(), sparito.segnali)
    }

    @Test
    fun `ARRESTO-04 un processo che sopravvive anche al SIGKILL si dice, non si nasconde`() {
        val processo = Processo("node\u0000$SERVER\u0000", esceConTerm = false, esceConKill = false)

        assertEquals(TalosArrestoServer.Esito.ANCORA_VIVO, ferma(processo))
        assertEquals(listOf("TERM", "-9"), processo.segnali)
    }

    @Test
    fun `ARRESTO-05 dall'elenco dei processi si prendono TUTTI i server del Codice e nient'altro`() {
        val ps = """
            PID ARGS
            1658 node /data/local/tmp/talos/AVM/harness-ui/server.mjs
            28570 node /data/local/tmp/talos/AVM/harness-ui/server.mjs
            3021 node /data/local/tmp/talos/talos-exec.js
            4410 node /data/local/tmp/altro/harness-ui/server.mjs
            5120 /system/bin/sh -c cat /data/local/tmp/talos/AVM/harness-ui/server.mjs
            6001 cat /data/local/tmp/talos/AVM/harness-ui/server.mjs
              77 /data/local/tmp/talos/node /data/local/tmp/talos/AVM/harness-ui/server.mjs
        """.trimIndent()

        val trovati = TalosArrestoServer.serverInCorso(ps, SERVER)

        assertEquals(listOf("1658", "28570", "77"), trovati)
        // Chi LEGGE il file (dal terminale del Codice, per esempio) non è il server.
        assertTrue(trovati.none { it == "5120" || it == "6001" })
    }
}
