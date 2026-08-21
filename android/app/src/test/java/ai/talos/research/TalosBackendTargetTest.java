package ai.talos.research;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertThrows;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/**
 * La scelta del bersaglio, provata senza telefono — che è il punto.
 *
 * ⛔ Il brief lo chiede per nome: «the decision policy should remain testable as
 * pure Java logic». Ogni riga qui sotto è una regola che, se vivesse nel
 * nativo, si potrebbe provare solo con un modello caricato su un dispositivo
 * vero — cioè quasi mai.
 */
public class TalosBackendTargetTest {

    /** Un telefono con OpenCL (una GPU), Vulkan (due) e la CPU. */
    private static TalosBackendInventory ricco() {
        return TalosBackendInventory.parse(
                "{\"registries\":["
                + "{\"name\":\"OpenCL\",\"devices\":[{\"name\":\"GPUOpenCL0\","
                + "\"description\":\"Adreno 830\",\"type\":\"GPU\",\"deviceId\":null,"
                + "\"memoryFree\":1,\"memoryTotal\":2,\"caps\":{}}]},"
                + "{\"name\":\"Vulkan\",\"devices\":["
                + "{\"name\":\"Vulkan0\",\"description\":\"Adreno\",\"type\":\"IGPU\","
                + "\"deviceId\":null,\"memoryFree\":1,\"memoryTotal\":2,\"caps\":{}},"
                + "{\"name\":\"Vulkan1\",\"description\":\"Adreno secondaria\","
                + "\"type\":\"IGPU\",\"deviceId\":null,\"memoryFree\":1,\"memoryTotal\":2,"
                + "\"caps\":{}}]},"
                + "{\"name\":\"CPU\",\"devices\":[{\"name\":\"CPU\",\"description\":\"aarch64\","
                + "\"type\":\"CPU\",\"deviceId\":null,\"memoryFree\":1,\"memoryTotal\":2,"
                + "\"caps\":{}}]}]}");
    }

    /** Il Pad com'è oggi: una build senza acceleratori. */
    private static TalosBackendInventory soloCpu() {
        return TalosBackendInventory.parse(
                "{\"registries\":[{\"name\":\"CPU\",\"devices\":[{\"name\":\"CPU\","
                + "\"description\":\"CPU\",\"type\":\"CPU\",\"deviceId\":null,"
                + "\"memoryFree\":11998535680,\"memoryTotal\":11998535680,\"caps\":{}}]}]}");
    }

    // ————————————————— le richieste che passano —————————————————

    @Test
    public void nessunaRichiestaLasciaDecidereAlMotore() {
        TalosBackendTarget.Resolution esito =
                TalosBackendTarget.resolve(ricco(), "", "");

        assertTrue(esito.ok());
        assertEquals(TalosBackendTarget.AUTO, esito.backend);
        assertEquals("", esito.device);
    }

    @Test
    public void noneECpuDiconoLaStessaCosa() {
        for (String parola : new String[] { "none", "cpu", "CPU", "None" }) {
            TalosBackendTarget.Resolution esito =
                    TalosBackendTarget.resolve(ricco(), parola, "");
            assertTrue(parola + " rifiutata: " + esito.error, esito.ok());
            assertEquals(TalosBackendTarget.NONE, esito.backend);
            assertEquals("", esito.device);
        }
    }

    @Test
    public void unNomeEsattoSiRisolveEPortaConSeIlSuoRegistry() {
        TalosBackendTarget.Resolution esito =
                TalosBackendTarget.resolve(ricco(), "", "GPUOpenCL0");

        assertTrue(esito.ok());
        assertEquals("OpenCL", esito.backend);
        assertEquals("GPUOpenCL0", esito.device);
    }

    @Test
    public void unRegistroConUNSOLODispositivoNonHaAmbiguita() {
        TalosBackendTarget.Resolution esito =
                TalosBackendTarget.resolve(ricco(), "OpenCL", "");

        assertTrue(esito.ok());
        assertEquals("GPUOpenCL0", esito.device);
    }

    // ————————————————— le richieste che DEVONO fallire —————————————————

