package ai.talos.terminal

import java.io.File

/**
 * K2-A (owner 14/10/2026, «Ritocco al build» e «Una copia sola»; ledger `LEDGER-K2A-NODE-AUTOSUFFICIENTE-2026-10-14.md`).
 *
 * Node (build di Termux) e le sue 9 librerie stanno SOLO fra le librerie native dell'APK, ognuna con `DT_RUNPATH=$ORIGIN`:
 * il linker di Android le cerca accanto al file (dall'API 24), senza `LD_LIBRARY_PATH`. È ciò che fa partire anche i `node`
 * figli a cui il server r4 filtra l'ambiente (K0: `CANNOT LINK EXECUTABLE … libz.so.1`). Il ritocco e le impronte stanno in
 * `scripts/node-nativo/`. Qui ciò che serve all'app: i nomi, i file da spingere al ponte, la pulizia di prima.
 */
object TalosNodeNativo {
    const val BINARIO = "libtalosnode.so"

    /** Le 9 librerie di Node, coi nomi di `scripts/node-nativo/node-nativo.json`. */
    val LIBRERIE = listOf(
        "libtalosz.so", "libtaloscares.so", "libtalossqlite3.so", "libtaloscrypto.so", "libtalosssl.so",
        "libtalosicudata.so", "libtalosicui18n.so", "libtalosicuuc.so", "libtaloscxx.so",
    )

    /** Ciò che fino al 14/10 si copiava dagli asset in `files/talos-node-staging` (~92 MB): da togliere a chi aggiorna. */
    val RUNTIME_VECCHIO = listOf(
        "talos-node-bin", "libz.so.1", "libcares.so", "libsqlite3.so", "libcrypto.so.3", "libssl.so.3",
        "libicudata.so.78", "libicui18n.so.78", "libicuuc.so.78", "libc++_shared.so",
    )

    /**
     * Per la strada del ponte: ogni file locale e dove va sul telefono. Node prende il nome remoto `node`; le librerie il loro,
     * nella STESSA cartella remota, perché `$ORIGIN` è la cartella del binario. Un file mancante è un errore che lo nomina.
     */
    fun fileDaSpingere(cartellaNative: File, areaRemota: String): List<Pair<File, String>> =
        (listOf(BINARIO) + LIBRERIE).map { nome ->
            val locale = File(cartellaNative, nome)
            if (!locale.isFile) throw java.io.IOException("manca fra le librerie native: $nome")
            locale to if (nome == BINARIO) "$areaRemota/node" else "$areaRemota/$nome"
        }

    /** Toglie da `staging` il runtime di prima (anche le copie a metà `.tmp`); il resto non si tocca. Torna quanti file ha tolto. */
    fun pulisciRuntimeVecchio(staging: File): Int {
        val nomi = RUNTIME_VECCHIO.toSet() + RUNTIME_VECCHIO.map { "$it.tmp" }
        return staging.listFiles { f -> f.isFile && f.name in nomi }?.count { it.delete() } ?: 0
    }
}
