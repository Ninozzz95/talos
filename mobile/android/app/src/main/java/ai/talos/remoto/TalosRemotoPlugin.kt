package ai.talos.remoto

import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import android.content.Context
import android.os.Build
import android.provider.Settings
import com.google.mlkit.common.MlKitException
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.codescanner.GmsBarcodeScannerOptions
import com.google.mlkit.vision.codescanner.GmsBarcodeScanning
import computer.iroh.SecretKey
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import org.json.JSONObject
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withTimeoutOrNull
import java.io.File
import java.security.SecureRandom
import java.util.concurrent.ConcurrentHashMap

/**
 * ⛔ CLIENT DEL CONTROLLO REMOTO, fetta R-M2 (ledger `LEDGER-CLIENT-REMOTO-MOBILE-2026-10-20.md`): il plugin `TalosRemoto`. Fa SOLO il
 * trasporto: identità per PC, connessione iroh, un bi-stream, taglio dei messaggi (`TalosRemotoFilo`). Il protocollo (pair.hello,
 * confronto del codice di 6 cifre, req/res, iscrizioni) sta nel TypeScript (`src/lib/remoto/`), dove è provato contro il PC.
 *
 * Metodi: `accoppia({pcId, relay})` → `{canale, telefonoId}` (chiave nuova, ALPN d'accoppiamento) · `concludiAccoppiamento({canale,
 * nome})` (dopo `pair.ok`: la chiave si ricorda, sigillata) · `collega({pcId})` → `{canale}` (ALPN di lavoro) · `invia({canale, json})`
 * · `chiudi({canale})` · `percorso({canale})` → `{tipo, rttMs}` · `elenco()` · `dimentica({pcId})`.
 * Eventi: `remoto-messaggio {canale, json}` e `remoto-chiuso {canale, motivo}` (motivo = un codice del filo o `ENDED`).
 */
@CapacitorPlugin(name = "TalosRemoto")
class TalosRemotoPlugin : Plugin() {
    private val ambito = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val canali = ConcurrentHashMap<String, Aperto>()

    private class Aperto(
        val canale: TalosRemotoTrasporto.Canale,
        val pcId: String,
        val relay: String?,
        /** Solo durante l'accoppiamento: la chiave nuova, da ricordare a `pair.ok` o da buttare. */
        val chiaveNuova: ByteArray?,
    ) {
        val scrittura = Mutex()
        /** Il trasporto è chiuso ma la chiave d'accoppiamento aspetta ancora `concludiAccoppiamento` (TRAS-05). */
        @Volatile var trasportoChiuso = false
    }

    private val cartella: File get() = File(context.filesDir, "remoto")

    private companion object {
        const val CHIUSURA_MAX_MS = 2_000L
        /** Quanto aspetta una chiave d'accoppiamento dopo la fine dello stream, prima di essere buttata. */
        const val ATTESA_CONCLUSIONE_MS = 60_000L
        /** Quanto si aspetta l'iscrizione del distributore dopo `register` (Play services, di solito meno di un secondo). */
        const val ATTESA_ISCRIZIONE_MS = 20_000L
    }

    /** Il contesto da cui si prende quello dell'applicazione per iroh; le prove JVM lo sostituiscono (lì non c'è il bridge). */
    internal var contestoPerIroh: () -> Context = { context }

    /** F (24/10/2026): Capacitor chiama `load` alla registrazione, prima di qualunque metodo, quindi prima di ogni Endpoint. */
    override fun load() {
        TalosRemotoContestoIroh.prepara(contestoPerIroh())
    }

    @PluginMethod
    fun accoppia(call: PluginCall) {
        val pcId = call.getString("pcId")?.takeIf { it.isNotBlank() } ?: return call.reject("pcId is required", "BAD_MESSAGE")
        val relayTesto = call.getString("relay")
        val relay = TalosRemotoTrasporto.relayDalQr(relayTesto) ?: return call.reject("The relay address cannot be used.", "BAD_MESSAGE")
        ambito.launch {
            val chiave = SecretKey.generate().toBytes()
            try {
                val canale = TalosRemotoTrasporto.apri(chiave, pcId, relay, TalosRemotoTrasporto.ALPN_ACCOPPIAMENTO)
                val id = registra(canale, pcId, relayTesto, chiave)
                call.resolve(JSObject().put("canale", id).put("telefonoId", canale.telefonoId))
            } catch (e: Exception) {
                chiave.fill(0)
                call.reject(messaggio(e), "CONNECT_FAILED")
            }
        }
    }

