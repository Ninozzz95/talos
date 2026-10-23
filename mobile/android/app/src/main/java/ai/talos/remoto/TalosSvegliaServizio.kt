package ai.talos.remoto

import ai.talos.R
import org.unifiedpush.android.connector.FailedReason
import org.unifiedpush.android.connector.PushService
import org.unifiedpush.android.connector.data.PushEndpoint
import org.unifiedpush.android.connector.data.PushMessage

/**
 * ⛔ R-M5a (ledger `LEDGER-CLIENT-REMOTO-MOBILE-2026-10-20.md`, 21/10/2026): il servizio UnifiedPush della sveglia (`PUSH_EVENT`, come
 * l'esempio ufficiale `PushServiceImpl` e la sonda del 15/10). Niente rete qui: si ricorda, si mostra, si programma il lavoro.
 *
 * - `onNewEndpoint`: l'iscrizione nuova (endpoint + p256dh/auth che il connettore usa per decifrare) si ricorda e va al PC.
 * - `onMessage`: SUBITO una notifica provvisoria («<PC> ha bisogno di te»: ogni sveglia diventa una notifica visibile), poi il job
 *   urgente che si collega e la sostituisce con quelle vere. Un messaggio che il connettore non ha decifrato non è del PC: si scarta.
 * - `onUnregistered`: la sveglia di quel PC non c'è più.
 */
class TalosSvegliaServizio : PushService() {
    override fun onNewEndpoint(endpoint: PushEndpoint, instance: String) {
        val pcId = TalosSveglia.pcDellIstanza(this, instance) ?: return
        val chiavi = endpoint.pubKeySet ?: return TalosSveglia.segnaErrore(this, instance, "NO_KEYS")
        TalosSveglia.salvaIscrizione(this, instance, TalosSveglia.Iscrizione(endpoint.url, chiavi.pubKey, chiavi.auth))
        TalosSvegliaLavoro.programma(this, pcId, sveglia = false)
    }

    override fun onMessage(message: PushMessage, instance: String) {
        val pcId = TalosSveglia.pcDellIstanza(this, instance) ?: return
        if (!message.decrypted) return
        val nome = TalosSveglia.nomePc(this, pcId) ?: getString(R.string.talos_sveglia_computer)
        // «Prova la notifica»: la persona ha l'app in mano, la prova dice solo che la strada funziona (niente collegamento).
        // Revisione R-M5a (2): se il PC la segna nel carico (`p:1`) vale quello; il segno del telefono resta per i PC di prima
        val prova = TalosSvegliaAvvisi.eUnaProva(message.content)
        // revisione R-M5a bis (1): la prova segnata dal PC consuma anche il segno del telefono, così la sveglia vera dopo resta vera
        if (prova == true) { TalosSveglia.annullaProva(this, pcId); return TalosSvegliaNotifiche.mostraProva(this, pcId, nome) }
        if (prova == null && TalosSveglia.prendiProva(this, pcId)) return TalosSvegliaNotifiche.mostraProva(this, pcId, nome)
        if (prova == false) TalosSveglia.annullaProva(this, pcId)
        TalosSvegliaNotifiche.mostraProvvisoria(this, pcId, nome)
        TalosSvegliaLavoro.programma(this, pcId, sveglia = true)
    }

    override fun onRegistrationFailed(reason: FailedReason, instance: String) {
        TalosSveglia.segnaErrore(this, instance, reason.name)
    }

    override fun onUnregistered(instance: String) {
        TalosSveglia.dimentica(this, instance)
    }
}
