package ai.talos;

import java.io.File;
import java.io.IOException;
import java.io.RandomAccessFile;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.List;

/**
 * Where four gigabytes live while they are arriving.
 *
 * Three things happen here that do not happen in the apps this one is measured
 * against.
 *
 * A partial download is never reachable under the name a loader will open. Two
 * of nine on-device model apps read at code level get this right; the rest
 * leave a truncated file where the finished one belongs, and a truncated GGUF
 * does not crash — it loads and answers, badly, and nobody can tell.
 *
 * The space is claimed before the transfer starts, so it cannot be lost at 90%
 * to something else on the phone. That has a consequence which governs this
 * whole class: A RESERVED FILE IS ALREADY ITS FULL LENGTH. `length()` therefore
 * says nothing about how much has been downloaded, and the sidecar is the only
 * record of that — see `resume()`.
 *
 * And a file path from the Hub is treated as what it is: a string chosen by
 * whoever published the repository, which anyone in the world may do. `../` in
 * a filename is how an app that trusts its server writes wherever it likes on
 * someone's phone.
 *
 * No Android APIs — the rules above are provable on the JVM, in the ordinary
 * gate, without a device. Reserving space is the one thing that genuinely needs
 * the platform, so it arrives as an interface.
 */
public final class TalosModelStore {

    public static final String PARTIAL_SUFFIX = ".part";
    public static final String SIDECAR_SUFFIX = ".talosdl";
    /**
     * ⛔ Un prefisso congelato NON è un modello.
     *
     * È la cache del prompt di sistema più i trentotto schemi dei tool, e a
     * f16 pesa quasi un gigabyte: senza questa riga comparirebbe nell'elenco
     * dei modelli dell'utente, dove sembrerebbe un modello scaricato per
     * sbaglio — e chi lo cancellasse si troverebbe la chat improvvisamente più
     * lenta senza sapere perché.
     *
     * Lo spazio non è nascosto: va mostrato dove si mostrano le cache, non
     * dove si mostrano i modelli.
     */
    public static final String PREFIX_CACHE_SUFFIX = ".prefix";

    private static final String MAGIC = "talos-dl 1";
    private static final String TERMINATOR = "end";

    private final File root;

    public TalosModelStore(File root) {
        this.root = root;
    }

    /**
     * Claiming the space up front.
     *
     * On Android this is `StorageManager.allocateBytes`, which the platform
     * implements with `posix_fallocate` and falls back to `ftruncate` where the
     * filesystem cannot do better. An interface because that is the one part of
     * this class a JVM test cannot exercise honestly — and because the honest
     * fallback matters: on exFAT the reservation is sparse and therefore not
     * really a reservation, which is survivable only because models live in
     * app-private storage, which is not exFAT.
     */
    public interface Reservation {
        void reserve(RandomAccessFile file, long totalBytes) throws IOException;
    }

    /** What a resume is allowed to believe: bytes, and a hash state or nothing. */
    public static final class Resume {
        public final long haveBytes;
        /** Null means re-read what is there to hash it — slow, but never wrong. */
        public final String hashState;

        Resume(long haveBytes, String hashState) {
            this.haveBytes = haveBytes;
            this.hashState = hashState;
        }
    }

    /** A download nobody is watching any more, so the storage screen can say so. */
    public static final class Leftover {
        public final String path;
        public final long bytes;

        Leftover(String path, long bytes) {
            this.path = path;
            this.bytes = bytes;
        }
    }

    public static final class Slot {
        public final File finished;
        public final File partial;
        public final File sidecar;

        Slot(File finished) {
            this.finished = finished;
            this.partial = new File(finished.getPath() + PARTIAL_SUFFIX);
            this.sidecar = new File(finished.getPath() + SIDECAR_SUFFIX);
        }

        /**
         * Claim the whole file before asking for a single byte.
         *
         * Checking free space and hoping is what produces a download that dies
         * at 90%: the space was there at the start and something else took it
         * during the hours in between. This makes the shortfall a refusal the
         * user can act on — free two gigabytes, or take a smaller quantisation.
         */
        public void prepare(long totalBytes, Reservation reservation) throws IOException {
            partial.getParentFile().mkdirs();
            try (RandomAccessFile handle = new RandomAccessFile(partial, "rw")) {
                if (handle.length() < totalBytes) reservation.reserve(handle, totalBytes);
                handle.getFD().sync();
            }
        }

