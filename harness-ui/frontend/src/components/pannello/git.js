/*
 * PANNELLO v2 — la scheda GIT. ⛔ È LA SCHEDA DI OGGI, IDENTICA: il Source Control di VS Code con la nostra UI e la nostra grammatica
 * (owner 29/10 sera: «aveva un'identità precisa»). La disegna SEMPRE `creaSchedaGithub` (components/scheda-github.js:344), e questo
 * modulo NON la sostituisce e NON la modifica: le aggiunge tre cose sopra, dopo ogni suo disegno.
 *
 * Quello che resta tutto com'è (scheda-github.js): il ramo col suo menu e il «⋯» del repository (`disegnaElenco`, :1318-1352); il
 * pulsante della sincronizzazione che cambia (Recupera · Scarica N · Invia · Pubblica il ramo), ↓ ↑ e «Recuperato N minuti fa»
 * (`disegnaSincronizzazione`); «Confronto con l'ultimo commit…» (`testoBase`); il messaggio del commit con ✨ e «Committa N file
 * preparati»; i gruppi Conflitti · Preparati · Modificati · Nuovi con «Prepara tutti» / «Togli tutti», l'azione e il «⋯» di riga e
 * le lettere M/U/A/D (`disegnaGruppo`, `disegnaRiga`, :1039-1110); Messi da parte; Pull request; Commit recenti col grafo; la vista
 * diff con «Prepara il pezzo»; i rami; lo schermo intero.
 *
 * ⭐ LE AGGIUNTE (solo sopra):
 *   (1) i +/− di ogni file, attenuati, a destra del nome (G-05: ⚠️ DATI NUOVI dal server, `git diff --numstat`);
 *   (2) di chi è la modifica: «giro 12» / ««Agente»» attenuato dopo la cartella, la frase intera nel suggerimento della riga
 *       («Scritta dall'agente al giro 12 e da «Aggiorna il README»»; MAPPA F-01, F-02);
 *   (3) «Dettagli del repository» — la card «Ambiente» che stava nel Contesto (ramo, worktree, non salvate, repo annidati),
 *       chiusa, sotto il ramo (decisione owner 29/10).
 *
 * Come si aggancia: `osservaSchedaGit(radice, leggiDati)` guarda `#railGithub` e, dopo ogni ridisegno di `creaSchedaGithub`,
 * chiama `arricchisciSchedaGit` (idempotente: una riga già arricchita con gli stessi dati non si tocca). Zero righe cambiate in
 * scheda-github.js. In alternativa (MAPPA §5) due righe in `disegnaElenco`: `opzioni.dopoIlDisegno?.(elenco)`.
 *
 * ── I DATI ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
 * dati.stato    = l'oggetto di `scheda.mostraStato` (legacy/app.js:21838): serve solo il conto sulla scheda (`voci`).
 * dati.conti    = Map percorso → { aggiunte, rimozioni } — ⚠️ DATI NUOVI (G-05). Senza, niente numeri.
 * dati.scritti, dati.agenti, dati.richiesta = come la scheda File: chi ha scritto cosa (reviewFiles + attivita.file degli agenti).
 * dati.ambiente = `{ branch, worktree, nonSalvate, repoAnnidati }` — lo stesso oggetto che oggi riempie la card «Ambiente» del
 *                 Contesto (`righeAmbiente(dati.contesto)`, inspector.js:59; `aggiornaInspector`, :2071).
 */
import { t, tn } from '../lingua.js';
import { raggruppaVoci, nomeDellAgente } from './fonti.js';
import { el, icona, finestraPaginata, barraPagine, adattaAlloSpazio, ricordaPieghe } from './comune.js';
import { leggiPieghe } from './pagine.js';

const GRUPPI_FILE = new Set(['conflitti', 'preparati', 'modificati', 'nuovi']);

/** Il conto sulla scheda (aggiunta): i file da salvare; il pallino se ci sono conflitti. */
export function contoGit(dati = {}) {
  const g = raggruppaVoci(dati.stato?.voci);
  const n = new Set([...g.conflitti, ...g.preparati, ...g.modificati, ...g.nuovi].map((v) => v.percorso)).size;
  return { numero: n || null, attenzione: g.conflitti.length, descrizione: n ? tn('pannello.git.daSalvareOne', 'pannello.git.daSalvareMany', n) : '' };
}

