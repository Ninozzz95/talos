/*
 * FE-010 (owner 31/10/2026; forma del 03/11): la scheda «A lato». Una domanda a parte mentre TALOS lavora: legge la conversazione, non ci scrive, non
 * interrompe, non si salva. Dal bozzetto `bozzetto-superfici-vive`, `scenaLato`.
 * ⛔ Il filo sta qui, in memoria, per sessione: dopo una ricarica non c'è più, come ha scelto l'owner.
 * ⛔ La risposta del modello entra solo come testo.
 * Un errore si dice nel filo e la domanda torna nel campo. Con un modello locale al lavoro la domanda aspetta il giro, coi secondi, e parte da sola.
 */
import { t as traduci } from '../lingua.js';
import { formattaDollari, sommaDollari } from '../../../../src/kernel/costo-in-dollari.mjs';

/* Decisioni 57 e 144 (04/11/2026): `dollari` è la somma dei costi delle risposte detti dal server; basta una risposta senza costo (prezzo ignoto,
   server di prima) perché la riga dica solo il lavoro, come prima: una somma parziale si leggerebbe come il totale. */
const statoVuoto = () => ({ scambi: [], consumo: { prompt_tokens: 0, completion_tokens: 0, cached_tokens: 0 }, dollari: 0, inVolo: null, inAttesa: null, nota: '' });

/** Quante cose ha speso il filo: si somma l'`usage` vero. */
function sommaUsage(consumo, usage) {
  return { prompt_tokens: consumo.prompt_tokens + (usage?.prompt_tokens ?? 0), completion_tokens: consumo.completion_tokens + (usage?.completion_tokens ?? 0), cached_tokens: consumo.cached_tokens + (usage?.cached_tokens ?? 0) };
}

const motivoDi = (errore) => errore?.problem?.reason ?? errore?.reason ?? null;

/**
 * @param {{ document: Document, sessione: () => (string|null), chiedi: Function, trasforma: Function, apriSessione: Function, durata?: Function,
 *           quandoCorre?: Function, testoConsumo: (usage: object) => string, testoErrore: (errore: unknown) => string }} o
 */
