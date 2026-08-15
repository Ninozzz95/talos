package ai.talos;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * The Stop button on the download notification.
 *
 * A broadcast rather than an activity: pressing Stop must stop the download,
 * not open the app in front of whatever the user was doing.
 *
 * It sets a flag and nothing else. The loop notices within a chunk, writes its
 * checkpoint, and leaves the bytes and the hash state on disk — so Stop means
 * "pause", and the transfer picks up where it left off rather than starting a
 * four-gigabyte download again. The notification says exactly that.
 *
 * This exists because Android's own Task Manager Stop is the alternative, and
 * that one kills the process without calling anything at all.
 */
public class TalosTransferControl extends BroadcastReceiver {

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || !TalosTransferNotification.ACTION_PAUSE.equals(intent.getAction())) return;
        String id = intent.getStringExtra(TalosTransferNotification.EXTRA_TRANSFER_ID);
        if (id == null) {
            java.util.List<TalosTransferJournal.Snapshot> records =
                    TalosTransferSession.restoreAll(context);
            if (records.size() != 1) return;
            id = records.get(0).id;
        }
        pause(context, id);
    }

    /** Shared by the notification receiver and the Capacitor plugin. */
    static boolean pause(Context context, String id) {
        TalosTransferJournal.Snapshot snapshot = TalosTransferSession.restore(context, id);
        if (snapshot == null) return false;
        TalosTransferSession.requestStop(id, TalosTransferSession.StopCause.USER_PAUSE);
        TalosTransferJournal.forContext(context).transition(
                id, TalosTransferJournal.Phase.PAUSING, null);
        boolean running = TalosTransferSession.workerRunning(id);
        TalosTransferDispatcher.stopHost(context, snapshot);
        if (!running) {
            TalosTransferJournal.forContext(context).transition(
                    id, TalosTransferJournal.Phase.PAUSED, null);
            TalosTransferSession.clearStopRequest(id);
            TalosTransferDispatcher.dispatchAfterRelease(context);
        }
        return true;
    }
}
