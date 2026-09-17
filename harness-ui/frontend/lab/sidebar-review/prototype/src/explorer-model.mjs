/** Bounded, deterministic helpers for the offline explorer. Not a filesystem API. */
export const FILE_FILTERS = Object.freeze(['all', 'modified', 'agents', 'favorites', 'recent', 'trash']);
export function validateFileName(value, existing, previous = '') {
    const name = String(value).trim();
    if (!name || name.length > 240 || /[\\/:*?"<>|\x00-\x1f]/.test(name) || /[. ]$/.test(name) ||
        ['.', '..', '__proto__', 'constructor', 'prototype'].includes(name) ||
        /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)) {
        return { ok: false, error: 'Nome non valido. Usa un nome di file, senza percorsi o caratteri riservati.' };
    }
    if (existing.some(id => id !== previous && id.toLocaleLowerCase() === name.toLocaleLowerCase())) {
        return { ok: false, error: 'Nome già presente nel workspace o nel cestino.' };
    }
    return { ok: true, name };
}
export function uniqueCopyName(name, existing) {
    let number = 1;
    while (existing.some(id => id.toLowerCase() === `copia-${number}-${name}`.toLowerCase()))
        number++;
    return `copia-${number}-${name}`;
}
export function compileFileQuery(value) {
    const query = String(value).trim();
    const q = query.toLowerCase();
    if (query.length > 128)
        return { error: 'Ricerca troppo lunga: massimo 128 caratteri.', test: () => false };
    if (q.startsWith('/')) {
        const pattern = query.slice(1, query.endsWith('/') ? -1 : undefined);
        // This offline lab intentionally supports a bounded subset, not arbitrary JavaScript regex.
        // Reject groups, counted repetitions and backreferences before invoking RegExp.
        const unescaped = pattern.replace(/\\./g, 'x').replace(/\[[^\]]*\]/g, 'x');
        if (/[(){}]/.test(unescaped) || /\\[1-9]/.test(pattern) || (unescaped.match(/[*+]/g) || []).length > 1) {
            return { error: 'Regex semplice: niente gruppi, ripetizioni {n}, riferimenti o quantificatori multipli.', test: () => false };
        }
        try {
            const re = new RegExp(pattern, 'i');
            return { error: null, test: (_file, path) => re.test(path.slice(0, 512)) };
        }
        catch {
            return { error: 'Regex non valida. Correggi il pattern o usa un nome.', test: () => false };
        }
    }
    if (q.startsWith('testo:'))
        return { error: null, test: (_file, _path, body) => body.toLowerCase().includes(q.slice(6)) };
    if (q.startsWith('~'))
        return { error: null, test: (_file, path) => {
                let index = 0;
                const needle = q.slice(1);
                for (const c of path.toLowerCase())
                    if (c === needle[index])
                        index++;
                return index === needle.length;
            } };
    if (q.startsWith('ext:')) {
        const [extension, ...rest] = q.slice(4).split(/\s+/);
        return { error: null, test: (file, path) => file.id.toLowerCase().endsWith('.' + extension) && path.toLowerCase().includes(rest.join(' ')) };
    }
    return { error: null, test: (_file, path) => path.toLowerCase().includes(q) };
}
export function virtualRange(length, scroll, viewport, rowHeight, overscan = 4) {
    const height = Number.isFinite(rowHeight) && rowHeight > 0 ? rowHeight : 36;
    const count = Math.max(1, Math.ceil(Math.max(0, viewport) / height)) + overscan * 2;
    const start = Math.max(0, Math.min(Math.max(0, length - count), Math.floor(Math.max(0, scroll) / height) - overscan));
    const end = Math.min(length, start + count);
    return { start, end, before: start * height, after: Math.max(0, length - end) * height };
}
