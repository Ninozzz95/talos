/**
 * Quale build dell'app è questa.
 *
 * Sostituito a compilazione da Vite (`__TALOS_BUILD_ID__`) col commit e la data.
 * `'dev'` quando quella sostituzione non c'è — in un test, o servendo i sorgenti
 * — che è un valore onesto: significa «non lo so», e chi lo usa come chiave lo
 * tratta come una situazione a sé.
 *
 * Esiste come modulo suo perché la stessa domanda arriva da posti diversi: la
 * diagnostica lo mostra, e il profilo dei thread lo usa come parte della chiave
 * — una build nuova può portare un motore nativo diverso, e una misura presa con
 * quello di prima non descrive più niente.
 */
export const TALOS_APP_BUILD: string =
    typeof __TALOS_BUILD_ID__ !== 'undefined' ? __TALOS_BUILD_ID__ : 'dev'