        /**
         * How much of the reserved file is actually downloaded.
         *
         * THE SIDECAR IS THE ONLY ANSWER. The file is its full length from the
         * moment the space is claimed, so reading progress off `length()` would
         * report a fresh, empty, four-gigabyte reservation as a finished
         * download — and the hash would then be computed over four gigabytes of
         * zeroes and fail, if anyone were even asking it to.
         *
         * With no readable sidecar, the honest answer is zero. The file stays:
         * it is the reservation, and throwing it away would give the space back
         * to whatever is competing for it.
         */
        /**
         * @param totalBytes the length of the file being resumed FOR.
         *
         * Passed in rather than read off the partial, because the partial does
         * not shrink: a second attempt at a smaller revision of the same path
         * would leave the old, larger reservation in place and its note would
         * still look consistent. The caller is the only one who knows which
         * file it is asking about.
         */
        public Resume resume(long totalBytes) {
            if (!partial.isFile()) {
                sidecar.delete();
                return new Resume(0, null);
            }
            String[] recorded = readSidecar(totalBytes);
            if (recorded == null) return new Resume(0, null);

            long checkpointed = Long.parseLong(recorded[0]);
            if (checkpointed > partial.length()) {
                // The reservation shrank under us, so the record describes bytes
                // that are not there. Start over rather than hash a hole.
                return new Resume(0, null);
            }
            return new Resume(checkpointed, recorded[1]);
        }

