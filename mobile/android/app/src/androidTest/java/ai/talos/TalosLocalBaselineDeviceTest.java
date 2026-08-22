package ai.talos;

import static org.junit.Assert.assertNotEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import android.content.Context;
import android.os.BatteryManager;
import android.content.Intent;
import android.content.IntentFilter;
import android.util.Log;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import org.json.JSONObject;
import org.junit.Assume;
import org.junit.Test;
import org.junit.runner.RunWith;

import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;

import ai.talos.research.TalosBackendInventory;
import ai.talos.research.TalosBackendTarget;

/**
 * ⛔ SOLO RICERCA — il PAVIMENTO C0: la CPU, misurata come si deve.
 *
 * È il riferimento contro cui ogni acceleratore andrà confrontato, e per questo
 * conta più di qualunque numero che verrà dopo: un pavimento misurato male
 * rende falsa ogni conclusione costruita sopra.
 *
 * ⛔⛔ TRE COSE CHE QUESTO TEST FA, E CHE UN BENCHMARK INGENUO NON FA.
 *
 * <ol>
 *   <li><b>Apre con {@code none}, non con «niente».</b> La CPU è una decisione
 *       esplicita — lista dei dispositivi col solo terminatore — non l'assenza
 *       di una scelta. Il giorno in cui un acceleratore sarà presente, «nessuna
 *       richiesta» e «CPU» smetteranno di coincidere, e il riferimento dovrà
 *       essere questo.</li>
 *   <li><b>Separa prefill, primo token e decodifica.</b> Un solo
 *       {@code tokensPerSecond} non basta a scegliere un backend: un motore che
 *       vince la decodifica e perde il primo token è più lento per la persona
 *       che aspetta, e con un numero solo la differenza è invisibile.</li>
 *   <li><b>Spegne il riuso del prefisso.</b> Due giri con stati di prefisso
 *       diversi non sono confrontabili, e confrontarli attribuisce a un backend
 *       il merito di una cache. Ogni riga registra {@code reusedTokens} proprio
 *       perché si possa verificare che sia zero.</li>
 * </ol>
 *
 * ⛔ Le righe grezze si conservano tutte: mai solo una mediana. Una mediana
 * senza i giri che l'hanno prodotta non si può rileggere, e su un telefono la
 * dispersione È il dato.
 *
 * ⛔⛔ NON con {@code ./gradlew connectedDebugAndroidTest}: quel task
 * disinstalla l'app alla fine e si porta via i modelli e queste misure. Si
 * lancia con {@code node scripts/research/run-device-tests.mjs}.
 */
@RunWith(AndroidJUnit4.class)
public class TalosLocalBaselineDeviceTest {

    private static final String TAG = "TalosLocalBaseline";
    private static final String ARTIFACT_DIR = "research/local-backend";

    /** ⛔ Il brief ne chiede 5 come minimo, più uno di riscaldamento scartato. */
    private static final int GIRI_PREDEFINITI = 5;

    private static Context context() {
        return InstrumentationRegistry.getInstrumentation().getTargetContext();
    }

    private static int argomentoIntero(String nome, int predefinito) {
        String raw = InstrumentationRegistry.getArguments().getString(nome, "");
        if (raw == null || raw.isEmpty()) return predefinito;
        try {
            return Integer.parseInt(raw.trim());
        } catch (NumberFormatException storto) {
            return predefinito;
        }
    }

    // ————————————————— la fixture —————————————————

    private static final List<String> ostacoli = new ArrayList<>();

    private static void raccogli(File directory, List<File> into) {
        try (java.nio.file.DirectoryStream<java.nio.file.Path> stream =
                     java.nio.file.Files.newDirectoryStream(directory.toPath())) {
            for (java.nio.file.Path entry : stream) {
                File file = entry.toFile();
                if (file.isDirectory()) raccogli(file, into);
                else if (file.getName().endsWith(".gguf")) into.add(file);
            }
        } catch (java.nio.file.NoSuchFileException assente) {
            // Vuoto è un esito, non un guasto.
        } catch (Exception impedito) {
            ostacoli.add(directory.getAbsolutePath() + " → " + impedito);
        }
    }

    private static File fixture() {
        ostacoli.clear();
        String indicato = InstrumentationRegistry.getArguments().getString("talosModelPath", "");
        File model;
        if (indicato != null && !indicato.isEmpty()) {
            model = new File(indicato);
        } else {
            File root = context().getExternalFilesDir(null);
            List<File> trovati = new ArrayList<>();
            if (root != null) raccogli(new File(root, "models"), trovati);
            model = trovati.isEmpty() ? null : trovati.get(0);
        }
        for (String ostacolo : ostacoli) Log.w(TAG, "non leggibile: " + ostacolo);
        Assume.assumeTrue(
                ostacoli.isEmpty()
                        ? "nessun GGUF leggibile sotto files/models"
                        : "files/models non è leggibile dall'app: " + ostacoli,
                model != null && model.isFile());
        return model;
    }

    // ————————————————— lo stato del dispositivo —————————————————

    /**
     * ⛔ Lo stato PRIMA e DOPO, non solo prima.
     *
     * Una corsa che parte fredda e finisce a `severe` ha misurato due telefoni
     * diversi, e la media dei due non descrive nessuno dei due.
     */
    private static JSONObject statoDispositivo() throws Exception {
        Context context = context();
        JSONObject stato = new JSONObject();
        stato.put("thermal", TalosThermal.read(context) == null ? JSONObject.NULL
                : TalosThermal.read(context));

        Intent battery = context.registerReceiver(
                null, new IntentFilter(Intent.ACTION_BATTERY_CHANGED));
        if (battery != null) {
            int livello = battery.getIntExtra(BatteryManager.EXTRA_LEVEL, -1);
            int scala = battery.getIntExtra(BatteryManager.EXTRA_SCALE, -1);
            stato.put("batteryPercent", livello >= 0 && scala > 0 ? (livello * 100 / scala) : -1);
            int status = battery.getIntExtra(BatteryManager.EXTRA_STATUS, -1);
            stato.put("charging", status(status));
        }
        if (battery != null) {
            /*
             * ⛔ `thermal` ha TRE gradini — none/light/moderate — e una corsa
             * lunga li attraversa tutti restando dentro lo stesso gradino per
             * minuti. La temperatura della batteria e' il segnale CONTINUO, ed
             * e' quella che dice QUANDO la deriva e' cominciata invece che
             * soltanto che e' cominciata.
             */
            int decimi = battery.getIntExtra(BatteryManager.EXTRA_TEMPERATURE, Integer.MIN_VALUE);
            if (decimi != Integer.MIN_VALUE) stato.put("batteryTemperatureC", decimi / 10.0);
        }
        Runtime runtime = Runtime.getRuntime();
        stato.put("javaHeapUsedBytes", runtime.totalMemory() - runtime.freeMemory());
        return stato;
    }

