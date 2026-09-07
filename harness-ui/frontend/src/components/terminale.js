/*
 * Le schede del Terminale (B1, K-G — 06/09): la barra `.talos-terminal__tabs` e il piede
 * `.talos-terminal__foot` del mockup, «a partire dai dati». Il corpo (dove vive xterm.js) NON è
 * di questo componente: chi lo monta decide cosa ci va.
 *
 *   <div class="talos-terminal__tabs" role="tablist">
 *     <button class="talos-terminal__tab" role="tab" aria-selected="true"><span class="talos-dot talos-dot--live"></span>agente · giro 7</button>
 *     <button class="talos-terminal__tab" role="tab" aria-selected="false"><span class="talos-dot talos-dot--success"></span>tu · PowerShell</button>
 *     <button class="talos-terminal__tab" role="tab" aria-selected="false"><svg class="i i--sm"><use href="#i-plus"/></svg>Nuovo</button>
 *     <span class="talos-grow"></span>
 *     <span class="talos-badge talos-badge--success talos-badge--sm">Isolato · sandbox locale</span>
 *     <span class="talos-badge talos-badge--sm">harness-ui/</span>
 *   </div>
 *   <div class="talos-terminal__foot"><span>Lanciato dall'agente al giro 7</span><span>·</span><span class="talos-mono">41 s</span><span>·</span><span>in corso</span><span class="talos-grow"></span><span>Ogni comando dichiara chi l'ha lanciato e dove.</span></div>
 *
 * Ricerca fatta prima di scrivere (letta il 06/09/2026): clic seleziona, clic centrale o
 * Ctrl/⌘+clic chiude, menu contestuale
 * «Chiudi · Chiudi le altre · Chiudi tutte», rinomina (il nome della shell resta finché la persona
 * non ne sceglie uno), alla chiusura il fuoco passa alla vicina che prende il posto
 * (`next[index] ?? next[index-1]`), Ctrl+` mostra il terminale e Ctrl+Shift+` ne apre uno nuovo.
 * In più rispetto a quello stato dell'arte: tastiera dentro la lista (WAI-ARIA tabs: frecce, Home/End, Canc chiude,
 * F2 rinomina), e ogni scheda dichiara dove sta e chi l'ha aperta (piede).
 */

import { t } from './lingua.js';

export const ZONA_CHIUSURA_PX = 26; // la larghezza della «×» disegnata dal CSS in coda alla scheda
export const SCHEDE_MASSIME = 8; // stesso tetto di `SCHEDE_MASSIME_PER_SESSIONE` del server (conhost superstiti su Windows)

export const TESTI = Object.freeze({
  nuovo: 'Nuovo',
  nuovaScheda: 'Apri una nuova scheda',
  nuovaSchedaSenzaSessione: 'Apri una sessione per avere più schede',
  troppeSchede: 'Hai già {n} schede aperte: chiudine una', // {n} = SCHEDE_MASSIME, sostituito da t()
  chiudi: 'Chiudi',
  chiudiAltre: 'Chiudi le altre',
  chiudiTutte: 'Chiudi tutte',
  rinomina: 'Rinomina',
  nessunaScheda: 'Nessuna scheda aperta',
  nota: "Ogni scheda dichiara chi l'ha aperta e dove.",
  apertaDaTe: 'Aperta da te',
});

/** Lo stato di una scheda → il pallino del mockup. */
export const PALLINO = Object.freeze({
  live: 'talos-dot--live',
  connesso: 'talos-dot--success',
  connessione: 'talos-dot--warning',
  attesa: '',
  disconnesso: 'talos-dot--danger',
  terminato: 'talos-dot--danger',
});

export const ETICHETTA_STATO = Object.freeze({
  live: 'in corso',
  connesso: 'connessa',
  connessione: 'connessione in corso',
  attesa: 'in attesa',
  disconnesso: 'disconnessa',
  terminato: 'shell chiusa',
});

