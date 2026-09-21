package ai.talos;

/**
 * Owner 2026-07-29: "vorrei che l'applicazione venga bloccata quando il blocco
 * schermo viene innestato."
 *
 * The app lock used to be applied on RESUME, and only after a grace window, so
 * locking the phone left TALOS unlocked in memory with the chats still on screen
 * behind the keyguard. Anyone who opened the phone inside that window walked
 * straight into them.
 *
 * Fixing it needs one thing Android knows and `appStateChange` does not: WHY the
 * app went away. Switching apps for a moment must keep the grace window — a PIN
 * prompt for every glance at a notification is how people turn locks off. The
 * device being locked is a different intent and gets no window at all.
 *
 * The decision lives here, outside the plugin, so it is testable without an
 * emulator — the same split the locale and export policies use.
 */
final class TalosDeviceLockPolicy {

    private TalosDeviceLockPolicy() {}

    /**
     * @param keyguardLocked `KeyguardManager.isKeyguardLocked()`
     * @param screenInteractive `PowerManager.isInteractive()`
     * @return true when the DEVICE took the app away, rather than the user
     *         moving to another app.
     *
     * Both signals are consulted because neither covers the case alone:
     *
     *  - the keyguard reports nothing on a phone with no screen lock set, yet
     *    the screen still went off and the app is still unattended;
     *  - the screen can be interactive while the keyguard is showing, which is
     *    exactly the moment after the user presses the power button and the
     *    lock screen lights up.
     *
     * An app switch trips neither: the screen stays interactive and no keyguard
     * appears. That is the whole point of the discrimination.
     */
    static boolean tookAppAway(boolean keyguardLocked, boolean screenInteractive) {
        return keyguardLocked || !screenInteractive;
    }
}
