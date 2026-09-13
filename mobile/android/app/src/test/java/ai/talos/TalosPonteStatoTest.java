package ai.talos;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import ai.talos.agent.TalosPonteStato;

import org.junit.Test;

/**
 * ⛔ MISURATO sul Pad il 2026-08-09. «Accendi il risparmio energetico» dalla
 * chat: TALOS apriva il pannello di sistema e diceva che il ponte non era
 * collegato. Ma il Debug wireless era ACCESO (192.0.2.95:33331), TALOS era
 * fra i dispositivi accoppiati (u0_a386@OP6190L1) e il binario era al suo
 * posto. Mancava soltanto un `adb connect` che nessuno rifaceva.
 *
 * Il riconoscimento guardava UNA frase sola. Queste righe tengono ferme le
 * tre.
 */
public class TalosPonteStatoTest {

    @Test
    public void maiStabilita() {
        assertTrue(TalosPonteStato.staccato(false, "adb: no devices/emulators found"));
    }

    @Test
    public void cadutaMentreEraAperta() {
        // Il caso del riavvio del telefono: l'indirizzo c'e' ancora nella lista
        // ma dall'altra parte non risponde piu' nessuno.
        assertTrue(TalosPonteStato.staccato(false, "error: device offline"));
    }

    @Test
    public void riferimentoAUnIndirizzoMorto() {
        assertTrue(TalosPonteStato.staccato(false, "error: device '192.0.2.95:33331' not found"));
    }

    @Test
    public void nonSiFaImpressionareDalleMaiuscole() {
        assertTrue(TalosPonteStato.staccato(false, "ERROR: DEVICE OFFLINE"));
    }

    @Test
    public void ilComandoRIUSCITOnonEmaiUnoScollegamento() {
        // ⛔ La riga che evita sei secondi di scoperta buttati a ogni comando
        // riuscito: `adb` scrive di dispositivi anche quando va tutto bene.
        assertFalse(TalosPonteStato.staccato(true, "error: device offline"));
    }

    @Test
    public void unRifiutoDELLAROMnonEunoScollegamento() {
        // Il monitoraggio permessi di Oppo: qui il ponte c'e' eccome, e
        // riagganciarlo non cambierebbe niente — si deve dire la verita' alla
        // persona invece di riprovare.
        assertFalse(TalosPonteStato.staccato(
                false,
                "java.lang.SecurityException: Neither user 2000 nor current process has "
                        + "android.permission.GRANT_RUNTIME_PERMISSIONS"));
    }

    @Test
    public void unErroreVUOTOnonEunoScollegamento() {
        assertFalse(TalosPonteStato.staccato(false, ""));
    }
}
