package ai.talos.research;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertThrows;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

import java.util.List;

/**
 * L'inventario dei backend, provato senza dispositivo.
 *
 * Le regole che difende non sono di forma: sono il contratto di llama.cpp letto
 * nella sorgente che spediamo. Un dispositivo di tipo CPU non è un bersaglio di
 * offload; un nome si risolve ESATTO; e un JSON illeggibile non è un telefono
 * senza acceleratori.
 */
public class TalosBackendInventoryTest {

    /** Due registry, tre dispositivi: la forma che il Pad produce davvero. */
    private static final String DUE_REGISTRY =
            "{\"registries\":["
            + "{\"name\":\"OpenCL\",\"devices\":[{"
            + "\"name\":\"GPUOpenCL0\",\"description\":\"QUALCOMM Adreno(TM) 830\","
            + "\"type\":\"GPU\",\"deviceId\":null,\"memoryFree\":0,\"memoryTotal\":0,"
            + "\"caps\":{\"async\":false,\"hostBuffer\":true,"
            + "\"bufferFromHostPtr\":false,\"events\":false}}]},"
            + "{\"name\":\"CPU\",\"devices\":[{"
            + "\"name\":\"CPU\",\"description\":\"aarch64\","
            + "\"type\":\"CPU\",\"deviceId\":null,\"memoryFree\":12,\"memoryTotal\":34,"
            + "\"caps\":{\"async\":false,\"hostBuffer\":false,"
            + "\"bufferFromHostPtr\":true,\"events\":false}}]}]}";

    @Test
    public void leggeRegistryEDispositivi() {
        TalosBackendInventory inventory = TalosBackendInventory.parse(DUE_REGISTRY);

        assertEquals(List.of("OpenCL", "CPU"), inventory.registryNames());
        assertEquals(2, inventory.devices().size());
        assertTrue(inventory.hasRegistry("OpenCL"));
        // Il nome del registry si confronta senza maiuscole: llama.cpp scrive
        // «OpenCL», la riga di comando di chi misura scriverà «opencl».
        assertTrue(inventory.hasRegistry("opencl"));
        assertFalse(inventory.hasRegistry("Vulkan"));
    }

    @Test
    public void laCpuNonEUnBersaglioDiOffload() {
        TalosBackendInventory inventory = TalosBackendInventory.parse(DUE_REGISTRY);

        List<TalosBackendInventory.Device> targets = inventory.offloadDevices();
        assertEquals(1, targets.size());
        assertEquals("GPUOpenCL0", targets.get(0).name);

        // E il verso contrario, che è quello che conta: il dispositivo CPU
        // ESISTE nell'inventario — semplicemente non si offre come bersaglio.
        assertNotNull(inventory.deviceNamed("CPU"));
        assertFalse(inventory.deviceNamed("CPU").canOffload());
        assertTrue(inventory.deviceNamed("GPUOpenCL0").canOffload());
    }

    @Test
    public void ilNomeSiRisolveEsatto() {
        TalosBackendInventory inventory = TalosBackendInventory.parse(DUE_REGISTRY);

        assertNotNull(inventory.deviceNamed("GPUOpenCL0"));
        // ⛔ Questo nome torna dentro `ggml_backend_dev_by_name`, che confronta
        // byte a byte. Accettarlo qui in una forma che il motore rifiuta
        // sposterebbe il guasto dove non si spiega più.
        assertNull(inventory.deviceNamed("gpuopencl0"));
        assertNull(inventory.deviceNamed("GPUOpenCL"));
        assertNull(inventory.deviceNamed(null));
    }

    @Test
    public void unDeviceIdAssenteResta_null_enonLaParola() {
        TalosBackendInventory inventory = TalosBackendInventory.parse(DUE_REGISTRY);

        // `optString` su un null JSON restituisce la stringa "null": quattro
        // lettere che in un artifact sembrano un identificativo.
        assertNull(inventory.deviceNamed("GPUOpenCL0").deviceId);
    }

