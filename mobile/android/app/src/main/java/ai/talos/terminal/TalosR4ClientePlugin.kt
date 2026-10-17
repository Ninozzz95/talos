package ai.talos.terminal

import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import java.io.IOException
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit
import okhttp3.Call
import okhttp3.Callback
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import okio.ByteString
import okio.ByteString.Companion.toByteString

/**
 * K3-B1 (ledger `LEDGER-K3-CODICE-COME-LA-CHAT-2026-10-15.md`): le regole del client nativo di r4, pure e provate in JVM.
 *
 * Perché dal nativo: la WebView sta su `https://localhost`, r4 su `http://127.0.0.1:<porta>`. Il cookie del token è SameSite=Strict
 * e le guardie d'origine di r4 (Nino1, 15/10, r4 @ 088ad20d2: Host di loopback, cookie su /api, scritture senza Origin né
 * Sec-Fetch-Site, `rifiutoOrigineApprovazione`) fanno passare un client che non manda Origin e porta il cookie. Il token lo aggiunge
 * il nativo: la pagina non lo vede mai.
 */
object TalosR4Rotte {
    val METODI = setOf("GET", "POST")
    private val PERCORSO = Regex("^/api/v1(/[A-Za-z0-9._~-]+)+(\\?[A-Za-z0-9._~=&%-]*)?$")

    /** Solo l'API v1 di r4: segmenti semplici, niente `..`, `%2e`, `//`, schema, host, frammento o a capo. */
    fun percorsoAmmesso(percorso: String): Boolean {
        if (!PERCORSO.matches(percorso)) return false
        val solo = percorso.substringBefore('?')
        return solo.split('/').none { it == "." || it == ".." } && !solo.contains('%')
    }

    fun indirizzo(porta: Int, percorso: String): String {
        require(percorsoAmmesso(percorso)) { "path not allowed for r4" }
        return "http://127.0.0.1:$porta$percorso"
    }

    /** K3-C Allegati A2: il tetto di un'immagine riletta (`CHAT_IMAGES_MAX_BYTES` di r4, il totale delle immagini di un messaggio). */
    const val MASSIMO_IMMAGINE = 12 * 1024 * 1024
    private val ID_IMMAGINE = Regex("^[a-f0-9]{64}$")

    /** K3-C Allegati A2: l'unica rotta da cui si rilegge un'immagine intera (`GET /api/v1/chat-images/<id>`, `http-app.mjs:1830`). */
    fun percorsoImmagine(id: String): String {
        require(ID_IMMAGINE.matches(id)) { "image id not allowed" }
        return "/api/v1/chat-images/$id"
    }

    /** K3-C Allegati A3: il tetto di un file allegato (`MAX_CHAT_FILE_BYTES` di `chat-file-upload.mjs` @ 2161afb32). */
    const val MASSIMO_FILE = 25L * 1024 * 1024
    /** I byte entro cui il testo di un file torna col messaggio (`TETTI_ALLEGATI.caratteriPerAllegato`, BUG-20 del desktop). */
    const val MASSIMO_TESTO = 200_000
    /** Il tetto di un'immagine scelta come file (`allegaFile` del desktop: 5 MiB per immagine). */
    const val MASSIMO_IMMAGINE_SCELTA = 5 * 1024 * 1024

    /**
     * `validName` dell'helper del desktop (`native/chat-file-upload/main.go`): non vuoto, al massimo 255 byte UTF-8, senza `/`, `\` o
     * NUL, testo valido. In più: `.` e `..` non sono nomi di file. Il nome viene dal provider del documento: non è affidabile
     * (Android, «Improperly trusting ContentProvider-provided filename»; OWASP MASTG-BEST-0057).
     */
    fun nomeAllegatoValido(nome: String): Boolean {
        if (nome.isEmpty() || nome == "." || nome == "..") return false
        if (nome.any { it == '/' || it == '\\' || it == '\u0000' }) return false
        var i = 0
        while (i < nome.length) {
            val c = nome[i]
            if (c.isHighSurrogate()) {
                if (i + 1 >= nome.length || !nome[i + 1].isLowSurrogate()) return false
                i += 2
                continue
            }
            if (c.isLowSurrogate()) return false
            i++
        }
        return byteUtf8(nome) <= 255
    }

    private fun byteUtf8(s: String) = s.toByteArray(Charsets.UTF_8).size

