package ai.talos.aggiornamenti

import ai.talos.BuildConfig
import android.content.Intent
import android.content.SharedPreferences
import android.net.Uri
import android.os.Build
import android.provider.Settings
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import java.util.concurrent.Executors
import org.json.JSONObject

/**
 * Il ponte fra l'interfaccia e l'aggiornamento automatico. Ogni cambio di stato (dal job, dai ricevitori, da qui) arriva al
 * TypeScript come evento `cambio` con lo stato intero: l'interfaccia non tiene una sua copia da riallineare.
 */
@CapacitorPlugin(name = "TalosAggiornamenti")
class TalosAggiornamentiPlugin : Plugin() {

    private val lavoro = Executors.newSingleThreadExecutor()
    private val ascolto = SharedPreferences.OnSharedPreferenceChangeListener { _, _ -> notifyListeners("cambio", stato()) }

    override fun load() {
        TalosStatoAggiornamento.ascolta(context, ascolto)
        TalosLavoroAggiornamenti.programmaControllo(context)
        TalosNotificaAggiornamento.togli(context)
    }

    override fun handleOnDestroy() {
        TalosStatoAggiornamento.smetti(context, ascolto)
        lavoro.shutdown()
    }

    @PluginMethod
    fun stato(call: PluginCall) = call.resolve(stato())

    @PluginMethod
    fun controllaOra(call: PluginCall) {
        lavoro.execute {
            val esito = TalosLavoroAggiornamenti.controllaEApplica(context, dallaPersona = true)
            call.resolve(stato().put("esito", when (esito) {
                is TalosEsitoControllo.Trovata -> "trovata"
                TalosEsitoControllo.Aggiornata -> "aggiornata"
                is TalosEsitoControllo.Rifiutato, TalosEsitoControllo.GiaRifiutato -> "rifiutata"
                is TalosEsitoControllo.Irraggiungibile -> "irraggiungibile"
            }))
        }
    }

    @PluginMethod
    fun impostazioni(call: PluginCall) {
        TalosStatoAggiornamento.impostaScelte(context, call.getBoolean("automatici"), call.getBoolean("soloWifi"), call.getBoolean("avvisami"))
        TalosLavoroAggiornamenti.programmaControllo(context)
        call.resolve(stato())
    }

    /** «Riavvia ora»: TALOS si chiude per installare; dopo, `TalosRicevitorePacchettoSostituito` prova a riaprirlo. */
    @PluginMethod
    fun riavviaOra(call: PluginCall) {
        lavoro.execute {
            TalosStatoAggiornamento.segnaRiapri(context, true)
            val motivo = TalosInstallatoreAggiornamento.installa(context, dallaPersona = true)
            if (motivo != null) TalosStatoAggiornamento.segnaRiapri(context, false)
            call.resolve(stato().put("motivo", motivo))
        }
    }

    @PluginMethod
    fun allProssimoAvvio(call: PluginCall) {
        TalosStatoAggiornamento.segnaInstallaAllUscita(context, true)
        call.resolve(stato())
    }

    /** Chiamato dall'interfaccia quando TALOS va in sottofondo SENZA lavori in corso: parte l'attesa dell'installazione. */
    @PluginMethod
    fun uscita(call: PluginCall) {
        if (TalosStatoAggiornamento.installaAllUscita(context) && TalosStatoAggiornamento.fase(context) == TalosFaseAggiornamento.PRONTA) {
            TalosLavoroAggiornamenti.programmaInstallazioneAllUscita(context)
        }
        call.resolve()
    }