    @Test
    public void unDeviceIdPresenteSiLegge() {
        TalosBackendInventory inventory = TalosBackendInventory.parse(
                "{\"registries\":[{\"name\":\"Vulkan\",\"devices\":[{"
                + "\"name\":\"Vulkan0\",\"description\":\"Adreno\",\"type\":\"IGPU\","
                + "\"deviceId\":\"0000:c1:00.0\",\"memoryFree\":1,\"memoryTotal\":2,"
                + "\"caps\":{\"async\":true,\"hostBuffer\":true,"
                + "\"bufferFromHostPtr\":true,\"events\":true}}]}]}");

        TalosBackendInventory.Device device = inventory.deviceNamed("Vulkan0");
        assertEquals("0000:c1:00.0", device.deviceId);
        assertEquals("IGPU", device.type);
        // Una GPU integrata resta un bersaglio: il rifiuto riguarda il tipo
        // CPU, non «non è una scheda dedicata».
        assertTrue(device.canOffload());
        assertTrue(device.async);
        assertTrue(device.events);
    }

    @Test
    public void unRegistrySenzaDispositiviEUnFattoLegittimo() {
        // È il caso che smaschera «il backend si è registrato»: la libreria è
        // caricata, e dietro non c'è nessun dispositivo su cui girare.
        TalosBackendInventory inventory = TalosBackendInventory.parse(
                "{\"registries\":[{\"name\":\"OpenCL\",\"devices\":[]}]}");

        assertTrue(inventory.hasRegistry("OpenCL"));
        assertEquals(0, inventory.devices().size());
        assertEquals(0, inventory.offloadDevices().size());
        assertTrue(inventory.describe().contains("nessun dispositivo"));
    }

    @Test
    public void nessunRegistryEUnaRispostaValida() {
        TalosBackendInventory inventory = TalosBackendInventory.parse("{\"registries\":[]}");

        assertEquals(0, inventory.registries().size());
        assertEquals("", inventory.describe());
    }

    @Test
    public void unInventarioIlleggibileNonDiventaUnInventarioVuoto() {
        // ⛔ Il difetto che questo test tiene chiuso: se un JSON rotto tornasse
        // come inventario vuoto, una corsa in cui il nativo non ha risposto si
        // racconterebbe come «questo telefono non ha acceleratori» — e la
        // conclusione finirebbe in un artifact con l'aria di una misura.
        assertThrows(IllegalArgumentException.class,
                () -> TalosBackendInventory.parse("{\"registries\":"));
        assertThrows(IllegalArgumentException.class,
                () -> TalosBackendInventory.parse("{}"));
        assertThrows(IllegalArgumentException.class,
                () -> TalosBackendInventory.parse(""));
        assertThrows(IllegalArgumentException.class,
                () -> TalosBackendInventory.parse(null));
    }

    @Test
    public void iDispositviSiElencanoPerRegistry() {
        TalosBackendInventory inventory = TalosBackendInventory.parse(DUE_REGISTRY);

        assertEquals(1, inventory.offloadDevicesOfRegistry("OpenCL").size());
        // Il registry CPU espone un dispositivo, ma nessuno che si possa
        // nominare in una lista di offload.
        assertEquals(0, inventory.offloadDevicesOfRegistry("CPU").size());
        assertEquals(0, inventory.offloadDevicesOfRegistry("Vulkan").size());
        assertEquals(0, inventory.offloadDevicesOfRegistry(null).size());
    }

    @Test
    public void laDescrizioneNominaHardwareERegistry() {
        String described = TalosBackendInventory.parse(DUE_REGISTRY).describe();

        assertTrue(described.contains("OpenCL/GPUOpenCL0"));
        assertTrue(described.contains("QUALCOMM Adreno(TM) 830"));
        assertTrue(described.contains("[GPU]"));
        assertTrue(described.contains("CPU/CPU"));
    }
}
