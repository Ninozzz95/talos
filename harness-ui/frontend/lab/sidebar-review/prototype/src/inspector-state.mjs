/** Pure, scoped prototype state: selectedAgent never owns activeTab. */
export const TABS = Object.freeze(['context', 'files', 'agents', 'processes']);
export function initialState() {
    return { activeTab: 'files', session: 'sidebar', contexts: {}, central: 'chat',
        selectedFile: 'inspector.js', selectedFiles: [], selectedAgent: null,
        fileQuery: '', fileFilter: 'all', agentQuery: '', agentFilter: 'all',
        scope: 'session', width: 380, detailSection: 'overview', graphIsolated: null,
        reviewStatus: 'ready', conflict: false, revision: 0 };
}
export function reduce(s, a) {
    switch (a.type) {
        case 'TAB':
            if (!TABS.includes(a.value))
                throw new RangeError('Unknown tab');
            return { ...s, activeTab: a.value };
        case 'AGENT': return { ...s, selectedAgent: a.id, activeTab: 'agents' };
        case 'LIST': return { ...s, selectedAgent: null };
        case 'FILE': return { ...s, selectedFile: a.id, selectedFiles: a.ids || [a.id], central: 'file' };
        case 'SCOPE':
            if (!['execution', 'session', 'workspace'].includes(a.value))
                throw new RangeError('Unknown scope');
            return { ...s, scope: a.value, graphIsolated: null };
        case 'SESSION': {
            if (a.id === s.session)
                return s;
            const contexts = { ...s.contexts, [s.session]: { selectedAgent: s.selectedAgent, selectedFile: s.selectedFile, selectedFiles: [...s.selectedFiles], fileQuery: s.fileQuery, fileFilter: s.fileFilter, agentQuery: s.agentQuery, agentFilter: s.agentFilter, detailSection: s.detailSection } };
            return { ...s, contexts, session: a.id, selectedAgent: null, selectedFile: null, selectedFiles: [], fileQuery: '', fileFilter: 'all', agentQuery: '', agentFilter: 'all', detailSection: 'overview', graphIsolated: null, ...(Object.hasOwn(contexts, a.id) ? contexts[a.id] : {}) };
        }
        case 'WIDTH': return { ...s, width: Math.max(300, Math.min(600, Number.isFinite(a.value) ? a.value : s.width)) };
        case 'APPLY': return s.conflict || s.reviewStatus !== 'ready' ? s : { ...s, reviewStatus: 'applied' };
        case 'REVISION': return { ...s, reviewStatus: 'ready', revision: s.revision + 1 };
        case 'DISCARD': return s.reviewStatus === 'ready' ? { ...s, reviewStatus: 'discarded' } : s;
        case 'PATCH': return { ...s, ...a.value };
        default: return s;
    }
}
export function createStore(seed = initialState()) {
    let state = seed;
    const listeners = new Set();
    return { get: () => state, dispatch(a) { const old = state; state = reduce(state, a); if (state !== old)
            for (const fn of [...listeners])
                fn(state, old, a); return state; },
        subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); } };
}