        /**
         * Record a durable point. THE CALLER MUST HAVE fsync'd THE DATA FIRST —
         * a checkpoint that outruns the bytes it describes is the one failure
         * `resume()` cannot repair.
         *
         * Written to a neighbour and renamed, never edited in place: this write
         * happens every few seconds for hours, and a torn one costs the whole
         * download. It also has to survive the Task Manager, which kills the
         * process outright and never calls `onStopJob` — so nothing may live
         * only in memory, waiting for a shutdown hook that will not run.
         */
        public void checkpoint(long totalBytes, long haveBytes, String hashState) {
            String body = MAGIC + "\n"
                    + "have=" + haveBytes + "\n"
                    // The length of the file this note is ABOUT.
                    //
                    // Without it the sidecar was trusted on nothing but its own
                    // say-so: a note left by an attempt at a different revision
                    // of the same path would be read as progress against the
                    // new one, and the hash would then be computed over a
                    // mixture of two files. Found by an adversarial review,
                    // 2026-08-01.
                    + "of=" + totalBytes + "\n"
                    + "hash=" + (hashState == null ? "" : hashState) + "\n"
                    + TERMINATOR + "\n";
            File scratch = new File(sidecar.getPath() + ".tmp");
            try {
                sidecar.getParentFile().mkdirs();
                Files.write(scratch.toPath(), body.getBytes(StandardCharsets.UTF_8));
                Files.move(scratch.toPath(), sidecar.toPath(),
                        StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
            } catch (IOException failed) {
                scratch.delete();
            }
        }

        /**
         * Publish under the real name, atomically, and clear the notes.
         *
         * The truncation is not housekeeping: a reservation may hand back more
         * room than was asked for, and a model file one byte longer than the
         * repository says is a model file that fails its own hash.
         */
        public void finish(long totalBytes) throws IOException {
            try (RandomAccessFile handle = new RandomAccessFile(partial, "rw")) {
                if (handle.length() != totalBytes) handle.setLength(totalBytes);
                handle.getFD().sync();
            }
            finished.getParentFile().mkdirs();
            Files.move(partial.toPath(), finished.toPath(),
                    StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
            sidecar.delete();
        }

        public void discard() {
            partial.delete();
            sidecar.delete();
            new File(sidecar.getPath() + ".tmp").delete();
        }

        /** Null for anything unreadable: a wrong resume is worse than a slow one. */
        private String[] readSidecar(long totalBytes) {
            if (!sidecar.isFile()) return null;
            try {
                List<String> lines = Files.readAllLines(sidecar.toPath(), StandardCharsets.UTF_8);
                if (lines.size() < 4) return null;
                if (!MAGIC.equals(lines.get(0))) return null;
                if (!TERMINATOR.equals(lines.get(lines.size() - 1))) return null;
                String have = null;
                String hash = null;
                String of = null;
                for (String line : lines) {
                    if (line.startsWith("have=")) have = line.substring(5);
                    else if (line.startsWith("hash=")) hash = line.substring(5);
                    else if (line.startsWith("of=")) of = line.substring(3);
                }
                if (have == null || hash == null || hash.isEmpty()) return null;
                // A note about a file of a different length is a note about a
                // different file. Refusing it costs one re-download; trusting
                // it produces a hash computed across two of them.
                if (of == null || Long.parseLong(of) != totalBytes) return null;
                long parsed = Long.parseLong(have);
                if (parsed < 0) return null;
                return new String[] { String.valueOf(parsed), hash };
            } catch (IOException | RuntimeException unreadable) {
                return null;
            }
        }
    }

    public Slot slot(String repo, String revision, String path) {
        File directory = new File(new File(root, "models"), safe(repo) + File.separator + safe(revision));
        return new Slot(new File(directory, safe(path)));
    }

    /** Something the walk could not read, and the reason it could not. */
    public static final class Unreadable {
        public final String path;
        /** The exception's name and message — a cause, never a stack trace. */
        public final String reason;

        Unreadable(String path, String reason) {
            this.path = path;
            this.reason = reason;
        }
    }

    /**
     * What a walk of the store found, AND what it could not look at.
     *
     * The second half is the whole point of this type. `File.listFiles()`
     * returns null both for "this is not a directory" and for "you may not read
     * this", and the code that consumed it treated null as an empty list — so a
     * folder the app could not open was reported, all the way up to the model
     * picker, as "no models downloaded". Two opposite situations, one sentence:
     * one means "go and download something", the other means "something is
     * wrong and downloading again will not help".
     *
     * Returning both together rather than throwing is deliberate. One
     * unreadable folder must not hide the models in the folders beside it: the
     * user should still be able to run what is runnable, and still be told that
     * part of the answer is missing.
     */
    public static final class Listing {
        public final List<Leftover> entries;
        public final List<Unreadable> unreadable;

        Listing(List<Leftover> entries, List<Unreadable> unreadable) {
            this.entries = entries;
            this.unreadable = unreadable;
        }

        /** True when the walk is a complete answer rather than a partial one. */
        public boolean complete() {
            return unreadable.isEmpty();
        }
    }

    /**
     * Downloads nobody is watching any more.
     *
     * These matter more here than anywhere else: because the space is claimed
     * up front, an attempt abandoned after ten seconds still holds the whole
     * four gigabytes. A phone losing that much to something invisible shows the
     * user a number going down and nothing to point at.
     */
    public Listing leftovers() {
        return walk((name) -> name.endsWith(PARTIAL_SUFFIX));
    }

    /**
     * I prefissi congelati: la cache del prompt di sistema piu' gli schemi dei
     * tool.
     *
     * ⛔ Serve perche' nessuno li cancellava. Ne nasce uno per ogni combinazione
     * di modello, contesto, tipo di cache e interruttore del ragionamento, e a
     * f16 pesano quasi un gigabyte l'uno: senza uno sfratto, usare TALOS
     * riempie il telefono in silenzio. Il difetto peggiore di tutti — quello
     * che non da' nessun segnale finche' non e' tardi.
     *
     * Elencati a parte da {@link #finished()} apposta: **non sono modelli**, e
     * mostrarli fra i modelli farebbe cancellare all'utente una cache credendo
     * di liberare un modello, ritrovandosi la chat piu' lenta senza capire
     * perche'.
     */
    public Listing prefixCaches() {
        return walk((name) -> name.endsWith(PREFIX_CACHE_SUFFIX));
    }

    /**
     * The models that finished arriving — the ones that can actually be run.
     *
     * The mirror of {@link #leftovers()}, and needed for the same reason it was:
     * the store knew what had been abandoned and nothing knew what had SUCCEEDED,
     * so the engine had no way to be told which files it may open. A download
     * centre that can fetch a model and then cannot list it has completed half a
     * journey.
     *
     * "Finished" is defined by exclusion rather than by a manifest: a file that
     * is neither a partial nor a sidecar is one whose transfer ran to the end,
     * because {@link Slot#finish} renames into place only after the hash agrees.
     * A separate index of completed models would be a second truth to keep in
     * step with the disk, and the disk always wins that argument.
     */
    public Listing finished() {
        return walk((name) -> !name.endsWith(PARTIAL_SUFFIX)
                && !name.endsWith(SIDECAR_SUFFIX)
                && !name.endsWith(PREFIX_CACHE_SUFFIX));
    }

    /** Which filenames a walk keeps. The two walks differ by nothing else. */
    private interface Keep {
        boolean test(String fileName);
    }

    private Listing walk(Keep keep) {
        Listing listing = new Listing(new ArrayList<>(), new ArrayList<>());
        descend(new File(root, "models").toPath(), keep, listing);
        return listing;
    }

    /**
     * `java.nio` rather than `File.listFiles()`, for the one reason that
     * matters here: it THROWS, with a cause. `listFiles()` answers null to
     * "not a directory", to "permission denied" and to an I/O error alike, and
     * a caller cannot tell any of them from an empty folder. `AccessDeniedException`
     * and `NotDirectoryException` say which it was, and that sentence is what
     * eventually reaches the user.
     */
    private void descend(java.nio.file.Path directory, Keep keep, Listing into) {
        try (java.nio.file.DirectoryStream<java.nio.file.Path> stream =
                     Files.newDirectoryStream(directory)) {
            for (java.nio.file.Path entry : stream) {
                if (Files.isDirectory(entry)) {
                    descend(entry, keep, into);
                    continue;
                }
                java.nio.file.Path name = entry.getFileName();
                if (name == null || !keep.test(name.toString())) continue;
                try {
                    into.entries.add(new Leftover(entry.toAbsolutePath().toString(), Files.size(entry)));
                } catch (IOException unmeasurable) {
                    // A file that cannot even be measured is not a model that
                    // can be opened, and pretending it is zero bytes would put
                    // it in the picker to fail later, at the worst moment.
                    into.unreadable.add(new Unreadable(entry.toString(), describe(unmeasurable)));
                }
            }
        } catch (java.nio.file.NoSuchFileException absent) {
            // Nothing was ever downloaded. That is emptiness, not failure, and
            // calling it a failure would make every fresh install look broken.
        } catch (IOException | RuntimeException failed) {
            into.unreadable.add(new Unreadable(directory.toString(), describe(failed)));
        }
    }

    /** The cause in one line: enough to act on, never a stack trace. */
    private static String describe(Throwable failure) {
        String message = failure.getMessage();
        String kind = failure.getClass().getSimpleName();
        if (message == null || message.isEmpty()) return kind;
        String trimmed = message.length() > 200 ? message.substring(0, 200) : message;
        return kind + ": " + trimmed;
    }

    /**
     * Turn a string chosen by a stranger into a path that cannot leave its own
     * folder.
     *
     * Refusing rather than rewriting is deliberate: a rewritten name can collide
     * with a different file and overwrite it silently, which trades one bug for
     * a quieter one. Nested paths are ordinary on the Hub and stay allowed.
     */
    private static String safe(String value) {
        if (value == null || value.isEmpty()) {
            throw new IllegalArgumentException("empty path");
        }
        String[] segments = value.split("/", -1);
        StringBuilder out = new StringBuilder();
        for (String segment : segments) {
            if (segment.isEmpty() || ".".equals(segment) || "..".equals(segment)) {
                throw new IllegalArgumentException("path segment escapes its folder: " + value);
            }
            for (int i = 0; i < segment.length(); i += 1) {
                char c = segment.charAt(i);
                if (c == '\\' || c == ':' || c < 0x20 || c == 0x7f) {
                    throw new IllegalArgumentException("path segment is not a name: " + value);
                }
            }
            if (out.length() > 0) out.append(File.separatorChar);
            out.append(segment);
        }
        return out.toString();
    }
}
