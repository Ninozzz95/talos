package ai.talos;

import android.content.Context;
import android.util.AtomicFile;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.Iterator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/**
 * Credential-free durable ownership for every pending model transfer.
 *
 * Progress remains in each slot sidecar. This small atomic registry owns only
 * enough information to reconnect Android jobs and controls after process
 * death. Schema 2 is a collection; schema 1 is migrated in place so an already
 * scheduled legacy job keeps job id 4712 and therefore keeps its target.
 */
public final class TalosTransferJournal {

    public static final int SCHEMA_VERSION = 2;
    public static final int LEGACY_JOB_ID = 4712;

    private static final int MIN_JOB_ID = 100_000;
    private static final int JOB_ID_RANGE = 800_000;
    private static final Object IO_LOCK = new Object();
    private static final String FILE_NAME = "talos-model-transfer-v1.json";

    private static final Set<String> ROOT_KEYS = setOf("schemaVersion", "transfers");
    private static final Set<String> RECORD_KEYS = setOf(
            "id", "jobId", "phase", "repo", "revision", "paths", "sizes",
            "hashes", "modelName", "totalBytes", "runner", "networkBound",
            "failure", "createdAtMs", "updatedAtMs");
    private static final Set<String> LEGACY_KEYS = setOf(
            "schemaVersion", "phase", "repo", "revision", "paths", "sizes",
            "hashes", "modelName", "totalBytes", "runner", "networkBound",
            "failure", "updatedAtMs");

    public enum Phase {
        IDLE,
        WAITING,
        QUEUED,
        RUNNING,
        PAUSING,
        PAUSED,
        VERIFYING,
        FAILED
    }

    interface Storage {
        String read() throws IOException;
        void write(String body) throws IOException;
        void clear();
    }

    public static final class Snapshot {
        public final int schemaVersion;
        public final String id;
        public final int jobId;
        public final Phase phase;
        public final String repo;
        public final String revision;
        public final String[] paths;
        public final long[] sizes;
        public final String[] hashes;
        public final String modelName;
        public final long totalBytes;
        public final TalosTransferPlan.Runner runner;
        public final boolean networkBound;
        public final String failure;
        public final long createdAtMs;
        public final long updatedAtMs;

        Snapshot(
                int schemaVersion,
                String id,
                int jobId,
                Phase phase,
                String repo,
                String revision,
                String[] paths,
                long[] sizes,
                String[] hashes,
                String modelName,
                long totalBytes,
                TalosTransferPlan.Runner runner,
                boolean networkBound,
                String failure,
                long createdAtMs,
                long updatedAtMs) {
            this.schemaVersion = schemaVersion;
            this.id = id;
            this.jobId = jobId;
            this.phase = phase;
            this.repo = repo;
            this.revision = revision;
            this.paths = paths.clone();
            this.sizes = sizes.clone();
            this.hashes = hashes.clone();
            this.modelName = modelName;
            this.totalBytes = totalBytes;
            this.runner = runner;
            this.networkBound = networkBound;
            this.failure = failure;
            this.createdAtMs = createdAtMs;
            this.updatedAtMs = updatedAtMs;
        }

        TalosTransferSession.Request request() {
            return new TalosTransferSession.Request(
                    repo, revision, paths.clone(), sizes.clone(), hashes.clone(), modelName);
        }

        Snapshot transition(Phase next, String nextFailure) {
            return copy(next, runner, networkBound, nextFailure);
        }

        Snapshot queue(TalosTransferPlan.Runner nextRunner, boolean nextNetworkBound) {
            return copy(Phase.QUEUED, nextRunner, nextNetworkBound, null);
        }

        private Snapshot copy(
                Phase next,
                TalosTransferPlan.Runner nextRunner,
                boolean nextNetworkBound,
                String nextFailure) {
            return new Snapshot(
                    SCHEMA_VERSION, id, jobId, next, repo, revision, paths, sizes, hashes,
                    modelName, totalBytes, nextRunner, nextNetworkBound, nextFailure,
                    createdAtMs, Math.max(updatedAtMs, System.currentTimeMillis()));
        }
    }

