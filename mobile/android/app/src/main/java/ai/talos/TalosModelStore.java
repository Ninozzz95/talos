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
 * The bytes and the hash state always agree. Bytes are flushed before the
 * checkpoint is written, so a kill in between leaves more bytes on disk than
 * the hash covers; those are thrown away rather than counted. It costs at most
 * a checkpoint interval of transfer and buys the guarantee that a resumed
 * download can still prove what it downloaded.
 *
 * And a file path from the Hub is treated as what it is: a string chosen by
 * whoever published the repository, which anyone in the world may do. `../` in
 * a filename is how an app that trusts its server writes wherever it likes on
 * someone's phone.
 *
 * No Android APIs — so the rules above are provable on the JVM, in the ordinary
 * gate, without a device.
 */
public final class TalosModelStore {

    public static final String PARTIAL_SUFFIX = ".part";
    public static final String SIDECAR_SUFFIX = ".talosdl";

    private static final String MAGIC = "talos-dl 1";
    private static final String TERMINATOR = "end";

    private final File root;

    public TalosModelStore(File root) {
        this.root = root;
    }

    /** What a resume is allowed to believe: bytes, and a hash state or nothing. */
    public static final class Resume {
        public final long haveBytes;
        /** Null means re-read the file to hash it — slow, but never wrong. */
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
         * Reconcile what is on disk with what was last written down.
         *
         * The one invariant worth the whole class: on return, the bytes in the
         * partial file are exactly the bytes the returned hash state covers.
         */
        public Resume resume() {
            if (!partial.isFile()) {
                sidecar.delete();
                return new Resume(0, null);
            }
            long onDisk = partial.length();
            String[] recorded = readSidecar();
            if (recorded == null) return new Resume(onDisk, null);

            long checkpointed = Long.parseLong(recorded[0]);
            if (checkpointed > onDisk) {
                // The filesystem lost a write the checkpoint counted. The state
                // is ahead of reality, so it is worthless — re-read instead.
                return new Resume(onDisk, null);
            }
            if (checkpointed < onDisk) {
                // Bytes arrived after the last checkpoint and were never hashed.
                // Dropping them keeps the two in step; keeping them would produce
                // a hash that is quietly wrong about a file that is quietly fine.
                if (!truncateTo(checkpointed)) return new Resume(0, null);
            }
            return new Resume(checkpointed, recorded[1]);
        }

        /**
         * Record a durable point. THE CALLER MUST HAVE fsync'd THE DATA FIRST —
         * a checkpoint that outruns the bytes it describes is the one failure
         * `resume()` cannot repair without re-reading the file.
         *
         * Written to a neighbour and renamed, never edited in place: this write
         * happens every few seconds for hours, and a torn one costs the download.
         */
        public void checkpoint(long haveBytes, String hashState) {
            String body = MAGIC + "\n"
                    + "have=" + haveBytes + "\n"
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

        /** Publish the file under its real name, atomically, and clear the notes. */
        public void finish() throws IOException {
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
        private String[] readSidecar() {
            if (!sidecar.isFile()) return null;
            try {
                List<String> lines = Files.readAllLines(sidecar.toPath(), StandardCharsets.UTF_8);
                if (lines.size() < 4) return null;
                if (!MAGIC.equals(lines.get(0))) return null;
                if (!TERMINATOR.equals(lines.get(lines.size() - 1))) return null;
                String have = null;
                String hash = null;
                for (String line : lines) {
                    if (line.startsWith("have=")) have = line.substring(5);
                    else if (line.startsWith("hash=")) hash = line.substring(5);
                }
                if (have == null || hash == null || hash.isEmpty()) return null;
                long parsed = Long.parseLong(have);
                if (parsed < 0) return null;
                return new String[] { String.valueOf(parsed), hash };
            } catch (IOException | RuntimeException unreadable) {
                return null;
            }
        }

        private boolean truncateTo(long length) {
            try (RandomAccessFile handle = new RandomAccessFile(partial, "rw")) {
                handle.setLength(length);
                handle.getFD().sync();
                return true;
            } catch (IOException failed) {
                return false;
            }
        }
    }

    public Slot slot(String repo, String revision, String path) {
        File directory = new File(new File(root, "models"), safe(repo) + File.separator + safe(revision));
        return new Slot(new File(directory, safe(path)));
    }

    /**
     * Downloads nobody is watching any more.
     *
     * A phone that lost four gigabytes to an abandoned attempt shows the user a
     * number going down and nothing to point at. Naming them is what lets the
     * storage screen tell the truth.
     */
    public List<Leftover> leftovers() {
        List<Leftover> found = new ArrayList<>();
        collect(new File(root, "models"), found);
        return found;
    }

    private void collect(File directory, List<Leftover> into) {
        File[] entries = directory.listFiles();
        if (entries == null) return;
        for (File entry : entries) {
            if (entry.isDirectory()) collect(entry, into);
            else if (entry.getName().endsWith(PARTIAL_SUFFIX)) {
                into.add(new Leftover(entry.getAbsolutePath(), entry.length()));
            }
        }
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
