package ai.talos;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.junit.Test;

/**
 * N0 (21/10/2026), D-N0-6: i nomi dei canali (quello che si legge in Impostazioni → Notifiche di Android) erano scritti nel codice,
 * in inglese fisso, e in italiano fisso per la parola d'attivazione; e un canale già creato non cambiava più nome.
 *
 * Regola «ogni parola in inglese e italiano»: ogni nome e descrizione sta in `R.string` nelle due lingue, e nel codice non resta
 * nessuno dei testi di prima.
 */
public class TalosCanaliLinguaTest {

    private static final String[] CHIAVI = {
            "talos_canale_trasferimenti_nome", "talos_canale_trasferimenti_descrizione",
            "talos_canale_risposte_nome", "talos_canale_risposte_descrizione",
            "talos_canale_lavori_nome", "talos_canale_lavori_descrizione",
            "talos_canale_attenzione_nome", "talos_canale_attenzione_descrizione",
            "talos_canale_finiti_nome", "talos_canale_finiti_descrizione",
            "talos_canale_in_corso_nome", "talos_canale_in_corso_descrizione",
            "talos_canale_download_nome", "talos_canale_download_descrizione",
            "talos_canale_parola_nome", "talos_canale_parola_descrizione",
            "talos_canale_accoppiamento_nome", "talos_canale_accoppiamento_descrizione",
            "talos_canale_aggiornamenti_nome", "talos_canale_aggiornamenti_descrizione",
            "talos_aggiornamento_pronta_titolo", "talos_aggiornamento_pronta_testo",
            "talos_aggiornamento_fatta_titolo", "talos_aggiornamento_fatta_testo",
            "talos_parola_titolo", "talos_parola_testo",
            "talos_download_pausa", "talos_download_mancano", "talos_download_fine_ok", "talos_download_fine_cambiato",
            "talos_download_fine_controllo", "talos_download_fine_sparito", "talos_download_fine_irraggiungibile",
            "talos_download_fine_spazio", "talos_download_fine_pausa", "talos_download_fine_fermato",
    };

    private static final String[] TESTI_DI_PRIMA = {
            "\"Downloads and installs\"", "\"Replies\"", "\"Long jobs\"", "\"Needs you\"", "\"Finished work\"",
            "\"Work in progress\"", "\"Model downloads\"", "\"TALOS in ascolto\"", "Il microfono resta acceso finché",
            "\"Pause\"", "\" left\"", "transfers active", "\"Downloaded and verified\"", "start again", "checksum",
            "no longer published", "Could not reach the server", "Not enough free space", "resumes where it left off", "\"Stopped: \"",
    };

    private static final String[] SORGENTI = {
            "src/main/java/ai/talos/TalosNotificationCentre.java",
            "src/main/java/ai/talos/TalosDoneNotification.java",
            "src/main/java/ai/talos/TalosRunService.java",
            "src/main/java/ai/talos/TalosTransferNotification.java",
            "src/main/java/ai/talos/parola/TalosParola.kt",
    };

    private static String leggi(String percorso) throws IOException {
        Path p = Paths.get(percorso);
        if (!Files.exists(p)) p = Paths.get("app", percorso);
        return new String(Files.readAllBytes(p), StandardCharsets.UTF_8);
    }

    private static String valore(String xml, String chiave) {
        Matcher m = Pattern.compile("<string name=\"" + chiave + "\"[^>]*>([^<]*)</string>").matcher(xml);
        return m.find() ? m.group(1).trim() : null;
    }

    @Test
    public void ogniNomeDiCanaleEInInglesEInItaliano() throws IOException {
        String en = leggi("src/main/res/values/strings.xml");
        String it = leggi("src/main/res/values-it/strings.xml");
        for (String k : CHIAVI) {
            String a = valore(en, k);
            String b = valore(it, k);
            assertTrue("manca in inglese: " + k, a != null && !a.isEmpty());
            assertTrue("manca in italiano: " + k, b != null && !b.isEmpty());
            assertNotEquals("non tradotta: " + k, a, b);
        }
    }

    @Test
    public void iDownloadInCorsoSiContanoNelleDueLingue() throws IOException {
        for (String f : new String[] {"src/main/res/values/strings.xml", "src/main/res/values-it/strings.xml"}) {
            String xml = leggi(f);
            Matcher m = Pattern.compile("<plurals name=\"talos_download_attivi\">(.*?)</plurals>", Pattern.DOTALL).matcher(xml);
            assertTrue("manca il plurale in " + f, m.find());
            assertTrue(f, m.group(1).contains("quantity=\"one\"") && m.group(1).contains("quantity=\"other\""));
        }
    }

    /*
     * Visto sul Pad il 21/10 con l'app in inglese: «Lavori finiti» e «Richieste» (controllo remoto, un gruppo per PC) e «Codice di
     * accoppiamento» restavano in italiano. I primi nascono alla sveglia e nessuno li rinominava; il secondo prendeva il nome dal
     * titolo della prima notifica. Si riconoscono dall'id e si rinominano con gli altri.
     */
    @Test
    public void iCanaliDelControlloRemotoSiRiconosconoDallId() {
        assertEquals("richieste", ai.talos.remoto.TalosSvegliaNotifiche.INSTANCE.tipoDelCanale("talos.remoto.ab12.g3.richieste"));
        assertEquals("finiti", ai.talos.remoto.TalosSvegliaNotifiche.INSTANCE.tipoDelCanale("talos.remoto.ab12.g0.finiti"));
        // AL CONTRARIO: gli altri canali non si toccano
        assertNull(ai.talos.remoto.TalosSvegliaNotifiche.INSTANCE.tipoDelCanale("talos_accoppiamento"));
        assertNull(ai.talos.remoto.TalosSvegliaNotifiche.INSTANCE.tipoDelCanale("talos_jobs_done"));
        assertNull(ai.talos.remoto.TalosSvegliaNotifiche.INSTANCE.tipoDelCanale("altro.richieste"));
    }

    @Test
    public void ilRinominaPassaAncheDalControlloRemotoEDallAccoppiamento() throws IOException {
        String centro = leggi("src/main/java/ai/talos/TalosNotificationCentre.java");
        int i = centro.indexOf("public static void refreshNames(");
        String corpo = centro.substring(i, centro.indexOf("\n    }", i));
        assertTrue(corpo.contains("TalosSvegliaNotifiche.INSTANCE.rinominaCanali(context)"));
        assertTrue(corpo.contains("TalosAccoppiamentoNotifica.INSTANCE.rinominaCanale(context)"));
        String accoppiamento = leggi("src/main/java/ai/talos/agent/TalosAccoppiamentoNotifica.kt");
        assertFalse("il nome del canale non è più il titolo della notifica", accoppiamento.contains("NotificationChannel(CANALE, titolo"));
        assertTrue(accoppiamento.contains("R.string.talos_canale_accoppiamento_nome"));
    }

    @Test
    public void nelCodiceNonRestaNessunTestoDiCanale() throws IOException {
        for (String f : SORGENTI) {
            String s = leggi(f);
            for (String t : TESTI_DI_PRIMA) assertFalse(f + " contiene ancora " + t, s.contains(t));
        }
    }
}
