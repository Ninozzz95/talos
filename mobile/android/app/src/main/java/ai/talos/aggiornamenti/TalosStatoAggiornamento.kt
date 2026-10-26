package ai.talos.aggiornamenti

import android.content.Context
import android.content.SharedPreferences
import org.json.JSONObject

/**
 * Lo stato dell'aggiornamento automatico, persistito: sopravvive alla morte del processo (il job lavora ad app chiusa, e
 * l'installazione UCCIDE il processo). Il TypeScript lo legge col plugin e riceve un evento a ogni cambio.
 *
 * Ledger: `.claude/ragionamento/LEDGER-AGGIORNAMENTO-AUTOMATICO-MOBILE-2026-10-22.md` §1.
 */
enum class TalosFaseAggiornamento { NESSUNA, IN_SCARICAMENTO, PRONTA, IN_INSTALLAZIONE, AGGIORNATA, FALLITA }

object TalosStatoAggiornamento {

    private const val FILE = "talos_aggiornamenti"

    private fun prefs(context: Context): SharedPreferences =
        context.applicationContext.getSharedPreferences(FILE, Context.MODE_PRIVATE)

    /** Le scelte della persona. Owner 22/10 (2): scarica da sola, solo con Wi-Fi; «Avvisami» acceso. */
    data class Scelte(val automatici: Boolean, val soloWifi: Boolean, val avvisami: Boolean)

    fun scelte(context: Context): Scelte = prefs(context).let {
        Scelte(it.getBoolean("automatici", true), it.getBoolean("soloWifi", true), it.getBoolean("avvisami", true))
    }

    fun impostaScelte(context: Context, automatici: Boolean?, soloWifi: Boolean?, avvisami: Boolean?) {
        prefs(context).edit().apply {
            automatici?.let { putBoolean("automatici", it) }
            soloWifi?.let { putBoolean("soloWifi", it) }
            avvisami?.let { putBoolean("avvisami", it) }
        }.apply()
    }

    fun fase(context: Context): TalosFaseAggiornamento =
        runCatching { TalosFaseAggiornamento.valueOf(prefs(context).getString("fase", null) ?: "NESSUNA") }
            .getOrDefault(TalosFaseAggiornamento.NESSUNA)

    /**
     * La versione trovata (pronta, in scaricamento o fallita), col suo manifesto già verificato. `note`: le novità verificate in
     * en+it (`TalosNoteAggiornamento`) o "" se non ci sono; `pagina`: la release su GitHub, o "".
     */
    data class Trovata(
        val tag: String, val versione: String, val note: String, val pagina: String,
        val path: String, val sha512: String, val size: Long?,
    )

    fun trovata(context: Context): Trovata? = prefs(context).getString("trovata", null)?.let { leggiTrovata(it) }

    private fun leggiTrovata(it: String): Trovata? =
        runCatching {
            val j = JSONObject(it)
            Trovata(j.getString("tag"), j.getString("versione"), j.optString("note", ""), j.optString("pagina", ""),
                j.getString("path"), j.getString("sha512"), if (j.has("size")) j.getLong("size") else null)
        }.getOrNull()

    fun segnaTrovata(context: Context, trovata: Trovata, fase: TalosFaseAggiornamento) {
        val j = JSONObject().put("tag", trovata.tag).put("versione", trovata.versione).put("note", trovata.note)
            .put("pagina", trovata.pagina).put("path", trovata.path).put("sha512", trovata.sha512)
        trovata.size?.let { j.put("size", it) }
        prefs(context).edit().putString("trovata", j.toString()).putString("fase", fase.name).remove("motivo").remove("scaricati").apply()
    }

    /**
     * I byte dell'APK arrivati finora (D-UPD-1: prima l'avanzamento finiva in `{ _, _ -> }` e non si vedeva niente). Li scrive il
     * lavoro di scaricamento al massimo una volta al secondo; ogni scrittura è un evento `cambio` per il pannello.
     */
    fun scaricati(context: Context): Long? = prefs(context).takeIf { it.contains("scaricati") }?.getLong("scaricati", 0L)
    fun segnaScaricati(context: Context, byte: Long) = prefs(context).edit().putLong("scaricati", byte).apply()

