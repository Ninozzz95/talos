package ai.talos;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

import android.content.Context;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import org.junit.Assume;
import org.junit.Test;
import org.junit.runner.RunWith;

import java.io.File;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

/**
 * ⛔⛔⛔ LA PROVA CHE LA FINESTRA È CHIUSA — e va fatta su un telefono vero.
 *
 * Il difetto che questi test esistono per riaprire: chatPrompt() arriva fino a
 * common_sampler_free() nel C++, dove il campionatore viene liberato e
 * sostituito, mentre nativeGenerate() dereferenzia lo stesso puntatore per
 * campionare. Due thread, uno libera e l'altro legge.
 *
 * ⛔ Nessun test sulla JVM può dare questa prova: serve llama.cpp compilato per
 * ARM64, caricato in questo processo, che macina token davvero. Su una JVM di
 * sviluppo il puntatore non esiste, e un verde non significherebbe niente.
 *
 * ## ⛔⛔ CHE COSA PROVA QUESTO FILE, E CHE COSA NO
 *
 * Prova che l'invariante JAVA regge: nessuna chiamata che tocca la sessione può
 * partire da un thread che non possiede il motore, e nessuna può partire dopo
 * la chiusura.
 *
 * ⛔ NON prova che il nativo sia libero da use-after-free, e non può: le
 * guardie fermano la chiamata PRIMA che arrivi al C++, quindi il codice nativo
 * pericoloso non viene nemmeno eseguito. Un verde qui dice «la porta è chiusa a
 * chiave», non «dietro la porta non c'è più il burrone».
 *
 * ⇒ Per il nativo serve una corsa sotto HWAddress Sanitizer, che su ARM64 è lo
 * strumento corrente per questa classe di difetti ed è abbastanza leggero da
 * girare su un dispositivo vero. ⛔ HWASan vede le librerie JNI ma NON il
 * codice Java: è esattamente complementare a questo file, non un doppione.
 * Finché quella corsa non è stata fatta, NAT-001 non è chiuso.
 *
 * ⛔ Senza il modello di prova questi test si SALTANO con un messaggio che dice
 * cosa manca. Un verde che non ha misurato niente è peggio di un rosso.
 */
@RunWith(AndroidJUnit4.class)
public class TalosMotoreAttoreDeviceTest {

    private static final String FIXTURE = "talos-fixture.gguf";

    private static File model(Context context) {
        String selected = InstrumentationRegistry.getArguments().getString("talosModelPath", "");
        if (selected != null && !selected.isEmpty()) return new File(selected);
        File directory = context.getExternalFilesDir(null);
        return directory == null ? null : new File(directory, FIXTURE);
    }

    private static TalosLlamaEngine apri() {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        File file = model(context);
        Assume.assumeTrue(
                "modello di prova assente: spingilo in " + (file == null ? "?" : file.getAbsolutePath()),
                file != null && file.isFile());
        TalosLlamaEngine engine =
                TalosLlamaEngine.open(context, file.getAbsolutePath(), 4, 2048, 0, true);
        assertNotNull("il modello non si è aperto — guarda logcat, tag TalosLlama", engine);
        return engine;
    }

    private static String[] ruoli() {
        return new String[] { "user" };
    }

    private static String[] testi() {
        return new String[] { "ciao" };
    }

    /**
     * ⛔ IL DIFETTO ORIGINALE: chatPrompt da un thread che non possiede il motore.
     *
     * Prima passava dritta fino a common_sampler_free(). Ora deve fermarsi in
     * Java, con un messaggio che nomina i due thread in gioco — e il processo
     * deve restare in piedi: una eccezione, non un SIGSEGV.
     */
    @Test
    public void chatPromptDaUnAltroThreadSiFermaInJava() throws Exception {
        TalosLlamaEngine engine = apri();
        try {
            AtomicReference<Throwable> preso = new AtomicReference<>(null);
            Thread estraneo = new Thread(() -> {
                try {
                    engine.chatPrompt(ruoli(), testi(), null, true);
                } catch (Throwable t) {
                    preso.set(t);
                }
            }, "intruso");
            estraneo.start();
            estraneo.join(10_000);

            Throwable t = preso.get();
            assertNotNull("chatPrompt da un altro thread NON si è fermata: la finestra è di nuovo aperta", t);
            assertTrue("fermata, ma per il motivo sbagliato: " + t,
                    String.valueOf(t.getMessage()).contains("TALOS_LLAMA_FUORI_DALL_ATTORE"));

            // ⛔ E il motore deve essere ancora sano: la guardia non lo rompe.
            assertNotNull(engine.chatPrompt(ruoli(), testi(), null, true));
        } finally {
            engine.close();
        }
    }

