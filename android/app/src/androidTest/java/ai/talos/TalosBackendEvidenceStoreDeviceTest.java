package ai.talos;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import android.content.Context;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;

/**
 * L'evidenza sopravvive davvero — non solo sulla carta, su un {@link Context}
 * vero, con un {@code SharedPreferences} vero dietro.
 *
 * Fase 7(c), 2026-08-21. Nessuna finzione qui: se questo file passa,
 * {@link TalosBackendEvidenceStore} fa esattamente quello che promette sul
 * dispositivo che lo eseguirà per davvero.
 */
@RunWith(AndroidJUnit4.class)
public class TalosBackendEvidenceStoreDeviceTest {

    private static final String DRIVER = "test-driver/1.0";

    private Context context;

    @Before
    public void pulisci() {
        context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        // Riparte da vuoto ogni volta: un test che eredita lo stato del
        // precedente non sta provando questa classe, sta provando l'ordine.
        context.getSharedPreferences("talos_backend_evidence", Context.MODE_PRIVATE)
                .edit().clear().commit();
    }

    @Test
    public void unTelefonoNuovoNonHaEvidenza() {
        assertEquals(0, TalosBackendEvidenceStore.load(context).length);
    }

    @Test
    public void unaRegistrazioneSopravviveAllaLettura() {
        TalosBackendEvidenceStore.record(context, new TalosBackendChoice.Evidence(
                TalosBackendChoice.OPENCL, DRIVER, TalosBackendChoice.Outcome.CORRECT, 11_000L));

        TalosBackendChoice.Evidence[] letta = TalosBackendEvidenceStore.load(context);
        assertEquals(1, letta.length);
        assertEquals(TalosBackendChoice.OPENCL, letta[0].backend);
        assertEquals(DRIVER, letta[0].driver);
        assertEquals(TalosBackendChoice.Outcome.CORRECT, letta[0].outcome);
        assertEquals(11_000L, letta[0].ttftMs);
    }

    @Test
    public void unaSecondaRegistrazioneSullaStessaCoppiaSostituisceLaPrima() {
        TalosBackendEvidenceStore.record(context, new TalosBackendChoice.Evidence(
                TalosBackendChoice.OPENCL, DRIVER, TalosBackendChoice.Outcome.FAILED, 0L));
        TalosBackendEvidenceStore.record(context, new TalosBackendChoice.Evidence(
                TalosBackendChoice.OPENCL, DRIVER, TalosBackendChoice.Outcome.CORRECT, 9_500L));

        TalosBackendChoice.Evidence[] letta = TalosBackendEvidenceStore.load(context);
        assertEquals("una sola riga per (backend, driver), non due giudizi vivi",
                1, letta.length);
        assertEquals(TalosBackendChoice.Outcome.CORRECT, letta[0].outcome);
        assertEquals(9_500L, letta[0].ttftMs);
    }

    @Test
    public void backendDiversiConvivono() {
        TalosBackendEvidenceStore.record(context, new TalosBackendChoice.Evidence(
                TalosBackendChoice.CPU, DRIVER, TalosBackendChoice.Outcome.CORRECT, 43_200L));
        TalosBackendEvidenceStore.record(context, new TalosBackendChoice.Evidence(
                TalosBackendChoice.OPENCL, DRIVER, TalosBackendChoice.Outcome.CORRECT, 11_000L));

        assertEquals(2, TalosBackendEvidenceStore.load(context).length);
    }

    @Test
    public void ilVerdettoScrittoSiUsaDavveroNellaScelta() {
        // Non solo "si legge quello che si scrive": la lettura, passata a
        // choose(), produce la decisione che i numeri promettono.
        TalosBackendEvidenceStore.record(context, new TalosBackendChoice.Evidence(
                TalosBackendChoice.CPU, DRIVER, TalosBackendChoice.Outcome.CORRECT, 43_200L));
        TalosBackendEvidenceStore.record(context, new TalosBackendChoice.Evidence(
                TalosBackendChoice.OPENCL, DRIVER, TalosBackendChoice.Outcome.CORRECT, 11_000L));

        TalosBackendChoice.Decision decisione = TalosBackendChoice.choose(
                DRIVER, "none", TalosBackendEvidenceStore.load(context));

        assertEquals(TalosBackendChoice.OPENCL, decisione.backend);
        assertEquals("faster", decisione.reason);
    }

    @Test
    public void sopravviveAUnaNuovaIstanzaDelloStore() {
        // Lo store non ha stato in memoria di sua proprietà: ogni chiamata
        // legge/scrive SharedPreferences da capo. Questo lo prova aprendo un
        // secondo Context indipendente sullo stesso file.
        TalosBackendEvidenceStore.record(context, new TalosBackendChoice.Evidence(
                TalosBackendChoice.OPENCL, DRIVER, TalosBackendChoice.Outcome.CORRECT, 11_000L));

        Context secondoContesto = InstrumentationRegistry.getInstrumentation().getTargetContext();
        assertTrue("un secondo Context deve vedere la stessa scrittura",
                TalosBackendEvidenceStore.load(secondoContesto).length == 1);
    }
}
