package ai.talos.remoto

import ai.talos.R
import ai.talos.remoto.TalosSvegliaAvvisi.Tipo
import android.app.job.JobInfo
import android.app.job.JobParameters
import android.app.job.JobScheduler
import android.app.job.JobService
import android.content.ComponentName
import android.content.Context
import android.os.Build
import android.os.PersistableBundle
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.time.Instant
import java.util.concurrent.ConcurrentHashMap

/**
 * ⛔ R-M5a (ledger `LEDGER-CLIENT-REMOTO-MOBILE-2026-10-20.md`, 21/10/2026): il lavoro DOPO la sveglia. Niente rete dentro il risveglio
 * (il servizio push mostra la notifica provvisoria e basta): qui ci si collega al PC con la chiave del telefono, si manda l'iscrizione
 * se è cambiata (`device.wake`), si legge `sessions.list` e, per permessi e domande, `session.pending`; poi le notifiche vere al posto
 * della provvisoria, e il canale si chiude.
 *
 * Un job URGENTE di JobScheduler (`setExpedited`, API 31+), non WorkManager: questo progetto ha un solo scheduler
 * (`TalosTaskRunPlugin`, «Perché JobScheduler e non WorkManager»). Il job che manda solo l'iscrizione aspetta 30 s (di solito l'ha già
 * mandata il TypeScript) e, se il PC non risponde, RITENTA con attesa crescente finché non la consegna (revisione R-M5a, 1): una
 * sveglia «accesa» che il PC non conosce sarebbe una funzione finta.
 */
class TalosSvegliaLavoro : JobService() {
    private val ambito = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val inCorso = ConcurrentHashMap<Int, Job>()

    override fun onStartJob(params: JobParameters): Boolean {
        val pcId = params.extras.getString(PC) ?: return false
        val sveglia = params.extras.getBoolean(SVEGLIA, false)
        val riallinea = params.extras.getBoolean(RIALLINEA, false)
        val lavoro = ambito.launch(start = kotlinx.coroutines.CoroutineStart.LAZY) {
            val ritenta = try {
                !esegui(applicationContext, pcId, sveglia, riallinea) && !sveglia && TalosSveglia.daMandare(applicationContext, pcId)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                // la provvisoria resta: «<PC> ha bisogno di te», e il tocco apre la scheda del computer; l'iscrizione si ritenta
                !sveglia && TalosSveglia.daMandare(applicationContext, pcId)
            }
            jobFinished(params, ritenta)
        }
        inCorso[params.jobId] = lavoro
        // revisione R-M5a (8): togliere SOLO se è ancora questo lavoro, non quello nuovo con lo stesso id
        lavoro.invokeOnCompletion { inCorso.remove(params.jobId, lavoro) }
        lavoro.start()
        return true
    }

    override fun onStopJob(params: JobParameters): Boolean {
        inCorso.remove(params.jobId)?.cancel()
        return params.extras.getBoolean(SVEGLIA, false) || TalosSveglia.daMandare(applicationContext, params.extras.getString(PC) ?: "")
    }

    override fun onDestroy() {
        ambito.cancel()
        super.onDestroy()
    }

