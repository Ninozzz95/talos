/*
 * theme-studio.js — «Temi e atmosfere» del mockup (`themeChooser` riga 6312, `syncThemeChooser`
 * 6313, il gestore `data-art` 6315, `initAtelier` 6319), lotto F, rifatto il 12/09/2026.
 *
 * ============================================================================================
 * 12/09/2026 — TRE ORDINI DELL'OWNER, E COSA CAMBIANO
 * ============================================================================================
 * (1) «il pannello Temi e atmosfere del mockup lo prevediamo? Implementarlo in modo coerente».
 * (2) Foto dell'owner con Paper scelto: «ok ma **l'anteprima non è dal vivo** come sul mockup».
 *     Era vero: al suo posto c'era un segnaposto disegnato con tre `<span>` — un pallino e tre
 *     barre — su un fondo che per giunta restava scuro con un tema chiaro.
 * (3) «vorrei anche i diversi slider TUTTI nella modale anziché nelle impostazioni», precisato
 *     poi in «gli slider **relativi dell'animazione e del tema**, ovviamente».
 *
 * ⇒ Da qui in poi lo studio è il POSTO di quattordici preferenze (tema, modo colore, sfondo
 *   acceso, scena, renderer, qualità e gli otto cursori della scena), e le righe corrispondenti
 *   nelle Impostazioni diventano UN rimando solo: `migraRigheImpostazioni`, in fondo a questo file.
 *   Una preferenza, un posto.
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
 *       `:root[data-talos-theme="…"]` di `temi.css` e i loro semi;
 *     · del mockup resta solo la PROSA (`DESCRIZIONI_TEMI`): nome della scena, materiale e la
 *       frase che la descrive. Sono parole dell'owner, non colori, e non esistono altrove.
 *   ⛔ Se il foglio non è leggibile (CSSOM negato, o un documento di prova) il pallino resta
 *     neutro e lo studio funziona lo stesso: un colore mancante non è un colore inventato.
 *
 * ⛔ L'ANTEPRIMA È VIVA, ED È LA SCENA VERA. Il mockup crea dentro la modale una scena Canvas
 *   (`TalosAmbient.create($('#td-theme-preview'),{preview:true})`). La app ha lo stesso motore in
 *   `motion/desktop-scenes.js` (le 14 scene portate dal mobile 355dc8e) — ma `desktop-background.js`
 *   NON esporta `mountStage`, e quel file non è mio da modificare. ⇒ qui c'è un piccolo runtime
 *   locale (`creaAnteprimaScena`) che usa le STESSE definizioni di scena, la STESSA tavolozza letta
 *   dai token vivi e gli STESSI parametri (`--talos-motion-*`): non una seconda serie di scene, un
 *   secondo lettore della stessa.
 *   ⛔ Costo tenuto corto, come il pacchetto: 30 fps, `devicePixelRatio` tagliato a 1.5, UN canvas,
 *     fermo quando la scheda è nascosta, e distrutto alla chiusura della modale.
 *
 * ⛔ PERCHÉ IL TEMA SI APPLICA ALLA RADICE E NON AL SOLO RIQUADRO. `temi.css` dichiara i suoi
 *   selettori come `:root[data-talos-theme="…"]`: un `data-talos-theme` su un `<div>` non
 *   accenderebbe NIENTE, e per dipingere il riquadro da solo servirebbe ricopiare la tavolozza —
 *   cioè il difetto che tutto questo file evita. Il mockup fa lo stesso: `data-art=theme` chiama
 *   `setAppearance('setting-themePresetSelect', …)` e la app intera cambia sotto la modale.
 *
 * ⛔ COME SI APPLICA UN TEMA, e dove il mockup SBAGLIA per noi. `setAppearance` del mockup fa
 *   `control.dispatchEvent(new Event('input'))`. In questa app l'ascoltatore è registrato su
 *   `change` per select e checkbox e su `input` solo per i `range`
 *   (`legacy/app.js`, `appearanceControlMap`): un `input` su un `<select>` NON farebbe scattare
 *   niente e il tema non si applicherebbe. Qui l'evento è quello giusto per il tipo di controllo.
 *   ⇒ lo studio non salva niente da sé: muove i controlli veri, e la persistenza resta l'unica
 *   che c'è già (`aggiornaAspettoDesktop`, con il suo timbro `ASPETTO_SCELTA_VERSIONE`).
 *   ⛔ Vale anche per i cursori nuovi: nessuna chiave in più in `talos.harness.desktop.settings.v1`.
 *
 * --------------------------------------------------------------------------------------------
 * RICERCA WEB PRIMA DI SCRIVERE — fonte + data, 12/09/2026
 * --------------------------------------------------------------------------------------------
 *  · MDN, «prefers-reduced-motion» (pagina aggiornata 10/06/2026): la preferenza si legge in
 *    JavaScript con `matchMedia('(prefers-reduced-motion: reduce)')`, e «reduce» chiede di
 *    RIMUOVERE o sostituire il movimento, non di nasconderlo. ⇒ qui l'anteprima ridotta resta
 *    DIPINTA e a colori, ferma su un fotogramma: si toglie il moto, non l'informazione.
 *  · MDN, «<input type="range">» (aggiornata 10/09/2026): l'etichetta si lega con `for`, il valore
 *    corrente si mostra con un `<output>` aggiornato sull'evento `input` (continuo mentre si
 *    trascina), mentre `change` scatta al rilascio. ⇒ ogni cursore dello studio ha etichetta,
 *    `<output>` e aggiornamento su `input`, che è anche l'evento che `legacy/app.js` ascolta.
 *  · MDN, «Optimizing canvas» (aggiornata 25/08/2026): `requestAnimationFrame` invece di
 *    `setInterval`, dimensione in pixel = CSS × DPR con `ctx.scale`, e non disegnare quando non
 *    si vede. ⇒ `creaAnteprimaScena` fa i tre e aggiunge il tetto a 30 fps del pacchetto.
 *  · (11/09) Setproduct «Radio button UI design» e l'esempio W3C `role="radiogroup"`: un gruppo di
 *    scelte esclusive vuole `role="radiogroup"` + `role="radio"` con `aria-checked`, UN SOLO
 *    elemento raggiungibile col Tab (roving tabindex) e le frecce che spostano la scelta; e la
 *    selezione non può essere affidata al solo colore (qui c'è anche il segno di spunta).
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

/* ------------------------------------------------------- la prosa del mockup, e solo la prosa */

/**
 * ⛔ QUESTA TABELLA NON CONTIENE UN COLORE NÉ UN NOME DI TEMA — di proposito.
 *   È la copia editoriale del mockup (`atelierThemes`, righe 6263-6277): come si chiama la scena,
 *   di che «materiale» è fatta la tavolozza e la frase che la descrive. Le tre cose non esistono
 *   da nessun'altra parte nel prodotto: toglierle vorrebbe dire che lo studio mostra quattordici
 *   pallini senza dire che cosa distingue una atmosfera dall'altra.
 *   ⛔ I nomi restano `nomiTemi()` (contratto dei controlli) e i colori restano `temi.css`. Se un
 *     giorno nascesse un quindicesimo tema e qui mancasse, `descrizioneTema` risponde con una
 *     scheda onesta invece di lasciare tre campi vuoti (provato al verso contrario).
 */
