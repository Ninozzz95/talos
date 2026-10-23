package ai.talos.remoto

import android.content.Context
import android.content.SharedPreferences
import android.content.pm.PackageManager
import org.json.JSONObject
import org.unifiedpush.android.connector.UnifiedPush

/**
 * ⛔ R-M5a (ledger `LEDGER-CLIENT-REMOTO-MOBILE-2026-10-20.md`, 21/10/2026): la SVEGLIA del telefono, lato registrazione. Una istanza
 * UnifiedPush per PC (`TalosSvegliaAvvisi.istanza`), registrata con la VAPID di QUEL PC (`pair.ok` `pc.vapid`, custodita con lui):
 * il distributore FCM incorporato la consegna via Google Play services senza un progetto Firebase nostro (kdoc: «If your
 * application supports VAPID, you have nothing special to do»). Il distributore è SEMPRE quello incorporato (owner 15/10: «nessuna
 * app in più»): `saveDistributor` sul pacchetto stesso, prima di `register` (kdoc del connettore).
 *
 * Qui si ricorda, in preferenze private (backup spento in tutta l'app), per ogni PC: l'iscrizione che il connettore ha dato (endpoint
 * + p256dh/auth, da mandare al PC con `device.wake`), se va ancora mandata, quando la sveglia è stata accesa, le firme dei giri già
 * detti e le notifiche mostrate. Le chiavi di cifratura del Web Push le tiene il connettore, non noi.
 */
object TalosSveglia {
    private const val FILE = "talos.remoto.sveglia"

    data class Iscrizione(val endpoint: String, val p256dh: String, val auth: String) {
        fun inJson(): JSONObject = JSONObject().put("endpoint", endpoint).put("keys", JSONObject().put("p256dh", p256dh).put("auth", auth))
    }

    /** Il PIN di TALOS è acceso (lo dice il TypeScript a ogni avvio e a ogni cambio): notifiche generiche (owner 21/10/2026). */
    fun riservata(context: Context): Boolean = prefs(context).getBoolean("riservata", false)

    fun impostaRiservata(context: Context, attiva: Boolean) {
        val prima = riservata(context)
        prefs(context).edit().putBoolean("riservata", attiva).apply()
        if (!attiva || prima) return
        // ⛔ D-RM5-5 (dal Pad, 21/10/2026): le notifiche mostrate PRIMA del blocco restavano col dettaglio. Acceso il blocco, quelle
        // del computer se ne vanno tutte; le firme delle richieste si segnano con `~` (revisione bis, 10): alla sveglia dopo le
        // richieste ancora aperte tornano generiche e IN SILENZIO (la persona le aveva già), quelle nuove suonano.
        synchronized(lucchetto) {
            TalosSvegliaNotifiche.togliDettagli(context)
            val p = prefs(context)
            val chiavi = p.all.keys.filter { it.endsWith(".richieste") }
            p.edit().apply {
                for (k in chiavi) {
                    val o = try { JSONObject(p.getString(k, "{}") ?: "{}") } catch (e: Exception) { JSONObject() }
                    val segnate = JSONObject()
                    for (id in o.keys()) segnate.put(id, "~" + o.optString(id).removePrefix("~"))
                    putString(k, segnate.toString())
                }
            }.apply()
        }
    }

    fun googleDisponibile(context: Context): Boolean = try {
        context.packageManager.getPackageInfo("com.google.android.gms", 0); true
    } catch (e: PackageManager.NameNotFoundException) { false }

    /** Accende la sveglia di un PC. `false` se la VAPID non va (il connettore la rifiuta). L'iscrizione arriva dopo, a `onNewEndpoint`. */
    fun registra(context: Context, pcId: String, vapid: String, nomePc: String?): Boolean {
        val istanza = TalosSvegliaAvvisi.istanza(pcId)
        UnifiedPush.saveDistributor(context, context.packageName)
        val p = prefs(context)
        // revisione R-M5a (16): un posto del job per PC, assegnato una volta (il primo libero) e ricordato finché la sveglia c'è
        val posto = if (p.contains("$istanza.posto")) p.getInt("$istanza.posto", 0)
            else TalosSvegliaAvvisi.postoLibero(p.all.filterKeys { it.endsWith(".posto") }.values.mapNotNull { it as? Int }.toSet())
        // revisione R-M5a (21): i canali ricreati dopo uno spegnimento non ereditano le impostazioni di quelli di prima
        val generazione = p.getInt("generazione.$istanza", 0) + 1
        p.edit()
            .putString("$istanza.pc", pcId)
            .putInt("$istanza.posto", posto)
            .putInt("generazione.$istanza", generazione)
            .putString("$istanza.nome", nomePc?.take(64))
            .putLong("$istanza.attivataAlle", System.currentTimeMillis())
            .remove("$istanza.errore")
            // l'iscrizione di prima non vale più finché il distributore non ne ridà una (`onNewEndpoint` arriva a ogni `register`)
            .remove("$istanza.endpoint").remove("$istanza.p256dh").remove("$istanza.auth").remove("$istanza.daMandare")
            .apply()
        return try {
            UnifiedPush.register(context, istanza, null, vapid)
            true
        } catch (e: UnifiedPush.VapidNotValidException) {
            segnaErrore(context, istanza, "VAPID_NOT_VALID")
            false
        }
    }

