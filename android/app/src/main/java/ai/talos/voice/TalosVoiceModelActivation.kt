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

    fun installRootDirectory(externalFilesDir: File, installRoot: String): File {
        val externalRoot = externalFilesDir.canonicalFile
        val resolved = resolveRelative(externalRoot, installRoot)
        require(resolved.parentFile == externalRoot) { "install root must be one direct child" }
        return resolved
    }

    fun activeDirectory(externalFilesDir: File, installRoot: String, targetDir: String): File =
        targetDirectory(externalFilesDir, installRoot, targetDir, suffix = "")

    fun stagingDirectory(externalFilesDir: File, installRoot: String, targetDir: String): File =
        targetDirectory(externalFilesDir, installRoot, targetDir, suffix = STAGING_SUFFIX)

    fun previousDirectory(externalFilesDir: File, installRoot: String, targetDir: String): File =
        targetDirectory(externalFilesDir, installRoot, targetDir, suffix = PREVIOUS_SUFFIX)

    private fun targetDirectory(
        externalFilesDir: File,
        installRoot: String,
        targetDir: String,
        suffix: String,
    ): File {
        val root = installRootDirectory(externalFilesDir, installRoot)
        val resolved = resolveRelative(root, targetDir + suffix)
        require(resolved.parentFile == root) { "target directory must be one direct child" }
        return resolved
    }

    private fun resolveRelative(root: File, relativePath: String): File {
        val normalized = relativePath.replace('\\', '/')
        require(normalized.isNotBlank()) { "relative path must not be blank" }
        require(!normalized.startsWith('/') && !Regex("^[A-Za-z]:").containsMatchIn(normalized)) {
            "absolute path is not allowed: $relativePath"
        }
        val segments = normalized.split('/')
        require(segments.none { it.isBlank() || it == "." || it == ".." }) {
            "unsafe relative path: $relativePath"
        }
        val canonicalRoot = root.canonicalFile
        val resolved = File(canonicalRoot, normalized).canonicalFile
        require(resolved.path.startsWith(canonicalRoot.path + File.separator)) {
            "path escapes installation root: $relativePath"
        }
        return resolved
    }

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
    ): Outcome = stage(externalFilesDir, "moss", artifact)

    fun stage(
        externalFilesDir: File,
        installRoot: String,
        artifact: TalosVoiceModelManifest.Artifact,
    ): Outcome {
        val store = TalosModelStore(externalFilesDir)
        val staging = stagingDirectory(externalFilesDir, installRoot, artifact.targetDir)

        for (file in artifact.files) {
            resolveRelative(staging, file.targetPath)
            val slot = store.slot(artifact.repo, artifact.revision, file.path)
            if (!slot.finished.isFile || slot.finished.length() != file.size) {
                return Outcome.Incomplete(file.path)
            }
        }

        return try {
            if (staging.isDirectory) staging.deleteRecursively()
            for (file in artifact.files) {
                val slot = store.slot(artifact.repo, artifact.revision, file.path)
                val target = resolveRelative(staging, file.targetPath)
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
        return promote(externalFilesDir, "moss", targetDir)
    }

    fun promote(externalFilesDir: File, installRoot: String, targetDir: String): Outcome {
        val root = installRootDirectory(externalFilesDir, installRoot)
        val active = activeDirectory(externalFilesDir, installRoot, targetDir)
        val staging = stagingDirectory(externalFilesDir, installRoot, targetDir)
        val previous = previousDirectory(externalFilesDir, installRoot, targetDir)

        if (!staging.isDirectory) return Outcome.Failed("no-staging")

        return try {
            // Uno scarto di una precedente attivazione interrotta: mai
            // lasciarla bloccare questa, ma nemmeno cancellare qualcosa che
            // potrebbe ancora servire senza prima provare a finirla - vedi
            // [recover].
            root.mkdirs()
            if (previous.isDirectory && active.isDirectory && !previous.deleteRecursively()) {
                return Outcome.Failed("previous-delete")
            }
            if (active.isDirectory) {
                Files.move(active.toPath(), previous.toPath(), StandardCopyOption.ATOMIC_MOVE)
                fsync(root)
            }
            Files.move(staging.toPath(), active.toPath(), StandardCopyOption.ATOMIC_MOVE)
            fsync(root)
            Outcome.Activated(active)
        } catch (io: IOException) {
            Outcome.Failed(io.message ?: "io")
        }
    }

    /** Restores the pre-promotion version after post-promotion verification failed. */
    fun restorePrevious(externalFilesDir: File, installRoot: String, targetDir: String): Boolean {
        val root = installRootDirectory(externalFilesDir, installRoot)
        val active = activeDirectory(externalFilesDir, installRoot, targetDir)
        val previous = previousDirectory(externalFilesDir, installRoot, targetDir)
        return try {
            if (active.exists() && !active.deleteRecursively()) return false
            if (previous.isDirectory) {
                Files.move(previous.toPath(), active.toPath(), StandardCopyOption.ATOMIC_MOVE)
            }
            fsync(root)
            true
        } catch (io: IOException) {
            false
        }
    }

    /**
     * Pulizia dopo il rilascio del lease (blueprint §39 Fase 5). Non tocca
     * mai `.staging` - solo una promozione riuscita azzera quello.
     */
    fun cleanupPrevious(externalFilesDir: File, targetDir: String): Boolean {
        return cleanupPrevious(externalFilesDir, "moss", targetDir)
    }

    fun cleanupPrevious(externalFilesDir: File, installRoot: String, targetDir: String): Boolean {
        val root = installRootDirectory(externalFilesDir, installRoot)
        val previous = previousDirectory(externalFilesDir, installRoot, targetDir)
        val removed = !previous.exists() || previous.deleteRecursively()
        if (removed) fsync(root)
        return removed
    }

    /**
     * ⛔⛔ TROVATO 22/8, owner: gli ONNX del motore voce comparivano
     * PERMANENTEMENTE nell'elenco dei modelli locali della CHAT — lo stesso
     * selettore dei GGUF nel composer.
     *
     * Causa: [stage] COPIA (mai sposta) dalla cache generica di
     * `TalosModelStore` — deliberato, "la cache resta il testimone finché la
     * promozione intera non è passata" (commento sopra). Ma nessuno
     * ripuliva quella cache DOPO che la promozione era davvero passata, e
     * `TalosModelStore.finished()` — che `installed()` lato Kotlin usa per
     * il picker dei modelli LLM — non distingue un artifact voce da un
     * GGUF vero: "finito" è definito per esclusione (né `.part` né
     * `.talosdl` né `.prefix`), e un file voce copiato con successo è
     * esattamente questo. ⇒ ~763 MB duplicati per sempre (cache generica +
     * `moss/` attivo), e visibili dove non dovrebbero esserlo.
     *
     * Chiamata solo DOPO che la promozione è certa (mai da [stage], mai a
     * metà) — cancellare la cache prima significherebbe perdere l'unica
     * copia se [promote] fallisse a metà. Idempotente: cancellare un file
     * già assente è un no-op silenzioso, sicuro da richiamare a ogni
     * [recover] — importante per chi ha installato il motore voce PRIMA di
     * questa cura: la cache vecchia si ripulisce da sola al prossimo avvio.
     *
     * Pattern di pulizia confermato con ricerca web (javathinking.com,
     * mkyong.com, baeldung.com): risalire dal file cancellato eliminando
     * solo cartelle rimaste vuote, fermandosi alla prima non vuota.
     */
    fun cleanupSourceCache(externalFilesDir: File, artifact: TalosVoiceModelManifest.Artifact) {
        val store = TalosModelStore(externalFilesDir)
        val modelsRoot = File(externalFilesDir, "models")
        for (file in artifact.files) {
            val slot = store.slot(artifact.repo, artifact.revision, file.path)
            slot.finished.delete()
            pruneEmptyAncestors(slot.finished.parentFile, modelsRoot)
        }
    }

    /**
     * Risale cancellando cartelle rimaste vuote dopo un file cancellato,
     * fermandosi a (senza mai cancellare) [stopAt] — che è sempre
     * `externalFilesDir/models`, la radice condivisa con i GGUF veri: non
     * va toccata nemmeno se momentaneamente vuota.
     */
    private fun pruneEmptyAncestors(start: File?, stopAt: File) {
        var dir = start
        while (dir != null && dir != stopAt && dir.isDirectory) {
            val children = dir.listFiles() ?: break
            if (children.isNotEmpty()) break
            if (!dir.delete()) break
            dir = dir.parentFile
        }
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
    fun recover(externalFilesDir: File, artifact: TalosVoiceModelManifest.Artifact): Outcome {
        return recover(externalFilesDir, "moss", artifact)
    }

    fun recover(
        externalFilesDir: File,
        installRoot: String,
        artifact: TalosVoiceModelManifest.Artifact,
    ): Outcome {
        val targetDir = artifact.targetDir
        val staging = stagingDirectory(externalFilesDir, installRoot, targetDir)
        if (staging.isDirectory) {
            val outcome = promote(externalFilesDir, installRoot, targetDir)
            if (outcome is Outcome.Activated) {
                cleanupPrevious(externalFilesDir, installRoot, targetDir)
                cleanupSourceCache(externalFilesDir, artifact)
            }
            return outcome
        }
        cleanupPrevious(externalFilesDir, installRoot, targetDir)
        val active = activeDirectory(externalFilesDir, installRoot, targetDir)
        // ⛔ Anche nel ramo quieto (niente da promuovere): un processo può
        // essere morto DOPO promote() ma PRIMA della pulizia della cache
        // generica di una corsa precedente, o l'attivazione può essere
        // riuscita in una build senza questa cura - senza questa riga la
        // cache resterebbe piena per sempre. cleanupSourceCache è
        // idempotente.
        if (active.isDirectory) cleanupSourceCache(externalFilesDir, artifact)
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
