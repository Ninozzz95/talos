/*
 * ⭐ 24/10/2026 — LA PILLOLA DEL RAGIONAMENTO nel compositore (owner: «Sì, pillola anche sul desktop», bozzetto approvato «Sì, così»;
 *   parità con la tavola del Mobile `MOCKUP-PILLOLA-RAGIONAMENTO-2026-10-24.html`). Accanto alla pillola del modello: 🧠 + livello + ▾.
 *   Aperta: i livelli che il modello accetta, una riga intera ciascuno con ✓, la riga che dice che cosa parte davvero (A9) e
 *   «Mostra ragionamento». Il riquadro del modello torna solo «Modello».
 * ⛔ Modello senza ragionamento regolabile ⇒ la pillola NON c'è (owner 24/10, consigliata; come il Mobile, Neon UI, assistant-ui,
 *   Hugging Face chat-ui; Hermes `apps/desktop/src/app/chat/composer/reasoning-pill.tsx:44-46` «Hidden when the catalog says the
 *   model has no reasoning control», clone del 22/10). Per quei modelli «Mostra ragionamento» resta nel riquadro «Modello».
 * ⛔ La regola di quale livello si mostra è UNA, qui (`statoDelLivello`), e la usano anche il cursore di «Nuova sessione»
 *   (`creaEffortPicker`): prima stava dentro il cursore, e una seconda copia per la pillola avrebbe divergito al primo ritocco.
 * Ricerca 24/10/2026: W3C APG «Menu Button» e MDN `menu`/`menuitemradio` (Invio, Spazio e ↓ aprono e mettono il fuoco su una voce;
 *   le voci hanno tabindex -1; `aria-checked` dice la scelta; ↑/↓/Home/Fine si muovono, Esc chiude e torna al pulsante). Da Hermes
 *   (stesso file, :74-80): chiuso il menu dopo una scelta il fuoco torna a SCRIVERE, così l'Invio che ha confermato il livello non
 *   si mangia ciò che si digita dopo.
 */

/** La scala dal più debole al più forte, la stessa del server (`livelloRagionamentoPiuVicino`, openai-compatible-runtime.mjs). */
export const SCALA_RAGIONAMENTO = Object.freeze(['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']);

/**
 * I livelli da offrire: quelli che il modello dichiara (`none` resta, spegnere non è un livello del fornitore) e, con la mappa del
 * filo (A9), solo quelli che arrivano al fornitore COSÌ COME SONO.
 * @param {{tutti: Array<{valore: string}>, livelliAmmessi?: string[]|null, filo?: Record<string, string|null>|null}} p
 */
export function livelliDaMostrare({ tutti, livelliAmmessi = null, filo = null }) {
  const delModello = Array.isArray(livelliAmmessi) && livelliAmmessi.length
    ? tutti.filter((l) => l.valore === 'none' || livelliAmmessi.includes(l.valore))
    : tutti;
  return filo ? delModello.filter((l) => filo[l.valore] === l.valore) : delModello;
}

/**
 * Quale livello si mostra e quale riga lo spiega — la regola che stava dentro `creaEffortPicker`, spostata qui senza cambiarla.
 * `indice` è la posizione mostrata; `toccato` dice se è una scelta della persona (senza, la pillola dice «Automatico»);
 * `senzaTacca` dice che nessun livello va segnato; `nota` è `null` o `{chiave, scelto?, inviato?}` con le chiavi di `app.modelPicker`.
 * `nessuno` = il modello non riceve nessun livello: la pillola non si mostra.
 * @param {{livelli: Array<{valore: string}>, valoreIniziale?: string|null, filo?: Record<string, string|null>|null}} p
 */
