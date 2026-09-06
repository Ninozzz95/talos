/*
 * Intro del primo avvio — il velo del mockup (`#veloIntro`, quattro passi: cartella ·
 * modello · permessi · pronto) con i dati VERI: cartelle del computer dal browser del
 * workspace (albero compatto, ricerca, nuova cartella, percorso a mano), fornitori e
 * chiave dal portachiavi, modelli dal catalogo, politica dei permessi, riepilogo.
 *
 * 06/09, B7b (coda di Astra, fatta da Claude); owner 05/09: «nella modale intro ci deve
 * essere anche il file tree in versione compatta». La regia è quella del mockup (passi,
 * validazioni, tastiera sull'albero, sinonimi di conclusione «saltata»/«completata»), i
 * dati arrivano da `api` (fetch del monolite) e le decisioni tornano al monolite via
 * `azioni` (permesso, modello, conclusione). Niente valori dimostrativi: se un elenco
 * non arriva, la frase dice che non è arrivato.
 *
 * Ricerca 06/09/2026: l'onboarding deve portare al primo valore nel minor numero di
 * passi e permettere di saltare (userpilot/formbricks 2026); l'albero segue WAI-ARIA
 * treeview (frecce, Home/End, ricerca per lettera) come già nel mockup.
 */

export const PASSI = 4;
export const normalizzaCartella = (p) => String(p ?? '').replace(/\//g, '\\').replace(/[\\]+$/, '').replace(/^([a-z]):$/i, (m, d) => `${d.toUpperCase()}:\\`);
export const nomeCartellaValido = (nome) => { const n = String(nome ?? '').trim(); return Boolean(n) && n !== '.' && n !== '..' && !/[\\/:*?"<>|]/.test(n); };
export const ultimoSegmento = (p) => { const n = normalizzaCartella(p); const s = n.split('\\').filter(Boolean); const u = s.length ? s[s.length - 1] : n; return /^[a-z]:$/i.test(u) ? `${u}\\` : u; };
export const cartellaSuperiore = (p) => { const n = normalizzaCartella(p); if (/^[a-z]:\\$/i.test(n)) return null; const i = n.lastIndexOf('\\'); if (i <= 0) return null; const su = n.slice(0, i); return /^[a-z]:$/i.test(su) ? `${su}\\` : su; };

export function riepilogo({ cartella, modello, politica }) {
  return `Cartella: ${cartella || 'da scegliere'} · Modello: ${modello || 'da scegliere'} · Permessi: ${politica || 'da scegliere'}`;
}
export function passoConsentito(n, { cartella, modello, politica, confermaPieno }) {
  if (n > 0 && !cartella) return { ok: false, torna: 0, messaggio: 'Scegli prima una cartella.' };
  if (n > 1 && !modello) return { ok: false, torna: 1, messaggio: 'Scegli un modello oppure salta per ora.' };
  if (n === 3 && (!politica || (politica === 'Full access' && !confermaPieno))) return { ok: false, torna: 2, messaggio: 'Scegli cosa può fare da solo.' };
  return { ok: true };
}

function icona(d, nome) { const s = d.createElementNS('http://www.w3.org/2000/svg', 'svg'); const u = d.createElementNS(s.namespaceURI, 'use'); s.setAttribute('class', 'i'); s.setAttribute('aria-hidden', 'true'); u.setAttribute('href', `#i-${nome}`); s.append(u); return s; }

/**
 * Collega il velo. `api` = { cartelle(path?), luoghi(), creaCartella(parent, nome), providers(), salvaChiave(id, chiave), provaProvider(id), modelli() }.
 * `azioni` = { impostaPermesso(valore, nome), impostaModello(id), concludi(esito, scelte) }.
 * `iniziale` = { cartella, modello, politica, localeConfigurato }.
 */
export function creaIntro(velo, { api, azioni = {}, iniziale = {}, document: d = globalThis.document } = {}) {
  const $ = (id) => velo.querySelector(`#${id}`);
  const st = { passo: 0, politica: iniziale.politica || null, cartella: normalizzaCartella(iniziale.cartella || ''), radice: null, fuoco: null, aperte: new Set(), figli: new Map(), caricando: new Set(), testo: '', timer: null, modello: iniziale.modello || '', providers: [], modelli: [] };
  const messaggio = (t) => { const m = $('introMessaggio'); if (m) m.textContent = t || ''; };

  // ---------- passi ----------
  function mostraPasso(n) {
    st.passo = Math.max(0, Math.min(PASSI - 1, n));
    for (const p of velo.querySelectorAll('[data-intro-panel]')) p.hidden = Number(p.dataset.introPanel) !== st.passo;
    velo.dataset.introPassoAttivo = String(st.passo); // il foglio: altezza ricordata solo dove l'albero la usa
    for (const b of velo.querySelectorAll('[data-intro-passo]')) { if (Number(b.dataset.introPasso) === st.passo) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current'); }
    const titolo = $('titoloveloIntro'); if (titolo) titolo.textContent = `Primo avvio · ${st.passo + 1} di ${PASSI}`;
    const indietro = $('introIndietro'); if (indietro) indietro.disabled = st.passo === 0;
    const pieno = $('introPienoAvviso'); if (pieno) pieno.hidden = st.politica !== 'Full access';
    const avanti = $('introAvanti');
    if (avanti) { avanti.disabled = st.passo === 2 && (!st.politica || (st.politica === 'Full access' && !$('introConfermaPieno')?.checked)); avanti.textContent = st.passo === PASSI - 1 ? 'Inizia' : 'Avanti'; }
    const r = $('introRiepilogo');
    if (r) r.textContent = riepilogo({ cartella: st.cartella, modello: $('introModello')?.selectedOptions?.[0]?.textContent || st.modello, politica: velo.querySelector('[data-intro-policy][aria-checked="true"] .talos-list-row__title')?.textContent });
    const priv = $('introPrivacy'); const privR = $('introPrivacyRemoto'); const locale = fornitoreLocale();
    if (priv) priv.hidden = !locale; if (privR) privR.hidden = locale;
  }
  function stato() { return { cartella: st.cartella, modello: $('introModello')?.value || st.modello, politica: st.politica, confermaPieno: Boolean($('introConfermaPieno')?.checked) }; }

  // ---------- cartelle (albero compatto, dal server) ----------
  async function carica(path) {
    if (st.figli.has(path) || st.caricando.has(path)) return;
    st.caricando.add(path); disegnaCartelle();
    try {
      const r = await api.cartelle(path);
      const p = normalizzaCartella(r.path || path);
      st.figli.set(p, (r.items || []).map((i) => ({ nome: i.name, path: normalizzaCartella(i.path) })));
      if (p !== path) st.figli.set(path, st.figli.get(p));
      if (!st.radice) st.radice = p;
    } catch (e) { st.figli.set(path, null); const s = $('introCartelleStato'); if (s) s.textContent = e?.message || 'Questa cartella non è disponibile.'; }
    finally { st.caricando.delete(path); disegnaCartelle(); }
  }
  function nodo(path, q) {
    const figli = st.figli.get(path); const n = d.createElement('div');
    n.setAttribute('role', 'treeitem'); n.dataset.introPath = path; n.setAttribute('aria-label', ultimoSegmento(path)); n.setAttribute('aria-selected', String(path === st.cartella)); n.tabIndex = path === st.fuoco ? 0 : -1;
    const r = d.createElement('div'); r.className = 'talos-file-row'; r.dataset.c = 'FileTreeRow';
    const aperto = q ? true : st.aperte.has(path);
    const puoAvereFigli = figli === undefined || (Array.isArray(figli) && figli.length > 0);
    if (puoAvereFigli) { n.setAttribute('aria-expanded', String(aperto)); const c = icona(d, 'chev'); c.classList.add('talos-file-chevron'); r.append(c); }
    r.append(icona(d, 'folder'));
    const label = d.createElement('span'); label.className = 'talos-file-row__name'; label.textContent = ultimoSegmento(path); label.title = path; r.append(label);
    if (st.caricando.has(path)) { const s = d.createElement('span'); s.className = 'talos-file-row__state'; s.textContent = 'leggo…'; r.append(s); }
    n.append(r);
    if (Array.isArray(figli) && figli.length && aperto) {
      const g = d.createElement('div'); g.setAttribute('role', 'group');
      for (const f of figli) if (!q || f.nome.toLocaleLowerCase('it').includes(q) || f.path.toLocaleLowerCase('it').includes(q)) g.append(nodo(f.path, q));
      n.append(g);
    }
    return n;
  }
  function disegnaCartelle(ripristina = false) {
    const albero = $('introAlbero'); if (!albero || !st.radice) return;
    const q = ($('introCercaCartella')?.value || '').trim().toLocaleLowerCase('it');
    albero.replaceChildren(nodo(st.radice, q));
    const stato = $('introCartelleStato'); if (stato && !st.caricando.size) stato.textContent = q ? (albero.querySelectorAll('[role=group] [role=treeitem]').length ? 'Solo le cartelle già caricate.' : 'Nessuna cartella corrisponde alla ricerca.') : 'Le cartelle si leggono aprendole. Doppio clic o freccia destra per entrare.';
    const scelta = $('introCartellaScelta'); if (scelta) scelta.textContent = st.cartella || 'nessuna';
    const su = $('introCartellaSu'); if (su) su.disabled = !cartellaSuperiore(st.radice);
    const righe = [...albero.querySelectorAll('[role=treeitem]')].filter((n) => !n.closest('[hidden]'));
    const f = righe.find((n) => n.dataset.introPath === st.fuoco) || righe[0];
    righe.forEach((n) => { n.tabIndex = n === f ? 0 : -1; });
    if (ripristina) f?.focus();
  }
  function scegli(path) { st.cartella = normalizzaCartella(path); st.fuoco = st.cartella; const c = $('introCartella'); if (c) c.value = st.cartella; disegnaCartelle(); mostraPasso(st.passo); }
  async function apriPercorso(path) {
    const p = normalizzaCartella(path); if (!p) return;
    st.radice = p; st.aperte.add(p); const cerca = $('introCercaCartella'); if (cerca) cerca.value = '';
    await carica(p);
    if (st.figli.get(p) === null) { st.radice = st.radice; return; }
    scegli(p);
  }
  async function espandi(path) { st.aperte.add(path); st.fuoco = path; await carica(path); disegnaCartelle(true); }
  function luoghi(tipo, gruppi) {
    for (const b of velo.querySelectorAll('[data-intro-luogo]')) { const attivo = b.dataset.introLuogo === tipo; b.setAttribute('aria-pressed', String(attivo)); b.classList.toggle('talos-button--primary', attivo); b.classList.toggle('talos-button--secondary', !attivo); }
    const sc = $('introScorciatoie'); if (!sc) return;
    const voci = gruppi[tipo] || [];
    sc.replaceChildren(...voci.map((v) => { const b = d.createElement('button'); b.type = 'button'; b.className = 'talos-button talos-button--secondary talos-button--sm'; b.dataset.introCartella = v.path; b.title = v.path; b.append(icona(d, 'folder'), d.createTextNode(v.nome)); return b; }));
    if (!voci.length) sc.appendChild(Object.assign(d.createElement('span'), { className: 'talos-muted', textContent: 'Nessuna cartella qui.' }));
  }

  // ---------- fornitori e modelli ----------
  function fornitoreLocale() { const v = $('introFornitore')?.value; return v === 'local' || v === 'ollama' || v === 'lmstudio' || v === 'llama.cpp'; }
  function disegnaFornitori() {
    const sel = $('introFornitore'); if (!sel) return;
    sel.replaceChildren(...st.providers.map((p) => new Option(`${p.label || p.id}${p.requiresKey ? (p.keyConfigured ? ' · chiave salvata' : ' · serve una chiave') : ''}`, p.id)));
    if (iniziale.localeConfigurato) sel.appendChild(new Option('Motore locale (llama.cpp)', 'local'));
    if (!st.providers.length && !iniziale.localeConfigurato) sel.appendChild(new Option('Nessun fornitore: apri Impostazioni → Provider', ''));
    aggiornaFornitore();
  }
  function aggiornaFornitore() {
    const locale = fornitoreLocale(); const id = $('introFornitore')?.value; const p = st.providers.find((x) => x.id === id);
    const acc = $('introAccesso'); if (acc) acc.hidden = locale || !p?.requiresKey || Boolean(p?.keyConfigured);
    const ls = $('introLocaleStato'); if (ls) { ls.hidden = !locale; ls.textContent = 'Nessuna chiave: i modelli sul disco si scelgono qui sotto.'; }
    const chiave = $('introChiave'); if (chiave) chiave.value = '';
    disegnaModelli();
    mostraPasso(st.passo);
  }
  function disegnaModelli() {
    const sel = $('introModello'); if (!sel) return;
    const id = $('introFornitore')?.value;
    const lista = st.modelli.filter((m) => !id || fornitoreLocale() ? m.locale === true : (m.provider === id || (m.id || '').startsWith(`${id}/`)));
    const scelti = lista.length ? lista : st.modelli.filter((m) => !m.locale);
    sel.replaceChildren(new Option('Scegli un modello…', ''), ...scelti.slice(0, 200).map((m) => new Option(m.nome || m.id, m.id)));
    if (st.modello && [...sel.options].some((o) => o.value === st.modello)) sel.value = st.modello;
  }
  async function provaAccesso() {
    const campo = $('introChiave'); const stato = $('introAccessoStato'); const id = $('introFornitore')?.value; if (!campo || !stato || !id) return;
    if (!campo.value.trim()) { stato.textContent = 'Incolla la chiave prima di verificare.'; campo.focus(); return; }
    const chiave = campo.value; campo.value = ''; stato.textContent = 'Salvo nel portachiavi…';
    try {
      await api.salvaChiave(id, chiave); stato.textContent = 'Salvata. Chiedo al fornitore se la accetta…';
      const prova = await api.provaProvider(id);
      stato.textContent = prova?.esito === 'collegato' ? `Accesso pronto${Number.isFinite(prova.modelli) ? ` · ${prova.modelli} modelli` : ''}.` : prova?.esito === 'non-autorizzato' ? 'Chiave rifiutata dal fornitore.' : prova?.esito === 'irraggiungibile' ? 'Fornitore non raggiungibile.' : 'Verificato.';
      const p = st.providers.find((x) => x.id === id); if (p && prova?.esito === 'collegato') { p.keyConfigured = true; disegnaFornitori(); }
    } catch (e) { stato.textContent = e?.message || 'Non sono riuscito a salvare la chiave.'; }
  }

  // ---------- conclusione ----------
  function concludi(esito) {
    const c = $('introChiave'); if (c) c.value = '';
    azioni.concludi?.(esito, stato());
  }

  // ---------- collegamenti (una volta) ----------
  if (!velo.dataset.introCollegato) {
    velo.dataset.introCollegato = 'si';
    $('introAvanti')?.addEventListener('click', () => {
      messaggio('');
      const s = stato();
      if (st.passo === 0 && !s.cartella) { messaggio('Scegli una cartella oppure salta per ora.'); return; }
      if (st.passo === 1 && !s.modello) { messaggio('Scegli un modello oppure salta per ora.'); return; }
      if (st.passo === PASSI - 1) { concludi('completata'); return; }
      mostraPasso(st.passo + 1);
    });
    $('introIndietro')?.addEventListener('click', () => mostraPasso(st.passo - 1));
    $('introSalta')?.addEventListener('click', () => concludi('saltata'));
    velo.querySelector('#veloIntro [data-chiudi], [data-chiudi="veloIntro"]')?.addEventListener('click', () => concludi('saltata'));
    for (const b of velo.querySelectorAll('[data-intro-passo]')) b.addEventListener('click', () => { const n = Number(b.dataset.introPasso); const v = passoConsentito(n, stato()); if (!v.ok) { mostraPasso(v.torna); messaggio(v.messaggio); return; } mostraPasso(n); });
    for (const b of velo.querySelectorAll('[data-intro-policy]')) b.addEventListener('click', () => {
      st.politica = b.dataset.introPolicy;
      for (const x of velo.querySelectorAll('[data-intro-policy]')) x.setAttribute('aria-checked', String(x === b));
      const nome = b.querySelector('.talos-list-row__title')?.textContent || st.politica;
      const ps = $('introPoliticaStato'); if (ps) ps.textContent = `Scelto: ${nome}`;
      azioni.impostaPermesso?.(st.politica, nome);
      mostraPasso(2);
    });
    $('introConfermaPieno')?.addEventListener('change', () => mostraPasso(2));
    $('introFornitore')?.addEventListener('change', aggiornaFornitore);
    velo.querySelector('[data-intro-locale]')?.addEventListener('click', () => { const sel = $('introFornitore'); if (sel && [...sel.options].some((o) => o.value === 'local')) { sel.value = 'local'; aggiornaFornitore(); } else messaggio('Il motore locale non è configurato su questo computer.'); });
    $('introProvaAccesso')?.addEventListener('click', () => { void provaAccesso(); });
    $('introModello')?.addEventListener('change', (e) => { st.modello = e.target.value; azioni.impostaModello?.(st.modello); mostraPasso(st.passo); });
    // cartelle
    $('introCercaCartella')?.addEventListener('input', () => disegnaCartelle());
    $('introApriCartella')?.addEventListener('click', () => { void apriPercorso($('introCartella')?.value); });
    $('introCartella')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); void apriPercorso(e.target.value); } });
    $('introCartella')?.addEventListener('input', (e) => { st.cartella = normalizzaCartella(e.target.value); disegnaCartelle(); mostraPasso(st.passo); });
    $('introCartellaSu')?.addEventListener('click', () => { const su = cartellaSuperiore(st.radice); if (su) void apriPercorso(su); });
    for (const b of velo.querySelectorAll('[data-intro-luogo]')) b.addEventListener('click', () => luoghi(b.dataset.introLuogo, st.gruppi || {}));
    $('introScorciatoie')?.addEventListener('click', (e) => { const b = e.target.closest('[data-intro-cartella]'); if (b) void apriPercorso(b.dataset.introCartella); });
    $('introAlbero')?.addEventListener('click', (e) => { const n = e.target.closest('[role=treeitem]'); if (!n) return; const p = n.dataset.introPath; if (e.target.closest('.talos-file-chevron')) { if (st.aperte.has(p)) { st.aperte.delete(p); st.fuoco = p; disegnaCartelle(true); } else void espandi(p); } else { scegli(p); disegnaCartelle(true); } });
    $('introAlbero')?.addEventListener('dblclick', (e) => { const n = e.target.closest('[role=treeitem]'); if (n) void espandi(n.dataset.introPath); });
    $('introAlbero')?.addEventListener('keydown', (e) => {
      const n = e.target.closest('[role=treeitem]'); if (!n) return;
      const p = n.dataset.introPath; const righe = [...velo.querySelectorAll('#introAlbero [role=treeitem]')].filter((x) => !x.closest('[hidden]')); const i = righe.indexOf(n); let target;
      if (e.key === 'ArrowDown') target = righe[Math.min(i + 1, righe.length - 1)];
      else if (e.key === 'ArrowUp') target = righe[Math.max(i - 1, 0)];
      else if (e.key === 'Home') target = righe[0];
      else if (e.key === 'End') target = righe.at(-1);
      else if (e.key === 'ArrowRight') { e.preventDefault(); if (n.getAttribute('aria-expanded') === 'false') { void espandi(p); return; } target = n.querySelector('[role=group] [role=treeitem]'); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); if (n.getAttribute('aria-expanded') === 'true') { st.aperte.delete(p); st.fuoco = p; disegnaCartelle(true); return; } target = n.parentElement.closest('[role=treeitem]'); }
      else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); scegli(p); disegnaCartelle(true); return; }
      else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) { clearTimeout(st.timer); st.testo += e.key.toLocaleLowerCase('it'); st.timer = setTimeout(() => { st.testo = ''; }, 650); target = [...righe.slice(i + 1), ...righe.slice(0, i)].find((x) => x.getAttribute('aria-label').toLocaleLowerCase('it').startsWith(st.testo)); }
      if (target) { e.preventDefault(); st.fuoco = target.dataset.introPath; righe.forEach((x) => { x.tabIndex = x === target ? 0 : -1; }); target.focus(); }
    });
    $('introAggiornaCartelle')?.addEventListener('click', async () => { const r = st.radice; st.figli.clear(); if (r) await carica(r); const s = $('introCartelleStato'); if (s) s.textContent = 'Elenco riletto · scelta conservata.'; });
    $('introComprimiCartelle')?.addEventListener('click', () => { st.aperte.clear(); st.fuoco = st.radice; disegnaCartelle(); });
    $('introCopiaPercorso')?.addEventListener('click', async () => { const s = $('introCartelleStato'); try { await navigator.clipboard.writeText(st.cartella); if (s) s.textContent = 'Percorso copiato.'; } catch { $('introCartella')?.focus(); $('introCartella')?.select(); if (s) s.textContent = 'Percorso selezionato: premi Ctrl+C per copiarlo.'; } });
    $('introNuovaCartella')?.addEventListener('click', () => { const f = $('introCreaForm'); if (f) f.hidden = false; $('introNomeCartella')?.focus(); });
    $('introAnnullaCartella')?.addEventListener('click', () => { const f = $('introCreaForm'); if (f) f.hidden = true; $('introNuovaCartella')?.focus(); });
    $('introCreaForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const nome = ($('introNomeCartella')?.value || '').trim(); const stato = $('introCreaStato');
      if (!nomeCartellaValido(nome)) { if (stato) stato.textContent = 'Usa un nome di cartella, senza separatori di percorso.'; return; }
      const parent = st.cartella || st.radice;
      try {
        const creata = await api.creaCartella(parent, nome);
        st.figli.delete(parent); st.aperte.add(parent); const f = $('introCreaForm'); if (f) f.hidden = true; const nc = $('introNomeCartella'); if (nc) nc.value = ''; if (stato) stato.textContent = '';
        await carica(parent); scegli(creata.path || `${parent}\\${nome}`);
      } catch (err) { if (stato) stato.textContent = err?.message || 'Non riesco a creare la cartella qui.'; }
    });
  }

  return {
    /** Apre al passo `n`, carica cartelle e fornitori (una volta), ricorda l'ultimo fuoco. */
    async apri(n = 0) {
      mostraPasso(n);
      if (!st.radice) {
        const [luoghiDati, providers, modelli] = await Promise.all([api.luoghi?.().catch(() => null), api.providers?.().catch(() => []), api.modelli?.().catch(() => [])]);
        st.providers = providers || []; st.modelli = modelli || [];
        st.gruppi = luoghiDati?.gruppi || {};
        const partenza = st.cartella || luoghiDati?.radice || null;
        await apriPercorso(partenza || '');
        if (!st.radice && luoghiDati?.radice) { st.radice = luoghiDati.radice; await carica(st.radice); }
        luoghi('recenti', st.gruppi);
        disegnaFornitori();
      }
      disegnaCartelle();
      mostraPasso(n);
    },
    stato,
    mostraPasso,
    /** Le cartelle-progetto conosciute dal server (per aprire la sessione con l'id del progetto). */
    get progetti() { return st.gruppi?.progetti || []; },
  };
}
