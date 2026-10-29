/**
 * I CARICAMENTI CHE DURANO SI MUOVONO (owner 27/10/2026: «ogni riga in corso animata e col contatore dei secondi, niente deve sembrare
 * bloccato»; 29/10/2026, sul bozzetto interattivo «Caricamenti vivi»: oltre 2 s, e nei primi 2 s il testo di sempre).
 *
 * Censiti 12 «Caricamento…» fissi (cronologia e grafo degli agenti, Workflow, binario dei Workflow, Bacheca, Context Manager, catalogo,
 * annulla file, artefatto, proposta di workflow): restavano fermi anche per mezzo minuto. Qui un solo aiuto per tutti:
 *   - nei primi `SOGLIA_CARICAMENTO_VIVO_MS` resta il testo di oggi, fermo (niente lampi quando il caricamento è rapido: sotto i 2 s
 *     un indicatore che compare e sparisce disturba più di quanto aiuti);
 *   - oltre, l'etichetta prende lo shimmer dell'attesa in chat (`talos-waiting__label`, `attesa-shimmer.css`, con la stessa regola
 *     del movimento ridotto) e accanto compaiono i secondi, nella forma delle righe vive (`durata-breve.js`);
 *   - si spegne DA SOLO quando il contenuto vero sostituisce l'etichetta o il pannello sparisce: chi chiama non deve ricordarsi
 *     di fermarlo, perché oggi scrive `textContent` o `replaceChildren` e basta.
 * ⛔ Niente scheletri grigi: owner 06/09, «skeleton loader non ci deve essere» (`conversazione.js`). Hermes li usa per le liste
 *   (`apps/desktop/src/app/chat/sidebar/section-states.tsx`) e un contatore per le attività (`app/agents/index.tsx:345`): qui
 *   resta la riga onesta, cosa sta facendo e da quanto.
 */
import { durataBreveRigaViva } from './durata-breve.js';

export const SOGLIA_CARICAMENTO_VIVO_MS = 2000;
const PASSO_MS = 1000;

let adessoCaricamento = () => Date.now();
/** Per le prove: un orologio finto. */
export function impostaOrologioCaricamento(fn) { adessoCaricamento = typeof fn === 'function' ? fn : () => Date.now(); }

/*
 * ⛔ Molti pannelli si RIDISEGNANO da capo a ogni aggiornamento (la Bacheca, il binario dei Workflow): con un inizio nuovo a ogni
 *   ridisegno i secondi ripartirebbero da zero e la soglia dei 2 s non verrebbe mai superata. Chi ridisegna passa una `chiave`: lo
 *   stesso caricamento ricomincia da dove era. La voce si toglie quando il caricamento finisce (l'etichetta lascia il posto al
 *   contenuto e nessun'altra etichetta con la stessa chiave l'ha presa).
 */
const iniziPerChiave = new Map();

/**
 * Mette in `contenitore` l'etichetta di caricamento e la fa diventare viva se dopo la soglia è ancora lì. Torna l'etichetta.
 * @param {Element} contenitore dove stava il «Caricamento…» (il suo contenuto viene sostituito)
 * @param {string} testo l'etichetta, già tradotta
 * @param {{ chiave?: string, soglia?: number, timer?: { setTimeout: Function, clearTimeout: Function, setInterval: Function, clearInterval: Function } }} [opzioni]
 */
export function mostraCaricamentoVivo(contenitore, testo, { chiave = null, soglia = SOGLIA_CARICAMENTO_VIVO_MS, timer = globalThis } = {}) {
  if (!contenitore) return null;
  // un ridisegno che chiede lo stesso caricamento lo lascia com'è: ricrearlo farebbe ripartire lo shimmer a ogni aggiornamento
  const giaQui = contenitore._caricamentoVivo;
  if (giaQui && giaQui.parentNode === contenitore && giaQui.textContent === testo) return giaQui;
  const doc = contenitore.ownerDocument;
  const etichetta = doc.createElement('span');
  etichetta.className = 'talos-caricamento__etichetta';
  etichetta.dataset.caricamentoVivo = '';
  etichetta.textContent = testo;
  contenitore.replaceChildren(etichetta);
  contenitore._caricamentoVivo = etichetta;
  const ora = adessoCaricamento();
  const voce = chiave === null ? null : iniziPerChiave.get(chiave);
  const inizio = voce ? voce.inizio : ora;
  if (chiave !== null) iniziPerChiave.set(chiave, { inizio, etichetta });
  // ancora al suo posto? Se chi chiama ha scritto il contenuto vero, l'etichetta non è più figlia del contenitore
  const alSuoPosto = () => etichetta.isConnected && etichetta.parentNode === contenitore;
  let orologio = null;
  const dimentica = () => { if (chiave !== null && iniziPerChiave.get(chiave)?.etichetta === etichetta) iniziPerChiave.delete(chiave); };
  const ferma = () => { if (orologio !== null) { timer.clearInterval(orologio); orologio = null; } };
  const attesa = timer.setTimeout(() => {
    if (!alSuoPosto()) { dimentica(); return; }
    etichetta.classList.add('talos-waiting__label');
    const secondi = doc.createElement('span');
    secondi.className = 'talos-mono talos-muted talos-caricamento__secondi';
    secondi.setAttribute('aria-hidden', 'true'); // l'etichetta si legge una volta; i secondi che cambiano non si annunciano
    contenitore.append(secondi);
    const segna = () => {
      // chi chiama sostituisce il contenuto intero (textContent o replaceChildren): i secondi se ne vanno con l'etichetta
      if (!alSuoPosto()) { ferma(); dimentica(); return; }
      const testoSecondi = durataBreveRigaViva(Math.max(0, Math.floor(adessoCaricamento() - inizio)));
      if (secondi.textContent !== testoSecondi) secondi.textContent = testoSecondi;
    };
    segna();
    orologio = timer.setInterval(segna, PASSO_MS);
  }, Math.max(0, soglia - (ora - inizio))); // un ridisegno dopo la soglia si accende subito, coi secondi veri
  etichetta._fermaCaricamento = () => { timer.clearTimeout(attesa); ferma(); };
  return etichetta;
}
