/*
 * IL PONTE, versione per l'APP. Nel prodotto questo file prende il posto di `fonti.js` (si rinomina: `fonti.prodotto.js` →
 * `fonti.js`). Ogni nome viene dal suo modulo vero: nessuna copia, nessuna tabella duplicata.
 *
 * ⛔ `inspector.js` e `scheda-github.js` importeranno a loro volta i moduli del pannello (vedi MAPPA.md, «Dove si innesta»):
 *   l'import qui sotto crea un ciclo. È innocuo perché questi nomi si leggono solo QUANDO si disegna, mai mentre i moduli si
 *   caricano — ma se un giorno una tabella venisse letta al caricamento, il ciclo la troverebbe vuota. La prova
 *   `pannello-fonti-cicli` (PROVE.md, U-12) lo tiene d'occhio.
 */
export { statoDelPasso, nomeDellAgente } from '../grafo/run-dalle-deleghe.js';
export { attivitaDellAgente, contiDellAgente, passiDellAgente } from '../grafo/attivita.js';
export { limiteCheAgisce, ripartizioneSulLimite, compattazioniDellaConversazione, CATEGORIE, CHIAVI_CATEGORIA } from '../contesto-scheda.js';
export { STATI_PROCESSO } from '../inspector.js';
export { raggruppaVoci } from '../scheda-github.js';
export { nomeLeggibileAttrezzo, verboAttrezzo } from '../nomi-attrezzi.js';
