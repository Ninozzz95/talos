import { talosWithTimeout } from '@/lib/talosDeviceLog'

/**
 * R1-6 — the F5.1 lesson institutionalized: EVERY native-bridge await goes
 * through one fenced gateway instead of hand-applying talosWithTimeout where
 * pain already happened. A hung plugin call (Preferences, SecureStorage,
 * Filesystem, Share, sqlite connect) rejects `${tag}_TIMEOUT` and lands in
 * the Doctor ring instead of freezing boot or a feature forever.
 *
 * NOT for interactive prompts (biometric authenticate, share sheet chooser
 * UI): those legitimately wait on the user. Fence the probe, not the person.
 */
export const TALOS_BRIDGE_DEFAULT_MS = 10_000

export function talosBridgeCall<T>(tag: string, run: () => Promise<T>, ms = TALOS_BRIDGE_DEFAULT_MS): Promise<T> {
    return talosWithTimeout(run(), ms, tag)
}
