package ai.talos.voice

import ai.talos.TalosModelStore
import java.io.File
import java.io.IOException
import java.io.RandomAccessFile
import java.nio.file.Files
import java.nio.file.StandardCopyOption

/**
 * ⭐⭐⭐ FASE 5, BLOCCO 3 — L'ATTIVAZIONE ATOMICA.
 *
 * ## Perché non è "segna come attivo"
 *
 * Scoperto nel Blocco 2, leggendo `TalosModelStore` invece di assumerlo:
 * il motore di trasferimento scarica dentro una cache GENERICA
 * (`externalFilesDir/models/{repo}/{revision}/{path}`), diversa dalla
 * cartella `moss/{targetDir}` che `TalosVoiceModelManager`/
 * `TalosMossManifest` leggono davvero — la stessa che tutta la Fase 0-4 di
 * questa sessione ha provato sul Pad. Un file scaricato non è un file
 * installato finché non è lì.
 *
 * ⇒ L'attivazione è un RENAME di cartella (mai una copia byte per byte: su
 * un modello da centinaia di MB una copia raddoppia lo spazio e il tempo
 * per niente), e un rename fra due cartelle sotto lo stesso
 * `externalFilesDir` è ATOMICO — stesso volume, verificato in
 * `TalosTransferSession.rootFor()` == genitore di
 * `TalosVoiceModelManager.modelRoot()`.
 *
 * ## ⛔ Perché due rename e non uno
 *
 * `Files.move` non sostituisce una cartella non vuota. Il giro sicuro:
 *
 * 1. `moss/{targetDir}` (se c'è una versione precedente) → `moss/{targetDir}.previous`
 * 2. `moss/{targetDir}.staging` (appena riempita dalla cache) → `moss/{targetDir}`
 *
 * Il passo 2 è l'istante VERO di attivazione: prima di lui la vecchia
 * versione (o niente) risponde a `TalosVoiceModelManager.isPresent()`, dopo
 * risponde la nuova. Se il processo muore fra i due passi, [recover] al
 * prossimo avvio finisce il lavoro invece di lasciare un buco: lo stato è
 * sempre uno dei tre nomi di cartella, mai un file a metà.
 *
 * ## ⛔⛔ RICERCA 22/8 — «atomico» non vuol dire «durevole»
 *
 * `rename()` è atomico rispetto a chi guarda la cartella mentre il sistema
 * gira: nessun processo vede mai i due nomi contemporaneamente. Ma senza un
 * `fsync` sulla cartella GENITORE, ext4 non promette che quel rename
 * sopravviva a uno spegnimento vero — non un crash dell'app, uno vero, prima
 * che il journal scriva la nuova voce della cartella. È la STESSA disciplina
 * già in uso in `TalosTransferRunner.commit()`: «i byte sono sul piatto
 * PRIMA della nota che dichiara che ci sono». Qui la nota è il rename
 * stesso, e la cartella genitore (`moss/`) va sincronizzata dopo ogni
 * rename critico — non dopo lo staging (quello può ripartire da capo, la
 * cache regge), solo dopo i due passi che spostano `active`.
 *
 * Fonti: rename() atomico ma non durevole senza fsync della directory —
 * https://github.com/remzi-arpacidusseau/ostep-code/issues/10 ,
 * https://lwn.net/Articles/323067/ (ext4 non fa fsync della directory di
 * default) , https://lkml.iu.edu/hypermail/linux/kernel/0904.1/01180.html .
 * Anche: rename atomico solo se sorgente e destinazione condividono la
 * stessa cartella — vero qui, `moss/` per entrambi i lati di ogni rename.
 */
internal object TalosVoiceModelActivation {

    sealed class Outcome {
        /** La cartella attiva ora contiene la versione nuova. */
        data class Activated(val targetDir: File) : Outcome()
        /** Mancava almeno un file nella cache: nessuna promozione tentata. */
        data class Incomplete(val missingPath: String) : Outcome()
        data class Failed(val reason: String) : Outcome()
    }

    private const val STAGING_SUFFIX = ".staging"
    private const val PREVIOUS_SUFFIX = ".previous"

    /**
     * Sposta ogni file finito della cache nella cartella di staging
     * dell'artifact. ⛔ Usa [TalosModelStore] per il percorso di cache — mai
     * ricostruito a mano qui: la stessa escape/normalizzazione che il
     * downloader ha già applicato, o un percorso leggermente diverso
     * lascerebbe la promozione a cercare un file che in realtà è un
     * millimetro più in là.
     */
    fun stage(
        externalFilesDir: File,
        artifact: TalosVoiceModelManifest.Artifact,
    ): Outcome {
        val store = TalosModelStore(externalFilesDir)
        val mossRoot = File(externalFilesDir, "moss")
        val staging = File(mossRoot, artifact.targetDir + STAGING_SUFFIX)

        for (file in artifact.files) {
            val slot = store.slot(artifact.repo, artifact.revision, file.path)
            if (!slot.finished.isFile || slot.finished.length() != file.size) {
                return Outcome.Incomplete(file.path)
            }
        }

        return try {
            if (staging.isDirectory) staging.deleteRecursively()
            for (file in artifact.files) {
                val slot = store.slot(artifact.repo, artifact.revision, file.path)
                val target = File(staging, file.path)
                target.parentFile?.mkdirs()
                // ⛔ COPY, non move: la cache resta il testimone finché la
                // promozione intera non è passata - se un file a metà elenco
                // fallisse, i file già copiati non hanno tolto niente alla
                // cache, e un nuovo tentativo ripartirebbe da una cache
                // ancora intatta invece che da uno stato a metà smontato.
                Files.copy(slot.finished.toPath(), target.toPath(), StandardCopyOption.REPLACE_EXISTING)
            }
            Outcome.Activated(staging)
        } catch (io: IOException) {
            staging.deleteRecursively()
            Outcome.Failed(io.message ?: "io")
        }
    }

