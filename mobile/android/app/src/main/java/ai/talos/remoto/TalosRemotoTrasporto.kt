package ai.talos.remoto

import computer.iroh.BiStream
import computer.iroh.Connection
import computer.iroh.Endpoint
import computer.iroh.EndpointAddr
import computer.iroh.EndpointBuilder
import computer.iroh.EndpointId
import computer.iroh.RecvStream
import computer.iroh.RelayConfig
import computer.iroh.RelayMap
import computer.iroh.RelayMode
import computer.iroh.SendStream
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.withContext

/**
 * ⛔ CLIENT DEL CONTROLLO REMOTO, fetta R-M2 (ledger `LEDGER-CLIENT-REMOTO-MOBILE-2026-10-20.md`): il trasporto iroh del telefono,
 * lo specchio di `harness-ui/src/remoto/trasporto-iroh.mjs` del PC (r4 `aeab15222`). Il telefono chiama, il PC accetta: un endpoint
 * per connessione con la chiave del telefono PER QUEL PC (`TalosRemotoCustodia`), UN bi-stream aperto dal telefono (filo v1 §2-3).
 *
 * Il relay arriva dal QR (`index.mjs` `apriAccoppiamento`): o il `talos-relay` della persona con `?token=` (R5.9: il gettone va in
 * `RelayConfig.authToken`, porta QUIC 7842 come `fromUrls`), o il relay di casa di n0 del PC (allora la configurazione n0 e
 * l'indirizzo come suggerimento per trovarlo subito).
 *
 * ⛔ uniffi (contratto §C.1): Endpoint, Connection e gli stream si TENGONO in campi finché servono; un riferimento perso fa
 * partire il finalizzatore che chiude il lato Rust sotto i piedi di chi legge.
 */
object TalosRemotoTrasporto {
    const val ALPN_LAVORO = "talos-remote/1"
    const val ALPN_ACCOPPIAMENTO = "talos-remote-pair/1"
    const val BYTE_PER_LETTURA = 64 * 1024
    private const val PORTA_QUIC_RELAY: UShort = 7842u

    sealed class Relay {
        /** I relay di n0; `suggerito` è il relay di casa del PC, se il QR lo porta. */
        data class N0(val suggerito: String?) : Relay()
        /** Il `talos-relay` della persona: l'indirizzo senza il gettone, e il gettone a parte. */
        data class Proprio(val url: String, val gettone: String) : Relay()
    }

    /** Il relay del QR (o del ricordo del PC) diventa una configurazione; `null` se l'indirizzo non si può usare. */
    fun relayDalQr(relay: String?): Relay? {
        if (relay.isNullOrBlank()) return Relay.N0(null)
        val (url, gettone) = TalosRemotoCustodia.relayDiviso(relay) ?: return null
        return if (gettone.isNullOrEmpty()) Relay.N0(url) else Relay.Proprio(url, gettone)
    }

    /** Ciò che resta vivo di una connessione: tutto in campi (trappola dei finalizzatori uniffi). */
    class Canale(
        val endpoint: Endpoint,
        val connessione: Connection,
        val bi: BiStream,
        val invio: SendStream,
        val ricezione: RecvStream,
        /** L'EndpointId del telefono per questo PC: entra nel codice di 6 cifre (`codiceDiAccoppiamento`). */
        val telefonoId: String,
    )

    suspend fun apri(chiaveTelefono: ByteArray, pcId: String, relay: Relay, alpn: String): Canale {
        val costruttore = EndpointBuilder()
        when (relay) {
            is Relay.Proprio -> {
                costruttore.applyMinimal()
                val mappa = RelayMap.empty()
                mappa.insert(RelayConfig(relay.url, PORTA_QUIC_RELAY, relay.gettone))
                costruttore.relayMode(RelayMode.custom(mappa))
            }
            is Relay.N0 -> costruttore.applyN0()
        }
        costruttore.secretKey(chiaveTelefono)
        val endpoint = costruttore.bind()
        try {
            val suggerito = when (relay) {
                is Relay.Proprio -> relay.url
                is Relay.N0 -> relay.suggerito
            }
            val indirizzo = EndpointAddr(EndpointId.fromString(pcId), suggerito, emptyList())
            val connessione = endpoint.connect(indirizzo, alpn.toByteArray(Charsets.UTF_8))
            val bi = connessione.openBi()
            return Canale(endpoint, connessione, bi, bi.send(), bi.recv(), endpoint.id().toString())
        } catch (e: Exception) {
            // revisione R-M5a (9): `shutdown` è sospendibile; in una coroutine annullata va chiuso fuori dalla cancellazione
            withContext(NonCancellable) { try { endpoint.shutdown() } catch (_: Exception) { /* già chiuso */ } }
            throw e
        }
    }

    /** Il relay del ricordo di un PC, col gettone rimesso nell'indirizzo (come nel QR): `relayDalQr` lo rilegge. */
    fun relayDelRicordo(pc: TalosRemotoCustodia.ComputerAccoppiato): String? =
        pc.relay?.let { url -> pc.gettoneRelay?.let { url + (if ('?' in url) "&" else "?") + "token=" + java.net.URLEncoder.encode(it, "UTF-8") } ?: url }

    /**
     * Il canale di lavoro verso un PC accoppiato, con la chiave del telefono per lui. La usano `collega` del plugin e il lavoro della
     * sveglia (R-M5a). `null` se il relay ricordato non si può usare.
     */
    suspend fun apriVerso(pc: TalosRemotoCustodia.ComputerAccoppiato, alpn: String = ALPN_LAVORO): Canale? {
        val relay = relayDalQr(relayDelRicordo(pc)) ?: return null
        return apri(pc.chiaveTelefono, pc.pcId, relay, alpn)
    }

    /**
     * ⛔ Regressione dal vivo del 20/10 (TRAS-05): il PC manda `pair.ok` e chiude subito stream e connessione. In un canale
     * d'accoppiamento la fine (pulita o per connessione chiusa) NON butta la chiave nuova: resta in attesa di
     * `concludiAccoppiamento` (che il TypeScript chiama solo dopo `pair.ok`), di «Annulla» o della scadenza. Un guasto di taglio
     * del messaggio invece la butta.
     */
    fun chiaveInAttesaDopoLaFine(inAccoppiamento: Boolean, motivo: String): Boolean =
        inAccoppiamento && (motivo == "ENDED" || motivo == "DISCONNECTED")

    /** Il percorso scelto adesso: diretto o relay, e il tempo d'andata e ritorno. `null` se non ce n'è uno. */
    fun percorso(canale: Canale): Pair<String, Long?>? {
        val scelto = canale.connessione.paths().firstOrNull { it.isSelected } ?: return null
        return (if (scelto.isRelay) "relay" else "diretto") to scelto.rttMs.toLong()
    }

    suspend fun chiudi(canale: Canale, motivo: String) {
        try { canale.connessione.close(0L, motivo.take(64).toByteArray(Charsets.UTF_8)) } catch (_: Exception) { /* già chiusa */ }
        try { canale.endpoint.shutdown() } catch (_: Exception) { /* già chiuso */ }
    }
}
