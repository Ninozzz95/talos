/*
 * IL PIANO CHATGPT NELLA CHAT — le superfici che le linee guida di OpenAI chiedono a chi usa «Sign in with ChatGPT»
 * (developers.openai.com/siwc/ui-ux-guidelines, letta l'11/10/2026):
 *   · «display Using ChatGPT plan near the composer or model selector», con un link «Manage usage» alle impostazioni d'uso;
 *   · al primo accesso una modale «You’re using your ChatGPT plan» con «Got it», e solo la prima volta.
 * Decisione owner 11/10/2026, dopo due mockup: nel composer SOLO la pastiglia compatta «● ChatGPT plan» (la frase intera «prende
 * troppo spazio»); il clic apre un pannello sopra il composer con chi è collegato, l'uso contato da TALOS e «Manage usage».
 * ⛔ Pezzi di casa: la pastiglia è un `talos-badge` col `talos-dot--success`; il pannello ha la superficie del menu ⋯
 *   (`ft-actions-menu`) e le righe dell'uso sono quelle della modale OpenAI (`bloccoUsoDelPiano`, `provider-card.js`).
 * ⛔ Il pannello non è un menu (dentro c'è un'informazione e un link): `role="dialog"`, non `menu`. Esc lo chiude e rende il fuoco
 *   alla pastiglia; un clic fuori lo chiude.
 * ⛔ Si apre SOPRA il bordo del composer, mai sul testo che la persona sta scrivendo (trovato nella foto del mockup).
 */
import { t } from './lingua.js';
import { apriModale, chiudiModale } from './modale-td.js';
import { bloccoUsoDelPiano } from './provider-card.js';
import { PAGINA_CONSUMI_CHATGPT } from './provider-retry.js';
import { depositoDelBrowser } from './link-esterni.js';

export { PAGINA_CONSUMI_CHATGPT };
export const CHIAVE_BENVENUTO_PIANO = 'talos.harness.desktop.chatgpt-benvenuto.v1';

/** Vero quando il modello della chat è del piano e il piano è collegato e abilitato: solo allora la pastiglia dice il vero. */
export function pianoInUso(modelloId, stato) {
  return typeof modelloId === 'string' && modelloId.startsWith('chatgpt:') && stato?.collegato === true && stato?.pianoAbilitato === true;
}

const nodo = (doc, tag, classe, testo) => {
  const n = doc.createElement(tag);
  if (classe) n.className = classe;
  if (testo !== undefined && testo !== null) n.textContent = String(testo);
  return n;
};

function linkConsumi(doc) {
  const a = nodo(doc, 'a', 'talos-link-esterno', t('chat.chatgptPlan.manageUsage'));
  a.href = PAGINA_CONSUMI_CHATGPT; // sempre il link fisso delle linee guida, mai un indirizzo arrivato da fuori
  a.target = '_blank'; a.rel = 'noopener noreferrer'; a.dataset.pianoConsumi = '';
  return a;
}

/**
 * Collega la pastiglia `[data-piano-chatgpt]` del composer. `aggiorna({ modelloId, stato })` la mostra o la nasconde; il clic apre
 * e chiude il pannello, rileggendo lo stato con `leggiStato` quando c'è. Torna `{ aggiorna, chiudi, apri, pannello }`.
 */