/** Il modello delle AGGIUNTE, puro: per ogni percorso i +/− e di chi è la modifica. */
export function modelloAggiunteGit(dati = {}) {
  const per = new Map();
  const voce = (p) => { if (!per.has(p)) per.set(p, { giro: null, agenti: [], aggiunte: null, rimozioni: null }); return per.get(p); };
  for (const f of Array.isArray(dati.scritti) ? dati.scritti : []) if (typeof f?.path === 'string') voce(f.path).giro = Number.isFinite(f.giro) ? f.giro : 0;
  for (const a of Array.isArray(dati.agenti) ? dati.agenti : []) {
    const nome = nomeDellAgente(a, 40);
    for (const f of a?.attivita?.file ?? []) if ((f?.scritto || f?.creato) && typeof f.percorso === 'string' && nome && !voce(f.percorso).agenti.includes(nome)) voce(f.percorso).agenti.push(nome);
  }
  if (dati.conti instanceof Map) for (const [p, c] of dati.conti) { const v = voce(p); v.aggiunte = Number.isFinite(c?.aggiunte) ? c.aggiunte : null; v.rimozioni = Number.isFinite(c?.rimozioni) ? c.rimozioni : null; }
  return per;
}

/** La frase intera di «di chi è» (suggerimento) e la forma breve (in riga). `null` se TALOS non l'ha scritta. */
export function diChi(v) {
  if (!v || (v.giro === null && !v.agenti.length)) return null;
  const pezzi = [];
  if (v.giro !== null) pezzi.push(v.giro ? t('pannello.git.dallAgenteAlGiro', { n: v.giro }) : t('pannello.git.daQuestaConversazione'));
  if (v.agenti.length) pezzi.push(t('pannello.git.daAgenti', { nomi: v.agenti.map((n) => `«${n}»`).join(', ') }));
  const breve = v.giro ? t('pannello.git.giroBreve', { n: v.giro }) : v.agenti.length ? `«${v.agenti[0]}»${v.agenti.length > 1 ? ` +${v.agenti.length - 1}` : ''}` : t('pannello.git.daQuestaConversazione');
  return { frase: t('pannello.git.scrittaDa', { chi: pezzi.join(' · ') }), breve };
}

/** Arricchisce il disegno di `creaSchedaGithub` già a schermo. Idempotente. */
export function arricchisciSchedaGit(radice, dati = {}) {
  if (!radice) return;
  const d = radice.ownerDocument;
  const per = modelloAggiunteGit(dati);
  for (const r of radice.querySelectorAll('.talos-github-riga[data-percorso]')) {
    if (!GRUPPI_FILE.has(r.dataset.gruppo)) continue;
    const v = per.get(r.dataset.percorso);
    const chi = diChi(v);
    const firma = JSON.stringify([v?.aggiunte, v?.rimozioni, chi?.breve ?? null]);
    if (r.dataset.pnFirma === firma) continue;
    r.dataset.pnFirma = firma;
    const apri = r.querySelector('.talos-github-riga__apri');
    if (!apri) continue;
    apri.querySelectorAll('.pn-git-chi, .pn-git-diff').forEach((n) => n.remove());
    if (apri.dataset.pnTitolo === undefined) apri.dataset.pnTitolo = apri.title;
    if (chi) {
      apri.append(el(d, 'span', 'pn-git-chi', chi.breve));
      apri.title = `${apri.dataset.pnTitolo} · ${chi.frase}`;
    } else apri.title = apri.dataset.pnTitolo;
    /* niente «+0»: un file binario o senza righe cambiate non porta numeri (come la colonna di VS Code) */
    if (v && (v.aggiunte > 0 || v.rimozioni > 0)) {
      const n = el(d, 'span', 'pn-git-diff');
      n.append(el(d, 'span', 'pn-git-diff__piu', `+${v.aggiunte ?? 0}`));
      if (v.rimozioni) n.append(el(d, 'span', 'pn-git-diff__meno', `−${v.rimozioni}`));
      apri.append(n);
    }
  }
  dettagliRepository(d, radice, dati.ambiente);
}

