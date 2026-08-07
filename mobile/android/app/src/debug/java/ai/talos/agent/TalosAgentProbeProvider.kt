package ai.talos.agent

import android.content.ContentProvider
import android.content.ContentValues
import android.database.Cursor
import android.database.MatrixCursor
import android.net.Uri
import android.os.Process

/**
 * C0-bis — quanto costa DAVVERO un secondo processo, misurato e non stimato.
 *
 * ## Perche' questa misura non era nel ledger, e ci doveva essere
 *
 * Il dossier chiede «nessun Binder Shizuku nel processo della WebView»: giusto,
 * e costa un processo `:agent` separato. Il ledger lo dava per acquisito.
 *
 * Ma il 2026-08-07 la misura del motore locale ha cambiato il conto: un modello
 * da 1,8 GB con contesto 16.384 porta il processo principale a **4884 MB**, e il
 * Pad dichiara **4,7 GB utilizzabili**. Un secondo processo con il suo runtime
 * Android costa decine di MB — poco in assoluto, molto quando il primo e' gia'
 * al limite, perche' Android uccide per primo il processo piu' grosso.
 *
 * Quindi: si misura prima di disegnare.
 *
 * ## Perche' un ContentProvider e non un Service
 *
 * Perche' un provider si puo' far nascere **da fuori**, con `adb shell content
 * query`, senza scrivere una riga nel processo principale. Un Service vorrebbe
 * qualcuno che lo avvii, e quel qualcuno sarebbe codice nuovo nel processo che
 * sto cercando di misurare — cioe' la misura cambierebbe la cosa misurata.
 *
 * ⛔ Vive nel source set `debug` e **non puo' finire in una build di rilascio**:
 * e' esportato, e un provider esportato e' una superficie. Qui restituisce due
 * costanti e il proprio pid, niente di privato — ma la regola vale lo stesso.
 *
 * Restituisce anche la versione del linguaggio Kotlin chiesta al runtime: e' la
 * prova a RUNTIME della riga C0, che il controllo sul dex da solo non da'.
 */
class TalosAgentProbeProvider : ContentProvider() {

    override fun onCreate(): Boolean = true

    override fun query(
        uri: Uri,
        projection: Array<out String>?,
        selection: String?,
        selectionArgs: Array<out String>?,
        sortOrder: String?,
    ): Cursor {
        val cursor = MatrixCursor(arrayOf("marker", "kotlin", "pid"))
        cursor.addRow(arrayOf(
            TalosAgentProbe.MARKER,
            TalosAgentProbe.languageVersion(),
            Process.myPid().toString(),
        ))
        return cursor
    }

    override fun getType(uri: Uri): String? = null
    override fun insert(uri: Uri, values: ContentValues?): Uri? = null
    override fun delete(uri: Uri, selection: String?, selectionArgs: Array<out String>?): Int = 0
    override fun update(
        uri: Uri,
        values: ContentValues?,
        selection: String?,
        selectionArgs: Array<out String>?,
    ): Int = 0
}
