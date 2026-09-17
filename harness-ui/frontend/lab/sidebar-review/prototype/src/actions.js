document.addEventListener('click', e => {
    const tab = e.target.closest('[data-tab]');
    if (tab) {
        changeTab(tab.dataset.tab);
        return;
    }
    const cb = e.target.closest('[data-select-file]');
    if (cb) {
        const id = cb.dataset.selectFile;
        const ids = new Set(store.get().selectedFiles);
        cb.checked ? ids.add(id) : ids.delete(id);
        act('PATCH', { value: { selectedFile: id, selectedFiles: [...ids] } });
        renderRail();
        return;
    }
    const b = e.target.closest('[data-action]');
    if (b) {
        const action = b.dataset.action, id = b.dataset.id, v = b.dataset.value;
        const s = store.get();
        if (b.disabled)
            return;
        if (!['file-menu', 'selection-menu', 'file-tools'].includes(action))
            closeMenu();
        switch (action) {
            case 'view':
                act('PATCH', { value: { central: v } });
                renderCenter();
                break;
            case 'density':
                rememberScroll();
                document.body.classList.toggle('compact');
                renderRail();
                break;
            case 'guide':
                showGuide();
                break;
            case 'close-guide':
                hideGuide();
                break;
            case 'reset':
                resetDemo();
                break;
            case 'session':
            case 'new-session':
                rememberScroll();
                contextBySession.set(s.session, [...contextFiles]);
                act('SESSION', { id: action === 'new-session' ? 'new' : id });
                contextFiles = [...(contextBySession.get(store.get().session) || [])];
                act('PATCH', { value: { central: 'chat' } });
                renderAll();
                break;
            case 'toggle-rail': {
                const rail = $('#inspector');
                rail.hidden = !rail.hidden;
                $('#shell').style.gridTemplateColumns = rail.hidden ? 'var(--talos-sidebar-w) minmax(0,1fr) 0' : '';
                break;
            }
            case 'normal':
                scenario = 'normal';
                $('#scenario').value = 'normal';
                renderRail();
                break;
            case 'file-filter':
                resetFileScroll();
                act('PATCH', { value: { fileFilter: v } });
                renderRail();
                break;
            case 'agent-filter':
                act('PATCH', { value: { agentFilter: v } });
                renderRail();
                break;
            case 'clear-search':
                resetFileScroll();
                act('PATCH', { value: { fileQuery: '', fileFilter: 'all' } });
                renderRail();
                break;
            case 'search-help':
                toast('Nome/percorso · /regex/ · ext:css · testo:parola · ~fuzzy. Solo fixture; ricerca semantica e simboli non collegati.');
                break;
            case 'agent-list':
                act('LIST', {});
                renderRail();
                break;
            case 'detail-section':
                act('PATCH', { value: { detailSection: v } });
                renderRail();
                break;
            case 'open-graph':
                openGraph();
                break;
            case 'file-agent':
                openGraph(id);
                break;
            case 'graph-close':
                act('PATCH', { value: { central: 'chat' } });
                renderCenter();
                $('#graphViewTab').hidden = true;
                break;
            case 'reveal-file':
                changeTab('files');
                const f = fileBy(id);
                if (f?.folder)
                    folderOpen.add(f.folder);
                act('PATCH', { value: { fileFilter: 'all', fileQuery: '' } });
                openFile(id);
                break;
            case 'isolate':
                openGraph(id);
                act('PATCH', { value: { graphIsolated: id } });
                renderCenter();
                fitGraph();
                break;
            case 'clear-isolate':
                act('PATCH', { value: { graphIsolated: null } });
                renderCenter();
                fitGraph();
                break;
            case 'collapse-branch':
                graph.collapsed.has(id) ? graph.collapsed.delete(id) : graph.collapsed.add(id);
                drawGraph();
                break;
            case 'fit':
                fitGraph();
                break;
            case 'zoom-in':
                graph.zoom = Math.min(2.5, graph.zoom + .1);
                transformGraph();
                break;
            case 'zoom-out':
                graph.zoom = Math.max(.2, graph.zoom - .1);
                transformGraph();
                break;
            case 'follow':
                graph.follow = !graph.follow;
                if (s.central !== 'graph')
                    openGraph(id || s.selectedAgent);
                else
                    renderCenter();
                fitGraph();
                toast(graph.follow ? 'Seguimento demo attivo: Evento + porta al nodo aggiornato.' : 'Seguimento disattivato.');
                break;
            case 'split':
                graph.split = !graph.split;
                renderCenter();
                fitGraph();
                break;
            case 'graph-clear':
                graph.query = '';
                graph.status = 'all';
                graph.time = 4;
                graph.collapsed.clear();
                act('PATCH', { value: { graphIsolated: null } });
                renderCenter();
                fitGraph();
                break;
            case 'event-next':
                graph.time = (graph.time + 1) % 5;
                simulationStep++;
                if (graph.follow) {
                    const a = agents.find(a => a.born === graph.time && a.session === s.session);
                    if (a)
                        openAgent(a.id);
                }
                renderCenter();
                fitGraph();
                toast('Evento ' + simulationStep + ' della sequenza demo.');
                break;
            case 'retry-agent':
                agents.find(a => a.id === id).status = 'active';
                renderRail();
                if (s.central === 'graph')
                    drawGraph();
                toast('Retry simulato, nessun processo avviato.');
                break;
            case 'file-tools':
                openMenu(b, `<button data-action="toggle-selection">${selectionMode ? 'Nascondi selezione' : 'Selezione multipla'}</button><button data-action="collapse-folders">Comprimi cartelle</button><button data-action="search-help">Sintassi ricerca</button><button data-action="file-filter" data-value="trash">Cestino (${deleted.length})</button>`);
                break;
            case 'toggle-selection':
                selectionMode = !selectionMode;
                renderRail();
                break;
            case 'collapse-folders':
                folderOpen.clear();
                renderRail();
                break;
            case 'file-menu':
                fileMenu(b, id);
                break;
            case 'selection-menu':
                openMenu(b, `<button data-action="ai" data-value="Refactor">Refactor</button><button data-action="ai" data-value="Genera test">Genera test</button><button data-action="ai" data-value="Spiega">Spiega selezione</button><button data-action="ai" data-value="Trova dipendenze">Trova dipendenze · bozza</button><button data-action="ai" data-value="Trova utilizzi">Trova utilizzi · bozza</button><button data-action="ai" data-value="Confronta">Confronta · bozza</button><button data-action="ai" data-value="Assegna a un agente">Assegna a un agente · bozza</button><button data-action="context-selected">Aggiungi al Context</button>`);
                break;
            case 'ai':
                aiAction(v);
                break;
            case 'context-selected':
                contextFiles = Array.from(new Set([...contextFiles, ...s.selectedFiles]));
                changeTab('context');
                toast('Selezione aggiunta al Context locale.');
                break;
            case 'remove-context':
                contextFiles = contextFiles.filter(x => x !== id);
                renderRail();
                break;
            case 'favorite': {
                const f = fileBy(id || s.selectedFile);
                if (f)
                    f.favorite = !f.favorite;
                renderRail();
                if (s.central === 'file')
                    renderCenter();
                break;
            }
            case 'rename':
                renaming = id;
                renderRail();
                break;
            case 'new-file': {
                let n = 1;
                while (files.concat(deleted).some(f => f.id.toLowerCase() === `nuovo-${n}.js`))
                    n++;
                const f = { id: `nuovo-${n}.js`, folder: 'components', git: 'A' };
                files.push(f);
                folderOpen.add(f.folder);
                act('PATCH', { value: { fileFilter: 'all', fileQuery: '', selectedFile: f.id, selectedFiles: [f.id] } });
                renaming = f.id;
                renderRail();
                break;
            }
            case 'duplicate':
            case 'copy-file':
            case 'cut-file': {
                const f = fileBy(id);
                if (!f) {
                    toast('File non disponibile.');
                    break;
                }
                if (action === 'duplicate') {
                    const name = uniqueCopyName(f.id, files.concat(deleted).map(x => x.id));
                    files.push({ ...f, id: name, git: 'A', agent: null });
                    if (Object.hasOwn(bodies, id))
                        bodies[name] = bodies[id];
                    renderRail();
                    toast('Duplicato nei dati demo.');
                }
                else {
                    clipboard = { file: structuredClone(f), body: bodies[id], source: id, cut: action === 'cut-file' };
                    toast(clipboard.cut ? 'File tagliato negli appunti del laboratorio.' : 'File copiato negli appunti del laboratorio.');
                }
                break;
            }
            case 'paste-file': {
                if (!clipboard) {
                    toast('Appunti del laboratorio vuoti.');
                    break;
                }
                const target = fileBy(id);
                if (!target) {
                    toast('Destinazione non disponibile.');
                    break;
                }
                if (clipboard.cut) {
                    const f = fileBy(clipboard.source);
                    if (!f) {
                        clipboard = null;
                        toast('Il file tagliato non è più disponibile.');
                        break;
                    }
                    f.folder = target.folder;
                    clipboard = null;
                }
                else {
                    const name = uniqueCopyName(clipboard.file.id, files.concat(deleted).map(f => f.id));
                    files.push({ ...clipboard.file, id: name, folder: target.folder, git: 'A', agent: null });
                    if (clipboard.body !== undefined)
                        bodies[name] = clipboard.body;
                }
                folderOpen.add(target.folder);
                renderRail();
                if (s.central === 'file')
                    renderCenter();
                toast('Incollato nella fixture.');
                break;
            }
            case 'delete-file': {
                const f = fileBy(id);
                if (f) {
                    deleted.push({ ...f });
                    files = files.filter(x => x.id !== id);
                    remapReferences(id, null);
                    renderRail();
                    if (s.central === 'file')
                        renderCenter();
                    toast('Nel cestino demo. Ripristina dalla vista Cestino.');
                }
                break;
            }
            case 'restore-file': {
                const f = deleted.find(x => x.id === id);
                if (f) {
                    if (files.some(x => x.id.toLowerCase() === id.toLowerCase())) {
                        toast('Esiste già un file con questo nome.');
                        break;
                    }
                    files.push(f);
                    deleted = deleted.filter(x => x.id !== id);
                    renderRail();
                }
                break;
            }
            case 'review-file':
                act('PATCH', { value: { selectedFile: id } });
                renderCenter();
                break;
            case 'apply':
                act('APPLY', {});
                renderCenter();
                toast(s.conflict ? 'Conflitto: integrazione bloccata.' : 'Integrato soltanto nei dati della demo.');
                break;
            case 'revision':
                act('REVISION', {});
                renderCenter();
                toast('Nuova revisione della fixture disponibile.');
                break;
            case 'discard':
                act('DISCARD', {});
                renderCenter();
                toast('Proposta scartata nella demo.');
                break;
            case 'send': {
                const t = $('#composer').value.trim();
                if (t) {
                    toast('Messaggio conservato nella simulazione, non inviato a un modello.');
                    $('#composer').value = '';
                    const area = $('#center .chat');
                    if (area) {
                        const x = document.createElement('div');
                        x.className = 'user-msg';
                        x.textContent = t;
                        area.append(x);
                        x.scrollIntoView({ block: 'end' });
                    }
                }
                break;
            }
        }
        return;
    }
    const folder = e.target.closest('[data-folder]');
    if (folder && !e.target.closest('[data-file]')) {
        const g = folder.dataset.folder;
        folderOpen.has(g) ? folderOpen.delete(g) : folderOpen.add(g);
        renderRail();
        return;
    }
    const ag = e.target.closest('[data-agent]');
    if (ag) {
        openAgent(ag.dataset.agent);
        return;
    }
    const row = e.target.closest('[data-file]');
    if (row && !e.target.closest('input')) {
        const id = row.dataset.file;
        let ids = [id];
        if (e.ctrlKey || e.metaKey) {
            const set = new Set(store.get().selectedFiles);
            set.has(id) ? set.delete(id) : set.add(id);
            ids = [...set];
        }
        else if (e.shiftKey && lastSelected) {
            const list = scenario === 'large' ? virtualFiles.map(f => f.id) : $$('[data-file]', $('#fileTree')).map(n => n.dataset.file), i = list.indexOf(lastSelected), j = list.indexOf(id);
            if (i >= 0 && j >= 0)
                ids = list.slice(Math.min(i, j), Math.max(i, j) + 1);
        }
        lastSelected = id;
        openFile(id, ids);
        return;
    }
    if (!e.target.closest('#menu'))
        closeMenu();
});
