package ai.talos;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotEquals;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/**
 * N0 (21/10/2026), D-N0-5: gli id delle notifiche si scontravano.
 *
 * Stessa `NotificationManager`, tag nullo: `TalosRunService` 4711 = `TalosParola` 4711 (due servizi in primo piano: chi si ferma
 * per secondo toglie la notifica dell'altro); attività 4900-5899 dentro il centro 5000-104999 e uguali al suo ripiego 4900;
 * barra dei download (jobId da 100000) dentro il centro. Un registro solo, e una prova che gli intervalli non si toccano.
 */
public class TalosNotificationIdsTest {

    private static boolean dentro(int id, int[] intervallo) {
        return id >= intervallo[0] && id <= intervallo[1];
    }

    @Test
    public void gliIntervalliNonSiToccano() {
        int[][] tutti = TalosNotificationIds.INTERVALLI;
        for (int i = 0; i < tutti.length; i++) {
            assertTrue("intervallo rovesciato " + i, tutti[i][0] <= tutti[i][1]);
            for (int j = i + 1; j < tutti.length; j++) {
                boolean separati = tutti[i][1] < tutti[j][0] || tutti[j][1] < tutti[i][0];
                assertTrue("si toccano " + i + " e " + j, separati);
            }
        }
    }

    @Test
    public void ilServizioDeiGiriEQuelloDellaParolaNonSiPestano() {
        assertNotEquals(TalosNotificationIds.RUN, TalosNotificationIds.VOICE);
    }

    @Test
    public void ogniProduttoreStaNelSuoIntervallo() {
        String[] chiavi = {"", "transfer:qwen", "plan:1", "chat:42", "tool:library_read", "x", "zzzzzzzzzzzzzzzzzzzzzzz", "Aa", "BB"};
        for (String k : chiavi) assertTrue(k, dentro(TalosNotificationIds.centre(k), TalosNotificationIds.CENTRE));
        assertTrue(dentro(TalosNotificationIds.centre(null), TalosNotificationIds.CENTRE));
        for (String t : chiavi) assertTrue(t, dentro(TalosNotificationIds.task(t), TalosNotificationIds.TASKS));
        for (int job : new int[] {100_000, 100_101, 899_999}) {
            assertTrue(dentro(TalosNotificationIds.transferBar(job), TalosNotificationIds.TRANSFER_BARS));
            assertTrue(dentro(TalosNotificationIds.transferDone(job), TalosNotificationIds.TRANSFER_DONE));
        }
        // il ripiego del centro non è più 4900, cioè la prima attività
        assertNotEquals(4900, TalosNotificationIds.centre(""));
    }

    /** Revisione avversaria (7): con `floorMod` cambiavano gli id delle attività con hash negativo, e dopo l'aggiornamento la stessa
     *  attività lasciava due notifiche. La formula resta quella di prima: 4900 + |hash % 1000|. */
    @Test
    public void lIdDiUnAttivitaNonCambia() {
        int negativi = 0;
        for (int i = 0; i < 200; i++) {
            String id = "attivita-" + i + "-zzzzzzzz";
            if (id.hashCode() < 0) negativi++;
            assertEquals(id, 4900 + Math.abs(id.hashCode() % 1000), TalosNotificationIds.task(id));
        }
        assertTrue("servono hash negativi nella prova", negativi > 0);
    }

    @Test
    public void iProduttoriUsanoIlRegistro() {
        assertEquals(TalosNotificationIds.centre("plan:1"), TalosNotificationCentre.idFor("plan:1"));
        assertEquals(TalosNotificationIds.transferBar(100_101), TalosTransferNotification.notificationId(100_101));
        assertEquals(TalosNotificationIds.transferDone(100_101), TalosTransferNotification.doneNotificationId(100_101));
        assertEquals(TalosNotificationIds.RESEARCH, TalosDoneNotification.RESEARCH_ID);
        assertEquals(TalosNotificationIds.TRANSFER_DONE_LEGACY, TalosDoneNotification.TRANSFER_ID);
        assertEquals(TalosNotificationIds.TRANSFER_SUMMARY, TalosTransferNotification.SUMMARY_NOTIFICATION_ID);
    }
}