export function montaPastigliaPiano({ pastiglia, leggiStato = null, documento: doc = pastiglia?.ownerDocument ?? globalThis.document } = {}) {
  if (!pastiglia) return null;
  const win = doc.defaultView ?? globalThis;
  let stato = null;
  let modello = null;
  let pannello = null;
  const controlla = () => pastiglia.setAttribute('aria-expanded', String(Boolean(pannello)));
  const fuori = (e) => { if (pannello && !pannello.contains(e.target) && !pastiglia.contains(e.target)) chiudi(); };
  const tasto = (e) => { if (pannello && e.key === 'Escape') { e.preventDefault(); chiudi({ fuoco: true }); } };
  function chiudi({ fuoco = false } = {}) {
    if (!pannello) return;
    pannello.remove(); pannello = null; controlla();
    doc.removeEventListener('pointerdown', fuori, true); doc.removeEventListener('keydown', tasto, true);
    win.removeEventListener('resize', chiudiSenzaFuoco);
    if (fuoco) pastiglia.focus?.({ preventScroll: true });
  }
  const chiudiSenzaFuoco = () => chiudi();
  let apertura = 0;
  async function apri() {
    /* l'uso cambia a ogni giro: si rilegge lo stato aprendo (un guasto lascia quello che c'era). Un secondo clic durante la
       lettura vince sul primo. */
    const mia = ++apertura;
    if (typeof leggiStato === 'function') { try { const fresco = await leggiStato(); if (fresco && typeof fresco.collegato === 'boolean') stato = fresco; } catch { /* resta lo stato noto */ } }
    if (mia !== apertura || pannello || !pianoInUso(modello, stato)) { if (!pianoInUso(modello, stato)) aggiorna(); return; }
    const p = nodo(doc, 'div', 'ft-actions-menu talos-piano-pannello');
    p.setAttribute('role', 'dialog');
    p.dataset.pianoPannello = '';
    const titolo = nodo(doc, 'strong', 'talos-piano-pannello__titolo', t('chat.chatgptPlan.using'));
    titolo.id = 'talosPianoPannelloTitolo';
    p.setAttribute('aria-labelledby', titolo.id);
    p.append(titolo);
    if (stato?.email) p.append(nodo(doc, 'span', 'talos-muted talos-piano-pannello__chi', stato.email));
    const uso = bloccoUsoDelPiano(stato?.usoTalos);
    if (uso) p.append(uso);
    p.append(linkConsumi(doc));
    doc.body.append(p);
    pannello = p; controlla();
    // sopra il BORDO del composer (non sopra la pastiglia: coprirebbe il testo che si scrive), allineato a destra della pastiglia
    const composer = pastiglia.closest('form, .talos-composer') ?? pastiglia;
    const r = pastiglia.getBoundingClientRect();
    const c = composer.getBoundingClientRect();
    const h = p.getBoundingClientRect();
    p.style.left = `${Math.max(8, Math.min(r.right - h.width, win.innerWidth - h.width - 8))}px`;
    p.style.top = `${Math.max(8, c.top - h.height - 8)}px`;
    doc.addEventListener('pointerdown', fuori, true); doc.addEventListener('keydown', tasto, true);
    win.addEventListener('resize', chiudiSenzaFuoco);
    /* il pannello sta in fondo al documento: senza portarci il fuoco, con Tab non ci si arriverebbe mai. Esc lo riporta alla
       pastiglia (APG, «Dialog»: il fuoco entra nel dialogo e torna a chi l'ha aperto). */
    p.tabIndex = -1;
    p.focus({ preventScroll: true });
  }
  pastiglia.setAttribute('aria-haspopup', 'dialog');
  controlla();
  pastiglia.addEventListener('click', () => { if (pannello) { apertura += 1; chiudi(); } else void apri(); });
  function aggiorna({ modelloId = modello, stato: nuovo = stato } = {}) {
    modello = modelloId; stato = nuovo;
    const si = pianoInUso(modello, stato);
    if (pastiglia.hidden !== !si) pastiglia.hidden = !si; // 22/10/2026: chiamata a ogni ridisegno del piede (piu' volte al secondo in un giro): si scrive solo se cambia
    if (!si) chiudi();
  }
  aggiorna();
  return { aggiorna, chiudi, apri, get pannello() { return pannello; } };
}

/** Gli account che hanno già visto il benvenuto (per indirizzo, su questo computer). Un deposito negato o rotto non blocca niente:
    resta la memoria di questa finestra, così il benvenuto non ricompare a ogni accesso finché l'app è aperta. */
const vistiInQuestaFinestra = new Set();
function giaVisti(deposito) {
  try { const v = JSON.parse(deposito?.getItem(CHIAVE_BENVENUTO_PIANO) ?? '[]'); return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []; } catch { return []; }
}

/**
 * La modale del primo accesso, UNA volta per account («Show a welcome modal only the first time a user signs in to your app with
 * ChatGPT plan usage enabled»). Torna `true` se l'ha mostrata. Senza email non c'è modo di dire «questo account l'ha già vista»:
 * si usa il nome `*`, così compare comunque una volta sola.
 */
export function mostraBenvenutoPiano(stato, { deposito = depositoDelBrowser(), document: doc = globalThis.document } = {}) {
  if (stato?.collegato !== true || stato?.pianoAbilitato !== true) return false;
  const chi = typeof stato.email === 'string' && stato.email ? stato.email.toLowerCase() : '*';
  const visti = giaVisti(deposito);
  if (visti.includes(chi) || vistiInQuestaFinestra.has(chi)) return false;
  vistiInQuestaFinestra.add(chi);
  try { deposito?.setItem(CHIAVE_BENVENUTO_PIANO, JSON.stringify([...visti, chi])); } catch { /* resta per questa finestra */ }
  const uno = nodo(doc, 'p', 'td-prose', t('chat.chatgptPlan.welcomeBody'));
  const due = nodo(doc, 'p', 'td-prose');
  const [prima, dopo] = t('chat.chatgptPlan.welcomeManage').split('{link}');
  due.append(doc.createTextNode(prima ?? ''), linkConsumi(doc), doc.createTextNode(dopo ?? ''));
  const piede = nodo(doc, 'div', 'td-detail-footer');
  const ok = nodo(doc, 'button', 'talos-button talos-button--primary talos-button--sm', t('chat.chatgptPlan.gotIt'));
  ok.type = 'button'; ok.dataset.pianoBenvenutoOk = '';
  ok.addEventListener('click', () => chiudiModale());
  piede.append(ok);
  const aperta = apriModale(t('chat.chatgptPlan.welcomeTitle'), [uno, due, piede], { document: doc }); // torna `{ dialogo, … }`
  if (aperta?.dialogo) aperta.dialogo.dataset.pianoBenvenuto = '';
  // il fuoco lo mette `apriModale` sul primo pulsante del corpo, che è «Got it» (i link non sono nel suo selettore)
  return true;
}
