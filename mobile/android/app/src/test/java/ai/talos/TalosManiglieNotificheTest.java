package ai.talos;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

import ai.talos.agent.TalosManiglieNotifiche;

/**
 * ⛔⛔ IL PRESIDIO DI UN DIFETTO CHE HA DETTO «FATTO» SENZA FARE NIENTE.
 *
 * Riprodotto sul Pad il 2026-08-09 alle 00:03. Chiesto dalla chat «elenca le
 * notifiche e poi togli quella di prova», TALOS ha risposto «Fatto ✅ Rimossa la
 * notifica "Prova: talos_prova_15"» — e nello stesso istante, misurando fuori
 * dall'app, `cmd notification list` mostrava la notifica ancora lì.
 *
 * La causa: `cancelNotification` riceveva la maniglia data al modello (`n7`)
 * invece della chiave vera di Android. Il sistema, davanti a una chiave che non
 * conosce, non fa niente e non fallisce.
 *
 * Questi test non chiedono «la funzione è stata chiamata». Chiedono che la cosa
 * che esce sia la CHIAVE VERA — che è l'unica differenza fra togliere una
 * notifica e dire di averlo fatto.
 */
public class TalosManiglieNotificheTest {

    /** La forma vera di una chiave WhatsApp, presa dal Pad. */
    private static final String CHIAVE_WHATSAPP =
            "0|com.whatsapp|1|XqA328IiWblASGe+saGx8BixiMVGByTEJR9F64Rtwwo=|10329";

    @Test
    public void laManigliaTornaLaChiaveVeraEnonSeStessa() {
        TalosManiglieNotifiche<String> maniglie = new TalosManiglieNotifiche<>();
        String maniglia = maniglie.registra(CHIAVE_WHATSAPP, "rispondi");

        // ⛔ È QUESTA la riga che il difetto faceva fallire: chi toglieva la
        // notifica usava la maniglia al posto di cio' che questa riga chiede.
        assertEquals(CHIAVE_WHATSAPP, maniglie.chiaveVera(maniglia));
        assertNotEquals(maniglia, maniglie.chiaveVera(maniglia));
    }

    @Test
    public void laManigliaEcortaEnonSomigliaAunaChiaveDiAndroid() {
        // Il motivo per cui le maniglie esistono: una chiave vera contiene `|` e
        // Base64, e un modello che deve riportarla ne perde dei pezzi. Provato
        // il 2026-08-08 su una scheda di consenso.
        TalosManiglieNotifiche<String> maniglie = new TalosManiglieNotifiche<>();
        String maniglia = maniglie.registra(CHIAVE_WHATSAPP, null);
        assertTrue(maniglia.length() <= 4);
        assertTrue(maniglia.startsWith("n"));
        assertEquals(-1, maniglia.indexOf('|'));
    }

    @Test
    public void ogniNotificaHaLaSuaManigliaEnonSiScambiano() {
        TalosManiglieNotifiche<String> maniglie = new TalosManiglieNotifiche<>();
        String prima = maniglie.registra("0|com.a|1|null|10001", "azioneA");
        String seconda = maniglie.registra("0|com.b|2|null|10002", "azioneB");

        assertNotEquals(prima, seconda);
        assertEquals("0|com.a|1|null|10001", maniglie.chiaveVera(prima));
        assertEquals("0|com.b|2|null|10002", maniglie.chiaveVera(seconda));
        assertEquals("azioneA", maniglie.voce(prima).getAzione());
        assertEquals("azioneB", maniglie.voce(seconda).getAzione());
    }

    @Test
    public void unaManigliaMaiDataTornaSeStessa() {
        // La cortesia per chi agisce senza aver prima elencato: se e' gia' una
        // chiave vera, deve passare intatta. Inventare qui vorrebbe dire agire
        // sulla notifica sbagliata.
        TalosManiglieNotifiche<String> maniglie = new TalosManiglieNotifiche<>();
        assertEquals(CHIAVE_WHATSAPP, maniglie.chiaveVera(CHIAVE_WHATSAPP));
        assertNull(maniglie.voce(CHIAVE_WHATSAPP));
    }

    @Test
    public void ilTettoSiRispettaPRIMAdiInserire() {
        // Controllarlo dopo l'inserimento lascia passare una voce oltre il
        // limite a ogni giro: il magazzino non e' un archivio, e un tetto che
        // sfora non e' un tetto.
        TalosManiglieNotifiche<String> maniglie = new TalosManiglieNotifiche<>(3);
        for (int indice = 0; indice < 10; indice++) {
            maniglie.registra("0|com.x|" + indice + "|null|1", null);
            assertTrue(
                    "il magazzino ha sforato: " + maniglie.getDimensione(),
                    maniglie.getDimensione() <= 3);
        }
    }

    @Test
    public void svuotareTogliePureLeChiaviVere() {
        // Quando il sistema ci scollega non teniamo riferimenti a conversazioni
        // che non guardiamo piu'. Dopo lo svuotamento la maniglia non risolve
        // piu' niente, e chi la usa deve sentirsi dire «non c'e' piu'».
        TalosManiglieNotifiche<String> maniglie = new TalosManiglieNotifiche<>();
        String maniglia = maniglie.registra(CHIAVE_WHATSAPP, "rispondi");
        maniglie.svuota();
        assertNull(maniglie.voce(maniglia));
        assertEquals(maniglia, maniglie.chiaveVera(maniglia));
        assertEquals(0, maniglie.getDimensione());
    }
}
