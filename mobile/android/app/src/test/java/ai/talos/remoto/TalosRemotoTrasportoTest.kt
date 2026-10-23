package ai.talos.remoto

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * ⛔ CLIENT DEL CONTROLLO REMOTO, fetta R-M2: il relay del QR diventa la configurazione dell'endpoint del telefono, come
 * `configuraRelay` di `trasporto-iroh.mjs` (r4 `aeab15222`): col gettone il `talos-relay` della persona (gettone in `authToken`),
 * senza i relay di n0 con quello del PC come suggerimento.
 */
class TalosRemotoTrasportoTest {
    @Test
    fun `TRAS-01 talos-relay col gettone - indirizzo pulito e gettone a parte`() {
        assertEquals(
            TalosRemotoTrasporto.Relay.Proprio("https://relay.casa.example/", "abc"),
            TalosRemotoTrasporto.relayDalQr("https://relay.casa.example/?token=abc"),
        )
    }

    @Test
    fun `TRAS-02 il relay di casa di n0 - configurazione n0 col suggerimento, e nessun relay vuol dire n0`() {
        assertEquals(
            TalosRemotoTrasporto.Relay.N0("https://euw1-1.relay.n0.example/"),
            TalosRemotoTrasporto.relayDalQr("https://euw1-1.relay.n0.example/"),
        )
        assertEquals(TalosRemotoTrasporto.Relay.N0(null), TalosRemotoTrasporto.relayDalQr(null))
        assertEquals(TalosRemotoTrasporto.Relay.N0(null), TalosRemotoTrasporto.relayDalQr(""))
    }

    @Test
    fun `TRAS-03 un relay che non si può usare non diventa una connessione`() {
        assertNull(TalosRemotoTrasporto.relayDalQr("http://relay.casa.example/?token=abc"))
        assertNull(TalosRemotoTrasporto.relayDalQr("ftp://relay.casa.example/"))
    }

    /**
     * ⛔ REGRESSIONE dal vivo, 20/10/2026 (Pad ↔ server di prova 4178): il PC manda `pair.ok` e CHIUDE subito lo stream
     * (`servizio.mjs` `accoppia`: `finisci()` + `chiudi('DONE')`). Il lettore vedeva la fine, chiudeva il canale e azzerava la
     * chiave nuova prima che il TypeScript chiamasse `concludiAccoppiamento`: il PC aveva registrato il telefono, il telefono
     * aveva perso la sua chiave. La fine NORMALE di un canale d'accoppiamento lascia la chiave in attesa.
     */
    @Test
    fun `TRAS-05 dopo pair ok lo stream finisce - la chiave d'accoppiamento resta in attesa, gli altri casi chiudono`() {
        assertEquals(true, TalosRemotoTrasporto.chiaveInAttesaDopoLaFine(inAccoppiamento = true, motivo = "ENDED"))
        assertEquals(false, TalosRemotoTrasporto.chiaveInAttesaDopoLaFine(inAccoppiamento = true, motivo = "TOO_LARGE"))
        // il PC chiude anche la connessione dopo pair.ok: a seconda dei tempi il lettore vede la fine o la connessione chiusa
        assertEquals(true, TalosRemotoTrasporto.chiaveInAttesaDopoLaFine(inAccoppiamento = true, motivo = "DISCONNECTED"))
        assertEquals(false, TalosRemotoTrasporto.chiaveInAttesaDopoLaFine(inAccoppiamento = true, motivo = "BAD_MESSAGE"))
        assertEquals(false, TalosRemotoTrasporto.chiaveInAttesaDopoLaFine(inAccoppiamento = false, motivo = "ENDED"))
    }

    /** R-M5a (21/10/2026): il lavoro della sveglia si collega dal ricordo del PC come `collega`: il gettone torna nell'indirizzo. */
    @Test
    fun `TRAS-06 il relay del ricordo torna quello del QR, col gettone a parte`() {
        val chiave = ByteArray(32)
        val proprio = TalosRemotoCustodia.ComputerAccoppiato("pc", null, "https://relay.casa.example/", "g&t=1", chiave, 1)
        assertEquals(TalosRemotoTrasporto.Relay.Proprio("https://relay.casa.example/", "g&t=1"),
            TalosRemotoTrasporto.relayDalQr(TalosRemotoTrasporto.relayDelRicordo(proprio)))
        val n0 = TalosRemotoCustodia.ComputerAccoppiato("pc", null, "https://euw1-1.relay.n0.example/", null, chiave, 1)
        assertEquals(TalosRemotoTrasporto.Relay.N0("https://euw1-1.relay.n0.example/"), TalosRemotoTrasporto.relayDalQr(TalosRemotoTrasporto.relayDelRicordo(n0)))
        assertEquals(TalosRemotoTrasporto.Relay.N0(null), TalosRemotoTrasporto.relayDalQr(TalosRemotoTrasporto.relayDelRicordo(
            TalosRemotoCustodia.ComputerAccoppiato("pc", null, null, null, chiave, 1))))
    }

    @Test
    fun `TRAS-04 gli ALPN sono quelli del PC`() {
        assertEquals("talos-remote/1", TalosRemotoTrasporto.ALPN_LAVORO)
        assertEquals("talos-remote-pair/1", TalosRemotoTrasporto.ALPN_ACCOPPIAMENTO)
    }
}
