function scrollKey() { const s = store.get(); return [s.session, s.activeTab, s.activeTab === 'agents' ? s.selectedAgent || 'list' : ''].join(':'); }
function rememberScroll() { const host = $('#railContent'), x = $('.scroll', host); if (x && host.dataset.scrollKey)
    scrolls.set(host.dataset.scrollKey, x.scrollTop); }
function renderRail() {
    rememberScroll();
    const focused = document.activeElement;
    const focusFile = focused?.closest('[data-file]')?.dataset.file;
    const focusFolder = focused?.closest('[data-folder]')?.dataset.folder;
    const focusAction = focused?.dataset.action;
    const focusActionId = focused?.dataset.id;
    const s = store.get();
    const host = $('#railContent');
    host.id = 'railContent';
    host.setAttribute('role', 'tabpanel');
    host.setAttribute('aria-labelledby', 'inspector-tab-' + s.activeTab);
    host.dataset.currentTab = s.activeTab;
    host.dataset.scrollKey = scrollKey();
    const focusId = document.activeElement?.id;
    const cursor = document.activeElement?.selectionStart;
    if (scenario === 'loading') {
        host.innerHTML = `<div class="rail-top"><h3>Caricamento della ${s.activeTab === 'agents' ? 'lista agenti' : 'vista'}…</h3><p class="small muted">Stato di prova. Puoi comunque cambiare tab.</p></div><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div>`;
    }
    else if (scenario === 'error') {
        host.innerHTML = `<div class="empty">${icon('shield')}<h3>Collegamento non disponibile</h3><p>Errore simulato. Nessun dato locale è stato modificato.</p><button class="btn" data-action="normal">Riprova</button></div>`;
    }
    else if (scenario === 'empty') {
        host.innerHTML = `<div class="empty">${icon('folder')}<h3>Nessun elemento</h3><p>Questo è lo stato vuoto della vista. La navigazione rimane disponibile.</p><button class="btn" data-action="normal">Carica dati demo</button></div>`;
    }
    else if (s.activeTab === 'files')
        renderFiles();
    else if (s.activeTab === 'agents')
        renderAgents();
    else if (s.activeTab === 'context')
        renderContext();
    else
        renderProcesses();
    if (scenario === 'partial')
        host.insertAdjacentHTML('afterbegin', '<div class="notice" style="margin:12px">Dati parziali simulati: le metriche mancanti sono mostrate come «—».</div>');
    host.removeAttribute('role');
    host.removeAttribute('aria-labelledby');
    const names = { context: 'railContext', files: 'railFile', agents: 'railAgenti', processes: 'railProcessi' };
    const content = [...host.childNodes];
    for (const [tab, panelId] of Object.entries(names)) {
        const panel = document.createElement('div');
        panel.id = panelId;
        panel.className = 'rail-panel';
        panel.setAttribute('role', 'tabpanel');
        panel.setAttribute('aria-labelledby', 'inspector-tab-' + tab);
        panel.hidden = tab !== s.activeTab;
        if (!panel.hidden)
            panel.append(...content);
        host.append(panel);
    }
    const scroll = $('#railContent .scroll');
    if (scroll)
        scroll.scrollTop = scrolls.get(scrollKey()) || 0;
    if (!focusId) {
        const f = focusFile ? $$('[data-file]').find(n => n.dataset.file === focusFile) : focusFolder ? $$('[data-folder]').find(n => n.dataset.folder === focusFolder) : focusAction ? $$('[data-action]').find(n => n.dataset.action === focusAction && n.dataset.id === focusActionId) : null;
        f?.focus({ preventScroll: true });
    }
    if (focusId && document.getElementById(focusId)) {
        const f = document.getElementById(focusId);
        f.focus();
        if (typeof cursor === 'number' && f.setSelectionRange)
            try {
                f.setSelectionRange(cursor, cursor);
            }
            catch { }
    }
}
function matchFile(f) {
    const s = store.get();
    if (s.fileFilter === 'modified' && !f.git || s.fileFilter === 'favorites' && !f.favorite || s.fileFilter === 'agents' && !f.agent || s.fileFilter === 'recent' && !f.git && !f.agent)
        return false;
    if (cachedQuery !== s.fileQuery) {
        cachedQuery = s.fileQuery;
        compiledQuery = compileFileQuery(cachedQuery);
    }
    return compiledQuery.test(f, filePath(f), bodies[f.id] || '');
}
function fileRow(f, flat = false) { const s = store.get(); const selected = s.selectedFiles.includes(f.id); return `<div class="file-row ${selected ? 'selected' : ''}" tabindex="${selected ? 0 : -1}" role="treeitem" aria-selected="${selected}" aria-label="${esc(filePath(f))}" aria-level="${f.folder && !flat ? 2 : 1}" data-file="${esc(f.id)}" draggable="true" style="padding-left:${f.folder && !flat ? '24' : '7'}px"><input class="file-check" type="checkbox" tabindex="-1" aria-label="Seleziona ${esc(f.id)}" ${selected ? 'checked' : ''} data-select-file="${esc(f.id)}">${icon('file')}${renaming === f.id ? `<input id="renameInput" value="${esc(f.id)}" aria-label="Nuovo nome del file" style="width:100%;padding:3px">` : `<span class="fname" title="${esc(filePath(f))}">${esc(f.id)}</span>`}<span class="status" title="${f.git === 'M' ? 'Modificato nella fixture' : f.git === 'A' ? 'Creato nella fixture' : ''}">${f.git || ''}</span>${f.agent ? `<button class="agent-indicator" tabindex="-1" data-action="file-agent" data-id="${esc(f.agent)}" aria-label="Apri agente ${esc(agents.find(a => a.id === f.agent)?.name || '')}" title="${esc(f.activity)} · ${esc(agents.find(a => a.id === f.agent)?.name || '')}">${icon('robot')}</button>` : ''}<button class="file-more" tabindex="-1" aria-haspopup="menu" aria-expanded="false" data-action="file-menu" data-id="${esc(f.id)}" aria-label="Azioni su ${esc(f.id)}" title="Azioni sul file">${icon('more')}</button></div>`; }
function renderFiles() {
    const s = store.get();
    if (cachedQuery !== s.fileQuery) {
        cachedQuery = s.fileQuery;
        compiledQuery = compileFileQuery(cachedQuery);
    }
    virtualFiles = [];
    if (scenario === 'large' && !largeSeeded) {
        for (let i = 0; i < 1000; i++)
            files.push({ id: `fixture-${String(i).padStart(4, '0')}.ts`, folder: 'generated', git: '', agent: null, synthetic: true });
        largeSeeded = true;
    }
    const list = s.fileFilter === 'trash' ? deleted : files.filter(f => scenario === 'large' || !f.synthetic).filter(matchFile);
    const filterNames = { all: 'Tutti i file', modified: 'Modificati', agents: 'Con attività agente', favorites: 'Preferiti', recent: 'Recenti', trash: `Cestino (${deleted.length})` };
    $('#railContent').innerHTML = `<div class="rail-top files-top"><div class="row">${icon('folder')}<b class="grow">talos</b><button data-action="new-file" class="iconbutton" title="Crea file demo" aria-label="Crea file demo">${icon('plus')}</button><button class="iconbutton" data-action="file-tools" aria-label="Opzioni file" aria-haspopup="menu" aria-expanded="false" title="Opzioni file">${icon('more')}</button></div><div class="searchbox">${icon('search')}<input id="fileSearch" maxlength="128" value="${esc(s.fileQuery)}" placeholder="Cerca file…" aria-label="Cerca file" aria-describedby="fileSearchError" aria-invalid="${!!compiledQuery.error}"></div><div class="file-browse-row"><label class="sr-only" for="fileFilter">Vista file</label><select id="fileFilter">${FILE_FILTERS.map(v => `<option value="${v}" ${s.fileFilter === v ? 'selected' : ''}>${filterNames[v]}</option>`).join('')}</select><span class="small muted" aria-live="polite">${list.length} file</span></div><p id="fileSearchError" class="small danger" role="status" ${compiledQuery.error ? '' : 'hidden'}>${esc(compiledQuery.error || '')}</p></div><div class="scroll" id="fileScroll"><div class="section-label"><span>harness-ui / frontend</span></div><div class="tree ${selectionMode ? 'selection-mode' : ''}" id="fileTree" role="tree" aria-label="File del workspace demo" aria-multiselectable="true"></div></div>${s.selectedFiles.length ? `<div class="rail-foot file-selection"><span class="small muted" role="status">${s.selectedFiles.length} ${s.selectedFiles.length === 1 ? 'selezionato' : 'selezionati'}</span><span class="grow"></span><button class="btn" data-action="context-selected">Al Context</button><button class="iconbutton" data-action="selection-menu" aria-label="Azioni selezione" aria-haspopup="menu" aria-expanded="false" title="Azioni selezione">${icon('more')}</button></div>` : ''}`;
    const tree = $('#fileTree');
    if (s.fileFilter === 'trash') {
        tree.removeAttribute('role');
        tree.removeAttribute('aria-multiselectable');
        tree.innerHTML = list.map(f => `<div class="file-row"><span class="fname">${esc(f.id)}</span><button data-action="restore-file" data-id="${esc(f.id)}">Ripristina</button></div>`).join('') || '<div class="empty">Cestino vuoto</div>';
        return;
    }
    if (compiledQuery.error || !list.length) {
        tree.removeAttribute('role');
        tree.removeAttribute('aria-multiselectable');
        tree.innerHTML = `<div class="empty"><h3>${compiledQuery.error ? 'Controlla la ricerca' : 'Nessuna corrispondenza'}</h3><p>Prova un nome, /regex semplice/ o ext:css.</p><button class="btn" data-action="clear-search">Azzera ricerca</button></div>`;
        return;
    }
    if (scenario === 'large') {
        virtualFiles = list;
        const scroller = $('#fileScroll');
        let previous = '';
        const draw = () => {
            const rowHeight = parseFloat(getComputedStyle(tree).getPropertyValue('--file-row-height')) || 36;
            const range = virtualRange(list.length, Math.max(0, scroller.scrollTop - 30), scroller.clientHeight || 700, rowHeight);
            const key = `${range.start}:${range.end}:${rowHeight}`;
            if (key === previous)
                return;
            previous = key;
            const hadFocus = tree.contains(document.activeElement), focusedId = document.activeElement?.closest('[data-file]')?.dataset.file;
            tree.innerHTML = `<div role="none" style="height:${range.before}px"></div>${list.slice(range.start, range.end).map((f, i) => fileRow(f, true).replace('role="treeitem"', `role="treeitem" aria-setsize="${list.length}" aria-posinset="${range.start + i + 1}"`)).join('')}<div role="none" style="height:${range.after}px"></div>`;
            prepareTreeFocus();
            if (hadFocus) {
                const rows = $$('[data-file]', tree);
                const target = rows.find(n => n.dataset.file === focusedId) || rows[0];
                if (target) {
                    rows.forEach(n => n.tabIndex = -1);
                    target.tabIndex = 0;
                    target.focus({ preventScroll: true });
                }
            }
        };
        scroller.addEventListener('scroll', draw);
        scroller.scrollTop = scrolls.get(scrollKey()) || 0;
        draw();
        return;
    }
    const filtered = !!s.fileQuery || s.fileFilter !== 'all';
    if (filtered)
        tree.innerHTML = list.map(f => fileRow(f, true)).join('');
    else {
        const groups = Array.from(new Set(list.map(f => f.folder))).filter(Boolean).concat('');
        tree.innerHTML = groups.map(group => {
            const subset = list.filter(f => f.folder === group);
            if (!subset.length)
                return '';
            return group ? `<div class="folder-item" tabindex="-1" data-folder="${esc(group)}" role="treeitem" aria-label="${esc(group)}" aria-level="1" aria-expanded="${folderOpen.has(group)}"><div class="folder"><span>${folderOpen.has(group) ? '⌄' : '›'}</span>${icon('folder')}<span>${esc(group)}</span></div>${folderOpen.has(group) ? `<div role="group">${subset.map(f => fileRow(f)).join('')}</div>` : ''}</div>` : subset.map(f => fileRow(f)).join('');
        }).join('');
    }
    prepareTreeFocus();
    if (renaming) {
        $('#renameInput')?.focus();
        $('#renameInput')?.select();
    }
}
function prepareTreeFocus() {
    const tree = $('#fileTree');
    if (!tree)
        return;
    const rows = $$('[data-file],[data-folder]', tree);
    for (const row of rows)
        row.tabIndex = -1;
    const preferred = rows.find(n => n.dataset.file === store.get().selectedFile) || rows[0];
    if (preferred)
        preferred.tabIndex = 0;
}
function resetFileScroll() { const scroller = $('#fileScroll'); if (scroller)
    scroller.scrollTop = 0; scrolls.set(scrollKey(), 0); }