    private static boolean status(int stato) {
        return stato == BatteryManager.BATTERY_STATUS_CHARGING
                || stato == BatteryManager.BATTERY_STATUS_FULL;
    }

    // ————————————————— gli artifact —————————————————

    private static File artifact(String name) throws Exception {
        File root = context().getExternalFilesDir(null);
        assertNotNull("external files dir assente", root);
        File directory = new File(root, ARTIFACT_DIR);
        if (!directory.exists() && !directory.mkdirs()) {
            throw new IllegalStateException("cartella artifact non creata: " + directory);
        }
        return new File(directory, name);
    }

    /** Una riga per giro, in coda. ⛔ Mai una mediana al posto dei giri. */
    private static void registra(JSONObject riga) throws Exception {
        File file = artifact("runs.jsonl");
        try (FileOutputStream out = new FileOutputStream(file, true)) {
            out.write((riga.toString() + "\n").getBytes(StandardCharsets.UTF_8));
        }
        Log.i(TAG, riga.toString());
    }

    // ————————————————— i prompt calibrati —————————————————

    /**
     * Un prompt che vale davvero N token su QUESTO tokenizzatore.
     *
     * ⛔ Non si stima a parole: si chiede al modello, si aggiunge, si richiede.
     * «PP512» con 380 token dentro è un'etichetta che mente, e mentirebbe in
     * modo diverso su ogni modello — cioè renderebbe incomparabili proprio i
     * confronti per cui esiste.
     */
    private static String promptDa(long handle, int token) {
        String[] parole = {
            "il", "telefono", "misura", "sé", "stesso", "mentre", "genera", "token",
            "e", "la", "differenza", "fra", "prefill", "decodifica", "conta", "molto",
            "perché", "chi", "aspetta", "guarda", "il", "primo", "carattere", "apparire",
        };
        StringBuilder testo = new StringBuilder();
        int indice = 0;
        int conteggio = 0;
        // Si cresce a blocchi e si verifica: chiedere il conteggio a ogni parola
        // costerebbe più della misura che stiamo preparando.
        while (conteggio < token) {
            for (int i = 0; i < 32; i += 1) {
                testo.append(parole[indice % parole.length]).append(' ');
                indice += 1;
            }
            conteggio = TalosLlamaNative.nativePromptTokens(handle, testo.toString());
            if (conteggio < 0) return testo.toString();
        }
        // Si taglia all'indietro fino a non superare il bersaglio.
        while (conteggio > token && testo.length() > 2) {
            int spazio = testo.lastIndexOf(" ", testo.length() - 2);
            if (spazio <= 0) break;
            testo.setLength(spazio + 1);
            conteggio = TalosLlamaNative.nativePromptTokens(handle, testo.toString());
        }
        return testo.toString();
    }

    /**
     * Il bersaglio di QUESTA campagna.
     *
     * ⛔ Vuoto = `none`, cioè la CPU per DECISIONE: è il pavimento C0 e resta il
     * predefinito. Con `talosBackend=OpenCL talosDevice=GPUOpenCL` la stessa
     * matrice si misura su un acceleratore, e ogni riga porta scritto su cosa.
     *
     * ⛔⛔ E porta scritto anche COSA NON È. Una misura presa su una build
     * OpenCL al pin `d2f83055` **non qualifica** quel backend: il brief chiede
     * `60addddf`, la correzione della race WAR nei kernel Flash Attention, e
     * questo pin non ce l'ha. Il campo `candidate` dice `C0-explore` proprio
     * perché nessuno la scambi per C1 rileggendo il file fra sei mesi.
     */
    private static String backendRichiesto() {
        String scelto = InstrumentationRegistry.getArguments().getString("talosBackend", "");
        return scelto == null || scelto.isEmpty() ? "none" : scelto;
    }

    /**
     * ⛔⛔ FLASH ATTENTION — e su questa GPU non è una manopola qualsiasi.
     *
     * MISURATO il 2026-08-20 sul Pad: al PRIMO grafo di ogni processo ggml-opencl
     * compila i kernel di Flash Attention uno per uno, e lo dice —
     * `ggml_opencl: lazy-compiling flash_attn prepass for DK=128 DV=128`. La
     * finestra fra quella riga e il primo prompt è **5.845 ms**, sette
     * compilazioni, e quattro dei kernel prodotti vengono poi SCARTATI perché
     * l'Adreno 830 dichiara `per-kernel max 128 < required 192`.
     *
     * ⛔ E quei programmi NON finiscono nella cache su disco: i `.clbin`
     * restano 181 prima e dopo. ⇒ Ogni processo ripaga i 5,8 secondi, e per
     * questo la cache calda non toglieva l'anomalia del primo giro.
     *
     * Valori: `default` · `off` · `auto` · `on`.
     */
    private static String modalitaFa() {
        String scelto = InstrumentationRegistry.getArguments().getString("talosFlashAttn", "");
        return scelto == null || scelto.isEmpty() ? "default" : scelto;
    }

    private static String deviceRichiesto() {
        String scelto = InstrumentationRegistry.getArguments().getString("talosDevice", "");
        return scelto == null ? "" : scelto;
    }

    /**
     * P1-4 — il tipo di cache KV, oggi cablato su `"f16"` in ogni apertura di
     * questo banco: la matrice FA×KV del piano sorgente (O7/O12) non era
     * misurabile senza questa manopola.
     *
     * ⛔ Solo `f16`/`q8_0`: verificato nel sorgente nativo
     * (`talos_llama_jni.cpp`) che `q4_0` non esiste come ramo — qualunque
     * stringa diversa da `"q8_0"` cade silenziosamente su `f16`. Aggiungere
     * `q4_0` è lavoro nativo nuovo (§12.4 del piano: alcuni compilatori
     * Adreno A7x più vecchi vanno in crash su varianti FA q4/q8 miste), non
     * questo blocco.
     */
    private static String kvRichiesto() {
        String scelto = InstrumentationRegistry.getArguments().getString("talosKvType", "");
        return "q8_0".equals(scelto) ? "q8_0" : "f16";
    }