    /**
     * `allegati/` dentro la cartella di lavoro, resa canonica; `null` se non c'è e non si può creare, o se porta fuori (un
     * collegamento). ⛔ Pad 16/10 (R4CL-09): con due file scelti insieme le copie corrono in parallelo; il `mkdirs()` di chi arriva
     * secondo torna `false` perché la cartella l'ha appena creata l'altro. Conta che la cartella ci sia alla fine.
     */
    fun cartellaAllegati(lavoro: java.io.File): java.io.File? {
        val radice = lavoro.canonicalFile
        val allegati = java.io.File(radice, "allegati")
        if (!allegati.isDirectory && !allegati.mkdirs() && !allegati.isDirectory) return null
        val canonica = allegati.canonicalFile
        return if (canonica.parentFile == radice) canonica else null
    }

    /**
     * `numberedName` dell'helper del desktop: `nome` la prima volta, poi `tronco-N.ext`; il tronco si accorcia per caratteri interi
     * finché il nome sta in 255 byte. `null` se non resta niente del tronco.
     */
    fun nomeNumerato(nome: String, indice: Int): String? {
        if (indice == 1) return nome
        val punto = nome.lastIndexOf('.')
        val tronco = if (punto > 0) nome.substring(0, punto) else nome
        val estensione = if (punto > 0) nome.substring(punto) else ""
        val suffisso = "-$indice"
        val ammessi = 255 - byteUtf8(estensione) - byteUtf8(suffisso)
        var t = tronco
        while (t.isNotEmpty() && byteUtf8(t) > ammessi) t = t.substring(0, t.offsetByCodePoints(t.length, -1))
        return if (t.isEmpty()) null else t + suffisso + estensione
    }

    /** Il cookie del token, e mai `Origin` né `Sec-Fetch-Site`: sono ciò che le guardie di r4 rifiutano da un'altra finestra. */
    fun intestazioni(token: String, conCorpo: Boolean): Map<String, String> {
        require(token.length >= 32 && token.none { it.isWhitespace() || it == ';' }) { "r4 token not valid" }
        val h = linkedMapOf("Cookie" to "talos_token=$token", "Accept" to "application/json, text/event-stream")
        if (conCorpo) h["Content-Type"] = "application/json"
        return h
    }
}

/**
 * K3-TERM T2 (ledger `LEDGER-K3-TERMINALE-2026-10-16.md`): le regole della WebSocket del Terminale di r4 (`terminal-ws.mjs` @
 * `2161afb32`), pure e provate in JVM. Il frame è binario: il primo byte 0 = dati (UTF-8), 1 = controllo JSON (`resize` dal
 * client; `agganciato`, `uscita`, `errore` dal server). L'id lo sceglie r4 (`POST /:id/terminals`): qui si controlla solo che sia
 * un nome semplice, perché finisce nella query.
 */
object TalosR4Terminale {
    const val PERCORSO_WS = "/api/v1/terminal/ws"
    const val TIPO_DATI = 0
    const val TIPO_CONTROLLO = 1
    private val ID = Regex("^[A-Za-z0-9-]{1,200}$")

    data class Frame(val tipo: Int, val testo: String)

    fun idAmmesso(terminalId: String): Boolean = ID.matches(terminalId)

    fun indirizzo(porta: Int, terminalId: String): String {
        require(idAmmesso(terminalId)) { "terminal id not allowed" }
        return "ws://127.0.0.1:$porta$PERCORSO_WS?id=$terminalId"
    }

    /** Solo il cookie, come il flusso: niente `Origin` (la guardia di r4 la controlla solo se c'è) e niente `Content-Type`. */
    fun intestazioni(token: String): Map<String, String> = mapOf("Cookie" to TalosR4Rotte.intestazioni(token, conCorpo = false).getValue("Cookie"))

    fun frameDati(testo: String): ByteArray = byteArrayOf(TIPO_DATI.toByte()) + testo.toByteArray(Charsets.UTF_8)

    fun frameRidimensiona(cols: Int, rows: Int): ByteArray {
        require(cols in 1..1000 && rows in 1..1000) { "terminal size not valid" }
        return byteArrayOf(TIPO_CONTROLLO.toByte()) + """{"tipo":"resize","cols":$cols,"rows":$rows}""".toByteArray(Charsets.UTF_8)
    }