export function statoDelLivello({ livelli, valoreIniziale = null, filo = null }) {
  if (!livelli.length) return { indice: -1, toccato: false, senzaTacca: true, nota: { chiave: 'effortNotSent' }, nessuno: true };
  let nota = null;
  let indice = livelli.findIndex((l) => l.valore === valoreIniziale);
  let toccato = indice >= 0;
  if (indice < 0 && valoreIniziale != null) {
    /* BUG-18 gen.2: una preferenza fuori dalla lista del modello mostra il livello PIÙ VICINO con la regola del server — prima il
       più debole, poi a salire; «none» non è mai una meta del ripiego (Hermes reasoning_effort.py: «so a clamp never escalates cost») */
    const pos = SCALA_RAGIONAMENTO.indexOf(valoreIniziale);
    if (pos >= 0) {
      for (let d = 1; d < SCALA_RAGIONAMENTO.length && indice < 0; d++) {
        for (const vicino of [SCALA_RAGIONAMENTO[pos - d], SCALA_RAGIONAMENTO[pos + d]]) {
          if (!vicino || (vicino === 'none' && valoreIniziale !== 'none')) continue;
          indice = livelli.findIndex((l) => l.valore === vicino);
          if (indice >= 0) { toccato = true; break; }
        }
      }
    }
  }
  /* A9: con la mappa del filo il livello mostrato è quello che PARTE; se parte un altro livello, la riga lo dice */
  let senzaTacca = false;
  const inviato = filo && typeof valoreIniziale === 'string' && Object.hasOwn(filo, valoreIniziale) ? filo[valoreIniziale] : undefined;
  if (inviato !== undefined) {
    indice = typeof inviato === 'string' ? livelli.findIndex((l) => l.valore === inviato) : -1;
    toccato = indice >= 0;
    if (inviato === null) { senzaTacca = true; nota = { chiave: 'effortNotTaken', scelto: valoreIniziale }; }
    else if (inviato !== valoreIniziale) nota = { chiave: 'effortSentAs', scelto: valoreIniziale, inviato };
  }
  /* owner 09/10 («Automatico + riga»): senza una scelta, nessuna tacca, e la riga dice che cosa parte */
  if (filo && valoreIniziale == null && typeof filo.auto === 'string') {
    senzaTacca = true;
    nota = { chiave: 'effortAutoSent', inviato: filo.auto };
    const doveParte = livelli.findIndex((l) => l.valore === filo.auto);
    if (doveParte >= 0) indice = doveParte;
  }
  if (indice < 0) indice = Math.max(0, livelli.findIndex((l) => l.valore === 'high'));
  return { indice, toccato, senzaTacca, nota, nessuno: false };
}

/**
 * La pillola e il suo menu. `leggi()` dà lo stato da disegnare, già tradotto:
 *   `{ nascosta, etichetta, titolo, modello, intestazione, voci: [{valore, etichetta, scelta}], nota, mostra, etichettaMostra }`.
 * `alScelto(valore)` cambia il livello; `alMostra(acceso)` l'interruttore; `allaChiusura({dopoScelta})` riceve il fuoco dopo una
 * scelta (al compositore). Tutto il resto — apertura, tastiera, clic fuori — sta qui.
 * @param {Document} doc
 * @param {{pillola: HTMLElement, leggi: () => any, alScelto: (v: string) => void, alMostra: (acceso: boolean) => void, allaChiusura?: (o: {dopoScelta: boolean}) => void}} o
 */