    /** Quanti strati spostare. ⛔ Su CPU deve restare 0. */
    private static int stratiSuGpu() {
        return "none".equals(backendRichiesto()) ? 0 : argomentoIntero("talosGpuLayers", -1);
    }

    /**
     * Il microbatch — il batch FISICO, quanti token entrano in un lancio.
     *
     * ⛔⛔ NON è una manopola di comodo: su Adreno è la variabile che decide se
     * il backend Vulkan sopravvive.
     *
     * MISURATO il 2026-08-20 sul Pad: con microbatch 256 il processo muore al
     * primo grafo di calcolo — `vk::Queue::submit` perde il device e il driver
     * Adreno segmenta dentro `vkGetDeviceFaultInfoEXT`. E non è una nostra
     * stranezza: upstream ha DUE issue aperti che descrivono lo stesso guasto
     * sulla stessa famiglia di GPU —
     *
     *   #8743  Adreno 750 (OnePlus): batch >= 33 → vk::DeviceLostError
     *   #12139 Adreno 732:            batch  > 32 → idem
     *
     * — entrambi «open», «unconfirmed», senza causa e senza cura. Il segnalatore
     * di #8743 aggiunge la cosa che rende l'ipotesi verificabile: «I also tried
     * submitting the operator one by one … and it succeeded».
     *
     * ⇒ 0 lascia decidere al motore, come in produzione. Un valore esplicito
     * serve a trovare la soglia di QUESTA GPU, che nessuno dei due issue ha.
     */
    private static int microBatch() {
        return argomentoIntero("talosMicroBatch", 0);
    }

    /**
     * P0-1, SOLO RICERCA — `talosCacheDebug=1` accende il trace HIT/MISS/SAVE
     * della cache dei binari OpenCL. Assente di default: un log per kernel
     * (181 su Qwen3-1.7B, misurato) è rumore fuori da una campagna dedicata a
     * misurare esattamente quello.
     */
    private static boolean cacheDebugRichiesto() {
        return "1".equals(InstrumentationRegistry.getArguments().getString("talosCacheDebug", ""));
    }

    /**
     * P0-1, SOLO RICERCA — `talosCacheOff=1` è il CONTROLLO dell'esperimento:
     * spegne la cache per questo processo, così ogni kernel ricompila sempre.
     * Serve a provare che il guadagno misurato con la cache accesa viene
     * davvero da lei.
     */
    private static boolean cacheOffRichiesto() {
        return "1".equals(InstrumentationRegistry.getArguments().getString("talosCacheOff", ""));
    }

    private static long apriCpu(File model, int contesto, int thread) {
        if (cacheDebugRichiesto()) {
            TalosLlamaNative.nativeEnableOpenClCacheDebugTraceForResearch();
        }
        if (cacheOffRichiesto()) {
            TalosLlamaNative.nativeDisableOpenClCacheForResearch();
        }
        /*
         * ⛔ Prima si CHIEDE ALLA POLITICA, e non è cerimonia.
         *
         * MISURATO il 2026-08-20: una corsa etichettata `OpenCL/GPUOpenCL` è
         * morta con `backend-target` e basta. Il codice era giusto: sul telefono
         * c'era installata la build SENZA OpenCL, perché un `assembleDebug`
         * nudo aveva sovrascritto lo stesso `app-debug.apk`. Il messaggio non
         * distingueva «hai sbagliato nome» da «questa build non ha
         * l'acceleratore compilato dentro», che sono due guasti in due posti
         * diversi.
         */
        TalosBackendTarget.Resolution decisa = TalosBackendTarget.resolve(
                TalosBackendInventory.parse(TalosLlamaNative.nativeBackendInventory()),
                backendRichiesto(), deviceRichiesto());
        assertTrue("il bersaglio chiesto non esiste su questa build: " + decisa.error
                        + "\n   ⇒ ricostruisci con -PtalosResearchBackend=<backend>: un "
                        + "`assembleDebug` nudo sovrascrive lo stesso app-debug.apk",
                decisa.ok());

        long handle = TalosLlamaNative.nativeOpenTargeted(
                model.getAbsolutePath(), thread, contesto, stratiSuGpu(), true, thread, microBatch(),
                kvRichiesto(), backendRichiesto(), deviceRichiesto(), modalitaFa());
        assertNotEquals("apertura fallita su `" + backendRichiesto() + "/" + deviceRichiesto()
                        + "`: " + TalosLlamaNative.nativeLastOpenError(), 0L, handle);
        Log.i(TAG, "aperto su " + backendRichiesto()
                + (deviceRichiesto().isEmpty() ? "" : "/" + deviceRichiesto())
                + " · strati su GPU " + stratiSuGpu()
                + " · microbatch " + (microBatch() == 0 ? "(predefinito)" : microBatch())
                + " · kv " + kvRichiesto()
                + " · flash-attn " + modalitaFa());
        return handle;
    }

    private static void pronta() {
        assertTrue("libtalos_llama.so non è nell'APK", TalosLlamaNative.AVAILABLE);
        TalosLlamaNative.ensureReady(context());
    }

    // ————————————————— L0 / L1: il carico —————————————————

    /**
     * Quanto costa APRIRE, la prima volta e la seconda.
     *
     * ⛔ Non è un dettaglio di contorno: è la misura che ha già spiegato un
     * primo messaggio da 111 secondi, quando il modello veniva aperto due volte
     * senza che nessuno lo sapesse.
     */
    @Test
    public void c0Carico() throws Exception {
        pronta();
        File model = fixture();
        int thread = argomentoIntero("talosThreads", 4);

        JSONObject prima = statoDispositivo();
        for (int giro = 0; giro < 2; giro += 1) {
            long inizio = System.nanoTime();
            long handle = apriCpu(model, 4096, thread);
            long apertoMs = (System.nanoTime() - inizio) / 1_000_000L;

            JSONObject riga = intestazione(model, "load", thread, 4096);
            riga.put("phase", giro == 0 ? "L0" : "L1");
            riga.put("openMs", apertoMs);
            riga.put("opensSinceStart", TalosLlamaNative.nativeOpensSinceStart());
            riga.put("contextTokensEffective", TalosLlamaNative.nativeContextTokens(handle));
            riga.put("kvEffective", TalosLlamaNative.nativeKvCacheType(handle));
            riga.put("deviceBefore", prima);
            riga.put("deviceAfter", statoDispositivo());
            registra(riga);

            TalosLlamaNative.nativeClose(handle);
            assertTrue("apertura sospetta: " + apertoMs + " ms", apertoMs > 0);
        }
    }

    // ————————————————— PP / TG / TTFT —————————————————

