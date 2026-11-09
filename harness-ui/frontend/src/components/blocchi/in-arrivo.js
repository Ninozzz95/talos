/*
 * La riga «in arrivo» di un blocco (interfaccia generativa, catalogo v1): cosa sta preparando e da quanti secondi.
 * È la riga viva di casa (`caricamento-vivo.js`, owner 27/10 e 29/10: «ogni riga in corso animata e col contatore dei secondi»):
 * lo shimmer `talos-waiting__label` e i secondi `durataBreveRigaViva`. Con «riduci movimento» del sistema il testo resta pieno e fermo
 * e l'attesa la dicono i secondi (`attesa-shimmer.css`). Qui parte SUBITO (soglia 0): un blocco che arriva sta già lavorando.
 * ⛔ Niente scheletri grigi (owner 06/09, «skeleton loader non ci deve essere»): il bozzetto aveva tre barre grigie (`stile-pc.css:46-49`),
 *   qui resta la riga onesta e, sopra, quello che del blocco è già arrivato.
 * Le parole sono del tipo («Preparo la tabella…»), come i passi del bozzetto (`pc4.js:67`) e la riga della CLI («Building {tipo}…»).
 */
import { t } from '../lingua.js';
import { mostraCaricamentoVivo } from '../caricamento-vivo.js';
import { el } from './comune.js';

const CHIAVE = {
  tabella: 'blocchi.arriving.tabella',
  grafico: 'blocchi.arriving.grafico',
  scelte: 'blocchi.arriving.scelte',
  modulo: 'blocchi.arriving.modulo',
  'chiave-valore': 'blocchi.arriving.chiaveValore',
  passi: 'blocchi.arriving.passi',
  avviso: 'blocchi.arriving.avviso',
  cursore: 'blocchi.arriving.cursore',
  metriche: 'blocchi.arriving.metriche',
  confronto: 'blocchi.arriving.confronto',
  diagramma: 'blocchi.arriving.diagramma',
};

/** Le parole della riga per un tipo (o per un blocco di cui il tipo non è ancora arrivato). */
export const testoInArrivo = (tipo) => t(CHIAVE[tipo] || 'blocchi.arriving.blocco');

/**
 * @param {Document} doc
 * @param {{ timer?: object }} [opzioni] l'orologio (per le prove)
 * @returns {{ nodo: HTMLElement, tipo: (tipo: string|null) => void, ferma: () => void }}
 */
export function creaRigaInArrivo(doc, { timer = globalThis } = {}) {
  const nodo = el(doc, 'p', 'gu-in-arrivo');
  nodo.setAttribute('role', 'status');
  let etichetta = null, ultimo;
  const api = {
    nodo,
    /**
     * Cambia le parole quando arriva il tipo. Il tipo arriva col nome del componente, nelle prime decine di caratteri: i secondi
     * ripartono una volta sola, da zero o quasi. Nessuna chiave nel registro di `caricamento-vivo.js` (resterebbe appesa a ogni blocco).
     */
    tipo(tipo) {
      if (tipo === ultimo && etichetta) return;
      ultimo = tipo;
      etichetta?._fermaCaricamento?.();
      etichetta = mostraCaricamentoVivo(nodo, testoInArrivo(tipo), { soglia: 0, timer });
    },
    ferma() { etichetta?._fermaCaricamento?.(); etichetta = null; nodo.replaceChildren(); },
  };
  return api;
}