    /** Un frame vuoto o di tipo ignoto torna `null`, come `decodificaFrame` di r4. Ogni frame di dati di r4 è UTF-8 intero. */
    fun leggiFrame(byte: ByteArray): Frame? {
        if (byte.isEmpty()) return null
        val tipo = byte[0].toInt()
        if (tipo != TIPO_DATI && tipo != TIPO_CONTROLLO) return null
        return Frame(tipo, String(byte, 1, byte.size - 1, Charsets.UTF_8))
    }
}

/**
 * Il client nativo di r4 per la schermata del Codice (K3). Parla SOLO con 127.0.0.1 sulla porta di [TalosR4Avvio], e solo se r4 è
 * acceso. `richiesta` per le chiamate brevi; `apriFlusso` per `GET …/events` (SSE), consegnato a righe intere come
 * `TalosFlussoHttp`.
 */
@CapacitorPlugin(name = "TalosR4Cliente")
class TalosR4ClientePlugin : Plugin() {
    private val cliente: OkHttpClient by lazy {
        OkHttpClient.Builder()
            .connectTimeout(5, TimeUnit.SECONDS)
            // Il flusso di una sessione resta aperto dopo la fine del giro (battito ogni 15 s): nessun tetto di lettura.
            .readTimeout(0, TimeUnit.SECONDS)
            .build()
    }
    private val aperti = ConcurrentHashMap<String, Call>()

    private fun preparata(call: PluginCall, metodo: String, percorso: String?, corpo: String?): Request? {
        val token = TalosR4Avvio.token() ?: run { call.reject("TALOS_R4_SPENTO", "TALOS_R4_SPENTO"); return null }
        if (metodo !in TalosR4Rotte.METODI || percorso == null || !TalosR4Rotte.percorsoAmmesso(percorso)) {
            call.reject("TALOS_R4_PERCORSO_NON_AMMESSO", "TALOS_R4_PERCORSO_NON_AMMESSO")
            return null
        }
        val costruttore = Request.Builder().url(TalosR4Rotte.indirizzo(TalosR4Avvio.PORTA, percorso))
        TalosR4Rotte.intestazioni(token, conCorpo = metodo == "POST").forEach { (nome, valore) -> costruttore.header(nome, valore) }
        return if (metodo == "POST") costruttore.post((corpo ?: "{}").toRequestBody("application/json".toMediaType())).build()
        else costruttore.get().build()
    }

    @PluginMethod
    fun richiesta(call: PluginCall) {
        val richiesta = preparata(call, call.getString("metodo") ?: "GET", call.getString("percorso"), call.getString("corpo")) ?: return
        cliente.newCall(richiesta).enqueue(object : Callback {
            override fun onFailure(c: Call, e: IOException) = call.reject("TALOS_R4_IRRAGGIUNGIBILE", e.javaClass.simpleName)
            override fun onResponse(c: Call, response: Response) {
                response.use { r ->
                    val testo = runCatching { r.body.string() }.getOrDefault("")
                    call.resolve(JSObject().apply { put("stato", r.code); put("corpo", testo) })
                }
            }
        })
    }

    /**
     * K3-C Allegati A2 (owner 16/10 «Anteprima vera»): un'immagine mandata a r4, riletta INTERA. `richiesta` legge il corpo come testo
     * e i byte di un'immagine non ci passano (misurato sul Pad: 93 byte tornavano 92 caratteri). Solo la rotta dell'immagine, solo GET,
     * col tetto di r4; i byte tornano in base64 col loro tipo.
     */
    @PluginMethod
    fun immagine(call: PluginCall) {
        val percorso = runCatching { TalosR4Rotte.percorsoImmagine(call.getString("id") ?: "") }.getOrNull()
            ?: return call.reject("TALOS_R4_PERCORSO_NON_AMMESSO", "TALOS_R4_PERCORSO_NON_AMMESSO")
        val richiesta = preparata(call, "GET", percorso, null) ?: return
        cliente.newCall(richiesta).enqueue(object : Callback {
            override fun onFailure(c: Call, e: IOException) = call.reject("TALOS_R4_IRRAGGIUNGIBILE", e.javaClass.simpleName)
            override fun onResponse(c: Call, response: Response) {
                response.use { r ->
                    val lunghezza = r.body.contentLength()
                    if (lunghezza > TalosR4Rotte.MASSIMO_IMMAGINE) return call.reject("TALOS_R4_IMMAGINE_TROPPO_GRANDE", "TALOS_R4_IMMAGINE_TROPPO_GRANDE")
                    val byte = runCatching { r.body.bytes() }.getOrNull() ?: return call.reject("TALOS_R4_IRRAGGIUNGIBILE", "body")
                    if (byte.size > TalosR4Rotte.MASSIMO_IMMAGINE) return call.reject("TALOS_R4_IMMAGINE_TROPPO_GRANDE", "TALOS_R4_IMMAGINE_TROPPO_GRANDE")
                    call.resolve(JSObject().apply {
                        put("stato", r.code)
                        put("tipo", r.header("Content-Type") ?: "")
                        put("base64", if (r.isSuccessful) android.util.Base64.encodeToString(byte, android.util.Base64.NO_WRAP) else "")
                    })
                }
            }
        })
    }

