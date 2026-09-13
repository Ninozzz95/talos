/**
 * F5.1 (owner) — progressive streaming markdown, competitor pattern
 * (Streamdown/markstream: complete unterminated syntax before rendering so
 * partial chunks format cleanly). Pure and dependency-free ON PURPOSE: the
 * message list imports it eagerly, the heavy renderer stays in its async
 * chunk (entry budget).
 */
export function stabilizeStreamingTalosMarkdown(source: string): string {
    const fences = source.match(/^\s{0,3}(```|~~~)/gm)?.length ?? 0
    if (fences % 2 === 1) return `${source}\n\`\`\``
    return source
}
