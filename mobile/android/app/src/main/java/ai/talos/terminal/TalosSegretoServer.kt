package ai.talos.terminal

/**
 * ⛔⛔ 70-A (30/09/2026, contratto desktop 70) — il segreto del server del Codice.
 *
 * Il server lo crea a ogni avvio in `state/server-token` (`server-secret.mjs`, owner 30/09 sera: «Lo crea il server»),
 * leggibile solo dall'utente `shell` con cui gira; l'app lo legge col ponte adb. Qui si decide cosa si accetta da quella
 * lettura: solo il formato di `segretoValido` (64 esadecimali minuscoli), con al più gli spazi finali della shell.
 * Qualunque altra cosa (file assente, il messaggio d'errore di `cat`, un testo troncato) è «nessun segreto».
 *
 * ⛔ Il segreto non va mai in `Log`: una chiave è già finita nel logcat una volta (vedi `TalosPonteSegreti.kt`).
 */
object TalosSegretoServer {
    private val FORMATO = Regex("^[0-9a-f]{64}$")

    fun valido(testo: String): String? {
        val pulito = testo.trimEnd()
        return pulito.takeIf { FORMATO.matches(it) }
    }
}
