package ai.talos.aggiornamenti

import org.json.JSONObject

/**
 * Da dove si legge l'aggiornamento: l'elenco delle release, i file di una release, e la chiave pubblica che deve averli firmati.
 *
 * In produzione è GitHub, fisso: il repository pubblico, dove escono mobile, desktop e CLI (il desktop legge lo stesso elenco,
 * `aggiornamenti.mjs:44-74`). La fonte di prova serve solo alla prova dal vivo sul Pad e la accetta solo la copia affiancata.
 */
class TalosFonteAggiornamenti private constructor(
    val elenco: String,
    private val baseFile: String,
    val pubblica: String,
) {
    fun file(tag: String, nome: String): String = "$baseFile/$tag/$nome"

    companion object {
        private const val REPOSITORY = "Ninozzz95/talos"
        private val BASE_DI_PROVA = Regex("""^http://127\.0\.0\.1:(\d{2,5})$""")

        /** Null = fonte di prova malformata: l'aggiornatore si ferma (come il desktop), non torna in silenzio a GitHub. */
        fun scegli(copiaAffiancata: Boolean, fileDiProva: String?, pubblicaDellApp: String): TalosFonteAggiornamenti? {
            if (!copiaAffiancata || fileDiProva == null) {
                return TalosFonteAggiornamenti(
                    "https://api.github.com/repos/$REPOSITORY/releases?per_page=30",
                    "https://github.com/$REPOSITORY/releases/download",
                    pubblicaDellApp,
                )
            }
            val prova = runCatching { JSONObject(fileDiProva) }.getOrNull() ?: return null
            val base = prova.optString("base", "")
            val pubblica = prova.optString("pubblica", "")
            val porta = BASE_DI_PROVA.matchEntire(base)?.groupValues?.get(1)?.toIntOrNull() ?: return null
            if (porta !in 1024..65535 || !pubblica.contains("BEGIN PUBLIC KEY")) return null
            return TalosFonteAggiornamenti("$base/releases", "$base/download", pubblica)
        }
    }
}
