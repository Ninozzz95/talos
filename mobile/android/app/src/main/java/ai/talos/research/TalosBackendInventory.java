package ai.talos.research;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * L'inventario dei backend ggml — la metà che LEGGE, in Java puro.
 *
 * ⛔ SOLO RICERCA. Niente qui decide cosa fa l'app a un utente: serve a
 * qualificare un backend prima ancora di sapere se ne vale la pena. La politica
 * di produzione resta in {@code TalosBackendChoice}, e non la tocchiamo finché
 * non ci sono i numeri di PP/TG/TTFT che dicono se una misura sola basta.
 *
 * ⛔⛔ PERCHÉ NON SI INDOVINA IL DISPOSITIVO.
 *
 * Con OpenCL e Vulkan caricati insieme, «usa la GPU» non è un'istruzione: è una
 * lotteria decisa dall'ordine con cui le librerie native si sono caricate. Il
 * motore accetta una lista ESPLICITA di dispositivi
 * ({@code llama_model_params.devices}), e l'unica chiave che quella lista
 * capisce è il NOME CANONICO che il backend dichiara di sé.
 *
 * ⇒ Questa classe non offre un metodo «prendi la prima GPU». Offre l'elenco di
 * ciò che c'è, e la risoluzione per nome. Un chiamante che vuole un
 * dispositivo deve saperlo NOMINARE, e l'artifact di misura registra quel nome.
 *
 * ⛔ E LA CPU NON È UN BERSAGLIO DI OFFLOAD. Non è una nostra convenzione: è il
 * contratto di llama.cpp, misurato nella sorgente che spediamo —
 * {@code common/arg.cpp} rifiuta con «invalid device» qualunque nome risolva a
 * un dispositivo di tipo CPU. La CPU resta comunque disponibile allo scheduler
 * come ripiego per le operazioni che l'acceleratore non regge; semplicemente
 * non si mette nella lista.
 */
public final class TalosBackendInventory {

    /** Il tipo che llama.cpp rifiuta come bersaglio di offload. */
    public static final String TYPE_CPU = "CPU";

    private final List<Registry> registries;

    private TalosBackendInventory(List<Registry> registries) {
        this.registries = registries;
    }

    /** Un registry ggml — «CPU», «OpenCL», «Vulkan» — e i suoi dispositivi. */
    public static final class Registry {
        public final String name;
        public final List<Device> devices;

        Registry(String name, List<Device> devices) {
            this.name = name;
            this.devices = devices;
        }
    }

    /**
     * Un dispositivo, come lo descrive {@code ggml_backend_dev_get_props}.
     *
     * ⛔ Le capacità sono QUATTRO. La struttura di questa build del motore ne
     * dichiara quattro, e un quinto campo inventato qui sarebbe un {@code false}
     * con l'aria di una misura.
     */
    public static final class Device {
        public final String name;
        public final String description;
        public final String type;
        /** {@code null} quando il backend non espone un identificativo. */
        public final String deviceId;
        public final long memoryFree;
        public final long memoryTotal;
        public final boolean async;
        public final boolean hostBuffer;
        public final boolean bufferFromHostPtr;
        public final boolean events;
        /** Il registry che lo espone: due backend possono chiamarli uguale. */
        public final String registry;

        Device(String registry, String name, String description, String type, String deviceId,
               long memoryFree, long memoryTotal,
               boolean async, boolean hostBuffer, boolean bufferFromHostPtr, boolean events) {
            this.registry = registry;
            this.name = name;
            this.description = description;
            this.type = type;
            this.deviceId = deviceId;
            this.memoryFree = memoryFree;
            this.memoryTotal = memoryTotal;
            this.async = async;
            this.hostBuffer = hostBuffer;
            this.bufferFromHostPtr = bufferFromHostPtr;
            this.events = events;
        }

        /** Vero se llama.cpp accetterebbe questo nome in una lista di offload. */
        public boolean canOffload() {
            return !TYPE_CPU.equals(type);
        }
    }

    /**
     * Legge l'inventario prodotto dal nativo.
     *
     * ⛔ Un JSON illeggibile NON diventa un inventario vuoto. Un inventario
     * vuoto è una risposta legittima — «nessun backend registrato» — e
     * confonderla con «non ho saputo leggere» è il modo in cui una corsa senza
     * acceleratore si racconta come una corsa con acceleratore assente.
     *
     * @throws IllegalArgumentException se il testo non è l'inventario atteso.
     */
    public static TalosBackendInventory parse(String json) {
        if (json == null || json.isEmpty()) {
            throw new IllegalArgumentException("inventario assente");
        }
        try {
            JSONObject root = new JSONObject(json);
            JSONArray raw = root.optJSONArray("registries");
            if (raw == null) {
                throw new IllegalArgumentException("inventario senza `registries`");
            }
            List<Registry> registries = new ArrayList<>(raw.length());
            for (int index = 0; index < raw.length(); index += 1) {
                registries.add(registryOf(raw.getJSONObject(index)));
            }
            return new TalosBackendInventory(registries);
        } catch (JSONException problem) {
            throw new IllegalArgumentException("inventario non leggibile: " + problem.getMessage());
        }
    }