    /** Spegne la sveglia di un PC: il connettore la toglie dal distributore, e qui non resta niente. */
    fun annulla(context: Context, pcId: String) {
        val istanza = TalosSvegliaAvvisi.istanza(pcId)
        try { UnifiedPush.unregister(context, istanza) } catch (e: Exception) { /* già tolta */ }
        // revisione R-M5a bis (3): i lavori in coda (o rimessi in coda) di questo PC non pubblicano più niente dopo lo spegnimento
        TalosSvegliaLavoro.cancellaTutti(context, posto(context, pcId))
        dimentica(context, istanza)
    }

    fun pcDellIstanza(context: Context, istanza: String): String? = prefs(context).getString("$istanza.pc", null)

    /** Il nome del PC per la notifica provvisoria, senza aprire la custodia (che tiene la chiave del telefono). */
    fun nomePc(context: Context, pcId: String): String? = prefs(context).getString("${TalosSvegliaAvvisi.istanza(pcId)}.nome", null)

    fun posto(context: Context, pcId: String): Int = prefs(context).getInt("${TalosSvegliaAvvisi.istanza(pcId)}.posto", 0)

    /** La generazione dei canali di questo PC: cresce a ogni accensione (vedi `registra`), resta anche dopo `dimentica`. */
    fun generazione(context: Context, pcId: String): Int = prefs(context).getInt("generazione.${TalosSvegliaAvvisi.istanza(pcId)}", 0)

    /**
     * Revisione R-M5a (1): l'iscrizione torna «da mandare». La usa «Prova la notifica» quando il PC non ce l'ha
     * (`senza-iscrizione`): il lavoro la rimanda appena il PC risponde.
     */
    fun segnaDaMandare(context: Context, pcId: String) {
        val i = TalosSvegliaAvvisi.istanza(pcId)
        if (prefs(context).contains("$i.endpoint")) prefs(context).edit().putBoolean("$i.daMandare", true).apply()
    }

    /** Revisione R-M5a (3): la firma di ogni richiesta già detta, per id di notifica (`TalosSvegliaAvvisi.firmaRichiesta`). */
    fun firmeRichieste(context: Context, pcId: String): Map<Int, String> {
        val testo = prefs(context).getString("${TalosSvegliaAvvisi.istanza(pcId)}.richieste", null) ?: return emptyMap()
        return try {
            JSONObject(testo).let { o -> o.keys().asSequence().mapNotNull { k -> k.toIntOrNull()?.let { it to o.optString(k) } }.toMap() }
        } catch (e: Exception) { emptyMap() }
    }

    fun salvaFirmeRichieste(context: Context, pcId: String, firme: Map<Int, String>) {
        prefs(context).edit().putString("${TalosSvegliaAvvisi.istanza(pcId)}.richieste",
            JSONObject(firme.mapKeys { it.key.toString() }).toString()).apply()
    }

    /**
     * Revisione R-M5a bis (7): un lucchetto solo per le carte viste e le firme delle richieste, preso dal lavoro (lettura delle viste,
     * notifiche, salvataggio) e da `svegliaVista`: una carta vista in mezzo non viene ripubblicata né la sua firma riscritta.
     */
    val lucchetto = Any()

    /** D-RM5-4: le carte viste nell'app per questo PC (`sessionId|chiave`), in JSON (revisione bis, 8), le più recenti in fondo. */
    fun viste(context: Context, pcId: String): List<String> =
        TalosSvegliaAvvisi.daJsonViste(prefs(context).getString("${TalosSvegliaAvvisi.istanza(pcId)}.viste", null))

    fun salvaViste(context: Context, pcId: String, viste: List<String>) {
        prefs(context).edit().putString("${TalosSvegliaAvvisi.istanza(pcId)}.viste", TalosSvegliaAvvisi.inJsonViste(viste)).apply()
    }

    fun segnaViste(context: Context, pcId: String, sessionId: String, carte: List<String>) {
        val nuove = carte.filter { it.length <= 400 }.map { "$sessionId|$it" }
        salvaViste(context, pcId, TalosSvegliaAvvisi.aggiungiViste(viste(context, pcId), nuove, VISTE_MASSIME))
    }

