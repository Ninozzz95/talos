package ai.talos;

import java.util.concurrent.Callable;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.Supplier;

/**
 * ⛔ CODICE COL MOTORE LOCALE (ledger `LEDGER-CODICE-MOTORE-LOCALE-2026-10-18.md`): il motore locale aperto e il suo «un giro alla
 * volta», condivisi fra la chat (`TalosLlamaPlugin`) e il Codice (`TalosMotoreOspite`). Un solo caricamento del modello per
 * telefono: llama.cpp non regge due decode sullo stesso contesto, e il plugin già rifiutava il secondo (`TALOS_LLAMA_BUSY`)
 * invece di metterlo in coda. Il plugin usa questi stessi oggetti: per la chat niente cambia.
 */
final class TalosMotoreCondiviso {

    private TalosMotoreCondiviso() {}

    static final AtomicReference<TalosLlamaEngine> MOTORE = new AtomicReference<>(null);
    static final AtomicBoolean OCCUPATO = new AtomicBoolean(false);
    /**
     * L'ATTORE del motore: il motore si usa solo dal thread che l'ha aperto (`TalosLlamaEngine.soloAttore`, la difesa contro gli
     * use-after-free nativi). La chat apre, genera e chiude da qui; il Codice ci affida i suoi giri.
     */
    static final ExecutorService ATTORE = Executors.newSingleThreadExecutor(lavoro -> {
        Thread t = new Thread(lavoro, "talos-llama-attore");
        threadAttore = t;
        return t;
    });
    private static volatile Thread threadAttore;
    /** Il percorso del modello aperto (`null` se nessuno): il Codice lo dice a r4 come nome del modello. */
    static final AtomicReference<String> PERCORSO = new AtomicReference<>(null);

    static Thread threadAttore() {
        return threadAttore;
    }

    /**
     * Un lavoro sul motore, dall'attore. Se si è GIÀ sull'attore si esegue subito: un secondo compito in coda dietro a quello che
     * lo aspetta non partirebbe mai.
     */
    static <T> T sullAttore(Callable<T> lavoro) throws Exception {
        if (Thread.currentThread() == threadAttore) return lavoro.call();
        try {
            return ATTORE.submit(lavoro).get();
        } catch (ExecutionException e) {
            Throwable causa = e.getCause();
            if (causa instanceof Exception) throw (Exception) causa;
            throw e;
        }
    }

    enum Esito { PRESO, NESSUN_MODELLO, OCCUPATO }

    /** Il motore per un giro del Codice; con `PRESO` il guardiano è acceso e va spento con `lascia()`. */
    static Esito prendi() {
        return prendi(MOTORE::get, OCCUPATO);
    }

    static void lascia() {
        OCCUPATO.set(false);
    }

    static <T> Esito prendi(Supplier<T> motore, AtomicBoolean occupato) {
        if (motore.get() == null) return Esito.NESSUN_MODELLO;
        if (!occupato.compareAndSet(false, true)) return Esito.OCCUPATO;
        // il modello chiuso fra il controllo e la presa: il guardiano non resta acceso per un motore che non c'è
        if (motore.get() == null) {
            occupato.set(false);
            return Esito.NESSUN_MODELLO;
        }
        return Esito.PRESO;
    }
}
