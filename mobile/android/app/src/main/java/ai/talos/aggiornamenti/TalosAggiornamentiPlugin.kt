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
        return JSObject()
            .put("fase", TalosStatoAggiornamento.fase(context).name)
            .put("installata", BuildConfig.VERSION_NAME)
            .put("versione", trovata?.versione)
            .put("note", trovata?.note?.takeIf { it.isNotEmpty() }?.let { runCatching { JSObject(it) }.getOrNull() })
            .put("pagina", trovata?.pagina?.takeIf { it.isNotEmpty() })
            .put("dimensione", trovata?.size)
            .put("scaricati", TalosStatoAggiornamento.scaricati(context))
            .put("motivo", TalosStatoAggiornamento.motivo(context))
            .put("ultimoControllo", TalosStatoAggiornamento.ultimoControllo(context).takeIf { it > 0 })
            .put("appenaAggiornata", TalosStatoAggiornamento.appenaAggiornata(context))
            .put("allUscita", TalosStatoAggiornamento.installaAllUscita(context))
            .put("permessoConcesso", TalosInstallatoreAggiornamento.permessoConcesso(context))
            .put("automatici", scelte.automatici)
            .put("soloWifi", scelte.soloWifi)
            .put("avvisami", scelte.avvisami)
    }
}
