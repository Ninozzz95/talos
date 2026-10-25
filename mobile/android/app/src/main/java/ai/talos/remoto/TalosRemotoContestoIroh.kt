package ai.talos.remoto

import android.content.Context
import android.util.Log
import computer.iroh.IrohAndroid

/**
 * ⛔ F (24/10/2026): iroh-ffi v1.1.0 vuole il contesto Android PRIMA di qualunque Endpoint (ndk-context: il risolutore DNS legge
 * `LinkProperties` via JNI). Senza, `libiroh_ffi.so` stampava a ogni canale `android context was not initialized` e ogni tanto un
 * collegamento aspettava il tetto di ~30 s. La chiamata la fa l'AAR `iroh-android`, che non usiamo: la facciamo noi, da
 * `computer.iroh.IrohAndroid` (copiata da upstream, `jniLibs/PROVENIENZA-IROH.md`).
 *
 * Due ingressi, perché ci sono due modi di arrivare a un Endpoint: il plugin (`TalosRemotoPlugin.load`, app aperta) e il lavoro
 * della sveglia (`TalosSvegliaLavoro.esegui`, anche ad app uccisa: niente bridge, quindi niente `load`). Il lato nativo è
 * idempotente (`Once`): chiamarla due volte non fa niente.
 *
 * Sempre il contesto dell'APPLICAZIONE: iroh ne tiene un riferimento globale per tutta la vita del processo, un'Activity
 * resterebbe trattenuta. Un errore (`.so` assente, simbolo mancante, `ExceptionInInitializerError` dal `loadLibrary`) diventa un
 * avviso e basta: il remoto prova lo stesso, come prima di questa cura.
 */
internal object TalosRemotoContestoIroh {
    private const val TAG = "TalosRemoto"

    /** La chiamata vera; le prove JVM la sostituiscono (sulla JVM la `.so` Android non c'è). */
    @Volatile internal var nativa: (Context) -> Unit = { IrohAndroid.installAndroidContext(it) }

    /** Dove va l'errore; le prove JVM la sostituiscono (`android.util.Log` sulla JVM delle prove lancia). */
    @Volatile internal var avviso: (Throwable) -> Unit = { Log.w(TAG, "iroh: Android context not installed", it) }

    fun prepara(contesto: Context) {
        try {
            // mai l'Activity al posto dell'applicazione: senza applicazione (non dovrebbe capitare) si salta e si avvisa
            nativa(contesto.applicationContext ?: throw IllegalStateException("no application context"))
        } catch (t: Throwable) {
            avviso(t)
        }
    }
}
