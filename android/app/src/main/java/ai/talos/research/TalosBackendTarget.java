package ai.talos.research;

import java.util.ArrayList;
import java.util.List;

/**
 * Quale dispositivo, deciso in JAVA — dove si può provare senza un telefono.
 *
 * ⛔⛔ PERCHÉ NON STA NEL NATIVO. Il brief è esplicito: «Do not hide backend
 * selection inside JNI. The decision policy should remain testable as pure Java
 * logic.» La ragione non è di stile. Una regola sepolta in C++ si prova solo su
 * un dispositivo, con un modello caricato, dentro una corsa che dura minuti —
 * quindi in pratica non si prova, e le regole che non si provano si sfaldano
 * una condizione alla volta.
 *
 * Qui la decisione è una funzione pura: dato un inventario e una richiesta,
 * restituisce **un nome** o **un errore che dice perché**. Il nativo riceve un
 * nome già scelto e si limita a risolverlo, con la sua guardia difensiva.
 *
 * ⛔ E soprattutto: **qui non si indovina**. Non esiste «prendi la prima GPU».
 * Con OpenCL e Vulkan caricati insieme, quella comodità sarebbe una lotteria
 * decisa dall'ordine con cui le librerie native si sono caricate — e un
 * benchmark nato così misura un backend che nessuno ha scelto.
 */
public final class TalosBackendTarget {

    /** Nessuna richiesta: il motore sceglie da sé, come in produzione. */
    public static final String AUTO = "";

    /** Nessun offload, detto esplicitamente. Non è l'assenza di una scelta. */
    public static final String NONE = "none";

    private TalosBackendTarget() {}

    /** L'esito: o un bersaglio, o il motivo per cui non c'è. */
    public static final class Resolution {
        /**
         * Cosa passare a {@code nativeOpenTargeted} come {@code backendName}:
         * {@link #AUTO} oppure {@link #NONE}, o il nome del registry.
         */
        public final String backend;
        /** Il nome canonico del dispositivo, o vuoto. */
        public final String device;
        /** Il motivo del rifiuto, o {@code null} se la richiesta è valida. */
        public final String error;

        private Resolution(String backend, String device, String error) {
            this.backend = backend;
            this.device = device;
            this.error = error;
        }

        public boolean ok() {
            return error == null;
        }

        /** Una riga per l'artifact: cosa è stato chiesto e cosa ne è uscito. */
        @Override
        public String toString() {
            return ok()
                    ? "backend=" + (backend.isEmpty() ? "(auto)" : backend)
                        + " device=" + (device.isEmpty() ? "(nessuno)" : device)
                    : "rifiutata: " + error;
        }
    }

    private static Resolution buona(String backend, String device) {
        return new Resolution(backend, device, null);
    }

    private static Resolution rifiuto(String perche) {
        return new Resolution(AUTO, "", perche);
    }

    /**
     * Decide il bersaglio, o spiega perché non se ne può decidere uno.
     *
     * @param inventario ciò che il motore dice di avere. ⛔ Non può essere
     *     {@code null}: «non lo so» e «non c'è niente» sono due risposte
     *     diverse, e confonderle è il modo in cui una corsa senza acceleratore
     *     si racconta come una corsa con acceleratore assente.
     * @param backend vuoto = come oggi · {@code none}/{@code cpu} = nessun
     *     offload · altrimenti il nome di un registry, per esempio {@code OpenCL}.
     * @param dispositivo il nome canonico esatto, oppure vuoto.
     */
    public static Resolution resolve(TalosBackendInventory inventario,
                                     String backend, String dispositivo) {
        if (inventario == null) {
            throw new IllegalArgumentException("inventario assente: non è la stessa cosa di vuoto");
        }
        String quale = backend == null ? "" : backend.trim();
        String nome = dispositivo == null ? "" : dispositivo.trim();

        if (quale.isEmpty() && nome.isEmpty()) return buona(AUTO, "");

        if (quale.equalsIgnoreCase(NONE) || quale.equalsIgnoreCase("cpu")) {
            if (!nome.isEmpty()) {
                // Una richiesta che si contraddice non si "aggiusta" scegliendo
                // una delle due metà: si rifiuta, perché non si sa quale metà
                // chi l'ha scritta intendeva davvero.
                return rifiuto("`" + quale + "` non accetta un dispositivo (`" + nome + "`)");
            }
            return buona(NONE, "");
        }

        if (!nome.isEmpty()) {
            TalosBackendInventory.Device trovato = inventario.deviceNamed(nome);
            if (trovato == null) {
                return rifiuto("nessun dispositivo si chiama `" + nome + "`"
                        + elencoDisponibili(inventario));
            }
            if (!trovato.canOffload()) {
                // Non è una convenzione nostra: llama.cpp rifiuta con «invalid
                // device» qualunque nome che risolva a un dispositivo CPU.
                return rifiuto("`" + nome + "` è una CPU: non è un bersaglio di offload");
            }
            if (!quale.isEmpty() && !trovato.registry.equalsIgnoreCase(quale)) {
                // Un dispositivo giusto sotto il registry sbagliato è il modo in
                // cui una corsa etichettata «vulkan» finisce per misurare OpenCL.
                return rifiuto("`" + nome + "` sta sotto il registry `" + trovato.registry
                        + "`, non sotto `" + quale + "`");
            }
            return buona(trovato.registry, trovato.name);
        }

        // Solo il registry: si accetta unicamente se il dubbio non esiste.
        List<TalosBackendInventory.Device> candidati =
                inventario.offloadDevicesOfRegistry(quale);
        if (candidati.isEmpty()) {
            if (!inventario.hasRegistry(quale)) {
                return rifiuto("nessun registry si chiama `" + quale + "`"
                        + " (ci sono: " + String.join(", ", inventario.registryNames()) + ")");
            }
            return rifiuto("il registry `" + quale
                    + "` non espone dispositivi su cui fare offload");
        }
        if (candidati.size() > 1) {
            // ⛔ Il punto di tutta la classe. Scegliere qui sarebbe comodo, e
            // sarebbe la lotteria che si voleva togliere di mezzo.
            List<String> nomi = new ArrayList<>();
            for (TalosBackendInventory.Device uno : candidati) nomi.add(uno.name);
            return rifiuto("il registry `" + quale + "` espone " + candidati.size()
                    + " dispositivi (" + String.join(", ", nomi) + "): dinne uno");
        }
        return buona(candidati.get(0).registry, candidati.get(0).name);
    }

    /**
     * ⛔ Un errore che ELENCA. «Nessun dispositivo si chiama X» manda a
     * controllare la digitazione; lo stesso errore con accanto i nomi veri
     * chiude la domanda in una riga.
     */
    private static String elencoDisponibili(TalosBackendInventory inventario) {
        List<TalosBackendInventory.Device> bersagli = inventario.offloadDevices();
        if (bersagli.isEmpty()) return " (questo motore non espone nessun bersaglio di offload)";
        List<String> nomi = new ArrayList<>();
        for (TalosBackendInventory.Device uno : bersagli) {
            nomi.add(uno.registry + "/" + uno.name);
        }
        return " (ci sono: " + String.join(", ", nomi) + ")";
    }
}
