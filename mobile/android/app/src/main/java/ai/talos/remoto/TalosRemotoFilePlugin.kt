package ai.talos.remoto

import android.content.ClipData
import android.content.Intent
import android.net.Uri
import android.os.StatFs
import android.provider.OpenableColumns
import androidx.core.content.FileProvider
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import java.io.File
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

/**
 * ⛔ R5.13 scambio di file, fetta F1 (ledger `LEDGER-SCAMBIO-FILE-R5-13-CODICE-DISPOSITIVO-2026-10-25.md`): il lato Android di
 * `TalosRemotoFile`. Qui gli stream `content://` del selettore, lo spazio libero (StatFs), la cartella della cache e le intenzioni
 * di sistema; la logica e le regole stanno in `TalosRemotoFile`, provate su JVM.
 *
 *  - I file scaricati vivono in `cacheDir/remoto-file/<chiave>.bin` (la chiave è sha256 di pc, sessione, file e versione).
 *    FileProvider li vede già (`res/xml/file_paths.xml`, `cache-path "."`).
 *  - «Salva in…» li passa a `TalosFileExport.saveFile`, che accetta solo un figlio diretto di `cache/talos-export`: `perSalvare`
 *    ne mette lì una copia col nome vero.
 *  - Un eseguibile (deciso dai byte) non si apre MAI da qui: `apri` lo rifiuta (contratto P2.3).
 */
@CapacitorPlugin(name = "TalosRemotoFile")
class TalosRemotoFilePlugin : Plugin() {
    private val ambito = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val invii = ConcurrentHashMap<String, Uri>()
    private val scarichi = ConcurrentHashMap<String, Scarico>()

    private class Scarico(val parziale: File, val finale: File)

    private val cartella: File get() = File(context.cacheDir, "remoto-file").apply { mkdirs() }

    override fun handleOnDestroy() {
        ambito.cancel()
        super.handleOnDestroy()
    }

    private fun lavora(call: PluginCall, lavoro: () -> JSObject?) {
        ambito.launch {
            try {
                val r = lavoro()
                if (r == null) call.resolve() else call.resolve(r)
            } catch (e: TalosRemotoFile.ErroreFile) {
                val dati = JSObject().apply {
                    e.ricevuti?.let { put("ricevuti", it) }
                    e.servono?.let { put("servono", it) }
                    e.liberi?.let { put("liberi", it) }
                }
                call.reject(e.message, e.codice, dati)
            } catch (e: SecurityException) {
                call.reject("The file can no longer be read.", "FILE_UNREADABLE")
            } catch (e: Exception) {
                call.reject(e.message ?: "FILE_WRITE_FAILED", "FILE_WRITE_FAILED")
            }
        }
    }

    private fun nomeDi(uri: Uri): String = context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { c ->
        if (c.moveToFirst()) c.getString(0) else null
    } ?: "file"

    /** Misura e sha256 di un file scelto, letto una volta in Kotlin. */
    @PluginMethod
    fun preparaInvio(call: PluginCall) {
        val uri = call.getString("uri")?.let { runCatching { Uri.parse(it) }.getOrNull() }
        if (uri == null || uri.scheme != "content") return call.reject("Not a file from the picker.", "QUERY_INVALID")
        lavora(call) {
            val m = TalosRemotoFile.misura { context.contentResolver.openInputStream(uri) ?: throw TalosRemotoFile.ErroreFile("FILE_UNREADABLE", "The file cannot be read.") }
            val id = UUID.randomUUID().toString()
            invii[id] = uri
            JSObject().put("invioId", id).put("nome", nomeDi(uri)).put("dimensione", m.dimensione).put("sha256", m.sha256)
        }
    }

    @PluginMethod
    fun pezzoInvio(call: PluginCall) {
        val uri = invii[call.getString("invioId") ?: ""] ?: return call.reject("Unknown transfer.", "TRANSFER_UNKNOWN")
        val da = TalosRemotoFile.intero(call.data.opt("da")) ?: -1L
        val quanti = TalosRemotoFile.quanti(call.data.opt("quanti")) ?: return call.reject("A chunk carries from 1 byte to 512 KiB.", "BAD_MESSAGE")
        lavora(call) {
            val dati = TalosRemotoFile.pezzo({ context.contentResolver.openInputStream(uri) ?: throw TalosRemotoFile.ErroreFile("FILE_UNREADABLE", "The file cannot be read.") }, da, quanti)
            JSObject().put("dati", dati)
        }
    }

    @PluginMethod
    fun chiudiInvio(call: PluginCall) {
        invii.remove(call.getString("invioId") ?: "")
        call.resolve()
    }

    /** Lo spazio prima di tutto; poi il parziale, ritrovato se c'è già (la ripresa parte dai suoi byte). */
    @PluginMethod
    fun iniziaScarico(call: PluginCall) {
        val pcId = call.getString("pcId") ?: ""
        val sessionId = call.getString("sessionId") ?: ""
        val fileId = call.getString("fileId") ?: ""
        val versione = call.getString("versione") ?: ""
        val dimensione = TalosRemotoFile.intero(call.data.opt("dimensione")) ?: -1L
        if (listOf(pcId, sessionId, fileId, versione).any { it.isBlank() } || dimensione < 0 || dimensione > TalosRemotoFile.MASSIMO) {
            return call.reject("A download needs the computer, the session, the file and its size.", "BAD_MESSAGE")
        }
        lavora(call) {
            val chiave = TalosRemotoFile.chiave(pcId, sessionId, fileId, versione)
            val parziale = TalosRemotoFile.fileNellaCartella(cartella, "$chiave.part")
            val finale = TalosRemotoFile.fileNellaCartella(cartella, "$chiave.bin")
            val gia = if (parziale.exists()) parziale.length() else 0L
            TalosRemotoFile.controllaSpazio(dimensione - gia, StatFs(cartella.path).availableBytes)
            scarichi[chiave] = Scarico(parziale, finale)
            JSObject().put("scaricoId", chiave).put("ricevuti", gia)
        }
    }