    /** Dopo `pair.ok`: il PC ha registrato il telefono. La chiave si sigilla e il canale d'accoppiamento si chiude. */
    @PluginMethod
    fun concludiAccoppiamento(call: PluginCall) {
        val aperto = canali[call.getString("canale") ?: ""] ?: return call.reject("unknown channel", "DISCONNECTED")
        val chiave = aperto.chiaveNuova ?: return call.reject("not a pairing channel", "BAD_MESSAGE")
        ambito.launch {
            try {
                val diviso = aperto.relay?.let { TalosRemotoCustodia.relayDiviso(it) }
                TalosRemotoCustodia.salva(cartella, TalosRemotoCustodia.ComputerAccoppiato(
                    aperto.pcId, call.getString("nome")?.take(64), diviso?.first, diviso?.second, chiave, System.currentTimeMillis(),
                    // R-M5 (21/10/2026): la VAPID del PC per la sveglia; storta o assente ⇒ si accoppia lo stesso, senza sveglia
                    TalosRemotoCustodia.vapidValida(call.getString("vapid")),
                ))
                chiudiCanale(call.getString("canale")!!, "DONE", avvisa = false)
                call.resolve()
            } catch (e: Exception) {
                call.reject(messaggio(e), "OPERATION_FAILED")
            }
        }
    }

    @PluginMethod
    fun collega(call: PluginCall) {
        val pcId = call.getString("pcId") ?: return call.reject("pcId is required", "BAD_MESSAGE")
        ambito.launch {
            val pc = try { TalosRemotoCustodia.leggi(cartella, pcId) } catch (e: Exception) { null }
                ?: return@launch call.reject("This computer is not paired with this device.", "NOT_PAIRED")
            try {
                val canale = TalosRemotoTrasporto.apriVerso(pc)
                    ?: return@launch call.reject("The relay address cannot be used.", "BAD_MESSAGE")
                call.resolve(JSObject().put("canale", registra(canale, pcId, TalosRemotoTrasporto.relayDelRicordo(pc), null)))
            } catch (e: Exception) {
                call.reject(messaggio(e), "CONNECT_FAILED")
            } finally {
                pc.chiaveTelefono.fill(0)
            }
        }
    }

    @PluginMethod
    fun invia(call: PluginCall) {
        val aperto = canali[call.getString("canale") ?: ""]?.takeUnless { it.trasportoChiuso }
            ?: return call.reject("unknown channel", "DISCONNECTED")
        val byte = try { TalosRemotoFilo.codifica(call.getString("json") ?: "") } catch (e: TalosRemotoFilo.ErroreFilo) {
            return call.reject(e.message, e.codice)
        }
        ambito.launch {
            try {
                aperto.scrittura.withLock { aperto.canale.invio.writeAll(byte) }
                call.resolve()
            } catch (e: Exception) {
                call.reject(messaggio(e), "DISCONNECTED")
            }
        }
    }

    @PluginMethod
    fun chiudi(call: PluginCall) {
        val id = call.getString("canale") ?: return call.resolve()
        ambito.launch { chiudiCanale(id, "DONE", avvisa = false); call.resolve() }
    }

    @PluginMethod
    fun percorso(call: PluginCall) {
        val aperto = canali[call.getString("canale") ?: ""] ?: return call.reject("unknown channel", "DISCONNECTED")
        val p = try { TalosRemotoTrasporto.percorso(aperto.canale) } catch (e: Exception) { null }
        call.resolve(percorsoPerJs(p))
    }

    /** I computer accoppiati, senza chiavi né gettoni. */
    @PluginMethod
    fun elenco(call: PluginCall) {
        ambito.launch {
            val voci = JSArray()
            for (pc in TalosRemotoCustodia.elenco(cartella)) {
                voci.put(computerPerJs(pc.pcId, pc.nome, pc.relay, pc.accoppiatoAlle))
                pc.chiaveTelefono.fill(0)
            }
            call.resolve(JSObject().put("computer", voci))
        }
    }

    @PluginMethod
    fun dimentica(call: PluginCall) {
        val pcId = call.getString("pcId") ?: return call.reject("pcId is required", "BAD_MESSAGE")
        ambito.launch {
            for ((id, aperto) in canali) if (aperto.pcId == pcId) chiudiCanale(id, "REVOKED", avvisa = true)
            // R-M5a: un PC dimenticato non sveglia più, e le sue notifiche se ne vanno con lui
            try { TalosSveglia.annulla(context, pcId) } catch (e: Exception) { /* niente sveglia accesa */ }
            call.resolve(JSObject().put("dimenticato", TalosRemotoCustodia.dimentica(cartella, pcId)))
        }
    }

