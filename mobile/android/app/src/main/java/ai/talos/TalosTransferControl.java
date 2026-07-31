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
        if (intent == null || !TalosTransferNotification.ACTION_STOP.equals(intent.getAction())) return;
        TalosTransferSession.requestStop();
    }
}