    /**
     * ⛔⛔ E questo non aveva nemmeno bisogno di due thread.
     *
     * Il campo closed esisteva, ma lo leggeva solo close(). Dopo una chiusura
     * ogni altra chiamata passava al C++ una talos_session gia distrutta:
     * use-after-free senza finestra temporale, deterministico. Adesso è un
     * errore deterministico, che è una cosa molto diversa.
     */
    @Test
    public void dopoLaChiusuraOgniChiamataEDeterministica() {
        TalosLlamaEngine engine = apri();
        engine.close();

        try {
            engine.chatPrompt(ruoli(), testi(), null, true);
            fail("chatPrompt dopo close() è passata: il puntatore era già liberato");
        } catch (IllegalStateException atteso) {
            assertTrue(atteso.getMessage(), atteso.getMessage().contains("TALOS_LLAMA_SESSIONE_CHIUSA"));
        }
        try {
            engine.promptTokens("ciao");
            fail("promptTokens dopo close() è passata");
        } catch (IllegalStateException atteso) {
            assertTrue(atteso.getMessage(), atteso.getMessage().contains("TALOS_LLAMA_SESSIONE_CHIUSA"));
        }

        // ⛔ Ma chiudere due volte resta innocuo: un try-with-resources attorno a
        // un close() esplicito non deve diventare una eccezione.
        engine.close();
    }

    /**
     * ⭐⭐⭐ IL MARTELLO: si prova a riaprire la finestra mentre è spalancata.
     *
     * Una generazione lunga in corso, e nel frattempo tanti thread che chiamano
     * chatPrompt e cancel senza tregua. Se la finestra fosse ancora aperta,
     * questo è il test che la troverebbe — ed è per questo che gira su ARM64
     * vero e non su una JVM.
     *
     * ⛔ Il criterio NON è «nessuna eccezione»: le chiamate fuori dall'attore
     * DEVONO fallire. Il criterio è che falliscano tutte allo stesso modo e che
     * il processo arrivi in fondo — un crash nativo non produce un rosso,
     * produce un test che non finisce mai.
     */
    @Test
    public void ilMartelloConcorrenteNonApreLaFinestra() throws Exception {
        TalosLlamaEngine engine = apri();
        try {
            final int MARTELLI = 8;
            AtomicInteger fermateGiuste = new AtomicInteger(0);
            AtomicInteger passateDritte = new AtomicInteger(0);
            AtomicReference<Throwable> inatteso = new AtomicReference<>(null);
            CountDownLatch pronti = new CountDownLatch(MARTELLI);
            CountDownLatch finiti = new CountDownLatch(MARTELLI);
            AtomicInteger vaiAvanti = new AtomicInteger(1);

            for (int i = 0; i < MARTELLI; i += 1) {
                final boolean annulla = (i % 4 == 3);
                new Thread(() -> {
                    pronti.countDown();
                    while (vaiAvanti.get() == 1) {
                        try {
                            // ⛔ cancel è una VEDETTA: deve poter scavalcare
                            // l'attore, o non potrebbe fermare niente.
                            if (annulla) {
                                engine.cancel();
                                continue;
                            }
                            engine.chatPrompt(ruoli(), testi(), null, true);
                            passateDritte.incrementAndGet();
                        } catch (IllegalStateException fermata) {
                            if (String.valueOf(fermata.getMessage()).contains("TALOS_LLAMA_FUORI_DALL_ATTORE")) {
                                fermateGiuste.incrementAndGet();
                            } else {
                                inatteso.set(fermata);
                            }
                        } catch (Throwable altro) {
                            inatteso.set(altro);
                        }
                    }
                    finiti.countDown();
                }, "martello-" + i).start();
            }

            assertTrue("i martelli non sono partiti", pronti.await(10, TimeUnit.SECONDS));
            // La generazione vera, sul thread che possiede il motore.
            String prodotto = engine.generateBlocking("Racconta qualcosa.", 48, TalosLlamaEngine.Mode.CHAT);
            vaiAvanti.set(0);
            assertTrue("i martelli non si sono fermati", finiti.await(20, TimeUnit.SECONDS));

            assertEquals("un martello è passato dritto fino al nativo: la finestra è aperta",
                    0, passateDritte.get());
            assertTrue("nessun martello ha colpito: il test non ha provato niente",
                    fermateGiuste.get() > 0);
            assertNull("fermato per un motivo che non aspettavamo: " + inatteso.get(), inatteso.get());
            assertNotNull("la generazione non ha prodotto niente sotto martello", prodotto);
        } finally {
            engine.close();
        }
    }
}