    private static Registry registryOf(JSONObject entry) throws JSONException {
        String name = entry.optString("name", "");
        JSONArray raw = entry.optJSONArray("devices");
        List<Device> devices = new ArrayList<>(raw == null ? 0 : raw.length());
        for (int index = 0; raw != null && index < raw.length(); index += 1) {
            JSONObject described = raw.getJSONObject(index);
            JSONObject caps = described.optJSONObject("caps");
            devices.add(new Device(
                    name,
                    described.optString("name", ""),
                    described.optString("description", ""),
                    described.optString("type", "unknown"),
                    // `optString` restituirebbe la STRINGA "null" per un null
                    // JSON: chiedere prima a `isNull` è la differenza fra «non
                    // c'è» e un identificativo di quattro lettere.
                    described.isNull("deviceId") ? null : described.optString("deviceId", null),
                    described.optLong("memoryFree", 0L),
                    described.optLong("memoryTotal", 0L),
                    caps != null && caps.optBoolean("async", false),
                    caps != null && caps.optBoolean("hostBuffer", false),
                    caps != null && caps.optBoolean("bufferFromHostPtr", false),
                    caps != null && caps.optBoolean("events", false)));
        }
        return new Registry(name, devices);
    }

    public List<Registry> registries() {
        return registries;
    }

    /** I nomi dei registry, nell'ordine in cui il motore li ha elencati. */
    public List<String> registryNames() {
        List<String> names = new ArrayList<>(registries.size());
        for (Registry registry : registries) names.add(registry.name);
        return names;
    }

    /** Tutti i dispositivi di tutti i registry. */
    public List<Device> devices() {
        List<Device> all = new ArrayList<>();
        for (Registry registry : registries) all.addAll(registry.devices);
        return all;
    }

    /**
     * I dispositivi che llama.cpp accetterebbe come bersaglio di offload —
     * cioè tutti tranne quelli di tipo CPU.
     */
    public List<Device> offloadDevices() {
        List<Device> targets = new ArrayList<>();
        for (Device device : devices()) {
            if (device.canOffload()) targets.add(device);
        }
        return targets;
    }

    /** Vero se un registry con questo nome è presente. Confronto senza maiuscole. */
    public boolean hasRegistry(String name) {
        if (name == null) return false;
        for (Registry registry : registries) {
            if (registry.name.equalsIgnoreCase(name)) return true;
        }
        return false;
    }

    /**
     * Il dispositivo che si chiama esattamente così, o {@code null}.
     *
     * ⛔ Confronto ESATTO e sensibile alle maiuscole: questo nome viene
     * rimesso in {@code ggml_backend_dev_by_name}, che confronta byte a byte.
     * Accettare qui una variante che il motore poi rifiuta sposterebbe il
     * guasto dal punto in cui si può spiegare a uno in cui sembra un'assenza
     * di dispositivo.
     */
    public Device deviceNamed(String name) {
        if (name == null) return null;
        for (Device device : devices()) {
            if (device.name.equals(name)) return device;
        }
        return null;
    }

    /**
     * I dispositivi di offload esposti da un registry, per nome del registry.
     *
     * È l'elenco fra cui SCEGLIE una persona o uno script di misura, non una
     * scelta automatica: vedi la nota in testa alla classe.
     */
    public List<Device> offloadDevicesOfRegistry(String registryName) {
        List<Device> targets = new ArrayList<>();
        if (registryName == null) return targets;
        for (Device device : offloadDevices()) {
            if (device.registry.equalsIgnoreCase(registryName)) targets.add(device);
        }
        return targets;
    }

    /**
     * Una riga per dispositivo, per il log e per l'occhio umano.
     *
     * Serve a rendere leggibile un artifact: chi rilegge una corsa fra sei mesi
     * deve poter vedere quale hardware c'era senza aprire il JSON.
     */
    public String describe() {
        StringBuilder text = new StringBuilder();
        for (Registry registry : registries) {
            for (Device device : registry.devices) {
                if (text.length() > 0) text.append('\n');
                text.append(String.format(Locale.ROOT,
                        "%s/%s [%s] %s free=%d total=%d",
                        registry.name, device.name, device.type,
                        device.description, device.memoryFree, device.memoryTotal));
            }
            if (registry.devices.isEmpty()) {
                if (text.length() > 0) text.append('\n');
                text.append(registry.name).append("/(nessun dispositivo)");
            }
        }
        return text.toString();
    }
}