export const DESCRIZIONI_TEMI = Object.freeze({
  calm: { scena: 'Orizzonte e filamento', materiale: 'Grafite / bronzo', testo: 'Un campo quasi immobile, un orizzonte e un solo filamento di bronzo. Il vuoto resta parte della composizione.' },
  forge: { scena: 'Forgia e impulsi', materiale: 'Acciaio / rame', testo: 'Guide meccaniche, ingranaggi e un grafo diretto attraversato da impulsi. La composizione originale del mobile, nello spazio desktop.' },
  paper: { scena: 'Pagina e marginalia', materiale: 'Carta / inchiostro', testo: 'Fibre, registri tipografici e annotazioni marginali. La luce attraversa la pagina senza trasformarla in una griglia decorativa.' },
  terminal: { scena: 'Manoscritto al fosforo', materiale: 'Fosforo / nero', testo: 'Flussi di glifi a cadenza indipendente, tracce e fosforo. Non una pioggia uniforme: ogni colonna ha il proprio ritmo.' },
  aurora: { scena: 'Tende magnetiche', materiale: 'Notte / luce fredda', testo: 'Raggi verticali, pieghe magnetiche e stelle sparse. Il colore proviene dalla palette attiva, non da un’immagine fissa.' },
  glacier: { scena: 'Ghiaccio e rifrazione', materiale: 'Ghiaccio / cobalto', testo: 'Faccette traslucide e crepacci direzionali: il movimento è una lenta rifrazione, non una rotazione di particelle.' },
  ember: { scena: 'Convezione e braci', materiale: 'Carbone / brace', testo: 'Colonne di calore, braci in risalita e aloni diffusi. Uno sfondo vivo, contenuto ai margini della lettura.' },
  atlas: { scena: 'Rilievi e rotte', materiale: 'Blu profondo / rame', testo: 'Curve di livello, una griglia cartografica e un percorso fra punti rilevati. L’insieme mantiene una lettura topografica.' },
  noir: { scena: 'Diaframma e luce radente', materiale: 'Nero / argento', testo: 'Lamelle, tagli di luce e un diaframma fotografico. Contrasto netto e pochi segni, senza aggiungere cromie al tema.' },
  signal: { scena: 'Portanti e acquisizione', materiale: 'Grafite / corallo', testo: 'Tracce indipendenti, brevi interruzioni e scansione radar. Sono motivi visivi, non misure di rete o del modello.' },
  violet: { scena: 'Orbita parametrica', materiale: 'Indaco / ametista', testo: 'Una curva continua, orbite non coincidenti e nodi sparsi. Il dettaglio si sviluppa senza riempire tutto lo spazio.' },
  claudius: { scena: 'Manoscritto annotato', materiale: 'Carta calda / argilla', testo: 'Masse tipografiche, parentesi editoriali e fili di annotazione. Il ritmo è quello di una pagina riletta con attenzione.' },
  basicus: { scena: 'Moduli e propagazione', materiale: 'Neutro / blu', testo: 'Moduli geometrici e un’onda che ne attraversa i confini. Una composizione spaziale, non un secondo pannello di controlli.' },
  telemetry: { scena: 'Strumenti e registri', materiale: 'Grafite / ciano', testo: 'Quadranti, righelli e cursori sottili. Le forme sono decorative: non rappresentano statistiche del dispositivo.' },
});

export function descrizioneTema(id, semi) {
  const scheda = DESCRIZIONI_TEMI[id];
  if (scheda) return scheda;
  /* ⛔ Verso contrario: un tema che il contratto dichiara e la prosa non conosce non lascia vuoti
     e non inventa un materiale — dice quello che sa (chiara o scura, dal seme) e nomina la scena
     con il proprio id, che è quello che il renderer userà davvero. */
  return {
    scena: id,
    materiale: temaChiaro(semi) ? 'Tavolozza chiara' : 'Tavolozza scura',
    testo: 'Questa tavolozza non ha ancora una descrizione scritta. I colori qui sotto sono quelli veri, letti dal foglio dei temi.',
  };
}

/* ------------------------------------------------------------------ i controlli che vivono qui */

/**
 * Le preferenze che dal 12/09 abitano lo STUDIO e non più le Impostazioni.
 * ⛔ Sono solo quelle del TEMA e dello SFONDO ANIMATO, per ordine esplicito dell'owner: densità
 *   delle liste, dimensione interfaccia, testo chat e forma del composer RESTANO in Impostazioni.
 * ⛔ `interfaceMotion`, `reducedMotion`, `pauseWhenHidden` e `respectDataSaver` restano anche loro:
 *   riguardano tutta la app (e l'accessibilità), non l'atmosfera di un tema.
 */
export const CONTROLLI_MIGRATI = Object.freeze([
  'themePresetSelect', 'colorModeSelect',
  'backgroundMotionToggle', 'sceneOverrideSelect', 'motionModeSelect', 'motionQualitySelect',
  'motionSpeedRange', 'motionIntensityRange', 'motionGlowRange', 'motionDensityRange',
  'motionDepthRange', 'motionTrailsRange', 'motionContrastRange', 'motionParallaxRange',
]);

/** Gli otto cursori della scena, nell'ordine in cui il renderer li nomina. */
export const CURSORI_SCENA = Object.freeze([
  'motionIntensityRange', 'motionContrastRange', 'motionSpeedRange', 'motionDensityRange',
  'motionGlowRange', 'motionDepthRange', 'motionTrailsRange', 'motionParallaxRange',
]);

/**
 * I titoli che il controllo porta DENTRO lo studio.
 * ⛔ Non è un capriccio: nel contratto delle Impostazioni `backgroundMotionToggle` si chiama
 *   «Sfondo attivo» e `sceneOverrideSelect` «Sfondo animato» — due nomi quasi uguali che là
 *   stavano in due gruppi diversi e qui finiscono a dieci centimetri l'uno dall'altro, sotto un
 *   titolo che dice già «Sfondo animato». Visto nella prima foto: due righe accanto, una dice
 *   «attivo» e l'altra «animato», e nessuna delle due dice cosa fa.
 * ⛔ E «Renderer» è un nome tecnico a schermo (regola owner 04/09).
 *   ⇒ Cambia SOLO l'etichetta visibile in questo pannello: l'id, la chiave salvata e il titolo
 *     nelle Impostazioni restano quelli del contratto.
 */
export const TITOLI_STUDIO = Object.freeze({
  backgroundMotionToggle: 'Attivo dietro la chat',
  sceneOverrideSelect: 'Scena',
  motionModeSelect: 'Modo di disegno',
});

