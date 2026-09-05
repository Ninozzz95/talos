/*
 * Inspector — la colonna dei dettagli della sessione nel linguaggio del mockup:
 * testata (nome della sessione), Contesto (Ambiente · Finestra del contesto ·
 * Indice dei giri), File (file toccati), Agenti (stato vuoto onesto), Processi
 * (i comandi eseguiti nella sessione).
 *
 * 06/09, B2 (coda di Astra, fatta da Claude). ⛔ Fino a oggi la colonna mostrava
 * i valori DIMOSTRATIVI del mockup («W1-02 registro processi», un ramo, tre file,
 * quattro processi che non esistevano): qui ogni riga viene dai dati del monolite,
 * e quando un dato non c'è si scrive «—» o la riga sparisce — mai un numero finto.
 *
 * Dati: `RunStarted.contesto` (progetto, cartella, branch o null, repoAnnidati[]),
 * `state.realSession.usage` (prompt_tokens, completion_tokens, cached_tokens,
 * giri), la finestra del modello (contextLength dal catalogo, se noto), i giri
 * (dalla spine: numero, titolo, attrezzi, in corso), i file toccati
 * (`reviewFiles`: path, aggiunte, rimozioni), i comandi (ToolCallStart di
 * `shell` con il comando, ToolCallResult, tempi misurati alla ricezione).
 *
 * Ricerca 06/09/2026: il costo del contesto si mostra come numero verificabile
 * (Codex /status in JetBrains: token usati contro la finestra; Context Lens:
 * ripartizione per categoria — system, tool definitions, conversation). Qui la
 * ripartizione per categoria si mostra SOLO se il kernel la dichiara; altrimenti
 * restano Conversazione e Libera, che sono misure vere.
 */

