/*
 * La barra di sinistra CHIUSA, variante B «Menu a comparsa» — owner 30/10/2026 sera (bozzetto della Frontend «Barra a icone»,
 * scelta insieme alla variante D della barra aperta).
 *
 * A barra chiusa (64 px, `:root[data-sidebar="icone"]`) restano icone: Home, Sessioni, Spazi di lavoro, Strumenti, più nuova
 * sessione, ricerca e Impostazioni. Sessioni, Spazi e Strumenti aprono un MENU A COMPARSA accanto alla striscia.
 *
 * ⛔ La comparsa NON è una copia: mostra gli STESSI nodi della barra aperta (il gruppo `#gruppoLavoro`, `#gruppoStrumenti`, l'elenco
 *   delle sessioni con la sua ricerca), spostati a vista col CSS (`data-comparsa` sulla barra). Così l'elenco delle sessioni è quello
 *   aggiornato ogni 15 s, con le stesse righe (`creaSessionItem`/`aggiornaSessionItem`), e le due liste non possono staccarsi.
 * ⛔ Aprire una comparsa non cambia la scelta ricordata dei gruppi della barra aperta (D): il gruppo chiuso resta chiuso, il CSS lo
 *   mostra solo dentro la comparsa.
 * ⛔ Tastiera (WCAG 2.1.2 / pattern «disclosure» con contenuto a comparsa): Esc chiude e riporta il fuoco all'icona; il fuoco entra
 *   nella comparsa all'apertura; clic fuori chiude; scegliere una voce chiude.
 * ⛔ I pulsanti della striscia hanno `aria-controls` per i lettori di schermo e `data-disclosure-propria`, perché la regia generica
 *   del monolite (`[aria-expanded][aria-controls]`) non li inverta una seconda volta togliendo `hidden` al gruppo.
 */

/** Le tre comparse e il nodo che ciascuna mostra. */
export const COMPARSE = Object.freeze({
  sessioni: '.talos-sidebar__sessions',
  lavoro: '#gruppoLavoro',
  strumenti: '#gruppoStrumenti',
});

/**
 * Dove sta la comparsa: allineata in alto all'icona che l'ha aperta, ma mai oltre il fondo della finestra.
 * @param {{ iconaTop:number, altezzaComparsa:number, altezzaFinestra:number, margine?:number }} p
 * @returns {number} il `top` in pixel
 */
export function posizioneComparsa({ iconaTop, altezzaComparsa, altezzaFinestra, margine = 12 }) {
  const top = Number.isFinite(iconaTop) ? iconaTop : margine;
  const alta = Number.isFinite(altezzaComparsa) ? altezzaComparsa : 0;
  const massimo = Math.max(margine, altezzaFinestra - alta - margine);
  return Math.round(Math.max(margine, Math.min(top, massimo)));
}

/**
 * Monta le comparse sulla barra. Ritorna `{ chiudi }`.
 * @param {{ barra:Element, documentObj?:Document, aCompressa:()=>boolean }} p
 */
