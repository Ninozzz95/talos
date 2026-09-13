/**
 * Chat-generated files → Library (owner 2026-07-25): the chat cannot hand out
 * download links, so instead the model wraps any file it should save in a marker
 * and TALOS captures it into the Library (origin='generated') when the user has
 * enabled auto-save, announced with an undoable toast. Mirrors the TONE_SUGGESTION
 * (lib/tone.ts): a system-prompt instruction + a strip/extract pass.
 *
 * Marker: [TALOS_SAVE_LIBRARY: <filename.ext>]\n<content>\n[/TALOS_SAVE_LIBRARY]
 *
 * Security review 2026-07-25: model output is UNTRUSTED. One reply must not be
 * able to create unbounded files, the markers must never reach the durable
 * message or the streaming view, and captured files must never be re-injected
 * as context (that is what made prompt injection persistent).
 */

export interface LibrarySaveBlock {
    name: string
    mediaType: string
    text: string
}

const BLOCK_PATTERN = /\[TALOS_SAVE_LIBRARY:([^\]\n]{1,200})\]\r?\n?([\s\S]*?)\[\/TALOS_SAVE_LIBRARY\]/g
const OPEN_MARKER_PATTERN = /\[TALOS_SAVE_LIBRARY:[^\]\n]{0,200}\]\r?\n?/g
const CLOSE_MARKER_PATTERN = /\[\/TALOS_SAVE_LIBRARY\]\r?\n?/g
// C0 controls + DEL, written as escapes (they used to be literal bytes here).

/** Hard caps on what a single reply may persist. */
export const TALOS_LIBRARY_SAVE_MAX_BLOCKS = 3
export const TALOS_LIBRARY_SAVE_MAX_CHARS = 262_144

const MEDIA_TYPE_BY_EXT: Record<string, string> = {
    md: 'text/markdown', markdown: 'text/markdown', json: 'application/json',
    txt: 'text/plain', csv: 'text/csv', xml: 'application/xml',
    yml: 'text/yaml', yaml: 'text/yaml',
    // 'html' is deliberately absent: a text/html blob URL opened in the WebView
    // would be same-origin script execution from model-authored content.
}

function isUnsafeNameCodePoint(code: number): boolean {
    if (code < 0x20) return true                       // C0 controls
    if (code >= 0x7f && code <= 0x9f) return true       // DEL + C1 controls
    if (code === 0x00ad) return true                    // soft hyphen
    if (code >= 0x200b && code <= 0x200f) return true   // zero-width + LRM/RLM
    if (code === 0xfeff) return true                    // zero-width no-break space
    if (code >= 0x202a && code <= 0x202e) return true   // bidi embedding/override
    if (code >= 0x2066 && code <= 0x2069) return true   // bidi isolates
    return false
}

function stripControlChars(value: string): string {
    // Re-review 2026-07-25: filenames come from UNTRUSTED model output. Beyond C0
    // controls, bidi overrides let "invoice<U+202E>fdp.exe" render reversed in the
    // Library list, and zero-width chars hide differences between two entries.
    // NFKC first so look-alike compositions collapse before filtering.
    let result = ''
    for (const char of value.normalize('NFKC')) {
        const code = char.codePointAt(0) ?? 0
        if (!isUnsafeNameCodePoint(code)) result += char
    }
    return result
}

function safeName(raw: string): string {
    // Vault leaf-name discipline: strip paths + control chars, never trust the
    // model's filename; fall back to a neutral default.
    // Round 3: normalise FIRST — NFKC maps the fullwidth solidus (U+FF0F) to '/',
    // so splitting before normalising let a separator survive into the leaf.
    const leaf = (stripControlChars(raw).split(/[\\/]/).at(-1) ?? '').trim()
    if (!leaf || leaf === '.' || leaf === '..' || leaf.length > 200) return 'generated.md'
    return leaf
}

function mediaTypeFor(name: string): string {
    const ext = name.includes('.') ? name.split('.').at(-1)!.toLowerCase() : ''
    return MEDIA_TYPE_BY_EXT[ext] ?? 'text/plain'
}

/**
 * Extract saved-file blocks and return the visible text with the marker tags
 * removed but the content KEPT inline (so the reply reads naturally). Fail-closed:
 * an unterminated marker captures nothing; blocks past the cap (or over the size
 * limit) are unwrapped for display but never captured.
 */
export function extractLibrarySaveBlocks(raw: string): { text: string; blocks: LibrarySaveBlock[] } {
    const blocks: LibrarySaveBlock[] = []
    const text = raw.replace(BLOCK_PATTERN, (_match, rawName: string, rawBody: string) => {
        const name = safeName(rawName)
        const body = rawBody.trim()
        if (blocks.length < TALOS_LIBRARY_SAVE_MAX_BLOCKS && body.length <= TALOS_LIBRARY_SAVE_MAX_CHARS) {
            blocks.push({ name, mediaType: mediaTypeFor(name), text: body })
        }
        return body
    })
    return { text, blocks }
}

/**
 * Strip marker syntax for DISPLAY and PERSISTENCE without capturing anything —
 * applied to the streaming tail and to interrupted replies, which previously
 * rendered and persisted raw markers (and taught the model to emit them).
 */
export function stripLibrarySaveMarkers(raw: string): string {
    return raw
        .replace(BLOCK_PATTERN, (_match, _name: string, body: string) => body.trim())
        .replace(OPEN_MARKER_PATTERN, '')
        .replace(CLOSE_MARKER_PATTERN, '')
}

export function librarySaveInstruction(): string {
    return 'When the user asks you to create, generate, or save a file/document — or when you produce a '
        + 'document worth keeping (report, code file, data) — output its FULL content wrapped EXACTLY as '
        + '[TALOS_SAVE_LIBRARY: <filename.ext>]\n<content>\n[/TALOS_SAVE_LIBRARY]. TALOS offers to save it '
        + 'to the user\'s Library, and it becomes reusable in any chat. Never claim you cannot create files '
        + 'and never offer download links or data: URLs — use this marker instead. Do not mention the '
        + 'marker mechanism itself.'
}
