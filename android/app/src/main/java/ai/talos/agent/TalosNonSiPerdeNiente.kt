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
        /**
         * ⛔⛔ LEGATO — l'unico dato che dice se l'occhio VEDE.
         *
         * MISURATO sul OnePlus 13 il 2026-08-15, e mi ha smentito una cura:
         *
         *     Bound services:   {}                                  ← vuoto
         *     Enabled services: {ai.talos.dev/…/TalosOcchio}         ← elencato
         *     Crashed services: {ai.talos.dev/…/TalosOcchio}         ← crashato
         *
         * Cioè le impostazioni dicevano «acceso», `accessibility_enabled` era 1,
         * e il servizio non riceveva UN SOLO evento. È lo stato in cui TALOS
         * crede di poter premere «invia» su WhatsApp, prova, e non succede
         * niente — il difetto che l'owner segnala dal 13 agosto.
         *
         * ⇒ `elencato` e `masterAcceso` sono ciò che il sistema PROMETTE.
         * Questo è ciò che il sistema FA.
         */
        val legato: Boolean,
    ) {
        /**
         * ⛔ Tre modi di essere rotti, non uno:
         *  · elencato ma master spento  → chiuso dai recenti (Pad e 13)
         *  · elencato e master acceso, ma NON legato → il servizio è marcato
         *    «crashed» e Android non lo ritenta più
         */
        val incoerente: Boolean get() = elencato && (!masterAcceso || !legato)
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
            legato = TalosOcchio.aperto() != null,
        )
    }

    /**
     * Ripara se serve. Torna cosa è successo, così chi chiama può DIRLO invece
     * di far finta di niente.
     *
     * ⛔ Non lancia mai: questa funzione gira all'avvio dell'app, e un avvio che
     * fallisce perché il ponte è giù sarebbe una cura peggiore del male.
     */
    /**
     * Ripara se serve. Torna cosa è successo, così chi chiama può DIRLO invece
     * di far finta di niente.
     *
     * ⛔ Non lancia mai: gira all'avvio dell'app, e un avvio che fallisce perché
     * il ponte è giù sarebbe una cura peggiore del male.
     */
    fun riparaSeServe(contesto: Context): String {
        val stato = leggi(contesto)
        if (!stato.elencato) {
            // La persona ci ha tolti dall'elenco, o non ci ha mai messi. La sua
            // scelta vince: qui non si accende niente.
            return "niente-da-fare"
        }
        if (stato.masterAcceso && stato.legato) return "gia-a-posto"

        Log.i(
            MARCHIO,
            "da riparare: elencato=${stato.elencato} master=${stato.masterAcceso} legato=${stato.legato}",
        )

        /*
         * ⛔⛔ IL CICLO, e non una scrittura sola. MISURATO sul OnePlus 13:
         *
         * Scrivere `accessibility_enabled 1` su un servizio che il sistema ha
         * marcato **crashed** lo lascia esattamente com'è — elencato, master a
         * 1, e `Bound services:{}`. Android non ritenta il binding di un
         * servizio crashato finché l'elenco non CAMBIA, e riscrivere lo stesso
         * valore non è un cambiamento.
         *
         *     prima:  Bound {}   Enabled {TalosOcchio}   Crashed {TalosOcchio}
         *     dopo il ciclo: Bound {TALOS — controllo del telefono}  Crashed {}
         *
         * ⇒ Si svuota e si riscrive: è la sola sequenza che fa rilegare il
         * servizio, ed è la differenza fra un occhio che dice di vedere e uno
         * che vede. Il difetto «WhatsApp si riempie e non parte» nasceva qui.
         */
        val nostro = nostroServizio(contesto)

        /*
         * ⛔⛔⛔ GLI ALTRI SERVIZI NON SI TOCCANO, e questa riga è nata da un
         * difetto che stavo per consegnare.
         *
         * La prima versione del ciclo scriveva SOLO il nostro nome. Sul Pad
         * dell'owner c'è **Wispr Flow** fra i servizi di accessibilità legati:
         * quel ciclo lo avrebbe spento in silenzio. Lo stesso sarebbe successo
         * a TalkBack — cioè avremmo tolto la voce a chi ne ha bisogno per usare
         * il telefono, mentre «riparavamo» una cosa nostra.
         *
         * ⇒ L'elenco si LEGGE, si toglie il nostro nome se c'è, si svuota, e si
         * riscrive con tutti gli altri PIÙ noi. Il ciclo che fa rilegare resta
         * (l'elenco cambia due volte), ma nessun altro servizio ci va di mezzo.
         *
         * ⛔ Il separatore è `:`, non `,`: lo dice `AccessibilityManagerService`,
         * e sbagliarlo trasformerebbe due servizi in un nome solo che non esiste.
         */
        val elencoOra = runCatching {
            Settings.Secure.getString(
                contesto.contentResolver,
                Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES,
            )
        }.getOrNull().orEmpty()
        val altri = elencoOra.split(':')
            .map { it.trim() }
            .filter { it.isNotEmpty() && !it.contains(contesto.packageName) }
        val elencoNuovo = (altri + nostro).joinToString(":")
        if (altri.isNotEmpty()) {
            Log.i(MARCHIO, "conservo ${altri.size} altri servizi di accessibilità: non sono nostri da spegnere")
        }

        val passi = listOf(
            listOf("settings", "put", "secure", "enabled_accessibility_services", "''"),
            listOf("settings", "put", "secure", "enabled_accessibility_services", elencoNuovo),
            listOf("settings", "put", "secure", "accessibility_enabled", "1"),
        )
        for (passo in passi) {
            val esito = runCatching {
                TalosPonteAdb.shell(contesto, passo, setOf("settings"), riagganciaSeStaccato = true)
            }.getOrNull()
            if (esito?.codice != 0) {
                Log.w(MARCHIO, "non riparato: il ponte non risponde (${esito?.motivo ?: "nessun ponte"})")
                return "serve-il-ponte"
            }
            // ⛔ Un respiro fra i passi: il sistema deve accorgersi del cambio.
            Thread.sleep(600)
        }

        /*
         * ⛔ SI RILEGGE, e si rilegge la cosa GIUSTA. Il primo tentativo di
         * questa cura si accontentava di `masterAcceso` e dichiarava «riparato»
         * su un occhio che non riceveva un solo evento: uno stato che DICE di
         * funzionare è peggio di uno spento, perché nessuno va a guardarlo.
         *
         * ⛔ E il binding non è istantaneo: il servizio nasce, `onServiceConnected`
         * arriva, e solo allora `aperto()` smette di essere null.
         */
        repeat(10) {
            Thread.sleep(400)
            if (leggi(contesto).legato) {
                Log.i(MARCHIO, "occhio RILEGATO: torna a vedere davvero")
                return "riparato"
            }
        }

        val dopo = leggi(contesto)
        Log.w(
            MARCHIO,
            "non ha attecchito: master=${dopo.masterAcceso} legato=${dopo.legato}",
        )
        return if (dopo.masterAcceso) "acceso-ma-non-legato" else "non-ha-attecchito"
    }
}
