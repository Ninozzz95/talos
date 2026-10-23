package ai.talos;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

import org.junit.Test;

/**
 * Revisione avversaria R-M5a bis (11), 21/10/2026: `singleTask` + processo morto. Android ricrea l'attività con l'intent ORIGINALE,
 * che porta ancora l'`EXTRA_ROUTE` di una notifica già aperta (il `removeExtra` era solo in memoria): `takeRoute` riapriva una pagina
 * che nessuno aveva chiesto. Ogni notifica porta un nonce; il ponte ricorda quelli consumati (persistente, ultimi 64).
 */
public class TalosRouteNonceTest {
    @Test
    public void nonceNuovoSiConsumaUnaVolta() {
        String dopo = TalosDoneNotification.consumaNonce("", "a");
        assertEquals("a", dopo);
        assertNull(TalosDoneNotification.consumaNonce(dopo, "a"));
        assertEquals("a,b", TalosDoneNotification.consumaNonce(dopo, "b"));
    }

    @Test
    public void senzaNonceSiSegueLaRotta() {
        assertEquals("x", TalosDoneNotification.consumaNonce("x", null));
        assertEquals("x", TalosDoneNotification.consumaNonce("x", ""));
    }

    @Test
    public void siRicordanoGliUltimiSessantaquattro() {
        String salvate = "";
        for (int i = 0; i < 70; i++) salvate = TalosDoneNotification.consumaNonce(salvate, "n" + i);
        assertEquals(64, salvate.split(",").length);
        assertEquals("n6", salvate.split(",")[0]);
        // uno dimenticato per il tetto torna «nuovo»: va bene, è vecchio di 64 notifiche
        assertEquals(64, TalosDoneNotification.consumaNonce(salvate, "n0").split(",").length);
    }
}
