/**
 * ⛔ K3 pin r4 701c6c0d2 (ledger `LEDGER-K3-PIN-R4-701-2026-10-17.md`; #44 del desktop, `a4bdf73e4`, segnalato da noi il 15/10):
 * la frase del MOTIVO di un rifiuto, nella lingua dell'interfaccia (`fraseDelMotivo` di `components/errori.js`), provata sul golden
 * calcolato dal suo codice vero con le buste dei moduli veri del server (`nome-motivi-701c6c0d2.json`).
 *   · Solo quando il server l'ha pubblicata per la persona: la sua `explanation` è ESATTAMENTE l'inglese della voce
 *     `errori.<CODICE>.<motivo con _>` (`public-problem.mjs`, MOTIVI_CON_FRASE_PER_LA_PERSONA). Altrimenti '' e chi chiama fa come prima.
 *   · ⛔ FRASI-UNICHE (27/10/2026): la regola vive in `fraseErroreR4.ts`, con la stessa ricerca su tutte le tabelle; qui resta il nome.
 */
export { fraseDelMotivoR4 } from './fraseErroreR4'