/**
 * Centra una voce dentro il SUO contenitore scorrevole, senza toccare gli antenati.
 * Torna quanto ha spostato (0 se non c'è niente da fare o mancano le misure, come in Node).
 */
export function centraNellElenco(contenitore, voce) {
  if (!contenitore || !voce || typeof voce.getBoundingClientRect !== 'function') return 0;
  const c = contenitore.getBoundingClientRect(); const v = voce.getBoundingClientRect();
  if (!c.height || !v.height) return 0;
  const spostamento = (v.top - c.top) - (c.height - v.height) / 2;
  const prima = contenitore.scrollTop;
  contenitore.scrollTop = Math.max(0, prima + spostamento);
  return contenitore.scrollTop - prima;
}

/** La scheda del contratto per un id di controllo: titolo, opzioni, minimo e massimo. */
export function campoDi(id, campi = CAMPI_IMPOSTAZIONI) {
  return campi.find((c) => c.id === id) || null;
}

/** Il titolo da mostrare nello studio: quello riscritto se c'è, altrimenti quello del contratto. */
export function titoloStudio(id, campi = CAMPI_IMPOSTAZIONI) {
  return TITOLI_STUDIO[id] || campoDi(id, campi)?.titolo || id;
}

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

/** Il valore che il controllo vero ha ADESSO — lo studio non tiene una seconda copia dello stato. */
export function valoreAspetto(id, doc = globalThis.document) {
  const controllo = doc.getElementById(id) || doc.getElementById(`setting-${id}`);
  if (!controllo) return null;
  return controllo.type === 'checkbox' ? Boolean(controllo.checked) : String(controllo.value ?? '');
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

/* --------------------------------------------------------------- il motore dell'anteprima viva */

/**
 * Quale scena disegna un dato aspetto.
 * ⛔ Stessa regola di `currentConfig()` in `motion/desktop-background.js`: `sceneOverride` vince se
 *   nomina una scena vera, altrimenti la scena È il tema, e se nemmeno quello esiste si torna a
 *   `calm`. Riscritta qui perché quel file non esporta la funzione — non perché sia un'altra regola.
 */
export function scenaPerAspetto({ tema, scena }, disponibili) {
  const esiste = (id) => (disponibili ? disponibili.has?.(id) ?? disponibili.includes?.(id) : Boolean(id));
  if (scena && scena !== 'follow-theme' && esiste(scena)) return scena;
  if (tema && esiste(tema)) return tema;
  return 'calm';
}

/**
 * I ruoli della tavolozza che le scene chiedono, e il token vivo da cui ciascuno si legge.
 * ⛔ Copia dei NOMI, non dei colori: i valori li dà `temi.css` attraverso la radice.
 */
export const RUOLI_PALETTE = Object.freeze({
  accent: ['--talos-accent', '#c08b3c'],
  secondary: ['--talos-secondary', '#8e9095'],
  border_strong: ['--talos-border-strong', '#4a4b50'],
  surface_elevated: ['--talos-window-bg', '#34353a'],
  background: ['--talos-background', '#1e1f22'],
  focus: ['--talos-ring', '#d8a650'],
  info: ['--talos-info', '#7f9fc4'],
  success: ['--talos-success', '#77a884'],
  warning: ['--talos-warning', '#d8a650'],
  danger: ['--talos-danger', '#d87d72'],
});

/**
 * I parametri della scena, letti dove il renderer li legge: le variabili `--talos-motion-*` che
 * `applicaAspettoDesktop` stampa sulla radice (frazioni 0-1, moltiplicate per 100).
 * ⛔ NON si leggono dai cursori: se domani un altro pezzo di app cambiasse quelle variabili,
 *   l'anteprima mostrerebbe ancora il numero del cursore e mentirebbe.
 */
export const PARAMETRI_SCENA = Object.freeze({
  speed: ['--talos-motion-speed', 1, 10, 240],
  intensity: ['--talos-motion-intensity', 0.2, 0, 100],
  glow: ['--talos-motion-glow', 0.1, 0, 100],
  density: ['--talos-motion-density', 1, 25, 150],
  depth: ['--talos-motion-depth', 0.92, 0, 100],
  trails: ['--talos-motion-trails', 0.5, 0, 100],
  contrast: ['--talos-motion-contrast', 0.8, 0, 100],
  parallax: ['--talos-motion-parallax', 0, 0, 100],
});

const limita = (v, min, max) => Math.max(min, Math.min(max, v));

export function parametriScena(stile) {
  const fuori = {};
  for (const [nome, [proprieta, ripiego, min, max]] of Object.entries(PARAMETRI_SCENA)) {
    const grezzo = Number.parseFloat(stile?.getPropertyValue?.(proprieta) ?? '');
    fuori[nome] = limita((Number.isFinite(grezzo) ? grezzo : ripiego) * 100, min, max);
  }
  return fuori;
}

/**
 * Lo stato dell'anteprima, in una funzione sola perché sia provabile senza un canvas.
 * L'ordine conta: la preferenza di accessibilità viene PRIMA di tutto il resto.
 */
export function statoAnteprima({ ridotto = false, modo = 'adaptive', pausa = false, nascosto = false } = {}) {
  if (ridotto) return 'reduced';
  if (modo === 'off' || modo === 'static') return 'renderer-fermo';
  if (pausa) return 'paused';
  if (nascosto) return 'static';
  return 'animating';
}

export const TESTO_STATO = Object.freeze({
  reduced: 'Movimento ridotto',
  'renderer-fermo': 'Renderer fermo',
  paused: 'Fotogramma fermo',
  static: 'Fermo',
  animating: 'Anteprima animata',
  assente: 'Scena non disponibile',
});

/** Le scene del pacchetto, caricate solo quando servono davvero (in Node non si toccano). */
let sceneCaricate = null;
export async function caricaScene() {
  if (sceneCaricate) return sceneCaricate;
  const gia = globalThis.TalosMobileScenes;
  if (Array.isArray(gia) && gia.length) { sceneCaricate = new Map(gia.map((s) => [s.id, s])); return sceneCaricate; }
  try {
    const modulo = await import('../motion/desktop-scenes.js');
    sceneCaricate = new Map((modulo.TALOS_DESKTOP_SCENES || []).map((s) => [s.id, s]));
  } catch {
    /* ⛔ Il pacchetto delle scene può mancare (un documento di prova, un bundle parziale): lo studio
       resta utile — colori, nomi e controlli — e la didascalia lo DICE invece di mostrare un buco. */
    sceneCaricate = new Map();
  }
  return sceneCaricate;
}

const RIDOTTO_QUERY = '(prefers-reduced-motion: reduce)';
export function movimentoRidotto(doc = globalThis.document) {
  if (doc?.documentElement?.classList?.contains('reduce-motion')) return true;
  if (doc?.body?.classList?.contains('reduce-motion')) return true;
  return Boolean(globalThis.matchMedia?.(RIDOTTO_QUERY)?.matches);
}

/**
 * Un colore DICHIARATO diventa un colore VERO.
 * ⛔ `getPropertyValue('--talos-accent')` restituisce il token come è scritto, non il colore: sui
 *   dieci temi che derivano l'accento con `color-mix()` il pannello scriveva
 *   `color-mix(in srgb, #c98b32 …)` sotto «Accento applicato» — una formula al posto di un colore,
 *   e `fillStyle` non l'avrebbe nemmeno accettata. Trovato nella tabella dei quattordici temi, non
 *   nel codice. Stessa cura del mockup (`channelColor`, riga 6280): lo fa risolvere al browser su
 *   un elemento invisibile.
 * ⛔ Se il valore non è un colore, `style.color` resta vuoto: si dice il ripiego, non si inventa.
 */
let sondaColore = null;
export function risolviColore(grezzo, doc = globalThis.document, ripiego = '') {
  const valore = String(grezzo || '').trim();
  if (!valore) return ripiego;
  if (!doc?.body || !doc.createElement) return ripiego || valore;
  if (!sondaColore || !sondaColore.isConnected || sondaColore.ownerDocument !== doc) {
    sondaColore = doc.createElement('span');
    sondaColore.setAttribute('aria-hidden', 'true');
    sondaColore.style.cssText = 'position:fixed;left:-10000px;top:-10000px;visibility:hidden;pointer-events:none;';
    doc.body.append(sondaColore);
  }
  sondaColore.style.color = '';
  sondaColore.style.color = valore;
  if (!sondaColore.style.color) return ripiego || valore;
  const calcolato = (doc.defaultView || globalThis).getComputedStyle?.(sondaColore)?.color || '';
  return normalizzaColore(calcolato, doc) || ripiego || valore;
}

/**
 * ⛔ SECONDO GIRO, E SERVIVA: risolto il token, Chromium restituisce `rgb(201, 139, 50)` quando il
 *   tema dichiara un esadecimale, ma `color(srgb 0.438824 0.316392 0.143137)` quando lo deriva con
 *   `color-mix()` — cioè su DIECI temi su quattordici in modo chiaro. Sotto «Accento applicato»
 *   l'owner avrebbe letto sei decimali al posto di un colore. Trovato nella tabella dei quattordici,
 *   non guardando il codice: in scuro la stessa riga era giusta.
 *   ⇒ un canvas 1×1 riporta qualunque notazione a tre numeri interi, che è la forma del mockup.
 */
let telaColore = null;
export function normalizzaColore(calcolato, doc = globalThis.document) {
  const valore = String(calcolato || '').trim();
  if (!valore) return '';
  try {
    if (!telaColore) {
      telaColore = doc.createElement('canvas');
      telaColore.width = 1; telaColore.height = 1;
    }
    const ctx = telaColore.getContext('2d', { willReadFrequently: true });
    if (!ctx) return valore;
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = '#000';
    ctx.fillStyle = valore;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
    return a === 255 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${Math.round((a / 255) * 100) / 100})`;
  } catch {
    return valore;
  }
}

const FPS_ANTEPRIMA = 30;
const DPR_MASSIMO = 1.5;
const SEME_SCENA = 730913; // lo stesso del pacchetto: due anteprime della stessa scena si somigliano

/**
 * Un canvas che disegna una scena del pacchetto dentro il riquadro dello studio.
 *
 * @param {Element} contenitore il riquadro (`.td-theme-preview`)
 * @param {{document?:Document, scene?:Map, seme?:number}} opzioni
 * @returns {{aggiorna:Function, alterna:Function, stato:Function, inPausa:Function, ferma:Function}|null}
 */
export function creaAnteprimaScena(contenitore, { document: doc = globalThis.document, scene = new Map(), seme = SEME_SCENA } = {}) {
  if (!contenitore) return null;
  /* ⛔ Le scene arrivano da un `import()` che finisce DOPO l'apertura della modale: il riquadro
     nasce vuoto e le riceve quando ci sono. Passarle solo al momento della creazione lasciava
     l'anteprima a «Scena non disponibile» per sempre — trovato dalla prima foto, non dal codice. */
  let catalogo = scene;
  const canvas = doc.createElement('canvas');
  canvas.className = 'td-preview-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  const contesto = canvas.getContext?.('2d', { alpha: true });
  if (!contesto) return null;
  contenitore.prepend(canvas);

  /* Un colore dichiarato come `color-mix(...)` non si può dare a `fillStyle`: passa dal
     risolutore comune, lo stesso che riempie «Accento applicato». */
  const colore = (grezzo, ripiego) => risolviColore(grezzo, doc, ripiego);

  const statoLocale = { definizione: null, scena: '', dati: null, geometria: null, ingresso: null, larghezza: 1, altezza: 1, dpr: 1, pausa: false, viva: true };
  let raf = 0;
  let ultimo = 0;

  function tavolozza() {
    const vista = doc.defaultView || globalThis;
    const stileRadice = vista.getComputedStyle?.(doc.documentElement);
    const fuori = {};
    for (const [ruolo, [proprieta, ripiego]] of Object.entries(RUOLI_PALETTE)) {
      fuori[ruolo] = colore(stileRadice?.getPropertyValue?.(proprieta)?.trim(), ripiego);
    }
    return fuori;
  }

  function ingressoScena() {
    const vista = doc.defaultView || globalThis;
    const stileRadice = vista.getComputedStyle?.(doc.documentElement);
    const tav = tavolozza();
    return {
      viewport: { width: statoLocale.larghezza, height: statoLocale.altezza },
      palette: { dark: tav, light: tav },
      colorMode: doc.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark',
      parameters: parametriScena(stileRadice),
      effectiveQuality: { tier: 'balanced', densityScale: 1 },
    };
  }

  function misura() {
    const rettangolo = contenitore.getBoundingClientRect?.() || { width: 0, height: 0 };
    statoLocale.larghezza = Math.max(1, rettangolo.width);
    statoLocale.altezza = Math.max(1, rettangolo.height);
    const dpr = Math.max(0.5, Math.min((doc.defaultView || globalThis).devicePixelRatio || 1, DPR_MASSIMO));
    statoLocale.dpr = dpr;
    const larghezzaPixel = Math.max(1, Math.round(statoLocale.larghezza * dpr));
    const altezzaPixel = Math.max(1, Math.round(statoLocale.altezza * dpr));
    if (canvas.width !== larghezzaPixel) canvas.width = larghezzaPixel;
    if (canvas.height !== altezzaPixel) canvas.height = altezzaPixel;
  }

  function disegna(passoMs) {
    if (!statoLocale.definizione) return;
    try {
      if (passoMs > 0) statoLocale.definizione.update({ state: statoLocale.dati, input: statoLocale.ingresso, stepMs: passoMs });
      contesto.setTransform(statoLocale.dpr, 0, 0, statoLocale.dpr, 0, 0);
      statoLocale.definizione.draw({ context: contesto, state: statoLocale.dati, geometry: statoLocale.geometria });
      canvas.dataset.sceneStatus = statoAttuale();
      canvas.dataset.scene = statoLocale.scena;
    } catch {
      /* Una scena che lancia non deve portarsi dietro la modale: si ferma quella, non lo studio. */
      statoLocale.definizione = null;
      contesto.clearRect(0, 0, statoLocale.larghezza, statoLocale.altezza);
      canvas.dataset.sceneStatus = 'error';
    }
  }

  function statoAttuale() {
    if (!statoLocale.definizione) return 'assente';
    return statoAnteprima({
      ridotto: movimentoRidotto(doc),
      modo: doc.documentElement.getAttribute('data-talos-motion-mode') || 'adaptive',
      pausa: statoLocale.pausa,
      nascosto: Boolean(doc.hidden),
    });
  }

  function deveAnimare() { return statoAttuale() === 'animating'; }

  function giro(ora) {
    raf = 0;
    if (!statoLocale.viva) return;
    if (!deveAnimare()) { ultimo = 0; return; }
    const trascorso = ultimo ? ora - ultimo : 1000 / FPS_ANTEPRIMA;
    if (trascorso >= 1000 / FPS_ANTEPRIMA - 1) { ultimo = ora; disegna(Math.min(50, trascorso)); }
    raf = (doc.defaultView || globalThis).requestAnimationFrame(giro);
  }

  function programma() {
    const vista = doc.defaultView || globalThis;
    if (raf) vista.cancelAnimationFrame(raf);
    raf = 0;
    ultimo = 0;
    if (statoLocale.viva && deveAnimare()) raf = vista.requestAnimationFrame(giro);
  }

  function aggiorna({ scena } = {}) {
    if (!statoLocale.viva) return statoAttuale();
    misura();
    const definizione = catalogo.get?.(scena) || null;
    const cambiata = definizione !== statoLocale.definizione;
    statoLocale.definizione = definizione;
    statoLocale.scena = definizione ? scena : '';
    if (!definizione) {
      contesto.clearRect(0, 0, canvas.width, canvas.height);
      canvas.dataset.sceneStatus = 'assente';
      return 'assente';
    }
    if (cambiata || !statoLocale.dati) statoLocale.dati = definizione.createState(seme);
    statoLocale.ingresso = ingressoScena();
    statoLocale.geometria = definizione.prepare({ state: statoLocale.dati, input: statoLocale.ingresso }).geometry;
    disegna(0);
    programma();
    return statoAttuale();
  }

  /* MDN «Optimizing canvas» (25/08/2026): non disegnare quando non si vede. Il giro si ferma da
     solo su `doc.hidden`, e questo lo fa ripartire quando la finestra torna davanti. */
  const suVisibilita = () => { if (!doc.hidden) { disegna(0); programma(); } else programma(); };
  doc.addEventListener?.('visibilitychange', suVisibilita);
  /* La modale si allarga con la finestra: il canvas va rimisurato, o resta sgranato o tagliato. */
  let osservatore = null;
  const Osserva = (doc.defaultView || globalThis).ResizeObserver;
  if (typeof Osserva === 'function') {
    osservatore = new Osserva(() => { if (statoLocale.viva && statoLocale.definizione) aggiorna({ scena: statoLocale.scena }); });
    osservatore.observe(contenitore);
  }

  return {
    canvas,
    aggiorna,
    impostaScene(mappa) { catalogo = mappa || new Map(); },
    stato: statoAttuale,
    inPausa: () => statoLocale.pausa,
    alterna() { statoLocale.pausa = !statoLocale.pausa; disegna(0); programma(); return statoLocale.pausa; },
    ferma() {
      statoLocale.viva = false;
      const finestra = doc.defaultView || globalThis;
      if (raf) finestra.cancelAnimationFrame(raf);
      raf = 0;
      osservatore?.disconnect();
      doc.removeEventListener?.('visibilitychange', suVisibilita);
      canvas.remove();
    },
  };
}

/* ------------------------------------------------------------------------- costruttori di nodi */

function nodo(doc, tag, classe, testo) {
  const el = doc.createElement(tag);
  if (classe) el.className = classe;
  if (testo !== undefined && testo !== null) el.textContent = String(testo);
  return el;
}

function icona(doc, nome) {
  const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const use = doc.createElementNS('http://www.w3.org/2000/svg', 'use');
  svg.setAttribute('class', 'i');
  svg.setAttribute('aria-hidden', 'true');
  use.setAttribute('href', `#i-${nome}`);
  svg.append(use);
  return svg;
}

/**
 * La mini-conversazione dentro l'anteprima.
 * ⛔ IL MOCKUP NON CE L'HA: il suo riquadro mostra la sola scena, e accanto offre «Prova nella chat
 *   vuota», che porta a una schermata dimostrativa. Qui quella schermata non esiste (la Chat è
 *   quella vera, con le sessioni dell'owner) e aprirla per far vedere un tema sarebbe una
 *   navigazione a vuoto. ⇒ la domanda a cui quel pulsante rispondeva — «come sarà la MIA chat con
 *   questo tema?» — trova risposta dentro il riquadro: bolle, testo e pulsante d'invio disegnati
 *   con i token veri (`--talos-*`), che la radice sta già dipingendo col tema scelto.
 * ⛔ `inert`: è una figura, non una interfaccia. Non prende fuoco, non entra nel Tab e non si legge
 *   come una conversazione vera a chi usa uno screen reader.
 */
function miniConversazione(doc) {
  const scena = nodo(doc, 'div', 'td-mini');
  scena.setAttribute('inert', '');
  scena.setAttribute('aria-hidden', 'true');

  const risposta = nodo(doc, 'div', 'td-mini-riga');
  risposta.append(nodo(doc, 'span', 'td-mini-avatar'));
  const bollaRisposta = nodo(doc, 'div', 'td-mini-bolla td-mini-bolla--assistente');
  bollaRisposta.append(
    nodo(doc, 'span', 'td-mini-linea', 'Ho letto il repository: sono 104 file sotto harness-ui.'),
    nodo(doc, 'span', 'td-mini-linea td-mini-linea--corta'),
  );
  risposta.append(bollaRisposta);

  const domanda = nodo(doc, 'div', 'td-mini-riga td-mini-riga--utente');
  domanda.append(nodo(doc, 'div', 'td-mini-bolla td-mini-bolla--utente', 'Riassumi il progetto'));

  const composer = nodo(doc, 'div', 'td-mini-composer');
  composer.append(nodo(doc, 'span', 'td-mini-placeholder', 'Scrivi a TALOS'));
  const invio = nodo(doc, 'span', 'td-mini-invio');
  invio.append(icona(doc, 'send'));
  composer.append(invio);

  scena.append(risposta, domanda, composer);
  return scena;
}

/* ------------------------------------------------------------------------- la modale vera */

export function apriStudioTemi({ document: doc = globalThis.document } = {}) {
  const temi = nomiTemi();
  const semi = leggiSemiTemi(doc);
  let { tema: scelto, modo } = aspettoCorrente(doc);
  if (!temi.some((t) => t.id === scelto)) scelto = temi[0]?.id || 'calm';

  const studio = nodo(doc, 'div', 'td-theme-studio');

  /* ---------------------------------------------------------------- colonna sinistra: i 14 temi */
  const elenco = nodo(doc, 'div', 'td-theme-list');
  elenco.setAttribute('role', 'radiogroup');
  elenco.setAttribute('aria-label', 'Tema dell’interfaccia');

  /* ---------------------------------------------------------------- colonna destra: la scheda */
  const destra = nodo(doc, 'div', 'td-theme-display');
  const testa = nodo(doc, 'div', 'td-theme-testa');
  const titolo = nodo(doc, 'h3', '', '');
  const descrizione = nodo(doc, 'p', '', '');
  testa.append(titolo, descrizione);

  const anteprima = nodo(doc, 'div', 'td-theme-preview');
  const mini = miniConversazione(doc);
  const didascalia = nodo(doc, 'div', 'td-preview-caption');
  const didascaliaScena = nodo(doc, 'span', '', '');
  const didascaliaStato = nodo(doc, 'span', '', '');
  didascalia.append(didascaliaScena, didascaliaStato);
  anteprima.append(mini, didascalia);
  /* La mensola tiene l'anteprima in vista mentre si trascinano i cursori otto righe più sotto:
     un cursore che si muove senza mostrare l'effetto non è un'anteprima. */
  const mensola = nodo(doc, 'div', 'td-theme-mensola');
  mensola.append(anteprima);

  /* --------------------------------------------------- riga dei controlli: modo colore e pausa */
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
  const pausa = nodo(doc, 'button', 'td-studio-button', 'Ferma anteprima');
  pausa.type = 'button';
  pausa.addEventListener('click', () => { vista?.alterna(); aggiorna(); });
  controlli.append(segmento, pausa);

  /* ---------------------------------------------------- i controlli migrati dalle Impostazioni */
  const cursori = [];
  const interruttori = [];
  const selettori = [];

  function rigaControllo(id, { compatta = false } = {}) {
    const campo = campoDi(id);
    if (!campo) return null;
    const riga = nodo(doc, 'div', compatta ? 'td-studio-riga td-studio-riga--compatta' : 'td-studio-riga');
    riga.dataset.studioControllo = id;
    const etichetta = nodo(doc, 'label', 'td-studio-etichetta', titoloStudio(id));
    const idLocale = `td-studio-${id}`;
    etichetta.htmlFor = idLocale;
    riga.append(etichetta);

    if (campo.tipo === 'checkbox') {
      const box = doc.createElement('input');
      box.type = 'checkbox';
      box.id = idLocale;
      box.className = 'talos-switch';
      box.setAttribute('role', 'switch');
      box.addEventListener('change', () => { impostaAspetto(id, box.checked, doc); aggiorna(); });
      riga.append(box);
      interruttori.push({ id, elemento: box });
    } else if (campo.tipo === 'select') {
      const select = doc.createElement('select');
      select.id = idLocale;
      select.className = 'talos-select';
      for (const [valore, nome] of campo.opzioni || []) {
        const op = nodo(doc, 'option', '', nome);
        op.value = valore;
        select.append(op);
      }
      select.addEventListener('change', () => { impostaAspetto(id, select.value, doc); aggiorna(); });
      riga.append(select);
      selettori.push({ id, elemento: select });
    } else {
      const contenitore = nodo(doc, 'div', 'td-studio-cursore');
      const cursore = doc.createElement('input');
      cursore.type = 'range';
      cursore.id = idLocale;
      cursore.min = String(campo.min ?? 0);
      cursore.max = String(campo.max ?? 100);
      /* MDN «<input type=range>» (10/09/2026): il valore corrente si mostra con un `<output>`
         aggiornato su `input`, che è anche l'evento che `legacy/app.js` ascolta per i cursori. */
      const uscita = doc.createElement('output');
      uscita.htmlFor = idLocale;
      uscita.className = 'talos-mono';
      cursore.addEventListener('input', () => {
        uscita.value = cursore.value;
        uscita.textContent = cursore.value + (campo.unita || '');
        impostaAspetto(id, cursore.value, doc);
        aggiorna({ soloNumeri: true });
      });
      contenitore.append(cursore, uscita);
      riga.append(contenitore);
      cursori.push({ id, elemento: cursore, uscita, unita: campo.unita || '' });
    }
    return riga;
  }

  function gruppo(titoloGruppo, ids, { compatta = false } = {}) {
    const sezione = nodo(doc, 'section', 'td-studio-gruppo');
    sezione.append(nodo(doc, 'h4', '', titoloGruppo));
    const righe = nodo(doc, 'div', compatta ? 'td-studio-righe td-studio-righe--due' : 'td-studio-righe');
    for (const id of ids) { const riga = rigaControllo(id, { compatta }); if (riga) righe.append(riga); }
    sezione.append(righe);
    return sezione;
  }

  const gruppoSfondo = gruppo('Sfondo animato', ['backgroundMotionToggle', 'sceneOverrideSelect', 'motionModeSelect', 'motionQualitySelect'], { compatta: true });
  const gruppoCursori = gruppo('La scena, cursore per cursore', CURSORI_SCENA, { compatta: true });

  /* ⛔ «Ripristina» NON è per singolo cursore, ed è una scelta, non una dimenticanza: i valori
     iniziali vivono in `DESKTOP_APPEARANCE_DEFAULTS` dentro `legacy/app.js`, che non li esporta.
     Riscriverli qui sarebbe la stessa colpa della quindicesima tavolozza, con i numeri al posto
     dei colori — e il giorno che l'owner ne cambiasse uno, lo studio mentirebbe. ⇒ qui si preme il
     pulsante della app (`#resetMotionButton`), che è l'unico posto dove quei valori sono scritti. */
  const ripristina = nodo(doc, 'button', 'td-studio-button', 'Ripristina i valori del movimento');
  ripristina.type = 'button';
  ripristina.addEventListener('click', () => {
    const vero = doc.getElementById('resetMotionButton');
    if (vero) { vero.click(); leggiDaiControlliVeri(); aggiorna(); }
  });
  gruppoCursori.append(ripristina);

  /* ------------------------------------------------------------------- i tre dati del mockup */
  const dettagli = nodo(doc, 'div', 'td-theme-details');
  const datiTema = ['Materiale', 'Accento applicato', 'Raggio delle schede'].map((nome) => {
    const box = nodo(doc, 'div');
    box.append(nodo(doc, 'span', '', nome));
    const valore = nodo(doc, 'strong', '', '—');
    box.append(valore);
    dettagli.append(box);
    return valore;
  });

  const nota = nodo(doc, 'p', 'td-theme-note', 'La scena resta fuori dal testo: qui puoi esplorarla in movimento. Il tema si applica subito, senza chiudere il pannello e senza spostare la selezione.');

  /* Il `<details>` del mockup (riga 6312), con i fatti veri di questa app al posto dei suoi. */
  const approfondimento = nodo(doc, 'details', 'td-theme-note');
  approfondimento.append(nodo(doc, 'summary', '', 'Porting, qualità e accessibilità'));
  approfondimento.append(nodo(doc, 'p', '', '14 composizioni Canvas portate dal mobile 355dc8e; la tavolozza è quella del desktop, letta dal foglio dei temi. L’anteprima è indipendente dall’accensione dello sfondo nella Chat. Con «Riduci movimento» il tempo si ferma e resta il fotogramma a colori; fuori vista il disegno si sospende. Un tetto di trenta fotogrammi al secondo e di pixel contiene il costo, senza dichiarare prestazioni del dispositivo.'));

  const azioni = nodo(doc, 'div', 'td-theme-actions');
  const vaiAImpostazioni = nodo(doc, 'button', 'td-studio-button', 'Tutte le impostazioni dell’aspetto');
  vaiAImpostazioni.type = 'button';
  vaiAImpostazioni.addEventListener('click', () => {
    chiudiModale();
    doc.getElementById('setting-tab-appearance')?.click();
  });
  azioni.append(vaiAImpostazioni);

  destra.append(testa, mensola, controlli, gruppoSfondo, gruppoCursori, dettagli, nota, approfondimento, azioni);
  studio.append(elenco, destra);

  /* ------------------------------------------------------------------------ le quattordici voci */
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

  /* --------------------------------------------------------------------------- la regia */
  let vista = null;
  let scene = new Map();

  /** I widget dello studio non tengono uno stato proprio: si rileggono dai controlli veri. */
  function leggiDaiControlliVeri() {
    for (const { id, elemento } of interruttori) elemento.checked = Boolean(valoreAspetto(id, doc));
    for (const { id, elemento } of selettori) { const v = valoreAspetto(id, doc); if (v !== null) elemento.value = v; }
    for (const { id, elemento, uscita, unita } of cursori) {
      const v = valoreAspetto(id, doc);
      if (v !== null) elemento.value = v;
      uscita.value = elemento.value;
      uscita.textContent = elemento.value + unita;
    }
  }

  function aggiorna({ soloNumeri = false } = {}) {
    const seme = semi.get(scelto);
    const nome = temi.find((t) => t.id === scelto)?.nome || scelto;
    const scheda = descrizioneTema(scelto, seme);
    /* ⛔ «Segue il sistema» non vuol dire «scuro»: il modo vero è quello che la radice sta già
       dipingendo (`data-theme`), e in mancanza lo dice il browser. */
    const modoDisegnato = modo !== 'system' ? modo
      : (doc.documentElement.getAttribute('data-theme') === 'light'
        || globalThis.matchMedia?.('(prefers-color-scheme: light)')?.matches ? 'light' : 'dark');
    if (!soloNumeri) {
      titolo.textContent = nome;
      descrizione.textContent = scheda.testo;
      for (const s of scelte) {
        const attivo = s.id === scelto;
        s.bottone.setAttribute('aria-checked', String(attivo));
        s.bottone.tabIndex = attivo ? 0 : -1;
        s.segno.textContent = attivo ? '✓' : '';
      }
      for (const b of bottoniModo) b.setAttribute('aria-pressed', String(b.dataset.modo === modo));
      leggiDaiControlliVeri();
    }
    const fondo = fondoDelTema(seme, modoDisegnato);
    /* ⛔ «Accento APPLICATO», non «accento dichiarato»: il mockup legge il token vivo
       (`channelColor('--talos-accent')`, riga 6313) e mostra l'rgb che la app sta davvero usando.
       Il seme di `temi.css` è il punto di partenza, non sempre il colore finale (i temi chiari lo
       derivano). Qui si legge la radice; se non si può, si ripiega sul seme e lo si dice. */
    const stileRadice = (doc.defaultView || globalThis).getComputedStyle?.(doc.documentElement);
    const applicato = (proprieta) => stileRadice?.getPropertyValue?.(proprieta)?.trim() || '';
    datiTema[0].textContent = scheda.materiale;
    datiTema[1].textContent = risolviColore(applicato('--talos-accent'), doc, seme?.accento || '') || 'non dichiarato';
    datiTema[2].textContent = applicato('--talos-radius-card') || seme?.raggio || 'non dichiarato';

    const scenaAttiva = scenaPerAspetto({ tema: scelto, scena: valoreAspetto('sceneOverrideSelect', doc) || 'follow-theme' }, scene);
    const stato = vista?.aggiorna({ scena: scenaAttiva }) || 'assente';
    didascaliaScena.textContent = scene.has(scenaAttiva) ? (DESCRIZIONI_TEMI[scenaAttiva]?.scena || scenaAttiva) : scheda.scena;
    didascaliaStato.textContent = TESTO_STATO[stato] || stato;
    pausa.textContent = vista?.inPausa() ? 'Riprendi anteprima' : 'Ferma anteprima';
    pausa.disabled = stato === 'reduced' || stato === 'assente' || stato === 'renderer-fermo';
    anteprima.dataset.stato = stato;
    /* ⛔ NIENTE fondo calcolato qui. Il mockup dipinge il riquadro con `var(--talos-background)`
       (regola 4349) e ha ragione: quello È il colore che la app sta usando in questo istante, non
       una derivazione nostra del seme. Scriverlo a mano voleva dire poter sbagliare di poco su
       quattro temi chiari — e nessuno se ne sarebbe accorto. `fondo` resta la risposta del pallino
       e del riepilogo, dove serve il colore DEL TEMA e non quello della app. */
    void fondo;
  }

  aggiorna();
  /*
   * ⛔ LA RADICE PUÒ CAMBIARE SENZA PASSARE DA QUI — e allora lo studio deve SEGUIRLA, non restare
   *   a raccontare il tema di prima. Il mockup risolve lo stesso problema riscrivendo `applyTheme`
   *   perché chiami `syncThemeChooser()` (riga 6288); qui si guarda l'attributo invece della
   *   funzione, così vale anche per chi cambia tema da un'altra strada (la scorciatoia, un test,
   *   una preferenza di sistema che scatta mentre il pannello è aperto).
   *   ⛔ Nessun anello: `aggiorna()` scrive solo dentro la modale, mai sulla radice.
   */
  let osservatoreRadice = null;
  const modale = apriModale('Temi e atmosfere', studio, {
    document: doc,
    ampia: true,
    /* ⛔ Il canvas muore con la modale: un `requestAnimationFrame` che sopravvive a una finestra
       chiusa è lavoro pagato dalla stessa GPU per disegnare qualcosa che nessuno vede. */
    suChiusura: () => { osservatoreRadice?.disconnect(); vista?.ferma(); vista = null; },
  });
  const Osservatore = (doc.defaultView || globalThis).MutationObserver;
  if (typeof Osservatore === 'function') {
    osservatoreRadice = new Osservatore(() => {
      const corrente = aspettoCorrente(doc);
      if (temi.some((t) => t.id === corrente.tema)) scelto = corrente.tema;
      modo = corrente.modo;
      aggiorna();
    });
    osservatoreRadice.observe(doc.documentElement, { attributes: true, attributeFilter: ['data-talos-theme', 'data-theme', 'data-talos-scene', 'data-talos-motion-mode', 'class', 'style'] });
  }

  /* L'anteprima nasce DOPO l'apertura: finché il `<dialog>` non è aperto è `display:none`, e un
     canvas misurato lì dentro sarebbe 0×0 (stessa ragione per cui l'animazione d'entrata della
     modale sta dopo `showModal()`). */
  vista = creaAnteprimaScena(anteprima, { document: doc });
  caricaScene().then((mappa) => { scene = mappa; vista?.impostaScene(mappa); aggiorna(); }).catch(() => { aggiorna(); });

  /*
   * ⛔ VISTO NELLA FOTO: la modale dà il fuoco al primo controllo utile — cioè a «Forge» — mentre
   *   il tema scelto era «Calm», quattordicesimo e fuori dalla parte visibile dell'elenco. Un
   *   anello di fuoco su una voce e la spunta su un'altra sono due risposte diverse alla stessa
   *   domanda. Qui il fuoco (e lo scorrimento) vanno su quella scelta.
   */
  const sceltaBottone = scelte.find((s) => s.id === scelto)?.bottone;
  sceltaBottone?.focus({ preventScroll: true });
  /* ⛔ 12/09, VISTO SUL 4174: `scrollIntoView({block:'center'})` scorre TUTTI gli antenati che
     possono scorrere, quindi anche il corpo della modale — con «Calm» (ultimo dell'elenco) il corpo
     partiva già scorso di 242 px e titolo e descrizione del tema erano sotto la mensola prima di
     qualunque clic. Qui si scorre SOLO l'elenco, a mano: la voce scelta al centro, il resto fermo. */
  centraNellElenco(elenco, sceltaBottone);
  return modale;
}

/* --------------------------------------------- le Impostazioni: da quattordici righe a un rimando */

/**
 * Nasconde le righe che dal 12/09 abitano lo studio e mette al loro posto UN rimando.
 *
 * ⛔ NASCONDE, non rimuove: i `<select>`, gli interruttori e i cursori veri restano nel documento
 *   perché sono loro a portare la preferenza fino a `localStorage` (`appearanceControlMap` di
 *   `legacy/app.js` ascolta QUEI nodi, e `montaImpostazioni` li ricicla a ogni apertura con
 *   `recupera(campo.id)`). Toglierli spegnerebbe il salvataggio, non lo sposterebbe.
 * ⛔ Anche l'anteprima del pacchetto (`[data-talos-motion-preview]`, montata da
 *   `motion/desktop-background.js` sotto la riga della scena) sparisce dalla pagina: senza i suoi
 *   controlli intorno sarebbe un riquadro orfano, e lo studio ne ha una uguale accanto ai cursori.
 *   Nascosta smette anche di disegnare, perché il pacchetto anima solo le scene visibili.
 * ⛔ DEBITO NOTO: la ricerca delle Impostazioni continua a contare fra i risultati le preferenze
 *   migrate (`filtraImpostazioni` legge il contratto, non il DOM), ma le loro righe restano
 *   nascoste. Il rimando qui sotto nomina tutte e quattordici, così chi cerca «intensità» la trova
 *   a schermo — dentro la scheda che porta allo studio.
 */
export function migraRigheImpostazioni(schermo, { document: doc = globalThis.document } = {}) {
  if (!schermo) return 0;
  let migrate = 0;
  for (const id of CONTROLLI_MIGRATI) {
    const riga = schermo.querySelector(`[data-setting-row="${id}"]`);
    if (!riga || riga.dataset.tdMigrata === 'si') { if (riga) migrate += 1; continue; }
    riga.dataset.tdMigrata = 'si';
    migrate += 1;
  }
  const anteprimaPacchetto = schermo.querySelector('[data-talos-motion-preview]');
  if (anteprimaPacchetto) anteprimaPacchetto.dataset.tdMigrata = 'si';
  return migrate;
}

/**
 * Il rimando che apre lo studio, nelle Impostazioni, al posto della riga «Tema TALOS»
 * (mockup `initAtelier`, riga 6319). Idempotente: `montaImpostazioni` ridisegna le righe a ogni
 * apertura della schermata, e questo va richiamato dopo — se la scheda c'è già non ne nasce una
 * seconda, ma le righe appena ridisegnate vengono rimigrate.
 */
export function montaScorciatoiaTemi(schermo, { document: doc = globalThis.document } = {}) {
  if (!schermo) return null;
  const riga = schermo.querySelector('[data-setting-row="themePresetSelect"]');
  if (!riga) return null;
  migraRigheImpostazioni(schermo, { document: doc });

  const esistente = schermo.querySelector('[data-td-studio-temi]');
  if (esistente) { riga.before(esistente); return esistente; }

  const scheda = nodo(doc, 'section', 'td-studio-rimando');
  scheda.dataset.tdStudioTemi = '';
  const copia = nodo(doc, 'div', 'td-studio-rimando__copia');
  copia.append(nodo(doc, 'h3', '', 'Temi e atmosfere'));
  copia.append(nodo(doc, 'p', '', `Le ${nomiTemi().length} atmosfere, il modo chiaro e scuro, lo sfondo animato e i suoi cursori si scelgono guardandoli, in un pannello solo.`));
  /* ⛔ Una riga di nomi separati da puntini è decorazione; qui serve a FARSI TROVARE: la ricerca
     delle Impostazioni conta ancora fra i risultati le preferenze migrate (legge il contratto, non
     il DOM), e questa è la sola frase a schermo che le nomina tutte. Scritta come una frase, non
     come un elenco tecnico. */
  /* ⛔ 12/09, visto sul 4174: la scheda scriveva «Renderer», cioè il nome tecnico che lo studio
     stesso ha già riscritto in «Modo di disegno» (TITOLI_STUDIO). Stesso nome nei due posti. */
  const nomi = CONTROLLI_MIGRATI.map((id) => titoloStudio(id)).filter(Boolean);
  copia.append(nodo(doc, 'p', 'td-studio-rimando__elenco', `Qui dentro: ${nomi.slice(0, -1).join(', ')} e ${nomi.at(-1)}.`));
  const apri = nodo(doc, 'button', 'td-studio-button primary', 'Apri Temi e atmosfere');
  apri.type = 'button';
  apri.prepend(icona(doc, 'image'));
  apri.addEventListener('click', () => apriStudioTemi({ document: doc }));
  scheda.append(copia, apri);
  riga.before(scheda);
  return scheda;
}
