package ai.talos.agent

/**
 * ⛔⛔ LE MANIGLIE DELLE NOTIFICHE — e il difetto che ha reso necessario questo file.
 *
 * ## Perché le maniglie esistono
 *
 * La chiave vera di una notifica WhatsApp è:
 *
 *     0|com.whatsapp|1|XqA328IiWblASGe+saGx8BixiMVGByTEJR9F64Rtwwo=|10329
 *
 * Al modello si dà `n1`, `n2`, `n3`: corte, non ambigue, impossibili da troncare
 * per sbaglio. La chiave vera resta da questa parte del ponte.
 *
 * ## ⛔ Il difetto, riprodotto sul Pad il 2026-08-09 alle 00:03
 *
 * Chiesto dalla chat «elenca le notifiche e poi togli quella di prova», TALOS ha
 * risposto:
 *
 * > «Fatto ✅ Rimossa la notifica "Prova: talos_prova_15".»
 *
 * E nello stesso istante, misurando **fuori** dall'app, `cmd notification list`
 * mostrava la notifica **ancora lì**.
 *
 * La causa: chi toglieva la notifica risolveva la maniglia nella chiave vera —
 * e poi chiamava `cancelNotification` con la **maniglia** lo stesso.
 * `cancelNotification` con una chiave che il sistema non conosce non fa niente
 * **e non fallisce**: torna `void`. Quindi il codice riferiva successo.
 *
 * ## ⭐ Perché la cura è un file e non una riga
 *
 * La riga sbagliata era la seconda copia di una logica già scritta bene
 * altrove: chi risponde risolveva la maniglia correttamente, chi toglieva no.
 * Due copie della stessa decisione divergono sempre — è solo questione di quale
 * delle due viene letta quando si ha fretta.
 *
 * ⇒ Qui la risoluzione si scrive **una volta**, si prova su JVM senza un
 * telefono, e i metodi che la usano ricevono un parametro che si chiama
 * `maniglia`: così `cancelNotification(maniglia)` si legge sbagliato prima
 * ancora di essere eseguito.
 *
 * ## Non è un archivio
 *
 * Volatile e con un tetto: si svuota quando il sistema ci scollega e quando
 * supera il limite. Tenere di più vorrebbe dire custodire i riferimenti alle
 * conversazioni di una persona, e ciò che non esiste non si perde.
 *
 * @param A il tipo dell'azione catturata. È un parametro di tipo — e non
 *   `Notification.Action` — solo perché così questa classe non importa niente
 *   di Android e si può provare davvero.
 */
class TalosManiglieNotifiche<A>(private val tetto: Int = TETTO_PREDEFINITO) {

    /** Ciò che serve per agire su una notifica, tenuto insieme. */
    data class Voce<A>(val chiaveVera: String, val azione: A?)

    private val voci = LinkedHashMap<String, Voce<A>>()
    private var contatore = 0

    /** Quante maniglie sono in mano adesso. Serve ai test e alle diagnosi. */
    val dimensione: Int get() = synchronized(voci) { voci.size }

    /**
     * Registra una notifica e torna la maniglia corta da dare al modello.
     *
     * ⛔ Il tetto si controlla **prima** di inserire: controllarlo dopo lascia
     * passare una voce oltre il limite a ogni giro.
     */
    fun registra(chiaveVera: String, azione: A?): String = synchronized(voci) {
        if (voci.size >= tetto) voci.clear()
        val maniglia = "n" + (++contatore)
        voci[maniglia] = Voce(chiaveVera, azione)
        maniglia
    }

    /** La voce dietro una maniglia, o `null` se non l'abbiamo mai data noi. */
    fun voce(maniglia: String): Voce<A>? = synchronized(voci) { voci[maniglia] }

    /**
     * ⛔⛔ IL METODO CHE IL DIFETTO HA RESO NECESSARIO. Si chiama questo, sempre,
     * prima di parlare col sistema.
     *
     * Torna la chiave vera dietro la maniglia. Se la maniglia non la conosciamo,
     * torna ciò che è arrivato — perché può essere già una chiave vera, nel caso
     * di chi agisce senza aver prima elencato.
     */
    fun chiaveVera(maniglia: String): String = voce(maniglia)?.chiaveVera ?: maniglia

    /** Svuota. Si fa quando il sistema ci scollega: i riferimenti non valgono più. */
    fun svuota() = synchronized(voci) { voci.clear() }

    companion object {
        const val TETTO_PREDEFINITO = 60
    }
}
