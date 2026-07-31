package ai.talos;

import android.content.Context;
import android.os.storage.StorageManager;

import java.io.IOException;
import java.io.RandomAccessFile;
import java.util.UUID;

/**
 * Claiming the space before asking for the first byte.
 *
 * `StorageManager.allocateBytes` is the platform's own path: it calls
 * `posix_fallocate` and falls back to `ftruncate` where the filesystem cannot
 * do better. Both grow the file, which is why `TalosModelStore` treats the
 * sidecar rather than the file length as the record of progress.
 *
 * `getAllocatableBytes` is deliberately not the same number as free space: it
 * is larger, because the system is willing to drop other apps' caches to
 * satisfy the request. Asking it, rather than reading free space, is what lets
 * a download start on a phone that looks full and is not.
 *
 * The refusal is the point. A transfer that finds out at 90% has spent three
 * and a half gigabytes of somebody's data allowance to arrive at a failure they
 * cannot act on; one that refuses at the start can say how much to free.
 */
public final class TalosStorageReservation implements TalosModelStore.Reservation {

    private final Context context;

    public TalosStorageReservation(Context context) {
        this.context = context;
    }

    @Override
    public void reserve(RandomAccessFile file, long totalBytes) throws IOException {
        long already = file.length();
        long wanted = totalBytes - already;
        if (wanted <= 0) return;

        StorageManager storage = context.getSystemService(StorageManager.class);
        if (storage == null) {
            file.setLength(totalBytes);
            return;
        }

        Long allocatable = null;
        try {
            UUID volume = storage.getUuidForPath(context.getFilesDir());
            allocatable = storage.getAllocatableBytes(volume);
        } catch (IOException | RuntimeException cannotAsk) {
            // Could not ask, so we do not refuse. Guessing "no" here would block
            // a download on a phone that has plenty of room.
        }

        if (allocatable != null) {
            TalosTransferPlan.Space space = TalosTransferPlan.space(totalBytes, already, allocatable);
            if (!space.enough) {
                throw new IOException("short by " + space.shortfallBytes + " bytes");
            }
        }

        try {
            storage.allocateBytes(file.getFD(), wanted);
            return;
        } catch (IOException | RuntimeException cannotFastAllocate) {
            // The filesystem cannot fast-allocate. Growing the file plainly is
            // weaker — the claim may be sparse and therefore not really a claim
            // — and it is still better than starting a four-gigabyte transfer
            // having claimed nothing at all.
        }
        file.setLength(totalBytes);
    }
}
