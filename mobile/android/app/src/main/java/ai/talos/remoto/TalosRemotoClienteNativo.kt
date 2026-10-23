package ai.talos.remoto

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withTimeout
import org.json.JSONObject
import java.security.SecureRandom

/**
 * ⛔ R-M5a (ledger `LEDGER-CLIENT-REMOTO-MOBILE-2026-10-20.md`, 21/10/2026): il canale di lavoro (`talos-remote/1`) parlato in NATIVO,
 * per il lavoro della sveglia che gira ad app uccisa (niente WebView, niente `clienteRemoto.ts`). Le stesse regole del cliente TS:
 * `{v:1, t:'req', n, op, args}` → `{t:'res', n, ok, data | code}` (r4 `servizio.mjs`); `{t:'error', code, n?}`. Una richiesta alla
 * volta (il lavoro fa poche letture in fila): niente iscrizioni, niente ping. I messaggi interi li taglia `TalosRemotoFilo`.
 */
class TalosRemotoClienteNativo(private val canale: TalosRemotoTrasporto.Canale) {
    sealed class Esito {
        data class Dati(val data: Any?) : Esito()
        data class Rifiuto(val codice: String) : Esito()
        /** Un errore del canale (REVOKED, NOT_PAIRED…): il PC chiude lo stream. */
        data class Canale(val codice: String) : Esito()
    }

    class ErroreNativo(val codice: String) : IllegalStateException(codice)

    private val lettore = TalosRemotoFilo.Lettore()
    private val inFila = ArrayDeque<String>()
    private val uno = Mutex()

    /** I dati della risposta (`data`), o `ErroreNativo` col codice del PC (o `DISCONNECTED`, `TIMEOUT`). */
    suspend fun richiesta(op: String, args: JSONObject = JSONObject(), tettoMs: Long = TETTO_MS): Any? = uno.withLock {
        val n = nuovoNumero()
        try {
            // revisione R-M5a (19): anche un guasto della scrittura (IrohException) diventa DISCONNECTED, come quello della lettura
            try { canale.invio.writeAll(TalosRemotoFilo.codifica(richiestaJson(n, op, args))) } catch (e: TalosRemotoFilo.ErroreFilo) { throw e } catch (e: CancellationException) { throw e } catch (e: Exception) { throw ErroreNativo("DISCONNECTED") }
            withTimeout(tettoMs) { risposta(n) }
        } catch (e: TimeoutCancellationException) {
            throw ErroreNativo("TIMEOUT")
        } catch (e: TalosRemotoFilo.ErroreFilo) {
            throw ErroreNativo(e.codice)
        }
    }

    private suspend fun risposta(n: String): Any? {
        while (true) {
            val json = inFila.removeFirstOrNull()
            if (json == null) {
                val pezzo = canale.ricezione.read(TalosRemotoTrasporto.BYTE_PER_LETTURA.toUInt())
                if (pezzo.isEmpty()) throw ErroreNativo("DISCONNECTED")
                inFila.addAll(lettore.aggiungi(pezzo))
                continue
            }
            when (val esito = interpreta(json, n)) {
                is Esito.Dati -> return esito.data
                is Esito.Rifiuto -> throw ErroreNativo(esito.codice)
                is Esito.Canale -> throw ErroreNativo(esito.codice)
                null -> Unit
            }
        }
    }

    companion object {
        const val TETTO_MS = 15_000L
        private val CODICE_VALIDO = Regex("^[A-Z][A-Z0-9_]{0,63}$")

        fun nuovoNumero(): String = ByteArray(12).also { SecureRandom().nextBytes(it) }
            .let { java.util.Base64.getUrlEncoder().withoutPadding().encodeToString(it) }

        fun richiestaJson(n: String, op: String, args: JSONObject): String =
            JSONObject().put("v", 1).put("t", "req").put("n", n).put("op", op).put("args", args).toString()

        /** Il messaggio del PC per la richiesta `n`: i dati, un rifiuto, la fine del canale, o `null` (non è per lei: si ignora). */
        fun interpreta(json: String, n: String): Esito? {
            val m = try { JSONObject(json) } catch (e: Exception) { return null }
            if (m.opt("v") != 1 || (m.opt("t") as? String).isNullOrEmpty()) return null
            val codice = (m.opt("code") as? String)?.takeIf { CODICE_VALIDO.matches(it) }
            return when (m.opt("t")) {
                "res" -> if (m.opt("n") != n) null
                    else if (m.opt("ok") == true) Esito.Dati(m.opt("data").takeUnless { it == JSONObject.NULL })
                    else Esito.Rifiuto(codice ?: "OPERATION_FAILED")
                "error" -> if (m.opt("n") == n) Esito.Rifiuto(codice ?: "BAD_MESSAGE") else if (m.has("n")) null else Esito.Canale(codice ?: "BAD_MESSAGE")
                else -> null
            }
        }
    }
}
