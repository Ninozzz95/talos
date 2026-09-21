/**
 * The remembered view of a surface.
 *
 * The Library already had this, added on its own after someone noticed it "just
 * never survived a reopen". Doctor, Model Lab and Appearance did not, so the
 * screen you were on came back as the screen someone chose as first. This makes
 * remembering a property of being in the register rather than something each
 * screen has to think of.
 *
 * Storage is a parameter, not a global. Partly so it is testable without a DOM,
 * and partly because a mobile webview can refuse `localStorage` outright —
 * private mode, a wiped profile, a storage quota — and a preference that throws
 * on read would take the whole screen down with it. Every path here degrades to
 * "no memory" instead.
 */
import { talosResolveView, talosViewStorageKey } from './viewRegistry'

export type TalosViewStorage = Pick<Storage, 'getItem' | 'setItem'>

function browserStorage(): TalosViewStorage | null {
    try {
        return typeof localStorage === 'undefined' ? null : localStorage
    } catch {
        // Reading the global itself can throw when storage is blocked.
        return null
    }
}

/**
 * What the surface should open with: the remembered view if it is still real,
 * otherwise the surface's default. A stored id is never trusted — a release can
 * remove a view while a device still holds its name.
 */
export function talosRememberedView(
    surfaceId: string,
    storage: TalosViewStorage | null = browserStorage(),
): string | undefined {
    let stored: string | null = null
    try {
        stored = storage?.getItem(talosViewStorageKey(surfaceId)) ?? null
    } catch {
        stored = null
    }
    return talosResolveView(surfaceId, stored)
}

/**
 * Remember a choice, if it is one the surface actually offers.
 *
 * Returns whether it was written, so a caller can tell "not stored" from
 * "stored" rather than assuming. Writing an unknown id would be worse than not
 * writing at all: it survives the release that removed the view and has to be
 * validated back out on every read.
 */
export function talosRememberView(
    surfaceId: string,
    viewId: string,
    storage: TalosViewStorage | null = browserStorage(),
): boolean {
    if (talosResolveView(surfaceId, viewId) !== viewId) return false
    try {
        storage?.setItem(talosViewStorageKey(surfaceId), viewId)
        return storage !== null
    } catch {
        // Quota exceeded, or storage disabled between the read and the write.
        return false
    }
}