export function montaComparseBarra({ barra, documentObj = globalThis.document, aCompressa }) {
  if (!barra) return { chiudi() {} };
  let aperta = null; // { nome, icona }

  const pulsanti = () => [...barra.querySelectorAll('[data-comparsa-apre]')];
  const nodo = (nome) => (COMPARSE[nome] ? barra.querySelector(COMPARSE[nome]) : null);

  function chiudi({ fuoco = false } = {}) {
    if (!aperta) return;
    const { icona } = aperta;
    aperta = null;
    delete barra.dataset.comparsa;
    barra.style.removeProperty('--td-comparsa-top');
    barra.style.removeProperty('--td-comparsa-azioni');
    for (const p of pulsanti()) p.setAttribute('aria-expanded', 'false');
    if (fuoco && icona?.isConnected) icona.focus();
  }

  function apri(nome, icona, { cerca = false } = {}) {
    if (!COMPARSE[nome] || !aCompressa()) return;
    aperta = { nome, icona };
    barra.dataset.comparsa = nome;
    for (const p of pulsanti()) p.setAttribute('aria-expanded', String(p.dataset.comparsaApre === nome && p === icona));
    /* la posizione si misura DOPO che il CSS l'ha resa visibile: prima la sua altezza è zero */
    const comparsa = nodo(nome);
    const alto = icona?.getBoundingClientRect?.().top ?? 12;
    const finestra = documentObj.defaultView?.innerHeight ?? 800;
    const blocco = nome === 'sessioni' ? barra.querySelector('.talos-sidebar__actions') : null;
    if (blocco) barra.style.setProperty('--td-comparsa-azioni', `${Math.round(blocco.getBoundingClientRect().height)}px`);
    const altezza = (comparsa?.getBoundingClientRect?.().height ?? 0) + (blocco?.getBoundingClientRect?.().height ?? 0);
    barra.style.setProperty('--td-comparsa-top', `${posizioneComparsa({ iconaTop: alto, altezzaComparsa: Math.min(altezza, finestra * 0.8), altezzaFinestra: finestra })}px`);
    const primo = cerca
      ? barra.querySelector('.talos-sidebar__actions input')
      : (nome === 'sessioni' ? barra.querySelector('.talos-sidebar__actions input') : comparsa?.querySelector('button, [href], input'));
    primo?.focus?.();
  }

  barra.addEventListener('click', (event) => {
    /* «Nuova sessione» della striscia: lo stesso pulsante della barra aperta (il ponte lo battezza `#newSessionBtn`), mai un altro */
    if (event.target.closest?.('[data-comparsa-nuova]')) {
      chiudi();
      (barra.querySelector('#newSessionBtn') || barra.querySelector('#voceNuova'))?.click();
      return;
    }
    const icona = event.target.closest?.('[data-comparsa-apre]');
    if (icona && barra.contains(icona)) {
      const nome = icona.dataset.comparsaApre;
      const cerca = icona.hasAttribute('data-comparsa-cerca');
      if (aperta && aperta.nome === nome && aperta.icona === icona) chiudi({ fuoco: true });
      else { chiudi(); apri(nome, icona, { cerca }); }
      return;
    }
    /* una voce scelta dentro la comparsa porta dove deve (la regia della barra) e la comparsa si chiude */
    if (aperta && event.target.closest?.('[data-vaia], .talos-session-item')) {
      const dentro = nodo(aperta.nome);
      if (dentro?.contains(event.target)) chiudi();
    }
  });

  /* ⛔ 31/10/2026 (revisione del blocco, R1): Esc chiude la comparsa solo se il fuoco è DENTRO la barra. Catturato su tutto il documento
     chiudeva la comparsa anche quando sopra c'era il menu «⋯» di una riga o la palette dei comandi: il menu restava aperto, orfano, e
     l'Esc non arrivava a chi doveva chiudere. */
  documentObj.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !aperta || !barra.contains(documentObj.activeElement)) return;
    event.stopPropagation(); chiudi({ fuoco: true });
  }, true);

  documentObj.addEventListener('pointerdown', (event) => {
    if (!aperta) return;
    const dentro = nodo(aperta.nome)?.contains(event.target)
      || (aperta.nome === 'sessioni' && barra.querySelector('.talos-sidebar__actions')?.contains(event.target))
      || event.target.closest?.('[data-comparsa-apre]')
      || event.target.closest?.('[role="menu"], .talos-menu, #talosTip'); // il menu «⋯» di una riga apre sopra la comparsa
    if (!dentro) chiudi();
  }, true);

  return { chiudi, apri, get aperta() { return aperta?.nome ?? null; } };
}

/** Il segnale «qualcosa lavora» sull'icona delle Sessioni: c'è almeno una riga viva nell'elenco. */
export function aggiornaSegnaleSessioni(barra) {
  const segno = barra?.querySelector('[data-segnale-sessioni]');
  if (!segno) return;
  const vive = Boolean(barra.querySelector('.talos-sidebar__sessions .talos-dot--live'));
  if (segno.hidden === vive) segno.hidden = !vive;
}

/**
 * Tiene il segnale allineato all'elenco senza agganciarsi a chi lo disegna (le righe cambiano da più punti: l'elenco ogni 15 s e la
 * riga della sessione aperta a ogni cambio di stato). ⛔ Percorso caldo: al più UN controllo per fotogramma, e il controllo è una
 * sola `querySelector`; nessun lavoro se l'elenco non cambia.
 */
export function osservaSegnaleSessioni(barra, { finestra = globalThis.window } = {}) {
  const elenco = barra?.querySelector('.talos-sidebar__sessions');
  if (!elenco || typeof finestra?.MutationObserver !== 'function') return () => {};
  let programmato = false;
  const osservatore = new finestra.MutationObserver(() => {
    if (programmato) return;
    programmato = true;
    finestra.requestAnimationFrame(() => { programmato = false; aggiornaSegnaleSessioni(barra); });
  });
  osservatore.observe(elenco, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  aggiornaSegnaleSessioni(barra);
  return () => osservatore.disconnect();
}
