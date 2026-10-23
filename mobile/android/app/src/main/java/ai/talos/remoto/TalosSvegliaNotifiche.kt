package ai.talos.remoto

import ai.talos.MainActivity
import ai.talos.R
import ai.talos.TalosDoneNotification
import ai.talos.remoto.TalosSvegliaAvvisi.Avviso
import ai.talos.remoto.TalosSvegliaAvvisi.Tipo
import ai.talos.remoto.TalosSvegliaAvvisi.richiesta
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationChannelGroup
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationCompat

/**
 * ⛔ R-M5a (ledger `LEDGER-CLIENT-REMOTO-MOBILE-2026-10-20.md`, 21/10/2026): le notifiche della sveglia. Decisioni dell'owner (R-M5):
 * Q1 «Dettaglio, ma generico a schermo bloccato» (VISIBILITY_PRIVATE + versione pubblica senza nomi né testo), Q2 «Solo aprire la
 * sessione sulla carta» (nessun pulsante: il tocco apre `/computer/<pc>/codice/<sessione>`, `followNotificationRoute` di App.vue),
 * Q5 «Richieste + giro finito, il finito più discreto» (due canali: richieste HIGH, giri finiti DEFAULT).
 *
 * Un GRUPPO di canali per PC (il nome del PC): la persona può zittire un computer senza zittire gli altri, dalle impostazioni di
 * Android; e un gruppo di notifiche per PC col suo riassunto. Le richieste di una sessione hanno un id solo (`idNotifica`): la nuova
 * sostituisce la vecchia, e una già detta non si ripubblica (revisione R-M5a, 3). La provvisoria NON suona (revisione R-M5a, 4): suona
 * la notifica vera, una volta, sul canale del suo tipo.
 */
object TalosSvegliaNotifiche {
    private fun gruppoCanali(pcId: String) = "talos.remoto.${TalosSvegliaAvvisi.istanza(pcId)}"
    // revisione R-M5a (21): la generazione nell'id, così un canale ricreato dopo uno spegnimento è nuovo davvero
    private fun canaleRichieste(context: Context, pcId: String) = "${gruppoCanali(pcId)}.g${TalosSveglia.generazione(context, pcId)}.richieste"
    private fun canaleFiniti(context: Context, pcId: String) = "${gruppoCanali(pcId)}.g${TalosSveglia.generazione(context, pcId)}.finiti"
    private fun gruppoNotifiche(pcId: String) = "talos.remoto.notifiche.${TalosSvegliaAvvisi.istanza(pcId)}"
    private fun rottaDelPc(pcId: String) = "/computer/${java.net.URLEncoder.encode(pcId, "UTF-8").replace("+", "%20")}"

    /**
     * «richieste» o «finiti» per un canale del controllo remoto (`talos.remoto.<istanza>.g<n>.<tipo>`), altrimenti null.
     * Serve al rinomina dopo un cambio di lingua (N0, 21/10: sul Pad in inglese restavano «Lavori finiti» e «Richieste»).
     */
    fun tipoDelCanale(id: String): String? {
        if (!id.startsWith("talos.remoto.") || id.startsWith("talos.remoto.notifiche.")) return null
        return when {
            id.endsWith(".richieste") -> "richieste"
            id.endsWith(".finiti") -> "finiti"
            else -> null
        }
    }

    /** Nome e descrizione dei canali remoti già creati nella lingua di adesso; importanza, gruppo e scelte della persona restano. */
    fun rinominaCanali(context: Context) {
        val nm = context.getSystemService(NotificationManager::class.java) ?: return
        for (c in nm.notificationChannels) {
            val (nome, descrizione) = when (tipoDelCanale(c.id)) {
                "richieste" -> R.string.talos_sveglia_canale_richieste to R.string.talos_sveglia_canale_richieste_descrizione
                "finiti" -> R.string.talos_sveglia_canale_finiti to R.string.talos_sveglia_canale_finiti_descrizione
                else -> continue
            }
            // per un canale che esiste Android aggiorna solo nome e descrizione (javadoc di `createNotificationChannel`)
            nm.createNotificationChannel(NotificationChannel(c.id, context.getString(nome), c.importance).apply {
                group = c.group
                description = context.getString(descrizione)
                lockscreenVisibility = Notification.VISIBILITY_PRIVATE
            })
        }
    }

    fun assicuraCanali(context: Context, pcId: String, nomePc: String) {
        val nm = context.getSystemService(NotificationManager::class.java) ?: return
        nm.createNotificationChannelGroup(NotificationChannelGroup(gruppoCanali(pcId), nomePc))
        nm.createNotificationChannel(NotificationChannel(canaleRichieste(context, pcId), context.getString(R.string.talos_sveglia_canale_richieste),
            NotificationManager.IMPORTANCE_HIGH).apply {
            group = gruppoCanali(pcId)
            description = context.getString(R.string.talos_sveglia_canale_richieste_descrizione)
            lockscreenVisibility = Notification.VISIBILITY_PRIVATE
        })
        nm.createNotificationChannel(NotificationChannel(canaleFiniti(context, pcId), context.getString(R.string.talos_sveglia_canale_finiti),
            NotificationManager.IMPORTANCE_DEFAULT).apply {
            group = gruppoCanali(pcId)
            description = context.getString(R.string.talos_sveglia_canale_finiti_descrizione)
            lockscreenVisibility = Notification.VISIBILITY_PRIVATE
        })
    }

