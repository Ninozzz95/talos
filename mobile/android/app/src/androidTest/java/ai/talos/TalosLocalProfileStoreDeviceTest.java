package ai.talos;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import android.content.Context;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;

/**
 * P0-2 — {@link TalosLocalProfileStore} fa esattamente quello che promette
 * su un {@code Context}/{@code SharedPreferences} veri, non su una finzione.
 * Stesso spirito di {@link TalosBackendEvidenceStoreDeviceTest}: se questo
 * file passa, lo store si comporta così anche sul dispositivo che lo
 * eseguirà per davvero.
 */
@RunWith(AndroidJUnit4.class)
public class TalosLocalProfileStoreDeviceTest {

    private static final TalosLocalProfileIdentity IDENTITA = new TalosLocalProfileIdentity(
            "b419-dc72703", "d854adc23e311c53", 1_282_439_264L, 36, "fingerprint/1");

    private Context context;
    private String prima_profili;
    private String prima_evidenza;

    /**
     * ⛔⛔⛔ SALVA, non solo pulisce — MISURATO su questo stesso device: la
     * prima versione di questo file cancellava `talos_backend_evidence`
     * incondizionatamente in `@Before`/`@After`, e la prima volta che
     * questa classe è girata dopo che P0-2 aveva scritto un profilo VERO
     * (premuto per davvero, non un dato di test) quel profilo è sparito —
     * cancellato dal mio stesso `@After`. Un test che pulisce per isolarsi
     * NON deve distruggere ciò che c'era prima su un device che non è
     * effimero: si LEGGE lo stato, si pulisce per il test, e si RIPRISTINA
     * esattamente quello che c'era — vuoto o pieno che fosse.
     */
    @Before
    public void pulisci() {
        context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        prima_profili = context.getSharedPreferences("talos_local_profile", Context.MODE_PRIVATE)
                .getString("profiles_v1", null);
        prima_evidenza = context.getSharedPreferences("talos_backend_evidence", Context.MODE_PRIVATE)
                .getString("evidence_v1", null);
        context.getSharedPreferences("talos_local_profile", Context.MODE_PRIVATE)
                .edit().clear().commit();
        context.getSharedPreferences("talos_backend_evidence", Context.MODE_PRIVATE)
                .edit().clear().commit();
    }

    /**
     * ⛔⛔ Non basta il {@code @Before}: l'ordine con cui JUnit esegue i
     * metodi di questa classe non è quello di dichiarazione, ed è l'ULTIMO
     * test — qualunque sia — a decidere cosa resta sul disco quando la
     * classe finisce. Ripristinare qui, non solo pulire, rende la garanzia
     * vera indipendentemente dall'ordine: quello che c'era su questo device
     * PRIMA di questa classe c'è ANCHE dopo.
     */
    @After
    public void ripristina() {
        android.content.SharedPreferences.Editor profili = context
                .getSharedPreferences("talos_local_profile", Context.MODE_PRIVATE).edit().clear();
        if (prima_profili != null) profili.putString("profiles_v1", prima_profili);
        profili.commit();
        android.content.SharedPreferences.Editor evidenza = context
                .getSharedPreferences("talos_backend_evidence", Context.MODE_PRIVATE).edit().clear();
        if (prima_evidenza != null) evidenza.putString("evidence_v1", prima_evidenza);
        evidenza.commit();
    }

    private static TalosLocalProfile profilo(String backend, String device, long ttftMs) {
        return new TalosLocalProfile(
                IDENTITA, backend, device, TalosBackendChoice.Outcome.CORRECT, ttftMs,
                123_456_789L, TalosLocalProfile.Level.Q1, 20.0);
    }

    @Test
    public void unTelefonoNuovoNonHaProfili() {
        assertEquals(0, TalosLocalProfileStore.load(context).length);
    }

    @Test
    public void unaRegistrazioneSopravviveAllaLettura() {
        TalosLocalProfileStore.record(context, profilo(TalosBackendChoice.OPENCL, "GPUOpenCL", 11_000L));

        TalosLocalProfile[] letti = TalosLocalProfileStore.load(context);
        assertEquals(1, letti.length);
        assertEquals(TalosBackendChoice.OPENCL, letti[0].backendRegistry);
        assertEquals("GPUOpenCL", letti[0].backendDevice);
        assertEquals(TalosBackendChoice.Outcome.CORRECT, letti[0].outcome);
        assertEquals(11_000L, letti[0].ttftMs);
        assertEquals(IDENTITA, letti[0].identity);
    }

    @Test
    public void unaSecondaRegistrazioneNelloStessoPuntoSostituisceLaPrima() {
        TalosLocalProfileStore.record(context, profilo(TalosBackendChoice.OPENCL, "GPUOpenCL", 20_000L));
        TalosLocalProfileStore.record(context, profilo(TalosBackendChoice.OPENCL, "GPUOpenCL", 11_000L));

        TalosLocalProfile[] letti = TalosLocalProfileStore.load(context);
        assertEquals("una sola riga per punto, non due giudizi vivi", 1, letti.length);
        assertEquals(11_000L, letti[0].ttftMs);
    }

