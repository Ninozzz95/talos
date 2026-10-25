// ⛔ Copiato INVARIATO da iroh-ffi (https://github.com/n0-computer/iroh-ffi), tag v1.1.0, commit 5e45109
// (5e451092dba0c1a09ee83ff6e5be37b1152a5c58), percorso `kotlin/android/src/main/kotlin/computer/iroh/IrohAndroid.kt`.
// Copyright 2025 N0, INC. — licenza MIT OR Apache-2.0 (LICENSE-MIT, LICENSE-APACHE di quel repo).
//
// Perché sta qui: la classe esiste solo nell'AAR `iroh-android`, che non usiamo (porta una .so con RUSTSEC-2026-0285); il JAR
// `computer.iroh:iroh:1.1.0` non ce l'ha. La NOSTRA `libiroh_ffi.so` esporta già il simbolo JNI
// `Java_computer_iroh_IrohAndroid_installAndroidContext`: il pacchetto e il nome NON si cambiano, e R8 li tiene
// (`proguard-rules.pro`). La chiama `ai.talos.remoto.TalosRemotoContestoIroh` (vedi `jniLibs/PROVENIENZA-IROH.md`).
package computer.iroh

import android.content.Context

/**
 * Android-specific iroh initialization. Apps must call
 * [installAndroidContext] once during startup (typically from
 * `Application.onCreate` or before constructing any [Endpoint]) so
 * that iroh's DNS resolver can reach Android's [`LinkProperties`] via
 * JNI.
 *
 * The call is idempotent — subsequent invocations are no-ops.
 */
object IrohAndroid {
    init {
        // libiroh_ffi exposes the JNI entry point Java_computer_iroh_IrohAndroid_installAndroidContext.
        // Loading the library here makes the symbol available before the first external call.
        System.loadLibrary("iroh_ffi")
    }

    @JvmStatic
    external fun installAndroidContext(context: Context)
}