    /** Subito alla sveglia, prima di collegarsi: «<PC> ha bisogno di te», in silenzio. Il tocco apre la scheda del computer. */
    fun mostraProvvisoria(context: Context, pcId: String, nomePc: String) {
        assicuraCanali(context, pcId, nomePc)
        val id = TalosSvegliaAvvisi.idProvvisoria(pcId)
        val n = costruisci(context, pcId, canaleRichieste(context, pcId), id, nomePc, context.getString(R.string.talos_sveglia_provvisoria),
            rottaDelPc(pcId), richiesta = true, silenziosa = true, alle = null)
        context.getSystemService(NotificationManager::class.java)?.notify(id, n)
    }

    /** La risposta a «Prova la notifica»: sul canale delle richieste, quello che conta che suoni. */
    fun mostraProva(context: Context, pcId: String, nomePc: String) {
        assicuraCanali(context, pcId, nomePc)
        val id = TalosSvegliaAvvisi.idNotifica(pcId, "\u0000prova", Tipo.PERMESSO)
        val n = costruisci(context, pcId, canaleRichieste(context, pcId), id, nomePc, context.getString(R.string.talos_sveglia_prova),
            rottaDelPc(pcId), richiesta = true, silenziosa = false, alle = null)
        context.getSystemService(NotificationManager::class.java)?.notify(id, n)
    }

    fun togliProvvisoria(context: Context, pcId: String) {
        context.getSystemService(NotificationManager::class.java)?.cancel(TalosSvegliaAvvisi.idProvvisoria(pcId))
    }

    /**
     * Mostra gli avvisi e toglie le richieste che non aspettano più. `firmePrima`: id → firma delle richieste già dette (una uguale
     * non si ripubblica: né suono né ritorno di una notifica scartata). Torna le firme delle richieste ancora in attesa.
     */
    fun mostra(context: Context, pcId: String, nomePc: String, avvisi: List<Avviso>, firmePrima: Map<Int, String>, soloTogli: Boolean = false): Map<Int, String> {
        val nm = context.getSystemService(NotificationManager::class.java) ?: return emptyMap()
        assicuraCanali(context, pcId, nomePc)
        val richieste = mutableMapOf<Int, String>()
        var mostrate = 0
        for (a in avvisi) {
            val id = TalosSvegliaAvvisi.idNotifica(pcId, a.sessionId, a.tipo)
            var silenziosa = false
            if (a.tipo.richiesta) {
                val firma = TalosSvegliaAvvisi.firmaRichiesta(a)
                val come = TalosSvegliaAvvisi.ripubblica(firmePrima[id], firma)
                // D-RM5-3: col riallineamento si tiene solo ciò che era già mostrato e aspetta ancora (anche col segno `~`)
                if (soloTogli) { if (come != TalosSvegliaAvvisi.Ripubblica.NUOVA) richieste[id] = firmePrima.getValue(id); continue }
                richieste[id] = firma
                if (come == TalosSvegliaAvvisi.Ripubblica.SALTA) continue
                silenziosa = come == TalosSvegliaAvvisi.Ripubblica.SILENZIOSA
            }
            if (soloTogli) continue
            val canale = if (a.tipo.richiesta) canaleRichieste(context, pcId) else canaleFiniti(context, pcId)
            nm.notify(id, costruisci(context, pcId, canale, id, nomePc, testo(context, a), TalosSvegliaAvvisi.rotta(pcId, a.sessionId),
                a.tipo.richiesta, silenziosa = silenziosa, alle = a.alle))
            mostrate += 1
        }
        for (vecchia in firmePrima.keys - richieste.keys) nm.cancel(vecchia)
        if (mostrate > 0) riassunto(context, pcId, nomePc) else pulisciRiassunto(context, pcId)
        return richieste
    }

    /** Revisione R-M5a bis (5): un riassunto senza più notifiche del suo PC sotto non resta nudo nella tendina. */
    fun pulisciRiassunto(context: Context, pcId: String) {
        val nm = context.getSystemService(NotificationManager::class.java) ?: return
        val gruppo = gruppoNotifiche(pcId)
        val riassunto = idRiassunto(pcId)
        val figli = nm.activeNotifications.count { it.notification.group == gruppo && it.id != riassunto }
        if (figli == 0) nm.cancel(riassunto)
    }

    /** D-RM5-3: la richiesta di quella sessione è vista nell'app: la notifica se ne va e la sua firma pure (una nuova suonerà). */
    fun togliSessione(context: Context, pcId: String, sessionId: String) {
        val id = TalosSvegliaAvvisi.idNotifica(pcId, sessionId, Tipo.PERMESSO)
        context.getSystemService(NotificationManager::class.java)?.cancel(id)
        val firme = TalosSveglia.firmeRichieste(context, pcId)
        if (id in firme) TalosSveglia.salvaFirmeRichieste(context, pcId, firme - id)
        pulisciRiassunto(context, pcId)
    }