    fun segnaFase(context: Context, fase: TalosFaseAggiornamento, motivo: String? = null) {
        prefs(context).edit().putString("fase", fase.name).apply {
            if (motivo == null) remove("motivo") else putString("motivo", motivo)
        }.apply()
    }

    fun motivo(context: Context): String? = prefs(context).getString("motivo", null)

    /** «Al prossimo avvio» (owner 22/10, 3): s'installa quando la persona esce da TALOS e niente lavora. */
    fun installaAllUscita(context: Context): Boolean = prefs(context).getBoolean("allUscita", false)
    fun segnaInstallaAllUscita(context: Context, si: Boolean) = prefs(context).edit().putBoolean("allUscita", si).apply()

    /** «Riavvia ora»: dopo l'installazione si prova a riaprire TALOS (F-Droid `SelfUpdateReceiver.kt:42-63`). */
    fun riapri(context: Context): Boolean = prefs(context).getBoolean("riapri", false)
    fun segnaRiapri(context: Context, si: Boolean) = prefs(context).edit().putBoolean("riapri", si).apply()

    fun ultimoControllo(context: Context): Long = prefs(context).getLong("ultimoControllo", 0L)
    fun segnaControllo(context: Context, alle: Long) = prefs(context).edit().putLong("ultimoControllo", alle).apply()

    /**
     * L'impronta di un manifesto rifiutato (firma sbagliata, file alterato): non si riprova finché il manifesto non cambia
     * (tavola 7 del mockup). Non è un segreto: è lo SHA-512 dei byte del manifesto.
     */
    fun rifiutato(context: Context): String? = prefs(context).getString("rifiutato", null)
    fun segnaRifiutato(context: Context, impronta: String?) =
        prefs(context).edit().apply { if (impronta == null) remove("rifiutato") else putString("rifiutato", impronta) }.apply()

    /** La versione appena installata, da dire UNA volta alla riapertura («Aggiornata»). */
    fun appenaAggiornata(context: Context): String? = prefs(context).getString("appenaAggiornata", null)
    fun segnaAppenaAggiornata(context: Context, versione: String?) =
        prefs(context).edit().apply {
            if (versione == null) remove("appenaAggiornata").remove("installata") else putString("appenaAggiornata", versione)
        }.apply()

    /**
     * La versione appena installata da TALOS, con le sue novità: il cassetto «Aggiornata» le mostra (tavola 5 del mockup, «Cosa c'è
     * di nuovo»). Visto sul Pad il 22/10 alle 22:43: cancellata insieme alla versione trovata, il cassetto restava senza novità.
     */
    fun appenaInstallata(context: Context): Trovata? = prefs(context).getString("installata", null)?.let { leggiTrovata(it) }

    fun ascolta(context: Context, ascoltatore: SharedPreferences.OnSharedPreferenceChangeListener) =
        prefs(context).registerOnSharedPreferenceChangeListener(ascoltatore)

    fun smetti(context: Context, ascoltatore: SharedPreferences.OnSharedPreferenceChangeListener) =
        prefs(context).unregisterOnSharedPreferenceChangeListener(ascoltatore)

    /**
     * Dopo una sostituzione del pacchetto: niente più versione trovata né scelte di installazione rimaste appese. `versione` null =
     * non l'ha installata TALOS (a mano, dal browser): nessun «Aggiornata» da dire.
     */
    fun ripulisciDopoInstallazione(context: Context, versione: String?) {
        prefs(context).edit().remove("trovata").remove("motivo").remove("allUscita").remove("riapri").remove("rifiutato").remove("scaricati").apply {
            if (versione == null) {
                putString("fase", TalosFaseAggiornamento.NESSUNA.name).remove("appenaAggiornata")
            } else {
                putString("fase", TalosFaseAggiornamento.AGGIORNATA.name).putString("appenaAggiornata", versione)
                // le novità restano per il cassetto «Aggiornata» (tavola 5), fino a «visto»
                prefs(context).getString("trovata", null)?.let { putString("installata", it) }
            }
        }.apply()
    }
}
