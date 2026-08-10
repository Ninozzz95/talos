package ai.talos.agent

import java.io.File

/**
 * ⭐⭐ IL FRENO: «mi hai toccato, mi fermo».
 *
 * ## La misura che l'ha deciso, col dito dell'owner
 *
 * 2026-08-10, nei DUE versi:
 *
 * | chi tocca                | righe dal `touchpanel` (`/dev/input/event4`) |
 * |--------------------------|----------------------------------------------|
 * | **un dito vero**         | **1.369** (1.018 EV_ABS, 327 EV_SYN, 24 EV_KEY) |
 * | due `input tap` NOSTRI   | **1** (sola intestazione)                     |
 *
 * ⇒ I tocchi che iniettiamo passano dal framework e **non toccano mai il
 * pannello**. Al livello grezzo un dito umano e un tocco nostro sono opposti:
 * il discriminatore è perfetto, non costa permessi, e non cambia niente a chi
 * possiede il telefono.
 *
 * ⛔ La strada dell'accessibilità è CHIUSA, e sta scritta in `TalosOcchio`:
 * `TYPE_TOUCH_INTERACTION_START` non arriva senza l'esplorazione al tocco, che
 * trasformerebbe un tocco in «leggi» e due in «attiva».
 *
 * ## ⛔ Perché si guarda la DIMENSIONE del file e non le righe
 *
 * Due ragioni, e la prima è una lezione pagata:
 *
 * **1. Contare la stringa sbagliata assomiglia all'assenza di dati.** Il primo
 * conteggio dava `0` perché cercava `ABS_MT`/`BTN_TOUCH`, mentre `getevent -lt`
 * mette i codici in un'altra colonna: stavo per dichiarare «il dito non si
 * sente» e buttare la strada giusta. Un file che **cresce** non ha colonne da
 * sbagliare.
 *
 * **2. La pipe non arriva mai a fine file.** `TalosPonteAdb.esegui` scrive su
 * file proprio per questo: il demone `adb` eredita i descrittori e resta vivo,
 * quindi chi legge un flusso aspetta per sempre. Qui si riusa quel disegno —
 * il comando scrive su file, e noi guardiamo il file.
 *
 * ## E l'effetto collaterale è desiderabile
 *
 * Il file cresce per QUALUNQUE ingresso fisico: schermo, volume, accensione.
 * Non è impreciso, è più giusto — se la persona sta premendo qualcosa, il
 * telefono è tornato suo, qualunque cosa stia premendo.
 */
object TalosDitoVero {

    /**
     * Dove il ponte scrive gli eventi grezzi. In `/data/local/tmp` perché è la
     * sola cartella che la shell (uid 2000) e l'app sanno leggere entrambe —
     * misurato: i file ci nascono `-rw-rw-rw-`.
     */
    const val PERCORSO = "/data/local/tmp/talos-dito.txt"

    /** Il comando che il ponte deve avviare, staccato. */
    val COMANDO = listOf("sh", "-c", "getevent -l > $PERCORSO 2>&1 &")

    @Volatile private var vistaA = -1L

    /**
     * Si comincia a guardare da ADESSO: quello che c'era prima non è un tocco
     * di questa sessione.
     */
    fun azzera() {
        vistaA = quanto()
    }

    /** Vero se qualcosa è cresciuto da quando si guarda. Non consuma. */
    fun haToccato(): Boolean {
        val ora = quanto()
        // ⛔ `-1` vuol dire «non stiamo guardando»: NON si risponde `false`,
        // che vorrebbe dire «nessuno ha toccato» ed è una bugia. Chi chiede
        // deve distinguere «non ho toccato» da «non lo so», e lo fa con
        // `armato()`.
        return vistaA >= 0 && ora > vistaA
    }

    /** Il freno è armato davvero? Un freno che non sa di esistere non frena. */
    fun armato(): Boolean = vistaA >= 0 && File(PERCORSO).exists()

    /** Quanti byte di eventi sono arrivati da quando si guarda. */
    fun cresciutoDi(): Long = if (vistaA < 0) 0 else (quanto() - vistaA).coerceAtLeast(0)

    fun smetti() {
        vistaA = -1
    }

    private fun quanto(): Long = runCatching { File(PERCORSO).length() }.getOrDefault(0L)
}
