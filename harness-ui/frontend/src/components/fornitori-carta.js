/**
 * fornitori-carta.js — la carta in chat quando il MODELLO esclude o riammette un fornitore a valle di OpenRouter (0.1.25, owner
 * 09/10/2026: la seconda porta della decisione 14; «escludere e togliere con la carta», come le automazioni). Stessa carta
 * d'approvazione di casa (`creaApprovazione`, via `appendCartaAutomazione`): qui solo le parole e il blocco prima → dopo.
 *
 * ⛔ Due risposte, Approva · Annulla: non c'è una bozza da correggere (come «Riprendi» delle automazioni).
 * ⛔ La carta dice CHE COSA cambia e per CHI: «per ogni modello» (la lista della persona) o «per <modello>» (una voce di serie).
 */
import { t as traduci } from './lingua.js';
import { conToken } from './context-separator.js';
import { nomeModelloUmano } from './chat-foot.js'; // mai l'id grezzo del modello a schermo

export const ATTREZZI_FORNITORI_CON_CARTA = Object.freeze(['provider_exclude', 'provider_allow', 'chatgpt_account', 'local_model_window', 'local_model']);

/* 01/11/2026, `local_model`: i pesi nello stesso formato del Laboratorio modelli (`formattaByteModelLab`, app.js), richiesta del Frontend */
export function pesoComeNelLaboratorio(bytes) {
  const value = Number(bytes);
  if (bytes === null || bytes === undefined || !Number.isFinite(value) || value < 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let index = 0; let scaled = value;
  while (scaled >= 1024 && index < units.length - 1) { scaled /= 1024; index += 1; }
  return `${Number.isInteger(scaled) || scaled >= 10 ? Math.round(scaled) : scaled.toFixed(1)} ${units[index]}`;
}

/** Le frasi della carta di `local_model` (frasi del Frontend, 01/11/2026); `dove` per chi guarda dal telefono una sessione del PC (Mobile). */
function testiLocalModel(azione) {
  const nome = (n) => (typeof n === 'string' && n ? (nomeModelloUmano(n.startsWith('local:') ? n : `local:${n}`) || n) : '?');
  let perche = '';
  if (azione.azione === 'open') {
    perche = azione.aperto
      ? traduci('varie.providerCard.localOpenInstead', { modello: nome(azione.modello), peso: pesoComeNelLaboratorio(azione.peso), aperto: nome(azione.aperto) })
      : traduci('varie.providerCard.localOpen', { modello: nome(azione.modello), peso: pesoComeNelLaboratorio(azione.peso) });
  } else if (azione.azione === 'free') {
    perche = traduci(azione.stima ? 'varie.providerCard.localFreeAbout' : 'varie.providerCard.localFree', { modello: nome(azione.modello), memoria: pesoComeNelLaboratorio(azione.memoria) });
  }
  return { badge: traduci('varie.providerCard.localBadge'), bersaglio: nome(azione.modello), perche,
    motivo: '', nota: azione.dove === 'pc' ? traduci('varie.providerCard.localOnThePc') : '' };
}
export const eCartaFornitori = (azione) => ATTREZZI_FORNITORI_CON_CARTA.includes(azione?.tipo);

function el(doc, tag, classe, testo) { const n = doc.createElement(tag); if (classe) n.className = classe; if (testo !== undefined) n.textContent = testo; return n; }
function kv(doc, k, v) { const n = el(doc, 'div', 'talos-kv'); n.append(el(doc, 'span', 'talos-kv__k', k), el(doc, 'span', 'talos-kv__v', v)); return n; }

/** Badge, bersaglio (lo slug) e la frase del perché. */
/* Review del bugfixer (09/10): un'azione porta un ELENCO di cambi — la lista della persona e/o una voce di serie per modello. */
const cambiDi = (azione) => (Array.isArray(azione?.cambi) ? azione.cambi.filter((c) => c && (c.campo === 'persona' || c.campo === 'di-serie')) : []);
const nomeModello = (id) => nomeModelloUmano(id) || id || '';

const numeroDiToken = (n) => conToken(n);

export function testiCartaFornitori(azione) {
  if (azione?.tipo === 'local_model') return testiLocalModel(azione); // 01/11/2026
  // L1 1.3 (owner 26/10/2026): il modello chiede di riaprire il modello locale più grande (`local_model_window`, action enlarge)
  if (azione?.tipo === 'local_model_window') {
    return { badge: traduci('varie.providerCard.windowBadge'), bersaglio: `${azione.modello ?? ''} · ${numeroDiToken(azione.prima)} → ${numeroDiToken(azione.dopo)}`,
      perche: traduci('varie.providerCard.windowWhy'), motivo: '', nota: '' };
  }
  // 11/10/2026: scollegare ChatGPT dalla chat (`chatgpt_account`, action disconnect)
  if (azione?.tipo === 'chatgpt_account') {
    /* decisione 116 C, §8: la stessa carta per `sign_in`, con la sua frase (mettere la scheda «Accedi e riprendi» nella conversazione) */
    const perche = azione.azione === 'sign_in' ? 'varie.providerCard.chatgptSignIn' : 'varie.providerCard.chatgptDisconnect';
    return { badge: traduci('varie.providerCard.chatgptBadge'), bersaglio: azione.email || 'ChatGPT', perche: traduci(perche), motivo: '', nota: '' };
  }
  const slug = typeof azione?.fornitore === 'string' ? azione.fornitore : '';
  const cambi = cambiDi(azione);
  const persona = cambi.some((c) => c.campo === 'persona');
  const serie = cambi.find((c) => c.campo === 'di-serie');
  const frase = azione?.tipo === 'provider_exclude'
    ? (persona ? 'varie.providerCard.exclude' : 'varie.providerCard.excludeForModel')
    : (persona && serie ? 'varie.providerCard.allowBoth' : persona ? 'varie.providerCard.allow' : 'varie.providerCard.allowForModel');
  return {
    badge: traduci('varie.providerCard.badge'),
    bersaglio: slug,
    perche: traduci(frase, { name: slug, model: serie ? nomeModello(serie.modello) : '' }),
    motivo: '',
    /* foto dal vivo del 09/10: nel blocco la frase usciva in corpo pieno, più grande delle righe Adesso/Dopo; il suo posto è la
       nota del piede della carta (`creaApprovazione`, la stessa di «scade a fine sessione»). Solo se cambia la lista di ogni modello. */
    nota: persona ? traduci('varie.providerCard.everyModelNote') : '',
  };
}

/** Il blocco sotto la frase: chi è escluso adesso e chi lo sarà dopo il sì. */
export function creaBloccoCartaFornitori(doc, azione) {
  /* ⛔ Foto dal vivo del 09/10 (4177, glm-5.3-flash vero): con una classe nuova le righe Adesso/Dopo toccavano il bordo della
     carta. Si usa il blocco della carta di casa (`talos-approval__automazione`, lo stesso margine), e NON `cartaFornitori`
     come dato: quello è della carta, e un selettore troverebbe due elementi (lo stesso avviso di automazione-carta.js). */
  const blocco = el(doc, 'div', 'talos-approval__automazione');
  blocco.dataset.dettaglioFornitori = azione?.tipo ?? '';
  if (azione?.tipo === 'local_model') return blocco; // 01/11/2026: la frase dice già tutto; nessun prima → dopo da aggiungere
  if (azione?.tipo === 'local_model_window') {
    blocco.append(kv(doc, traduci('varie.providerCard.before'), numeroDiToken(azione.prima)), kv(doc, traduci('varie.providerCard.after'), numeroDiToken(azione.dopo)));
    return blocco;
  }
  if (azione?.tipo === 'chatgpt_account') {
    if (azione.azione === 'sign_in') return blocco; // 116 C: la frase dice già tutto; un «prima → dopo» dello scollegamento direbbe il falso
    blocco.append(kv(doc, traduci('varie.providerCard.before'), traduci('varie.providerCard.chatgptNow')), kv(doc, traduci('varie.providerCard.after'), traduci('varie.providerCard.chatgptAfter')));
    return blocco;
  }
  const nessuno = traduci('varie.providerCard.none');
  const stato = (attivo) => traduci(attivo ? 'varie.providerCard.excludedByDefault' : 'varie.providerCard.allowedAgain');
  for (const c of cambiDi(azione)) {
    if (c.campo === 'persona') {
      const prima = Array.isArray(c.prima) && c.prima.length ? c.prima.join(', ') : nessuno;
      const dopo = Array.isArray(c.dopo) && c.dopo.length ? c.dopo.join(', ') : nessuno;
      blocco.append(kv(doc, traduci('varie.providerCard.before'), prima), kv(doc, traduci('varie.providerCard.after'), dopo));
    } else {
      // una voce di serie: per QUALE modello, e da che stato a quale (una riga sola, accanto alla lista se cambiano tutte e due)
      blocco.append(kv(doc, traduci('varie.providerCard.forModel', { model: nomeModello(c.modello) }), `${stato(c.prima === true)} → ${stato(c.dopo === true)}`));
    }
  }
  return blocco;
}
