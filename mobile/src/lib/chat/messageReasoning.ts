/**
 * The one boundary between persisted message metadata and displayable/exported
 * reasoning.
 *
 * Provider adapters already normalize their wire formats into a string. This
 * function deliberately does not coerce, parse Markdown, or interpret legacy
 * object shapes: unreadable/redacted/non-canonical values fail closed.
 *
 * Preserve the returned bytes. The UI drawer is plain text and the transcript
 * owns its own quoting, so normalization here would make those two artifacts
 * disagree with what the provider actually returned.
 */
export function talosMessageReasoning(metadata: Record<string, unknown>): string | null {
    const value = metadata.reasoning
    return typeof value === 'string' && value.trim() ? value : null
}