export function creaPillolaRagionamento(doc, { pillola, leggi, alScelto, alMostra, allaChiusura = () => {} }) {
  const finestra = doc.defaultView;
  let menu = null;
  const etichetta = pillola.querySelector('.talos-chip__label');

  function aggiorna() {
    const s = leggi();
    pillola.hidden = Boolean(s.nascosta);
    if (s.nascosta) { chiudi(); return; }
    if (etichetta) etichetta.textContent = s.etichetta;
    pillola.title = s.titolo;
    pillola.setAttribute('aria-label', s.titolo);
    if (menu) disegnaMenu(s, voceAttiva()); // aperto: si ridisegna sul posto, il fuoco resta sulla stessa voce
  }

  function voci() { return menu ? [...menu.querySelectorAll('[role="menuitemradio"], [role="menuitemcheckbox"]')] : []; }
  function voceAttiva() { return voci().indexOf(doc.activeElement); }

  function disegnaMenu(s, fuoco = -1) {
    menu.replaceChildren();
    const testa = doc.createElement('div');
    testa.className = 'talos-pillola-ragionamento__testa';
    const titolo = doc.createElement('span'); titolo.textContent = s.intestazione;
    const modello = doc.createElement('span'); modello.className = 'talos-mono talos-pillola-ragionamento__modello'; modello.textContent = s.modello;
    testa.append(titolo, modello);
    menu.append(testa);
    for (const v of s.voci) {
      const b = doc.createElement('button');
      b.type = 'button'; b.tabIndex = -1;
      b.className = 'talos-menu__voce talos-pillola-ragionamento__voce';
      b.setAttribute('role', 'menuitemradio');
      b.setAttribute('aria-checked', String(Boolean(v.scelta)));
      b.dataset.livello = v.valore;
      const nome = doc.createElement('strong'); nome.textContent = v.etichetta;
      b.append(nome);
      if (v.scelta) {
        const ok = doc.createElementNS('http://www.w3.org/2000/svg', 'svg'); ok.setAttribute('class', 'i i--sm talos-pillola-ragionamento__ok'); ok.setAttribute('aria-hidden', 'true');
        const u = doc.createElementNS('http://www.w3.org/2000/svg', 'use'); u.setAttribute('href', '#i-check'); ok.append(u);
        b.append(ok);
      }
      b.addEventListener('click', () => { alScelto(v.valore); chiudi({ dopoScelta: true }); });
      menu.append(b);
    }
    if (s.nota) {
      const p = doc.createElement('p'); p.className = 'talos-menu__nota talos-pillola-ragionamento__nota'; p.textContent = s.nota;
      menu.append(p);
    }
    const mostra = doc.createElement('button');
    mostra.type = 'button'; mostra.tabIndex = -1;
    mostra.className = 'talos-menu__voce talos-pillola-ragionamento__mostra';
    mostra.setAttribute('role', 'menuitemcheckbox');
    mostra.setAttribute('aria-checked', String(Boolean(s.mostra)));
    mostra.id = 'showReasoningToggle';
    const testo = doc.createElement('span'); testo.textContent = s.etichettaMostra;
    const interruttore = doc.createElement('span'); interruttore.className = 'talos-switch'; interruttore.setAttribute('aria-hidden', 'true');
    interruttore.setAttribute('aria-checked', String(Boolean(s.mostra)));
    const pallino = doc.createElement('span'); pallino.className = 'talos-switch__thumb'; interruttore.append(pallino);
    mostra.append(testo, interruttore);
    /* l'interruttore non chiude il menu: si vede cambiare, come una casella in un menu */
    mostra.addEventListener('click', () => { alMostra(mostra.getAttribute('aria-checked') !== 'true'); });
    menu.append(mostra);
    const tutte = voci();
    if (fuoco >= 0 && tutte[fuoco]) tutte[fuoco].focus();
  }

  function posiziona() {
    if (!menu) return;
    const r = pillola.getBoundingClientRect();
    const alta = finestra?.innerHeight ?? doc.documentElement.clientHeight;
    const larga = finestra?.innerWidth ?? doc.documentElement.clientWidth;
    menu.style.left = `${Math.max(8, Math.min(r.left, larga - menu.offsetWidth - 8))}px`;
    menu.style.bottom = `${Math.max(8, alta - r.top + 8)}px`;
  }

  function apri(daDove = 'scelta') {
    if (menu) return;
    const s = leggi();
    if (s.nascosta) return;
    menu = doc.createElement('div');
    menu.className = 'talos-menu talos-pillola-ragionamento__menu';
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', s.intestazione);
    menu.id = 'menuRagionamento';
    menu.addEventListener('keydown', tastiMenu);
    doc.body.append(menu);
    pillola.setAttribute('aria-expanded', 'true');
    /* ⛔ niente `aria-controls` (facoltativo per un menu button, APG): l'app ha un gestore globale che apre e chiude da solo ogni
       elemento con `aria-expanded` + `aria-controls` (app.js, «disclosure»), e lo stesso clic che apre il menu lo richiudeva —
       trovato con la pila delle chiamate, 24/10/2026 */
    disegnaMenu(s);
    posiziona();
    const tutte = voci();
    const scelta = tutte.findIndex((b) => b.getAttribute('role') === 'menuitemradio' && b.getAttribute('aria-checked') === 'true');
    const dove = daDove === 'ultima' ? tutte.length - 1 : (scelta >= 0 ? scelta : 0);
    tutte[dove]?.focus();
    doc.addEventListener('pointerdown', fuori, true);
    finestra?.addEventListener('resize', posiziona);
  }

  function chiudi({ dopoScelta = false, alPulsante = false } = {}) {
    if (!menu) return;
    menu.remove(); menu = null;
    pillola.setAttribute('aria-expanded', 'false');
    doc.removeEventListener('pointerdown', fuori, true);
    finestra?.removeEventListener('resize', posiziona);
    if (alPulsante) pillola.focus();
    else allaChiusura({ dopoScelta });
  }

  function fuori(e) { if (menu && !menu.contains(e.target) && !pillola.contains(e.target)) chiudi(); }

  function tastiMenu(e) {
    const tutte = voci();
    const i = tutte.indexOf(doc.activeElement);
    const vai = (n) => { e.preventDefault(); tutte[(n + tutte.length) % tutte.length]?.focus(); };
    if (e.key === 'ArrowDown') vai(i + 1);
    else if (e.key === 'ArrowUp') vai(i - 1);
    else if (e.key === 'Home') vai(0);
    else if (e.key === 'End') vai(tutte.length - 1);
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); chiudi({ alPulsante: true }); }
    else if (e.key === 'Tab') chiudi({ alPulsante: true });
    else if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); doc.activeElement?.click?.(); }
  }

  pillola.setAttribute('aria-haspopup', 'menu');
  pillola.setAttribute('aria-expanded', 'false');
  pillola.addEventListener('click', () => (menu ? chiudi({ alPulsante: true }) : apri()));
  pillola.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); apri(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); apri('ultima'); }
  });
  aggiorna();
  return { aggiorna, apri, chiudi, aperto: () => Boolean(menu) };
}
