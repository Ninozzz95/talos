package ai.talos.agent.ponte

import android.app.AppOpsManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Process
import android.provider.Settings

/**
 * Il lato Android di `TalosReteLocaleRegola` (ASS-148). L'operazione di Android 17 (`OP_ACCESS_LOCAL_NETWORK`) è `@hide`: la si ricava dal
 * permesso con `permissionToOp`, che è pubblica. Prima di Android 17 non esiste e `bloccata()` è sempre false.
 */
object TalosReteLocale {

    fun bloccata(context: Context): Boolean = runCatching {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return@runCatching false
        val op = AppOpsManager.permissionToOp(TalosReteLocaleRegola.PERMESSO) ?: return@runCatching false
        val appOps = context.getSystemService(AppOpsManager::class.java) ?: return@runCatching false
        TalosReteLocaleRegola.bloccataDalModo(appOps.unsafeCheckOpNoThrow(op, Process.myUid(), context.packageName))
    }.getOrDefault(false) // un'eccezione vale «non lo so», cioè non bloccata (OK del Desktop)

    /** La pagina dei permessi di TALOS, dove sta «Rete locale» (owner 28/10: «Messaggio chiaro + pulsante»). */
    fun intentPermessi(context: Context): Intent = Intent(
        Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
        Uri.fromParts("package", context.packageName, null),
    )
}
