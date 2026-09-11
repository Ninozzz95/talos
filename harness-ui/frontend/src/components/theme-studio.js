/*
 * theme-studio.js — «Temi e atmosfere» del mockup (`themeChooser` riga 6312, `initAtelier` 6319,
 * `setAppearance` 6314), lotto F. Decisione dell'owner: **nelle Impostazioni**.
 *
 * ⛔ IL PROBLEMA VERO DI QUESTA SUPERFICIE: quattordici tavolozze da mostrare senza riscriverle.
 *   Il mockup porta con sé un oggetto `atelierThemes` con nome, fondo e accento di ognuna — cioè
 *   una QUINDICESIMA copia della palette. Il 11/09 l'owner ha appena fatto allineare i temi del
 *   desktop a quelli del mobile («il mobile è la sorgente di verità») proprio perché esistevano
 *   due copie divergenti: aggiungerne una terza qui sarebbe lo stesso difetto, il giorno dopo.
 *   ⇒ Qui NIENTE tavolozza scritta a mano:
 *     · i NOMI arrivano da `impostazioni-campi.js` (le opzioni del campo `themePresetSelect`,
 *       cioè il contratto dei 38 controlli);
 *     · i COLORI si LEGGONO dal foglio che dipinge la app — le regole
 *       `:root[data-talos-theme="…"]` di `temi.css` e i loro quattro semi
 *       (`--talos-seme-accento`, `--talos-seme-fondo`, `--talos-seme-fondo-chiaro`,
 *       `--talos-seme-linea`). Se domani una tavolozza cambia, il pallino cambia da solo.
 *   ⛔ Se il foglio non è leggibile (CSSOM negato, o un documento di prova) il pallino resta
 *     neutro e lo studio funziona lo stesso: un colore mancante non è un colore inventato.
 *
 * ⛔ COME SI APPLICA UN TEMA, e dove il mockup SBAGLIA per noi. `setAppearance` del mockup fa
 *   `control.dispatchEvent(new Event('input'))`. In questa app l'ascoltatore è registrato su
 *   `change` per select e checkbox e su `input` solo per i `range`
 *   (`legacy/app.js`, `appearanceControlMap`): un `input` su un `<select>` NON farebbe scattare
 *   niente e il tema non si applicherebbe. Qui l'evento è quello giusto per il tipo di controllo.
 *   ⇒ lo studio non salva niente da sé: muove i controlli veri, e la persistenza resta l'unica
 *   che c'è già (`aggiornaAspettoDesktop`, con il suo timbro `ASPETTO_SCELTA_VERSIONE`).
 *
 * ⛔ ANTEPRIMA: niente Canvas. Il mockup crea una scena animata dentro la modale
 *   (`TalosAmbient.create`). La app ha GIA' quell'anteprima, viva, nella pagina Aspetto
 *   (`motion/desktop-background.js`, `.talos-motion-preview`): rifarla dentro una modale
 *   significherebbe due runtime di scene accesi insieme, e il costo per frame lo paga la stessa
 *   GPU. Qui l'anteprima è ferma e fatta con i semi del tema — dice il colore, non finge il moto.
 *
 * Ricerca fatta PRIMA di scrivere, 11/09/2026: Setproduct «Radio button UI design, from anatomy to
 * accessible groups» e l'esempio W3C `role="radiogroup"` — un gruppo di scelte esclusive vuole
 * `role="radiogroup"` + `role="radio"` con `aria-checked`, UN SOLO elemento raggiungibile col
 * Tab (roving tabindex) e le frecce che spostano la scelta; e la selezione non può essere affidata
 * al solo colore (qui c'è anche il segno di spunta).
 */
import { CAMPI_IMPOSTAZIONI } from './impostazioni-campi.js';
import { apriModale, chiudiModale } from './modale-td.js';

export const SEMI = Object.freeze({
  accento: '--talos-seme-accento',
  fondo: '--talos-seme-fondo',
  fondoChiaro: '--talos-seme-fondo-chiaro',
  fondoScuro: '--talos-seme-fondo-scuro',
  linea: '--talos-seme-linea',
  raggio: '--talos-radius-card',
});

/** I quattordici nomi, dal contratto dei controlli: nessun elenco parallelo. */
export function nomiTemi(campi = CAMPI_IMPOSTAZIONI) {
  const campo = campi.find((c) => c.id === 'themePresetSelect');
  return (campo?.opzioni || []).map(([id, nome]) => ({ id, nome }));
}

