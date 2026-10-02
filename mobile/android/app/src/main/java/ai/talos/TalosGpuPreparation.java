package ai.talos;

import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;

/**
 * ⭐ Punto 2 (01/10/2026) — i programmi della GPU pronti prima del primo uso.
 *
 * Misurato sul Pad (Adreno 830, Qwen3-4B): compilare i 197 programmi OpenCL costa **~16 s** nell'app di release e
 * **41-69 s** nella build di sviluppo (debuggable: il driver compila 3-4 volte più lento), e si pagava alla prima
 * apertura GPU dopo ogni aggiornamento; a cache calda l'apertura costa 10-11 s. La cache dei compilati c'era già
 * (`cl-program-cache`, upstream) ma stava in `getCodeCacheDir()`, che Android svuota «when your application is
 * upgraded, and when the entire platform is upgraded» (documentazione di `Context`).
 *
 * ⇒ La cache sta in `getNoBackupFilesDir()`: sopravvive agli aggiornamenti e resta fuori dal backup automatico, dove
 * non avrebbe senso (un binario vale solo per QUESTO dispositivo e QUESTO driver). MNN fa lo stesso in `filesDir`
 * (`llm.cpp` `setRuntimeHint`, `mnn_cachefile.bin`); llama.rn (PocketPal) non imposta la cartella e su Android la
 * cache si spegne da sola (`cl-program-cache.cpp:196-201`).
 *
 * Il timbro `.talos-pronta` dice «compilata tutta, per questo llama.cpp e questo sistema». La chiave upstream di
 * ogni binario contiene già sorgente, opzioni e driver, quindi un binario vecchio non si usa mai per errore: il
 * timbro serve a sapere SE c'è da compilare (precompilazione, riga onesta) e a togliere gli orfani di un pin vecchio.
 */
final class TalosGpuPreparation {

    static final String DIRECTORY = "ggml-opencl-cache";
    static final String STAMP_FILE = ".talos-pronta";
    /**
     * Passo 2 (01/10/2026): i modelli già «riscaldati» — i programmi dei loro formati e le varianti flash attention
     * delle loro forme sono nella cache. Un modello nuovo o cambiato si riscalda alla partenza successiva.
     */
    static final String MODELS_FILE = ".talos-modelli";

    /**
     * Il riscaldamento è in corso. Se l'app cade lì dentro (un driver che si rompe compilando), il segno resta: al
     * riavvio non si riscalda più, si preparano solo i programmi comuni. Niente ciclo di crash all'avvio.
     */
    static final String WARMING_FILE = ".talos-riscaldo-in-corso";

    private TalosGpuPreparation() {}

    /** La cartella della cache: persistente, fuori dal backup. */
    static File cacheDir(android.content.Context context) {
        return new File(context.getNoBackupFilesDir(), DIRECTORY);
    }

    /** Il timbro: la build del motore (pin llama.cpp) e l'impronta del sistema (driver). */
    static String stamp(String engineBuild, String fingerprint) {
        return (engineBuild == null ? "" : engineBuild) + "\n" + (fingerprint == null ? "" : fingerprint);
    }

    /** Vero solo se una compilazione completa è stata fatta per QUESTO timbro. */
    static boolean isReady(File dir, String stamp) {
        String scritto = read(new File(dir, STAMP_FILE));
        return scritto != null && scritto.equals(stamp);
    }

    /**
     * Un llama.cpp diverso compila sorgenti diverse: i binari del pin vecchio non verranno mai più letti. Si tolgono
     * insieme al timbro. Con lo stesso pin non si tocca niente (un sistema nuovo produce chiavi nuove da sé).
     */
    static void forgetOtherPins(File dir, String engineBuild) {
        String scritto = read(new File(dir, STAMP_FILE));
        if (scritto == null) return;
        String pin = scritto.contains("\n") ? scritto.substring(0, scritto.indexOf('\n')) : scritto;
        if (pin.equals(engineBuild == null ? "" : engineBuild)) return;
        File[] file = dir.listFiles();
        if (file == null) return;
        for (File f : file) {
            if (f.isFile() && (f.getName().endsWith(".clbin") || f.getName().equals(STAMP_FILE)
                    || f.getName().equals(MODELS_FILE) || f.getName().equals(WARMING_FILE))) {
                //noinspection ResultOfMethodCallIgnored
                f.delete();
            }
        }
    }

    /** Scritto solo dopo una compilazione completa riuscita. */
    static void markReady(File dir, String stamp) {
        try {
            if (!dir.isDirectory() && !dir.mkdirs()) return;
            File tmp = new File(dir, STAMP_FILE + ".tmp");
            Files.write(tmp.toPath(), stamp.getBytes(StandardCharsets.UTF_8));
            Files.move(tmp.toPath(), new File(dir, STAMP_FILE).toPath(),
                    java.nio.file.StandardCopyOption.REPLACE_EXISTING,
                    java.nio.file.StandardCopyOption.ATOMIC_MOVE);
        } catch (IOException ignored) {
            // Senza timbro si ricompila la volta dopo: mai un errore per chi apre.
        }
    }

    /** Chi è il modello per il riscaldamento: percorso, dimensione e data (cambiano se il file cambia). */
    static String modelKey(File model) {
        return model.getAbsolutePath() + "|" + model.length() + "|" + model.lastModified();
    }

    /** I modelli già riscaldati, una chiave per riga. */
    static java.util.Set<String> warmedModels(File dir) {
        java.util.Set<String> chiavi = new java.util.LinkedHashSet<>();
        String scritto = read(new File(dir, MODELS_FILE));
        if (scritto == null) return chiavi;
        for (String riga : scritto.split("\n")) {
            if (!riga.isEmpty()) chiavi.add(riga);
        }
        return chiavi;
    }

    /** Aggiunge i modelli appena riscaldati all'elenco (scrittura atomica). */
    static void markModelsWarmed(File dir, java.util.Collection<String> keys) {
        java.util.Set<String> tutte = warmedModels(dir);
        tutte.addAll(keys);
        try {
            if (!dir.isDirectory() && !dir.mkdirs()) return;
            File tmp = new File(dir, MODELS_FILE + ".tmp");
            Files.write(tmp.toPath(), String.join("\n", tutte).getBytes(StandardCharsets.UTF_8));
            Files.move(tmp.toPath(), new File(dir, MODELS_FILE).toPath(),
                    java.nio.file.StandardCopyOption.REPLACE_EXISTING,
                    java.nio.file.StandardCopyOption.ATOMIC_MOVE);
        } catch (IOException ignored) {
            // Senza elenco si riscalda di nuovo la volta dopo: costa poco, i programmi sono già in cache.
        }
    }

    /** Vero se si può riscaldare: nessun riscaldamento precedente è caduto. Lascia il segno «in corso». */
    static boolean beginWarming(File dir) {
        File segno = new File(dir, WARMING_FILE);
        if (segno.exists()) return false;
        try {
            if (!dir.isDirectory() && !dir.mkdirs()) return false;
            Files.write(segno.toPath(), new byte[0]);
            return true;
        } catch (IOException e) {
            // Senza segno non si sa se cadrebbe: meglio non provarci.
            return false;
        }
    }

    /** Il riscaldamento è finito senza cadere. */
    static void endWarming(File dir) {
        //noinspection ResultOfMethodCallIgnored
        new File(dir, WARMING_FILE).delete();
    }

    private static String read(File file) {
        try {
            if (!file.isFile()) return null;
            return new String(Files.readAllBytes(file.toPath()), StandardCharsets.UTF_8);
        } catch (IOException e) {
            return null;
        }
    }
}