/** Il nome umano della shell che il server dichiara (`enforcement` di `sceltaShell`). */
export function nomeShell(enforcement, comando = '') {
  if (enforcement === 'git-bash') return 'Git Bash';
  if (enforcement === 'cmd-fallback') return 'cmd.exe';
  if (enforcement === 'posix-shell') { const base = String(comando).split(/[\\/]/).pop(); return base || 'shell'; }
  return 'shell';
}

/**
 * Il titolo di una scheda: quello scelto dalla persona, altrimenti «tu · <shell>», numerato quando
 * più schede senza nome condividono la stessa shell (lo stesso approccio adotta il nome della
 * shell finché non si rinomina).
 */
export function titoloScheda(voce, tutte = [voce]) {
  if (voce.titolo) return voce.titolo;
  if (voce.origine === 'agente') return voce.giro ? `agente · giro ${voce.giro}` : 'agente';
  const shell = nomeShell(voce.shell, voce.comando);
  const omonime = tutte.filter((v) => !v.titolo && v.origine !== 'agente' && nomeShell(v.shell, v.comando) === shell);
  const posizione = omonime.indexOf(voce);
  return `${t('tu')} · ${shell}${omonime.length > 1 && posizione > 0 ? ` ${posizione + 1}` : ''}`;
}

/** Chi prende il fuoco quando si chiude la scheda in posizione `indice` (stessa regola nota). */
export function prossimaAttivaDopoChiusura(lista, indice) {
  const resto = lista.filter((_, i) => i !== indice);
  return (resto[indice] ?? resto[indice - 1]) ?? null;
}

/** La scheda dopo/prima di quella attiva, ciclica. */
export function cicla(lista, attiva, direzione) {
  if (lista.length < 2) return attiva ?? lista[0] ?? null;
  const corrente = Math.max(0, lista.indexOf(attiva));
  return lista[(corrente + direzione + lista.length) % lista.length];
}

export function nomeSchedaValido(nome) {
  const pulito = String(nome ?? '').trim();
  return pulito.length > 0 && pulito.length <= 40;
}

function svgIcona(nome, classi = 'i i--sm') {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', classi);
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `#${nome}`);
  svg.append(use);
  return svg;
}

function creaMenuContestuale(root) {
  let menu = root.querySelector('#menuSchedaTerminale');
  if (menu) return menu;
  menu = document.createElement('div');
  menu.id = 'menuSchedaTerminale';
  menu.className = 'talos-card talos-context-menu';
  menu.setAttribute('role', 'menu');
  menu.setAttribute('aria-label', t('Azioni sulla scheda'));
  menu.hidden = true;
  root.append(menu);
  return menu;
}

/**
 * @param {HTMLElement} pane `.talos-terminal`
 * @param {object} opzioni
 * @param {{seleziona:Function, nuova:Function, chiudi:Function, chiudiAltre?:Function, chiudiTutte?:Function, rinomina:Function}} opzioni.azioni
 */
