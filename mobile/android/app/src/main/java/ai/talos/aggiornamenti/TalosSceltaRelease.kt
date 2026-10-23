package ai.talos.aggiornamenti

import org.json.JSONArray

/**
 * La release del mobile scelta dall'elenco: tag, versione e pagina della release. Il corpo della release NON si mostra: è in
 * inglese, e TALOS dice ogni parola nelle due lingue; le novità arrivano da `note-android.json`, firmato (`TalosNoteAggiornamento`).
 */
data class TalosReleaseScelta(val tag: String, val versione: String, val pagina: String)

/**
 * Nel repository pubblico escono tre prodotti; il mobile ha i tag `vX.Y.Z`. Si legge l'elenco
 * (`GET /repos/Ninozzz95/talos/releases?per_page=30`, come il desktop in `aggiornamenti.mjs:44-74`) e vince la versione più
 * alta che non sia bozza né pre-release. Qualunque risposta che non sia un elenco (limite di frequenza, pagina d'errore) non
 * sceglie niente.
 */
object TalosSceltaRelease {

    fun scegli(elencoJson: String): TalosReleaseScelta? {
        val elenco = try {
            JSONArray(elencoJson)
        } catch (ignorata: Exception) {
            return null
        }
        var migliore: TalosReleaseScelta? = null
        for (i in 0 until elenco.length()) {
            val voce = elenco.optJSONObject(i) ?: continue
            if (voce.optBoolean("draft", true) || voce.optBoolean("prerelease", true)) continue
            val tag = voce.optString("tag_name", "")
            val versione = TalosVersioneAggiornamento.dalTag(tag) ?: continue
            if (migliore == null || TalosVersioneAggiornamento.piuNuova(versione, migliore.versione)) {
                // solo una pagina di GitHub: un indirizzo qualunque nell'elenco non si apre
                val pagina = voce.optString("html_url", "").takeIf { it.startsWith("https://github.com/") } ?: ""
                migliore = TalosReleaseScelta(tag, versione, pagina)
            }
        }
        return migliore
    }
}
