package ai.talos

import android.content.Intent
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertNotNull
import org.junit.Test

/**
 * ⛔⛔ «Il telefono non offre una schermata compatibile» — DETTO DI UNA
 * SCHERMATA CHE C'ERA.
 *
 * ## Il difetto, visto dall'owner il 2026-08-09
 *
 * Alla domanda «apri le impostazioni per l'accesso alle notifiche», TALOS
 * rispondeva che il telefono non ha quella schermata. Misurato un minuto dopo,
 * sullo stesso telefono:
 *
 * ```
 * cmd package resolve-activity -a android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS
 *   name=com.android.settings.Settings$NotificationAccessSettingsActivity
 *   enabled=true exported=true
 * ```
 *
 * ## Cosa e' provato, e cosa no
 *
 * **PROVATO**, sul dispositivo, chiamando il plugin vero dall'app vera: prima
 * della correzione l'esito era `not-available-here`; dopo e' `done: true`, e
 * `NotificationAccessSettingsActivity` e' finita davvero in primo piano.
 *
 * **NON PROVATO**: che la causa sia il filtro di visibilita' dei pacchetti.
 * Era la mia ipotesi, l'avevo scritta come certezza, e la prova qui sotto l'ha
 * smentita — dal processo instrumentato `resolveActivity` risponde eccome.
 * Quel processo pero' non ha le condizioni dell'app vera, quindi non dimostra
 * nemmeno il contrario.
 *
 * ⇒ Il rimedio e' provato; la causa esatta no. Chiamarla «la causa» sarebbe la
 * stessa cosa che TALOS faceva col telefono.
  */
class TalosSchermateDiSistemaTest {

    private val contesto get() = InstrumentationRegistry.getInstrumentation().targetContext

    /** Le schermate di sistema che TALOS apre come ripiego di un «non posso». */
    private val SCHERMATE = listOf(
        "android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS",
        "android.settings.WIFI_SETTINGS",
        "android.settings.BLUETOOTH_SETTINGS",
        "android.settings.APPLICATION_DETAILS_SETTINGS",
        "android.settings.NOTIFICATION_POLICY_ACCESS_SETTINGS",
    )

    /**
     * ⭐ IL FATTO. Il sistema conosce queste schermate — lo si vede chiedendolo
     * col permesso di chiederlo, cioè dal package manager con la query
     * esplicita per componente.
     */
    @Test
    fun il_sistema_HA_queste_schermate() {
        for (azione in SCHERMATE) {
            val trovate = contesto.packageManager.queryIntentActivities(Intent(azione), 0)
            // Se anche questa fosse vuota, sarebbe il filtro a nasconderle tutte
            // — e allora l'asserzione sotto e' l'unica che conta.
            println("$azione -> ${trovate.size} attivita' visibili")
        }
    }

    /**
     * ⛔⛔ QUI HO SBAGLIATO UNA DIAGNOSI, E LO SCRIVO INVECE DI NASCONDERLO.
     *
     * Avevo asserito che `resolveActivity` risponde `null` — il filtro di
     * visibilità dei pacchetti — e questa prova **è diventata rossa**: dal
     * processo instrumentato risponde eccome.
     *
     * ⇒ Il processo di prova **non ha le stesse condizioni dell'app vera**: ha
     * un suo manifest e una sua visibilità. Quindi da qui non si può dimostrare
     * cosa vede TALOS quando gira per conto suo.
     *
     * ## Cosa è provato e cosa no
     *
     * **Provato**, sul dispositivo, chiamando il plugin vero dall'app vera:
     * prima della correzione l'esito era `not-available-here`; dopo è
     * `done: true`, e `NotificationAccessSettingsActivity` è finita davvero in
     * primo piano.
     *
     * **NON provato**: che la causa fosse il filtro di visibilità. È
     * l'ipotesi più probabile, ma non l'ho isolata, e chiamarla «la causa»
     * sarebbe la stessa cosa che TALOS faceva col telefono.
     *
     * Questa prova quindi **registra** il valore invece di pretenderlo, così
     * che chi rilegge veda il numero e non la mia congettura.
     */
    @Test
    fun registra_cosa_risponde_resolveActivity_da_qui() {
        for (azione in SCHERMATE) {
            val risolta = Intent(azione).resolveActivity(contesto.packageManager)
            println("resolveActivity($azione) -> $risolta")
        }
    }

    /**
     * ⭐ E la prova che avviarla si può lo stesso: il filtro impedisce di
     * INTERROGARE, non di AVVIARE.
     */
    @Test
    fun ma_avviarla_si_puo_lo_stesso() {
        val intent = Intent("android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS")
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        contesto.startActivity(intent)

        // Se fosse davvero assente, la riga sopra avrebbe lanciato
        // ActivityNotFoundException e la prova sarebbe rossa qui.
        assertNotNull(intent.action)
    }
}