    @Test
    public void backendDiversiConvivono() {
        TalosLocalProfileStore.record(context, profilo(TalosBackendChoice.CPU, null, 43_200L));
        TalosLocalProfileStore.record(context, profilo(TalosBackendChoice.OPENCL, "GPUOpenCL", 11_000L));

        assertEquals(2, TalosLocalProfileStore.load(context).length);
    }

    /**
     * Il punto centrale di PR 3: "engine/model/driver invalidation". Un
     * profilo misurato sotto un engine build vecchio non deve comparire
     * quando si chiede solo ciò che vale ORA — ma resta sul disco (§7.5,
     * "incomplete, not false"): {@link #unProfiloInvalidoNonSiCancellaDalDisco}
     * lo prova AL CONTRARIO.
     */
    @Test
    public void unEngineBuildDiversoRendeIlProfiloInvisibileALoadValid() {
        TalosLocalProfileStore.record(context, profilo(TalosBackendChoice.OPENCL, "GPUOpenCL", 11_000L));

        TalosLocalProfileIdentity identitaNuova = new TalosLocalProfileIdentity(
                "b420-ffffff0", IDENTITA.modelSha256, IDENTITA.modelBytes,
                IDENTITA.androidSdk, IDENTITA.buildFingerprint);

        assertEquals("l'engine è cambiato: il profilo vecchio non è più affidabile",
                0, TalosLocalProfileStore.loadValid(context, identitaNuova).length);
        assertEquals("sotto l'identità con cui è stato scritto resta valido",
                1, TalosLocalProfileStore.loadValid(context, IDENTITA).length);
    }

    /** AL CONTRARIO del test sopra: invisibile a loadValid non vuol dire cancellato da load. */
    @Test
    public void unProfiloInvalidoNonSiCancellaDalDisco() {
        TalosLocalProfileStore.record(context, profilo(TalosBackendChoice.OPENCL, "GPUOpenCL", 11_000L));

        TalosLocalProfileIdentity identitaNuova = new TalosLocalProfileIdentity(
                "b420-ffffff0", IDENTITA.modelSha256, IDENTITA.modelBytes,
                IDENTITA.androidSdk, IDENTITA.buildFingerprint);
        TalosLocalProfileStore.loadValid(context, identitaNuova); // sola lettura, non deve toccare niente

        assertEquals("una lettura filtrata non deve aver cancellato la riga vecchia",
                1, TalosLocalProfileStore.load(context).length);
    }

    @Test
    public void sopravviveAUnaNuovaIstanzaDelloStore() {
        TalosLocalProfileStore.record(context, profilo(TalosBackendChoice.OPENCL, "GPUOpenCL", 11_000L));

        Context secondoContesto = InstrumentationRegistry.getInstrumentation().getTargetContext();
        assertTrue("un secondo Context deve vedere la stessa scrittura",
                TalosLocalProfileStore.load(secondoContesto).length == 1);
    }

    /** Non è un doppione dello store esistente: convivono sotto chiavi diverse, senza vedersi a vicenda. */
    @Test
    public void nonCondivideSpazioConTalosBackendEvidenceStore() {
        context.getSharedPreferences("talos_backend_evidence", Context.MODE_PRIVATE)
                .edit().clear().commit();
        TalosBackendEvidenceStore.record(context, new TalosBackendChoice.Evidence(
                TalosBackendChoice.OPENCL, "fingerprint/1", TalosBackendChoice.Outcome.CORRECT, 11_000L));

        assertEquals("il nuovo store non deve leggere ciò che il vecchio ha scritto",
                0, TalosLocalProfileStore.load(context).length);
    }

    /**
     * P0-3, AL CONTRARIO — non un caso di laboratorio: una riga ESATTAMENTE
     * così esisteva già su questo Pad prima di questo blocco (verificato con
     * la qualificazione reale eseguita in P0-2, che non scriveva
     * `qualificationLevel` perché il campo non esisteva ancora). Se questo
     * test si rompesse, ogni profilo scritto prima di oggi diventerebbe
     * illeggibile — la riga singola corrotta che leggiRiga() scarta in
     * silenzio.
     */
    @Test
    public void unaRigaScrittaPrimaDiQuestoBloccoSiLeggeComeQ1() {
        String rigaSenzaLivello = "[{\"engineBuild\":\"" + IDENTITA.engineBuild
                + "\",\"modelSha256\":\"" + IDENTITA.modelSha256
                + "\",\"modelBytes\":" + IDENTITA.modelBytes
                + ",\"androidSdk\":" + IDENTITA.androidSdk
                + ",\"buildFingerprint\":\"" + IDENTITA.buildFingerprint
                + "\",\"backendRegistry\":\"cpu\",\"backendDevice\":null"
                + ",\"outcome\":\"CORRECT\",\"ttftMs\":501,\"measuredAtMs\":1000}]";
        context.getSharedPreferences("talos_local_profile", Context.MODE_PRIVATE)
                .edit().putString("profiles_v1", rigaSenzaLivello).commit();

        TalosLocalProfile[] letti = TalosLocalProfileStore.load(context);
        assertEquals("la riga vecchia non deve sparire", 1, letti.length);
        assertEquals("senza il campo, il default onesto è Q1 — l'unico livello che scriveva allora",
                TalosLocalProfile.Level.Q1, letti[0].qualificationLevel);
    }
}
