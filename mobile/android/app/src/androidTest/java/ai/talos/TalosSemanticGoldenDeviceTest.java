package ai.talos;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import android.content.Context;
import android.util.Log;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Assume;
import org.junit.Test;
import org.junit.runner.RunWith;

import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

/**
 * ⛔ LA SUITE GOLDEN — quello che un aggiornamento del motore rompe per primo.
 *
 * Portare llama.cpp avanti di qualche mese non cambia solo i kernel della GPU:
 * cambia `common/chat`, il motore Jinja, il parser delle chiamate ai tool e la
 * separazione del ragionamento. Sono le parti su cui TALOS poggia davvero, e
 * una loro deriva non si presenta come un errore — si presenta come un
 * assistente che comincia a stampare i propri tag di protocollo nel corpo del
 * messaggio, o che smette di chiamare gli attrezzi.
 *
 * ⛔⛔ QUESTO VIENE PRIMA DEI BENCHMARK, non dopo. Un candidato più veloce che
 * sbaglia il template non è un candidato: è un guasto più rapido. Finché queste
 * righe non sono verdi, nessun numero di velocità di quel motore vale niente.
 *
 * ⛔ Qui non si misura la QUALITÀ delle risposte — quella dipende dal modello e
 * cambia legittimamente. Si misura la GRAMMATICA del protocollo: dove finisce
 * il ragionamento, dove finisce il contenuto, se una chiamata sopravvive al
 * parser, e se qualcosa che deve restare interno esce allo scoperto.
 *
 * ⛔⛔ NON con {@code ./gradlew connectedDebugAndroidTest}: disinstalla l'app e
 * si porta via modelli e artifact. Si lancia con
 * {@code node scripts/research/run-device-tests.mjs}.
 */
@RunWith(AndroidJUnit4.class)
public class TalosSemanticGoldenDeviceTest {

    private static final String TAG = "TalosSemanticGolden";
    private static final String ARTIFACT_DIR = "research/local-backend";

    /**
     * ⛔⛔ IL DIALETTO SI CHIEDE AL MODELLO, non si assume.
     *
     * MISURATO il 2026-08-20, e questa suite ci è cascata per prima: quattro
     * test rossi perché i fixture erano scritti in ChatML — `&lt;think&gt;`,
     * `&lt;tool_call&gt;` — e il modello sul Pad era **Llama 3.2**, il cui
     * template non contiene né l'uno né l'altro. Verificato leggendo
     * `tokenizer.chat_template` dentro il GGUF:
     *
     * <pre>
     *   &lt;think&gt;              no        &lt;|start_header_id|&gt;   SI
     *   &lt;tool_call&gt;          no        &lt;|eot_id|&gt;            SI
     *   python_tag             no        ipython                 SI
     * </pre>
     *
     * Il parser faceva la cosa giusta — passava oltre marcatori che per QUEL
     * modello non sono protocollo — e il rosso era del test. Un rosso così è
     * peggio di nessun test: manda a cercare un difetto nel motore.
     *
     * ⇒ Il dialetto si ricava dal prompt che il template RENDE davvero, e i
     * casi che un modello non ha si SALTANO dicendolo, invece di fallire.
     */
    private enum Dialetto {
        /** Qwen e simili: `&lt;tool_call&gt;` per gli attrezzi. */
        CHATML,
        /** Llama 3.x: intestazioni `&lt;|start_header_id|&gt;`, chiamate in JSON nudo. */
        LLAMA3,
        /** Un template che non dichiara nessuno dei due. */
        SCONOSCIUTO,
    }

    /** I marcatori speciali che non devono MAI comparire nel contenuto visibile. */
    private static final String[] PROTOCOLLO_UNIVERSALE = {
        "<|im_start|>", "<|im_end|>", "<|start_header_id|>", "<|end_header_id|>",
        "<|eot_id|>", "<|eom_id|>", "<|begin_of_text|>", "<|python_tag|>",
    };

    private static Context context() {
        return InstrumentationRegistry.getInstrumentation().getTargetContext();
    }

