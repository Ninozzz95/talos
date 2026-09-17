document.addEventListener('input', e => { if (e.target.id === 'fileSearch') {
    if (e.isComposing)
        return;
    resetFileScroll();
    act('PATCH', { value: { fileQuery: e.target.value } });
    renderRail();
} if (e.target.id === 'agentSearch') {
    act('PATCH', { value: { agentQuery: e.target.value } });
    renderRail();
} if (e.target.id === 'graphSearch') {
    graph.query = e.target.value;
    drawGraph();
} if (e.target.id === 'replay') {
    graph.time = +e.target.value;
    drawGraph();
    e.target.previousElementSibling.textContent = graph.time === 4 ? 'ORA' : 'T' + graph.time;
} });
document.addEventListener('compositionend', e => { if (e.target.id === 'fileSearch')
    e.target.dispatchEvent(new Event('input', { bubbles: true })); });
document.addEventListener('change', e => { if (e.target.id === 'fileFilter') {
    resetFileScroll();
    act('PATCH', { value: { fileFilter: e.target.value } });
    renderRail();
} if (e.target.id === 'scenario') {
    scenario = e.target.value;
    renderRail();
} if (e.target.id === 'graphScope') {
    act('SCOPE', { value: e.target.value });
    drawGraph();
    fitGraph();
} if (e.target.id === 'graphStatus') {
    graph.status = e.target.value;
    drawGraph();
    fitGraph();
} if (e.target.id === 'conflictToggle') {
    act('PATCH', { value: { conflict: e.target.checked } });
    renderCenter();
} });
document.addEventListener('keydown', e => {
    if (e.target.closest('#menu')) {
        const items = $$('#menu button:not(:disabled)');
        const i = items.indexOf(document.activeElement);
        if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
            e.preventDefault();
            const next = e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : (i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length;
            items[next]?.focus();
            return;
        }
        if (e.key === 'Tab') {
            closeMenu(true);
            return;
        }
    }
    if (e.key === 'Escape') {
        if (!$('#overlay').hidden)
            hideGuide();
        else if (renaming)
            renameSubmit(true);
        else {
            closeMenu(true);
        }
        return;
    }
    if (!$('#overlay').hidden && e.key === 'Tab') {
        const controls = $$('button,[href],input,select,textarea,[tabindex="0"]', $('.sheet')).filter(x => !x.disabled);
        const first = controls[0], last = controls.at(-1);
        if (e.shiftKey && (document.activeElement === first || document.activeElement === $('.sheet'))) {
            e.preventDefault();
            last.focus();
        }
        else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
        }
        return;
    }
    if (e.target.id === 'renameInput') {
        if (e.key === 'Enter') {
            e.preventDefault();
            renameSubmit();
        }
        return;
    }
    if (e.target.closest('#railTabs')) {
        const tabs = $$('#railTabs [role=tab]');
        let i = tabs.indexOf(e.target);
        if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
            e.preventDefault();
            i = e.key === 'Home' ? 0 : e.key === 'End' ? 3 : (i + (e.key === 'ArrowRight' ? 1 : 3)) % 4;
            changeTab(tabs[i].dataset.tab);
            tabs[i].focus();
        }
        return;
    }
    if (e.target.id === 'resizer' && ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
        e.preventDefault();
        setWidth(e.key === 'Home' ? 300 : e.key === 'End' ? 600 : store.get().width + (e.key === 'ArrowLeft' ? 20 : -20));
        return;
    }
    const row = e.target.closest('[data-file],[data-agent],[data-folder]');
    if (row && e.target === row) {
        const tree = $('#fileTree');
        const nodes = $$('[data-file],[data-folder],[data-agent]', $('#railContent'));
        const i = nodes.indexOf(row);
        const focus = n => { if (!n)
            return; for (const x of nodes)
            x.tabIndex = -1; n.tabIndex = 0; n.focus(); };
        if (e.shiftKey && e.key === 'F10' && row.dataset.file) {
            e.preventDefault();
            fileMenu(row, row.dataset.file);
            return;
        }
        if (e.key === 'Enter') {
            e.preventDefault();
            row.click();
            return;
        }
        if (e.key === ' ') {
            e.preventDefault();
            if (row.dataset.file) {
                const cb = $('[data-select-file]', row);
                cb?.click();
            }
            else
                row.click();
            return;
        }
        if (scenario === 'large' && row.dataset.file && ['ArrowDown', 'ArrowUp', 'Home', 'End', 'PageDown', 'PageUp'].includes(e.key)) {
            e.preventDefault();
            const index = virtualFiles.findIndex(f => f.id === row.dataset.file);
            const scroller = $('#fileScroll');
            const height = parseFloat(getComputedStyle(tree).getPropertyValue('--file-row-height')) || 36;
            const step = e.key.startsWith('Page') ? Math.max(1, Math.floor(scroller.clientHeight / height)) : 1;
            const next = e.key === 'Home' ? 0 : e.key === 'End' ? virtualFiles.length - 1 : Math.max(0, Math.min(virtualFiles.length - 1, index + (['ArrowDown', 'PageDown'].includes(e.key) ? step : -step)));
            scroller.scrollTop = next * height;
            scroller.dispatchEvent(new Event('scroll'));
            const target = $$('[data-file]', tree).find(n => n.dataset.file === virtualFiles[next]?.id);
            if (target) {
                $$('[data-file]', tree).forEach(n => n.tabIndex = -1);
                target.tabIndex = 0;
                target.focus({ preventScroll: true });
            }
            return;
        }
        if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
            e.preventDefault();
            focus(nodes[e.key === 'Home' ? 0 : e.key === 'End' ? nodes.length - 1 : Math.max(0, Math.min(nodes.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))]);
            return;
        }
        if (e.key === 'ArrowRight' && row.dataset.folder) {
            e.preventDefault();
            if (!folderOpen.has(row.dataset.folder))
                row.click();
            else
                focus(nodes[i + 1]);
            return;
        }
        if (e.key === 'ArrowLeft') {
            e.preventDefault();
            if (row.dataset.folder && folderOpen.has(row.dataset.folder))
                row.click();
            else if (row.dataset.file) {
                const folder = fileBy(row.dataset.file)?.folder;
                focus(nodes.find(n => n.dataset.folder === folder));
            }
            return;
        }
        if (e.key === 'F2' && row.dataset.file) {
            e.preventDefault();
            renaming = row.dataset.file;
            renderRail();
            return;
        }
        if (tree && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
            e.preventDefault();
            act('PATCH', { value: { selectedFiles: scenario === 'large' ? virtualFiles.map(f => f.id) : $$('[data-file]', tree).map(n => n.dataset.file) } });
            renderRail();
            return;
        }
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        changeTab('files');
        $('#fileSearch')?.focus();
    }
});
document.addEventListener('contextmenu', e => { const row = e.target.closest('[data-file]'); if (row) {
    e.preventDefault();
    fileMenu(row, row.dataset.file);
} });
let draggedFile = null;
document.addEventListener('dragstart', e => { const row = e.target.closest('[data-file]'); if (row) {
    draggedFile = row.dataset.file;
    e.dataTransfer.setData('text/plain', draggedFile);
} });
document.addEventListener('dragend', () => { draggedFile = null; });
document.addEventListener('dragover', e => { if (e.target.closest('[data-folder]'))
    e.preventDefault(); });
