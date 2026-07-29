package ai.talos;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/**
 * The whole value of this class is telling "the user locked the phone" apart
 * from "the user checked a notification". Getting it backwards either leaves the
 * chats readable behind the keyguard, or asks for a PIN every time someone
 * glances at a message — and the second is how people switch locks off.
 */
public class TalosDeviceLockPolicyTest {

    @Test
    public void screenOffIsADeviceLockEvenWithoutAKeyguard() {
        // A phone with no screen lock configured reports nothing from the
        // keyguard, but the screen still went dark and nobody is watching.
        assertTrue(TalosDeviceLockPolicy.tookAppAway(false, false));
    }

    @Test
    public void keyguardShowingIsADeviceLockEvenWhileTheScreenIsLit() {
        // The instant after the power button: lock screen up, screen still on.
        assertTrue(TalosDeviceLockPolicy.tookAppAway(true, true));
    }

    @Test
    public void bothSignalsTogetherAreStillADeviceLock() {
        assertTrue(TalosDeviceLockPolicy.tookAppAway(true, false));
    }

    @Test
    public void anAppSwitchIsNotADeviceLock() {
        // Screen on, no keyguard: the user moved to another app and expects to
        // come back without re-entering the PIN. The grace window handles this.
        assertFalse(TalosDeviceLockPolicy.tookAppAway(false, true));
    }
}
