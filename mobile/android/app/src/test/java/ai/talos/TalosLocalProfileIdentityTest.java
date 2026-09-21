package ai.talos;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotEquals;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/**
 * P0-2 — l'identità è la combinazione di TUTTI i campi, non una scorciatoia
 * su uno solo. `{@link TalosLocalProfileIdentity#current}` chiama un metodo
 * nativo (`nativeEngineBuild`) e resta fuori da qui apposta: questi test
 * vivono sulla JVM, senza un telefono, esattamente come
 * {@link TalosBackendChoiceTest} — il device test copre `current()`.
 */
public class TalosLocalProfileIdentityTest {

    private static TalosLocalProfileIdentity riferimento() {
        return new TalosLocalProfileIdentity(
                "b419-dc72703", "d854adc23e311c53", 1_282_439_264L, 36, "fingerprint/1");
    }

    @Test
    public void stessiCinqueCampiSonoLaStessaIdentita() {
        TalosLocalProfileIdentity a = riferimento();
        TalosLocalProfileIdentity b = new TalosLocalProfileIdentity(
                "b419-dc72703", "d854adc23e311c53", 1_282_439_264L, 36, "fingerprint/1");
        assertEquals(a, b);
        assertEquals("equals() coerente richiede hashCode() coerente", a.hashCode(), b.hashCode());
    }

    @Test
    public void unEngineBuildDiversoNonELaStessaIdentita() {
        TalosLocalProfileIdentity a = riferimento();
        TalosLocalProfileIdentity b = new TalosLocalProfileIdentity(
                "b420-ffffff0", "d854adc23e311c53", 1_282_439_264L, 36, "fingerprint/1");
        assertNotEquals("un pin diverso di llama.cpp invalida il profilo", a, b);
    }

    @Test
    public void unModelSha256DiversoNonELaStessaIdentita() {
        TalosLocalProfileIdentity a = riferimento();
        TalosLocalProfileIdentity b = new TalosLocalProfileIdentity(
                "b419-dc72703", "27336af36cd41839", 1_282_439_264L, 36, "fingerprint/1");
        assertNotEquals("un modello diverso — anche a parità di nome file — invalida il profilo", a, b);
    }

    @Test
    public void unaDimensioneDiversaNonELaStessaIdentita() {
        TalosLocalProfileIdentity a = riferimento();
        TalosLocalProfileIdentity b = new TalosLocalProfileIdentity(
                "b419-dc72703", "d854adc23e311c53", 1_282_439_265L, 36, "fingerprint/1");
        assertNotEquals(a, b);
    }

    @Test
    public void unSdkDiversoNonELaStessaIdentita() {
        TalosLocalProfileIdentity a = riferimento();
        TalosLocalProfileIdentity b = new TalosLocalProfileIdentity(
                "b419-dc72703", "d854adc23e311c53", 1_282_439_264L, 35, "fingerprint/1");
        assertNotEquals(a, b);
    }

    @Test
    public void unBuildFingerprintDiversoNonELaStessaIdentita() {
        TalosLocalProfileIdentity a = riferimento();
        TalosLocalProfileIdentity b = new TalosLocalProfileIdentity(
                "b419-dc72703", "d854adc23e311c53", 1_282_439_264L, 36, "fingerprint/2");
        assertNotEquals("un aggiornamento OTA invalida il profilo — è il caso che questo campo esiste per coprire",
                a, b);
    }

    /** Null non deve mai far esplodere equals/hashCode — un campo assente è un campo, non un crash. */
    @Test
    public void campiNulliDiventanoStringheVuoteNonEccezioni() {
        TalosLocalProfileIdentity a = new TalosLocalProfileIdentity(null, null, 0L, 0, null);
        TalosLocalProfileIdentity b = new TalosLocalProfileIdentity("", "", 0L, 0, "");
        assertEquals("null e stringa vuota devono normalizzare allo stesso valore", a, b);
    }

    @Test
    public void profiliNelloStessoPuntoSonoLoStessoPunto() {
        TalosLocalProfile a = new TalosLocalProfile(
                riferimento(), TalosBackendChoice.OPENCL, "GPUOpenCL",
                TalosBackendChoice.Outcome.CORRECT, 11_000L, 1_000L, TalosLocalProfile.Level.Q1, 20.0);
        TalosLocalProfile b = new TalosLocalProfile(
                riferimento(), TalosBackendChoice.OPENCL, "GPUOpenCL",
                TalosBackendChoice.Outcome.CORRECT, 9_500L, 2_000L, TalosLocalProfile.Level.Q1, 20.0);
        assertTrue("stessa identità, stesso backend, stesso device — è la stessa prova rimisurata",
                a.samePlace(b));
    }

    @Test
    public void backendDiversoNonELoStessoPunto() {
        TalosLocalProfile cpu = new TalosLocalProfile(
                riferimento(), TalosBackendChoice.CPU, null,
                TalosBackendChoice.Outcome.CORRECT, 43_200L, 1_000L, TalosLocalProfile.Level.Q1, 20.0);
        TalosLocalProfile opencl = new TalosLocalProfile(
                riferimento(), TalosBackendChoice.OPENCL, "GPUOpenCL",
                TalosBackendChoice.Outcome.CORRECT, 11_000L, 1_000L, TalosLocalProfile.Level.Q1, 20.0);
        assertFalse(cpu.samePlace(opencl));
    }

    /** AL CONTRARIO: un device null e uno nominato, sotto lo stesso backend, non sono lo stesso punto. */
    @Test
    public void unDeviceNominatoNonELoStessoPuntoDiUnoAssente() {
        TalosLocalProfile senzaDevice = new TalosLocalProfile(
                riferimento(), TalosBackendChoice.OPENCL, null,
                TalosBackendChoice.Outcome.CORRECT, 11_000L, 1_000L, TalosLocalProfile.Level.Q1, 20.0);
        TalosLocalProfile conDevice = new TalosLocalProfile(
                riferimento(), TalosBackendChoice.OPENCL, "GPUOpenCL",
                TalosBackendChoice.Outcome.CORRECT, 11_000L, 1_000L, TalosLocalProfile.Level.Q1, 20.0);
        assertFalse(senzaDevice.samePlace(conDevice));
    }

    /**
     * P0-3: il LIVELLO non entra in samePlace() — un Q2 (deep lab) e un Q1
     * (product qualification) sulla stessa identità/backend/device restano
     * lo stesso punto fisico. Se non fosse così, un profilo di laboratorio
     * più recente non sostituirebbe mai un vecchio Q1, e TalosLocalProfileStore
     * accumulerebbe due giudizi vivi sulla stessa prova — esattamente quello
     * che record() esiste per impedire.
     */
    @Test
    public void livelliDiversiSulloStessoPuntoRestanoLoStessoPunto() {
        TalosLocalProfile daQ1 = new TalosLocalProfile(
                riferimento(), TalosBackendChoice.OPENCL, "GPUOpenCL",
                TalosBackendChoice.Outcome.CORRECT, 11_000L, 1_000L, TalosLocalProfile.Level.Q1, 20.0);
        TalosLocalProfile daQ2 = new TalosLocalProfile(
                riferimento(), TalosBackendChoice.OPENCL, "GPUOpenCL",
                TalosBackendChoice.Outcome.CORRECT, 10_800L, 2_000L, TalosLocalProfile.Level.Q2, 20.0);
        assertTrue("il livello descrive CHI ha misurato, non DOVE — non fa parte del punto",
                daQ1.samePlace(daQ2));
    }
}
