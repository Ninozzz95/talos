package ai.talos.agent

import android.content.Context
import android.provider.Settings
import android.util.Log

/**
 * ⭐⭐⭐ QUELLO CHE HAI ACCESO RESTA ACCESO — la riparazione di uno stato
 * incoerente che il sistema lascia dietro di sé.
 *
 * ## Il difetto, misurato sul Pad il 2026-08-15
 *
 * Owner: «di assoluta critica e vitale importanza è che, alla chiusura e
 * riapertura dell'applicazione, l'utente mantenga tutte le impostazioni di
 * controllo del telefono, **anche quelle di accessibilità tutte**. D'ora in poi
 * l'utente non deve perdere nulla».
 *
 * Misurate le QUATTRO chiusure, separatamente, perché non sono la stessa cosa:
 *
 * | come si chiude            | servizio in elenco | interruttore master |
 * | ---                       | ---                | ---                 |
 * | Home                      | ACCESO             | 1 ✓                 |
 * | **swipe via dai recenti** | ACCESO             | **0** ⛔            |
 * | ucciso dal sistema        | ACCESO             | 1 ✓                 |
 * | `force-stop`              | spento             | 0                   |
 *
 * ⇒ Il caso che una persona incontra davvero è il **secondo**, e produce uno
 * stato **incoerente**: `enabled_accessibility_services` contiene ancora TALOS,
 * ma `accessibility_enabled` è 0. Cioè l'elenco dice «acceso» e l'interruttore
 * generale dice «spento» — e l'occhio non vede più niente.
 *
 * ⛔ `force-stop` invece spegne tutto, ed è giusto così: Android disabilita per
 * progetto i servizi di accessibilità di un'app terminata a forza. Quello NON è
 * un difetto da curare, è una difesa del sistema — ed è anche il gesto di un
 * debugger, non di una persona. Misurarlo e concluderne «l'utente perde
 * l'accessibilità» avrebbe curato un difetto che nessuno incontra.
 *
 * ## ⛔ RIPARARE, NON IMPORRE — la condizione che fa la differenza
 *
 * Riaccendere l'accessibilità di propria iniziativa è un potere enorme: quel
 * servizio legge tutto lo schermo. Qui non si accende niente che la persona non
 * abbia già acceso.
 *
 * ⇒ Si interviene **solo** quando l'elenco contiene ancora TALOS. Se la persona
 * ci ha tolti dall'elenco, l'elenco non ci nomina e questo codice non fa nulla:
 * la sua scelta vince, sempre. Ciò che si ripara è la contraddizione fra due
 * righe che dovrebbero dire la stessa cosa.
 *
 * ## Perché serve il ponte
 *
 * `accessibility_enabled` è una `Settings.Secure`: un'app normale non la scrive,
 * e `WRITE_SECURE_SETTINGS` non è concedibile a runtime. Col ponte sì —
 * MISURATO e scritto in `TalosPrivilegePlugin`: `settings put secure …` ✅.
 *
 * ⇒ Owner: «se possiamo, usando il nostro ponte adb o, ancora meglio, in maniera
 * nativa». Nativamente non si può, e non è una scelta nostra: è la stessa
 * ragione per cui esiste il ponte. Senza ponte questa funzione **dice** che
 * c'è da riparare e non ripara — meglio di un silenzio, che è ciò che c'era.
 */
object TalosNonSiPerdeNiente {

    private const val MARCHIO = "TalosNonSiPerde"

    /** Il nome con cui il sistema conosce il nostro servizio di accessibilità. */
    private fun nostroServizio(contesto: Context): String =
        "${contesto.packageName}/ai.talos.agent.TalosOcchio"

    /**
     * Lo stato delle due righe che devono dire la stessa cosa.
     *
     * ⛔ `elencato` NON basta a dire «funziona»: è esattamente la coppia che
     * questo file esiste per non confondere.
     */
    data class Stato(
        val elencato: Boolean,
        val masterAcceso: Boolean,
    ) {
        /** Le due righe si contraddicono: elencato ma spento. */
        val incoerente: Boolean get() = elencato && !masterAcceso
    }

    fun leggi(contesto: Context): Stato {
        val elenco = runCatching {
            Settings.Secure.getString(
                contesto.contentResolver,
                Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES,
            )
        }.getOrNull().orEmpty()
        val master = runCatching {
            Settings.Secure.getInt(contesto.contentResolver, Settings.Secure.ACCESSIBILITY_ENABLED, 0)
        }.getOrDefault(0)
        return Stato(
            elencato = elenco.contains(contesto.packageName),
            masterAcceso = master == 1,
        )
    }

    /**
     * Ripara se serve. Torna cosa è successo, così chi chiama può DIRLO invece
     * di far finta di niente.
     *
     * ⛔ Non lancia mai: questa funzione gira all'avvio dell'app, e un avvio che
     * fallisce perché il ponte è giù sarebbe una cura peggiore del male.
     */
    fun riparaSeServe(contesto: Context): String {
        val stato = leggi(contesto)
        if (!stato.elencato) {
            // La persona ci ha tolti dall'elenco, o non ci ha mai messi. La sua
            // scelta vince: qui non si accende niente.
            return "niente-da-fare"
        }
        if (stato.masterAcceso) return "gia-a-posto"

        Log.i(MARCHIO, "stato incoerente: TALOS è nell'elenco ma l'accessibilità è spenta")

        val esito = runCatching {
            TalosPonteAdb.shell(
                contesto,
                listOf("settings", "put", "secure", "accessibility_enabled", "1"),
                setOf("settings"),
                riagganciaSeStaccato = true,
            )
        }.getOrNull()

        if (esito?.codice != 0) {
            Log.w(MARCHIO, "non riparato: il ponte non risponde (${esito?.motivo ?: "nessun ponte"})")
            return "serve-il-ponte"
        }

        /*
         * ⛔ SI RILEGGE. Una scrittura che torna 0 non è una scrittura andata a
         * buon fine: su queste ROM `settings put` può riuscire e il valore
         * tornare indietro. È la stessa regola di «ogni scrittura si rilegge»
         * che ci è costata tre giorni sul calendario.
         */
        val dopo = leggi(contesto)
        return if (dopo.masterAcceso) {
            Log.i(MARCHIO, "accessibilità riaccesa: l'occhio torna a vedere")
            "riparato"
        } else {
            Log.w(MARCHIO, "scritto ma non ha attecchito: il valore è tornato a 0")
            "non-ha-attecchito"
        }
    }
}
