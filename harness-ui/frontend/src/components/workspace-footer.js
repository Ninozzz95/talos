/*
 * WorkspaceFooter — il piede della sidebar, come nel mockup.
 *
 * Terzo componente della Fase 2. Markup del blocco `data-c="WorkspaceFooter"`:
 *
 *   <div class="talos-sidebar__foot" data-c="WorkspaceFooter">
 *     <span class="talos-avatar"><svg class="glyph"><use href="#glifo"/></svg></span>
 *     <div class="talos-grow">
 *       <div class="talos-sidebar__foot-title">Workspace locale</div>
 *       <div class="talos-sidebar__foot-sub">Tema Calm · locale</div>
 *     </div>
 *     <button class="talos-button talos-button--secondary talos-icon-button" data-c="IconButton" data-vaia="impostazioni" title="Impostazioni (Ctrl ,)">…</button>
 *   </div>
 *
 * ⛔ Le due righe sono DATI del monolite, non testo del mockup:
 *   · titolo = il nome della cartella della sessione aperta (`cartellaAssoluta`,
 *     la verità di RunStarted) o il nome scelto nel foglio «Nuova» prima del
 *     primo giro; senza sessione, «Workspace locale» — che è vero: la app gira
 *     in locale, e non c'è una cartella da nominare;
 *   · sottotitolo = «Tema <preset>» (il preset delle impostazioni desktop,
 *     `themePreset`, chiave del contratto) e, dopo il punto mediano, chi serve
 *     il modello: «locale» per un modello `local:<id>` del runtime locale, il
 *     fornitore per un id `fornitore/modello`; se il modello non lo dice, il
 *     secondo pezzo non si scrive.
 *
 * Ricerca 05/09/2026: in VS Code il piede della barra laterale porta
 * l'account/il workspace e l'ingranaggio delle impostazioni (code.visualstudio.com
 * docs/configure/custom-layout): stessa disposizione del mockup — identità a sinistra, impostazioni a destra.
 */

/* ⛔ BC-61, 17/09 — la mappa id → nome umano dei fornitori è UNA SOLA, ed è già in `fonti-modelli.js`
   (la usa la striscia delle fonti del Laboratorio modelli). Qui si legge, non si ricopia. */
import { nomeFornitore } from './fonti-modelli.js';

/** I preset del tema, con il nome come lo scrive il mockup. */
/*
 * ⛔ 10/09 — TROVATO GUARDANDO UNA FOTO, non cercandolo: con il tema **Violet** applicato (palette
 *   viola a schermo, `data-talos-theme="violet"` sulla radice) il piede della barra diceva
 *   «Tema Calm». Questa mappa ne conosceva **quattro** su quattordici, e il ripiego `|| NOMI_TEMA.calm`
 *   trasformava ogni tema mancante in una BUGIA invece che in un buco visibile: Aurora, Glacier,
 *   Ember, Atlas, Noir, Signal, Violet, Claudius, Basicus e Telemetry si presentavano tutti come Calm.
 * ⛔ La sorgente dei quattordici è `TALOS_THEME_IDS` in `legacy/app.js`: se un giorno ne nasce un
 *   quindicesimo, va aggiunto anche qui — il ripiego resta apposta (un nome mancante non deve far
 *   sparire il piede), ma ora copre solo l'ignoto vero.
 */
export const NOMI_TEMA = Object.freeze({
  forge: 'Forge', paper: 'Paper', terminal: 'Terminal', aurora: 'Aurora', glacier: 'Glacier',
  ember: 'Ember', atlas: 'Atlas', noir: 'Noir', signal: 'Signal', violet: 'Violet',
  claudius: 'Claudius', basicus: 'Basicus', telemetry: 'Telemetry', calm: 'Calm',
});

/** Il nome della cartella da un percorso assoluto (Windows o POSIX), oppure null. */
export function nomeDaPercorso(percorso) {
  if (typeof percorso !== 'string' || percorso.trim() === '') return null;
  const pulito = percorso.trim().replace(/[\\/]+$/u, '');
  // La radice di un disco («C:\») o di un filesystem («/») non ha un nome: si mostra com'è.
  if (/^[A-Za-z]:$/u.test(pulito) || pulito === '') return percorso.trim();
  const ultimo = pulito.split(/[\\/]/u).pop();
  return ultimo && ultimo.trim() ? ultimo.trim() : null;
}

/** Chi serve il modello: «locale» per `local:<id>`, il fornitore per `fornitore/modello`, altrimenti null. */
export function fornitoreDelModello(modello) {
  if (typeof modello !== 'string' || modello.trim() === '') return null;
  if (modello.startsWith('local:')) return 'locale';
  // `~fornitore/modello` è un ALIAS del catalogo (harness-ui/src/model-catalog.mjs): il fornitore è lo stesso.
  const id = modello.replace(/^~/u, '');
  const barra = id.indexOf('/');
  return barra > 0 ? id.slice(0, barra) : null;
}