    // ——— R-M5a, la sveglia (21/10/2026): owner R-M5 Q3 «Dopo l'accoppiamento, con Prova la notifica» ———

    /**
     * `{accesa, iscrizione, daMandare, errore, google, vapid, consentite}`: niente endpoint né chiavi verso il TypeScript, salvo in
     * `svegliaAttiva`. Revisione R-M5a (13, 14): `vapid` = il PC ha dato la chiave all'accoppiamento; `consentite` = Android lascia
     * mostrare notifiche a TALOS (si può togliere dopo l'attivazione).
     */
    @PluginMethod
    fun svegliaStato(call: PluginCall) {
        val pcId = call.getString("pcId") ?: return call.reject("pcId is required", "BAD_MESSAGE")
        ambito.launch {
            val pc = try { TalosRemotoCustodia.leggi(cartella, pcId) } catch (e: Exception) { null }
            val vapid = pc?.vapid != null
            pc?.chiaveTelefono?.fill(0)
            call.resolve(JSObject()
                .put("accesa", TalosSveglia.accesa(context, pcId))
                .put("iscrizione", TalosSveglia.iscrizione(context, pcId) != null)
                .put("daMandare", TalosSveglia.daMandare(context, pcId))
                .put("errore", TalosSveglia.errore(context, pcId))
                .put("google", TalosSveglia.googleDisponibile(context))
                .put("vapid", vapid)
                .put("consentite", androidx.core.app.NotificationManagerCompat.from(context).areNotificationsEnabled()))
        }
    }

    /**
     * Revisione R-M5a (1): il TypeScript ha visto il PC in linea, o il PC non ha l'iscrizione (`forza`): se c'è un'iscrizione da
     * mandare, il lavoro parte adesso invece di aspettare il suo ritentativo.
     */
    @PluginMethod
    fun svegliaRimanda(call: PluginCall) {
        val pcId = call.getString("pcId") ?: return call.reject("pcId is required", "BAD_MESSAGE")
        if (call.getBoolean("forza", false) == true) TalosSveglia.segnaDaMandare(context, pcId)
        if (TalosSveglia.accesa(context, pcId) && TalosSveglia.daMandare(context, pcId)) TalosSvegliaLavoro.programma(context, pcId, sveglia = false, subito = true)
        call.resolve()
    }

    /**
     * Accende la sveglia con la VAPID del PC (custodita all'accoppiamento) e aspetta l'iscrizione del distributore, al più
     * `ATTESA_ISCRIZIONE_MS`. Torna `{iscrizione: {endpoint, keys: {p256dh, auth}}}`, che il TypeScript manda al PC con `device.wake`.
     */
    @PluginMethod
    fun svegliaAttiva(call: PluginCall) {
        val pcId = call.getString("pcId") ?: return call.reject("pcId is required", "BAD_MESSAGE")
        ambito.launch {
            val pc = try { TalosRemotoCustodia.leggi(cartella, pcId) } catch (e: Exception) { null }
                ?: return@launch call.reject("This computer is not paired with this device.", "NOT_PAIRED")
            pc.chiaveTelefono.fill(0)
            val vapid = pc.vapid ?: return@launch call.reject("This computer did not give a wake key: pair it again.", "WAKE_UNAVAILABLE")
            if (!TalosSveglia.googleDisponibile(context)) return@launch call.reject("Google Play services are not available.", "WAKE_UNAVAILABLE")
            if (!TalosSveglia.registra(context, pcId, vapid, pc.nome)) return@launch call.reject("The computer's wake key is not valid.", "WAKE_UNAVAILABLE")
            val iscrizione = withTimeoutOrNull(ATTESA_ISCRIZIONE_MS) {
                var i = TalosSveglia.iscrizione(context, pcId)
                while (i == null && TalosSveglia.errore(context, pcId) == null) { delay(250); i = TalosSveglia.iscrizione(context, pcId) }
                i
            }
            if (iscrizione == null) {
                val errore = TalosSveglia.errore(context, pcId)
                TalosSveglia.annulla(context, pcId)
                return@launch call.reject("The wake registration did not complete${errore?.let { " ($it)" } ?: ""}.", "WAKE_REGISTRATION_FAILED")
            }
            call.resolve(JSObject().put("iscrizione", JSObject.fromJSONObject(iscrizione.inJson())))
        }
    }

