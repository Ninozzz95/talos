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

    /**
     * Il comando che il ponte deve avviare, staccato.
     *
     * ## ⛔⛔ SI GUARDA SOLO IL PANNELLO, e ci è costata una corsa vera
     *
     * La prima versione era `getevent -l > file`, senza dire QUALE device. Alla
     * prima corsa del pilota sul Pad (2026-08-10) il file è passato da 559 a
     * **45.327 byte** senza che nessuno toccasse il vetro, e il freno ha fermato
     * l'agente dopo UN passo dicendo «mi hai toccato». Dentro il file:
     *
     * ```
     *   add device 10: /dev/input/event9
     *     name:     "Monkey touch"
     *   remove device 10: /dev/input/event9
     * ```
     *
     * ⇒ Non era un dito: `getevent` **ristampa il censimento di tutti i device**
     * ogni volta che uno compare o sparisce, e «Monkey touch» è il device
     * virtuale che crea `input tap` — cioè i tocchi **NOSTRI**. Il freno
     * scambiava noi per la persona: il difetto peggiore possibile su un freno,
     * perché non si vede (l'agente «si comporta bene») e rende la funzione
     * inutile.
     *
     * La misura originale — dito 1.258 byte, tocco iniettato 0 — restava vera:
     * guardava **solo `/dev/input/event4`**, il pannello. Era il comando a non
     * dirlo.
     *
     * ⛔ E il pannello si SCOPRE, non si scrive: `ABS_MT_POSITION_X` è la
     * capacità che solo un touchscreen dichiara. Su un altro telefono il numero
     * del device è un altro, e un `event4` scritto a mano avrebbe funzionato
     * qui e mentito altrove.
     */
    val COMANDO = listOf(
        "sh", "-c",
        "D=$(getevent -pl 2>/dev/null | awk '/^add device/{d=\$4} /ABS_MT_POSITION_X/{print d; exit}'); " +
            "[ -n \"\$D\" ] && getevent -l \"\$D\" > $PERCORSO 2>&1 &",
    )

    /** L'istante in cui si è armato, o `-1` se non si sta guardando. */
    @Volatile private var armatoA = -1L

    /**
     * Si comincia a guardare da ADESSO: quello che c'era prima non è un tocco
     * di questa sessione.
     *
     * ## ⛔⛔ IL FRENO ZOMBIE: diceva «armato» e non sentiva più niente
     *
     * MISURATO sul Pad l'11 agosto, provando il ripiego. Nessun `getevent` vivo
     * (`ps -A -o NAME | grep -c getevent` → **0**), eppure `armato()` rispondeva
     * **true** e il pilota partiva col freno grezzo: il file c'era ancora,
     * lasciato da una corsa di ore prima. Un freno così è peggio di uno spento —
     * dichiara di sentire, non cresce mai di un byte, e quindi risponde «nessuno
     * ha toccato» per sempre. E siccome il file vive in `/data/local/tmp`,
     * sopravvive alla chiusura dell'app: da solo non guarisce.
     *
     * ⛔ IL PRIMO RIMEDIO NON FUNZIONAVA, e va detto perché non lo riprovi
     * nessuno: cancellare il file da qui. `File.delete()` fallisce in silenzio —
     * il file è `-rw-rw-rw- shell shell`, ma cancellarlo vuole il permesso di
     * scrittura sulla **cartella**, e la cartella è di `shell`. L'ho scoperto
     * perché dopo la correzione la misura diceva ancora `tipo: "grezzo"`.
     *
     * ⇒ Non si cancella: si guarda l'**ora**. Il comando apre il file con `>`,
     * che lo tronca e ne aggiorna la data. Se la data è più vecchia del momento
     * in cui abbiamo armato, quel file è di qualcun altro e questo freno non è
     * in servizio — e il posto non resta vuoto, subentra quello degli eventi.
     */
    fun azzera() {
        armatoA = System.currentTimeMillis()
    }

    /**
     * Vero se è arrivato anche un solo byte da quando si guarda.
     *
     * ⛔ Il confronto è con **zero**, non con la dimensione di prima: il comando
     * tronca il file all'avvio, quindi dopo un armamento valido tutto ciò che
     * c'è dentro è arrivato dopo. Confrontare con la dimensione precedente era
     * la seconda faccia del freno zombie — con un file vecchio da 167.762 byte
     * ci sarebbero voluti 167.762 byte di dita prima di accorgersi di una mano.
     */
    fun haToccato(): Boolean = armato() && quanto() > 0

    /**
     * Il freno è armato davvero? Un freno che non sa di esistere non frena.
     *
     * ⛔ La tolleranza di un secondo non è pigrizia: la data di un file ha la
     * grana del secondo su alcuni filesystem, e senza di essa un freno armato e
     * partito nello stesso istante si dichiarerebbe spento.
     */
    fun armato(): Boolean =
        armatoA >= 0 && quando() + TOLLERANZA_DATA_MS >= armatoA

    /** Quanti byte di eventi sono arrivati da quando si guarda. */
    fun cresciutoDi(): Long = if (armato()) quanto() else 0

    fun smetti() {
        armatoA = -1
    }

    private const val TOLLERANZA_DATA_MS = 1_000L

    private fun quanto(): Long = runCatching { File(PERCORSO).length() }.getOrDefault(0L)

    private fun quando(): Long = runCatching { File(PERCORSO).lastModified() }.getOrDefault(0L)
}
