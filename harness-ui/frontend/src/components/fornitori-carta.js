/**
 * fornitori-carta.js — la carta in chat quando il MODELLO esclude o riammette un fornitore a valle di OpenRouter (0.1.25, owner
 * 09/10/2026: la seconda porta della decisione 14; «escludere e togliere con la carta», come le automazioni). Stessa carta
 * d'approvazione di casa (`creaApprovazione`, via `appendCartaAutomazione`): qui solo le parole e il blocco prima → dopo.
 *
 * ⛔ Due risposte, Approva · Annulla: non c'è una bozza da correggere (come «Riprendi» delle automazioni).
 * ⛔ La carta dice CHE COSA cambia e per CHI: «per ogni modello» (la lista della persona) o «per <modello>» (una voce di serie).
 */
import { t as traduci } from './lingua.js';
import { nomeModelloUmano } from './chat-foot.js'; // mai l'id grezzo del modello a schermo

export const ATTREZZI_FORNITORI_CON_CARTA = Object.freeze(['provider_exclude', 'provider_allow']);
export const eCartaFornitori = (azione) => ATTREZZI_FORNITORI_CON_CARTA.includes(azione?.tipo);

function el(doc, tag, classe, testo) { const n = doc.createElement(tag); if (classe) n.className = classe; if (testo !== undefined) n.textContent = testo; return n; }
function kv(doc, k, v) { const n = el(doc, 'div', 'talos-kv'); n.append(el(doc, 'span', 'talos-kv__k', k), el(doc, 'span', 'talos-kv__v', v)); return n; }

/** Badge, bersaglio (lo slug) e la frase del perché. */
/* Review del bugfixer (09/10): un'azione porta un ELENCO di cambi — la lista della persona e/o una voce di serie per modello. */
const cambiDi = (azione) => (Array.isArray(azione?.cambi) ? azione.cambi.filter((c) => c && (c.campo === 'persona' || c.campo === 'di-serie')) : []);
const nomeModello = (id) => nomeModelloUmano(id) || id || '';

export function testiCartaFornitori(azione) {
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