    /** Il PC ha questa iscrizione (`device.wake` riuscito): il lavoro non la rimanda. */
    @PluginMethod
    fun svegliaMandata(call: PluginCall) {
        val pcId = call.getString("pcId") ?: return call.reject("pcId is required", "BAD_MESSAGE")
        TalosSveglia.segnaMandata(context, pcId, call.getString("endpoint") ?: "")
        call.resolve()
    }

    @PluginMethod
    fun svegliaProva(call: PluginCall) {
        val pcId = call.getString("pcId") ?: return call.reject("pcId is required", "BAD_MESSAGE")
        // revisione R-M5a (2): `annulla` quando la prova non è partita, così una sveglia vera non viene presa per prova
        if (call.getBoolean("annulla", false) == true) TalosSveglia.annullaProva(context, pcId) else TalosSveglia.segnaProva(context, pcId)
        call.resolve()
    }

    /** D-RM5-3 (dal Pad, 21/10/2026): la carta della sessione è vista nell'app ⇒ la sua notifica di richiesta se ne va. */
    @PluginMethod
    fun svegliaVista(call: PluginCall) {
        val pcId = call.getString("pcId") ?: return call.reject("pcId is required", "BAD_MESSAGE")
        val sessionId = call.getString("sessionId") ?: return call.reject("sessionId is required", "BAD_MESSAGE")
        // D-RM5-4: le carte viste si ricordano, così il lavoro di una sveglia per un'altra sessione non le ripropone
        val carte = call.getArray("carte")?.toList<Any>()?.mapNotNull { it as? String }.orEmpty()
        synchronized(TalosSveglia.lucchetto) {
            if (carte.isNotEmpty()) TalosSveglia.segnaViste(context, pcId, sessionId, carte)
            TalosSvegliaNotifiche.togliSessione(context, pcId, sessionId)
        }
        call.resolve()
    }

    /** D-RM5-3: una richiesta risolta altrove resta nella tendina; aprendo il PC il lavoro rilegge e toglie quelle che non valgono più. */
    @PluginMethod
    fun svegliaRiallinea(call: PluginCall) {
        val pcId = call.getString("pcId") ?: return call.reject("pcId is required", "BAD_MESSAGE")
        if (TalosSveglia.accesa(context, pcId) && TalosSveglia.firmeRichieste(context, pcId).isNotEmpty()) {
            TalosSvegliaLavoro.programma(context, pcId, sveglia = true, riallinea = true)
        }
        call.resolve()
    }

    /** Decisione owner 21/10/2026: col PIN di TALOS acceso le notifiche dal computer sono generiche, anche a schermo sbloccato. */
    @PluginMethod
    fun svegliaRiservata(call: PluginCall) {
        TalosSveglia.impostaRiservata(context, call.getBoolean("attiva", false) == true)
        call.resolve()
    }

    @PluginMethod
    fun svegliaDisattiva(call: PluginCall) {
        val pcId = call.getString("pcId") ?: return call.reject("pcId is required", "BAD_MESSAGE")
        TalosSveglia.annulla(context, pcId)
        call.resolve()
    }

    /**
     * R-M3: lo scanner di Google (Play services). L'interfaccia della fotocamera è sua: l'app non chiede il permesso e non vede
     * l'immagine, riceve solo il testo del QR. Chiuso dalla persona ⇒ `CANCELLED`; Play services assente ⇒ `SCANNER_UNAVAILABLE`.
     */
    @PluginMethod
    fun scansiona(call: PluginCall) {
        val attivita = activity ?: return call.reject("No activity", "SCANNER_UNAVAILABLE")
        val opzioni = GmsBarcodeScannerOptions.Builder().setBarcodeFormats(Barcode.FORMAT_QR_CODE).build()
        GmsBarcodeScanning.getClient(attivita, opzioni).startScan()
            .addOnSuccessListener { codice ->
                val testo = codice.rawValue
                if (testo.isNullOrEmpty()) call.reject("Empty code", "BAD_MESSAGE")
                else call.resolve(JSObject().put("testo", testo))
            }
            .addOnCanceledListener { call.reject("Scanner closed", "CANCELLED") }
            .addOnFailureListener { e ->
                val annullato = e is MlKitException && e.errorCode == MlKitException.CODE_SCANNER_CANCELLED
                call.reject(if (annullato) "Scanner closed" else "Scanner unavailable", if (annullato) "CANCELLED" else "SCANNER_UNAVAILABLE")
            }
    }

    /** Il nome che la persona ha dato al telefono (Impostazioni › Info), altrimenti il modello: va nel saluto al PC. */
    @PluginMethod
    fun nomeDelTelefono(call: PluginCall) {
        val nome = try { Settings.Global.getString(context.contentResolver, Settings.Global.DEVICE_NAME) } catch (e: Exception) { null }
        call.resolve(JSObject().put("nome", (nome?.takeIf { it.isNotBlank() } ?: Build.MODEL ?: "").take(64)))
    }

