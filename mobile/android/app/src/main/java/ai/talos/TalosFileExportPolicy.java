package ai.talos;

import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.text.Normalizer;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Pure policy boundary for {@link TalosFileExportPlugin}.
 *
 * Keeping path/name/copy rules free of Android APIs makes the security-critical
 * contract executable as a local JVM test instead of trusting a device-only
 * code path.
 */
final class TalosFileExportPolicy {

    static final String UNTRUSTED_SOURCE = "TALOS_FILE_EXPORT_UNTRUSTED_SOURCE";
    static final String SIZE_MISMATCH = "TALOS_FILE_EXPORT_SIZE_MISMATCH";

    private static final int MAX_DISPLAY_NAME = 180;
    private static final Pattern EXTENDED_GRAPHEME = Pattern.compile("\\X");
    private static final Pattern MEDIA_TYPE = Pattern.compile(
        "^[a-z0-9!#$&^_.+-]+/[a-z0-9!#$&^_.+-]+$"
    );

    private TalosFileExportPolicy() {}

    private static String safeGraphemePrefix(String value, int maxCodeUnits) {
        int limit = Math.min(value.length(), Math.max(0, maxCodeUnits));
        if (limit == value.length()) {
            return value;
        }

        Matcher graphemes = EXTENDED_GRAPHEME.matcher(value);
        int end = 0;
        while (graphemes.find()) {
            if (graphemes.end() > limit) {
                break;
            }
            end = graphemes.end();
        }
        return value.substring(0, end);
    }

    static String safeDisplayName(String value) {
        String name = value == null
            ? ""
            : Normalizer.normalize(value, Normalizer.Form.NFKC);
        name = name
            .replaceAll("[\\u00ad\\u200b\\u200e\\u200f\\u202a-\\u202e\\u2066-\\u2069\\ufeff]", "")
            .replaceAll("[\\p{Cntrl}]", " ")
            .replaceAll("[/\\\\:*?\"<>|]", " ")
            .replaceAll("\\s+", " ")
            .trim()
            .replaceFirst("^\\.+\\s*", "")
            .trim();
        if (name.isEmpty() || ".".equals(name) || "..".equals(name)) {
            return "file";
        }
        if (name.length() <= MAX_DISPLAY_NAME) {
            return name;
        }

        int dot = name.lastIndexOf('.');
        String suffix = dot > 0 && name.length() - dot <= 17
            ? name.substring(dot)
            : "";
        int stemLimit = MAX_DISPLAY_NAME - suffix.length();
        String stem = safeGraphemePrefix(name, stemLimit).trim();
        return stem.isEmpty() ? "file" : stem + suffix;
    }

    static String safeMediaType(String value) {
        String mediaType = value == null ? "" : value.trim().toLowerCase();
        return MEDIA_TYPE.matcher(mediaType).matches()
            ? mediaType
            : "application/octet-stream";
    }

    /**
     * Only the exact staging directory's direct files are exportable. A
     * canonical check defeats `..` and symlink traversal.
     */
    static boolean trustedSource(File cacheDirectory, File candidate) {
        if (cacheDirectory == null || candidate == null) {
            return false;
        }
        try {
            File root = new File(cacheDirectory, "talos-export").getCanonicalFile();
            File source = candidate.getCanonicalFile();
            return source.isFile() && root.equals(source.getParentFile());
        } catch (IOException ignored) {
            return false;
        }
    }

    static String stagedSourceFailure(
        File cacheDirectory,
        File source,
        long expectedBytes
    ) {
        if (!trustedSource(cacheDirectory, source)) {
            return UNTRUSTED_SOURCE;
        }
        return source.length() == expectedBytes ? null : SIZE_MISMATCH;
    }

    static String postPickerSourceFailure(
        File cacheDirectory,
        File source,
        long expectedBytes,
        Runnable deletePartial
    ) {
        String failure = stagedSourceFailure(
            cacheDirectory,
            source,
            expectedBytes
        );
        if (failure != null) {
            deletePartial.run();
        }
        return failure;
    }

    static long copy(InputStream input, OutputStream output) throws IOException {
        byte[] buffer = new byte[64 * 1024];
        long total = 0;
        int read;
        while ((read = input.read(buffer)) != -1) {
            output.write(buffer, 0, read);
            total += read;
        }
        output.flush();
        return total;
    }
}