    // ————————————————— fixture e artifact —————————————————

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
            // vuoto è un esito
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
        Assume.assumeTrue(
                ostacoli.isEmpty() ? "nessun GGUF leggibile sotto files/models"
                        : "files/models non leggibile: " + ostacoli,
                model != null && model.isFile());
        return model;
    }

    /**
     * ⛔ La riga golden si SCRIVE, sempre — anche quando il test passa.
     *
     * È il punto: fra sei mesi, con un motore nuovo, si confronta questo file
     * con quello di allora. Un test che passa e non lascia niente dice «andava
     * bene», e «andava bene» non si può diffare.
     */
    private static void registra(String caso, JSONObject riga) throws Exception {
        File root = context().getExternalFilesDir(null);
        assertNotNull(root);
        File directory = new File(root, ARTIFACT_DIR);
        if (!directory.exists() && !directory.mkdirs()) {
            throw new IllegalStateException("cartella artifact non creata");
        }
        riga.put("case", caso);
        riga.put("engineBuild", TalosLlamaNative.nativeEngineBuild());
        riga.put("backendRequested", backendRichiesto());
        riga.put("deviceRequested", deviceRichiesto());
        riga.put("flashAttn", modalitaFa());
        riga.put("gpuLayers", argomentoIntero("talosGpuLayers", 0));
        riga.put("microBatch", argomentoIntero("talosMicroBatch", 0));
        riga.put("atMs", System.currentTimeMillis());
        try (FileOutputStream out = new FileOutputStream(new File(directory, "golden.jsonl"), true)) {
            out.write((riga.toString() + "\n").getBytes(StandardCharsets.UTF_8));
        }
        Log.i(TAG, caso + ": " + riga);
    }

    /**
     * ⛔⛔ LA FLASH ATTENTION CAMBIA I NUMERI, e quindi puo' cambiare le PAROLE.
     *
     * Non e' la stessa aritmetica scritta in modo piu' veloce: e' un'altra
     * strada per lo stesso risultato, con arrotondamenti diversi. Una proposta
     * «spegniamola, e' piu' veloce» che non porta anche la prova semantica
     * chiede all'owner di fidarsi di meta' misura.
     *
     * ⛔ Il default resta `default`: qui si misura una variante, non si cambia
     * il pavimento con cui si confrontano le corse di sempre.
     */
    /**
     * ⛔ E il BERSAGLIO, per la stessa ragione: una golden presa su CPU e una
     * presa su GPU sono due misure, e il file non le distingueva.
     */
    private static int argomentoIntero(String nome, int predefinito) {
        String raw = InstrumentationRegistry.getArguments().getString(nome, "");
        if (raw == null || raw.isEmpty()) return predefinito;
        try {
            return Integer.parseInt(raw.trim());
        } catch (NumberFormatException storto) {
            return predefinito;
        }
    }

    private static String backendRichiesto() {
        String scelto = InstrumentationRegistry.getArguments().getString("talosBackend", "");
        return scelto == null || scelto.isEmpty() ? "none" : scelto;
    }

    private static String deviceRichiesto() {
        String scelto = InstrumentationRegistry.getArguments().getString("talosDevice", "");
        return scelto == null ? "" : scelto;
    }

    private static String modalitaFa() {
        String scelto = InstrumentationRegistry.getArguments().getString("talosFlashAttn", "");
        return scelto == null || scelto.isEmpty() ? "default" : scelto;
    }

    private static long apri(File model) {
        TalosLlamaNative.ensureReady(context());
        /*
         * ⛔⛔ `gpuLayers` ERA FISSO A ZERO, e rendeva la prova semantica FALSA
         * proprio nel caso in cui serviva.
         *
         * MISURATO il 2026-08-20: con `talosBackend=OpenCL` questa suite
         * dichiarava il bersaglio GPU e poi apriva con **zero strati
         * spostati**, cioe' calcolava tutto sulla CPU. Il confronto «Flash
         * Attention accesa contro spenta, 7 casi su 7 identici» che avevo usato
         * per raccomandare `off` sui bersagli OpenCL descriveva quindi i kernel
         * della CPU, non quelli di OpenCL.
         *
         * ⇒ Un bersaglio dichiarato e non usato e' peggio di un bersaglio
         * mancante: il file lo registra, e la riga sembra una prova.
         *
         * Il predefinito resta 0 — la golden nasce come pavimento CPU — ma
         * adesso si puo' chiedere, e chi confronta due backend DEVE chiederlo.
         */
        long handle = TalosLlamaNative.nativeOpenTargeted(
                model.getAbsolutePath(), 4, 4096,
                argomentoIntero("talosGpuLayers", 0), true, 4,
                argomentoIntero("talosMicroBatch", 0), "f16",
                backendRichiesto(), deviceRichiesto(), modalitaFa());
        assertNotEquals("apertura fallita su `" + backendRichiesto() + "`: "
                        + TalosLlamaNative.nativeLastOpenError()
                        + "\n   ⇒ `backend-target` NON vuol dire «nome sbagliato»:"
                        + " vuol dire anche «questa build non ha quell'acceleratore"
                        + " compilato dentro». Un `assembleDebug` nudo sovrascrive"
                        + " lo stesso app-debug.apk.",
                0L, handle);
        return handle;
    }

    private static String messaggi(String sistema, String utente) throws Exception {
        JSONArray lista = new JSONArray();
        if (sistema != null) {
            JSONObject uno = new JSONObject();
            uno.put("role", "system");
            uno.put("content", sistema);
            lista.put(uno);
        }
        JSONObject due = new JSONObject();
        due.put("role", "user");
        due.put("content", utente);
        lista.put(due);
        return lista.toString();
    }

    /** Un attrezzo nel formato OpenAI, che è quello che il parser si aspetta. */
    private static JSONObject attrezzo(String nome, String descrizione) throws Exception {
        JSONObject parametri = new JSONObject();
        parametri.put("type", "object");
        JSONObject proprieta = new JSONObject();
        JSONObject dove = new JSONObject();
        dove.put("type", "string");
        dove.put("description", "la città");
        proprieta.put("citta", dove);
        parametri.put("properties", proprieta);
        parametri.put("required", new JSONArray().put("citta"));

        JSONObject funzione = new JSONObject();
        funzione.put("name", nome);
        funzione.put("description", descrizione);
        funzione.put("parameters", parametri);

        JSONObject fuori = new JSONObject();
        fuori.put("type", "function");
        fuori.put("function", funzione);
        return fuori;
    }

    /**
     * Quale dialetto parla questo modello, chiesto al prompt che rende davvero.
     *
     * ⛔ Si guarda il prompt CON un attrezzo offerto: senza attrezzi nessun
     * template mostra i propri marcatori di chiamata, e la risposta sarebbe
     * «SCONOSCIUTO» per tutti.
     */
    private static Dialetto dialetto(long handle) throws Exception {
        JSONArray attrezzi = new JSONArray().put(attrezzo("meteo", "Il tempo che fa"));
        String reso = TalosLlamaNative.nativeApplyChatTemplate(
                handle, messaggi("Sei TALOS.", "Che tempo fa?"), attrezzi.toString(), false);
        if (reso == null) return Dialetto.SCONOSCIUTO;
        if (reso.contains("<tool_call>")) return Dialetto.CHATML;
        if (reso.contains("<|start_header_id|>")) return Dialetto.LLAMA3;
        return Dialetto.SCONOSCIUTO;
    }

    /**
     * Vero se il template dichiara un canale di ragionamento separato.
     *
     * ⛔ CHIESTO AL MOTORE, non indovinato dal testo. Qui prima si cercava
     * `&lt;think&gt;` dentro il prompt reso: un'euristica che funziona finché
     * una famiglia non usa un marcatore diverso, e allora risponde «no» a un
     * modello che il ragionamento ce l'ha. `common_chat_params` porta
     * `supports_thinking`, che è la risposta di chi lo sa.
     */
    private static boolean haRagionamento(long handle) throws Exception {
        // Il template va applicato prima: la risposta nasce lì, e prima non
        // esiste una domanda da fare.
        TalosLlamaNative.nativeApplyChatTemplate(
                handle, messaggi("Sei TALOS.", "Pensa e rispondi."), "", true);
        String diagnostica = TalosLlamaNative.nativeGrammarDiagnostics(handle);
        if (diagnostica == null || diagnostica.isEmpty()) return false;
        return new JSONObject(diagnostica).optBoolean("supportsThinking", false);
    }

    /** Una chiamata all'attrezzo `meteo`, scritta nel dialetto del modello. */
    private static String chiamataNelDialetto(Dialetto quale) {
        switch (quale) {
            case CHATML:
                return "<tool_call>\n{\"name\": \"meteo\", "
                        + "\"arguments\": {\"citta\": \"Catania\"}}\n</tool_call>";
            case LLAMA3:
                // Llama 3.x emette l'oggetto JSON nudo; `parameters` è il nome
                // che il suo template usa, non `arguments`.
                return "{\"name\": \"meteo\", \"parameters\": {\"citta\": \"Catania\"}}";
            default:
                return "{\"name\": \"meteo\", \"arguments\": {\"citta\": \"Catania\"}}";
        }
    }

    /**
     * I marcatori che per QUESTO modello sono protocollo.
     *
     * ⛔ Universali più quelli del dialetto: pretendere che un contenuto di
     * Llama non contenga `&lt;think&gt;` non prova niente, perché quel modello
     * non lo produce. Un'asserzione che non può fallire è un'asserzione che non
     * difende niente.
     */
    private static String[] marcatoriDi(Dialetto quale) {
        List<String> tutti = new ArrayList<>();
        for (String uno : PROTOCOLLO_UNIVERSALE) tutti.add(uno);
        if (quale == Dialetto.CHATML) {
            tutti.add("<tool_call>");
            tutti.add("</tool_call>");
        }
        return tutti.toArray(new String[0]);
    }

    private static void nessunProtocolloIn(String etichetta, String testo, Dialetto quale) {
        if (testo == null) return;
        for (String marcatore : marcatoriDi(quale)) {
            assertFalse(etichetta + " contiene il marcatore di protocollo " + marcatore
                            + ": «" + testo + "»",
                    testo.contains(marcatore));
        }
    }

    // ————————————————— S1 —————————————————

    /**
     * S1 — chat normale, ragionamento spento, nessun attrezzo.
     *
     * Assicura le tre cose che il brief nomina: nessun protocollo `<think>` che
     * esce allo scoperto, contenuto non vuoto, nessuna chiamata fantasma.
     *
     * ⛔ La chiamata fantasma è il difetto sottile: un parser che, senza
     * attrezzi offerti, «riconosce» comunque una chiamata dentro del testo
     * normale. Costa una risposta buttata e un attrezzo eseguito per sbaglio.
     */
    @Test
    public void s1ChatSenzaRagionamento() throws Exception {
        File model = fixture();
        long handle = apri(model);
        try {
            String prompt = TalosLlamaNative.nativeApplyChatTemplate(
                    handle, messaggi("Sei TALOS.", "Ciao, come stai?"), "", false);
            assertNotNull("il template non ha reso niente", prompt);
            assertFalse("prompt vuoto", prompt.isEmpty());

            Dialetto quale = dialetto(handle);
            String parsato = TalosLlamaNative.nativeParseReply(handle, "Sto bene, grazie.");
            JSONObject esito = new JSONObject(parsato);
            String contenuto = esito.optString("content", "");
            assertFalse("contenuto vuoto", contenuto.isEmpty());
            nessunProtocolloIn("il contenuto", contenuto, quale);
            assertEquals("chiamata fantasma senza attrezzi offerti",
                    0, esito.optJSONArray("toolCalls").length());

            JSONObject riga = new JSONObject();
            riga.put("promptChars", prompt.length());
            riga.put("promptTokens", TalosLlamaNative.nativePromptTokens(handle, prompt));
            riga.put("content", contenuto);
            riga.put("reasoning", esito.optString("reasoning", ""));
            riga.put("toolCalls", 0);
            riga.put("dialect", quale.name());
            registra("S1", riga);
        } finally {
            TalosLlamaNative.nativeClose(handle);
        }
    }

    // ————————————————— S2 —————————————————

    /**
     * S2 — ragionamento acceso: separato, non duplicato, non stampato.
     *
     * ⛔ È il difetto che l'owner ha visto per primo: i tag di ragionamento
     * finiti nel corpo del messaggio. Qui si prova che il parser li toglie dal
     * contenuto E li mette da qualche parte — toglierli e basta sarebbe perdere
     * il ragionamento, che è un difetto diverso e altrettanto vero.
     */
    @Test
    public void s2RagionamentoSeparatoDalContenuto() throws Exception {
        File model = fixture();
        long handle = apri(model);
        try {
            Dialetto quale = dialetto(handle);
            /*
             * ⛔⛔ «NON APPLICABILE» È UN ESITO, non un'assenza di esito.
             *
             * Llama 3.2 non ha un canale di ragionamento, e pretenderlo
             * produrrebbe un rosso che accusa il motore di non fare una cosa
             * che quel modello non sa fare. Ma SALTARE il test sarebbe l'errore
             * opposto: un test saltato non lascia niente nel file golden, e il
             * giorno in cui un modello CON ragionamento smettesse di separarlo,
             * il confronto con «allora» non avrebbe un «allora» con cui
             * confrontarsi.
             *
             * ⇒ Si registra `applicable:false` e si passa. È un fatto sul
             * modello, e sta nell'artifact come tutti gli altri.
             */
            if (!haRagionamento(handle)) {
                JSONObject assente = new JSONObject();
                assente.put("applicable", false);
                assente.put("dialect", quale.name());
                assente.put("why", "il template non dichiara un canale di ragionamento");
                registra("S2", assente);
                Log.i(TAG, "S2 non applicabile a questo modello (dialetto " + quale + ")");
                return;
            }

            String risposta = "<think>Devo salutare con garbo.</think>Ciao! Tutto bene.";
            JSONObject esito = new JSONObject(TalosLlamaNative.nativeParseReply(handle, risposta));

            String contenuto = esito.optString("content", "");
            String ragionamento = esito.optString("reasoning", "");

            nessunProtocolloIn("il contenuto", contenuto, quale);
            assertFalse("il marcatore di ragionamento è rimasto nel contenuto",
                    contenuto.contains("<think>"));
            assertFalse("contenuto vuoto: il ragionamento se l'è mangiato tutto",
                    contenuto.isEmpty());
            // ⛔ E il verso contrario: il ragionamento non deve restare anche
            // nel contenuto. Duplicarlo è il modo in cui «l'ho tolto» diventa
            // falso senza che nessun test se ne accorga.
            assertFalse("il ragionamento è rimasto ANCHE nel contenuto",
                    contenuto.contains("Devo salutare con garbo"));

            JSONObject riga = new JSONObject();
            riga.put("content", contenuto);
            riga.put("reasoning", ragionamento);
            riga.put("reasoningCaptured", !ragionamento.isEmpty());
            riga.put("applicable", true);
            riga.put("dialect", quale.name());
            registra("S2", riga);

            Log.i(TAG, "S2 — ragionamento catturato: " + !ragionamento.isEmpty());
        } finally {
            TalosLlamaNative.nativeClose(handle);
        }
    }

    // ————————————————— S3 —————————————————

    /**
     * S3 — un attrezzo solo: arriva al template, e la chiamata sopravvive.
     *
     * Due metà distinte, e servono entrambe: che l'attrezzo entri nel prompt
     * (altrimenti il modello non sa che esiste) e che una chiamata torni fuori
     * dal parser con gli argomenti intatti.
     */
    @Test
    public void s3UnAttrezzoAttraversaTemplateEParser() throws Exception {
        File model = fixture();
        long handle = apri(model);
        try {
            JSONArray attrezzi = new JSONArray().put(attrezzo("meteo", "Il tempo che fa"));
            String prompt = TalosLlamaNative.nativeApplyChatTemplate(
                    handle, messaggi("Sei TALOS.", "Che tempo fa a Catania?"),
                    attrezzi.toString(), false);

            assertNotNull(prompt);

            /*
             * ⛔⛔ «IL MODELLO NON SUPPORTA GLI ATTREZZI» NON E' UN GUASTO
             * NOSTRO, ed erano la stessa riga rossa.
             *
             * MISURATO il 2026-08-20 su Gemma 3 4B: l'attrezzo non arriva al
             * template, e questo test falliva come se l'impianto fosse rotto.
             * ⛔ Verificato: il chat template di Gemma 3 **non contiene affatto
             * le strutture per gli attrezzi** — e' una proprieta' del modello,
             * documentata a monte, non un difetto di TALOS.
             *
             * ⇒ Un modello senza attrezzi si SALTA e si NOMINA. Confonderlo con
             * una catena rotta ha due prezzi opposti: nasconde i guasti veri
             * dentro il rumore, e fa sembrare colpa nostra un limite del
             * modello.
             *
             * ⭐ E resta un fatto di PRODOTTO che conta: con un modello cosi'
             * l'assistente non puo' chiamare niente. Non e' «chiama male»: non
             * gli viene proprio offerto.
             */
            String capacita = TalosLlamaNative.nativeTemplateCapabilities(model.getAbsolutePath());
            boolean sostiene = capacita != null && capacita.contains("\"supportsTools\":true");
            Assume.assumeTrue(
                    "questo modello non dichiara il supporto agli attrezzi: il suo template"
                            + " non li rende, quindi l'assistente non puo' chiamarli."
                            + "  capacita = " + capacita,
                    sostiene);

            assertTrue("l'attrezzo non è arrivato al template benché il modello dichiari"
                            + " di supportarli: qui il guasto è NOSTRO",
                    prompt.contains("meteo"));

            Dialetto quale = dialetto(handle);
            String risposta = chiamataNelDialetto(quale);
            JSONObject esito = new JSONObject(TalosLlamaNative.nativeParseReply(handle, risposta));
            JSONArray chiamate = esito.optJSONArray("toolCalls");

            JSONObject riga = new JSONObject();
            riga.put("promptChars", prompt.length());
            riga.put("promptTokens", TalosLlamaNative.nativePromptTokens(handle, prompt));
            riga.put("dialect", quale.name());
            riga.put("reply", risposta);
            riga.put("toolInPrompt", prompt.contains("meteo"));
            riga.put("toolCalls", chiamate == null ? 0 : chiamate.length());
            if (chiamate != null && chiamate.length() > 0) {
                JSONObject prima = chiamate.getJSONObject(0);
                riga.put("callName", prima.optString("name", ""));
                riga.put("callArguments", prima.optString("arguments", ""));
                assertEquals("il nome della chiamata non è sopravvissuto",
                        "meteo", prima.optString("name", ""));
                assertTrue("gli argomenti non sono sopravvissuti al parser",
                        prima.optString("arguments", "").contains("Catania"));
            }
            // ⛔ Il contenuto visibile non deve contenere il protocollo grezzo,
            // qualunque cosa il parser abbia deciso della chiamata.
            nessunProtocolloIn("il contenuto", esito.optString("content", ""), quale);
            registra("S3", riga);
        } finally {
            TalosLlamaNative.nativeClose(handle);
        }
    }

    // ————————————————— S4 —————————————————

    /**
     * S4 — l'insieme grande di attrezzi: quanto costa, in numeri.
     *
     * ⛔ Non è un test che passa o fallisce: è una MISURA che si conserva. Il
     * taccuino porta già il numero che fa male — la grammatica GBNF per 46
     * attrezzi pesava 55.871 byte e il parser la rifiutava con «number of rules
     * that are going to be repeated... exceeds sane defaults». Qui si registra
     * quanto pesa il PROMPT al crescere degli attrezzi, che è la metà del costo
     * che si può misurare senza generare.
     *
     * ⛔ Quello che questa misura NON copre, e va detto invece che sottinteso:
     * byte della grammatica, `grammar_lazy`, numero di inneschi e token
     * preservati non sono esposti da nessuna API. Senza una diagnostica nativa
     * dedicata restano fuori, e il brief li chiede. Sta nel ritorno.
     */
    @Test
    public void s4InsiemeGrandeDiAttrezzi() throws Exception {
        File model = fixture();
        long handle = apri(model);
        try {
            Dialetto quale = dialetto(handle);
            String capacita = TalosLlamaNative.nativeTemplateCapabilities(model.getAbsolutePath());
            Log.i(TAG, "capacità del template: " + capacita);

            int[] quantita = { 1, 8, 24, 46 };
            JSONArray misure = new JSONArray();
            for (int quanti : quantita) {
                JSONArray attrezzi = new JSONArray();
                for (int i = 0; i < quanti; i += 1) {
                    attrezzi.put(attrezzo("attrezzo_" + i, "Il numero " + i + " della lista"));
                }
                String prompt = TalosLlamaNative.nativeApplyChatTemplate(
                        handle, messaggi("Sei TALOS.", "Fai qualcosa di utile."),
                        attrezzi.toString(), false);
                int token = prompt == null ? -1
                        : TalosLlamaNative.nativePromptTokens(handle, prompt);

                JSONObject misura = new JSONObject();
                misura.put("toolCount", quanti);
                misura.put("toolsJsonBytes", attrezzi.toString().length());
                misura.put("promptChars", prompt == null ? -1 : prompt.length());
                misura.put("promptTokens", token);
                misura.put("rendered", prompt != null && !prompt.isEmpty());

                /*
                 * ⛔⛔ LA GRAMMATICA, che fino a oggi stava solo in logcat.
                 *
                 * È la metà del costo che il conteggio dei token non vede, ed è
                 * quella dove vivono i due difetti aperti: la GBNF da 55.871
                 * byte rifiutata dal parser, e la grammatica pigra con un
                 * innesco solo che non si accende mai. Qui diventano una riga
                 * dell'artifact, cioè una cosa che si può confrontare con
                 * quella di ieri.
                 */
                String grammatica = TalosLlamaNative.nativeGrammarDiagnostics(handle);
                if (grammatica != null && !grammatica.isEmpty()) {
                    JSONObject dettaglio = new JSONObject(grammatica);
                    misura.put("grammar", dettaglio);
                    Log.i(TAG, "S4 " + quanti + " attrezzi → " + token + " token · GBNF "
                            + dettaglio.optLong("grammarBytes", -1) + " byte · pigra="
                            + dettaglio.optBoolean("grammarLazy", false) + " · inneschi="
                            + dettaglio.optInt("triggerCount", -1) + " · compila="
                            + dettaglio.optBoolean("compiles", false));
                } else {
                    misura.put("grammar", JSONObject.NULL);
                    Log.i(TAG, "S4 " + quanti + " attrezzi → " + token
                            + " token · nessuna diagnostica di grammatica");
                }
                misure.put(misura);
            }

            JSONObject riga = new JSONObject();
            riga.put("dialect", quale.name());
            riga.put("templateCapabilities", capacita == null ? JSONObject.NULL : capacita);
            riga.put("measurements", misure);
            // ⛔ Non più un `JSONObject.NULL` con una nota che si scusa: byte
            // della GBNF, pigrizia, inneschi e token protetti stanno dentro
            // ogni voce di `measurements`, e `compiles` è PROVATO.
            registra("S4", riga);
        } finally {
            TalosLlamaNative.nativeClose(handle);
        }
    }

    // ————————————————— S5 —————————————————

    /**
     * S5 — prosa PRIMA della chiamata, che è il caso vero.
     *
     * ⛔ Critico perché TALOS porta già un aggiramento per questo: il modello
     * scrive due righe di ragionamento e POI apre il marcatore dell'attrezzo.
     * Un parser che pretende la chiamata all'inizio la perde, e il difetto si
     * presenta come «l'assistente non chiama gli attrezzi» — cioè come un
     * problema del modello, che è il posto sbagliato dove cercarlo.
     */
    @Test
    public void s5RagionamentoPrimaDellaChiamata() throws Exception {
        File model = fixture();
        long handle = apri(model);
        try {
            Dialetto quale = dialetto(handle);
            String risposta = "Devo controllare il meteo per rispondere.\n"
                    + chiamataNelDialetto(quale);
            JSONObject esito = new JSONObject(TalosLlamaNative.nativeParseReply(handle, risposta));
            JSONArray chiamate = esito.optJSONArray("toolCalls");

            JSONObject riga = new JSONObject();
            riga.put("toolCalls", chiamate == null ? 0 : chiamate.length());
            riga.put("content", esito.optString("content", ""));
            riga.put("reasoning", esito.optString("reasoning", ""));
            riga.put("callSurvivedAfterProse", chiamate != null && chiamate.length() > 0);
            riga.put("dialect", quale.name());
            riga.put("reply", risposta);
            registra("S5", riga);

            nessunProtocolloIn("il contenuto", esito.optString("content", ""), quale);
            Log.i(TAG, "S5 — chiamata dopo la prosa trovata: "
                    + (chiamate != null && chiamate.length() > 0));
        } finally {
            TalosLlamaNative.nativeClose(handle);
        }
    }

    // ————————————————— S6 —————————————————

    /**
     * S6 — un JSON di attrezzi malformato NON deve uccidere il processo.
     *
     * ⛔ È il test che protegge la cosa più costosa: un'eccezione C++ che
     * attraversa JNI non diventa un'eccezione Java, diventa un processo morto.
     * Per l'utente è l'app che sparisce, senza schermata di errore e senza
     * nulla da raccontare.
     *
     * Che il template renda o non renda è un dettaglio. Che si torni vivi non
     * lo è — e la prova che si è tornati vivi è la riga dopo, che continua a
     * funzionare.
     */
    @Test
    public void s6AttrezziMalformatiNonUccidonoIlProcesso() throws Exception {
        File model = fixture();
        long handle = apri(model);
        try {
            String[] storti = {
                "{non è json",
                "[{\"type\":\"function\"}]",
                "[]",
                "{\"type\":\"function\"}",
                "[{\"type\":\"function\",\"function\":{\"name\":\"\",\"parameters\":42}}]",
            };
            JSONArray esiti = new JSONArray();
            for (String storto : storti) {
                String prompt = TalosLlamaNative.nativeApplyChatTemplate(
                        handle, messaggi("Sei TALOS.", "Ciao"), storto, false);
                JSONObject uno = new JSONObject();
                uno.put("tools", storto);
                uno.put("rendered", prompt != null && !prompt.isEmpty());
                esiti.put(uno);
            }

            // ⛔ LA PROVA CHE SIAMO VIVI. Senza questa riga il test passerebbe
            // anche se il processo fosse morto a metà — perché un processo
            // morto non fallisce un'asserzione, semplicemente non ne esegue
            // più nessuna.
            String dopo = TalosLlamaNative.nativeApplyChatTemplate(
                    handle, messaggi("Sei TALOS.", "Ancora qui?"), "", false);
            assertNotNull("il motore non risponde più dopo gli attrezzi malformati", dopo);
            assertFalse("il motore risponde vuoto dopo gli attrezzi malformati", dopo.isEmpty());

            JSONObject riga = new JSONObject();
            riga.put("attempts", esiti);
            riga.put("dialect", dialetto(handle).name());
            riga.put("engineAliveAfter", true);
            registra("S6", riga);
        } finally {
            TalosLlamaNative.nativeClose(handle);
        }
    }

    // ————————————————— S7 —————————————————

    /**
     * S7 — il testo PARZIALE, quello che l'interfaccia mostra mentre arriva.
     *
     * ⛔ È il percorso in cui i difetti si vedono per primi, perché una risposta
     * a metà è per definizione una risposta malformata: il tag di apertura è
     * arrivato e quello di chiusura no. Se il parser dello streaming lasciasse
     * passare quel troncone, l'utente vedrebbe `<think>` comparire per un
     * istante e sparire — che è esattamente ciò che è già successo.
     */
    @Test
    public void s7TestoParzialeNonPerdeIlProtocollo() throws Exception {
        File model = fixture();
        long handle = apri(model);
        try {
            Dialetto quale = dialetto(handle);
            // La risposta completa si costruisce nel dialetto del modello: un
            // troncone di un protocollo che il modello non parla non prova
            // niente sullo streaming di QUESTO modello.
            String completa = haRagionamento(handle)
                    ? "<think>Sto ragionando su questo.</think>Ecco la risposta."
                    : chiamataNelDialetto(quale) + "\nEcco la risposta.";
            JSONArray esiti = new JSONArray();

            // Ogni troncamento è uno stato in cui l'interfaccia si può trovare.
            for (int taglio = 1; taglio <= completa.length(); taglio += 7) {
                String parziale = completa.substring(0, Math.min(taglio, completa.length()));
                String parsato = TalosLlamaNative.nativeParseReply(handle, parziale);
                assertNotNull("il parser non ha risposto su un troncone", parsato);
                JSONObject esito = new JSONObject(parsato);
                String contenuto = esito.optString("content", "");
                nessunProtocolloIn("il contenuto al troncamento " + taglio, contenuto, quale);

                JSONObject uno = new JSONObject();
                uno.put("cut", taglio);
                uno.put("content", contenuto);
                uno.put("reasoning", esito.optString("reasoning", ""));
                esiti.put(uno);
            }

            JSONObject riga = new JSONObject();
            riga.put("cuts", esiti);
            riga.put("dialect", quale.name());
            riga.put("full", completa);
            registra("S7", riga);
        } finally {
            TalosLlamaNative.nativeClose(handle);
        }
    }
}