export function creaChatALato(o) {
  const doc = o.document;
  const crea = (tag, classe, testo) => { const n = doc.createElement(tag); if (classe) n.className = classe; if (testo !== undefined) n.textContent = testo; return n; };
  const stati = new Map();
  const statoDi = (id) => { if (!stati.has(id)) stati.set(id, statoVuoto()); return stati.get(id); };

  const nodo = crea('div', 'lato');
  const avviso = crea('p', 'talos-inspector__hint', traduci('sezioni.aLato.hint'));
  const filo = crea('div', 'lato-filo');
  const modulo = crea('form', 'lato-campo');
  const campo = crea('input', 'talos-field__input');
  campo.placeholder = traduci('sezioni.aLato.placeholder');
  campo.setAttribute('aria-label', traduci('sezioni.aLato.placeholder'));
  const chiedi = crea('button', 'talos-button talos-button--primary talos-button--sm', traduci('sezioni.aLato.ask'));
  chiedi.type = 'submit';
  modulo.append(campo, chiedi);
  const piede = crea('div', 'lato-piede');
  const costo = crea('span', 'talos-mono talos-measure--estimate');
  /* Revisione d'uso della candidata 04/11/2026, reperto 10: la «~» la disegna lo stile delle stime (`primitives.css`,
   * `.talos-measure--estimate::before`) anche su un testo vuoto, col sottolineato a puntini. Vuoto ⇒ nascosto. */
  costo.hidden = true;
  const trasforma = crea('button', 'talos-button talos-button--secondary talos-button--sm', traduci('sezioni.aLato.transform'));
  trasforma.type = 'button';
  piede.append(costo, crea('span', 'talos-grow'), trasforma);
  nodo.append(avviso, filo, modulo, piede);

  const messaggio = (chi, testo, classe) => {
    const m = crea('div', 'lato-msg');
    m.append(crea('span', `talos-message__who${classe ? ` ${classe}` : ''}`, chi), crea('p', '', testo));
    return m;
  };

  function disegna() {
    const id = o.sessione();
    const stato = id ? statoDi(id) : statoVuoto();
    filo.replaceChildren();
    for (const s of stato.scambi) {
      filo.append(messaggio(traduci('chat.message.you'), s.domanda), messaggio('TALOS', s.risposta, 'talos-message__who--talos'));
      if (s.tagliata) filo.append(crea('p', 'talos-inspector__hint', traduci('sezioni.aLato.cut')));
    }
    const sospesa = stato.inVolo ?? stato.inAttesa;
    if (sospesa) {
      filo.append(messaggio(traduci('chat.message.you'), sospesa.domanda));
      const riga = crea('p', 'talos-inspector__hint', traduci(stato.inAttesa ? 'sezioni.aLato.waitTurn' : 'sezioni.aLato.thinking'));
      const tempo = crea('span', 'talos-mono');
      tempo.dataset.attivitaDa = String(sospesa.da);
      riga.append(' ', tempo);
      filo.append(riga);
      o.quandoCorre?.();
    }
    if (stato.nota) filo.append(crea('p', 'talos-inspector__hint', stato.nota));
    filo.scrollTop = filo.scrollHeight;
    chiedi.disabled = Boolean(sospesa) || !id;
    const speso = stato.consumo.prompt_tokens + stato.consumo.completion_tokens;
    const lavoro = speso > 0 ? o.testoConsumo(stato.consumo) : '';
    const inDollari = stato.scambi.length > 0 ? formattaDollari(stato.dollari) : null;
    costo.textContent = lavoro ? traduci('sezioni.aLato.spent', { consumo: inDollari ? `${inDollari} · ${lavoro}` : lavoro }) : '';
    costo.hidden = !lavoro;
    trasforma.hidden = stato.scambi.length === 0;
  }

  async function spedisci(id, domanda) {
    const stato = statoDi(id);
    stato.nota = '';
    stato.inAttesa = null;
    stato.inVolo = { domanda, da: Date.now() };
    disegna();
    try {
      const esito = await o.chiedi(id, { domanda, filo: stato.scambi.map(({ domanda: d, risposta }) => ({ domanda: d, risposta })) });
      stato.scambi.push({ domanda, risposta: esito.risposta, tagliata: esito.tagliata === true });
      stato.consumo = sommaUsage(stato.consumo, esito.usage);
      stato.dollari = sommaDollari([stato.dollari, esito.costo]);
      if (esito.filoTagliato) stato.nota = traduci('sezioni.aLato.oldCut');
    } catch (errore) {
      if (motivoDi(errore) === 'aspetta-il-giro') stato.inAttesa = { domanda, da: Date.now() };
      else {
        stato.nota = o.testoErrore(errore);
        if (o.sessione() === id && !campo.value) campo.value = domanda;
      }
    } finally {
      stato.inVolo = null;
      if (o.sessione() === id) disegna();
    }
  }

  function fai(domanda) {
    const id = o.sessione();
    const testo = String(domanda ?? '').trim();
    if (!id || !testo) return false;
    const stato = statoDi(id);
    if (stato.inVolo || stato.inAttesa) return false;
    void spedisci(id, testo);
    return true;
  }

  modulo.addEventListener('submit', (evento) => {
    evento.preventDefault();
    if (fai(campo.value)) campo.value = '';
  });
  trasforma.addEventListener('click', async () => {
    const id = o.sessione();
    if (!id) return;
    const stato = statoDi(id);
    try {
      const esito = await o.trasforma(id, stato.scambi.map(({ domanda, risposta }) => ({ domanda, risposta })));
      stati.delete(id);
      o.apriSessione(esito);
    } catch (errore) {
      stato.nota = motivoDi(errore) ? traduci('sezioni.aLato.transformLater') : o.testoErrore(errore);
      disegna();
    }
  });
  disegna();

  return {
    nodo,
    fai,
    fuoco() { campo.focus(); },
    /** La chat cambia: il filo è della sua sessione. */
    perSessione: disegna,
    /** A fine giro parte la domanda che aspettava. */
    giroFinito() {
      const id = o.sessione();
      const domanda = id ? stati.get(id)?.inAttesa?.domanda : null;
      if (domanda) void spedisci(id, domanda);
    },
  };
}