/* (3) «Dettagli del repository»: un gruppo come gli altri della scheda (stesse classi), chiuso, dopo il ramo e la sincronizzazione */
function dettagliRepository(d, radice, amb) {
  const elenco = radice.querySelector('.talos-github');
  const testa = elenco?.querySelector(':scope > .talos-github__testa');
  if (!elenco || !testa || !amb) { radice.querySelector('.pn-git-dettagli')?.remove(); return; }
  const aperto = radice.__pnDettagliAperto === true;
  const firma = JSON.stringify([amb, aperto]);
  let sezione = elenco.querySelector(':scope > .pn-git-dettagli');
  if (sezione?.dataset.pnFirma === firma) return;
  sezione?.remove();
  sezione = el(d, 'section', 'talos-github-gruppo pn-git-dettagli');
  sezione.dataset.gruppo = 'dettagli';
  sezione.dataset.pnFirma = firma;
  const capo = el(d, 'div', 'talos-github-gruppo__testa');
  const interruttore = el(d, 'button', 'talos-github-gruppo__titolo');
  interruttore.type = 'button';
  interruttore.dataset.fuoco = 'gruppo:dettagli';
  interruttore.setAttribute('aria-expanded', String(aperto));
  interruttore.append(icona(d, 'i-chevron'), el(d, 'span', '', t('pannello.git.dettagliRepository')));
  interruttore.addEventListener('click', () => {
    radice.__pnDettagliAperto = !aperto;
    const ui = radice.__pnPagine;
    if (ui) { if (!aperto) ui.piegheAperte.add('dettagli'); else ui.piegheAperte.delete('dettagli'); ricordaPieghe(ui); }
    dettagliRepository(d, radice, amb);
    ui?.ridisegna(); // le pagine si rifanno: lo spazio è cambiato
    radice.querySelector('[data-fuoco="gruppo:dettagli"]')?.focus();
  });
  capo.append(interruttore);
  sezione.append(capo);
  if (aperto) {
    const corpo = el(d, 'div', 'pn-git-dettagli__corpo');
    const annidati = Array.isArray(amb.repoAnnidati) ? amb.repoAnnidati.length : null;
    /* le quattro righe e le parole di `righeAmbiente` (inspector.js:59-68) */
    for (const [k, v] of [
      [t('processi.inspector.envBranch'), amb.branch || '—'],
      [t('processi.inspector.envWorktree'), amb.worktree || '—'],
      [t('processi.inspector.envUnsaved'), Number.isFinite(amb.nonSalvate) ? tn('processi.inspector.envFilesOne', 'processi.inspector.envFilesMany', amb.nonSalvate) : '—'],
      [t('processi.inspector.envNestedRepos'), annidati === null ? '—' : annidati === 0 ? t('processi.inspector.envNone') : t('processi.inspector.envSeparateTrust', { n: annidati })],
    ]) { const r = el(d, 'div', 'talos-kv'); r.append(el(d, 'span', 'talos-kv__k', k), el(d, 'span', 'talos-kv__v', v)); corpo.append(r); }
    sezione.append(corpo);
  }
  const dopo = elenco.querySelector(':scope > .talos-github__base');
  if (dopo) elenco.insertBefore(sezione, dopo); else testa.after(sezione);
}

/* ═══ ⭐ 29/10 sera — PAGINE E PIEGHE RICORDATE sopra la scheda di oggi, senza toccarla ═══
   I gruppi di `creaSchedaGithub` (Conflitti · Preparati · Modificati · Nuovi · Messi da parte · Pull request · Commit recenti) si
   piegano già col loro titolo (`interruttoreGruppo`, scheda-github.js:1076) ma non si ricordano (`stato.chiusi` vive in memoria).
   Qui, SOPRA:
     · si ricorda la scelta della persona per gruppo (stessa chiave delle altre schede) e alla riapertura si rimette com'era,
       cliccando il titolo di oggi: nessuna strada nuova dentro il componente;
     · ogni elenco `ul.talos-github-gruppo__righe` va a pagine: le righe fuori pagina restano nel DOM, nascoste
       (`pn-fuori-pagina`), e sotto l'elenco c'è la barra «Precedente · 1–8 di 30 · Successiva» della scheda Agenti;
     · la dimensione delle pagine la dà lo spazio della colonna (`adattaAlloSpazio`, lo stesso conto delle altre schede). */

