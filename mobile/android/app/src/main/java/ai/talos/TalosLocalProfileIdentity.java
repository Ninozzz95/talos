package ai.talos;

import java.util.Objects;

/**
 * P0-2 — ogni fatto che può rendere una misura di prestazione non più vera.
 *
 * ⛔ {@link TalosBackendChoice.Evidence} identifica una misura solo con
 * `(backend, driver)` — corretto quando l'unica domanda era "questo backend
 * si apre e risponde bene su questo device", sbagliato per una domanda più
 * fine come "quanto ci mette QUESTO modello, con QUESTO motore". Il piano
 * sorgente (design.md §7.1) lo dice esplicitamente: le prestazioni cambiano
 * con l'architettura del modello, la sua quantizzazione, l'engine build — non
 * solo col driver.
 *
 * ⛔ Non è la chiave completa che il documento sorgente disegna (§7.2,
 * `TalosLocalProfileKeyV1`, dodici campi). Cinque, non dodici: quelli per cui
 * esiste GIÀ una fonte vera in questo codice. `modelArchitecture`/
 * `modelFtype`/`trainedContext` richiederebbero leggere i metadati GGUF via
 * un nuovo export JNI che oggi non esiste; `socModel`/`cpuFeatureFingerprint`/
 * `backendDeviceId` non hanno alcuna fonte. Scriverli a mano — un valore
 * costante, dedotto, mai misurato — sarebbe esattamente l'errore che questo
 * stesso file esiste per prevenire altrove. Restano una nota per quando quelle
 * fonti esisteranno davvero, non un campo con un valore finto dentro.
 *
 * ⛔ `acceleratorDriver` qui è {@code buildFingerprint}: il documento stesso
 * lo ammette come ripiego conservativo ("may remain a conservative
 * invalidation key"). Il vero identificativo del driver OpenCL esiste già nei
 * log nativi ("OpenCL driver: OpenCL 3.0 QUALCOMM build: 0800.74...",
 * misurato in P0-1) ma non è ancora esposto via JNI — estrarlo è lavoro
 * futuro esplicito, non questo blocco.
 *
 * Immutabile e confrontabile per valore: due identità sono la STESSA
 * identità se e solo se ogni campo combacia. Un profilo la cui identità non
 * combacia più con quella corrente non è falso — non si sa più se sia vero,
 * ed è la differenza fra {@code incomplete} e {@code false} che il piano
 * sorgente chiede esplicitamente (§7.5).
 */
public final class TalosLocalProfileIdentity {

    public final String engineBuild;
    public final String modelSha256;
    public final long modelBytes;
    public final int androidSdk;
    public final String buildFingerprint;

    public TalosLocalProfileIdentity(String engineBuild, String modelSha256, long modelBytes,
                                      int androidSdk, String buildFingerprint) {
        this.engineBuild = engineBuild == null ? "" : engineBuild;
        this.modelSha256 = modelSha256 == null ? "" : modelSha256;
        this.modelBytes = modelBytes;
        this.androidSdk = androidSdk;
        this.buildFingerprint = buildFingerprint == null ? "" : buildFingerprint;
    }

    /**
     * L'identità DAVVERO in vigore adesso, su questo device, con questo
     * motore — non letta da una registrazione passata.
     *
     * @param modelSha256 e @param modelBytes vengono dal chiamante apposta:
     *     calcolarli è I/O sul file (potenzialmente un file da gigabyte), e
     *     questa classe resta pura — non tocca un filesystem.
     */
    public static TalosLocalProfileIdentity current(String modelSha256, long modelBytes) {
        return new TalosLocalProfileIdentity(
                TalosLlamaNative.nativeEngineBuild(),
                modelSha256,
                modelBytes,
                android.os.Build.VERSION.SDK_INT,
                android.os.Build.FINGERPRINT);
    }

    @Override
    public boolean equals(Object other) {
        if (this == other) return true;
        if (!(other instanceof TalosLocalProfileIdentity)) return false;
        TalosLocalProfileIdentity that = (TalosLocalProfileIdentity) other;
        return modelBytes == that.modelBytes
                && androidSdk == that.androidSdk
                && engineBuild.equals(that.engineBuild)
                && modelSha256.equals(that.modelSha256)
                && buildFingerprint.equals(that.buildFingerprint);
    }

    @Override
    public int hashCode() {
        return Objects.hash(engineBuild, modelSha256, modelBytes, androidSdk, buildFingerprint);
    }

    @Override
    public String toString() {
        return "TalosLocalProfileIdentity{engineBuild=" + engineBuild
                + ", modelSha256=" + modelSha256 + ", modelBytes=" + modelBytes
                + ", androidSdk=" + androidSdk + ", buildFingerprint=" + buildFingerprint + '}';
    }
}