    /**
     * ⛔ K3-C Allegati A3 (ledger `LEDGER-K3-ALLEGATI-2026-10-16.md`; owner 16/10 «L'app li scrive in allegati/»): un file scelto dal
     * telefono entra in `<cartella di lavoro>/allegati/`, come l'helper del desktop (`native/chat-file-upload/main.go` @ 2161afb32).
     *   · solo un documento scelto (`content://`): si legge dallo stream, mai da un percorso (Android, `OpenableColumns`);
     *   · la cartella la conosce il nativo, il JavaScript passa solo il nome, che si controlla qui;
     *   · copia a tetti in un `.part` dentro `allegati/`, poi spostamento sul primo nome libero: un file esistente non si tocca mai;
     *   · `testo` = UTF-8 rigoroso, solo se chiesto ed entro [TalosR4Rotte.MASSIMO_TESTO] byte (BUG-20 del desktop).
     * Torna la ricevuta del desktop `{tipo, nome, percorso, bytes, assoluto}` (+ `testo`); i rifiuti con i codici dell'helper.
     */
    @PluginMethod
    fun allegaFile(call: PluginCall) {
        val uri = call.getString("uri")?.let { runCatching { android.net.Uri.parse(it) }.getOrNull() }
        if (uri == null || uri.scheme != "content") return call.reject("QUERY_INVALID", "QUERY_INVALID")
        val nome = call.getString("nome") ?: ""
        if (!TalosR4Rotte.nomeAllegatoValido(nome)) return call.reject("QUERY_INVALID", "QUERY_INVALID")
        val conTesto = call.getBoolean("testo", false) == true
        Thread({ copiaAllegato(call, uri, nome, conTesto) }, "talos-r4-allega").start()
    }

    /**
     * K3-C Allegati A3: un'immagine scelta con «Allega un file» va per la strada delle immagini, come `allegaFile` del desktop; i suoi
     * byte la pagina non li legge (`content://`), li legge il nativo, fino al tetto delle immagini del desktop (5 MiB). `{tipo, base64}`.
     */
    @PluginMethod
    fun immagineScelta(call: PluginCall) {
        val uri = call.getString("uri")?.let { runCatching { android.net.Uri.parse(it) }.getOrNull() }
        if (uri == null || uri.scheme != "content") return call.reject("QUERY_INVALID", "QUERY_INVALID")
        Thread({
            try {
                val tipo = context.contentResolver.getType(uri) ?: ""
                val uscita = java.io.ByteArrayOutputStream()
                val ingresso = context.contentResolver.openInputStream(uri) ?: return@Thread call.reject("FILE_WRITE_FAILED", "FILE_WRITE_FAILED")
                ingresso.use { dentro ->
                    val pezzo = ByteArray(1 shl 16)
                    while (true) {
                        val n = dentro.read(pezzo)
                        if (n < 0) break
                        if (uscita.size() + n > TalosR4Rotte.MASSIMO_IMMAGINE_SCELTA) throw OltreIlTetto()
                        uscita.write(pezzo, 0, n)
                    }
                }
                call.resolve(JSObject().apply {
                    put("tipo", tipo)
                    put("base64", android.util.Base64.encodeToString(uscita.toByteArray(), android.util.Base64.NO_WRAP))
                })
            } catch (e: OltreIlTetto) {
                call.reject("PAYLOAD_LIMIT", "PAYLOAD_LIMIT")
            } catch (e: Exception) {
                call.reject("FILE_WRITE_FAILED", "FILE_WRITE_FAILED")
            }
        }, "talos-r4-immagine-scelta").start()
    }

    private class OltreIlTetto : IOException()