    /**
     * ⛔ IL TEST CHE GIUSTIFICA LA CLASSE.
     *
     * Vulkan espone due dispositivi. Sceglierne uno sarebbe comodo, e sarebbe
     * la lotteria che tutto questo lavoro esiste per togliere di mezzo: la
     * scelta la deciderebbe l'ordine di caricamento delle librerie, e il
     * benchmark misurerebbe un backend che nessuno ha scelto.
     */
    @Test
    public void unRegistryConDUEDispositiviRifiutaEDiceQUALI() {
        TalosBackendTarget.Resolution esito =
                TalosBackendTarget.resolve(ricco(), "Vulkan", "");

        assertFalse(esito.ok());
        assertTrue(esito.error, esito.error.contains("2 dispositivi"));
        // ⛔ E li ELENCA: un errore che non nomina le alternative costringe a
        // un secondo giro solo per scoprirle.
        assertTrue(esito.error, esito.error.contains("Vulkan0"));
        assertTrue(esito.error, esito.error.contains("Vulkan1"));
    }

    @Test
    public void laCpuNonEUnBersaglioDiOffload() {
        TalosBackendTarget.Resolution esito =
                TalosBackendTarget.resolve(ricco(), "", "CPU");

        assertFalse(esito.ok());
        assertTrue(esito.error, esito.error.contains("è una CPU"));
    }

    @Test
    public void unDispositivoSottoIlRegistrySbagliatoVieneRifiutato() {
        // È il modo esatto in cui una corsa etichettata «vulkan» finirebbe per
        // misurare OpenCL, e il file dei risultati non lo direbbe.
        TalosBackendTarget.Resolution esito =
                TalosBackendTarget.resolve(ricco(), "Vulkan", "GPUOpenCL0");

        assertFalse(esito.ok());
        assertTrue(esito.error, esito.error.contains("OpenCL"));
        assertTrue(esito.error, esito.error.contains("Vulkan"));
    }

    @Test
    public void unNomeInesistenteRifiutaEDiceCosaCE() {
        TalosBackendTarget.Resolution esito =
                TalosBackendTarget.resolve(ricco(), "", "NonEsiste");

        assertFalse(esito.ok());
        assertTrue(esito.error, esito.error.contains("nessun dispositivo si chiama"));
        assertTrue(esito.error, esito.error.contains("GPUOpenCL0"));
    }

    @Test
    public void noneConUnDispositivoSiContraddiceENonSiAggiusta() {
        TalosBackendTarget.Resolution esito =
                TalosBackendTarget.resolve(ricco(), "none", "GPUOpenCL0");

        assertFalse(esito.ok());
        assertTrue(esito.error, esito.error.contains("non accetta un dispositivo"));
    }

    @Test
    public void unRegistryAssenteRifiutaEDiceQualiCiSono() {
        TalosBackendTarget.Resolution esito =
                TalosBackendTarget.resolve(soloCpu(), "Vulkan", "");

        assertFalse(esito.ok());
        assertTrue(esito.error, esito.error.contains("nessun registry si chiama"));
        assertTrue(esito.error, esito.error.contains("CPU"));
    }

    /**
     * Il caso del Pad di oggi: il registry CPU c'è, ma non offre bersagli.
     *
     * ⛔ È un messaggio DIVERSO da «il registry non esiste», e la differenza
     * conta: uno dice «hai sbagliato nome», l'altro «questa build non ha
     * l'acceleratore compilato dentro».
     */
    @Test
    public void unRegistrySenzaBersagliDiceUnAltraCosa() {
        TalosBackendTarget.Resolution esito =
                TalosBackendTarget.resolve(soloCpu(), "CPU_REGISTRY_FINTO", "");
        assertFalse(esito.ok());

        TalosBackendInventory openclVuoto = TalosBackendInventory.parse(
                "{\"registries\":[{\"name\":\"OpenCL\",\"devices\":[]}]}");
        TalosBackendTarget.Resolution altro =
                TalosBackendTarget.resolve(openclVuoto, "OpenCL", "");
        assertFalse(altro.ok());
        assertTrue(altro.error, altro.error.contains("non espone dispositivi"));
    }

    @Test
    public void unInventarioAssenteNonEUnInventarioVuoto() {
        // ⛔ «Non lo so» e «non c'è niente» sono due risposte diverse.
        assertThrows(IllegalArgumentException.class,
                () -> TalosBackendTarget.resolve(null, "OpenCL", ""));
    }

    @Test
    public void gliSpaziIntornoAlNomeNonCambianoLaRichiesta() {
        TalosBackendTarget.Resolution esito =
                TalosBackendTarget.resolve(ricco(), "  OpenCL  ", "  GPUOpenCL0  ");
        assertTrue(esito.error, esito.ok());
        assertEquals("GPUOpenCL0", esito.device);
    }
}