export function creaSchedeTerminale(pane, { azioni = {}, root = document.body } = {}) {
  const tabs = pane.querySelector('.talos-terminal__tabs');
  const foot = pane.querySelector('.talos-terminal__foot');
  let stato = { schede: [], attiva: null, puoAprire: true, motivoNoNuova: '', badges: [], piede: null };
  let inRinomina = null;
  const menu = creaMenuContestuale(root);

  const chiudiMenu = () => { menu.hidden = true; menu.replaceChildren(); };
  root.addEventListener('pointerdown', (e) => { if (!menu.hidden && !menu.contains(e.target)) chiudiMenu(); });
  root.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !menu.hidden) { chiudiMenu(); e.stopPropagation(); } });

  function apriMenu(voce, x, y) {
    menu.replaceChildren();
    const titolo = document.createElement('div');
    titolo.className = 'talos-context-menu__title';
    titolo.textContent = titoloScheda(voce, stato.schede);
    menu.append(titolo);
    const voci = [
      [t(TESTI.rinomina), () => avviaRinomina(voce), true],
      [t(TESTI.chiudi), () => azioni.chiudi?.(voce.terminalId), true],
      [t(TESTI.chiudiAltre), () => azioni.chiudiAltre?.(voce.terminalId), stato.schede.length > 1],
      [t(TESTI.chiudiTutte), () => azioni.chiudiTutte?.(), stato.schede.length > 0],
    ];
    for (const [testo, fai, abilitato] of voci) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'talos-button talos-button--ghost'; b.setAttribute('role', 'menuitem');
      b.textContent = testo; b.disabled = !abilitato;
      b.addEventListener('click', () => { chiudiMenu(); fai(); });
      menu.append(b);
    }
    menu.hidden = false;
    const larghezza = menu.offsetWidth || 240; const altezza = menu.offsetHeight || 160;
    menu.style.left = `${Math.max(8, Math.min(x, window.innerWidth - larghezza - 8))}px`;
    menu.style.top = `${Math.max(8, Math.min(y, window.innerHeight - altezza - 8))}px`;
    menu.querySelector('[role=menuitem]:not([disabled])')?.focus();
  }

  function avviaRinomina(voce) {
    inRinomina = voce.terminalId;
    renderizza();
    const input = tabs.querySelector('.talos-terminal__rinomina');
    if (input) { input.focus(); input.select(); }
  }

  function chiudiRinomina(salva) {
    const input = tabs.querySelector('.talos-terminal__rinomina');
    const id = inRinomina; inRinomina = null;
    if (salva && input && id && nomeSchedaValido(input.value)) azioni.rinomina?.(id, input.value.trim());
    renderizza();
    if (id) tabs.querySelector(`[role=tab][data-terminale-id="${CSS.escape(id)}"]`)?.focus();
  }

  function creaTab(voce, indice) {
    const b = document.createElement('button');
    b.className = 'talos-terminal__tab';
    b.setAttribute('role', 'tab');
    b.type = 'button';
    const attiva = voce.terminalId === stato.attiva;
    b.setAttribute('aria-selected', String(attiva));
    b.tabIndex = attiva ? 0 : -1;
    b.dataset.terminaleId = voce.terminalId;
    const titolo = titoloScheda(voce, stato.schede);
    b.title = [`${indice + 1}. ${titolo}`, voce.cartella].filter(Boolean).join(' — ');
    const dot = document.createElement('span');
    dot.className = `talos-dot ${PALLINO[voce.stato] ?? ''}`.trim();
    b.append(dot);
    if (inRinomina === voce.terminalId) {
      const input = document.createElement('input');
      input.className = 'talos-input talos-terminal__rinomina';
      input.value = voce.titolo || titolo;
      input.maxLength = 40;
      input.setAttribute('aria-label', t(TESTI.rinomina));
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); chiudiRinomina(true); }
        if (e.key === 'Escape') { e.preventDefault(); chiudiRinomina(false); }
        e.stopPropagation();
      });
      input.addEventListener('blur', () => { if (inRinomina === voce.terminalId) chiudiRinomina(true); });
      input.addEventListener('click', (e) => e.stopPropagation());
      b.append(input);
      return b;
    }
    b.append(document.createTextNode(titolo));
    // la «×» è un ::after in CSS (la struttura resta quella del mockup): un clic nella zona destra della scheda chiude
    b.addEventListener('click', (e) => {
      const sullaX = e.clientX > 0 && e.clientX >= b.getBoundingClientRect().right - ZONA_CHIUSURA_PX;
      if (e.ctrlKey || e.metaKey || sullaX) azioni.chiudi?.(voce.terminalId); else azioni.seleziona?.(voce.terminalId);
    });
    b.addEventListener('auxclick', (e) => { if (e.button === 1) { e.preventDefault(); azioni.chiudi?.(voce.terminalId); } });
    b.addEventListener('dblclick', (e) => { e.preventDefault(); avviaRinomina(voce); });
    b.addEventListener('contextmenu', (e) => { e.preventDefault(); apriMenu(voce, e.clientX, e.clientY); });
    return b;
  }

  function suTastiera(e) {
    const tab = e.target.closest?.('[role=tab][data-terminale-id]');
    if (!tab || inRinomina) return;
    const lista = stato.schede.map((v) => v.terminalId);
    const id = tab.dataset.terminaleId;
    const voce = stato.schede.find((v) => v.terminalId === id);
    let prossima = null;
    if (e.key === 'ArrowRight') prossima = cicla(lista, id, 1);
    else if (e.key === 'ArrowLeft') prossima = cicla(lista, id, -1);
    else if (e.key === 'Home') prossima = lista[0];
    else if (e.key === 'End') prossima = lista[lista.length - 1];
    else if (e.key === 'Delete') { e.preventDefault(); azioni.chiudi?.(id); return; }
    else if (e.key === 'F2') { e.preventDefault(); if (voce) avviaRinomina(voce); return; }
    else if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) { e.preventDefault(); const r = tab.getBoundingClientRect(); if (voce) apriMenu(voce, r.left, r.bottom); return; }
    else return;
    e.preventDefault();
    if (prossima && prossima !== id) { azioni.seleziona?.(prossima); tabs.querySelector(`[role=tab][data-terminale-id="${CSS.escape(prossima)}"]`)?.focus(); }
  }
  tabs.addEventListener('keydown', suTastiera);

  function renderizza() {
    tabs.replaceChildren();
    stato.schede.forEach((voce, i) => { tabs.append('\n', creaTab(voce, i)); });
    const nuovo = document.createElement('button');
    nuovo.className = 'talos-terminal__tab';
    nuovo.setAttribute('role', 'tab');
    nuovo.setAttribute('aria-selected', 'false');
    nuovo.type = 'button';
    nuovo.dataset.terminaleNuova = '';
    nuovo.append(svgIcona('i-plus'), document.createTextNode(t(TESTI.nuovo)));
    nuovo.disabled = !stato.puoAprire;
    nuovo.title = stato.puoAprire ? `${t(TESTI.nuovaScheda)} (Ctrl+Shift+\`)` : (stato.motivoNoNuova || t(TESTI.nuovaSchedaSenzaSessione));
    nuovo.setAttribute('aria-label', nuovo.title);
    nuovo.addEventListener('click', () => azioni.nuova?.());
    tabs.append('\n', nuovo);
    const grow = document.createElement('span'); grow.className = 'talos-grow';
    tabs.append('\n', grow);
    for (const badge of stato.badges) {
      const s = document.createElement('span');
      s.className = `talos-badge${badge.tono ? ` talos-badge--${badge.tono}` : ''} talos-badge--sm`;
      s.textContent = badge.testo;
      if (badge.titolo) s.title = badge.titolo;
      if (badge.chiave) s.dataset.badge = badge.chiave;
      tabs.append('\n', s);
    }
    tabs.append('\n');
    if (foot) {
      foot.replaceChildren();
      const p = stato.piede;
      if (p) {
        const span = (testo, classe) => { const s = document.createElement('span'); if (classe) s.className = classe; s.textContent = testo; return s; };
        foot.append(span(p.chi));
        if (p.dettaglio) { const d = span(p.dettaglio, 'talos-mono'); d.title = p.dettaglio; foot.append(span('·'), d); }
        if (p.stato) foot.append(span('·'), span(p.stato));
        const g = document.createElement('span'); g.className = 'talos-grow';
        foot.append(g, span(p.nota ?? t(TESTI.nota)));
      }
    }
  }

  return {
    /** @param {object} nuovo {schede, attiva, puoAprire, motivoNoNuova, badges, piede} */
    aggiorna(nuovo) {
      stato = { ...stato, ...nuovo };
      if (inRinomina && !stato.schede.some((v) => v.terminalId === inRinomina)) inRinomina = null;
      renderizza();
    },
    fuocoSullaAttiva() { tabs.querySelector('[role=tab][aria-selected="true"]')?.focus(); },
    chiudiMenu,
    get stato() { return stato; },
  };
}