const REGOLA_TEMA = /^:root\[data-talos-theme=["']?([a-z]+)["']?\]$/i;

/**
 * I semi di ogni tema, letti dalle regole di `temi.css`.
 * ⛔ `cssRules` può lanciare su un foglio di un'altra origine: si salta quel foglio e si va avanti,
 *   invece di far cadere tutta la modale per una regola non leggibile.
 */
export function leggiSemiTemi(doc = globalThis.document) {
  const semi = new Map();
  const fogli = doc?.styleSheets ? [...doc.styleSheets] : [];
  for (const foglio of fogli) {
    let regole = [];
    try { regole = [...(foglio.cssRules || [])]; } catch { continue; }
    for (const regola of regole) {
      const trovato = REGOLA_TEMA.exec(regola.selectorText || '');
      if (!trovato) continue;
      const id = trovato[1].toLowerCase();
      const dichiarato = {};
      for (const [chiave, proprieta] of Object.entries(SEMI)) {
        const valore = regola.style?.getPropertyValue?.(proprieta)?.trim();
        if (valore) dichiarato[chiave] = valore;
      }
      semi.set(id, { ...(semi.get(id) || {}), ...dichiarato });
    }
  }
  return semi;
}

/**
 * Il fondo da mostrare per un tema in un dato modo colore.
 * ⛔ Non è una formula copiata da `temi.css`: è la SCELTA fra i semi che quel foglio dichiara
 *   (`--talos-seme-fondo-chiaro` per il chiaro, `--talos-seme-fondo-scuro` per lo scuro, e il seme
 *   generico quando il tema ne ha uno solo). Le derivazioni (pannello, bordo, testo) restano al
 *   foglio: qui non se ne ricalcola nessuna.
 */
export function fondoDelTema(seme, modo) {
  if (!seme) return '';
  if (modo === 'light') return seme.fondoChiaro || seme.fondo || '';
  return seme.fondoScuro || seme.fondo || '';
}

/** I quattro temi che nascono CHIARI si riconoscono dal seme che solo loro dichiarano. */
export function temaChiaro(seme) { return Boolean(seme?.fondoChiaro); }

/**
 * Muove un controllo vero delle Impostazioni e lascia che sia la app a reagire e a salvare.
 * Prova prima l'id legacy (`themePresetSelect`, il `<select>` che `montaImpostazioni` sposta dentro
 * la riga) e poi quello generato (`setting-themePresetSelect`), che è quello che esiste nel
 * laboratorio e in ogni riga nata dal mockup.
 */
export function impostaAspetto(id, valore, doc = globalThis.document) {
  const controllo = doc.getElementById(id) || doc.getElementById(`setting-${id}`);
  if (!controllo) return false;
  if (controllo.type === 'checkbox') controllo.checked = Boolean(valore);
  else controllo.value = String(valore);
  // ⛔ `change` per select e checkbox, `input` per i cursori: è la mappa di `appearanceControlMap`.
  const evento = controllo.type === 'range' ? 'input' : 'change';
  controllo.dispatchEvent(new Event(evento, { bubbles: true }));
  return true;
}

/** Che tema e che modo sono attivi ADESSO: si chiede alla radice, non a una variabile nostra. */
export function aspettoCorrente(doc = globalThis.document) {
  const radice = doc.documentElement;
  const dalControllo = (id) => doc.getElementById(id)?.value || doc.getElementById(`setting-${id}`)?.value || '';
  return {
    tema: radice.getAttribute('data-talos-theme') || dalControllo('themePresetSelect') || 'calm',
    modo: dalControllo('colorModeSelect') || (radice.getAttribute('data-theme') === 'light' ? 'light' : 'system'),
  };
}

function nodo(doc, tag, classe, testo) {
  const el = doc.createElement(tag);
  if (classe) el.className = classe;
  if (testo !== undefined && testo !== null) el.textContent = String(testo);
  return el;
}

/* ------------------------------------------------------------------------- la modale vera */

export function apriStudioTemi({ document: doc = globalThis.document } = {}) {
  const temi = nomiTemi();
  const semi = leggiSemiTemi(doc);
  let { tema: scelto, modo } = aspettoCorrente(doc);
  if (!temi.some((t) => t.id === scelto)) scelto = temi[0]?.id || 'calm';

  const studio = nodo(doc, 'div', 'td-theme-studio');
  const elenco = nodo(doc, 'div', 'td-theme-list');
  elenco.setAttribute('role', 'radiogroup');
  elenco.setAttribute('aria-label', 'Tema dell’interfaccia');
  const destra = nodo(doc, 'div', 'td-theme-display');
  const titolo = nodo(doc, 'h3', '', '');
  const descrizione = nodo(doc, 'p', '', '');
  const anteprima = nodo(doc, 'div', 'td-theme-preview');
  const didascalia = nodo(doc, 'div', 'td-preview-caption');
  const didascaliaTema = nodo(doc, 'span', '', '');
  const didascaliaModo = nodo(doc, 'span', '', '');
  didascalia.append(didascaliaTema, didascaliaModo);

  const controlli = nodo(doc, 'div', 'td-theme-controls');
  const segmento = nodo(doc, 'div', 'td-segment');
  segmento.setAttribute('role', 'group');
  segmento.setAttribute('aria-label', 'Modalità colore');
  /* ⛔ Il mockup offre due modi (Scuro/Chiaro). La app ne ha TRE, e «Segui il sistema» è il
     default: toglierlo qui vorrebbe dire che aprire lo studio e scegliere un tema spegne per
     sempre il rispetto della preferenza di sistema, senza averlo chiesto. */
  const MODI = [['system', 'Sistema'], ['light', 'Chiaro'], ['dark', 'Scuro']];
  const bottoniModo = MODI.map(([valore, nome]) => {
    const b = nodo(doc, 'button', '', nome);
    b.type = 'button';
    b.dataset.modo = valore;
    b.addEventListener('click', () => {
      modo = valore;
      impostaAspetto('colorModeSelect', valore, doc);
      aggiorna();
    });
    segmento.append(b);
    return b;
  });
  controlli.append(segmento);

  const dettagli = nodo(doc, 'div', 'td-theme-details');
  const campi = ['Accento', 'Fondo', 'Raggio delle schede'].map((nome) => {
    const box = nodo(doc, 'div');
    box.append(nodo(doc, 'span', '', nome));
    const valore = nodo(doc, 'strong', '', '—');
    box.append(valore);
    dettagli.append(box);
    return valore;
  });

  const azioni = nodo(doc, 'div', 'td-theme-actions');
  const vaiAImpostazioni = nodo(doc, 'button', 'td-studio-button', 'Tutte le impostazioni dell’aspetto');
  vaiAImpostazioni.type = 'button';
  vaiAImpostazioni.addEventListener('click', () => {
    chiudiModale();
    doc.getElementById('setting-tab-appearance')?.click();
    (doc.getElementById('themePresetSelect') || doc.getElementById('setting-themePresetSelect'))?.focus?.({ preventScroll: false });
  });
  azioni.append(vaiAImpostazioni);

  const nota = nodo(doc, 'p', 'td-theme-note', 'Il tema si applica subito, senza chiudere il pannello. La preferenza è di questo browser: le conversazioni e i file non vengono toccati. Lo sfondo animato ha un suo controllo in «Aspetto e movimento».');

  destra.append(titolo, descrizione, anteprima, didascalia, controlli, dettagli, azioni, nota);
  studio.append(elenco, destra);

  const scelte = temi.map(({ id, nome }) => {
    const b = nodo(doc, 'button', 'td-theme-choice');
    b.type = 'button';
    b.setAttribute('role', 'radio');
    b.dataset.tema = id;
    const pallino = nodo(doc, 'span', 'td-palette-dot');
    pallino.setAttribute('aria-hidden', 'true');
    const seme = semi.get(id);
    if (seme?.accento) pallino.style.setProperty('--preview-accent', seme.accento);
    const fondo = fondoDelTema(seme, temaChiaro(seme) ? 'light' : 'dark');
    if (fondo) pallino.style.setProperty('--preview-bg', fondo);
    const segno = nodo(doc, 'span', 'td-theme-segno', '');
    b.append(pallino, doc.createTextNode(nome), segno);
    b.addEventListener('click', () => { scelto = id; impostaAspetto('themePresetSelect', id, doc); aggiorna(); b.focus({ preventScroll: true }); });
    elenco.append(b);
    return { id, nome, bottone: b, segno };
  });

  /* Le frecce spostano la scelta, come in un gruppo di radio vero; Tab entra ed esce una volta sola. */
  elenco.addEventListener('keydown', (e) => {
    const passo = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
    if (passo === undefined && e.key !== 'Home' && e.key !== 'End') return;
    e.preventDefault();
    const i = scelte.findIndex((s) => s.id === scelto);
    const prossimo = e.key === 'Home' ? 0 : e.key === 'End' ? scelte.length - 1 : (i + passo + scelte.length) % scelte.length;
    scelte[prossimo].bottone.click();
  });

  function aggiorna() {
    const seme = semi.get(scelto);
    const nome = temi.find((t) => t.id === scelto)?.nome || scelto;
    /* ⛔ «Segue il sistema» non vuol dire «scuro»: il modo vero è quello che la radice sta già
       dipingendo (`data-theme`), e in mancanza lo dice il browser. Senza questo, con la app in
       chiaro l'anteprima restava nera e diceva «Segue il sistema»: due cose opposte accanto. */
    const modoDisegnato = modo !== 'system' ? modo
      : (doc.documentElement.getAttribute('data-theme') === 'light'
        || globalThis.matchMedia?.('(prefers-color-scheme: light)')?.matches ? 'light' : 'dark');
    titolo.textContent = nome;
    descrizione.textContent = temaChiaro(seme)
      ? 'Tavolozza chiara: nasce su carta e resta leggibile anche quando il sistema è in scuro.'
      : 'Tavolozza scura: fondo profondo e un accento solo, quello che guida l’occhio.';
    for (const s of scelte) {
      const attivo = s.id === scelto;
      s.bottone.setAttribute('aria-checked', String(attivo));
      s.bottone.tabIndex = attivo ? 0 : -1;
      s.segno.textContent = attivo ? '✓' : '';
    }
    for (const b of bottoniModo) b.setAttribute('aria-pressed', String(b.dataset.modo === modo));
    const fondo = fondoDelTema(seme, modoDisegnato);
    anteprima.style.setProperty('--preview-bg', fondo || 'var(--talos-background)');
    anteprima.style.setProperty('--preview-accent', seme?.accento || 'var(--talos-accent)');
    anteprima.style.setProperty('--preview-line', seme?.linea || 'var(--talos-border)');
    if (seme?.raggio) anteprima.style.setProperty('--preview-radius', seme.raggio);
    didascaliaTema.textContent = nome;
    didascaliaModo.textContent = modo === 'system' ? 'Segue il sistema' : modo === 'light' ? 'Chiaro' : 'Scuro';
    campi[0].textContent = seme?.accento || 'non dichiarato';
    campi[1].textContent = fondo || 'non dichiarato';
    campi[2].textContent = seme?.raggio || 'non dichiarato';
    disegnaAnteprima();
  }

  function disegnaAnteprima() {
    anteprima.replaceChildren();
    const riga = nodo(doc, 'div', 'td-preview-riga');
    riga.append(nodo(doc, 'span', 'td-preview-pallino'), nodo(doc, 'span', 'td-preview-barra'));
    const scheda = nodo(doc, 'div', 'td-preview-scheda');
    const barraLunga = nodo(doc, 'span', 'td-preview-barra');
    const barraCorta = nodo(doc, 'span', 'td-preview-barra');
    barraCorta.dataset.corta = 'si';
    scheda.append(barraLunga, barraCorta);
    anteprima.append(riga, scheda);
  }

  aggiorna();
  const modale = apriModale('Temi e atmosfere', studio, { document: doc, ampia: true });
  /*
   * ⛔ VISTO NELLA FOTO: la modale dà il fuoco al primo controllo utile — cioè a «Forge» — mentre
   *   il tema scelto era «Calm», quattordicesimo e fuori dalla parte visibile dell'elenco. Un
   *   anello di fuoco su una voce e la spunta su un'altra sono due risposte diverse alla stessa
   *   domanda. Qui il fuoco (e lo scorrimento) vanno su quella scelta.
   */
  const scelta = scelte.find((s) => s.id === scelto)?.bottone;
  scelta?.focus({ preventScroll: true });
  scelta?.scrollIntoView?.({ block: 'center' });
  return modale;
}

/**
 * Il pulsante che apre lo studio, nelle Impostazioni, subito sotto la riga «Tema TALOS»
 * (mockup `initAtelier`, riga 6319). Idempotente: `montaImpostazioni` ridisegna le righe a ogni
 * apertura della schermata, e questo va richiamato dopo — se il pulsante c'è già non ne nasce un
 * secondo.
 */
export function montaScorciatoiaTemi(schermo, { document: doc = globalThis.document } = {}) {
  if (!schermo) return null;
  const riga = schermo.querySelector('[data-setting-row="themePresetSelect"]');
  if (!riga) return null;
  const esistente = schermo.querySelector('[data-td-studio-temi]');
  if (esistente) return esistente;
  const b = nodo(doc, 'button', 'td-studio-button', `Esplora le ${nomiTemi().length} atmosfere`);
  b.type = 'button';
  b.dataset.tdStudioTemi = '';
  b.addEventListener('click', () => apriStudioTemi({ document: doc }));
  riga.after(b);
  return b;
}