    override fun handleOnDestroy() {
        // sul thread principale: un tetto, mai un'attesa senza fine su una rete che non risponde
        runBlocking { withTimeoutOrNull(CHIUSURA_MAX_MS) { for (id in canali.keys.toList()) chiudiCanale(id, "DONE", avvisa = false) } }
        ambito.cancel()
        super.handleOnDestroy()
    }

    // ——— Interni ———

    private fun registra(canale: TalosRemotoTrasporto.Canale, pcId: String, relay: String?, chiaveNuova: ByteArray?): String {
        val id = ByteArray(9).also { SecureRandom().nextBytes(it) }
            .let { java.util.Base64.getUrlEncoder().withoutPadding().encodeToString(it) }
        canali[id] = Aperto(canale, pcId, relay, chiaveNuova)
        ambito.launch { leggi(id) }
        return id
    }

    /** Legge lo stream finché non finisce: ogni messaggio intero va al TypeScript. Un guasto di taglio chiude (filo v1 §1). */
    private suspend fun leggi(id: String) {
        val aperto = canali[id] ?: return
        val lettore = TalosRemotoFilo.Lettore()
        val motivo = try {
            while (true) {
                val pezzo = aperto.canale.ricezione.read(TalosRemotoTrasporto.BYTE_PER_LETTURA.toUInt())
                if (pezzo.isEmpty()) break
                for (json in lettore.aggiungi(pezzo)) notifyListeners("remoto-messaggio", JSObject().put("canale", id).put("json", json))
            }
            "ENDED"
        } catch (e: TalosRemotoFilo.ErroreFilo) {
            e.codice
        } catch (e: Exception) {
            "DISCONNECTED"
        }
        if (TalosRemotoTrasporto.chiaveInAttesaDopoLaFine(aperto.chiaveNuova != null, motivo)) {
            // TRAS-05: il trasporto si chiude, la chiave aspetta `concludiAccoppiamento` (o «Annulla», o la scadenza)
            aperto.trasportoChiuso = true
            TalosRemotoTrasporto.chiudi(aperto.canale, motivo)
            notifyListeners("remoto-chiuso", JSObject().put("canale", id).put("motivo", motivo))
            delay(ATTESA_CONCLUSIONE_MS)
            chiudiCanale(id, "EXPIRED", avvisa = false)
            return
        }
        chiudiCanale(id, motivo, avvisa = true)
    }

    private suspend fun chiudiCanale(id: String, motivo: String, avvisa: Boolean) {
        val aperto = canali.remove(id) ?: return
        // sigillata da `concludiAccoppiamento` o da buttare: in memoria non resta in nessun caso
        aperto.chiaveNuova?.fill(0)
        if (!aperto.trasportoChiuso) TalosRemotoTrasporto.chiudi(aperto.canale, motivo)
        if (avvisa) notifyListeners("remoto-chiuso", JSObject().put("canale", id).put("motivo", motivo))
    }

    /** Il messaggio di un errore senza gettoni né chiavi: solo il tipo e la prima riga, tagliati. */
    private fun messaggio(e: Exception): String =
        "${e.javaClass.simpleName}: ${(e.message ?: "").lineSequence().firstOrNull().orEmpty()}".replace(Regex("token=[^&\\s]+"), "token=…").take(200)
}

/**
 * Una voce dell'elenco dei computer per l'app. ⛔ D-0147-NAV-1, lato nativo (27/10/2026): `put(chiave, null)` di org.json TOGLIE la
 * chiave, e un PC accoppiato senza `relay=` arrivava senza `relay` (la sezione Computer si svuotava). Un valore che manca va come
 * `JSONObject.NULL`, che arriva `null`.
 */
internal fun computerPerJs(pcId: String, nome: String?, relay: String?, accoppiatoAlle: Long): JSObject =
    JSObject().put("pcId", pcId).put("nome", nome ?: JSONObject.NULL).put("relay", relay ?: JSONObject.NULL).put("accoppiatoAlle", accoppiatoAlle)

/** Il percorso del canale per l'app: tipo e tempo d'andata e ritorno, `null` quando non si sanno (mai una chiave assente). */
internal fun percorsoPerJs(p: Pair<String, Long?>?): JSObject =
    JSObject().put("tipo", p?.first ?: JSONObject.NULL).put("rttMs", p?.second ?: JSONObject.NULL)
