package ai.talos.agent

import android.content.pm.PackageManager

/**
 * Cosa TALOS può fare sul telefono **adesso**, chiesto invece che sperato.
 *
 * ## Perché una fotografia e non un booleano
 *
 * «Shizuku c'è» non è una risposta utile, perché fra «l'app è installata» e «io
 * posso davvero fare quella cosa» ci sono quattro porte in fila, e ognuna si
 * chiude per conto suo:
 *
 * 1. l'app Shizuku è **installata**;
 * 2. il suo servizio è **avviato** (muore a ogni riavvio del telefono, e
 *    riavviarlo vuole di nuovo adb o root);
 * 3. la persona ci ha **autorizzati**;
 * 4. il sistema, sotto, lascia fare — ed è qui che ColorOS dice di no.
 *
 * Un booleano solo collasserebbe quattro cause in un effetto, e chi legge non
 * saprebbe cosa fare: reinstallare? riavviare il servizio? concedere? niente,
 * perché il produttore non vuole? Sono quattro azioni diverse, e la schermata
 * deve poterle dire.
 *
 * ## ⛔ Il fatto misurato che governa tutto questo
 *
 * Sul Pad dell'owner, ColorOS: la shell **esegue** ma **non concede**.
 * `pm grant` e `appops set` vengono rifiutati. Quindi Shizuku non porta permessi
 * che sopravvivono al riavvio: porta la capacità di **fare** cose finché è vivo.
 *
 * ⇒ Non è un difetto da aggirare, è la forma del terreno. Prometterlo
 * altrimenti in una schermata sarebbe la bugia peggiore: farebbe cercare alla
 * persona una configurazione che non esiste.
 *
 * ## Perché niente qui esegue niente
 *
 * Questo file **guarda** e basta. Chi esegue vive dietro il cancello dei
 * permessi e dietro il piano, e questa fotografia è ciò che quel cancello
 * consulta per sapere se ha senso perfino chiedere. Un'architettura in cui la
 * verifica e l'esecuzione stanno nello stesso posto è un'architettura in cui,
 * prima o poi, qualcuno esegue senza aver verificato.
 */
object TalosPrivilegeSnapshot {

    /** Il pacchetto dell'app Shizuku, per distinguere «assente» da «spenta». */

    /**
     * Perché non si può usare Shizuku, quando non si può.
     *
     * Ordinati come si presentano nel tempo, così la schermata può mostrare
     * **il primo passo mancante** invece di un elenco di cose da fare.
     */
    enum class Stato {
        /** L'app Shizuku non è installata. Si installa. */
        ASSENTE,

        /** Installata, servizio non avviato. Si avvia — e vuole adb o root. */
        SPENTO,

        /** Vivo, ma non ci ha autorizzati. Si chiede. */
        DA_AUTORIZZARE,

        /** Chiesto e RIFIUTATO. Non si richiede da soli: si spiega. */
        NEGATO,

        /** Vivo e autorizzato. */
        PRONTO,
    }

    data class Fotografia(
        val stato: Stato,
        /**
         * La versione del servizio Shizuku, o -1.
         *
         * Chiesta al servizio e non dedotta dal pacchetto: fra l'app installata
         * e il servizio che gira c'è un riavvio di mezzo, e possono non essere
         * la stessa versione.
         */
        val versione: Int,
        /**
         * L'identità sotto cui gira: 0 = root, 2000 = shell.
         *
         * ⛔ Cambia cosa si può fare, non solo quanto. Con root i permessi si
         * concedono; con la shell, su ColorOS, no. Mostrarla evita di
         * promettere a un dispositivo ciò che si è visto funzionare su un
         * altro.
         */
        val uid: Int,
        /** Se il servizio è una versione troppo vecchia per l'API che usiamo. */
        val troppoVecchio: Boolean,
    )

    /**
     * La fotografia, adesso.
     *
     * ⛔ Non solleva mai e non chiede niente: è una lettura. Chiedere
     * l'autorizzazione è un atto, e gli atti non si fanno mentre si guarda —
     * un utente che apre una schermata di stato e si vede comparire una
     * richiesta di permesso non ha capito cosa ha appena autorizzato.
     */
    /**
     * ⛔⛔ SHIZUKU NON C'È PIÙ — 2026-08-09, per decisione dell'owner.
     *
     * ## Cosa faceva questa funzione
     *
     * Interrogava il server di Shizuku: installato? vivo? che versione? ci ha
     * autorizzati? Cinque domande a un'app di terzi, per sapere se TALOS poteva
     * eseguire un comando.
     *
     * ## Perché non ha più senso chiederglielo
     *
     * Le due strade arrivavano alla **stessa identità**: uid 2000, la shell.
     * Non c'era niente che Shizuku sapesse fare e il ponte no. E su OxygenOS 16,
     * misurato il 2026-08-08, Shizuku non riusciva nemmeno ad autorizzarci: lo
     * fa con un `pm grant`, e questa ROM alla shell quel potere l'ha tolto.
     *
     * ⇒ Su questo telefono la strada «preferita» era quella che non funziona.
     *
     * ## Perché la classe resta, invece di sparire
     *
     * Perché un'installazione vecchia può avere ancora questi stati scritti sul
     * disco, e i suoi valori attraversano il ponte fino all'interfaccia.
     * Toglierli di colpo farebbe leggere a quelle installazioni uno stato
     * sconosciuto — e uno stato sconosciuto, in una schermata di permessi,
     * diventa un «non lo so» presentato come un «no».
     *
     * La fotografia adesso dice sempre **ASSENTE**: è la verità, e la verità
     * porta l'interfaccia alla pagina dell'accoppiamento, che è il posto giusto.
     */
    @JvmStatic
    fun leggi(packageManager: PackageManager): Fotografia = Fotografia(
        stato = Stato.ASSENTE,
        versione = -1,
        uid = -1,
        troppoVecchio = false,
    )
}