    /**
     * Il prefill e la decodifica, separati — che è il punto.
     *
     * ⛔ Un giro di riscaldamento scartato e poi i giri veri. Il primo giro di
     * un processo paga cose che non si ripetono, e mescolarlo agli altri
     * sposta la mediana senza che si veda da dove.
     */
    @Test
    public void c0PrefillEDecodifica() throws Exception {
        pronta();
        File model = fixture();
        int thread = argomentoIntero("talosThreads", 4);
        int giri = argomentoIntero("talosRuns", GIRI_PREDEFINITI);
        int contesto = argomentoIntero("talosContext", 8192);
        int[] bersagli = bersagliDiPrefill(contesto);

        long handle = apriCpu(model, contesto, thread);
        try {
            for (int token : bersagli) {
                String prompt = promptDa(handle, token);
                int veri = TalosLlamaNative.nativePromptTokens(handle, prompt);
                Log.i(TAG, "PP" + token + ": prompt da " + veri + " token");

                // ⛔ Il riscaldamento si esegue e si BUTTA, e si dice che è
                // stato buttato: un giro scartato in silenzio è un giro che
                // qualcuno riscoprirà come discrepanza.
                misura(handle, model, prompt, veri, 8, thread, contesto, "PP" + token, -1);

                for (int giro = 0; giro < giri; giro += 1) {
                    misura(handle, model, prompt, veri, 8, thread, contesto,
                            "PP" + token, giro);
                }
            }

            // TG256: prompt corto, generazione lunga. Qui si misura la
            // decodifica, e il prefill deve pesare il meno possibile.
            String breve = promptDa(handle, 32);
            int veriBrevi = TalosLlamaNative.nativePromptTokens(handle, breve);
            misura(handle, model, breve, veriBrevi, 256, thread, contesto, "TG256", -1);
            for (int giro = 0; giro < giri; giro += 1) {
                misura(handle, model, breve, veriBrevi, 256, thread, contesto, "TG256", giro);
            }
        } finally {
            TalosLlamaNative.nativeClose(handle);
        }
    }

    /**
     * ⛔⛔ G5 — LA TENUTA NEL TEMPO, che nessuna corsa di oggi misurava.
     *
     * Tutte le altre misure di questo file durano fra i 15 secondi e i tre
     * minuti, e ognuna parte da un telefono freddo perche' altrimenti non si
     * confronta con niente. ⇒ Descrivono un telefono che NON esiste: quello di
     * una persona che fa una domanda sola e poi mette via il telefono.
     *
     * MISURATO il 2026-08-20, e per questo il test esiste: dentro UNA campagna
     * da tre blocchi il Pad e' passato da `Thermal Status: 0` a **2**, e i
     * numeri sono scesi del 25% a meta' blocco. La deriva non e' un'ipotesi da
     * manuale, e' successa mentre misuravo altro.
     *
     * Qui si tiene il motore acceso per N minuti e si registra un giro dopo
     * l'altro: prompt corto e generazione lunga, cioe' il regime in cui il
     * lavoro e' tutto decodifica e la GPU non riposa mai.
     *
     * ⛔ L'unica asserzione e' che il motore NON SI ROMPA: ogni giro deve
     * produrre token e testo. La deriva non ha una soglia inventata da me — si
     * registra, e il numero lo giudica chi decide. Un test che asserisce una
     * soglia che nessuno ha scelto trasforma un'opinione in un cancello.
     *
     * ⛔ NON e' nella corsa predefinita: dura dieci minuti e scalda il telefono
     * di qualcun altro. Si chiede per nome.
     */
    @Test
    public void c0TenutaNelTempo() throws Exception {
        /*
         * ⛔⛔ IL CANCELLO STA QUI, non nel commento sopra.
         *
         * Il javadoc diceva «si chiede per nome» e niente lo imponeva: chi
         * lancia l'intera classe — che e' esattamente cio' che il README
         * suggerisce — si sarebbe ritrovato dieci minuti di carico continuo e
         * un telefono caldo che non aveva chiesto. Una regola dichiarata e non
         * applicata e' una regola che non c'e'.
         *
         * ⇒ Senza `talosSustainedMinutes` esplicito il test si SALTA, e il
         * runner conta e nomina i salti: non passa per verde.
         */
        String chiesto = InstrumentationRegistry.getArguments()
                .getString("talosSustainedMinutes", "");
        Assume.assumeTrue(
                "G5 non parte da sola: dura minuti e scalda il telefono di qualcuno."
                        + "  Chiedila per nome, con  talosSustainedMinutes=10",
                chiesto != null && !chiesto.isEmpty());

        pronta();
        File model = fixture();
        int thread = argomentoIntero("talosThreads", 4);
        int contesto = argomentoIntero("talosContext", 8192);
        int minuti = argomentoIntero("talosSustainedMinutes", 10);
        int tokenPerGiro = argomentoIntero("talosSustainedTokens", 128);

        long handle = apriCpu(model, contesto, thread);
        List<Double> tassi = new ArrayList<>();
        try {
            String breve = promptDa(handle, 32);
            int veriBrevi = TalosLlamaNative.nativePromptTokens(handle, breve);
            Log.i(TAG, "G5: " + minuti + " minuti, " + tokenPerGiro
                    + " token per giro, prompt da " + veriBrevi + " token");

            final long partenza = System.nanoTime();
            final long durataNs = minuti * 60L * 1_000_000_000L;
            int giro = 0;
            while (System.nanoTime() - partenza < durataNs) {
                JSONObject prima = statoDispositivo();
                long inizio = System.nanoTime();
                String testo = TalosLlamaNative.nativeGenerate(
                        handle, breve, tokenPerGiro, false, false);
                long muroMs = (System.nanoTime() - inizio) / 1_000_000L;
                int prodotti = TalosLlamaNative.nativeTokensProduced(handle);

                // ⛔ Il verso contrario: un motore che si spegne sotto carico
                // restituirebbe vuoto, e un test che guarda solo la velocita'
                // lo leggerebbe come «velocissimo».
                assertTrue("giro " + giro + ": nessun token prodotto sotto carico prolungato",
                        prodotti > 0);
                assertTrue("giro " + giro + ": testo vuoto sotto carico prolungato",
                        testo != null && !testo.isEmpty());

                JSONObject riga = intestazione(model, "G5-tenuta", thread, contesto);
                riga.put("run", giro);
                riga.put("warmup", giro == 0);
                riga.put("elapsedMs", (System.nanoTime() - partenza) / 1_000_000L);
                riga.put("wallMs", muroMs);
                riga.put("promptTokensRequested", veriBrevi);
                riga.put("maxTokens", tokenPerGiro);
                riga.put("produced", prodotti);
                riga.put("emptyText", false);
                riga.put("deviceBefore", prima);
                riga.put("deviceAfter", statoDispositivo());

                String tempi = TalosLlamaNative.nativeLastTimings(handle);
                if (tempi != null && !tempi.isEmpty()) {
                    JSONObject dettaglio = new JSONObject(tempi);
                    riga.put("timings", dettaglio);
                    long primo = dettaglio.optLong("firstTokenMs", 0);
                    long totale = dettaglio.optLong("totalMs", 0);
                    int usciti = dettaglio.optInt("producedTokens", 0);
                    if (totale > primo && usciti > 0) {
                        double tasso = round(usciti * 1000.0 / (totale - primo));
                        riga.put("decodeTokensPerSecond", tasso);
                        // ⛔ Il giro 0 non entra nella deriva: e' il
                        // riscaldamento, e su OpenCL con la Flash Attention
                        // accesa vale da solo quattro secondi.
                        if (giro > 0) tassi.add(tasso);
                    }
                    riga.put("ttftMs", primo);
                    riga.put("reusedTokens", dettaglio.optInt("reusedTokens", -1));
                }
                registra(riga);
                giro += 1;
            }

            assertTrue("nessun giro completato in " + minuti + " minuti", giro > 1);

            /*
             * ⛔ Il riassunto confronta il PRIMO terzo col TERZO terzo, non il
             * primo giro con l'ultimo: due giri singoli agli estremi misurano
             * il rumore quanto la deriva.
             */
            JSONObject riassunto = intestazione(model, "G5-tenuta-summary", thread, contesto);
            riassunto.put("runs", tassi.size());
            riassunto.put("minutesRequested", minuti);
            if (tassi.size() >= 3) {
                int terzo = tassi.size() / 3;
                double primi = media(tassi.subList(0, terzo));
                double ultimi = media(tassi.subList(tassi.size() - terzo, tassi.size()));
                riassunto.put("firstThirdTokensPerSecond", round(primi));
                riassunto.put("lastThirdTokensPerSecond", round(ultimi));
                riassunto.put("driftPercent", primi > 0 ? round((ultimi - primi) * 100.0 / primi) : 0);
            }
            riassunto.put("deviceAfter", statoDispositivo());
            registra(riassunto);
            Log.i(TAG, "G5: " + tassi.size() + " giri misurati in " + minuti + " minuti");
        } finally {
            TalosLlamaNative.nativeClose(handle);
        }
    }