/*
 * ⭐⭐⭐ BC-61 (17/09/2026) — IL PIEDE SCRIVEVA L'ID GREZZO DEL FORNITORE.
 *
 * Misurato: con `z-ai/glm-5.3-flash` in sessione il piede diceva «Tema Calm · z-ai». Il difetto
 * non è il sottotitolo — «Tema <preset> · <chi serve il modello>» è una scelta del 05/09 — ma il
 * fatto che `fornitoreDelModello` restituisce un ID TECNICO, e la regola dell'owner del 04/09 dice
 * che i nomi tecnici non arrivano mai a schermo, con la mappa in UN POSTO SOLO.
 *
 * ⛔ Il nome NON si decide qui: lo dà `nomeFornitore` in `fonti-modelli.js`, dove sta la mappa che
 *   la striscia delle fonti del Laboratorio modelli usa già. Il primo giro teneva il ponte fra le
 *   grafie in questo file, cioè in casa di chi consuma: il revisore ha misurato che così i tre
 *   fornitori fuori dall'elenco dei DIRETTI (`openrouter`, `ollama`, `local`) restavano senza nome.
 *   Una mappa a metà in due case è peggio di una mappa sola, ed è la stessa lezione di NOMI_TEMA.
 */
/** Le due righe del piede dai dati del monolite. */
export function testiPiede({ cartella, nomeAnteprima, tema, modello } = {}) {
  const titolo = nomeDaPercorso(cartella) || (typeof nomeAnteprima === 'string' && nomeAnteprima.trim()) || 'Workspace locale';
  const nomeTema = NOMI_TEMA[tema] || NOMI_TEMA.calm;
  const fornitore = nomeFornitore(fornitoreDelModello(modello));
  return { titolo, sotto: fornitore ? `Tema ${nomeTema} · ${fornitore}` : `Tema ${nomeTema}` };
}

const SVG_NS = 'http://www.w3.org/2000/svg';
function simbolo(documentObj, classe, nome) {
  const svg = documentObj.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', classe);
  const use = documentObj.createElementNS(SVG_NS, 'use');
  use.setAttribute('href', `#${nome}`);
  svg.append(use);
  return svg;
}

/**
 * Crea il piede. Il pulsante delle impostazioni porta `data-vaia="impostazioni"`
 * come nel mockup: è la regia (portata in app.js) a instradarlo.
 * @param {{cartella?:string|null, nomeAnteprima?:string|null, tema?:string, modello?:string|null}} dati
 * @param {{document?:Document}} opzioni
 */
export function creaWorkspaceFooter(dati = {}, opzioni = {}) {
  const documentObj = opzioni.document || globalThis.document;
  const piede = documentObj.createElement('div');
  piede.className = 'talos-sidebar__foot';
  piede.setAttribute('data-c', 'WorkspaceFooter');
  const avatar = documentObj.createElement('span');
  avatar.className = 'talos-avatar';
  avatar.append(simbolo(documentObj, 'glyph', 'glifo'));
  const testo = documentObj.createElement('div');
  testo.className = 'talos-grow';
  const titolo = documentObj.createElement('div');
  titolo.className = 'talos-sidebar__foot-title';
  const sotto = documentObj.createElement('div');
  sotto.className = 'talos-sidebar__foot-sub';
  testo.append(titolo, sotto);
  const impostazioni = documentObj.createElement('button');
  impostazioni.type = 'button';
  impostazioni.className = 'talos-button talos-button--secondary talos-icon-button';
  impostazioni.setAttribute('data-c', 'IconButton');
  impostazioni.dataset.vaia = 'impostazioni';
  impostazioni.title = 'Impostazioni (Ctrl ,)';
  impostazioni.append(simbolo(documentObj, 'i', 'i-settings'));
  piede.append(avatar, testo, impostazioni);
  aggiornaWorkspaceFooter(piede, dati);
  return piede;
}

/** Riscrive le due righe di un piede già montato (è ciò che il monolite chiama a ogni cambio). */
export function aggiornaWorkspaceFooter(piede, dati = {}) {
  if (!piede) return;
  const { titolo, sotto } = testiPiede(dati);
  const t = piede.querySelector('.talos-sidebar__foot-title');
  const s = piede.querySelector('.talos-sidebar__foot-sub');
  if (t && t.textContent !== titolo) t.textContent = titolo;
  if (s && s.textContent !== sotto) s.textContent = sotto;
  if (t) t.title = dati.cartella || '';
}
