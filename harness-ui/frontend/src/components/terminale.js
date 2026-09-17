/*
 * Le schede del Terminale (B1, K-G — 06/09): la barra `.talos-terminal__tabs` e il piede
 * `.talos-terminal__foot` del mockup, «a partire dai dati». Il corpo (dove vive xterm.js) NON è
 * di questo componente: chi lo monta decide cosa ci va.
 *
 *   <div class="talos-terminal__tabs talos-schede" role="tablist">
 *     <button class="talos-terminal__tab talos-schede__tab" role="tab" aria-selected="true"><span class="talos-dot talos-dot--live"></span>agente · giro 7</button>
 *     <button class="talos-terminal__tab talos-schede__tab" role="tab" aria-selected="false"><span class="talos-dot talos-dot--success"></span>tu · PowerShell</button>
 *     <button class="talos-terminal__tab talos-schede__tab" role="tab" aria-selected="false"><svg class="i i--sm"><use href="#i-plus"/></svg>Nuovo</button>
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
 *
 * ⭐ 17/09/2026, BC-63 — la MECCANICA delle linguette (giro di disegno, roving tabindex, tastiera,
 *   menu contestuale, scorrimento) è uscita da qui ed è finita in `schede.js`, che adesso usano sia
 *   questo file sia la Revisione. Qui resta solo ciò che è del Terminale: il pallino di stato, la
 *   «×» disegnata dal CSS, la rinomina dal vivo, il «+ Nuovo», i badge e il piede. Il DOM prodotto
 *   è lo STESSO di prima, più la classe condivisa `talos-schede__tab` sulle linguette.
 */

import { t } from './lingua.js';
import { accorciaPercorso, cicla, creaMenuContestuale, apriMenuContestuale, creaSchede, nomeSchedaValido, prossimaAttivaDopoChiusura } from './schede.js';

/* Gli aiuti che stavano qui e ora vivono in `schede.js`: si ri-esportano perché i chiamanti (e le
   prove) li importano da questo modulo da settembre, e una rinomina di percorso non è la cura di
   BC-63 — sarebbe solo un diff più grande su file che non c'entrano. */
export { accorciaPercorso, cicla, creaMenuContestuale, apriMenuContestuale, nomeSchedaValido, prossimaAttivaDopoChiusura };

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

function svgIcona(nome, classi = 'i i--sm') {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', classi);
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `#${nome}`);
  svg.append(use);
  return svg;
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

  const schede = creaSchede(tabs, {
    root,
    chiave: 'terminaleId',
    classe: 'talos-terminal__tab talos-schede__tab',
    idMenu: 'menuSchedaTerminale',
    chiudibile: true,
    rinominabile: true,
    identifica: (voce) => voce.terminalId,
    etichetta: (voce, tutte) => titoloScheda(voce, tutte),
    suggerimento: (voce, indice, tutte) => [`${indice + 1}. ${titoloScheda(voce, tutte)}`, voce.cartella].filter(Boolean).join(' — '),
    inerte: (voce) => inRinomina === voce.terminalId,
    contenuto: disegnaLinguetta,
    coda: disegnaCoda,
    suClick: (voce, e, b) => {
      // la «×» è un ::after in CSS (la struttura resta quella del mockup): un clic nella zona destra della scheda chiude
      const sullaX = e.clientX > 0 && e.clientX >= b.getBoundingClientRect().right - ZONA_CHIUSURA_PX;
      if (sullaX) { azioni.chiudi?.(voce.terminalId); return true; }
      return false;
    },
    suDoppioClick: (voce) => avviaRinomina(voce),
    vociMenu: (voce) => [
      [t(TESTI.rinomina), () => avviaRinomina(voce), true],
      [t(TESTI.chiudi), () => azioni.chiudi?.(voce.terminalId), true],
      [t(TESTI.chiudiAltre), () => azioni.chiudiAltre?.(voce.terminalId), stato.schede.length > 1],
      [t(TESTI.chiudiTutte), () => azioni.chiudiTutte?.(), stato.schede.length > 0],
    ],
    azioni: {
      seleziona: (id) => azioni.seleziona?.(id),
      chiudi: (id) => azioni.chiudi?.(id),
      tastieraSospesa: () => Boolean(inRinomina),
    },
  });

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
    if (id) schede.bottoneDi(id)?.focus();
  }

  function disegnaLinguetta(b, voce) {
    const titolo = titoloScheda(voce, stato.schede);
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
      return;
    }
    b.append(document.createTextNode(titolo));
  }

  function disegnaCoda() {
    const nodi = [];
    const nuovo = document.createElement('button');
    nuovo.className = 'talos-terminal__tab talos-schede__tab';
    nuovo.setAttribute('role', 'tab');
    nuovo.setAttribute('aria-selected', 'false');
    nuovo.type = 'button';
    nuovo.dataset.terminaleNuova = '';
    nuovo.append(svgIcona('i-plus'), document.createTextNode(t(TESTI.nuovo)));
    nuovo.disabled = !stato.puoAprire;
    nuovo.title = stato.puoAprire ? `${t(TESTI.nuovaScheda)} (Ctrl+Shift+\`)` : (stato.motivoNoNuova || t(TESTI.nuovaSchedaSenzaSessione));
    nuovo.setAttribute('aria-label', nuovo.title);
    nuovo.addEventListener('click', () => azioni.nuova?.());
    nodi.push(nuovo);
    const grow = document.createElement('span'); grow.className = 'talos-grow';
    nodi.push(grow);
    for (const badge of stato.badges) {
      const s = document.createElement('span');
      s.className = `talos-badge${badge.tono ? ` talos-badge--${badge.tono}` : ''} talos-badge--sm`;
      s.textContent = badge.testo;
      if (badge.titolo) s.title = badge.titolo;
      if (badge.chiave) s.dataset.badge = badge.chiave;
      nodi.push(s);
    }
    return nodi;
  }

  function renderizza() {
    schede.aggiorna(stato.schede, stato.attiva);
    if (foot) {
      foot.replaceChildren();
      const p = stato.piede;
      if (p) {
        const span = (testo, classe) => { const s = document.createElement('span'); if (classe) s.className = classe; s.textContent = testo; return s; };
        foot.append(span(p.chi));
        if (p.dettaglio) { const d = span(accorciaPercorso(p.dettaglio), 'talos-mono'); d.title = p.dettaglio; foot.append(span('·'), d); }
        if (p.stato) foot.append(span('·'), span(p.stato));
        const g = document.createElement('span'); g.className = 'talos-grow';
        // ⛔ La frase generica solo quando NON c'è un percorso da mostrare: dove c'è un dato vero,
        //    lo spazio è suo. Una spiegazione che ruba posto al fatto che spiega è di troppo.
        const coda = p.nota ?? (p.dettaglio ? '' : t(TESTI.nota));
        foot.append(g, ...(coda ? [span(coda)] : []));
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
    fuocoSullaAttiva() { schede.fuocoSullaAttiva(); },
    chiudiMenu: schede.chiudiMenu,
    get stato() { return stato; },
  };
}
