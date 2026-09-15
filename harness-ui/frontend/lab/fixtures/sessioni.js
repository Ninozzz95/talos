/*
 * Le sette sessioni d'esempio del mockup, scritte nella forma VERA di
 * `GET /api/v1/sessions`. Servono al cancello di parità dei componenti: se
 * `creaSessionItem` le riceve, deve produrre esattamente le righe che il
 * mockup disegna a mano. Le date sono locali e relative a `ADESSO`, così la
 * prova non dipende dall'orologio della macchina.
 */
export const ADESSO = new Date('2026-09-04T18:30:00');

export const FISSATE = [
  { sessionId: 'fx-redesign', nome: 'Redesign — 240 decisioni', conclusa: true, interrotta: false, inAttesaApprovazione: false, ultimoEsito: 'successo', modello: 'anthropic/claude-opus-5', avviataAlle: '2026-09-03T11:20:00', usage: { giri: 32 } },
];

export const SESSIONI = [
  { sessionId: 'fx-w102', nome: 'W1-02 registro processi', conclusa: false, interrotta: false, inAttesaApprovazione: false, ultimoEsito: null, modello: 'anthropic/claude-opus-5', avviataAlle: '2026-09-04T18:09:00', usage: { giri: 7 } },
  { sessionId: 'fx-store', nome: 'Store sessioni: pulizia', conclusa: false, interrotta: false, inAttesaApprovazione: true, ultimoEsito: null, modello: 'anthropic/claude-opus-5', avviataAlle: '2026-09-04T17:51:00', usage: { giri: 5 } },
  { sessionId: 'fx-cancello', nome: 'Cancello ricerca web', conclusa: true, interrotta: false, inAttesaApprovazione: false, ultimoEsito: 'successo', modello: 'anthropic/claude-opus-5', avviataAlle: '2026-09-04T17:10:00', usage: { giri: 3 } },
  { sessionId: 'fx-confronto', nome: 'Confronto di due modelli', conclusa: true, interrotta: false, inAttesaApprovazione: false, ultimoEsito: 'errore', motivoChiusura: 'giri-finiti', modello: 'anthropic/claude-sonnet-5', avviataAlle: '2026-09-03T09:00:00', usage: { giri: 24 } },
  { sessionId: 'fx-sonda', nome: 'Sonda di rilascio GPU', conclusa: true, interrotta: false, inAttesaApprovazione: false, ultimoEsito: 'successo', modello: 'anthropic/claude-sonnet-5', avviataAlle: '2026-09-02T15:00:00', usage: { giri: 9 } },
  { sessionId: 'fx-recupero', nome: 'Recupero sessione b7b1b7d2', conclusa: true, interrotta: true, inAttesaApprovazione: false, ultimoEsito: null, modello: 'anthropic/claude-opus-5', avviataAlle: '2026-09-01T10:00:00', usage: { giri: 2 } },
];

/** La sessione aperta nel mockup (porta `aria-current="true"`). */
export const CORRENTE = 'fx-w102';
