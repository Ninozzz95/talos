package ai.talos;

import android.app.Activity;
import android.content.ContentResolver;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;
import java.io.OutputStream;

/**
 * Android Storage Access Framework adapter for one explicit Save-As.
 *
 * It accepts no arbitrary path: only a canonical direct child of the app's
 * private cache/talos-export staging directory. Android owns destination
 * selection and name-collision behavior through ACTION_CREATE_DOCUMENT.
 */
@CapacitorPlugin(name = "TalosFileExport")
public class TalosFileExportPlugin extends Plugin {

    @PluginMethod
    public void saveFile(PluginCall call) {
        try {
            File source = sourceFile(call);
            long expectedBytes = expectedBytes(call);
            String sourceFailure = TalosFileExportPolicy.stagedSourceFailure(
                getContext().getCacheDir(),
                source,
                expectedBytes
            );
            if (sourceFailure != null) {
                reject(call, sourceFailure, null);
                return;
            }

            Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
            intent.addCategory(Intent.CATEGORY_OPENABLE);
            intent.setType(TalosFileExportPolicy.safeMediaType(call.getString("mediaType")));
            intent.putExtra(
                Intent.EXTRA_TITLE,
                TalosFileExportPolicy.safeDisplayName(call.getString("displayName"))
            );
            startActivityForResult(call, intent, "saveFileResult");
        } catch (Exception exception) {
            reject(call, "TALOS_FILE_EXPORT_INVALID_INPUT", exception);
        }
    }

    @ActivityCallback
    private void saveFileResult(PluginCall call, ActivityResult result) {
        if (call == null) {
            return;
        }
        if (result.getResultCode() == Activity.RESULT_CANCELED) {
            JSObject response = new JSObject();
            response.put("saved", false);
            call.resolve(response);
            return;
        }
        Intent data = result.getData();
        Uri destination = data == null ? null : data.getData();
        if (result.getResultCode() != Activity.RESULT_OK || destination == null) {
            reject(call, "TALOS_FILE_EXPORT_FAILED", null);
            return;
        }

        // Content-provider IO must not block the activity callback/main thread.
        execute(() -> copyToDestination(call, destination));
    }

    private void copyToDestination(PluginCall call, Uri destination) {
        ContentResolver resolver = getContext().getContentResolver();
        try {
            File source = sourceFile(call);
            long expectedBytes = expectedBytes(call);
            // Re-check after the user may have spent minutes in the picker.
            String sourceFailure = TalosFileExportPolicy.postPickerSourceFailure(
                getContext().getCacheDir(),
                source,
                expectedBytes,
                () -> deletePartial(resolver, destination)
            );
            if (sourceFailure != null) {
                reject(call, sourceFailure, null);
                return;
            }

            long copied;
            try (
                InputStream input = new FileInputStream(source);
                OutputStream output = resolver.openOutputStream(destination, "w")
            ) {
                if (output == null) {
                    throw new IllegalStateException("Destination stream unavailable");
                }
                copied = TalosFileExportPolicy.copy(input, output);
            }

            if (copied != expectedBytes) {
                deletePartial(resolver, destination);
                reject(call, "TALOS_FILE_EXPORT_SIZE_MISMATCH", null);
                return;
            }

            JSObject response = new JSObject();
            response.put("saved", true);
            response.put("bytesWritten", copied);
            response.put(
                "displayName",
                TalosFileExportPolicy.safeDisplayName(
                    destinationDisplayName(resolver, destination, call.getString("displayName"))
                )
            );
            call.resolve(response);
        } catch (Exception exception) {
            deletePartial(resolver, destination);
            reject(call, "TALOS_FILE_EXPORT_FAILED", exception);
        }
    }

    private File sourceFile(PluginCall call) {
        String raw = call.getString("sourceUri");
        if (raw == null) {
            throw new IllegalArgumentException("sourceUri");
        }
        Uri uri = Uri.parse(raw);
        if (!"file".equalsIgnoreCase(uri.getScheme()) || uri.getPath() == null) {
            throw new IllegalArgumentException("sourceUri");
        }
        return new File(uri.getPath());
    }

    private long expectedBytes(PluginCall call) {
        Object raw = call.getData().opt("expectedBytes");
        if (!(raw instanceof Number)) {
            throw new IllegalArgumentException("expectedBytes");
        }
        long value = ((Number) raw).longValue();
        if (value < 0 || value > 10L * 1024L * 1024L) {
            throw new IllegalArgumentException("expectedBytes");
        }
        return value;
    }

    private String destinationDisplayName(
        ContentResolver resolver,
        Uri destination,
        String fallback
    ) {
        try (
            Cursor cursor = resolver.query(
                destination,
                new String[] { OpenableColumns.DISPLAY_NAME },
                null,
                null,
                null
            )
        ) {
            if (cursor != null && cursor.moveToFirst()) {
                int column = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                if (column >= 0) {
                    String value = cursor.getString(column);
                    if (value != null && !value.trim().isEmpty()) {
                        return value;
                    }
                }
            }
        } catch (Exception ignored) {
            // The provider may decline metadata queries; the suggested name is
            // still known and safe.
        }
        return fallback;
    }

    private void deletePartial(ContentResolver resolver, Uri destination) {
        try {
            resolver.delete(destination, null, null);
        } catch (Exception ignored) {
            // Best effort: the operation still rejects and never claims success.
        }
    }

    private void reject(PluginCall call, String code, Exception exception) {
        if (exception == null) {
            call.reject(code, code);
        } else {
            call.reject(code, code, exception);
        }
    }
}