    @PluginMethod
    fun accodaScarico(call: PluginCall) {
        val s = scarichi[call.getString("scaricoId") ?: ""] ?: return call.reject("Unknown download.", "TRANSFER_UNKNOWN")
        val da = TalosRemotoFile.intero(call.data.opt("da")) ?: -1L
        val dati = call.getString("dati") ?: ""
        lavora(call) { JSObject().put("ricevuti", TalosRemotoFile.accoda(s.parziale, da, dati)) }
    }

    @PluginMethod
    fun concludiScarico(call: PluginCall) {
        val id = call.getString("scaricoId") ?: ""
        val s = scarichi[id] ?: return call.reject("Unknown download.", "TRANSFER_UNKNOWN")
        val sha = call.getString("sha256")?.takeIf { Regex("^[0-9a-fA-F]{64}$").matches(it) }
        lavora(call) {
            try {
                TalosRemotoFile.concludi(s.parziale, s.finale, sha)
            } finally { scarichi.remove(id) }
            val testa = s.finale.inputStream().use { i -> ByteArray(4096).let { b -> b.copyOf(maxOf(0, i.read(b))) } }
            val tipo = TalosRemotoFile.tipo(testa)
            JSObject().put("percorsoLocale", s.finale.name).put("mime", tipo.mime).put("eseguibile", tipo.eseguibile).put("byte", s.finale.length())
        }
    }

    private fun locale(call: PluginCall): File = TalosRemotoFile.fileNellaCartella(cartella, call.getString("percorsoLocale") ?: "")
        .also { if (!it.isFile) throw TalosRemotoFile.ErroreFile("FILE_GONE", "The file is no longer on the device.") }

    private fun uriDi(f: File): Uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", f)

    /**
     * Revisione S3-2 (Desktop, 25/10): il lavoro sul file sta su IO, l'intenzione parte sul thread principale. Senza un'activity
     * davanti non si apre niente: `FILE_NOT_OPENABLE`, come per un eseguibile.
     */
    private fun avviaSulPrincipale(call: PluginCall, intenzione: Intent) {
        val a = activity ?: return call.reject("There is no screen to open the file from.", "FILE_NOT_OPENABLE")
        a.runOnUiThread {
            try { a.startActivity(intenzione); call.resolve() } catch (e: android.content.ActivityNotFoundException) {
                call.reject("No app on this device opens this file.", "FILE_NOT_OPENABLE")
            }
        }
    }

    /** «Apri»: l'app di sistema giusta; MAI un eseguibile. */
    @PluginMethod
    fun apri(call: PluginCall) {
        ambito.launch {
            try {
                val f = locale(call)
                val tipo = f.inputStream().use { i -> TalosRemotoFile.tipo(ByteArray(4096).let { b -> b.copyOf(maxOf(0, i.read(b))) }) }
                if (tipo.eseguibile) throw TalosRemotoFile.ErroreFile("FILE_NOT_OPENABLE", "Packages and executables are only saved, never opened.")
                val uri = uriDi(f)
                val vista = Intent(Intent.ACTION_VIEW).setDataAndType(uri, tipo.mime).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                avviaSulPrincipale(call, Intent.createChooser(vista, null).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION))
            } catch (e: TalosRemotoFile.ErroreFile) {
                call.reject(e.message, e.codice)
            } catch (e: Exception) {
                call.reject(e.message ?: "FILE_NOT_OPENABLE", "FILE_NOT_OPENABLE")
            }
        }
    }

    @PluginMethod
    fun condividi(call: PluginCall) {
        ambito.launch {
            try {
                val uri = uriDi(locale(call))
                val manda = Intent(Intent.ACTION_SEND).setType("application/octet-stream").putExtra(Intent.EXTRA_STREAM, uri)
                    .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                manda.clipData = ClipData.newRawUri(null, uri)
                avviaSulPrincipale(call, Intent.createChooser(manda, null))
            } catch (e: TalosRemotoFile.ErroreFile) {
                call.reject(e.message, e.codice)
            } catch (e: Exception) {
                call.reject(e.message ?: "FILE_NOT_OPENABLE", "FILE_NOT_OPENABLE")
            }
        }
    }

    /** Per «Salva in…»: una copia col nome vero nella cartella che `TalosFileExport.saveFile` accetta. */
    @PluginMethod
    fun perSalvare(call: PluginCall) {
        val nome = call.getString("nome") ?: ""
        lavora(call) {
            val f = locale(call)
            val export = File(context.cacheDir, "talos-export").apply { mkdirs() }
            val copia = File(export, TalosRemotoFile.nomeSicuro(nome))
            f.copyTo(copia, overwrite = true)
            JSObject().put("percorso", copia.absolutePath).put("byte", copia.length())
        }
    }

    /** «Togli dal dispositivo»: solo la copia nella cache; sul PC il file resta. */
    @PluginMethod
    fun togli(call: PluginCall) {
        lavora(call) {
            val f = TalosRemotoFile.fileNellaCartella(cartella, call.getString("percorsoLocale") ?: "")
            f.delete()
            null
        }
    }
}