const num = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 1 });
/** «41,2k», «200k», «0,4k» come nel mockup. */
export function kilo(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v < 0) return '—';
  return `${num.format(v / 1000)}k`; // «200k», «145,4k», «0,4k»: un decimale quando serve, come nel mockup
}
const numPercento = new Intl.NumberFormat('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
/** Percentuale troncata a un decimale (3,75 → «3,7%»), così la somma delle parti e «Libera» tornano a 100. */
export function percento(parte, tutto) {
  if (!Number.isFinite(parte) || !Number.isFinite(tutto) || tutto <= 0) return null;
  return `${numPercento.format(Math.floor((parte / tutto) * 1000) / 10)}%`;
}

/** Le quattro righe di «Ambiente». `—` dove il dato non c'è. */
export function righeAmbiente(contesto = null) {
  const c = contesto || {};
  const annidati = Array.isArray(c.repoAnnidati) ? c.repoAnnidati.length : null;
  return [
    ['Ramo', c.branch || '—'],
    ['Worktree', c.worktree || '—'],
    ['Non salvate', Number.isFinite(c.nonSalvate) ? `${c.nonSalvate} file` : '—'],
    ['Repo annidati', annidati === null ? '—' : annidati === 0 ? 'nessuno' : `${annidati} · fiducia separata`],
  ];
}

/**
 * Le righe di «Finestra del contesto». `usage` = ultimo StateDelta /usage; `finestra` =
 * contextLength del modello (o null); `ripartizione` = { attrezzi, istruzioni, memoria } in token, se il kernel la dichiara.
 */
export function righeFinestra(usage = null, finestra = null, ripartizione = null) {
  const u = usage || {};
  const usati = Number.isFinite(u.prompt_tokens) ? u.prompt_tokens + (Number.isFinite(u.completion_tokens) ? u.completion_tokens : 0) : null;
  const righe = [];
  const r = ripartizione || {};
  let occupati = 0; let percentoOccupato = 0;
  const aggiungi = (etichetta, token, classe) => {
    occupati += token;
    const p = finestra ? percento(token, finestra) : null;
    if (p) percentoOccupato += Number(p.replace('%', '').replace(',', '.'));
    righe.push([etichetta, `${kilo(token)}${p ? ` · ${p}` : ''}`, classe]);
  };
  for (const [chiave, etichetta] of [['attrezzi', 'Attrezzi'], ['istruzioni', 'Istruzioni'], ['memoria', 'Memoria']]) {
    if (Number.isFinite(r[chiave])) aggiungi(etichetta, r[chiave], 'stima');
  }
  if (usati === null) righe.push(['Conversazione', '—']); else aggiungi('Conversazione', usati, '');
  // «Libera» = la finestra meno TUTTO ciò che la occupa; la sua percentuale chiude a 100 con le altre
  righe.push(['Libera', finestra && usati !== null ? `${kilo(Math.max(0, finestra - occupati))} · ${numPercento.format(Math.max(0, Math.round((100 - percentoOccupato) * 10) / 10))}%` : '—']);
  return { titoloDestra: finestra ? kilo(finestra) : 'finestra non dichiarata', righe };
}

/** Le righe di «Indice dei giri». `giri` = [{ numero, titolo, token?, attrezzi?, inCorso? }]. */
export function righeGiri(giri = []) {
  return giri.map((g) => [`${g.numero} · ${g.titolo || 'Giro'}`, g.inCorso ? 'in corso' : Number.isFinite(g.token) ? kilo(g.token) : (Number.isFinite(g.attrezzi) ? `${g.attrezzi} ${g.attrezzi === 1 ? 'attrezzo' : 'attrezzi'}` : '—'), g.inCorso ? 'accent' : '']);
}

/** Le righe di «File toccati». `file` = [{ path, aggiunte, rimozioni }]. */
export function righeFile(file = []) {
  return file.map((f) => [f.path, `+${f.aggiunte ?? 0}${f.rimozioni ? ` −${f.rimozioni}` : ''}`]);
}

/** Un processo: { comando, stato: 'in-corso'|'ok'|'errore', chi: 'agente'|'tu', giro, durataMs, uscita, fermoDaMs }. */
export function datiProcesso(p = {}) {
  const durata = Number.isFinite(p.durataMs) ? `${num.format(p.durataMs / 1000)} s` : null; // «0,3 s», «18,1 s», «74 s» come nel mockup
  const misura = [durata, p.stato !== 'in-corso' && Number.isFinite(p.uscita) ? `uscita ${p.uscita}` : null].filter(Boolean).join(' · ') || (p.stato === 'in-corso' ? '' : '—');
  const chi = `${p.chi === 'tu' ? 'tu' : 'agente'} · ${p.chi === 'tu' ? 'terminale' : `giro ${p.giro ?? '—'}`}`;
  const fermo = Number.isFinite(p.fermoDaMs) && p.fermoDaMs >= 60_000 ? `Nessuna uscita da ${Math.round(p.fermoDaMs / 1000)} secondi. Il processo è vivo: potrebbe aspettare un input. TALOS non lo ferma da solo.` : null;
  return { comando: p.comando || '—', stato: p.stato || 'ok', chi, misura, fermo };
}

function el(d, tag, classe, testo) { const n = d.createElement(tag); if (classe) n.className = classe; if (testo != null) n.textContent = testo; return n; }
function kv(d, k, v, classeV = '') { const r = el(d, 'div', 'talos-kv'); r.append(el(d, 'span', 'talos-kv__k', k), el(d, 'span', `talos-kv__v${classeV ? ` ${classeV}` : ''}`, v)); return r; }
function riempiCard(d, card, righe, { classiValore = () => '' } = {}) {
  if (!card) return;
  for (const n of [...card.querySelectorAll('.talos-kv')]) n.remove();
  // gli a-capo fra le righe sono quelli del sorgente del mockup: le PAROLE del cancello li vedono come spazi
  for (const r of righe) { card.appendChild(d.createTextNode('\n')); card.appendChild(kv(d, r[0], r[1], classiValore(r))); }
}

/**
 * Riscrive tutta la colonna. `dati` = { titolo, contesto, usage, finestra, ripartizione, giri, file, processi, agenti }.
 * Le card si trovano per ordine nel pannello Contesto: Ambiente · Finestra · Indice dei giri (come nel mockup).
 */
export function aggiornaInspector(inspector, dati = {}, { document: d = globalThis.document } = {}) {
  if (!inspector) return;
  const h2 = inspector.querySelector('.talos-inspector__head h2');
  if (h2) h2.textContent = dati.titolo || 'Nessuna sessione aperta';
  const cards = inspector.querySelectorAll('#railContesto [data-c="InspectorCard"], #railContesto [data-c="TurnIndex"]');
  const [ambiente, finestra, indice] = cards;
  riempiCard(d, ambiente, righeAmbiente(dati.contesto));
  const f = righeFinestra(dati.usage, dati.finestra, dati.ripartizione);
  if (finestra) { const testa = finestra.querySelector('.talos-inspector-card__head span'); if (testa) testa.textContent = f.titoloDestra; }
  riempiCard(d, finestra, f.righe, { classiValore: (r) => (r[2] === 'stima' ? 'talos-measure--estimate' : '') });
  const giri = righeGiri(dati.giri);
  riempiCard(d, indice, giri.length ? giri : [['Nessun giro ancora', '—']], { classiValore: (r) => (r[2] === 'accent' ? 'talos-kv__v--accent' : '') });
  const fileCard = inspector.querySelector('#railFile [data-c="InspectorCard"]');
  const file = righeFile(dati.file);
  riempiCard(d, fileCard, file.length ? file : [['Nessun file scritto finora', '—']], { classiValore: (r) => (r[1].startsWith('+') ? 'talos-diff-num--plus' : '') });
  const agenti = inspector.querySelector('#railAgenti');
  if (agenti && Array.isArray(dati.agenti) && dati.agenti.length) {
    // per ora il kernel non emette sotto-agenti: la forma resta quella del mockup (stato vuoto)
  }
  const processi = inspector.querySelector('#railProcessi');
  if (processi) {
    processi.replaceChildren();
    const lista = Array.isArray(dati.processi) ? dati.processi : [];
    if (!lista.length) {
      const vuoto = el(d, 'div', 'talos-card talos-inspector-card'); vuoto.dataset.c = 'EmptyState';
      const head = el(d, 'div', 'talos-inspector-card__head'); head.appendChild(el(d, 'b', '', 'Processi'));
      vuoto.append(head, el(d, 'p', 'talos-inspector__hint', 'Nessun comando eseguito in questa sessione. Quando l\'agente o tu lanciate un comando, qui compaiono comando, durata e uscita.'));
      processi.appendChild(vuoto);
    }
    for (const p of lista) {
      const dp = datiProcesso(p);
      const card = el(d, 'div', 'talos-card talos-process'); card.dataset.c = 'ProcessRow'; card.dataset.stato = dp.stato;
      card.appendChild(el(d, 'div', 'talos-process__cmd', dp.comando));
      const meta = el(d, 'div', 'talos-process__meta');
      if (dp.stato === 'in-corso') meta.appendChild(el(d, 'span', 'talos-badge talos-badge--accent talos-badge--sm', 'In corso'));
      else meta.appendChild(el(d, 'span', `talos-dot talos-dot--${dp.stato === 'errore' ? 'danger' : 'success'}`));
      meta.append(el(d, 'span', '', dp.chi), el(d, 'span', 'talos-grow'), el(d, 'span', 'talos-mono talos-measure', dp.misura));
      card.appendChild(meta);
      if (dp.fermo) card.appendChild(el(d, 'div', 'talos-process__stall', dp.fermo));
      processi.appendChild(d.createTextNode('\n')); // come nel sorgente del mockup: uno spazio fra una scheda e l'altra
      processi.appendChild(card);
    }
  }
}

/** I processi dagli eventi degli attrezzi del monolite (`eventiAttrezzi`), con i tempi misurati alla ricezione. */
export function comandoDagliArgomenti(testo = '') {
  try { const a = JSON.parse(testo); return String(a.command ?? a.comando ?? a.cmd ?? a.script ?? '').trim(); } catch { return String(testo || '').trim(); }
}
export function processiDagliEventi(eventi = [], { adesso = Date.now(), nomiComando = ['shell', 'bash', 'esegui', 'comando', 'terminal'] } = {}) {
  const avviati = new Map();
  const argomenti = new Map();
  const lista = [];
  for (const e of eventi) {
    if (e.type === 'ToolCallStart' && nomiComando.includes(e.toolCallName)) {
      const p = { id: e.toolCallId, comando: '', stato: 'in-corso', chi: 'agente', giro: e.giro ?? null, avviatoA: e.ricevutoA ?? null, durataMs: null, uscita: null };
      avviati.set(e.toolCallId, p); argomenti.set(e.toolCallId, ''); lista.push(p);
    } else if (e.type === 'ToolCallArgs' && avviati.has(e.toolCallId)) {
      argomenti.set(e.toolCallId, (argomenti.get(e.toolCallId) || '') + String(e.delta ?? ''));
      avviati.get(e.toolCallId).comando = comandoDagliArgomenti(argomenti.get(e.toolCallId));
    } else if (e.type === 'ToolCallResult' && avviati.has(e.toolCallId)) {
      const p = avviati.get(e.toolCallId);
      p.stato = e.errore ? 'errore' : 'ok';
      p.uscita = Number.isFinite(e.uscita) ? e.uscita : (e.errore ? 1 : 0);
      if (Number.isFinite(p.avviatoA) && Number.isFinite(e.ricevutoA)) p.durataMs = e.ricevutoA - p.avviatoA;
    }
  }
  for (const p of lista) if (p.stato === 'in-corso' && Number.isFinite(p.avviatoA)) p.fermoDaMs = adesso - p.avviatoA;
  return lista.reverse();
}