    private static double media(List<Double> valori) {
        double somma = 0;
        for (double v : valori) somma += v;
        return valori.isEmpty() ? 0 : somma / valori.size();
    }

    /**
     * I bersagli di prefill che il contesto regge davvero.
     *
     * ⛔ Chiedere PP8192 dentro un contesto da 8192 non misura il prefill: lo
     * fa fallire, o peggio lo fa riuscire troncando in silenzio. Si sceglie in
     * base a ciò che c'è, e si dichiara.
     */
    private static int[] bersagliDiPrefill(int contesto) {
        /*
         * ⛔⛔ E si possono CHIEDERE, invece di derivarli.
         *
         * MISURATO il 2026-08-20: la corsa PP8192 arriva al suo bersaglio dopo
         * aver gia' macinato 512 e 2048, cioe' con il telefono a
         * `Thermal Status: moderate`. ⇒ Il numero che ne esce mescola DUE cause
         * — la lunghezza del prompt e lo strozzamento termico — e separarle non
         * si puo' a posteriori: si rifa' la corsa con quel bersaglio SOLO, da
         * freddo.
         *
         * `talosPrefillTargets=8192` oppure `512,2048`. ⛔ Un bersaglio che il
         * contesto non regge viene SCARTATO e detto, non troncato in silenzio.
         */
        String chiesti = InstrumentationRegistry.getArguments().getString("talosPrefillTargets", "");
        if (chiesti != null && !chiesti.isEmpty()) {
            List<Integer> voluti = new ArrayList<>();
            for (String pezzo : chiesti.split(",")) {
                try {
                    int n = Integer.parseInt(pezzo.trim());
                    if (n <= contesto / 2) voluti.add(n);
                    else Log.w(TAG, "bersaglio " + n + " scartato: oltre meta' del contesto " + contesto);
                } catch (NumberFormatException storto) {
                    Log.w(TAG, "bersaglio non numerico, ignorato: " + pezzo);
                }
            }
            assertTrue("nessuno dei bersagli chiesti (" + chiesti + ") sta in un contesto da "
                            + contesto + ": meta' del contesto e' il tetto prudente",
                    !voluti.isEmpty());
            int[] fuori = new int[voluti.size()];
            for (int i = 0; i < fuori.length; i += 1) fuori[i] = voluti.get(i);
            Log.i(TAG, "bersagli di prefill CHIESTI: " + voluti);
            return fuori;
        }

        List<Integer> scelti = new ArrayList<>();
        for (int candidato : new int[] { 512, 2048, 8192 }) {
            // Metà del contesto è il tetto prudente: sopra, la generazione che
            // segue non avrebbe dove stare.
            if (candidato <= contesto / 2) scelti.add(candidato);
        }
        if (scelti.isEmpty()) scelti.add(Math.max(64, contesto / 4));
        int[] out = new int[scelti.size()];
        for (int i = 0; i < out.length; i += 1) out[i] = scelti.get(i);
        Log.i(TAG, "bersagli di prefill per contesto " + contesto + ": " + scelti);
        return out;
    }