    private fun copiaAllegato(call: PluginCall, uri: android.net.Uri, nome: String, conTesto: Boolean) {
        val cartella = try {
            TalosR4Rotte.cartellaAllegati(TalosCodiceInCasa.disposizione(java.io.File(context.filesDir, "codice")).lavoro)
        } catch (e: IOException) {
            null
        } ?: return call.reject("FOLDER_INVALID", "FOLDER_INVALID")
        val parte = java.io.File(cartella, ".talos-upload-${java.util.UUID.randomUUID()}.part")
        try {
            var copiati = 0L
            val ingresso = context.contentResolver.openInputStream(uri) ?: return call.reject("FILE_WRITE_FAILED", "FILE_WRITE_FAILED")
            ingresso.use { dentro ->
                java.io.FileOutputStream(parte).use { fuori ->
                    val pezzo = ByteArray(1 shl 16)
                    while (true) {
                        val n = dentro.read(pezzo)
                        if (n < 0) break
                        copiati += n
                        if (copiati > TalosR4Rotte.MASSIMO_FILE) throw OltreIlTetto()
                        fuori.write(pezzo, 0, n)
                    }
                    fuori.fd.sync()
                }
            }
            var finale: java.io.File? = null
            for (indice in 1..10000) {
                val numerato = TalosR4Rotte.nomeNumerato(nome, indice) ?: return call.reject("QUERY_INVALID", "QUERY_INVALID")
                val destinazione = java.io.File(cartella, numerato)
                if (destinazione.canonicalFile.parentFile != cartella) return call.reject("QUERY_INVALID", "QUERY_INVALID")
                try {
                    java.nio.file.Files.move(parte.toPath(), destinazione.toPath())
                    finale = destinazione
                    break
                } catch (e: java.nio.file.FileAlreadyExistsException) {
                    continue
                }
            }
            val scritto = finale ?: return call.reject("FILE_EXISTS", "FILE_EXISTS")
            val testo = if (conTesto && copiati <= TalosR4Rotte.MASSIMO_TESTO) {
                runCatching {
                    Charsets.UTF_8.newDecoder()
                        .onMalformedInput(java.nio.charset.CodingErrorAction.REPORT)
                        .onUnmappableCharacter(java.nio.charset.CodingErrorAction.REPORT)
                        .decode(java.nio.ByteBuffer.wrap(scritto.readBytes())).toString()
                }.getOrNull()
            } else null
            call.resolve(JSObject().apply {
                put("tipo", "file")
                put("nome", scritto.name)
                put("percorso", "allegati/${scritto.name}")
                put("bytes", copiati)
                put("assoluto", scritto.path)
                if (testo != null) put("testo", testo)
            })
        } catch (e: OltreIlTetto) {
            call.reject("PAYLOAD_LIMIT", "PAYLOAD_LIMIT")
        } catch (e: Exception) {
            call.reject("FILE_WRITE_FAILED", "FILE_WRITE_FAILED")
        } finally {
            parte.delete()
        }
    }

    @PluginMethod
    fun apriFlusso(call: PluginCall) {
        val id = call.getString("id")?.takeIf { it.isNotBlank() } ?: return call.reject("TALOS_R4_ID_MANCANTE", "TALOS_R4_ID_MANCANTE")
        val richiesta = preparata(call, "GET", call.getString("percorso"), null) ?: return
        val chiamata = cliente.newCall(richiesta)
        aperti[id] = chiamata
        chiamata.enqueue(object : Callback {
            override fun onFailure(c: Call, e: IOException) {
                aperti.remove(id)
                if (!c.isCanceled()) manda("r4Errore", id) { put("motivo", e.javaClass.simpleName) }
            }

            override fun onResponse(c: Call, response: Response) {
                response.use { r ->
                    try {
                        if (!r.isSuccessful) { manda("r4Errore", id) { put("motivo", "HTTP ${r.code}") }; return }
                        val sorgente = r.body.source()
                        val pezzo = StringBuilder()
                        while (true) {
                            val riga = sorgente.readUtf8Line() ?: break
                            pezzo.append(riga).append('\n')
                            if (sorgente.buffer.size == 0L || pezzo.length >= 64 * 1024) {
                                val testo = pezzo.toString()
                                pezzo.setLength(0)
                                manda("r4Pezzo", id) { put("testo", testo) }
                            }
                        }
                        if (pezzo.isNotEmpty()) manda("r4Pezzo", id) { put("testo", pezzo.toString()) }
                        manda("r4Fine", id) {}
                    } catch (guasto: IOException) {
                        if (!c.isCanceled()) manda("r4Errore", id) { put("motivo", guasto.javaClass.simpleName) }
                    } finally {
                        aperti.remove(id)
                    }
                }
            }
        })
        call.resolve()
    }

