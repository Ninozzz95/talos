/**
 * Windows Node resolves a single-leading-slash path on the current drive, not in WSL.
 * Refuse the ambiguous spelling; explicit host paths still go through existing policy.
 * Node24.18.0 path and Microsoft Win32/WSL contracts: see LEDGER-NAMESPACE35.
 */
export function motivoNamespacePercorso(percorso, {platform = process.platform} = {}) {
    if (platform !== 'win32' || typeof percorso !== 'string' || !/^\/(?![\\/])/u.test(percorso)) return null
    return 'FILE_NAMESPACE_MISMATCH: file tools use the Windows host filesystem; selecting a WSL shell does not move them into Linux. '
        + 'Use an explicit Windows drive path or an explicit UNC path obtained with the official wslpath -w conversion. '
        + 'The ambiguous path was not read or written.'
}