    private void misura(long handle, File model, String prompt, int promptTokens,
                        int maxTokens, int thread, int contesto,
                        String configurazione, int giro) throws Exception {
        JSONObject prima = statoDispositivo();
        long inizio = System.nanoTime();
        // ⛔ `stopAtEndOfGeneration=false`: fermarsi quando il modello ha finito
        // misurerebbe quanto è loquace, non quanto è veloce il telefono.
        // ⛔ `reusePrefix=false`: due giri con stati diversi non si confrontano.
        String testo = TalosLlamaNative.nativeGenerate(handle, prompt, maxTokens, false, false);
        long muroMs = (System.nanoTime() - inizio) / 1_000_000L;

        JSONObject riga = intestazione(model, configurazione, thread, contesto);
        riga.put("run", giro);
        riga.put("warmup", giro < 0);
        riga.put("wallMs", muroMs);
        riga.put("promptTokensRequested", promptTokens);
        riga.put("maxTokens", maxTokens);
        riga.put("produced", TalosLlamaNative.nativeTokensProduced(handle));
        riga.put("emptyText", testo == null || testo.isEmpty());
        riga.put("deviceBefore", prima);
        riga.put("deviceAfter", statoDispositivo());

        // B2: il valore di riserva. Una riga senza tempi nativi leggibili non
        // ha nemmeno i campi che la renderebbero VALID - "non lo so" e' onesto,
        // "va tutto bene" non lo sarebbe.
        riga.put("validity", "UNKNOWN");

        String tempi = TalosLlamaNative.nativeLastTimings(handle);
        if (tempi != null && !tempi.isEmpty()) {
            JSONObject dettaglio = new JSONObject(tempi);
            riga.put("timings", dettaglio);
            // I due tassi che il brief vuole separati, calcolati qui una volta
            // sola così che nessuno li ricavi in modo diverso più tardi.
            long prefill = dettaglio.optLong("prefillMs", 0);
            long primo = dettaglio.optLong("firstTokenMs", 0);
            long totale = dettaglio.optLong("totalMs", 0);
            int nuovi = dettaglio.optInt("newTokens", 0);
            int prodotti = dettaglio.optInt("producedTokens", 0);
            if (prefill > 0 && nuovi > 0) {
                riga.put("promptTokensPerSecond", round(nuovi * 1000.0 / prefill));
            }
            if (totale > primo && prodotti > 0) {
                riga.put("decodeTokensPerSecond", round(prodotti * 1000.0 / (totale - primo)));
            }
            riga.put("ttftMs", primo);
            // ⛔ La prova che il prefisso non ha aiutato. Se un giorno non fosse
            // zero, ogni confronto costruito su queste righe sarebbe falso.
            int riusati = dettaglio.optInt("reusedTokens", -1);
            riga.put("reusedTokens", riusati);

            /*
             * B2 — lo stato cache VERO, non piu' la stringa costante "cold"
             * (mai calcolata, trovata cosi' da una ricerca dedicata prima di
             * questo blocco). Le quattro classi del piano sorgente (§5.3)
             * intrecciano DUE segnali: se il processo e' stato appena
             * aperto (nativeOpensSinceStart) e se il prefisso e' stato
             * riusato (reusedTokens). Il TERZO segnale del piano - la cache
             * dei binari OpenCL - non esiste ancora (arriva con P0-1): su
             * QUESTO file, che misura solo il pavimento CPU
             * (backendRichiesto()=="none"), quel terzo asse e' comunque
             * privo di senso - non c'e' nessuna compilazione OpenCL da
             * mettere in cache. C0 e C1 collassano nello stesso valore qui,
             * onestamente, non per pigrizia: la distinzione a cui servono
             * non si applica a un giro CPU.
             */
            boolean processoFreddo = TalosLlamaNative.nativeOpensSinceStart() <= 1;
            String statoCache = processoFreddo
                ? (riusati > 0 ? "C1" : "C0")
                : (riusati > 0 ? "C3" : "C2");
            riga.put("cacheState", statoCache);

            /*
             * B2 — la stessa domanda che B1 ha reso possibile rispondere:
             * la GPU che avevamo chiesto e' quella che il motore ha usato
             * DAVVERO? Letta dalla snapshot unificata (nativeRuntimeSnapshot,
             * B1) invece di un metodo nativo in piu' - lo stesso motivo per
             * cui esiste. `configMismatch` e' il caso che il piano sorgente
             * chiama CONFIG_MISMATCH (CR-01): un `gpuLayers` richiesto
             * diverso da zero che l'effettivo dice essere rimasto a zero -
             * la riga esatta che non deve MAI entrare in una mediana.
             *
             * ⛔ P1-4: lo stesso controllo, esteso al KV — trovato mancante
             * proprio mentre si costruiva la matrice FA×KV: un `q8_0`
             * richiesto che il motore avesse ripiegato su `f16` in silenzio
             * (il modello non lo regge, per esempio) sarebbe finito
             * indistinguibile da un vero `q8_0` nella stessa mediana. Stessa
             * classe di errore di CR-01, un campo diverso.
             */
            String snapshotJson = TalosLlamaNative.nativeRuntimeSnapshot(handle);
            if (snapshotJson != null) {
                JSONObject effettivo = new JSONObject(snapshotJson);
                riga.put("effectiveConfig", effettivo);
                int gpuLayersRichiesti = stratiSuGpu();
                int gpuLayersEffettivi = effettivo.optInt("gpuLayersEffective", 0);
                String kvEffettivo = effettivo.optString("kvCacheType", "f16");
                boolean discorda = (gpuLayersRichiesti != 0 && gpuLayersEffettivi == 0)
                        || !kvRichiesto().equals(kvEffettivo);
                riga.put("configMismatch", discorda);
                riga.put("validity", discorda ? "CONFIG_MISMATCH" : "VALID");
            } else {
                // ⛔ Nessuna snapshot leggibile non e' "va tutto bene": e'
                // "non lo so", e la regola su un dubbio e' non promuovere
                // mai una riga che non si puo' verificare a VALID.
                riga.put("validity", "UNKNOWN");
            }
        }
        registra(riga);
    }

    private static double round(double valore) {
        return Math.round(valore * 100.0) / 100.0;
    }

    private static JSONObject intestazione(File model, String configurazione,
                                           int thread, int contesto) throws Exception {
        JSONObject riga = new JSONObject();
        // ⛔ `C0` solo quando e' davvero il pavimento CPU. Su un
        // acceleratore diventa `C0-explore`: NON e' il candidato C1 del brief,
        // che richiede il pin con 60addddf.
        riga.put("candidate", "none".equals(backendRichiesto()) ? "C0" : "C0-explore");
        riga.put("backendRequested", backendRichiesto());
        riga.put("deviceRequested", deviceRichiesto());
        riga.put("gpuLayers", stratiSuGpu());
        riga.put("microBatch", microBatch());
        riga.put("flashAttn", modalitaFa());
        riga.put("config", configurazione);
        riga.put("engineBuild", TalosLlamaNative.nativeEngineBuild());
        riga.put("backendsFlat", TalosLlamaNative.nativeBackends());
        riga.put("modelPath", model.getAbsolutePath());
        riga.put("modelBytes", model.length());
        riga.put("threads", thread);
        riga.put("contextTokensRequested", contesto);
        // ⛔ P1-4: era hardcoded "f16" anche qui, indipendentemente da cosa
        // il motore avesse davvero aperto — la stessa bugia per costruzione
        // già corretta altrove (B2) per gpuLayers/backendDevice.
        riga.put("kvRequested", kvRichiesto());
        riga.put("atMs", System.currentTimeMillis());
        return riga;
    }