    private static final class FileStorage implements Storage {
        private final AtomicFile file;

        FileStorage(File target) {
            this.file = new AtomicFile(target);
        }

        @Override
        public String read() throws IOException {
            if (!file.getBaseFile().isFile()) return null;
            return new String(file.readFully(), StandardCharsets.UTF_8);
        }

        @Override
        public void write(String body) throws IOException {
            File parent = file.getBaseFile().getParentFile();
            if (parent != null && !parent.isDirectory() && !parent.mkdirs()) {
                throw new IOException("journal-parent");
            }
            FileOutputStream output = null;
            try {
                output = file.startWrite();
                output.write(body.getBytes(StandardCharsets.UTF_8));
                output.flush();
                file.finishWrite(output);
            } catch (IOException failed) {
                if (output != null) file.failWrite(output);
                throw failed;
            }
        }

        @Override
        public void clear() {
            file.delete();
        }
    }

    private final Storage storage;

    TalosTransferJournal(Storage storage) {
        this.storage = storage;
    }

    public static TalosTransferJournal forContext(Context context) {
        Context app = context.getApplicationContext();
        Context owner = app == null ? context : app;
        return new TalosTransferJournal(new FileStorage(new File(owner.getFilesDir(), FILE_NAME)));
    }

    /** All records in stable insertion order. Invalid content fails closed. */
    public List<Snapshot> list() {
        synchronized (IO_LOCK) {
            try {
                String body = storage.read();
                if (body == null || body.trim().isEmpty()) return Collections.emptyList();
                JSONObject root = new JSONObject(body);
                int schema = root.getInt("schemaVersion");
                if (schema == 1) {
                    Snapshot migrated = decodeLegacy(root);
                    List<Snapshot> records = new ArrayList<>();
                    records.add(migrated);
                    writeLocked(records);
                    return records;
                }
                if (schema != SCHEMA_VERSION) throw new JSONException("unsupported schema");
                requireOnly(root, ROOT_KEYS);
                JSONArray rows = root.getJSONArray("transfers");
                List<Snapshot> records = new ArrayList<>();
                Set<String> ids = new HashSet<>();
                Set<Integer> jobs = new HashSet<>();
                for (int index = 0; index < rows.length(); index += 1) {
                    Snapshot snapshot = decodeRecord(rows.getJSONObject(index));
                    if (!ids.add(snapshot.id) || !jobs.add(snapshot.jobId)) {
                        throw new JSONException("duplicate transfer identity");
                    }
                    records.add(snapshot);
                }
                return records;
            } catch (Exception invalid) {
                storage.clear();
                return Collections.emptyList();
            }
        }
    }

    /** Compatibility view: an omitted id is safe only when exactly one exists. */
    public Snapshot read() {
        List<Snapshot> records = list();
        return records.size() == 1 ? records.get(0) : null;
    }

    public Snapshot read(String id) {
        if (id == null) return null;
        for (Snapshot snapshot : list()) {
            if (id.equals(snapshot.id)) return snapshot;
        }
        return null;
    }

    public Snapshot readByJobId(int jobId) {
        for (Snapshot snapshot : list()) {
            if (snapshot.jobId == jobId) return snapshot;
        }
        return null;
    }

    public Snapshot begin(
            TalosTransferSession.Request request,
            TalosTransferPlan.Runner runner,
            boolean networkBound) {
        synchronized (IO_LOCK) {
            List<Snapshot> records = new ArrayList<>(list());
            String id = idFor(request);
            Set<Integer> usedJobs = new LinkedHashSet<>();
            for (Snapshot existing : records) {
                if (id.equals(existing.id)) throw new IllegalStateException("duplicate-transfer");
                usedJobs.add(existing.jobId);
            }
            int preferred = preferredJobId(id);
            int jobId = nextJobId(preferred, usedJobs);
            long now = System.currentTimeMillis();
            Snapshot snapshot = new Snapshot(
                    SCHEMA_VERSION, id, jobId, Phase.WAITING,
                    request.repo, request.revision, request.paths, request.sizes,
                    request.hashes, request.modelName, request.totalBytes,
                    runner, networkBound, null, now, now);
            validate(snapshot);
            records.add(snapshot);
            writeLocked(records);
            return snapshot;
        }
    }