    /**
     * Il vero istante di attivazione: promuove uno staging già pronto
     * (ritorno di [stage]) al posto della cartella attiva. Separato da
     * [stage] perché il chiamante decide QUANDO — tipicamente solo dopo che
     * ENTRAMBI gli artifact del manifesto sono in staging, cosi una voce non
     * si trova mai con il TTS nuovo e il tokenizzatore vecchio.
     */
    fun promote(externalFilesDir: File, targetDir: String): Outcome {
        val mossRoot = File(externalFilesDir, "moss")
        val active = File(mossRoot, targetDir)
        val staging = File(mossRoot, targetDir + STAGING_SUFFIX)
        val previous = File(mossRoot, targetDir + PREVIOUS_SUFFIX)

        if (!staging.isDirectory) return Outcome.Failed("no-staging")

        return try {
            // Uno scarto di una precedente attivazione interrotta: mai
            // lasciarla bloccare questa, ma nemmeno cancellare qualcosa che
            // potrebbe ancora servire senza prima provare a finirla - vedi
            // [recover].
            if (previous.isDirectory) previous.deleteRecursively()
            if (active.isDirectory) {
                Files.move(active.toPath(), previous.toPath(), StandardCopyOption.ATOMIC_MOVE)
                fsync(mossRoot)
            }
            Files.move(staging.toPath(), active.toPath(), StandardCopyOption.ATOMIC_MOVE)
            fsync(mossRoot)
            Outcome.Activated(active)
        } catch (io: IOException) {
            Outcome.Failed(io.message ?: "io")
        }
    }

    /**
     * Pulizia dopo il rilascio del lease (blueprint §39 Fase 5). Non tocca
     * mai `.staging` - solo una promozione riuscita azzera quello.
     */
    fun cleanupPrevious(externalFilesDir: File, targetDir: String): Boolean {
        val previous = File(File(externalFilesDir, "moss"), targetDir + PREVIOUS_SUFFIX)
        val removed = !previous.exists() || previous.deleteRecursively()
        if (removed) fsync(File(externalFilesDir, "moss"))
        return removed
    }

    /**
     * ⛔⛔ RIPRESA DOPO UN PROCESSO MORTO A META - lo scenario che il
     * cancello di uscita del blueprint nomina esplicitamente
     * ("model-update scenarios pass"). Tre stati possibili al riavvio per
     * un `targetDir`, e ognuno ha UNA cosa giusta da fare:
     *
     * - `.staging` pronto → la promozione non è mai finita (partita o no):
     *   [promote] la completa. Idempotente: se `active` è già la versione
     *   nuova il secondo rename la sovrascrive con un identico.
     * - Solo `active` (nessuno `.staging`) → niente da fare, è lo stato
     *   quieto normale.
     * - `.previous` orfano (rimasto da un'attivazione riuscita mai ripulita,
     *   es. l'app è morta prima di [cleanupPrevious]) → lo ripulisce qui,
     *   non aspetta un altro giro di [TalosVoiceHost].
     */
    fun recover(externalFilesDir: File, targetDir: String): Outcome {
        val mossRoot = File(externalFilesDir, "moss")
        val staging = File(mossRoot, targetDir + STAGING_SUFFIX)
        if (staging.isDirectory) {
            val outcome = promote(externalFilesDir, targetDir)
            cleanupPrevious(externalFilesDir, targetDir)
            return outcome
        }
        cleanupPrevious(externalFilesDir, targetDir)
        val active = File(mossRoot, targetDir)
        return if (active.isDirectory) Outcome.Activated(active) else Outcome.Failed("not-installed")
    }

    /**
     * ⛔⛔ «Atomico» non vuol dire «durevole» — ricerca 22/8, vedi la nota in
     * cima al file. `rename()` è visibile a ogni processo nell'istante in
     * cui accade, ma senza sincronizzare la cartella GENITORE un vero
     * spegnimento (non un crash dell'app) può far tornare il journal ext4
     * indietro di un passo. Aprire la cartella come un file e chiamare
     * `sync()` sul suo descrittore è il modo POSIX di forzarlo — fallisce
     * silenziosamente solo se il filesystem non lo supporta affatto, ed è
     * meglio di niente anche allora: il [recover] al prossimo avvio resta
     * la vera rete di sicurezza.
     */
    private fun fsync(directory: File) {
        try {
            RandomAccessFile(directory, "r").use { it.fd.sync() }
        } catch (ignored: IOException) {
            // Vedi il commento sopra: [recover] è la rete di sicurezza vera.
        }
    }
}