document.addEventListener('drop', e => { const folder = e.target.closest('[data-folder]'); if (folder && draggedFile) {
    e.preventDefault();
    const f = files.find(f => f.id === draggedFile);
    if (f) {
        f.folder = folder.dataset.folder;
        folderOpen.add(f.folder);
        renderRail();
        toast('File spostato nella cartella demo.');
    }
    draggedFile = null;
} });
$('#resizer').addEventListener('pointerdown', e => { e.preventDefault(); const r = e.currentTarget; r.setPointerCapture(e.pointerId); const start = e.clientX, w = $('#inspector').getBoundingClientRect().width; const move = ev => setWidth(Math.round(w + start - ev.clientX), false); const up = ev => { r.removeEventListener('pointermove', move); r.removeEventListener('pointerup', up); r.removeEventListener('pointercancel', up); setWidth(ev.type === 'pointercancel' ? w : Math.round(w + start - ev.clientX)); }; r.addEventListener('pointermove', move); r.addEventListener('pointerup', up); r.addEventListener('pointercancel', up); });
function setupGraphDrag() { const c = $('#graphCanvas'); if (!c)
    return; c.addEventListener('pointerdown', e => { if (e.target.closest('.node'))
    return; e.preventDefault(); c.setPointerCapture(e.pointerId); const x = e.clientX, y = e.clientY, ox = graph.x, oy = graph.y; const move = ev => { graph.x = ox + ev.clientX - x; graph.y = oy + ev.clientY - y; transformGraph(); }; const up = () => { c.removeEventListener('pointermove', move); c.removeEventListener('pointerup', up); c.removeEventListener('pointercancel', up); }; c.addEventListener('pointermove', move); c.addEventListener('pointerup', up); c.addEventListener('pointercancel', up); }); c.addEventListener('wheel', e => { if (e.ctrlKey) {
    e.preventDefault();
    graph.zoom = Math.max(.2, Math.min(2.5, graph.zoom - e.deltaY * .002));
    transformGraph();
} }, { passive: false }); }
try {
    const width = Number(localStorage.getItem('talos.sidebar.lab.width'));
    if (width >= 300)
        act('WIDTH', { value: width });
}
catch { }
renderAll();
window.addEventListener('resize', () => { setWidth(store.get().width, false); if (store.get().central === 'graph')
    fitGraph(); });
// Introspection is read-only apart from explicit demo actions, useful for acceptance tests.
window.TalosLab = { state: () => structuredClone(store.get()), fileCount: () => files.length, graphCount: () => graphAgents().length };