    @PluginMethod
    fun chiudiFlusso(call: PluginCall) {
        call.getString("id")?.let { aperti.remove(it)?.cancel() }
        call.resolve()
    }

    private val terminali = ConcurrentHashMap<String, WebSocket>()

    /** K3-TERM T2: la WebSocket del Terminale di r4 per `terminalId`, sotto il nome `id` scelto dalla pagina. */
    @PluginMethod
    fun apriTerminale(call: PluginCall) {
        val id = call.getString("id")?.takeIf { it.isNotBlank() } ?: return call.reject("TALOS_R4_ID_MANCANTE", "TALOS_R4_ID_MANCANTE")
        val terminalId = call.getString("terminalId") ?: ""
        val token = TalosR4Avvio.token() ?: return call.reject("TALOS_R4_SPENTO", "TALOS_R4_SPENTO")
        if (!TalosR4Terminale.idAmmesso(terminalId)) return call.reject("TALOS_R4_PERCORSO_NON_AMMESSO", "TALOS_R4_PERCORSO_NON_AMMESSO")
        val costruttore = Request.Builder().url(TalosR4Terminale.indirizzo(TalosR4Avvio.PORTA, terminalId))
        TalosR4Terminale.intestazioni(token).forEach { (nome, valore) -> costruttore.header(nome, valore) }
        terminali.remove(id)?.cancel()
        terminali[id] = cliente.newWebSocket(costruttore.build(), object : WebSocketListener() {
            override fun onMessage(webSocket: WebSocket, bytes: ByteString) {
                val frame = TalosR4Terminale.leggiFrame(bytes.toByteArray()) ?: return
                if (frame.tipo == TalosR4Terminale.TIPO_DATI) manda("r4TermDati", id) { put("testo", frame.testo) }
                else manda("r4TermControllo", id) { put("json", frame.testo) }
            }

            override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
                webSocket.close(1000, null)
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                if (terminali.remove(id, webSocket)) manda("r4TermChiuso", id) { put("codice", code); put("motivo", reason) }
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                if (terminali.remove(id, webSocket)) {
                    manda("r4TermErrore", id) { put("motivo", t.javaClass.simpleName); response?.code?.let { put("stato", it) } }
                }
            }
        })
        call.resolve()
    }

    @PluginMethod
    fun scriviTerminale(call: PluginCall) {
        val ws = call.getString("id")?.let { terminali[it] } ?: return call.reject("TALOS_R4_TERMINALE_CHIUSO", "TALOS_R4_TERMINALE_CHIUSO")
        val inviato = ws.send(TalosR4Terminale.frameDati(call.getString("testo") ?: "").toByteString())
        if (inviato) call.resolve() else call.reject("TALOS_R4_TERMINALE_CHIUSO", "TALOS_R4_TERMINALE_CHIUSO")
    }

    @PluginMethod
    fun ridimensionaTerminale(call: PluginCall) {
        val ws = call.getString("id")?.let { terminali[it] } ?: return call.reject("TALOS_R4_TERMINALE_CHIUSO", "TALOS_R4_TERMINALE_CHIUSO")
        val frame = runCatching { TalosR4Terminale.frameRidimensiona(call.getInt("cols") ?: 0, call.getInt("rows") ?: 0) }.getOrNull()
            ?: return call.reject("TALOS_R4_MISURA_NON_VALIDA", "TALOS_R4_MISURA_NON_VALIDA")
        ws.send(frame.toByteString())
        call.resolve()
    }

    @PluginMethod
    fun chiudiTerminale(call: PluginCall) {
        call.getString("id")?.let { terminali.remove(it)?.close(1000, null) }
        call.resolve()
    }

    override fun handleOnDestroy() {
        aperti.values.forEach { it.cancel() }
        aperti.clear()
        terminali.values.forEach { it.cancel() }
        terminali.clear()
    }

    private fun manda(evento: String, id: String, riempi: JSObject.() -> Unit) {
        notifyListeners(evento, JSObject().apply { put("id", id); riempi() })
    }
}