    /** D-RM5-5: tutte le notifiche del computer in tendina (canali `talos.remoto.*`), di ogni PC, si tolgono. */
    fun togliDettagli(context: Context) {
        val nm = context.getSystemService(NotificationManager::class.java) ?: return
        nm.activeNotifications.filter { it.notification.channelId?.startsWith("talos.remoto.") == true }.forEach { nm.cancel(it.tag, it.id) }
    }

    fun togliTutte(context: Context, pcId: String, mostrate: Set<Int>) {
        val nm = context.getSystemService(NotificationManager::class.java) ?: return
        mostrate.forEach { nm.cancel(it) }
        nm.cancel(TalosSvegliaAvvisi.idProvvisoria(pcId))
        nm.cancel(idRiassunto(pcId))
        try { nm.deleteNotificationChannelGroup(gruppoCanali(pcId)) } catch (e: Exception) { /* già tolto */ }
    }

    /** Il testo: col blocco dell'app acceso solo quello generico (`TalosSvegliaAvvisi.testoDa`, decisione owner 21/10). */
    fun testo(context: Context, a: Avviso): String {
        val riservata = TalosSveglia.riservata(context)
        val risorsa = TalosSvegliaAvvisi.testoDa(a.tipo, a.dettaglio != null, riservata)
        if (riservata) return context.getString(risorsa)
        val nome = a.nome ?: context.getString(R.string.talos_sveglia_sessione_senza_nome)
        return if (a.dettaglio != null) context.getString(risorsa, nome, a.dettaglio) else context.getString(risorsa, nome)
    }

    private fun idRiassunto(pcId: String) = TalosSvegliaAvvisi.idNotifica(pcId, "\u0000riassunto", Tipo.PERMESSO)

    /** Il riassunto del gruppo di un PC (revisione R-M5a, 17): Android raccoglie lì sotto le notifiche di QUEL computer, in silenzio. */
    private fun riassunto(context: Context, pcId: String, nomePc: String) {
        val id = idRiassunto(pcId)
        val n = NotificationCompat.Builder(context, canaleRichieste(context, pcId))
            .setSmallIcon(android.R.drawable.stat_notify_sync_noanim)
            .setContentTitle(nomePc)
            .setContentIntent(apri(context, id, rottaDelPc(pcId)))
            .setGroup(gruppoNotifiche(pcId))
            .setGroupSummary(true)
            .setGroupAlertBehavior(NotificationCompat.GROUP_ALERT_CHILDREN)
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
            .setAutoCancel(true)
            .build()
        context.getSystemService(NotificationManager::class.java)?.notify(id, n)
    }

    private fun apri(context: Context, id: Int, rotta: String): PendingIntent {
        val intento = Intent(context, MainActivity::class.java)
            .setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
            .putExtra(TalosDoneNotification.EXTRA_ROUTE, rotta)
            .putExtra(TalosDoneNotification.EXTRA_NONCE, java.util.UUID.randomUUID().toString())
        return PendingIntent.getActivity(context, id, intento, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }

    private fun costruisci(
        context: Context, pcId: String, canale: String, id: Int, titolo: String, testo: String, rotta: String,
        richiesta: Boolean, silenziosa: Boolean, alle: Long?,
    ): Notification {
        // a schermo bloccato: niente nome del PC, della sessione né testo (owner R-M5 Q1)
        val pubblica = NotificationCompat.Builder(context, canale)
            .setSmallIcon(android.R.drawable.stat_notify_sync_noanim)
            .setContentTitle(context.getString(R.string.talos_sveglia_pubblica_titolo))
            .setContentText(context.getString(if (richiesta) R.string.talos_sveglia_pubblica_richiesta else R.string.talos_sveglia_pubblica_finito))
            .build()
        return NotificationCompat.Builder(context, canale)
            .setSmallIcon(android.R.drawable.stat_notify_sync_noanim)
            .setContentTitle(titolo)
            .setContentText(testo)
            .setStyle(NotificationCompat.BigTextStyle().bigText(testo))
            .setContentIntent(apri(context, id, rotta))
            .setAutoCancel(true)
            .setCategory(if (richiesta) NotificationCompat.CATEGORY_MESSAGE else NotificationCompat.CATEGORY_STATUS)
            .setPriority(if (richiesta && !silenziosa) NotificationCompat.PRIORITY_HIGH else NotificationCompat.PRIORITY_DEFAULT)
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
            .setPublicVersion(pubblica)
            .setGroup(gruppoNotifiche(pcId))
            .setSilent(silenziosa)
            // l'ora dell'evento (fine del giro), non quella della sveglia: un finito arrivato tardi resta datato (revisione R-M5a, 17)
            .apply { if (alle != null) setWhen(alle).setShowWhen(true) }
            .build()
    }
}