    companion object {
        private const val PC = "pcId"
        private const val SVEGLIA = "sveglia"
        private const val RIALLINEA = "riallinea"
        private const val ATTESA_ISCRIZIONE_MS = 30_000L
        private const val ATTESA_RITENTATIVO_MS = 60_000L
        /** Revisione R-M5a (18): un PC spento non tiene il job appeso quanto il tempo d'attesa di iroh. */
        private const val TETTO_APERTURA_MS = 20_000L
        private val CON_DETTAGLIO = setOf(Tipo.PERMESSO, Tipo.DOMANDA, Tipo.AIUTANTE)
        private val SENZA_PIU_ACCESSO = setOf("REVOKED", "NOT_PAIRED")

        /** `subito`: il TypeScript ha appena visto il PC in linea, l'iscrizione da mandare parte adesso (revisione R-M5a, 1). */
        fun programma(context: Context, pcId: String, sveglia: Boolean, subito: Boolean = false, riallinea: Boolean = false) {
            val js = context.getSystemService(JobScheduler::class.java) ?: return
            val posto = TalosSveglia.posto(context, pcId)
            // revisione R-M5a bis (6): il riallineamento ha un id suo; se c'è già una sveglia in coda o in corso la lascia fare
            val id = if (riallinea) TalosSvegliaAvvisi.idRiallinea(posto) else TalosSvegliaAvvisi.idLavoro(posto, sveglia)
            if (riallinea && js.getPendingJob(TalosSvegliaAvvisi.idLavoro(posto, true)) != null) return
            val b = JobInfo.Builder(id,
                ComponentName(context, TalosSvegliaLavoro::class.java))
                .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                .setExtras(PersistableBundle().apply { putString(PC, pcId); putBoolean(SVEGLIA, sveglia); putBoolean(RIALLINEA, riallinea) })
            if (sveglia) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) b.setExpedited(true)
            } else {
                if (!subito) b.setMinimumLatency(ATTESA_ISCRIZIONE_MS)
                b.setBackoffCriteria(ATTESA_RITENTATIVO_MS, JobInfo.BACKOFF_POLICY_EXPONENTIAL).setPersisted(true)
            }
            js.schedule(b.build())
        }

        /** Revisione R-M5a bis (3): spegnendo la sveglia di un PC, i suoi lavori (anche rimessi in coda) non partono più. */
        fun cancellaTutti(context: Context, posto: Int) {
            val js = context.getSystemService(JobScheduler::class.java) ?: return
            js.cancel(TalosSvegliaAvvisi.idLavoro(posto, true))
            js.cancel(TalosSvegliaAvvisi.idLavoro(posto, false))
            js.cancel(TalosSvegliaAvvisi.idRiallinea(posto))
        }

        /** Torna `true` se il giro è andato fino in fondo (iscrizione consegnata se serviva, notifiche fatte se era una sveglia). */
        /** `riallinea` (D-RM5-3): solo togliere le richieste risolte altrove; niente notifiche nuove, giri chiusi non segnati. */
        suspend fun esegui(context: Context, pcId: String, sveglia: Boolean, riallinea: Boolean = false): Boolean {
            // revisione R-M5a bis (3): una sveglia spenta (o un PC dimenticato) nel frattempo non pubblica niente
            if (!TalosSveglia.accesa(context, pcId)) return true
            val cartella = File(context.filesDir, "remoto")
            val pc = TalosRemotoCustodia.leggi(cartella, pcId)
            if (pc == null) {
                // revisione R-M5a (7): si spegne SOLO se il ricordo del PC non c'è più; un guasto passeggero della custodia
                // (archivio sicuro occupato, lettura fallita) lascia la sveglia com'è e il giro si rifà alla prossima
                if (!File(cartella, TalosRemotoCustodia.nomeFile(pcId)).exists()) TalosSveglia.annulla(context, pcId)
                return false
            }
            val iscrizione = TalosSveglia.iscrizione(context, pcId)
            val daMandare = iscrizione != null && TalosSveglia.daMandare(context, pcId)
            if (!sveglia && !daMandare) { pc.chiaveTelefono.fill(0); return true }
            val nomePc = pc.nome ?: context.getString(R.string.talos_sveglia_computer)
            val canale = try {
                // `OrNull`: scaduto torna `null` (giro da rifare), non una cancellazione che salterebbe `jobFinished`
                withTimeoutOrNull(TETTO_APERTURA_MS) { TalosRemotoTrasporto.apriVerso(pc) }
            } finally { pc.chiaveTelefono.fill(0) } ?: return false
            try {
                val cliente = TalosRemotoClienteNativo(canale)
                var consegnata = !daMandare
                if (daMandare) {
                    // revisione R-M5a (11): un rifiuto qui non ferma la sveglia: le notifiche si fanno lo stesso
                    try {
                        cliente.richiesta("device.wake", JSONObject().put("sveglia", iscrizione!!.inJson()))
                        TalosSveglia.segnaMandata(context, pcId, iscrizione.endpoint)
                        consegnata = true
                    } catch (e: TalosRemotoClienteNativo.ErroreNativo) {
                        if (e.codice in SENZA_PIU_ACCESSO) throw e
                    }
                }
                if (!sveglia) return consegnata
                if (riallinea) { notifica(context, cliente, pcId, nomePc, soloTogli = true); return true }
                notifica(context, cliente, pcId, nomePc)
                // revisione R-M5a (12): una richiesta nata mentre si leggeva (il PC la toglie dalla sua coda perché ci vede
                // collegati) si raccoglie con una seconda lettura prima di chiudere
                notifica(context, cliente, pcId, nomePc)
                TalosSvegliaNotifiche.togliProvvisoria(context, pcId)
                return true
            } catch (e: TalosRemotoClienteNativo.ErroreNativo) {
                if (e.codice in SENZA_PIU_ACCESSO) {
                    // il PC ha dimenticato questo telefono: niente più sveglie, e niente provvisoria che apre una scheda muta
                    TalosSveglia.annulla(context, pcId)
                    return true
                }
                throw e
            } finally {
                // revisione R-M5a (9): anche a lavoro annullato l'endpoint iroh si chiude (`shutdown` è sospendibile)
                withContext(NonCancellable) { TalosRemotoTrasporto.chiudi(canale, "DONE") }
            }
        }

        private suspend fun notifica(context: Context, cliente: TalosRemotoClienteNativo, pcId: String, nomePc: String, soloTogli: Boolean = false) {
            val items = (cliente.richiesta("sessions.list") as? JSONObject)?.optJSONArray("items") ?: JSONArray()
            val (scelti, firme) = TalosSvegliaAvvisi.scegli(items, TalosSveglia.firme(context, pcId), TalosSveglia.attivataAlle(context, pcId))
            val avvisi = scelti.map { a ->
                if (a.tipo !in CON_DETTAGLIO) return@map a
                val pending = try {
                    (cliente.richiesta("session.pending", JSONObject().put("sessionId", a.chiedeDa ?: a.sessionId)) as? JSONObject)?.optJSONObject("pending")
                } catch (e: TalosRemotoClienteNativo.ErroreNativo) {
                    if (e.codice in SENZA_PIU_ACCESSO || e.codice == "DISCONNECTED") throw e
                    null
                }
                a.copy(
                    chiaveCarta = TalosSvegliaAvvisi.chiaveCarta(pending),
                    dettaglio = TalosSvegliaAvvisi.dettaglio(pending),
                    requestId = pending?.optString("requestId")?.takeIf { it.isNotEmpty() },
                    alle = istante(pending?.optString("inAttesaDa")),
                )
            }
            // revisione R-M5a bis (3, 7): sotto il lucchetto condiviso con `svegliaVista`, e solo se la sveglia è ancora accesa
            synchronized(TalosSveglia.lucchetto) {
                if (!TalosSveglia.accesa(context, pcId)) return
                // D-RM5-4: ciò che la persona ha già visto nell'app non si notifica; le viste di chi non aspetta più si dimenticano
                // (revisione bis, 2: un piano visto non zittisce i piani dopo)
                val viste = TalosSvegliaAvvisi.potaViste(TalosSveglia.viste(context, pcId), items)
                TalosSveglia.salvaViste(context, pcId, viste)
                val daDire = avvisi.filterNot { TalosSvegliaAvvisi.giaVista(it, viste.toSet()) }
                val richieste = TalosSvegliaNotifiche.mostra(context, pcId, nomePc, daDire, TalosSveglia.firmeRichieste(context, pcId), soloTogli)
                TalosSveglia.salvaFirmeRichieste(context, pcId, richieste)
                if (!soloTogli) TalosSveglia.salvaFirme(context, pcId, firme)
            }
        }

        private fun istante(testo: String?): Long? = try { testo?.takeIf { it.isNotEmpty() }?.let { Instant.parse(it).toEpochMilli() } } catch (e: Exception) { null }
    }
}
