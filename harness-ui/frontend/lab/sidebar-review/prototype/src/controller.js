function renderCenter() { const s = store.get(); const preserve = $('#center').scrollTop; $('#center').innerHTML = s.central === 'graph' ? graphView() : s.central === 'review' ? reviewView() : s.central === 'file' ? fileView() : chatView(); $('#composerHost').hidden = s.central !== 'chat'; $$('.center-tabs [data-value]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.value === s.central))); if (s.central === 'file')
    $('#fileViewTab').hidden = false; if (s.central === 'graph') {
    $('#graphViewTab').hidden = false;
    drawGraph();
    setupGraphDrag();
}
else
    $('#center').scrollTop = preserve; }
function renderAll() { tabMarkup(); renderRail(); renderCenter(); setWidth(store.get().width, false); }
function setWidth(value, save = true) { const width = Math.max(300, Math.min(600, value, window.innerWidth - 650)); $('#shell').style.setProperty('--inspector', width + 'px'); $('#resizer').setAttribute('aria-valuenow', width); $('#widthLabel').textContent = width + ' px'; if (save) {
    act('WIDTH', { value: width });
    try {
        localStorage.setItem('talos.sidebar.lab.width', String(width));
    }
    catch { }
} }
function changeTab(value) { closeMenu(); renaming = null; rememberScroll(); act('TAB', { value }); tabMarkup(); renderRail(); }
function openAgent(id) { const a = agents.find(x => x.id === id); if (!a)
    return; rememberScroll(); if (a.session !== store.get().session) {
    contextBySession.set(store.get().session, [...contextFiles]);
    act('SESSION', { id: a.session });
    contextFiles = [...(contextBySession.get(a.session) || [])];
} act('AGENT', { id }); tabMarkup(); renderRail(); if (store.get().central === 'graph')
    drawGraph(); }
function openGraph(id) { if (id)
    openAgent(id); act('PATCH', { value: { central: 'graph' } }); renderCenter(); requestAnimationFrame(fitGraph); }
function openFile(id, ids) { if (!fileBy(id)) {
    toast('File non più disponibile.');
    return;
} rememberScroll(); act('FILE', { id, ids }); renderRail(); renderCenter(); }
function closeMenu(restore = false) { const m = $('#menu'); m.hidden = true; m.innerHTML = ''; menuReturn?.setAttribute('aria-expanded', 'false'); if (restore) {
    if (menuReturn?.isConnected)
        menuReturn.focus();
    else
        $('#fileSearch')?.focus();
} }
function openMenu(anchor, html) { closeMenu(); const r = anchor.getBoundingClientRect(), m = $('#menu'); menuReturn = anchor; anchor.setAttribute('aria-haspopup', 'menu'); anchor.setAttribute('aria-expanded', 'true'); anchor.setAttribute('aria-controls', 'menu'); m.setAttribute('role', 'menu'); m.setAttribute('aria-label', anchor.getAttribute('aria-label') || 'Azioni'); m.innerHTML = html; $$('button', m).forEach(b => { b.setAttribute('role', 'menuitem'); b.tabIndex = -1; }); m.hidden = false; m.style.left = Math.max(8, Math.min(window.innerWidth - m.offsetWidth - 8, r.right - m.offsetWidth)) + 'px'; m.style.top = Math.max(8, Math.min(window.innerHeight - m.offsetHeight - 8, r.bottom + 4)) + 'px'; m.querySelector('button:not(:disabled)')?.focus(); }
function actionButton(v, t, id = '') { return `<button data-action="${v}" ${id ? `data-id="${esc(id)}"` : ''}>${t}</button>`; }
function fileMenu(anchor, id) { const f = fileBy(id); if (!f)
    return; act('PATCH', { value: { selectedFile: id, selectedFiles: [id] } }); openMenu(anchor, (f.agent ? actionButton('file-agent', 'Apri agente collegato', f.agent) : '') + actionButton('context-selected', 'Aggiungi al Context') + actionButton('favorite', f.favorite ? 'Rimuovi preferito' : 'Aggiungi ai preferiti', id) + actionButton('rename', 'Rinomina', id) + actionButton('duplicate', 'Duplica', id) + actionButton('copy-file', 'Copia', id) + actionButton('cut-file', 'Taglia', id) + actionButton('paste-file', 'Incolla qui', id) + '<hr>' + `<button data-action="ai" data-value="Spiega">Spiega / analizza</button><button data-action="ai" data-value="Trova bug">Trova bug (sola lettura)</button><button data-action="ai" data-value="Refactor">Refactor in area isolata</button><button data-action="ai" data-value="Genera test">Genera test in area isolata</button>` + '<hr>' + actionButton('delete-file', 'Sposta nel cestino demo', id)); }
function aiAction(kind) { closeMenu(); if (!store.get().selectedFiles.length) {
    toast('Seleziona almeno un file.');
    return;
} if (['Refactor', 'Genera test'].includes(kind)) {
    act('PATCH', { value: { central: 'review', reviewStatus: 'ready', conflict: false } });
    renderCenter();
    toast(kind + ': proposta dimostrativa pronta per la revisione. Nessun agente avviato.');
}
else {
    contextFiles = Array.from(new Set([...contextFiles, ...store.get().selectedFiles]));
    $('#composer').value = `${kind}: ${store.get().selectedFiles.join(', ')}. Usa soltanto lettura; non applicare modifiche.`;
    act('PATCH', { value: { central: 'chat' } });
    renderCenter();
    toast('Bozza preparata nel composer. Non inviata.');
} }
function showGuide() { guideReturn = document.activeElement; closeMenu(); $('#shell').inert = true; $('.labbar').inert = true; $('#overlay').hidden = false; $('.sheet').focus(); }
function hideGuide() { $('#overlay').hidden = true; $('#shell').inert = false; $('.labbar').inert = false; guideReturn?.focus(); }
function renameSubmit(cancel = false) {
    const old = renaming, input = $('#renameInput');
    if (!old)
        return;
    if (!cancel) {
        const result = validateFileName(input?.value || '', files.concat(deleted).map(f => f.id), old);
        if (!result.ok) {
            input?.setAttribute('aria-invalid', 'true');
            toast(result.error);
            input?.focus();
            return;
        }
        if (result.name !== old) {
            const f = fileBy(old);
            if (!f) {
                renaming = null;
                return;
            }
            f.id = result.name;
            if (Object.hasOwn(bodies, old)) {
                bodies[result.name] = bodies[old];
                delete bodies[old];
            }
            remapReferences(old, result.name);
        }
    }
    renaming = null;
    renderRail();
    if (store.get().central === 'file')
        renderCenter();
    const row = $$('[data-file]').find(n => n.dataset.file === store.get().selectedFile);
    row?.focus();
}