    /** La prima volta: «Installa app sconosciute» per TALOS, nelle impostazioni di Android (MNN `UpdateChecker.kt:305-315`). */
    @PluginMethod
    fun apriPermesso(call: PluginCall) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            runCatching {
                activity.startActivity(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${context.packageName}")))
            }
        }
        call.resolve(stato())
    }

    /** L'interfaccia ha detto «Aggiornata»: non lo ridice alla prossima apertura. */
    @PluginMethod
    fun visto(call: PluginCall) {
        TalosStatoAggiornamento.segnaAppenaAggiornata(context, null)
        if (TalosStatoAggiornamento.fase(context) == TalosFaseAggiornamento.AGGIORNATA) {
            TalosStatoAggiornamento.segnaFase(context, TalosFaseAggiornamento.NESSUNA)
        }
        call.resolve(stato())
    }

    private fun stato(): JSObject {
        val scelte = TalosStatoAggiornamento.scelte(context)
        // dopo l'installazione la versione trovata non c'è più: le novità da mostrare sono quelle della versione installata
        val trovata = TalosStatoAggiornamento.trovata(context) ?: TalosStatoAggiornamento.appenaInstallata(context)
        return statoPerJs(TalosValoriStato(
            fase = TalosStatoAggiornamento.fase(context).name,
            installata = BuildConfig.VERSION_NAME,
            versione = trovata?.versione,
            note = trovata?.note?.takeIf { it.isNotEmpty() }?.let { runCatching { JSONObject(it) }.getOrNull() },
            pagina = trovata?.pagina?.takeIf { it.isNotEmpty() },
            dimensione = trovata?.size,
            scaricati = TalosStatoAggiornamento.scaricati(context),
            motivo = TalosStatoAggiornamento.motivo(context),
            ultimoControllo = TalosStatoAggiornamento.ultimoControllo(context).takeIf { it > 0 },
            appenaAggiornata = TalosStatoAggiornamento.appenaAggiornata(context),
            allUscita = TalosStatoAggiornamento.installaAllUscita(context),
            permessoConcesso = TalosInstallatoreAggiornamento.permessoConcesso(context),
            automatici = scelte.automatici,
            soloWifi = scelte.soloWifi,
            avvisami = scelte.avvisami,
        ))
    }
}

/** I valori dello stato già letti dalle preferenze: `statoPerJs` li mette nella busta senza toccare il contesto (provabile sulla JVM). */
internal data class TalosValoriStato(
    val fase: String,
    val installata: String,
    val versione: String?,
    val note: JSONObject?,
    val pagina: String?,
    val dimensione: Long?,
    val scaricati: Long?,
    val motivo: String?,
    val ultimoControllo: Long?,
    val appenaAggiornata: String?,
    val allUscita: Boolean,
    val permessoConcesso: Boolean,
    val automatici: Boolean,
    val soloWifi: Boolean,
    val avvisami: Boolean,
)

/**
 * La busta dello stato per l'app, sempre INTERA. ⛔ B1/B2 (27/10/2026): `put(chiave, null)` di org.json TOGLIE la chiave e l'app,
 * che copia solo le chiavi presenti, teneva il valore vecchio (il segnale «aggiornata» acceso dopo «visto()»). Un valore che manca
 * va come `JSONObject.NULL`, che arriva `null`.
 */
internal fun statoPerJs(v: TalosValoriStato): JSObject = JSObject()
    .put("fase", v.fase)
    .put("installata", v.installata)
    .put("versione", v.versione ?: JSONObject.NULL)
    .put("note", v.note ?: JSONObject.NULL)
    .put("pagina", v.pagina ?: JSONObject.NULL)
    .put("dimensione", v.dimensione ?: JSONObject.NULL)
    .put("scaricati", v.scaricati ?: JSONObject.NULL)
    .put("motivo", v.motivo ?: JSONObject.NULL)
    .put("ultimoControllo", v.ultimoControllo ?: JSONObject.NULL)
    .put("appenaAggiornata", v.appenaAggiornata ?: JSONObject.NULL)
    .put("allUscita", v.allUscita)
    .put("permessoConcesso", v.permessoConcesso)
    .put("automatici", v.automatici)
    .put("soloWifi", v.soloWifi)
    .put("avvisami", v.avvisami)