    private const val VISTE_MASSIME = 200

    fun accesa(context: Context, pcId: String): Boolean = pcDellIstanza(context, TalosSvegliaAvvisi.istanza(pcId)) == pcId

    fun salvaIscrizione(context: Context, istanza: String, iscrizione: Iscrizione) {
        prefs(context).edit()
            .putString("$istanza.endpoint", iscrizione.endpoint)
            .putString("$istanza.p256dh", iscrizione.p256dh)
            .putString("$istanza.auth", iscrizione.auth)
            .putBoolean("$istanza.daMandare", true)
            .remove("$istanza.errore")
            .apply()
    }

    fun iscrizione(context: Context, pcId: String): Iscrizione? {
        val p = prefs(context)
        val i = TalosSvegliaAvvisi.istanza(pcId)
        val endpoint = p.getString("$i.endpoint", null) ?: return null
        return Iscrizione(endpoint, p.getString("$i.p256dh", null) ?: return null, p.getString("$i.auth", null) ?: return null)
    }

    fun daMandare(context: Context, pcId: String): Boolean = prefs(context).getBoolean("${TalosSvegliaAvvisi.istanza(pcId)}.daMandare", false)

    /** Il PC ha questa iscrizione (`device.wake` riuscito, dal lavoro o dal TypeScript). Solo se è ancora quella mandata. */
    fun segnaMandata(context: Context, pcId: String, endpoint: String) {
        val i = TalosSvegliaAvvisi.istanza(pcId)
        if (prefs(context).getString("$i.endpoint", null) == endpoint) prefs(context).edit().putBoolean("$i.daMandare", false).apply()
    }

    fun segnaErrore(context: Context, istanza: String, codice: String) {
        prefs(context).edit().putString("$istanza.errore", codice.take(40)).apply()
    }

    /** «Prova la notifica»: la prossima sveglia di questo PC, entro `PROVA_MS`, è la prova (la chiede il TypeScript PRIMA di `device.wake.test`). */
    fun segnaProva(context: Context, pcId: String) {
        prefs(context).edit().putLong("${TalosSvegliaAvvisi.istanza(pcId)}.provaAlle", System.currentTimeMillis()).apply()
    }

    /** Revisione R-M5a (2): la prova non è partita (PC fuori, troppo presto…): il segno si toglie, una sveglia vera resta vera. */
    fun annullaProva(context: Context, pcId: String) {
        prefs(context).edit().remove("${TalosSvegliaAvvisi.istanza(pcId)}.provaAlle").apply()
    }

    /** Vero una volta sola, se la prova è stata chiesta da poco. */
    fun prendiProva(context: Context, pcId: String): Boolean {
        val chiave = "${TalosSvegliaAvvisi.istanza(pcId)}.provaAlle"
        val alle = prefs(context).getLong(chiave, 0L)
        if (alle == 0L) return false
        prefs(context).edit().remove(chiave).apply()
        return System.currentTimeMillis() - alle in 0..PROVA_MS
    }

    private const val PROVA_MS = 30_000L

    fun errore(context: Context, pcId: String): String? = prefs(context).getString("${TalosSvegliaAvvisi.istanza(pcId)}.errore", null)

    fun attivataAlle(context: Context, pcId: String): Long = prefs(context).getLong("${TalosSvegliaAvvisi.istanza(pcId)}.attivataAlle", 0L)

    /** Le firme dei giri chiusi già detti; `null` = nessuna sveglia letta ancora dopo l'attivazione. */
    fun firme(context: Context, pcId: String): Map<String, String>? {
        val testo = prefs(context).getString("${TalosSvegliaAvvisi.istanza(pcId)}.firme", null) ?: return null
        return try { JSONObject(testo).let { o -> o.keys().asSequence().associateWith { o.optString(it) } } } catch (e: Exception) { null }
    }

    fun salvaFirme(context: Context, pcId: String, firme: Map<String, String>) {
        prefs(context).edit().putString("${TalosSvegliaAvvisi.istanza(pcId)}.firme", JSONObject(firme).toString()).apply()
    }

    /** `onUnregistered` o «Dimentica»: si toglie tutto ciò che riguarda quell'istanza, notifiche comprese. */
    fun dimentica(context: Context, istanza: String) {
        val pcId = pcDellIstanza(context, istanza)
        if (pcId != null) TalosSvegliaNotifiche.togliTutte(context, pcId, firmeRichieste(context, pcId).keys)
        val p = prefs(context)
        p.edit().apply { p.all.keys.filter { it.startsWith("$istanza.") }.forEach { remove(it) } }.apply()
    }

    private fun prefs(context: Context): SharedPreferences = context.getSharedPreferences(FILE, Context.MODE_PRIVATE)
}