function remapReferences(oldId, newId) {
    const remap = list => list.map(id => id === oldId ? newId : id).filter(Boolean);
    const s = store.get();
    const contexts = { ...s.contexts };
    for (const key of Object.keys(contexts)) {
        const c = contexts[key];
        contexts[key] = { ...c, selectedFile: c.selectedFile === oldId ? newId : c.selectedFile, selectedFiles: remap(c.selectedFiles || []) };
    }
    for (const [key, ids] of contextBySession)
        contextBySession.set(key, remap(ids));
    contextFiles = remap(contextFiles);
    agents.forEach(a => a.files = remap(a.files));
    if (lastSelected === oldId)
        lastSelected = newId;
    if (clipboard?.source === oldId) {
        if (newId)
            clipboard.source = newId;
        else if (clipboard.cut)
            clipboard = null;
    }
    act('PATCH', { value: { contexts, selectedFile: s.selectedFile === oldId ? newId : s.selectedFile, selectedFiles: remap(s.selectedFiles) } });
}
function resetDemo() {
    files = structuredClone(initialFiles);
    for (const k of Object.keys(bodies))
        delete bodies[k];
    Object.assign(bodies, structuredClone(initialBodies));
    agents.splice(0, agents.length, ...structuredClone(initialAgents));
    contextBySession.clear();
    contextFiles = [];
    deleted = [];
    scrolls.clear();
    clipboard = null;
    renaming = null;
    lastSelected = null;
    largeSeeded = false;
    selectionMode = false;
    folderOpen = new Set(['components', 'styles', 'bridge', 'tests']);
    scenario = 'normal';
    $('#scenario').value = 'normal';
    graph = { zoom: 1, x: 0, y: 0, collapsed: new Set(), query: '', status: 'all', time: 4, follow: false, split: false };
    simulationStep = 0;
    const width = store.get().width;
    act('PATCH', { value: { ...initialState(), width } });
    $('#composer').value = '';
    $('#fileViewTab').hidden = true;
    $('#graphViewTab').hidden = true;
    renderAll();
    toast('Dati della demo ripristinati.');
}