    // ————————————————— Stop —————————————————

    /**
     * ⛔⛔ STOP È P0, e questo test esiste perché la sonda che c'era misurava
     * la cosa sbagliata.
     *
     * La sonda `cancel` della diagnostica parity misurava il <b>segnale</b> di
     * abort — circa 0 ms — non lo spegnimento del motore: un motore che
     * ignorasse lo stop passava lo stesso. Qui si misura da quando si chiede a
     * quando {@code nativeGenerate} <b>ritorna davvero</b>, che è l'unico
     * momento in cui il lavoro è finito.
     *
     * ⛔ E si misura ADESSO, sulla CPU, perché l'header di llama.cpp dichiara
     * che la callback di abort «currently works only with CPU execution». Senza
     * questo pavimento, il giorno in cui Stop non funzionerà sotto GPU non
     * sapremo di quanto è peggiorato.
     */
    @Test
    public void c0StopDuranteIlPrefill() throws Exception {
        misuraStop("STOP-prefill", false);
    }

    /**
     * ⛔⛔ LO STOP CHIESTO UN ISTANTE TROPPO PRESTO — viene INGHIOTTITO.
     *
     * Trovato il 2026-08-20 mentre un'altra misura sbagliava, e vale più di
     * quella misura. {@code nativeGenerate} azzera {@code cancelled} al proprio
     * ingresso, con una ragione buona: un flag rimasto acceso dalla corsa
     * precedente fermerebbe subito quella nuova. Ma la conseguenza è che uno
     * Stop chiesto nella finestra fra «l'utente preme» e «la generazione
     * entra» sparisce senza lasciare traccia — nessun errore, nessun log, e la
     * risposta continua ad arrivare come se nessuno avesse premuto.
     *
     * ⛔ Non è teoria da laboratorio: è esattamente ciò che fa una persona che
     * si accorge di aver mandato il messaggio sbagliato e preme Stop subito.
     *
     * Questo test **non** pretende che il motore si fermi: documenta con un
     * numero cosa succede oggi, perché la cura tocca il comportamento di
     * produzione e non è una decisione che prendo io. Vedi il ritorno.
     */
    @Test
    public void c0StopChiestoPrimaCheLaGenerazioneEntri() throws Exception {
        pronta();
        File model = fixture();
        int thread = argomentoIntero("talosThreads", 4);
        int contesto = argomentoIntero("talosContext", 8192);

        long handle = apriCpu(model, contesto, thread);
        try {
            String prompt = promptDa(handle, 128);
            final long[] ritornoNs = new long[1];
            final int[] prodotti = new int[1];

            Thread motore = new Thread(() -> {
                TalosLlamaNative.nativeGenerate(handle, prompt, 64, false, false);
                prodotti[0] = TalosLlamaNative.nativeTokensProduced(handle);
                ritornoNs[0] = System.nanoTime();
            });

            long chiestoNs = System.nanoTime();
            motore.start();
            // Nessuna attesa: si chiede lo Stop nella finestra esatta.
            TalosLlamaNative.nativeCancel(handle);

            motore.join(180_000);
            assertTrue("il motore non è tornato entro 180 s", !motore.isAlive());
            long latenzaMs = (ritornoNs[0] - chiestoNs) / 1_000_000L;

            JSONObject riga = intestazione(model, "STOP-early", thread, contesto);
            riga.put("run", 0);
            riga.put("stopLatencyMs", latenzaMs);
            riga.put("tokensProduced", prodotti[0]);
            riga.put("maxTokens", 64);
            // ⛔ Il fatto, detto come numero e non come giudizio: se i token
            // prodotti sono il tetto chiesto, lo Stop non ha fermato niente.
            riga.put("stopHonoured", prodotti[0] < 64);
            riga.put("deviceAfter", statoDispositivo());
            registra(riga);

            Log.i(TAG, "Stop anticipato: " + latenzaMs + " ms, token prodotti "
                    + prodotti[0] + "/64, onorato=" + (prodotti[0] < 64));
        } finally {
            TalosLlamaNative.nativeClose(handle);
        }
    }

    /**
     * Stop mentre il modello sta già producendo.
     *
     * ⛔ Sono due misure diverse e il brief le vuole separate, perché
     * `llama_decode` viene interrogata in due regimi diversi: un lancio di
     * prefill lungo e una raffica di passi brevi. MISURATO il 2026-08-20: con
     * un prompt da 512 token, dopo 1,5 s il motore è ancora in prefill e i
     * token prodotti sono ZERO — una singola misura «a 1,5 s» avrebbe
     * raccontato il prefill credendo di raccontare la decodifica.
     */
    @Test
    public void c0StopDuranteLaDecodifica() throws Exception {
        misuraStop("STOP-decode", true);
    }

