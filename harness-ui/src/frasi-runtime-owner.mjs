/*
 * Le frasi dell'adattatore del servizio agente che il Doctor mostra alla persona, in UN posto (15/10/2026).
 *
 * Il Doctor dà a queste frasi la loro chiave del dizionario (area `server`) riconoscendo il CODICE dell'errore e la frase. Con le frasi
 * scritte due volte (nell'adattatore e nel Doctor) bastava cambiare una parola nell'adattatore perché la chiave sparisse in silenzio e
 * «Servizio agente» tornasse in inglese — la revisione del bugfixer (DOCTOR-REV-03) l'ha mostrato con un mutante. Qui le leggono
 * tutti e due. Ricerca 15/10/2026: errori con un valore stabile, tradotti da chi li mostra, invece di confrontare stringhe fra
 * sistemi (W3C, discussione WebIDL 2021-09 «locale-neutral errors with well-defined error values»; Citeck, «Server side
 * localization»: la chiave sul filo, l'inglese nei log).
 */
export const FRASE_RUNTIME_NON_CARICATO = 'The agent runtime is not available. Check the server configuration.';
export const FRASE_CATALOGO_ASSENTE = 'The agent runtime does not expose the requested task catalog.';

/** Codice dell'errore + frase → chiave del Doctor. Un messaggio che non è qui passa con le sue parole, senza chiave. */
export const CHIAVI_DEL_DOCTOR = Object.freeze([
  Object.freeze({ code: 'OWNER_RUNTIME_LOAD_FAILED', frase: FRASE_RUNTIME_NON_CARICATO, chiave: 'server.doctor.runtime.unavailable' }),
  Object.freeze({ code: 'OWNER_RUNTIME_CONTRACT_INVALID', frase: FRASE_CATALOGO_ASSENTE, chiave: 'server.doctor.runtime.noTaskCatalog' }),
]);
