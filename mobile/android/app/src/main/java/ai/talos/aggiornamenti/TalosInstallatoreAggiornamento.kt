package ai.talos.aggiornamenti

import ai.talos.TalosScaricamentoAggiornamento
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInfo
import android.content.pm.PackageInstaller
import android.content.pm.PackageManager
import android.os.Build
import java.io.File
import java.security.MessageDigest

/**
 * L'installazione dell'APK scaricato, con `PackageInstaller` a sessione (AOSP `PackageInstaller.java`, javadoc di
 * `setRequireUserAction`). Senza conferma della persona quando TUTTO vale: `USER_ACTION_NOT_REQUIRED`, target ≥ 33 su Android 15
 * (TALOS ha 36), l'app aggiorna sé stessa, `UPDATE_PACKAGES_WITHOUT_USER_ACTION` dichiarato (protezione «normal»). La prima volta
 * serve comunque «Installa app sconosciute» per TALOS (`REQUEST_INSTALL_PACKAGES`), e `STATUS_PENDING_USER_ACTION` resta sempre
 * possibile: lo gestisce `TalosRicevitoreInstallazione`.
 *
 * Ordine (Signal `ApkUpdateInstaller.kt:41-145`, più severo): controlli sul pacchetto → sessione col nome del NOSTRO pacchetto →
 * copia con SHA-512 sugli stessi byte → confronto a tempo costante → `commit`, oppure `abandon`.
 */
object TalosInstallatoreAggiornamento {

    const val EXTRA_DALLA_PERSONA = "ai.talos.aggiornamenti.dalla_persona"

    /** Android lascia installare a TALOS? Falso finché la persona non concede «Installa app sconosciute» (tavola 3). */
    fun permessoConcesso(context: Context): Boolean =
        Build.VERSION.SDK_INT < Build.VERSION_CODES.O || context.packageManager.canRequestPackageInstalls()

    /** Torna null se la sessione è partita (l'esito arriva al ricevitore), altrimenti il motivo per cui non è partita. */
    fun installa(context: Context, dallaPersona: Boolean): String? {
        val trovata = TalosStatoAggiornamento.trovata(context) ?: return "niente-da-installare"
        val apk = TalosScaricamentoAggiornamento.apk(context, trovata.path)
        if (!apk.isFile) return "file-mancante"
        if (!permessoConcesso(context)) return "permesso"

        val verdetto = TalosControlliApk.verdetto(visto(context, apk), installato(context))
        if (verdetto != TalosVerdettoApk.INSTALLABILE) return fallisci(context, apk, "apk-${verdetto.name.lowercase()}")

        val installatore = context.packageManager.packageInstaller
        val parametri = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL).apply {
            // Signal :112 — Android rifiuta la sessione se l'APK dichiara un altro pacchetto
            setAppPackageName(context.packageName)
            setSize(apk.length())
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED)
            }
        }
        val id = installatore.createSession(parametri)
        val sessione = installatore.openSession(id)
        try {
            val impronta = apk.inputStream().use { dentro ->
                sessione.openWrite("base.apk", 0, apk.length()).use { fuori ->
                    TalosCopiaConImpronta.copia(dentro, fuori).also { sessione.fsync(fuori) }
                }
            }
            if (!TalosCopiaConImpronta.coincide(impronta, trovata.sha512)) {
                sessione.abandon()
                return fallisci(context, apk, "impronta")
            }
            TalosStatoAggiornamento.segnaFase(context, TalosFaseAggiornamento.IN_INSTALLAZIONE)
            val esito = Intent(context, TalosRicevitoreInstallazione::class.java)
                .setPackage(context.packageName)
                .putExtra(EXTRA_DALLA_PERSONA, dallaPersona)
            // MUTABLE: è PackageInstaller a riempire lo stato dentro l'intent (Signal :133-141, Droid-ify :28)
            val attesa = PendingIntent.getBroadcast(context, id, esito,
                PendingIntent.FLAG_UPDATE_CURRENT or (if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) PendingIntent.FLAG_MUTABLE else 0))
            sessione.commit(attesa.intentSender)
            return null
        } catch (guasto: Exception) {
            runCatching { sessione.abandon() }
            TalosStatoAggiornamento.segnaFase(context, TalosFaseAggiornamento.PRONTA, "sessione")
            return "sessione"
        } finally {
            sessione.close()
        }
    }

    /** Un APK alterato o non nostro non si riprova: si cancella, e la versione resta rifiutata finché il manifesto non cambia. */
    private fun fallisci(context: Context, apk: File, motivo: String): String {
        apk.delete()
        TalosStatoAggiornamento.segnaFase(context, TalosFaseAggiornamento.FALLITA, motivo)
        return motivo
    }

    private fun visto(context: Context, apk: File): TalosPacchettoVisto? {
        val info = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            context.packageManager.getPackageArchiveInfo(apk.path, PackageManager.GET_SIGNING_CERTIFICATES)
        } else {
            @Suppress("DEPRECATION")
            context.packageManager.getPackageArchiveInfo(apk.path, PackageManager.GET_SIGNATURES)
        } ?: return null
        return descrivi(info)
    }

    private fun installato(context: Context): TalosPacchettoVisto {
        val info = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            context.packageManager.getPackageInfo(context.packageName, PackageManager.GET_SIGNING_CERTIFICATES)
        } else {
            @Suppress("DEPRECATION")
            context.packageManager.getPackageInfo(context.packageName, PackageManager.GET_SIGNATURES)
        }
        return descrivi(info) ?: TalosPacchettoVisto(context.packageName, Long.MAX_VALUE, emptySet())
    }

    private fun descrivi(info: PackageInfo): TalosPacchettoVisto? {
        val firme = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            val s = info.signingInfo ?: return null
            if (s.hasMultipleSigners()) s.apkContentsSigners else s.signingCertificateHistory
        } else {
            @Suppress("DEPRECATION")
            info.signatures
        } ?: return null
        val sha = MessageDigest.getInstance("SHA-256")
        val impronte = firme.map { firma -> sha.digest(firma.toByteArray()).joinToString("") { "%02x".format(it) } }.toSet()
        val codice = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) info.longVersionCode else {
            @Suppress("DEPRECATION")
            info.versionCode.toLong()
        }
        return TalosPacchettoVisto(info.packageName ?: return null, codice, impronte)
    }
}
