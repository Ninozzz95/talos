/**
 * What a temporary chat says when it is empty.
 *
 * Owner 2026-07-31, after two attempts that did not satisfy: the welcome has to
 * be ABOUT being in incognito, and it has to be a SET rather than one line —
 * the ordinary welcome cycles, and a temporary chat that always says the same
 * sentence reads like a warning label instead of the app talking.
 *
 * Seeded by the session id, so the line is stable inside one chat and different
 * between chats. Deterministic on purpose: a phrase that changed on every
 * re-render would be noise, and one that never changed would be furniture.
 *
 * The lines say the same true thing from different angles — nothing is written
 * down. None of them promises anything about the provider, because that promise
 * is not ours to make; the subtitle carries that half, always, unchanged.
 */
const LINES: Readonly<Record<string, readonly string[]>> = {
    it: [
        'Questa non la vede nessuno',
        'Qui non resta traccia',
        'Nessuno saprà che l’hai chiesto',
        'Fuori dai registri',
        'Niente di tutto questo verrà ricordato',
        'Come se non fosse mai successo',
    ],
    en: [
        'Nobody sees this one',
        'No trace stays here',
        'Nobody will know you asked',
        'Off the record',
        'None of this will be remembered',
        'As if it never happened',
    ],
}

/** A small, stable hash: same id in, same line out, for as long as the chat lives. */
function seedOf(sessionId: string): number {
    let hash = 0
    for (let index = 0; index < sessionId.length; index += 1) {
        hash = (hash * 31 + sessionId.charCodeAt(index)) | 0
    }
    return Math.abs(hash)
}

export function talosTemporaryWelcome(sessionId: string | null, locale: string): string {
    const lines = LINES[locale.slice(0, 2).toLowerCase()] ?? LINES.en!
    if (!sessionId) return lines[0]!
    return lines[seedOf(sessionId) % lines.length]!
}
