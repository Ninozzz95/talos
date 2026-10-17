package ai.talos.agent

import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import java.io.IOException
import java.net.URI
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit
import okhttp3.Call
import okhttp3.Callback
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response

/**
 * N15 — IL FLUSSO NATIVO (owner 13/10/2026, dal Pad: «c'è molto delay da quando invio la domanda a quando ricevo la
 * risposta» → «Sì, risposta a pezzi»).
 *
 * MISURATO sul Pad: dalla pagina il flusso verso `api.openai.com` non riesce mai (le origini di pagina sono rifiutate), e
 * `CapacitorHttp` torna la risposta solo quando è finita. Qui OkHttp (già nell'app) legge il corpo MENTRE arriva e lo
 * consegna alla pagina a righe intere: il lettore degli eventi resta uno solo, quello in JavaScript
 * (`createTalosSseAccumulator`). Vedi `src/lib/chat/providers/flussoNativo.ts`.
 *
 * ⛔ Questo plugin scavalca il CORS portando un token: è CHIUSO PER DIFETTO. Solo `https`, solo gli host di
 * [HOST_AMMESSI], nessun redirect seguito. Un host nuovo si aggiunge qui, con la sua ragione.
 * ⛔ Nel registro non finisce MAI un'intestazione, il corpo o il testo che passa.
 */
@CapacitorPlugin(name = "TalosFlussoHttp")
class TalosFlussoHttpPlugin : Plugin() {
    private val cliente: OkHttpClient by lazy {
        OkHttpClient.Builder()
            .followRedirects(false)
            .followSslRedirects(false)
            .connectTimeout(30, TimeUnit.SECONDS)
            // Il silenzio lo misura la pagina (60 s fra i pezzi, 180 s al primo) e chiude lei: qui un tetto largo,
            // perché un flusso senza tetto che nessuno chiude resterebbe aperto per sempre.
            .readTimeout(200, TimeUnit.SECONDS)
            .build()
    }
    private val aperti = ConcurrentHashMap<String, Call>()

    @PluginMethod
    fun apri(call: PluginCall) {
        val id = call.getString("id")
        val url = call.getString("url")
        val corpo = call.getString("body")
        if (id.isNullOrBlank() || url.isNullOrBlank() || corpo == null) {
            call.reject("TALOS_FLUSSO_RICHIESTA_INCOMPLETA", "TALOS_FLUSSO_RICHIESTA_INCOMPLETA")
            return
        }
        if (!ammesso(url)) {
            call.reject("TALOS_FLUSSO_HOST_NON_AMMESSO", "TALOS_FLUSSO_HOST_NON_AMMESSO")
            return
        }
        val richiesta = try {
            val costruttore = Request.Builder().url(url)
            val intestazioni = call.getObject("headers")
            var tipo = "application/json"
            intestazioni?.keys()?.forEach { nome ->
                val valore = intestazioni.getString(nome) ?: return@forEach
                if (nome.equals("content-type", ignoreCase = true)) tipo = valore else costruttore.header(nome, valore)
            }
            costruttore.header("accept", "text/event-stream")
            costruttore.post(corpo.toRequestBody(tipo.toMediaType())).build()
        } catch (guasto: Throwable) {
            call.reject("TALOS_FLUSSO_RICHIESTA_NON_VALIDA", "TALOS_FLUSSO_RICHIESTA_NON_VALIDA")
            return
        }
        val chiamata = cliente.newCall(richiesta)
        aperti[id] = chiamata
        chiamata.enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                aperti.remove(id)
                // Chiuso da noi (Stop, silenzio, schermata chiusa): la pagina lo sa già, non è un guasto da raccontare.
                if (call.isCanceled()) return
                manda("talosFlussoGuasto", id) { put("messaggio", e.javaClass.simpleName) }
            }

            override fun onResponse(call: Call, response: Response) {
                response.use { risposta ->
                    try {
                        if (!risposta.isSuccessful) {
                            val dettaglio = runCatching { risposta.peekBody(DETTAGLIO_MASSIMO.toLong()).string() }.getOrDefault("")
                            manda("talosFlussoFine", id) {
                                put("stato", risposta.code)
                                put("dettaglio", dettaglio.take(DETTAGLIO_MASSIMO))
                                risposta.header("retry-after")?.let { put("retryAfter", it) }
                            }
                            return
                        }
                        val sorgente = risposta.body.source()
                        val pezzo = StringBuilder()
                        while (true) {
                            // Una riga INTERA alla volta: un carattere non resta mai a cavallo di due consegne.
                            val riga = sorgente.readUtf8Line() ?: break
                            pezzo.append(riga).append('\n')
                            // Si consegna quando non c'è altro già arrivato: poche traversate del ponte, nessuna attesa.
                            if (sorgente.buffer.size == 0L || pezzo.length >= PEZZO_MASSIMO) {
                                val testo = pezzo.toString()
                                pezzo.setLength(0)
                                manda("talosFlussoPezzo", id) { put("testo", testo) }
                            }
                        }
                        if (pezzo.isNotEmpty()) manda("talosFlussoPezzo", id) { put("testo", pezzo.toString()) }
                        manda("talosFlussoFine", id) { put("stato", risposta.code) }
                    } catch (guasto: IOException) {
                        if (!call.isCanceled()) manda("talosFlussoGuasto", id) { put("messaggio", guasto.javaClass.simpleName) }
                    } finally {
                        aperti.remove(id)
                    }
                }
            }
        })
        call.resolve()
    }

    @PluginMethod
    fun chiudi(call: PluginCall) {
        call.getString("id")?.let { aperti.remove(it)?.cancel() }
        call.resolve()
    }

    override fun handleOnDestroy() {
        // Un flusso aperto non sopravvive alla sua schermata.
        aperti.values.forEach { it.cancel() }
        aperti.clear()
        super.handleOnDestroy()
    }

    private fun manda(evento: String, id: String, riempi: JSObject.() -> Unit) {
        notifyListeners(evento, JSObject().apply { put("id", id); riempi() })
    }

    companion object {
        /**
         * Gli host a cui questo plugin può portare un token. `api.openai.com`: il piano ChatGPT (N15), che parla con
         * l'API Responses e dalla pagina non è raggiungibile.
         */
        val HOST_AMMESSI: Set<String> = setOf("api.openai.com")

        /** Quanto del corpo di un rifiuto si riporta alla pagina: lo stesso limite del flusso della pagina. */
        const val DETTAGLIO_MASSIMO = 512

        /** Oltre questa misura un pezzo si consegna comunque, anche se altro è già arrivato. */
        const val PEZZO_MASSIMO = 16 * 1024

        /** Solo `https`, solo un host ammesso scritto per intero, sulla porta di serie, senza credenziali nell'indirizzo. */
        fun ammesso(url: String): Boolean {
            val indirizzo = runCatching { URI(url) }.getOrNull() ?: return false
            if (!"https".equals(indirizzo.scheme, ignoreCase = true)) return false
            if (indirizzo.userInfo != null) return false
            if (indirizzo.port != -1 && indirizzo.port != 443) return false
            val host = indirizzo.host?.lowercase() ?: return false
            return host in HOST_AMMESSI
        }
    }
}
