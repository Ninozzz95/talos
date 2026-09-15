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
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;

/**
 * A model the person already has, handed to TALOS.
 *
 * Owner 2026-08-03: «nessuna possibilità di usare modelli caricati direttamente
 * dalla memoria, NON VA BENE». For an app that is local-first and distributed
 * outside the Play Store this is not a convenience — it is the equivalent of
 * "open a file", and its absence means a phone can hold a model TALOS refuses
 * to see.
 *
 * The file is COPIED rather than referenced, and that is a decision with a cost
 * worth stating. llama.cpp memory-maps the weights, so it needs a real
 * filesystem path; the picker hands back a `content://` URI belonging to
 * another app's provider, which has no such path. Referencing it would mean
 * holding a URI permission across reboots and hoping `/proc/self/fd/N` survives
 * mmap — a chain that fails silently and differently on each manufacturer.
 * Copying costs the disk space twice for a few minutes and then always works;
 * the caller is told the size first so the choice is the person's.
 *
 * It lands in the SAME root the downloader writes to, so the file appears in
 * the installed list, in the fit calculations and in the chat picker with no
 * further plumbing — an imported model is not a second class of model.
 */
@CapacitorPlugin(name = "TalosModelImport")
public class TalosModelImportPlugin extends Plugin {

    /** GGUF declares itself in its first four bytes. A name is not evidence. */
    private static final byte[] MAGIC = { 'G', 'G', 'U', 'F' };

    @PluginMethod
    public void pick(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        // `*/*` on purpose: `.gguf` has no registered MIME type, and a filter
        // that guesses one greys out the very file the person came to pick.
        intent.setType("*/*");
        startActivityForResult(call, intent, "pickResult");
    }

    @ActivityCallback
    private void pickResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() == Activity.RESULT_CANCELED) {
            JSObject response = new JSObject();
            response.put("imported", false);
            call.resolve(response);
            return;
        }
        Intent data = result.getData();
        Uri source = data == null ? null : data.getData();
        if (result.getResultCode() != Activity.RESULT_OK || source == null) {
            call.reject("TALOS_MODEL_IMPORT_FAILED");
            return;
        }
        // Copying gigabytes must never run on the activity callback thread.
        execute(() -> copyIn(call, source));
    }

    private void copyIn(PluginCall call, Uri source) {
        ContentResolver resolver = getContext().getContentResolver();
        String name = displayName(resolver, source);
        long bytes = declaredSize(resolver, source);

        if (name == null || !name.toLowerCase().endsWith(".gguf")) {
            call.reject("TALOS_MODEL_IMPORT_NOT_GGUF");
            return;
        }

        // Under "models", because that is where TalosModelStore walks.
        //
        // The first device run copied 290 MB perfectly — right bytes, right
        // magic, clean rename — into `files/imported`, one level above the
        // folder the listing reads. The file was whole, on disk, and
        // invisible: exactly the failure the owner reported about
        // downloads, reproduced by the feature meant to answer it.
        File root = new File(new File(TalosTransferSession.rootFor(getContext()), "models"), "imported");
        if (!root.exists() && !root.mkdirs()) {
            call.reject("TALOS_MODEL_IMPORT_NO_FOLDER");
            return;
        }

        // Asked BEFORE a single byte moves. A copy that dies at 90% has spent
        // minutes and left a fragment behind, and "no space" discovered then is
        // a worse message than the same one discovered now.
        if (bytes > 0 && root.getUsableSpace() < bytes + (64L * 1024 * 1024)) {
            call.reject("TALOS_MODEL_IMPORT_NO_SPACE");
            return;
        }

        File target = new File(root, name);
        if (target.exists()) {
            call.reject("TALOS_MODEL_IMPORT_ALREADY_HERE");
            return;
        }

        File partial = new File(root, name + ".part");
        try (InputStream in = resolver.openInputStream(source);
             OutputStream out = new FileOutputStream(partial)) {
            if (in == null) {
                call.reject("TALOS_MODEL_IMPORT_UNREADABLE");
                return;
            }

            byte[] head = new byte[4];
            int read = in.read(head);
            if (read != 4 || !isGguf(head)) {
                // The extension said one thing and the bytes say another. A
                // file that is not a GGUF cannot be loaded, and finding out at
                // load time would blame the engine for the picker's mistake.
                deleteQuietly(partial);
                call.reject("TALOS_MODEL_IMPORT_NOT_GGUF");
                return;
            }
            out.write(head, 0, 4);

            byte[] buffer = new byte[1 << 20];
            long copied = 4;
            long lastReport = 0;
            int n;
            while ((n = in.read(buffer)) > 0) {
                out.write(buffer, 0, n);
                copied += n;
                // Once a second at most. A per-chunk event for three gigabytes
                // is thousands of messages nobody can read.
                long now = android.os.SystemClock.elapsedRealtime();
                if (now - lastReport >= 1000L) {
                    lastReport = now;
                    JSObject tick = new JSObject();
                    tick.put("copied", copied);
                    tick.put("total", bytes);
                    notifyListeners("progress", tick);
                }
            }
            out.flush();
        } catch (Exception failure) {
            deleteQuietly(partial);
            call.reject("TALOS_MODEL_IMPORT_FAILED", failure);
            return;
        }

        // Renamed only once whole: a `.part` left by a killed process is
        // obviously incomplete, while a truncated `.gguf` looks installed and
        // fails at load with a message about the engine.
        if (!partial.renameTo(target)) {
            deleteQuietly(partial);
            call.reject("TALOS_MODEL_IMPORT_FAILED");
            return;
        }

        JSObject response = new JSObject();
        response.put("imported", true);
        response.put("path", target.getAbsolutePath());
        response.put("name", name);
        response.put("bytes", target.length());
        call.resolve(response);
    }

    private static boolean isGguf(byte[] head) {
        for (int i = 0; i < MAGIC.length; i++) {
            if (head[i] != MAGIC[i]) return false;
        }
        return true;
    }

    private static void deleteQuietly(File file) {
        //noinspection ResultOfMethodCallIgnored
        file.delete();
    }

    private static String displayName(ContentResolver resolver, Uri uri) {
        try (Cursor cursor = resolver.query(uri, null, null, null, null)) {
            if (cursor == null || !cursor.moveToFirst()) return null;
            int at = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
            return at < 0 ? null : cursor.getString(at);
        } catch (Exception failure) {
            return null;
        }
    }

    /** Zero when the provider declines to say — the copy still runs. */
    private static long declaredSize(ContentResolver resolver, Uri uri) {
        try (Cursor cursor = resolver.query(uri, null, null, null, null)) {
            if (cursor == null || !cursor.moveToFirst()) return 0;
            int at = cursor.getColumnIndex(OpenableColumns.SIZE);
            return at < 0 || cursor.isNull(at) ? 0 : cursor.getLong(at);
        } catch (Exception failure) {
            return 0;
        }
    }
}
