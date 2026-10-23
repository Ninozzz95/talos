package ai.talos.aggiornamenti

import org.json.JSONArray
import org.json.JSONObject

/**
 * Le novità del cassetto, in inglese E italiano: `note-android.json` + `note-android.json.sig`, scritti e firmati dalla CI con la
 * chiave del manifesto. Forma: `{"version":"0.1.44","en":["…"],"it":["…"]}`, da 1 a 8 voci per lingua, ognuna di una riga sola e
 * al massimo 240 caratteri. Tutto ciò che non ha questa forma non si mostra: le note non bloccano mai l'aggiornamento.
 */
object TalosNoteAggiornamento {

    const val NOTE = "note-android.json"
    const val FIRMA = "note-android.json.sig"
    const val MASSIMO_BYTE = 16 * 1024
    private const val MASSIME_VOCI = 8
    private const val MASSIMI_CARATTERI = 240
    private val CAMPI = setOf("version", "en", "it")

    /** Le note normalizzate (`{"en":[…],"it":[…]}`), o null se non sono firmate, non sono di questa versione o non hanno la forma. */
    fun verificate(versione: String, byte: ByteArray, firmaBase64: String, pubblicaPem: String): String? {
        if (byte.size > MASSIMO_BYTE) return null
        if (!TalosFirmaAggiornamento.verifica(byte, firmaBase64, pubblicaPem)) return null
        val note = runCatching { JSONObject(String(byte, Charsets.UTF_8)) }.getOrNull() ?: return null
        if (note.keys().asSequence().toSet() != CAMPI) return null
        if (note.optString("version") != versione) return null
        val en = voci(note.opt("en")) ?: return null
        val it = voci(note.opt("it")) ?: return null
        return JSONObject().put("en", JSONArray(en)).put("it", JSONArray(it)).toString()
    }

    private fun voci(valore: Any?): List<String>? {
        val elenco = valore as? JSONArray ?: return null
        if (elenco.length() !in 1..MASSIME_VOCI) return null
        return (0 until elenco.length()).map { i ->
            val voce = elenco.opt(i) as? String ?: return null
            if (voce.isBlank() || voce.length > MASSIMI_CARATTERI || voce.any { it.isISOControl() }) return null
            voce.trim()
        }
    }
}