    public Snapshot queue(
            String id,
            TalosTransferPlan.Runner runner,
            boolean networkBound) {
        synchronized (IO_LOCK) {
            List<Snapshot> records = new ArrayList<>(list());
            int index = indexOf(records, id);
            if (index < 0) return null;
            Snapshot next = records.get(index).queue(runner, networkBound);
            validate(next);
            records.set(index, next);
            writeLocked(records);
            return next;
        }
    }

    public Snapshot transition(String id, Phase phase, String failure) {
        synchronized (IO_LOCK) {
            List<Snapshot> records = new ArrayList<>(list());
            int index = indexOf(records, id);
            if (index < 0) return null;
            Snapshot next = records.get(index).transition(phase, sanitizeFailure(failure));
            validate(next);
            records.set(index, next);
            writeLocked(records);
            return next;
        }
    }

    /** Legacy transition, intentionally unavailable when more than one exists. */
    public Snapshot transition(Phase phase, String failure) {
        Snapshot sole = read();
        return sole == null ? null : transition(sole.id, phase, failure);
    }

    public void remove(String id) {
        synchronized (IO_LOCK) {
            List<Snapshot> records = new ArrayList<>(list());
            int index = indexOf(records, id);
            if (index < 0) return;
            records.remove(index);
            writeLocked(records);
        }
    }

    /** Test/legacy cleanup only. Product cancellation always removes by id. */
    public void clear() {
        synchronized (IO_LOCK) {
            storage.clear();
        }
    }

