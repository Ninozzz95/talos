package ai.talos.agent

import android.content.pm.PackageManager
import rikka.shizuku.Shizuku

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
    private const val SHIZUKU_PACKAGE = "moe.shizuku.privileged.api"

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
    @JvmStatic
    fun leggi(packageManager: PackageManager): Fotografia {
        val installata = runCatching {
            packageManager.getPackageInfo(SHIZUKU_PACKAGE, 0)
        }.isSuccess

        // `pingBinder` è l'unica domanda che distingue «installata» da «viva»:
        // il binder arriva solo quando il servizio gira davvero.
        val vivo = runCatching { Shizuku.pingBinder() }.getOrDefault(false)
        if (!vivo) {
            return Fotografia(
                stato = if (installata) Stato.SPENTO else Stato.ASSENTE,
                versione = -1,
                uid = -1,
                troppoVecchio = false,
            )
        }

        val versione = runCatching { Shizuku.getVersion() }.getOrDefault(-1)
        val uid = runCatching { Shizuku.getUid() }.getOrDefault(-1)
        // Le versioni pre-11 non hanno il modello di permesso che usiamo: una
        // richiesta li' non fallisce, viene semplicemente ignorata.
        val vecchio = runCatching { Shizuku.isPreV11() }.getOrDefault(false)

        val concesso = runCatching {
            Shizuku.checkSelfPermission() == PackageManager.PERMISSION_GRANTED
        }.getOrDefault(false)
        val haGiaDettoNo = runCatching {
            Shizuku.shouldShowRequestPermissionRationale()
        }.getOrDefault(false)

        return Fotografia(
            stato = when {
                concesso -> Stato.PRONTO
                haGiaDettoNo -> Stato.NEGATO
                else -> Stato.DA_AUTORIZZARE
            },
            versione = versione,
            uid = uid,
            troppoVecchio = vecchio,
        )
    }
}
