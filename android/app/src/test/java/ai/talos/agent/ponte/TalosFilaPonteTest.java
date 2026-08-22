package ai.talos.agent.ponte;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotEquals;
import static org.junit.Assert.assertTrue;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

import org.junit.Test;

/**
 * Le DUE promesse della fila del ponte, provate come si prova un esito e non
 * come si prova una chiamata.
 *
 * ⛔ Perché servono davvero: il difetto che ha generato questo file non si
 * vedeva nel file che lo conteneva. Si vedeva come un girello di dieci secondi
 * in chat — cioè in un punto dell'app che col ponte non c'entra niente. Un
 * difetto che si manifesta lontano dalla sua causa non lo ritrova nessuno
 * leggendo; lo ferma solo un test che tiene ferma la promessa.
 */
public class TalosFilaPonteTest {

    /**
     * PRIMA PROMESSA — non gira sul thread di chi chiama.
     *
     * ⛔ Questo test MORDE: se qualcuno «semplifica» {@link TalosFilaPonte} in
     * una chiamata diretta, o passa a un esecutore che riusa il thread
     * chiamante quando la fila è libera (`MoreExecutors.directExecutor`,
     * `CallerRunsPolicy` — due modi facilissimi di arrivarci senza accorgersene),
     * il nome del thread torna quello del test e la riga sotto va rossa.
     */
    @Test
    public void nonGiraSulThreadDiChiChiama() throws Exception {
        AtomicReference<String> dove = new AtomicReference<>("mai eseguito");
        CountDownLatch fatto = new CountDownLatch(1);

        TalosFilaPonte.INSTANCE.esegui(() -> {
            dove.set(Thread.currentThread().getName());
            fatto.countDown();
        });

        assertTrue("la fila non ha eseguito entro 5 s", fatto.await(5, TimeUnit.SECONDS));
        assertEquals(TalosFilaPonte.NOME, dove.get());
        assertNotEquals(Thread.currentThread().getName(), dove.get());
    }

    /**
     * SECONDA PROMESSA — uno per volta, mai due insieme.
     *
     * ⛔ E si prova cercando la SOVRAPPOSIZIONE, non contando le esecuzioni.
     * Un test che verifica «sono partite tutte e sei» passerebbe identico con un
     * pool da sei thread — cioè con esattamente il difetto che la serializzazione
     * esiste per impedire: due `adb` sulla stessa porta.
     *
     * Qui ogni operazione alza una bandiera all'ingresso e la abbassa all'uscita.
     * Se una la trova già alzata, qualcun altro sta girando insieme a lei, e il
     * test lo dice.
     */
    @Test
    public void mai_due_insieme() throws Exception {
        AtomicBoolean dentro = new AtomicBoolean(false);
        AtomicInteger sovrapposte = new AtomicInteger(0);
        AtomicInteger eseguite = new AtomicInteger(0);
        int quante = 6;
        CountDownLatch tutte = new CountDownLatch(quante);

        for (int i = 0; i < quante; i++) {
            TalosFilaPonte.INSTANCE.esegui(() -> {
                if (!dentro.compareAndSet(false, true)) sovrapposte.incrementAndGet();
                try {
                    // Una finestra vera: senza attesa due thread potrebbero
                    // alternarsi cosi' in fretta da non incrociarsi mai, e il
                    // test passerebbe anche con un pool — cioe' non proverebbe
                    // niente.
                    Thread.sleep(30);
                } catch (InterruptedException stop) {
                    Thread.currentThread().interrupt();
                }
                eseguite.incrementAndGet();
                dentro.set(false);
                tutte.countDown();
            });
        }

        assertTrue("la fila non ha finito entro 10 s", tutte.await(10, TimeUnit.SECONDS));
        assertEquals(quante, eseguite.get());
        assertEquals("due operazioni del ponte hanno girato insieme", 0, sovrapposte.get());
    }
}