    static String idFor(TalosTransferSession.Request request) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            add(digest, request.repo);
            add(digest, request.revision);
            for (int index = 0; index < request.paths.length; index += 1) {
                add(digest, request.paths[index]);
                digest.update(ByteBuffer.allocate(Long.BYTES).putLong(request.sizes[index]).array());
                add(digest, request.hashes[index] == null ? "" : request.hashes[index].toLowerCase(Locale.ROOT));
            }
            StringBuilder out = new StringBuilder(64);
            for (byte value : digest.digest()) out.append(String.format(Locale.ROOT, "%02x", value));
            return out.toString();
        } catch (NoSuchAlgorithmException impossible) {
            throw new IllegalStateException("sha256-unavailable", impossible);
        }
    }

    static int nextJobId(int preferred, Set<Integer> used) {
        int normalized = MIN_JOB_ID + Math.floorMod(preferred - MIN_JOB_ID, JOB_ID_RANGE);
        for (int offset = 0; offset < JOB_ID_RANGE; offset += 1) {
            int candidate = MIN_JOB_ID + ((normalized - MIN_JOB_ID + offset) % JOB_ID_RANGE);
            if (!used.contains(candidate)) return candidate;
        }
        throw new IllegalStateException("job-id-exhausted");
    }

    private void writeLocked(List<Snapshot> records) {
        if (records.isEmpty()) {
            storage.clear();
            return;
        }
        try {
            JSONObject root = new JSONObject();
            root.put("schemaVersion", SCHEMA_VERSION);
            JSONArray rows = new JSONArray();
            for (Snapshot snapshot : records) rows.put(encodeRecord(snapshot));
            root.put("transfers", rows);
            storage.write(root.toString());
        } catch (IOException | JSONException failed) {
            throw new IllegalStateException("journal-write", failed);
        }
    }

    private static JSONObject encodeRecord(Snapshot snapshot) throws JSONException {
        JSONObject body = new JSONObject();
        body.put("id", snapshot.id);
        body.put("jobId", snapshot.jobId);
        body.put("phase", snapshot.phase.name().toLowerCase(Locale.ROOT));
        body.put("repo", snapshot.repo);
        body.put("revision", snapshot.revision);
        body.put("paths", new JSONArray(snapshot.paths));
        JSONArray sizes = new JSONArray();
        for (long size : snapshot.sizes) sizes.put(size);
        body.put("sizes", sizes);
        JSONArray hashes = new JSONArray();
        for (String hash : snapshot.hashes) hashes.put(hash == null ? JSONObject.NULL : hash);
        body.put("hashes", hashes);
        body.put("modelName", snapshot.modelName);
        body.put("totalBytes", snapshot.totalBytes);
        body.put("runner", snapshot.runner.name());
        body.put("networkBound", snapshot.networkBound);
        body.put("failure", snapshot.failure == null ? JSONObject.NULL : snapshot.failure);
        body.put("createdAtMs", snapshot.createdAtMs);
        body.put("updatedAtMs", snapshot.updatedAtMs);
        return body;
    }

    private static Snapshot decodeRecord(JSONObject body) throws JSONException {
        requireOnly(body, RECORD_KEYS);
        Snapshot snapshot = decodeFields(
                body,
                body.getString("id"),
                body.getInt("jobId"),
                body.getLong("createdAtMs"));
        validate(snapshot);
        return snapshot;
    }

    private static Snapshot decodeLegacy(JSONObject body) throws JSONException {
        requireOnly(body, LEGACY_KEYS);
        TalosTransferSession.Request request = requestFrom(body);
        long updated = body.getLong("updatedAtMs");
        Snapshot snapshot = new Snapshot(
                SCHEMA_VERSION,
                idFor(request),
                LEGACY_JOB_ID,
                Phase.valueOf(body.getString("phase").toUpperCase(Locale.ROOT)),
                request.repo,
                request.revision,
                request.paths,
                request.sizes,
                request.hashes,
                request.modelName,
                request.totalBytes,
                TalosTransferPlan.Runner.valueOf(body.getString("runner")),
                body.getBoolean("networkBound"),
                body.isNull("failure") ? null : body.getString("failure"),
                updated,
                updated);
        validate(snapshot);
        return snapshot;
    }

    private static Snapshot decodeFields(
            JSONObject body,
            String id,
            int jobId,
            long createdAtMs) throws JSONException {
        TalosTransferSession.Request request = requestFrom(body);
        return new Snapshot(
                SCHEMA_VERSION,
                id,
                jobId,
                Phase.valueOf(body.getString("phase").toUpperCase(Locale.ROOT)),
                request.repo,
                request.revision,
                request.paths,
                request.sizes,
                request.hashes,
                request.modelName,
                request.totalBytes,
                TalosTransferPlan.Runner.valueOf(body.getString("runner")),
                body.getBoolean("networkBound"),
                body.isNull("failure") ? null : body.getString("failure"),
                createdAtMs,
                body.getLong("updatedAtMs"));
    }

    private static TalosTransferSession.Request requestFrom(JSONObject body) throws JSONException {
        JSONArray pathRows = body.getJSONArray("paths");
        JSONArray sizeRows = body.getJSONArray("sizes");
        JSONArray hashRows = body.getJSONArray("hashes");
        int count = pathRows.length();
        if (count == 0 || sizeRows.length() != count || hashRows.length() != count) {
            throw new JSONException("request arrays differ");
        }
        String[] paths = new String[count];
        long[] sizes = new long[count];
        String[] hashes = new String[count];
        for (int index = 0; index < count; index += 1) {
            paths[index] = pathRows.getString(index);
            sizes[index] = sizeRows.getLong(index);
            hashes[index] = hashRows.isNull(index) ? null : hashRows.getString(index);
        }
        return new TalosTransferSession.Request(
                body.getString("repo"),
                body.getString("revision"),
                paths,
                sizes,
                hashes,
                body.getString("modelName"));
    }

    private static void validate(Snapshot snapshot) {
        if (snapshot.schemaVersion != SCHEMA_VERSION) invalid("schema");
        if (snapshot.id == null || !snapshot.id.matches("[0-9a-f]{64}")) invalid("id");
        if (snapshot.jobId <= 0) invalid("jobId");
        if (snapshot.repo == null || !snapshot.repo.matches(
                "[A-Za-z0-9][A-Za-z0-9._-]{0,95}/[A-Za-z0-9][A-Za-z0-9._-]{0,95}")) {
            invalid("repo");
        }
        if (!safeRevision(snapshot.revision)) invalid("revision");
        if (snapshot.paths.length == 0
                || snapshot.paths.length != snapshot.sizes.length
                || snapshot.paths.length != snapshot.hashes.length) invalid("arrays");

        long sum = 0;
        for (int index = 0; index < snapshot.paths.length; index += 1) {
            if (!safePath(snapshot.paths[index])) invalid("path");
            if (snapshot.sizes[index] <= 0) invalid("size");
            try {
                sum = Math.addExact(sum, snapshot.sizes[index]);
            } catch (ArithmeticException overflow) {
                invalid("total");
            }
            String hash = snapshot.hashes[index];
            if (hash != null && !hash.matches("[0-9a-fA-F]{64}")) invalid("hash");
        }
        if (sum != snapshot.totalBytes || snapshot.totalBytes <= 0) invalid("total");
        if (!plainText(snapshot.modelName, 255)) invalid("modelName");
        if (snapshot.phase == null || snapshot.runner == null) invalid("state");
        if (snapshot.failure != null && !plainText(snapshot.failure, 256)) invalid("failure");
        if (snapshot.createdAtMs <= 0 || snapshot.updatedAtMs <= 0
                || snapshot.updatedAtMs < snapshot.createdAtMs) invalid("timestamp");
    }

    private static int preferredJobId(String id) {
        long prefix = Long.parseLong(id.substring(0, 8), 16);
        return MIN_JOB_ID + (int) (prefix % JOB_ID_RANGE);
    }

    private static int indexOf(List<Snapshot> records, String id) {
        if (id == null) return -1;
        for (int index = 0; index < records.size(); index += 1) {
            if (id.equals(records.get(index).id)) return index;
        }
        return -1;
    }

    private static void add(MessageDigest digest, String value) {
        byte[] encoded = value.getBytes(StandardCharsets.UTF_8);
        digest.update(ByteBuffer.allocate(Integer.BYTES).putInt(encoded.length).array());
        digest.update(encoded);
    }

    private static void requireOnly(JSONObject body, Set<String> keys) throws JSONException {
        Iterator<String> names = body.keys();
        while (names.hasNext()) {
            if (!keys.contains(names.next())) throw new JSONException("unknown journal key");
        }
    }

    private static Set<String> setOf(String... values) {
        return new HashSet<>(Arrays.asList(values));
    }

    private static boolean safeRevision(String revision) {
        return plainText(revision, 200)
                && revision.matches("[A-Za-z0-9._/-]+")
                && !revision.contains("..")
                && !revision.startsWith("/")
                && !revision.endsWith("/");
    }

    private static boolean safePath(String path) {
        if (!plainText(path, 1024) || path.startsWith("/") || path.startsWith("\\")
                || path.contains("\\")) return false;
        for (String segment : path.split("/", -1)) {
            if (segment.isEmpty() || ".".equals(segment) || "..".equals(segment)) return false;
        }
        return true;
    }

    private static boolean plainText(String value, int maximum) {
        if (value == null || value.trim().isEmpty() || value.length() > maximum) return false;
        for (int index = 0; index < value.length(); index += 1) {
            if (Character.isISOControl(value.charAt(index))) return false;
        }
        return true;
    }

    private static String sanitizeFailure(String failure) {
        if (failure == null) return null;
        return plainText(failure, 256) ? failure : "transfer-failed";
    }

    private static void invalid(String field) {
        throw new IllegalArgumentException("invalid journal " + field);
    }
}
