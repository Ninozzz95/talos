/**
 * How a failure is worded, in one place.
 *
 * Owner 2026-07-26: a code like `TALOS_ATTACHMENT_TYPE_MISMATCH` is exactly what
 * is needed to fix a defect and exactly what nobody using the app should be
 * shown. So the plain sentence is always there and the code rides along only
 * when diagnostics are on.
 *
 * The rule the switch does NOT touch: an outcome is never invented. Hiding a
 * code is a presentation choice; claiming something worked when it did not is a
 * lie, and no toggle makes that acceptable.
 */
export function talosFailureMessage(
    plain: string,
    code: unknown,
    diagnostics: boolean,
): string {
    if (!diagnostics) return plain
    const detail = code instanceof Error ? code.message : String(code)
    return detail && detail !== plain ? `${plain} [${detail}]` : plain
}