/** Lo stato delle pagine di Git, sul contenitore (come `statoUi` delle altre schede). */
function statoPagineGit(radice) {
  if (!radice.__pnPagine) {
    const ricordate = leggiPieghe(storageDi(radice), 'git');
    radice.__pnPagine = {
      scheda: 'git', contenitore: radice, chiuse: ricordate.chiuse, piegheAperte: ricordate.aperte,
      pagine: new Map(), dimensioni: new Map(), liste: new Map(), firme: new Map(), seguiFuoco: false, fuoco: null, margineExtra: 0,
      rimesse: new Set(), ridisegna: () => {}, compatte: null, chiusiDaSoli: new Set(), preferita: null,
    };
    radice.__pnDettagliAperto = ricordate.aperte.has('dettagli');
  }
  return radice.__pnPagine;
}
function storageDi(n) { try { return n.ownerDocument?.defaultView?.localStorage ?? null; } catch { return null; } }

/** Rimette i gruppi come la persona li aveva lasciati, una volta per gruppo e per montaggio (poi decide il clic). */
function rimettiPieghe(radice, ui) {
  for (let giro = 0; giro < 8; giro += 1) {
    let cliccato = false;
    for (const b of radice.querySelectorAll('.talos-github-gruppo__titolo[data-fuoco^="gruppo:"]')) {
      const k = b.dataset.fuoco.slice('gruppo:'.length);
      if (k === 'dettagli' || ui.rimesse.has(k)) continue;
      ui.rimesse.add(k);
      const voluto = ui.chiuse.has(k) ? false : ui.piegheAperte.has(k) ? true : null;
      if (voluto !== null && (b.getAttribute('aria-expanded') === 'true') !== voluto) { b.click(); cliccato = true; break; } // il componente ridisegna: si ricomincia
    }
    if (!cliccato) return;
  }
}

/** Le pagine dei gruppi: si nascondono le righe fuori pagina e si mette la barra sotto l'elenco. Misura e ripete (al più 6). */
export function paginaSchedaGit(radice, ui = statoPagineGit(radice)) {
  pagineDeiGruppi(radice, ui);
  /* ⭐ la fisarmonica di Git: se nemmeno una riga per gruppo ci sta, si CHIUDONO DA SOLI i gruppi dal fondo, col loro titolo di oggi
     (un clic del programma, che non si ricorda): restano la testa e il conto. Quello che la persona ha aperto per ultimo non si
     chiude da solo, e nemmeno «Conflitti». Al cambio d'altezza si riaprono e si rifà il conto (`osservaSchedaGit`). */
  for (let i = 0; i < 10 && radice.scrollHeight > radice.clientHeight + 1; i += 1) {
    const aperti = [...radice.querySelectorAll('.talos-github-gruppo__titolo[data-fuoco^="gruppo:"][aria-expanded="true"]')]
      .filter((b) => { const k = b.dataset.fuoco.slice('gruppo:'.length); return k !== 'dettagli' && k !== 'conflitti' && k !== ui.preferita; });
    const ultimo = aperti.at(-1);
    if (!ultimo) break;
    ui.chiusiDaSoli.add(ultimo.dataset.fuoco.slice('gruppo:'.length));
    ultimo.click();
    pagineDeiGruppi(radice, ui);
  }
}

function pagineDeiGruppi(radice, ui) {
  const d = radice.ownerDocument;
  for (let giro = 0; giro < 6; giro += 1) {
    ui.liste = new Map();
    for (const n of radice.querySelectorAll('[data-pager]')) n.remove();
    for (const sez of radice.querySelectorAll('section.talos-github-gruppo[data-gruppo]')) {
      const lista = sez.querySelector(':scope > ul.talos-github-gruppo__righe');
      if (!lista) continue;
      const chiave = `git-${sez.dataset.gruppo}`;
      const voci = [...lista.children];
      const w = finestraPaginata(ui, chiave, voci.map((v, i) => v.dataset.percorso ?? v.dataset.commit ?? `${chiave}:${i}`));
      voci.forEach((v, i) => { v.dataset.pagina = chiave; v.classList.toggle('pn-fuori-pagina', i < w.inizio || i >= w.fine); });
      if (w.ultima > 0) lista.after(barraPagine(d, ui, chiave, sez.querySelector('.talos-github-gruppo__titolo > span')?.textContent ?? chiave, w));
    }
    if (!adattaAlloSpazio(radice, ui)) return;
  }
}