    /**
     * ⛔⛔ STOP È P0, e questa misura esiste perché quella che c'era misurava
     * la cosa sbagliata.
     *
     * La sonda `cancel` della diagnostica parity misurava il <b>segnale</b> di
     * abort — circa 0 ms — non lo spegnimento del motore: un motore che
     * ignorasse lo stop passava lo stesso. Qui si misura da quando si chiede a
     * quando {@code nativeGenerate} <b>ritorna davvero</b>, che è l'unico
     * momento in cui il lavoro è finito.
     *
     * ⛔ E si misura ADESSO, sulla CPU, perché l'header di llama.cpp dichiara
     * che la callback di abort «currently works only with CPU execution». Senza
     * questo pavimento, il giorno in cui Stop non funzionerà sotto GPU non
     * sapremo di quanto è peggiorato.
     *
     * @param aspettaIlPrimoToken se vero si attende che la decodifica sia
     *     davvero cominciata prima di chiedere lo stop.
     */
    private void misuraStop(String configurazione, boolean aspettaIlPrimoToken) throws Exception {
        pronta();
        File model = fixture();
        int thread = argomentoIntero("talosThreads", 4);
        int giri = argomentoIntero("talosStopRuns", GIRI_PREDEFINITI);
        int contesto = argomentoIntero("talosContext", 8192);
        int attesaMs = argomentoIntero("talosStopAfterMs", 1500);

        long handle = apriCpu(model, contesto, thread);
        List<Long> latenze = new ArrayList<>();
        try {
            /*
             * ⛔⛔ LA LUNGHEZZA DEL PROMPT E' UNA VARIABILE, non un dettaglio.
             *
             * Con 512 token e microbatch 512 il prefill e' UN SOLO grafo, quindi
             * non esiste nessun confine in cui lo Stop possa mordere e la
             * latenza e' per forza «tutto cio' che restava». Con 2.048 token i
             * grafi diventano quattro, e la differenza fra le due ipotesi —
             * «morde a ogni microbatch» contro «non morde mai» — e' un fattore
             * quattro, cioe' visibile a occhio nudo.
             *
             * MISURATO il 2026-08-20: a microbatch 512 e 256 la latenza era
             * l'intero prefill, a 128 e 64 crollava. Nessuna legge 1/N li
             * spiega entrambi, e questa manopola serve a separarli invece che a
             * raccontarli.
             */
            String prompt = promptDa(handle, argomentoIntero("talosStopPromptTokens", 512));
            for (int giro = 0; giro < giri; giro += 1) {
                final long[] ritornoNs = new long[1];
                final String[] esito = new String[1];
                Thread motore = new Thread(() -> {
                    esito[0] = TalosLlamaNative.nativeGenerate(handle, prompt, 4096, false, false);
                    ritornoNs[0] = System.nanoTime();
                });
                motore.start();

                long attesaEffettivaMs;
                if (aspettaIlPrimoToken) {
                    /*
                     * ⛔⛔ DUE ATTESE, non una — e la prima è quella che mancava.
                     *
                     * MISURATO il 2026-08-20: con una sola attesa («aspetta che
                     * i token siano più di zero») il giro 1 leggeva il contatore
                     * RIMASTO DAL GIRO 0. `nativeGenerate` azzera `produced` al
                     * proprio ingresso, quindi fra `start()` del thread e
                     * quell'azzeramento il contatore vale ancora 1: l'attesa
                     * usciva subito, lo Stop partiva PRIMA che la generazione
                     * cominciasse, e `nativeGenerate` — che azzera anche
                     * `cancelled` — se lo mangiava. La corsa proseguiva fino a
                     * 4096 token: 568 secondi, e un test che sembrava un motore
                     * che ignora lo Stop.
                     *
                     * ⇒ Prima si aspetta che il contatore sia stato AZZERATO
                     * (la generazione è entrata), poi che risalga sopra zero (la
                     * decodifica è cominciata davvero).
                     */
                    long inizio = System.nanoTime();
                    while (TalosLlamaNative.nativeTokensProduced(handle) != 0
                            && motore.isAlive()
                            && (System.nanoTime() - inizio) / 1_000_000L < 10_000L) {
                        Thread.sleep(5);
                    }
                    /*
                     * ⛔ E si aspettano N token, non UNO. Fermarsi al primo
                     * misura lo Stop sul CONFINE fra prefill e decodifica, che
                     * è un terzo regime e non quello che l'etichetta promette.
                     * MISURATO: col solo primo token la latenza usciva 0 ms
                     * cinque volte su cinque — un numero vero per una domanda
                     * che nessuno aveva fatto.
                     */
                    int bersaglio = argomentoIntero("talosStopAfterTokens", 16);
                    while (TalosLlamaNative.nativeTokensProduced(handle) < bersaglio
                            && motore.isAlive()
                            && (System.nanoTime() - inizio) / 1_000_000L < 180_000L) {
                        Thread.sleep(20);
                    }
                    attesaEffettivaMs = (System.nanoTime() - inizio) / 1_000_000L;
                } else {
                    Thread.sleep(attesaMs);
                    attesaEffettivaMs = attesaMs;
                }

                int primaDelloStop = TalosLlamaNative.nativeTokensProduced(handle);
                long chiestoNs = System.nanoTime();
                TalosLlamaNative.nativeCancel(handle);

                motore.join(30_000);
                assertTrue("il motore non è tornato entro 30 s dallo Stop", !motore.isAlive());

                long latenzaMs = (ritornoNs[0] - chiestoNs) / 1_000_000L;
                latenze.add(latenzaMs);

                JSONObject riga = intestazione(model, configurazione, thread, contesto);
                riga.put("run", giro);
                riga.put("waitedMs", attesaEffettivaMs);
                riga.put("stopLatencyMs", latenzaMs);
                riga.put("tokensBeforeStop", primaDelloStop);
                riga.put("tokensAfterStop", TalosLlamaNative.nativeTokensProduced(handle));
                riga.put("producedText", esito[0] != null && !esito[0].isEmpty());
                riga.put("deviceAfter", statoDispositivo());
                registra(riga);

                // ⛔ Il verso contrario, e cambia con la fase: durante il
                // prefill i token DEVONO essere zero, altrimenti si stava già
                // decodificando; durante la decodifica devono essere più di
                // zero, altrimenti si è misurato il prefill.
                if (aspettaIlPrimoToken) {
                    assertTrue("nessun token prima dello Stop: era ancora prefill, non decodifica",
                            primaDelloStop > 0);
                } else {
                    assertTrue("token già prodotti dopo " + attesaEffettivaMs
                                    + " ms: il prefill era finito, questa non è la misura chiesta",
                            primaDelloStop == 0);
                }
            }
        } finally {
            TalosLlamaNative.nativeClose(handle);
        }

        long[] ordinate = new long[latenze.size()];
        for (int i = 0; i < ordinate.length; i += 1) ordinate[i] = latenze.get(i);
        Arrays.sort(ordinate);
        JSONObject riassunto = intestazione(model, configurazione + "-summary", thread, contesto);
        riassunto.put("runs", ordinate.length);
        riassunto.put("p50Ms", percentile(ordinate, 50));
        riassunto.put("p95Ms", percentile(ordinate, 95));
        riassunto.put("maxMs", ordinate[ordinate.length - 1]);
        riassunto.put("minMs", ordinate[0]);
        registra(riassunto);

        Log.i(TAG, String.format(Locale.ROOT, "%s — p50 %d ms · p95 %d ms · max %d ms",
                configurazione, percentile(ordinate, 50), percentile(ordinate, 95),
                ordinate[ordinate.length - 1]));
    }

    /**
     * ⛔ Il percentile «nearest-rank», dichiarato: con cinque giri qualunque
     * interpolazione inventerebbe un valore che nessun giro ha prodotto.
     */
    private static long percentile(long[] ordinate, int percento) {
        if (ordinate.length == 0) return -1;
        int rango = (int) Math.ceil(percento / 100.0 * ordinate.length);
        return ordinate[Math.min(Math.max(rango - 1, 0), ordinate.length - 1)];
    }
}
