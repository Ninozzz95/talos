/*
 * motion-mockup.js — il `motion()` del mockup, portato alla lettera.
 *
 * Fonte: `Talos_Desktop_Final_Mockup_Interattivo.html`, script `talos-desktop-study`:
 *   function motion(el,frames,token='surface-enter',factor=1){
 *     if(!el||reduce()||!el.animate)return null;
 *     activeTransitions.get(el)?.cancel();
 *     const cs=getComputedStyle(root), v=cs.getPropertyValue('--talos-motion-duration-'+token).trim();
 *     let ms=v.endsWith('ms')?parseFloat(v):parseFloat(v)*1000; if(!Number.isFinite(ms))ms=180;
 *     const a=el.animate(frames,{duration:Math.max(0,ms*factor),
 *       easing:cs.getPropertyValue('--talos-motion-ease').trim()||'cubic-bezier(.2,.7,.2,1)'});
 *     activeTransitions.set(el,a); animations.add(a); …  return a; }
 *
 * ⛔ PERCHÉ LA DURATA È UN TOKEN E NON UN NUMERO. È la stessa scelta del mockup ed è anche quella
 *   che rende gratis il cancello più importante: `legacy/app.js` (`applicaMovimento`, ~12896)
 *   azzera `--talos-motion-duration-*` quando «Animazioni dell'interfaccia» è spento, quando il
 *   profilo di movimento è `off` o quando «Riduci il movimento» è acceso. Un numero scritto qui
 *   renderebbe muta la scelta della persona.
 * ⛔ I QUATTRO CANCELLI, nell'ordine in cui rispondono:
 *   1. `prefers-reduced-motion` di sistema — i token NON lo guardano (index.css non li azzera),
 *      quindi si controlla qui, come fa `animaCambioPagina` in app.js;
 *   2. `interface-motion-off` sulla radice (l'interruttore grosso delle Impostazioni);
 *   3. `reduce-motion` sul body (la forma che usa il monolite, letta da `motionMilliseconds`);
 *   4. la LEVA FINE passata dal chiamante (`motion-navigation-off`, `motion-surfaces-off`,
 *      `motion-feedback-off`): chi l'ha spenta ha chiesto proprio quella famiglia di movimento,
 *      non tutte. La mappa di quelle tre classi è in `aspetto.css` (righe ~500-520).
 *   ⛔ E se malgrado tutto la durata risolta è 0, l'animazione NON si avvia: una WAAPI da 0 ms
 *     esiste comunque nel `getAnimations()` e falserebbe qualunque misura successiva.
 * ⛔ NIENTE REGOLE UNIVERSALI: il 10-11/09 `body.reduce-motion *` e
 *   `@media (prefers-reduced-motion){ * }` con `!important` hanno spento ogni animazione della app
 *   e sono costate sei cure su un componente sano. Qui si spegne CHIEDENDO, non cancellando.
 */

/** Le animazioni vive, per poterle fermare tutte quando la preferenza cambia a metà corsa. */
const vive = new Set();
/** Una sola animazione per elemento: la seconda annulla la prima, come `activeTransitions` nel mockup. */
const perElemento = new WeakMap();

function radice(doc) {
  return (doc || globalThis.document)?.documentElement || null;
}

/** `prefers-reduced-motion: reduce` di sistema. Un browser che non sa rispondere non spegne niente. */
export function ridottoDalSistema(finestra = globalThis) {
  try {
    return typeof finestra?.matchMedia === 'function'
      && finestra.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch { return false; }
}

/**
 * Il `reduce()` del mockup, con i nomi della app.
 * @param {{document?:Document, leva?:string, finestra?:object}} [opzioni] `leva` = una delle tre
 *   classi fini di `aspetto.css` (`motion-navigation-off`, `motion-surfaces-off`,
 *   `motion-feedback-off`); assente = solo i tre cancelli generali.
 */
export function movimentoSpento({ document: doc = globalThis.document, leva = '', finestra = globalThis } = {}) {
  if (ridottoDalSistema(finestra)) return true;
  const html = radice(doc);
  if (!html) return true;
  if (html.classList.contains('interface-motion-off')) return true;
  if (html.classList.contains('reduce-motion')) return true;
  if (doc?.body?.classList?.contains('reduce-motion')) return true;
  if (leva && html.classList.contains(leva)) return true;
  return false;
}

/**
 * I millisecondi di un token di movimento. `--talos-motion-duration-<nome>`, con ripiego.
 * ⛔ Accetta sia `180ms` sia `0.18s`: il monolite scrive i millisecondi, i fogli statici i secondi.
 */
export function millisecondiDelToken(nome, ripiego = 180, doc = globalThis.document) {
  const html = radice(doc);
  if (!html) return ripiego;
  let grezzo = '';
  try { grezzo = (doc.defaultView || globalThis).getComputedStyle(html).getPropertyValue(`--talos-motion-duration-${nome}`).trim(); }
  catch { return ripiego; }
  if (!grezzo) return ripiego;
  const n = Number.parseFloat(grezzo);
  if (!Number.isFinite(n)) return ripiego;
  return grezzo.endsWith('ms') ? n : n * 1000;
}

/** L'easing dichiarato dal tema, con il ripiego del mockup. */
export function easeDelTema(doc = globalThis.document, variabile = '--talos-motion-ease') {
  const html = radice(doc);
  if (!html) return 'cubic-bezier(.2,.7,.2,1)';
  try {
    const v = (doc.defaultView || globalThis).getComputedStyle(html).getPropertyValue(variabile).trim();
    return v || (variabile.endsWith('exit') ? 'ease-in' : 'cubic-bezier(.2,.7,.2,1)');
  } catch { return 'cubic-bezier(.2,.7,.2,1)'; }
}

/**
 * Il `motion()` del mockup.
 * @param {Element|null} elemento
 * @param {object[]} fotogrammi i frame WAAPI, identici a quelli del mockup
 * @param {{token?:string, fattore?:number, leva?:string, document?:Document, ease?:string}} [opzioni]
 * @returns {Animation|null} `null` quando il movimento è spento — e `null` è una risposta, non un errore.
 */
export function motion(elemento, fotogrammi, {
  token = 'surface-enter', fattore = 1, leva = '', document: doc = globalThis.document, ease = '',
} = {}) {
  if (!elemento || typeof elemento.animate !== 'function') return null;
  if (movimentoSpento({ document: doc, leva })) return null;
  const ms = millisecondiDelToken(token, 180, doc) * fattore;
  if (!(ms > 0)) return null; // una WAAPI da 0 ms sporca `getAnimations()` senza muovere un pixel
  try { perElemento.get(elemento)?.cancel(); } catch { /* già finita: niente da annullare */ }
  let animazione = null;
  try {
    animazione = elemento.animate(fotogrammi, { duration: ms, easing: ease || easeDelTema(doc), fill: 'none' });
  } catch { return null; } // un ambiente senza WAAPI completa non deve far cadere un clic
  perElemento.set(elemento, animazione);
  vive.add(animazione);
  const fine = () => vive.delete(animazione);
  animazione.finished.then(fine, fine);
  return animazione;
}

/** Lo `stopMotion()` del mockup: la preferenza è cambiata adesso, ciò che è in volo si ferma adesso. */
export function fermaTutto() {
  for (const a of vive) { try { a.cancel(); } catch { /* già conclusa */ } }
  vive.clear();
}

/** Quante ne sono in volo — serve ai test, non al prodotto. */
export function quanteVive() { return vive.size; }