/**
 * Aggancia le aggiunte a `#railGithub`: dopo ogni ridisegno di `creaSchedaGithub` (un MutationObserver, coalescato su un microtask).
 * Le mutazioni fatte qui non riattivano il giro (si stacca mentre scrive). Torna la funzione che smette.
 * ⭐ 29/10 sera: nello stesso giro, le pieghe ricordate e le pagine; un clic sul titolo di un gruppo si ricorda; al cambio
 *   d'altezza della colonna le pagine si rifanno (ResizeObserver).
 */
export function osservaSchedaGit(radice, leggiDati) {
  if (!radice || typeof MutationObserver !== 'function') return () => {};
  const ui = statoPagineGit(radice);
  let programmato = false;
  const giro = () => {
    os.disconnect();
    try {
      rimettiPieghe(radice, ui);
      arricchisciSchedaGit(radice, leggiDati());
      paginaSchedaGit(radice, ui);
      /* ⛔ 29/10 (PNGIT-FOTO a 900×600): la fisarmonica CHIUDE gruppi col loro titolo e il componente ridisegna l'elenco — le aggiunte
         appena messe (i +/−, «Dettagli del repository») sparivano, con l'osservatore staccato mentre scrive. Si rimettono (idempotente:
         una riga già arricchita non si tocca) e si rifanno le pagine, che i «Dettagli» rimessi hanno spostato. */
      arricchisciSchedaGit(radice, leggiDati());
      pagineDeiGruppi(radice, ui);
    } finally { os.observe(radice, { childList: true, subtree: true }); }
  };
  const os = new MutationObserver(() => {
    if (programmato) return;
    programmato = true;
    queueMicrotask(() => { programmato = false; giro(); });
  });
  ui.ridisegna = giro;
  /* il clic della persona sul titolo di un gruppo: si legge DOPO il ridisegno del componente, e si ricorda */
  radice.addEventListener('click', (e) => {
    const b = e.target.closest?.('.talos-github-gruppo__titolo[data-fuoco^="gruppo:"]');
    if (!b || !e.isTrusted) return;
    const k = b.dataset.fuoco.slice('gruppo:'.length);
    if (k === 'dettagli') return;
    if (b.getAttribute('aria-expanded') !== 'true') { ui.preferita = k; ui.chiusiDaSoli.delete(k); } // la apri tu: si chiudono le altre
    setTimeout(() => {
      const aperto = radice.querySelector(`.talos-github-gruppo__titolo[data-fuoco="gruppo:${CSS.escape(k)}"]`)?.getAttribute('aria-expanded') === 'true';
      if (aperto) { ui.chiuse.delete(k); ui.piegheAperte.add(k); } else { ui.chiuse.add(k); ui.piegheAperte.delete(k); }
      ricordaPieghe(ui);
    }, 0);
  }, true);
  const RO = radice.ownerDocument.defaultView?.ResizeObserver;
  if (RO) {
    let ultima = radice.clientHeight;
    new RO(() => {
      if (Math.abs(radice.clientHeight - ultima) < 1) return;
      ultima = radice.clientHeight;
      ui.margineExtra = 0;
      /* più spazio (o meno): si riaprono i gruppi chiusi da soli, e la fisarmonica rifà il conto */
      os.disconnect();
      try {
        for (const k of ui.chiusiDaSoli) { const b = radice.querySelector(`.talos-github-gruppo__titolo[data-fuoco="gruppo:${CSS.escape(k)}"]`); if (b?.getAttribute('aria-expanded') === 'false') b.click(); }
        ui.chiusiDaSoli.clear();
      } finally { os.observe(radice, { childList: true, subtree: true }); }
      giro();
    }).observe(radice);
  }
  giro();
  return () => os.disconnect();
}
