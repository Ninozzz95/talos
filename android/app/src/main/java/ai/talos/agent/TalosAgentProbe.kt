package ai.talos.agent

/**
 * C0 — il file Kotlin VUOTO che deve compilare, prima di scriverci dentro.
 *
 * ## Perche' esiste un file che non fa niente
 *
 * La fase 9 nasce in Kotlin (decisione D5): il policy engine, il piano, il
 * classificatore dei comandi, l'audit. I plugin esistenti restano Java e non si
 * toccano — funzionano e sono provati sul dispositivo.
 *
 * Ma la catena di build Windows di questo progetto e' delicata: NDK r27, CMake
 * 3.31.6, e un host Rust che deve essere GNU e non MSVC. Aggiungere un
 * compilatore nuovo a meta' di un policy engine significa non sapere se e' il
 * policy engine a non compilare o la catena.
 *
 * Quindi il primo passo e' questo: **un file che non fa niente, e che deve
 * arrivare dentro l'APK**. Se rompe, rompe qui.
 *
 * ⛔ Non e' un segnaposto da cancellare: la funzione qui sotto e' cio' che la
 * prova sul dispositivo legge per dire «il Kotlin c'e' davvero», invece di
 * fidarsi del fatto che Gradle non ha protestato.
 */
object TalosAgentProbe {

    /** La riga che la prova sul dispositivo cerca. */
    const val MARKER: String = "talos.kotlin.c0"

    /**
     * Restituisce la versione del linguaggio con cui questo file e' stato
     * compilato, chiesta al runtime Kotlin e non scritta a mano.
     *
     * Scritta a mano direbbe soltanto cosa credevamo di aver configurato.
     */
    @JvmStatic
    fun languageVersion(): String = KotlinVersion.CURRENT.toString()
}
